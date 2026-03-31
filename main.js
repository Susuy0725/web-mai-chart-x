import { openDB, idbGet, idbSet } from './indexDB.js';
import { scaleBase, getButton, debounce, audioManager, getHighlight, parseMaidata, popupWindow, loadAllImages, simpleToast, formatSize } from './helper.js';
import { simaiDecode } from './decode.js';
import { SimaiRenderer } from './renderer.js';

let images, readyBeat = false, maidata, nowDifficulty, backgroundImage, renderer, settings = {};

window.popupWindow = popupWindow;
window.simpleToast = simpleToast;

popupWindow({
    title: "正在準備環境...",
    content: "",
    buttons: [],
    unclosable: true,
    onOpen: async (ctx) => {
        try {
            const step = (p, msg) => (ctx.setProgress(p), ctx.setContent(msg));
            await audioManager.init((pct, key) => step(pct * 0.4, `正在載入音效: ${key} (${Math.round(pct)}%)`));

            images = await loadAllImages((pct, key) => step(40 + pct * 0.5, `正在載入素材: ${key} (${Math.round(pct)}%)`));
            readyBeat = await idbGet('simai_ready_beat') === 'true';

            step(90, "正在恢復上次的編輯狀態...");
            const [
                savedContent, savedMusicDelay, savedTimeControl,
                savedBgm, savedMaiData, savedDifficulty, bg, hideEditor, savedSettings
            ] = await Promise.all([
                idbGet('simai_editor_content'),
                idbGet('simai_musicDelay'),
                idbGet('simai_timeControl'),
                idbGet('simai_resource_bgm'),
                idbGet('simai_maidata'),
                idbGet('simai_now_difficulty'),
                idbGet('simai_background_image'),
                idbGet('simai_hide_editor'),
                idbGet('simai_settings')
            ]);

            if (savedContent) { editorInput.value = savedContent; applyHighlight(savedContent); getres(savedContent); }
            if (savedMusicDelay) { musicDelay = parseFloat(savedMusicDelay); offsetInput.value = musicDelay; offsetInputDebounce(); }
            if (savedTimeControl && !isNaN(savedTimeControl)) {
                realTime = savedTimeControl; slider.value = realTime; globalTime = realTime - musicDelay; update();
            }
            if (savedMaiData) maidata = savedMaiData;
            if (savedDifficulty) { nowDifficulty = savedDifficulty; changeDifficulty.value = nowDifficulty; }
            if (bg) { backgroundImage = bg; }
            if (savedBgm) {
                step(95, "正在還原背景音樂...");
                await audioManager.setBackgroundMusic(savedBgm);
                endTime = Math.max(endTime + 1, audioManager.getBGMDuration() + 1);
                slider.max = endTime - musicDelay;
            }
            if (savedSettings) {
                settings = JSON.parse(savedSettings);
                let isMissingSettings = false;
                for (const key in defaultSettings) {
                    if (!(key in settings)) {
                        settings[key] = defaultSettings[key];
                        console.warn(`設定項 "${key}" 在已儲存的設定中缺失，已自動補齊預設值。`);
                        isMissingSettings = true;
                    }
                }
                if (isMissingSettings) {
                    await idbSet('simai_settings', JSON.stringify(settings));
                }
            }
            else {
                settings = { ...defaultSettings }
                await idbSet('simai_settings', JSON.stringify(settings));
            };

            window.settings = settings;
            if (hideEditor) {
                hideEditorButton.children[0].textContent = "right_panel_open";
                editorContainer.dataset.hidden = 'true';
            }
            setEditorCss(!hideEditor);
            changeDisplayMode.value = settings.displayMode ?? 'simai';
            renderer = new SimaiRenderer(canvas, settings);
            renderer.setImages(images);

            step(100, "完成！正在渲染畫面...");
            resize(); ctx.close();
        } catch (e) {
            console.error("初始化失敗:", e);
            ctx.setContent(`初始化發生錯誤：\n${e.message}\n請嘗試重新整理。`);
            // 報錯時可以考慮顯示一個「強制關閉」按鈕，或者讓視窗可以被手動關閉
            ctx.setButtons([{
                text: "清除所有資料",
                onClick: async () => {
                    const confirmed = confirm("確定要清除 IndexedDB 中的所有資料嗎？此操作無法復原！");
                    if (!confirmed) return;
                    const db = await openDB();
                    const transaction = db.transaction("editorState", "readwrite");
                    const store = transaction.objectStore("editorState");
                    store.clear();
                    try {
                        await transaction.complete;
                        console.log("已清除 IndexedDB 中的所有資料");
                    } catch (e) {
                        console.error("清除 IndexedDB 資料失敗:", e);
                    }
                }
            }, {
                text: "清除譜面暫存",
                onClick: async () => {
                    const confirmed = confirm("確定要清除所有譜面資料嗎？音效與圖片快取將會保留。");
                    if (!confirmed) return;

                    const db = await openDB();
                    const transaction = db.transaction("editorState", "readwrite");
                    const store = transaction.objectStore("editorState");

                    // 1. 取得所有 Key
                    const getKeysRequest = store.getAllKeys();

                    getKeysRequest.onsuccess = () => {
                        const allKeys = getKeysRequest.result;
                        let deleteCount = 0;

                        // 2. 篩選並刪除符合條件的 Key
                        allKeys.forEach(key => {
                            if (typeof key === 'string' && key.startsWith('simai_')) {
                                store.delete(key);
                                deleteCount++;
                            }
                        });

                        transaction.oncomplete = () => {
                            console.log(`[IDB] 已成功清理 ${deleteCount} 項譜面資料`);
                            // 這裡可以選擇是否要 reload 頁面或是更新 UI
                            // location.reload(); 
                        };
                    };

                    transaction.onerror = (e) => {
                        console.error("清除特定資料失敗:", e);
                    };
                }
            },
            {
                text: "清除素材暫存",
                onClick: async () => {
                    const confirmed = confirm("確定要清除所有音效與圖片快取資料嗎？譜面資料將會保留。");
                    if (!confirmed) return;

                    const db = await openDB();
                    const transaction = db.transaction("editorState", "readwrite");
                    const store = transaction.objectStore("editorState");

                    // 1. 取得所有 Key
                    const getKeysRequest = store.getAllKeys();

                    getKeysRequest.onsuccess = () => {
                        const allKeys = getKeysRequest.result;
                        let deleteCount = 0;

                        // 2. 篩選並刪除符合條件的 Key
                        allKeys.forEach(key => {
                            if (typeof key === 'string' && key.startsWith('sfx_cache_')) {
                                store.delete(key);
                                deleteCount++;
                            }
                            if (typeof key === 'string' && key.startsWith('img_cache_')) {
                                store.delete(key);
                                deleteCount++;
                            }
                        });

                        transaction.oncomplete = () => {
                            console.log(`[IDB] 已成功清理 ${deleteCount} 項素材快取資料`);
                            // 這裡可以選擇是否要 reload 頁面或是更新 UI
                            // location.reload(); 
                        };
                    };

                    transaction.onerror = (e) => {
                        console.error("清除特定資料失敗:", e);
                    };
                }
            },
            {
                text: "關閉",
                onClick: () => {
                    popupWindow({
                        title: "警告",
                        content: "如果繼續使用可能會遇到不可預期的錯誤，建議先清除資料或重新整理頁面。\n<br>建議可以先清除暫存資料後再嘗試載入，看看是否是因為某筆資料損壞導致的問題。",
                        buttons: [{ text: "繼續", onClick: () => { ctx.close(); }, hideOnClick: true }, { text: "取消", hideOnClick: true }]
                    });
                }
            }]);
        }
    }
});

const canvas = document.getElementById('main');
const canvasContainer = document.getElementById('canvasContainer');
const slider = document.getElementById('timeControl');
const playButton = getButton("play/pause", "control");
const stopButton = getButton("stop", "control");
const quickGenerateButton = getButton("quickGenerate", "utility");
const hideEditorButton = getButton("hideEditor", "utility");
const hideUtilityButton = document.querySelector("#utilityContainer .closeBtn");
const readyBeatCheckbox = getButton("readyBeat", "utility").children[0];
const offsetInput = getButton("offset", "utility").children[0];
const changeDifficulty = getButton("changeDifficulty", "utility").children[0];
const addMusicButton = getButton("addMusic", "utility");
const readMaidataButton = getButton("readMaidata", "utility");
const chartInfoButton = getButton("chartInfo", "utility");
const settingsButton = getButton("settings", "utility");
const popup = getButton("popup", "utility");
const folderInput = getButton("readFolder", "utility");
const getNowNoteIndex = getButton("getNowNoteIndex", "utility");
const changeDisplayMode = getButton("displayMode", "utility").children[0];
const getCursorNoteIndex = getButton("getCursorNoteIndex", "utility");
const visualEditor = document.getElementById('visualEditor');

let ctx = canvas.getContext('2d');
const scale = 0.98;
export const defaultSettings = {
    speed: 6.5,
    touchSpeed: 7,
    effectDecayTime: 0.4,
    middleDistance: 0.25,
    noteBaseSize: 11,
    play_combo: 100,
    play_score: 100,
    middleDisplay: 1, // 0: 關閉, 1: COMBO, 2: 分數
    moviebrightness: -1,
    // #ffffff -> #404040
    displayMode: 'simai', // simai 或 visual
};
let globalTime = 0, realTime = 0;
let lastTimestamp = null;
let secondCtx = null;
let externalWindow = null;
let timeControlSliding = false; // 新增滑動狀態標記
let showSensor = true;
let keepRenderingWhilePause = false; // 是否在暫停時繼續渲染（保持畫面更新）
let nowIndex = 0;
let visualCtx = null;

const VISUAL_WINDOW = 4; // 顯示目前時間前後秒數
const VISUAL_COLORS = {
    tap: '#47d1ff',
    hold: '#42f59b',
    slide: '#ffc247',
    touch: '#ff6e7a',
    default: '#c7c7c7'
};

let clockBpm = 60;

const isVisualMode = () => settings.displayMode === 'visual';

const saveSettingsDebounce = debounce(() => {
    idbSet('simai_settings', JSON.stringify(settings)).catch((error) => {
        console.error('儲存設定到 IndexedDB 失敗:', error);
    });
}, 300);

const testData = `(60){4}1h/2h/3h/4h/5h/6h/7h/8h/E1f/E2f/E3f/E4f/E5f/E6f/E7f/E8f/A1f/A2f/A3f/A4f/A5f/A6f/A7f/A8f/B1f/B2f/B3f/B4f/B5f/B6f/B7f/B8f/D1f/D2f/D3f/D4f/D5f/D6f/D7f/D8f/Cf/1h/2h/3h/4h/5h/6h/7h/8h/E1f/E2f/E3f/E4f/E5f/E6f/E7f/E8f/A1f/A2f/A3f/A4f/A5f/A6f/A7f/A8f/B1f/B2f/B3f/B4f/B5f/B6f/B7f/B8f/D1f/D2f/D3f/D4f/D5f/D6f/D7f/D8f/Cf/1h/2h/3h/4h/5h/6h/7h/8h/E1f/E2f/E3f/E4f/E5f/E6f/E7f/E8f/A1f/A2f/A3f/A4f/A5f/A6f/A7f/A8f/B1f/B2f/B3f/B4f/B5f/B6f/B7f/B8f/D1f/D2f/D3f/D4f/D5f/D6f/D7f/D8f/Cf/1h/2h/3h/4h/5h/6h/7h/8h/E1f/E2f/E3f/E4f/E5f/E6f/E7f/E8f/A1f/A2f/A3f/A4f/A5f/A6f/A7f/A8f/B1f/B2f/B3f/B4f/B5f/B6f/B7f/B8f/D1f/D2f/D3f/D4f/D5f/D6f/D7f/D8f/Cf/1h/2h/3h/4h/5h/6h/7h/8h/E1f/E2f/E3f/E4f/E5f/E6f/E7f/E8f/A1f/A2f/A3f/A4f/A5f/A6f/A7f/A8f/B1f/B2f/B3f/B4f/B5f/B6f/B7f/B8f/D1f/D2f/D3f/D4f/D5f/D6f/D7f/D8f/Cf/1h/2h/3h/4h/5h/6h/7h/8h/E1f/E2f/E3f/E4f/E5f/E6f/E7f/E8f/A1f/A2f/A3f/A4f/A5f/A6f/A7f/A8f/B1f/B2f/B3f/B4f/B5f/B6f/B7f/B8f/D1f/D2f/D3f/D4f/D5f/D6f/D7f/D8f/Cf/1h/2h/3h/4h/5h/6h/7h/8h/E1f/E2f/E3f/E4f/E5f/E6f/E7f/E8f/A1f/A2f/A3f/A4f/A5f/A6f/A7f/A8f/B1f/B2f/B3f/B4f/B5f/B6f/B7f/B8f/D1f/D2f/D3f/D4f/D5f/D6f/D7f/D8f/Cf/1h/2h/3h/4h/5h/6h/7h/8h/E1f/E2f/E3f/E4f/E5f/E6f/E7f/E8f/A1f/A2f/A3f/A4f/A5f/A6f/A7f/A8f/B1f/B2f/B3f/B4f/B5f/B6f/B7f/B8f/D1f/D2f/D3f/D4f/D5f/D6f/D7f/D8f/Cf/1h/2h/3h/4h/5h/6h/7h/8h/E1f/E2f/E3f/E4f/E5f/E6f/E7f/E8f/A1f/A2f/A3f/A4f/A5f/A6f/A7f/A8f/B1f/B2f/B3f/B4f/B5f/B6f/B7f/B8f/D1f/D2f/D3f/D4f/D5f/D6f/D7f/D8f/Cf/1h/2h/3h/4h/5h/6h/7h/8h/E1f/E2f/E3f/E4f/E5f/E6f/E7f/E8f/A1f/A2f/A3f/A4f/A5f/A6f/A7f/A8f/B1f/B2f/B3f/B4f/B5f/B6f/B7f/B8f/D1f/D2f/D3f/D4f/D5f/D6f/D7f/D8f/Cf/1h/2h/3h/4h/5h/6h/7h/8h/E1f/E2f/E3f/E4f/E5f/E6f/E7f/E8f/A1f/A2f/A3f/A4f/A5f/A6f/A7f/A8f/B1f/B2f/B3f/B4f/B5f/B6f/B7f/B8f/D1f/D2f/D3f/D4f/D5f/D6f/D7f/D8f/Cf/1h/2h/3h/4h/5h/6h/7h/8h/E1f/E2f/E3f/E4f/E5f/E6f/E7f/E8f/A1f/A2f/A3f/A4f/A5f/A6f/A7f/A8f/B1f/B2f/B3f/B4f/B5f/B6f/B7f/B8f/D1f/D2f/D3f/D4f/D5f/D6f/D7f/D8f/Cf,`

// 1. 選取狀態儲存
//let activePointers = new Map();

const editorContainer = document.getElementById('editorContainer');
const editorInput = document.getElementById('editor-input');
const highlightLayer = document.getElementById('highlight-layer');
let notes = [], endTime = 1, musicDelay = 1e-4, rawData = [];

getButton("manageResources", "utility").addEventListener('click', async () => {
    async function getSize() {
        // open a fresh readonly transaction each time so it won't be closed already
        const db = await openDB();
        const transaction = db.transaction("editorState", "readonly");
        const store = transaction.objectStore("editorState");

        let details = "IndexedDB 儲存狀態：\n\n";
        let totalSize = 0;

        // 取得所有 Key 並統計大小
        const keys = await new Promise(res => {
            const req = store.getAllKeys();
            req.onsuccess = () => res(req.result);
        });

        for (const key of keys) {
            const data = await idbGet(key);
            let size = 0;
            if (data instanceof Blob) size = data.size;
            else if (data instanceof ArrayBuffer) size = data.byteLength;
            else size = JSON.stringify(data).length * 2;

            totalSize += size;
            details += `• ${key}: ${formatSize(size)}\n`;
        }
        details += `\n總計使用量: ${formatSize(totalSize)}`;

        return details;
    }

    // 呼叫你的 simplePopupWindow
    popupWindow({
        title: "資源管理",
        content: await getSize(),
        buttons: [
            {
                text: "清除緩存",
                onClick: (manageCtx) => {
                    const refreshManage = async () => {
                        manageCtx.setContent(await getSize());
                    };

                    popupWindow({
                        title: "清除緩存",
                        width: "max-content",
                        buttons: [
                            {
                                text: "清除所有資料",
                                onClick: async () => {
                                    const confirmed = confirm("確定要清除 IndexedDB 中的所有資料嗎？此操作無法復原！");
                                    if (!confirmed) return;
                                    const db = await openDB();
                                    const transaction = db.transaction("editorState", "readwrite");
                                    const store = transaction.objectStore("editorState");
                                    store.clear();
                                    await refreshManage();
                                    try {
                                        await transaction.complete;
                                        console.log("已清除 IndexedDB 中的所有資料");
                                    } catch (e) {
                                        console.error("清除 IndexedDB 資料失敗:", e);
                                    }
                                }
                            },
                            {
                                text: "清除譜面暫存",
                                onClick: async () => {
                                    const confirmed = confirm("確定要清除所有譜面資料嗎？音效與圖片快取將會保留。");
                                    if (!confirmed) return;

                                    const db = await openDB();
                                    const transaction = db.transaction("editorState", "readwrite");
                                    const store = transaction.objectStore("editorState");

                                    // 1. 取得所有 Key
                                    const getKeysRequest = store.getAllKeys();

                                    getKeysRequest.onsuccess = async () => {
                                        const allKeys = getKeysRequest.result;
                                        let deleteCount = 0;

                                        // 2. 篩選並刪除符合條件的 Key
                                        allKeys.forEach(key => {
                                            if (typeof key === 'string' && key.startsWith('simai_')) {
                                                store.delete(key);
                                                deleteCount++;
                                            }
                                        });
                                        await refreshManage();

                                        transaction.oncomplete = () => {
                                            console.log(`[IDB] 已成功清理 ${deleteCount} 項譜面資料`);
                                            // 這裡可以選擇是否要 reload 頁面或是更新 UI
                                            // location.reload(); 
                                        };
                                    };

                                    transaction.onerror = async (e) => {
                                        console.error("清除特定資料失敗:", e);
                                        await refreshManage();
                                    };
                                }
                            },
                            {
                                text: "清除素材暫存",
                                onClick: async () => {
                                    const confirmed = confirm("確定要清除所有音效與圖片快取資料嗎？譜面資料將會保留。");
                                    if (!confirmed) return;

                                    const db = await openDB();
                                    const transaction = db.transaction("editorState", "readwrite");
                                    const store = transaction.objectStore("editorState");

                                    // 1. 取得所有 Key
                                    const getKeysRequest = store.getAllKeys();

                                    getKeysRequest.onsuccess = async () => {
                                        const allKeys = getKeysRequest.result;
                                        let deleteCount = 0;

                                        // 2. 篩選並刪除符合條件的 Key
                                        allKeys.forEach(key => {
                                            if (typeof key === 'string' && key.startsWith('sfx_cache_')) {
                                                store.delete(key);
                                                deleteCount++;
                                            }
                                            if (typeof key === 'string' && key.startsWith('img_cache_')) {
                                                store.delete(key);
                                                deleteCount++;
                                            }
                                        });

                                        await refreshManage();

                                        transaction.oncomplete = () => {
                                            console.log(`[IDB] 已成功清理 ${deleteCount} 項素材快取資料`);
                                            // 這裡可以選擇是否要 reload 頁面或是更新 UI
                                            // location.reload(); 
                                        };
                                    };

                                    transaction.onerror = async (e) => {
                                        console.error("清除特定資料失敗:", e);
                                        await refreshManage();
                                    };
                                }
                            },
                            {
                                text: "關閉",
                                hideOnClick: true
                            }
                        ]
                    });
                }
            },
            {
                text: "關閉",
                hideOnClick: true
            }
        ]
    });
});

const getres = ((simaiDataValue) => {
    const result = (() => {
        try {
            return simaiDecode(simaiDataValue, 0);
        } catch (e) {
            console.error("解析失敗", e);
            return null;
        }
    })();

    if (result) {
        notes = result.notes;
        endTime = Math.max(result.endTime + 1, audioManager.getBGMDuration() + 1);
        slider.max = endTime - musicDelay;
        // chartBaseOffset = result.baseOffset;
        clockBpm = result.bpm;
        rawData = simaiDataValue.split(',');
        draw();
    }
});

const offsetInputDebounce = debounce(() => {
    slider.max = endTime - musicDelay;
    slider.value = realTime;

    globalTime = realTime - musicDelay;

    if (playButton.dataset.playing === 'true') {
        audioManager.playBGM(realTime); // 調整音樂播放位置，讓它與節拍更貼合
    }
    idbSet('simai_musicDelay', musicDelay).then(() => {
        //console.log("已儲存偏移值到 IndexedDB:", musicDelay);
    }).catch((error) => {
        console.error("儲存偏移值到 IndexedDB 失敗:", error);
    });
    draw();
}, 500);

const inputDebounce = debounce(() => {
    const value = editorInput.value;

    // 解析 Note 邏輯
    getres(value);

    // 存入本地空間
    idbSet('simai_editor_content', value).then(() => {
        //console.log("已儲存內容到 IndexedDB");
    }).catch((error) => {
        console.error("儲存內容到 IndexedDB 失敗:", error);
    });
}, 300);

function setElementDisplay(element, visible, value = 'block') {
    element.style.display = visible ? value : 'none';
}

function animateCanvasWidth(visible) {
    const canvasAnimation = canvasContainer.animate(
        [{ width: visible ? '50%' : '100%' }],
        { duration: 400, fill: 'forwards', easing: 'ease' }
    );

    let animationRunning = true;

    function syncResize() {
        if (animationRunning) {
            resize();
            requestAnimationFrame(syncResize);
        }
    }

    canvasAnimation.onfinish = () => {
        animationRunning = false;
        resize();
    };

    syncResize();
}

function ensureVisualEditorContext() {
    if (!visualCtx) {
        visualCtx = visualEditor.getContext('2d');
    }
    return visualCtx;
}

function resizeVisualEditor() {
    const ctx2d = ensureVisualEditorContext();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, editorContainer.clientWidth);
    const h = Math.max(1, editorContainer.clientHeight);
    visualEditor.width = Math.floor(w * dpr);
    visualEditor.height = Math.floor(h * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function renderVisualEditor() {
    if (!isVisualMode() || visualEditor.style.display === 'none') return;

    const ctx2d = ensureVisualEditorContext();
    const w = visualEditor.clientWidth;
    const h = visualEditor.clientHeight;
    if (w <= 0 || h <= 0) return;

    ctx2d.clearRect(0, 0, w, h);

    ctx2d.fillStyle = '#141414';
    ctx2d.fillRect(0, 0, w, h);

    const centerX = w / 2;
    const lanes = [
        { key: 'tap', y: h * 0.23, label: 'TAP' },
        { key: 'hold', y: h * 0.43, label: 'HOLD' },
        { key: 'slide', y: h * 0.63, label: 'SLIDE' },
        { key: 'touch', y: h * 0.83, label: 'TOUCH' }
    ];

    ctx2d.strokeStyle = '#2b2b2b';
    ctx2d.lineWidth = 1;
    for (const lane of lanes) {
        ctx2d.beginPath();
        ctx2d.moveTo(0, lane.y);
        ctx2d.lineTo(w, lane.y);
        ctx2d.stroke();

        ctx2d.fillStyle = '#9a9a9a';
        ctx2d.font = '12px Consolas, monospace';
        ctx2d.fillText(lane.label, 8, lane.y - 6);
    }

    ctx2d.strokeStyle = '#ffffff';
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.moveTo(centerX, 0);
    ctx2d.lineTo(centerX, h);
    ctx2d.stroke();

    if (!notes || notes.length === 0) {
        ctx2d.fillStyle = '#c9c9c9';
        ctx2d.font = '14px Consolas, monospace';
        ctx2d.fillText('目前沒有可視化音符資料', 16, 24);
        return;
    }

    const start = realTime - VISUAL_WINDOW;
    const end = realTime + VISUAL_WINDOW;
    const duration = end - start;

    for (const note of notes) {
        if (note.time < start || note.time > end) continue;

        const lane = lanes.find(l => l.key === note.type);
        if (!lane) continue;

        const x = ((note.time - start) / duration) * w;
        const color = VISUAL_COLORS[note.type] ?? VISUAL_COLORS.default;

        ctx2d.fillStyle = color;
        ctx2d.beginPath();
        ctx2d.arc(x, lane.y, 5, 0, Math.PI * 2);
        ctx2d.fill();

        if (note.holdDuration > 0 || note.slideDuration > 0) {
            const noteLen = (note.holdDuration ?? 0) + (note.slideDelay ?? 0) + (note.slideDuration ?? 0);
            const endX = Math.min(w, ((note.time + noteLen - start) / duration) * w);
            ctx2d.strokeStyle = color;
            ctx2d.lineWidth = 3;
            ctx2d.beginPath();
            ctx2d.moveTo(x, lane.y);
            ctx2d.lineTo(endX, lane.y);
            ctx2d.stroke();
        }
    }

    ctx2d.fillStyle = '#ffffff';
    ctx2d.font = '12px Consolas, monospace';
    ctx2d.fillText(`t=${realTime.toFixed(2)}s`, centerX + 6, 14);
}

const setEditorCss = (visible = null) => {
    // 同步捲動永遠執行
    highlightLayer.scrollTop = editorInput.scrollTop;
    highlightLayer.scrollLeft = editorInput.scrollLeft;

    if (visible === null) return;

    const visualMode = isVisualMode();
    const editorVisible = visible && !visualMode;
    const visualVisible = visible && visualMode;

    setElementDisplay(editorContainer, visible);
    setElementDisplay(editorInput, editorVisible);
    setElementDisplay(highlightLayer, editorVisible);
    setElementDisplay(visualEditor, visualVisible);

    if (visualVisible) {
        resizeVisualEditor();
        renderVisualEditor();
    }

    animateCanvasWidth(visible);
};

settingsButton.addEventListener('click', () => {
    popupWindow({
        title: "設定",
        customContent: (() => {
            const container = document.createElement('div');
            container.innerText = "這裡未來會放一些設定選項，目前先暫時空著。";
            return container;
        })(),
        buttons: [{
            text: "套用",
        },
        {
            text: "確認",
            hideOnClick: true
        },
        {
            text: "關閉",
            hideOnClick: true
        }]
    })
});

chartInfoButton.addEventListener('click', () => {
    const tempData = { ...(maidata || {}) };

    const createPopupContent = () => {
        const container = document.createElement('div');
        container.style.cssText = "display:flex;";

        const imgContainer = document.createElement('div');
        const img = document.createElement('img');
        img.src = backgroundImage ? URL.createObjectURL(backgroundImage) : images['star'].src;
        img.style.cssText = "width:100%;height:100%;display:block;";
        imgContainer.appendChild(img);
        imgContainer.style.cssText = "width:40%;height:100%;overflow:hidden;border:1px solid #ccc;border-radius:8px;object-fit:contain;";

        const diffContainer = document.createElement('div');
        diffContainer.style.cssText = "width:60%;box-sizing:border-box;display:flex;flex-direction:column;padding:0 0 0 10px;";

        const createLabeledInput = (value, labelText, assign) => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = "display:flex;flex-direction:column;margin-bottom:6px;";

            const label = document.createElement('label');
            label.textContent = labelText;
            label.style.cssText = "font-size:12px;color:#888;margin-bottom:2px;";

            const input = document.createElement('input');
            input.type = 'text';
            input.value = value ?? '';
            input.title = labelText;
            input.placeholder = labelText;
            input.style.cssText = "padding:4px;border:1px solid #ccc;border-radius:4px;";

            input.addEventListener('input', () => {
                const newValue = input.value;
                if (assign) {
                    tempData[assign] = newValue;
                }
            });

            wrapper.appendChild(label);
            wrapper.appendChild(input);
            return { wrapper, input };
        };

        const { wrapper: titleWrapper } = createLabeledInput(tempData.title, "標題", "title");
        const { wrapper: artistWrapper } = createLabeledInput(tempData.artist, "作者", "artist");
        const { wrapper: descWrapper } = createLabeledInput(tempData.des, "譜面設計", "des");

        const dropdown = document.createElement('select');
        dropdown.name = "difficulty";
        dropdown.style.cssText = "width:100%;padding:3px;font-size:12px;margin-bottom:4px;";
        dropdown.innerHTML = `
                <option value="7">ORIGINAL</option>
                <option value="6">RE:MASTER</option>
                <option value="5">MASTER</option>
                <option value="4">EXPERT</option>
                <option value="3">ADVANCED</option>
                <option value="2">BASIC</option>
                <option value="1">EASY</option>
            `;
        dropdown.value = nowDifficulty || "5"; // 預設選擇 MASTER
        dropdown.addEventListener('change', (e) => {
            const diff = e.target.value;
            tempData.difficulty = diff;

            infoText.innerHTML = "";
            const { wrapper: lvWrapper } = createLabeledInput(tempData[`lv_${diff}`], "等級", `lv_${diff}`);
            const { wrapper: desWrapper } = createLabeledInput(tempData[`des_${diff}`], "難度設計", `des_${diff}`);
            infoText.appendChild(lvWrapper);
            infoText.appendChild(desWrapper);
        });

        diffContainer.appendChild(titleWrapper);
        diffContainer.appendChild(artistWrapper);
        diffContainer.appendChild(descWrapper);
        diffContainer.appendChild(dropdown);

        const infoText = document.createElement('div');
        infoText.style.cssText = "font-size:14px;white-space:pre-wrap;";
        diffContainer.appendChild(infoText);

        const currentDifficulty = nowDifficulty || "5";
        infoText.appendChild(createLabeledInput(tempData[`lv_${currentDifficulty}`], "等級", `lv_${currentDifficulty}`).wrapper);
        infoText.appendChild(createLabeledInput(tempData[`des_${currentDifficulty}`], "難度設計", `des_${currentDifficulty}`).wrapper);

        container.appendChild(imgContainer);
        container.appendChild(diffContainer);
        return container;
    };

    popupWindow({
        title: "譜面資訊",
        customContent: createPopupContent(),
        buttons: [
            {
                text: "確定",
                onClick: (closePopup) => {
                    if (!maidata) {
                        maidata = {};
                    }
                    Object.keys(tempData).forEach(key => {
                        maidata[key] = tempData[key];
                    });
                    if (tempData.difficulty) {
                        nowDifficulty = tempData.difficulty;
                        changeDifficulty.value = nowDifficulty;
                    }
                    idbSet('simai_maidata', maidata).catch(e => console.error('儲存 maidata 失敗', e));
                    closePopup();
                },
                hideOnClick: true
            },
            {
                text: "取消",
                hideOnClick: true
            }
        ]
    });
});

readyBeatCheckbox.checked = readyBeat;
readyBeatCheckbox.addEventListener('change', () => {
    readyBeat = readyBeatCheckbox.checked;
    idbSet('simai_ready_beat', readyBeatCheckbox.checked).then(() => {
        console.log("已儲存預備拍狀態到 IndexedDB:", readyBeatCheckbox.checked);
    }).catch((error) => {
        console.error("儲存預備拍狀態到 IndexedDB 失敗:", error);
    });
    inputDebounce();
});

editorInput.addEventListener('input', () => {
    const value = editorInput.value;

    // 同步捲動位置
    setEditorCss();

    // 立即更新顏色高亮 (視覺上達到打字立刻出現)
    applyHighlight(value);

    // 延遲處理重解析與存檔 (避免打字時解析幾萬行導致卡頓)
    inputDebounce();
});

offsetInput.addEventListener('input', () => {
    musicDelay = (() => {
        const val = parseFloat(offsetInput.value);
        if (isNaN(val)) {
            console.warn("偏移值無效，請輸入數字");
            return 0;
        }
        return val;
    })();
    offsetInputDebounce();
});

folderInput.addEventListener('click', (e) => {
    const input = folderInput.children[0];
    input.click();
    input.onchange = (event) => {
        const files = event.target.files;
        console.log("選擇的檔案列表：", files);
        if (files.length === 0) {
            console.warn("未選擇任何檔案");
            return;
        }
        for (var i = 0; i < files.length; i++) {
            let file = files.item(i);
            if (file.name.startsWith('track.')) {
                // 音樂檔
                const url = URL.createObjectURL(file);
                audioManager.setBackgroundMusic(url);
                endTime = Math.max(endTime + 1, audioManager.getBGMDuration() + 1);
                slider.max = endTime - musicDelay;
                idbSet('simai_resource_bgm', file).then(() => {
                    console.log("已儲存音樂檔到 IndexedDB");
                }).catch((error) => {
                    console.error("儲存音樂檔到 IndexedDB 失敗:", error);
                });
            }
            if (file.name.startsWith('maidata.')) {
                // 譜面檔
                const reader = new FileReader();
                reader.onload = (e) => {
                    editorInput.value = "";
                    offsetInput.value = 0;
                    musicDelay = 0;
                    applyHighlight("");
                    const content = parseMaidata(e.target.result);
                    maidata = content;
                    idbSet('simai_maidata', content).then(() => {
                        console.log("已儲存譜面內容到 IndexedDB");
                    }).catch((error) => {
                        console.error("儲存譜面內容到 IndexedDB 失敗:", error);
                    });
                    console.log(content);
                    if (content["first"]) {
                        console.log("成功讀取 first");
                        musicDelay = (() => {
                            const val = parseFloat(content["first"]);
                            if (isNaN(val)) {
                                console.warn("偏移值無效，請輸入數字");
                                return 0;
                            }
                            return val;
                        })();
                        offsetInputDebounce();
                    }
                    nowDifficulty = 5; // 預設讀取 inote_5，實際可依需求調整
                    idbSet("simai_now_difficulty", nowDifficulty).then(() => {
                        console.log("已儲存當前難度到 IndexedDB:", nowDifficulty);
                    }).catch((error) => {
                        console.error("儲存當前難度到 IndexedDB 失敗:", error);
                    });
                    changeDifficulty.value = nowDifficulty;
                    if (content["inote_5"]) {
                        console.log("成功讀取 inote_5，已載入編輯器");
                        console.log("inote_5 內容預覽：", content["inote_5"].slice(0, 100) + (content["inote_5"].length > 100 ? "..." : ""));
                        editorInput.value = content["inote_5"] || ""; // 預設讀取 inote_5，實際可依需求調整
                        idbSet('simai_editor_content', editorInput.value).then(() => {
                            console.log("已儲存編輯器內容到 IndexedDB");
                        }).catch((error) => {
                            console.error("儲存編輯器內容到 IndexedDB 失敗:", error);
                        });
                        applyHighlight(content["inote_5"]);
                    } else {
                        console.warn("maidata 中未找到 inote_5，編輯器將保持空白");
                    }
                    getres(editorInput.value);
                    resize();
                };
                reader.readAsText(file);
            }
            if (file.name.startsWith('bg.')) {
                if (!file.type.startsWith('image/')) {
                    console.warn("選擇的背景檔案不是圖片類型，已跳過：", file.name);
                    continue;
                }
                // 背景圖
                backgroundImage = file;
                //const url = URL.createObjectURL(file);
                //document.body.style.backgroundImage = `url(${url})`;
                idbSet('simai_background_image', file).catch((error) => {
                    console.error("儲存背景圖到 IndexedDB 失敗:", error);
                });
            }
        }
    };
});

readMaidataButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = parseMaidata(e.target.result);
                maidata = content;
                idbSet('simai_maidata', content).then(() => {
                    console.log("已儲存譜面內容到 IndexedDB");
                }).catch((error) => {
                    console.error("儲存譜面內容到 IndexedDB 失敗:", error);
                });
                console.log(content);
                if (content["first"]) {
                    console.log("成功讀取 first");
                    musicDelay = (() => {
                        const val = parseFloat(content["first"]);
                        if (isNaN(val)) {
                            console.warn("偏移值無效，請輸入數字");
                            return 0;
                        }
                        return val;
                    })();
                    offsetInputDebounce();
                }
                if (content["inote_5"]) {
                    console.log("成功讀取 inote_5，已載入編輯器");
                    console.log("inote_5 內容預覽：", content["inote_5"].slice(0, 100) + (content["inote_5"].length > 100 ? "..." : ""));
                    editorInput.value = content["inote_5"] || ""; // 預設讀取 inote_5，實際可依需求調整
                    idbSet('simai_editor_content', editorInput.value).then(() => {
                        console.log("已儲存編輯器內容到 IndexedDB");
                    }).catch((error) => {
                        console.error("儲存編輯器內容到 IndexedDB 失敗:", error);
                    });
                    applyHighlight(content["inote_5"]);
                    getres(content["inote_5"]);
                } else {
                    console.warn("maidata 中未找到 inote_5，編輯器將保持空白");
                }
                resize();
            };
            reader.readAsText(file);
        }
    };
    input.click();
});

hideEditorButton.addEventListener('click', () => {
    // 檢查目前是否為隱藏狀態
    //const currentlyHidden = editorContainer.style.display === 'none';
    const currentlyHidden = editorContainer.dataset.hidden === 'true';
    hideEditorButton.children[0].innerText = currentlyHidden ? 'right_panel_close' : 'right_panel_open';

    // 儲存的是 "是否隱藏" 的狀態
    idbSet('simai_hide_editor', !currentlyHidden).then(() => {
        //console.log("已儲存編輯器顯示狀態到 IndexedDB:", !nextStateVisible);
    }).catch((error) => {
        console.error("儲存編輯器顯示狀態到 IndexedDB 失敗:", error);
    });

    setEditorCss(currentlyHidden);
    editorContainer.dataset.hidden = currentlyHidden ? 'false' : 'true';
    resize();
    console.log(`編輯器已${currentlyHidden === 'true' ? '顯示' : '隱藏'}`);
});

const difficultyInputDebounce = debounce(() => {
    const difficulty = changeDifficulty.value;
    idbSet('simai_now_difficulty', difficulty).then(() => {
        console.log("已儲存難度到 IndexedDB:", difficulty);
    }).catch((error) => {
        console.error("儲存難度到 IndexedDB 失敗:", error);
    });
}, 500);

changeDifficulty.addEventListener('change', (e) => {
    console.log("難度變更為:", e.target.value);
    const nowEditorContent = editorInput.value;
    maidata['inote_' + nowDifficulty] = nowEditorContent;
    nowDifficulty = e.target.value;
    editorInput.value = maidata['inote_' + nowDifficulty] ?? "";
    applyHighlight(editorInput.value);
    inputDebounce();
    difficultyInputDebounce();
});

changeDisplayMode.addEventListener('change', (e) => {
    settings.displayMode = e.target.value;
    saveSettingsDebounce();
    setEditorCss(editorContainer.dataset.hidden !== 'true');
    draw();
});

hideUtilityButton.addEventListener('click', () => {
    const utilityBtns = document.getElementById('topUtilityBtns');
    const utilityContainer = document.getElementById('utilityContainer');
    const isHidden = hideUtilityButton.dataset.hidden === 'true';
    if (isHidden) {
        utilityBtns.style.display = 'flex';
        utilityBtns.animate([
            { opacity: 0, height: '0px', padding: '0 5px' },
            { opacity: 1, height: '40px', padding: '5px' }
        ], { duration: 200, fill: 'forwards', easing: 'ease' }).onfinish = () => {

        }
        canvasContainer.classList.remove('expanded');
        editorContainer.classList.remove('expanded');
        utilityContainer.classList.remove('expanded');
    } else {
        //utilityBtns.style.display = 'none';
        utilityBtns.animate([
            { opacity: 1, height: '40px', padding: '5px' },
            { opacity: 0, height: '0px', padding: '0 5px' }
        ], { duration: 200, fill: 'forwards', easing: 'ease' }).onfinish = () => {
            utilityBtns.style.display = 'none';
        }
        canvasContainer.classList.add('expanded');
        editorContainer.classList.add('expanded');
        utilityContainer.classList.add('expanded');
    }
    hideUtilityButton.innerText = isHidden ? '▲' : '▼';
    hideUtilityButton.dataset.hidden = isHidden ? 'false' : 'true';
    resize();
});

quickGenerateButton.addEventListener('click', () => {
    popupWindow({
        title: "快速生成",
        content: `
BPM: <input type="number" id="quickBpm" value="60" style="width: 80px;"><br>
Beat: <input type="number" id="quickBeat" value="4" style="width: 80px;"><br>`,
        buttons: [
            {
                text: "生成",
                onClick: (ctx) => {
                    const bpm = ctx.elements.content.querySelector('#quickBpm').value;
                    const beat = ctx.elements.content.querySelector('#quickBeat').value;
                    if (isNaN(parseFloat(bpm)) || isNaN(parseFloat(beat))) {
                        popupWindow({ title: "請確保所有輸入都是有效的數字" });
                        return;
                    }
                    const generated = `(${parseFloat(bpm)}){${parseFloat(beat)}}`;
                    editorInput.value += generated;
                    applyHighlight(editorInput.value);
                    inputDebounce();
                    ctx.close();
                }
            }
        ]
    });
});

editorInput.addEventListener('scroll', () => {
    highlightLayer.scrollTop = editorInput.scrollTop;
    highlightLayer.scrollLeft = editorInput.scrollLeft;
});
const pairs = { '(': ')', '{': '}', '[': ']' };
const closingChars = new Set(Object.values(pairs));

// 括號補齊／跳過（beforeinput 在手機和桌機的文字輸入都可靠）
editorInput.addEventListener('beforeinput', (e) => {
    const char = e.data;
    if (!char || char.length !== 1) return;

    const { selectionStart: start, selectionEnd: end, value } = editorInput;

    if (pairs[char]) { // 開括號：自動補齊並包住選取
        e.preventDefault();
        editorInput.setRangeText(char + value.slice(start, end) + pairs[char], start, end, 'end');
        editorInput.selectionStart = editorInput.selectionEnd = start + 1;
        editorInput.dispatchEvent(new Event('input'));
    } else if (closingChars.has(char) && start === end && value[start] === char) { // 閉括號：跳過
        e.preventDefault();
        editorInput.selectionStart = editorInput.selectionEnd = start + 1;
    }
});

// Backspace 成對刪除（keydown 在桌機鍵盤更可靠）
editorInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Backspace') return;
    const { selectionStart: start, selectionEnd: end, value } = editorInput;
    if (start === end && start > 0 && pairs[value[start - 1]] === value[start]) {
        e.preventDefault();
        editorInput.setRangeText('', start - 1, start + 1, 'end');
        editorInput.selectionStart = editorInput.selectionEnd = start - 1;
        editorInput.dispatchEvent(new Event('input'));
    }
});

addMusicButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            audioManager.setBackgroundMusic(url);
            idbSet('simai_resource_bgm', file);
        }
    };
    input.click();
});

function applyHighlight(text) {
    highlightLayer.innerHTML = getHighlight(text);
}

const slideInputDebounce = debounce(() => {
    timeControlSliding = false;
    idbSet('simai_timeControl', realTime).then(() => {
        //console.log("已儲存時間控制值到 IndexedDB:", realTime);
    }).catch((error) => {
        console.error("儲存時間控制值到 IndexedDB 失敗:", error);
    });
}, 100);

slider.addEventListener('input', () => {
    timeControlSliding = true;
    const value = parseFloat(slider.value);
    globalTime = value - musicDelay;
    realTime = value;
    audioManager.stopAllLongSounds();

    if (playButton.dataset.playing === 'true') {
        // 2. 播放中拖動：音樂即時同步跳轉 (Seek)
        // 注意：Web Audio API 重建 Source Node 很快，但極速拖動可能會有噴麥音
        audioManager.playBGM(realTime);
    } else {
        // 3. 暫停中拖動：只需停止 BGM 並更新畫布預覽
        audioManager.stopBGM();
        draw();
    }
    slideInputDebounce();
});

let bgmUpdateTimer = null;

if (keepRenderingWhilePause) requestAnimationFrame(update);

playButton.addEventListener('click', () => {
    bgmUpdateTimer = null; // 重置 BGM 更新計時器
    if (playButton.dataset.playing === 'true') {
        playButton.dataset.playing = 'false';
        playButton.children[0].innerText = "play_arrow";
        lastTimestamp = null;

        // --- 停止音效與 BGM ---
        audioManager.stopAllLongSounds();
        audioManager.stopBGM();

        notes.forEach(n => n.riserActive = false); // 強制重置標記
    } else {
        playButton.dataset.playing = 'true';
        playButton.children[0].innerText = "pause";
        lastTimestamp = performance.now();

        // --- 從當前的 realTime 同步啟動 BGM ---
        audioManager.playBGM(realTime);

        if (!keepRenderingWhilePause) requestAnimationFrame(update);
    }
    slideInputDebounce();
});

stopButton.addEventListener('click', () => {
    bgmUpdateTimer = null;
    playButton.dataset.playing = 'false';
    playButton.children[0].innerText = "play_arrow";
    lastTimestamp = null;
    realTime = 0;
    globalTime = realTime - musicDelay;
    slider.value = realTime;

    // --- 停止音效與 BGM ---
    audioManager.stopAllLongSounds();
    audioManager.stopBGM();

    notes.forEach(n => n.riserActive = false); // 強制重置標記

    draw(); // 立即更新畫布，反映停止狀態
});

getNowNoteIndex.addEventListener('click', () => {
    const point = rawData.slice(0, nowIndex + 1).join(',').length;
    // 2. 設定游標位置
    editorInput.selectionStart = point;
    editorInput.selectionEnd = point;
    editorInput.focus();
});

function indexFromCursor(point) {
    if (!rawData || rawData.length === 0) return 0;
    let cum = 0;
    for (let i = 0; i < rawData.length; i++) {
        cum += rawData[i].length;
        if (point <= cum) return i; // 若游標在該項內容內或緊接其後（不含逗號），回傳 i
        cum += 1; // 加上分隔用的逗號長度
    }
    return rawData.length - 1; // 超出則回傳最後一項
}

getCursorNoteIndex.addEventListener('click', () => {
    const point = editorInput.selectionStart;
    nowIndex = indexFromCursor(point);
    for (let i = 0; i < notes.length; i++) {
        if (notes[i].index === nowIndex) {
            const value = notes[i].time + musicDelay;
            globalTime = value - musicDelay;
            realTime = value;
            slider.value = realTime;
            slideInputDebounce();
            audioManager.stopAllLongSounds();

            if (playButton.dataset.playing === 'true') {
                audioManager.playBGM(realTime);
            } else {
                draw();
            }

            editorInput.focus();
            break;
        }
    }
});

/*
function getShapeAt(x, y) {
    let found = null;
    for (let i = touchPaths.length - 1; i >= 0; i--) {
        if (ctx.isPointInPath(touchPaths[i].path, x, y)) {
            found = touchPaths[i].id;
            break;
        }
    }
    return found;
}
 
// 4. 事件監聽
const handlePointer = (e) => {
    const rect = canvas.getBoundingClientRect();
    // console.log(`Pointer Event: ${e.type} - ID: ${e.pointerId} at (${e.clientX - rect.left - canvas.width / 2}, ${e.clientY - rect.top - canvas.height / 2})`);
    const id = getShapeAt(e.clientX - rect.left, e.clientY - rect.top);
 
    if (id) {
        activePointers.set(e.pointerId, id);
    } else {
        activePointers.delete(e.pointerId); // 移出有效區域時刪除
    }
    draw();
};
 
const removePointer = (e) => {
    activePointers.delete(e.pointerId); // 放開或離開時刪除
    draw();
};
 
// 支援按下與移動時高亮
canvas.addEventListener('pointerdown', handlePointer);
canvas.addEventListener('pointermove', handlePointer);
 
// 支援放開、移出、中斷時取消高亮
canvas.addEventListener('pointerup', removePointer);
canvas.addEventListener('pointerleave', removePointer);
canvas.addEventListener('pointercancel', removePointer); // 處理觸控被系統中斷的情況
*/

function update(timestamp) {
    if (lastTimestamp === null) lastTimestamp = timestamp;
    const dt = (timestamp - lastTimestamp) / 1000; // 秒
    lastTimestamp = timestamp;
    if (playButton.dataset.playing === 'true') {
        realTime += dt;
        globalTime = realTime - musicDelay;
        if (bgmUpdateTimer === null || bgmUpdateTimer >= 1) {
            //audioManager.playBGM(realTime);
            if (audioManager.getBGMDuration() > 0 && audioManager.getBGMTime() !== realTime) realTime = audioManager.getBGMTime();
            bgmUpdateTimer = 0;
        }
        bgmUpdateTimer = (bgmUpdateTimer || 0) + dt;
        slider.value = realTime;
        draw(dt);
        if (globalTime >= endTime) {
            playButton.dataset.playing = 'false';
            playButton.children[0].innerText = "play_arrow";
            globalTime = endTime;
            slider.value = realTime; // 保持 slider 值與 realTime 一致
        } else {
            if (!keepRenderingWhilePause) requestAnimationFrame(update);
        }
    }
    if (keepRenderingWhilePause) {
        requestAnimationFrame(update);
        draw(dt);
    };
}

function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvasContainer.clientWidth * dpr;
    const h = canvasContainer.clientHeight * dpr;
    const p = Math.min(w, h) / scaleBase * scale;
    canvas.width = w;
    canvas.height = h;
    if (!secondCtx) ctx.setTransform(p, 0, 0, p, w / 2, h / 2);
    resizeVisualEditor();
    draw();
}

popup.addEventListener('click', openSecondWindow);

function openSecondWindow() {
    if (externalWindow && !externalWindow.closed) {
        externalWindow.focus();
        return;
    }
    externalWindow = window.open("", "SecondaryCanvas", "width=800,height=800");
    // 注入基礎樣式與 Canvas
    const style = externalWindow.document.createElement('style');
    style.textContent = `
            body {
                margin: 0;
                padding: 0;
                overflow: hidden;
            }
            #canvasContainer {
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
            }
            #canvasContainer img {
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                object-fit: contain;
                scale: 0.899;
            }
            #secondary {
                position: absolute;
                top: 0;
                left: 0;
            }
        `;
    externalWindow.document.head.appendChild(style);
    externalWindow.document.body.innerHTML = `
            <div id="canvasContainer">
                <img src="./Skin/outline.png" alt="">
                <canvas id="secondary"></canvas>
            </div>
        `;
    const extCanvas = externalWindow.document.getElementById('secondary');
    // 這裡需要處理縮放邏輯，建議參考你原有的 resize 函式
    extCanvas.width = 800;
    extCanvas.height = 800;
    secondCtx = extCanvas.getContext('2d');

    externalWindow.addEventListener('beforeunload', () => {
        console.log("警告：外部視窗即將關閉");
        // 你可以在這裡重置主視窗的某些狀態
        secondCtx = null;
        ctx = canvas.getContext('2d'); // 切回主 Canvas 的上下文
    });

    const syncResize = () => {
        const dpr = externalWindow.devicePixelRatio || 1;
        const size = Math.min(externalWindow.innerWidth, externalWindow.innerHeight);
        extCanvas.width = externalWindow.innerWidth * dpr;
        extCanvas.height = externalWindow.innerHeight * dpr;

        // 重新套用你的座標系統 (這點最重要！)
        const p = size / scaleBase * scale * dpr;
        secondCtx.setTransform(p, 0, 0, p, extCanvas.width / 2, extCanvas.height / 2);
        draw();
    };

    syncResize();

    externalWindow.addEventListener('resize', syncResize);
    ctx.clearRect(-canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2); // 清除主 Canvas

    ctx = secondCtx; // 切換到第二個 Canvas 的上下文

    draw(); // 重新繪製到第二個 Canvas
}

window.addEventListener('resize', resize);

resize();
let playClock = [false, false, false, false];
function draw(dt = 0) {
    // 1. 清除畫布
    ctx.clearRect(-canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2);
    if (!renderer) return;

    let foundIndexForThisFrame = false;
    // 如果當前時間比譜面中第一個音符還早，就將 index 設為 0
    if (notes.length > 0 && notes[0] && realTime < notes[0].time) {
        nowIndex = 0;
    }

    // 2. 準備繪製桶子 (定義視覺疊加順序：由下而上)
    const buckets = {
        slide: [],
        tapnhold: [],
        touch: []
    };

    const playing = playButton.dataset.playing === 'true';

    // 3. 核心迴圈：一邊處理音效邏輯，一邊將音符分類到桶子
    if (playing && readyBeat) {
        for (let i = 0; i < 4; i++) {
            const clockT = (i / 4) * (240 / clockBpm) - globalTime;
            if (clockT > 0) {
                playClock[i] = false;
            } else {
                if (!playClock[i]) {
                    audioManager.queueSoundSingle('clock', clockT);
                }
                playClock[i] = true;
            }
        }
    }
    settings.play_combo = 0;
    for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        const noteT = (note.time - globalTime);
        const t = 1 - renderer.timeFunction(noteT * (settings.speed * 0.8833 + 0.8167));
        const touchT = 1 - renderer.timeFunction(noteT * (settings.touchSpeed * 0.8833 + 0.8167));
        const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0);

        if (!foundIndexForThisFrame && realTime >= note.time && note.type !== "slide") {
            nowIndex = note.index ?? nowIndex;
            foundIndexForThisFrame = true; // 標記本幀已找到，防止被更早的音符覆蓋
        }

        if (noteT < 0) {
            if (note.type === "slide") {
                if (note.lastSlide && skipT + noteT < 0) {
                    settings.play_combo++;
                }
            } else if (note.type === "hold") {
                if (skipT + noteT < 0) {
                    settings.play_combo++;
                }
            } else {
                if (note.type === "touch" && note.holdDuration !== undefined) {
                    if (skipT + noteT < 0) {
                        settings.play_combo++;
                    }
                } else {
                    settings.play_combo++;
                }
            }
        }

        if (playing && !timeControlSliding) {
            // A. 處理 Riser (Touch Hold 長音)
            const noteId = `riser_${note.pos}_${note.time}`;
            const isInsideHold = note.type === "touch" && note.holdDuration > 0 && noteT <= 0 && -noteT < note.holdDuration;

            if (isInsideHold) {
                if (!note.riserActive) {
                    const soundOffset = -noteT;
                    audioManager.startLongSound(noteId, 'touchHold_riser', soundOffset);
                    note.riserActive = true;
                }
            } else if (note.riserActive) {
                audioManager.stopLongSound(noteId);
                note.riserActive = false;
            }

            // B. 處理開始打擊音效 (Tap / Slide Start / Hold Start)
            if (noteT <= 0 && !note.startEffectPlayed) {
                // 排除連鎖滑軌的非首個箭頭音效
                if (!(note.type === "slide" && !note.firstSlide)) {
                    audioManager.queueSound(note, note.time + (note.slideDelay ?? 0));
                }
                note.startEffectPlayed = true;
            }

            // C. 處理結束音效 (Hold End / Slide End / Hanabi)
            if (-noteT > skipT && !note.endEffectPlayed) {
                if ((note.type === "slide" && note.lastSlide && note.isBreak) || (note.type !== "slide" && note.isBreak) || note.isHanabi || (note.holdDuration !== undefined && note.type !== "tap")) {
                    audioManager.queueSound(note, note.time + skipT);
                }
                note.endEffectPlayed = true;
            }
        }

        // --- 倒帶或 Slider 拖動時的狀態重置 ---
        if (noteT > 0) {
            note.startEffectPlayed = false;
            note.endEffectPlayed = false;
            if (note.riserActive) {
                audioManager.stopLongSound(`riser_${note.pos}_${note.time}`);
                note.riserActive = false;
            }
        }

        // --- 效能過濾：如果太早或太晚，就不處理繪製 ---
        const isVisible = (note.type === "slide" ?
            t >= settings.middleDistance :
            (note.type === "touch" ?
                touchT >= -1 :
                t >= -1))
            && -noteT <= skipT + settings.effectDecayTime * (note.isHanabi ? 2 : 1);

        // --- 將可見音符丟進對應桶子 ---
        if (isVisible) {
            if (note.type === 'slide') buckets.slide.push(note);
            else if (note.type === 'hold') buckets.tapnhold.push(note);
            else if (note.type === 'tap') buckets.tapnhold.push(note);
            else if (note.type === 'touch') buckets.touch.push(note);
        }
    }

    renderer.drawFrame({
        globalTime,
        notes,
        buckets,
        dt,
        showSensor,
        backgroundImage
    });

    // 5. 統一更新 Web Audio API 播放佇列
    audioManager.update(globalTime);

    // visual 模式使用獨立 canvas 渲染時間軸預覽
    renderVisualEditor();
}