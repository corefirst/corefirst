"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const child_process_1 = require("child_process");
const net = __importStar(require("net"));
let mainWindow = null;
let serverProcess = null;
let serverPort = 3000;
function findFreePort(start) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(start, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', () => {
            if (start < start + 50)
                resolve(findFreePort(start + 1));
            else
                reject(new Error('No free port found'));
        });
    });
}
function waitForServer(port, retries = 30) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            const req = http.get(`http://127.0.0.1:${port}`, (res) => {
                if (res.statusCode && res.statusCode < 500)
                    resolve();
                else
                    retry();
            });
            req.on('error', retry);
        };
        const retry = () => {
            attempts++;
            if (attempts >= retries)
                reject(new Error('Server did not start in time'));
            else
                setTimeout(check, 1000);
        };
        check();
    });
}
async function startServer() {
    const appRoot = electron_1.app.isPackaged
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
    serverProcess = (0, child_process_1.spawn)(process.execPath, [serverScript], {
        env,
        cwd: appRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout?.on('data', (d) => process.stdout.write(d));
    serverProcess.stderr?.on('data', (d) => process.stderr.write(d));
    serverProcess.on('error', (err) => console.error('[electron] server error:', err));
    await waitForServer(serverPort);
}
async function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
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
    // Open external links in system browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http') && !url.includes('127.0.0.1')) {
            electron_1.shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });
    await mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
    mainWindow.on('closed', () => { mainWindow = null; });
}
electron_1.app.whenReady().then(async () => {
    try {
        await startServer();
        await createWindow();
    }
    catch (err) {
        console.error('[electron] startup failed:', err);
        electron_1.app.quit();
    }
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (mainWindow === null)
        createWindow();
});
electron_1.app.on('before-quit', () => {
    serverProcess?.kill();
});
