"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("__corefirstDesktop", {
  platform: process.platform
});
