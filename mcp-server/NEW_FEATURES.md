# Context Manager MCP Server - 新功能说明

## 概览

为 Context Manager MCP server 新增了一套完整的讨论管理工具集，让 AI agent 能够在对话过程中方便地保存重要信息。

## 新增工具

### 1. `save_discussion` - 保存讨论内容

用于记录重要的讨论主题、结论或协作决策。

**参数：**
- `project` (必需): 项目名称
- `topic` (必需): 讨论主题/标题
- `summary` (必需): 简要摘要
- `details` (可选): 详细讨论内容
- `participants` (可选): 参与者列表，默认 `["agent", "user"]`
- `tags` (可选): 标签数组
- `related_files` (可选): 相关代码文件路径数组
- `related_contexts` (可选): 相关 context ID 数组
- `links` (可选): 外部链接数组

**示例：**
```python
manager.save_discussion(
    project="my-project",
    topic="API 接口设计讨论",
    summary="讨论了新的用户认证 API 设计",
    details="决定使用 JWT token 进行认证...",
    tags=["api-design", "authentication"],
    related_files=["src/api/auth.py"]
)
```

### 2. `save_decision` - 保存架构决策

使用 ADR (Architecture Decision Record) 风格记录重要的技术决策。

**参数：**
- `project` (必需): 项目名称
- `title` (必需): 决策标题
- `context` (必需): 背景上下文 - 为什么需要这个决策
- `decision` (必需): 做出的决策内容
- `consequences` (可选): 预期的后果和影响
- `alternatives` (可选): 考虑过的替代方案数组
- `tags` (可选): 标签数组
- `related_files` (可选): 相关代码文件路径数组
- `related_contexts` (可选): 相关 context ID 数组

**示例：**
```python
manager.save_decision(
    project="my-project",
    title="使用 PostgreSQL 作为主数据库",
    context="需要一个可靠的关系型数据库来存储用户数据",
    decision="选择 PostgreSQL 作为主数据库",
    consequences="获得强大的 ACID 支持，但需要额外的运维成本",
    alternatives=["MySQL", "MongoDB", "SQLite"],
    tags=["decision", "database"]
)
```

### 3. `save_problem_solution` - 保存问题和解决方案

记录遇到的问题、根本原因和解决方案。

**参数：**
- `project` (必需): 项目名称
- `problem` (必需): 问题描述
- `solution` (必需): 解决方案
- `root_cause` (可选): 根本原因分析
- `prevention` (可选): 如何预防该问题
- `tags` (可选): 标签数组
- `related_files` (可选): 相关代码文件路径数组
- `related_contexts` (可选): 相关 context ID 数组

**示例：**
```python
manager.save_problem_solution(
    project="my-project",
    problem="用户登录时偶尔返回 500 错误",
    root_cause="数据库连接池耗尽",
    solution="增加连接池大小并添加连接超时处理",
    prevention="添加监控和告警，定期检查连接池使用情况",
    tags=["bug-fix", "database"],
    related_files=["src/db/connection.py"]
)
```

### 4. `save_api_design` - 保存 API 设计

记录 API 接口、函数签名和使用示例。

**参数：**
- `project` (必需): 项目名称
- `name` (必需): API 端点或函数名称
- `description` (必需): 功能描述
- `parameters` (可选): 参数字典 `{name: description}`
- `returns` (可选): 返回值描述
- `examples` (可选): 使用示例数组
- `tags` (可选): 标签数组
- `related_files` (可选): 相关代码文件路径数组

**示例：**
```python
manager.save_api_design(
    project="my-project",
    name="POST /api/auth/login",
    description="用户登录接口",
    parameters={
        "email": "用户邮箱",
        "password": "用户密码"
    },
    returns="{ token: string, user: object }",
    examples=[
        "curl -X POST /api/auth/login -d '{\"email\":\"user@example.com\",\"password\":\"secret\"}'",
    ],
    tags=["api-design", "authentication"]
)
```

### 5. `batch_save_items` - 批量保存

一次性保存多个讨论要点或笔记。

**参数：**
- `project` (必需): 项目名称
- `items` (必需): 要保存的项目数组，每个项目包含：
  - `content`: 内容
  - `type`: 类型
  - `note`: 备注
  - `tags`: 标签
  - `metadata`: 元数据
- `tags` (可选): 应用于所有项目的通用标签

**示例：**
```python
manager.batch_save_items(
    project="my-project",
    items=[
        {
            "content": "要点1：使用 Redis 缓存",
            "type": "text",
            "note": "讨论要点1",
            "tags": ["discussion"]
        },
        {
            "content": "要点2：实现限流机制",
            "type": "text",
            "note": "讨论要点2",
            "tags": ["discussion"]
        }
    ],
    tags=["meeting-notes", "2026-02-13"]
)
```

### 6. `update_context` - 更新现有 context

更新已存在的 context 的内容、标签或元数据。

**参数：**
- `context_id` (必需): 要更新的 context ID
- `content` (可选): 新的内容
- `note` (可选): 新的备注
- `tags` (可选): 新的标签数组
- `metadata` (可选): 新的元数据

**示例：**
```python
manager.update_context(
    context_id=1234567890,
    tags=["discussion", "completed"],
    metadata={"status": "resolved", "version": "2.0"}
)
```

## 数据结构

### Context 类型

新增了以下 context 类型：
- `discussion`: 讨论记录
- `decision`: 架构决策
- `problem-solution`: 问题和解决方案
- `api-design`: API 设计文档

### Metadata 字段

新增的 `metadata` 字段可以存储：
- `related_files`: 相关文件路径数组
- `related_contexts`: 关联的其他 context ID 数组
- `links`: 外部链接数组
- 任何其他自定义字段

### 数据存储格式

所有结构化数据都以 JSON 格式存储在 `textContent` 字段中，例如：

```json
{
  "id": 1234567890,
  "timestamp": "2026-02-13T17:27:17.944346",
  "project": "my-project",
  "type": "discussion",
  "note": "Discussion: API 接口设计讨论",
  "tags": ["discussion", "api-design"],
  "textContent": "{\"topic\": \"API 接口设计讨论\", \"summary\": \"...\", ...}",
  "metadata": {
    "related_files": ["src/api/auth.py"],
    "related_contexts": [1234567889],
    "links": ["https://example.com/doc"]
  }
}
```

## 如何启用新功能

### 方法 1: 重启 Claude Code

1. 完全退出 Claude Code
2. 重新启动 Claude Code
3. MCP server 会自动加载新功能

### 方法 2: 在 VSCode 中重新加载窗口

1. 在 VSCode 中按 `Cmd+Shift+P` (Mac) 或 `Ctrl+Shift+P` (Windows/Linux)
2. 输入 "Reload Window" 并执行
3. Claude Code 会重新连接到 MCP server

### 验证新功能

重启后，你可以要求 agent 使用新功能：

```
请把我们刚才讨论的 API 设计保存到 "my-project" 项目中
```

Agent 会自动使用 `save_discussion` 或 `save_api_design` 等工具来保存内容。

## Agent 使用指南

当你在和 agent 讨论项目时，可以这样请求保存内容：

1. **保存讨论**：
   - "请把这个讨论保存到项目中"
   - "记录一下我们刚才的结论"

2. **保存决策**：
   - "请记录这个架构决策"
   - "把这个技术选型的理由保存下来"

3. **保存问题解决方案**：
   - "记录一下这个 bug 和解决方法"
   - "保存这个问题的排查过程"

4. **保存 API 设计**：
   - "记录这个 API 接口的设计"
   - "把这个函数的签名和用法保存下来"

Agent 会自动选择合适的工具并填充必要的字段。

## 搜索和查询

所有保存的内容都可以通过现有的搜索功能查找：

```python
# 搜索所有决策记录
manager.search_contexts(type="decision")

# 搜索特定标签
manager.search_contexts(tags=["api-design"])

# 在特定项目中搜索
manager.search_contexts(project="my-project", query="authentication")
```

## 测试

运行测试脚本验证功能：

```bash
cd /Users/itsai/PersonalBusiness/context-manager/mcp-server
python3 test_new_features.py
```

## 反馈和改进

如有任何问题或建议，欢迎提出！这些新功能旨在让 AI agent 在协作过程中更好地记录和组织重要信息。
