"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron = require("electron");
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var http = __toESM(require("http"));
var import_child_process = require("child_process");
var net = __toESM(require("net"));
var mainWindow = null;
var serverProcess = null;
var serverPort = 3e3;
var isStartingUp = false;
function findFreePort(start, limit = start + 50) {
  return new Promise((resolve, reject) => {
    if (start > limit) {
      reject(new Error("No free port found in range"));
      return;
    }
    const server = net.createServer();
    server.listen(start, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", () => resolve(findFreePort(start + 1, limit)));
  });
}
function checkPortResponding(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, { timeout: 800 }, (res) => {
      res.resume();
      resolve(res.statusCode !== void 0);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}
function waitForServer(port, retries = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}`, { timeout: 1e3 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.on("timeout", () => {
        req.destroy();
        retry();
      });
      req.on("error", retry);
    };
    const retry = () => {
      attempts++;
      if (attempts >= retries) reject(new Error("Server did not start in time"));
      else setTimeout(check, 1e3);
    };
    check();
  });
}
async function startServer() {
  const appRoot = import_electron.app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
  const standaloneScript = path.join(appRoot, ".next", "standalone", "server.js");
  if (!import_electron.app.isPackaged && await checkPortResponding(3e3)) {
    serverPort = 3e3;
    console.log("[electron] Attaching to existing server on port 3000");
    return;
  }
  serverPort = await findFreePort(3e3);
  const electronDataDir = path.join(import_electron.app.getPath("userData"), "data");
  const serverEnvBase = {
    COREFIRST_DATA_DIR: electronDataDir
  };
  if (fs.existsSync(standaloneScript)) {
    serverProcess = import_electron.utilityProcess.fork(standaloneScript, [], {
      cwd: appRoot,
      env: {
        ...process.env,
        ...serverEnvBase,
        PORT: String(serverPort),
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production"
      },
      stdio: "pipe"
    });
    serverProcess.stdout?.on("data", (d) => process.stdout.write(new Uint8Array(d)));
    serverProcess.stderr?.on("data", (d) => process.stderr.write(new Uint8Array(d)));
    serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[electron] server exited with code ${code}`);
        import_electron.app.quit();
      }
    });
    await waitForServer(serverPort, 60);
    return;
  }
  const nextBin = path.join(
    appRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "next.cmd" : "next"
  );
  if (!fs.existsSync(nextBin)) {
    throw new Error(`next binary not found at ${nextBin}.
Run pnpm install first.`);
  }
  console.log("[electron] Starting Next.js dev server (first start may take ~15 s)\u2026");
  console.log(`[electron] Data directory: ${electronDataDir}`);
  spawnServer(nextBin, ["dev", "--port", String(serverPort)], appRoot, serverEnvBase);
  await waitForServer(serverPort, 60);
}
function spawnServer(cmd, args, cwd, extraEnv) {
  serverProcess = (0, import_child_process.spawn)(cmd, args, {
    env: { ...process.env, ...extraEnv },
    cwd,
    stdio: ["ignore", "pipe", "pipe"]
  });
  serverProcess.stdout?.on("data", (d) => process.stdout.write(new Uint8Array(d)));
  serverProcess.stderr?.on("data", (d) => process.stderr.write(new Uint8Array(d)));
  serverProcess.on("error", (err) => {
    console.error("[electron] server error:", err);
    import_electron.app.quit();
  });
  serverProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[electron] server exited with code ${code}`);
      import_electron.app.quit();
    }
  });
}
async function createWindow() {
  mainWindow = new import_electron.BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "CoreFirst",
    icon: path.join(__dirname, "..", "public", "corefirst-logo.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: "#0f0f23",
    show: false
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const { hostname, protocol } = new URL(url);
      const isLocal = hostname === "127.0.0.1" || hostname === "localhost";
      if (isLocal && (protocol === "http:" || protocol === "https:")) {
        return { action: "allow" };
      }
    } catch {
    }
    import_electron.shell.openExternal(url);
    return { action: "deny" };
  });
  await mainWindow.loadURL(`http://localhost:${serverPort}`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
var gotLock = import_electron.app.requestSingleInstanceLock();
if (!gotLock) {
  import_electron.app.whenReady().then(() => {
    import_electron.dialog.showErrorBox("CoreFirst already running", "CoreFirst is already open. Check your Dock or taskbar.");
    import_electron.app.quit();
  });
} else {
  import_electron.app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  import_electron.app.whenReady().then(async () => {
    isStartingUp = true;
    try {
      await startServer();
      await createWindow();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[electron] startup failed:", message);
      import_electron.dialog.showErrorBox("CoreFirst \u2014 startup error", message);
      import_electron.app.quit();
    } finally {
      isStartingUp = false;
    }
  });
  import_electron.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") import_electron.app.quit();
  });
  import_electron.app.on("activate", () => {
    if (isStartingUp) return;
    if (mainWindow === null) createWindow();
    else mainWindow.focus();
  });
  import_electron.app.on("before-quit", () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });
}
