const fs = require('fs');
const path = require('path');

/**
 * Migration script to split global contexts.json into per-project contexts.json files
 * Run this once: node migrate-to-per-project-contexts.js
 */

const dataDir = path.join(__dirname, 'data');
const screenshotsDir = path.join(dataDir, 'screenshots');
const globalContextsFile = path.join(dataDir, 'contexts.json');

console.log('Starting migration to per-project contexts.json...');

// Read global contexts
if (!fs.existsSync(globalContextsFile)) {
  console.log('No global contexts.json found. Nothing to migrate.');
  process.exit(0);
}

const allContexts = JSON.parse(fs.readFileSync(globalContextsFile, 'utf8'));
console.log(`Found ${allContexts.length} contexts in global file`);

// Group by project
const projectGroups = {};
allContexts.forEach(ctx => {
  const project = ctx.project || 'Unassigned';
  if (!projectGroups[project]) {
    projectGroups[project] = [];
  }
  projectGroups[project].push(ctx);
});

console.log(`\nGrouped into ${Object.keys(projectGroups).length} projects`);

// Write to per-project contexts.json files
let createdCount = 0;
let errorCount = 0;

Object.keys(projectGroups).forEach(project => {
  try {
    const projectDir = path.join(screenshotsDir, project);

    // Create project directory if it doesn't exist
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
      console.log(`Created directory: ${projectDir}`);
    }

    // Write contexts.json for this project
    const projectContextsFile = path.join(projectDir, 'contexts.json');
    const contexts = projectGroups[project];

    fs.writeFileSync(projectContextsFile, JSON.stringify(contexts, null, 2));

    console.log(`✓ ${project}: ${contexts.length} contexts`);
    createdCount++;
  } catch (error) {
    console.error(`✗ ${project}: Error - ${error.message}`);
    errorCount++;
  }
});

// Backup and remove global contexts.json
const backupFile = path.join(dataDir, 'contexts.json.backup');
fs.copyFileSync(globalContextsFile, backupFile);
console.log(`\n✓ Backup created: ${backupFile}`);

fs.unlinkSync(globalContextsFile);
console.log('✓ Removed global contexts.json');

// Print summary
console.log('\n=== Migration Summary ===');
console.log(`Total contexts: ${allContexts.length}`);
console.log(`Projects created: ${createdCount}`);
console.log(`Errors: ${errorCount}`);
console.log('\n✓ Migration complete!');
console.log('\nEach project now has its own contexts.json file.');
