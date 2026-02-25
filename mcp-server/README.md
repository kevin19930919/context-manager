# Context Manager MCP Server

將 Context Manager 的資料暴露給 Claude Code，讓你可以在 IDE 中直接查詢和管理 contexts！

## 功能

- 🔍 **搜索 Contexts** - 按關鍵字、標籤、類型、專案、日期過濾
- 📸 **查看截圖** - 自動編碼圖片為 base64，AI 可以「看到」截圖內容
- 💾 **創建 Context** - 從 Claude Code 中儲存筆記到 Context Manager
- 📋 **列出專案** - 查看所有專案名稱
- ⏰ **最近的 Contexts** - 快速獲取最新的 contexts

## 安裝

### 1. 安裝 Python 依賴

```bash
cd mcp-server
pip install mcp
```

或使用 uv（更快）：
```bash
uv pip install mcp
```

### 2. 測試 Server

```bash
python3 server.py
```

應該看到：
```
INFO:__main__:Context Manager MCP Server initialized with data dir: /Users/itsai/PersonalBusiness/ context-manager/data
INFO:__main__:Starting Context Manager MCP Server...
```

按 Ctrl+C 停止。

## 配置 Claude Code

### 1. 創建配置文件

編輯或創建 `~/.claude/mcp_settings.json`：

```json
{
  "mcpServers": {
    "context-manager": {
      "command": "python3",
      "args": ["/Users/itsai/PersonalBusiness/ context-manager/mcp-server/server.py"],
      "env": {}
    }
  }
}
```

### 2. 重啟 Claude Code

完全退出並重新啟動 Claude Code。

### 3. 驗證連接

在 Claude Code 設定中檢查 MCP 狀態，應該看到 `context-manager` 已連接。

## 使用方式

在 Claude Code 中，你可以直接問：

### 搜索 Contexts
```
幫我找最近的 bug 截圖
```

```
搜索 "API" 相關的筆記
```

```
"Streamline V2 PSR" 專案中有哪些截圖？
```

### 查看特定 Context
```
ID 1770606224061 這個截圖顯示什麼錯誤？
```

### 創建新 Context
```
把這個解決方案存到 Context Manager 的 "MyProject" 專案
```

### 列出專案
```
我有哪些專案？
```

## 提供的工具

### 1. `search_contexts`
搜索和過濾 contexts。

**參數**：
- `query` (string): 搜索文字
- `tags` (array): 標籤過濾（AND 邏輯）
- `type` (string): 類型過濾 (`screenshot`, `text`, `text-file`)
- `project` (string): 專案過濾
- `dateFrom` (string): 開始日期 (YYYY-MM-DD)
- `dateTo` (string): 結束日期 (YYYY-MM-DD)
- `limit` (number): 結果數量限制 (預設 50)

**返回**：Context 陣列（metadata only）

### 2. `get_context_detail`
獲取單個 context 的完整內容（包括圖片 base64）。

**參數**：
- `id` (number): Context ID

**返回**：完整的 Context 物件

### 3. `create_context`
創建新的文字 context。

**參數**：
- `project` (string, required): 專案名稱
- `content` (string, required): 文字內容
- `type` (string): 類型 (`text` or `text-file`，預設 `text`)
- `note` (string): 描述
- `tags` (array): 標籤

**返回**：`{ success: true, contextId: ... }`

### 4. `list_projects`
列出所有專案名稱。

**返回**：專案名稱陣列

### 5. `get_recent_contexts`
獲取最近的 contexts。

**參數**：
- `project` (string, optional): 專案過濾
- `limit` (number): 數量 (預設 20)

**返回**：Context 陣列

## 提供的 Resources

### 1. `context-manager://projects`
所有專案名稱列表。

### 2. `context-manager://recent`
最近的 50 個 contexts。

## 故障排除

### Server 無法啟動
```bash
# 檢查 Python 版本（需要 >= 3.10）
python3 --version

# 重新安裝依賴
pip install --upgrade mcp
```

### Claude Code 未連接
1. 檢查 `~/.claude/mcp_settings.json` 路徑是否正確
2. 確認 server.py 路徑是絕對路徑
3. 完全重啟 Claude Code（不只是重新載入視窗）
4. 查看 Claude Code 的日誌

### 找不到 Contexts
確認 DATA_DIR 路徑正確：
- 檢查 `server.py` 中的 `DATA_DIR` 變數
- 確認 `data/screenshots/` 目錄存在

## 開發

### 目錄結構
```
mcp-server/
├── pyproject.toml         # Python 依賴
├── server.py              # MCP server 主程式
├── context_manager.py     # Context 管理邏輯
└── README.md              # 本文件
```

### 修改 DATA_DIR
編輯 `server.py` 的 `DATA_DIR` 變數：
```python
DATA_DIR = '/your/custom/path/data'
```

### 調試模式
設定環境變數啟用詳細日誌：
```bash
export PYTHONUNBUFFERED=1
python3 server.py
```

## 授權

MIT License
