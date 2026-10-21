# Web mai Chart X - 模組與 API 索引手冊 (MODULES.md)

本文件整理了專案中主要程式碼目錄下的各個模組職責、匯出項目與交互方式，方便 Agent 在進行功能維護或新增時快速定位對應檔案。

---

## 📂 核心模組目錄 (Scripts/core/)

負責底層基礎設施、全域配置、解析調度與離線更新。

| 檔案 | 職責概述 | 重要匯出函式 / 類別 |
| :--- | :--- | :--- |
| **`appContext.js`** | 依賴注入與服務容器，儲存全域狀態（settings, maidata, 實例捷徑）。 | `appContext` (單例實例) |
| **`eventBus.js`** | 跨模組發布/訂閱事件中心。 | `eventBus`, `EVENTS` |
| **`playbackEngine.js`**| 播放器狀態機（Play, Pause, Seek, Speed, ReadyBeat 倒數計時）。 | `PlaybackEngine` 類別 |
| **`init.js`** | 系統啟動彈窗、資產預載、資料庫校驗與初始佈局構建。 | `runInitModal()`, `setupEditorUIAndData()` |
| **`chartGeometry.js`** | maimai 八鍵圓盤幾何計算（角度、座標變換、判定半徑）。 | `calcKeyPosition()`, `getLaneAngle()` 等幾何工具 |
| **`settingsConfig.js`**| 系統設定項綱要定義、預設值（外觀、音量、延遲、實驗性功能）。 | `settingsConfig`, `defaultSettings` |
| **`skinConfig.js`** | 音符外觀皮膚與判定特效的配置與切換邏輯。 | `skinConfig`, 各種外觀資源對應表 |
| **`simaiLogicControler.js`**| simai 編輯器文字選取、游標定位、音符反查與同步控制。 | `SimaiLogicControler` 類別 |
| **`decodeWorkerManager.js`**| 管理背景解碼 Worker，提供 Promise 介面與自動同步降級。 | `decodeWorkerManager` |
| **`swManager.js`** | Service Worker 註冊、更新監聽、手動測試與更新進度彈窗。 | `initServiceWorker()`, `showSwUpdateProgress()`, `showSwUpdateComplete()`, `mockSwUpdateFlow()` |
| **`frameProfiler.js`** | FPS 監控、每一幀耗時統計、卡頓診斷。 | `frameProfiler` |
| **`wmcxExtract.js`** | `.wmcx` 專案包二進位解封與資產抽取。 | `extractWmcxPackage()` |

---

## 📂 特色功能目錄 (Scripts/features/)

負責編輯器業務特性，如視覺化編輯、文字格式化、切分細分與外部多媒體處理。

| 檔案 | 職責概述 | 重要匯出函式 / 類別 |
| :--- | :--- | :--- |
| **`visualEditor.js`** | 視覺化音符編輯器核心（畫布互動、點擊置入音符、滾動控制）。 | `createVisualNoteCallbacks()`, `initVisualScroller()`, `openDivisionInputModal()` |
| **`visualFloatingMenu.js`** | 視覺化編輯中的浮動工具列（置放 Tap, Hold, Slide, Break 等快捷工具）。 | `showFloatingMenu()`, `hideFloatingMenu()`, `showBoxFloatingMenu()` |
| **`visualSubMenu.js`** | 視覺化編輯次選單（詳細音符屬性與方向修飾）。 | `VisualSubMenu` 類別 |
| **`formatter.js`** | 譜面語法自動格式化、對齊、多拍號美化。 | `formatDocument()`, `formatSimai()`, `handleFormatDocument()` |
| **`subdivision.js`** | 譜面切分變更計算（四分、八分、十二分、十六分等自動轉換）。 | `convertSubdivision()` |
| **`noteModifier.js`** | 快速修改選取音符屬性（切換 Break/EX、順逆時針旋轉、上下/左右鏡射）。 | `toggleNoteFlag()`, `handleToggleBkEx()`, `applySelectedRotation()`, `applyVerticalFlip()`, `applyHorizontalFlip()` |
| **`findReplace.js`** | 譜面編輯器全文搜尋與取代面板。 | `initFindReplace()`, `openFindBar()`, `closeFindBar()` |
| **`fileHandler.js`** | 檔案拖曳讀取、資料夾讀取、ZIP 解壓縮。 | `initFileHandlers()` |
| **`quickPanel.js`** | 側邊快捷控制面板（速度、難度、預備拍切換）。 | `initQuickPanel()` |
| **`secondaryWindow.js`**| 雙螢幕/獨立子視窗預覽同步器（透過 BroadcastChannel / postMessage 通訊）。 | `SecondaryWindowManager` 類別 |
| **`videoRender.js`** | 結合音訊與畫布逐幀錄製導出 WebM/MP4 譜面預覽影片。<br>⚠️ **重大提醒**：本模組依賴的 `mediabunny.cjs` 逾 36,000 行（1.4MB），排查影片渲染問題時**切勿先分析該代碼**，應優先查閱官方線上 API：[https://mediabunny.dev/api/](https://mediabunny.dev/api/)。 | `renderVideoFromChart()` |
| **`wmcxPackage.js`** | 專案打包壓縮為 `.wmcx` 檔案。 | `packageProjectToWmcx()` |
| **`wmcxRestore.js`** | 還原 `.wmcx` 封裝包至 IndexedDB。 | `restoreWmcxPackage()` |

---

## 📂 彈窗組件目錄 (Scripts/modals/)

負責所有獨立互動彈窗（暗黑毛玻璃 Material Design 風格）。

| 檔案 | 職責概述 | 重要匯出函式 |
| :--- | :--- | :--- |
| **`welcomeModal.js`** | 初次啟動導覽彈窗（條款簽署、舊站資料遷移、左上角語言切換、Logo 多語言問候輪播）。 | `showWelcomeModal(options)` |
| **`settingsModal.js`** | 系統全域設定彈窗（自動依據 `settingsConfig` 動態生成分頁與控制項）。 | `openSettingsModal()` |
| **`projectManager.js`**| 專案總管（建立、重新命名、複製、刪除、匯入/匯出專案清單）。 | `openProjectManager()` |
| **`maintenanceModal.js`**| 資料維護與備份管理（匯出全量備份、分項選擇性匯入還原）。 | `openMaintenanceModal()`, `openImportSelectionModal()` |
| **`slideEditorModal.js`**| 進階 Slide 曲線編輯器（形狀預覽、折點微調、時間計算）。 | `openSlideEditorModal()` |
| **`noteDurationModal.js`**| Hold / TouchHold 音符持續時間精確計算調整彈窗。 | `openNoteDurationModal()` |
| **`touchGroupModal.js`**| Touch 多押群組管理彈窗。 | `openTouchGroupModal()` |
| **`subdivisionModal.js`**| 拍號切分變換設定介面。 | `openSubdivisionModal()` |
| **`bgmEditor.js`** | 音樂開頭偏移剪裁與 Tap BPM 測速工具。 | `openBgmEditor()`, `openTapBpm()` |
| **`chartInfoModal.js`**| 譜面資訊編輯器（標題、作曲家、製譜者、封面圖選擇）。 | `openChartInfoModal()` |
| **`recordVideoModal.js`**| 錄製影片參數設定彈窗（解析度、幀率、碼率）。 | `openRecordVideoModal()` |
| **`resourceManagerModal.js`**| 自訂外部音訊與自訂圖片素材管理器。 | `openResourceManager()` |
| **`mainoteFetcher.js`**| 自 Mainote 雲端拉取官方/公有譜面資料。 | `openMainoteFetcher()` |
| **`driveManager.js`** | Google Drive 雲端同步與備份管理彈窗。 | `openDriveManager()` |
| **`aboutModal.js`** | 關於軟體資訊、社群連結與彩蛋觸發點。 | `openAboutModal()` |
| **`changelogModal.js`**| 版本更新日誌彈窗。 | `openChangelogModal()` |
| **`helpModal.js`** | 譜面代碼語法與快捷鍵操作指引手冊。 | `openHelpModal()` |

---

## 📂 服務目錄 (Scripts/services/)

處理外部 API 與 Google Drive 雲端整合。

| 檔案 | 職責概述 |
| :--- | :--- |
| **`driveAuth.js`** | Google Identity Services (GIS) OAuth2 Token 授權管理。 |
| **`driveApi.js`** | Google Drive REST API v3 呼叫封裝（檔案列表、下載、上傳、搜尋）。 |
| **`driveSync.js`** | 專案與雲端硬碟的雙向自動/手動差異同步。 |
| **`driveOpenWith.js`** | 處理從 Google 雲端硬碟「以 Web mai Chart X 開啟」時的深度連結載入。 |
| **`transferProgress.js`**| 檔案傳輸進度指示元件。 |

---

## 📂 多語系系統 (i18n.js & locales/)

- **`Scripts/i18n.js`** 核心 API：
  - `t(key, params, targetLang)`：查詢字典翻譯，支援 `{param}` 插值。
  - `setLang(code)`：即時切換語言（支援 `'auto'` 或具體語系代碼），並呼叫 `applyI18nToDOM()`。
  - `getCurrentLang()`：取得目前生效的語系代碼（若設為 `'auto'` 則回傳自動偵測後的具體代碼）。
  - `getAvailableLanguages()`：自 `config/manifest.json` 取得支援的所有語言清單。
  - `onLanguageChange(callback)`：註冊語系切換回呼。
- **字典檔案**（位於 `locales/*.json`）：
  - `zh-TW.json` (繁體中文)
  - `zh-CN.json` (簡體中文)
  - `en.json` (English)
  - `ja.json` (日本語)
  - `ko.json` (한국어)
