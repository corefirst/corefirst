// Minimal preload — no sensitive Node APIs exposed to the renderer.
// contextIsolation: true ensures the web app runs in an isolated context.
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('__corefirstDesktop', {
  platform: process.platform,
});
