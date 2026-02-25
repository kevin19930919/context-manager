# Testing Guide

這個專案使用 Jest 進行單元測試和整合測試。

## 測試命令

```bash
# 執行所有測試
npm test

# 監視模式 - 自動重新執行測試
npm run test:watch

# 生成測試覆蓋率報告
npm run test:coverage
```

## 測試結構

```
__tests__/
├── utils.test.js           # 輔助函數測試
└── file-handling.test.js   # 檔案處理和 Context 操作測試
```

## 測試覆蓋範圍

### ✅ 已測試的功能

#### 輔助函數 (`utils.test.js`)
- `formatFileSize()` - 檔案大小格式化
- `formatTime()` - 時間格式化
- `getFileType()` - 檔案類型識別
- `getFileIcon()` - 檔案圖示選擇
- `validateContext()` - Context 資料驗證

#### 檔案處理 (`file-handling.test.js`)
- **Context 檔案操作**
  - 建立 project 目錄
  - 儲存 context 到 JSON
  - 讀取 contexts
  - 更新 context
  - 刪除 context

- **檔案類型偵測**
  - 識別圖片檔案
  - 識別文字檔案
  - 識別其他檔案類型

- **檔案儲存**
  - 決定正確的儲存目錄
  - 生成唯一檔案名稱

- **Context 資料結構**
  - Screenshot context
  - File context
  - Text-file context

## 測試統計

- **測試套件**: 2 個
- **測試案例**: 41 個
- **通過率**: 100%

## 測試最佳實踐

### 開發新功能時

1. **先寫測試** (TDD - Test-Driven Development)
   ```bash
   # 在監視模式下執行測試
   npm run test:watch
   ```

2. **編寫功能代碼**

3. **確保測試通過**
   ```bash
   npm test
   ```

### 修改現有功能時

1. 執行現有測試確保沒有破壞功能
2. 如果需要，更新測試
3. 執行測試確認修改正確

### 提交代碼前

```bash
# 執行所有測試
npm test

# 檢查測試覆蓋率
npm run test:coverage
```

## 未來測試計劃

### 建議添加的測試

- **E2E 測試** (使用 Playwright)
  - 完整的使用者流程測試
  - UI 互動測試
  - 截圖功能測試

- **整合測試**
  - IPC 通訊測試
  - AI Providers 測試
  - MCP Server 測試

- **更多單元測試**
  - AI prompts 生成測試
  - 搜尋和篩選邏輯測試
  - Project 管理測試

## 測試配置

測試配置位於 `jest.config.js`：

```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!jest.config.js',
    '!**/__tests__/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 10000
};
```

## 疑難排解

### 測試失敗
- 檢查錯誤訊息
- 確認測試資料正確
- 檢查檔案路徑是否正確

### 測試超時
- 調整 `testTimeout` 設定
- 檢查是否有無限迴圈

### Coverage 不足
- 添加更多測試案例
- 測試邊界條件
- 測試錯誤處理

## 持續整合 (CI)

建議在 CI/CD pipeline 中加入測試：

```yaml
# GitHub Actions 範例
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm run test:coverage
```

## 相關資源

- [Jest 官方文檔](https://jestjs.io/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
