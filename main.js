import { openDB, idbGet, idbSet } from './indexDB.js';
import { scaleBase, getButton, debounce, throttle, audioManager, getHighlight, parseMaidata, popupWindow, loadAllImages, simpleToast, formatSize, getSimaiDataString, contantRotate, flipSelectedText, clamp, createLabeledInput, createLabeledInput1, createCustomSlider } from './helper.js';
import { SimaiRenderer, SimaiVisualEditor, SimaiPreviewRenderer } from './renderer.js';
import { simaiDecode } from './decode.js';
// Register service worker (works when served over http(s) or localhost)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
            console.log('Service worker registered:', reg);

            reg.update();
        })
        .catch((err) => {
            console.warn('Service worker registration failed:', err);
        });
}

let
    images,
    readyBeat = false,
    maidata = {},
    nowDifficulty = 5,
    backgroundImage,
    backgroundVideo,
    renderer,
    visualEditorRenderer,
    previewRender,
    recorder,
    settings = {},
    isContextEdited = false,
    isVerticalMode = (document.documentElement.clientWidth / document.documentElement.clientHeight) <= 0.587;

window.popupWindow = popupWindow;
window.simpleToast = simpleToast;

_init();

const canvas = document.getElementById('main');
const canvasContainer = document.getElementById('canvasContainer');
const slider = document.getElementById('timeControl');
const keyboardButton = getButton("keyboard", "control");
const playButton = getButton("play/pause", "control");
const hideButton = getButton("hide", "control");
const stopButton = getButton("stop", "control");
const resetButton = getButton("reset", "control");
const quickGenerateButton = getButton("quickGenerate", "utility");
const hideEditorButton = getButton("hideEditor", "utility");
const hideUtilityButton = document.querySelector("#utilityContainer .closeBtn");
const readyBeatCheckbox = getButton("readyBeat", "utility").children[0];
const offsetInput = getButton("offset", "utility").children[0];
const changeDifficulty = getButton("changeDifficulty", "utility").children[0];
const addMusicButton = getButton("addMusic", "utility");
const readMaidataButton = getButton("readMaidata", "utility");
const readZipButton = getButton("readZip", "utility");
const chartInfoButton = getButton("chartInfo", "utility");
const settingsButton = getButton("settings", "utility");
const popup = getButton("popup", "utility");
const folderInput = getButton("readFolder", "utility");
const getNowNoteIndex = getButton("getNowNoteIndex", "utility");
const changeDisplayMode = getButton("displayMode", "utility").children[0];
const getCursorNoteIndex = getButton("getCursorNoteIndex", "utility");
const visualEditor = document.getElementById('visualEditor');
const downloadButton = getButton("download", "utility");
const createNewButton = getButton("createNew", "utility");
const warnEl = document.querySelector("#utilityContainer .warnbtn");
const editMusicButton = getButton("editMusic", "utility");
const rCwiseButton = getButton("rotateClockwise", "utility");
const rCCwiseButton = getButton("rotateCounterClockwise", "utility");
const r180Button = getButton("rotate180", "utility");
const fVerticalButton = getButton("flipVertical", "utility");
const fHorizontalButton = getButton("flipHorizontal", "utility");
const editorBackgroundImage = document.getElementById('backgroundImage');
const editorBackgroundVideo = document.getElementById('backgroundVideo');
const tapBpmButton = getButton("tapBpm", "utility");
const manageResourcesButton = getButton("manageResources", "utility");
const playbackSpeedInput = getButton("playbackSpeed", "utility").children[0];
const undoButton = getButton("undo", "utility");
const redoButton = getButton("redo", "utility");
const helpButton = getButton("help", "utility");
const recordVideoButton = getButton("recordVideo", "utility");
const fetchFromMainoteButton = getButton("fetchFromMainote", "utility");
const previewContainer = document.getElementById('miniPreviewContainer');
const previewCanvas = document.getElementById('miniPreview');
const previewZoomInButton = document.getElementById('mpzoomIn');
const previewZoomOutButton = document.getElementById('mpzoomOut');
const editorContainer = document.getElementById('editorContainer');
const editorInput = document.getElementById('editor-input');
const highlightLayer = document.getElementById('highlight-layer');
const showPlayControlsBtn = document.getElementById('showPlayControlsBtn');

let notes = [], endTime = 1, musicDelay = 0, rawData = [], dataIndexToTime = [];

let ctx = canvas.getContext('2d');
const scale = 0.98;
const
    MAX_ZOOM = 1000,
    MIN_ZOOM = 15,
    ZOOM_STEP = 10;

export const defaultSettings = {
    // Game
    speed: 6.5,
    touchSpeed: 7,
    slideSpeed: 0,
    middleDisplay: 1, // 0: 關閉, 1: COMBO, 2: 分數
    moviebrightness: -4,
    showSensor: true,
    pinkStars: false,
    rotateStars: false,
    // Misc
    displayMode: 'simai', // simai 或 visual
    middleDistance: 0.25,
    effectDecayTime: 0.4,
    hanabiEffectDecayTime: 0.8,
    noteBaseSize: 11,
    maxSlideCount: 500, // on screen,
    inputDebounceTime: 800, // ms
    showSensorTextWhenPaused: true,
    hideBackgroundWhenPaused: false,
    disableVideo: false, // 關閉影片背景（如果有的話）
    visualZoom: 200, // 視覺模式下的縮放倍率
    slideIllegalRed: false,
    showUI: false,
    // Sound & Playback
    playbackSpeed: 1, // 播放速度，1 是正常速度
    globalVolume: 0.65, // 全局音量，0 到 1 之間
    musicVolume: 0.8, // 音樂音量，0 到 1 之間
    SfxVolume: 1, // 音效音量，0 到 1 之間
    sfxVolumes: {
        'clock': 0.8,
        'answer': 1,
        'judge': 0.4,
        'judge_ex': 0.4,
        'judge_break': 0.4,
        'judge_break_slide': 0.4,
        'break': 0.4,
        'slide': 0.4,
        'break_slide_start': 0.4,
        'touch': 0.4,
        'hanabi': 0.6,
    },
    autoPauseOnScroll: true, // 滾動時自動暫停
    autocomplete: true, // 編輯器自動補齊括號
    cursorFollow: true, // 游標跟隨
    restoreDefaults: function () {
        settings = { ...defaultSettings };
    }
};
const settingsConfig = [
    {
        label: '基本',
        items: [
            { id: 'speed', type: 'number', label: ' Tap/Hold 速度', step: 0.1, min: 1, max: 20, def: defaultSettings.speed },
            { id: 'slideSpeed', type: 'number', label: ' Slide 速度', step: 0.1, min: -1, max: 1, def: defaultSettings.slideSpeed, },
            { id: 'touchSpeed', type: 'number', label: ' Touch 速度', step: 0.1, min: 1, max: 20, def: defaultSettings.touchSpeed },
            { id: 'middleDisplay', type: 'dropdown', label: '中間顯示', options: [{ value: 0, label: '關閉' }, { value: 1, label: 'COMBO' }, { value: 2, label: '分數' }], def: defaultSettings.middleDisplay },
            {
                id: 'moviebrightness',
                type: 'number',
                label: '背景暗度',
                step: 1, min: -4, max: 0,
                def: defaultSettings.moviebrightness || 0,
                apply: (val) => {
                    if (backgroundImage) editorBackgroundImage.style.filter = `brightness(${1 + 0.1875 * val})`;
                    if (backgroundVideo) editorBackgroundVideo.style.filter = `brightness(${1 + 0.1875 * val})`;
                },
            },
        ]
    },
    {
        label: '顯示',
        items: [
            {
                id: 'showSensor',
                type: 'checkbox',
                label: '顯示感應器',
                def: defaultSettings.showSensor
            },
            {
                id: 'showSensorTextWhenPaused',
                type: 'checkbox',
                label: '暫停時顯示感應器文字',
                def: defaultSettings.showSensorTextWhenPaused
            },
            {
                id: 'hideBackgroundWhenPaused',
                type: 'checkbox',
                label: '暫停時隱藏背景',
                def: defaultSettings.hideBackgroundWhenPaused
            },
            {
                id: 'pinkStars',
                type: 'checkbox',
                label: '粉紅色星星',
                def: defaultSettings.pinkStars || false
            },
            {
                id: 'rotateStars',
                type: 'checkbox',
                label: '星星旋轉',
                def: defaultSettings.rotateStars || false
            }
        ]
    },
    {
        label: '音效',
        items: [
            {
                id: 'globalVolume', type: 'range', label: '全局音量', min: 0, max: 1, step: 0.1, def: defaultSettings.globalVolume,
                apply: (val) => { audioManager.setGlobalVolume(val); }
            },
            {
                id: 'musicVolume', type: 'range', label: '音樂音量', min: 0, max: 1, step: 0.1, def: defaultSettings.musicVolume,
                apply: (val) => { audioManager.setBGMVolume(val); }
            },
            {
                id: 'SfxVolume', type: 'range', label: '音效音量', min: 0, max: 1, step: 0.1, def: defaultSettings.SfxVolume,
                apply: (val) => { audioManager.setSFXVolume(val); }
            },
            {
                id: 'sfxVolumes', type: 'object', label: '個別音效音量', def: defaultSettings.sfxVolumes,
                apply: (val) => { audioManager.setSFXVolumes(val); }
            }
        ]
    },
    {
        label: '其他',
        items: [
            {
                id: 'autocomplete', type: 'checkbox', label: '編輯器自動補齊括號', def: defaultSettings.autocomplete
            },
            {
                id: 'maxSlideCount', type: 'number', label: '螢幕上最大滑星顯示數量', min: 1, max: 100, step: 1, def: defaultSettings.maxSlideCount
            },
            {
                id: 'inputDebounceTime', type: 'number', label: '編輯器刷新時間 (ms)', min: 0, max: 2000, step: 50, def: defaultSettings.inputDebounceTime
            },
            {
                id: 'showUI', type: 'checkbox', label: '顯示FPS介面', def: defaultSettings.showUI
            },
            {
                id: 'autoPauseOnScroll', type: 'checkbox', label: '滾動時自動暫停', def: defaultSettings.autoPauseOnScroll
            }
        ]
    }
];

let globalTime = 0, realTime = 0;
let lastTimestamp = null;
let secondCtx = null;
let externalWindow = null;
let timeControlSliding = false; // 新增滑動狀態標記
let keepRenderingWhilePause = false; // 是否在暫停時繼續渲染（保持畫面更新）
let nowIndex = 0;
let visualCtx = null;
let warnings = [], warningPositions = [];
let decodedTags = [];
let playScoreRes = { tap: 0, hold: 0, slide: 0, touch: 0, break: 0, score: 0, breakScore: 0, invScore: 0 };

let lastCanvasSize = { w: 0, h: 0 };
let lastVisualEditorSize = { w: 0, h: 0 };

// 上次對影片進行 seek 的時間（秒），用來避免頻繁設定 currentTime
let lastVideoSeekTime = 0;
const VIDEO_MIN_SEEK_INTERVAL = 0.8; // 最短 seek 間隔（秒）
const VIDEO_SEEK_THRESHOLD = 0.3; // 當差距超過此值才執行 seek（秒）

let clockBpm = 60;

let playCombo = 0, playScore = 0;

const isVisualMode = () => settings.displayMode === 'visual';
const previewVisible = () => (previewContainer.style.display !== 'none' && document.getElementById('playControls').style.display !== 'none');

const saveSettingsDebounce = debounce(() => {
    idbSet('simai_settings', JSON.stringify(settings)).catch((error) => {
        console.error('儲存設定到 IndexedDB 失敗:', error);
    });
}, 300);

const setEndtime = (e) => {
    endTime = Math.max(e + 1, audioManager.getBGMDuration() + 1);
    slider.max = endTime + musicDelay;
    updateSlider(globalTime);
};

const updateSlider = (time) => {
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const progressPercent = ((time - min) / (max - min)) * 100;
    slider.value = time;
    slider.style.background = `linear-gradient(90deg, #962d2d 0%, #962d2d ${progressPercent}%, #222 ${progressPercent}%, #222 100%)`;
};

manageResourcesButton.addEventListener('click', async () => {
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

/**
 * 1. 音訊緩衝區管理器（負責音訊運算、備份與復原）
 */
class BgmEditorBufferManager {
    constructor(audioManager) {
        this.audioManager = audioManager;
        // 💾 核心儲存：保留最原始的音訊備份
        this.originalBuffer = audioManager.bgmBuffer;
        // 當前編輯中的緩衝區
        this.currentBuffer = audioManager.bgmBuffer;
    }

    get buffer() { return this.currentBuffer; }
    get duration() { return this.currentBuffer.duration; }
    get sampleRate() { return this.currentBuffer.sampleRate; }

    /** 🟢 復原功能：還原至最原始匯入的狀態 */
    restoreOriginal() {
        this.currentBuffer = this.originalBuffer;
        this.audioManager.bgmBuffer = this.originalBuffer;
    }

    /** 🛠️ 核心：建立新的 AudioBuffer 並複製資料 */
    createNewBuffer(newLength, copyCallback) {
        const ctx = this.audioManager.ctx;
        const oldBuf = this.currentBuffer;
        const newBuffer = ctx.createBuffer(oldBuf.numberOfChannels, newLength, oldBuf.sampleRate);

        for (let ch = 0; ch < oldBuf.numberOfChannels; ch++) {
            const oldData = oldBuf.getChannelData(ch);
            const newData = newBuffer.getChannelData(ch);
            copyCallback(oldData, newData);
        }

        this.currentBuffer = newBuffer;
        this.audioManager.bgmBuffer = newBuffer;
        return newBuffer;
    }

    /** ✂️ 裁切音訊：刪除起點前或指定長度的音訊 */
    cropStart(offsetTime) {
        const startSample = Math.floor(offsetTime * this.sampleRate);
        const newLen = this.currentBuffer.length - startSample;
        if (newLen <= 0) return false;

        this.createNewBuffer(newLen, (oldData, newData) => {
            newData.set(oldData.subarray(startSample));
        });
        return true;
    }

    /** ➕ 補白音訊：在開頭插入指定秒數的靜音 */
    padStart(seconds) {
        const padSamples = Math.floor(seconds * this.sampleRate);
        const newLen = this.currentBuffer.length + padSamples;

        this.createNewBuffer(newLen, (oldData, newData) => {
            newData.set(oldData, padSamples); // 前面自動補 0 靜音
        });
    }
}

/**
 * 2. 波形畫布管理器（負責視覺波形渲染計算）
 */
class BgmEditorWaveformCanvas {
    constructor(canvas, bufferManager) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.bm = bufferManager;
    }

    /** 🎨 繪製渲染核心 */
    draw(offsetTime, visualOffset, zoomValue) {
        const bgmBuffer = this.bm.buffer;
        const duration = this.bm.duration;
        const data = bgmBuffer.getChannelData(0);

        const zoom = Math.max(1, parseFloat(zoomValue) || 1);
        const viewLength = Math.max(0.1, duration / zoom);
        const viewCenter = Math.min(duration, Math.max(0, offsetTime + visualOffset));

        let viewStart = viewCenter - viewLength / 2;
        if (viewStart < 0) viewStart = 0;
        if (viewStart + viewLength > duration) viewStart = Math.max(0, duration - viewLength);
        const viewEnd = viewStart + viewLength;

        const startSample = Math.floor(viewStart * this.bm.sampleRate);
        const endSample = Math.min(data.length, Math.ceil(viewEnd * this.bm.sampleRate));
        const viewSamples = Math.max(1, endSample - startSample);
        const step = Math.ceil(viewSamples / this.canvas.width);

        // 畫布清理與背景
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. 繪製藍色音訊波形
        this.ctx.fillStyle = '#1e90ff';
        for (let i = 0; i < this.canvas.width; i++) {
            let min = 1.0, max = -1.0;
            const sampleBase = startSample + Math.floor((i / this.canvas.width) * viewSamples);
            for (let j = 0; j < step; j++) {
                const idx = sampleBase + j;
                if (idx >= endSample) break;
                const datum = data[idx];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            const y = (1 - max) * this.canvas.height / 2;
            const h = Math.max(1, (max - min) * this.canvas.height / 2);
            this.ctx.fillRect(i, y, 1, h);
        }

        // 2. 繪製紅色播放頭
        const x = ((offsetTime - viewStart) / viewLength) * this.canvas.width;
        this.ctx.strokeStyle = '#ff3333';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(Math.max(0, Math.min(this.canvas.width, x)), 0);
        this.ctx.lineTo(Math.max(0, Math.min(this.canvas.width, x)), this.canvas.height);
        this.ctx.stroke();
    }
}

/**
 * 3. 主要事件監聽觸發入口
 */
editMusicButton.addEventListener('click', () => {
    if (!audioManager.bgmBuffer) {
        simpleToast({ content: '請先匯入音樂', type: 'warning' });
        return;
    }

    // 初始化音訊管理器與畫布管理器
    const bufferManager = new BgmEditorBufferManager(audioManager);

    let offsetTime = musicDelay;
    let visualOffset = 0;
    let isPreviewing = false;
    let previewInterval;

    // 建立 UI 容器與元素
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:10px;font-size:13px;width:min(90vw,600px);';

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 120;
    canvas.style.cssText = 'width:100%;height:120px;background:#111;border:1px solid #555;border-radius:4px;cursor:crosshair;';
    container.appendChild(canvas);

    const wfCanvas = new BgmEditorWaveformCanvas(canvas, bufferManager);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:15px;align-items:center;flex-wrap:wrap;';
    controls.innerHTML = `
        <label style="display:flex;align-items:center;gap:5px;">
            BPM: <input type="number" id="editBpmInput" value="${clockBpm}" style="width:60px;background:#222;color:#fff;border:1px solid #555;padding:4px;border-radius:4px;">
        </label>
        <label style="display:flex;align-items:center;gap:5px;">
            第一拍偏移(s): <input type="number" id="editOffsetInput" value="${musicDelay.toFixed(3)}" step="0.001" style="width:80px;background:#222;color:#fff;border:1px solid #555;padding:4px;border-radius:4px;">
        </label>
        <label style="display:flex;align-items:center;gap:5px;">
            縮放: <input type="number" id="editZoomInput" value="1" min="1" max="20" step="0.1" style="width:60px;background:#222;color:#fff;border:1px solid #555;padding:4px;border-radius:4px;">x
        </label>
        <label style="display:flex;align-items:center;gap:5px;">
            BGM音量: <input type="number" id="editBgmVolumeInput" value="0.75" min="0" max="1" step="0.05" style="width:60px;background:#222;color:#fff;border:1px solid #555;padding:4px;border-radius:4px;">x
        </label>
        <label style="display:flex;align-items:center;gap:5px;">
            音訊偏移(s): <input type="number" id="editShiftInput" value="0" step="0.001" style="width:80px;background:#222;color:#fff;border:1px solid #555;padding:4px;border-radius:4px;">
        </label>
    `;
    container.appendChild(controls);

    // 快捷 DOM 查詢
    const bpmInput = controls.querySelector('#editBpmInput');
    const offsetInputNode = controls.querySelector('#editOffsetInput');
    const zoomInput = controls.querySelector('#editZoomInput');
    const bgmVolumeInput = controls.querySelector('#editBgmVolumeInput');
    const shiftInput = controls.querySelector('#editShiftInput');

    // 建立視覺偏移 Slider
    const visualOffsetSlider = document.createElement('input');
    visualOffsetSlider.type = 'range';
    visualOffsetSlider.min = -5;
    visualOffsetSlider.max = 5;
    visualOffsetSlider.step = 0.01;
    visualOffsetSlider.value = 0;
    visualOffsetSlider.style.cssText = 'width:100%;';

    const visualOffsetLabel = document.createElement('div');
    visualOffsetLabel.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#ccc;';
    visualOffsetLabel.innerHTML = `<span>視覺偏移: </span><strong id="visualOffsetValue">0.00s</strong>`;

    const offsetControl = document.createElement('div');
    offsetControl.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%;';
    offsetControl.appendChild(visualOffsetLabel);
    offsetControl.appendChild(visualOffsetSlider);
    container.appendChild(offsetControl);

    // 封裝重繪快取方法
    const triggerRedraw = () => {
        wfCanvas.draw(offsetTime, visualOffset, parseFloat(zoomInput.value));
    };

    // 節拍器與控制功能
    const playClockBtn = document.createElement('button');
    playClockBtn.innerText = '節拍器預覽 (從播放頭)';
    playClockBtn.style.cssText = 'padding:4px 10px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;';
    controls.appendChild(playClockBtn);

    const stopPreview = () => {
        if (isPreviewing) {
            clearInterval(previewInterval);
            audioManager.stopBGM();
            playClockBtn.innerText = '節拍器預覽 (從播放頭)';
            isPreviewing = false;
        }
    };

    // --- UI 事件監聽綁定 ---
    zoomInput.addEventListener('change', triggerRedraw);
    offsetInputNode.addEventListener('change', (e) => {
        offsetTime = parseFloat(e.target.value) || 0;
        triggerRedraw();
    });

    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const zoom = parseFloat(zoomInput.value) || 1;
        offsetTime = Math.max(0, (x / rect.width) * bufferManager.duration / zoom - visualOffset);
        offsetInputNode.value = offsetTime.toFixed(3);
        triggerRedraw();
        if (isPreviewing) {
            audioManager.playBGM(offsetTime, parseFloat(bgmVolumeInput.value) || 0.75);
        }
    });

    visualOffsetSlider.addEventListener('input', () => {
        visualOffset = parseFloat(visualOffsetSlider.value) || 0;
        container.querySelector('#visualOffsetValue').innerText = `${visualOffset.toFixed(2)}s`;
        triggerRedraw();
    });

    playClockBtn.addEventListener('click', () => {
        if (isPreviewing) {
            stopPreview();
        } else {
            const bpm = parseFloat(bpmInput.value) || clockBpm;
            const msPerBeat = 60000 / bpm;
            audioManager.playBGM(offsetTime, parseFloat(bgmVolumeInput.value) || 0.75);

            let expectedTickTime = performance.now() + msPerBeat;
            previewInterval = setInterval(() => {
                const now = performance.now();
                if (now >= expectedTickTime) {
                    audioManager.play('clock');
                    expectedTickTime += msPerBeat;
                }
            }, 10);

            playClockBtn.innerText = '停止預覽';
            isPreviewing = true;
        }
    });

    // --- 功能性按鈕箱配置 ---
    const actionBox = document.createElement('div');
    actionBox.style.cssText = 'display:flex;gap:10px;margin-top:5px;flex-wrap:wrap;';

    // 按鈕 1：裁切
    const cropBtn = document.createElement('button');
    cropBtn.innerText = '裁去播放頭前所有音訊';
    cropBtn.style.cssText = 'padding:4px 8px;background:#8b0000;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;';
    cropBtn.addEventListener('click', () => {
        if (offsetTime <= 0) return;
        if (!confirm('確定要從播放頭處裁切掉前面的音樂嗎？')) return;

        stopPreview();
        if (bufferManager.cropStart(offsetTime)) {
            offsetTime = 0;
            offsetInputNode.value = "0.000";
            triggerRedraw();
            simpleToast({ content: '音訊已自播放頭裁剪', type: 'success' });
        }
    });

    // 按鈕 2：依 BPM 補白
    const padBtn = document.createElement('button');
    padBtn.innerText = '在開頭補白 1 拍';
    padBtn.style.cssText = 'padding:4px 8px;background:#006400;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;';
    padBtn.addEventListener('click', () => {
        stopPreview();
        const bpm = parseFloat(bpmInput.value) || clockBpm;
        const secPerBeat = 60 / bpm;

        bufferManager.padStart(secPerBeat);
        offsetTime += secPerBeat;
        offsetInputNode.value = offsetTime.toFixed(3);
        triggerRedraw();
        simpleToast({ content: '已在音訊開頭補白', type: 'success' });
    });

    // 按鈕 3：精準自訂偏移（支援正負值）
    const shiftBtn = document.createElement('button');
    shiftBtn.innerText = '套用音訊偏移';
    shiftBtn.style.cssText = 'padding:4px 8px;background:#004a75;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;';
    shiftBtn.addEventListener('click', () => {
        const shiftSeconds = parseFloat(shiftInput.value) || 0;
        if (shiftSeconds === 0) return;

        stopPreview();
        if (shiftSeconds > 0) {
            bufferManager.padStart(shiftSeconds);
            offsetTime += shiftSeconds;
            simpleToast({ content: `已補白 ${shiftSeconds.toFixed(3)}s。`, type: 'success' });
        } else {
            if (Math.abs(shiftSeconds) >= bufferManager.duration) {
                simpleToast({ content: '裁剪長度超過總長。', type: 'error' });
                return;
            }
            bufferManager.cropStart(Math.abs(shiftSeconds));
            offsetTime = Math.max(0, offsetTime + shiftSeconds);
        }
        offsetInputNode.value = offsetTime.toFixed(3);
        triggerRedraw();
    });

    // ✨ 新增按鈕 4：緊急安全備份還原
    const restoreBtn = document.createElement('button');
    restoreBtn.innerText = '還原原始音訊';
    restoreBtn.style.cssText = 'padding:4px 8px;background:#444;color:#aaa;border:1px solid #555;border-radius:4px;cursor:pointer;';
    restoreBtn.addEventListener('click', () => {
        if (!confirm('確定要放棄本次視窗內的所有裁切/補白修改，還原成剛載入的音樂嗎？')) return;
        stopPreview();
        bufferManager.restoreOriginal();
        offsetTime = musicDelay;
        offsetInputNode.value = offsetTime.toFixed(3);
        triggerRedraw();
        simpleToast({ content: '已還原至最原始音訊狀態', type: 'info' });
    });

    actionBox.appendChild(cropBtn);
    actionBox.appendChild(padBtn);
    actionBox.appendChild(shiftBtn);
    actionBox.appendChild(restoreBtn); // 塞入還原按鈕
    container.appendChild(actionBox);

    // 初始化第一次繪製
    setTimeout(triggerRedraw, 100);

    // 彈出視窗配置
    popupWindow({
        title: '編輯音樂與第一拍 offset',
        customContent: container,
        width: 'max-content',
        buttons: [
            {
                text: '套用',
                onClick: (ctx) => {
                    const bpm = parseFloat(bpmInput.value) || clockBpm;
                    musicDelay = offsetTime;

                    // 連動更新外部編輯器控制項數值
                    if (typeof offsetInput !== 'undefined') offsetInput.value = musicDelay;
                    editorInput.value += `\n(${bpm})`;

                    if (typeof applyHighlight === 'function') applyHighlight(editorInput.value);
                    if (typeof inputDebounce === 'function') inputDebounce();
                    if (typeof offsetInputDebounce === 'function') offsetInputDebounce();

                    stopPreview();
                    ctx.close();
                }
            },
            {
                text: '取消',
                hideOnClick: true,
                onClick: () => {
                    stopPreview();
                    // 💥 使用者點取消，直接自動還原成點開前的狀態，不污染原始資料
                    bufferManager.restoreOriginal();
                }
            }
        ],
        onClose: () => {
            stopPreview();
        }
    });
});

tapBpmButton.addEventListener('click', () => {
    let taps = [];

    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:10px;font-size:13px;';

    const hint = document.createElement('div');
    hint.innerText = '請連續敲擊「Tap」至少 2 次以計算 BPM，建議 4 次以上會更穩定。';
    container.appendChild(hint);

    const stats = document.createElement('div');
    stats.style.cssText = 'display:flex;justify-content:space-between;gap:10px; flex-wrap:wrap;';
    stats.innerHTML = `
            <div>Tap 次數: <strong id="tapBpmCount">0</strong></div>
            <div>BPM: <strong id="tapBpmValue">--</strong></div>
        `;
    container.appendChild(stats);

    const tapButton = document.createElement('button');
    tapButton.type = 'button';
    tapButton.innerText = 'Tap';
    tapButton.style.cssText = 'width:100%;padding:10px 0;font-size:16px;font-weight:600;background:#333;color:#fff;border:1px solid #555;border-radius:6px;cursor:pointer;';
    container.appendChild(tapButton);

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.innerText = '重置';
    resetButton.style.cssText = 'width:100%;padding:8px 0;font-size:14px;background:#222;color:#fff;border:1px solid #444;border-radius:6px;cursor:pointer;';
    container.appendChild(resetButton);

    const message = document.createElement('div');
    message.style.cssText = 'color:#ccc;font-size:12px;line-height:1.4;';
    message.innerText = '尚未開始敲擊。';
    container.appendChild(message);

    const updateDisplay = () => {
        const countElem = container.querySelector('#tapBpmCount');
        const bpmElem = container.querySelector('#tapBpmValue');
        if (countElem) countElem.innerText = taps.length.toString();

        if (taps.length < 2) {
            if (bpmElem) bpmElem.innerText = '--';
            message.innerText = taps.length === 0 ? '尚未開始敲擊。' : '再敲一次即可計算 BPM。';
            return;
        }

        const intervals = [];
        for (let i = 1; i < taps.length; i++) {
            intervals.push(taps[i] - taps[i - 1]);
        }
        const avg = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
        const bpm = 60000 / avg;
        if (bpmElem) bpmElem.innerText = isFinite(bpm) ? bpm.toFixed(1) : '--';
        message.innerText = `目前使用 ${intervals.length} 個間隔計算 BPM。建議使用 4 次以上敲擊以減少誤差。`;
    };

    tapButton.addEventListener('click', () => {
        taps.push(performance.now());
        if (taps.length > 12) taps.shift();
        updateDisplay();
    });

    resetButton.addEventListener('click', () => {
        taps = [];
        updateDisplay();
    });

    popupWindow({
        title: 'Tap BPM',
        customContent: container,
        buttons: [
            {
                text: '加入 BPM',
                onClick: (ctx) => {
                    if (taps.length < 2) {
                        simpleToast({ content: '請先敲擊至少 2 次 Tap 再保存 BPM。', type: 'warning', timeout: 1800 });
                        return;
                    }

                    const intervals = [];
                    for (let i = 1; i < taps.length; i++) {
                        intervals.push(taps[i] - taps[i - 1]);
                    }
                    const avg = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
                    const bpm = 60000 / avg;
                    if (!isFinite(bpm) || bpm <= 0) {
                        simpleToast({ content: 'BPM 計算失敗，請重新敲擊。', type: 'error', timeout: 1800 });
                        return;
                    }
                    editorInput.value += `(${bpm.toFixed(1)})`;

                    setEditorCss();
                    applyHighlight(editorInput.value);

                    inputDebounce();
                    simpleToast({ content: `已設定 BPM：${clockBpm}`, type: 'success', timeout: 1800 });
                    ctx.close();
                },
                hideOnClick: true
            },
            {
                text: '關閉',
                hideOnClick: true
            }
        ]
    });
});

function setDataEmpty() {
    playButton.dataset.playing = 'false';
    playButton.children[0].innerText = "play_arrow";
    maidata = {};
    nowDifficulty = 5;
    backgroundImage = null;
    backgroundVideo = null;
    applyHighlight('');
    musicDelay = 0;
    realTime = 0;
    globalTime = 0;
    slider.max = 1;
    slider.value = 0;
    updateSlider(0);
    offsetInput.value = 0;
    editorInput.value = '';
    // 清除編輯歷史（新譜面應該重新開始）
    undoStack = [];
    redoStack = [];
    historyMap = {};
    lastEditorValue = '';
    audioManager.removeBackgroundMusic().catch(() => { });
    changeDifficulty.value = nowDifficulty;
    editorBackgroundImage.src = "";
    editorBackgroundImage.style.display = 'none';
    editorBackgroundImage.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
    editorBackgroundVideo.src = "";
    editorBackgroundVideo.style.display = 'none';
    editorBackgroundVideo.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
    inputDebounce();
    saveMaidata();

    idbSet('simai_background_image', null).catch(() => { });
    idbSet('simai_background_video', null).catch(() => { });
    idbSet('simai_now_difficulty', nowDifficulty).catch(() => { });
    idbSet('simai_resource_bgm', null).catch(() => { });
    idbSet('simai_timeControl', 0).catch(() => { });
}

fetchFromMainoteButton.addEventListener('click', () => {
    const { createClient } = supabase;

    const SUPABASE_CONFIG = {
        url: "https://tntzyagdhlrdeswyrsjw.supabase.co",
        key: "sb_publishable_eoR0itFK2HCrDAMd-6Jbxg_OYCkGWTJ"
    }
    const client = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

    async function getLevelCharts({
        level = "",
        version = "",
        difficulty = "",
        category = "",
        songTitle = "",
    } = {}) {
        try {
            // 使用 !inner 確保過濾 songs 時，不符合的 charts 會直接被排除
            let query = client
                .from('charts')
                .select('*, songs!inner(*)') // 保持 !inner

            // 篩選條件
            if (level) query = query.eq('level', level);
            if (difficulty) query = query.eq('difficulty', difficulty);
            if (version) query = query.eq('version', version);
            if (category) query = query.eq('category', category);

            if (songTitle) {
                // 建議：將關鍵字切開做多重模糊搜尋，手感會更好
                const words = songTitle.trim().split(/\s+/);
                words.forEach(word => {
                    query = query.ilike('songs.title', `%${word}%`);
                });
            }

            // --- 修正解構錯誤：一定要用 { data, error } ---
            const { data, error } = await query
                .order('level', { ascending: false });

            console.log('Supabase 查詢結果:', data, '錯誤訊息:', error);

            if (error) throw error;

            // 因為用了 !inner，data 裡面的東西一定都帶有符合條件的 songs
            simpleToast({ content: `找到 ${data.length} 個譜面`, type: 'success', timeout: 1500 });
            return data;

        } catch (err) {
            console.error('查詢失敗:', err);
            simpleToast({ content: `錯誤：${err.message}`, type: 'error', timeout: 2000 });
        }
    }

    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:12px;font-size:13px;width:100%;min-width:250px;';

    // 輔助函式：建立輸入框
    const createInput = (label, placeholder = '') => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
        row.innerHTML = `<label style="font-weight:500;color:#ddd;">${label}</label>`;
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder;
        input.style.cssText = 'background:#222;color:#fff;border:1px solid #555;padding:6px;border-radius:4px;';
        row.appendChild(input);
        return { row, input };
    };

    // 輔助函式：建立下拉選單
    const createSelect = (label, options) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
        row.innerHTML = `<label style="font-weight:500;color:#ddd;">${label}</label>`;
        const select = document.createElement('select');
        select.style.cssText = 'background:#222;color:#fff;border:1px solid #555;padding:6px;border-radius:4px;cursor:pointer;';

        options.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.text;
            select.appendChild(el);
        });

        row.appendChild(select);
        return { row, select };
    };

    // 定義選項清單
    const levelOptions = [{ value: '0', text: '全部' }];
    for (let i = 1; i <= 6; i++) levelOptions.push({ value: i.toString(), text: `Level ${i}` });
    for (let i = 7; i <= 14; i++) {
        levelOptions.push({ value: i.toString(), text: `Level ${i}` })
        levelOptions.push({ value: i.toString() + '+', text: `Level ${i}+` })
    };
    levelOptions.push({ value: 15, text: `Level 15` });

    const difficultyOptions = [
        { value: '', text: '全部難度' },
        { value: 'Re:MASTER', text: 'Re:MASTER' },
        { value: 'MASTER', text: 'MASTER' },
        { value: 'EXPERT', text: 'EXPERT' },
        { value: 'ADVANCED', text: 'ADVANCED' },
        { value: 'BASIC', text: 'BASIC' },
        { value: 'EASY', text: 'EASY' },
    ];

    const versionOptions = [
        { value: '', text: '全部版本' },
        { value: 'maimai', text: 'maimai' },
        { value: 'maimai_plus', text: 'maimai PLUS' },
        { value: 'green', text: 'GreeN' },
        { value: 'green_plus', text: 'GreeN PLUS' }, // 建議補上 PLUS
        { value: 'orange', text: 'ORANGE' },
        { value: 'orange_plus', text: 'ORANGE PLUS' },
        { value: 'pink', text: 'PiNK' },
        { value: 'pink_plus', text: 'PiNK PLUS' },
        { value: 'murasaki', text: 'MURASAKi' },
        { value: 'murasaki_plus', text: 'MURASAKi PLUS' },
        { value: 'milk', text: 'MiLK' },
        { value: 'milk_plus', text: 'MiLK PLUS' },
        { value: 'finale', text: 'FiNALE' },
        { value: 'deluxe', text: 'でらっくす (DX)' },
        { value: 'deluxe_plus', text: 'でらっくす PLUS' },
        { value: 'splash', text: 'Splash' },
        { value: 'splash_plus', text: 'Splash PLUS' },
        { value: 'universe', text: 'UNiVERSE' },
        { value: 'universe_plus', text: 'UNiVERSE PLUS' },
        { value: 'festival', text: 'FESTiVAL' },
        { value: 'festival_plus', text: 'FESTiVAL PLUS' },
        { value: 'buddies', text: 'BUDDiES' },
        { value: 'buddies_plus', text: 'BUDDiES PLUS' },
        { value: 'prism', text: 'PRiSM' },
        { value: 'prism_plus', text: 'PRiSM PLUS' },
        { value: 'circle', text: 'CiRCLE' },
        { value: 'circle_plus', text: 'CiRCLE PLUS' },
    ];

    const categoryOptions = [
        { value: '', text: '全部分類' },
        { value: 'POPS＆アニメ', text: 'POPS & ANIME' },
        { value: 'niconico＆ボーカロイド', text: 'niconico & VOCALOID' },
        { value: '東方Project', text: '東方Project' },
        { value: 'ゲーム＆バラエティ', text: 'GAME & VARIETY' },
        { value: 'maimai', text: 'maimai' },
        { value: 'オンゲキ＆CHUNITHM', text: 'Ongeki & CHUNITHM' }
    ];

    // 建立 UI 元件
    const { row: songRow, input: songInput } = createInput('歌曲名稱', '模糊搜尋...');
    const { row: levelRow, select: levelSelect } = createSelect('難度等級', levelOptions);
    const { row: difficultyRow, select: difficultySelect } = createSelect('難度', difficultyOptions);
    const { row: versionRow, select: versionSelect } = createSelect('版本', versionOptions);
    const { row: categoryRow, select: categorySelect } = createSelect('分類', categoryOptions);

    container.append(songRow, levelRow, difficultyRow, versionRow, categoryRow);

    // 搜尋按鈕
    const searchBtn = document.createElement('button');
    searchBtn.textContent = '🔍 搜尋';
    searchBtn.style.cssText = 'padding:10px;background:#0066cc;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:500;margin-top:8px;transition:background 0.2s;';
    searchBtn.onmouseover = () => searchBtn.style.background = '#0052a3';
    searchBtn.onmouseout = () => searchBtn.style.background = '#0066cc';

    searchBtn.addEventListener('click', async () => {
        searchBtn.disabled = true;
        searchBtn.textContent = '搜尋中...';

        const result = await getLevelCharts({
            level: levelSelect.value,
            songTitle: songInput.value,
            version: versionSelect.value,
            category: categorySelect.value,
            difficulty: difficultySelect.value
        });

        if (!result || result.length === 0) {
            simpleToast({ content: '未找到符合條件的譜面', type: 'warning', timeout: 1800 });
            searchBtn.disabled = false;
            searchBtn.textContent = '🔍 搜尋';
            return;
        }

        // 建立結果列表 (此部分維持原樣)
        const resultContainer = document.createElement('div');
        resultContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;padding-right:4px;';

        result.forEach((chart) => {
            const item = document.createElement('div');
            item.style.cssText = 'padding:10px;background:#2a2a2a;border:1px solid #444;border-radius:4px;cursor:pointer;transition:all 0.2s;';

            const songTitle = chart.songs?.title || '未知歌曲';
            item.innerHTML = `
                <div style="font-weight:500;color:#fff;margin-bottom:4px;">${songTitle}</div>
                <div style="font-size:12px;color:#bbb;">
                    難度: <strong>${chart.difficulty || 'N/A'}</strong> | 等級: <strong>${chart.level || 'N/A'}</strong>
                </div>
            `;

            item.onclick = () => {
                if (!confirm(`是否載入譜面：${songTitle}？`)) return;
                setDataEmpty();
                editorInput.value = chart.chart_data;
                saveMaidata();
                inputDebounce();
                simpleToast({ content: `已載入：${songTitle}`, type: 'success' });
                popupWindow.close();
            };

            item.onmouseenter = () => { item.style.borderColor = '#0066cc'; item.style.background = '#333'; };
            item.onmouseleave = () => { item.style.borderColor = '#444'; item.style.background = '#2a2a2a'; };
            resultContainer.appendChild(item);
        });

        popupWindow({
            title: `搜尋結果 (${result.length})`,
            customContent: resultContainer,
            buttons: [{ text: "關閉", hideOnClick: true }]
        });

        searchBtn.disabled = false;
        searchBtn.textContent = '🔍 搜尋';
    });

    container.appendChild(searchBtn);

    popupWindow({
        title: "從 Mainote 抓取譜面",
        customContent: container,
        buttons: [{ text: "關閉", hideOnClick: true }]
    });
});

createNewButton.addEventListener('click', () => {
    if (!confirm('是否要建立新的譜面？這將重置目前編輯內容。')) return;
    setDataEmpty();
    simpleToast({ content: '已建立新譜面', type: 'success', timeout: 1200 });
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
        if (result.failed) {
            simpleToast({ content: '解析譜面失敗，請檢查格式是否正確', type: 'error', timeout: 2000 });
        } else {
            notes = result.notes;
            decodedTags = result.tags || [];

            setEndtime(result.endTime);
            clockBpm = result.bpm;
            // 以逗號切分，但忽略落在以 '||' 開頭的單行註解內的逗號（同時保留註解文字）
            const splitRespectingLineComments = (text) => {
                const out = [];
                let cur = '';
                for (let i = 0; i < text.length;) {
                    const a = text[i];
                    const b = text[i + 1];

                    // 若遇到單行註解開頭 '||'，將註解整行當成一般文字加入（註解內的逗號不分割）
                    if (a === '|' && b === '|') {
                        cur += '||';
                        i += 2;
                        while (i < text.length && text[i] !== '\n' && text[i] !== '\r') {
                            cur += text[i++];
                        }
                        // 保留換行符（支援 CRLF 與 LF）
                        if (i < text.length && text[i] === '\r') {
                            cur += '\r';
                            i++;
                            if (i < text.length && text[i] === '\n') { cur += '\n'; i++; }
                        } else if (i < text.length && text[i] === '\n') {
                            cur += '\n';
                            i++;
                        }
                        continue;
                    }

                    // 正常逗號：作為分隔符
                    if (a === ',') {
                        out.push(cur);
                        cur = '';
                        i++;
                        continue;
                    }

                    // 其他字元
                    cur += a;
                    i++;
                }
                out.push(cur);
                // 移除因尾端逗號或連續逗號產生的空字串項
                return out;
            };
            dataIndexToTime = result.indexToTime || [];

            playScoreRes = {
                ...result.notesConts,
                score: result.score,
            };
            playScoreRes.breakScore = playScoreRes.break == 0 ? 0 : (1 / playScoreRes.break);
            playScoreRes.invScore = 1 / playScoreRes.score;
            rawData = splitRespectingLineComments(simaiDataValue);

            warnings = result.warnings || [];
            warningPositions = result.errpositions || [];
            if (result.warnings && result.warnings.length > 0) {
                warnEl.style.visibility = 'visible';
                warnEl.querySelector('.warnCount').textContent = result.warnings.length;
                console.warn('Decode warnings:', result.warnings);
            } else {
                warnEl.style.visibility = 'hidden';
            }
            draw();
        }
    }
});

warnEl.addEventListener('click', () => {
    popupWindow({
        title: "警告",
        content: warnings.map((w, i) => `• ${w}`).join('<br>'),
    });
});

const offsetInputDebounce = debounce(() => {
    slider.max = endTime + musicDelay;
    updateSlider(realTime);

    globalTime = realTime - musicDelay;

    if (playButton.dataset.playing === 'true') {
        audioManager.playBGM(realTime); // 調整音樂播放位置，讓它與節拍更貼合
    }
    maidata.first = musicDelay;
    saveMaidata();
    draw();
}, 500);

const saveMaidata = debounce(() => {
    idbSet('simai_maidata', maidata).catch((error) => {
        console.error("儲存maidata到IndexedDB失敗:", error);
    });
}, 2000);

const inputDebounce = debounce(() => {
    const value = editorInput.value;
    // 解析 Note 邏輯
    getres(value);
    applyHighlight(value);
    maidata["inote_" + nowDifficulty] = value;
    saveMaidata();
}, settings.inputDebounceTime || 500);

function setElementDisplay(element, visible, value = 'block') {
    element.style.display = visible ? value : 'none';
}

function animateCanvasWidth(visible) {
    const canvasAnimation = canvasContainer.animate(
        [{ width: visible ? '50%' : '100%' }],
        { duration: 400, fill: 'forwards', easing: 'ease' }
    );

    let animationRunning = true;
    const throttledResize = throttle(resize, 16); // 限制每 16ms 最多调用一次（约 60fps）

    function syncResize() {
        if (animationRunning) {
            throttledResize();
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
    const w = editorContainer.clientWidth * dpr;
    const h = editorContainer.clientHeight * dpr;

    if (lastVisualEditorSize.w === w && lastVisualEditorSize.h === h) {
        //resizeVisualEditor();
        return; // 尺寸不變，避免重設畫布造成多餘重排
    }

    lastVisualEditorSize.w = w;
    lastVisualEditorSize.h = h;

    const p = Math.min(w, h) / scaleBase;
    visualEditor.width = w;
    visualEditor.height = h;
    ctx2d.setTransform(p, 0, 0, p, w / 2, h / 2);
    //resizeVisualEditor();
    draw();
}

function resizePreviewCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = previewContainer.clientWidth * dpr;
    const h = previewContainer.clientHeight * dpr;
    previewCanvas.width = w;
    previewCanvas.height = h;
}

playbackSpeedInput.addEventListener('change', () => {
    const speed = parseFloat(playbackSpeedInput.value);
    if (isNaN(speed) || speed <= 0) {
        simpleToast({ content: '請輸入有效的播放速度', type: 'warning', timeout: 1800 });
        playbackSpeedInput.value = 1;
        return;
    }
    setPlaybackSpeed(speed);
    simpleToast({ content: `已設定播放速度：${speed}x`, type: 'success', timeout: 1800 });
});

function setPlaybackSpeed(speed) {
    typeof speed === 'string' && (speed = parseFloat(speed));
    speed = clamp(speed, 0.01, 4); // 限制速度在 0.01x 到 4x 之間
    const playing = playButton.dataset.playing === 'true';

    settings.playbackSpeed = speed;
    playbackSpeedInput.value = speed.toFixed(2);

    audioManager.setPlaybackRate(speed);
    if (playing) {
        audioManager.playBGM(realTime);
    }
    if (editorBackgroundVideo.src) {
        editorBackgroundVideo.playbackRate = speed;
    }
    saveSettingsDebounce();
}

// renderVisualEditor 已移至 renderer.js 的 renderVisualEditorFromRenderer

let _highlightSyncPending = false;
function syncHighlightLayerScroll() {
    if (_highlightSyncPending) return;
    _highlightSyncPending = true;
    requestAnimationFrame(() => {
        highlightLayer.scrollTop = editorInput.scrollTop;
        highlightLayer.scrollLeft = editorInput.scrollLeft;
        _highlightSyncPending = false;
    });
}

const setEditorCss = (visible = null) => {
    // 同步捲動永遠執行（透過 rAF 批次處理，避免頻繁 layout thrash）
    syncHighlightLayerScroll();

    if (visible === null) return;

    const visualMode = isVisualMode();
    const editorVisible = visible && !visualMode;
    const visualVisible = visible && visualMode;
    const isHidden = hideButton.dataset.hidden === 'true';

    setElementDisplay(editorContainer, visible);
    setElementDisplay(editorInput, editorVisible);
    setElementDisplay(highlightLayer, editorVisible);
    setElementDisplay(visualEditor, visualVisible);

    updatePlaycontrol(visualVisible, !isHidden);

    animateCanvasWidth(visible);
};

settingsButton.addEventListener('click', () => {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex; gap:20px; font-size:14px; height:420px;';

    // 左側導覽列 (Tabs)
    const sidebar = document.createElement('div');
    sidebar.style.cssText = 'display:flex; flex-direction:column; width:80px; border-right:1px solid #444; gap:5px; padding-right:10px;';

    // 右側內容區
    const contentArea = document.createElement('div');
    contentArea.style.cssText = 'overflow-y:auto; padding-right:10px; display:flex; flex-direction:column; margin-top: 10px; width: stretch;';

    container.appendChild(sidebar);
    container.appendChild(contentArea);

    const sections = [];
    const tabs = [];

    const switchTab = (index) => {
        tabs.forEach((tab, i) => {
            tab.style.borderLeftColor = i === index ? '#4a90e2' : 'transparent';
            tab.style.color = i === index ? '#fff' : '#888';
            tab.style.fontWeight = i === index ? 'bold' : 'normal';
        });
        sections.forEach((sec, i) => {
            sec.style.display = i === index ? 'flex' : 'none';
        });
    };

    const addTab = (label) => {
        const index = tabs.length;
        const tab = document.createElement('div');
        tab.textContent = label;
        tab.style.cssText = 'padding:10px 8px; cursor:pointer; border-left:4px solid transparent; color:#888; transition:all 0.2s; font-size:15px; border-radius: 2px;';
        tab.addEventListener('click', () => switchTab(index));
        sidebar.appendChild(tab);
        tabs.push(tab);

        const section = document.createElement('div');
        section.style.cssText = 'display:none; flex-direction:column; gap:16px;';

        contentArea.appendChild(section);
        sections.push(section);

        return section;
    };

    const createRow = (labelText, element) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:15px; margin-bottom: 4px; min-height: 30px;';

        // 1. Checkbox
        if (element.type === 'checkbox') {
            const wrapper = document.createElement('label');
            wrapper.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; cursor:pointer; color:#ddd; font-size:15px;';
            const text = document.createElement('span');
            text.textContent = labelText;
            text.style.cssText = 'flex:1;';
            element.style.cssText = 'width:20px; height:20px; flex:0 0 auto; cursor:pointer; margin: 0;';
            wrapper.appendChild(text);
            wrapper.appendChild(element);
            row.appendChild(wrapper);
            return row;
        }

        // 2. Range (自訂 div 滑桿主容器)
        if (element.type === 'range') {
            const wrapper = document.createElement('label');
            wrapper.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; cursor:pointer; color:#ddd; font-size:15px;';
            const text = document.createElement('span');
            text.textContent = labelText;
            text.style.cssText = 'flex:1;';

            element.style.width = '140px'; // 調寬一點排版更好看
            wrapper.appendChild(text);
            wrapper.appendChild(element);
            row.appendChild(wrapper);
            return row;
        }

        // 3. Object (子屬性折疊選單)
        if (element.dataset && element.dataset.type === 'object-container') {
            row.style.cssText = 'display:flex; flex-direction:column; align-items:stretch; gap:5px; margin-bottom: 8px; width: 100%;';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; cursor:pointer; color:#ddd; font-size:15px; padding: 4px 0; user-select:none;';
            header.innerHTML = `<span>${labelText}</span><span class="arrow-icon" style="transition:transform 0.2s; transform: rotate(0deg); font-size:12px;">▼</span>`;

            const subBody = element;
            subBody.style.cssText = 'display:none; flex-direction:column; gap:6px; padding-left: 12px; border-left: 2px solid #444; margin-top: 4px;';

            header.addEventListener('click', () => {
                const isHidden = subBody.style.display === 'none';
                subBody.style.display = isHidden ? 'flex' : 'none';
                header.querySelector('.arrow-icon').style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
            });

            row.appendChild(header);
            row.appendChild(subBody);
            return row;
        }

        // 4. 一般 Number / Dropdown
        const label = document.createElement('label');
        label.textContent = labelText;
        label.style.cssText = 'flex:1; color:#ddd; font-size: 15px;';
        element.style.cssText = 'width:100px; flex:0 0 auto; padding:6px 8px; border:1px solid #555; border-radius:4px; background:#222; color:#fff; font-size:14px; text-align: left; transition: border-color 0.2s; box-sizing: border-box;';
        row.appendChild(label);
        row.appendChild(element);
        return row;
    };

    const applySettings = () => {
        const values = {};

        Object.keys(inputRefs).forEach(id => {
            const config = inputRefs[id];
            let finalVal;

            if (config.type === 'checkbox') {
                finalVal = config.el.checked;
            } else if (config.type === 'dropdown') {
                finalVal = isNaN(config.el.value) ? config.el.value : parseFloat(config.el.value);
            } else if (config.type === 'object') {
                // 🔥 直接複製子選單同步完的物件結果
                finalVal = { ...config.el.value };
            } else {
                const rawVal = parseFloat(config.el.value);
                finalVal = isNaN(rawVal) ? config.def : clamp(rawVal, Number(config.el.min), Number(config.el.max));
            }

            values[id] = finalVal;

            // 核心修正：深度指派物件結構，避免直接蓋掉引用
            if (config.type === 'object') {
                Object.assign(config.ref[config.key], finalVal);
            } else {
                config.ref[config.key] = finalVal;
            }
        });

        Object.keys(inputRefs).forEach(id => {
            if (inputRefs[id].apply) {
                inputRefs[id].apply(values[id], values);
            }
        });

        saveSettingsDebounce();
        draw();
        simpleToast({ content: '設定已儲存', type: 'success', timeout: 1500 });
    };

    const createNumberInput = (value, step = 0.1, min = -999, max = 9999) => {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = step;
        input.min = min;
        input.max = max;
        input.value = value;
        return input;
    };

    const createCheckbox = (checked, id) => {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        input.checked = checked;
        input.style.cursor = 'pointer';
        return input;
    };

    const createDropdown = (value, options = []) => {
        const select = document.createElement('select');
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            if (opt.value == value) o.selected = true;
            select.appendChild(o);
        });
        select.style.cursor = 'pointer';
        return select;
    };

    const inputRefs = {};

    // 重構原本的生成迴圈段落
    settingsConfig.forEach((category) => {
        const section = addTab(category.label);

        if (category.html) {
            section.innerHTML += category.html;
        }

        (category.items || []).forEach(item => {
            const targetRef = item.ref || settings;
            const targetKey = item.key || item.id;
            const currentVal = item.get ? item.get() : (targetRef[targetKey] ?? item.def);

            let el;

            // --- A. 處理 Checkbox ---
            if (item.type === 'checkbox') {
                el = createCheckbox(currentVal, `settings-${item.id}`);
                el.addEventListener('change', (e) => {
                    try { targetRef[targetKey] = e.target.checked; } catch (err) { }
                });
                el.addEventListener('click', (e) => e.stopPropagation());
            }
            // --- B. 處理 Dropdown ---
            else if (item.type === 'dropdown') {
                el = createDropdown(currentVal, item.options);
                el.addEventListener('change', (e) => {
                    try { targetRef[targetKey] = e.target.value; } catch (err) { }
                });
            }
            // --- C. 處理 Range ---
            else if (item.type === 'range') {
                el = createCustomSlider(currentVal, item.min, item.max, item.step, (val) => {
                    try {
                        targetRef[targetKey] = val;
                        if (item.apply) item.apply(val);
                    } catch (err) { }
                });
            }
            // --- D. 🔥 新增：深度處理 Object (如 sfxVolumes) ---
            else if (item.type === 'object') {
                el = document.createElement('div');
                el.dataset.type = 'object-container';
                el.value = { ...currentVal }; // 初始化當前快照

                // 建立一個子引用表，方便 applySettings 與重置時對準各別滑桿
                el._subRefs = {};

                Object.keys(item.def).forEach((subKey, index) => {
                    const subDefault = item.def[subKey];
                    const subCurrent = currentVal[subKey] ?? subDefault;

                    // 為每一個音效建立專屬的客製化滑桿
                    const subSlider = createCustomSlider(subCurrent, 0, 1, 0.05, (subVal) => {
                        try {
                            el.value[subKey] = subVal;
                            targetRef[targetKey][subKey] = subVal; // 即時同步寫入記憶體
                            if (item.apply) item.apply(targetRef[targetKey]); // 觸發試聽
                        } catch (e) { }
                    });

                    el._subRefs[subKey] = subSlider;

                    // 將每個子滑桿組件包裝進 row 塞入容器中
                    const subRow = createRow(subKey, subSlider);
                    el.appendChild(subRow);
                });

                // 實作 Object 的面板更新與重置映射
                el._updateDisplay = () => {
                    Object.keys(el._subRefs).forEach(subKey => {
                        el._subRefs[subKey].value = targetRef[targetKey][subKey] ?? item.def[subKey];
                        if (el._subRefs[subKey]._updateDisplay) el._subRefs[subKey]._updateDisplay();
                    });
                };
            }
            // --- E. 一般 Number ---
            else {
                el = createNumberInput(currentVal, item.step, item.min, item.max);
            }

            inputRefs[item.id] = {
                el,
                def: item.def,
                type: item.type,
                apply: item.apply,
                ref: targetRef,
                key: targetKey
            };
            section.appendChild(createRow(item.label, el));
        });
    });

    switchTab(0);

    popupWindow({
        title: '設定',
        customContent: container,
        width: "85%",
        maxWidth: "500px",
        buttons: [
            {
                text: '儲存',
                onClick: (ctx) => { applySettings(); },
                hideOnClick: true
            },
            {
                text: '套用',
                onClick: (ctx) => { applySettings(); }
            },
            {
                text: '取消',
                hideOnClick: true
            },
            {
                text: '重置數值',
                onClick: (ctx) => {
                    Object.values(inputRefs).forEach(ref => {
                        if (ref.type === 'checkbox') {
                            ref.el.checked = ref.def;
                            ref.ref[ref.key] = ref.def; // 🟢 同步寫回記憶體
                        } else if (ref.type === 'object') {
                            // 🔴 關鍵修正 1：快照完全恢復成預設值
                            ref.el.value = { ...ref.def };

                            // 🔴 關鍵修正 2：深度將記憶體 settings[key] 中的子屬性全數洗回預設值
                            // 不能直接 ref.ref[ref.key] = ref.def，會斷開引用，必須用 Object.assign
                            Object.assign(ref.ref[ref.key], ref.def);

                            // 🔴 關鍵修正 3：先改完記憶體，再叫子滑桿們去讀取新數值並重繪背景
                            if (ref.el._updateDisplay) ref.el._updateDisplay();

                            // 觸發音效管理器的即時即刻同步
                            if (ref.apply) ref.apply(ref.ref[ref.key]);
                        } else {
                            ref.el.value = ref.def;
                            ref.ref[ref.key] = ref.def; // 🟢 同步寫回記憶體

                            if (ref.el._updateDisplay) ref.el._updateDisplay();
                            if (ref.apply) ref.apply(ref.def);
                        }
                    });

                    // 🟢 關鍵修正 4：重置後強制重新重繪畫布，讓畫面上的感應器、速度即時校正
                    draw();
                    simpleToast({ content: '數值已還原（尚未儲存）', type: 'info', timeout: 1500 });
                }
            },
        ]
    });
});

chartInfoButton.addEventListener('click', () => {
    const tempData = { ...(maidata || {}) };
    const inputRefs = {};

    /**
     * 核心邏輯：處理音訊 Metadata 並更新 tempData 與 UI
     * @param {File} file 音訊檔案
     */
    const processAudioMetadata = (file) => {
        if (!file) {
            simpleToast({ content: "找不到音訊檔案", type: "error" });
            return;
        }

        const applyData = (title, artist) => {
            if (title) {
                tempData.title = title;
                if (inputRefs.title) inputRefs.title.value = title;
            }
            if (artist) {
                tempData.artist = artist;
                if (inputRefs.artist) inputRefs.artist.value = artist;
            }
        };

        // 1. 優先嘗試使用 jsmediatags 讀取 ID3 標籤
        if (window.jsmediatags) {
            window.jsmediatags.read(file, {
                onSuccess: (tag) => {
                    const { title, artist } = tag.tags;
                    applyData(title, artist);
                    simpleToast({ content: `成功讀取標籤：${title || '無標題'}`, type: "success" });
                },
                onError: (error) => {
                    console.warn("jsmediatags 讀取失敗，改用檔名解析:", error);
                    fallbackToFileName(file);
                }
            });
        } else {
            fallbackToFileName(file);
        }

        // 2. 備案：從檔名解析 (格式預期為 "作者 - 標題")
        function fallbackToFileName(f) {
            const fileName = f.name.replace(/\.[^/.]+$/, ""); // 去除副檔名
            if (fileName.includes(" - ")) {
                const parts = fileName.split(" - ");
                applyData(parts.slice(1).join(" - ").trim(), parts[0].trim());
            } else {
                applyData(fileName, null);
            }
            simpleToast({ content: "已從檔名解析資訊", type: "info" });
        }
    };

    const createPopupContent = () => {
        const container = document.createElement('div');
        container.style.cssText = "display:flex; gap: 10px;";
        const createButton = (text, eventHandler) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.cssText = "padding:8px 12px; background:rgb(32, 32, 32); color:#fff; border:1px solid rgb(64, 64, 64); border-radius:5px; cursor:pointer; font-size:12px; width:100%;";
            if (eventHandler) {
                btn.addEventListener('click', eventHandler);
            }
            return btn;
        }
        // 左側：圖片更換
        const imgContainer = document.createElement('div');
        imgContainer.style.cssText = "width:50%; display:flex; align-items: flex-start;flex-wrap: wrap;flex-direction: column;align-items: center;justify-content: flex-start;gap: 10px;";
        const img = document.createElement('img');
        img.src = backgroundImage ? URL.createObjectURL(backgroundImage) : images['no_image'].src;
        img.style.cssText = "width:100%; height:100%; display:block; object-fit:contain;";

        const imgWrapper = document.createElement('div');
        imgWrapper.style.cssText = "width:100%; aspect-ratio:1/1; overflow:hidden; border:1px solid #333; border-radius:8px; cursor:pointer; position:relative; background:#000;";

        const overlay = document.createElement('div');
        overlay.style.cssText = "position:absolute; bottom:0; width:100%; background:rgba(0,0,0,0.6); color:#fff; font-size:10px; text-align:center; padding:4px 0;";
        overlay.textContent = "點擊更換圖片";

        imgWrapper.appendChild(img);
        imgWrapper.appendChild(overlay);
        imgWrapper.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const objectUrl = URL.createObjectURL(file);
                    img.src = objectUrl;
                    backgroundImage = file;
                    editorBackgroundImage.src = objectUrl;
                    editorBackgroundImage.style.display = 'block';
                    idbSet('simai_background_image', file);
                }
            };
            fileInput.click();
        });
        imgContainer.appendChild(imgWrapper);
        imgContainer.appendChild(createButton("從目前 Track 讀取", () => {
            processAudioMetadata(audioManager.bgmFile);
        }));
        imgContainer.appendChild(createButton("讀取其他音訊 Metadata", () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'audio/*';
            fileInput.onchange = (e) => processAudioMetadata(e.target.files[0]);
            fileInput.click();
        }));

        // 右側：輸入欄位
        const diffContainer = document.createElement('div');
        diffContainer.style.cssText = "width:60%; display:flex; flex-direction:column;";

        // 建立主要欄位並存入 inputRefs (使用 createLabeledInput1)
        const titleField = createLabeledInput1({ value: tempData.title, labelText: "標題", type: 'text', assign: "title", data: tempData, ref: inputRefs });
        const artistField = createLabeledInput1({ value: tempData.artist, labelText: "作者", type: 'text', assign: "artist", data: tempData, ref: inputRefs });
        const descField = createLabeledInput1({ value: tempData.des, labelText: "譜面設計", type: 'text', assign: "des", data: tempData, ref: inputRefs });

        diffContainer.append(titleField.wrapper, artistField.wrapper, descField.wrapper);

        // 難度選擇與等級 (使用 createLabeledInput1 的 select)
        const dropdownField = createLabeledInput1({
            value: nowDifficulty || "5",
            labelText: "難度",
            type: 'select',
            assign: 'difficulty',
            data: tempData,
            ref: inputRefs,
            options: [
                { value: "7", label: "ORIGINAL" }, { value: "6", label: "RE:MASTER" },
                { value: "5", label: "MASTER" }, { value: "4", label: "EXPERT" },
                { value: "3", label: "ADVANCED" }, { value: "2", label: "BASIC" }, { value: "1", label: "EASY" }
            ]
        });
        const dropdown = dropdownField.input;
        dropdown.style.cssText = "width:100%; padding:4px; background:#111; color:#fff; border:1px solid #333; font-size:12px; margin-bottom:8px;";

        const infoText = document.createElement('div');
        const updateDiffFields = (diff) => {
            infoText.innerHTML = "";
            const lv = createLabeledInput1({ value: tempData[`lv_${diff}`], labelText: "等級", type: 'text', assign: `lv_${diff}`, data: tempData, ref: inputRefs });
            const des = createLabeledInput1({ value: tempData[`des_${diff}`], labelText: "難度設計", type: 'text', assign: `des_${diff}`, data: tempData, ref: inputRefs });
            infoText.append(lv.wrapper, des.wrapper);
        };

        dropdown.addEventListener('change', (e) => {
            tempData.difficulty = e.target.value;
            updateDiffFields(e.target.value);
        });

        diffContainer.appendChild(dropdown);
        diffContainer.appendChild(infoText);
        updateDiffFields(dropdown.value);

        // 自訂指令[cite: 1]
        const excludedKeys = new Set(["title", "artist", "des", "first", "difficulty"]);
        const insVal = Object.keys(tempData)
            .filter(key => !excludedKeys.has(key) && !key.startsWith('lv_') && !key.startsWith('des_') && !key.startsWith('inote_'))
            .map(key => `&${key} = ${tempData[key]}`)
            .join("\n");
        const customIns = createLabeledInput1({ value: insVal, labelText: "自訂指令", type: 'textarea', assign: "custom", data: tempData, ref: inputRefs });
        diffContainer.appendChild(customIns.wrapper);

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
                    if (!maidata) maidata = {};
                    // 將 tempData 寫回 maidata
                    Object.assign(maidata, tempData);

                    // 處理自訂指令解析
                    if (typeof tempData.custom === 'string') {
                        tempData.custom.split(/\n/).forEach(line => {
                            const match = line.trim().match(/^&?([^=]+)=(.*)$/);
                            if (match) maidata[match[1].trim()] = match[2].trim();
                        });
                    }

                    if (tempData.difficulty) {
                        nowDifficulty = tempData.difficulty;
                        if (typeof changeDifficulty !== 'undefined') changeDifficulty.value = nowDifficulty;
                    }
                    saveMaidata();
                    closePopup();
                },
                hideOnClick: true
            },
            { text: "取消", hideOnClick: true }
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

// --- Undo/Redo 系統 ---
// --- Undo/Redo 系統 (使用差異 diff 儲存，避免完整字串複製) ---
let undoStack = []; // stores change objects: { start, removed, inserted }
let redoStack = [];
const maxHistorySize = 100;

const computeChange = (oldStr, newStr) => {
    if (oldStr === newStr) return null;
    let start = 0;
    const minLen = Math.min(oldStr.length, newStr.length);
    while (start < minLen && oldStr[start] === newStr[start]) start++;

    let endOld = oldStr.length - 1;
    let endNew = newStr.length - 1;
    while (endOld >= start && endNew >= start && oldStr[endOld] === newStr[endNew]) {
        endOld--;
        endNew--;
    }

    const removed = oldStr.slice(start, endOld + 1);
    const inserted = newStr.slice(start, endNew + 1);
    return { start, removed, inserted };
};

const applyChange = (text, change) => {
    if (!change) return text;
    const before = text.slice(0, change.start);
    const after = text.slice(change.start + (change.removed ? change.removed.length : 0));
    return before + (change.inserted || '') + after;
};

const invertChange = (change) => {
    if (!change) return null;
    return { start: change.start, removed: change.inserted, inserted: change.removed };
};

const pushUndoChange = (change) => {
    if (!change) return;
    // 新的使用者編輯會清空 redo
    redoStack = [];
    undoStack.push(change);
    if (undoStack.length > maxHistorySize) undoStack.shift();
};

const pushUndo = (change) => {
    if (!change) return;
    undoStack.push(change);
    if (undoStack.length > maxHistorySize) undoStack.shift();
};

const pushRedo = (change) => {
    if (!change) return;
    redoStack.push(change);
    if (redoStack.length > maxHistorySize) redoStack.shift();
};

// 歷史記錄按難度分隔存放
let historyMap = {}; // { [difficulty]: { undo:[], redo:[], last: '' } }

const saveHistoryForDifficulty = (diff) => {
    // 將當前的 undo/redo 與 lastEditorValue 保存到 map
    if (diff === undefined || diff === null) return;
    historyMap[diff] = {
        undo: undoStack.slice(),
        redo: redoStack.slice(),
        last: lastEditorValue
    };
};

const loadHistoryForDifficulty = (diff) => {
    const h = historyMap[diff];
    if (h) {
        undoStack = h.undo.slice();
        redoStack = h.redo.slice();
        lastEditorValue = (typeof h.last === 'string') ? h.last : editorInput.value || '';
    } else {
        undoStack = [];
        redoStack = [];
        lastEditorValue = editorInput.value || '';
    }
};

undoButton.addEventListener('click', () => {
    if (undoStack.length === 0) return;
    const change = undoStack.pop();
    const inverse = invertChange(change);
    const newContent = applyChange(editorInput.value, inverse);
    // 將原始 change 推到 redo，供重做時套用
    pushRedo(change);
    editorInput.value = newContent;
    applyHighlight(newContent);
    getres(newContent);
    inputDebounce();
    lastEditorValue = newContent;
});

redoButton.addEventListener('click', () => {
    if (redoStack.length === 0) return;
    const change = redoStack.pop();
    const newContent = applyChange(editorInput.value, change);
    pushUndo(change);
    editorInput.value = newContent;
    applyHighlight(newContent);
    getres(newContent);
    inputDebounce();
    lastEditorValue = newContent;
});

helpButton.addEventListener('click', () => {
    const content = `
    <h2>Simai譜面編輯器使用說明</h2>
    <p>(wip)</p>`
    popupWindow({
        title: "幫助",
        customContent: content,
        buttons: [
            { text: "關閉", hideOnClick: true }
        ]
    });
});

let lastEditorValue = editorInput.value || '';
const editorInputDebounce = debounce(() => {
    if (editorInput.value !== lastEditorValue) {
        const change = computeChange(lastEditorValue, editorInput.value);
        if (change) {
            pushUndoChange(change);
            console.log("記錄歷史狀態（diff）:", change);
        }
        lastEditorValue = editorInput.value;
    }
}, 500);

let cursorLastIndexTime = 0;
document.addEventListener('selectionchange', () => {
    // 確保只有在編輯器獲得焦點時才執行邏輯
    if (document.activeElement === editorInput) {
        const point = editorInput.selectionStart;
        cursorLastIndexTime = dataIndexToTime[indexFromCursor(editorInput.value, point)] ?? 0;

        const playing = playButton.dataset.playing === 'true';
        const previewVisibleFlag = previewVisible();
        const isVisualModeFlag = isVisualMode();
        const visualHeight = (() => {
            if (!previewVisibleFlag) {
                return visualEditorRenderer.getCanvasWH().height;
            } else {
                return previewRender.getCanvasWH().width / 2;
            }
        })();
        const visualBuckets = { slide: [], tapnhold: [], touch: [], tags: [] };
        const V = visualHeight / settings.visualZoom;

        for (let i = notes.length - 1; i >= 0; i--) {
            const note = notes[i];
            const noteT = note.time - globalTime;
            const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0);

            const isVisualVisible = noteT >= 0
                ? Math.abs(noteT) <= V
                : -noteT <= V + skipT;

            if (isVisualVisible) {
                const noteType = note.type;
                if (noteType === 'slide') {
                    visualBuckets.slide.push(note);
                } else if (noteType === 'hold' || noteType === 'tap') {
                    visualBuckets.tapnhold.push(note);
                } else if (noteType === 'touch') {
                    visualBuckets.touch.push(note);
                }
            }
        }

        // 標籤分類
        const tagsLength = decodedTags.length;
        for (let i = 0; i < tagsLength; i++) {
            const tag = decodedTags[i];
            visualBuckets.tags.push(tag);
            if (Math.abs(tag.time - globalTime) <= V) {
                // 標籤邏輯保留（如果需要額外處理）
            }
        }

        if ((!isVisualModeFlag || editorContainer.style.display === 'none') && previewVisibleFlag && !playing) {
            previewRender.drawFrame({
                globalTime,
                visualBuckets,
                audioBuffer: audioManager.bgmBuffer,
                offset: musicDelay,
                indexTime: dataIndexToTime[nowIndex],
                cursorIndexTime: cursorLastIndexTime,
            });
        }
    }
});

editorInput.addEventListener('input', () => {
    const value = editorInput.value;
    isContextEdited = true;

    // 同步捲動位置
    setEditorCss();

    // 立即更新顏色高亮 (視覺上達到打字立刻出現)
    applyHighlight(value);

    // 延遲記錄歷史狀態
    editorInputDebounce();

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

function maidataProcess(e) {
    maidata = null; // 先清空舊譜面資料，避免讀取失敗時殘留舊資料干擾
    editorInput.value = "";
    offsetInput.value = 0;
    musicDelay = 0;
    applyHighlight("");
    const content = parseMaidata(e);
    maidata = content;
    saveMaidata();
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
        offsetInput.value = musicDelay;
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
        editorInput.value = content["inote_5"] || "";
    } else {
        console.warn("maidata 中未找到 inote_5，編輯器將保持空白");
    }
    getres(editorInput.value);
    applyHighlight(editorInput.value);
    // 載入譜面時，重置編輯歷史與 lastEditorValue
    undoStack = [];
    redoStack = [];
    historyMap = {};
    lastEditorValue = editorInput.value || '';
}

folderInput.addEventListener('click', (e) => {
    e.stopPropagation();
    const input = folderInput.children[0];
    const maidataHaveContext = (() => {
        if (audioManager.haveBGM()) {
            return true;
        }
        for (let i = 1; i <= 7; i++) {
            if (maidata[`inote_${i}`] && maidata[`inote_${i}`].trim() !== "") {
                return true;
            }
        }
        return false;
    })();
    if (maidataHaveContext) {
        const confirmReset = confirm("載入新的資料夾將會覆蓋目前的編輯內容，是否繼續？");
        if (!confirmReset) {
            return;
        }
    }
    input.value = '';
    input.click();
});

folderInput.children[0].addEventListener('click', (e) => {
    e.stopPropagation();
});

// 只在初始化時設置一次，避免重複綁定
folderInput.children[0].onchange = async (event) => {
    const files = event.target.files;
    if (files.length === 0) {
        console.warn("未選擇任何檔案");
        return;
    }
    setDataEmpty(); // 先清空現有資料，避免讀取失敗時殘留舊資料干擾
    await handleFolderInput(files);
    setEndtime(endTime);
    draw();
};

async function handleFolderInput(files) {
    // Normalize input into an array of File-like objects (supports FileList, Array, or JSZip.files mapping)
    const entries = [];
    if (files && typeof files.length === 'number' && typeof files.item === 'function') {
        for (let i = 0; i < files.length; i++) {
            const f = files.item(i);
            if (f) entries.push(f);
        }
    } else if (Array.isArray(files)) {
        for (let i = 0; i < files.length; i++) if (files[i]) entries.push(files[i]);
    } else if (files && typeof files === 'object') {
        // Assume JSZip.files mapping
        for (const name in files) {
            if (!Object.prototype.hasOwnProperty.call(files, name)) continue;
            const zf = files[name];
            if (zf.dir) continue; // skip directories
            if (typeof zf.async === 'function') {
                try {
                    const blob = await zf.async('blob');
                    const baseName = name.replace(/\\/g, '/').split('/').pop();
                    entries.push(new File([blob], baseName, { type: blob.type || '' }));
                } catch (e) {
                    console.warn('從 zip 讀取檔案失敗', name, e);
                }
            }
        }
    } else {
        console.warn('handleFolderInput：未知的 files 參數型別', files);
        return;
    }

    for (let i = 0; i < entries.length; i++) {
        const file = entries[i];
        const baseName = (file.name || '').replace(/.*[\\/]/, '');
        const lowerName = baseName.toLowerCase();
        const ext = (baseName.split('.').pop() || '').toLowerCase();

        // Fallback to extension check when file.type is missing (common for zip blobs)
        const isVideo = ((file.type || '').startsWith('video/')) || ['mp4', 'webm', 'mov', 'mkv', 'avi', 'ogv', 'ogg'].includes(ext);
        const isImage = ((file.type || '').startsWith('image/')) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff'].includes(ext);

        if (lowerName.startsWith('track.')) {
            // 音樂檔
            const url = URL.createObjectURL(file);
            await audioManager.setBackgroundMusic(url, file);
            setEndtime(endTime);
            idbSet('simai_resource_bgm', file).then(() => {
                console.log('已儲存音樂檔到 IndexedDB');
            }).catch((error) => {
                console.error('儲存音樂檔到 IndexedDB 失敗:', error);
            });
        }
        if (lowerName.startsWith('maidata.')) {
            // 譜面檔
            const reader = new FileReader();
            reader.onload = (e) => {
                maidataProcess(e.target.result);
                resize();
            };
            reader.readAsText(file);
        }
        if (lowerName.startsWith('bg.')) {
            if (isVideo) {
                console.log('載入背景影片:', file.name);
                backgroundVideo = file;
                editorBackgroundVideo.src = URL.createObjectURL(backgroundVideo);
                editorBackgroundVideo.style.display = 'none';
                editorBackgroundVideo.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
                idbSet('simai_background_video', file).catch((error) => {
                    console.error('儲存背景圖到 IndexedDB 失敗:', error);
                });
                continue;
            }
            if (isImage) {
                // 背景圖
                backgroundImage = file;
                editorBackgroundImage.src = URL.createObjectURL(backgroundImage);
                editorBackgroundImage.style.display = 'block';
                editorBackgroundImage.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
                idbSet('simai_background_image', file).catch((error) => {
                    console.error('儲存背景圖到 IndexedDB 失敗:', error);
                });
                continue;

            }
            console.warn('選擇的背景檔案不是圖片類型：', file.name);
        }
        if (lowerName.startsWith('pv.')) {
            if (isVideo) {
                console.log('載入背景影片:', file.name);
                backgroundVideo = file;
                editorBackgroundVideo.src = URL.createObjectURL(backgroundVideo);
                editorBackgroundVideo.style.display = 'none';
                editorBackgroundVideo.style.filter = `brightness(${1 + 0.75 * settings.moviebrightness})`;
                idbSet('simai_background_video', file).catch((error) => {
                    console.error('儲存背景圖到 IndexedDB 失敗:', error);
                });
                continue;
            }
            console.warn('選擇的背景影片檔案不是影片類型：', file.name);
        }
    }
}

readMaidataButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setDataEmpty();
                maidataProcess(e.target.result);
                resize();
            };
            reader.readAsText(file);
        }
    };
    input.click();
});

readZipButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setDataEmpty();
                JSZip.loadAsync(file).then(async (zip) => {
                    await handleFolderInput(zip.files);
                });
                resize();
            };
            reader.readAsArrayBuffer(file);
        }
    };
    input.click();
})

hideEditorButton.addEventListener('click', () => {
    // 檢查目前是否為隱藏狀態
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
    const oldDiff = nowDifficulty;
    const nowEditorContent = editorInput.value;

    // 立即紀錄尚未 debounce 的變更
    try {
        const pendingChange = computeChange(lastEditorValue, nowEditorContent);
        if (pendingChange) {
            pushUndoChange(pendingChange);
            lastEditorValue = nowEditorContent;
        }
    } catch (err) { /* ignore */ }

    // 儲存目前難度的編輯內容
    maidata['inote_' + oldDiff] = nowEditorContent;

    // 保存當前難度的歷史狀態，並切換到新難度後載入對應歷史
    saveHistoryForDifficulty(oldDiff);

    nowDifficulty = e.target.value;

    const newContent = maidata['inote_' + nowDifficulty] ?? "";
    editorInput.value = newContent;
    applyHighlight(editorInput.value);

    // 載入新難度的歷史（若有）並同步 lastEditorValue
    loadHistoryForDifficulty(nowDifficulty);

    inputDebounce();
    difficultyInputDebounce();
});

changeDisplayMode.addEventListener('change', (e) => {
    settings.displayMode = e.target.value;
    visualEditorRenderer.setZoom(settings.visualZoom);
    previewRender.setZoom(settings.visualZoom);
    saveSettingsDebounce();
    setEditorCss(editorContainer.dataset.hidden !== 'true');
    draw();
});

previewZoomInButton.addEventListener('click', () => {
    settings.visualZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, settings.visualZoom + ZOOM_STEP));
    visualEditorRenderer.setZoom(settings.visualZoom);
    previewRender.setZoom(settings.visualZoom);
    saveSettingsDebounce();
    draw();
});

previewZoomOutButton.addEventListener('click', () => {
    settings.visualZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, settings.visualZoom - ZOOM_STEP));
    visualEditorRenderer.setZoom(settings.visualZoom);
    previewRender.setZoom(settings.visualZoom);
    saveSettingsDebounce();
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

const utilityDropdown = document.querySelector('.utilityDropdown');
const utilityDropdownBtn = document.querySelector('.utilityDropdown-btn');
if (utilityDropdown && utilityDropdownBtn) {
    utilityDropdownBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        utilityDropdown.classList.toggle('open');
    });

    document.addEventListener('click', (event) => {
        if (!utilityDropdown.contains(event.target)) {
            utilityDropdown.classList.remove('open');
        }
    });
}

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
    syncHighlightLayerScroll();
});
editorInput.addEventListener('touchmove', () => {
    syncHighlightLayerScroll();
});
editorInput.addEventListener('touchstart', () => {
    syncHighlightLayerScroll();
});

/**
 * 1. 狀態管理
 */
const visualScroller = {
    isActive: false,
    startX: 0, startY: 0,
    lastX: 0, lastY: 0,
    startTime: 0,
    lastTime: 0,
    velocity: 0, // 🔴 修正定義：現在定義為「每毫秒移動的像素量 (px/ms)」
    axis: 'vertical',
    momentumFrame: null,
    // 🔴 修正：改用指數衰減係數 (Exponential Decay Coefficient)
    // 數值愈大衰減愈快。0.005 相當於在 60Hz 下約 0.92 的摩擦力
    frictionCoeff: 0.01,

    pxToSec(px) {
        // 確保相容主 Scroller 或 PreviewScroller 的縮放基準
        const currentRenderer = this.axis === 'vertical' ? visualEditorRenderer : previewRender;
        const zoom = currentRenderer ? currentRenderer.zoom : 100;
        return px / zoom;
    }
};

/**
 * 2. 核心更新與慣性邏輯
 */
const updateVisualTime = (newTime) => {
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 0;
    const clampedTime = Math.max(min, Math.min(max, newTime));

    timeControlSliding = true;
    updateSlider(clampedTime);
    realTime = clampedTime;
    globalTime = clampedTime - musicDelay;

    audioManager.stopAllLongSounds();
    if (playButton.dataset.playing === 'true') {
        audioManager.playBGM(realTime);
    } else {
        audioManager.clearSoundQueue();
        audioManager.stopBGM();
        draw();
        if (settings.cursorFollow) {
            const point = rawData.slice(0, nowIndex + 1).join(',').length;
            editorInput.selectionStart = point;
            editorInput.selectionEnd = point;
            cursorLastIndexTime = dataIndexToTime[nowIndex] ?? 0;
        }
    }
    slideInputDebounce();
};

const startMomentum = () => {
    cancelAnimationFrame(visualScroller.momentumFrame);
    let vel = visualScroller.velocity;
    let lastFrameTime = performance.now();
    const directionMult = visualScroller.axis === 'vertical' ? 1 : -1;

    const step = (now) => {
        const dt = now - lastFrameTime;
        lastFrameTime = now;

        // 🔴 關鍵修正 1：防止背景分頁或短暫卡頓導致 dt 暴增，限制單幀最大時差為 100ms
        const clampedDt = Math.min(100, dt);

        // 速度過小，或是外部觸發了其他時間滑動則停止
        if (Math.abs(vel) < 0.04 || !timeControlSliding) {
            visualScroller.momentumFrame = null;
            return;
        }

        // 🔴 關鍵修正 2：使用微積分位移公式：位移 = 速度 * 時間
        const deltaPx = vel * clampedDt * directionMult;
        const deltaSec = visualScroller.pxToSec(deltaPx);

        updateVisualTime(realTime + deltaSec);

        vel *= Math.exp(-visualScroller.frictionCoeff * clampedDt);

        visualScroller.momentumFrame = requestAnimationFrame(step);
    };
    visualScroller.momentumFrame = requestAnimationFrame(step);
};

/**
 * 3. 通用拖拽處理器 (工廠函式)
 */
const bindScrollerEvents = (element, axis = 'vertical') => {
    element.style.touchAction = 'none';
    element.style.cursor = 'grab';

    element.addEventListener('pointerdown', (e) => {
        // 如果正在播放則暫停
        if (playButton.dataset.playing === 'true' && settings.autoPauseOnScroll) {
            playButton.click(); // 觸發全域暫停邏輯，確保狀態同步
        }
        if (e.button !== 0) return;
        cancelAnimationFrame(visualScroller.momentumFrame);

        visualScroller.isActive = true;
        visualScroller.axis = axis;
        visualScroller.lastTime = performance.now();
        visualScroller.startTime = realTime;
        visualScroller.velocity = 0;

        if (axis === 'vertical') {
            visualScroller.startY = e.clientY;
            visualScroller.lastY = e.clientY;
        } else {
            visualScroller.startX = e.clientX;
            visualScroller.lastX = e.clientX;
        }

        element.setPointerCapture(e.pointerId);
        element.style.cursor = 'grabbing';
    });

    element.addEventListener('pointermove', (e) => {
        if (!visualScroller.isActive) return;

        const now = performance.now();
        const dt = now - visualScroller.lastTime;

        if (axis === 'vertical') {
            const currentY = e.clientY;
            if (dt > 0) {
                // 🔴 關鍵修正 4：計算物理定義的速度 (px / ms)
                const instantVel = (currentY - visualScroller.lastY) / dt;
                // 低通濾波器保持平滑，但兩側皆基於時間，不會受高刷滑鼠干擾
                visualScroller.velocity = visualScroller.velocity * 0.3 + instantVel * 0.7;
            }
            const deltaSec = visualScroller.pxToSec(visualScroller.startY - currentY);
            updateVisualTime(visualScroller.startTime - deltaSec);
            visualScroller.lastY = currentY;
        } else {
            const currentX = e.clientX;
            if (dt > 0) {
                const instantVel = (currentX - visualScroller.lastX) / dt;
                visualScroller.velocity = visualScroller.velocity * 0.3 + instantVel * 0.7;
            }
            const deltaSec = visualScroller.pxToSec(visualScroller.startX - currentX);
            updateVisualTime(visualScroller.startTime + deltaSec);
            visualScroller.lastX = currentX;
        }
        visualScroller.lastTime = now;
    });

    const handlePointerUp = (e) => {
        if (!visualScroller.isActive) return;
        visualScroller.isActive = false;
        element.releasePointerCapture(e.pointerId);
        element.style.cursor = 'grab';

        // 🔴 修正：由於單位改為 px/ms，閾值調低為 0.05
        if (Math.abs(visualScroller.velocity) > 0.05) startMomentum();
    };

    element.addEventListener('pointerup', handlePointerUp);
    element.addEventListener('pointercancel', handlePointerUp);

    // 滾輪處理
    element.addEventListener('wheel', (e) => {
        e.preventDefault();
        const renderer = axis === 'vertical' ? visualEditorRenderer : previewRender;
        if (!renderer) return;

        if (e.ctrlKey) {
            const factor = e.deltaY > 0 ? (1 / 1.15) : 1.15;
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, settings.visualZoom * factor));
            settings.visualZoom = newZoom;
            renderer.setZoom(newZoom);
            saveSettingsDebounce();
            draw();
        } else {
            // 滾輪原本就是單次脈衝，維持原樣，但對齊正確的 renderer 縮放比
            const scrollDelta = visualScroller.pxToSec(e.deltaY * (e.deltaMode === 1 ? 20 : 1));
            updateVisualTime(realTime + scrollDelta);
        }
    }, { passive: false });
};

/**
 * 4. 最終綁定
 */
bindScrollerEvents(visualEditor, 'vertical');
bindScrollerEvents(previewCanvas, 'horizontal');

const pairs = { '(': ')', '{': '}', '[': ']' };
const closingChars = new Set(Object.values(pairs));

// 🔴 新增一個全域防重疊鎖
let isBracketProcessing = false;

// 括號補齊／跳過
editorInput.addEventListener('beforeinput', (e) => {
    const char = e.data;
    if (!char || char.length !== 1) return;

    // 🔴 如果此時鎖是鎖上的，說明是輸入法殘留的二次觸發，直接強制攔截並丟棄！
    if (isBracketProcessing) {
        e.preventDefault();
        return;
    }

    const { selectionStart: start, selectionEnd: end, value } = editorInput;

    if (pairs[char] && settings.autocomplete) { // 開括號：自動補齊並包住選取
        e.preventDefault();

        // 🔴 激活防護鎖
        isBracketProcessing = true;

        // 將 DOM 操作推遲到非同步佇列，讓輸入法緩衝區有時間消化
        setTimeout(() => {
            const currentVal = editorInput.value;

            // 1. 精準置換文字
            editorInput.setRangeText(char + currentVal.slice(start, end) + pairs[char], start, end, 'end');

            // 2. 將游標精準定位在成對括號的中央
            editorInput.selectionStart = editorInput.selectionEnd = start + 1;

            // 3. 觸發業務邏輯更新
            if (typeof applyHighlight === 'function') applyHighlight(editorInput.value);
            if (typeof editorInputDebounce === 'function') editorInputDebounce();
            if (typeof inputDebounce === 'function') inputDebounce();

            // 🔴 釋放防護鎖
            isBracketProcessing = false;
        }, 0);

    } else if (closingChars.has(char) && start === end && value[start] === char) { // 閉括號：跳過
        e.preventDefault();
        editorInput.selectionStart = editorInput.selectionEnd = start + 1;
    }
});

// Backspace 成對刪除（這部分維持不變，keydown 不受輸入法組合字根干擾）
editorInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Backspace') return;
    const { selectionStart: start, selectionEnd: end, value } = editorInput;
    if (start === end && start > 0 && pairs[value[start - 1]] === value[start] && settings.autocomplete) {
        e.preventDefault();

        editorInput.setRangeText('', start - 1, start + 1, 'end');
        editorInput.selectionStart = editorInput.selectionEnd = start - 1;

        if (typeof applyHighlight === 'function') applyHighlight(editorInput.value);
        if (typeof editorInputDebounce === 'function') editorInputDebounce();
        if (typeof inputDebounce === 'function') inputDebounce();
    }
});

addMusicButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            await audioManager.setBackgroundMusic(url, file);
            setEndtime(endTime);
            idbSet('simai_resource_bgm', file);
        }
    };
    input.click();
});

downloadButton.addEventListener('click', () => {
    // 1. 內部工具：提取檔案主名稱 (不含副檔名)
    const getBaseName = (file) => {
        if (!file || !file.name) return null;
        return file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    };

    // 2. 計算預填名稱優先級：maidata.title > bgm filename > simai_package
    const defaultName = (maidata && maidata.title)
        || getBaseName(audioManager.bgmFile)
        || 'simai_package';

    const container = document.createElement('div');
    const textEl = document.createElement('label');
    textEl.textContent = "檔案名稱";
    textEl.style.cssText = "display:block;margin-bottom:5px;font-size:12px;color: lightgray;";
    container.appendChild(textEl);
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = '輸入檔案名稱';
    nameInput.value = defaultName; // --- 這裡預填名稱 ---
    nameInput.style.cssText = "width:calc(100% - 20px);padding:8px;font-size:12px;margin-bottom:10px;background:#151515;color:white;border:1px solid #444;border-radius:4px;";

    // 選取文字以便使用者快速覆蓋
    setTimeout(() => nameInput.select(), 100);
    container.appendChild(nameInput);

    // 3. 核心邏輯：最終取得的檔名 (處理使用者手動刪減為空的情況)[cite: 4]
    const getFinalName = () => {
        const val = nameInput.value.trim();
        // 如果輸入框被刪到全空，則依照 bgm filename > simai_package 的順序 fallback
        return val || getBaseName(audioManager.bgmFile) || 'simai_package';
    };

    const sanitize = (name) => name.replace(/[\\/:*?"<>|]/g, '_');

    popupWindow({
        title: "下載譜面套件",
        customContent: container,
        buttons: [
            {
                text: "下載 Maidata",
                onClick: () => {
                    const content = typeof getSimaiDataString === 'function' ? getSimaiDataString(maidata) : "";
                    const blob = new Blob([content], { type: 'text/plain' });
                    const fileName = sanitize(getFinalName());

                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `${fileName}.txt`;
                    a.click();
                }
            },
            {
                text: "打包 ZIP",
                onClick: async (ctx) => {
                    ctx.setProgress(10);
                    const zip = new JSZip();
                    const fileName = sanitize(getFinalName());

                    // 寫入檔案[cite: 4]
                    zip.file("maidata.txt", typeof getSimaiDataString === 'function' ? getSimaiDataString(maidata) : "");

                    if (backgroundImage) {
                        const bgExt = backgroundImage.name?.split('.').pop() || 'png';
                        zip.file(`bg.${bgExt}`, backgroundImage);
                    }

                    if (audioManager.haveBGM()) {
                        const bgm = audioManager.bgmFile;
                        const bgmExt = bgm.name?.split('.').pop() || 'mp3';
                        if (bgm instanceof Blob) {
                            zip.file(`track.${bgmExt}`, bgm);
                        } else if (typeof bgm === 'string') {
                            try {
                                const resp = await fetch(bgm);
                                zip.file(`track.${bgmExt}`, await resp.blob());
                            } catch (e) { console.error("BGM 下載失敗", e); }
                        }
                    }

                    if (backgroundVideo) {
                        const videoExt = backgroundVideo.name?.split('.').pop() || 'mp4';
                        zip.file(`pv.${videoExt}`, backgroundVideo);
                    }

                    ctx.setProgress(40);
                    const content = await zip.generateAsync({ type: "blob" }, (m) => ctx.setProgress(40 + m.percent * 0.6));

                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(content);
                    a.download = `${fileName}.zip`;
                    a.click();
                    ctx.close();
                }
            },
            { text: "取消", hideOnClick: true }
        ]
    });
});

function applyHighlight(text) {
    const warningRanges = warningPositions.map(index => {
        const start = rawData.slice(0, index).join(',').length + 1;
        const end = rawData.slice(0, index + 1).join(',').length;
        return { start, end };
    });
    highlightLayer.innerHTML = getHighlight(text, warningRanges);
    warningPositions = []; // 重置警告位置，等待下一次解析更新
}

const slideInputDebounce = debounce(() => {
    timeControlSliding = false;
    // 嘗試將背景影片定位到播放時間並播放；若尚未載入則在可播放時再嘗試
    if (editorBackgroundVideo && editorBackgroundVideo.src) {
        const setTimeAndTryPlay = () => {
            try {
                editorBackgroundVideo.currentTime = realTime;
            } catch (e) {
                // 在某些瀏覽器於 metadata 尚未就緒前 set currentTime 會拋錯，忽略並等待 canplay
                console.warn('設定背景影片時間失敗，將在 canplay 時重試', e);
            }

            const p = editorBackgroundVideo.play();
            if (p && typeof p.catch === 'function') {
                p.catch((err) => {
                    // play 失敗時，等候 canplay 再重試一次
                    const onCanPlay = () => {
                        editorBackgroundVideo.removeEventListener('canplay', onCanPlay);
                        editorBackgroundVideo.play().catch(() => { });
                    };
                    editorBackgroundVideo.addEventListener('canplay', onCanPlay, { once: true });
                });
            }
        };

        if (playButton.dataset.playing === 'true') {
            if (editorBackgroundVideo.readyState >= 1) {
                // metadata 已就緒，可以立刻設定時間並嘗試播放
                setTimeAndTryPlay();
            } else {
                // 等待 metadata/canplay
                editorBackgroundVideo.addEventListener('loadedmetadata', setTimeAndTryPlay, { once: true });
            }
        }
    }
    idbSet('simai_timeControl', realTime).catch((error) => {
        console.error("儲存時間控制值到 IndexedDB 失敗:", error);
    });
}, 300);

slider.addEventListener('input', () => {
    timeControlSliding = true;
    const value = parseFloat(slider.value);
    globalTime = value - musicDelay;
    realTime = value;
    audioManager.stopAllLongSounds();

    if (playButton.dataset.playing === 'true') {
        editorBackgroundVideo.pause();
        // 2. 播放中拖動：音樂即時同步跳轉 (Seek)
        // 注意：Web Audio API 重建 Source Node 很快，但極速拖動可能會有噴麥音
        audioManager.playBGM(realTime);
    } else {
        // 3. 暫停中拖動：只需停止 BGM 並更新畫布預覽
        audioManager.stopBGM();
        draw();
    }

    if (settings.cursorFollow) {
        const point = rawData.slice(0, nowIndex + 1).join(',').length;
        editorInput.selectionStart = point;
        editorInput.selectionEnd = point;
    }

    updateSlider(realTime);
    slideInputDebounce();
});

let bgmUpdateTimer = null;

if (keepRenderingWhilePause) requestAnimationFrame(update);

let lastStartTime = 0;

playButton.addEventListener('click', () => {
    bgmUpdateTimer = null; // 重置 BGM 更新計時器
    if (playButton.dataset.playing === 'true') {
        editorBackgroundImage.style.display =
            settings.hideBackgroundWhenPaused ? 'none' :
                ((editorBackgroundImage.complete && editorBackgroundImage.naturalWidth !== 0) ? 'block' : 'none');
        editorBackgroundVideo.style.display = 'none';
        editorBackgroundVideo.pause();

        playButton.dataset.playing = 'false';
        playButton.children[0].innerText = "play_arrow";
        lastTimestamp = null;

        // --- 停止音效與 BGM ---
        audioManager.stopAllLongSounds();
        audioManager.stopBGM();

        notes.forEach(n => n._riserActive = false); // 強制重置標記

        draw(); // 立即更新畫布，反映暫停狀態
    } else {
        lastStartTime = realTime; // 記錄開始播放的時間點
        editorBackgroundImage.style.display = (editorBackgroundImage.complete && editorBackgroundImage.naturalWidth !== 0) ? 'block' : 'none';
        editorBackgroundVideo.style.display =
            ((editorBackgroundVideo.readyState === 4) ? 'block' : 'none');
        editorBackgroundVideo.currentTime = realTime;
        if (editorBackgroundVideo.paused && editorBackgroundVideo.readyState >= 1) {
            editorBackgroundVideo.play();
        }
        playButton.dataset.playing = 'true';
        playButton.children[0].innerText = "pause";
        lastTimestamp = performance.now();

        // --- 從當前的 realTime 同步啟動 BGM ---
        audioManager.playBGM(realTime);

        update(lastTimestamp);
    }
    slideInputDebounce();
});

resetButton.addEventListener('click', () => {
    editorBackgroundImage.style.display = settings.hideBackgroundWhenPaused ? 'none' : ((editorBackgroundImage.complete && editorBackgroundImage.naturalWidth !== 0) ? 'block' : 'none');
    editorBackgroundVideo.style.display = 'none';
    playButton.dataset.playing = 'false';
    playButton.children[0].innerText = "play_arrow";
    bgmUpdateTimer = null;
    lastTimestamp = null;
    realTime = 0;
    globalTime = realTime - musicDelay;
    updateSlider(realTime);

    // --- 停止音效與 BGM ---
    audioManager.stopAllLongSounds();
    audioManager.stopBGM();

    notes.forEach(n => n._riserActive = false); // 強制重置標記

    draw(); // 立即更新畫布，反映停止狀態
});

stopButton.addEventListener('click', () => {
    editorBackgroundImage.style.display = settings.hideBackgroundWhenPaused ? 'none' : ((editorBackgroundImage.complete && editorBackgroundImage.naturalWidth !== 0) ? 'block' : 'none');
    editorBackgroundVideo.style.display = 'none';
    playButton.dataset.playing = 'false';
    playButton.children[0].innerText = "play_arrow";
    bgmUpdateTimer = null;
    lastTimestamp = null;
    realTime = lastStartTime || 0;
    globalTime = realTime - musicDelay;
    updateSlider(realTime);

    // --- 停止音效與 BGM ---
    audioManager.stopAllLongSounds();
    audioManager.stopBGM();

    notes.forEach(n => n._riserActive = false); // 強制重置標記

    draw(); // 立即更新畫布，反映停止狀態
});

keyboardButton.addEventListener('click', () => {
    editorInput.focus();
});

function updatePlaycontrol(visualVisible = false, isHidden = false) {
    const c = window.getComputedStyle(document.documentElement);
    const cC = document.querySelector('#playControlContainer .controlsContainer');
    const d = document.documentElement.style;

    const maxPlayControlsHeight = c.getPropertyValue('--const-max-playControls-height');
    const collapsedPlayControlsHeight = c.getPropertyValue('--const-collapsed-playControls-height');
    if (!isHidden) {
        slider.style.display = 'none';
        cC.style.display = 'none';
        hideButton.dataset.hidden = 'true';
        d.setProperty('--playControls-height', '0px');
        showPlayControlsBtn.style.display = 'block';
    } else {
        showPlayControlsBtn.style.display = 'none';
        hideButton.dataset.hidden = 'false';
        slider.style.display = 'block';
        cC.style.display = 'flex';
        if (visualVisible) {
            previewContainer.style.display = 'none';
            d.setProperty('--playControls-height', collapsedPlayControlsHeight);
        } else {
            previewContainer.style.display = 'block';
            d.setProperty('--playControls-height', maxPlayControlsHeight);
        }
    }
}

showPlayControlsBtn.addEventListener('click', () => {
    hideButton.click();
});

hideButton.addEventListener('click', () => {
    const visualVisible = visualEditor.style.display !== 'none';
    const isHidden = hideButton.dataset.hidden === 'true';

    updatePlaycontrol(visualVisible, isHidden);
    resize();
});

getNowNoteIndex.addEventListener('click', () => {
    const point = rawData.slice(0, nowIndex + 1).join(',').length;
    // 2. 設定游標位置
    editorInput.selectionStart = point;
    editorInput.selectionEnd = point;
    editorInput.focus();
});

function indexFromCursor(text, point) {
    const textBefore = text.substring(0, point);
    const cleanedText = textBefore.replace(/\|\|.*$/gm, "");
    return (cleanedText.match(/,/g) || []).length;
}

getCursorNoteIndex.addEventListener('click', () => {
    const point = editorInput.selectionStart;
    const targetTime = dataIndexToTime[indexFromCursor(editorInput.value, point)];
    const value = targetTime + musicDelay;
    globalTime = value - musicDelay;
    realTime = value;
    updateSlider(realTime);
    slideInputDebounce();
    audioManager.stopAllLongSounds();

    if (playButton.dataset.playing === 'true') {
        audioManager.playBGM(realTime);
    } else {
        draw();
    }

    editorInput.focus();
});

const applySelectedRotation = (direction) => {
    const fullText = editorInput.value;
    if (!fullText) return;

    const start = editorInput.selectionStart;
    const end = editorInput.selectionEnd;
    const selected = start === end ? fullText : fullText.slice(start, end);
    const rotated = contantRotate(selected, direction);
    if (rotated === selected) return;

    const newText = start === end
        ? rotated
        : `${fullText.slice(0, start)}${rotated}${fullText.slice(end)}`;

    editorInput.value = newText;
    editorInput.selectionStart = start;
    editorInput.selectionEnd = start + rotated.length;
    editorInput.setSelectionRange(start, start + rotated.length);
    applyHighlight(newText);
    editorInputDebounce();
    inputDebounce();
    editorInput.focus();
};

rCwiseButton.addEventListener('click', () => {
    applySelectedRotation(1);
});

rCCwiseButton.addEventListener('click', () => {
    applySelectedRotation(-1);
});

r180Button.addEventListener('click', () => {
    applySelectedRotation(4);
});

function applyVerticalFlip() {
    const start = editorInput.selectionStart;
    const end = editorInput.selectionEnd;
    if (start === end) return;

    const fullText = editorInput.value;
    const selected = fullText.slice(start, end);

    const deMap = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1, 6: 8, 7: 7, 8: 6 };
    const rotated = flipSelectedText(selected, deMap, (ch) => {
        const n = parseInt(ch, 10);
        return ((12 - n) % 8 + 1).toString();
    }, {
        p: 'q',
        q: 'p'
        // 🔴 這裡不放 < 和 >，因為上下反轉時順逆時針狀態不變
    });

    const newText = `${fullText.slice(0, start)}${rotated}${fullText.slice(end)}`;
    editorInput.value = newText;
    editorInput.selectionStart = start;
    editorInput.selectionEnd = start + rotated.length;
    editorInput.setSelectionRange(start, start + rotated.length);
    applyHighlight(newText);
    editorInputDebounce();
    inputDebounce();
    editorInput.focus();
}

function applyHorizontalFlip() {
    const start = editorInput.selectionStart;
    const end = editorInput.selectionEnd;
    if (start === end) return;

    const fullText = editorInput.value;
    const selected = fullText.slice(start, end);

    const deMap = { 1: 1, 2: 8, 3: 7, 4: 6, 5: 5, 6: 4, 7: 3, 8: 2 };
    const rotated = flipSelectedText(selected, deMap, (ch) => {
        const n = parseInt(ch, 10);
        return ((8 - n) % 8 + 1).toString();
    }, {
        p: 'q',
        q: 'p',
        s: 'z',
        z: 's',
        '<': '>', // 🔴 左右反轉時，順逆時針會互換
        '>': '<'
    });

    const newText = `${fullText.slice(0, start)}${rotated}${fullText.slice(end)}`;
    editorInput.value = newText;
    editorInput.selectionStart = start;
    editorInput.selectionEnd = start + rotated.length;
    editorInput.setSelectionRange(start, start + rotated.length);
    applyHighlight(newText);
    editorInputDebounce();
    inputDebounce();
    editorInput.focus();
}

fVerticalButton.addEventListener('click', () => {
    applyVerticalFlip();
});

fHorizontalButton.addEventListener('click', () => {
    applyHorizontalFlip();
});

function update(timestamp) {
    // 1. 基本時間計算
    const bp = settings.playbackSpeed || 1;
    if (lastTimestamp === null) lastTimestamp = timestamp;
    const dt = (timestamp - lastTimestamp) / 1000; // 秒
    lastTimestamp = timestamp;

    const isPlaying = playButton.dataset.playing === 'true';

    // 2. 邏輯更新區塊：僅在播放狀態下推進時間
    if (isPlaying) {
        realTime += dt * bp;
        globalTime = realTime - musicDelay;
        if (settings.cursorFollow) {
            cursorLastIndexTime = dataIndexToTime[nowIndex] || 0; // 更新游標對應的時間
            const point = rawData.slice(0, nowIndex + 1).join(',').length;
            // 2. 設定游標位置
            editorInput.selectionStart = point;
            editorInput.selectionEnd = point;
        }

        // BGM 與影片同步邏輯（每秒檢查一次）
        if (bgmUpdateTimer === null || bgmUpdateTimer >= 1) {
            const bgmTime = audioManager.haveBGM() ? audioManager.getBGMTime() : null;
            if (bgmTime !== null && Math.abs(bgmTime - realTime) > 0.03) {
                realTime = bgmTime;
                globalTime = realTime - musicDelay;
            }

            // 背景影片同步邏輯[cite: 2]
            if (editorBackgroundVideo.src && editorBackgroundVideo.readyState >= 2) {
                const nowSec = performance.now() / 1000;
                const diff = Math.abs(editorBackgroundVideo.currentTime - realTime);
                if (diff > VIDEO_SEEK_THRESHOLD && (nowSec - lastVideoSeekTime) >= VIDEO_MIN_SEEK_INTERVAL) {
                    try {
                        editorBackgroundVideo.currentTime = realTime;
                        lastVideoSeekTime = nowSec;
                    } catch (e) {
                        console.warn('背景影片 seek 失敗', e);
                    }
                }
            }
            bgmUpdateTimer = 0;
        }

        bgmUpdateTimer = (bgmUpdateTimer || 0) + dt;
        updateSlider(realTime);

        // 結束播放判定[cite: 2]
        if (globalTime >= endTime) {
            playButton.dataset.playing = 'false';
            playButton.children[0].innerText = "play_arrow";
            globalTime = endTime;
            updateSlider(endTime);
        }
    }

    // 3. 渲染與循環區塊：解決重複渲染的核心
    // 只要處於「播放中」或者「暫停但需持續渲染（如：顯示感應器或動畫）」的狀態
    if (isPlaying || keepRenderingWhilePause) {
        // 確保一幀只呼叫一次渲染
        draw(dt);

        // 確保一個循環只請求一次下一幀[cite: 2]
        requestAnimationFrame(update);
    } else {
        // 暫停且不需持續渲染時，重置 timestamp 以免下次啟動時 dt 過大[cite: 2]
        lastTimestamp = null;
    }
}

function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvasContainer.clientWidth * dpr;
    const h = canvasContainer.clientHeight * dpr;

    if (lastCanvasSize.w === w && lastCanvasSize.h === h) {
        resizeVisualEditor();
        return; // 尺寸不變，避免重設畫布造成多餘重排
    }

    lastCanvasSize.w = w;
    lastCanvasSize.h = h;

    const scaleValue = renderer?.scale ?? scale;
    const p = Math.min(w, h) / scaleBase * scaleValue;

    canvas.width = w;
    canvas.height = h;
    if (!secondCtx) ctx.setTransform(p, 0, 0, p, w / 2, h / 2);
    resizeVisualEditor();
    resizePreviewCanvas();
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
                background-color: #000;
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
                width: 100%;
                height: 100%;
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
        renderer.setContext(ctx); // 告訴 renderer 使用第二個 Canvas 的上下文
        draw(); // 重新繪製到主 Canvas
    });

    const syncResize = () => {
        const dpr = externalWindow.devicePixelRatio || 1;
        const size = Math.min(externalWindow.innerWidth, externalWindow.innerHeight);
        extCanvas.width = externalWindow.innerWidth * dpr;
        extCanvas.height = externalWindow.innerHeight * dpr;

        // 重新套用你的座標系統 (這點最重要！)
        const p = size / scaleBase * (renderer?.scale ?? scale) * dpr;
        secondCtx.setTransform(p, 0, 0, p, extCanvas.width / 2, extCanvas.height / 2);
        draw();
    };

    syncResize();

    externalWindow.addEventListener('resize', syncResize);
    renderer.setContext(secondCtx); // 告訴 renderer 使用第二個 Canvas 的上下文

    draw(); // 重新繪製到第二個 Canvas
}

recordVideoButton.addEventListener('click', async () => {
    if (!window.Mediabunny) {
        simpleToast({ content: 'Mediabunny 未載入，無法錄製', type: 'error' });
        return;
    }

    // UI: 使用 createLabeledInput 建立欄位
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:8px;font-size:13px;';

    const inputRefs = {};
    const startDefault = 0;
    const endDefault = String((endTime + musicDelay).toFixed(2));
    const fpsDefault = '30';

    const startField = createLabeledInput1({ value: startDefault, labelText: '開始時間 (s):', type: 'text', assign: 'record_start', ref: inputRefs });
    const endField = createLabeledInput1({ value: endDefault, labelText: '結束時間 (s):', type: 'text', assign: 'record_end', ref: inputRefs });
    const fpsField = createLabeledInput1({ value: fpsDefault, labelText: 'FPS:', type: 'text', assign: 'record_fps', ref: inputRefs });
    const widthField = createLabeledInput1({ value: 1080, labelText: '寬度:', type: 'text', assign: 'record_width', ref: inputRefs });
    const heightField = createLabeledInput1({ value: 720, labelText: '高度:', type: 'text', assign: 'record_height', ref: inputRefs });
    const bgmVolField = createLabeledInput1({ value: settings.musicVolume, labelText: 'BGM 音量:', type: 'text', assign: 'record_bgm_vol', ref: inputRefs });
    const sfxVolField = createLabeledInput1({ value: settings.SfxVolume, labelText: 'SFX 音量:', type: 'text', assign: 'record_sfx_vol', ref: inputRefs });

    if (inputRefs.record_start) { inputRefs.record_start.type = 'number'; inputRefs.record_start.step = '0.01'; inputRefs.record_start.min = '0'; }
    if (inputRefs.record_end) { inputRefs.record_end.type = 'number'; inputRefs.record_end.step = '0.01'; inputRefs.record_end.min = '0'; }
    if (inputRefs.record_fps) { inputRefs.record_fps.type = 'number'; inputRefs.record_fps.step = '1'; inputRefs.record_fps.min = '1'; }
    if (inputRefs.record_width) { inputRefs.record_width.type = 'number'; inputRefs.record_width.step = '1'; inputRefs.record_width.min = '1'; }
    if (inputRefs.record_height) { inputRefs.record_height.type = 'number'; inputRefs.record_height.step = '1'; inputRefs.record_height.min = '1'; }
    if (inputRefs.record_bgm_vol) { inputRefs.record_bgm_vol.type = 'number'; inputRefs.record_bgm_vol.step = '0.1'; inputRefs.record_bgm_vol.min = '0'; }
    if (inputRefs.record_sfx_vol) { inputRefs.record_sfx_vol.type = 'number'; inputRefs.record_sfx_vol.step = '0.1'; inputRefs.record_sfx_vol.min = '0'; }

    // 加上無障礙 htmlFor 與防止點擊穿透樣式
    const audioLabel = document.createElement('label');
    audioLabel.htmlFor = 'record_audio_chk';
    audioLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;pointer-events:auto!important;';
    const audioSpan = document.createElement('span'); audioSpan.textContent = '包含音訊:'; audioSpan.style.cssText = 'width:110px;color:#ddd;';
    const audioChk = document.createElement('input'); audioChk.type = 'checkbox'; audioChk.id = 'record_audio_chk'; audioChk.checked = !!audioManager?.bgmBuffer;
    audioChk.style.cssText = 'width:16px;height:16px;cursor:pointer;pointer-events:auto!important;';
    audioLabel.appendChild(audioSpan); audioLabel.appendChild(audioChk);

    const sfxLabel = document.createElement('label');
    sfxLabel.htmlFor = 'record_sfx_chk';
    sfxLabel.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;pointer-events:auto!important;';
    const sfxSpan = document.createElement('span'); sfxSpan.textContent = '包含打擊音效:'; sfxSpan.style.cssText = 'width:110px;color:#ddd;';
    const sfxChk = document.createElement('input'); sfxChk.type = 'checkbox'; sfxChk.id = 'record_sfx_chk'; sfxChk.checked = true;
    sfxChk.style.cssText = 'width:16px;height:16px;cursor:pointer;pointer-events:auto!important;';
    sfxLabel.appendChild(sfxSpan); sfxLabel.appendChild(sfxChk);

    container.appendChild(startField.wrapper);
    container.appendChild(endField.wrapper);
    container.appendChild(fpsField.wrapper);
    container.appendChild(widthField.wrapper);
    container.appendChild(heightField.wrapper);
    container.appendChild(bgmVolField.wrapper);
    container.appendChild(sfxVolField.wrapper);
    container.appendChild(audioLabel);
    container.appendChild(sfxLabel);

    popupWindow({
        title: '逐幀渲染錄製',
        customContent: container,
        width: '420px',
        buttons: [
            {
                text: '開始',
                onClick: async (pwCtx) => {
                    // 🔴 修正：將 includeAudio 與 includeSfx 由此處精準抓取並傳入
                    await videoRender(pwCtx, {
                        start: parseFloat(inputRefs.record_start?.value) || 0,
                        end: parseFloat(inputRefs.record_end?.value) || endTime || (audioManager?.getBGMDuration ? audioManager.getBGMDuration() : endTime || 0),
                        fps: Math.max(1, parseInt(inputRefs.record_fps?.value || '30', 10)),
                        width: Math.max(1, parseInt(inputRefs.record_width?.value || '1080', 10)),
                        height: Math.max(1, parseInt(inputRefs.record_height?.value || '720', 10)),
                        bgmVolume: parseFloat(inputRefs.record_bgm_vol?.value) ?? settings.musicVolume ?? 0.8,
                        sfxVolume: parseFloat(inputRefs.record_sfx_vol?.value) ?? settings.sfxVolume ?? 1.0,
                        includeBgm: audioChk.checked && !!audioManager?.bgmBuffer,
                        includeSfx: sfxChk.checked // 🔴 成功傳遞
                    });
                },
            },
            { text: '取消', hideOnClick: true }
        ]
    });
});

window.addEventListener('resize', resize);

window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        // 🔴 修正：拿掉外面的 e.preventDefault()，改在需要攔截的 case 內個別加上

        switch (e.key.toLowerCase()) {
            case 's':
                e.preventDefault(); // 🟢 攔截瀏覽器預設的網頁另存新檔
                isContextEdited = false;

                simpleToast({ content: '已儲存！', type: 'success', timeout: 1200 });
                maidata['inote_' + nowDifficulty] = editorInput.value;
                saveMaidata();
                break;

            case 'o': {
                e.preventDefault(); // 🟢 攔截瀏覽器預設的開啟檔案
                let sp = settings.playbackSpeed - 0.25;
                if (sp <= 0.25) sp = 0.25;
                setPlaybackSpeed(sp);
                simpleToast({ content: `已設定播放速度：${sp.toFixed(2)}x`, type: 'success', timeout: 1800 });
                break;
            }

            case 'p': {
                e.preventDefault(); // 🟢 攔截瀏覽器預設的列印網頁
                let sp = settings.playbackSpeed + 0.25;
                if (sp >= 2.0) sp = 2.0;
                setPlaybackSpeed(sp);
                simpleToast({ content: `已設定播放速度：${sp.toFixed(2)}x`, type: 'success', timeout: 1800 });
                break;
            }

            case 'z': {
                // 🟢 關鍵優化：只有當焦點不在編輯器輸入框內時，才觸發譜面架構的 Undo
                // 這樣使用者在打字時，Ctrl+Z 依然能正常撤銷他剛剛打錯的字！
                if (document.activeElement !== editorInput) {
                    e.preventDefault();
                    undoButton.click();
                    simpleToast({ content: '復原譜面變更', type: 'info', timeout: 1200 });
                }
                break;
            }

            case 'y': {
                // 🟢 同理優化重作邏輯
                if (document.activeElement !== editorInput) {
                    e.preventDefault();
                    redoButton.click();
                    simpleToast({ content: '重作譜面變更', type: 'info', timeout: 1200 });
                }
                break;
            }
        }
    }
});

window.addEventListener("beforeunload", (event) => {
    if (isContextEdited) {
        // Cancel the event as stated by the standard.
        event.preventDefault();
        // Chrome requires returnValue to be set.
        event.returnValue = "";
    }
});

let playClock = [false, false, false, false];
function draw(dt = 0) {
    if (!renderer) return;

    // 早期初始化：提取常用值避免重複計算
    const playing = playButton.dataset.playing === 'true';
    const previewVisibleFlag = previewVisible();
    const isVisualModeFlag = isVisualMode();
    const visualHeight = (() => {
        if (!previewVisibleFlag) {
            return visualEditorRenderer.getCanvasWH().height;
        } else {
            return previewRender.getCanvasWH().width / 2;
        }
    })();
    const V = visualHeight / settings.visualZoom;
    const effectDecayTime = settings.effectDecayTime;
    const hanabiEffectDecayTime = settings.hanabiEffectDecayTime;
    const maxSlideCount = settings.maxSlideCount;
    const middleDistance = settings.middleDistance;
    const notesLength = notes.length;

    // 初始化 index
    if (notesLength > 0 && notes[0] && realTime < notes[0].time) {
        nowIndex = 0;
    }

    // 準備繪製桶子
    const buckets = { slide: [], tapnhold: [], touch: [] };
    const visualBuckets = { slide: [], tapnhold: [], touch: [], tags: [] };

    // 節拍器邏輯
    if (playing && readyBeat) {
        const beatDuration = 240 / clockBpm;
        for (let i = 0; i < 4; i++) {
            const clockT = (i / 4) * beatDuration - globalTime;
            if (clockT > 0) {
                playClock[i] = false;
            } else if (!playClock[i]) {
                audioManager.queueSoundSingle('clock', clockT);
                playClock[i] = true;
            }
        }
    }

    playCombo = 0;
    playScore = 0;
    let slideOnScreenCount = 0;
    let foundIndexForThisFrame = false;

    // 核心音符迴圈
    for (let i = notesLength - 1; i >= 0; i--) {
        const note = notes[i];
        const noteT = note.time - globalTime;
        const noteType = note.type;
        const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0);

        const calcPiecewiseSpeed = (x) => {
            if (x >= 1) {
                return x * 0.8833 + 0.8167;
            } else if (x <= -1) {
                return x * 0.8833 - 0.8167;
            } else {
                return x * 1.7;
            }
        };
        const noteHispeed = note.hispeed ?? 1;
        // 2. 精準套用至常規速度與 Touch 速度
        const speedCoeff = calcPiecewiseSpeed(settings.speed * noteHispeed);
        const touchSpeedCoeff = calcPiecewiseSpeed(settings.touchSpeed * noteHispeed);


        // 索引追蹤（早期完成以減少迴圈計算）
        if (!foundIndexForThisFrame && realTime >= (note.time + musicDelay) && noteType !== "slide") {
            nowIndex = note.index ?? nowIndex;
            foundIndexForThisFrame = true;
        }

        // Combo 計算：提前計算避免重複條件檢查
        if (noteT < 0) {
            const shouldCountCombo =
                (noteType === "slide" ? (note.lastSlide && skipT + noteT < 0) :
                    noteType === "hold" ? (skipT + noteT < 0) :
                        noteType === "touch" && note.holdDuration !== undefined ? (skipT + noteT < 0) :
                            noteType !== "slide");
            if (shouldCountCombo) {
                playCombo++;
                playScore += ((note.isBreak ? 5 :
                    (noteType === "slide" ? 3 :
                        note.holdDuration !== undefined ? 2 : 1)
                ) * playScoreRes.invScore) * 100 + (note.isBreak ? playScoreRes.breakScore : 0);
            }
        }

        // 音效和狀態管理
        if (playing && !timeControlSliding) {
            // Riser 邏輯
            if (noteType === "touch" && note.holdDuration > 0) {
                const isInsideHold = noteT <= 0 && -noteT < note.holdDuration;
                const noteId = `riser_${note.pos}_${note.time}`;
                if (isInsideHold && !note._riserActive) {
                    audioManager.startLongSound(noteId, 'touchHold_riser', -noteT);
                    note._riserActive = true;
                } else if (!isInsideHold && note._riserActive) {
                    audioManager.stopLongSound(noteId);
                    note._riserActive = false;
                }
            }

            // 開始音效
            if (noteT <= 0 && !note._startEffectPlayed) {
                if (!(noteType === "slide" && !note.firstSlide)) {
                    audioManager.queueSound(note, note.time + (note.slideDelay ?? 0));
                }
                note._startEffectPlayed = true;
            }

            // 結束音效：簡化條件判斷
            if (-noteT > skipT && !note._endEffectPlayed) {
                const shouldPlayEndSound =
                    (noteType === "slide" && note.lastSlide && note.isBreak) ||
                    (noteType !== "slide" && note.isBreak) ||
                    note.isHanabi ||
                    (note.holdDuration !== undefined && noteType !== "tap");
                if (shouldPlayEndSound) {
                    audioManager.queueSound(note, note.time + skipT);
                }
                note._endEffectPlayed = true;
            }
        } else if (noteT > 0) {
            // 倒帶或拖動時重置狀態
            note._startEffectPlayed = false;
            note._endEffectPlayed = false;
            if (note._riserActive) {
                audioManager.stopLongSound(`riser_${note.pos}_${note.time}`);
                note._riserActive = false;
            }
        }

        // 繪製可見性判斷
        const t = 1 - renderer.timeFunction(noteT * speedCoeff);
        const touchT = 1 - renderer.timeFunction(noteT * touchSpeedCoeff);

        const isVisible =
            (noteType === "slide" ? t >= middleDistance :
                noteType === "touch" ? touchT >= -1 :
                    t >= -1)
            && -noteT <= skipT + (note.isHanabi ? hanabiEffectDecayTime : effectDecayTime);

        const isVisualVisible = noteT >= 0
            ? Math.abs(noteT) <= V
            : -noteT <= V + skipT;

        // 快速分類到桶子
        if (isVisible) {
            if (noteType === 'slide') {
                if (slideOnScreenCount < maxSlideCount) {
                    buckets.slide.push(note);
                    slideOnScreenCount++;
                }
            } else if (noteType === 'hold' || noteType === 'tap') {
                buckets.tapnhold.push(note);
            } else if (noteType === 'touch') {
                buckets.touch.push(note);
            }
        }

        if (isVisualVisible) {
            if (noteType === 'slide') {
                visualBuckets.slide.push(note);
            } else if (noteType === 'hold' || noteType === 'tap') {
                visualBuckets.tapnhold.push(note);
            } else if (noteType === 'touch') {
                visualBuckets.touch.push(note);
            }
        }
    }

    // 標籤分類
    const tagsLength = decodedTags.length;
    for (let i = 0; i < tagsLength; i++) {
        const tag = decodedTags[i];
        visualBuckets.tags.push(tag);
        if (Math.abs(tag.time - globalTime) <= V) {
            // 標籤邏輯保留（如果需要額外處理）
        }
    }

    // 渲染和更新
    renderer.drawFrame({
        globalTime,
        buckets,
        dt,
        showSensor: settings.showSensor,
        showSensorText: (settings.showSensorTextWhenPaused && !playing),
        playCombo,
        playScore,
        nowIndex
    });

    if ((!isVisualModeFlag || editorContainer.style.display === 'none') && previewVisibleFlag) {
        previewRender.drawFrame({
            globalTime,
            visualBuckets,
            audioBuffer: audioManager.bgmBuffer,
            offset: musicDelay,
            indexTime: (lastStartTime ?? 0) - musicDelay,
            cursorIndexTime: cursorLastIndexTime,
        });
    }

    audioManager.update(globalTime);
    if (!isVisualModeFlag || editorContainer.style.display === 'none') return;
    visualEditorRenderer?.render(isVisualModeFlag, ensureVisualEditorContext, {
        globalTime,
        visualBuckets,
        audioBuffer: audioManager.bgmBuffer,
        offset: musicDelay,
    });
}

function _init() {
    popupWindow({
        title: "正在準備環境...",
        content: "",
        buttons: [],
        unclosable: true,
        onOpen: async (ctx) => {
            try {
                const step = (p, msg) => (ctx.setProgress(p), ctx.setContent(msg));
                await audioManager.init((pct, key) => step(pct * 0.4, `正在載入音效: ${key} (${Math.round(pct)}%)`));

                images = await loadAllImages((pct, key) => step(40 + pct * 0.4, `正在載入素材: ${key} (${Math.round(pct)}%)`));
                readyBeat = await idbGet('simai_ready_beat') === 'true';

                step(80, "正在恢復上次的編輯狀態...");
                const [
                    savedTimeControl,
                    savedBgm,
                    savedMaiData,
                    savedDifficulty,
                    bg,
                    bgVideo,
                    hideEditor,
                    savedSettings,
                ] = await Promise.all([
                    idbGet('simai_timeControl'),
                    idbGet('simai_resource_bgm'),
                    idbGet('simai_maidata'),
                    idbGet('simai_now_difficulty'),
                    idbGet('simai_background_image'),
                    idbGet('simai_background_video'),
                    idbGet('simai_hide_editor'),
                    idbGet('simai_settings'),
                ]);
                if (savedTimeControl && !isNaN(savedTimeControl)) {
                    realTime = savedTimeControl; globalTime = realTime - musicDelay; update();
                }
                if (savedSettings) {
                    step(84, "還原設定...");
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
                    playbackSpeedInput.value = settings.playbackSpeed;
                } else {
                    settings = { ...defaultSettings }
                    await idbSet('simai_settings', JSON.stringify(settings));
                };
                if (savedDifficulty) { nowDifficulty = savedDifficulty; changeDifficulty.value = nowDifficulty; }
                if (savedMaiData) {
                    step(88, "還原編輯內容...");
                    maidata = savedMaiData;
                    editorInput.value = maidata["inote_" + nowDifficulty] || '';
                    getres(editorInput.value);
                    applyHighlight(editorInput.value);

                    // 初始化時同步 lastEditorValue 並清空當前 session 歷史
                    undoStack = [];
                    redoStack = [];
                    historyMap = {};
                    lastEditorValue = editorInput.value || '';

                    musicDelay = parseFloat(maidata.first) || 0;
                    offsetInput.value = musicDelay;
                    offsetInputDebounce();
                };
                if (bgVideo) {
                    backgroundVideo = bgVideo;
                    editorBackgroundVideo.src = URL.createObjectURL(bgVideo);
                    editorBackgroundVideo.style.display = 'none';
                    editorBackgroundVideo.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
                }
                if (bg) {
                    // 保留原本的 Blob，並同時將畫面上的 <img> 元素設為該來源
                    backgroundImage = bg;
                    editorBackgroundImage.src = URL.createObjectURL(bg);
                    editorBackgroundImage.style.display = settings.hideBackgroundWhenPaused ? 'none' : 'block';
                    editorBackgroundImage.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
                }
                if (savedBgm) {
                    step(95, "正在還原背景音樂...");
                    await audioManager.setBackgroundMusic(savedBgm);
                    setEndtime(endTime);
                }
                window.settings = settings;
                if (hideEditor) {
                    hideEditorButton.children[0].textContent = "right_panel_open";
                    editorContainer.dataset.hidden = 'true';
                }
                setEditorCss(!hideEditor);
                changeDisplayMode.value = settings.displayMode ?? 'simai';
                renderer = new SimaiRenderer(canvas, settings);
                renderer.setImages(images);
                visualEditorRenderer = new SimaiVisualEditor(visualEditor, settings);
                visualEditorRenderer.setImages(images);
                visualEditorRenderer.setContext(visualCtx || visualEditor.getContext('2d'));
                audioManager.setBGMVolume(settings.musicVolume);
                visualEditorRenderer.setZoom(settings.visualZoom);
                previewRender = new SimaiPreviewRenderer(previewCanvas, settings);
                previewRender.setZoom(settings.visualZoom);
                setPlaybackSpeed(settings.playbackSpeed);
                draw();
                updateSlider(realTime);
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
}


async function videoRender(pwCtx, {
    start = 0,
    end = 0,
    fps = 30,
    width = 1080,
    height = 720,
    bgmVolume = 0.8,
    sfxVolume = 1.0,
    includeAudio = true,
    includeBgm = true,
    includeSfx = true, // 🔴 接收參數
} = {}) {
    const {
        Output,
        BufferTarget,
        WebMOutputFormat,
        CanvasSource,
        AudioBufferSource,
        QUALITY_HIGH
    } = window.Mediabunny;

    const outlineImage = await (async () => {
        try {
            const response = await fetch('./Skin/outline.png');
            if (!response.ok) throw new Error('fetch failed: ' + response.status);
            const blob = await response.blob();
            try {
                if (window.createImageBitmap) return await createImageBitmap(blob);
            } catch (e) {
                console.warn('createImageBitmap 失敗，改用 Image element', e);
            }
            return await new Promise((res, rej) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => { URL.revokeObjectURL(img.src); res(img); };
                img.onerror = (err) => { URL.revokeObjectURL(img.src); rej(err); };
                img.src = URL.createObjectURL(blob);
            });
        } catch (e) {
            console.error(`外框圖片載入失敗`, e);
            return null;
        }
    })();

    if (end <= start) {
        simpleToast({ content: '結束時間需大於開始時間', type: 'error' });
        return;
    }

    try {
        pwCtx.setButtons([{ text: '取消', hideOnClick: true }]);
        pwCtx.setProgress(0);
        pwCtx.setContent('準備中...');

        const off = document.createElement('canvas');
        off.width = width;
        off.height = height;
        const offCtx = off.getContext('2d');

        const scaleValue = renderer?.scale ?? scale;
        const p = Math.min(width, height) / scaleBase * scaleValue;
        offCtx.setTransform(p, 0, 0, p, width / 2, height / 2);

        const target = new BufferTarget();
        const format = new WebMOutputFormat();
        const output = new Output({ format, target });

        // 視訊軌設定
        const encodingConfig = {
            codec: 'vp8',
            bitrate: QUALITY_HIGH,
            keyFrameInterval: 0.5,
            latencyMode: 'quality'
        };

        const videoSource = new CanvasSource(off, encodingConfig);
        output.addVideoTrack(videoSource, { frameRate: fps });

        let exportVideo = null;
        let exportVideoReady = false;
        if (editorBackgroundVideo && editorBackgroundVideo.src) {
            try {
                exportVideo = document.createElement('video');
                exportVideo.src = editorBackgroundVideo.src;
                exportVideo.muted = true;
                exportVideo.crossOrigin = 'anonymous';
                exportVideo.preload = 'auto';
                await new Promise((res) => {
                    let done = false;
                    const onloaded = () => { if (done) return; done = true; res(); };
                    exportVideo.addEventListener('loadedmetadata', onloaded);
                    setTimeout(() => { if (done) return; done = true; res(); }, 1500);
                });
                exportVideoReady = true;
            } catch (e) {
                console.warn('建立匯出用背景影片失敗', e);
            }
        }

        let audioSource = null;
        let slicedAudio = null;

        // 🔴 核心重構：先完整合成好音訊，拿到規格後再向 output 註冊音軌
        if (includeAudio) {
            if (includeBgm) {
                const t = audioManager.getBGMDuration();
                if (start < t && end <= t) {
                    const sliceAudioBuffer = (buf, s, e) => {
                        const sr = buf.sampleRate;
                        const startSample = Math.max(0, Math.floor(s * sr));
                        const endSample = Math.min(buf.length, Math.floor(e * sr));
                        const len = Math.max(0, endSample - startSample);
                        const nb = new AudioBuffer({ length: len, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
                        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
                            const data = buf.getChannelData(ch).subarray(startSample, endSample);
                            nb.getChannelData(ch).set(data);
                        }
                        return nb;
                    };

                    const bgmBuf = audioManager.bgmBuffer;
                    slicedAudio = bgmBuf ? sliceAudioBuffer(bgmBuf, start, end) : null;
                }
            }

            if (includeSfx) {
                const sfxEvents = [];
                const longSoundEvents = [];
                const sfxFrameSet = new Set();

                for (let ni = 0; ni < notes.length; ni++) {
                    const note = notes[ni];
                    const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0);
                    const startT = note.time + musicDelay;
                    const endT = note.time + skipT + musicDelay;

                    /*
                    if (noteType === "touch" && note.holdDuration > 0) {
                        const isInsideHold = noteT <= 0 && -noteT < note.holdDuration;
                        const noteId = `riser_${note.pos}_${note.time}`;
                        if (isInsideHold && !note._riserActive) {
                            audioManager.startLongSound(noteId, 'touchHold_riser', -noteT);
                            note._riserActive = true;
                        } else if (!isInsideHold && note._riserActive) {
                            audioManager.stopLongSound(noteId);
                            note._riserActive = false;
                        }
                    }

                    // 開始音效
                    if (noteT <= 0 && !note._startEffectPlayed) {
                        if (!(noteType === "slide" && !note.firstSlide)) {
                            audioManager.queueSound(note, note.time + (note.slideDelay ?? 0));
                        }
                        note._startEffectPlayed = true;
                    }

                    // 結束音效：簡化條件判斷
                    if (-noteT > skipT && !note._endEffectPlayed) {
                        const shouldPlayEndSound =
                            (noteType === "slide" && note.lastSlide && note.isBreak) ||
                            (noteType !== "slide" && note.isBreak) ||
                            note.isHanabi ||
                            (note.holdDuration !== undefined && noteType !== "tap");
                        if (shouldPlayEndSound) {
                            audioManager.queueSound(note, note.time + skipT);
                        }
                        note._endEffectPlayed = true;
                    }
                    */

                    if (startT >= start && startT <= end) {
                        note._startEffectPlayed = false;
                        const evs = audioManager.getSfxEventsForNote(note, startT + (note.slideDelay ?? 0));
                        if (!(note.type === "slide" && !note.firstSlide)) {
                            for (const ev of evs) {
                                // 改為毫秒級去重（避免以 fps 為單位而濾掉高頻觸發）
                                const timeMs = Math.floor(ev.time * 1000);
                                const dedupeKey = `${timeMs}_${ev.key}`;
                                if (sfxFrameSet.has(dedupeKey)) continue;
                                sfxFrameSet.add(dedupeKey);

                                sfxEvents.push({ key: ev.key, time: ev.time, isMono: ev.isMono, volume: ev.volume });
                            }
                            note._startEffectPlayed = true;
                        }
                    }
                    if (endT >= start && endT <= end) {
                        note._startEffectPlayed = true;
                        const shouldPlayEndSound =
                            (note.type === "slide" && note.lastSlide && note.isBreak) ||
                            (note.type !== "slide" && note.isBreak) ||
                            note.isHanabi ||
                            (note.holdDuration !== undefined && note.type !== "tap");
                        if (shouldPlayEndSound) {
                            const evsEnd = audioManager.getSfxEventsForNote(note, endT);
                            for (const ev of evsEnd) {
                                // 改為毫秒級去重（避免以 fps 為單位而濾掉高頻觸發）
                                const timeMs = Math.floor(ev.time * 1000);
                                const dedupeKey = `${timeMs}_${ev.key}`;
                                if (sfxFrameSet.has(dedupeKey)) continue;
                                sfxFrameSet.add(dedupeKey);

                                sfxEvents.push({ key: ev.key, time: ev.time, isMono: ev.isMono, volume: ev.volume });
                            }
                        }
                        note._endEffectPlayed = true;
                    }
                    if (note.type === 'touch' && note.holdDuration > 0) {
                        if (startT < end && endT > start) {
                            longSoundEvents.push({ key: 'touchHold_riser', startSec: startT, endSec: endT });
                        }
                    }
                }

                sfxEvents.sort((a, b) => a.time - b.time);

                // 內部核心混音工廠
                const mixSfxInto = (baseBuf, events, longEvents, s, e) => {
                    const sr = baseBuf ? baseBuf.sampleRate : (audioManager.ctx.sampleRate || 48000);
                    const outLen = Math.max(1, Math.ceil((e - s) * sr));
                    const bgmChannels = baseBuf ? baseBuf.numberOfChannels : 0;

                    let sfxMaxCh = 1;
                    for (const [k, b] of audioManager.bufferMap.entries()) {
                        if (b && b.numberOfChannels > sfxMaxCh) sfxMaxCh = b.numberOfChannels;
                    }
                    const outCh = Math.max(bgmChannels || 0, sfxMaxCh || 1);
                    const out = new AudioBuffer({ length: outLen, numberOfChannels: outCh, sampleRate: sr });

                    if (baseBuf) {
                        for (let ch = 0; ch < outCh; ch++) {
                            const dst = out.getChannelData(ch);
                            const src = baseBuf.getChannelData(ch < baseBuf.numberOfChannels ? ch : 0);
                            const copyLen = Math.min(src.length, outLen);
                            for (let i = 0; i < copyLen; i++) {
                                dst[i] = src[i] * bgmVolume;
                            }
                        }
                    }

                    const addLoopingBufferAt = (key, eventStartSec, eventEndSec) => {
                        const sfxBuf = audioManager.bufferMap.get(key);
                        if (!sfxBuf) return;
                        const loop = audioManager.loopPoints[key];
                        const finalVol = 0.5 * sfxVolume;
                        const sfxRate = sfxBuf.sampleRate || sr;

                        const audibleStartSec = Math.max(s, eventStartSec);
                        const audibleEndSec = Math.min(e, eventEndSec);
                        if (audibleStartSec >= audibleEndSec) return;

                        const startIdx = Math.floor((audibleStartSec - s) * sr);
                        const endIdx = Math.floor((audibleEndSec - s) * sr);

                        for (let ch = 0; ch < sfxBuf.numberOfChannels; ch++) {
                            const src = sfxBuf.getChannelData(ch);
                            const dst = out.getChannelData(ch < outCh ? ch : 0);

                            for (let idx = startIdx; idx < endIdx; idx++) {
                                if (idx < 0 || idx >= outLen) continue;
                                const timeSinceEventStart = (s + idx / sr) - eventStartSec;
                                let sampleSec = timeSinceEventStart;

                                if (loop) {
                                    if (sampleSec >= loop.end) {
                                        sampleSec = loop.start + ((sampleSec - loop.end) % (loop.end - loop.start));
                                    }
                                } else if (sampleSec >= sfxBuf.length / sfxRate) {
                                    continue;
                                }

                                const srcPos = sampleSec * sfxRate;
                                const srcIdx0 = Math.floor(srcPos);
                                const srcIdx1 = srcIdx0 + 1;
                                const frac = srcPos - srcIdx0;
                                const s0 = (srcIdx0 >= 0 && srcIdx0 < src.length) ? src[srcIdx0] : 0;
                                const s1 = (srcIdx1 >= 0 && srcIdx1 < src.length) ? src[srcIdx1] : 0;
                                const sampleVal = s0 * (1 - frac) + s1 * frac;
                                dst[idx] += sampleVal * finalVol;
                            }
                        }
                    };

                    for (const lev of longEvents) {
                        addLoopingBufferAt(lev.key, lev.startSec, lev.endSec);
                    }

                    const addBufferAt = (sfxBuf, atSec, baseVol, isMono, cutoffSec) => {
                        if (!sfxBuf) return;
                        const finalVol = (baseVol ?? 1) * sfxVolume;
                        const dstRate = sr;
                        const srcRate = sfxBuf.sampleRate || sr;
                        const dstStart = Math.floor((atSec - s) * dstRate);
                        const ratio = srcRate / dstRate;

                        let maxDurationSec = sfxBuf.length / srcRate;
                        if (isMono && cutoffSec !== undefined) {
                            maxDurationSec = Math.min(maxDurationSec, cutoffSec - atSec);
                        }
                        const maxDstSamples = Math.floor(maxDurationSec * dstRate);

                        for (let ch = 0; ch < outCh; ch++) {
                            const src = sfxBuf.getChannelData(ch < sfxBuf.numberOfChannels ? ch : 0);
                            const dst = out.getChannelData(ch);

                            for (let i = 0; i < maxDstSamples; i++) {
                                const dstIdx = dstStart + i;
                                if (dstIdx < 0) continue;
                                if (dstIdx >= outLen) break;

                                const srcPos = i * ratio;
                                const srcIdx0 = Math.floor(srcPos);
                                const srcIdx1 = srcIdx0 + 1;
                                if (srcIdx0 >= src.length) break;

                                const frac = srcPos - srcIdx0;
                                const s0 = src[srcIdx0] || 0;
                                const s1 = src[srcIdx1] || 0;
                                const sample = s0 * (1 - frac) + s1 * frac;

                                // 純加總樣本值，延後處理峰值以避免逐次非線性失真
                                dst[dstIdx] += sample * finalVol;
                            }
                        }
                    };

                    const lastTriggerTimes = new Map();

                    for (let i = 0; i < events.length; i++) {
                        const ev = events[i];
                        if (lastTriggerTimes.has(ev.key)) {
                            const lastTime = lastTriggerTimes.get(ev.key);
                            if (ev.time - lastTime == 0) {
                                continue;
                            }
                        }
                        lastTriggerTimes.set(ev.key, ev.time);

                        const sfxBuf = audioManager.bufferMap.get(ev.key);
                        if (!sfxBuf) continue;

                        let cutoffSec = undefined;
                        if (ev.isMono) {
                            for (let j = i + 1; j < events.length; j++) {
                                if (events[j].key === ev.key && events[j].isMono) {
                                    cutoffSec = events[j].time;
                                    break;
                                }
                            }
                        }
                        addBufferAt(sfxBuf, ev.time, ev.volume, ev.isMono, cutoffSec);
                    }

                    // 以峰值 (peak) 為基準做一次性縮放，避免失真與破音
                    let peak = 0;
                    for (let ch = 0; ch < outCh; ch++) {
                        const d = out.getChannelData(ch);
                        for (let i = 0; i < d.length; i++) {
                            const v = Math.abs(d[i]);
                            if (v > peak) peak = v;
                        }
                    }
                    if (peak > 1) {
                        const scale = 1 / peak;
                        for (let ch = 0; ch < outCh; ch++) {
                            const d = out.getChannelData(ch);
                            for (let i = 0; i < d.length; i++) {
                                d[i] *= scale;
                            }
                        }
                    }
                    return out;
                };

                slicedAudio = mixSfxInto(slicedAudio, sfxEvents, longSoundEvents, start, end);
            }

            // 🔴 關鍵修正：此時混音完全結束，拿到了帶有正確規格的 slicedAudio。
            // 立即將明確的 sampleRate 與聲道數宣告給編碼器，再將音軌塞進輸出器中
            if (slicedAudio) {
                audioSource = new AudioBufferSource({
                    codec: 'opus',
                    bitrate: QUALITY_HIGH,
                    sampleRate: slicedAudio.sampleRate,        // 補上確切採樣率
                    numberOfChannels: slicedAudio.numberOfChannels // 補上確切聲道數
                });
                output.addAudioTrack(audioSource);
            }
        }

        // 🔴 順序修正：此時音、視訊軌皆已配置完整，安心啟動
        await output.start();

        // 啟動後，將音訊資料塞入
        if (includeAudio && audioSource && slicedAudio) {
            await audioSource.add(slicedAudio);
        }

        const mainCtx = canvas.getContext('2d');
        renderer.setContext(offCtx);

        const seekVideoTo = async (video, time) => {
            if (!video) return;
            const cur = video.currentTime || 0;
            if (Math.abs(cur - time) <= VIDEO_SEEK_THRESHOLD) return;

            if (typeof video.fastSeek === 'function') {
                try { video.fastSeek(time); } catch (e) { video.currentTime = time; }
                await new Promise((res) => {
                    let done = false;
                    const onseek = () => { if (done) return; done = true; video.removeEventListener('seeked', onseek); res(); };
                    video.addEventListener('seeked', onseek);
                    setTimeout(() => { if (done) return; done = true; res(); }, 200);
                });
                return;
            }
            await new Promise((res) => {
                let done = false;
                const onseek = () => { if (done) return; done = true; video.removeEventListener('seeked', onseek); res(); };
                video.addEventListener('seeked', onseek);
                try { video.currentTime = time; } catch (e) { video.currentTime = time; }
                setTimeout(() => { if (done) return; done = true; res(); }, 300);
            });
        };

        const total = end - start;
        const frameCount = Math.max(1, Math.ceil(total * fps));
        const step = 1 / fps;

        pwCtx.setContent(`開始逐幀渲染：${frameCount} 幀`);
        for (let i = 0; i < frameCount; i++) {
            const t = start + i * step;
            const globalT = t - (musicDelay || 0);

            const speedCoeff = settings.speed * 0.8833 + 0.8167;
            const touchSpeedCoeff = settings.touchSpeed * 0.8833 + 0.8167;

            const buckets = { slide: [], tapnhold: [], touch: [] };
            let playComboLocal = 0;
            let playScoreLocal = 0;
            let slideOnScreenCount = 0;
            let nowIndexLocal = 0;

            for (let j = notes.length - 1; j >= 0; j--) {
                const note = notes[j];
                const noteT = note.time - globalT;
                const noteType = note.type;
                const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0);

                if (noteT < 0) {
                    const shouldCountCombo =
                        (noteType === 'slide' ? (note.lastSlide && skipT + noteT < 0) :
                            noteType === 'hold' ? (skipT + noteT < 0) :
                                noteType === 'touch' && note.holdDuration !== undefined ? (skipT + noteT < 0) :
                                    noteType !== 'slide');
                    if (shouldCountCombo) {
                        playComboLocal++;
                        playScoreLocal += ((note.isBreak ? 5 :
                            (noteType === "slide" ? 3 :
                                note.holdDuration !== undefined ? 2 : 1)
                        ) * playScoreRes.invScore) * 100 + (note.isBreak ? playScoreRes.breakScore : 0);
                    }
                }

                const tval = 1 - renderer.timeFunction(noteT * speedCoeff);
                const touchT = 1 - renderer.timeFunction(noteT * touchSpeedCoeff);

                const isVisible =
                    (noteType === 'slide' ? (tval >= (settings.middleDistance || 0.25)) :
                        noteType === 'touch' ? (touchT >= -1) :
                            tval >= -1)
                    && -noteT <= skipT + (note.isHanabi ? (settings.hanabiEffectDecayTime || 0.8) : (settings.effectDecayTime || 0.4));

                if (isVisible) {
                    if (noteType === 'slide') {
                        if (slideOnScreenCount < (settings.maxSlideCount || 500)) {
                            buckets.slide.push(note);
                            slideOnScreenCount++;
                        }
                    } else if (noteType === 'hold' || noteType === 'tap') {
                        buckets.tapnhold.push(note);
                    } else if (noteType === 'touch') {
                        buckets.touch.push(note);
                    }
                }
            }

            try {
                offCtx.save();
                offCtx.setTransform(1, 0, 0, 1, 0, 0);
                offCtx.fillStyle = settings.backgroundColor || '#000';
                offCtx.fillRect(0, 0, off.width, off.height);
                const rs = renderer.scale || scale;

                const boxSize = Math.min(off.width, off.height);
                const boxX = Math.round((off.width - boxSize) / 2);
                const boxY = Math.round((off.height - boxSize) / 2);
                const boxW = boxSize, boxH = boxSize;

                const drawContain = (srcW, srcH, drawFn) => {
                    if (!srcW || !srcH) return drawFn(0, 0, srcW, srcH, boxX, boxY, boxW, boxH);
                    const scale = Math.min(boxW / srcW, boxH / srcH) * rs;
                    const dw = Math.round(srcW * scale);
                    const dh = Math.round(srcH * scale);
                    const dx = Math.round(boxX + (boxW - dw) / 2);
                    const dy = Math.round(boxY + (boxH - dh) / 2);
                    return drawFn(0, 0, srcW, srcH, dx, dy, dw, dh);
                };

                if (exportVideo && exportVideoReady && (exportVideo.duration || exportVideo.videoWidth)) {
                    const bgTarget = Math.max(0, Math.min((exportVideo.duration || 0) - 0.001, t));
                    if (Math.abs((exportVideo.currentTime || 0) - bgTarget) > VIDEO_SEEK_THRESHOLD) {
                        await seekVideoTo(exportVideo, bgTarget);
                    }
                    try { offCtx.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`; } catch (e) { offCtx.filter = 'none'; }
                    const vw = exportVideo.videoWidth || exportVideo.width || boxW;
                    const vh = exportVideo.videoHeight || exportVideo.height || boxH;
                    drawContain(vw, vh, (sx, sy, sw, sh, dx, dy, dw, dh) => offCtx.drawImage(exportVideo, sx, sy, sw || vw, sh || vh, dx, dy, dw, dh));
                    offCtx.filter = 'none';
                } else if (editorBackgroundImage && editorBackgroundImage.src && editorBackgroundImage.complete) {
                    const img = editorBackgroundImage;
                    const iw = img.naturalWidth || img.width || boxW;
                    const ih = img.naturalHeight || img.height || boxH;
                    try { offCtx.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`; } catch (e) { offCtx.filter = 'none'; }
                    drawContain(iw, ih, (sx, sy, sw, sh, dx, dy, dw, dh) => offCtx.drawImage(img, sx, sy, sw || iw, sh || ih, dx, dy, dw, dh));
                    offCtx.filter = 'none';
                }

                if (outlineImage) {
                    offCtx.setTransform(p, 0, 0, p, width / 2, height / 2);
                    offCtx.drawImage(outlineImage, scaleBase * -0.5 * 0.9, scaleBase * -0.5 * 0.9, scaleBase * 0.9, scaleBase * 0.9);
                }
            } finally {
                offCtx.restore();
            }

            renderer.drawFrame({
                globalTime: globalT,
                buckets,
                dt: step,
                showSensor: settings.showSensor,
                showSensorText: false,
                playCombo: playComboLocal,
                playScore: playScoreLocal,
                nowIndex: nowIndexLocal,
                skipClear: true
            });

            const tsRelative = i * step;
            await videoSource.add(tsRelative, step);

            pwCtx.setProgress(((i + 1) / frameCount) * 100);
            pwCtx.setContent(`渲染中：第 ${i + 1} / ${frameCount} 幀`);
        }

        await output.finalize();
        const mime = await output.getMimeType();
        const ext = output.format?.fileExtension || '.webm';
        const buf = target.buffer;
        if (!buf) throw new Error('未取得輸出 buffer');

        const blob = new Blob([buf], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `simai_render${ext}`; document.body.appendChild(a); a.click(); a.remove();

        simpleToast({ content: '逐幀渲染完成，檔案已下載', type: 'success', timeout: 2500 });

        renderer.setContext(mainCtx);
        pwCtx.setProgress(100);
        pwCtx.setContent('完成');
    } catch (err) {
        console.error('逐幀渲染失敗', err);
        simpleToast({ content: '渲染失敗：' + String(err), type: 'error' });
        try { pwCtx.setContent('錯誤：' + String(err)); } catch (e) { }
        try { renderer.setContext(canvas.getContext('2d')); } catch (e) { }
    }
}