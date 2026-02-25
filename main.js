const { app, BrowserWindow, globalShortcut, ipcMain, screen, clipboard, desktopCapturer } = require('electron');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { ClaudeProvider, OpenAIProvider } = require('./ai-providers');

let mainWindow = null;
let captureWindow = null;
let selectionWindow = null;
let chatWindow = null;
let settingsWindow = null;
let currentScreenshotPath = null;
let currentClipboardText = null;
let captureType = 'screenshot'; // 'screenshot' or 'text'

// AI Providers
let claudeProvider = null;
let openaiProvider = null;

// 確保資料目錄存在
const dataDir = path.join(__dirname, 'data');
const screenshotsDir = path.join(dataDir, 'screenshots');
const tempScreenshotsDir = path.join(screenshotsDir, '_temp');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir);
}
if (!fs.existsSync(tempScreenshotsDir)) {
  fs.mkdirSync(tempScreenshotsDir, { recursive: true });
}

// 清理 _temp 資料夾中的所有檔案
function cleanupTempFolder() {
  try {
    const files = fs.readdirSync(tempScreenshotsDir);
    let deletedCount = 0;
    files.forEach(file => {
      const filePath = path.join(tempScreenshotsDir, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    });
    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} temporary file(s) from _temp folder`);
    }
  } catch (error) {
    console.error('Failed to cleanup temp folder:', error);
  }
}

// Helper functions for per-project contexts
function getProjectContextsFile(project) {
  const projectDir = path.join(screenshotsDir, project);
  return path.join(projectDir, 'contexts.json');
}

function readProjectContexts(project) {
  const contextFile = getProjectContextsFile(project);
  if (!fs.existsSync(contextFile)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(contextFile, 'utf8'));
  } catch (error) {
    console.error(`Error reading contexts for project ${project}:`, error);
    return [];
  }
}

function writeProjectContexts(project, contexts) {
  const projectDir = path.join(screenshotsDir, project);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  const contextFile = getProjectContextsFile(project);
  fs.writeFileSync(contextFile, JSON.stringify(contexts, null, 2));
}

function getAllProjects() {
  const items = fs.readdirSync(screenshotsDir);
  return items.filter(item => {
    const itemPath = path.join(screenshotsDir, item);
    return fs.statSync(itemPath).isDirectory() && item !== '_temp';
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
}

function createCaptureWindow() {
  captureWindow = new BrowserWindow({
    width: 600,
    height: 650,
    frame: true,
    alwaysOnTop: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  captureWindow.loadFile('capture.html');

  // 關閉時不銷毀，只是隱藏
  captureWindow.on('close', (event) => {
    event.preventDefault();
    captureWindow.hide();
  });
}

function createSelectionWindow() {
  try {
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.bounds;

    console.log('Creating selection window...');
    console.log('Display bounds:', width, 'x', height);

    selectionWindow = new BrowserWindow({
      x: 0,
      y: 0,
      width: width,
      height: height,
      fullscreen: false,  // Changed to false
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      hasShadow: false,
      enableLargerThanScreen: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    selectionWindow.loadFile('selection.html');

    // Don't prevent close, just hide instead
    selectionWindow.on('close', (event) => {
      console.log('Selection window close event - preventing');
      event.preventDefault();
      selectionWindow.hide();
      console.log('Selection window hidden after close event');
    });

    selectionWindow.on('closed', () => {
      console.log('Selection window closed');
      selectionWindow = null;
    });

    selectionWindow.on('hide', () => {
      console.log('Selection window hidden');
    });

    selectionWindow.on('show', () => {
      console.log('Selection window shown event');
    });

    selectionWindow.on('blur', () => {
      console.log('Selection window lost focus');
    });

    selectionWindow.on('focus', () => {
      console.log('Selection window gained focus');
    });

    selectionWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Selection window failed to load:', errorCode, errorDescription);
    });

    selectionWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log('Selection window console:', message);
    });

    console.log('Selection window created successfully');
  } catch (error) {
    console.error('Error creating selection window:', error);
    throw error;
  }
}

function createChatWindow() {
  if (chatWindow) {
    chatWindow.show();
    chatWindow.focus();
    return;
  }

  chatWindow = new BrowserWindow({
    width: 800,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  chatWindow.loadFile('chat.html');

  chatWindow.on('closed', () => {
    chatWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  settingsWindow.loadFile('settings.html');

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

async function takeScreenshot() {
  try {
    console.log('Taking screenshot with desktopCapturer...');
    const timestamp = Date.now();
    const filename = `screenshot-${timestamp}.png`;
    const filepath = path.join(tempScreenshotsDir, filename);

    // Get screen size
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;
    const scaleFactor = primaryDisplay.scaleFactor || 1;

    console.log('Screen size:', width, 'x', height, 'Scale factor:', scaleFactor);

    // 使用 desktopCapturer 截取螢幕
    console.log('Capturing screen with desktopCapturer...');
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: width * scaleFactor,
        height: height * scaleFactor
      }
    });

    if (sources.length === 0) {
      throw new Error('No screen sources found');
    }

    console.log('Found', sources.length, 'screen sources');
    const screenSource = sources[0];
    const thumbnail = screenSource.thumbnail;

    // Convert NativeImage to PNG buffer
    const imgBuffer = thumbnail.toPNG();
    fs.writeFileSync(filepath, imgBuffer);
    console.log('Screenshot saved:', filepath);

    // 獲取圖片尺寸
    const metadata = await sharp(filepath).metadata();
    console.log('Image metadata:', metadata.width, 'x', metadata.height);

    // 創建並顯示選擇窗口
    if (!selectionWindow) {
      console.log('Creating new selection window...');
      createSelectionWindow();
    }

    // 等待窗口準備好後再顯示
    const showWindowAndSendData = () => {
      console.log('Sending screenshot data to selection window...');
      selectionWindow.webContents.send('show-screenshot', {
        path: filepath,
        width: metadata.width,
        height: metadata.height
      });
      selectionWindow.show();
      selectionWindow.focus();
      console.log('Selection window shown');
    };

    // 如果已經載入，直接顯示
    if (selectionWindow.webContents.getURL()) {
      console.log('Window already loaded, showing immediately');
      showWindowAndSendData();
    } else {
      // 等待窗口載入完成
      console.log('Waiting for window to load...');
      selectionWindow.webContents.once('did-finish-load', showWindowAndSendData);
    }

    return filepath;
  } catch (error) {
    console.error('Screenshot failed:', error);
    return null;
  }
}

function captureClipboardText() {
  try {
    const text = clipboard.readText();

    if (!text || text.trim().length === 0) {
      console.log('No text in clipboard');
      return null;
    }

    currentClipboardText = text;
    currentScreenshotPath = null;
    captureType = 'text';

    // 顯示輸入視窗
    if (!captureWindow) {
      createCaptureWindow();
    }

    // 讀取已有的 projects
    const allProjects = getAllProjects();

    captureWindow.webContents.send('capture-data', {
      type: 'text',
      data: text,
      projects: allProjects,
      currentProject: null // Could be enhanced to get from main window
    });
    captureWindow.show();
    captureWindow.focus();

    return text;
  } catch (error) {
    console.error('Clipboard capture failed:', error);
    return null;
  }
}

async function captureScreenshotFromClipboard() {
  try {
    console.log('Reading screenshot from clipboard...');
    const image = clipboard.readImage();

    if (image.isEmpty()) {
      console.log('No image in clipboard');
      return null;
    }

    // Save image to temp directory
    const timestamp = Date.now();
    const filename = `screenshot-${timestamp}.png`;
    const filepath = path.join(tempScreenshotsDir, filename);

    const imgBuffer = image.toPNG();
    fs.writeFileSync(filepath, imgBuffer);
    console.log('Screenshot from clipboard saved:', filepath);

    // Get image dimensions
    const metadata = await sharp(filepath).metadata();
    console.log('Image metadata:', metadata.width, 'x', metadata.height);

    // Set current screenshot data
    currentScreenshotPath = filepath;
    currentClipboardText = null;
    captureType = 'screenshot';

    // Show capture window
    if (!captureWindow) {
      createCaptureWindow();
    }

    // Read existing projects
    const allProjects = getAllProjects();

    captureWindow.webContents.send('capture-data', {
      type: 'screenshot',
      data: filepath,
      projects: allProjects,
      currentProject: null
    });
    captureWindow.show();
    captureWindow.focus();

    return filepath;
  } catch (error) {
    console.error('Clipboard screenshot capture failed:', error);
    return null;
  }
}

// 捕獲剪貼簿中的連結
async function captureLinkFromClipboard() {
  try {
    const text = clipboard.readText();
    console.log('Clipboard link:', text);

    // Check if it's a valid URL
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
    if (!text || !urlPattern.test(text)) {
      console.log('Not a valid URL in clipboard');
      return null;
    }

    // Ensure URL has protocol
    let url = text.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Send to main window to show in link input
    if (mainWindow) {
      mainWindow.webContents.send('link-from-clipboard', url);
      mainWindow.show();
      mainWindow.focus();
    }

    return url;
  } catch (error) {
    console.error('Link capture failed:', error);
    return null;
  }
}

// 註冊全域快捷鍵
function registerGlobalShortcut() {
  // Cmd+Shift+9: 從剪貼簿讀取截圖
  const ret1 = globalShortcut.register('CommandOrControl+Shift+9', async () => {
    console.log('Clipboard screenshot shortcut triggered!');
    await captureScreenshotFromClipboard();
  });

  // Cmd+Shift+V: 儲存剪貼簿文字
  const ret2 = globalShortcut.register('CommandOrControl+Shift+V', () => {
    console.log('Clipboard shortcut triggered!');
    captureClipboardText();
  });

  // Cmd+Shift+L: 儲存剪貼簿連結
  const ret3 = globalShortcut.register('CommandOrControl+Shift+L', () => {
    console.log('Link shortcut triggered!');
    captureLinkFromClipboard();
  });

  if (!ret1 || !ret2 || !ret3) {
    console.log('Shortcut registration failed');
  } else {
    console.log('Shortcuts registered: Cmd+Shift+9 (screenshot from clipboard), Cmd+Shift+V (text), Cmd+Shift+L (link)');
  }
}

// Register all IPC handlers
function registerIpcHandlers() {
// 儲存 context
ipcMain.on('save-context', (event, contextData) => {
  try {
    const project = contextData.project || 'Unassigned';
    const contexts = readProjectContexts(project);

    let finalScreenshotPath = currentScreenshotPath;

    // If screenshot, move from _temp to project folder
    if (captureType === 'screenshot' && currentScreenshotPath) {
      const projectDir = path.join(screenshotsDir, project);
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      const filename = path.basename(currentScreenshotPath);
      const newPath = path.join(projectDir, filename);

      // Move file from _temp to project folder
      fs.renameSync(currentScreenshotPath, newPath);
      finalScreenshotPath = newPath;
    }

    const newContext = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      project: project,
      tags: contextData.tags || [],
      note: contextData.note || '',
      type: captureType,
      screenshotPath: finalScreenshotPath,
      textContent: contextData.textContent || currentClipboardText
    };

    contexts.push(newContext);
    writeProjectContexts(project, contexts);

    // 通知主視窗更新
    if (mainWindow) {
      mainWindow.webContents.send('context-added', newContext);
    }

    // 隱藏輸入視窗
    captureWindow.hide();

    // 清空當前資料
    currentScreenshotPath = null;
    currentClipboardText = null;

    event.reply('save-success');
  } catch (error) {
    console.error('Save failed:', error);
    event.reply('save-error', error.message);
  }
});

// 取得所有 contexts
ipcMain.handle('get-contexts', async (event, options = {}) => {
  try {
    const { project, limit } = options;

    if (project && project !== '__all__') {
      // Load specific project - return all contexts
      return readProjectContexts(project);
    } else {
      // Load all projects - limit text content to first 5 per project
      const projects = getAllProjects();
      let allContexts = [];

      projects.forEach(proj => {
        const contexts = readProjectContexts(proj);
        allContexts = allContexts.concat(contexts);
      });

      // Sort by timestamp (newest first)
      allContexts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // For "All Projects" view, only include full text for first 5 items
      if (limit !== false) {
        allContexts.forEach((ctx, index) => {
          if ((ctx.type === 'text' || ctx.type === 'text-file') && index >= 5) {
            // Truncate text content for items after first 5
            if (ctx.textContent && ctx.textContent.length > 100) {
              ctx.textContent = ctx.textContent.substring(0, 100) + '...';
            }
          }
        });
      }

      return allContexts;
    }
  } catch (error) {
    console.error('Failed to load contexts:', error);
    return [];
  }
});

// 刪除 context
ipcMain.on('delete-context', (event, contextId) => {
  try {
    // Find which project this context belongs to
    const projects = getAllProjects();
    let deleted = false;

    for (const project of projects) {
      const contexts = readProjectContexts(project);
      const filtered = contexts.filter(c => c.id !== contextId);

      if (filtered.length < contexts.length) {
        // Found and removed the context
        writeProjectContexts(project, filtered);
        deleted = true;
        break;
      }
    }

    if (deleted && mainWindow) {
      mainWindow.webContents.send('context-deleted', contextId);
    }

    event.reply(deleted ? 'delete-success' : 'delete-error');
  } catch (error) {
    console.error('Delete failed:', error);
    event.reply('delete-error');
  }
});

// Update context
ipcMain.handle('update-context', async (event, updatedContext) => {
  try {
    const projects = getAllProjects();
    let updated = false;
    const oldProject = updatedContext.project;
    const newProject = updatedContext.project;

    // First, try to find the context in its current project
    for (const project of projects) {
      const contexts = readProjectContexts(project);
      const contextIndex = contexts.findIndex(c => c.id === updatedContext.id);

      if (contextIndex !== -1) {
        // Found the context
        const oldContext = contexts[contextIndex];

        // Check if project changed
        if (oldContext.project !== newProject) {
          // Remove from old project
          contexts.splice(contextIndex, 1);
          writeProjectContexts(project, contexts);

          // Add to new project
          const newProjectContexts = readProjectContexts(newProject);
          newProjectContexts.push(updatedContext);
          writeProjectContexts(newProject, newProjectContexts);

          // Move screenshot file if needed
          if (updatedContext.type === 'screenshot' && updatedContext.screenshotPath) {
            const oldPath = updatedContext.screenshotPath;
            const filename = path.basename(oldPath);
            const newProjectDir = path.join(screenshotsDir, newProject);
            if (!fs.existsSync(newProjectDir)) {
              fs.mkdirSync(newProjectDir, { recursive: true });
            }
            const newPath = path.join(newProjectDir, filename);

            // Move the file
            if (fs.existsSync(oldPath)) {
              fs.renameSync(oldPath, newPath);
              updatedContext.screenshotPath = newPath;
            }

            // Update in new project contexts again with new path
            const finalContexts = readProjectContexts(newProject);
            const finalIndex = finalContexts.findIndex(c => c.id === updatedContext.id);
            if (finalIndex !== -1) {
              finalContexts[finalIndex] = updatedContext;
              writeProjectContexts(newProject, finalContexts);
            }
          }
        } else {
          // Same project, just update
          contexts[contextIndex] = updatedContext;
          writeProjectContexts(project, contexts);
        }

        updated = true;

        // Notify renderer
        if (mainWindow) {
          mainWindow.webContents.send('context-updated', updatedContext);
        }
        break;
      }
    }

    return { success: updated };
  } catch (error) {
    console.error('Update context error:', error);
    return { success: false, error: error.message };
  }
});

// Open chat window
ipcMain.on('open-chat', () => {
  createChatWindow();
});

// Open settings window
ipcMain.on('open-settings', () => {
  createSettingsWindow();
});

// Get config
ipcMain.handle('get-config', () => {
  const configFile = path.join(dataDir, 'config.json');
  if (fs.existsSync(configFile)) {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  }
  return {};
});

// Save config
ipcMain.handle('save-config', (event, config) => {
  const configFile = path.join(dataDir, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

  // Reset providers to force reinitialization
  claudeProvider = null;
  openaiProvider = null;

  return true;
});

// Handle AI chat
ipcMain.handle('ai-chat', async (event, { messages, provider, project, contextIds }) => {
  try {
    // Initialize providers if needed
    initializeAIProviders();

    // Get contexts
    let allContexts = [];
    if (project && project !== '__all__') {
      allContexts = readProjectContexts(project);
    } else {
      // Get all contexts from all projects
      const projects = getAllProjects();
      projects.forEach(proj => {
        const projContexts = readProjectContexts(proj);
        allContexts = allContexts.concat(projContexts);
      });
    }

    // Filter to only selected contexts if contextIds provided
    let contexts = allContexts;
    if (contextIds && contextIds.length > 0) {
      contexts = allContexts.filter(ctx => contextIds.includes(ctx.id));
    }

    console.log(`AI Chat: Using ${contexts.length} contexts (${contextIds?.length || 'all'} selected) from ${project || 'all projects'}`);

    let response;
    if (provider === 'claude') {
      if (!claudeProvider) {
        throw new Error('Claude API key not configured');
      }
      response = await claudeProvider.chat(messages, contexts);
    } else if (provider === 'openai') {
      if (!openaiProvider) {
        throw new Error('OpenAI API key not configured');
      }
      response = await openaiProvider.chat(messages, contexts);
    } else {
      throw new Error('Unknown provider');
    }

    return response;
  } catch (error) {
    console.error('AI chat error:', error);
    throw error;
  }
});

// Save chat response as a new context
// Save link context
ipcMain.handle('save-link', async (event, { url, project, note, tags }) => {
  try {
    console.log('Saving link:', url);

    // Fetch page title and summary
    let title = url;
    let summary = '';

    try {
      const https = require('https');
      const http = require('http');
      const urlModule = require('url');

      const parsedUrl = urlModule.parse(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timeout'));
        }, 5000);

        protocol.get(url, (res) => {
          let html = '';
          res.on('data', (chunk) => { html += chunk; });
          res.on('end', () => {
            clearTimeout(timeout);
            // Extract title from HTML
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) {
              title = titleMatch[1].trim();
            }
            resolve();
          });
        }).on('error', (err) => {
          clearTimeout(timeout);
          console.error('Fetch error:', err);
          resolve(); // Continue even if fetch fails
        });
      });
    } catch (fetchError) {
      console.error('Failed to fetch page info:', fetchError);
      // Continue with just the URL
    }

    const newContext = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      project: project || 'Unassigned',
      type: 'link',
      url: url,
      title: title,
      note: note || summary || '',
      tags: tags || ['link']
    };

    // Save to project-specific contexts.json
    const projectDir = path.join(__dirname, 'data', 'screenshots', newContext.project);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    const projectContextsFile = path.join(projectDir, 'contexts.json');
    let projectContexts = [];
    if (fs.existsSync(projectContextsFile)) {
      projectContexts = JSON.parse(fs.readFileSync(projectContextsFile, 'utf8'));
    }

    projectContexts.push(newContext);
    fs.writeFileSync(projectContextsFile, JSON.stringify(projectContexts, null, 2));

    console.log('Link saved successfully');
    return { success: true, context: newContext };
  } catch (error) {
    console.error('Save link error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-chat-as-context', async (event, { content, project, tags }) => {
  try {
    const newContext = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      project: project || 'AI Chat',
      tags: tags || ['ai-response'],
      note: 'AI Chat Response',
      type: 'text',
      screenshotPath: null,
      textContent: content
    };

    // Ensure project directory exists
    const projectDir = path.join(screenshotsDir, newContext.project);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Read existing contexts and add new one
    const contexts = readProjectContexts(newContext.project);
    contexts.push(newContext);

    // Write back to file
    writeProjectContexts(newContext.project, contexts);

    console.log(`Saved chat response as context in project: ${newContext.project}`);
    return { success: true, contextId: newContext.id };
  } catch (error) {
    console.error('Error saving chat as context:', error);
    throw error;
  }
});

// Analyze image and generate tags
ipcMain.handle('analyze-image', async (event, { imagePath, contextId }) => {
  try {
    initializeAIProviders();

    if (!claudeProvider) {
      throw new Error('Claude API key not configured. Please configure it in Settings.');
    }

    console.log(`Analyzing image: ${imagePath}`);
    const tags = await claudeProvider.analyzeImage(imagePath);
    console.log(`Generated tags:`, tags);

    // If contextId is provided, update the context with new tags
    if (contextId) {
      const projects = getAllProjects();
      for (const project of projects) {
        const contexts = readProjectContexts(project);
        const contextIndex = contexts.findIndex(c => c.id === contextId);
        if (contextIndex !== -1) {
          // Merge new tags with existing ones (avoid duplicates)
          const existingTags = contexts[contextIndex].tags || [];
          const uniqueTags = [...new Set([...existingTags, ...tags])];
          contexts[contextIndex].tags = uniqueTags;
          writeProjectContexts(project, contexts);

          // Notify renderer
          if (mainWindow) {
            mainWindow.webContents.send('context-updated', contexts[contextIndex]);
          }
          break;
        }
      }
    }

    return { success: true, tags };
  } catch (error) {
    console.error('Image analysis error:', error);
    return { success: false, error: error.message };
  }
});

// Describe image and generate text description
ipcMain.handle('describe-image', async (event, { imagePath, contextId }) => {
  try {
    initializeAIProviders();

    if (!claudeProvider) {
      throw new Error('Claude API key not configured. Please configure it in Settings.');
    }

    console.log(`Describing image: ${imagePath}`);
    const description = await claudeProvider.describeImage(imagePath);
    console.log(`Generated description:`, description);

    // If contextId is provided, update the context's note field
    if (contextId) {
      const projects = getAllProjects();
      for (const project of projects) {
        const contexts = readProjectContexts(project);
        const contextIndex = contexts.findIndex(c => c.id === contextId);
        if (contextIndex !== -1) {
          // Append to existing note or create new one
          const existingNote = contexts[contextIndex].note || '';
          if (existingNote) {
            // Add AI description as a new line
            contexts[contextIndex].note = `${existingNote}\n\n[AI]: ${description}`;
          } else {
            contexts[contextIndex].note = `[AI]: ${description}`;
          }
          writeProjectContexts(project, contexts);

          // Notify renderer
          if (mainWindow) {
            mainWindow.webContents.send('context-updated', contexts[contextIndex]);
          }
          break;
        }
      }
    }

    return { success: true, description };
  } catch (error) {
    console.error('Image description error:', error);
    return { success: false, error: error.message };
  }
});

// Generate note from image for new screenshot
ipcMain.handle('generate-note-from-image', async (event, imagePath) => {
  try {
    initializeAIProviders();

    if (!claudeProvider) {
      throw new Error('Claude API key not configured. Please configure it in Settings.');
    }

    console.log(`Generating note from image: ${imagePath}`);

    // Generate a concise note (1-2 sentences) describing the screenshot
    const note = await claudeProvider.generateImageNote(imagePath);
    console.log(`Generated note:`, note);

    return { success: true, note };
  } catch (error) {
    console.error('Generate note error:', error);
    return { success: false, error: error.message };
  }
});

// Initialize AI providers from environment variables or config file
function initializeAIProviders() {
  const configFile = path.join(dataDir, 'config.json');
  let config = {};

  // Try to load from config file
  if (fs.existsSync(configFile)) {
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  }

  // Initialize Claude
  const claudeKey = process.env.ANTHROPIC_API_KEY || config.claudeApiKey;
  if (claudeKey && !claudeProvider) {
    claudeProvider = new ClaudeProvider(claudeKey);
  }

  // Initialize OpenAI
  const openaiKey = process.env.OPENAI_API_KEY || config.openaiApiKey;
  if (openaiKey && !openaiProvider) {
    openaiProvider = new OpenAIProvider(openaiKey);
  }
}

// Copy file to external folder
const { dialog, shell } = require('electron');

ipcMain.handle('copy-file-to-folder', async (event, contextId) => {
  try {
    // Find context across all projects
    const projects = getAllProjects();
    let context = null;

    for (const project of projects) {
      const contexts = readProjectContexts(project);
      context = contexts.find(c => c.id === contextId);
      if (context) break;
    }

    if (!context) {
      throw new Error('Context not found');
    }

    let sourceFile;
    if (context.type === 'screenshot' && context.screenshotPath) {
      sourceFile = context.screenshotPath;
    } else if (context.type === 'text' && context.textContent) {
      // For text, create a temporary file
      const tempFile = path.join(dataDir, `text-${contextId}.txt`);
      fs.writeFileSync(tempFile, context.textContent, 'utf8');
      sourceFile = tempFile;
    } else {
      throw new Error('No file to copy');
    }

    if (!fs.existsSync(sourceFile)) {
      throw new Error('Source file not found');
    }

    // Open folder selection dialog
    const result = await dialog.showOpenDialog({
      title: 'Select destination folder',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      // Clean up temp file if created
      if (context.type === 'text') {
        fs.unlinkSync(sourceFile);
      }
      return { success: false, message: 'Cancelled' };
    }

    const destFolder = result.filePaths[0];
    const filename = path.basename(sourceFile);
    const destFile = path.join(destFolder, filename);

    // Copy file
    fs.copyFileSync(sourceFile, destFile);

    // Clean up temp file if created
    if (context.type === 'text') {
      fs.unlinkSync(sourceFile);
    }

    // Open the destination folder
    shell.showItemInFolder(destFile);

    return { success: true, destFile };
  } catch (error) {
    console.error('Copy file error:', error);
    throw error;
  }
});

// Move file to external folder
ipcMain.handle('move-file-to-folder', async (event, contextId) => {
  try {
    // Find context across all projects
    const projects = getAllProjects();
    let context = null;
    let contextProject = null;

    for (const project of projects) {
      const contexts = readProjectContexts(project);
      const foundIndex = contexts.findIndex(c => c.id === contextId);
      if (foundIndex !== -1) {
        context = contexts[foundIndex];
        contextProject = project;
        break;
      }
    }

    if (!context || !contextProject) {
      throw new Error('Context not found');
    }

    let sourceFile;
    if (context.type === 'screenshot' && context.screenshotPath) {
      sourceFile = context.screenshotPath;
    } else if (context.type === 'text' && context.textContent) {
      // For text, create a file
      const project = context.project || 'Unassigned';
      const projectDir = path.join(screenshotsDir, project);
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }
      const tempFile = path.join(projectDir, `text-${contextId}.txt`);
      fs.writeFileSync(tempFile, context.textContent, 'utf8');
      sourceFile = tempFile;
      context.screenshotPath = tempFile;
      context.type = 'text-file'; // Mark as text file
    } else {
      throw new Error('No file to move');
    }

    if (!fs.existsSync(sourceFile)) {
      throw new Error('Source file not found');
    }

    // Open folder selection dialog
    const result = await dialog.showOpenDialog({
      title: 'Select destination folder',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: 'Cancelled' };
    }

    const destFolder = result.filePaths[0];
    const filename = path.basename(sourceFile);
    const destFile = path.join(destFolder, filename);

    // Move file
    fs.renameSync(sourceFile, destFile);

    // Remove context from project's contexts.json
    const projectContexts = readProjectContexts(contextProject);
    const filtered = projectContexts.filter(c => c.id !== contextId);
    writeProjectContexts(contextProject, filtered);

    // Notify main window
    if (mainWindow) {
      mainWindow.webContents.send('context-deleted', contextId);
    }

    // Open the destination folder
    shell.showItemInFolder(destFile);

    return { success: true, destFile };
  } catch (error) {
    console.error('Move file error:', error);
    throw error;
  }
});

// Rename project (just rename folder - contexts.json is inside)
ipcMain.handle('rename-project', async (event, { oldName, newName }) => {
  try {
    if (!oldName || !newName || oldName === newName) {
      throw new Error('Invalid project names');
    }

    if (newName === '__all__' || newName === '__new__' || newName === 'Unassigned') {
      throw new Error('Reserved project name');
    }

    const oldProjectDir = path.join(screenshotsDir, oldName);
    const newProjectDir = path.join(screenshotsDir, newName);

    // Check if new project already exists
    if (fs.existsSync(newProjectDir)) {
      throw new Error('Project already exists');
    }

    // Check if old project exists
    if (!fs.existsSync(oldProjectDir)) {
      throw new Error('Project not found');
    }

    // Rename directory (contexts.json and screenshots move together)
    fs.renameSync(oldProjectDir, newProjectDir);

    // Update project field in the renamed contexts.json
    const contexts = readProjectContexts(newName);
    let updatedCount = 0;

    contexts.forEach(ctx => {
      if (ctx.project === oldName) {
        ctx.project = newName;

        // Update screenshot path if it's in the old folder
        if (ctx.screenshotPath && ctx.screenshotPath.includes(oldProjectDir)) {
          ctx.screenshotPath = ctx.screenshotPath.replace(oldProjectDir, newProjectDir);
        }

        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      writeProjectContexts(newName, contexts);
    }

    console.log(`Renamed project "${oldName}" to "${newName}" (${updatedCount} contexts updated)`);

    return { success: true, updatedCount };
  } catch (error) {
    console.error('Rename project error:', error);
    throw error;
  }
});

// 處理刪除 project
ipcMain.handle('delete-project', async (event, { projectName }) => {
  try {
    if (!projectName || projectName === '__all__' || projectName === '__new__') {
      throw new Error('Invalid project name');
    }

    const projectDir = path.join(screenshotsDir, projectName);
    const filesDir = path.join(__dirname, 'data', 'files', projectName);

    // Check if project exists
    if (!fs.existsSync(projectDir)) {
      throw new Error('Project not found');
    }

    // Count contexts before deletion
    const contexts = readProjectContexts(projectName);
    const contextCount = contexts.length;

    // Delete project directory
    fs.rmSync(projectDir, { recursive: true, force: true });

    // Delete files directory if it exists
    if (fs.existsSync(filesDir)) {
      fs.rmSync(filesDir, { recursive: true, force: true });
    }

    console.log(`Deleted project "${projectName}" (${contextCount} contexts removed)`);

    return { success: true, contextCount };
  } catch (error) {
    console.error('Delete project error:', error);
    throw error;
  }
});

// 獲取所有 projects
ipcMain.handle('get-all-projects', async () => {
  try {
    const projects = getAllProjects();
    return { success: true, projects };
  } catch (error) {
    console.error('Get all projects error:', error);
    throw error;
  }
});

// 處理創建 project
ipcMain.handle('create-project', async (event, { projectName }) => {
  try {
    if (!projectName || projectName.trim() === '') {
      throw new Error('Project name cannot be empty');
    }

    if (projectName === '__all__' || projectName === '__new__') {
      throw new Error('Invalid project name');
    }

    const projectDir = path.join(screenshotsDir, projectName);

    // Check if project already exists
    if (fs.existsSync(projectDir)) {
      throw new Error('Project already exists');
    }

    // Create project directory
    fs.mkdirSync(projectDir, { recursive: true });

    // Create empty contexts.json
    const contextsFile = path.join(projectDir, 'contexts.json');
    fs.writeFileSync(contextsFile, JSON.stringify([], null, 2));

    console.log(`Created project "${projectName}"`);

    return { success: true, projectName };
  } catch (error) {
    console.error('Create project error:', error);
    throw error;
  }
});

// 處理區域選擇
ipcMain.on('area-selected', async (event, data) => {
  try {
    const { sourcePath, crop } = data;

    // 隱藏選擇窗口
    if (selectionWindow) {
      selectionWindow.hide();
    }

    // 裁剪圖片
    const timestamp = Date.now();
    const filename = `screenshot-${timestamp}-cropped.png`;
    const croppedPath = path.join(tempScreenshotsDir, filename);

    await sharp(sourcePath)
      .extract({
        left: crop.x,
        top: crop.y,
        width: crop.width,
        height: crop.height
      })
      .toFile(croppedPath);

    // 刪除原始全螢幕截圖
    if (fs.existsSync(sourcePath)) {
      fs.unlinkSync(sourcePath);
    }

    // 設置當前截圖路徑
    currentScreenshotPath = croppedPath;
    currentClipboardText = null;
    captureType = 'screenshot';

    // 顯示輸入視窗
    if (!captureWindow) {
      createCaptureWindow();
    }

    // 讀取已有的 projects
    const allProjects = getAllProjects();

    captureWindow.webContents.send('capture-data', {
      type: 'screenshot',
      data: croppedPath,
      screenshotPath: croppedPath,
      projects: allProjects,
      currentProject: null
    });
    captureWindow.show();
    captureWindow.focus();

  } catch (error) {
    console.error('Area selection error:', error);
  }
});

// 處理取消選擇
ipcMain.on('cancel-selection', (event) => {
  try {
    // 隱藏選擇窗口
    if (selectionWindow) {
      selectionWindow.hide();
    }

    // 清理臨時文件
    if (currentScreenshotPath && fs.existsSync(currentScreenshotPath)) {
      fs.unlinkSync(currentScreenshotPath);
    }

    currentScreenshotPath = null;
  } catch (error) {
    console.error('Cancel selection error:', error);
  }
});

// 處理取消 capture（從 capture window）
ipcMain.on('cancel-capture', (event) => {
  try {
    console.log('Capture cancelled, cleaning up temp file...');

    // 清理當前的暫存檔案
    if (currentScreenshotPath && fs.existsSync(currentScreenshotPath)) {
      fs.unlinkSync(currentScreenshotPath);
      console.log('Deleted temp file:', currentScreenshotPath);
    }

    // 重置狀態
    currentScreenshotPath = null;
    currentClipboardText = null;
  } catch (error) {
    console.error('Cancel capture error:', error);
  }
});
}

app.whenReady().then(() => {
  // 啟動時清理 _temp 資料夾
  cleanupTempFolder();

  registerIpcHandlers();
  createMainWindow();
  registerGlobalShortcut();

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

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
