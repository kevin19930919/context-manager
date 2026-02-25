# Context Manager

A simple desktop app for capturing and organizing information across different tools.

## Features

- **Screenshot Capture** (`Cmd+Control+Shift+4` → `Cmd+Shift+9`): Capture area screenshots from clipboard
- **Text Capture** (`Cmd+Shift+V`): Save clipboard text content
- **Link Capture** (`Cmd+Shift+L`): Save clipboard links
- **Drag & Drop**: Drop screenshots directly into the app
- **Project Organization**: Group related contexts by project
- **Tags**: Add searchable tags to organize your contexts
- **Timeline View**: See all your contexts in chronological order

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

### Workflow

**For Screenshots:**
1. Take a screenshot to clipboard using macOS:
   - `Cmd+Control+Shift+4` - Select area to capture to clipboard
   - `Cmd+Control+Shift+3` - Capture full screen to clipboard
   - `Cmd+Control+Shift+4` then `Space` - Capture window to clipboard
2. Press `Cmd+Shift+9` in Context Manager to read from clipboard
3. Add project name, tags, and notes
4. Press Enter to save

**For Text:**
1. Copy any text to your clipboard
2. Press `Cmd+Shift+V`
3. The clipboard text is captured automatically
4. Add project name, tags, and notes
5. Press Enter to save

**For Links:**
1. Copy a URL to your clipboard
2. Press `Cmd+Shift+L`
3. The link is captured with page title
4. Add project name, tags, and notes
5. Press Enter to save

**Viewing:**
- All contexts are organized by project in the main window
- Click any context to view the full screenshot or text content
- Drag & drop screenshots directly into the app

## Data Storage

All data is stored locally in the `data/` directory:
- `data/screenshots/<project-name>/` - Project folders containing:
  - `contexts.json` - Context metadata for each project
  - `screenshot-*.png` - Screenshot files
- `data/screenshots/_temp/` - Temporary folder for unsaved screenshots (auto-cleaned)
- `data/files/<project-name>/` - Uploaded files organized by project
- `data/config.json` - App configuration (API keys, settings)

## Tech Stack

- Electron
- Node.js
- Vanilla JavaScript (no framework needed for MVP)

## MCP Server Integration

Context Manager includes an **MCP (Model Context Protocol) Server** that exposes your contexts to Claude Code, allowing you to search and manage your screenshots and notes directly from your IDE!

### Features

- 🔍 **Search Contexts** - Filter by keywords, tags, type, project, and date
- 📸 **View Screenshots** - AI can "see" your screenshots (encoded as base64)
- 💾 **Create Contexts** - Save notes from Claude Code to Context Manager
- 📋 **List Projects** - View all project names
- ⏰ **Recent Contexts** - Quickly access latest contexts

### Quick Setup

1. **Install Python dependencies:**
   ```bash
   cd mcp-server
   pip install mcp
   ```

2. **Configure Claude Code** by editing `~/.claude/mcp_settings.json`:
   ```json
   {
     "mcpServers": {
       "context-manager": {
         "command": "python3",
         "args": ["/absolute/path/to/context-manager/mcp-server/server.py"],
         "env": {}
       }
     }
   }
   ```

3. **Restart Claude Code** and verify the connection in settings.

### Usage Examples

Once connected, you can ask Claude Code:
- "Find my recent bug screenshots"
- "Search for 'API' related notes"
- "Show contexts from project 'MyProject'"
- "What's in screenshot ID 1234567890?"

For detailed setup and troubleshooting, see [`mcp-server/README.md`](mcp-server/README.md).
