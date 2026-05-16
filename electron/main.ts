import { app, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import * as http from 'http';
import { spawn, ChildProcess } from 'child_process';
import * as net from 'net';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let serverPort = 3000;

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

function waitForServer(port: number, retries = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}`, { timeout: 1000 }, (res) => {
        res.resume(); // drain response body
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

  serverPort = await findFreePort(3000);

  const serverScript = path.join(appRoot, '.next', 'standalone', 'server.js');
  const env = {
    ...process.env,
    PORT: String(serverPort),
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
  };

  serverProcess = spawn(process.execPath, [serverScript], {
    env,
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (d: Buffer) => process.stdout.write(d));
  serverProcess.stderr?.on('data', (d: Buffer) => process.stderr.write(d));
  serverProcess.on('error', (err) => {
    console.error('[electron] server error:', err);
    app.quit();
  });
  serverProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[electron] server exited with code ${code}`);
      app.quit();
    }
  });

  await waitForServer(serverPort);
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

  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  try {
    await startServer();
    await createWindow();
  } catch (err) {
    console.error('[electron] startup failed:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', () => {
  serverProcess?.kill();
});
