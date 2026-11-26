# Web mai Chart X - Agent 工作區開發守則 (Project Rules)

本檔案由 Antigravity / AI Agent 自動載入。在此專案中開發時，請嚴格遵守以下守則：

---

### 1. 語言規範 (Language Preference)
- 根據使用者規範，所有向使用者的解說、程式碼註解、提問與回覆**一律優先使用繁體中文 (Traditional Chinese)**。

### 2. 模組引用規範 (Pure ESM)
- 專案為純原生 ES Modules，沒有打包工具強制補全路徑。
- 所有的 `import` 相對路徑**必須帶有 `.js` 副檔名**（例如：`import { t } from './i18n.js';`）。

### 3. 架構與狀態管理 (AppContext & EventBus)
- 禁止任意在全域 `window` 注入未經定義的狀態。
- 模組間需共享資料或實例時，請透過 `import { appContext } from './core/appContext.js'` 讀取與註冊。
- 跨模組狀態變更通知，請使用 `import { eventBus, EVENTS } from './core/eventBus.js'` 進行 Pub/Sub 通訊。

### 4. 關鍵踩坑防護 (Known Gotchas)
- **Service Worker**：初次訪問新使用者的 Service Worker 安裝必須維持背景靜默快取，不可跳出離線更新下載進度條或版本更新就緒彈窗（見 `sw.js` 與 `swManager.js` 的 `isUpdate` 與 `hasExistingController` 判定）。
- **音量控制**：打擊音效播放務必遵循 `appContext.settings` 的音量設定與倍率，切勿繞過 GainNode。
- **渲染快取**：修改 Note 相關參數時需注意 `renderer.js` 的 Slide spacing 與 Waveform 離屏快取，避免每幀重複高耗運算。
- **多語系支援**：新增 Modal 與 UI 時，確保支援動態語系切換或帶有 `data-i18n` 標籤。
- **影片渲染與 Mediabunny**：若遇到影片匯出或渲染問題，**嚴禁先分析龐大的 `Scripts/mediabunny.cjs` (1.4MB)**，請優先查閱官方線上 API 文檔：`https://mediabunny.dev/api/`。

### 5. 語法安全檢驗
- 每次修改核心 JavaScript 檔案後，請主動透過終端執行 `node --check <檔案路徑>` 確保無語法錯誤（SyntaxError）。
