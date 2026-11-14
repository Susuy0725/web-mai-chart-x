# Web mai Chart X 擴充程式開發手冊

本文件提供 Web mai Chart X 第三方擴充程式的完整架構指南、設定規格、權限模型與介面參考，協助開發者開發並發布安全、高效的客製化外掛套件。

---

## 目錄

1. 擴充程式系統架構概述
2. 擴充包檔案結構與描述規範
3. 權限清單與受限上下文介面參考
4. 可訂閱事件清單
5. 原生設定面板與資料隔離持久化
6. 生命週期與資源清理機制
7. 安全性規範與介面隔離
8. 開發測試與安裝步驟

---

## 1. 擴充程式系統架構概述

Web mai Chart X 擴充程式架構旨在提供第三方外掛動態擴充編輯器功能的機制，同時兼顧效能、主程式穩定性與使用者資料安全。

核心設計原則包含：
- 最小權限原則：擴充程式必須在描述檔案中明確宣告所需權限，未宣告的權限不會注入對應的介面與方法。
- 受限上下文隔離：擴充程式無法直接存取全域狀態或底層服務容器，僅能透過受限上下文提供的安全方法與主程式互動。
- 宣告式介面整合：頂欄選單與設定面板採用宣告式結構，由主程式統一渲染並自動套用視覺樣式。
- 自動生命週期追蹤：擴充程式註冊的指令、事件監聽器、選單項目與浮動元件由主程式統一追蹤，停用或移除時自動完成資源回收。

---

## 2. 擴充包檔案結構與描述規範

### 2.1 壓縮包檔案階層

擴充程式以標準 ZIP 格式封裝，副檔名為 `.zip`。系統支援根目錄平鋪或包含單層根資料夾兩種結構：

```text
# 結構一：檔案位於壓縮包根目錄
timeline-jog-dial.zip
├── manifest.json
└── index.js

# 結構二：檔案包含單層目錄包裹
timeline-jog-dial.zip
└── timeline-jog-dial/
    ├── manifest.json
    └── index.js
```

### 2.2 描述檔案欄位規格

每個擴充套件根目錄必須包含 `manifest.json`，格式為標準 JSON。支援欄位如下：

| 欄位名稱 | 型別 | 必填 | 預設值 | 說明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | 字串 | 是 | 無 | 擴充唯一識別碼，格式須符合 `/^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$/i`，須採用至少包含一段小數點區隔的反向網域命名空間格式，例如 `com.example.my-plugin` |
| `name` | 字串 | 是 | 無 | 擴充程式顯示名稱 |
| `version` | 字串 | 是 | 無 | 語意化版本號，例如 `"1.0.0"` |
| `description` | 字串 | 否 | `""` | 擴充功能簡要說明 |
| `author` | 字串 | 否 | `""` | 作者或維護組織名稱 |
| `entry` | 字串 | 否 | `"index.js"` | JavaScript 進入點模組相對路徑 |
| `permissions` | 字串陣列 | 否 | `[]` | 擴充所請求的權限清單，若包含未定義字串將導致載入驗證失敗 |
| `runtime` | 字串 | 否 | `"trusted"` | 執行模式，目前支援 `"trusted"` 與 `"worker"`，預設為 `"trusted"` |

重要注意事項：
- `manifest.json` 必須能成功解析為 JSON 物件，且必須具備 `id`、`name` 與 `version` 欄位。
- 系統註冊與列出擴充清單時，皆會保留 `description` 與 `author` 欄位，未填寫時預設為空字串。
- `runtime` 若設定為 `"worker"`，由於 Worker 沙箱目前尚未啟用，嘗試啟用時會產生錯誤並標記為錯誤狀態。

### 2.3 描述檔案範例

```json
{
  "id": "com.wmcx.timeline-jog-dial",
  "name": "時間軸微調旋鈕",
  "version": "1.0.0",
  "description": "在畫面右側提供觸控飛梭旋鈕，方便於手機或平板精細微調譜面時間軸。",
  "author": "WMCX Example",
  "entry": "index.js",
  "permissions": [
    "playback:read",
    "playback:seek",
    "ui:menu",
    "ui:popover",
    "ui:overlay",
    "ui:toast",
    "i18n:register"
  ]
}
```

---

## 3. 權限清單與受限上下文介面參考

### 3.1 權限常數對照表

系統定義的合法權限常數清單如下：

| 權限識別碼 | 權限常數 | 授予功能說明 |
| :--- | :--- | :--- |
| `editor:read` | `EXTENSION_PERMISSIONS.EDITOR_READ` | 讀取編輯器譜面全文與選取區資訊 |
| `editor:write` | `EXTENSION_PERMISSIONS.EDITOR_WRITE` | 置換編輯器選取區或指定範圍文字 |
| `chart:read` | `EXTENSION_PERMISSIONS.CHART_READ` | 讀取目前譜面解析結果的唯讀快照 |
| `view:read` | `EXTENSION_PERMISSIONS.VIEW_READ` | 讀取目前編輯器檢視模式快照 |
| `playback:read` | `EXTENSION_PERMISSIONS.PLAYBACK_READ` | 讀取播放狀態快照與時間軸總長度 |
| `playback:seek` | `EXTENSION_PERMISSIONS.PLAYBACK_SEEK` | 跳轉至指定秒數或相對微調播放進度 |
| `render:overlay` | `EXTENSION_PERMISSIONS.RENDER_OVERLAY` | 註冊畫布自訂疊加圖層與請求畫布重繪 |
| `commands:register` | `EXTENSION_PERMISSIONS.COMMANDS_REGISTER` | 註冊具備擴充名稱空間的自訂指令 |
| `events:subscribe` | `EXTENSION_PERMISSIONS.EVENTS_SUBSCRIBE` | 訂閱系統開放白名單事件 |
| `ui:toast` | `EXTENSION_PERMISSIONS.UI_TOAST` | 呼叫全域吐司提示訊息 |
| `ui:menu` | `EXTENSION_PERMISSIONS.UI_MENU` | 於頂欄拼圖選單註冊二級選單項目 |
| `ui:popover` | `EXTENSION_PERMISSIONS.UI_POPOVER` | 開啟原生設定面板與存取隔離設定值 |
| `ui:overlay` | `EXTENSION_PERMISSIONS.UI_OVERLAY` | 建立受控的浮動元件掛載容器 |
| `i18n:register` | `EXTENSION_PERMISSIONS.I18N_REGISTER` | 註冊多語系字典並使用擴充翻譯函式 |

### 3.2 受限上下文基礎屬性

擴充進入點函式接收單一受限上下文物件 `ctx`。不論宣告何種權限，所有擴充皆具備以下基礎屬性：

```javascript
// 目前擴充 API 版本號，目前固定為 1
ctx.apiVersion;

// 當前擴充識別碼，對應 manifest.json 中的 id
ctx.extensionId;

// 檢查當前擴充是否已被授予指定權限字串，回傳布林值
ctx.hasPermission(permissionString);
```

### 3.3 編輯器介面：`ctx.editor`

宣告 `editor:read` 或 `editor:write` 權限時注入此介面。未宣告任何編輯器權限時，`ctx.editor` 為 `undefined`。

#### `ctx.editor.getText()`
- 權限需求：`editor:read`
- 參數：無
- 回傳：字串，代表編輯器目前全文內容。若編輯器尚未就緒則回傳空字串。

#### `ctx.editor.getSelection()`
- 權限需求：`editor:read`
- 參數：無
- 回傳：物件 `{ start: number, end: number, text: string }`，包含選取起點索引、終點索引與選取文字。

#### `ctx.editor.on(eventName, handler)`
- 權限需求：`editor:read`
- 參數：
  - `eventName`：字串，支援 `'input'`、`'keydown'`、`'blur'`、`'selectionchange'`。
  - `handler`：函式，接收事件快照 `{ text, selectionStart, selectionEnd }`。於 `'keydown'` 事件時額外包含 `key`、`code`、`ctrlKey`、`metaKey`、`altKey`、`shiftKey`、`isComposing`、`preventDefault()` 與 `stopPropagation()`。
- 回傳：取消訂閱函式。
- 生命週期：擴充停用時系統會自動移除所有透過此介面綁定的監聽器。

#### `ctx.editor.replaceSelection(replacement, start, end)`
- 權限需求：`editor:write`
- 參數：
  - `replacement`：字串，準備置換插入的目標文字。
  - `start`：數值，選填，置換範圍起始索引。
  - `end`：數值，選填，置換範圍結束索引。
- 回傳：布林值，表示置換是否成功執行。

### 3.4 播放控制介面：`ctx.playback`

宣告 `playback:read` 或 `playback:seek` 權限時注入此介面。未宣告任何播放權限時，`ctx.playback` 為 `undefined`。

#### `ctx.playback.getState()`
- 權限需求：`playback:read`
- 參數：無
- 回傳：物件 `{ isPlaying: boolean, realTime: number, globalTime: number }`。
  - `isPlaying`：布林值，表示當前是否處於播放狀態。
  - `realTime`：數值，目前播放時間秒數。
  - `globalTime`：數值，全域時間秒數。

#### `ctx.playback.getDuration()`
- 權限需求：`playback:read`
- 參數：無
- 回傳：數值，當前譜面或音軌總長度秒數。

#### `ctx.playback.seek(targetTime)`
- 權限需求：`playback:seek`
- 參數：
  - `targetTime`：數值或可轉換為數值的字串，欲跳轉的絕對秒數。
- 行為：系統會自動將目標時間限制在零與總長度區間內。
- 回傳：布林值，跳轉成功回傳 `true`，輸入非有效數值時回傳 `false`。

#### `ctx.playback.nudge(deltaSeconds)`
- 權限需求：`playback:seek`
- 參數：
  - `deltaSeconds`：數值或可轉換為數值的字串，增減的相對秒數。正值向前快轉，負值倒轉。
- 行為：以目前播放進度為基準加算偏移量，並自動限制在合法時間區間內。
- 回傳：布林值，微調成功回傳 `true`，輸入非有效數值時回傳 `false`。

### 3.5 譜面讀取介面：`ctx.chart`

宣告 `chart:read` 權限時注入此介面。未宣告此權限時，`ctx.chart` 為 `undefined`。

#### `ctx.chart.getSnapshot()`
- 權限需求：`chart:read`
- 參數：無
- 回傳：物件，代表當前譜面解析結果的唯讀快照，包含以下欄位：
  - `difficulty`：數值，當前選取的難度代號或索引。
  - `maidata`：物件，譜面整體中繼資料淺層拷貝。
  - `duration`：數值，時間軸總長度秒數。
  - `notes`：物件陣列，當前難度已解析的音符物件清單淺層拷貝。
  - `tags`：物件陣列，譜面已解析的標籤清單淺層拷貝。

#### `ctx.chart.getCoverImageUrl()`
- 權限需求：`chart:read`
- 參數：無
- 回傳：字串或 `null`。唯讀取得目前專案封面圖片網址，無封面圖時回傳 `null`。

### 3.6 檢視模式介面：`ctx.view`

宣告 `view:read` 權限時注入此介面。未宣告此權限時，`ctx.view` 為 `undefined`。

#### `ctx.view.getMode()`
- 權限需求：`view:read`
- 參數：無
- 回傳：物件，代表目前編輯器檢視模式快照，包含以下欄位：
  - `isEditorHidden`：布林值，表示編輯器是否處於隱藏狀態。
  - `isFullscreen`：布林值，表示是否處於全螢幕模式。
  - `isVerticalMode`：布林值，表示是否處於直式版面模式。
  - `showAuxiliaryText`：布林值，表示是否顯示環繞輔助文字。

### 3.7 渲染疊加介面：`ctx.render`

宣告 `render:overlay` 權限時注入此介面。未宣告此權限時，`ctx.render` 為 `undefined`。

#### `ctx.render.registerOverlay(options)`
- 權限需求：`render:overlay`
- 參數：
  - `options`：物件，疊加圖層設定項：
    - `target`：字串，選填，目標畫布，可選值為 `'main'` 或 `'visual'`，預設為 `'main'`。
    - `phase`：字串，選填，繪製階段，可選值為 `'beforeNotes'` 或 `'afterNotes'`，預設為 `'afterNotes'`。
    - `order`：數值，選填，排序權重，預設為 `0`，數值小者先繪製。
    - `includeInVideo`：布林值，選填，預設為 `false`，決定該圖層是否於影片匯出期間一併繪製。
    - `draw`：函式，必填，繪圖回呼函式，每幀繪製時調用，接收 `renderContext` 物件。
- 行為：註冊時會自動發布 `canvas:redraw` 事件觸發畫布重繪。
- 回傳：取消註冊函式。調用此函式可提前註銷該圖層，註銷時亦會發布 `canvas:redraw` 事件觸發畫面更新。
- 生命週期：擴充停用時系統會自動註銷所有透過此介面註冊的圖層並觸發畫布重繪。

#### 傳入 `draw(renderContext)` 的物件欄位

每次調用 `draw` 回呼函式時，系統傳入 `renderContext` 物件，包含以下欄位：
- `ctx`：Canvas 2D 渲染上下文。
- `width`：數值，目標畫布像素寬度。
- `height`：數值，目標畫布像素高度。
- `scale`：數值，當前縮放倍率。於主畫布為渲染器縮放比例，於視覺化編輯器為視圖縮放比例。
- `scaleBase`：數值，畫布基準縮放長度。
- `unitPx`：數值，單位像素比例。
- `stageRect`：唯讀物件，於主畫布繪製時提供，包含 `x`、`y`、`width`、`height` 四個物理像素數值欄位，表示置中的十六比九舞台安全區域座標與尺寸，當畫布寬高比小於或等於十六比九時等同於完整畫布範圍。
- `globalTime`：數值，當前全域時間秒數。
- `isPlaying`：布林值，表示當前是否處於播放狀態。
- `isRenderingVideo`：布林值，表示目前是否處於影片匯出渲染期間，由主畫布提供。
- `target`：字串，當前繪圖目標畫布，為 `'main'` 或 `'visual'`。
- `phase`：字串，當前繪圖階段，為 `'beforeNotes'` 或 `'afterNotes'`。

#### 畫布狀態與錯誤隔離機制

系統於呼叫疊加圖層時提供嚴密的狀態防護與例外隔離：
- 狀態隔離：底層在執行每個圖層的 `draw` 前會自動呼叫 `ctx.save()`，並於繪製完成後的 `finally` 區塊呼叫 `ctx.restore()`，確保各擴充圖層的繪圖狀態、剪裁區域或座標變換矩陣不互相污染，亦不干擾核心渲染引擎。
- 錯誤隔離：以 `try...catch` 包裹各圖層的 `draw` 呼叫。若圖層繪製時拋出例外，將於控制台記錄錯誤訊息，不會中斷主渲染迴圈或其他圖層的繪製作業。
- 影片匯出控制：預設情況下 `includeInVideo` 為 `false`，影片匯出期間會自動跳過該圖層；若明確設為 `true`，系統會於影片匯出期間執行該圖層的 `draw` 並傳入 `isRenderingVideo: true`，供擴充程式依設定決定是否繪製。

#### `ctx.render.requestRedraw()`
- 權限需求：`render:overlay`
- 參數：無
- 行為：發布 `canvas:redraw` 事件，請求主程式立即排程重新繪製畫布。
- 回傳：無回傳值。

### 3.8 指令註冊介面：`ctx.commands`

宣告 `commands:register` 權限時注入此介面。

#### `ctx.commands.register(localCommandId, handler, meta = {})`
- 權限需求：`commands:register`
- 參數：
  - `localCommandId`：字串，本地指令名稱。系統會自動加上前綴，組合成 `ext.${extensionId}.${localCommandId}`，防止覆寫核心指令或與其他擴充衝突。
  - `handler`：函式，指令觸發時的執行邏輯，接收傳入參數。
  - `meta`：物件，選填，指令中繼資訊，例如標題或圖示描述。
- 回傳：清理函式。調用此函式可提前註銷該指令。
- 生命週期：擴充停用時系統會自動註銷所有透過此介面註冊的指令。

### 3.9 事件訂閱介面：`ctx.events`

宣告 `events:subscribe` 權限時注入此介面。

#### `ctx.events.on(eventName, callback)`
- 權限需求：`events:subscribe`
- 參數：
  - `eventName`：字串，欲訂閱的事件名稱，僅允許白名單所列之事件。
  - `callback`：函式，事件發布時的回呼函式。
- 行為：若嘗試訂閱未開放事件，控制台會輸出警告並回傳空操作函式。
- 回傳：取消訂閱函式。
- 生命週期：擴充停用時系統會自動移除所有透過此介面綁定的監聽器。

### 3.10 使用者介面：`ctx.ui`

宣告 `ui:toast`、`ui:menu`、`ui:popover` 或 `ui:overlay` 任一權限時注入此介面。

#### `ctx.ui.toast(options)`
- 權限需求：`ui:toast`
- 參數：
  - `options`：物件或字串。傳入物件時支援：
    - `content`：字串，提示內容文字。
    - `type`：字串，提示類型，例如 `'info'`、`'success'`、`'warning'`、`'error'`。
    - `timeout`：數值，顯示持續毫秒數。

#### `ctx.ui.registerMenuItem(item)`
- 權限需求：`ui:menu`
- 參數：
  - `item`：物件，選單定義項目：
    - `id`：字串，必填，選單項目識別碼。
    - `label`：字串，靜態顯示文字。
    - `labelKey`：字串，多語系翻譯鍵。若有提供且語系庫存在翻譯，將優先使用翻譯文字。
    - `commandId`：字串，點擊時執行的指令識別碼。
    - `onClick`：函式，點擊回呼函式，接收參數 `{ anchorEl }`。與 `commandId` 兩者可擇一提供。
- 回傳：取消註冊函式。
- 生命週期：擴充停用時自動自選單移除。

#### `ctx.ui.openPopover(options)`
- 權限需求：`ui:popover`
- 參數：
  - `options`：物件，設定面板設定項：
    - `title`：字串，面板頂部標題文字。未提供時預設使用 `manifest.name`。
    - `schema`：陣列，宣告式設定欄位清單。
    - `anchorEl`：DOM 元素，彈窗彈出定位參考錨點。
    - `onChange`：函式，任一欄位值異動時觸發，接收 `(key, value, allValues)`。
- 回傳：控制物件 `{ close: Function, getValues: Function }`。
  - `close()`：關閉當前設定面板。
  - `getValues()`：取得當前面板所有欄位數值淺層拷貝。
- 生命週期：擴充停用時會自動關閉對應的設定面板。

#### `ctx.ui.closePopover()`
- 權限需求：`ui:popover`
- 參數：無
- 行為：若當前畫面正顯示該擴充的設定面板，將其隱藏並關閉。

#### `ctx.ui.getSettings(schema = [])`
- 權限需求：`ui:popover`
- 參數：
  - `schema`：陣列，宣告式設定欄位清單。
- 回傳：物件，自隔離儲存區讀取已儲存之設定。若該欄位未曾儲存，則自動填入 schema 中定義的 `default` 預設值。

#### `ctx.ui.createFloatingWidget(options = {})`
- 權限需求：`ui:overlay`
- 參數：
  - `options`：物件：
    - `id`：字串，元件本地識別碼，預設為 `'default'`。
    - `position`：字串，預設為 `'right'`。
- 回傳：受控元件物件 `{ element: HTMLElement, dispose: Function }`。
  - `element`：已掛載至頁面根容器之 DOM 元素。
  - `dispose()`：提前銷毀並自 DOM 樹移除此容器。
- 生命週期：擴充停用時系統自動移除該容器並自全域註銷。

### 3.11 國際化多語系介面：`ctx.i18n`

宣告 `i18n:register` 權限時注入此介面。

#### `ctx.i18n.registerTranslations(localeMap)`
- 權限需求：`i18n:register`
- 參數：
  - `localeMap`：物件，各語系鍵值字典。系統會自動將鍵值綁定至擴充命名空間 `ext.${extensionId}`。
    範例結構：
    ```javascript
    {
      'zh-TW': { optVisible: '顯示旋鈕', optSec: '秒數' },
      'en': { optVisible: 'Show Dial', optSec: 'Seconds' }
    }
    ```
- 回傳：取消註冊函式。
- 生命週期：擴充停用時自動卸載所有擴充語系條目。

#### `ctx.i18n.t(key, params = {})`
- 權限需求：`i18n:register`
- 參數：
  - `key`：字串，本地翻譯鍵名。系統會自動解析為 `ext.${extensionId}.${key}`。
  - `params`：物件，內嵌參數替換字典。
- 回傳：字串，當前使用者系統語言之翻譯結果。若找不到翻譯則回傳完整鍵名路徑。

---

## 4. 可訂閱事件清單

宣告 `events:subscribe` 權限後，擴充程式可透過 `ctx.events.on` 訂閱以下白名單事件。若事件名稱不在清單中，訂閱將被略過：

| 事件名稱 | 觸發時機 | 回呼傳入參數說明 |
| :--- | :--- | :--- |
| `app:ready` | 應用程式所有核心模組與介面元件初始化完成 | 無傳入參數 |
| `project:loaded` | 使用者建立、開啟新專案或匯入譜面資料完成 | 無傳入參數 |
| `maidata:changed` | 譜面資料或解析後結構發生實質變更 | 傳入最新譜面資料物件 |
| `chart:decoded` | 譜面完成解碼或重新解析，例如切換難度或編輯譜面內容 | `{ difficulty: number, noteCount: number }`，包含當前難度與已解析音符數量 |
| `view:mode-changed` | 當切換隱藏編輯器、切換全螢幕、直橫版面切換、專案載入或輔助文字顯示設定變更時觸發 | `{ isEditorHidden: boolean, isFullscreen: boolean, isVerticalMode: boolean, showAuxiliaryText: boolean }`，為最新檢視模式快照物件 |
| `playback:state-changed` | 播放引擎切換播放或暫停狀態 | `{ isPlaying: boolean }` |
| `playback:seek` | 使用者或程式主動調整時間軸進度 | `{ time: number }`，為目標秒數 |
| `canvas:redraw` | 畫布完成一次重繪週期 | 無傳入參數 |

使用範例：

```javascript
ctx.events.on('playback:state-changed', ({ isPlaying }) => {
    if (isPlaying) {
        console.log('播放已開始');
    }
});
```

---

## 5. 原生設定面板與資料隔離持久化

### 5.1 系統彈窗整合與層級行為

Web mai Chart X 設定面板透過 `ctx.ui.openPopover` 開啟，現已復用主程式統一的 `popupWindow` 系統彈窗與 `.popup-backdrop` 模糊背景遮罩。具備以下特性：
- 統一視覺風格：繼承主程式對話框規格與毛玻璃背景遮罩，保有整體一致的視覺呈現。
- 直覺關閉行為：支援點擊遮罩背景外部或按下 Escape 鍵關閉面板。
- 遮罩層級防護：`.extension-floating-widget` 層級處於模糊遮罩之下，開啟系統彈窗時浮動掛件會被統一模糊遮罩覆蓋，避免畫面元件互相干擾。
- 參數相容處理：`openPopover` 選項中若傳入 `anchorEl`，系統仍維持相容性，並以置中彈窗呈現。

### 5.2 資料隔離持久化機制

每個擴充程式的設定值相互獨立隔離：
- 儲存鍵格式：固定使用 `wmcx_ext_settings_${extensionId}` 儲存於 `localStorage`。
- 回退機制：若執行環境無法使用 `localStorage`，系統自動無縫降級為記憶體快取。
- 預設值回填：透過 `ctx.ui.getSettings(schema)` 讀取時，若某項欄位未曾被使用者變更，系統會自動填入 schema 中宣告的 `default` 值。

### 5.3 宣告式設定欄位格式

設定面板透過傳入 schema 陣列動態生成表單控制項。支援五種型別，所有欄位皆可選填 `notice` 或 `noticeKey` 於欄位下方顯示說明文字：

#### 布林開關：`boolean`
呈現為核取方塊控制項。
```javascript
{
  key: 'visible',
  type: 'boolean',
  default: true,
  label: '顯示微調旋鈕',
  labelKey: 'ext.com.wmcx.timeline-jog-dial.optVisible'
}
```

#### 數值調節：`number`
呈現為數值輸入框，支援上限、下限與遞增間距限制。
```javascript
{
  key: 'secPerTurn',
  type: 'number',
  default: 4,
  min: 0.5,
  max: 30,
  step: 0.5,
  label: '每轉一圈秒數',
  labelKey: 'ext.com.wmcx.timeline-jog-dial.optSecPerTurn'
}
```

#### 單行文字：`string`
呈現為文字輸入框。若省略 `type` 屬性，預設即為 `string`。支援選填 `placeholder` 或 `placeholderKey`。
```javascript
{
  key: 'titleText',
  type: 'string',
  default: '預設標題',
  label: '顯示文字'
}
```

#### 密碼輸入：`password`
呈現為遮罩密碼輸入框，並附帶顯示與隱藏切換按鈕。支援選填 `placeholder` 或 `placeholderKey`。
```javascript
{
  key: 'apiKey',
  type: 'password',
  default: '',
  label: 'API 金鑰',
  placeholder: '輸入金鑰',
  notice: '金鑰僅儲存於本機瀏覽器。'
}
```

#### 下拉選單：`select`
呈現為原生下拉選單。
```javascript
{
  key: 'themeMode',
  type: 'select',
  default: 'dark',
  label: '外觀風格',
  options: [
    { value: 'dark', label: '深色風格' },
    { value: 'light', label: '淺色風格' }
  ]
}
```

### 5.4 重設為預設值按鈕

面板底部提供「重設為預設值」按鈕。使用者點擊後，系統會將表單中所有控制項還原為 schema 內定義的 `default` 數值，並立即觸發 `onChange` 回呼函式與同步持久化儲存。

---

## 6. 生命週期與資源清理機制

### 6.1 模組匯出與啟用流程

擴充進入點模組必須匯出啟動函式，支援預設匯出或具名 `activate` 匯出：

```javascript
// 方式一：預設匯出
export default function activate(ctx) {
    // 初始化邏輯
}

// 方式二：具名匯出
export function activate(ctx) {
    // 初始化邏輯
}
```

擴充啟動時，系統依序執行以下步驟：
1. 依據 `manifest.json` 驗證權限與執行模式。
2. 組裝對應權限的受限上下文 `ctx`。
3. 調用啟動函式，並捕捉執行期間之例外。若發生錯誤，將狀態標記為錯誤並自動清理所有已分配之資源。
4. 收集啟動函式回傳之清理機制。

### 6.2 清理函式回傳規範

啟動函式可回傳清理函式或包含 `dispose` 方法之物件：

```javascript
// 範例一：直接回傳清理函式
export default function activate(ctx) {
    const timer = setInterval(() => {}, 1000);
    return () => {
        clearInterval(timer);
    };
}

// 範例二：回傳具備 dispose 方法之物件
export default function activate(ctx) {
    const worker = new Worker('worker.js');
    return {
        dispose: () => {
            worker.terminate();
        }
    };
}
```

### 6.3 自動資源回收保證

當擴充程式被停用、重新載入、解除安裝，或在啟動時拋出例外時，系統保證依序執行以下清理作業：
- 自動銷毀透過 `ctx.ui.createFloatingWidget` 建立的 DOM 元素。
- 自動關閉當前開啟的 Popover 設定面板。
- 自動註銷透過 `ctx.commands.register` 註冊的所有指令。
- 自動取消透過 `ctx.events.on` 訂閱的所有事件監聽器。
- 自動註銷透過 `ctx.render.registerOverlay` 註冊的疊加圖層並觸發畫布重繪。
- 自動移除透過 `ctx.ui.registerMenuItem` 註冊的選單項目。
- 自動卸載透過 `ctx.i18n.registerTranslations` 註冊的多語系詞典。
- 執行擴充啟動函式所回傳的清理函式。

---

## 7. 安全性規範與介面隔離

為了維護整體應用程式的執行穩定與防止惡意程式碼注入，所有擴充程式必須遵循以下安全標準：

### 7.1 禁止動態程式碼評估
- 嚴格禁止使用 `eval()`、`new Function()` 或以字串形式執行動態腳本。
- 所有資料計算與邏輯處理應採用標準 JavaScript 靜態邏輯實作。

### 7.2 避免未跳脫 innerHTML 與強制 textContent
- 嚴禁直接將外部資料、使用者輸入或未跳脫的字串賦值予 `innerHTML`。
- 文字節點渲染一律使用 `node.textContent` 或透過 `document.createElement` 搭配 `setAttribute` 建構 DOM 元素。

### 7.3 Shadow DOM 樣式隔離
若擴充程式建立自訂 UI 元件，強烈建議透過 Shadow DOM 達成樣式隔離，防止樣式外洩或被主應用程式影響：

```javascript
const widget = ctx.ui.createFloatingWidget({ id: 'my-widget' });
const shadow = widget.element.attachShadow({ mode: 'open' });

const style = document.createElement('style');
style.textContent = `
    :host {
        display: block;
        user-select: none;
    }
    .my-box {
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
    }
`;

const container = document.createElement('div');
container.className = 'my-box';
container.textContent = '元件內容';

shadow.append(style, container);
```

### 7.4 命名空間隔離防護
主程式已實作嚴密的命名空間隔離防護：
- 指令命名空間：擴充註冊之指令強制冠上 `ext.${extensionId}.` 前綴，無法覆寫主編輯器原生快捷鍵或指令。
- 語系命名空間：擴充字典強制掛載於 `ext.${extensionId}.` 命名空間下，無法竄改系統核心多語系文案。
- 儲存鍵隔離：擴充設定固定冠上前綴 `wmcx_ext_settings_`，不得跨擴充讀取或竄改其他外掛之設定值。

---

## 8. 開發測試與安裝步驟

### 8.1 範例對照：時間軸微調旋鈕

專案內建完整範例位於 `examples/timeline-jog-dial`，其原始碼包含：
- `manifest.json`：宣告 `playback:read`、`playback:seek`、`ui:menu`、`ui:popover`、`ui:overlay`、`ui:toast` 與 `i18n:register` 權限。
- `index.js`：實作右側懸浮觸控旋鈕、多語系翻譯、二級選單項目與 Popover 設定面板。

### 8.2 打包擴充程式

完成開發後，將檔案壓縮為 ZIP 封裝包：

```bash
# 以 PowerShell 為例，於 examples/timeline-jog-dial 目錄下打包
Compress-Archive -Path "manifest.json", "index.js" -DestinationPath "timeline-jog-dial.zip" -Force
```

### 8.3 於介面中安裝測試

依序執行以下步驟即可在瀏覽器中進行安裝與測試：

1. 開啟 Web mai Chart X 編輯器首頁。
2. 點擊頂欄右側的拼圖圖示，展開擴充程式選單。
3. 點選選單最下方的「管理擴充程式」選項，開啟擴充程式管理視窗。
4. 點選視窗右下角之「匯入擴充程式」按鈕。
5. 於系統檔案瀏覽視窗選取剛才打包完成的 `.zip` 檔案。
6. 系統解析完成後，會跳出「確認安裝擴充程式」權限清單對話框，顯示該外掛所請求之所有權限與安全提示。
7. 點選「安裝並啟用」，外掛程式即刻生效：
   - 頂欄拼圖選單內將即時渲染該外掛的專屬二級功能項目。
   - 浮動元件會自動掛載於畫面指定方位。
8. 如需停用或移除，可隨時回到「管理擴充程式」面板中點擊「停用」或「移除」按鈕。

