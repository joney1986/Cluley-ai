const { app, BrowserWindow, ipcMain, desktopCapturer, systemPreferences } = require('electron');
const path = require('path');

async function requestMediaPermissions() {
  if (process.platform !== 'darwin') {
    return;
  }
  try {
    const microphone = await systemPreferences.askForMediaAccess('microphone');
    const camera = await systemPreferences.askForMediaAccess('camera');
    console.log(`macOS Permissions: microphone=${microphone}, camera=${camera}`);
  } catch (error) {
    console.error('Could not get media permissions', error);
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Enable context isolation
      nodeIntegration: false, // Disable Node.js integration in the renderer
    }
  });

  mainWindow.loadFile('index.html');

  // Open the DevTools for debugging.
  mainWindow.webContents.openDevTools();
}

// This handler will be called from the renderer process to get the screen sources
ipcMain.handle('get-sources', async () => {
  return await desktopCapturer.getSources({ types: ['window', 'screen'] });
});

app.whenReady().then(async () => {
  await requestMediaPermissions();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
