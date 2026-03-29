#!/usr/bin/env python3
"""
Context Manager MCP Server

Exposes Context Manager data to Claude Code via MCP protocol.
Provides tools for searching, reading, and creating contexts.
"""

import asyncio
import json
import logging
import sys
from pathlib import Path

# Add current directory to Python path to allow importing context_manager
sys.path.insert(0, str(Path(__file__).parent))

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Resource, Tool, TextContent
from context_manager import ContextManager, ProjectNotFoundError, ProjectAlreadyExistsError

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Context Manager
DATA_DIR = '/Users/itsai/PersonalBusiness/context-manager/data'
manager = ContextManager(DATA_DIR)

# Create MCP server
app = Server("context-manager")

logger.info(f"Context Manager MCP Server initialized with data dir: {DATA_DIR}")


# Resources
@app.list_resources()
async def list_resources() -> list[Resource]:
    """List available resources"""
    return [
        Resource(
            uri="context-manager://projects",
            name="All Projects",
            mimeType="application/json",
            description="List of all projects in Context Manager"
        ),
        Resource(
            uri="context-manager://recent",
            name="Recent Contexts",
            mimeType="application/json",
            description="Recently captured contexts (last 50)"
        )
    ]


@app.read_resource()
async def read_resource(uri: str) -> str:
    """Read resource content"""
    logger.info(f"Reading resource: {uri}")

    if uri == "context-manager://projects":
        projects = manager.get_all_projects()
        return json.dumps(projects, indent=2)

    if uri == "context-manager://recent":
        contexts = manager.get_recent_contexts(50)
        return json.dumps(contexts, indent=2)

    raise ValueError(f"Unknown resource: {uri}")


# Tools
@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools"""
    return [
        Tool(
            name="search_contexts",
            description="Search contexts by query, tags, type, project, and date range. Returns metadata only (not full content).",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search text (searches in note, tags, and text content)"
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Filter by tags (AND logic - all tags must match)"
                    },
                    "type": {
                        "type": "string",
                        "enum": ["screenshot", "text", "text-file", "discussion", "decision", "problem-solution", "api-design", "session-log"],
                        "description": "Filter by context type"
                    },
                    "project": {
                        "type": "string",
                        "description": "Filter by project name"
                    },
                    "dateFrom": {
                        "type": "string",
                        "description": "Start date (YYYY-MM-DD)"
                    },
                    "dateTo": {
                        "type": "string",
                        "description": "End date (YYYY-MM-DD)"
                    },
                    "limit": {
                        "type": "number",
                        "default": 50,
                        "description": "Maximum number of results"
                    }
                }
            }
        ),
        Tool(
            name="get_context_detail",
            description="Get full details of a specific context by ID, including screenshot image as base64 if applicable.",
            inputSchema={
                "type": "object",
                "properties": {
                    "id": {
                        "type": "number",
                        "description": "Context ID"
                    }
                },
                "required": ["id"]
            }
        ),
        Tool(
            name="create_context",
            description="Create a new text context (note/snippet) in Context Manager.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Project name"
                    },
                    "type": {
                        "type": "string",
                        "enum": ["text", "text-file"],
                        "default": "text",
                        "description": "Context type"
                    },
                    "content": {
                        "type": "string",
                        "description": "Text content"
                    },
                    "note": {
                        "type": "string",
                        "description": "Description/note about this context"
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Tags for organization"
                    }
                },
                "required": ["project", "content"]
            }
        ),
        Tool(
            name="save_file",
            description="Save a file (image, PDF, document, etc.) to Context Manager. Accepts base64-encoded file content.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Project name"
                    },
                    "file_data": {
                        "type": "string",
                        "description": "Base64-encoded file content"
                    },
                    "file_name": {
                        "type": "string",
                        "description": "Original file name with extension (e.g., 'screenshot.png', 'document.pdf')"
                    },
                    "file_type": {
                        "type": "string",
                        "enum": ["screenshot", "file"],
                        "default": "file",
                        "description": "File type: 'screenshot' for images, 'file' for other documents"
                    },
                    "note": {
                        "type": "string",
                        "description": "Description/note about this file"
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Tags for organization"
                    }
                },
                "required": ["project", "file_data", "file_name"]
            }
        ),
        Tool(
            name="list_projects",
            description="List all project names in Context Manager.",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        ),
        Tool(
            name="delete_project",
            description="Delete a project and all its associated data (screenshots, files, contexts). This action cannot be undone.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Name of the project to delete"
                    }
                },
                "required": ["project"]
            }
        ),
        Tool(
            name="create_project",
            description="Create a new project in Context Manager. Must be called before saving any contexts to a new project.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Project name (must be unique, no special characters or path separators)"
                    },
                    "description": {
                        "type": "string",
                        "description": "Optional project description"
                    }
                },
                "required": ["project"]
            }
        ),
        Tool(
            name="project_exists",
            description="Check if a project exists in Context Manager.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Project name to check"
                    }
                },
                "required": ["project"]
            }
        ),
        Tool(
            name="get_recent_contexts",
            description="Get recent contexts sorted by timestamp (newest first).",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Filter by project name (optional)"
                    },
                    "limit": {
                        "type": "number",
                        "default": 20,
                        "description": "Number of contexts to return"
                    }
                }
            }
        ),
        Tool(
            name="save_discussion",
            description="Save a discussion topic with summary and details. Use this when you want to record important discussions, conclusions, or collaborative decisions.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Project name"
                    },
                    "topic": {
                        "type": "string",
                        "description": "Discussion topic/title"
                    },
                    "summary": {
                        "type": "string",
                        "description": "Brief summary of the discussion"
                    },
                    "details": {
                        "type": "string",
                        "description": "Detailed discussion content (optional)"
                    },
                    "participants": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of participants (default: ['agent', 'user'])"
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Tags for categorization"
                    },
                    "related_files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Related code file paths"
                    },
                    "related_contexts": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "Related context IDs"
                    },
                    "links": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "External links or references"
                    }
                },
                "required": ["project", "topic", "summary"]
            }
        ),
        Tool(
            name="save_decision",
            description="Save an architectural decision record (ADR-style). Use this for important technical decisions, architecture choices, or design tradeoffs.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Project name"
                    },
                    "title": {
                        "type": "string",
                        "description": "Decision title"
                    },
                    "context": {
                        "type": "string",
                        "description": "Background context - why this decision was needed"
                    },
                    "decision": {
                        "type": "string",
                        "description": "The decision that was made"
                    },
                    "consequences": {
                        "type": "string",
                        "description": "Expected consequences and impacts"
                    },
                    "alternatives": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Alternative approaches that were considered"
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Tags for categorization"
                    },
                    "related_files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Related code file paths"
                    },
                    "related_contexts": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "Related context IDs"
                    }
                },
                "required": ["project", "title", "context", "decision"]
            }
        ),
        Tool(
            name="save_problem_solution",
            description="Save a problem description along with its solution. Use this when documenting bugs, issues, and how they were resolved.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Project name"
                    },
                    "problem": {
                        "type": "string",
                        "description": "Problem description"
                    },
                    "solution": {
                        "type": "string",
                        "description": "How the problem was solved"
                    },
                    "root_cause": {
                        "type": "string",
                        "description": "Root cause analysis"
                    },
                    "prevention": {
                        "type": "string",
                        "description": "How to prevent this in the future"
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Tags for categorization"
                    },
                    "related_files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Related code file paths"
                    },
                    "related_contexts": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "Related context IDs"
                    }
                },
                "required": ["project", "problem", "solution"]
            }
        ),
        Tool(
            name="save_api_design",
            description="Save API design documentation including endpoints, functions, parameters, and examples.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Project name"
                    },
                    "name": {
                        "type": "string",
                        "description": "API endpoint or function name"
                    },
                    "description": {
                        "type": "string",
                        "description": "What this API does"
                    },
                    "parameters": {
                        "type": "object",
                        "description": "Parameters/arguments (name: description)"
                    },
                    "returns": {
                        "type": "string",
                        "description": "Return value description"
                    },
                    "examples": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Usage examples"
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Tags for categorization"
                    },
                    "related_files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Related code file paths"
                    }
                },
                "required": ["project", "name", "description"]
            }
        ),
        Tool(
            name="batch_save_items",
            description="Batch save multiple discussion items at once. Each item can have different types and properties.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Project name"
                    },
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "content": {"type": "string"},
                                "type": {"type": "string"},
                                "note": {"type": "string"},
                                "tags": {
                                    "type": "array",
                                    "items": {"type": "string"}
                                },
                                "metadata": {"type": "object"}
                            }
                        },
                        "description": "Array of items to save"
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Common tags to apply to all items"
                    }
                },
                "required": ["project", "items"]
            }
        ),
        Tool(
            name="update_context",
            description="Update an existing context by ID. Can update content, note, tags, or metadata.",
            inputSchema={
                "type": "object",
                "properties": {
                    "context_id": {
                        "type": "number",
                        "description": "Context ID to update"
                    },
                    "content": {
                        "type": "string",
                        "description": "New content (optional)"
                    },
                    "note": {
                        "type": "string",
                        "description": "New note (optional)"
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "New tags (optional)"
                    },
                    "metadata": {
                        "type": "object",
                        "description": "New metadata (optional)"
                    }
                },
                "required": ["context_id"]
            }
        ),
        Tool(
            name="save_session_log",
            description="Save a session log entry to help quickly restore state in the next session. Records what was done, decisions made, incomplete items, and learnings.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Project name"
                    },
                    "task": {
                        "type": "string",
                        "description": "Task description"
                    },
                    "what_done": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of completed items"
                    },
                    "challenges": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Challenges or blockers encountered during the session"
                    },
                    "decisions": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "Related decision context IDs"
                    },
                    "incomplete": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of incomplete items"
                    },
                    "next_step": {
                        "type": "string",
                        "description": "Where to start next time"
                    },
                    "learning": {
                        "type": "string",
                        "description": "What did you learn today? (user must fill this)"
                    },
                    "ai_suggestions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "AI suggestions for software engineer growth based on this session"
                    },
                    "start_time": {
                        "type": "string",
                        "description": "Start time (HH:MM)"
                    },
                    "end_time": {
                        "type": "string",
                        "description": "End time (HH:MM)"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["completed", "in_progress"],
                        "default": "completed",
                        "description": "Session status"
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Tags for categorization"
                    },
                    "related_files": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Related code file paths"
                    }
                },
                "required": ["project", "task", "what_done"]
            }
        ),
        Tool(
            name="get_latest_session",
            description="Get the most recent session log for a project to quickly restore state from the last session.",
            inputSchema={
                "type": "object",
                "properties": {
                    "project": {
                        "type": "string",
                        "description": "Project name"
                    }
                },
                "required": ["project"]
            }
        )
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool calls"""
    logger.info(f"Tool called: {name} with args: {arguments}")

    try:
        if name == "search_contexts":
            result = manager.search_contexts(**arguments)
            logger.info(f"search_contexts returned {len(result)} results")

        elif name == "get_context_detail":
            result = manager.get_context_detail(arguments["id"])
            logger.info(f"get_context_detail returned context {arguments['id']}")

        elif name == "create_context":
            result = manager.create_context(**arguments)
            logger.info(f"create_context created context in project {arguments.get('project')}")

        elif name == "save_file":
            result = manager.save_file(**arguments)
            logger.info(f"save_file saved {arguments.get('file_name')} in project {arguments.get('project')}")

        elif name == "list_projects":
            result = manager.get_all_projects()
            logger.info(f"list_projects returned {len(result)} projects")

        elif name == "delete_project":
            result = manager.delete_project(arguments["project"])
            logger.info(f"delete_project deleted project {arguments.get('project')}")

        elif name == "create_project":
            result = manager.create_project(
                arguments["project"],
                arguments.get("description", "")
            )
            logger.info(f"create_project created project {arguments['project']}")

        elif name == "project_exists":
            exists = manager.project_exists(arguments["project"])
            result = {
                "project": arguments["project"],
                "exists": exists
            }
            logger.info(f"project_exists checked {arguments['project']}: {exists}")

        elif name == "get_recent_contexts":
            result = manager.get_recent_contexts(
                arguments.get("limit", 20),
                arguments.get("project")
            )
            logger.info(f"get_recent_contexts returned {len(result)} contexts")

        elif name == "save_discussion":
            result = manager.save_discussion(**arguments)
            logger.info(f"save_discussion created context in project {arguments.get('project')}")

        elif name == "save_decision":
            result = manager.save_decision(**arguments)
            logger.info(f"save_decision created context in project {arguments.get('project')}")

        elif name == "save_problem_solution":
            result = manager.save_problem_solution(**arguments)
            logger.info(f"save_problem_solution created context in project {arguments.get('project')}")

        elif name == "save_api_design":
            result = manager.save_api_design(**arguments)
            logger.info(f"save_api_design created context in project {arguments.get('project')}")

        elif name == "batch_save_items":
            result = manager.batch_save_items(**arguments)
            logger.info(f"batch_save_items saved {result.get('count')} items in project {arguments.get('project')}")

        elif name == "update_context":
            result = manager.update_context(**arguments)
            logger.info(f"update_context updated context {arguments.get('context_id')}")

        elif name == "save_session_log":
            result = manager.save_session_log(**arguments)
            logger.info(f"save_session_log created session log in project {arguments.get('project')}")

        elif name == "get_latest_session":
            result = manager.get_latest_session(arguments["project"])
            if result is None:
                result = {"message": f"No session logs found for project {arguments['project']}"}
            logger.info(f"get_latest_session returned session for project {arguments.get('project')}")

        else:
            raise ValueError(f"Unknown tool: {name}")

        return [TextContent(
            type="text",
            text=json.dumps(result, indent=2, ensure_ascii=False)
        )]

    except ProjectNotFoundError as e:
        logger.warning(f"Project not found in tool {name}: {e}")
        return [TextContent(
            type="text",
            text=json.dumps({
                "error": str(e),
                "error_type": "ProjectNotFound",
                "hint": "Use create_project tool to create the project first"
            }, indent=2)
        )]

    except ProjectAlreadyExistsError as e:
        logger.warning(f"Project already exists in tool {name}: {e}")
        return [TextContent(
            type="text",
            text=json.dumps({
                "error": str(e),
                "error_type": "ProjectAlreadyExists",
                "hint": "Choose a different project name or delete the existing project"
            }, indent=2)
        )]

    except ValueError as e:
        logger.warning(f"Validation error in tool {name}: {e}")
        return [TextContent(
            type="text",
            text=json.dumps({
                "error": str(e),
                "error_type": "ValidationError"
            }, indent=2)
        )]

    except Exception as e:
        logger.error(f"Error in tool {name}: {e}", exc_info=True)
        return [TextContent(
            type="text",
            text=json.dumps({
                "error": str(e),
                "error_type": "InternalError"
            }, indent=2)
        )]


async def main():
    """Main entry point"""
    logger.info("Starting Context Manager MCP Server...")

    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
