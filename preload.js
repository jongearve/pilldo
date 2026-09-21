const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('state:load'),
  sessionGet: () => ipcRenderer.invoke('session:get'),
  sessionSet: (v) => ipcRenderer.invoke('session:set', v),
  save: (state) => ipcRenderer.send('state:save', state),
  setMode: (mode) => ipcRenderer.send('window:mode', mode),
  resize: (height) => ipcRenderer.send('window:resize', height),
  hide: () => ipcRenderer.send('window:hide'),
  quit: () => ipcRenderer.send('app:quit'),
  testNotification: () => ipcRenderer.send('notify:test'),
  onFocusInput: (cb) => ipcRenderer.on('focus-input', () => cb()),
  onPatchSettings: (cb) => ipcRenderer.on('patch-settings', (_e, patch) => cb(patch)),
  onBarSetStatus: (cb) => ipcRenderer.on('bar-set-status', (_e, id, st) => cb(id, st)),
  resetBar: () => ipcRenderer.send('bar:reset'),
  bar: {
    ready: () => ipcRenderer.send('bar:ready'),
    click: () => ipcRenderer.send('bar:click'),
    setStatus: (id, status) => ipcRenderer.send('bar:set-status', id, status),
    resize: (w) => ipcRenderer.send('bar:resize', w),
    dragStart: () => ipcRenderer.send('bar:drag-start'),
    dragEnd: () => ipcRenderer.send('bar:drag-end'),
    menu: () => ipcRenderer.send('bar:menu'),
    onUpdate: (cb) => ipcRenderer.on('bar:update', (_e, s) => cb(s)),
  },
  onRequestMode: (cb) => ipcRenderer.on('request-mode', (_e, mode) => cb(mode)),
});
