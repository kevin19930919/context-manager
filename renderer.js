const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt({
  html: false,        // 禁用 HTML 標籤（安全）
  breaks: true,       // 自動換行
  linkify: true       // 自動將 URL 轉為連結
});

const contextsList = document.getElementById('contextsList');
const emptyState = document.getElementById('emptyState');
const modal = document.getElementById('modal');
const modalImage = document.getElementById('modalImage');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const projectFilter = document.getElementById('projectFilter');
const projectHint = document.getElementById('projectHint');
const chatBtn = document.getElementById('chatBtn');
const searchInput = document.getElementById('searchInput');
const tagsFilter = document.getElementById('tagsFilter');
const tagsFilterList = document.getElementById('tagsFilterList');
const clearTagsFilter = document.getElementById('clearTagsFilter');
const typeFilter = document.getElementById('typeFilter');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editNote = document.getElementById('editNote');
const editTags = document.getElementById('editTags');
const editProject = document.getElementById('editProject');
const projectModal = document.getElementById('projectModal');
const projectForm = document.getElementById('projectForm');
const projectNameInput = document.getElementById('projectNameInput');
const projectModalTitle = document.getElementById('projectModalTitle');
const linkInput = document.getElementById('linkInput');
const saveLinkBtn = document.getElementById('saveLinkBtn');
const currentProjectDisplay = document.getElementById('currentProjectDisplay');
const manageProjectsBtn = document.getElementById('manageProjectsBtn');
const manageProjectsModal = document.getElementById('manageProjectsModal');
const projectsList = document.getElementById('projectsList');
const createNewProjectBtn = document.getElementById('createNewProjectBtn');

let contexts = [];
let currentEditingContext = null;
let projectModalMode = 'new'; // 'new' or 'rename'
let projectModalOldName = null;
let currentProject = null; // 用於上傳的 project
let viewProject = '__all__'; // 用於查看/篩選的 project
let currentSearchQuery = '';
let currentTagsFilter = new Set();
let currentTypeFilter = 'all';
let currentDateFrom = null;
let currentDateTo = null;

// 取得所有 projects（從後端）
async function getAllProjects() {
  try {
    const result = await ipcRenderer.invoke('get-all-projects');
    return result.projects || [];
  } catch (error) {
    console.error('Failed to get projects:', error);
    return [];
  }
}

// 載入所有 contexts
async function loadContexts() {
  // Initialize viewProject from localStorage on first load
  if (!viewProject || viewProject === null) {
    viewProject = localStorage.getItem('viewProject') || '__all__';
  }

  contexts = await ipcRenderer.invoke('get-contexts', {
    project: viewProject,
    limit: viewProject === '__all__' ? true : false
  });
  await updateProjectFilter();
  updateTagsFilter();
  renderContexts();
}

// 更新 project 過濾器選單和顯示
async function updateProjectFilter() {
  const projects = await getAllProjects();

  // 更新下拉選單（只用於查看/篩選）
  projectFilter.innerHTML = '';

  // 1. 先顯示當前選擇的 project（在最上方）
  if (viewProject === '__all__') {
    const currentOption = document.createElement('option');
    currentOption.value = '__all__';
    currentOption.textContent = '📋 All Projects (Current)';
    projectFilter.appendChild(currentOption);
  } else {
    const currentOption = document.createElement('option');
    currentOption.value = viewProject;
    currentOption.textContent = `📁 ${viewProject} (Current)`;
    projectFilter.appendChild(currentOption);
  }

  // 2. 分隔線
  const separator = document.createElement('option');
  separator.disabled = true;
  separator.textContent = '──────────────────';
  projectFilter.appendChild(separator);

  // 3. All Projects 選項（如果當前不是 All Projects）
  if (viewProject !== '__all__') {
    const allProjectsOption = document.createElement('option');
    allProjectsOption.value = '__all__';
    allProjectsOption.textContent = '📋 All Projects';
    projectFilter.appendChild(allProjectsOption);
  }

  // 4. 其他所有 projects（排除當前選擇的）
  projects.forEach(project => {
    if (project !== viewProject) {
      const option = document.createElement('option');
      option.value = project;
      option.textContent = `📁 ${project}`;
      projectFilter.appendChild(option);
    }
  });

  // 從 localStorage 讀取上次的選擇（只在第一次載入時）
  if (currentProject === null) {
    let lastCurrentProject = localStorage.getItem('currentProject');

    // 設定 currentProject（用於上傳）
    if (lastCurrentProject && projects.includes(lastCurrentProject)) {
      currentProject = lastCurrentProject;
    } else if (projects.length > 0) {
      currentProject = projects[0];
    } else {
      currentProject = null;
    }
  }

  // 確保 currentProject 仍然存在
  if (currentProject && !projects.includes(currentProject)) {
    currentProject = projects.length > 0 ? projects[0] : null;
  }

  // 確保 viewProject 仍然有效
  if (viewProject !== '__all__' && !projects.includes(viewProject)) {
    viewProject = '__all__';
  }

  // Update UI
  projectFilter.value = viewProject;
  updateCurrentProjectDisplay();
  updateUIForProjectSelection();
}

// 更新「當前 Project」顯示
function updateCurrentProjectDisplay() {
  if (currentProject) {
    currentProjectDisplay.textContent = `📁 ${currentProject}`;
    currentProjectDisplay.style.background = '#3b82f6';
  } else {
    currentProjectDisplay.textContent = '⚠️ No Project';
    currentProjectDisplay.style.background = '#ef4444';
  }
}

// 更新標籤篩選器
function updateTagsFilter() {
  // 收集所有 tags 和計數
  const tagCounts = {};
  contexts.forEach(ctx => {
    if (ctx.tags && ctx.tags.length > 0) {
      ctx.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });

  const tags = Object.keys(tagCounts).sort();

  if (tags.length === 0) {
    tagsFilter.style.display = 'none';
    return;
  }

  tagsFilter.style.display = 'block';
  tagsFilterList.innerHTML = '';

  tags.forEach(tag => {
    const tagEl = document.createElement('span');
    tagEl.className = 'filter-tag';
    if (currentTagsFilter.has(tag)) {
      tagEl.classList.add('active');
    }
    tagEl.innerHTML = `${tag} <span class="count">(${tagCounts[tag]})</span>`;
    tagEl.onclick = () => toggleTagFilter(tag);
    tagsFilterList.appendChild(tagEl);
  });
}

// 切換標籤篩選
function toggleTagFilter(tag) {
  if (currentTagsFilter.has(tag)) {
    currentTagsFilter.delete(tag);
  } else {
    currentTagsFilter.add(tag);
  }
  updateTagsFilter();
  renderContexts();
}

// 渲染 contexts
function renderContexts() {
  // 根據過濾器篩選 contexts
  let filteredContexts = contexts;

  // Project filter (for viewing)
  if (viewProject !== '__all__') {
    filteredContexts = filteredContexts.filter(c => c.project === viewProject);
  }

  // Search filter
  if (currentSearchQuery.trim()) {
    const keywords = currentSearchQuery.toLowerCase().split(/\s+/).filter(k => k);
    filteredContexts = filteredContexts.filter(ctx => {
      const searchText = [
        ctx.note || '',
        ctx.textContent || '',
        ...(ctx.tags || [])
      ].join(' ').toLowerCase();

      return keywords.every(keyword => searchText.includes(keyword));
    });
  }

  // Tags filter
  if (currentTagsFilter.size > 0) {
    filteredContexts = filteredContexts.filter(ctx => {
      if (!ctx.tags || ctx.tags.length === 0) return false;
      return Array.from(currentTagsFilter).every(tag => ctx.tags.includes(tag));
    });
  }

  // Type filter
  if (currentTypeFilter !== 'all') {
    filteredContexts = filteredContexts.filter(ctx => ctx.type === currentTypeFilter);
  }

  // Date range filter
  if (currentDateFrom) {
    const fromDate = new Date(currentDateFrom);
    fromDate.setHours(0, 0, 0, 0);
    filteredContexts = filteredContexts.filter(ctx => {
      const ctxDate = new Date(ctx.timestamp);
      return ctxDate >= fromDate;
    });
  }
  if (currentDateTo) {
    const toDate = new Date(currentDateTo);
    toDate.setHours(23, 59, 59, 999);
    filteredContexts = filteredContexts.filter(ctx => {
      const ctxDate = new Date(ctx.timestamp);
      return ctxDate <= toDate;
    });
  }

  if (filteredContexts.length === 0) {
    contextsList.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  contextsList.style.display = 'block';
  emptyState.style.display = 'none';

  // 按 project 分組
  const grouped = {};
  filteredContexts.forEach(ctx => {
    const project = ctx.project || 'Unassigned';
    if (!grouped[project]) {
      grouped[project] = [];
    }
    grouped[project].push(ctx);
  });

  // 渲染
  contextsList.innerHTML = '';
  Object.keys(grouped).sort().forEach(project => {
    const projectDiv = document.createElement('div');
    projectDiv.className = 'project-group';

    const header = document.createElement('div');
    header.className = 'project-header';
    header.textContent = `📁 ${project} (${grouped[project].length})`;
    projectDiv.appendChild(header);

    grouped[project]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .forEach(ctx => {
        const item = createContextItem(ctx);
        projectDiv.appendChild(item);
      });

    contextsList.appendChild(projectDiv);
  });
}

// 建立單個 context item
function createContextItem(ctx) {
  const item = document.createElement('div');
  item.className = 'context-item';

  // Thumbnail
  const thumbnail = document.createElement('div');
  thumbnail.className = 'context-thumbnail';

  if (ctx.type === 'screenshot' && ctx.screenshotPath && fs.existsSync(ctx.screenshotPath)) {
    // Show image thumbnail
    const img = document.createElement('img');
    img.src = ctx.screenshotPath;
    img.alt = 'Screenshot thumbnail';
    thumbnail.appendChild(img);
  } else {
    // Show icon placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'context-thumbnail-placeholder';

    // Determine icon based on type and file extension
    let icon = '📝';
    if (ctx.type === 'screenshot') {
      icon = '📸';
    } else if (ctx.type === 'link') {
      icon = '🔗';
    } else if (ctx.type === 'file' || ctx.type === 'text-file') {
      const ext = ctx.fileName ? path.extname(ctx.fileName).toLowerCase() : '';
      const fileIcons = {
        '.pdf': '📄',
        '.txt': '📝',
        '.md': '📝',
        '.doc': '📄',
        '.docx': '📄',
        '.json': '📋',
        '.csv': '📊',
        '.xml': '📋',
        '.zip': '📦',
        '.rar': '📦',
        '.7z': '📦'
      };
      icon = fileIcons[ext] || '📎';
    }

    placeholder.textContent = icon;
    thumbnail.appendChild(placeholder);
  }

  item.appendChild(thumbnail);

  const main = document.createElement('div');
  main.className = 'context-main';

  // 時間 + 類型標誌
  const time = document.createElement('div');
  time.className = 'context-time';
  // 根據類型選擇圖標
  const typeIcons = {
    'text': '📝',
    'discussion': '💬',
    'decision': '🎯',
    'problem-solution': '🐛',
    'api-design': '🔌',
    'screenshot': '📸',
    'text-file': '📄',
    'file': '📎',
    'link': '🔗'
  };
  const typeIcon = typeIcons[ctx.type] || (ctx.screenshotPath ? '📸' : '📝');
  time.textContent = `${typeIcon} ${formatTime(ctx.timestamp)}`;
  main.appendChild(time);

  // 連結資訊 (for link types)
  if (ctx.type === 'link' && ctx.url) {
    const linkInfo = document.createElement('div');
    linkInfo.className = 'context-note';
    linkInfo.style.fontWeight = '500';
    linkInfo.style.color = '#2563eb';

    const linkTitle = ctx.title || ctx.url;
    const displayTitle = linkTitle.length > 80 ? linkTitle.substring(0, 80) + '...' : linkTitle;

    linkInfo.innerHTML = `🔗 <a href="${ctx.url}" onclick="require('electron').shell.openExternal('${ctx.url.replace(/'/g, "\\'")}'); return false;" style="color: #2563eb; text-decoration: none;">${escapeHtml(displayTitle)}</a>`;
    main.appendChild(linkInfo);

    // Show URL if different from title
    if (ctx.title && ctx.title !== ctx.url) {
      const urlInfo = document.createElement('div');
      urlInfo.className = 'context-note';
      urlInfo.style.fontSize = '12px';
      urlInfo.style.color = '#6b7280';
      const displayUrl = ctx.url.length > 60 ? ctx.url.substring(0, 60) + '...' : ctx.url;
      urlInfo.textContent = displayUrl;
      main.appendChild(urlInfo);
    }
  }

  // 檔案資訊 (for file types)
  if ((ctx.type === 'file' || ctx.type === 'text-file') && ctx.fileName) {
    const fileInfo = document.createElement('div');
    fileInfo.className = 'context-note';
    fileInfo.style.fontWeight = '500';
    fileInfo.style.color = '#333';

    let sizeStr = '';
    if (ctx.fileSize) {
      const kb = (ctx.fileSize / 1024).toFixed(1);
      const mb = (ctx.fileSize / 1024 / 1024).toFixed(2);
      sizeStr = ctx.fileSize > 1024 * 1024 ? ` (${mb} MB)` : ` (${kb} KB)`;
    }

    fileInfo.textContent = `📎 ${ctx.fileName}${sizeStr}`;
    main.appendChild(fileInfo);
  }

  // 文字內容預覽（如果有文字內容）
  if (ctx.textContent) {
    const textPreview = document.createElement('div');
    textPreview.className = 'context-note';

    // 對於結構化類型，嘗試提取摘要
    let previewText = ctx.textContent;
    const structuredTypes = ['discussion', 'decision', 'problem-solution', 'api-design'];

    if (structuredTypes.includes(ctx.type)) {
      try {
        const data = JSON.parse(ctx.textContent);
        // 根據類型提取最相關的預覽內容
        if (data.summary) previewText = data.summary;
        else if (data.decision) previewText = data.decision;
        else if (data.problem) previewText = data.problem;
        else if (data.description) previewText = data.description;
      } catch (e) {
        // 解析失敗，使用原始文字
      }
    }

    const truncated = previewText.length > 150
      ? previewText.substring(0, 150) + '...'
      : previewText;
    textPreview.textContent = truncated;
    textPreview.style.fontStyle = 'italic';
    textPreview.style.color = '#555';
    main.appendChild(textPreview);
  }

  // Note
  if (ctx.note) {
    const note = document.createElement('div');
    note.className = 'context-note markdown-content';
    note.innerHTML = renderMarkdown(ctx.note);
    main.appendChild(note);
  }

  // Tags
  if (ctx.tags && ctx.tags.length > 0) {
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'context-tags';
    ctx.tags.forEach(tag => {
      const tagSpan = document.createElement('span');
      tagSpan.className = 'tag';
      tagSpan.textContent = tag;
      tagsDiv.appendChild(tagSpan);
    });
    main.appendChild(tagsDiv);
  }

  item.appendChild(main);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'context-actions';

  const viewBtn = document.createElement('button');
  viewBtn.className = 'btn-action';
  viewBtn.textContent = 'View';
  viewBtn.onclick = (e) => {
    e.stopPropagation();
    openModal(ctx);
  };
  actions.appendChild(viewBtn);

  // Edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'btn-action';
  editBtn.textContent = '✏️ Edit';
  editBtn.title = 'Edit note, tags, and project';
  editBtn.onclick = (e) => {
    e.stopPropagation();
    openEditModal(ctx);
  };
  actions.appendChild(editBtn);

  // AI Analyze button (only for screenshots)
  if (ctx.type === 'screenshot' && ctx.screenshotPath) {
    const aiBtn = document.createElement('button');
    aiBtn.className = 'btn-action';
    aiBtn.textContent = '🤖 AI Tags';
    aiBtn.title = 'Analyze image and generate tags using AI';
    aiBtn.onclick = async (e) => {
      e.stopPropagation();
      aiBtn.disabled = true;
      aiBtn.textContent = '⏳ Analyzing...';
      try {
        const result = await ipcRenderer.invoke('analyze-image', {
          imagePath: ctx.screenshotPath,
          contextId: ctx.id
        });
        if (result.success) {
          alert(`AI generated tags: ${result.tags.join(', ')}\n\nTags have been added to this context.`);
          // Reload contexts to show updated tags
          await loadContexts();
        } else {
          alert(`AI analysis failed: ${result.error}`);
        }
      } catch (error) {
        alert(`AI analysis failed: ${error.message}`);
      } finally {
        aiBtn.disabled = false;
        aiBtn.textContent = '🤖 AI Tags';
      }
    };
    actions.appendChild(aiBtn);

    // AI Describe button
    const describeBtn = document.createElement('button');
    describeBtn.className = 'btn-action';
    describeBtn.textContent = '📝 AI Describe';
    describeBtn.title = 'Generate a text description of this image using AI';
    describeBtn.onclick = async (e) => {
      e.stopPropagation();
      describeBtn.disabled = true;
      describeBtn.textContent = '⏳ Describing...';
      try {
        const result = await ipcRenderer.invoke('describe-image', {
          imagePath: ctx.screenshotPath,
          contextId: ctx.id
        });
        if (result.success) {
          alert(`AI Description:\n\n${result.description}\n\nDescription has been added to the note.`);
          // Reload contexts to show updated note
          await loadContexts();
        } else {
          alert(`AI description failed: ${result.error}`);
        }
      } catch (error) {
        alert(`AI description failed: ${error.message}`);
      } finally {
        describeBtn.disabled = false;
        describeBtn.textContent = '📝 AI Describe';
      }
    };
    actions.appendChild(describeBtn);
  }

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-action';
  copyBtn.textContent = 'Copy';
  copyBtn.title = 'Copy to external folder';
  copyBtn.onclick = async (e) => {
    e.stopPropagation();
    try {
      const result = await ipcRenderer.invoke('copy-file-to-folder', ctx.id);
      if (result.success) {
        alert(`File copied to ${result.destFile}`);
      }
    } catch (error) {
      alert(`Copy failed: ${error.message}`);
    }
  };
  actions.appendChild(copyBtn);

  const moveBtn = document.createElement('button');
  moveBtn.className = 'btn-action';
  moveBtn.textContent = 'Move';
  moveBtn.title = 'Move to external folder (removes from context)';
  moveBtn.onclick = async (e) => {
    e.stopPropagation();
    if (confirm('Move this file to external folder? This will remove it from context manager.')) {
      try {
        const result = await ipcRenderer.invoke('move-file-to-folder', ctx.id);
        if (result.success) {
          alert(`File moved to ${result.destFile}`);
        }
      } catch (error) {
        alert(`Move failed: ${error.message}`);
      }
    }
  };
  actions.appendChild(moveBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-action btn-delete';
  deleteBtn.textContent = 'Delete';
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm('Delete this context?')) {
      ipcRenderer.send('delete-context', ctx.id);
    }
  };
  actions.appendChild(deleteBtn);

  item.appendChild(actions);

  // 點擊整個項目也可以查看
  item.onclick = () => {
    openModal(ctx);
  };

  return item;
}

// 格式化時間
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) {
    const minutes = Math.floor(diff / (1000 * 60));
    return `${minutes} minutes ago`;
  } else if (hours < 24) {
    return `${hours} hours ago`;
  } else {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

// 格式化結構化內容以便顯示
function formatStructuredContent(type, data) {
  let html = '';

  if (type === 'discussion') {
    html += `<div style="margin-bottom: 20px;">`;
    html += `<h2 style="color: #2c3e50; margin-bottom: 10px;">💬 ${escapeHtml(data.topic)}</h2>`;
    html += `<div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 15px;">`;
    html += `<strong>摘要：</strong><br><div class="markdown-content">${renderMarkdown(data.summary)}</div>`;
    html += `</div>`;
    if (data.details) {
      html += `<div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 15px;">`;
      html += `<strong>詳細內容：</strong><br><div class="markdown-content">${renderMarkdown(data.details)}</div>`;
      html += `</div>`;
    }
    if (data.participants && data.participants.length > 0) {
      html += `<div style="margin-top: 10px; color: #666;">`;
      html += `<strong>參與者：</strong> ${data.participants.map(p => escapeHtml(p)).join(', ')}`;
      html += `</div>`;
    }
    html += `</div>`;
  } else if (type === 'decision') {
    html += `<div style="margin-bottom: 20px;">`;
    html += `<h2 style="color: #2c3e50; margin-bottom: 10px;">🎯 ${escapeHtml(data.title)}</h2>`;
    html += `<div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 15px;">`;
    html += `<strong>背景：</strong><br><div class="markdown-content">${renderMarkdown(data.context)}</div>`;
    html += `</div>`;
    html += `<div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 15px;">`;
    html += `<strong>決策：</strong><br><div class="markdown-content">${renderMarkdown(data.decision)}</div>`;
    html += `</div>`;
    if (data.consequences) {
      html += `<div style="background: #f3e5f5; padding: 15px; border-radius: 8px; margin-bottom: 15px;">`;
      html += `<strong>影響：</strong><br><div class="markdown-content">${renderMarkdown(data.consequences)}</div>`;
      html += `</div>`;
    }
    if (data.alternatives && data.alternatives.length > 0) {
      html += `<div style="background: #fce4ec; padding: 15px; border-radius: 8px;">`;
      html += `<strong>替代方案：</strong><ul style="margin: 5px 0 0 20px;">`;
      data.alternatives.forEach(alt => {
        html += `<li>${escapeHtml(alt)}</li>`;
      });
      html += `</ul></div>`;
    }
    html += `</div>`;
  } else if (type === 'problem-solution') {
    html += `<div style="margin-bottom: 20px;">`;
    html += `<h2 style="color: #2c3e50; margin-bottom: 10px;">🐛 問題 & 解決方案</h2>`;
    html += `<div style="background: #ffebee; padding: 15px; border-radius: 8px; margin-bottom: 15px;">`;
    html += `<strong>問題：</strong><br><div class="markdown-content">${renderMarkdown(data.problem)}</div>`;
    html += `</div>`;
    if (data.root_cause) {
      html += `<div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 15px;">`;
      html += `<strong>根本原因：</strong><br><div class="markdown-content">${renderMarkdown(data.root_cause)}</div>`;
      html += `</div>`;
    }
    html += `<div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 15px;">`;
    html += `<strong>解決方案：</strong><br><div class="markdown-content">${renderMarkdown(data.solution)}</div>`;
    html += `</div>`;
    if (data.prevention) {
      html += `<div style="background: #e3f2fd; padding: 15px; border-radius: 8px;">`;
      html += `<strong>預防措施：</strong><br><div class="markdown-content">${renderMarkdown(data.prevention)}</div>`;
      html += `</div>`;
    }
    html += `</div>`;
  } else if (type === 'api-design') {
    html += `<div style="margin-bottom: 20px;">`;
    html += `<h2 style="color: #2c3e50; margin-bottom: 10px;">🔌 ${escapeHtml(data.name)}</h2>`;
    html += `<div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 15px;">`;
    html += `<strong>描述：</strong><br><div class="markdown-content">${renderMarkdown(data.description)}</div>`;
    html += `</div>`;
    if (data.parameters && Object.keys(data.parameters).length > 0) {
      html += `<div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 15px;">`;
      html += `<strong>參數：</strong><ul style="margin: 5px 0 0 20px;">`;
      for (const [param, desc] of Object.entries(data.parameters)) {
        html += `<li><code>${escapeHtml(param)}</code>: <div class="markdown-content" style="display: inline;">${renderMarkdown(desc)}</div></li>`;
      }
      html += `</ul></div>`;
    }
    if (data.returns) {
      html += `<div style="background: #f3e5f5; padding: 15px; border-radius: 8px; margin-bottom: 15px;">`;
      html += `<strong>返回值：</strong><br><div class="markdown-content">${renderMarkdown(data.returns)}</div>`;
      html += `</div>`;
    }
    if (data.examples && data.examples.length > 0) {
      html += `<div style="background: #f5f5f5; padding: 15px; border-radius: 8px;">`;
      html += `<strong>範例：</strong><pre style="margin: 5px 0 0 0; overflow-x: auto;">`;
      data.examples.forEach(ex => {
        html += `${escapeHtml(ex)}\n`;
      });
      html += `</pre></div>`;
    }
    html += `</div>`;
  }

  return html;
}

// 開啟內容 modal（截圖或文字）
function openModal(ctx) {
  console.log('Opening modal for context:', ctx);

  // 優先處理截圖類型
  if (ctx.type === 'screenshot' && ctx.screenshotPath) {
    let screenshotPath = ctx.screenshotPath;

    // Auto-fix common path issues
    // Fix: "/PersonalBusiness/ context-manager/" -> "/PersonalBusiness/context-manager/"
    screenshotPath = screenshotPath.replace(/PersonalBusiness\/\s+context-manager/g, 'PersonalBusiness/context-manager');

    console.log('Screenshot path:', screenshotPath);
    console.log('File exists:', fs.existsSync(screenshotPath));

    if (fs.existsSync(screenshotPath)) {
      // 顯示截圖
      const modalContent = modal.querySelector('.modal-content');
      modalContent.innerHTML = `
        <button class="modal-close" onclick="closeModal()">Close (ESC)</button>
        <img class="modal-image" src="${screenshotPath}" alt="Screenshot">
      `;
      modal.classList.add('active');
      return;
    } else {
      alert('Screenshot file not found: ' + screenshotPath);
      return;
    }
  }

  // 處理連結類型
  if (ctx.type === 'link' && ctx.url) {
    const modalContent = modal.querySelector('.modal-content');
    const displayTitle = ctx.title || ctx.url;

    modalContent.innerHTML = `
      <button class="modal-close" onclick="closeModal()">Close (ESC)</button>
      <div style="padding: 30px;">
        <div style="font-size: 48px; text-align: center; margin-bottom: 20px;">🔗</div>
        <div style="font-size: 20px; font-weight: bold; margin-bottom: 15px; text-align: center;">${escapeHtml(displayTitle)}</div>
        <div style="color: #6b7280; margin-bottom: 25px; text-align: center; word-break: break-all;">
          <a href="${ctx.url}" onclick="require('electron').shell.openExternal('${ctx.url.replace(/'/g, "\\'")}'); return false;" style="color: #2563eb; text-decoration: none;">${escapeHtml(ctx.url)}</a>
        </div>
        ${ctx.note ? `<div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <div style="font-weight: bold; margin-bottom: 8px; color: #374151;">Note:</div>
          <div style="color: #6b7280; line-height: 1.6;">${escapeHtml(ctx.note)}</div>
        </div>` : ''}
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button onclick="require('electron').shell.openExternal('${ctx.url.replace(/'/g, "\\'")}'); return false;"
                  style="background: #2563eb; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 500;">
            🌐 Open in Browser
          </button>
          <button onclick="navigator.clipboard.writeText('${ctx.url.replace(/'/g, "\\'")}'); this.textContent='✅ Copied!'; setTimeout(() => this.textContent='📋 Copy URL', 2000);"
                  style="background: #e5e7eb; color: #374151; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 500;">
            📋 Copy URL
          </button>
        </div>
      </div>
    `;
    modal.classList.add('active');
    return;
  }

  // 處理一般檔案類型
  if ((ctx.type === 'file' || ctx.type === 'text-file') && ctx.filePath) {
    let filePath = ctx.filePath;

    // Auto-fix common path issues
    filePath = filePath.replace(/PersonalBusiness\/\s+context-manager/g, 'PersonalBusiness/context-manager');

    if (fs.existsSync(filePath)) {
      const modalContent = modal.querySelector('.modal-content');
      const fileExt = path.extname(ctx.fileName).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(fileExt);

      if (isImage) {
        // 圖片檔案，顯示圖片
        modalContent.innerHTML = `
          <button class="modal-close" onclick="closeModal()">Close (ESC)</button>
          <img class="modal-image" src="${filePath}" alt="${ctx.fileName}">
        `;
      } else {
        // 其他檔案，顯示資訊和開啟按鈕
        const fileSizeStr = ctx.fileSize ? formatFileSize(ctx.fileSize) : 'Unknown size';
        const hasTextContent = !!ctx.textContent;

        let contentHtml = '';
        if (hasTextContent && ctx.textContent.length < 50000) {
          // 檢查是否為 CSV 檔案
          const isCSV = (ctx.fileName && ctx.fileName.toLowerCase().endsWith('.csv')) ||
                        (ctx.filePath && ctx.filePath.toLowerCase().endsWith('.csv')) ||
                        (ctx.fileType === 'text/csv');

          console.log('File preview CSV check:', { fileName: ctx.fileName, filePath: ctx.filePath, fileType: ctx.fileType, isCSV });

          let previewContent = '';
          if (isCSV) {
            // 如果是 CSV，渲染為表格
            previewContent = renderCSV(ctx.textContent);
          } else if (fileExt === '.md') {
            // 如果是 markdown，渲染 markdown
            previewContent = renderMarkdown(ctx.textContent);
          } else {
            // 其他文字檔案，顯示純文字預覽
            const preview = escapeHtml(ctx.textContent.substring(0, 5000));
            previewContent = `<pre style="white-space: pre-wrap; font-size: 13px; font-family: 'Menlo', 'Monaco', monospace; margin: 0;">${preview}</pre>
              ${ctx.textContent.length > 5000 ? '<div style="margin-top: 10px; color: #999;">... (truncated)</div>' : ''}`;
          }

          contentHtml = `
            <div style="margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px; max-height: 400px; overflow-y: auto;">
              <div style="font-weight: bold; margin-bottom: 10px; color: #666;">Preview:</div>
              ${previewContent}
            </div>
          `;
        }

        modalContent.innerHTML = `
          <button class="modal-close" onclick="closeModal()">Close (ESC)</button>
          <div style="padding: 20px;">
            <div style="font-size: 24px; margin-bottom: 10px;">📎</div>
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">${escapeHtml(ctx.fileName)}</div>
            <div style="color: #666; margin-bottom: 20px;">
              Size: ${fileSizeStr}<br>
              Type: ${ctx.fileType || 'Unknown'}<br>
              Path: <code style="font-size: 12px; background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${escapeHtml(filePath)}</code>
            </div>
            <button onclick="require('electron').shell.openPath('${filePath.replace(/'/g, "\\'")}'); return false;"
                    style="background: #007AFF; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500;">
              Open File
            </button>
            ${contentHtml}
          </div>
        `;
      }
      modal.classList.add('active');
      return;
    } else {
      alert('File not found: ' + filePath);
      return;
    }
  }

  // 處理文字內容
  if (ctx.textContent) {
    // 顯示文字內容（包括 text, discussion, decision, problem-solution, api-design 等類型）
    const modalContent = modal.querySelector('.modal-content');

    // 嘗試解析並美化顯示結構化內容
    let displayContent = ctx.textContent;
    const structuredTypes = ['discussion', 'decision', 'problem-solution', 'api-design'];

    if (structuredTypes.includes(ctx.type)) {
      try {
        const data = JSON.parse(ctx.textContent);
        displayContent = formatStructuredContent(ctx.type, data);
      } catch (e) {
        // 如果解析失敗，使用 markdown 渲染
        displayContent = renderMarkdown(ctx.textContent);
      }
    } else {
      // 檢查是否為 CSV 檔案（多種方式檢查）
      const isCSV = (ctx.fileName && ctx.fileName.toLowerCase().endsWith('.csv')) ||
                    (ctx.filePath && ctx.filePath.toLowerCase().endsWith('.csv')) ||
                    (ctx.fileType === 'text/csv');

      console.log('CSV check:', { fileName: ctx.fileName, filePath: ctx.filePath, fileType: ctx.fileType, isCSV });

      if (isCSV) {
        displayContent = renderCSV(ctx.textContent);
      } else {
        displayContent = renderMarkdown(ctx.textContent);
      }
    }

    modalContent.innerHTML = `
      <button class="modal-close" onclick="closeModal()">Close (ESC)</button>
      <div class="markdown-content" style="line-height: 1.6; font-size: 14px; color: #333;">${displayContent}</div>
    `;
    modal.classList.add('active');
  } else {
    console.error('No content found for context:', ctx);
    alert('Content not found - type: ' + ctx.type + ', has screenshotPath: ' + !!ctx.screenshotPath + ', has textContent: ' + !!ctx.textContent + ', has filePath: ' + !!ctx.filePath);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(text) {
  if (!text) return '';
  try {
    return md.render(text);
  } catch (error) {
    console.error('Markdown parsing error:', error);
    return escapeHtml(text);
  }
}

function renderCSV(text) {
  if (!text) return '';
  try {
    // 簡單的 CSV 解析
    const lines = text.trim().split('\n');
    if (lines.length === 0) return escapeHtml(text);

    let html = '<div style="overflow-x: auto;"><table class="csv-table" style="border-collapse: collapse; width: 100%; margin: 10px 0;">';

    lines.forEach((line, index) => {
      // 簡單的 CSV 解析（處理逗號分隔）
      const cells = line.split(',').map(cell => cell.trim());

      if (index === 0) {
        // 第一行作為標題
        html += '<thead><tr>';
        cells.forEach(cell => {
          html += `<th style="border: 1px solid #ddd; padding: 8px 12px; background: #f6f8fa; text-align: left; font-weight: 600;">${escapeHtml(cell)}</th>`;
        });
        html += '</tr></thead><tbody>';
      } else {
        html += '<tr>';
        cells.forEach(cell => {
          html += `<td style="border: 1px solid #ddd; padding: 8px 12px;">${escapeHtml(cell)}</td>`;
        });
        html += '</tr>';
      }
    });

    html += '</tbody></table></div>';
    return html;
  } catch (error) {
    console.error('CSV parsing error:', error);
    return escapeHtml(text);
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

// 關閉 modal
function closeModal() {
  modal.classList.remove('active');
}

// ESC 關閉 modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('active')) {
    closeModal();
  }
});

// 點擊背景關閉 modal
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    closeModal();
  }
});

// Open edit modal
function openEditModal(ctx) {
  currentEditingContext = ctx;

  // Populate form fields
  editNote.value = ctx.note || '';
  editTags.value = ctx.tags ? ctx.tags.join(', ') : '';

  // Populate project dropdown
  const projects = [...new Set(contexts.map(c => c.project).filter(p => p && p !== 'Unassigned'))].sort();
  editProject.innerHTML = '';
  projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project;
    option.textContent = project;
    if (project === ctx.project) {
      option.selected = true;
    }
    editProject.appendChild(option);
  });

  // Add "New Project" option
  const newOption = document.createElement('option');
  newOption.value = '__new__';
  newOption.textContent = '➕ New Project...';
  editProject.appendChild(newOption);

  editModal.classList.add('active');
}

// Close edit modal
function closeEditModal() {
  editModal.classList.remove('active');
  currentEditingContext = null;
}

// Handle edit form submission
editForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!currentEditingContext) return;

  let selectedProject = editProject.value;

  // Handle new project
  if (selectedProject === '__new__') {
    const newProjectName = prompt('Enter new project name:');
    if (!newProjectName || newProjectName.trim() === '') {
      return;
    }
    selectedProject = newProjectName.trim();
  }

  // Parse tags
  const tagsString = editTags.value.trim();
  const tags = tagsString ? tagsString.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];

  // Update context
  const updatedContext = {
    ...currentEditingContext,
    note: editNote.value.trim(),
    tags: tags,
    project: selectedProject
  };

  try {
    const result = await ipcRenderer.invoke('update-context', updatedContext);
    if (result.success) {
      closeEditModal();
      await loadContexts();
    } else {
      alert(`Update failed: ${result.error}`);
    }
  } catch (error) {
    alert(`Update failed: ${error.message}`);
  }
});

// ESC to close edit modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && editModal.classList.contains('active')) {
    closeEditModal();
  }
});

// Click background to close edit modal
editModal.addEventListener('click', (e) => {
  if (e.target === editModal) {
    closeEditModal();
  }
});

// 監聽新增 context
ipcRenderer.on('context-added', (event, newContext) => {
  contexts.push(newContext);
  renderContexts();
});

// 監聽刪除 context
ipcRenderer.on('context-deleted', (event, contextId) => {
  contexts = contexts.filter(c => c.id !== contextId);
  renderContexts();
});

// 監聽更新 context
ipcRenderer.on('context-updated', (event, updatedContext) => {
  const index = contexts.findIndex(c => c.id === updatedContext.id);
  if (index !== -1) {
    contexts[index] = updatedContext;
    renderContexts();
    updateTagsFilter();
  }
});

// Update UI based on project selection
function updateUIForProjectSelection() {
  if (!currentProject) {
    // No project selected for upload
    dropZone.classList.add('disabled');
    projectHint.style.display = 'block';
    projectHint.textContent = '⚠️ Click "Manage Projects" to create or select a project for uploads';
  } else {
    // Project selected
    dropZone.classList.remove('disabled');
    projectHint.style.display = 'none';
  }
}

// 處理圖片上傳（共用邏輯）
async function handleFiles(files) {
  // Check if a project is selected
  if (!currentProject) {
    alert('Please select a project first. Click "Manage Projects" to create or select one.');
    return;
  }

  let selectedProject = currentProject;

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    const isImage = file.type.startsWith('image/');
    const isTextFile = ['.txt', '.md', '.json', '.csv', '.xml', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.css', '.html'].includes(ext);

    // Determine storage directory based on file type
    const baseDir = isImage ? path.join(__dirname, 'data', 'screenshots', selectedProject) : path.join(__dirname, 'data', 'files', selectedProject);

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    // Generate unique filename
    const filename = `uploaded-${Date.now()}-${Math.floor(Math.random() * 1000)}${ext}`;
    const destPath = path.join(baseDir, filename);

    // Read file buffer
    let buffer;
    if (file.path) {
      // From drag & drop
      buffer = fs.readFileSync(file.path);
    } else {
      // From file input
      buffer = Buffer.from(await file.arrayBuffer());
    }
    fs.writeFileSync(destPath, buffer);

    // Read text content for text files
    let textContent = null;
    if (isTextFile) {
      try {
        textContent = buffer.toString('utf8');
      } catch (error) {
        console.error('Failed to read text content:', error);
      }
    }

    // Determine context type
    let contextType, filePath;
    if (isImage) {
      contextType = 'screenshot';
      filePath = destPath;
    } else {
      contextType = isTextFile ? 'text-file' : 'file';
      filePath = destPath;
    }

    // 建立 context
    const newContext = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      project: selectedProject,
      tags: ['uploaded'],
      note: `Uploaded: ${file.name}`,
      type: contextType,
      fileName: file.name,
      fileSize: buffer.length,
      fileType: file.type || 'application/octet-stream'
    };

    // Add appropriate file path field
    if (isImage) {
      newContext.screenshotPath = filePath;
    } else {
      newContext.filePath = filePath;
      if (textContent) {
        newContext.textContent = textContent;
      }
    }

    // Save to project-specific contexts.json
    const projectDir = isImage ? path.join(__dirname, 'data', 'screenshots', selectedProject) : baseDir;
    const projectContextsFile = path.join(projectDir, 'contexts.json');
    let projectContexts = [];
    if (fs.existsSync(projectContextsFile)) {
      projectContexts = JSON.parse(fs.readFileSync(projectContextsFile, 'utf8'));
    }
    projectContexts.push(newContext);
    fs.writeFileSync(projectContextsFile, JSON.stringify(projectContexts, null, 2));

    contexts.push(newContext);
  }

  await updateProjectFilter();
  updateTagsFilter();
  renderContexts();
}

// Click to upload
dropZone.addEventListener('click', () => {
  fileInput.click();
});

// File input change
fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  await handleFiles(files);
  // Reset input so the same file can be selected again
  fileInput.value = '';
});

// Drag & Drop 功能
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');

  const files = Array.from(e.dataTransfer.files);
  await handleFiles(files);
});

// Link handling
saveLinkBtn.addEventListener('click', async () => {
  const url = linkInput.value.trim();

  if (!url) {
    alert('Please enter a URL');
    return;
  }

  // Validate URL
  try {
    new URL(url.startsWith('http') ? url : 'https://' + url);
  } catch (e) {
    alert('Invalid URL format');
    return;
  }

  // Get current project
  if (!currentProject) {
    alert('Please select a project first. Click "Manage Projects" to create or select one.');
    return;
  }
  let selectedProject = currentProject;

  // Show loading state
  saveLinkBtn.disabled = true;
  saveLinkBtn.innerHTML = '<span>💾 Saving...</span>';

  try {
    const result = await ipcRenderer.invoke('save-link', {
      url: url.startsWith('http') ? url : 'https://' + url,
      project: selectedProject,
      note: '',
      tags: ['link']
    });

    if (result.success) {
      // Clear input
      linkInput.value = '';

      // Reload contexts
      await loadContexts();

      // Show success briefly
      saveLinkBtn.innerHTML = '<span>✅ Saved!</span>';
      setTimeout(() => {
        saveLinkBtn.innerHTML = '<span>💾 Save</span>';
      }, 2000);
    } else {
      alert('Failed to save link: ' + result.error);
    }
  } catch (error) {
    console.error('Save link error:', error);
    alert('Error saving link: ' + error.message);
  } finally {
    saveLinkBtn.disabled = false;
    if (saveLinkBtn.innerHTML !== '<span>✅ Saved!</span>') {
      saveLinkBtn.innerHTML = '<span>💾 Save</span>';
    }
  }
});

// Handle link from clipboard (triggered by Cmd+Shift+L)
ipcRenderer.on('link-from-clipboard', (event, url) => {
  linkInput.value = url;
  linkInput.focus();
  linkInput.select();
});

// Project modal functions
function openProjectModal(mode = 'new', oldName = null) {
  projectModalMode = mode;
  projectModalOldName = oldName;

  if (mode === 'new') {
    projectModalTitle.textContent = '➕ New Project';
    projectNameInput.value = '';
    projectNameInput.placeholder = 'Enter project name...';
    projectForm.querySelector('button[type="submit"]').textContent = 'Create';
  } else if (mode === 'rename') {
    projectModalTitle.textContent = '✏️ Rename Project';
    projectNameInput.value = oldName || '';
    projectNameInput.placeholder = 'Enter new project name...';
    projectForm.querySelector('button[type="submit"]').textContent = 'Rename';
  }

  projectModal.style.display = 'flex';
  setTimeout(() => projectNameInput.focus(), 100);
}

function closeProjectModal() {
  projectModal.style.display = 'none';
  projectNameInput.value = '';
  // Reset project filter to current value
  projectFilter.value = viewProject;
}

// Make it globally accessible for HTML onclick
window.closeProjectModal = closeProjectModal;

// Close modal on ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && projectModal.style.display === 'flex') {
    closeProjectModal();
  }
});

// Project 過濾器改變（只用於查看/篩選）
projectFilter.addEventListener('change', (e) => {
  viewProject = e.target.value;
  localStorage.setItem('viewProject', viewProject);
  loadContexts(); // Reload contexts for the selected project
});

// 點擊 Current Project badge 可以快速切換
currentProjectDisplay.addEventListener('click', () => {
  openManageProjectsModal();
});

// Manage Projects 按鈕
manageProjectsBtn.addEventListener('click', () => {
  openManageProjectsModal();
});

// Rename project
async function renameProject(oldName, newName) {
  try {
    const result = await ipcRenderer.invoke('rename-project', { oldName, newName });
    if (result.success) {
      alert(`Project renamed successfully! ${result.updatedCount} contexts updated.`);

      // Update currentProject if it was the renamed project
      if (currentProject === oldName) {
        currentProject = newName;
        localStorage.setItem('currentProject', currentProject);
        updateCurrentProjectDisplay();
      }

      // Update viewProject if it was the renamed project
      if (viewProject === oldName) {
        viewProject = newName;
        localStorage.setItem('viewProject', viewProject);
      }

      await loadContexts();
    }
  } catch (error) {
    alert(`Rename failed: ${error.message}`);
  }
}

// 搜尋輸入
searchInput.addEventListener('input', (e) => {
  currentSearchQuery = e.target.value;
  renderContexts();
});

// Type filter
typeFilter.addEventListener('change', (e) => {
  currentTypeFilter = e.target.value;
  renderContexts();
});

// Date range filters
dateFrom.addEventListener('change', (e) => {
  currentDateFrom = e.target.value;
  renderContexts();
});

dateTo.addEventListener('change', (e) => {
  currentDateTo = e.target.value;
  renderContexts();
});

// 清除標籤篩選
clearTagsFilter.addEventListener('click', () => {
  currentTagsFilter.clear();
  updateTagsFilter();
  renderContexts();
});

// Chat 按鈕
chatBtn.addEventListener('click', () => {
  ipcRenderer.send('open-chat');
});

// Handle request for current project from main process
ipcRenderer.on('get-current-project', () => {
  ipcRenderer.send('current-project-response', currentProject || '__all__');
});

// ===== Manage Projects Modal =====

async function openManageProjectsModal() {
  await renderProjectsList();
  manageProjectsModal.style.display = 'flex';
}

function closeManageProjectsModal() {
  manageProjectsModal.style.display = 'none';
}

window.closeManageProjectsModal = closeManageProjectsModal;

async function renderProjectsList() {
  const projects = await getAllProjects();

  if (projects.length === 0) {
    projectsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #9ca3af;">No projects yet. Create one to get started!</div>';
    return;
  }

  projectsList.innerHTML = '';

  projects.forEach(project => {
    // Count contexts in this project
    const contextCount = contexts.filter(c => c.project === project).length;
    const isCurrentProject = project === currentProject;

    const projectItem = document.createElement('div');
    projectItem.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: ${isCurrentProject ? '#eff6ff' : 'white'};
      border: 2px solid ${isCurrentProject ? '#3b82f6' : '#e5e7eb'};
      border-radius: 8px;
      transition: all 0.2s;
    `;

    projectItem.innerHTML = `
      <div style="flex: 1;">
        <div style="font-weight: 600; font-size: 15px; color: #1f2937; margin-bottom: 4px;">
          📁 ${escapeHtml(project)}
          ${isCurrentProject ? '<span style="color: #3b82f6; font-size: 13px; margin-left: 8px;">✓ Current</span>' : ''}
        </div>
        <div style="font-size: 13px; color: #6b7280;">
          ${contextCount} context${contextCount !== 1 ? 's' : ''}
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        ${!isCurrentProject ? `<button class="select-project-btn" data-project="${escapeHtml(project)}" style="padding: 8px 14px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">Select</button>` : ''}
        <button class="rename-project-btn" data-project="${escapeHtml(project)}" style="padding: 8px 14px; background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">✏️ Rename</button>
        <button class="delete-project-btn" data-project="${escapeHtml(project)}" style="padding: 8px 14px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">🗑️ Delete</button>
      </div>
    `;

    projectsList.appendChild(projectItem);
  });

  // Add event listeners
  document.querySelectorAll('.select-project-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      currentProject = btn.dataset.project;
      localStorage.setItem('currentProject', currentProject);
      updateCurrentProjectDisplay();
      updateUIForProjectSelection();
      await renderProjectsList(); // Re-render to update UI
    });
  });

  document.querySelectorAll('.rename-project-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openProjectModal('rename', btn.dataset.project);
      closeManageProjectsModal();
    });
  });

  document.querySelectorAll('.delete-project-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const projectName = btn.dataset.project;
      const contextCount = contexts.filter(c => c.project === projectName).length;

      const confirmed = confirm(
        `Are you sure you want to delete "${projectName}"?\n\n` +
        `This will permanently delete ${contextCount} context(s).\n\n` +
        `This action cannot be undone.`
      );

      if (!confirmed) return;

      try {
        const result = await ipcRenderer.invoke('delete-project', { projectName });
        if (result.success) {
          alert(`Project "${projectName}" deleted successfully.`);

          // If deleted current project, switch to another
          if (currentProject === projectName) {
            const projects = getAllProjects().filter(p => p !== projectName);
            currentProject = projects.length > 0 ? projects[0] : null;
            localStorage.setItem('currentProject', currentProject || '');
          }

          // Reload
          await loadContexts();
          await renderProjectsList();
          updateCurrentProjectDisplay();
          updateUIForProjectSelection();
        }
      } catch (error) {
        alert('Failed to delete project: ' + error.message);
      }
    });
  });
}

// 初始載入
window.addEventListener('DOMContentLoaded', () => {
  loadContexts();

  // Create new project button
  createNewProjectBtn.addEventListener('click', () => {
    closeManageProjectsModal();
    openProjectModal('new');
  });

  // Handle project form submit to handle new currentProject logic
  projectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = projectNameInput.value.trim();
    if (!newName) return;

    if (projectModalMode === 'new') {
      // Create new project
      try {
        const result = await ipcRenderer.invoke('create-project', { projectName: newName });
        if (result.success) {
          currentProject = newName;
          localStorage.setItem('currentProject', currentProject);
          await loadContexts();
          await updateProjectFilter();
          updateCurrentProjectDisplay();
          updateUIForProjectSelection();
          closeProjectModal();
        }
      } catch (error) {
        alert('Failed to create project: ' + error.message);
      }
    } else if (projectModalMode === 'rename') {
      // Rename project
      if (newName !== projectModalOldName) {
        await renameProject(projectModalOldName, newName);
      }
      closeProjectModal();
    }
  });

  // Close manage modal on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && manageProjectsModal.style.display === 'flex') {
      closeManageProjectsModal();
    }
  });
});
