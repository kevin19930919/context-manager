"""
FastAPI REST API Server for Context Manager
Exposes Context Manager data to external clients like ChatGPT
"""

import sys
import os
from pathlib import Path
from typing import List, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Add parent directory to path to import ContextManager
sys.path.append(str(Path(__file__).parent.parent / 'mcp-server'))
from context_manager import ContextManager

# Initialize FastAPI app
app = FastAPI(
    title="Context Manager API",
    description="REST API for accessing and managing Context Manager data",
    version="1.0.0"
)

# Enable CORS for ChatGPT and other clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize ContextManager
# Default data directory - can be overridden by environment variable
DATA_DIR = os.environ.get('CONTEXT_MANAGER_DATA_DIR',
                          str(Path.home() / 'PersonalBusiness/context-manager/data'))
context_manager = ContextManager(DATA_DIR)


# Pydantic models for request/response
class ContextPreview(BaseModel):
    id: int
    timestamp: str
    project: str
    tags: List[str]
    note: str
    type: str
    preview: Optional[str] = None


class CreateContextRequest(BaseModel):
    project: str = Field(..., description="Project name")
    content: str = Field(..., description="Text content")
    type: str = Field(default="text", description="Context type (text, text-file)")
    note: str = Field(default="", description="Note/description")
    tags: Optional[List[str]] = Field(default=None, description="Tags for categorization")
    metadata: Optional[dict] = Field(default=None, description="Additional metadata")


class UpdateContextRequest(BaseModel):
    content: Optional[str] = Field(default=None, description="Updated text content")
    note: Optional[str] = Field(default=None, description="Updated note")
    tags: Optional[List[str]] = Field(default=None, description="Updated tags")
    metadata: Optional[dict] = Field(default=None, description="Updated metadata")


class SaveFileRequest(BaseModel):
    project: str = Field(..., description="Project name")
    file_data: str = Field(..., description="Base64 encoded file content")
    file_name: str = Field(..., description="Original file name with extension")
    file_type: str = Field(default="file", description="File type: 'screenshot' or 'file'")
    note: str = Field(default="", description="Note/description")
    tags: Optional[List[str]] = Field(default=None, description="Tags for categorization")


@app.get("/")
def root():
    """Root endpoint - API information"""
    return {
        "name": "Context Manager API",
        "version": "1.0.0",
        "description": "REST API for accessing Context Manager data",
        "endpoints": {
            "GET /projects": "List all projects",
            "GET /contexts/search": "Search contexts with filters",
            "GET /contexts/recent": "Get recent contexts",
            "GET /contexts/{id}": "Get specific context with full details",
            "POST /contexts": "Create new text context",
            "POST /contexts/file": "Upload a file (screenshot or document)",
            "PUT /contexts/{id}": "Update existing context",
            "DELETE /projects/{project}": "Delete a project and all its data"
        },
        "data_directory": DATA_DIR
    }


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "data_dir_exists": Path(DATA_DIR).exists(),
        "timestamp": datetime.now().isoformat()
    }


@app.get("/projects", response_model=List[str])
def list_projects():
    """List all project names"""
    try:
        projects = context_manager.get_all_projects()
        return projects
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list projects: {str(e)}")


@app.get("/contexts/search", response_model=List[ContextPreview])
def search_contexts(
    query: Optional[str] = Query(None, description="Search text (searches in note, tags, and text content)"),
    tags: Optional[str] = Query(None, description="Comma-separated tags (AND logic - all tags must match)"),
    type: Optional[str] = Query(None, description="Filter by context type (screenshot, text, text-file, etc.)"),
    project: Optional[str] = Query(None, description="Filter by project name"),
    dateFrom: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    dateTo: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of results (1-200)")
):
    """
    Search and filter contexts

    Example: `/contexts/search?query=bug&tags=urgent&project=MyProject&limit=20`
    """
    try:
        # Parse tags if provided
        tags_list = [tag.strip() for tag in tags.split(',')] if tags else None

        results = context_manager.search_contexts(
            query=query,
            tags=tags_list,
            type=type,
            project=project,
            dateFrom=dateFrom,
            dateTo=dateTo,
            limit=limit
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@app.get("/contexts/recent", response_model=List[ContextPreview])
def get_recent_contexts(
    limit: int = Query(20, ge=1, le=100, description="Number of contexts to return (1-100)"),
    project: Optional[str] = Query(None, description="Filter by project name")
):
    """Get recent contexts sorted by timestamp (newest first)"""
    try:
        results = context_manager.get_recent_contexts(limit=limit, project=project)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get recent contexts: {str(e)}")


@app.get("/contexts/{context_id}")
def get_context_detail(context_id: int):
    """
    Get full details of a specific context by ID

    For screenshots, includes the image as base64 in the 'screenshotBase64' field
    """
    try:
        context = context_manager.get_context_detail(context_id)
        return context
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get context: {str(e)}")


@app.post("/contexts")
def create_context(request: CreateContextRequest):
    """Create a new text context"""
    try:
        result = context_manager.create_context(
            project=request.project,
            content=request.content,
            type=request.type,
            note=request.note,
            tags=request.tags,
            metadata=request.metadata
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create context: {str(e)}")


@app.post("/contexts/file")
def save_file(request: SaveFileRequest):
    """
    Upload a file (screenshot or document)

    The file_data should be base64 encoded.
    """
    try:
        result = context_manager.save_file(
            project=request.project,
            file_data=request.file_data,
            file_name=request.file_name,
            file_type=request.file_type,
            note=request.note,
            tags=request.tags
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")


@app.put("/contexts/{context_id}")
def update_context(context_id: int, request: UpdateContextRequest):
    """Update an existing context"""
    try:
        result = context_manager.update_context(
            context_id=context_id,
            content=request.content,
            note=request.note,
            tags=request.tags,
            metadata=request.metadata
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update context: {str(e)}")


@app.delete("/projects/{project}")
def delete_project(project: str):
    """
    Delete a project and all its associated data (screenshots, files, contexts)

    **Warning:** This action cannot be undone!
    """
    try:
        result = context_manager.delete_project(project)
        if not result['success']:
            raise HTTPException(status_code=404, detail=result['message'])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    # Run the server
    print(f"Starting Context Manager API server...")
    print(f"Data directory: {DATA_DIR}")
    print(f"API docs: http://localhost:8000/docs")

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
