const { contextBridge, ipcRenderer } = require('electron');

// Expose strictly defined, secure operations to the renderer process
contextBridge.exposeInMainWorld('electronDesktop', {
  isDesktop: true,

  gemini: {
    generateSentence: (payload) => ipcRenderer.invoke('gemini:generateSentence', payload),
    getHint: (payload) => ipcRenderer.invoke('gemini:getHint', payload),
    verifyCorrection: (payload) => ipcRenderer.invoke('gemini:verifyCorrection', payload),
    verifyOpenClozeBatch: (payload) => ipcRenderer.invoke('gemini:verifyOpenClozeBatch', payload),
    simplifyExplanation: (payload) => ipcRenderer.invoke('gemini:simplifyExplanation', payload),
    generateSpeech: (payload) => ipcRenderer.invoke('gemini:generateSpeech', payload),
  },

  settings: {
    getStatus: () => ipcRenderer.invoke('settings:getStatus'),
    setApiKey: (key) => ipcRenderer.invoke('settings:setApiKey', key),
    clearApiKey: () => ipcRenderer.invoke('settings:clearApiKey'),
    testApiKey: (key) => ipcRenderer.invoke('settings:testApiKey', key),
  },

  system: {
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
  },
});
