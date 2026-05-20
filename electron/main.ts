import { app, BrowserWindow, shell, dialog, ipcMain, utilityProcess, UtilityProcess } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | UtilityProcess | null = null;
let serverPort = 3000;
let isStartingUp = false;

// ────────────────────────────────────────────────────────────────────────────
// Deep-link / OAuth callback support
//
// Google rejects OAuth from embedded user-agents (Electron's BrowserWindow
// counts as one). Our flow therefore:
//   1. Renderer calls window.__corefirstElectron.openExternal(authUrl)
//   2. Main process calls shell.openExternal(authUrl) → system browser
//   3. After cloud callback, browser navigates to:
//        corefirst://oauth/callback#accessToken=…&refreshToken=…&userId=…
//   4. OS hands that URL to this Electron app:
//        - macOS:   app.on('open-url')
//        - Win/Linux: argv on launch / second-instance
//   5. Main process forwards the URL to the renderer via IPC
//   6. /oauth/callback page receives it (subscribes via preload) and writes
//      tokens to localStorage just like the web flow.
//
// The custom protocol "corefirst://" is registered via app.setAsDefaultProtocolClient
// at runtime; for installed builds, electron-builder also declares it in the
// platform-specific manifests.
// ────────────────────────────────────────────────────────────────────────────

const DEEPLINK_SCHEME = 'corefirst';
let pendingDeepLink: string | null = null;

function registerProtocol() {
  if (process.defaultApp && process.argv.length >= 2) {
    // dev mode (electron <script>) — pass the script path so the OS knows
    // which command to invoke for the protocol handler.
    app.setAsDefaultProtocolClient(DEEPLINK_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(DEEPLINK_SCHEME);
  }
}

function deliverDeepLink(url: string) {
  if (!mainWindow) {
    // Renderer not ready yet — stash and replay on did-finish-load.
    pendingDeepLink = url;
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.webContents.send('corefirst:oauth-callback', url);
}

function extractDeepLinkFromArgs(argv: string[]): string | null {
  return argv.find(a => a.startsWith(`${DEEPLINK_SCHEME}://`)) ?? null;
}

function findFreePort(start: number, limit = start + 50): Promise<number> {
  return new Promise((resolve, reject) => {
    if (start > limit) {
      reject(new Error('No free port found in range'));
      return;
    }
    const server = net.createServer();
    server.listen(start, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', () => resolve(findFreePort(start + 1, limit)));
  });
}

/** Returns true if something is already listening and responding on the port. */
function checkPortResponding(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, { timeout: 800 }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function waitForServer(port: number, retries = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}`, { timeout: 1000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.on('timeout', () => { req.destroy(); retry(); });
      req.on('error', retry);
    };
    const retry = () => {
      attempts++;
      if (attempts >= retries) reject(new Error('Server did not start in time'));
      else setTimeout(check, 1000);
    };
    check();
  });
}

async function startServer(): Promise<void> {
  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..');

  const standaloneScript = path.join(appRoot, '.next', 'standalone', 'server.js');

  // ── A: attach to an already-running server ─────────────────────────────────
  if (!app.isPackaged && await checkPortResponding(3000)) {
    serverPort = 3000;
    console.log('[electron] Attaching to existing server on port 3000');
    return;
  }

  serverPort = await findFreePort(3000);

  // Electron keeps its own data directory so it never conflicts with a
  // concurrently-running `pnpm dev` web server sharing the same LevelDB path.
  const electronDataDir = path.join(app.getPath('userData'), 'data');
  const serverEnvBase = {
    COREFIRST_DATA_DIR: electronDataDir,
  };

  // ── B: start pre-built standalone server (after `pnpm build`) ─────────────
  if (fs.existsSync(standaloneScript)) {
    // utilityProcess runs Node out-of-process with no Dock icon / window.
    serverProcess = utilityProcess.fork(standaloneScript, [], {
      cwd: appRoot,
      env: {
        ...process.env,
        ...serverEnvBase,
        PORT: String(serverPort),
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
      },
      stdio: 'pipe',
    });
    serverProcess.stdout?.on('data', (d: Buffer) => process.stdout.write(new Uint8Array(d)));
    serverProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(new Uint8Array(d)));
    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[electron] server exited with code ${code}`);
        app.quit();
      }
    });
    await waitForServer(serverPort, 60);
    return;
  }

  // ── C: start Next.js dev server automatically ──────────────────────────────
  const nextBin = path.join(
    appRoot, 'node_modules', '.bin',
    process.platform === 'win32' ? 'next.cmd' : 'next',
  );
  if (!fs.existsSync(nextBin)) {
    throw new Error(`next binary not found at ${nextBin}.\nRun pnpm install first.`);
  }
  console.log('[electron] Starting Next.js dev server (first start may take ~15 s)…');
  console.log(`[electron] Data directory: ${electronDataDir}`);
  spawnServer(nextBin, ['dev', '--port', String(serverPort)], appRoot, serverEnvBase);
  // Dev server is slower to boot — allow up to 60 retries
  await waitForServer(serverPort, 60);
}

function spawnServer(
  cmd: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string>,
): void {
  serverProcess = spawn(cmd, args, {
    env: { ...process.env, ...extraEnv },
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout?.on('data', (d: Buffer) => process.stdout.write(new Uint8Array(d)));
  serverProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(new Uint8Array(d)));
  serverProcess.on('error', (err) => {
    console.error('[electron] server error:', err);
    app.quit();
  });
  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[electron] server exited with code ${code}`);
      app.quit();
    }
  });
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'CoreFirst',
    icon: path.join(__dirname, '..', 'public', 'corefirst-logo.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f0f23',
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Open external links in the system browser; allow only the local server
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const { hostname, protocol } = new URL(url);
      const isLocal = hostname === '127.0.0.1' || hostname === 'localhost';
      if (isLocal && (protocol === 'http:' || protocol === 'https:')) {
        return { action: 'allow' };
      }
    } catch {
      // Malformed URL — deny
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://localhost:${serverPort}`);

  // Replay any deep link that arrived before the renderer was ready.
  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingDeepLink && mainWindow) {
      mainWindow.webContents.send('corefirst:oauth-callback', pendingDeepLink);
      pendingDeepLink = null;
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Enforce single instance — second launch focuses the existing window instead.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Show dialog so user knows why it quits, rather than silently disappearing.
  app.whenReady().then(() => {
    dialog.showErrorBox('CoreFirst already running', 'CoreFirst is already open. Check your Dock or taskbar.');
    app.quit();
  });
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Windows / Linux: deep links arrive in argv on a second launch.
    const url = extractDeepLinkFromArgs(argv);
    if (url) deliverDeepLink(url);
  });

  // macOS: deep links arrive via open-url event.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (url.startsWith(`${DEEPLINK_SCHEME}://`)) deliverDeepLink(url);
  });

  // IPC: renderer asks main to open a URL in the system browser
  // (used by OAuth flows since Google rejects embedded webviews).
  ipcMain.handle('corefirst:open-external', async (_evt, url: string) => {
    try {
      // Only allow https — never let the renderer launch arbitrary commands.
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        throw new Error('Only http(s) URLs may be opened externally');
      }
      await shell.openExternal(url);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  registerProtocol();

  // Cold-start deep link: if the app was launched FROM a corefirst:// URL,
  // it will be the last argv entry on Win/Linux. (macOS uses open-url, fired
  // after app ready.)
  const coldDeepLink = extractDeepLinkFromArgs(process.argv);
  if (coldDeepLink) pendingDeepLink = coldDeepLink;

  app.whenReady().then(async () => {
    isStartingUp = true;
    try {
      await startServer();
      await createWindow();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[electron] startup failed:', message);
      dialog.showErrorBox('CoreFirst — startup error', message);
      app.quit();
    } finally {
      isStartingUp = false;
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    // Guard against re-entry during initial startup.
    if (isStartingUp) return;
    if (mainWindow === null) createWindow();
    else mainWindow.focus();
  });

  app.on('before-quit', () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });
}
