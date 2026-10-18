const { app, BrowserWindow, shell, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const geminiHandler = require('./geminiHandler.cjs');

let mainWindow = null;
let isReadOnlyLocation = false;
let readOnlyMessage = '';

// Determine whether running as an electron-builder portable executable
function isPortableMode() {
  return Boolean(
    process.env.PORTABLE_EXECUTABLE_DIR ||
    process.env.GRAMMAR_CASINO_PORTABLE === '1' ||
    process.argv.includes('--portable')
  );
}

function getPortableExeDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  return path.dirname(process.execPath);
}

// Configure dedicated data directory beside executable when in portable mode
function setupStorage() {
  if (isPortableMode()) {
    const exeDir = getPortableExeDir();
    const portableDataDir = path.join(exeDir, 'Grammar Casino Data');

    try {
      if (!fs.existsSync(portableDataDir)) {
        fs.mkdirSync(portableDataDir, { recursive: true });
      }

      // Probe write permissions to ensure the drive/location is writable
      const probeFile = path.join(portableDataDir, `.probe_${Date.now()}`);
      fs.writeFileSync(probeFile, 'ok');
      fs.unlinkSync(probeFile);

      // Successfully verified writable: set userData path
      app.setPath('userData', portableDataDir);
      isReadOnlyLocation = false;
      geminiHandler.setStorageInfo({
        isPortable: true,
        isReadOnly: false,
        dataPath: portableDataDir,
      });
      console.log(`[Portable] Using portable data directory: ${portableDataDir}`);
    } catch (err) {
      console.warn(`[Portable] Portable location is write-protected or read-only (${exeDir}):`, err.message);
      isReadOnlyLocation = true;
      readOnlyMessage = `The portable drive or folder at:\n${exeDir}\nis write-protected or read-only. Settings and game saves will run in temporary session memory and cannot be saved to the drive.`;

      // Fallback to a temp directory so Electron and Chromium can launch safely without crashing
      const tempUserData = path.join(app.getPath('temp'), 'GrammarCasino_PortableTemp');
      try {
        fs.mkdirSync(tempUserData, { recursive: true });
        app.setPath('userData', tempUserData);
      } catch (fallbackErr) {
        console.error('Failed to set fallback temp userData:', fallbackErr);
      }

      geminiHandler.setStorageInfo({
        isPortable: true,
        isReadOnly: true,
        dataPath: exeDir,
      });
    }
  } else {
    geminiHandler.setStorageInfo({
      isPortable: false,
      isReadOnly: false,
      dataPath: app.getPath('userData'),
    });
  }
}

// Call storage configuration before app is ready
setupStorage();

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
    title: isPortableMode() ? 'Grammar Casino (Portable)' : 'Grammar Casino',
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

    // If running in portable mode on a read-only drive, display a clear warning dialog
    if (isReadOnlyLocation) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Grammar Casino Portable - Read-Only Storage',
        message: 'Portable Storage is Write-Protected',
        detail:
          'Grammar Casino Portable detected that its folder is read-only:\n\n' +
          getPortableExeDir() +
          '\n\nGame saves and custom settings will run in temporary session memory and cannot be saved to the drive.',
        buttons: ['Continue in Session Memory Mode'],
      });
    }
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
  const isPortable = isPortableMode();
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
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Grammar Casino',
              message: isPortable ? 'Grammar Casino (Portable Edition)' : 'Grammar Casino Desktop',
              detail:
                `Version 1.0.0\n` +
                `High-Stakes English Grammar Challenge\n` +
                `Edition: ${isPortable ? 'Portable (Self-Contained, USB-Ready)' : 'Installed Desktop'}\n` +
                `Data Location: ${app.getPath('userData')}\n` +
                `${isReadOnlyLocation ? 'Status: READ-ONLY MEDIA (Session Memory Only)\n' : ''}` +
                `Runs 100% locally with built-in curated sentence bank.\n` +
                `Optional Gemini AI integration with Windows DPAPI encryption.`,
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

// --- Portable Game Save Persistence IPC ---
function getSaveFilePath() {
  return path.join(app.getPath('userData'), 'game_save.json');
}

ipcMain.handle('storage:saveGame', async (_event, gameState) => {
  if (isReadOnlyLocation) {
    return { success: false, readOnly: true, error: 'Portable location is read-only.' };
  }
  try {
    const savePath = getSaveFilePath();
    fs.writeFileSync(savePath, JSON.stringify(gameState, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('[Storage] Failed to save game state to portable file:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('storage:loadGame', async () => {
  try {
    const savePath = getSaveFilePath();
    if (fs.existsSync(savePath)) {
      const data = fs.readFileSync(savePath, 'utf8');
      return { success: true, gameState: JSON.parse(data) };
    }
    return { success: true, gameState: null };
  } catch (err) {
    console.error('[Storage] Failed to read portable save state:', err);
    return { success: false, error: err.message, gameState: null };
  }
});

ipcMain.handle('storage:clearGame', async () => {
  if (isReadOnlyLocation) {
    return { success: false, readOnly: true };
  }
  try {
    const savePath = getSaveFilePath();
    if (fs.existsSync(savePath)) {
      fs.unlinkSync(savePath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
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
