console.log('Testing electron...');
console.log('process.versions.electron:', process.versions.electron);
console.log('process.type:', process.type);

const electron = require('electron');
console.log('electron type:', typeof electron);
console.log('electron.app:', typeof electron.app);

if (electron.app) {
  electron.app.whenReady().then(() => {
    console.log('App is ready!');
    electron.app.quit();
  });
} else {
  console.error('ERROR: electron.app is undefined!');
}
