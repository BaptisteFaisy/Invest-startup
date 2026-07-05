// Point d'entrée Electron : démarre le serveur Express (server.js) comme
// processus enfant, attend que le port réponde, puis ouvre une fenêtre desktop
// pointant sur l'application web locale.
const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || 3000;
const APP_URL = `http://localhost:${PORT}`;

let serverProcess = null;
let mainWindow = null;

// Lance server.js dans un processus Node séparé.
function startServer() {
  serverProcess = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit',
  });
  serverProcess.on('exit', (code) => {
    if (code && code !== 0) console.error(`[electron] server.js exited with code ${code}`);
  });
}

// Attend que le serveur réponde (poll HTTP) avant d'ouvrir la fenêtre.
function waitForServer(url, timeoutMs = 30000, intervalMs = 400) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const ping = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) return reject(new Error('Serveur injoignable (timeout)'));
        setTimeout(ping, intervalMs);
      });
    };
    ping();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'LIQUID+',
    backgroundColor: '#0b0b0f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(APP_URL);

  // Les liens externes (target=_blank / http externe) s'ouvrent dans le navigateur.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer(APP_URL);
  } catch (err) {
    console.error('[electron]', err.message);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Toujours tuer le serveur enfant à la fermeture de l'app.
app.on('before-quit', () => {
  if (serverProcess) {
    try { serverProcess.kill(); } catch {}
    serverProcess = null;
  }
});
