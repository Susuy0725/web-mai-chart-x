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
9. 擴充來源管理與 WERP 協定支援

---

## 1. 擴充程式系統架構概述

Web mai Chart X 擴充程式架構旨在提供第三方外掛動態擴充編輯器功能的機制，同時兼顧效能、主程式穩定性與使用者資料安全。

核心設計原則包含：
- 最小權限原則：擴充程式必須在描述檔案中明確宣告所需權限，未宣告的權限不會注入對應的官方介面與方法。
- 受限上下文控管：擴充程式應透過受限上下文提供的標準方法與主程式互動，避免直接操作底層內部狀態。需注意在現行 `trusted` 執行模式下，擴充程式仍運行於與主程式同源的瀏覽器主執行緒環境，此機制屬於官方介面層級的存取控管與誤操作防護，並非獨立的系統級安全沙盒隔離。
- 宣告式介面整合：頂欄選單與設定面板採用宣告式結構，由主程式統一渲染並自動套用視覺樣式。
- 自動生命週期追蹤：擴充程式透過 `ctx` 註冊的指令、事件監聽器、疊加圖層、選單項目與浮動元件由主程式統一追蹤，停用或移除時自動完成資源回收；擴充程式自行於全域環境建立的資源則須自行釋放。

---

## 2. 擴充包檔案結構與描述規範

### 2.1 壓縮包檔案階層

擴充程式以標準 ZIP 格式封裝，副檔名為 `.zip`。系統支援根目錄平鋪或包含單層根資料夾兩種結構：

```text
# 結構一：檔案位於壓縮包根目錄
example-extension.zip
├── manifest.json
└── index.js

# 結構二：檔案包含單層目錄包裹
example-extension.zip
└── example-extension/
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
| `apiVersion` | 整數 | 否 | `1` | 目標擴充 API 版本，須為正整數且不可高於系統支援版本 |
| `description` | 字串 | 否 | `""` | 擴充功能簡要說明 |
| `author` | 字串 | 否 | `""` | 作者或維護組織名稱 |
| `entry` | 字串 | 否 | `"index.js"` | JavaScript 進入點模組相對路徑 |
| `permissions` | 字串陣列 | 否 | `[]` | 擴充所請求的權限清單，若包含未定義字串將導致載入驗證失敗 |
| `runtime` | 字串 | 否 | `"trusted"` | 執行模式，目前支援 `"trusted"` 與 `"worker"`，預設為 `"trusted"` |
| `homepage` | 字串 | 否 | `""` | 擴充程式專案首頁、原始碼倉庫或說明文件網址，須使用 `https://` |
| `termsUrl` | 字串 | 否 | `""` | 開發者提供的服務條款網址，須使用 `https://` |
| `privacyUrl` | 字串 | 否 | `""` | 開發者提供的隱私權政策網址，須使用 `https://` |

重要注意事項：
- `manifest.json` 必須能成功解析為 JSON 物件，且必須具備 `id`、`name` 與 `version` 欄位。
- 匯入 `.zip` 壓縮包時即會驗證 `id` 命名格式、`permissions` 白名單、`runtime` 值域與 `apiVersion` 相容性。
- `homepage`、`termsUrl` 與 `privacyUrl` 僅接受 `https://` 協定的網址；個人開發者可直接填寫 GitHub 倉庫、GitHub Pages 或公開 Markdown 文件連結，不需額外架設網站。
- 系統註冊與列出擴充清單時，皆會保留 `description` 與 `author` 欄位，未填寫時預設為空字串。
- `runtime` 若設定為 `"worker"`，由於 Worker 沙箱目前尚未啟用，嘗試啟用時會產生錯誤並標記為錯誤狀態。
- 擴充程式系統目前為 Beta 版，外掛會在瀏覽器主環境執行，安裝前請確認來源可信。

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
| `render:overlay` | `EXTENSION_PERMISSIONS.RENDER_OVERLAY` | 註冊畫布自訂疊加圖層、請求畫布重繪與建立受控逐幀影片解碼器 |
| `commands:register` | `EXTENSION_PERMISSIONS.COMMANDS_REGISTER` | 註冊具備擴充名稱空間的自訂指令 |
| `events:subscribe` | `EXTENSION_PERMISSIONS.EVENTS_SUBSCRIBE` | 訂閱系統開放白名單事件 |
| `settings:read` | `EXTENSION_PERMISSIONS.SETTINGS_READ` | 讀取應用程式原生設定的深層凍結唯讀快照 |
| `settings:override` | `EXTENSION_PERMISSIONS.SETTINGS_OVERRIDE` | 動態層疊覆寫應用程式原生設定 |
| `assets:read` | `EXTENSION_PERMISSIONS.ASSETS_READ` | 讀取系統目前載入的圖片貼圖與音效素材鍵名清單 |
| `assets:override` | `EXTENSION_PERMISSIONS.ASSETS_OVERRIDE` | 動態層疊覆寫圖片貼圖與判定打擊音效素材 |
| `ui:toast` | `EXTENSION_PERMISSIONS.UI_TOAST` | 呼叫全域吐司提示訊息 |
| `ui:menu` | `EXTENSION_PERMISSIONS.UI_MENU` | 於頂欄拼圖選單註冊二級選單項目 |
| `ui:popover` | `EXTENSION_PERMISSIONS.UI_POPOVER` | 開啟原生設定面板與存取隔離設定值 |
| `ui:overlay` | `EXTENSION_PERMISSIONS.UI_OVERLAY` | 建立受控的浮動元件掛載容器 |
| `storage` | `EXTENSION_PERMISSIONS.STORAGE` | 於系統分配的隔離儲存空間讀寫擴充專屬資料，移除擴充時自動清除 |
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
  - `maidata`：物件，譜面整體中繼資料。
  - `duration`：數值，時間軸總長度秒數。
  - `notes`：物件陣列，當前難度已解析的音符物件清單。
  - `tags`：物件陣列，譜面已解析的標籤清單。
- 快取與凍結保護：系統會快取已凍結的譜面快照，並針對回傳的快照物件以及內部的 `maidata`、`notes`、`tags` 陣列與元素套用 `Object.freeze`。當譜面資料、難度與總時長未變更時會直接回傳同一份快取實例，以降低每幀重複配置開銷並防止擴充程式就地修改主執行緒資料。

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
    - `phase`：字串，選填，繪製階段，預設為 `'afterNotes'`。若傳入目標畫布不支援的 `phase`，系統將拋出 `TypeError`。各目標畫布支援的階段依由底層至頂層繪製順序如下：
      - 主畫布 `'main'`：
        - `'afterClear'`：清除畫布後、外框輪廓前。
        - `'beforeNotes'`：外框輪廓後、感應區前。
        - `'afterSensors'`：感應區後、中央顯示前。
        - `'afterMiddleDisplay'`：中央顯示後、音符與花火前。
        - `'afterNoteObjects'`：音符本體後、打擊與判定特效前。
        - `'afterEffects'`：打擊與判定特效後、圓外黑色遮罩前。
        - `'afterBorder'`：黑色遮罩後、周邊輔助文字與介面之前。
        - `'afterNotes'`：所有原生圖層與介面之後的最頂層。
      - 視覺化編輯器 `'visual'`：
        - `'beforeNotes'`：背景、波形、標籤與時間基準線後、音符前。
        - `'afterNoteObjects'`：音符本體後、選取框與預覽標記前。
        - `'afterNotes'`：所有編輯互動覆蓋層之後的最頂層。
    - `order`：數值，選填，排序權重，預設為 `0`，數值小者先繪製。
    - `includeInVideo`：布林值，選填，預設為 `false`，決定該圖層是否於影片匯出期間一併繪製。
    - `prepareVideoFrame`：函式，選填，離線影片匯出前置非同步準備回呼，僅於 `target` 為 `'main'` 且 `includeInVideo` 為 `true` 時於每幀同步繪製前依 `order` 順序執行，接收物件 `{ globalTime, frameIndex, frameCount, dt, width, height, signal }`，可回傳 Promise。其中 `signal` 為 `AbortSignal`，使用者取消匯出時會觸發中斷。
    - `prepareTimeoutMs`：數值，選填，單幀 `prepareVideoFrame` 逾時保護毫秒數，預設為 `3000`，允許範圍為 `100` 至 `30000`。
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
- `phase`：字串，當前繪圖階段，對應註冊時指定的圖層階段名稱。

#### 畫布狀態與錯誤隔離機制

系統於呼叫疊加圖層時提供嚴密的狀態防護與例外隔離：
- 狀態隔離：底層在執行每個圖層的 `draw` 前會自動呼叫 `ctx.save()`，並於繪製完成後的 `finally` 區塊呼叫 `ctx.restore()`，確保各擴充圖層的繪圖狀態、剪裁區域或座標變換矩陣不互相污染，亦不干擾核心渲染引擎。
- 錯誤隔離：以 `try...catch` 包裹各圖層的 `draw` 呼叫。若圖層繪製時拋出例外，將於控制台記錄錯誤訊息，不會中斷主渲染迴圈或其他圖層的繪製作業。
- 渲染耗時預算保護：若單一疊加圖層在非影片匯出渲染時連續 30 幀的單幀繪製時間超過 12 毫秒，註冊表會自動移除該疊加圖層並透過提示訊息通知使用者，避免持續拖慢主畫面幀率；影片匯出時的逐幀離線渲染不計入此熔斷限制。
- 影片匯出控制：預設情況下 `includeInVideo` 為 `false`，影片匯出期間會自動跳過該圖層；若明確設為 `true`，系統會於影片匯出期間執行該圖層的 `draw` 並傳入 `isRenderingVideo: true`，供擴充程式依設定決定是否繪製。若同時提供 `prepareVideoFrame`，系統會於每幀同步繪製前 `await` 該非同步鉤子並套用 `try...catch` 例外隔離與單幀逾時保護；若單一圖層連續逾時達 10 幀，該次匯出將自動略過其前置等待以防卡死。

#### `ctx.render.requestRedraw()`
- 權限需求：`render:overlay`
- 參數：無
- 行為：發布 `canvas:redraw` 事件，請求主程式立即排程重新繪製畫布。
- 回傳：無回傳值。

#### `ctx.render.createVideoFrameDecoder(source, options = {})`
- 權限需求：`render:overlay`
- 參數：
  - `source`：`Blob`、`File` 或網址字串，欲解碼的影片來源。
  - `options`：物件，選填：
    - `endBehavior`：字串，選填，超出影片長度時的預設行為，可選值為 `'stop'` 或 `'loop'`，預設為 `'stop'`。
    - `width`：數值，選填，解碼輸出畫布目標寬度。
    - `height`：數值，選填，解碼輸出畫布目標高度。
- 回傳：Promise，解析為受控解碼器物件 `{ duration, getFrameAt, dispose }`：
  - `duration`：數值，影片總長度秒數。
  - `getFrameAt(time, callOptions = {})`：非同步函式，傳入目標秒數 `time` 與選填 `{ endBehavior }`，內部自動維護循序解碼迭代器推進、循環回繞與跳轉重建，回傳唯讀影格物件 `{ canvas, timestamp, duration, width, height }` 或 `null`。
  - `dispose()`：非同步函式，提前關閉迭代器並釋放底層解碼器資源。
- 生命週期：擴充停用時系統會自動呼叫 `dispose()` 釋放解碼器資源。
- 備註：若圖層僅使用 Canvas 畫筆繪製或繪製靜態圖片，只需於 `registerOverlay` 開啟 `includeInVideo: true` 並於 `draw` 依 `globalTime` 繪圖即可，無需使用此解碼器。

使用範例：

```javascript
const decoder = await ctx.render.createVideoFrameDecoder(videoFile, {
    endBehavior: 'loop',
    width: 320
});
let latestFrame = null;

ctx.render.registerOverlay({
    target: 'main',
    phase: 'afterBorder',
    includeInVideo: true,
    async prepareVideoFrame({ globalTime, signal }) {
        if (signal?.aborted) return;
        const frame = await decoder.getFrameAt(globalTime);
        if (!signal?.aborted && frame) {
            latestFrame = frame;
        }
    },
    draw(rc) {
        if (!latestFrame) return;
        rc.ctx.drawImage(latestFrame.canvas, 0, 0, rc.width, rc.height);
    }
});
```

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

### 3.11 資料儲存介面：`ctx.storage`

宣告 `storage` 權限時注入此介面。未宣告此權限時，`ctx.storage` 為 `undefined`。

資料以擴充識別碼為鍵名空間存放於瀏覽器 `localStorage` 的 `wmcx_ext_data_<id>` 欄位，屬於邏輯隔離而非加密或系統級儲存沙盒；移除擴充程式時系統會一併清除 `wmcx_ext_settings_<id>` 與 `wmcx_ext_data_<id>`。

#### `ctx.storage.get(key, defaultValue = null)`
- 權限需求：`storage`
- 參數：
  - `key`：字串，儲存鍵名。
  - `defaultValue`：任意型別，選填，當該鍵不存在時回傳的預設值，預設為 `null`。
- 回傳：自隔離儲存區讀取對應鍵的數值，若不存在則回傳 `defaultValue`。

#### `ctx.storage.set(key, value)`
- 權限需求：`storage`
- 參數：
  - `key`：字串，儲存鍵名。
  - `value`：任意型別，欲寫入的數值（內部會透過 JSON 序列化儲存）。
- 回傳：布林值，表示寫入是否成功。

#### `ctx.storage.remove(key)`
- 權限需求：`storage`
- 參數：
  - `key`：字串，欲移除的儲存鍵名。
- 回傳：布林值，表示移除是否成功。

#### `ctx.storage.clear()`
- 權限需求：`storage`
- 參數：無
- 行為：清空當前擴充在隔離儲存空間內的所有資料。
- 回傳：布林值，表示清空是否成功。

#### `ctx.storage.keys()`
- 權限需求：`storage`
- 參數：無
- 回傳：字串陣列，包含當前擴充在隔離儲存空間內所有已儲存的鍵名列表。

### 3.12 國際化多語系介面：`ctx.i18n`

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

### 3.13 原生設定介面：`ctx.settings`

宣告 `settings:read` 或 `settings:override` 權限時注入此介面。未宣告任何設定權限時，`ctx.settings` 為 `undefined`。

本介面提供外掛以非破壞性方式讀取或層疊覆寫編輯器的原生運作設定。所有覆寫皆具備以下關鍵特質：
- 執行期層疊堆疊：多個外掛覆寫同一設定項時依啟用順序堆疊，後啟用者優先；當上層外掛釋放覆寫或停用時，系統自動回退至次一層外掛之覆寫值或原始基準值。
- 持久化隔離保護：外掛所進行的設定覆寫僅於記憶體中生效，不會寫入使用者在本機儲存的持久化設定。當使用者手動儲存設定時，系統會自動濾除所有外掛覆寫，僅保存純淨的使用者原生基準設定。
- 即時連動與重繪：覆寫生效或還原時會自動發布 `settings:changed` 事件，其酬載包含 `isExtensionOverride: true` 旗標，並觸發畫布即時重繪。若使用者在原生設定面板修改了被外掛覆寫的項目，系統會更新底層基準值，並在外掛覆寫存在期間繼續保持外掛設定值優先。
- 自動生命週期還原：外掛停用或卸載時，系統自動清理該外掛的所有設定覆寫並還原基準設定。

#### `ctx.settings.get(key, defaultValue = undefined)`
- 權限需求：`settings:read` 或 `settings:override`
- 參數：
  - `key`：字串，設定鍵名。支援以小數點分隔的多層路徑，例如 `'noteSpeed'` 或 `'skin.note'`。
  - `defaultValue`：任意型別，選填，預設為 `undefined`。當路徑不存在或鍵名非有效字串時回傳。
- 回傳：該設定項目之深層複製且經 `Object.freeze` 凍結之唯讀物件或原始型別值。若設定不存在則回傳 `defaultValue`。

#### `ctx.settings.getAll()`
- 權限需求：`settings:read` 或 `settings:override`
- 參數：無
- 回傳：目前應用程式所有原生設定的深層複製且凍結之唯讀快照物件。

#### `ctx.settings.override(key, value)`
- 權限需求：`settings:override`
- 參數：
  - `key`：字串，目標設定鍵名。支援以小數點分隔的多層路徑，例如 `'noteSpeed'` 或 `'judgeVolume'`。系統內建防護機制，嚴格禁止傳入包含 `__proto__`、`constructor` 或 `prototype` 之不安全路徑。
  - `value`：任意型別，欲覆寫設定之目標數值。內部會自動深層複製，避免物件參照外洩。
- 行為：將覆寫條目推入該設定鍵之堆疊頂端，更新現行設定物件，發布 `settings:changed` 事件並自動呼叫 `appContext.draw()` 重繪畫面。
- 回傳：清理函式。呼叫此函式可提前撤銷該筆設定覆寫並自動恢復前一層或原始基準值。
- 生命週期：外掛停用時系統會自動執行所有已註冊的清理函式，恢復原始設定。

#### `ctx.settings.overrideMany(entries)`
- 權限需求：`settings:override`
- 參數：
  - `entries`：物件，包含複數設定路徑與目標數值的鍵值對，例如 `{ 'noteSpeed': 7.5, 'touchEffect': false }`。
- 行為：批次套用多項設定覆寫。若套用過程中任一路徑驗證失敗，會自動回復本次呼叫已套用的所有覆寫。
- 回傳：清理函式。呼叫此函式可一次撤銷本次批次套用的所有設定覆寫。

#### `ctx.settings.clearOverrides()`
- 權限需求：`settings:override`
- 參數：無
- 行為：立即撤銷當前擴充程式註冊的所有設定覆寫，還原受影響的設定項目至次層覆寫或原始基準值，並觸發重繪。

### 3.14 素材覆寫介面：`ctx.assets`

宣告 `assets:read` 或 `assets:override` 權限時注入此介面。未宣告任何素材權限時，`ctx.assets` 為 `undefined`。

本介面提供外掛以非破壞性方式查詢與動態置換遊戲內的圖片貼圖與打擊音效緩衝。具備以下關鍵特質：
- 支援豐富來源格式：圖片素材支援 HTMLImageElement、HTMLCanvasElement、ImageBitmap、Blob 以及網址或字串；音效素材支援 AudioBuffer、ArrayBuffer、ArrayBufferView、Blob 以及音訊網址或字串。
- 堆疊管理與自動還原：素材覆寫採用分層堆疊架構，多個外掛可安全層疊覆寫相同素材。外掛停用或卸載時，系統自動還原原始素材、釋放建立的二進位物件網址，並取消非同步載入中的請求。
- 切換外觀自動重套用：當使用者在設定中切換 Skin 重新載入整套原生素材時，系統會自動更新底層素材基準，並自動重新套用現行已啟用的外掛圖片覆寫，無須外掛手動重設。
- 支援錄影匯出渲染：覆寫後的材質貼圖直接同步至渲染引擎與預覽畫布，解碼後的音效亦直接駐留於音效緩衝映射表中。進行譜面影片錄製與離線匯出渲染時，自訂材質與音效皆能完整生效。

#### `ctx.assets.listImageKeys()`
- 權限需求：`assets:read` 或 `assets:override`
- 參數：無
- 回傳：字串陣列，列出系統目前圖片字典中的所有素材鍵名，包含各類音符外觀、點擊特效、判定字樣與按鍵圖樣。

#### `ctx.assets.listSoundKeys()`
- 權限需求：`assets:read` 或 `assets:override`
- 參數：無
- 回傳：字串陣列，列出系統目前音訊管理器中註冊的所有打擊音效鍵名，包含 tap、each、break、slide、judge 等音效。

#### `ctx.assets.overrideImage(key, source)`
- 權限需求：`assets:override`
- 參數：
  - `key`：字串，欲覆寫的圖片素材鍵名。
  - `source`：支援的圖片來源格式，可傳入 HTMLImageElement、HTMLCanvasElement、ImageBitmap、Blob，或圖片網址、物件網址、Base64 字串。
- 行為：非同步將來源解析為已載入的 HTMLImageElement，推入該鍵之覆寫堆疊頂端，並自動同步至主畫布渲染器、視覺化編輯器與預覽畫布，隨後觸發畫面重繪。
- 回傳：Promise 物件，解析為清理函式。呼叫清理函式可撤銷該筆覆寫、釋放暫存之物件網址，並還原上一層覆寫或原始素材。
- 生命週期：外掛停用時自動復原原始貼圖並釋放相關物件網址。

#### `ctx.assets.overrideImages(entries)`
- 權限需求：`assets:override`
- 參數：
  - `entries`：物件，鍵名為圖片素材識別碼，值為對應之圖片來源格式。
- 行為：非同步批次解析並覆寫多組圖片素材。若任一素材解析失敗，系統會自動還原該次呼叫已套用的所有圖片覆寫。
- 回傳：Promise 物件，解析為清理函式。呼叫清理函式可一次撤銷本次批次套用的所有圖片覆寫。

#### `ctx.assets.overrideSound(key, source)`
- 權限需求：`assets:override`
- 參數：
  - `key`：字串，欲覆寫的音效素材鍵名。
  - `source`：支援的音訊來源格式，可傳入 AudioBuffer、ArrayBuffer、ArrayBufferView、Blob，或音訊檔案網址、Data URL 字串。
- 行為：非同步解碼音訊資料為 AudioBuffer，系統會自動濾除 ID3 標籤並呼叫音訊上下文完成解碼，推入音效覆寫堆疊頂端，並更新音訊管理器的緩衝映射表。
- 回傳：Promise 物件，解析為清理函式。呼叫清理函式可撤銷該筆音效覆寫並還原上一層音效或原始音效。
- 生命週期：外掛停用時自動還原原始音效緩衝。

#### `ctx.assets.overrideSounds(entries)`
- 權限需求：`assets:override`
- 參數：
  - `entries`：物件，鍵名為音效素材識別碼，值為對應之音訊來源格式。
- 行為：非同步批次解碼並覆寫多組音效素材。若任一音效解碼失敗，系統會自動復原本次呼叫已套用的所有音效覆寫。
- 回傳：Promise 物件，解析為清理函式。呼叫清理函式可一次撤銷本次批次套用的所有音效覆寫。

#### `ctx.assets.clearOverrides()`
- 權限需求：`assets:override`
- 參數：無
- 行為：立即撤銷當前擴充程式註冊的所有圖片貼圖與打擊音效覆寫，釋放相關暫存資源，還原受影響的素材並同步至各畫布渲染器。

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
| `settings:changed` | 應用程式原生設定變更，或由擴充程式套用或解除設定覆寫時觸發 | `{ key: string, value: any, oldVal: any, allSettings: Object, isExtensionOverride?: boolean }`，包含異動的最上層設定鍵名、新值、舊值、最新完整設定快照，以及是否由擴充覆寫所引發之布林旗標 |

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
呈現為遮罩密碼輸入框，並附帶顯示與隱藏切換按鈕。支援選填 `placeholder` 或 `placeholderKey`。需注意底層儲存於 `localStorage` 仍為明文形式，開發者不應向使用者宣稱該欄位具備高強度加密保護。
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
3. 調用啟動函式，並捕捉執行期間之例外。若發生錯誤，將狀態標記為錯誤並自動清理所有已透過 `ctx` 分配之資源。
4. 收集啟動函式回傳之清理機制。

注意：系統自動回收的範圍僅涵蓋透過 `ctx` 官方介面註冊的指令、事件監聽器、疊加圖層、選單項目、浮動元件與設定覆寫；若擴充程式自行在 `window` 或 `document` 綁定事件、建立計時器或發起背景工作，必須於清理函式中主動釋放。

啟動崩潰防護與安全模式機制：
- 啟動崩潰防護機制：應用程式啟動還原已啟用的擴充程式時，會透過 `sessionStorage` 鍵值 `wmcx_ext_activating` 追蹤正在啟動的擴充程式 ID；若啟動過程中發生嚴重崩潰或無窮迴圈導致頁面異常重載，下次啟動時會自動將該擴充程式改為停用狀態並提示使用者。
- 安全模式啟動參數：於網址列加上 `?safeMode=1` 或 `?safeMode=true` 時，系統僅登錄已安裝的擴充程式但不執行自動啟動，方便使用者進入擴充程式管理視窗檢視或移除問題項目。

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

### 6.3 自動資源回收機制

當擴充程式被停用、重新載入、解除安裝，或在啟動時拋出例外時，系統會針對透過官方 `ctx` 介面註冊的資源執行以下標準清理作業，惟不保證特定執行順序：
- 銷毀透過 `ctx.ui.createFloatingWidget` 建立的 DOM 元素。
- 關閉當前開啟的 Popover 設定面板。
- 註銷透過 `ctx.commands.register` 註冊的所有指令。
- 取消透過 `ctx.events.on` 訂閱的所有事件監聽器。
- 註銷透過 `ctx.render.registerOverlay` 註冊的疊加圖層並觸發畫布重繪。
- 釋放透過 `ctx.render.createVideoFrameDecoder` 建立的逐幀影片解碼器資源。
- 移除透過 `ctx.ui.registerMenuItem` 註冊的選單項目。
- 卸載透過 `ctx.i18n.registerTranslations` 註冊的多語系詞典。
- 還原透過 `ctx.settings` 套用的所有原生設定覆寫並觸發畫面重繪。
- 還原透過 `ctx.assets` 套用的所有圖片貼圖與打擊音效覆寫，釋放暫存物件網址並同步更新渲染器。
- 嘗試取消尚未完成的素材非同步載入或解碼作業。
- 執行擴充啟動函式所回傳的清理函式。

此自動回收機制僅涵蓋上述官方介面資源之標準清理流程，外掛開發者仍須自行確保清理函式不會拋出未預期例外，並主動釋放於全域環境自行建立的計時器、背景工作或外部事件監聽器。

---

## 7. 安全性規範與介面隔離

為了維護整體應用程式的執行穩定與防止惡意程式碼注入，本節區分「開發者應遵守的安全開發規範」與「平台透過官方介面執行的技術隔離機制」。

在現行架構下，擴充程式於 `trusted` 模式中係與主程式運行於同源的瀏覽器主執行緒環境，平台尚未啟用獨立沙盒隔離。受限上下文與權限宣告主要用於規範官方介面的存取邊界與誤操作防護，並非無法繞過的系統級安全沙盒。以下 7.1 至 7.2 節屬於所有擴充開發者必須遵守的安全開發規範；7.4 節則說明透過官方 `ctx` 介面呼叫時由主程式強制套用的隔離機制。

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

### 7.4 命名空間隔離機制
透過官方 `ctx` 介面註冊與儲存資料時，主程式提供以下命名空間邏輯隔離與防呆機制：
- 指令命名空間：擴充註冊之指令強制冠上 `ext.${extensionId}.` 前綴，避免與主編輯器原生快捷鍵或指令衝突。
- 語系命名空間：擴充字典強制掛載於 `ext.${extensionId}.` 命名空間下，避免覆蓋系統核心多語系文案。
- 儲存鍵隔離：擴充設定與資料分別冠上前綴 `wmcx_ext_settings_` 與 `wmcx_ext_data_`；此屬於鍵名空間邏輯隔離而非瀏覽器儲存沙盒，開發者不得直接存取 `localStorage` 跨擴充讀取或修改其他外掛之設定與資料。
- 設定覆寫防護：設定路徑嚴格禁止包含 `__proto__`、`constructor` 或 `prototype` 等原型鏈屬性，且覆寫僅存於記憶體堆疊中，持久化儲存時會由系統自動濾除，不會寫入使用者本機設定。
- 來源追蹤與更新隔離：`Scripts/core/extensionStorage.js` 與 `Scripts/core/extensionLoader.js` 支援選填的來源追蹤中繼欄位 `sourceRepoUrl` 與 `packageSha256`，並提供 `listStoredExtensionMeta()` 查詢已安裝套件中繼索引清單。此機制用於鎖定擴充套件的安裝資料源，確保版本更新檢查僅能向原始來源進行，防止不同來源以相同識別碼跨來源覆蓋套件。

### 7.5 外部網路傳輸、金鑰保管與條款揭露分級規範
針對外掛是否對外連線或處理敏感資料，開發者應遵循以下分級揭露規範：
- 純本地離線運作之擴充程式：不強制要求提供獨立的服務條款與隱私權政策，僅須提供正確作者資訊與功能說明，並遵守本手冊安全規範。
- 涉及外部網路請求、第三方服務或金鑰輸入之擴充程式：若外掛會將譜面、設定或輸入內容傳送至外部伺服器或人工智慧介面，或請求使用者輸入第三方金鑰與憑證，開發者應於外掛說明文件或設定介面中明確揭露資料傳送對象、用途及留存方式，並於 `manifest.json` 提供 `privacyUrl` 與 `termsUrl` 連結。
- 禁止未經授權之資料蒐集與外傳：不得透過外掛側錄使用者譜面、本地儲存資料或帳號資訊，且所有外掛行為均須符合主程式服務條款與隱私權政策中關於第三方擴充功能之規範。

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
6. 系統解析完成後，會跳出「確認安裝擴充程式」權限清單對話框，顯示該外掛所請求之所有權限、安全提示，以及開發者提供之專案首頁、服務條款與隱私權政策連結。
7. 點選「安裝並啟用」，外掛程式即刻生效：
   - 頂欄拼圖選單內將即時渲染該外掛的專屬二級功能項目。
   - 浮動元件會自動掛載於畫面指定方位。
8. 如需停用或移除，可隨時回到「管理擴充程式」面板中點擊「停用」或「移除」按鈕。

---

## 9. 擴充來源管理與 WERP 協定支援

### 9.1 協定定位與架構概述

Web mai Chart X 透過 `Scripts/core/extensionRepo.js` 實作 WERP v1.0 開放式靜態儲存庫協定。協定設計目標為去中心化發布、靜態託管與輕量整合，儲存庫僅需提供符合規範的 JSON 索引檔案與 ZIP 套件，即可部署於任何支援 HTTPS 的靜態伺服器，不需後端服務或使用者驗證機制。

完整協定規格請參閱 [docs/werp.md](werp.md)。

### 9.2 擴充程式管理器之擴充來源分頁

擴充程式管理器介面提供兩個主要分頁：
- 已安裝：檢視、啟用、停用與移除本機已安裝的擴充程式，並支援手動匯入 ZIP 封裝包。
- 擴充來源：管理第三方儲存庫資料源、瀏覽各來源提供的套件清單、檢查更新並執行線上安裝。

資料源管理具備以下機制：
- 新增來源：使用者輸入儲存庫索引網址後，系統進行即時連線與格式預檢，展示儲存庫名稱、宣告識別碼、簡介與套件總數，確認無誤後寫入本機資料庫。
- 獨立重新整理：各來源支援單獨重新整理，亦可批次重新整理所有來源。若單一資料源發生連線中斷或索引解析失敗，系統會保留該來源上次成功的快取索引並記錄錯誤狀態，不影響其他正常來源的運作。
- 來源移除：使用者可隨時移除已儲存的資料源。依協定規範，移除資料源不會自動解除安裝已從該來源取得的擴充程式。

### 9.3 索引驗證與同源安全路徑規範

取得遠端儲存庫資料時，`Scripts/core/extensionRepo.js` 執行嚴密的結構驗證與路徑安全限制：
- 協定與格式檢驗：來源網址必須採用 HTTPS 協定。索引內容必須為 UTF-8 編碼之 JSON 物件，且 `schemaVersion` 必須為整數 1，若版本不相容則終止解析。
- 必要欄位與唯一性：根節點必須具備非空字串 `name`、符合反向網域名稱格式的 `identifier`、字串型別之 `description` 與陣列型別之 `extensions`。同一份索引中嚴禁出現重複的擴充程式識別碼。
- 語意化版本格式：每個擴充項目的 `version` 欄位必須嚴格符合 SemVer 2.0.0 語意化版本規範，客戶端比對版本時依據語意化版本規則進行先後判定，而非單純字串排序。
- 同源 HTTPS 相對路徑檢查：擴充項目的套件路徑 `file` 欄位必須為相對於索引網址的相對路徑，且副檔名必須為 `.zip`。系統解析路徑時強制執行安全限制：不得包含查詢參數、網址片段、反斜線或上層路徑符號 `..`，不得為絕對網址或協定相對網址。解析後產生的套件網址必須使用 HTTPS 協定，且必須與索引網址具有完全相同的 Origin 同源網域，防止跨網域下載或路徑穿越攻擊。

### 9.4 完整性驗證、權限確認與來源隔離安裝流程

透過擴充來源分頁安裝或更新套件時，執行完整的安全作業程序：
1. 套件下載與 SHA-256 完整性驗證：客戶端依據解析後的同源網址下載 ZIP 套件，並利用 Web Cryptography 介面計算下載檔案原始位元組之 SHA-256 雜湊值。此雜湊值必須與索引中 `sha256` 欄位宣告的 64 位元十六進位字串完全一致；若驗證失敗則立即中止流程，防止檔案在傳輸中毀損或遭到置換。
2. 權限審查與確認流程：下載並通過完整性驗證後，由 `Scripts/core/extensionLoader.js` 解析套件中的 `manifest.json` 與進入點程式碼，開啟權限清單確認對話框，逐項列出該擴充程式所請求的權限、功能說明與安全性提醒，由使用者確認授權後始可進行本機儲存與註冊啟用。
3. 來源追蹤中繼儲存：安裝完成時，`Scripts/core/extensionStorage.js` 與 `Scripts/core/extensionLoader.js` 會將套件保存至本機 IndexedDB，並在索引中寫入選填的來源追蹤中繼欄位 `sourceRepoUrl` 與 `packageSha256`。
4. 來源隔離與更新檢查：系統提供 `listStoredExtensionMeta()` 查詢本機所有外掛的中繼索引。擴充來源分頁評估套件狀態時，依據來源網址進行嚴格隔離：
   - 若本機已存在相同識別碼但來自不同來源或手動匯入的套件，系統會標示為其他來源安裝，禁止未經授權跨來源覆蓋。
   - 若來源相符且索引版本高於本機版本，系統提示有可用更新並支援一鍵升級。
   - 若版本相同但雜湊值不同，系統會將其標記為套件內容異動而非一般版本升級，確保使用者清楚掌握套件變更。

