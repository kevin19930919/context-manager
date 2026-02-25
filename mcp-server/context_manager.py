import json
import base64
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional


class ContextManager:
    """Manages reading and searching contexts from Context Manager data directory."""

    def __init__(self, data_dir: str):
        self.data_dir = Path(data_dir)
        self.screenshots_dir = self.data_dir / 'screenshots'

    def get_all_projects(self) -> List[str]:
        """列出所有專案名稱"""
        if not self.screenshots_dir.exists():
            return []

        projects = []
        for item in self.screenshots_dir.iterdir():
            if item.is_dir() and item.name != '_temp':
                projects.append(item.name)
        return sorted(projects)

    def read_project_contexts(self, project: str) -> List[Dict]:
        """讀取特定專案的 contexts"""
        context_file = self.screenshots_dir / project / 'contexts.json'
        if not context_file.exists():
            return []

        try:
            with open(context_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading contexts for {project}: {e}")
            return []

    def get_all_contexts(self) -> List[Dict]:
        """獲取所有專案的 contexts"""
        all_contexts = []
        for project in self.get_all_projects():
            contexts = self.read_project_contexts(project)
            all_contexts.extend(contexts)
        return all_contexts

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
            from_date = datetime.fromisoformat(dateFrom.replace('Z', '+00:00'))
            contexts = [
                ctx for ctx in contexts
                if datetime.fromisoformat(ctx['timestamp'].replace('Z', '+00:00')) >= from_date
            ]

        if dateTo:
            to_date = datetime.fromisoformat(dateTo.replace('Z', '+00:00'))
            to_date = to_date.replace(hour=23, minute=59, second=59)
            contexts = [
                ctx for ctx in contexts
                if datetime.fromisoformat(ctx['timestamp'].replace('Z', '+00:00')) <= to_date
            ]

        # Sort by timestamp (newest first)
        contexts.sort(
            key=lambda x: datetime.fromisoformat(x['timestamp'].replace('Z', '+00:00')),
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
        if project:
            contexts = self.read_project_contexts(project)
        else:
            contexts = self.get_all_contexts()

        # Sort by timestamp
        contexts.sort(
            key=lambda x: datetime.fromisoformat(x['timestamp'].replace('Z', '+00:00')),
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
        project_dir = self.screenshots_dir / project
        project_dir.mkdir(parents=True, exist_ok=True)

        contexts = self.read_project_contexts(project)

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

        contexts.append(new_context)

        # Write to file
        context_file = project_dir / 'contexts.json'
        with open(context_file, 'w', encoding='utf-8') as f:
            json.dump(contexts, f, indent=2, ensure_ascii=False)

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

        # Write to file
        project_dir = self.screenshots_dir / project
        context_file = project_dir / 'contexts.json'
        with open(context_file, 'w', encoding='utf-8') as f:
            json.dump(contexts, f, indent=2, ensure_ascii=False)

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

        # 判斷是圖片還是一般檔案
        is_image = file_name.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp'))
        if is_image and file_type == 'file':
            file_type = 'screenshot'

        # 建立專案目錄
        project_dir = self.screenshots_dir / project
        project_dir.mkdir(parents=True, exist_ok=True)

        # 確定儲存路徑
        if file_type == 'screenshot':
            save_dir = project_dir
        else:
            # 一般檔案存在 files 子目錄
            files_dir = self.data_dir / 'files' / project
            files_dir.mkdir(parents=True, exist_ok=True)
            save_dir = files_dir

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

        # 寫入 contexts.json
        context_file = project_dir / 'contexts.json'
        with open(context_file, 'w', encoding='utf-8') as f:
            json.dump(contexts, f, indent=2, ensure_ascii=False)

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
