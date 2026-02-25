/**
 * Utility functions for context manager
 */

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format timestamp to readable string
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted time
 */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

/**
 * Determine file type from extension
 * @param {string} fileName - File name with extension
 * @returns {string} File type category
 */
function getFileType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();

  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'];
  const textExts = ['txt', 'md', 'json', 'csv', 'xml', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'css', 'html'];
  const docExts = ['pdf', 'doc', 'docx'];

  if (imageExts.includes(ext)) return 'image';
  if (textExts.includes(ext)) return 'text';
  if (docExts.includes(ext)) return 'document';
  return 'file';
}

/**
 * Get icon for file type
 * @param {string} fileName - File name with extension
 * @returns {string} Icon emoji
 */
function getFileIcon(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();

  const fileIcons = {
    'pdf': '📄',
    'txt': '📝',
    'md': '📝',
    'doc': '📄',
    'docx': '📄',
    'json': '📋',
    'csv': '📊',
    'xml': '📋',
    'zip': '📦',
    'rar': '📦',
    '7z': '📦',
    'png': '🖼️',
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'gif': '🖼️'
  };

  return fileIcons[ext] || '📎';
}

/**
 * Validate context data
 * @param {Object} context - Context object
 * @returns {Object} Validation result with isValid and errors
 */
function validateContext(context) {
  const errors = [];

  if (!context.project || context.project.trim() === '') {
    errors.push('Project name is required');
  }

  if (!context.type) {
    errors.push('Context type is required');
  }

  if (!['screenshot', 'text', 'text-file', 'file', 'link'].includes(context.type)) {
    errors.push('Invalid context type');
  }

  if (context.type === 'screenshot' && !context.screenshotPath) {
    errors.push('Screenshot path is required for screenshot type');
  }

  if ((context.type === 'file' || context.type === 'text-file') && !context.filePath) {
    errors.push('File path is required for file type');
  }

  if (context.type === 'link' && !context.url) {
    errors.push('URL is required for link type');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Export for Node.js environment (for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatFileSize,
    formatTime,
    getFileType,
    getFileIcon,
    validateContext
  };
}
