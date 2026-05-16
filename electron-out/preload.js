"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Minimal preload — no sensitive Node APIs exposed to the renderer.
// contextIsolation: true ensures the web app runs in an isolated context.
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('__corefirstDesktop', {
    platform: process.platform,
});
