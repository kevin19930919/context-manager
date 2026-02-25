const { ipcRenderer } = require('electron');

const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const providerSelect = document.getElementById('providerSelect');
const projectSelect = document.getElementById('projectSelect');
const settingsBtn = document.getElementById('settingsBtn');
const contextsList = document.getElementById('contextsList');
const selectedCountEl = document.getElementById('selectedCount');
const totalCountEl = document.getElementById('totalCount');
const selectAllBtn = document.getElementById('selectAllBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const selectedContextsInfo = document.getElementById('selectedContextsInfo');

let messages = [];
let isThinking = false;
let allContexts = [];
let selectedContextIds = new Set();

// Auto-resize textarea
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = messageInput.scrollHeight + 'px';
});

// Send message on Enter (but allow Shift+Enter for newline)
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

// Settings button
settingsBtn.addEventListener('click', () => {
  ipcRenderer.send('open-settings');
});

async function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || isThinking) return;

  // Add user message
  messages.push({
    role: 'user',
    content,
    contextIds: Array.from(selectedContextIds)
  });
  renderMessages();

  // Clear input
  messageInput.value = '';
  messageInput.style.height = 'auto';

  // Show thinking indicator
  isThinking = true;
  sendBtn.disabled = true;
  showThinking();

  try {
    // Get selected contexts
    const selectedContexts = allContexts.filter(ctx => selectedContextIds.has(ctx.id));

    // Send to main process with selected contexts
    const response = await ipcRenderer.invoke('ai-chat', {
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      provider: providerSelect.value,
      project: projectSelect.value,
      contextIds: Array.from(selectedContextIds)
    });

    // Add assistant message
    messages.push({
      role: 'assistant',
      content: response,
      contextIds: Array.from(selectedContextIds)
    });
    renderMessages();
  } catch (error) {
    console.error('Chat error:', error);
    showError(error.message || 'Failed to get response');
  } finally {
    isThinking = false;
    sendBtn.disabled = false;
    hideThinking();
  }
}

function renderMessages() {
  messagesContainer.innerHTML = '';

  messages.forEach((msg, index) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = msg.role === 'user' ? '👤' : '🤖';

    const contentWrapper = document.createElement('div');
    contentWrapper.style.display = 'flex';
    contentWrapper.style.flexDirection = 'column';
    contentWrapper.style.gap = '8px';
    contentWrapper.style.maxWidth = '70%';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = msg.content;

    contentWrapper.appendChild(content);

    // Show context badges if contexts were used
    if (msg.contextIds && msg.contextIds.length > 0) {
      const contextBadges = document.createElement('div');
      contextBadges.style.display = 'flex';
      contextBadges.style.flexWrap = 'wrap';
      contextBadges.style.gap = '4px';
      contextBadges.style.marginTop = '4px';

      msg.contextIds.forEach(ctxId => {
        const ctx = allContexts.find(c => c.id === ctxId);
        if (ctx) {
          const badge = document.createElement('span');
          badge.className = 'context-badge';
          badge.textContent = `${ctx.type === 'screenshot' ? '📸' : '📝'} ${ctx.project}`;
          badge.title = ctx.note || 'Click to view';
          badge.onclick = () => viewContext(ctx);
          contextBadges.appendChild(badge);
        }
      });

      contentWrapper.appendChild(contextBadges);
    }

    // Add action buttons for assistant messages
    if (msg.role === 'assistant') {
      const actions = document.createElement('div');
      actions.className = 'message-actions';

      const saveBtn = document.createElement('button');
      saveBtn.className = 'message-action-btn';
      saveBtn.textContent = '💾 Save as Context';
      saveBtn.onclick = () => saveAsContext(msg.content);
      actions.appendChild(saveBtn);

      contentWrapper.appendChild(actions);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentWrapper);

    messagesContainer.appendChild(messageDiv);
  });

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showThinking() {
  const thinkingDiv = document.createElement('div');
  thinkingDiv.className = 'thinking active';
  thinkingDiv.id = 'thinkingIndicator';
  thinkingDiv.textContent = 'AI is thinking...';
  messagesContainer.appendChild(thinkingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideThinking() {
  const thinkingDiv = document.getElementById('thinkingIndicator');
  if (thinkingDiv) {
    thinkingDiv.remove();
  }
}

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error';
  errorDiv.textContent = `Error: ${message}`;
  messagesContainer.appendChild(errorDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

// Load contexts for the sidebar
async function loadContexts() {
  const project = projectSelect.value;
  allContexts = await ipcRenderer.invoke('get-contexts', { project });

  // Sort by timestamp (newest first)
  allContexts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  renderContextsList();
  updateSelectedCount();
}

// Render contexts in the sidebar
function renderContextsList() {
  contextsList.innerHTML = '';
  totalCountEl.textContent = allContexts.length;

  if (allContexts.length === 0) {
    contextsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999; font-size: 13px;">No contexts available</div>';
    return;
  }

  allContexts.forEach(ctx => {
    const item = document.createElement('div');
    item.className = 'context-item' + (selectedContextIds.has(ctx.id) ? ' selected' : '');
    item.onclick = (e) => {
      if (e.target.type !== 'checkbox') {
        toggleContext(ctx.id);
      }
    };

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'context-checkbox';
    checkbox.checked = selectedContextIds.has(ctx.id);
    checkbox.onchange = () => toggleContext(ctx.id);

    const info = document.createElement('div');
    info.className = 'context-info';

    const meta = document.createElement('div');
    meta.className = 'context-meta';
    const date = new Date(ctx.timestamp);
    meta.innerHTML = `
      <span>${ctx.type === 'screenshot' ? '📸' : '📝'}</span>
      <span>${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    `;

    const preview = document.createElement('div');
    preview.className = 'context-preview';
    if (ctx.type === 'text' && ctx.textContent) {
      preview.textContent = ctx.textContent.slice(0, 50) + (ctx.textContent.length > 50 ? '...' : '');
    } else if (ctx.note) {
      preview.textContent = ctx.note.slice(0, 50) + (ctx.note.length > 50 ? '...' : '');
    } else {
      preview.textContent = 'Screenshot';
    }

    info.appendChild(meta);
    info.appendChild(preview);

    if (ctx.tags && ctx.tags.length > 0) {
      const tags = document.createElement('div');
      tags.className = 'context-tags';
      tags.textContent = ctx.tags.join(', ');
      info.appendChild(tags);
    }

    item.appendChild(checkbox);
    item.appendChild(info);
    contextsList.appendChild(item);
  });
}

// Toggle context selection
function toggleContext(contextId) {
  if (selectedContextIds.has(contextId)) {
    selectedContextIds.delete(contextId);
  } else {
    selectedContextIds.add(contextId);
  }
  renderContextsList();
  updateSelectedCount();
  updateSelectedContextsInfo();
}

// Update selected count display
function updateSelectedCount() {
  selectedCountEl.textContent = selectedContextIds.size;
}

// Update selected contexts info bar
function updateSelectedContextsInfo() {
  if (selectedContextIds.size === 0) {
    selectedContextsInfo.innerHTML = '<span>💡 Select contexts from the left panel to include them in your conversation</span>';
  } else {
    selectedContextsInfo.innerHTML = `<span>✓ Using ${selectedContextIds.size} context${selectedContextIds.size > 1 ? 's' : ''} in conversation</span>`;
  }
}

// View context details
function viewContext(ctx) {
  alert(`Context Details:\n\nProject: ${ctx.project}\nType: ${ctx.type}\nTime: ${new Date(ctx.timestamp).toLocaleString()}\nTags: ${ctx.tags?.join(', ') || 'None'}\n\n${ctx.note || ''}\n\n${ctx.type === 'text' ? ctx.textContent : 'Screenshot: ' + ctx.screenshotPath}`);
}

// Save AI response as a new context
async function saveAsContext(content) {
  const project = projectSelect.value === '__all__' ? 'AI Chat' : projectSelect.value;

  try {
    await ipcRenderer.invoke('save-chat-as-context', {
      content,
      project,
      tags: ['ai-response', 'chat']
    });

    // Show success message
    const successDiv = document.createElement('div');
    successDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #4caf50; color: white; padding: 12px 20px; border-radius: 8px; z-index: 1000; font-size: 14px;';
    successDiv.textContent = '✓ Saved as context';
    document.body.appendChild(successDiv);

    setTimeout(() => successDiv.remove(), 3000);

    // Reload contexts
    await loadContexts();
  } catch (error) {
    showError('Failed to save as context: ' + error.message);
  }
}

// Load projects
async function loadProjects() {
  const contexts = await ipcRenderer.invoke('get-contexts');
  const projects = [...new Set(contexts.map(c => c.project).filter(p => p && p !== 'Unassigned'))].sort();

  projectSelect.innerHTML = '<option value="__all__">All Projects</option>';
  projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project;
    option.textContent = project;
    projectSelect.appendChild(option);
  });
}

// Select all contexts
selectAllBtn.addEventListener('click', () => {
  allContexts.forEach(ctx => selectedContextIds.add(ctx.id));
  renderContextsList();
  updateSelectedCount();
  updateSelectedContextsInfo();
});

// Clear all contexts
clearAllBtn.addEventListener('click', () => {
  selectedContextIds.clear();
  renderContextsList();
  updateSelectedCount();
  updateSelectedContextsInfo();
});

// Project changed - clear conversation and reload contexts
projectSelect.addEventListener('change', async () => {
  messages = [];
  selectedContextIds.clear();
  await loadContexts();

  messages.push({
    role: 'assistant',
    content: `Hello! I can help you with ${projectSelect.value === '__all__' ? 'all your contexts' : 'the "' + projectSelect.value + '" project'}. Ask me anything!`
  });
  renderMessages();
  updateSelectedContextsInfo();
});

// Initial message
window.addEventListener('DOMContentLoaded', async () => {
  await loadProjects();
  await loadContexts();

  messages.push({
    role: 'assistant',
    content: 'Hello! I can help you understand and organize your contexts. Select contexts from the left panel and ask me anything!'
  });
  renderMessages();
  updateSelectedContextsInfo();
  messageInput.focus();
});
