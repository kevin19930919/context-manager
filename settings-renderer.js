const { ipcRenderer } = require('electron');

const form = document.getElementById('settingsForm');
const claudeKeyInput = document.getElementById('claudeKey');
const openaiKeyInput = document.getElementById('openaiKey');
const cancelBtn = document.getElementById('cancelBtn');
const successMsg = document.getElementById('successMsg');

// Load existing settings
window.addEventListener('DOMContentLoaded', async () => {
  const config = await ipcRenderer.invoke('get-config');
  if (config) {
    if (config.claudeApiKey) {
      claudeKeyInput.value = config.claudeApiKey;
    }
    if (config.openaiApiKey) {
      openaiKeyInput.value = config.openaiApiKey;
    }
  }
});

// Save settings
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const config = {
    claudeApiKey: claudeKeyInput.value.trim(),
    openaiApiKey: openaiKeyInput.value.trim()
  };

  try {
    await ipcRenderer.invoke('save-config', config);
    successMsg.classList.add('show');
    setTimeout(() => {
      successMsg.classList.remove('show');
    }, 3000);
  } catch (error) {
    alert('Failed to save settings: ' + error.message);
  }
});

// Cancel
cancelBtn.addEventListener('click', () => {
  window.close();
});
