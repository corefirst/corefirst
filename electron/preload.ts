// Minimal preload — no sensitive Node APIs exposed to the renderer.
// contextIsolation: true ensures the web app runs in an isolated context.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('__corefirstDesktop', {
  platform: process.platform,
});

// OAuth bridge — see comment block in electron/main.ts for the full flow.
contextBridge.exposeInMainWorld('__corefirstElectron', {
  /**
   * Open `url` in the system browser. Used by OAuth flows because Google
   * rejects embedded webviews. Main-process side validates the URL is http(s).
   */
  openExternal: (url: string) => ipcRenderer.invoke('corefirst:open-external', url),

  /**
   * Subscribe to `corefirst://oauth/callback` deep-links. The handler is
   * invoked with the FULL URL (including hash). Returns a function that
   * unsubscribes the listener.
   */
  onOAuthCallback: (handler: (url: string) => void) => {
    const listener = (_evt: Electron.IpcRendererEvent, url: string) => handler(url);
    ipcRenderer.on('corefirst:oauth-callback', listener);
    return () => ipcRenderer.removeListener('corefirst:oauth-callback', listener);
  },
});
