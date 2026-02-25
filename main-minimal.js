const { app, BrowserWindow } = require('electron');

console.log('Starting minimal electron app...');
console.log('process.type:', process.type);

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600
  });

  win.loadURL('data:text/html,<h1>Minimal Electron App Works!</h1>');
  console.log('Window created!');
}

app.whenReady().then(() => {
  console.log('App is ready!');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
