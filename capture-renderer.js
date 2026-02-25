const { ipcRenderer } = require('electron');

const form = document.getElementById('captureForm');
const projectSelect = document.getElementById('project');
const projectInput = document.getElementById('projectInput');
const tagsInput = document.getElementById('tags');
const noteInput = document.getElementById('note');
const contentTextarea = document.getElementById('content');
const contentGroup = document.getElementById('contentGroup');
const cancelBtn = document.getElementById('cancelBtn');
const title = document.getElementById('title');
const preview = document.getElementById('preview');
const previewContent = document.getElementById('previewContent');
const aiGenerateBtn = document.getElementById('aiGenerateBtn');
const aiGenerateStatus = document.getElementById('aiGenerateStatus');

let currentCaptureType = null;
let currentTextContent = null;
let currentScreenshotPath = null;

// Project 選單改變時
projectSelect.addEventListener('change', (e) => {
  if (e.target.value === '__new__') {
    projectInput.style.display = 'block';
    projectInput.focus();
  } else {
    projectInput.style.display = 'none';
  }
});

// 提交表單
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const tags = tagsInput.value
    .split(' ')
    .filter(t => t.trim().length > 0)
    .map(t => t.startsWith('#') ? t : '#' + t);

  // 決定 project 名稱
  let projectName = projectSelect.value;
  if (projectName === '__new__') {
    projectName = projectInput.value.trim() || 'Unassigned';
  } else if (!projectName) {
    projectName = 'Unassigned';
  }

  const contextData = {
    project: projectName,
    tags: tags,
    note: noteInput.value.trim(),
    textContent: currentCaptureType === 'text' ? contentTextarea.value.trim() : null
  };

  ipcRenderer.send('save-context', contextData);
});

// 取消按鈕
cancelBtn.addEventListener('click', () => {
  // 通知 main process 清理暫存檔案
  ipcRenderer.send('cancel-capture');
  clearForm();
  window.close();
});

// ESC 鍵取消
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // 通知 main process 清理暫存檔案
    ipcRenderer.send('cancel-capture');
    clearForm();
    window.close();
  }
});

// 儲存成功
ipcRenderer.on('save-success', () => {
  clearForm();
  // 視窗會在 main.js 中被隱藏
});

// 儲存失敗
ipcRenderer.on('save-error', (event, error) => {
  alert('Save failed: ' + error);
});

function clearForm() {
  projectSelect.selectedIndex = 0;
  projectInput.value = '';
  projectInput.style.display = 'none';
  tagsInput.value = '';
  noteInput.value = '';
  contentTextarea.value = '';
  contentGroup.style.display = 'none';
  preview.style.display = 'none';
}

// 接收 capture 資料
ipcRenderer.on('capture-data', (event, data) => {
  currentCaptureType = data.type;
  currentTextContent = data.data;
  currentScreenshotPath = data.screenshotPath || null;

  // 填充 project 下拉選單
  populateProjectSelect(data.projects || []);

  if (data.type === 'screenshot') {
    title.textContent = '📸 New Screenshot Context';
    preview.style.display = 'block';
    currentScreenshotPath = data.data; // Store the screenshot path
    // Display screenshot thumbnail
    previewContent.innerHTML = `<img src="file://${data.data}" class="screenshot-thumbnail" alt="Screenshot preview">`;
    contentGroup.style.display = 'none';
    // 顯示 AI 生成按鈕（只對截圖）
    aiGenerateBtn.style.display = 'block';
  } else if (data.type === 'text') {
    title.textContent = '📝 New Text Context';
    preview.style.display = 'none';
    contentGroup.style.display = 'block';
    contentTextarea.value = data.data || '';
    // 隱藏 AI 生成按鈕
    aiGenerateBtn.style.display = 'none';
    // 聚焦到 project 選單
    setTimeout(() => projectSelect.focus(), 100);
  }

  // 清空其他欄位
  projectSelect.selectedIndex = 0;
  projectInput.value = '';
  projectInput.style.display = 'none';
  tagsInput.value = '';
  noteInput.value = '';
  aiGenerateStatus.style.display = 'none';
});

function populateProjectSelect(projects) {
  // 清空現有選項
  projectSelect.innerHTML = '';

  // If no projects exist, pre-select "New Project"
  if (!projects || projects.length === 0) {
    const newOption = document.createElement('option');
    newOption.value = '__new__';
    newOption.textContent = '+ Create First Project';
    newOption.selected = true;
    projectSelect.appendChild(newOption);

    // Show project input field immediately
    projectInput.style.display = 'block';
    projectInput.placeholder = 'Enter project name (e.g., "My Project")';
    setTimeout(() => projectInput.focus(), 100);
  } else {
    // Add default option
    projectSelect.innerHTML = '<option value="">Select a project...</option>';

    // 加入已有的 projects
    projects.forEach(project => {
      const option = document.createElement('option');
      option.value = project;
      option.textContent = project;
      projectSelect.appendChild(option);
    });

    // 加入 "New Project" 選項
    const newOption = document.createElement('option');
    newOption.value = '__new__';
    newOption.textContent = '+ New Project';
    projectSelect.appendChild(newOption);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// AI 生成 note 功能
aiGenerateBtn.addEventListener('click', async () => {
  if (!currentScreenshotPath) {
    showAIStatus('error', 'No screenshot available');
    return;
  }

  // 禁用按鈕並顯示 loading 狀態
  aiGenerateBtn.disabled = true;
  showAIStatus('loading', '🤖 Analyzing screenshot...');

  try {
    // 發送請求到 main process
    const result = await ipcRenderer.invoke('generate-note-from-image', currentScreenshotPath);

    if (result.success) {
      // 填入生成的 note
      noteInput.value = result.note;
      showAIStatus('success', '✅ Note generated successfully!');

      // 3 秒後隱藏狀態訊息
      setTimeout(() => {
        aiGenerateStatus.style.display = 'none';
      }, 3000);
    } else {
      showAIStatus('error', '❌ Failed: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('AI generation error:', error);
    showAIStatus('error', '❌ Error: ' + error.message);
  } finally {
    aiGenerateBtn.disabled = false;
  }
});

function showAIStatus(type, message) {
  aiGenerateStatus.className = `ai-status ${type}`;
  aiGenerateStatus.textContent = message;
  aiGenerateStatus.style.display = 'block';
}
