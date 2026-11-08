const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('personalAI', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: data => ipcRenderer.invoke('data:save', data),
  clearData: () => ipcRenderer.invoke('data:clear'),
  getDataPath: () => ipcRenderer.invoke('data:path'),
  authorizeMicrophone: () => ipcRenderer.invoke('mic:authorize'),
  openShortcut: id => ipcRenderer.invoke('shortcut:open', id),
  getAIStatus: (provider, baseUrl) => ipcRenderer.invoke('ai:status', provider, baseUrl),
  getAIReply: (options, messages) => ipcRenderer.invoke('ai:reply', options, messages)
});
