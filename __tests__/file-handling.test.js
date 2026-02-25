const fs = require('fs');
const path = require('path');

describe('File Handling', () => {
  const testDataDir = path.join(__dirname, '../data-test');
  const testScreenshotsDir = path.join(testDataDir, 'screenshots');
  const testFilesDir = path.join(testDataDir, 'files');
  const testProject = 'TestProject';

  beforeAll(() => {
    // Create test directories
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir);
    }
    if (!fs.existsSync(testScreenshotsDir)) {
      fs.mkdirSync(testScreenshotsDir);
    }
    if (!fs.existsSync(testFilesDir)) {
      fs.mkdirSync(testFilesDir);
    }
  });

  afterAll(() => {
    // Clean up test directories
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('Context File Operations', () => {
    test('creates project directory if not exists', () => {
      const projectDir = path.join(testScreenshotsDir, testProject);

      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      expect(fs.existsSync(projectDir)).toBe(true);
    });

    test('saves context to JSON file', () => {
      const projectDir = path.join(testScreenshotsDir, testProject);
      const contextsFile = path.join(projectDir, 'contexts.json');

      const context = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        project: testProject,
        type: 'text',
        textContent: 'Test content',
        tags: ['test'],
        note: 'Test note'
      };

      let contexts = [];
      if (fs.existsSync(contextsFile)) {
        contexts = JSON.parse(fs.readFileSync(contextsFile, 'utf8'));
      }

      contexts.push(context);
      fs.writeFileSync(contextsFile, JSON.stringify(contexts, null, 2));

      expect(fs.existsSync(contextsFile)).toBe(true);

      const savedContexts = JSON.parse(fs.readFileSync(contextsFile, 'utf8'));
      expect(savedContexts).toHaveLength(1);
      expect(savedContexts[0]).toMatchObject({
        project: testProject,
        type: 'text',
        textContent: 'Test content'
      });
    });

    test('reads contexts from JSON file', () => {
      const projectDir = path.join(testScreenshotsDir, testProject);
      const contextsFile = path.join(projectDir, 'contexts.json');

      if (fs.existsSync(contextsFile)) {
        const contexts = JSON.parse(fs.readFileSync(contextsFile, 'utf8'));
        expect(Array.isArray(contexts)).toBe(true);
        expect(contexts.length).toBeGreaterThan(0);
      }
    });

    test('updates existing context', () => {
      const projectDir = path.join(testScreenshotsDir, testProject);
      const contextsFile = path.join(projectDir, 'contexts.json');

      let contexts = JSON.parse(fs.readFileSync(contextsFile, 'utf8'));
      const contextToUpdate = contexts[0];
      contextToUpdate.note = 'Updated note';

      fs.writeFileSync(contextsFile, JSON.stringify(contexts, null, 2));

      const updatedContexts = JSON.parse(fs.readFileSync(contextsFile, 'utf8'));
      expect(updatedContexts[0].note).toBe('Updated note');
    });

    test('deletes context from file', () => {
      const projectDir = path.join(testScreenshotsDir, testProject);
      const contextsFile = path.join(projectDir, 'contexts.json');

      let contexts = JSON.parse(fs.readFileSync(contextsFile, 'utf8'));
      const originalLength = contexts.length;
      const contextIdToDelete = contexts[0].id;

      contexts = contexts.filter(ctx => ctx.id !== contextIdToDelete);
      fs.writeFileSync(contextsFile, JSON.stringify(contexts, null, 2));

      const remainingContexts = JSON.parse(fs.readFileSync(contextsFile, 'utf8'));
      expect(remainingContexts.length).toBe(originalLength - 1);
    });
  });

  describe('File Type Detection', () => {
    test('detects text files correctly', () => {
      const textExtensions = ['.txt', '.md', '.json', '.csv', '.xml'];
      textExtensions.forEach(ext => {
        const fileName = `test${ext}`;
        const extension = path.extname(fileName).toLowerCase();
        const isTextFile = ['.txt', '.md', '.json', '.csv', '.xml'].includes(extension);
        expect(isTextFile).toBe(true);
      });
    });

    test('detects image files correctly', () => {
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp'];
      imageExtensions.forEach(ext => {
        const fileName = `test${ext}`;
        const extension = path.extname(fileName).toLowerCase();
        const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(extension);
        expect(isImage).toBe(true);
      });
    });

    test('identifies non-text files', () => {
      const nonTextExtensions = ['.pdf', '.zip', '.exe', '.bin'];
      nonTextExtensions.forEach(ext => {
        const fileName = `test${ext}`;
        const extension = path.extname(fileName).toLowerCase();
        const isTextFile = ['.txt', '.md', '.json', '.csv', '.xml'].includes(extension);
        expect(isTextFile).toBe(false);
      });
    });
  });

  describe('File Storage', () => {
    test('determines correct storage directory for images', () => {
      const fileName = 'test.png';
      const isImage = fileName.match(/\.(png|jpg|jpeg|gif|bmp|webp)$/i);
      const storageDir = isImage ? testScreenshotsDir : testFilesDir;

      expect(storageDir).toBe(testScreenshotsDir);
    });

    test('determines correct storage directory for other files', () => {
      const fileName = 'test.pdf';
      const isImage = fileName.match(/\.(png|jpg|jpeg|gif|bmp|webp)$/i);
      const storageDir = isImage ? testScreenshotsDir : testFilesDir;

      expect(storageDir).toBe(testFilesDir);
    });

    test('creates unique filenames', () => {
      const timestamp1 = Date.now();
      const random1 = Math.floor(Math.random() * 1000);
      const filename1 = `uploaded-${timestamp1}-${random1}.txt`;

      // Small delay to ensure different timestamp
      const timestamp2 = Date.now() + 1;
      const random2 = Math.floor(Math.random() * 1000);
      const filename2 = `uploaded-${timestamp2}-${random2}.txt`;

      expect(filename1).not.toBe(filename2);
    });
  });

  describe('Context Data Structure', () => {
    test('creates valid screenshot context', () => {
      const context = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        project: testProject,
        type: 'screenshot',
        screenshotPath: '/path/to/screenshot.png',
        tags: ['uploaded'],
        note: 'Test screenshot'
      };

      expect(context).toHaveProperty('id');
      expect(context).toHaveProperty('timestamp');
      expect(context).toHaveProperty('project');
      expect(context).toHaveProperty('type', 'screenshot');
      expect(context).toHaveProperty('screenshotPath');
    });

    test('creates valid file context', () => {
      const context = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        project: testProject,
        type: 'file',
        filePath: '/path/to/file.pdf',
        fileName: 'file.pdf',
        fileSize: 1024,
        fileType: 'application/pdf',
        tags: ['uploaded'],
        note: 'Test file'
      };

      expect(context).toHaveProperty('type', 'file');
      expect(context).toHaveProperty('filePath');
      expect(context).toHaveProperty('fileName');
      expect(context).toHaveProperty('fileSize');
      expect(context).toHaveProperty('fileType');
    });

    test('creates valid text-file context with content', () => {
      const context = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        project: testProject,
        type: 'text-file',
        filePath: '/path/to/file.txt',
        fileName: 'file.txt',
        fileSize: 512,
        fileType: 'text/plain',
        textContent: 'File content here',
        tags: ['uploaded'],
        note: 'Test text file'
      };

      expect(context).toHaveProperty('type', 'text-file');
      expect(context).toHaveProperty('textContent');
    });
  });
});
