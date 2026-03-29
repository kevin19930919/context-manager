import json
import base64
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional


# Custom exceptions
class ProjectNotFoundError(Exception):
    """Raised when a project does not exist but is required."""
    pass


class ProjectAlreadyExistsError(Exception):
    """Raised when attempting to create a project that already exists."""
    pass


class ContextManager:
    """Manages reading and searching contexts from Context Manager data directory."""

    def __init__(self, data_dir: str):
        self.data_dir = Path(data_dir)
        self.screenshots_dir = self.data_dir / 'screenshots'
        self.files_dir = self.data_dir / 'files'

    def _validate_project_name(self, project: str) -> None:
        """Validate project name for security and correctness.

        Args:
            project: Project name to validate

        Raises:
            ValueError: If project name is invalid
        """
        # Check: Empty or whitespace-only
        if not project or project.strip() == '':
            raise ValueError("Project name cannot be empty")

        # Check: Leading/trailing whitespace (likely user error)
        if project != project.strip():
            raise ValueError(f"Project name cannot have leading/trailing whitespace: '{project}'")

        # Check: Length limits (filesystem compatibility)
        if len(project) > 255:
            raise ValueError(f"Project name too long (max 255 characters): {len(project)}")

        # Check: Path traversal attempts
        if '/' in project or '\\' in project:
            raise ValueError(f"Project name cannot contain path separators: '{project}'")

        # Check: Dot-only names (reserved on many filesystems)
        if project in ['.', '..']:
            raise ValueError(f"Project name cannot be '.' or '..'")

        # Check: Reserved names
        reserved_names = {'_temp', '__all__', '__new__', 'Unassigned'}
        if project in reserved_names:
            raise ValueError(f"Project name '{project}' is reserved")

        # Check: Null bytes (filesystem attack vector)
        if '\x00' in project:
            raise ValueError("Project name cannot contain null bytes")

        # Check: Control characters (can cause display/logging issues)
        if any(ord(c) < 32 for c in project):
            raise ValueError("Project name cannot contain control characters")

    def project_exists(self, project: str) -> bool:
        """Check if a project exists.

        A project exists if at least one directory exists (OR logic):
        - screenshots/{project}/ OR
        - files/{project}/

        This matches the behavior of get_all_projects().

        Args:
            project: Project name

        Returns:
            True if project exists, False otherwise
        """
        screenshots_dir = self.screenshots_dir / project
        files_dir = self.files_dir / project

        # Any directory exists means project exists (OR logic)
        return (screenshots_dir.exists() and screenshots_dir.is_dir()) or \
               (files_dir.exists() and files_dir.is_dir())

    def _ensure_project_exists(self, project: str) -> None:
        """Ensure project exists, raising exception if not.

        Validates project name and checks existence.

        Args:
            project: Project name

        Raises:
            ValueError: If project name is invalid
            ProjectNotFoundError: If project does not exist
        """
        # First validate the name
        self._validate_project_name(project)

        # Then check existence
        if not self.project_exists(project):
            raise ProjectNotFoundError(
                f"Project '{project}' does not exist. "
                f"Please create it first using create_project()"
            )

    def get_all_projects(self) -> List[str]:
        """列出所有專案名稱（從 screenshots 和 files 兩個資料夾）"""
        projects = set()

        # 掃描 screenshots 資料夾
        if self.screenshots_dir.exists():
            for item in self.screenshots_dir.iterdir():
                if item.is_dir() and item.name != '_temp':
                    projects.add(item.name)

        # 掃描 files 資料夾
        if self.files_dir.exists():
            for item in self.files_dir.iterdir():
                if item.is_dir():
                    projects.add(item.name)

        return sorted(list(projects))

    def create_project(self, project: str, description: str = '') -> Dict:
        """Create a new project with required directory structure.

        Creates:
        - screenshots/{project}/ directory
        - files/{project}/ directory
        - Empty contexts.json in both directories
        - project.json metadata file with description and timestamps

        Args:
            project: Project name (must be valid and unique)
            description: Optional project description

        Returns:
            {
                'success': True,
                'project': project_name,
                'message': success_message,
                'created': {
                    'screenshots_dir': path,
                    'files_dir': path,
                    'metadata': {...}
                }
            }

        Raises:
            ValueError: If project name is invalid
            ProjectAlreadyExistsError: If project already exists
        """
        # Validate project name
        self._validate_project_name(project)

        # Check if project already exists
        if self.project_exists(project):
            raise ProjectAlreadyExistsError(
                f"Project '{project}' already exists"
            )

        screenshots_dir = self.screenshots_dir / project
        files_dir = self.files_dir / project

        try:
            # Create directories
            screenshots_dir.mkdir(parents=True, exist_ok=False)
            files_dir.mkdir(parents=True, exist_ok=False)

            # Create empty contexts.json in both locations
            empty_contexts = []

            screenshots_context_file = screenshots_dir / 'contexts.json'
            with open(screenshots_context_file, 'w', encoding='utf-8') as f:
                json.dump(empty_contexts, f, indent=2, ensure_ascii=False)

            files_context_file = files_dir / 'contexts.json'
            with open(files_context_file, 'w', encoding='utf-8') as f:
                json.dump(empty_contexts, f, indent=2, ensure_ascii=False)

            # Create project metadata
            metadata = {
                'name': project,
                'description': description,
                'created_at': datetime.now().isoformat(),
                'version': '1.0'
            }

            metadata_file = screenshots_dir / 'project.json'
            with open(metadata_file, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            return {
                'success': True,
                'project': project,
                'message': f"Project '{project}' created successfully",
                'created': {
                    'screenshots_dir': str(screenshots_dir),
                    'files_dir': str(files_dir),
                    'metadata': metadata
                }
            }

        except Exception as e:
            # Cleanup on failure
            if screenshots_dir.exists():
                shutil.rmtree(screenshots_dir, ignore_errors=True)
            if files_dir.exists():
                shutil.rmtree(files_dir, ignore_errors=True)
            raise RuntimeError(f"Failed to create project: {e}") from e

    def read_project_contexts(self, project: str) -> List[Dict]:
        """讀取特定專案的 contexts（從 screenshots 和 files 兩個資料夾合併）"""
        all_contexts = []

        # 讀取 screenshots 資料夾的 contexts
        screenshots_context_file = self.screenshots_dir / project / 'contexts.json'
        if screenshots_context_file.exists():
            try:
                with open(screenshots_context_file, 'r', encoding='utf-8') as f:
                    all_contexts.extend(json.load(f))
            except Exception as e:
                print(f"Error reading screenshots contexts for {project}: {e}")

        # 讀取 files 資料夾的 contexts
        files_context_file = self.files_dir / project / 'contexts.json'
        if files_context_file.exists():
            try:
                with open(files_context_file, 'r', encoding='utf-8') as f:
                    all_contexts.extend(json.load(f))
            except Exception as e:
                print(f"Error reading files contexts for {project}: {e}")

        return all_contexts

    def _write_project_contexts(self, project: str, contexts: List[Dict]) -> None:
        """將 contexts 分別寫入到正確的位置（screenshots 或 files）

        Note: Assumes project exists and directories are set up.
        Public methods calling this should ensure project exists first.
        """
        # 分離不同類型的 contexts
        screenshot_contexts = [c for c in contexts if c.get('type') == 'screenshot' or c.get('screenshotPath')]
        file_contexts = [c for c in contexts if c.get('type') != 'screenshot' and not c.get('screenshotPath')]

        # 寫入 screenshots 資料夾
        screenshots_dir = self.screenshots_dir / project
        screenshots_context_file = screenshots_dir / 'contexts.json'
        with open(screenshots_context_file, 'w', encoding='utf-8') as f:
            json.dump(screenshot_contexts, f, indent=2, ensure_ascii=False)

        # 寫入 files 資料夾
        files_dir = self.files_dir / project
        files_context_file = files_dir / 'contexts.json'
        with open(files_context_file, 'w', encoding='utf-8') as f:
            json.dump(file_contexts, f, indent=2, ensure_ascii=False)

    def get_all_contexts(self) -> List[Dict]:
        """獲取所有專案的 contexts"""
        all_contexts = []
        for project in self.get_all_projects():
            contexts = self.read_project_contexts(project)
            all_contexts.extend(contexts)
        return all_contexts

    @staticmethod
    def _parse_timestamp(timestamp_str: str):
        """Parse timestamp handling both formats: with/without timezone"""
        from datetime import timezone
        try:
            # Handle 'Z' suffix (UTC)
            if timestamp_str.endswith('Z'):
                return datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            # Handle timestamps without timezone - assume UTC
            elif '+' not in timestamp_str and timestamp_str.count(':') >= 2:
                dt = datetime.fromisoformat(timestamp_str)
                # Make it timezone-aware (UTC)
                return dt.replace(tzinfo=timezone.utc)
            else:
                return datetime.fromisoformat(timestamp_str)
        except Exception as e:
            print(f"Error parsing timestamp '{timestamp_str}': {e}")
            return datetime.min.replace(tzinfo=timezone.utc)

    def search_contexts(
        self,
        query: Optional[str] = None,
        tags: Optional[List[str]] = None,
        type: Optional[str] = None,
        project: Optional[str] = None,
        dateFrom: Optional[str] = None,
        dateTo: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict]:
        """搜索和過濾 contexts"""
        # Validate project if specified
        if project:
            self._ensure_project_exists(project)

        # Get contexts from specific project or all
        if project:
            contexts = self.read_project_contexts(project)
        else:
            contexts = self.get_all_contexts()

        # Filter by query
        if query:
            keywords = query.lower().split()
            contexts = [
                ctx for ctx in contexts
                if all(
                    keyword in ' '.join([
                        ctx.get('note', ''),
                        ctx.get('textContent', ''),
                        ' '.join(ctx.get('tags', []))
                    ]).lower()
                    for keyword in keywords
                )
            ]

        # Filter by tags (AND logic)
        if tags:
            contexts = [
                ctx for ctx in contexts
                if all(tag in ctx.get('tags', []) for tag in tags)
            ]

        # Filter by type
        if type:
            contexts = [ctx for ctx in contexts if ctx.get('type') == type]

        # Filter by date range
        if dateFrom:
            from_date = self._parse_timestamp(dateFrom if dateFrom.endswith('Z') or '+' in dateFrom else dateFrom + 'Z')
            contexts = [
                ctx for ctx in contexts
                if self._parse_timestamp(ctx['timestamp']) >= from_date
            ]

        if dateTo:
            to_date = self._parse_timestamp(dateTo if dateTo.endswith('Z') or '+' in dateTo else dateTo + 'Z')
            to_date = to_date.replace(hour=23, minute=59, second=59)
            contexts = [
                ctx for ctx in contexts
                if self._parse_timestamp(ctx['timestamp']) <= to_date
            ]

        # Sort by timestamp (newest first)
        contexts.sort(
            key=lambda x: self._parse_timestamp(x['timestamp']),
            reverse=True
        )

        # Limit results and create preview
        return [
            {
                'id': ctx['id'],
                'timestamp': ctx['timestamp'],
                'project': ctx['project'],
                'tags': ctx.get('tags', []),
                'note': ctx.get('note', ''),
                'type': ctx['type'],
                'preview': ctx.get('textContent', '')[:100] + '...' if ctx.get('textContent') else None
            }
            for ctx in contexts[:limit]
        ]

    def get_context_detail(self, context_id: int) -> Dict:
        """獲取單個 context 的完整詳情，包括圖片 base64"""
        all_contexts = self.get_all_contexts()
        ctx = next((c for c in all_contexts if c['id'] == context_id), None)

        if not ctx:
            raise ValueError(f"Context {context_id} not found")

        # Include screenshot as base64
        if ctx['type'] == 'screenshot' and ctx.get('screenshotPath'):
            screenshot_path = Path(ctx['screenshotPath'])
            if screenshot_path.exists():
                with open(screenshot_path, 'rb') as f:
                    image_data = f.read()
                    ctx['screenshotBase64'] = base64.b64encode(image_data).decode('utf-8')
                    # Also include the file extension for proper mime type
                    ctx['screenshotExtension'] = screenshot_path.suffix

        return ctx

    def get_recent_contexts(self, limit: int = 20, project: Optional[str] = None) -> List[Dict]:
        """獲取最近的 contexts"""
        # Validate project if specified
        if project:
            self._ensure_project_exists(project)

        if project:
            contexts = self.read_project_contexts(project)
        else:
            contexts = self.get_all_contexts()

        # Sort by timestamp
        contexts.sort(
            key=lambda x: self._parse_timestamp(x['timestamp']),
            reverse=True
        )

        return [
            {
                'id': ctx['id'],
                'timestamp': ctx['timestamp'],
                'project': ctx['project'],
                'tags': ctx.get('tags', []),
                'note': ctx.get('note', ''),
                'type': ctx['type'],
                'preview': ctx.get('textContent', '')[:100] + '...' if ctx.get('textContent') else None
            }
            for ctx in contexts[:limit]
        ]

    def create_context(
        self,
        project: str,
        content: str,
        type: str = 'text',
        note: str = '',
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict] = None
    ) -> Dict:
        """創建新的 context"""
        # Ensure project exists
        self._ensure_project_exists(project)

        # Determine which directory to use based on type
        if type == 'screenshot':
            project_dir = self.screenshots_dir / project
        else:
            project_dir = self.files_dir / project

        # Auto-repair: ensure the specific directory exists
        # (project exists but might be missing this specific directory)
        if not project_dir.exists():
            project_dir.mkdir(parents=True, exist_ok=True)
            # Create empty contexts.json
            contexts_file = project_dir / 'contexts.json'
            with open(contexts_file, 'w', encoding='utf-8') as f:
                json.dump([], f, indent=2, ensure_ascii=False)

        # Read all contexts from both locations
        all_contexts = self.read_project_contexts(project)

        new_context = {
            'id': int(datetime.now().timestamp() * 1000),
            'timestamp': datetime.now().isoformat(),
            'project': project,
            'tags': tags or [],
            'note': note,
            'type': type,
            'screenshotPath': None,
            'textContent': content,
            'metadata': metadata or {}
        }

        all_contexts.append(new_context)

        # Split contexts by type and write to appropriate locations
        self._write_project_contexts(project, all_contexts)

        return {'success': True, 'contextId': new_context['id']}

    def save_discussion(
        self,
        project: str,
        topic: str,
        summary: str,
        details: Optional[str] = None,
        participants: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        related_files: Optional[List[str]] = None,
        related_contexts: Optional[List[int]] = None,
        links: Optional[List[str]] = None
    ) -> Dict:
        """保存討論內容"""
        content = {
            'topic': topic,
            'summary': summary,
            'details': details or '',
            'participants': participants or ['agent', 'user']
        }

        metadata = {
            'related_files': related_files or [],
            'related_contexts': related_contexts or [],
            'links': links or []
        }

        return self.create_context(
            project=project,
            content=json.dumps(content, ensure_ascii=False, indent=2),
            type='discussion',
            note=f"Discussion: {topic}",
            tags=tags or ['discussion'],
            metadata=metadata
        )

    def save_decision(
        self,
        project: str,
        title: str,
        context: str,
        decision: str,
        consequences: Optional[str] = None,
        alternatives: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        related_files: Optional[List[str]] = None,
        related_contexts: Optional[List[int]] = None
    ) -> Dict:
        """保存架構決策（ADR風格）"""
        content = {
            'title': title,
            'context': context,
            'decision': decision,
            'consequences': consequences or '',
            'alternatives': alternatives or []
        }

        metadata = {
            'related_files': related_files or [],
            'related_contexts': related_contexts or []
        }

        return self.create_context(
            project=project,
            content=json.dumps(content, ensure_ascii=False, indent=2),
            type='decision',
            note=f"Decision: {title}",
            tags=tags or ['decision'],
            metadata=metadata
        )

    def save_problem_solution(
        self,
        project: str,
        problem: str,
        solution: str,
        root_cause: Optional[str] = None,
        prevention: Optional[str] = None,
        tags: Optional[List[str]] = None,
        related_files: Optional[List[str]] = None,
        related_contexts: Optional[List[int]] = None
    ) -> Dict:
        """保存問題和解決方案"""
        content = {
            'problem': problem,
            'root_cause': root_cause or '',
            'solution': solution,
            'prevention': prevention or ''
        }

        metadata = {
            'related_files': related_files or [],
            'related_contexts': related_contexts or []
        }

        return self.create_context(
            project=project,
            content=json.dumps(content, ensure_ascii=False, indent=2),
            type='problem-solution',
            note=f"Problem & Solution: {problem[:50]}",
            tags=tags or ['problem-solution'],
            metadata=metadata
        )

    def save_api_design(
        self,
        project: str,
        name: str,
        description: str,
        parameters: Optional[Dict] = None,
        returns: Optional[str] = None,
        examples: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        related_files: Optional[List[str]] = None
    ) -> Dict:
        """保存API設計"""
        content = {
            'name': name,
            'description': description,
            'parameters': parameters or {},
            'returns': returns or '',
            'examples': examples or []
        }

        metadata = {
            'related_files': related_files or []
        }

        return self.create_context(
            project=project,
            content=json.dumps(content, ensure_ascii=False, indent=2),
            type='api-design',
            note=f"API: {name}",
            tags=tags or ['api-design'],
            metadata=metadata
        )

    def batch_save_items(
        self,
        project: str,
        items: List[Dict],
        tags: Optional[List[str]] = None
    ) -> Dict:
        """批量保存多個討論要點"""
        context_ids = []

        for item in items:
            result = self.create_context(
                project=project,
                content=item.get('content', ''),
                type=item.get('type', 'text'),
                note=item.get('note', ''),
                tags=tags or item.get('tags', []),
                metadata=item.get('metadata', {})
            )
            context_ids.append(result['contextId'])

        return {
            'success': True,
            'count': len(context_ids),
            'contextIds': context_ids
        }

    def save_session_log(
        self,
        project: str,
        task: str,
        what_done: List[str],
        challenges: Optional[List[str]] = None,
        decisions: Optional[List[int]] = None,
        incomplete: Optional[List[str]] = None,
        next_step: str = '',
        learning: str = '',
        ai_suggestions: Optional[List[str]] = None,
        start_time: str = None,
        end_time: str = None,
        status: str = 'completed',
        tags: Optional[List[str]] = None,
        related_files: Optional[List[str]] = None
    ) -> Dict:
        """保存 session log - 帮助下次快速恢复状态

        Args:
            project: 项目名称
            task: 任务描述
            what_done: 完成的事项列表
            challenges: 遇到的挑战或阻礙（卡住的点、不确定的地方）
            decisions: 关联的 decision context IDs
            incomplete: 未完成的事项
            next_step: 下次从哪里开始
            learning: 今天学到了什么（用户必须填写）
            ai_suggestions: AI 对 software engineer 成长的建议（本次 session 相关）
            start_time: 开始时间 (HH:MM)
            end_time: 结束时间 (HH:MM)
            status: 状态 (completed/in_progress)
            tags: 标签
            related_files: 相关文件列表
        """
        now = datetime.now()

        content = {
            'task': task,
            'what_done': what_done,
            'challenges': challenges or [],
            'decisions': decisions or [],
            'incomplete': incomplete or [],
            'next_step': next_step,
            'learning': learning,
            'ai_suggestions': ai_suggestions or [],
            'duration': {
                'start': start_time or now.strftime('%H:%M'),
                'end': end_time or now.strftime('%H:%M')
            },
            'status': status,
            'date': now.strftime('%Y-%m-%d')
        }

        metadata = {
            'related_files': related_files or [],
            'related_contexts': decisions or []
        }

        return self.create_context(
            project=project,
            content=json.dumps(content, ensure_ascii=False, indent=2),
            type='session-log',
            note=f"Session: {task}",
            tags=tags or ['session-log'],
            metadata=metadata
        )

    def get_latest_session(self, project: str) -> Optional[Dict]:
        """获取最近的 session log

        Args:
            project: 项目名称

        Returns:
            最近的 session log 详情，如果没有则返回 None

        Note:
            如果 project 不存在，返回 None（而不是拋出異常）
            這是合理的行為，因為可能是第一次使用這個 project
        """
        # Check if project exists first
        # If not, return None (no session log yet) instead of raising error
        if not self.project_exists(project):
            return None

        results = self.search_contexts(
            project=project,
            type='session-log',
            limit=1
        )

        if results:
            return self.get_context_detail(results[0]['id'])
        return None

    def update_context(
        self,
        context_id: int,
        content: Optional[str] = None,
        note: Optional[str] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict] = None
    ) -> Dict:
        """更新現有 context"""
        # Find the context
        all_contexts = self.get_all_contexts()
        ctx = next((c for c in all_contexts if c['id'] == context_id), None)

        if not ctx:
            raise ValueError(f"Context {context_id} not found")

        project = ctx['project']
        contexts = self.read_project_contexts(project)

        # Update the context
        for i, c in enumerate(contexts):
            if c['id'] == context_id:
                if content is not None:
                    contexts[i]['textContent'] = content
                if note is not None:
                    contexts[i]['note'] = note
                if tags is not None:
                    contexts[i]['tags'] = tags
                if metadata is not None:
                    contexts[i]['metadata'] = metadata
                contexts[i]['timestamp'] = datetime.now().isoformat()
                break

        # 使用新的寫入方法，會自動分離到正確的位置
        self._write_project_contexts(project, contexts)

        return {'success': True, 'contextId': context_id}

    def save_file(
        self,
        project: str,
        file_data: str,
        file_name: str,
        file_type: str = 'file',
        note: str = '',
        tags: Optional[List[str]] = None
    ) -> Dict:
        """保存檔案（支援 screenshot 和一般檔案）

        Args:
            project: 專案名稱
            file_data: base64 編碼的檔案內容
            file_name: 檔案名稱
            file_type: 'screenshot' 或 'file'
            note: 備註
            tags: 標籤列表
        """
        import os

        # Ensure project exists
        self._ensure_project_exists(project)

        # 判斷是圖片還是一般檔案
        is_image = file_name.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp'))
        if is_image and file_type == 'file':
            file_type = 'screenshot'

        # 確定儲存路徑
        if file_type == 'screenshot':
            save_dir = self.screenshots_dir / project
        else:
            # 一般檔案存在 files 子目錄
            save_dir = self.data_dir / 'files' / project

        # Auto-repair: ensure the specific directory exists
        if not save_dir.exists():
            save_dir.mkdir(parents=True, exist_ok=True)
            # Create empty contexts.json
            contexts_file = save_dir / 'contexts.json'
            with open(contexts_file, 'w', encoding='utf-8') as f:
                json.dump([], f, indent=2, ensure_ascii=False)

        # 解碼並儲存檔案
        try:
            file_bytes = base64.b64decode(file_data)
        except Exception as e:
            raise ValueError(f"Invalid base64 data: {e}")

        # 生成唯一檔名（加上時間戳）
        timestamp = int(datetime.now().timestamp() * 1000)
        file_ext = Path(file_name).suffix
        unique_filename = f"{Path(file_name).stem}-{timestamp}{file_ext}"
        file_path = save_dir / unique_filename

        # 寫入檔案
        with open(file_path, 'wb') as f:
            f.write(file_bytes)

        # 讀取現有 contexts
        contexts = self.read_project_contexts(project)

        # 建立新 context
        new_context = {
            'id': timestamp,
            'timestamp': datetime.now().isoformat(),
            'project': project,
            'tags': tags or ['uploaded'],
            'note': note or f"Uploaded: {file_name}",
            'type': file_type,
            'fileName': file_name,
            'fileSize': len(file_bytes),
            'fileType': self._get_mime_type(file_name)
        }

        if file_type == 'screenshot':
            new_context['screenshotPath'] = str(file_path)
            new_context['textContent'] = None
        else:
            new_context['filePath'] = str(file_path)
            new_context['screenshotPath'] = None
            # 如果是文字檔案，嘗試讀取內容
            if file_ext.lower() in ['.txt', '.md', '.json', '.csv', '.xml']:
                try:
                    new_context['textContent'] = file_bytes.decode('utf-8')
                except:
                    new_context['textContent'] = None
            else:
                new_context['textContent'] = None

        contexts.append(new_context)

        # 使用新的寫入方法，會自動分離到正確的位置
        self._write_project_contexts(project, contexts)

        return {
            'success': True,
            'contextId': new_context['id'],
            'filePath': str(file_path),
            'fileType': file_type
        }

    def _get_mime_type(self, filename: str) -> str:
        """根據副檔名判斷 MIME type"""
        ext = Path(filename).suffix.lower()
        mime_types = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.pdf': 'application/pdf',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.json': 'application/json',
            '.csv': 'text/csv',
            '.xml': 'application/xml',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
        return mime_types.get(ext, 'application/octet-stream')

    def delete_project(self, project: str) -> Dict:
        """刪除整個 project 及其所有資料

        Args:
            project: 專案名稱

        Returns:
            Dict: {'success': True/False, 'message': str}
        """
        if not project or project.strip() == '':
            return {'success': False, 'message': 'Project name cannot be empty'}

        project_dir = self.screenshots_dir / project
        files_dir = self.data_dir / 'files' / project

        deleted_items = []

        # 刪除 screenshots 目錄下的 project 資料夾
        if project_dir.exists():
            try:
                shutil.rmtree(project_dir)
                deleted_items.append(f'screenshots/{project}')
            except Exception as e:
                return {'success': False, 'message': f'Failed to delete project screenshots: {str(e)}'}

        # 刪除 files 目錄下的 project 資料夾（如果存在）
        if files_dir.exists():
            try:
                shutil.rmtree(files_dir)
                deleted_items.append(f'files/{project}')
            except Exception as e:
                return {'success': False, 'message': f'Failed to delete project files: {str(e)}'}

        if not deleted_items:
            return {'success': False, 'message': f'Project "{project}" does not exist'}

        return {
            'success': True,
            'message': f'Successfully deleted project "{project}"',
            'deleted': deleted_items
        }
