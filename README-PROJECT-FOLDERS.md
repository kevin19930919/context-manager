# Project-Based Folder Organization

This app now organizes screenshots and files by project folders for better organization.

## Folder Structure

```
data/
├── contexts.json
├── config.json
└── screenshots/
    ├── _temp/              # Temporary storage before project selection
    ├── ProjectA/
    │   ├── screenshot-xxx.png
    │   └── uploaded-xxx.jpg
    ├── ProjectB/
    └── Unassigned/
```

## Migration

If you have existing data, run the migration script **once** to organize your files:

```bash
node migrate-to-project-folders.js
```

This will:
- Move all existing screenshots from `data/screenshots/` to their respective project folders
- Update all paths in `contexts.json`
- Create a `_temp` folder for future captures
- Show a summary of migrated files

## New Features

### 1. Project-Based Storage
- Screenshots captured with `Cmd+Shift+C` are saved to `_temp` initially
- When you save the context and select a project, the file moves to that project's folder
- Uploaded images go directly to the selected project folder

### 2. File Operations
Each context now has additional action buttons:
- **View**: View the screenshot or text content
- **Copy**: Copy file to an external folder (keeps it in context manager)
- **Move**: Move file to an external folder (removes from context manager)
- **Delete**: Delete the context and file

### 3. Project Rename
To rename a project:
1. Select the project you want to rename from the "Current Project" dropdown
2. Select "✏️ Rename Current Project..." from the dropdown
3. Enter the new name
4. The folder will be renamed and all context paths will be updated automatically

**Note**: You cannot rename these special projects:
- `__all__` (view-only mode)
- `Unassigned`
- `__new__` (reserved)

## Technical Details

### Automatic Folder Creation
- Project folders are created automatically when needed
- No manual folder management required

### Path Updates
- All file paths in `contexts.json` are absolute paths
- When a project is renamed, all paths are updated automatically

### File Conflicts
- If a file with the same name exists, a timestamp is added to avoid conflicts
- Example: `screenshot-123.png` becomes `screenshot-123-1675432100.png`

## Troubleshooting

### Migration Issues
If migration fails:
1. Check that `data/contexts.json` exists
2. Ensure you have write permissions to `data/screenshots/`
3. Backup your data before running migration again

### Missing Files
If a screenshot shows as missing:
1. Check if the file exists in the project folder
2. The path in `contexts.json` should match the actual file location
3. You can manually move the file and update the path in `contexts.json`

### Rename Conflicts
If project rename fails with "Project already exists":
- A folder with that name already exists
- Choose a different name or manually merge the folders

## Best Practices

1. **Select Project First**: Always select a specific project before uploading or capturing
2. **Regular Backups**: Backup the entire `data/` folder regularly
3. **Clean Up**: Use the "Move" function to export files you no longer need in the context manager
4. **Project Names**: Use descriptive, unique names for projects
