const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron');
const path = require('path');
const geminiHandler = require('./geminiHandler.cjs');

let mainWindow = null;

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createMainWindow() {
  const iconPath = path.join(__dirname, '../build/icon.ico');

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 868,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#02120a',
    title: 'Grammar Casino',
    icon: iconPath,
    show: false, // Prevent white flicker on startup
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      devTools: !app.isPackaged,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Strict navigation guard: do not allow loading external web pages inside Electron
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      // Allow local file protocol inside the bundled app directory
      if (parsed.protocol === 'file:') {
        return;
      }
    } catch (e) {
      console.warn('URL parsing error on navigation:', e);
    }

    // Deny in-app navigation and open external link in system default browser
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });

  // Intercept any window.open / <a target="_blank"> calls
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the self-contained local production files
  const localIndexPath = path.join(__dirname, '../dist/index.html');
  mainWindow.loadFile(localIndexPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setupApplicationMenu();
}

function setupApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Table',
      submenu: [
        {
          label: 'Reload Table',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              const localIndexPath = path.join(__dirname, '../dist/index.html');
              mainWindow.loadFile(localIndexPath);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Toggle Fullscreen',
          accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
          click: () => {
            if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Exit Grammar Casino' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom', label: 'Actual Size' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Grammar Casino',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Grammar Casino Desktop',
              message: 'Grammar Casino Desktop (Self-Contained)',
              detail:
                'Version 1.0.0\nHigh-Stakes English Grammar Challenge\nRuns 100% locally with built-in curated sentence bank.\nOptional Gemini AI integration with Windows DPAPI encryption.',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// --- IPC Handlers for Gemini & Desktop Configuration ---
ipcMain.handle('gemini:generateSentence', async (_event, payload) => {
  return await geminiHandler.generateSentence(payload);
});

ipcMain.handle('gemini:getHint', async (_event, payload) => {
  return await geminiHandler.getHint(payload);
});

ipcMain.handle('gemini:verifyCorrection', async (_event, payload) => {
  return await geminiHandler.verifyCorrection(payload);
});

ipcMain.handle('gemini:verifyOpenClozeBatch', async (_event, payload) => {
  return await geminiHandler.verifyOpenClozeBatch(payload);
});

ipcMain.handle('gemini:simplifyExplanation', async (_event, payload) => {
  return await geminiHandler.simplifyExplanation(payload);
});

ipcMain.handle('gemini:generateSpeech', async (_event, payload) => {
  return await geminiHandler.generateSpeech(payload);
});

ipcMain.handle('settings:getStatus', async () => {
  return geminiHandler.getStatus();
});

ipcMain.handle('settings:setApiKey', async (_event, key) => {
  return geminiHandler.setApiKey(key);
});

ipcMain.handle('settings:clearApiKey', async () => {
  return geminiHandler.clearApiKey();
});

ipcMain.handle('settings:testApiKey', async (_event, key) => {
  return await geminiHandler.testApiKey(key);
});

ipcMain.handle('system:openExternal', async (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
  }
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
