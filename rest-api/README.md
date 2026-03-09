# Context Manager REST API

A FastAPI-based REST API server that exposes Context Manager data to external clients like ChatGPT, enabling AI assistants to search and access your screenshots, notes, and context data.

## Features

- 🔍 **Search Contexts** - Filter by keywords, tags, type, project, and date range
- 📸 **View Screenshots** - Access screenshots encoded as base64
- 💾 **Create Contexts** - Save notes and text content via API
- 📁 **Upload Files** - Upload screenshots and documents through API
- 📋 **List Projects** - View all project names
- ⏰ **Recent Contexts** - Quickly access latest contexts
- ✏️ **Update Contexts** - Modify existing context data
- 🗑️ **Delete Projects** - Remove projects and all their data

## Installation

### 1. Install Python Dependencies

```bash
cd rest-api
pip install -r requirements.txt
```

Required packages:
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `pydantic` - Data validation

### 2. Configure Data Directory

By default, the API uses `~/PersonalBusiness/context-manager/data`. To use a different directory, set the environment variable:

```bash
export CONTEXT_MANAGER_DATA_DIR="/path/to/your/data"
```

### 3. Start the Server

```bash
python server.py
```

Or with custom host/port:

```bash
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

The server will start at:
- API: http://localhost:8000
- Interactive docs: http://localhost:8000/docs
- OpenAPI schema: http://localhost:8000/openapi.json

## API Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API information and available endpoints |
| GET | `/health` | Health check |
| GET | `/projects` | List all project names |
| GET | `/contexts/search` | Search contexts with filters |
| GET | `/contexts/recent` | Get recent contexts |
| GET | `/contexts/{id}` | Get specific context with full details |
| POST | `/contexts` | Create new text context |
| POST | `/contexts/file` | Upload a file (screenshot or document) |
| PUT | `/contexts/{id}` | Update existing context |
| DELETE | `/projects/{project}` | Delete a project and all its data |

### Example Requests

**Search for contexts:**
```bash
curl "http://localhost:8000/contexts/search?query=bug&project=MyApp&limit=10"
```

**Get recent contexts:**
```bash
curl "http://localhost:8000/contexts/recent?limit=5"
```

**Get context detail (including screenshot as base64):**
```bash
curl "http://localhost:8000/contexts/1234567890"
```

**Create a new text context:**
```bash
curl -X POST "http://localhost:8000/contexts" \
  -H "Content-Type: application/json" \
  -d '{
    "project": "MyProject",
    "content": "This is my note content",
    "note": "Quick note about the meeting",
    "tags": ["meeting", "important"]
  }'
```

## ChatGPT Custom GPT Integration

You can connect ChatGPT to your Context Manager data using **Custom GPT Actions**.

### Step 1: Start the API Server

Make sure the REST API server is running and accessible. For production use, consider:
- Running behind a reverse proxy (nginx)
- Using HTTPS with SSL certificates
- Setting up authentication (API keys)

### Step 2: Get the OpenAPI Schema

Visit http://localhost:8000/openapi.json to get the complete API schema.

### Step 3: Create a Custom GPT

1. Go to https://chat.openai.com/gpts/editor
2. Click **"Create a GPT"**
3. Fill in the basic information:
   - **Name:** Context Manager Assistant
   - **Description:** Access and search my Context Manager screenshots and notes
   - **Instructions:** Example below

### Step 4: Configure Actions

1. Click **"Configure"** → **"Actions"**
2. Click **"Create new action"**
3. Paste your OpenAPI schema from http://localhost:8000/openapi.json
4. Set the **Server URL** to your API endpoint (e.g., `http://localhost:8000` or your public URL)
5. Configure authentication if needed (None for local development)

### Example GPT Instructions

```
You are a Context Manager Assistant with access to my personal context database containing screenshots, notes, and project information.

Your capabilities:
- Search through my screenshots and notes using keywords, tags, projects, and dates
- View full context details including screenshots (as base64 images)
- List all my projects
- Get recent contexts
- Create new text contexts

When the user asks about their screenshots or notes:
1. Use the search endpoint to find relevant contexts
2. If they want to see a specific screenshot, use the context detail endpoint
3. Present results clearly with timestamps, projects, and tags
4. If creating new notes, use the POST endpoint

Always be helpful and concise. Format results in a readable way.
```

### Step 5: Test the Integration

Once configured, you can ask ChatGPT:
- "Find my recent screenshots about bugs"
- "Search for notes tagged with 'meeting' from MyProject"
- "Show me the screenshot from context ID 1234567890"
- "Create a new note in MyProject about the design discussion"

## Production Deployment

### Using ngrok for Testing

To expose your local server to ChatGPT for testing:

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 8000
```

Use the ngrok HTTPS URL as your server URL in Custom GPT Actions.

### Security Considerations

For production use:

1. **Add Authentication:**
   - Use API keys or OAuth
   - Add authentication middleware to FastAPI
   - Configure in Custom GPT Actions settings

2. **Use HTTPS:**
   - Deploy behind nginx with SSL
   - Use Let's Encrypt for certificates

3. **Restrict CORS:**
   - Update `allow_origins` in server.py to specific domains
   - Remove wildcard `"*"` in production

4. **Rate Limiting:**
   - Add rate limiting middleware
   - Prevent abuse from external clients

5. **Environment Variables:**
   - Store sensitive config in environment variables
   - Use `.env` files (don't commit them!)

### Example Production Setup

```bash
# Use a process manager like systemd or supervisord
[Unit]
Description=Context Manager API
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/context-manager/rest-api
Environment="CONTEXT_MANAGER_DATA_DIR=/path/to/data"
ExecStart=/usr/bin/python3 -m uvicorn server:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### Port Already in Use

```bash
# Find and kill the process using port 8000
lsof -ti:8000 | xargs kill -9

# Or use a different port
uvicorn server:app --port 8001
```

### CORS Errors

If you see CORS errors in the browser console:
1. Check `allow_origins` in server.py
2. Make sure the server is running
3. Try using the `/health` endpoint first

### Data Directory Not Found

```bash
# Check if data directory exists
ls -la ~/PersonalBusiness/context-manager/data

# Or set custom directory
export CONTEXT_MANAGER_DATA_DIR="/your/custom/path"
python server.py
```

### Import Errors

Make sure you're in the correct directory and have installed dependencies:

```bash
cd rest-api
pip install -r requirements.txt
python server.py
```

## API Documentation

FastAPI automatically generates interactive documentation:

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc
- **OpenAPI JSON:** http://localhost:8000/openapi.json

These docs include:
- All available endpoints
- Request/response schemas
- Try-it-out functionality
- Example requests

## Development

### Running in Development Mode

```bash
# Auto-reload on file changes
uvicorn server:app --reload --log-level debug
```

### Testing the API

```bash
# Health check
curl http://localhost:8000/health

# List projects
curl http://localhost:8000/projects

# Search with multiple filters
curl "http://localhost:8000/contexts/search?query=meeting&tags=important,urgent&limit=5"
```

## License

MIT
