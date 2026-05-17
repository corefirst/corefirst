/**
 * Electron preload bridge — types for the `__corefirstDesktop` and
 * `__corefirstElectron` objects exposed by `electron/preload.ts` via
 * `contextBridge.exposeInMainWorld`.
 *
 * Available only at runtime when the page is rendered inside the Electron
 * BrowserWindow; consumers must guard with `if (window.__corefirstElectron)`.
 */
export {};

declare global {
  interface Window {
    __corefirstDesktop?: {
      platform: NodeJS.Platform;
    };
    __corefirstElectron?: {
      /** Open `url` in the system browser. Used by OAuth flows because
       *  Google rejects embedded webviews. Main-process validates http(s). */
      openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
      /** Subscribe to `corefirst://oauth/callback` deep-links delivered to
       *  the main process. Returns an unsubscribe function. */
      onOAuthCallback: (handler: (url: string) => void) => () => void;
    };
  }
}
