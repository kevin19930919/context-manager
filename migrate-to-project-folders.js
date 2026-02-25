const fs = require('fs');
const path = require('path');

/**
 * Migration script to organize screenshots into project-based folders
 * Run this once to migrate existing data: node migrate-to-project-folders.js
 */

const dataDir = path.join(__dirname, 'data');
const screenshotsDir = path.join(dataDir, 'screenshots');
const contextsFile = path.join(dataDir, 'contexts.json');

console.log('Starting migration to project-based folders...');

// Read contexts
if (!fs.existsSync(contextsFile)) {
  console.log('No contexts.json found. Nothing to migrate.');
  process.exit(0);
}

const contexts = JSON.parse(fs.readFileSync(contextsFile, 'utf8'));
console.log(`Found ${contexts.length} contexts`);

// Track statistics
let migratedCount = 0;
let skippedCount = 0;
let errorCount = 0;

// Migrate each context
contexts.forEach((ctx, index) => {
  if (ctx.type !== 'screenshot' || !ctx.screenshotPath) {
    skippedCount++;
    return;
  }

  try {
    const oldPath = ctx.screenshotPath;

    // Check if file exists
    if (!fs.existsSync(oldPath)) {
      console.log(`[${index + 1}] File not found: ${oldPath}`);
      errorCount++;
      return;
    }

    // Check if already in project folder (skip if already migrated)
    const relativePath = path.relative(screenshotsDir, oldPath);
    if (relativePath.includes(path.sep)) {
      console.log(`[${index + 1}] Already in project folder: ${oldPath}`);
      skippedCount++;
      return;
    }

    // Determine project folder
    const project = ctx.project || 'Unassigned';
    const projectDir = path.join(screenshotsDir, project);

    // Create project directory if it doesn't exist
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
      console.log(`Created directory: ${projectDir}`);
    }

    // Determine new path
    const filename = path.basename(oldPath);
    const newPath = path.join(projectDir, filename);

    // Check if destination already exists (handle conflicts)
    let finalPath = newPath;
    if (fs.existsSync(newPath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const timestamp = Date.now();
      finalPath = path.join(projectDir, `${base}-${timestamp}${ext}`);
      console.log(`[${index + 1}] Conflict resolved: ${newPath} -> ${finalPath}`);
    }

    // Move file
    fs.renameSync(oldPath, finalPath);

    // Update context
    ctx.screenshotPath = finalPath;

    console.log(`[${index + 1}] Migrated: ${project}/${filename}`);
    migratedCount++;
  } catch (error) {
    console.error(`[${index + 1}] Error migrating context ${ctx.id}:`, error.message);
    errorCount++;
  }
});

// Save updated contexts
fs.writeFileSync(contextsFile, JSON.stringify(contexts, null, 2));

// Print summary
console.log('\n=== Migration Summary ===');
console.log(`Total contexts: ${contexts.length}`);
console.log(`Migrated: ${migratedCount}`);
console.log(`Skipped: ${skippedCount}`);
console.log(`Errors: ${errorCount}`);
console.log('\nMigration complete!');

// Create _temp directory for future captures
const tempDir = path.join(screenshotsDir, '_temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log('\nCreated _temp directory for future captures');
}
