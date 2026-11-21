/**
 * @file docData.js
 * @description Web mai Chart X 開發者手冊詞條與導覽結構資料。
 */

export const DOC_CORE_NOTICES = [
    {
        label: '信任模型',
        text: '所有插件皆透過動態 ESM 載入並運行於瀏覽器主執行緒，無系統級沙盒隔離，可修改頁面 DOM 並讀取專案資料；`ctx` 屬於介面層級權限控管。'
    },
    {
        label: 'Worker 模式未實作',
        text: '`manifest.json` 雖允許 `runtime: "worker"` 通過格式驗證，但該模式屬於保留但未實作功能，啟用時會立即進入錯誤狀態並拒絕啟動。'
    },
    {
        label: '錄影逐幀離線渲染',
        text: '譜面影片匯出採用固定幀率逐幀離線渲染，動畫必須完全依 `renderContext.globalTime` 計算，不得依賴 `requestAnimationFrame`、`Date.now()` 或 `performance.now()`。'
    }
];

export const DOC_CATEGORIES = [
    { id: 'guide', label: '快速開始', defaultDocId: 'guide-overview' },
    { id: 'api', label: 'Context API', defaultDocId: 'ctx-base' },
    { id: 'events-schema', label: '事件與設定', defaultDocId: 'events-list' },
    { id: 'werp', label: 'WERP 協定', defaultDocId: 'werp-overview' },
    { id: 'architecture', label: '核心架構', defaultDocId: 'arch-overview' }
];

export const DOC_GROUPS = [
    {
        id: 'group-guide',
        category: 'guide',
        title: '開發入門與規範',
        mono: false,
        defaultOpen: true
    },
    {
        id: 'group-ctx-base',
        category: 'api',
        title: '受限上下文基礎',
        mono: false,
        defaultOpen: true
    },
    {
        id: 'group-ctx-editor',
        category: 'api',
        title: 'ctx.editor',
        mono: true,
        defaultOpen: true
    },
    {
        id: 'group-ctx-playback',
        category: 'api',
        title: 'ctx.playback',
        mono: true,
        defaultOpen: false
    },
    {
        id: 'group-ctx-chart',
        category: 'api',
        title: 'ctx.chart',
        mono: true,
        defaultOpen: false
    },
    {
        id: 'group-ctx-view',
        category: 'api',
        title: 'ctx.view',
        mono: true,
        defaultOpen: false
    },
    {
        id: 'group-ctx-render',
        category: 'api',
        title: 'ctx.render',
        mono: true,
        defaultOpen: true
    },
    {
        id: 'group-ctx-commands',
        category: 'api',
        title: 'ctx.commands',
        mono: true,
        defaultOpen: false
    },
    {
        id: 'group-ctx-events',
        category: 'api',
        title: 'ctx.events',
        mono: true,
        defaultOpen: false
    },
    {
        id: 'group-ctx-ui',
        category: 'api',
        title: 'ctx.ui',
        mono: true,
        defaultOpen: false
    },
    {
        id: 'group-ctx-storage',
        category: 'api',
        title: 'ctx.storage',
        mono: true,
        defaultOpen: false
    },
    {
        id: 'group-ctx-i18n',
        category: 'api',
        title: 'ctx.i18n',
        mono: true,
        defaultOpen: false
    },
    {
        id: 'group-ctx-settings',
        category: 'api',
        title: 'ctx.settings',
        mono: true,
        defaultOpen: false
    },
    {
        id: 'group-ctx-assets',
        category: 'api',
        title: 'ctx.assets',
        mono: true,
        defaultOpen: false
    },
    {
        id: 'group-events-schema',
        category: 'events-schema',
        title: '事件訂閱與面板綱要',
        mono: false,
        defaultOpen: true
    },
    {
        id: 'group-werp',
        category: 'werp',
        title: '擴充儲存庫協定',
        mono: false,
        defaultOpen: true
    },
    {
        id: 'group-architecture',
        category: 'architecture',
        title: '主程式架構與引擎',
        mono: false,
        defaultOpen: true
    }
];

export const DOC_ITEMS = [
    /* ======================================================================
       一、快速開始與規範
       ====================================================================== */
    {
        id: 'guide-overview',
        category: 'guide',
        groupId: 'group-guide',
       stability: 'stable',
        title: '擴充程式系統架構概述',
        sidebarLabel: '系統架構概述',
        sidebarMono: false,
        subtitle: 'Web mai Chart X 插件開發者 API 系統設計、主執行緒信任模型與權限控管原則。',
        status: {
            variant: 'free',
            label: '核心概念',
            permissions: ['免宣告額外權限'],
            envs: ['Trusted 主執行緒模式', 'worker 模式未實作'],
            apiVersion: 'API v1'
        },
        overview: [
            '本手冊面向 Web mai Chart X 第三方插件開發者，僅涵蓋擴充程式 API、生命週期、離線錄影疊加與儲存庫協定，並非譜面寫譜教學。',
            '外掛啟用時不會直接取得底層的 `appContext` 或原始資料庫參照，而是由主程式依據 `manifest.json` 宣告的權限清單組裝專屬的受限上下文物件 `ctx`。',
            '就信任模型而言，現行所有擴充程式皆透過動態 ESM 載入並運行於瀏覽器主執行緒，沒有獨立的系統級安全沙盒，插件可修改頁面 DOM 並讀取當前專案資料。`ctx` 屬於官方介面層級的權限控管與誤操作防護，並非安全隔離邊界。'
        ],
        notes: [
            '最小權限原則：擴充程式必須在描述檔案中明確宣告所需權限，未宣告的權限不會注入對應的官方介面與方法。',
            '受限上下文控管：擴充程式應透過 `ctx` 提供的標準方法與主程式互動，避免直接操作底層未公開的內部狀態。',
            '宣告式介面整合：頂欄選單與設定面板採用宣告式結構，由主程式統一渲染並自動套用原站深色毛玻璃視覺樣式。',
            '自動生命週期追蹤：透過 `ctx` 註冊的指令、事件監聽器、疊加圖層、選單項目、浮動元件、設定與素材覆寫由主程式統一追蹤，停用或移除時自動回收。'
        ],
        callouts: [
            {
                variant: 'warning',
                title: '信任模型與 runtime: worker 未實作警告',
                items: [
                    '插件直接執行於主應用程式同源的瀏覽器主執行緒，具備完整的 DOM 操作權限，無沙盒隔離；請勿在不受信任環境執行未審核之第三方插件。',
                    '`manifest.json` 的 `runtime` 欄位若設為 `worker`，雖可通過描述檔字串格式檢查，但 Worker 執行通道屬於「保留但未實作」狀態，系統尚未提供 Worker 沙盒，嘗試啟用時會立即拋出錯誤並將外掛標記為 `error` 狀態，請勿將其當成可用功能。'
                ]
            }
        ],
        examples: [
            {
                label: '最小可行擴充程式結構',
                code: `export default function activate(ctx) {
    if (ctx.hasPermission('ui:toast')) {
        ctx.ui.toast({
            content: '擴充程式已就緒',
            type: 'success'
        });
    }

    return () => {
        // 釋放自行建立的計時器或外部事件監聽
    };
}`
            }
        ],
        summary: {
            namespace: '開發入門',
            permission: '無',
            constant: '無',
            async: '支援同步或非同步進入點',
            runtime: 'Trusted 主執行緒模式，無沙盒',
            since: 'API v1'
        },
        seeAlso: ['guide-minimal-plugin', 'guide-manifest', 'guide-permissions', 'guide-lifecycle-events', 'ctx-base']
    },
    {
        id: 'guide-minimal-plugin',
        category: 'guide',
        groupId: 'group-guide',
       stability: 'stable',
        title: '最小可運作插件',
        codeTitle: 'manifest.json + index.js',
        sidebarLabel: '最小可運作插件',
        sidebarMono: false,
        subtitle: '彙整 manifest.json 全部 12 個欄位、兩種插件載入方式，並提供從零到可直接執行的完整端到端範例。',
        status: {
            variant: 'free',
            label: '快速實作總覽',
            permissions: ['commands:register', 'ui:menu', 'ui:toast'],
            envs: ['ZIP 本機匯入', 'WERP 遠端安裝', 'Trusted 主執行緒'],
            apiVersion: 'API v1'
        },
        overview: [
            '一個可執行的 Web mai Chart X 插件至少需要 `manifest.json` 描述檔與進入點 JavaScript 模組兩份檔案，打包為 `.zip` 壓縮檔即可安裝啟用。',
            '支援兩種載入與安裝路徑：開發測試時可透過編輯器頂欄拼圖選單內的「管理擴充程式」直接匯入本機 `.zip` 檔；公開發布時則可託管符合 WERP 協定的靜態 `index.json` 與 `.zip` 套件，由擴充程式管理器的「擴充來源」分頁下載並經 SHA-256 校驗後安裝至 IndexedDB。'
        ],
        tables: [
            {
                title: 'manifest.json 全部 12 個欄位規格',
                columns: ['欄位名稱', '型別', '必填', '預設值', '驗證規則與說明'],
                rows: [
                    ['`id`', 'string', '是', '無', '反向網域格式唯一識別碼，須符合 `/^[a-z0-9][a-z0-9_-]*(\\.[a-z0-9][a-z0-9_-]*)+$/i`，例如 `com.example.hello-plugin`'],
                    ['`name`', 'string', '是', '無', '插件顯示名稱，不可為空字串'],
                    ['`version`', 'string', '是', '無', '插件版本字串，建議採用語意化版本格式如 `1.0.0`'],
                    ['`apiVersion`', 'number', '否', '`1`', '目標擴充 API 版本，須為正整數且不可高於系統現行版本 `1`'],
                    ['`description`', 'string', '否', '`""`', '顯示於管理視窗與權限確認框的簡要功能說明'],
                    ['`author`', 'string', '否', '`""`', '開發者或維護團隊名稱'],
                    ['`entry`', 'string', '否', '`"index.js"`', '進入點 ESM 模組於壓縮包內的相對路徑'],
                    ['`permissions`', 'Array<string>', '否', '`[]`', '宣告所需官方權限識別碼陣列，出現任何不在 19 項白名單內的字串即拒絕載入'],
                    ['`runtime`', 'string', '否', '`"trusted"`', '執行環境宣告，僅支援 `trusted`；`worker` 字串雖可通過描述檔格式驗證，但屬於保留但未實作功能，啟用時會進入錯誤狀態'],
                    ['`homepage`', 'string', '否', '`""`', '插件首頁或原始碼倉庫網址，非空時必須為 `https://` 協定'],
                    ['`termsUrl`', 'string', '否', '`""`', '服務條款頁面網址，非空時必須為 `https://` 協定'],
                    ['`privacyUrl`', 'string', '否', '`""`', '隱私權政策頁面網址，非空時必須為 `https://` 協定']
                ]
            },
            {
                title: '兩種插件載入方式比較',
                columns: ['載入方式', '操作路徑', '適用情境', '驗證與儲存行為'],
                rows: [
                    ['本機 ZIP 匯入', '頂欄拼圖選單 → 管理擴充程式 → 匯入擴充程式', '本機開發除錯與單機安裝', '解析 ZIP 後驗證 `manifest.json`、彈出權限授權視窗，確認後寫入 IndexedDB 並以 Blob URL 載入執行'],
                    ['WERP 遠端來源', '管理擴充程式 → 擴充來源 → 新增索引網址', '公開發布與自動更新檢查', '讀取同源 HTTPS `index.json`、依 `sha256` 校驗下載之 `.zip` 後驗證 manifest 並請求權限授權']
                ]
            }
        ],
        callouts: [
            {
                variant: 'warning',
                title: '執行模式提醒',
                items: [
                    '請省略 `runtime` 或明確設為 `"trusted"`。切勿依賴 `"worker"` 進行沙盒隔離，該模式目前僅保留欄位檢查而未實作執行通道。',
                    '所有插件皆於瀏覽器主執行緒執行，可存取頁面 DOM 與專案資料，安裝前會向使用者展示所宣告的 `permissions` 與開發者連結。'
                ]
            }
        ],
        examples: [
            {
                label: '1. manifest.json',
                code: `{
  "id": "com.example.minimal-stats",
  "name": "最小譜面字數統計插件",
  "version": "1.0.0",
  "apiVersion": 1,
  "description": "於頂欄選單新增按鈕，點擊時讀取編輯器內容並顯示提示訊息。",
  "author": "Plugin Developer",
  "entry": "index.js",
  "runtime": "trusted",
  "permissions": [
    "editor:read",
    "commands:register",
    "ui:menu",
    "ui:toast"
  ]
}`
            },
            {
                label: '2. index.js',
                code: `export default function activate(ctx) {
    const offCommand = ctx.commands.register('countChars', () => {
        const text = ctx.editor.getText();
        ctx.ui.toast({
            content: \`目前譜面文字長度：\${text.length} 字元\`,
            type: 'info',
            timeout: 2500
        });
    }, { title: '統計譜面字數' });

    const offMenu = ctx.ui.registerMenuItem({
        id: 'count-chars',
        label: '統計譜面字數',
        commandId: 'countChars'
    });

    ctx.ui.toast({
        content: \`[\${ctx.extensionId}] 插件已啟動\`,
        type: 'success',
        timeout: 2000
    });

    return () => {
        offMenu();
        offCommand();
    };
}`
            },
            {
                label: '3. 壓縮打包指令',
                code: `# PowerShell
Compress-Archive -Path "manifest.json", "index.js" -DestinationPath "minimal-stats-1.0.0.zip" -Force

# Bash / macOS / Linux
zip -r minimal-stats-1.0.0.zip manifest.json index.js`
            }
        ],
        notes: [
            'ZIP 壓縮包支援兩種檔案階層：將 `manifest.json` 與 `index.js` 直接放在壓縮檔根目錄，或包在唯一一層子資料夾內。',
            '進入點模組必須提供 `export default function activate(ctx)` 或具名匯出 `export function activate(ctx)`，缺少匯出函式時會拋出載入錯誤。',
            '即使不手動呼叫 `offMenu()` 或 `offCommand()`，停用或卸載時系統仍會透過 `disposables` 自動回收官方介面註冊項；若插件有自行建立 `setInterval` 或全域事件監聽，則必須在回傳的清理函式中自行清除。'
        ],
        summary: {
            namespace: '開發入門',
            permission: '依實際呼叫的 API 宣告',
            constant: 'EXTENSION_API_VERSION = 1',
            async: '支援同步或非同步 activate',
            runtime: 'Trusted 主執行緒模式',
            since: 'API v1'
        },
        seeAlso: ['guide-manifest', 'guide-permissions', 'guide-lifecycle-events', 'guide-packaging', 'ctx-base']
    },
    {
        id: 'guide-manifest',
        category: 'guide',
        groupId: 'group-guide',
       stability: 'stable',
        title: '擴充包與描述檔規格',
        codeTitle: 'manifest.json',
        sidebarLabel: 'manifest.json 規格',
        sidebarMono: false,
        subtitle: '定義擴充程式壓縮包檔案階層、必要描述欄位與相容性驗證規則。',
        status: {
            variant: 'free',
            label: '封裝規範',
            permissions: ['ZIP 封裝檔'],
            envs: ['根目錄平鋪', '單層目錄包裹'],
            apiVersion: 'API v1'
        },
        overview: [
            '擴充程式以標準 ZIP 格式封裝，副檔名為 `.zip`。系統支援壓縮包根目錄直接存放檔案，或以單層根資料夾包裹兩種結構。',
            '匯入壓縮包時，主程式會立即驗證 `id` 命名格式、`permissions` 白名單、`runtime` 值域、`apiVersion` 相容性以及 `https://` 連結欄位。'
        ],
        tables: [
            {
                title: 'manifest.json 欄位規格',
                columns: ['欄位名稱', '型別', '必填', '預設值', '說明'],
                rows: [
                    ['`id`', '字串', '是', '無', '擴充唯一識別碼，須符合反向網域格式，例如 `com.example.my-plugin`'],
                    ['`name`', '字串', '是', '無', '擴充程式顯示名稱'],
                    ['`version`', '字串', '是', '無', '語意化版本號，例如 `1.0.0`'],
                    ['`apiVersion`', '整數', '否', '`1`', '目標擴充 API 版本，須為正整數且不可高於系統支援版本'],
                    ['`description`', '字串', '否', '`""`', '擴充功能簡要說明'],
                    ['`author`', '字串', '否', '`""`', '作者或維護組織名稱'],
                    ['`entry`', '字串', '否', '`"index.js"`', 'JavaScript 進入點模組相對路徑'],
                    ['`permissions`', '字串陣列', '否', '`[]`', '請求的權限清單，若包含未定義字串將導致載入驗證失敗'],
                    ['`runtime`', '字串', '否', '`"trusted"`', '執行模式：目前僅支援 `trusted` 主執行緒模式；`worker` 為保留但未實作欄位，啟用時會回報錯誤'],
                    ['`homepage`', '字串', '否', '`""`', '專案首頁、原始碼倉庫或文件網址，須使用 `https://`'],
                    ['`termsUrl`', '字串', '否', '`""`', '開發者提供的服務條款網址，須使用 `https://`'],
                    ['`privacyUrl`', '字串', '否', '`""`', '開發者提供的隱私權政策網址，須使用 `https://`']
                ]
            }
        ],
        notes: [
            '識別碼 `id` 驗證正規表達式為 `/^[a-z0-9][a-z0-9_-]*(\\.[a-z0-9][a-z0-9_-]*)+$/i`，至少須包含一段小數點區隔。',
            '`homepage`、`termsUrl` 與 `privacyUrl` 僅接受 `https://` 協定網址；個人開發者可直接填寫 GitHub 倉庫或公開文件連結。',
            '`runtime: "worker"` 僅通過 `validateExtensionManifest` 的欄位格式檢查，主程式尚未實作 Worker 隔離執行環境，呼叫 `activate()` 時會立即拒絕並設定為 `error` 狀態。'
        ],
        examples: [
            {
                label: '壓縮包目錄階層範例',
                code: `// 結構一：檔案位於壓縮包根目錄
my-extension.zip
├── manifest.json
└── index.js

// 結構二：檔案包含單層目錄包裹
my-extension.zip
└── my-extension/
    ├── manifest.json
    └── index.js`
            },
            {
                label: 'manifest.json 完整範例',
                code: `{
  "id": "com.wmcx.test-video-blur-border",
  "name": "外圍影片模糊測試插件",
  "version": "1.0.0",
  "apiVersion": 1,
  "description": "讀取本機影片並於背景降解析度模糊後繪製於外圍區域。",
  "author": "WMCX Test",
  "entry": "index.js",
  "permissions": [
    "render:overlay",
    "settings:override",
    "events:subscribe",
    "playback:read",
    "ui:menu",
    "ui:popover",
    "ui:toast"
  ]
}`
            }
        ],
        summary: {
            namespace: '封裝規範',
            permission: '無',
            constant: '無',
            async: '靜態描述檔',
            runtime: '匯入階段驗證',
            since: 'API v1'
        },
        seeAlso: ['guide-permissions', 'guide-packaging', 'werp-overview']
    },
    {
        id: 'guide-permissions',
        category: 'guide',
        groupId: 'group-guide',
        stability: 'stable',
        title: '權限常數對照表',
        codeTitle: 'EXTENSION_PERMISSIONS',
        sidebarLabel: '權限常數表',
        sidebarMono: false,
        subtitle: '系統定義的 19 項合法權限識別碼、常數名稱與對應開放的上下文介面。',
        status: {
            variant: 'perm',
            label: '權限白名單',
            permissions: ['19 項官方權限'],
            envs: ['Strict 白名單驗證'],
            apiVersion: 'API v1'
        },
        overview: [
            '所有擴充程式必須在 `manifest.json` 的 `permissions` 陣列宣告所需權限識別碼。若出現未列入白名單的字串，擴充程式於匯入與載入階段即會被拒絕。',
            '未宣告某命名空間的任何權限時，`ctx` 上對應的介面屬性值為 `undefined`。'
        ],
        tables: [
            {
                title: '官方權限識別碼與常數清單',
                columns: ['權限識別碼', '權限常數', '授予功能說明'],
                rows: [
                    ['`editor:read`', '`EXTENSION_PERMISSIONS.EDITOR_READ`', '讀取編輯器譜面全文與選取區資訊'],
                    ['`editor:write`', '`EXTENSION_PERMISSIONS.EDITOR_WRITE`', '置換編輯器選取區或指定範圍文字'],
                    ['`chart:read`', '`EXTENSION_PERMISSIONS.CHART_READ`', '讀取目前譜面解析結果與封面圖片網址'],
                    ['`view:read`', '`EXTENSION_PERMISSIONS.VIEW_READ`', '讀取目前編輯器檢視模式快照'],
                    ['`playback:read`', '`EXTENSION_PERMISSIONS.PLAYBACK_READ`', '讀取播放狀態快照與時間軸總長度'],
                    ['`playback:seek`', '`EXTENSION_PERMISSIONS.PLAYBACK_SEEK`', '跳轉至指定秒數或相對微調播放進度'],
                    ['`render:overlay`', '`EXTENSION_PERMISSIONS.RENDER_OVERLAY`', '註冊畫布自訂疊加圖層、請求畫布重繪與建立受控逐幀影片解碼器'],
                    ['`commands:register`', '`EXTENSION_PERMISSIONS.COMMANDS_REGISTER`', '註冊具備擴充名稱空間的自訂指令'],
                    ['`events:subscribe`', '`EXTENSION_PERMISSIONS.EVENTS_SUBSCRIBE`', '訂閱系統開放白名單事件'],
                    ['`settings:read`', '`EXTENSION_PERMISSIONS.SETTINGS_READ`', '讀取應用程式原生設定的深層凍結唯讀快照'],
                    ['`settings:override`', '`EXTENSION_PERMISSIONS.SETTINGS_OVERRIDE`', '動態層疊覆寫應用程式原生設定'],
                    ['`assets:read`', '`EXTENSION_PERMISSIONS.ASSETS_READ`', '讀取系統目前載入的圖片貼圖與音效素材鍵名清單'],
                    ['`assets:override`', '`EXTENSION_PERMISSIONS.ASSETS_OVERRIDE`', '動態層疊覆寫圖片貼圖與判定打擊音效素材'],
                    ['`ui:toast`', '`EXTENSION_PERMISSIONS.UI_TOAST`', '呼叫全域吐司提示訊息'],
                    ['`ui:menu`', '`EXTENSION_PERMISSIONS.UI_MENU`', '於頂欄拼圖選單註冊二級選單項目'],
                    ['`ui:popover`', '`EXTENSION_PERMISSIONS.UI_POPOVER`', '開啟原生設定面板與存取隔離設定值'],
                    ['`ui:overlay`', '`EXTENSION_PERMISSIONS.UI_OVERLAY`', '建立受控的浮動元件掛載容器'],
                    ['`storage`', '`EXTENSION_PERMISSIONS.STORAGE`', '於系統分配的隔離儲存空間讀寫擴充專屬資料'],
                    ['`i18n:register`', '`EXTENSION_PERMISSIONS.I18N_REGISTER`', '註冊多語系字典並使用擴充翻譯函式']
                ]
            }
        ],
        summary: {
            namespace: '權限控管',
            permission: '清單內擇一或組合宣告',
            constant: 'EXTENSION_PERMISSIONS',
            async: '同步注入',
            runtime: 'Trusted 主執行緒模式',
            since: 'API v1'
        },
        seeAlso: ['guide-manifest', 'ctx.hasPermission', 'guide-security']
    },
    {
        id: 'guide-lifecycle',
        category: 'guide',
        groupId: 'group-guide',
        stability: 'stable',
        title: '生命週期與資源清理機制',
        codeTitle: 'activate(ctx)',
        sidebarLabel: '生命週期與清理',
        sidebarMono: false,
        subtitle: '擴充模組匯出規範、啟動崩潰防護、清理函式回傳與自動資源回收順序。',
        status: {
            variant: 'free',
            label: '生命週期規範',
            permissions: ['預設支援'],
            envs: ['崩潰防護機制', '安全模式支援'],
            apiVersion: 'API v1'
        },
        overview: [
            '擴充進入點模組必須匯出啟動函式，支援 `export default function activate(ctx)` 或具名匯出 `export function activate(ctx)`。',
            '啟動時系統會驗證 `manifest.json`、組裝受限上下文 `ctx`、捕捉啟動例外，並收集啟動函式回傳的清理函式或具備 `dispose` 方法的物件。'
        ],
        notes: [
            '自動回收範圍僅涵蓋透過 `ctx` 官方介面註冊的指令、事件監聽器、疊加圖層、逐幀影片解碼器、選單項目、浮動元件、多語系詞典、原生設定覆寫與素材覆寫。',
            '若擴充程式自行於 `window` 或 `document` 綁定事件、建立計時器或發起背景 Worker，必須於回傳的清理函式中主動釋放。',
            '啟動崩潰防護：啟動時透過 `sessionStorage` 鍵 `wmcx_ext_activating` 追蹤狀態，若發生嚴重崩潰導致異常重載，下次啟動會自動停用該擴充程式。',
            '安全模式啟動參數：於編輯器網址列加上 `?safeMode=1` 或 `?safeMode=true` 時，系統僅登錄已安裝擴充而不自動啟動，便於排除問題外掛。'
        ],
        examples: [
            {
                label: '清理函式兩種回傳方式',
                code: `// 方式一：直接回傳清理函式
export default function activate(ctx) {
    const timer = setInterval(() => {}, 1000);
    return () => {
        clearInterval(timer);
    };
}

// 方式二：回傳具備 dispose 方法之物件
export function activate(ctx) {
    const controller = new AbortController();
    return {
        dispose() {
            controller.abort();
        }
    };
}`
            }
        ],
        summary: {
            namespace: '生命週期',
            permission: '無',
            constant: '無',
            async: '清理函式自動執行',
            runtime: 'Trusted 主執行緒模式',
            since: 'API v1'
        },
        seeAlso: ['guide-security', 'ctx.commands.register', 'ctx.render.registerOverlay']
    },
    {
        id: 'guide-security',
        category: 'guide',
        groupId: 'group-guide',
        stability: 'stable',
        title: '安全性規範與介面隔離',
        sidebarLabel: '安全規範與隔離',
        sidebarMono: false,
        subtitle: '開發者須遵守的安全開發規範、Shadow DOM 樣式隔離、命名空間防護與網路揭露分級。',
        status: {
            variant: 'caution',
            label: '安全開發要求',
            permissions: ['強制開發守則'],
            envs: ['Shadow DOM 建議', '命名空間強制隔離'],
            apiVersion: 'API v1'
        },
        overview: [
            '為維護整體應用程式的執行穩定與防止惡意程式碼注入，平台於官方介面強制套用命名空間隔離，同時要求擴充開發者遵循嚴格的前端安全開發規範。'
        ],
        callouts: [
            {
                variant: 'danger',
                title: '嚴格禁止事項',
                items: [
                    '禁止動態程式碼評估：嚴禁使用 `eval()`、`new Function()` 或以字串形式執行動態腳本。',
                    '禁止未跳脫 DOM 注入：嚴禁將外部資料、使用者輸入或未跳脫字串賦值予 `innerHTML`，文字渲染一律使用 `textContent`。',
                    '禁止未經授權之資料外傳：不得側錄使用者譜面、本地儲存資料或帳號資訊。'
                ]
            }
        ],
        notes: [
            'Shadow DOM 樣式隔離：使用 `ctx.ui.createFloatingWidget` 建立自訂介面時，建議使用 `element.attachShadow({ mode: "open" })` 避免樣式互相污染。',
            '指令與語系命名空間：所有註冊指令與翻譯鍵皆強制冠上 `ext.${extensionId}.` 前綴。',
            '儲存鍵邏輯隔離：擴充設定與資料分別存於 `wmcx_ext_settings_<id>` 與 `wmcx_ext_data_<id>`，不得跨擴充直接讀寫 `localStorage`。',
            '原型鏈污染防護：設定覆寫路徑嚴禁包含 `__proto__`、`constructor` 或 `prototype`。',
            '外部網路與條款分級：純離線運作外掛不強制提供條款連結；若涉及外部連線、人工智慧介面傳送資料或輸入第三方金鑰，應於介面明確揭露並於 `manifest.json` 提供 `privacyUrl` 與 `termsUrl`。'
        ],
        examples: [
            {
                label: 'Shadow DOM 安全元件範例',
                code: `const widget = ctx.ui.createFloatingWidget({ id: 'my-widget' });
const shadow = widget.element.attachShadow({ mode: 'open' });

const style = document.createElement('style');
style.textContent = \`
    :host {
        display: block;
        user-select: none;
    }
    .box {
        background: rgba(17, 17, 17, 0.88);
        color: #f0f0f0;
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.12);
    }
\`;

const box = document.createElement('div');
box.className = 'box';
box.textContent = '安全隔離元件';

shadow.append(style, box);`
            }
        ],
        summary: {
            namespace: '安全規範',
            permission: '無',
            constant: '無',
            async: '靜態守則與介面防護',
            runtime: '全階段適用',
            since: 'API v1'
        },
        seeAlso: ['ctx.ui.createFloatingWidget', 'ctx.storage.set', 'werp-overview']
    },
    {
        id: 'guide-packaging',
        category: 'guide',
        groupId: 'group-guide',
        stability: 'stable',
        title: '打包測試與安裝步驟',
        sidebarLabel: '打包與安裝測試',
        sidebarMono: false,
        subtitle: '參考內建範例建立外掛壓縮包，並於擴充程式管理器匯入測試。',
        status: {
            variant: 'free',
            label: '實作流程',
            permissions: ['範例對照'],
            envs: ['本機 ZIP 匯入測試'],
            apiVersion: 'API v1'
        },
        overview: [
            '專案的 `examples/` 目錄提供了多個可執行測試範例，例如 `examples/test-video-blur-border` 展示了主畫布 `afterBorder` 渲染疊加、設定面板、設定覆寫與播放事件同步的完整整合流程。'
        ],
        notes: [
            '第一步：開啟 Web mai Chart X 編輯器首頁，點擊頂欄右側的拼圖圖示展開擴充程式選單。',
            '第二步：點選選單最下方的「管理擴充程式」，開啟擴充程式管理視窗。',
            '第三步：點選視窗內的「匯入擴充程式」按鈕，選取打包好的 `.zip` 壓縮檔。',
            '第四步：檢查「確認安裝擴充程式」對話框列出的請求權限與開發者連結，點選「安裝並啟用」即刻生效。'
        ],
        examples: [
            {
                label: '以 PowerShell 打包擴充套件',
                code: `Compress-Archive -Path "manifest.json", "index.js" -DestinationPath "my-extension.zip" -Force`
            }
        ],
        summary: {
            namespace: '測試與發布',
            permission: '依外掛需求宣告',
            constant: '無',
            async: '手動或自動化打包',
            runtime: '瀏覽器擴充管理器',
            since: 'API v1'
        },
        seeAlso: ['guide-manifest', 'werp-install-flow', 'ctx.render.registerOverlay']
    },

    /* ======================================================================
       二、受限上下文基礎屬性
       ====================================================================== */
    {
        id: 'ctx-base',
        category: 'api',
        groupId: 'group-ctx-base',
       stability: 'stable',
        title: '受限上下文物件',
        codeTitle: 'ctx',
        sidebarLabel: 'ctx 總覽',
        sidebarMono: true,
        badge: '物件',
        subtitle: '傳入擴充進入點函式的核心上下文物件，提供版本資訊、識別碼、權限查詢與各授權命名空間。',
        status: {
            variant: 'free',
            label: '預設注入',
            permissions: ['免權限'],
            envs: ['Trusted 主執行緒模式', '無隔離沙盒'],
            apiVersion: 'API v1'
        },
        overview: [
            '不論擴充程式在 `manifest.json` 宣告何種權限，主程式調用 `activate(ctx)` 時必定會於 `ctx` 物件注入基礎屬性 `apiVersion`、`extensionId` 與查詢方法 `hasPermission()`。',
            '其餘子命名空間如 `ctx.editor`、`ctx.playback`、`ctx.render` 等，則僅於對應權限獲得授權時才建立並凍結注入，未獲授權者為 `undefined`。',
            '重要信任模型說明：目前所有插件皆跑在瀏覽器主執行緒、無系統級沙盒隔離，可存取與修改頁面 DOM 並讀取當前專案資料。`ctx` 的凍結與權限過濾屬於介面層級的存取控管，而非安全沙盒。'
        ],
        callouts: [
            {
                variant: 'warning',
                title: '主執行緒執行與 runtime: worker 未實作說明',
                items: [
                    '插件在主執行緒以動態 `import()` 執行，與主應用程式共享同源 DOM、IndexedDB 與全域環境；`Object.freeze(scoped)` 僅限制官方介面物件屬性，無法阻止直接存取瀏覽器全域物件。',
                    '`manifest.json` 中的 `runtime: "worker"` 目前為保留但未實作欄位；設定為 `worker` 的外掛在啟用階段會被拒絕並標記為錯誤狀態，請勿將其視為可用功能。'
                ]
            }
        ],
        tables: [
            {
                title: '基礎成員一覽',
                columns: ['屬性或方法', '型別', '說明'],
                rows: [
                    ['`ctx.apiVersion`', '`number`', '目前擴充系統 API 版本整數，現行固定為 `1`'],
                    ['`ctx.extensionId`', '`string`', '當前擴充唯一識別碼，對應 `manifest.json` 的 `id` 欄位'],
                    ['`ctx.hasPermission(perm)`', '`Function`', '檢查當前擴充是否已被授予指定權限字串，回傳布林值']
                ]
            }
        ],
        examples: [
            {
                label: '檢查基礎屬性與可用權限',
                code: `export default function activate(ctx) {
    console.log('擴充 ID:', ctx.extensionId);
    console.log('API 版本:', ctx.apiVersion);

    if (ctx.hasPermission('editor:read')) {
        console.log('譜面字數:', ctx.editor.getText().length);
    }
}`
            }
        ],
        notes: [
            '所有注入的子命名空間與 `ctx` 本身皆經過 `Object.freeze` 凍結，不可新增或覆寫屬性。',
            '若擴充已被停用或進入錯誤狀態，先前持有之事件訂閱、圖層註冊與解碼器回呼會依啟用世代序號失效或自動回收。'
        ],
        summary: {
            namespace: 'ctx',
            permission: '無',
            constant: '無',
            async: '同步物件',
            runtime: 'Trusted 主執行緒模式，無沙盒',
            since: 'API v1'
        },
        seeAlso: ['ctx.apiVersion', 'ctx.extensionId', 'ctx.hasPermission', 'guide-overview', 'guide-minimal-plugin']
    },
    {
        id: 'ctx.apiVersion',
        category: 'api',
        groupId: 'group-ctx-base',
        stability: 'stable',
        title: '擴充介面版本號',
        codeTitle: 'ctx.apiVersion',
        sidebarLabel: 'apiVersion',
        sidebarMono: true,
        badge: '唯讀屬性',
        subtitle: '取得目前宿主環境提供的擴充 API 版本整數。',
        status: {
            variant: 'free',
            label: '免權限',
            permissions: ['預設注入'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '唯讀整數屬性，代表目前 Web mai Chart X 擴充管理器提供的 `EXTENSION_API_VERSION` 常數，現行值為 `1`。'
        ],
        syntax: `ctx.apiVersion`,
        returns: {
            type: 'number',
            description: '整數值，目前固定為 `1`。'
        },
        examples: [
            {
                label: '於進入點檢查介面版本',
                code: `export default function activate(ctx) {
    if (ctx.apiVersion < 1) {
        return;
    }
}`
            }
        ],
        summary: {
            namespace: 'ctx',
            permission: '免權限',
            constant: '無',
            async: '同步屬性',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx-base', 'ctx.extensionId', 'ctx.hasPermission']
    },
    {
        id: 'ctx.extensionId',
        category: 'api',
        groupId: 'group-ctx-base',
        stability: 'stable',
        title: '擴充程式識別碼',
        codeTitle: 'ctx.extensionId',
        sidebarLabel: 'extensionId',
        sidebarMono: true,
        badge: '唯讀屬性',
        subtitle: '取得當前擴充程式在描述檔中宣告的唯一識別碼。',
        status: {
            variant: 'free',
            label: '免權限',
            permissions: ['預設注入'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '唯讀字串屬性，回傳與 `manifest.json` 中 `id` 完全一致的反向網域識別碼。常用於組合本地識別符或診斷記錄。'
        ],
        syntax: `ctx.extensionId`,
        returns: {
            type: 'string',
            description: '反向網域格式的擴充識別碼字串，例如 `"com.example.my-plugin"`。'
        },
        examples: [
            {
                label: '讀取識別碼並輸出日誌',
                code: `export default function activate(ctx) {
    console.info(\`[\${ctx.extensionId}] 已完成載入\`);
}`
            }
        ],
        summary: {
            namespace: 'ctx',
            permission: '免權限',
            constant: '無',
            async: '同步屬性',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx-base', 'ctx.apiVersion', 'ctx.hasPermission']
    },
    {
        id: 'ctx.hasPermission',
        category: 'api',
        groupId: 'group-ctx-base',
        stability: 'stable',
        title: '檢查是否具備指定權限',
        codeTitle: 'ctx.hasPermission()',
        sidebarLabel: 'hasPermission()',
        sidebarMono: true,
        badge: '方法',
        subtitle: '在執行期間確認當前擴充程式是否已被授予特定的權限識別碼。',
        status: {
            variant: 'free',
            label: '免權限',
            permissions: ['預設注入'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '依據使用者授權與 `manifest.json` 宣告內容，判定特定權限字串是否已啟用。適合用於實作可選功能的漸進式增強邏輯。'
        ],
        syntax: `ctx.hasPermission(permissionString)`,
        parameters: [
            {
                name: 'permissionString',
                type: 'string',
                required: true,
                description: '欲檢查的官方權限識別碼字串，例如 `editor:write` 或 `ui:toast`。'
            }
        ],
        returns: {
            type: 'boolean',
            description: '若已授權該權限回傳 `true`，否則回傳 `false`。'
        },
        examples: [
            {
                label: '依權限狀態決定是否顯示提示',
                code: `if (ctx.hasPermission('ui:toast')) {
    ctx.ui.toast({ content: '操作完成', type: 'info' });
}`
            }
        ],
        summary: {
            namespace: 'ctx',
            permission: '免權限',
            constant: '無',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['guide-permissions', 'ctx-base']
    },

    /* ======================================================================
       三、ctx.editor 編輯器介面
       ====================================================================== */
    {
        id: 'ctx.editor',
        category: 'api',
        groupId: 'group-ctx-editor',
        stability: 'stable',
        title: '編輯器介面',
        codeTitle: 'ctx.editor',
        sidebarLabel: '總覽',
        sidebarMono: false,
        badge: '命名空間',
        subtitle: '讀取或修改 simai 譜面文字編輯器內容、選取範圍與監聽輸入事件。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['editor:read', 'editor:write'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '當擴充程式於 `manifest.json` 宣告 `editor:read` 或 `editor:write` 權限時注入此命名空間。未宣告任一編輯器權限時，`ctx.editor` 為 `undefined`。',
            '宣告 `editor:read` 時提供 `getText()`、`getSelection()` 與 `on()`；宣告 `editor:write` 時提供 `replaceSelection()`。'
        ],
        tables: [
            {
                title: 'ctx.editor 方法清單',
                columns: ['方法', '所需權限', '說明'],
                rows: [
                    ['`getText()`', '`editor:read`', '取得編輯器目前全文內容'],
                    ['`getSelection()`', '`editor:read`', '取得選取區起迄索引與選取文字'],
                    ['`on(eventName, handler)`', '`editor:read`', '訂閱編輯器輸入、按鍵、失焦或選取變更事件'],
                    ['`replaceSelection(replacement, start, end)`', '`editor:write`', '置換選取區或指定索引範圍的文字']
                ]
            }
        ],
        summary: {
            namespace: 'ctx.editor',
            permission: 'editor:read 或 editor:write',
            constant: 'EXTENSION_PERMISSIONS.EDITOR_READ / EDITOR_WRITE',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.editor.getText', 'ctx.editor.getSelection', 'ctx.editor.on', 'ctx.editor.replaceSelection']
    },
    {
        id: 'ctx.editor.getText',
        category: 'api',
        groupId: 'group-ctx-editor',
        stability: 'stable',
        title: '取得編輯器全文',
        codeTitle: 'ctx.editor.getText()',
        sidebarLabel: 'getText()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '讀取 simai 譜面編輯器目前的全部文字內容。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['editor:read'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '回傳目前開啟譜面難度的編輯器純文字內容。若編輯器元件尚未初始化就緒，則安全回傳空字串。'
        ],
        syntax: `ctx.editor.getText()`,
        returns: {
            type: 'string',
            description: '代表編輯器目前全文內容的字串；尚未就緒時為 `""`。'
        },
        examples: [
            {
                label: '統計目前譜面總行數與逗號數',
                code: `const text = ctx.editor.getText();
const lines = text.split(/\\r?\\n/).length;
const beats = (text.match(/,/g) || []).length;
console.log({ lines, beats });`
            }
        ],
        summary: {
            namespace: 'ctx.editor',
            permission: 'editor:read',
            constant: 'EXTENSION_PERMISSIONS.EDITOR_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.editor.getSelection', 'ctx.editor.replaceSelection', 'ctx.chart.getSnapshot']
    },
    {
        id: 'ctx.editor.getSelection',
        category: 'api',
        groupId: 'group-ctx-editor',
        stability: 'stable',
        title: '取得編輯器選取區',
        codeTitle: 'ctx.editor.getSelection()',
        sidebarLabel: 'getSelection()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '取得目前游標起點索引、終點索引以及選取區文字片段。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['editor:read'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '用於查詢使用者在編輯器內反白的文字區間，或取得當前游標位置索引。當未反白文字時，`start` 與 `end` 相等且 `text` 為空字串。'
        ],
        syntax: `ctx.editor.getSelection()`,
        returns: {
            type: 'Object',
            description: '包含選取區邊界與內容的物件。',
            fields: [
                { name: 'start', type: 'number', description: '選取起點字元索引' },
                { name: 'end', type: 'number', description: '選取終點字元索引' },
                { name: 'text', type: 'string', description: '選取區間內的文字內容' }
            ]
        },
        examples: [
            {
                label: '讀取反白選取的 simai 片段',
                code: `const selection = ctx.editor.getSelection();
if (selection.end > selection.start) {
    console.log('已選取片段:', selection.text);
}`
            }
        ],
        summary: {
            namespace: 'ctx.editor',
            permission: 'editor:read',
            constant: 'EXTENSION_PERMISSIONS.EDITOR_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.editor.getText', 'ctx.editor.replaceSelection']
    },
    {
        id: 'ctx.editor.on',
        category: 'api',
        groupId: 'group-ctx-editor',
        stability: 'stable',
        title: '監聽編輯器事件',
        codeTitle: 'ctx.editor.on()',
        sidebarLabel: 'on()',
        sidebarMono: true,
        badge: '事件',
        subtitle: '訂閱編輯器的輸入、按鍵、失焦或選取區變更事件，並於停用時自動解除綁定。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['editor:read'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '為編輯器元件註冊受控的事件監聽器，並在觸發時傳入最新的文字與游標快照。於 `keydown` 事件中額外提供按鍵屬性與預設行為攔截方法。'
        ],
        syntax: `const unsubscribe = ctx.editor.on(eventName, handler)`,
        parameters: [
            {
                name: 'eventName',
                type: 'string',
                required: true,
                description: '事件名稱，支援 `input`、`keydown`、`blur` 與 `selectionchange`。'
            },
            {
                name: 'handler',
                type: 'Function',
                required: true,
                description: '事件回呼函式，接收事件快照 `{ text, selectionStart, selectionEnd }`。當 `eventName` 為 `keydown` 時，額外包含 `key`、`code`、`ctrlKey`、`metaKey`、`altKey`、`shiftKey`、`isComposing`、`preventDefault()` 與 `stopPropagation()`。'
            }
        ],
        returns: {
            type: 'Function',
            description: '取消訂閱函式。呼叫此函式可立即移除該監聽器。'
        },
        notes: [
            '擴充程式停用或解除安裝時，系統會自動清理所有透過此介面綁定的監聽器。',
            '回呼函式內發生的例外會被管理器隔離記錄，不會中斷編輯器主流程。'
        ],
        examples: [
            {
                label: '監聽選取區變更與按鍵輸入',
                code: `const offSelection = ctx.editor.on('selectionchange', ({ selectionStart, selectionEnd }) => {
    console.log('游標範圍:', selectionStart, selectionEnd);
});

const offKey = ctx.editor.on('keydown', (e) => {
    if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        ctx.ui.toast({ content: '觸發自訂編輯快捷鍵' });
    }
});`
            }
        ],
        summary: {
            namespace: 'ctx.editor',
            permission: 'editor:read',
            constant: 'EXTENSION_PERMISSIONS.EDITOR_READ',
            async: '事件回呼',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.editor.getSelection', 'ctx.events.on']
    },
    {
        id: 'ctx.editor.replaceSelection',
        category: 'api',
        groupId: 'group-ctx-editor',
        stability: 'stable',
        title: '置換編輯器選取區文字',
        codeTitle: 'ctx.editor.replaceSelection()',
        sidebarLabel: 'replaceSelection()',
        sidebarMono: true,
        badge: '寫入',
        subtitle: '將目前反白選取區或指定起迄索引範圍置換為新的譜面字串。',
        status: {
            variant: 'perm',
            label: '需要寫入權限',
            permissions: ['editor:write'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '透過編輯器邏輯控制流程安全寫入文字內容，確保游標位置與編輯器內部狀態同步更新。',
            '省略 `start` 與 `end` 參數時，系統會自動取代使用者目前的選取區或於當前游標處插入文字。'
        ],
        syntax: `ctx.editor.replaceSelection(replacement, start, end)`,
        parameters: [
            {
                name: 'replacement',
                type: 'string',
                required: true,
                description: '準備置換或插入的目標文字內容。'
            },
            {
                name: 'start',
                type: 'number',
                required: false,
                defaultValue: '目前選取起點',
                description: '置換範圍起始字元索引。'
            },
            {
                name: 'end',
                type: 'number',
                required: false,
                defaultValue: '目前選取終點',
                description: '置換範圍結束字元索引。'
            }
        ],
        returns: {
            type: 'boolean',
            description: '表示置換操作是否成功執行。'
        },
        examples: [
            {
                label: '將選取音符加上 Break 標記',
                code: `const sel = ctx.editor.getSelection();
if (sel.text && !sel.text.includes('b')) {
    ctx.editor.replaceSelection(sel.text + 'b', sel.start, sel.end);
}`
            }
        ],
        summary: {
            namespace: 'ctx.editor',
            permission: 'editor:write',
            constant: 'EXTENSION_PERMISSIONS.EDITOR_WRITE',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.editor.getSelection', 'ctx.editor.getText']
    },

    /* ======================================================================
       四、ctx.playback 播放控制介面
       ====================================================================== */
    {
        id: 'ctx.playback',
        category: 'api',
        groupId: 'group-ctx-playback',
        stability: 'stable',
        title: '播放控制介面',
        codeTitle: 'ctx.playback',
        sidebarLabel: '總覽',
        sidebarMono: false,
        badge: '命名空間',
        subtitle: '讀取目前播放狀態、音軌總長度，並精確控制播放時間軸跳轉與相對微調。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['playback:read', 'playback:seek'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '宣告 `playback:read` 或 `playback:seek` 權限時注入此介面；若皆未宣告則為 `undefined`。',
            '此介面常用於開發時間軸導覽輔助工具、隨時間演進的動態疊加圖層，以及與背景音樂同步的擴充機能。'
        ],
        tables: [
            {
                title: 'ctx.playback 方法清單',
                columns: ['方法', '所需權限', '說明'],
                rows: [
                    ['`getState()`', '`playback:read`', '讀取當前是否播放與即時時間軸秒數'],
                    ['`getDuration()`', '`playback:read`', '取得目前譜面或音軌總長度秒數'],
                    ['`seek(targetTime)`', '`playback:seek`', '跳轉時間軸至指定絕對秒數'],
                    ['`nudge(deltaSeconds)`', '`playback:seek`', '以當前進度為基準進行相對秒數微調']
                ]
            }
        ],
        summary: {
            namespace: 'ctx.playback',
            permission: 'playback:read 或 playback:seek',
            constant: 'EXTENSION_PERMISSIONS.PLAYBACK_READ / PLAYBACK_SEEK',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.playback.getState', 'ctx.playback.getDuration', 'ctx.playback.seek', 'ctx.playback.nudge']
    },
    {
        id: 'ctx.playback.getState',
        category: 'api',
        groupId: 'group-ctx-playback',
        stability: 'stable',
        title: '讀取播放狀態快照',
        codeTitle: 'ctx.playback.getState()',
        sidebarLabel: 'getState()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '取得當前播放引擎的播放狀態、實際播放時間與全域基準時間。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['playback:read'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '回傳目前播放器的即時狀態快照物件，適用於同步時間顯示、圖層動畫或播放事件校對。'
        ],
        syntax: `ctx.playback.getState()`,
        returns: {
            type: 'Object',
            description: '播放狀態快照物件。',
            fields: [
                { name: 'isPlaying', type: 'boolean', description: '目前是否正處於播放中狀態' },
                { name: 'realTime', type: 'number', description: '目前播放時間秒數' },
                { name: 'globalTime', type: 'number', description: '含譜面位移換算後的全域時間秒數' }
            ]
        },
        examples: [
            {
                label: '讀取當前播放秒數與狀態',
                code: `const { isPlaying, realTime, globalTime } = ctx.playback.getState();
console.log({ isPlaying, realTime, globalTime });`
            }
        ],
        summary: {
            namespace: 'ctx.playback',
            permission: 'playback:read',
            constant: 'EXTENSION_PERMISSIONS.PLAYBACK_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.playback.getDuration', 'ctx.playback.seek', 'events-list']
    },
    {
        id: 'ctx.playback.getDuration',
        category: 'api',
        groupId: 'group-ctx-playback',
        stability: 'stable',
        title: '取得音軌總長度',
        codeTitle: 'ctx.playback.getDuration()',
        sidebarLabel: 'getDuration()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '回傳目前載入譜面或音軌的總長度秒數。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['playback:read'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '回傳當前載入音訊或譜面時間軸的最大長度秒數，常用於計算時間軸百分比或安全跳轉邊界。'
        ],
        syntax: `ctx.playback.getDuration()`,
        returns: {
            type: 'number',
            description: '總長度秒數；若尚未載入音軌則為 `0`。'
        },
        examples: [
            {
                label: '計算當前播放進度百分比',
                code: `const duration = ctx.playback.getDuration();
const { realTime } = ctx.playback.getState();
const progress = duration > 0 ? Math.min(100, (realTime / duration) * 100) : 0;`
            }
        ],
        summary: {
            namespace: 'ctx.playback',
            permission: 'playback:read',
            constant: 'EXTENSION_PERMISSIONS.PLAYBACK_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.playback.getState', 'ctx.playback.seek']
    },
    {
        id: 'ctx.playback.seek',
        category: 'api',
        groupId: 'group-ctx-playback',
        stability: 'stable',
        title: '跳轉至指定時間',
        codeTitle: 'ctx.playback.seek()',
        sidebarLabel: 'seek()',
        sidebarMono: true,
        badge: '控制',
        subtitle: '將播放進度與渲染畫面跳轉至指定的絕對秒數。',
        status: {
            variant: 'perm',
            label: '需要控制權限',
            permissions: ['playback:seek'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '設定目前播放器時間位置。系統會自動將輸入的目標時間限制在零與音軌總長度區間內，防止越界。'
        ],
        syntax: `ctx.playback.seek(targetTime)`,
        parameters: [
            {
                name: 'targetTime',
                type: 'number | string',
                required: true,
                description: '欲跳轉的絕對秒數，支援數值或可轉為有效數字的字串。'
            }
        ],
        returns: {
            type: 'boolean',
            description: '跳轉成功時回傳 `true`；若輸入非有效數值則回傳 `false`。'
        },
        examples: [
            {
                label: '跳轉至譜面開頭或第 30 秒',
                code: `ctx.playback.seek(30);`
            }
        ],
        summary: {
            namespace: 'ctx.playback',
            permission: 'playback:seek',
            constant: 'EXTENSION_PERMISSIONS.PLAYBACK_SEEK',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.playback.nudge', 'ctx.playback.getState']
    },
    {
        id: 'ctx.playback.nudge',
        category: 'api',
        groupId: 'group-ctx-playback',
        stability: 'stable',
        title: '相對微調播放時間',
        codeTitle: 'ctx.playback.nudge()',
        sidebarLabel: 'nudge()',
        sidebarMono: true,
        badge: '控制',
        subtitle: '以當前播放進度為基準，向前快轉或向後倒轉指定秒數。',
        status: {
            variant: 'perm',
            label: '需要控制權限',
            permissions: ['playback:seek'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '正值向前推進，負值向後倒退。系統會自動加上目前進度並夾緊於合法時間區間內。'
        ],
        syntax: `ctx.playback.nudge(deltaSeconds)`,
        parameters: [
            {
                name: 'deltaSeconds',
                type: 'number | string',
                required: true,
                description: '相對增減的秒數，例如 `0.05` 或 `-0.5`。'
            }
        ],
        returns: {
            type: 'boolean',
            description: '微調成功回傳 `true`，輸入非有效數值時回傳 `false`。'
        },
        examples: [
            {
                label: '將時間軸倒退 0.25 秒',
                code: `ctx.playback.nudge(-0.25);`
            }
        ],
        summary: {
            namespace: 'ctx.playback',
            permission: 'playback:seek',
            constant: 'EXTENSION_PERMISSIONS.PLAYBACK_SEEK',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.playback.seek', 'ctx.playback.getState']
    },

    /* ======================================================================
       五、ctx.chart 譜面讀取介面
       ====================================================================== */
    {
        id: 'ctx.chart',
        category: 'api',
        groupId: 'group-ctx-chart',
        stability: 'stable',
        title: '譜面讀取介面',
        codeTitle: 'ctx.chart',
        sidebarLabel: '總覽',
        sidebarMono: false,
        badge: '命名空間',
        subtitle: '讀取目前譜面已解析的唯讀凍結快照與專案封面圖片網址。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['chart:read'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '宣告 `chart:read` 權限時注入此介面；未宣告時為 `undefined`。',
            '所有透過 `ctx.chart.getSnapshot()` 取出的資料皆經過深層凍結與快取保護，防止外掛意外改寫主渲染器共用的音符陣列或標頭物件。'
        ],
        tables: [
            {
                title: 'ctx.chart 方法清單',
                columns: ['方法', '所需權限', '說明'],
                rows: [
                    ['`getSnapshot()`', '`chart:read`', '讀取當前難度譜面解析結果的唯讀凍結快照'],
                    ['`getCoverImageUrl()`', '`chart:read`', '唯讀取得目前專案封面圖片網址']
                ]
            }
        ],
        summary: {
            namespace: 'ctx.chart',
            permission: 'chart:read',
            constant: 'EXTENSION_PERMISSIONS.CHART_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.chart.getSnapshot', 'ctx.chart.getCoverImageUrl']
    },
    {
        id: 'ctx.chart.getSnapshot',
        category: 'api',
        groupId: 'group-ctx-chart',
        stability: 'stable',
        title: '取得譜面唯讀快照',
        codeTitle: 'ctx.chart.getSnapshot()',
        sidebarLabel: 'getSnapshot()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '取得當前難度已解析的音符清單、標籤、譜面中繼資料與時間長度。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['chart:read'],
            envs: ['深度凍結快取'],
            apiVersion: 'API v1'
        },
        overview: [
            '系統會針對回傳的快照物件以及內部的 `maidata`、`notes`、`tags` 陣列與元素套用 `Object.freeze`。',
            '當譜面資料、難度與總時長未變更時會直接回傳同一份快取實例，可在每幀渲染迴圈中安全呼叫而不會造成大量記憶體配置開銷。'
        ],
        syntax: `ctx.chart.getSnapshot()`,
        returns: {
            type: 'Object',
            description: '唯讀凍結的譜面資料快照。',
            fields: [
                { name: 'difficulty', type: 'number', description: '當前選取的難度代號或索引' },
                { name: 'maidata', type: 'Object', description: '譜面整體中繼資料，包含標題、作者與各難度文字' },
                { name: 'duration', type: 'number', description: '時間軸總長度秒數' },
                { name: 'notes', type: 'Array<Object>', description: '當前難度已解析的音符物件清單' },
                { name: 'tags', type: 'Array<Object>', description: '譜面已解析的標籤清單' }
            ]
        },
        examples: [
            {
                label: '統計當前難度音符總數',
                code: `const snapshot = ctx.chart.getSnapshot();
console.log('難度索引:', snapshot.difficulty, '音符數:', snapshot.notes.length);`
            }
        ],
        summary: {
            namespace: 'ctx.chart',
            permission: 'chart:read',
            constant: 'EXTENSION_PERMISSIONS.CHART_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.chart.getCoverImageUrl', 'ctx.editor.getText', 'events-list']
    },
    {
        id: 'ctx.chart.getCoverImageUrl',
        category: 'api',
        groupId: 'group-ctx-chart',
        stability: 'stable',
        title: '取得專案封面圖片網址',
        codeTitle: 'ctx.chart.getCoverImageUrl()',
        sidebarLabel: 'getCoverImageUrl()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '唯讀取得目前載入專案的背景或封面圖片網址。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['chart:read'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '提供外掛在自訂畫布圖層或資訊面板中顯示目前譜面封面圖片。若當前專案未設定封面圖片，則回傳 `null`。'
        ],
        syntax: `ctx.chart.getCoverImageUrl()`,
        returns: {
            type: 'string | null',
            description: '封面圖片的網址或物件網址字串；若無封面圖則回傳 `null`。'
        },
        examples: [
            {
                label: '讀取並載入譜面封面圖',
                code: `const coverUrl = ctx.chart.getCoverImageUrl();
if (coverUrl) {
    const img = new Image();
    img.src = coverUrl;
}`
            }
        ],
        summary: {
            namespace: 'ctx.chart',
            permission: 'chart:read',
            constant: 'EXTENSION_PERMISSIONS.CHART_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.chart.getSnapshot', 'ctx.render.registerOverlay']
    },

    /* ======================================================================
       六、ctx.view 檢視模式介面
       ====================================================================== */
    {
        id: 'ctx.view',
        category: 'api',
        groupId: 'group-ctx-view',
        stability: 'stable',
        title: '檢視模式介面',
        codeTitle: 'ctx.view',
        sidebarLabel: '總覽',
        sidebarMono: false,
        badge: '命名空間',
        subtitle: '查詢編輯器目前的版面分割、全螢幕與輔助文字顯示狀態。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['view:read'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '宣告 `view:read` 權限時注入此介面；未宣告時為 `undefined`。'
        ],
        tables: [
            {
                title: 'ctx.view 方法清單',
                columns: ['方法', '所需權限', '說明'],
                rows: [
                    ['`getMode()`', '`view:read`', '讀取目前編輯器檢視模式快照']
                ]
            }
        ],
        summary: {
            namespace: 'ctx.view',
            permission: 'view:read',
            constant: 'EXTENSION_PERMISSIONS.VIEW_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.view.getMode', 'events-list']
    },
    {
        id: 'ctx.view.getMode',
        category: 'api',
        groupId: 'group-ctx-view',
        stability: 'stable',
        title: '取得編輯器檢視模式快照',
        codeTitle: 'ctx.view.getMode()',
        sidebarLabel: 'getMode()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '取得編輯器隱藏、全螢幕、直式版面與環繞輔助文字狀態。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['view:read'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '協助浮動掛件或疊加圖層判斷目前的工作區排版狀態，例如在直式螢幕或隱藏編輯器全畫面預覽時自動調整版面配置。'
        ],
        syntax: `ctx.view.getMode()`,
        returns: {
            type: 'Object',
            description: '代表當前檢視模式的唯讀快照物件。',
            fields: [
                { name: 'isEditorHidden', type: 'boolean', description: '編輯器文字面板是否處於隱藏狀態' },
                { name: 'isFullscreen', type: 'boolean', description: '是否處於全螢幕模式' },
                { name: 'isVerticalMode', type: 'boolean', description: '是否處於直式上下分割版面模式' },
                { name: 'showAuxiliaryText', type: 'boolean', description: '是否顯示判定圓周邊的輔助資訊文字' }
            ]
        },
        examples: [
            {
                label: '依直橫版面調整元件邏輯',
                code: `const mode = ctx.view.getMode();
if (mode.isVerticalMode && mode.isEditorHidden) {
    console.log('目前為純畫布直式檢視');
}`
            }
        ],
        summary: {
            namespace: 'ctx.view',
            permission: 'view:read',
            constant: 'EXTENSION_PERMISSIONS.VIEW_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.view', 'events-list']
    },

    /* ======================================================================
       七、ctx.render 渲染疊加介面
       ====================================================================== */
    {
        id: 'ctx.render',
        category: 'api',
        groupId: 'group-ctx-render',
       stability: 'stable',
        title: '渲染疊加介面',
        codeTitle: 'ctx.render',
        sidebarLabel: '總覽',
        sidebarMono: false,
        badge: '命名空間',
        subtitle: '於主畫布或視覺化編輯器畫布的多個分層階段插入自訂 Canvas 2D 繪圖邏輯，並支援逐幀離線影片匯出。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['render:overlay'],
            envs: ['Trusted 模式', '逐幀離線錄影支援'],
            apiVersion: 'API v1'
        },
        overview: [
            '宣告 `render:overlay` 權限時注入此介面；未宣告時為 `undefined`。',
            '系統內建嚴密的狀態防護、例外隔離與效能熔斷保護，確保擴充繪圖不會污染核心渲染狀態或導致主畫面永久卡頓。',
            '錄影匯出採用固定幀率逐幀離線渲染，而非即時螢幕畫面擷取。在 `registerOverlay` 註冊 `target: "main"` 且啟用 `includeInVideo: true` 的圖層會納入匯出影片的每一幀渲染。'
        ],
        callouts: [
            {
                variant: 'warning',
                title: '離線錄影計時與 Safari 及 iOS 平台限制',
                items: [
                    '離線錄影迴圈不依賴 `requestAnimationFrame`，且因影格編碼耗時與主執行緒讓出排程，真實時鐘時間與影片時間軸完全無關。所有繪圖與動態效果必須依據傳入的 `renderContext.globalTime` 或 `prepareVideoFrame` 之 `globalTime` 計算，不得使用 `Date.now()`、`performance.now()` 或自行啟動 `requestAnimationFrame` 計時。',
                    '僅 `target: "main"` 圖層支援納入影片匯出，`visual` 與 `preview` 畫布不會在錄影流程中執行。',
                    'Safari 與 iOS 平台限制：H.264 與 WebCodecs 編碼強制輸出寬高為正偶數；部分 Safari 與 iOS WebKit 版本對 `CanvasRenderingContext2D.filter` 支援有限或無效，繪圖時應避免僅依賴 `ctx.filter`；行動版瀏覽器分頁記憶體上限較低，離線解碼與大型離屏畫布必須及時釋放以免分頁崩潰。'
                ]
            }
        ],
        tables: [
            {
                title: 'ctx.render 方法清單',
                columns: ['方法', '所需權限', '說明'],
                rows: [
                    ['`registerOverlay(options)`', '`render:overlay`', '註冊畫布疊加圖層並回傳取消註冊函式'],
                    ['`requestRedraw()`', '`render:overlay`', '發布重繪事件請求互動畫布立即重繪，不影響離線錄影迴圈'],
                    ['`createVideoFrameDecoder(source, options)`', '`render:overlay`', '建立受控的逐幀影片解碼器供離線匯出循序取幀']
                ]
            }
        ],
        notes: [
            '於離線影片渲染期間，`renderContext.isRenderingVideo` 為 `true`，`dt` 固定為 `1 / fps`，且系統會關閉 12 毫秒效能熔斷機制以免高解析度繪圖遭到中斷。',
            '若需於每幀錄影繪製前非同步載入外部影片影格，請搭配 `prepareVideoFrame` 鉤子與 `createVideoFrameDecoder()`。'
        ],
        summary: {
            namespace: 'ctx.render',
            permission: 'render:overlay',
            constant: 'EXTENSION_PERMISSIONS.RENDER_OVERLAY',
            async: '同步繪製與選填非同步準備鉤子',
            runtime: 'Trusted 模式，支援逐幀離線錄影',
            since: 'API v1'
        },
        seeAlso: ['ctx.render.registerOverlay', 'ctx.render.requestRedraw', 'ctx.render.createVideoFrameDecoder', 'arch-renderer-audio']
    },
    {
        id: 'ctx.render.registerOverlay',
        category: 'api',
        groupId: 'group-ctx-render',
        stability: 'stable',
        title: '註冊畫布疊加圖層',
        codeTitle: 'ctx.render.registerOverlay()',
        sidebarLabel: 'registerOverlay()',
        sidebarMono: true,
        badge: '渲染',
        subtitle: '於主畫布、視覺化編輯器或底部預覽軌道指定階段註冊每幀自訂繪圖回呼，並可選擇納入影片匯出。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['render:overlay'],
            envs: ['狀態自動隔離', '12ms 熔斷保護', '影片匯出支援'],
            apiVersion: 'API v1'
        },
        overview: [
            '在 `SimaiRenderer`、`SimaiVisualEditor` 或 `SimaiPreviewRenderer` 的繪製管線特定階段插入自訂繪圖邏輯。註冊或註銷時系統會自動發布 `canvas:redraw` 事件更新畫面。',
            '每個圖層的 `draw` 呼叫前後，底層皆會自動執行 `ctx.save()` 與 `finally` 中的 `ctx.restore()` 進行狀態隔離，並以 `try...catch` 包裹防止例外中斷主迴圈。'
        ],
        syntax: `const unregister = ctx.render.registerOverlay(options)`,
        parameters: [
            {
                name: 'options',
                type: 'Object',
                required: true,
                description: '疊加圖層設定物件。',
                children: [
                    {
                        name: 'draw',
                        type: 'Function',
                        required: true,
                        description: '每幀調用的同步繪圖回呼函式，接收 `renderContext` 物件。'
                    },
                    {
                        name: 'target',
                        type: 'string',
                        required: false,
                        defaultValue: "'main'",
                        description: '目標畫布，可選 `main`、`visual` 或 `preview`。'
                    },
                    {
                        name: 'phase',
                        type: 'string',
                        required: false,
                        defaultValue: "'afterNotes'",
                        description: '繪製階段名稱。若傳入目標畫布不支援的階段，系統將拋出 `TypeError`。'
                    },
                    {
                        name: 'order',
                        type: 'number',
                        required: false,
                        defaultValue: '0',
                        description: '同一階段內的排序權重，數值較小者先繪製。'
                    },
                    {
                        name: 'includeInVideo',
                        type: 'boolean',
                        required: false,
                        defaultValue: 'false',
                        description: '是否於離線譜面影片匯出期間一併繪製該圖層。'
                    },
                    {
                        name: 'prepareVideoFrame',
                        type: 'Function',
                        required: false,
                        description: '離線影片匯出前置非同步準備回呼，僅於 `target` 為 `main` 且 `includeInVideo` 為 `true` 時執行。接收 `{ globalTime, frameIndex, frameCount, dt, width, height, signal }`，可回傳 Promise。'
                    },
                    {
                        name: 'prepareTimeoutMs',
                        type: 'number',
                        required: false,
                        defaultValue: '3000',
                        description: '單幀 `prepareVideoFrame` 逾時保護毫秒數，允許範圍為 `100` 至 `30000`。'
                    }
                ]
            }
        ],
        returns: {
            type: 'Function',
            description: '取消註冊函式。呼叫後會立即移除該疊加圖層並觸發畫布重繪。'
        },
        tables: [
            {
                title: '主畫布 main 支援的繪製階段，依底層至頂層順序',
                columns: ['階段名稱', '繪製時機說明'],
                rows: [
                    ['`afterClear`', '清除畫布後、外框輪廓前'],
                    ['`beforeNotes`', '外框輪廓後、感應區前'],
                    ['`afterSensors`', '感應區後、中央顯示前'],
                    ['`afterMiddleDisplay`', '中央顯示後、音符與花火前'],
                    ['`afterNoteObjects`', '音符本體後、打擊與判定特效前'],
                    ['`afterEffects`', '打擊與判定特效後、圓外黑色遮罩前'],
                    ['`afterBorder`', '黑色遮罩後、周邊輔助文字與介面之前'],
                    ['`afterNotes`', '所有原生圖層與介面之後的最頂層']
                ]
            },
            {
                title: '視覺化編輯器 visual 支援的繪製階段，依底層至頂層順序',
                columns: ['階段名稱', '繪製時機說明'],
                rows: [
                    ['`beforeNotes`', '背景、波形、標籤與時間基準線後、音符前'],
                    ['`afterNoteObjects`', '音符本體後、選取框與預覽標記前'],
                    ['`afterNotes`', '所有編輯互動覆蓋層之後的最頂層']
                ]
            },
            {
                title: '底部預覽軌道 preview 支援的繪製階段，依底層至頂層順序',
                columns: ['階段名稱', '繪製時機說明'],
                rows: [
                    ['`beforeNotes`', '波形、切分線與節拍線後、音符前'],
                    ['`afterNoteObjects`', '音符本體後、游標指針與選取範圍前'],
                    ['`afterNotes`', '所有原生圖層與選取範圍之後的最頂層']
                ]
            },
            {
                title: '傳入 draw(renderContext) 的物件欄位',
                columns: ['欄位名稱', '型別', '說明'],
                rows: [
                    ['`ctx`', '`CanvasRenderingContext2D`', 'Canvas 2D 渲染上下文'],
                    ['`width`', '`number`', '目標畫布像素寬度'],
                    ['`height`', '`number`', '目標畫布像素高度'],
                    ['`scale`', '`number`', '當前縮放倍率'],
                    ['`scaleBase`', '`number`', '畫布基準縮放長度'],
                    ['`unitPx`', '`number`', '單位像素比例，於視覺化編輯器與底部預覽軌道為每秒像素倍率'],
                    ['`stageRect`', '`Object`', '主畫布置中的十六比九舞台安全區域 `{ x, y, width, height }`，唯讀'],
                    ['`globalTime`', '`number`', '當前全域時間秒數，於底部預覽軌道對應畫布水平中心'],
                    ['`isPlaying`', '`boolean`', '當前是否處於播放狀態'],
                    ['`isRenderingVideo`', '`boolean`', '是否處於影片匯出渲染期間，由主畫布提供'],
                    ['`target`', '`string`', '當前繪圖目標畫布，為 `main`、`visual` 或 `preview`'],
                    ['`phase`', '`string`', '當前繪圖階段名稱']
                ]
            }
        ],
        callouts: [
            {
                variant: 'warning',
                title: '離線逐幀錄影、計時規則與 Safari 及 iOS 限制',
                items: [
                    '錄影機制為固定幀率逐幀離線渲染而非即時擷取，不經由 `requestAnimationFrame` 驅動，也不依據 `Date.now()` 或 `performance.now()` 推進時間；插件畫面若需隨時間變化，必須完全根據 `rc.globalTime` 計算，否則匯出影片中的動畫將停滯或倍速錯亂。',
                    '非影片匯出渲染期間，若單一疊加圖層連續 30 幀的單幀繪製耗時超過 12 毫秒，系統會自動移除該圖層並以提示訊息通知使用者。請將模糊、影像解碼等重度運算預先在離屏畫布完成。',
                    '影片匯出時的逐幀離線渲染不計入 12 毫秒熔斷限制；若提供的 `prepareVideoFrame` 連續逾時達 10 幀，該次匯出會略過前置等待以防卡死。',
                    'Safari 與 iOS 限制：錄影離屏畫布關閉透明通道且強制輸出尺寸為正偶數；部分 Safari 與 iOS WebKit 版本對 `rc.ctx.filter` 支援度不足，建議改用雙向混合、半透明遮罩或預先離屏處理取代 CSS 濾鏡字串，並控制離屏畫布解析度以避免超出 iOS 分頁記憶體上限。'
                ]
            }
        ],
        notes: [
            '僅 `target: "main"` 且設定 `includeInVideo: true` 的圖層會於匯出影片時執行繪製與 `prepareVideoFrame`。',
            '`prepareVideoFrame` 僅接收 `{ globalTime, frameIndex, frameCount, dt, width, height, signal }`，請於非同步工作前後檢查 `signal?.aborted`，確保使用者取消錄影時立即中止。',
            '擴充停用或卸載時系統會自動註銷圖層並觸發 `canvas:redraw` 事件。'
        ],
        examples: [
            {
                label: '於主畫布外框後繪製自訂發光環',
                code: `const unregister = ctx.render.registerOverlay({
    target: 'main',
    phase: 'afterBorder',
    order: 10,
    includeInVideo: true,
    draw(rc) {
        const g = rc.ctx;
        const cx = rc.width / 2;
        const cy = rc.height / 2;
        const radius = rc.scaleBase * 0.45;

        g.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        g.lineWidth = Math.max(2, rc.unitPx * 3);
        g.beginPath();
        g.arc(cx, cy, radius, 0, Math.PI * 2);
        g.stroke();
    }
});`
            }
        ],
        summary: {
            namespace: 'ctx.render',
            permission: 'render:overlay',
            constant: 'EXTENSION_PERMISSIONS.RENDER_OVERLAY',
            async: '同步繪製與選填非同步準備鉤子',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.render.requestRedraw', 'ctx.playback.getState', 'arch-renderer-audio']
    },
    {
        id: 'ctx.render.requestRedraw',
        category: 'api',
        groupId: 'group-ctx-render',
       stability: 'stable',
        title: '請求畫布立即重繪',
        codeTitle: 'ctx.render.requestRedraw()',
        sidebarLabel: 'requestRedraw()',
        sidebarMono: true,
        badge: '渲染',
        subtitle: '主動發布畫布重繪事件，使靜止暫停中的互動畫布即時呈現最新的疊加圖層變化。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['render:overlay'],
            envs: ['Trusted 模式', '僅作用於即時預覽'],
            apiVersion: 'API v1'
        },
        overview: [
            '當音軌處於暫停狀態而外掛內部狀態或設定變更時，可呼叫此方法觸發主渲染器與預覽畫布進行單次重繪。',
            '離線影片錄影採用逐幀控制迴圈繪製，不會監聽或響應 `requestRedraw()` 觸發的 `canvas:redraw` 事件。'
        ],
        syntax: `ctx.render.requestRedraw()`,
        returns: {
            type: 'undefined',
            description: '無回傳值。'
        },
        notes: [
            '內部直接發布 `canvas:redraw` 事件，並依賴主編輯器既有的繪製排程執行即時畫面更新。',
            '在逐幀離線錄影期間不應於 `draw()` 內部呼叫此方法，以免多餘事件干擾主畫面。'
        ],
        examples: [
            {
                label: '變更設定後觸發重繪',
                code: `ctx.render.requestRedraw();`
            }
        ],
        summary: {
            namespace: 'ctx.render',
            permission: 'render:overlay',
            constant: 'EXTENSION_PERMISSIONS.RENDER_OVERLAY',
            async: '同步排程',
            runtime: 'Trusted 模式，即時畫布重繪',
            since: 'API v1'
        },
        seeAlso: ['ctx.render.registerOverlay', 'events-list']
    },
    {
        id: 'ctx.render.createVideoFrameDecoder',
        category: 'api',
        groupId: 'group-ctx-render',
        stability: 'stable',
        title: '建立逐幀影片解碼器',
        codeTitle: 'ctx.render.createVideoFrameDecoder()',
        sidebarLabel: 'createVideoFrameDecoder()',
        sidebarMono: true,
        badge: '渲染',
        subtitle: '建立受控的離線逐幀影片解碼器，封裝循序影格推進、循環對齊與自動資源釋放。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['render:overlay'],
            envs: ['Trusted 模式', '離線影片渲染支援'],
            apiVersion: 'API v1'
        },
        overview: [
            '供需要將外部影片整合進離線錄影匯出的外掛使用，內部會自動維護循序影格迭代器推進、循環回繞與跳轉重建，避免直接以 `video.currentTime` 逐幀跳轉導致匯出緩慢。',
            '若圖層僅使用 Canvas 畫筆繪製圖形或繪製靜態圖片，只需於 `registerOverlay` 設定 `includeInVideo: true` 並於 `draw` 依 `globalTime` 繪圖即可，無需呼叫此方法。'
        ],
        syntax: `const decoder = await ctx.render.createVideoFrameDecoder(source, options)`,
        parameters: [
            {
                name: 'source',
                type: 'Blob | File | string',
                required: true,
                description: '欲解碼的影片來源，支援本機檔案物件或網址字串。'
            },
            {
                name: 'options',
                type: 'Object',
                required: false,
                description: '解碼器組態設定物件。',
                children: [
                    {
                        name: 'endBehavior',
                        type: 'string',
                        required: false,
                        defaultValue: "'stop'",
                        description: '超出影片長度時的預設行為，可選 `stop` 或 `loop`。'
                    },
                    {
                        name: 'width',
                        type: 'number',
                        required: false,
                        description: '解碼輸出畫布的目標寬度像素值。'
                    },
                    {
                        name: 'height',
                        type: 'number',
                        required: false,
                        description: '解碼輸出畫布的目標高度像素值。'
                    }
                ]
            }
        ],
        returns: {
            type: 'Promise<Object>',
            description: '解析為受控解碼器物件 `{ duration, getFrameAt, dispose }`，擴充停用時系統會自動呼叫 `dispose()` 釋放資源。'
        },
        tables: [
            {
                title: '解碼器回傳介面與方法',
                columns: ['屬性或方法', '型別', '說明'],
                rows: [
                    ['`duration`', '`number`', '影片總長度秒數'],
                    ['`getFrameAt(time, callOptions)`', '`Function`', '非同步函式，依目標秒數 `time` 與選填 `{ endBehavior }` 回傳影格物件 `{ canvas, timestamp, duration, width, height }` 或 `null`'],
                    ['`dispose()`', '`Function`', '非同步函式，立即關閉迭代器並釋放底層解碼器資源']
                ]
            }
        ],
        callouts: [
            {
                variant: 'warning',
                title: '離線取幀計時與 Safari 及 iOS 限制',
                items: [
                    '請一律將 `prepareVideoFrame` 傳入的 `globalTime` 傳給 `decoder.getFrameAt(globalTime)`，切勿改用 `Date.now()` 或即時播放進度計算時間，才能確保每幀畫面精準對應匯出時間軸。',
                    '此方法底層依賴 Mediabunny 與瀏覽器 WebCodecs 視訊解碼器：不支援 WebCodecs 的舊版 Safari 或受限 iOS WebKit 環境無法使用；於支援的 iOS 裝置上，建議明確設定較小的 `width` 與 `height` 降低解碼紋理記憶體用量，並於不再需要或使用者更換影片時立即呼叫 `await decoder.dispose()`。'
                ]
            }
        ],
        notes: [
            '順向取幀會直接推進底層 `CanvasSink` 迭代器；若時間倒退或向前跳轉超過 2 秒，解碼器會自動重建迭代器。',
            '擴充停用或卸載時系統會自動呼叫 `dispose()` 回收資源；非影片匯出時的即時預覽畫面若使用 `<video>` 元素，在 iOS WebKit 上應配合 `playsInline`、`webkit-playsinline` 與靜音設定以確保內嵌播放正常。'
        ],
        examples: [
            {
                label: '搭配 prepareVideoFrame 進行離線逐幀繪製',
                code: `const decoder = await ctx.render.createVideoFrameDecoder(videoFile, {
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
});`
            }
        ],
        summary: {
            namespace: 'ctx.render',
            permission: 'render:overlay',
            constant: 'EXTENSION_PERMISSIONS.RENDER_OVERLAY',
            async: '非同步建立與取幀',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.render.registerOverlay', 'guide-lifecycle']
    },

    /* ======================================================================
       八、ctx.commands 指令註冊介面
       ====================================================================== */
    {
        id: 'ctx.commands',
        category: 'api',
        groupId: 'group-ctx-commands',
        stability: 'stable',
        title: '指令註冊介面',
        codeTitle: 'ctx.commands',
        sidebarLabel: '總覽',
        sidebarMono: false,
        badge: '命名空間',
        subtitle: '於全域指令中心註冊具備擴充命名空間前綴的自訂指令。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['commands:register'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '宣告 `commands:register` 權限時注入此介面；未宣告時為 `undefined`。',
            '註冊的指令可與頂欄選單項目綁定，並強制以 `ext.${extensionId}.` 作為命名空間前綴隔離。'
        ],
        tables: [
            {
                title: 'ctx.commands 方法清單',
                columns: ['方法', '所需權限', '說明'],
                rows: [
                    ['`register(localCommandId, handler, meta)`', '`commands:register`', '註冊擴充專屬指令並回傳註銷函式']
                ]
            }
        ],
        summary: {
            namespace: 'ctx.commands',
            permission: 'commands:register',
            constant: 'EXTENSION_PERMISSIONS.COMMANDS_REGISTER',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.commands.register', 'ctx.ui.registerMenuItem']
    },
    {
        id: 'ctx.commands.register',
        category: 'api',
        groupId: 'group-ctx-commands',
        stability: 'stable',
        title: '註冊命名空間自訂指令',
        codeTitle: 'ctx.commands.register()',
        sidebarLabel: 'register()',
        sidebarMono: true,
        badge: '註冊',
        subtitle: '向全域指令中心註冊具有擴充命名空間隔離的可執行指令。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['commands:register'],
            envs: ['命名空間自動前綴', '自動生命週期回收'],
            apiVersion: 'API v1'
        },
        overview: [
            '系統會自動將傳入的本地指令名稱組合為 `ext.${extensionId}.${localCommandId}`，防止覆寫主程式核心指令或與其他外掛衝撞。'
        ],
        syntax: `const unregister = ctx.commands.register(localCommandId, handler, meta = {})`,
        parameters: [
            {
                name: 'localCommandId',
                type: 'string',
                required: true,
                description: '本地指令識別碼，實際註冊名稱會自動加上 `ext.${extensionId}.` 前綴。'
            },
            {
                name: 'handler',
                type: 'Function',
                required: true,
                description: '指令觸發時執行的邏輯函式，可接收觸發端傳入的參數。'
            },
            {
                name: 'meta',
                type: 'Object',
                required: false,
                defaultValue: '{}',
                description: '指令中繼資訊物件，例如標題或圖示描述。'
            }
        ],
        returns: {
            type: 'Function',
            description: '清理函式。呼叫後可提前註銷該指令。'
        },
        notes: [
            '擴充停用時系統會自動註銷所有透過此介面註冊的指令。'
        ],
        examples: [
            {
                label: '註冊指令並綁定至頂欄選單',
                code: `const offCmd = ctx.commands.register('openPanel', ({ anchorEl }) => {
    ctx.ui.openPopover({ title: '設定', schema: [], anchorEl });
}, { title: '開啟外掛設定' });

ctx.ui.registerMenuItem({
    id: 'settings',
    label: '開啟設定',
    commandId: 'openPanel'
});`
            }
        ],
        summary: {
            namespace: 'ctx.commands',
            permission: 'commands:register',
            constant: 'EXTENSION_PERMISSIONS.COMMANDS_REGISTER',
            async: '同步註冊',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.ui.registerMenuItem', 'guide-security']
    },

    /* ======================================================================
       九、ctx.events 事件訂閱介面
       ====================================================================== */
    {
        id: 'ctx.events',
        category: 'api',
        groupId: 'group-ctx-events',
        stability: 'stable',
        title: '事件訂閱介面',
        codeTitle: 'ctx.events',
        sidebarLabel: '總覽',
        sidebarMono: false,
        badge: '命名空間',
        subtitle: '訂閱應用程式事件匯流排中開放白名單的系統生命週期與狀態變更事件。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['events:subscribe'],
            envs: ['白名單限制', '自動取消訂閱'],
            apiVersion: 'API v1'
        },
        overview: [
            '宣告 `events:subscribe` 權限時注入此介面；未宣告時為 `undefined`。'
        ],
        tables: [
            {
                title: 'ctx.events 方法清單',
                columns: ['方法', '所需權限', '說明'],
                rows: [
                    ['`on(eventName, callback)`', '`events:subscribe`', '訂閱白名單系統事件並回傳取消訂閱函式']
                ]
            }
        ],
        summary: {
            namespace: 'ctx.events',
            permission: 'events:subscribe',
            constant: 'EXTENSION_PERMISSIONS.EVENTS_SUBSCRIBE',
            async: '事件回呼',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.events.on', 'events-list']
    },
    {
        id: 'ctx.events.on',
        category: 'api',
        groupId: 'group-ctx-events',
        stability: 'stable',
        title: '訂閱白名單事件',
        codeTitle: 'ctx.events.on()',
        sidebarLabel: 'on()',
        sidebarMono: true,
        badge: '事件',
        subtitle: '訂閱專案載入、譜面解碼、播放切換或設定異動等白名單系統事件。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['events:subscribe'],
            envs: ['白名單保護'],
            apiVersion: 'API v1'
        },
        overview: [
            '僅允許訂閱開放白名單所列的系統事件。若嘗試訂閱未開放事件，控制台會輸出警告訊息並回傳空操作函式。'
        ],
        syntax: `const off = ctx.events.on(eventName, callback)`,
        parameters: [
            {
                name: 'eventName',
                type: 'string',
                required: true,
                description: '事件名稱，須屬於開放白名單之一，例如 `chart:decoded` 或 `playback:state-changed`。'
            },
            {
                name: 'callback',
                type: 'Function',
                required: true,
                description: '事件發布時執行的回呼函式，接收對應的事件酬載參數。'
            }
        ],
        returns: {
            type: 'Function',
            description: '取消訂閱函式。擴充停用時系統亦會自動移除所有監聽器。'
        },
        examples: [
            {
                label: '監聽譜面重新解碼事件',
                code: `const off = ctx.events.on('chart:decoded', ({ difficulty, noteCount }) => {
    console.log('當前難度音符總數:', difficulty, noteCount);
});`
            }
        ],
        summary: {
            namespace: 'ctx.events',
            permission: 'events:subscribe',
            constant: 'EXTENSION_PERMISSIONS.EVENTS_SUBSCRIBE',
            async: '事件驅動',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['events-list', 'ctx.editor.on']
    },

    /* ======================================================================
       十、ctx.ui 使用者介面
       ====================================================================== */
    {
        id: 'ctx.ui',
        category: 'api',
        groupId: 'group-ctx-ui',
        stability: 'stable',
        title: '使用者介面',
        codeTitle: 'ctx.ui',
        sidebarLabel: '總覽',
        sidebarMono: false,
        badge: '命名空間',
        subtitle: '提供吐司提示、頂欄拼圖選單註冊、宣告式設定彈窗與受控浮動掛件容器。',
        status: {
            variant: 'perm',
            label: '細粒度 UI 權限',
            permissions: ['ui:toast', 'ui:menu', 'ui:popover', 'ui:overlay'],
            envs: ['原站彈窗風格繼承'],
            apiVersion: 'API v1'
        },
        overview: [
            '宣告 `ui:toast`、`ui:menu`、`ui:popover` 或 `ui:overlay` 任一權限時注入 `ctx.ui`。物件內僅會暴露已授權權限對應的方法。'
        ],
        tables: [
            {
                title: 'ctx.ui 方法與權限對照',
                columns: ['方法', '所需權限', '說明'],
                rows: [
                    ['`toast(options)`', '`ui:toast`', '顯示全域吐司提示通知'],
                    ['`registerMenuItem(item)`', '`ui:menu`', '於頂欄拼圖選單註冊二級選單項目'],
                    ['`openPopover(options)`', '`ui:popover`', '開啟宣告式設定彈窗'],
                    ['`closePopover()`', '`ui:popover`', '關閉目前開啟的擴充設定彈窗'],
                    ['`getSettings(schema)`', '`ui:popover`', '讀取並自動補全預設值的隔離設定物件'],
                    ['`createFloatingWidget(options)`', '`ui:overlay`', '建立受控頁面浮動掛件容器']
                ]
            }
        ],
        summary: {
            namespace: 'ctx.ui',
            permission: 'ui:toast / ui:menu / ui:popover / ui:overlay',
            constant: 'EXTENSION_PERMISSIONS.UI_*',
            async: '同步 DOM 操作',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.ui.toast', 'ctx.ui.registerMenuItem', 'ctx.ui.openPopover', 'ctx.ui.createFloatingWidget', 'settings-schema']
    },
    {
        id: 'ctx.ui.toast',
        category: 'api',
        groupId: 'group-ctx-ui',
        stability: 'stable',
        title: '顯示全域吐司通知',
        codeTitle: 'ctx.ui.toast()',
        sidebarLabel: 'toast()',
        sidebarMono: true,
        badge: '介面',
        subtitle: '使用主程式既有的 SimpleToast 通知系統向使用者顯示簡短提示訊息。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['ui:toast'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '於畫面左上方或目前彈窗適應位置顯示非侵入式的提示訊息列，支援傳入設定物件或純文字字串。',
            '系統會自動在提示元素上標記 `dataset.extensionId`（及 `_extensionId`）供識別來源，並於擴充程式停用時自動關閉尚未消失的提示。'
        ],
        syntax: `const controller = ctx.ui.toast(options)`,
        parameters: [
            {
                name: 'options',
                type: 'Object | string',
                required: true,
                description: '提示設定物件或純文字訊息字串；直接傳入字串時將作為 `title` 使用。',
                children: [
                    { name: 'id', type: 'string', required: false, description: '提示識別碼，同一 ID 的提示會原地更新；系統會自動加上 `ext.<擴充識別碼>.` 前綴以防止碰撞' },
                    { name: 'title', type: 'string', required: false, description: '提示標題文字' },
                    { name: 'content', type: 'string', required: false, description: '提示內容文字' },
                    { name: 'type', type: 'string', required: false, defaultValue: "'info'", description: '提示類型，支援 `info`、`success`、`warning` 與 `error`' },
                    { name: 'timeout', type: 'number', required: false, description: '自動消失的持續毫秒數' }
                ]
            }
        ],
        returns: {
            type: 'ToastController | null',
            description: '回傳 Toast 控制器物件，含 `id`、`extensionId`、`element`、`close()` 與 `update()`；若擴充未啟用或不可用則回傳 `null`。'
        },
        examples: [
            {
                label: '顯示成功吐司並透過控制器原地更新與關閉',
                code: `const toast = ctx.ui.toast({
    id: 'render-status',
    title: '自訂渲染',
    content: '已套用自訂渲染設定',
    type: 'success',
    timeout: 3000
});

// 同一 ID 可直接透過控制器原地更新內容
toast?.update({ content: '已完成畫面重繪', type: 'info' });`
            }
        ],
        summary: {
            namespace: 'ctx.ui',
            permission: 'ui:toast',
            constant: 'EXTENSION_PERMISSIONS.UI_TOAST',
            async: '同步呼叫',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.ui.registerMenuItem', 'ctx.ui.openPopover']
    },
    {
        id: 'ctx.ui.registerMenuItem',
        category: 'api',
        groupId: 'group-ctx-ui',
        stability: 'stable',
        title: '註冊頂欄擴充選單項目',
        codeTitle: 'ctx.ui.registerMenuItem()',
        sidebarLabel: 'registerMenuItem()',
        sidebarMono: true,
        badge: '介面',
        subtitle: '於頂欄拼圖選單的該擴充子選單中新增可點擊的功能項目。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['ui:menu'],
            envs: ['自動語系整合', '自動資源回收'],
            apiVersion: 'API v1'
        },
        overview: [
            '系統會於頂欄拼圖選單自動為每個有註冊項目的擴充產生折疊或二級選單群組，並支援透過 `labelKey` 自動綁定多語系翻譯。'
        ],
        syntax: `const unregister = ctx.ui.registerMenuItem(item)`,
        parameters: [
            {
                name: 'item',
                type: 'Object',
                required: true,
                description: '選單定義物件。',
                children: [
                    { name: 'id', type: 'string', required: true, description: '選單項目唯一識別碼' },
                    { name: 'label', type: 'string', required: false, description: '靜態顯示文字' },
                    { name: 'labelKey', type: 'string', required: false, description: '多語系翻譯鍵；若語系庫存在對應翻譯則優先使用' },
                    { name: 'commandId', type: 'string', required: false, description: '點擊時觸發的本地指令識別碼' },
                    { name: 'onClick', type: 'Function', required: false, description: '點擊回呼函式，接收 `{ anchorEl }`；與 `commandId` 擇一提供' }
                ]
            }
        ],
        returns: {
            type: 'Function',
            description: '取消註冊函式。擴充停用時系統亦會自動將項目自頂欄移除。'
        },
        examples: [
            {
                label: '註冊開啟設定彈窗的選單項目',
                code: `ctx.ui.registerMenuItem({
    id: 'config',
    label: '參數設定',
    onClick: ({ anchorEl }) => {
        ctx.ui.openPopover({
            title: '插件設定',
            schema: SETTINGS_SCHEMA,
            anchorEl
        });
    }
});`
            }
        ],
        summary: {
            namespace: 'ctx.ui',
            permission: 'ui:menu',
            constant: 'EXTENSION_PERMISSIONS.UI_MENU',
            async: '同步註冊',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.commands.register', 'ctx.ui.openPopover', 'ctx.i18n.registerTranslations']
    },
    {
        id: 'ctx.ui.openPopover',
        category: 'api',
        groupId: 'group-ctx-ui',
        stability: 'stable',
        title: '開啟宣告式設定面板',
        codeTitle: 'ctx.ui.openPopover()',
        sidebarLabel: 'openPopover()',
        sidebarMono: true,
        badge: '彈窗',
        subtitle: '復用原站系統彈窗與模糊背景遮罩，自動依綱要陣列渲染設定表單並同步持久化儲存。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['ui:popover'],
            envs: ['自動持久化儲存', 'Escape 與背景關閉'],
            apiVersion: 'API v1'
        },
        overview: [
            '由主程式統一渲染表單控制項與原站樣式，並自動於底部提供「重設為預設值」按鈕。資料隔離儲存於 `wmcx_ext_settings_${extensionId}`。'
        ],
        syntax: `const popover = ctx.ui.openPopover(options)`,
        parameters: [
            {
                name: 'options',
                type: 'Object',
                required: true,
                description: '設定面板配置物件。',
                children: [
                    { name: 'title', type: 'string', required: false, defaultValue: 'manifest.name', description: '面板頂部標題文字' },
                    { name: 'schema', type: 'Array<Object>', required: false, defaultValue: '[]', description: '宣告式設定欄位綱要清單' },
                    { name: 'anchorEl', type: 'HTMLElement | null', required: false, description: '保留相容性定位錨點參數' },
                    { name: 'onChange', type: 'Function', required: false, description: '任一欄位數值異動時觸發，接收 `(key, value, allValues)`' }
                ]
            }
        ],
        returns: {
            type: 'Object',
            description: '彈窗控制物件。',
            fields: [
                { name: 'close', type: 'Function', description: '立即關閉當前設定面板' },
                { name: 'getValues', type: 'Function', description: '取得當前面板所有欄位數值的淺層拷貝物件' }
            ]
        },
        examples: [
            {
                label: '開啟設定面板並即時同步選項',
                code: `ctx.ui.openPopover({
    title: '外觀調節',
    schema: [
        { key: 'enabled', type: 'boolean', default: true, label: '啟用效果' },
        { key: 'opacity', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05, label: '不透明度' }
    ],
    onChange(key, value, allValues) {
        console.log('設定已更新:', key, value, allValues);
    }
});`
            }
        ],
        summary: {
            namespace: 'ctx.ui',
            permission: 'ui:popover',
            constant: 'EXTENSION_PERMISSIONS.UI_POPOVER',
            async: '同步開啟',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['settings-schema', 'ctx.ui.getSettings', 'ctx.ui.closePopover']
    },
    {
        id: 'ctx.ui.closePopover',
        category: 'api',
        groupId: 'group-ctx-ui',
        stability: 'stable',
        title: '關閉擴充設定面板',
        codeTitle: 'ctx.ui.closePopover()',
        sidebarLabel: 'closePopover()',
        sidebarMono: true,
        badge: '彈窗',
        subtitle: '若目前正開啟屬於當前擴充的設定面板，將其關閉並釋放背景遮罩。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['ui:popover'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '提供外掛以程式方式主動收合設定面板。若目前開啟的是其他擴充或主程式彈窗，則不會受影響。'
        ],
        syntax: `ctx.ui.closePopover()`,
        returns: {
            type: 'undefined',
            description: '無回傳值。'
        },
        examples: [
            {
                label: '完成動作後自動關閉設定面板',
                code: `ctx.ui.closePopover();`
            }
        ],
        summary: {
            namespace: 'ctx.ui',
            permission: 'ui:popover',
            constant: 'EXTENSION_PERMISSIONS.UI_POPOVER',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.ui.openPopover', 'ctx.ui.getSettings']
    },
    {
        id: 'ctx.ui.getSettings',
        category: 'api',
        groupId: 'group-ctx-ui',
        stability: 'stable',
        title: '讀取擴充設定值',
        codeTitle: 'ctx.ui.getSettings()',
        sidebarLabel: 'getSettings()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '自該擴充專屬隔離儲存區讀取已儲存設定，並自動以綱要預設值補全缺漏欄位。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['ui:popover'],
            envs: ['預設值回填', '記憶體降級保護'],
            apiVersion: 'API v1'
        },
        overview: [
            '通常於 `activate(ctx)` 啟動階段呼叫一次以取得完整初始化設定。當瀏覽器無法存取 `localStorage` 時，底層會自動降級為記憶體快取。'
        ],
        syntax: `const settings = ctx.ui.getSettings(schema = [])`,
        parameters: [
            {
                name: 'schema',
                type: 'Array<Object>',
                required: false,
                defaultValue: '[]',
                description: '宣告式設定欄位綱要清單，系統依據各欄位的 `key` 與 `default` 組成最終物件。'
            }
        ],
        returns: {
            type: 'Object',
            description: '包含所有已定義鍵名與生效數值的設定物件。'
        },
        examples: [
            {
                label: '於擴充啟動時讀取設定並套用預設值',
                code: `const SETTINGS_SCHEMA = [
    { key: 'enabled', type: 'boolean', default: true, label: '啟用' },
    { key: 'blurRadius', type: 'number', default: 14, label: '模糊半徑' }
];

const settings = ctx.ui.getSettings(SETTINGS_SCHEMA);`
            }
        ],
        summary: {
            namespace: 'ctx.ui',
            permission: 'ui:popover',
            constant: 'EXTENSION_PERMISSIONS.UI_POPOVER',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['settings-schema', 'ctx.ui.openPopover', 'ctx.storage.get']
    },
    {
        id: 'ctx.ui.createFloatingWidget',
        category: 'api',
        groupId: 'group-ctx-ui',
        stability: 'stable',
        title: '建立浮動掛件容器',
        codeTitle: 'ctx.ui.createFloatingWidget()',
        sidebarLabel: 'createFloatingWidget()',
        sidebarMono: true,
        badge: '介面',
        subtitle: '於頁面根層級掛載受控的浮動元件容器，並於擴充停用時自動清除。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['ui:overlay'],
            envs: ['層級低於系統遮罩', '自動生命週期回收'],
            apiVersion: 'API v1'
        },
        overview: [
            '建立帶有 `.extension-floating-widget` 樣式規則的 DOM 掛載容器。開啟系統彈窗時，此容器會處於 `.popup-backdrop` 模糊遮罩下方，不遮蔽系統操作視窗。',
            '建議於回傳的 `element` 上掛載 Shadow DOM，確保外掛樣式與主站完全隔離。'
        ],
        syntax: `const widget = ctx.ui.createFloatingWidget(options = {})`,
        parameters: [
            {
                name: 'options',
                type: 'Object',
                required: false,
                defaultValue: '{}',
                description: '浮動元件設定物件。',
                children: [
                    { name: 'id', type: 'string', required: false, defaultValue: "'default'", description: '元件本地識別碼' },
                    { name: 'position', type: 'string', required: false, defaultValue: "'right'", description: '定位停靠方位，預設為 `right`' }
                ]
            }
        ],
        returns: {
            type: 'Object',
            description: '受控浮動元件操作物件。',
            fields: [
                { name: 'element', type: 'HTMLElement', description: '已掛載至頁面的容器節點' },
                { name: 'dispose', type: 'Function', description: '提前銷毀並從 DOM 樹移除此容器' }
            ]
        },
        examples: [
            {
                label: '建立附帶 Shadow DOM 的浮動計時面板',
                code: `const widget = ctx.ui.createFloatingWidget({ id: 'timer', position: 'right' });
const shadow = widget.element.attachShadow({ mode: 'open' });
const text = document.createElement('div');
text.textContent = '00:00.00';
shadow.appendChild(text);`
            }
        ],
        summary: {
            namespace: 'ctx.ui',
            permission: 'ui:overlay',
            constant: 'EXTENSION_PERMISSIONS.UI_OVERLAY',
            async: '同步建立',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['guide-security', 'ctx.ui.openPopover']
    },

    /* ======================================================================
       十一、ctx.storage 資料儲存介面
       ====================================================================== */
    {
        id: 'ctx.storage',
        category: 'api',
        groupId: 'group-ctx-storage',
        stability: 'stable',
        title: '資料儲存介面',
        codeTitle: 'ctx.storage',
        sidebarLabel: '總覽',
        sidebarMono: false,
        badge: '命名空間',
        subtitle: '於系統分配的擴充專屬邏輯隔離鍵空間內讀寫與清理持久資料。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['storage'],
            envs: ['命名空間隔離', '解除安裝自動清除'],
            apiVersion: 'API v1'
        },
        overview: [
            '宣告 `storage` 權限時注入此介面；未宣告時為 `undefined`。',
            '資料以擴充識別碼存放於 `localStorage` 的 `wmcx_ext_data_<id>` 欄位中，解除安裝擴充程式時系統會自動移除對應資料與設定。此為邏輯命名空間隔離，請勿儲存敏感密碼或明文機密。'
        ],
        tables: [
            {
                title: 'ctx.storage 方法清單',
                columns: ['方法', '所需權限', '說明'],
                rows: [
                    ['`get(key, defaultValue)`', '`storage`', '讀取指定鍵的資料，不存在時回傳預設值'],
                    ['`set(key, value)`', '`storage`', '寫入可 JSON 序列化的資料至隔離空間'],
                    ['`remove(key)`', '`storage`', '移除指定鍵的資料'],
                    ['`clear()`', '`storage`', '清空當前擴充在隔離儲存區內的所有資料'],
                    ['`keys()`', '`storage`', '取得目前所有已儲存鍵名陣列']
                ]
            }
        ],
        summary: {
            namespace: 'ctx.storage',
            permission: 'storage',
            constant: 'EXTENSION_PERMISSIONS.STORAGE',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.storage.get', 'ctx.storage.set', 'ctx.storage.remove', 'ctx.storage.clear', 'ctx.storage.keys']
    },
    {
        id: 'ctx.storage.get',
        category: 'api',
        groupId: 'group-ctx-storage',
        stability: 'stable',
        title: '讀取隔離儲存資料',
        codeTitle: 'ctx.storage.get()',
        sidebarLabel: 'get()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '讀取指定鍵名的儲存資料，若鍵名不存在則回傳指定的預設值。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['storage'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '自當前擴充的隔離資料區讀取並反序列化儲存數值。'
        ],
        syntax: `ctx.storage.get(key, defaultValue = null)`,
        parameters: [
            { name: 'key', type: 'string', required: true, description: '儲存鍵名。' },
            { name: 'defaultValue', type: 'any', required: false, defaultValue: 'null', description: '當鍵不存在時回傳的備援預設值。' }
        ],
        returns: {
            type: 'any',
            description: '儲存的值或 `defaultValue`。'
        },
        examples: [
            {
                label: '讀取歷史紀錄清單',
                code: `const presets = ctx.storage.get('presets', []);`
            }
        ],
        summary: {
            namespace: 'ctx.storage',
            permission: 'storage',
            constant: 'EXTENSION_PERMISSIONS.STORAGE',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.storage.set', 'ctx.storage.keys']
    },
    {
        id: 'ctx.storage.set',
        category: 'api',
        groupId: 'group-ctx-storage',
        stability: 'stable',
        title: '寫入隔離儲存資料',
        codeTitle: 'ctx.storage.set()',
        sidebarLabel: 'set()',
        sidebarMono: true,
        badge: '寫入',
        subtitle: '將指定資料透過 JSON 序列化寫入當前擴充的隔離儲存區。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['storage'],
            envs: ['JSON 序列化限制'],
            apiVersion: 'API v1'
        },
        overview: [
            '將數值寫入擴充專屬的持久化儲存物件中。僅支援可安全進行 JSON 序列化的資料結構。'
        ],
        syntax: `ctx.storage.set(key, value)`,
        parameters: [
            { name: 'key', type: 'string', required: true, description: '儲存鍵名。' },
            { name: 'value', type: 'any', required: true, description: '欲儲存的資料數值，須可經 JSON 序列化。' }
        ],
        returns: {
            type: 'boolean',
            description: '表示寫入是否成功。'
        },
        examples: [
            {
                label: '儲存使用者自訂預設集',
                code: `ctx.storage.set('lastUsedMode', 'compact');`
            }
        ],
        summary: {
            namespace: 'ctx.storage',
            permission: 'storage',
            constant: 'EXTENSION_PERMISSIONS.STORAGE',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.storage.get', 'ctx.storage.remove']
    },
    {
        id: 'ctx.storage.remove',
        category: 'api',
        groupId: 'group-ctx-storage',
        stability: 'stable',
        title: '移除隔離儲存項目',
        codeTitle: 'ctx.storage.remove()',
        sidebarLabel: 'remove()',
        sidebarMono: true,
        badge: '寫入',
        subtitle: '刪除擴充隔離儲存空間內的單一指定鍵值。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['storage'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '從擴充專屬儲存區刪除指定的鍵名與其對應內容。'
        ],
        syntax: `ctx.storage.remove(key)`,
        parameters: [
            { name: 'key', type: 'string', required: true, description: '欲移除的儲存鍵名。' }
        ],
        returns: {
            type: 'boolean',
            description: '表示移除操作是否成功。'
        },
        examples: [
            {
                label: '刪除特定快取鍵',
                code: `ctx.storage.remove('tempDraft');`
            }
        ],
        summary: {
            namespace: 'ctx.storage',
            permission: 'storage',
            constant: 'EXTENSION_PERMISSIONS.STORAGE',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.storage.clear', 'ctx.storage.get']
    },
    {
        id: 'ctx.storage.clear',
        category: 'api',
        groupId: 'group-ctx-storage',
        stability: 'stable',
        title: '清空隔離儲存空間',
        codeTitle: 'ctx.storage.clear()',
        sidebarLabel: 'clear()',
        sidebarMono: true,
        badge: '寫入',
        subtitle: '一次清除當前擴充於隔離儲存空間內保存的所有鍵值資料。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['storage'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '清空所有寫入於 `wmcx_ext_data_<id>` 的鍵值資料，不影響其他擴充程式或主程式設定。'
        ],
        syntax: `ctx.storage.clear()`,
        returns: {
            type: 'boolean',
            description: '表示清空操作是否成功。'
        },
        examples: [
            {
                label: '重設所有插件內部狀態',
                code: `ctx.storage.clear();`
            }
        ],
        summary: {
            namespace: 'ctx.storage',
            permission: 'storage',
            constant: 'EXTENSION_PERMISSIONS.STORAGE',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.storage.remove', 'ctx.storage.keys']
    },
    {
        id: 'ctx.storage.keys',
        category: 'api',
        groupId: 'group-ctx-storage',
        stability: 'stable',
        title: '列出已儲存鍵名',
        codeTitle: 'ctx.storage.keys()',
        sidebarLabel: 'keys()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '取得當前擴充在隔離儲存區中所有已建立的鍵名清單。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['storage'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '回傳字串陣列，列出此擴充程式目前已寫入儲存區的所有鍵名。'
        ],
        syntax: `ctx.storage.keys()`,
        returns: {
            type: 'Array<string>',
            description: '目前所有儲存鍵名的字串陣列。'
        },
        examples: [
            {
                label: '檢視目前所有儲存鍵',
                code: `const allKeys = ctx.storage.keys();
console.log('儲存鍵數目:', allKeys.length);`
            }
        ],
        summary: {
            namespace: 'ctx.storage',
            permission: 'storage',
            constant: 'EXTENSION_PERMISSIONS.STORAGE',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.storage.get', 'ctx.storage.clear']
    },

    /* ======================================================================
       十二、ctx.i18n 國際化多語系介面
       ====================================================================== */
    {
        id: 'ctx.i18n',
        category: 'api',
        groupId: 'group-ctx-i18n',
        stability: 'stable',
        title: '國際化多語系介面',
        codeTitle: 'ctx.i18n',
        sidebarLabel: '總覽',
        sidebarMono: false,
        badge: '命名空間',
        subtitle: '註冊擴充專屬多語系詞典並整合主程式語言熱切換機制。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['i18n:register'],
            envs: ['命名空間隔離', 'DOM 熱切換同步'],
            apiVersion: 'API v1'
        },
        overview: [
            '宣告 `i18n:register` 權限時注入此介面；未宣告時為 `undefined`。',
            '所有翻譯鍵自動綁定於 `ext.${extensionId}.` 命名空間下，可直接搭配選單項目與設定面板的 `labelKey` 欄位達成語言即時熱更新。'
        ],
        tables: [
            {
                title: 'ctx.i18n 方法清單',
                columns: ['方法', '所需權限', '說明'],
                rows: [
                    ['`registerTranslations(localeMap)`', '`i18n:register`', '註冊各語系翻譯字典至擴充命名空間'],
                    ['`t(key, params)`', '`i18n:register`', '查詢當前語系的擴充翻譯字串']
                ]
            }
        ],
        summary: {
            namespace: 'ctx.i18n',
            permission: 'i18n:register',
            constant: 'EXTENSION_PERMISSIONS.I18N_REGISTER',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.i18n.registerTranslations', 'ctx.i18n.t', 'ctx.ui.registerMenuItem']
    },
    {
        id: 'ctx.i18n.registerTranslations',
        category: 'api',
        groupId: 'group-ctx-i18n',
        stability: 'stable',
        title: '註冊擴充多語系詞典',
        codeTitle: 'ctx.i18n.registerTranslations()',
        sidebarLabel: 'registerTranslations()',
        sidebarMono: true,
        badge: '註冊',
        subtitle: '為不同語言代碼註冊擴充專屬翻譯條目，擴充停用時自動卸載。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['i18n:register'],
            envs: ['支援語系 zh-TW, zh-CN, en, ja, ko'],
            apiVersion: 'API v1'
        },
        overview: [
            '系統會自動將傳入字典內的鍵名掛載於 `ext.${extensionId}` 之下，防止覆蓋核心應用程式既有文案。'
        ],
        syntax: `const unregister = ctx.i18n.registerTranslations(localeMap)`,
        parameters: [
            {
                name: 'localeMap',
                type: 'Object',
                required: true,
                description: '以語系代碼為鍵、詞條物件為值的映射字典，支援 `zh-TW`、`zh-CN`、`en`、`ja`、`ko`。'
            }
        ],
        returns: {
            type: 'Function',
            description: '取消註冊函式。停用擴充時系統亦會自動卸載所有已註冊詞條。'
        },
        examples: [
            {
                label: '註冊雙語詞典並於設定面板使用',
                code: `ctx.i18n.registerTranslations({
    'zh-TW': {
        menuTitle: '顯示時間標尺',
        countMsg: '共找到 {count} 個音符'
    },
    'en': {
        menuTitle: 'Show Time Ruler',
        countMsg: 'Found {count} notes'
    }
});`
            }
        ],
        summary: {
            namespace: 'ctx.i18n',
            permission: 'i18n:register',
            constant: 'EXTENSION_PERMISSIONS.I18N_REGISTER',
            async: '同步註冊',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.i18n.t', 'ctx.ui.registerMenuItem']
    },
    {
        id: 'ctx.i18n.t',
        category: 'api',
        groupId: 'group-ctx-i18n',
        stability: 'stable',
        title: '查詢擴充翻譯字串',
        codeTitle: 'ctx.i18n.t()',
        sidebarLabel: 't()',
        sidebarMono: true,
        badge: '方法',
        subtitle: '依據使用者目前選定的介面語言取得翻譯結果並支援參數插值替換。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['i18n:register'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '傳入本地翻譯鍵名後，系統自動解析為 `ext.${extensionId}.${key}` 並代入參數。若找不到對應翻譯，則回傳完整鍵名路徑。'
        ],
        syntax: `ctx.i18n.t(key, params = {})`,
        parameters: [
            { name: 'key', type: 'string', required: true, description: '本地翻譯鍵名，無需自行加上擴充前綴。' },
            { name: 'params', type: 'Object', required: false, defaultValue: '{}', description: '內嵌 `{變數名}` 佔位符替換字典。' }
        ],
        returns: {
            type: 'string',
            description: '當前語系的翻譯結果文字，找不到時回傳完整鍵名。'
        },
        examples: [
            {
                label: '使用插值參數顯示翻譯通知',
                code: `const msg = ctx.i18n.t('countMsg', { count: 128 });
ctx.ui.toast({ content: msg, type: 'info' });`
            }
        ],
        summary: {
            namespace: 'ctx.i18n',
            permission: 'i18n:register',
            constant: 'EXTENSION_PERMISSIONS.I18N_REGISTER',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.i18n.registerTranslations', 'ctx.ui.toast']
    },

    /* ======================================================================
       十三、ctx.settings 原生設定介面
       ====================================================================== */
    {
        id: 'ctx.settings',
        category: 'api',
        groupId: 'group-ctx-settings',
        stability: 'stable',
        title: '原生設定介面',
        codeTitle: 'ctx.settings',
        sidebarLabel: '總覽',
        sidebarMono: false,
        badge: '命名空間',
        subtitle: '以非破壞性堆疊方式讀取或層疊覆寫主編輯器與渲染器的原生設定項目。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['settings:read', 'settings:override'],
            envs: ['記憶體層疊堆疊', '停用自動還原', '不汙染持久化基準值'],
            apiVersion: 'API v1'
        },
        overview: [
            '宣告 `settings:read` 或 `settings:override` 權限時注入此介面；未宣告時為 `undefined`。',
            '外掛進行的所有設定覆寫僅於執行期記憶體中層疊生效，絕對不會寫入使用者儲存於本機的持久化基準設定。'
        ],
        notes: [
            '執行期層疊堆疊：多個外掛覆寫同一設定項時依啟用順序堆疊，後啟用者優先；上層外掛釋放或停用時自動回退至次層覆寫或原始基準值。',
            '持久化隔離保護：使用者於原生設定彈窗儲存設定時，系統會自動濾除所有外掛覆寫，僅保存純淨的使用者基準設定。',
            '即時連動與重繪：覆寫生效或還原時會自動發布 `settings:changed` 事件且酬載附帶 `isExtensionOverride: true`，並觸發畫布重繪。',
            '原型鏈安全檢查：嚴格禁止傳入包含 `__proto__`、`constructor` 或 `prototype` 之設定路徑。'
        ],
        tables: [
            {
                title: 'ctx.settings 方法清單',
                columns: ['方法', '所需權限', '說明'],
                rows: [
                    ['`get(key, defaultValue)`', '`settings:read` 或 `settings:override`', '讀取指定路徑設定的深層凍結唯讀值'],
                    ['`getAll()`', '`settings:read` 或 `settings:override`', '讀取應用程式完整設定的深層凍結快照'],
                    ['`override(key, value)`', '`settings:override`', '層疊覆寫單一設定鍵並回傳撤銷函式'],
                    ['`overrideMany(entries)`', '`settings:override`', '批次層疊覆寫多項設定，失敗時原子性回復'],
                    ['`clearOverrides()`', '`settings:override`', '一次撤銷本擴充註冊的所有設定覆寫']
                ]
            }
        ],
        summary: {
            namespace: 'ctx.settings',
            permission: 'settings:read / settings:override',
            constant: 'EXTENSION_PERMISSIONS.SETTINGS_*',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.settings.get', 'ctx.settings.getAll', 'ctx.settings.override', 'ctx.settings.overrideMany', 'ctx.settings.clearOverrides']
    },
    {
        id: 'ctx.settings.get',
        category: 'api',
        groupId: 'group-ctx-settings',
        stability: 'stable',
        title: '讀取單一原生設定項目',
        codeTitle: 'ctx.settings.get()',
        sidebarLabel: 'get()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '讀取指定設定路徑的目前生效數值，若為物件則回傳深層凍結唯讀複本。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['settings:read', 'settings:override'],
            envs: ['深層複製與凍結保護'],
            apiVersion: 'API v1'
        },
        overview: [
            '支援以小數點分隔的多層屬性路徑，例如 `noteSpeed` 或 `skin.note`。若路徑不存在或鍵名無效，則回傳 `defaultValue`。'
        ],
        syntax: `ctx.settings.get(key, defaultValue = undefined)`,
        parameters: [
            { name: 'key', type: 'string', required: true, description: '設定路徑鍵名，支援點號分隔巢狀路徑。' },
            { name: 'defaultValue', type: 'any', required: false, defaultValue: 'undefined', description: '當路徑不存在時回傳的預設值。' }
        ],
        returns: {
            type: 'any',
            description: '經深層複製與 `Object.freeze` 凍結後的設定值，或 `defaultValue`。'
        },
        examples: [
            {
                label: '讀取音符流速設定',
                code: `const speed = ctx.settings.get('noteSpeed', 6.5);`
            }
        ],
        summary: {
            namespace: 'ctx.settings',
            permission: 'settings:read 或 settings:override',
            constant: 'EXTENSION_PERMISSIONS.SETTINGS_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.settings.getAll', 'ctx.settings.override']
    },
    {
        id: 'ctx.settings.getAll',
        category: 'api',
        groupId: 'group-ctx-settings',
        stability: 'stable',
        title: '取得完整原生設定快照',
        codeTitle: 'ctx.settings.getAll()',
        sidebarLabel: 'getAll()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '取得當前應用程式所有生效設定的深層凍結唯讀快照物件。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['settings:read', 'settings:override'],
            envs: ['深層複製與凍結保護'],
            apiVersion: 'API v1'
        },
        overview: [
            '用於一次檢視包含外觀、音訊音量、判定與預覽等在內的所有原生設定值。回傳快照經過深層凍結，無法就地修改。'
        ],
        syntax: `ctx.settings.getAll()`,
        returns: {
            type: 'Object',
            description: '完整應用程式設定的深層凍結唯讀快照。'
        },
        examples: [
            {
                label: '讀取完整設定快照',
                code: `const allSettings = ctx.settings.getAll();
console.log(allSettings);`
            }
        ],
        summary: {
            namespace: 'ctx.settings',
            permission: 'settings:read 或 settings:override',
            constant: 'EXTENSION_PERMISSIONS.SETTINGS_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.settings.get', 'events-list']
    },
    {
        id: 'ctx.settings.override',
        category: 'api',
        groupId: 'group-ctx-settings',
        stability: 'stable',
        title: '層疊覆寫單一原生設定',
        codeTitle: 'ctx.settings.override()',
        sidebarLabel: 'override()',
        sidebarMono: true,
        badge: '覆寫',
        subtitle: '於記憶體覆寫堆疊推入指定設定鍵的暫時覆寫值，並即時重繪畫面。',
        status: {
            variant: 'perm',
            label: '需要覆寫權限',
            permissions: ['settings:override'],
            envs: ['不汙染磁碟設定', '停用自動復原'],
            apiVersion: 'API v1'
        },
        overview: [
            '將覆寫條目推入目標設定鍵的堆疊頂端，即時更新運作設定、發布 `settings:changed` 事件並觸發 `appContext.draw()` 重繪。',
            '內部會對傳入數值進行深層複製，並攔截包含 `__proto__`、`constructor`、`prototype` 的不安全路徑。'
        ],
        syntax: `const revert = ctx.settings.override(key, value)`,
        parameters: [
            { name: 'key', type: 'string', required: true, description: '目標設定鍵名或小數點路徑，例如 `noteSpeed` 或 `judgeVolume`。' },
            { name: 'value', type: 'any', required: true, description: '欲覆寫的目標數值。' }
        ],
        returns: {
            type: 'Function',
            description: '清理函式。呼叫後可提前撤銷該筆覆寫並還原為前一層覆寫或原生基準值。'
        },
        examples: [
            {
                label: '暫時隱藏原生黑色外框遮罩',
                code: `const revertNoBorder = ctx.settings.override('noBorder', true);

// 需要恢復原生設定時呼叫
revertNoBorder();`
            }
        ],
        summary: {
            namespace: 'ctx.settings',
            permission: 'settings:override',
            constant: 'EXTENSION_PERMISSIONS.SETTINGS_OVERRIDE',
            async: '同步覆寫與重繪',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.settings.overrideMany', 'ctx.settings.clearOverrides', 'ctx.settings.get']
    },
    {
        id: 'ctx.settings.overrideMany',
        category: 'api',
        groupId: 'group-ctx-settings',
        stability: 'stable',
        title: '批次層疊覆寫多項設定',
        codeTitle: 'ctx.settings.overrideMany()',
        sidebarLabel: 'overrideMany()',
        sidebarMono: true,
        badge: '覆寫',
        subtitle: '一次套用多組原生設定鍵值覆寫，具備失敗時自動全部回復的原子性保護。',
        status: {
            variant: 'perm',
            label: '需要覆寫權限',
            permissions: ['settings:override'],
            envs: ['原子性回復保證', '停用自動復原'],
            apiVersion: 'API v1'
        },
        overview: [
            '接受包含多個設定路徑與數值的鍵值物件，依序驗證並套用覆寫。若中途發生路徑錯誤，系統會自動回復本次呼叫已套用的所有項目。'
        ],
        syntax: `const revertAll = ctx.settings.overrideMany(entries)`,
        parameters: [
            { name: 'entries', type: 'Object', required: true, description: '包含複數設定路徑與目標數值的鍵值對物件。' }
        ],
        returns: {
            type: 'Function',
            description: '清理函式。呼叫後可一次撤銷本次批次套用的所有設定覆寫。'
        },
        examples: [
            {
                label: '批次切換簡潔預覽模式設定',
                code: `const revertPreset = ctx.settings.overrideMany({
    noteSpeed: 7.5,
    touchEffect: false
});`
            }
        ],
        summary: {
            namespace: 'ctx.settings',
            permission: 'settings:override',
            constant: 'EXTENSION_PERMISSIONS.SETTINGS_OVERRIDE',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.settings.override', 'ctx.settings.clearOverrides']
    },
    {
        id: 'ctx.settings.clearOverrides',
        category: 'api',
        groupId: 'group-ctx-settings',
        stability: 'stable',
        title: '清除所有設定覆寫',
        codeTitle: 'ctx.settings.clearOverrides()',
        sidebarLabel: 'clearOverrides()',
        sidebarMono: true,
        badge: '覆寫',
        subtitle: '立即撤銷當前擴充程式註冊的所有原生設定覆寫並重繪畫布。',
        status: {
            variant: 'perm',
            label: '需要覆寫權限',
            permissions: ['settings:override'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '將此擴充建立的全部設定覆寫條目從堆疊中移除，還原受影響的設定至次層覆寫或原始基準值。'
        ],
        syntax: `ctx.settings.clearOverrides()`,
        returns: {
            type: 'undefined',
            description: '無回傳值。'
        },
        examples: [
            {
                label: '於特定模式結束時一次恢復原生設定',
                code: `ctx.settings.clearOverrides();`
            }
        ],
        summary: {
            namespace: 'ctx.settings',
            permission: 'settings:override',
            constant: 'EXTENSION_PERMISSIONS.SETTINGS_OVERRIDE',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.settings.override', 'ctx.settings.overrideMany']
    },

    /* ======================================================================
       十四、ctx.assets 素材覆寫介面
       ====================================================================== */
    {
        id: 'ctx.assets',
        category: 'api',
        groupId: 'group-ctx-assets',
        stability: 'stable',
        title: '素材覆寫介面',
        codeTitle: 'ctx.assets',
        sidebarLabel: '總覽',
        sidebarMono: false,
        badge: '命名空間',
        subtitle: '查詢與非破壞性動態置換遊戲內的圖片貼圖資源以及打擊判定音效緩衝。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['assets:read', 'assets:override'],
            envs: ['Skin 切換自動重套用', '支援影片錄製渲染', '停用自動還原'],
            apiVersion: 'API v1'
        },
        overview: [
            '宣告 `assets:read` 或 `assets:override` 權限時注入此介面；未宣告時為 `undefined`。',
            '覆寫後的圖片材質與音效緩衝會直接同步至主畫布渲染器、視覺化編輯器、預覽畫布與音訊管理器，於譜面影片錄製與離線匯出期間亦能完整生效。'
        ],
        notes: [
            '支援豐富來源格式：圖片支援 `HTMLImageElement`、`HTMLCanvasElement`、`ImageBitmap`、`Blob`、圖片網址或 Base64 字串；音效支援 `AudioBuffer`、`ArrayBuffer`、`ArrayBufferView`、`Blob`、音訊網址或 Data URL 字串。',
            '切換外觀自動重套用：當使用者在設定中切換 Skin 重新載入整套原生素材時，系統會更新底層基準並自動重新套用已啟用的外掛圖片覆寫。',
            '自動清理資源：擴充停用時系統自動還原原始素材、釋放系統建立的二進位物件網址，並取消尚未完成的非同步載入或解碼作業。'
        ],
        tables: [
            {
                title: 'ctx.assets 方法清單',
                columns: ['方法', '所需權限', '說明'],
                rows: [
                    ['`listImageKeys()`', '`assets:read` 或 `assets:override`', '取得系統目前載入的圖片貼圖鍵名陣列'],
                    ['`listSoundKeys()`', '`assets:read` 或 `assets:override`', '取得音訊管理器註冊的打擊音效鍵名陣列'],
                    ['`overrideImage(key, source)`', '`assets:override`', '非同步解析並層疊覆寫單一圖片素材'],
                    ['`overrideImages(entries)`', '`assets:override`', '非同步批次覆寫多組圖片素材'],
                    ['`overrideSound(key, source)`', '`assets:override`', '非同步解碼並層疊覆寫單一音效緩衝'],
                    ['`overrideSounds(entries)`', '`assets:override`', '非同步批次解碼覆寫多組音效素材'],
                    ['`clearOverrides()`', '`assets:override`', '一次撤銷所有圖片與音效素材覆寫']
                ]
            }
        ],
        summary: {
            namespace: 'ctx.assets',
            permission: 'assets:read / assets:override',
            constant: 'EXTENSION_PERMISSIONS.ASSETS_*',
            async: '包含非同步載入與解碼',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.assets.listImageKeys', 'ctx.assets.listSoundKeys', 'ctx.assets.overrideImage', 'ctx.assets.overrideSound']
    },
    {
        id: 'ctx.assets.listImageKeys',
        category: 'api',
        groupId: 'group-ctx-assets',
        stability: 'stable',
        title: '列出可用圖片素材鍵名',
        codeTitle: 'ctx.assets.listImageKeys()',
        sidebarLabel: 'listImageKeys()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '取得目前圖片資源字典內所有可供覆寫的貼圖鍵名清單。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['assets:read', 'assets:override'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '列出各類音符外觀、點擊特效、判定字樣與按鍵圖樣等系統圖片素材鍵名。'
        ],
        syntax: `ctx.assets.listImageKeys()`,
        returns: {
            type: 'Array<string>',
            description: '系統圖片素材鍵名組成的字串陣列。'
        },
        examples: [
            {
                label: '查詢所有可用貼圖鍵名',
                code: `const imageKeys = ctx.assets.listImageKeys();
console.log('貼圖清單:', imageKeys);`
            }
        ],
        summary: {
            namespace: 'ctx.assets',
            permission: 'assets:read 或 assets:override',
            constant: 'EXTENSION_PERMISSIONS.ASSETS_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.assets.overrideImage', 'ctx.assets.listSoundKeys']
    },
    {
        id: 'ctx.assets.listSoundKeys',
        category: 'api',
        groupId: 'group-ctx-assets',
        stability: 'stable',
        title: '列出可用音效素材鍵名',
        codeTitle: 'ctx.assets.listSoundKeys()',
        sidebarLabel: 'listSoundKeys()',
        sidebarMono: true,
        badge: '唯讀',
        subtitle: '取得目前音訊管理器中註冊的所有打擊與判定音效鍵名清單。',
        status: {
            variant: 'perm',
            label: '需要權限',
            permissions: ['assets:read', 'assets:override'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '列出包含 tap、each、break、slide、judge 等在內的系統打擊音效鍵名，便於覆寫前確認目標鍵。'
        ],
        syntax: `ctx.assets.listSoundKeys()`,
        returns: {
            type: 'Array<string>',
            description: '系統音效素材鍵名組成的字串陣列。'
        },
        examples: [
            {
                label: '查詢所有可用打擊音效鍵名',
                code: `const soundKeys = ctx.assets.listSoundKeys();
console.log('音效清單:', soundKeys);`
            }
        ],
        summary: {
            namespace: 'ctx.assets',
            permission: 'assets:read 或 assets:override',
            constant: 'EXTENSION_PERMISSIONS.ASSETS_READ',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.assets.overrideSound', 'ctx.assets.listImageKeys']
    },
    {
        id: 'ctx.assets.overrideImage',
        category: 'api',
        groupId: 'group-ctx-assets',
        stability: 'stable',
        title: '覆寫單一圖片貼圖素材',
        codeTitle: 'ctx.assets.overrideImage()',
        sidebarLabel: 'overrideImage()',
        sidebarMono: true,
        badge: '非同步',
        subtitle: '非同步載入並將自訂圖片推入貼圖覆寫堆疊，立即同步至所有畫布渲染器。',
        status: {
            variant: 'perm',
            label: '需要覆寫權限',
            permissions: ['assets:override'],
            envs: ['支援多格式來源', 'Skin 切換自動重套用'],
            apiVersion: 'API v1'
        },
        overview: [
            '非同步將傳入來源解析為已載入的 `HTMLImageElement`，推入該鍵名覆寫堆疊頂端，並自動同步至主畫布渲染器、視覺化編輯器與預覽畫布後觸發重繪。'
        ],
        syntax: `const revert = await ctx.assets.overrideImage(key, source)`,
        parameters: [
            { name: 'key', type: 'string', required: true, description: '欲覆寫的圖片素材鍵名，可由 `listImageKeys()` 查詢。' },
            { name: 'source', type: 'HTMLImageElement | HTMLCanvasElement | ImageBitmap | Blob | string', required: true, description: '圖片來源物件、Blob 或圖片網址與 Base64 字串。' }
        ],
        returns: {
            type: 'Promise<Function>',
            description: '解析為清理函式的 Promise。呼叫清理函式可撤銷該筆覆寫、釋放暫存物件網址並還原上一層貼圖。'
        },
        examples: [
            {
                label: '使用自訂 Canvas 畫布動態繪製並覆寫音符貼圖',
                code: `const canvas = document.createElement('canvas');
canvas.width = 128;
canvas.height = 128;
const g = canvas.getContext('2d');
g.strokeStyle = '#38bdf8';
g.lineWidth = 14;
g.beginPath();
g.arc(64, 64, 48, 0, Math.PI * 2);
g.stroke();

const revert = await ctx.assets.overrideImage('tap', canvas);`
            }
        ],
        summary: {
            namespace: 'ctx.assets',
            permission: 'assets:override',
            constant: 'EXTENSION_PERMISSIONS.ASSETS_OVERRIDE',
            async: '非同步回傳 Promise',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.assets.overrideImages', 'ctx.assets.listImageKeys', 'ctx.assets.clearOverrides']
    },
    {
        id: 'ctx.assets.overrideImages',
        category: 'api',
        groupId: 'group-ctx-assets',
        stability: 'stable',
        title: '批次覆寫多組圖片素材',
        codeTitle: 'ctx.assets.overrideImages()',
        sidebarLabel: 'overrideImages()',
        sidebarMono: true,
        badge: '非同步',
        subtitle: '非同步批次載入並替換多張圖片貼圖，具備任一失敗時自動回復機制。',
        status: {
            variant: 'perm',
            label: '需要覆寫權限',
            permissions: ['assets:override'],
            envs: ['批次交易保護'],
            apiVersion: 'API v1'
        },
        overview: [
            '同時解析並覆寫多組圖片貼圖，完成後統一更新渲染器與觸發重繪。若其中任一素材載入或解析失敗，會自動回復本次呼叫已套用的項目。'
        ],
        syntax: `const revertAll = await ctx.assets.overrideImages(entries)`,
        parameters: [
            { name: 'entries', type: 'Object', required: true, description: '鍵名為圖片素材鍵名、值為對應圖片來源的映射物件。' }
        ],
        returns: {
            type: 'Promise<Function>',
            description: '解析為批次清理函式的 Promise，呼叫後可一次還原本次所有圖片覆寫。'
        },
        examples: [
            {
                label: '同時替換多項自訂貼圖',
                code: `const revertTheme = await ctx.assets.overrideImages({
    tap: customTapCanvas,
    each: customEachCanvas
});`
            }
        ],
        summary: {
            namespace: 'ctx.assets',
            permission: 'assets:override',
            constant: 'EXTENSION_PERMISSIONS.ASSETS_OVERRIDE',
            async: '非同步回傳 Promise',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.assets.overrideImage', 'ctx.assets.clearOverrides']
    },
    {
        id: 'ctx.assets.overrideSound',
        category: 'api',
        groupId: 'group-ctx-assets',
        stability: 'stable',
        title: '覆寫單一打擊音效素材',
        codeTitle: 'ctx.assets.overrideSound()',
        sidebarLabel: 'overrideSound()',
        sidebarMono: true,
        badge: '非同步',
        subtitle: '非同步解碼音訊來源為 AudioBuffer 並層疊替換指定打擊音效。',
        status: {
            variant: 'perm',
            label: '需要覆寫權限',
            permissions: ['assets:override'],
            envs: ['ID3 標籤自動濾除', '支援影片錄製混音'],
            apiVersion: 'API v1'
        },
        overview: [
            '系統會自動濾除音訊檔內嵌的 ID3 標籤並透過 Web Audio 上下文解碼為 `AudioBuffer`，推入音效覆寫堆疊並同步更新 `AudioManager` 緩衝映射表。'
        ],
        syntax: `const revert = await ctx.assets.overrideSound(key, source)`,
        parameters: [
            { name: 'key', type: 'string', required: true, description: '欲覆寫的音效素材鍵名，可由 `listSoundKeys()` 查詢。' },
            { name: 'source', type: 'AudioBuffer | ArrayBuffer | ArrayBufferView | Blob | string', required: true, description: '音訊緩衝、二進位資料、Blob 或音訊檔案網址與 Data URL 字串。' }
        ],
        returns: {
            type: 'Promise<Function>',
            description: '解析為清理函式的 Promise。呼叫清理函式可撤銷該筆音效覆寫並還原上一層音效或原始音效。'
        },
        examples: [
            {
                label: '以使用者的 Blob 音訊檔案覆寫 Break 音效',
                code: `const revertSound = await ctx.assets.overrideSound('break', audioFileBlob);`
            }
        ],
        summary: {
            namespace: 'ctx.assets',
            permission: 'assets:override',
            constant: 'EXTENSION_PERMISSIONS.ASSETS_OVERRIDE',
            async: '非同步回傳 Promise',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.assets.overrideSounds', 'ctx.assets.listSoundKeys', 'arch-renderer-audio']
    },
    {
        id: 'ctx.assets.overrideSounds',
        category: 'api',
        groupId: 'group-ctx-assets',
        stability: 'stable',
        title: '批次覆寫多組打擊音效',
        codeTitle: 'ctx.assets.overrideSounds()',
        sidebarLabel: 'overrideSounds()',
        sidebarMono: true,
        badge: '非同步',
        subtitle: '非同步批次解碼並替換多組音訊緩衝，具備失敗自動回復保護。',
        status: {
            variant: 'perm',
            label: '需要覆寫權限',
            permissions: ['assets:override'],
            envs: ['批次交易保護'],
            apiVersion: 'API v1'
        },
        overview: [
            '同時解碼並覆寫多個音效鍵的音訊緩衝。若其中任一音訊解碼失敗，系統自動還原本次呼叫已套用的項目。'
        ],
        syntax: `const revertAll = await ctx.assets.overrideSounds(entries)`,
        parameters: [
            { name: 'entries', type: 'Object', required: true, description: '鍵名為音效素材鍵名、值為對應音訊來源的映射物件。' }
        ],
        returns: {
            type: 'Promise<Function>',
            description: '解析為批次清理函式的 Promise。'
        },
        examples: [
            {
                label: '同時替換多項判定音效',
                code: `const revertPack = await ctx.assets.overrideSounds({
    tap: tapBuffer,
    break: breakBuffer
});`
            }
        ],
        summary: {
            namespace: 'ctx.assets',
            permission: 'assets:override',
            constant: 'EXTENSION_PERMISSIONS.ASSETS_OVERRIDE',
            async: '非同步回傳 Promise',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.assets.overrideSound', 'ctx.assets.clearOverrides']
    },
    {
        id: 'ctx.assets.clearOverrides',
        category: 'api',
        groupId: 'group-ctx-assets',
        stability: 'stable',
        title: '清除所有素材覆寫',
        codeTitle: 'ctx.assets.clearOverrides()',
        sidebarLabel: 'clearOverrides()',
        sidebarMono: true,
        badge: '覆寫',
        subtitle: '立即撤銷當前擴充建立的全部圖片貼圖與打擊音效覆寫，並釋放暫存物件網址。',
        status: {
            variant: 'perm',
            label: '需要覆寫權限',
            permissions: ['assets:override'],
            envs: ['Trusted 模式'],
            apiVersion: 'API v1'
        },
        overview: [
            '一次還原所有受影響的圖片與音效資源至前一層覆寫或系統原始素材，並同步更新主畫布、視覺化編輯器與預覽畫布。'
        ],
        syntax: `ctx.assets.clearOverrides()`,
        returns: {
            type: 'undefined',
            description: '無回傳值。'
        },
        examples: [
            {
                label: '卸載自訂音效與皮膚資源包',
                code: `ctx.assets.clearOverrides();`
            }
        ],
        summary: {
            namespace: 'ctx.assets',
            permission: 'assets:override',
            constant: 'EXTENSION_PERMISSIONS.ASSETS_OVERRIDE',
            async: '同步',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.assets.overrideImage', 'ctx.assets.overrideSound']
    },

    /* ======================================================================
       十五、事件與設定面板
       ====================================================================== */
    {
        id: 'guide-lifecycle-events',
        category: 'events-schema',
        groupId: 'group-events-schema',
       stability: 'stable',
        title: '生命週期與事件總表',
        codeTitle: 'Lifecycle & Events',
        sidebarLabel: '生命週期與事件總表',
        sidebarMono: false,
        subtitle: '完整說明擴充程式載入、註冊、啟用、停用與卸載的執行順序，以及系統可訂閱事件的觸發時機與參數規格。',
        status: {
            variant: 'perm',
            label: '生命週期與事件',
            permissions: ['events:subscribe'],
            envs: ['自動資源回收', '9 項白名單事件', '安全模式支援'],
            apiVersion: 'API v1'
        },
        overview: [
            'Web mai Chart X 由 `extensionLoader.js` 負責套件封裝解析與持久化，並由 `extensionManager.js` 負責狀態機、權限上下文建構與資源回收。',
            '所有透過官方 `ctx` 介面建立的訂閱與註冊項都會登錄於該次啟用世代的 `disposables` 清單；當插件停用、更新重載或遭遇初始化例外時，系統會逆序自動回收資源。'
        ],
        tables: [
            {
                title: '擴充程式載入、啟用與卸載順序',
                columns: ['階段', '執行動作與狀態轉換', '說明與對應系統行為'],
                rows: [
                    ['1. 啟動安全檢查', '讀取 `wmcx_ext_activating` 與 `?safeMode` 參數', '若上次啟動期間發生未攔截崩潰導致重載，自動將該插件標記停用；網址含 `?safeMode=1` 或 `true` 時僅載入登錄而不自動啟用'],
                    ['2. 解析與驗證', '`parseExtensionZip()` → `validateExtensionManifest()`', '檢查 `.zip` 結構、`manifest.json` 欄位格式、19 項權限白名單與 `https://` 連結'],
                    ['3. 匯入與註冊', '產生 `blob:` 網址 → 動態 `import()` → `extensionManager.register()`', '識別 `default` 或 `activate` 工廠函式；狀態設為 `registered` 或 `inactive`，發布內部事件 `extension:registered`'],
                    ['4. 建構與啟用', '`extensionManager.activate()` → `_createScopedContext()` → `factory(ctx)`', '先檢查 `runtime === "worker"`，若為 worker 直接標記 `error` 並停止；否則遞增 `activationGen`、凍結組裝 `ctx`、呼叫 `activate(ctx)` 並收集回傳的清理函式或 `dispose()` 物件，發布 `extension:activated`'],
                    ['5. 停用與回收', '`extensionManager.deactivate()` → `_runDisposables()`', '先關閉設定彈窗，再由後往前執行 `disposables` 清單並呼叫 `clearAllOverrides()` 還原設定與素材覆寫，狀態改為 `inactive`，發布 `extension:deactivated`'],
                    ['6. 移除與卸載', '`extensionManager.unregister()` → `uninstallExtension()`', '若仍處於 `active` 則先觸發停用流程，自執行期清單刪除紀錄，並清除 IndexedDB 套件與 `localStorage` 設定及隔離資料']
                ]
            },
            {
                title: '系統白名單事件觸發時機與參數總表',
                columns: ['事件名稱', '觸發時機', '酬載型別與參數欄位'],
                rows: [
                    ['`app:ready`', '主程式初始化與擴充選單掛載完成後觸發一次', '無參數'],
                    ['`project:loaded`', '建立新專案、切換專案或匯入譜面資料完成後觸發', '無參數'],
                    ['`maidata:changed`', '譜面原始標頭或文字內容發生實質變更後觸發', '`maidata` 譜面資料物件'],
                    ['`chart:decoded`', '譜面完成解碼或重新解析，例如切換難度或編輯音符後', '`{ difficulty, noteCount }`，含難度索引與已解析音符總數'],
                    ['`view:mode-changed`', '切換全螢幕、隱藏編輯器、直橫版面或輔助文字顯示時', '`{ isEditorHidden, isFullscreen, isVerticalMode, showAuxiliaryText }`'],
                    ['`playback:state-changed`', '播放引擎切換播放與暫停狀態時', '`{ isPlaying }` 布林值物件'],
                    ['`playback:seek`', '使用者拖曳進度條或程式跳轉時間軸位置時', '`{ time }`，代表跳轉目標秒數'],
                    ['`canvas:redraw`', '畫布完成一次重繪請求或主動呼叫 `ctx.render.requestRedraw()`', '無參數'],
                    ['`settings:changed`', '使用者調整原生設定，或擴充透過 `ctx.settings` 變更覆寫時', '`{ key, value, oldVal, allSettings, isExtensionOverride }`']
                ]
            }
        ],
        callouts: [
            {
                variant: 'info',
                title: '事件退訂與自行建立資源的清理邊界',
                items: [
                    '透過 `ctx.events.on` 與 `ctx.editor.on` 建立的監聽器會自動註冊至 `disposables`，插件停用時即自動退訂。',
                    '若插件自行建立 `setInterval`、`setTimeout`、DOM 全域監聽或外部連線，必須於 `activate(ctx)` 回傳清理函式 `() => { ... }` 或 `{ dispose() { ... } }` 手動清除。'
                ]
            }
        ],
        examples: [
            {
                label: '完整生命週期、事件訂閱與清理寫法',
                code: `export default function activate(ctx) {
    const cleanups = [];

    if (ctx.hasPermission('events:subscribe')) {
        cleanups.push(ctx.events.on('chart:decoded', ({ difficulty, noteCount }) => {
            console.log('譜面解碼完成:', difficulty, noteCount);
        }));
        cleanups.push(ctx.events.on('playback:state-changed', ({ isPlaying }) => {
            console.log('播放狀態變更:', isPlaying);
        }));
    }

    const onWindowResize = () => {
        if (ctx.hasPermission('render:overlay')) {
            ctx.render.requestRedraw();
        }
    };
    window.addEventListener('resize', onWindowResize);
    cleanups.push(() => window.removeEventListener('resize', onWindowResize));

    return () => {
        while (cleanups.length > 0) {
            const dispose = cleanups.pop();
            dispose();
        }
    };
}`
            }
        ],
        notes: [
            '若 `activate(ctx)` 回傳 Promise 且在等待解析期間插件已被停用，系統會在 Promise 解析後檢查 `activationGen`，立即執行其回傳的清理函式以避免資源洩漏。',
            '非同步 `activate(ctx)` 若在執行途中拋出例外，系統會自動關閉設定面板、執行已登錄的 `disposables` 並將狀態切換為 `error`。',
            '編輯器輸入、按鍵與選取區事件不屬於全域 `ctx.events`，須透過 `ctx.editor.on` 訂閱，並宣告 `editor:read` 權限。'
        ],
        summary: {
            namespace: 'Lifecycle & Events',
            permission: '依訂閱介面宣告 events:subscribe',
            constant: 'SUBSCRIBABLE_EVENTS',
            async: '支援同步與非同步啟用及逆序回收',
            runtime: 'Trusted 主執行緒模式',
            since: 'API v1'
        },
        seeAlso: ['guide-lifecycle', 'events-list', 'ctx.events.on', 'ctx.editor.on', 'guide-minimal-plugin']
    },
    {
        id: 'events-list',
        category: 'events-schema',
        groupId: 'group-events-schema',
       stability: 'stable',
        title: '可訂閱事件白名單',
        codeTitle: 'SUBSCRIBABLE_EVENTS',
        sidebarLabel: '可訂閱事件清單',
        sidebarMono: false,
        subtitle: '透過 ctx.events.on 訂閱系統事件匯流排的 9 項白名單事件名稱、觸發時機與酬載結構。',
        status: {
            variant: 'perm',
            label: '需要事件權限',
            permissions: ['events:subscribe'],
            envs: ['白名單保護', '自動退訂機制'],
            apiVersion: 'API v1'
        },
        overview: [
            '宣告 `events:subscribe` 權限後，擴充程式可訂閱下方列出的 9 項白名單事件。嘗試訂閱不在清單內的內部事件名稱時將被安全略過，並於主控台輸出警告。'
        ],
        tables: [
            {
                title: '系統白名單事件與酬載規格',
                columns: ['事件名稱', '觸發時機', '回呼傳入參數說明'],
                rows: [
                    ['`app:ready`', '應用程式核心模組與介面元件初始化完成', '無傳入參數'],
                    ['`project:loaded`', '建立、開啟新專案或匯入譜面資料完成', '無傳入參數'],
                    ['`maidata:changed`', '譜面資料或解析後結構發生實質變更', '傳入最新譜面資料物件'],
                    ['`chart:decoded`', '譜面完成解碼或重新解析，例如切換難度或編輯譜面', '`{ difficulty, noteCount }`，包含當前難度索引與已解析音符數量'],
                    ['`view:mode-changed`', '隱藏編輯器、全螢幕、直橫版面切換、專案載入或輔助文字設定異動', '`{ isEditorHidden, isFullscreen, isVerticalMode, showAuxiliaryText }`'],
                    ['`playback:state-changed`', '播放引擎切換播放或暫停狀態', '`{ isPlaying }` 布林狀態物件'],
                    ['`playback:seek`', '使用者或程式主動調整時間軸進度', '`{ time }`，代表目標秒數'],
                    ['`canvas:redraw`', '畫布完成一次重繪週期', '無傳入參數'],
                    ['`settings:changed`', '應用程式原生設定變更，或由擴充程式套用或解除覆寫', '`{ key, value, oldVal, allSettings, isExtensionOverride }`']
                ]
            }
        ],
        examples: [
            {
                label: '追蹤播放切換與譜面重新解碼',
                code: `ctx.events.on('playback:state-changed', ({ isPlaying }) => {
    console.log(isPlaying ? '開始播放' : '已暫停');
});

ctx.events.on('chart:decoded', ({ difficulty, noteCount }) => {
    console.log('難度:', difficulty, '音符數:', noteCount);
});`
            }
        ],
        summary: {
            namespace: 'ctx.events',
            permission: 'events:subscribe',
            constant: 'EXTENSION_PERMISSIONS.EVENTS_SUBSCRIBE',
            async: '事件驅動',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.events.on', 'ctx.playback.getState', 'ctx.settings.override']
    },
    {
        id: 'settings-schema',
        category: 'events-schema',
        groupId: 'group-events-schema',
        stability: 'stable',
        title: '原生設定面板與綱要格式',
        codeTitle: 'SETTINGS_SCHEMA',
        sidebarLabel: '設定面板與 Schema',
        sidebarMono: false,
        subtitle: '使用宣告式欄位綱要自動生成系統彈窗表單，並享有隔離持久化與一鍵重設機制。',
        status: {
            variant: 'perm',
            label: '需要面板權限',
            permissions: ['ui:popover'],
            envs: ['5 種支援欄位型別', '一鍵重設預設值'],
            apiVersion: 'API v1'
        },
        overview: [
            '設定面板透過 `ctx.ui.openPopover` 復用主程式 `popupWindow` 與 `.popup-backdrop` 模糊遮罩，支援點擊外部遮罩或按下 Escape 鍵關閉，且開啟時會自動覆蓋 `.extension-floating-widget` 避免元件交錯干擾。',
            '每位擴充程式的設定數值以 `wmcx_ext_settings_${extensionId}` 鍵名儲存於 `localStorage`，若環境無法存取則自動降級為記憶體快取。'
        ],
        tables: [
            {
                title: '支援的表單欄位型別',
                columns: ['型別值', '呈現控制項', '特有支援屬性'],
                rows: [
                    ['`boolean`', '核取方塊開關', '`default`、`label`、`labelKey`、`notice`、`noticeKey`'],
                    ['`number`', '數字微調輸入框', '`default`、`min`、`max`、`step`、`label`、`labelKey`'],
                    ['`string`', '單行文字輸入框，省略 `type` 時為預設型別', '`default`、`placeholder`、`placeholderKey`、`label`'],
                    ['`password`', '附帶顯示切換鈕的密碼輸入框，底層儲存仍為明文', '`default`、`placeholder`、`placeholderKey`、`notice`'],
                    ['`select`', '原生下拉式選單', '`default`、`options` 陣列，每項含 `value`、`label` 或 `labelKey`']
                ]
            }
        ],
        notes: [
            '面板底部預設提供「重設為預設值」按鈕，點擊後自動還原所有欄位為 `default` 並觸發 `onChange` 與同步持久化。',
            '密碼欄位的資料儲存於本機 `localStorage` 仍為純文字格式，若外掛向使用者收集第三方服務金鑰，應於 `notice` 明確說明保存方式。'
        ],
        examples: [
            {
                label: '完整五種欄位綱要定義範例',
                code: `const SETTINGS_SCHEMA = [
    {
        key: 'visible',
        type: 'boolean',
        default: true,
        label: '顯示功能面板'
    },
    {
        key: 'blurRadius',
        type: 'number',
        default: 14,
        min: 0,
        max: 40,
        step: 1,
        label: '模糊半徑'
    },
    {
        key: 'titleText',
        type: 'string',
        default: '預設標題',
        label: '自訂標題',
        placeholder: '請輸入標題文字'
    },
    {
        key: 'apiKey',
        type: 'password',
        default: '',
        label: '第三方金鑰',
        notice: '僅儲存於本機瀏覽器。'
    },
    {
        key: 'qualityMode',
        type: 'select',
        default: 'medium',
        label: '渲染畫質',
        options: [
            { value: 'high', label: '標準畫質' },
            { value: 'medium', label: '降畫質' },
            { value: 'low', label: '極速低畫質' }
        ]
    }
];`
            }
        ],
        summary: {
            namespace: 'ctx.ui',
            permission: 'ui:popover',
            constant: 'EXTENSION_PERMISSIONS.UI_POPOVER',
            async: '同步渲染與儲存',
            runtime: 'Trusted 模式',
            since: 'API v1'
        },
        seeAlso: ['ctx.ui.openPopover', 'ctx.ui.getSettings', 'ctx.ui.closePopover']
    },

    /* ======================================================================
       十六、WERP 擴充儲存庫協定
       ====================================================================== */
    {
        id: 'werp-overview',
        category: 'werp',
        groupId: 'group-werp',
        stability: 'stable',
        title: 'WERP 協定架構與安全規範',
        codeTitle: 'WERP v1.0',
        sidebarLabel: '協定架構與安全',
        sidebarMono: false,
        subtitle: 'Web mai Chart X 去中心化靜態擴充程式儲存庫協定的核心設計與傳輸安全限制。',
        status: {
            variant: 'free',
            label: '協定規格',
            permissions: ['HTTPS 強制', 'SHA-256 校驗', 'CORS 跨來源'],
            envs: ['Schema Version 1'],
            apiVersion: 'WERP v1.0'
        },
        overview: [
            'WMCX Extension Repository Protocol 簡稱 WERP，是一套用於發佈、探索、下載及更新 Web mai Chart X 擴充程式的開放式靜態儲存庫協定。',
            '任何開發者皆可透過支援 HTTPS 靜態檔案託管與 CORS 跨來源回應標頭的服務架設獨立儲存庫，無需專用後端伺服器或帳號驗證系統。'
        ],
        notes: [
            '去中心化與靜態託管：僅需提供 JSON 索引文件與 ZIP 套件，可部署於 GitHub Pages、Cloudflare Pages 等靜態託管環境。',
            '同源相對路徑限制：套件路徑 `file` 必須為相對於索引網址的 `.zip` 相對路徑，不得包含 `..` 區段迴退、反斜線、查詢參數、URL 片段或絕對網址，解析後必須為 HTTPS 且與索引網址同源。',
            '資料完整性非安全背書：下載安裝前必經 Web Cryptography 計算 SHA-256 校驗，但 SHA-256 僅能保證傳輸內容一致，不代表程式碼已通過安全審核。',
            '來源隔離保護：已安裝套件會記錄 `sourceRepoUrl` 與 `packageSha256`，檢查更新僅向原始來源查詢，禁止未經同意跨來源以相同 ID 覆蓋。'
        ],
        examples: [
            {
                label: '建議儲存庫目錄結構',
                code: `Repository/
├── index.json
└── Extensions/
    ├── bouncing-pet-1.0.0.zip
    ├── chart-brush-1.0.0.zip
    └── dvd-bounce-1.0.0.zip`
            }
        ],
        summary: {
            namespace: 'WERP v1.0',
            permission: '用戶端於管理視窗授權',
            constant: 'Scripts/core/extensionRepo.js',
            async: 'HTTPS Fetch 與非同步雜湊校驗',
            runtime: 'Schema Version 1',
            since: 'WERP v1.0'
        },
        seeAlso: ['werp-index-spec', 'werp-install-flow', 'guide-manifest']
    },
    {
        id: 'werp-index-spec',
        category: 'werp',
        groupId: 'group-werp',
        stability: 'stable',
        title: '索引 JSON 規格與錯誤碼',
        codeTitle: 'index.json',
        sidebarLabel: '索引規格與錯誤碼',
        sidebarMono: false,
        subtitle: '儲存庫根節點欄位、套件項目結構、語意化版本規範與客戶端標準錯誤碼。',
        status: {
            variant: 'free',
            label: 'Schema 規格',
            permissions: ['UTF-8 JSON', 'SemVer 2.0.0', '64 字元 SHA-256'],
            envs: ['Schema Version 1'],
            apiVersion: 'WERP v1.0'
        },
        overview: [
            '儲存庫根目錄索引必須為有效的 UTF-8 JSON 物件。客戶端遇到不支援的 `schemaVersion` 時必須立即終止解析並回報版本不相容。'
        ],
        tables: [
            {
                title: '索引根節點欄位定義',
                columns: ['欄位', '型別', '必填', '說明'],
                rows: [
                    ['`schemaVersion`', '`Integer`', '是', '索引協定版本，本版協定必須為整數 `1`'],
                    ['`name`', '`String`', '是', '儲存庫顯示名稱，必須為非空字串'],
                    ['`identifier`', '`String`', '是', '儲存庫宣告識別碼，須符合 `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`'],
                    ['`description`', '`String`', '是', '儲存庫簡介字串，可為空字串'],
                    ['`extensions`', '`Array`', '是', '可供安裝的擴充套件項目陣列']
                ]
            },
            {
                title: 'extensions 陣列項目欄位',
                columns: ['欄位', '型別', '必填', '說明'],
                rows: [
                    ['`id`', '`String`', '是', '擴充唯一識別碼，同一份索引不得重複'],
                    ['`name`', '`String`', '是', '擴充顯示名稱'],
                    ['`version`', '`String`', '是', '須符合 Semantic Versioning 2.0.0 格式'],
                    ['`description`', '`String`', '是', '擴充功能說明'],
                    ['`file`', '`String`', '是', '相對索引網址的 `.zip` 套件路徑'],
                    ['`sha256`', '`String`', '是', '套件原始位元組的 64 字元十六進位 SHA-256 雜湊值']
                ]
            },
            {
                title: '客戶端標準錯誤碼',
                columns: ['錯誤碼', '說明'],
                rows: [
                    ['`REGISTRY_FETCH_FAILED`', '無法取得遠端索引檔案'],
                    ['`REGISTRY_INVALID_JSON`', '索引 JSON 解析失敗'],
                    ['`REGISTRY_UNSUPPORTED_VERSION`', '不支援的協定 Schema Version'],
                    ['`REGISTRY_INVALID_SCHEMA`', '索引根節點或項目欄位不符合規範'],
                    ['`EXTENSION_DUPLICATE_ID`', '同一索引內出現重複擴充識別碼'],
                    ['`EXTENSION_INVALID_PATH`', '套件相對路徑不合法或跨來源'],
                    ['`EXTENSION_DOWNLOAD_FAILED`', 'ZIP 套件檔案下載失敗'],
                    ['`EXTENSION_HASH_MISMATCH`', '計算所得 SHA-256 與索引宣告不一致'],
                    ['`EXTENSION_INVALID_PACKAGE`', '套件 ZIP 或 manifest 格式無效'],
                    ['`EXTENSION_INCOMPATIBLE`', '套件 API 版本與當前客戶端不相容'],
                    ['`EXTENSION_PERMISSION_DENIED`', '使用者拒絕授權安裝所需權限']
                ]
            }
        ],
        examples: [
            {
                label: 'WERP Schema v1 索引範例',
                code: `{
  "schemaVersion": 1,
  "name": "WMCX Example Extensions",
  "identifier": "com.wmcx.extensions",
  "description": "Web mai Chart X 自訂擴充程式集合",
  "extensions": [
    {
      "id": "com.wmcx.bouncing-pet",
      "name": "彈彈桌寵",
      "version": "1.0.0",
      "description": "可自由拖曳的桌面掛件。",
      "file": "Extensions/bouncing-pet-1.0.0.zip",
      "sha256": "ca5a9dee6e0eee384567c82c07b81fa82e07024f0bc6d4797c00c3ff34586136"
    }
  ]
}`
            }
        ],
        summary: {
            namespace: 'WERP v1.0',
            permission: '無',
            constant: 'schemaVersion: 1',
            async: '靜態結構定義',
            runtime: 'index.json',
            since: 'WERP v1.0'
        },
        seeAlso: ['werp-overview', 'werp-install-flow']
    },
    {
        id: 'werp-install-flow',
        category: 'werp',
        groupId: 'group-werp',
        stability: 'stable',
        title: '來源管理、安裝程序與部署',
        sidebarLabel: '安裝流程與部署指南',
        sidebarMono: false,
        subtitle: '擴充程式管理器的擴充來源分頁行為、安全更新比對與靜態託管部署方法。',
        status: {
            variant: 'free',
            label: '操作與部署',
            permissions: ['權限確認強制', '離線快取支援'],
            envs: ['GitHub Pages', 'Cloudflare Pages', '自架靜態伺服器'],
            apiVersion: 'WERP v1.0'
        },
        overview: [
            '在擴充程式管理器的「擴充來源」分頁中，使用者可新增並獨立重新整理多個第三方索引網址。單一來源連線失敗時系統會保留上次有效快取，不影響其他正常來源。'
        ],
        notes: [
            '完整安裝程序：選擇擴充程式、解析同源網址、下載 ZIP、驗證 SHA-256、檢驗 ZIP 結構與 `manifest.json`、檢查相容性、開啟權限清單由使用者確認授權，最後保存至本機 IndexedDB。',
            '更新與異常偵測：若同來源版本高於本機版本，提示一鍵升級；若版本號相同但 SHA-256 不同，系統將標記為套件內容異動而非一般升級。',
            '移除來源不卸載插件：移除已加入的來源網址時，不會自動解除安裝先前自該來源安裝的擴充程式，僅停止後續檢查更新。',
            '伺服器 CORS 設定：使用自架靜態伺服器託管時，必須包含 `Access-Control-Allow-Origin: *` 回應標頭。'
        ],
        examples: [
            {
                label: '計算 ZIP 檔案 SHA-256 雜湊值指令',
                code: `# Windows PowerShell
Get-FileHash -Path "Extensions\\bouncing-pet-1.0.0.zip" -Algorithm SHA256

# macOS / Linux Bash
sha256sum Extensions/bouncing-pet-1.0.0.zip`
            }
        ],
        summary: {
            namespace: 'WERP v1.0',
            permission: '安裝時向使用者請求授權',
            constant: 'Scripts/core/extensionRepo.js',
            async: '非同步驗證與下載',
            runtime: '擴充管理器介面',
            since: 'WERP v1.0'
        },
        seeAlso: ['werp-overview', 'werp-index-spec', 'guide-packaging']
    },

    /* ======================================================================
       十七、核心系統架構
       ====================================================================== */
    {
        id: 'arch-overview',
        category: 'architecture',
        groupId: 'group-architecture',
        stability: 'stable',
        title: '核心系統生命週期與事件通訊',
        codeTitle: 'AppContext & EventBus',
        sidebarLabel: '生命週期與事件匯流排',
        sidebarMono: false,
        subtitle: '主程式啟動流程、AppContext 單例服務容器與 EventBus 發布訂閱架構概述。',
        status: {
            variant: 'free',
            label: '內部架構參考',
            permissions: ['核心維護參考'],
            envs: ['Pure ESM 原生架構', 'IndexedDB 持久化'],
            apiVersion: 'Core'
        },
        overview: [
            'Web mai Chart X 採用無大型框架的原生 ES Modules 架構，所有模組透過 `Scripts/core/appContext.js` 單例服務容器共享執行期實例與全域狀態，並透過 `Scripts/core/eventBus.js` 進行鬆耦合通訊。',
            '擴充程式不可直接存取 `appContext` 或 `eventBus`，必須經由 `extensionManager` 提供的受限上下文 `ctx` 進行互動。'
        ],
        tables: [
            {
                title: '主程式內部 EventBus 核心事件',
                columns: ['事件常數', '事件名稱', '說明'],
                rows: [
                    ['`EVENTS.SETTINGS_CHANGED`', '`settings:changed`', '設定值異動時觸發'],
                    ['`EVENTS.SETTINGS_SAVED`', '`settings:saved`', '使用者設定儲存至持久層'],
                    ['`EVENTS.CANVAS_REDRAW`', '`canvas:redraw`', '請求重新繪製譜面畫布'],
                    ['`EVENTS.CANVAS_RESIZE`', '`canvas:resize`', '視窗尺寸或分割比例調整'],
                    ['`EVENTS.LAYOUT_SPLIT_RATIO`', '`layout:split-ratio`', '編輯區與預覽區分割比例更新'],
                    ['`EVENTS.PROJECT_LOADED`', '`project:loaded`', '專案切換或載入完成'],
                    ['`EVENTS.MAIDATA_CHANGED`', '`maidata:changed`', '譜面標頭與內容異動'],
                    ['`EVENTS.PLAYBACK_STATE_CHANGED`', '`playback:state-changed`', '播放或暫停狀態切換'],
                    ['`EVENTS.PLAYBACK_SEEK`', '`playback:seek`', '時間軸跳轉至特定秒數']
                ]
            }
        ],
        notes: [
            '啟動流程由 `Scripts/main.js` 驅動並委派至 `Scripts/core/init.js`：註冊 Service Worker、等待 `i18nReady`、預載資源與開啟 IndexedDB、偵測 `isDatabaseEmpty` 決定是否顯示歡迎導覽、透過 `decodeWorkerManager` 背景解析譜面。',
            'Pure ESM 相對引用規則：專案內所有模組相對路徑 `import` 必須明確包含 `.js` 副檔名。',
            'Service Worker 靜默首次安裝規範：初次訪問的使用者在背景快取完成前，不可彈出更新通知視窗。'
        ],
        summary: {
            namespace: 'Core Infrastructure',
            permission: '內部模組',
            constant: 'Scripts/core/appContext.js',
            async: '事件驅動與 Worker 解析',
            runtime: 'Browser ESM',
            since: 'Core'
        },
        seeAlso: ['arch-modules', 'arch-renderer-audio', 'events-list']
    },
    {
        id: 'arch-modules',
        category: 'architecture',
        groupId: 'group-architecture',
        stability: 'stable',
        title: '專案模組與目錄職責手冊',
        sidebarLabel: '模組職責索引',
        sidebarMono: false,
        subtitle: '核心基礎設施、功能外掛、彈窗組件、雲端服務與多語系引擎的檔案分佈索引。',
        status: {
            variant: 'free',
            label: '程式碼索引',
            permissions: ['核心維護參考'],
            envs: ['Scripts/core', 'Scripts/features', 'Scripts/modals', 'Scripts/services'],
            apiVersion: 'Core'
        },
        overview: [
            '專案邏輯主要切分為四大目錄與獨立的多語系系統，各自維護清晰單一的職責邊界。'
        ],
        tables: [
            {
                title: '擴充與基礎核心模組',
                columns: ['模組路徑', '職責說明', '關鍵匯出項目'],
                rows: [
                    ['`Scripts/core/extensionManager.js`', '擴充程式生命週期、權限門面與資源回收管理器', '`EXTENSION_API_VERSION`、`EXTENSION_PERMISSIONS`、`extensionManager`'],
                    ['`Scripts/core/extensionLoader.js`', '解析、驗證與動態載入第三方 `.zip` 擴充套件', '`parseExtensionZip()`、`installExtensionPackage()`、`loadStoredExtensions()`'],
                    ['`Scripts/core/extensionRepo.js`', 'WERP 擴充來源管理、索引驗證與下載校驗', '儲存庫索引讀取與安全檢查 API'],
                    ['`Scripts/core/extensionOverrideRegistry.js`', '管理設定、圖片與音效的非破壞性層疊覆寫與還原', '`extensionOverrideRegistry`'],
                    ['`Scripts/core/renderOverlayRegistry.js`', 'Canvas 疊加圖層分桶註冊表、狀態隔離呼叫與離線影片匯出前置準備管理', '`renderOverlayRegistry`'],
                    ['`Scripts/core/videoFrameDecoder.js`', '受控的逐幀影片解碼器封裝與循序影格讀取管理', '`createVideoFrameDecoder()`'],
                    ['`Scripts/core/commandRegistry.js`', '統一指令註冊與派發中心', '`commandRegistry`'],
                    ['`Scripts/core/playbackEngine.js`', '播放器狀態機、播放與倒數計時驅動', '`PlaybackEngine`'],
                    ['`Scripts/core/decodeWorkerManager.js`', '背景非同步譜面解析與同步降級', '`decodeWorkerManager`']
                ]
            },
            {
                title: '特色功能、彈窗與服務模組',
                columns: ['目錄或檔案', '職責說明'],
                rows: [
                    ['`Scripts/features/extensionMenu.js`', '頂欄拼圖擴充選單渲染與浮動元件建立'],
                    ['`Scripts/features/extensionPopover.js`', '復用 `popupWindow` 的擴充宣告式設定面板與隔離儲存'],
                    ['`Scripts/features/visualEditor.js`', '視覺化音符編輯器畫布互動與捲動控制'],
                    ['`Scripts/features/videoRender.js`', '結合音訊與畫布逐幀錄製匯出譜面預覽影片'],
                    ['`Scripts/modals/extensionManagerModal.js`', '擴充程式管理視窗，包含已安裝與擴充來源分頁'],
                    ['`Scripts/services/`', '處理 Google Drive OAuth2 授權與專案雲端同步備份'],
                    ['`Scripts/i18n.js` 與 `locales/`', 'BCP 47 系統語言偵測與繁中、簡中、英、日、韓熱切換']
                ]
            }
        ],
        summary: {
            namespace: 'Directory Map',
            permission: '內部模組',
            constant: 'Scripts/',
            async: '模組化 ESM',
            runtime: 'Browser ESM',
            since: 'Core'
        },
        seeAlso: ['arch-overview', 'arch-renderer-audio', 'guide-overview']
    },
    {
        id: 'arch-renderer-audio',
        category: 'architecture',
        groupId: 'group-architecture',
        stability: 'stable',
        title: '渲染與音訊運算引擎機制',
        codeTitle: 'SimaiRenderer & AudioManager',
        sidebarLabel: '渲染與音訊引擎',
        sidebarMono: false,
        subtitle: 'Canvas 雙畫布渲染管線、離屏快取陷阱以及 Web Audio 判定音效分流音量控制。',
        status: {
            variant: 'caution',
            label: '效能與陷阱須知',
            permissions: ['核心維護參考'],
            envs: ['HTML5 Canvas 2D', 'Web Audio API'],
            apiVersion: 'Core'
        },
        overview: [
            '`Scripts/renderer.js` 封裝了主譜面渲染器 `SimaiRenderer`、視覺化編輯渲染器 `SimaiVisualEditor` 與時間軸預覽縮圖渲染器 `SimaiPreviewRenderer`；音訊播放與混音則由 `Scripts/audioManager.js` 基於 Web Audio API 驅動。'
        ],
        callouts: [
            {
                variant: 'warning',
                title: '核心開發避坑要點',
                items: [
                    'Slide spacing 快取同步：更動 `notebasesize` 或外觀設定時，必須清除或更新 Slide 線段快取，否則箭頭間距不會反映新尺寸。',
                    '離屏音訊波形快取：`SimaiPreviewRenderer` 的 PCM 波形振幅採用離屏畫布快取，初次載入音訊時繪製一次，切勿在每幀 60fps 渲染迴圈重複解算波形。',
                    '分流音量倍率控制：判定打擊音效必須透過 `settings` 取得全域主音量、BGM 音量、SE 主音量與各別音效倍率並套用 GainNode，不可繞過音量分流。',
                    '影片渲染與 Mediabunny 文件查閱：處理 `videoRender.js` 影片匯出問題時，禁止直接讀取龐大的 `Scripts/mediabunny.cjs` 打包檔，應優先查閱官方 API 文件。'
                ]
            }
        ],
        notes: [
            '主渲染管線執行順序：背景清理與影片繪製、判定線與軌道環、依序繪製 Slide 軌跡與 Hold 與 Tap 與 Touch 音符，最後繪製打擊判定特效與外圍輔助文字。',
            '擴充程式可透過 `ctx.render.registerOverlay` 的 `phase` 參數精確安插在各繪製階段之間，並藉由 `ctx.assets` 替換渲染貼圖與音訊緩衝。'
        ],
        summary: {
            namespace: 'Renderer & Audio',
            permission: '內部核心引擎',
            constant: 'Scripts/renderer.js & audioManager.js',
            async: 'requestAnimationFrame 與 Web Audio',
            runtime: 'Browser',
            since: 'Core'
        },
        seeAlso: ['ctx.render.registerOverlay', 'ctx.assets.overrideImage', 'arch-overview']
    }
];
