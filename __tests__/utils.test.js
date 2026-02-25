const {
  formatFileSize,
  formatTime,
  getFileType,
  getFileIcon,
  validateContext
} = require('../utils');

describe('formatFileSize', () => {
  test('formats bytes correctly', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  test('formats kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(5120)).toBe('5.0 KB');
  });

  test('formats megabytes correctly', () => {
    expect(formatFileSize(1048576)).toBe('1.00 MB');
    expect(formatFileSize(5242880)).toBe('5.00 MB');
  });

  test('handles edge cases', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });
});

describe('formatTime', () => {
  test('returns "Just now" for recent timestamps', () => {
    const now = new Date().toISOString();
    expect(formatTime(now)).toBe('Just now');
  });

  test('formats minutes correctly', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatTime(fiveMinutesAgo)).toBe('5 mins ago');
  });

  test('formats hours correctly', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatTime(twoHoursAgo)).toBe('2 hours ago');
  });

  test('formats days correctly', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatTime(threeDaysAgo)).toBe('3 days ago');
  });

  test('uses singular form for 1 unit', () => {
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();
    expect(formatTime(oneMinuteAgo)).toBe('1 min ago');

    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(formatTime(oneHourAgo)).toBe('1 hour ago');

    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatTime(oneDayAgo)).toBe('1 day ago');
  });
});

describe('getFileType', () => {
  test('identifies image files', () => {
    expect(getFileType('photo.png')).toBe('image');
    expect(getFileType('image.jpg')).toBe('image');
    expect(getFileType('picture.jpeg')).toBe('image');
    expect(getFileType('animation.gif')).toBe('image');
  });

  test('identifies text files', () => {
    expect(getFileType('README.md')).toBe('text');
    expect(getFileType('data.json')).toBe('text');
    expect(getFileType('script.js')).toBe('text');
    expect(getFileType('notes.txt')).toBe('text');
  });

  test('identifies document files', () => {
    expect(getFileType('document.pdf')).toBe('document');
    expect(getFileType('report.doc')).toBe('document');
    expect(getFileType('thesis.docx')).toBe('document');
  });

  test('returns "file" for unknown types', () => {
    expect(getFileType('archive.zip')).toBe('file');
    expect(getFileType('video.mp4')).toBe('file');
  });

  test('handles case insensitivity', () => {
    expect(getFileType('Photo.PNG')).toBe('image');
    expect(getFileType('README.MD')).toBe('text');
  });
});

describe('getFileIcon', () => {
  test('returns correct icons for common file types', () => {
    expect(getFileIcon('document.pdf')).toBe('📄');
    expect(getFileIcon('notes.txt')).toBe('📝');
    expect(getFileIcon('data.json')).toBe('📋');
    expect(getFileIcon('data.csv')).toBe('📊');
    expect(getFileIcon('photo.png')).toBe('🖼️');
  });

  test('returns default icon for unknown types', () => {
    expect(getFileIcon('unknown.xyz')).toBe('📎');
  });

  test('handles case insensitivity', () => {
    expect(getFileIcon('Document.PDF')).toBe('📄');
  });
});

describe('validateContext', () => {
  test('validates valid screenshot context', () => {
    const context = {
      project: 'Test Project',
      type: 'screenshot',
      screenshotPath: '/path/to/screenshot.png',
      timestamp: new Date().toISOString()
    };

    const result = validateContext(context);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validates valid text context', () => {
    const context = {
      project: 'Test Project',
      type: 'text',
      textContent: 'Some text content',
      timestamp: new Date().toISOString()
    };

    const result = validateContext(context);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validates valid file context', () => {
    const context = {
      project: 'Test Project',
      type: 'file',
      filePath: '/path/to/file.pdf',
      fileName: 'file.pdf',
      timestamp: new Date().toISOString()
    };

    const result = validateContext(context);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects context without project', () => {
    const context = {
      type: 'text',
      textContent: 'Some text'
    };

    const result = validateContext(context);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Project name is required');
  });

  test('rejects context with empty project', () => {
    const context = {
      project: '   ',
      type: 'text',
      textContent: 'Some text'
    };

    const result = validateContext(context);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Project name is required');
  });

  test('rejects context without type', () => {
    const context = {
      project: 'Test Project'
    };

    const result = validateContext(context);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Context type is required');
  });

  test('rejects context with invalid type', () => {
    const context = {
      project: 'Test Project',
      type: 'invalid-type'
    };

    const result = validateContext(context);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid context type');
  });

  test('rejects screenshot context without screenshotPath', () => {
    const context = {
      project: 'Test Project',
      type: 'screenshot'
    };

    const result = validateContext(context);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Screenshot path is required for screenshot type');
  });

  test('rejects file context without filePath', () => {
    const context = {
      project: 'Test Project',
      type: 'file',
      fileName: 'test.pdf'
    };

    const result = validateContext(context);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('File path is required for file type');
  });

  test('accumulates multiple errors', () => {
    const context = {
      type: 'screenshot'
    };

    const result = validateContext(context);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});
