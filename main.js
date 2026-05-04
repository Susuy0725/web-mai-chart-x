import { openDB, idbGet, idbSet } from './indexDB.js';
import { scaleBase, getButton, debounce, throttle, audioManager, getHighlight, parseMaidata, popupWindow, loadAllImages, simpleToast, formatSize, getSimaiDataString, contantRotate, flipSelectedText, clamp } from './helper.js';
import { SimaiRenderer, SimaiVisualEditor, SimaiPreviewRenderer } from './renderer.js';
import { simaiDecode } from './decode.js';

let
    images,
    readyBeat = false,
    maidata = {},
    nowDifficulty = 5,
    backgroundImage,
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
const playButton = getButton("play/pause", "control");
const hideButton = getButton("hide", "control");
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
const tapBpmButton = getButton("tapBpm", "utility");
const manageResourcesButton = getButton("manageResources", "utility");
const playbackSpeedInput = getButton("playbackSpeed", "utility").children[0];
const undoButton = getButton("undo", "utility");
const redoButton = getButton("redo", "utility");
const recordVideoButton = getButton("recordVideo", "utility");
const fetchFromMainoteButton = getButton("fetchFromMainote", "utility");
const previewContainer = document.getElementById('miniPreviewContainer');
const previewCanvas = document.getElementById('miniPreview');
const previewZoomInButton = document.getElementById('mpzoomIn');
const previewZoomOutButton = document.getElementById('mpzoomOut');
const editorContainer = document.getElementById('editorContainer');
const editorInput = document.getElementById('editor-input');
const highlightLayer = document.getElementById('highlight-layer');

let notes = [], endTime = 1, musicDelay = 0, rawData = [];

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
    moviebrightness: -1,
    showSensor: true,
    pinkStars: false,
    rotateStars: false,

    displayMode: 'simai', // simai 或 visual
    middleDistance: 0.25,
    effectDecayTime: 0.4,
    noteBaseSize: 11,
    maxSlideCount: 500, // on screen,
    inputDebounceTime: 800, // ms
    showSensorTextWhenPaused: true,
    hideBackgroundWhenPaused: false,

    playbackSpeed: 1, // 播放速度，1 是正常速度
    musicVolume: 0.8, // 音樂音量，0 到 1 之間
    SfxVolume: 1, // 音效音量，0 到 1 之間
    visualZoom: 200, // 視覺模式下的縮放倍率
};
const settingsConfig = [
    {
        label: '基本',
        items: [
            { id: 'speed', type: 'number', label: ' Tap/Hold 速度', step: 0.1, min: 1, max: 20, def: defaultSettings.speed },
            { id: 'slideSpeed', type: 'number', label: ' Slide 速度', step: 0.1, min: -1, max: 1, def: defaultSettings.slideSpeed, },
            { id: 'touchSpeed', type: 'number', label: ' Touch 速度', step: 0.1, min: 1, max: 20, def: defaultSettings.touchSpeed }
        ]
    },
    {
        label: '顯示',
        items: [
            {
                id: 'moviebrightness',
                type: 'number',
                label: '背景暗度',
                step: 0.1, min: -1, max: 0,
                def: defaultSettings.moviebrightness || 0,
                apply: (val) => { if (backgroundImage) editorBackgroundImage.style.filter = `brightness(${1 + 0.75 * val})`; }
            },
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
                id: 'musicVolume', type: 'range', label: '音樂音量', min: 0, max: 1, step: 0.1, def: defaultSettings.musicVolume,
                apply: (val) => { audioManager.setBGMVolume(val); }
            },
            {
                id: 'SfxVolume', type: 'range', label: '音效音量', min: 0, max: 1, step: 0.1, def: defaultSettings.SfxVolume,
                apply: (val) => { audioManager.setSFXVolume(val); }
            }
        ]
    },
    {
        label: '其他',
        items: [

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

let lastCanvasSize = { w: 0, h: 0 };
let lastVisualEditorSize = { w: 0, h: 0 };

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

editMusicButton.addEventListener('click', () => {
    if (!audioManager.bgmBuffer) {
        simpleToast({ content: '請先匯入音樂', type: 'warning' });
        return;
    }

    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:10px;font-size:13px;width:min(90vw,600px);';

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 120;
    canvas.style.cssText = 'width:100%;height:120px;background:#111;border:1px solid #555;border-radius:4px;cursor:crosshair;';
    container.appendChild(canvas);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:15px;align-items:center;flex-wrap:wrap;';
    controls.innerHTML = `
        <label style="display:flex;align-items:center;gap:5px;">
            BPM: <input type="number" id="editBpmInput" value="${clockBpm}" step="1" style="width:60px;background:#222;color:#fff;border:1px solid #555;padding:4px;border-radius:4px;">
        </label>
        <label style="display:flex;align-items:center;gap:5px;">
            第一拍偏移(s): <input type="number" id="editOffsetInput" value="${musicDelay}" step="0.001" style="width:80px;background:#222;color:#fff;border:1px solid #555;padding:4px;border-radius:4px;">
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

    const zoomInput = controls.querySelector('#editZoomInput');
    zoomInput.addEventListener('change', () => {
        drawWaveform();
    });
    const shiftInput = controls.querySelector('#editShiftInput');
    const visualOffsetSlider = document.createElement('input');
    visualOffsetSlider.type = 'range';
    visualOffsetSlider.min = -5;
    visualOffsetSlider.max = 5;
    visualOffsetSlider.step = 0.01;
    visualOffsetSlider.value = 0;
    visualOffsetSlider.style.cssText = 'width:100%;';
    const bgmVolumeInput = controls.querySelector('#editBgmVolumeInput');

    const visualOffsetLabel = document.createElement('div');
    visualOffsetLabel.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;color:#ccc;';
    visualOffsetLabel.innerHTML = `<span>視覺偏移: </span><strong id="visualOffsetValue">0.00s</strong>`;

    const offsetControl = document.createElement('div');
    offsetControl.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%;';
    offsetControl.appendChild(visualOffsetLabel);
    offsetControl.appendChild(visualOffsetSlider);
    container.appendChild(offsetControl);

    const actionBox = document.createElement('div');
    actionBox.style.cssText = 'display:flex;gap:10px;margin-top:5px;flex-wrap:wrap;';

    let offsetTime = musicDelay;
    let visualOffset = 0;
    const ctxCanvas = canvas.getContext('2d');
    let bgmBuffer = audioManager.bgmBuffer;
    let duration = bgmBuffer.duration;

    const drawWaveform = () => {
        bgmBuffer = audioManager.bgmBuffer;
        duration = bgmBuffer.duration;
        const data = bgmBuffer.getChannelData(0);
        const zoom = Math.max(1, parseFloat(zoomInput.value) || 1);
        const viewLength = Math.max(0.1, duration / zoom);
        const viewCenter = Math.min(duration, Math.max(0, offsetTime + visualOffset));
        let viewStart = viewCenter - viewLength / 2;
        if (viewStart < 0) viewStart = 0;
        if (viewStart + viewLength > duration) viewStart = Math.max(0, duration - viewLength);
        const viewEnd = viewStart + viewLength;
        const startSample = Math.floor(viewStart * bgmBuffer.sampleRate);
        const endSample = Math.min(data.length, Math.ceil(viewEnd * bgmBuffer.sampleRate));
        const viewSamples = Math.max(1, endSample - startSample);
        const step = Math.ceil(viewSamples / canvas.width);

        ctxCanvas.clearRect(0, 0, canvas.width, canvas.height);

        ctxCanvas.fillStyle = '#1e90ff';
        for (let i = 0; i < canvas.width; i++) {
            let min = 1.0;
            let max = -1.0;
            const sampleBase = startSample + Math.floor((i / canvas.width) * viewSamples);
            for (let j = 0; j < step; j++) {
                const idx = sampleBase + j;
                if (idx >= endSample) break;
                const datum = data[idx];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            const y = (1 - max) * canvas.height / 2;
            const h = Math.max(1, (max - min) * canvas.height / 2);
            ctxCanvas.fillRect(i, y, 1, h);
        }

        // Draw Playhead
        const x = ((offsetTime - viewStart) / viewLength) * canvas.width;
        ctxCanvas.strokeStyle = '#ff3333';
        ctxCanvas.lineWidth = 2;
        ctxCanvas.beginPath();
        ctxCanvas.moveTo(Math.max(0, Math.min(canvas.width, x)), 0);
        ctxCanvas.lineTo(Math.max(0, Math.min(canvas.width, x)), canvas.height);
        ctxCanvas.stroke();

        // Draw playing Playhead
        //const x = Math.max(0, Math.min((offsetTime / duration) * canvas.width, canvas.width));
        /*ctxCanvas.strokeStyle = '#ff3333';
        ctxCanvas.lineWidth = 2;
        ctxCanvas.beginPath();
        ctxCanvas.moveTo(x, 0);
        ctxCanvas.lineTo(x, canvas.height);
        ctxCanvas.stroke();*/
    };

    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        offsetTime = Math.max(0, (x / rect.width) * duration / zoomInput.value - visualOffset);
        container.querySelector('#editOffsetInput').value = offsetTime.toFixed(3);
        drawWaveform();
        if (isPreviewing) {
            audioManager.playBGM(offsetTime, parseFloat(bgmVolumeInput.value) || 0.75);
        }
    });

    visualOffsetSlider.addEventListener('input', () => {
        visualOffset = parseFloat(visualOffsetSlider.value) || 0;
        container.querySelector('#visualOffsetValue').innerText = `${visualOffset.toFixed(2)}s`;
        drawWaveform();
    });

    controls.querySelector('#editOffsetInput').addEventListener('change', (e) => {
        offsetTime = parseFloat(e.target.value) || 0;
        drawWaveform();
    });

    const playClockBtn = document.createElement('button');
    playClockBtn.innerText = '節拍器預覽 (從播放頭)';
    playClockBtn.style.cssText = 'padding:4px 10px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;';
    controls.appendChild(playClockBtn);

    let isPreviewing = false;
    let previewInterval;

    const stopPreview = () => {
        if (isPreviewing) {
            clearInterval(previewInterval);
            audioManager.stopBGM();
            playClockBtn.innerText = '節拍器預覽 (從播放頭)';
            isPreviewing = false;
        }
    };

    playClockBtn.addEventListener('click', () => {
        if (isPreviewing) {
            stopPreview();
        } else {
            const bpm = parseFloat(container.querySelector('#editBpmInput').value) || clockBpm;
            const msPerBeat = 60000 / bpm;

            audioManager.playBGM(offsetTime, parseFloat(bgmVolumeInput.value) || 0.75);

            // 使用 setTimeout 模擬基本的節拍器
            let expectedTickTime = performance.now() + msPerBeat;
            previewInterval = setInterval(() => {
                const now = performance.now();
                if (now >= expectedTickTime) {
                    console.log('Tick!');
                    audioManager.play('clock')
                    expectedTickTime += msPerBeat;
                }
            }, 10);

            playClockBtn.innerText = '停止預覽';
            isPreviewing = true;
        }
    });

    // 裁切與補白功能
    const modifyBgmBufferButton = document.createElement('button');
    modifyBgmBufferButton.innerText = '裁去播放頭前所有音訊';
    modifyBgmBufferButton.style.cssText = 'padding:4px 8px;background:#8b0000;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;';

    modifyBgmBufferButton.addEventListener('click', () => {
        if (offsetTime <= 0) return;
        if (!confirm('確定要從播放頭處裁切掉前面的音樂嗎？此操作會重新建立音訊緩衝。')) return;

        stopPreview();
        const ctx = audioManager.ctx;
        const oldBuf = audioManager.bgmBuffer;
        const startOffset = Math.floor(offsetTime * oldBuf.sampleRate);
        const newLen = oldBuf.length - startOffset;

        if (newLen <= 0) return;

        const newBuffer = ctx.createBuffer(oldBuf.numberOfChannels, newLen, oldBuf.sampleRate);
        for (let ch = 0; ch < oldBuf.numberOfChannels; ch++) {
            const oldData = oldBuf.getChannelData(ch);
            const newData = newBuffer.getChannelData(ch);
            newData.set(oldData.subarray(startOffset));
        }

        audioManager.bgmBuffer = newBuffer;
        offsetTime = 0; // 裁掉後，前面就沒了，播放頭歸零
        container.querySelector('#editOffsetInput').value = 0;
        musicDelay = 0;
        offsetInput.value = 0;
        drawWaveform();
        simpleToast({ content: '音訊已自播放頭裁剪', type: 'success' });
    });

    const padBgmBufferButton = document.createElement('button');
    padBgmBufferButton.innerText = '在開頭補白 1 拍 (依 BPM)';
    padBgmBufferButton.style.cssText = 'padding:4px 8px;background:#006400;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;';

    padBgmBufferButton.addEventListener('click', () => {
        stopPreview();
        const bpm = parseFloat(container.querySelector('#editBpmInput').value) || clockBpm;
        const secPerBeat = 60 / bpm;

        const ctx = audioManager.ctx;
        const oldBuf = audioManager.bgmBuffer;
        const padSamples = Math.floor(secPerBeat * oldBuf.sampleRate);
        const newLen = oldBuf.length + padSamples;

        const newBuffer = ctx.createBuffer(oldBuf.numberOfChannels, newLen, oldBuf.sampleRate);
        for (let ch = 0; ch < oldBuf.numberOfChannels; ch++) {
            const oldData = oldBuf.getChannelData(ch);
            const newData = newBuffer.getChannelData(ch);
            newData.set(oldData, padSamples); // 前面的會是預設的 0 (靜音)
        }

        audioManager.bgmBuffer = newBuffer;
        offsetTime += secPerBeat; // 補白後，播放頭向後延伸
        container.querySelector('#editOffsetInput').value = offsetTime.toFixed(3);
        drawWaveform();
        simpleToast({ content: '已在音訊開頭補白', type: 'success' });
    });

    const applyShiftButton = document.createElement('button');
    applyShiftButton.innerText = '套用音訊偏移';
    applyShiftButton.style.cssText = 'padding:4px 8px;background:#004a75;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;';
    applyShiftButton.addEventListener('click', () => {
        const shiftSeconds = parseFloat(shiftInput.value) || 0;
        if (shiftSeconds === 0) {
            simpleToast({ content: '請填寫非零的音訊偏移值。', type: 'warning' });
            return;
        }

        stopPreview();
        const ctx = audioManager.ctx;
        const oldBuf = audioManager.bgmBuffer;
        const sampleRate = oldBuf.sampleRate;
        const shiftSamples = Math.round(Math.abs(shiftSeconds) * sampleRate);

        if (shiftSeconds > 0) {
            const newLen = oldBuf.length + shiftSamples;
            const newBuffer = ctx.createBuffer(oldBuf.numberOfChannels, newLen, sampleRate);
            for (let ch = 0; ch < oldBuf.numberOfChannels; ch++) {
                const oldData = oldBuf.getChannelData(ch);
                const newData = newBuffer.getChannelData(ch);
                newData.set(oldData, shiftSamples);
            }
            audioManager.bgmBuffer = newBuffer;
            offsetTime += shiftSeconds;
            simpleToast({ content: `已補 ${shiftSeconds.toFixed(3)}s 靜音於音訊開頭。`, type: 'success' });
        } else {
            if (shiftSamples >= oldBuf.length) {
                simpleToast({ content: '裁剪長度超過音訊總長度，請縮小數值。', type: 'error' });
                return;
            }
            const newLen = oldBuf.length - shiftSamples;
            const newBuffer = ctx.createBuffer(oldBuf.numberOfChannels, newLen, sampleRate);
            for (let ch = 0; ch < oldBuf.numberOfChannels; ch++) {
                const oldData = oldBuf.getChannelData(ch);
                const newData = newBuffer.getChannelData(ch);
                newData.set(oldData.subarray(shiftSamples));
            }
            audioManager.bgmBuffer = newBuffer;
            offsetTime = Math.max(0, offsetTime + shiftSeconds);
            simpleToast({ content: `已裁剪音訊開頭 ${Math.abs(shiftSeconds).toFixed(3)}s。`, type: 'success' });
        }

        container.querySelector('#editOffsetInput').value = offsetTime.toFixed(3);
        drawWaveform();
    });

    actionBox.appendChild(modifyBgmBufferButton);
    actionBox.appendChild(padBgmBufferButton);
    actionBox.appendChild(applyShiftButton);
    container.appendChild(actionBox);

    setTimeout(drawWaveform, 100);

    popupWindow({
        title: '編輯音樂與第一拍 offset',
        customContent: container,
        width: 'max-content',
        buttons: [
            {
                text: '套用',
                onClick: (ctx) => {
                    const bpm = parseFloat(container.querySelector('#editBpmInput').value) || clockBpm;
                    musicDelay = offsetTime;
                    offsetInput.value = musicDelay;
                    editorInput.value += `\n(${bpm})`;
                    applyHighlight(editorInput.value);
                    inputDebounce();
                    offsetInputDebounce();
                    stopPreview();
                    ctx.close();
                }
            },
            {
                text: '取消',
                hideOnClick: true,
                onClick: () => {
                    stopPreview();
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
    applyHighlight('');
    musicDelay = 0;
    realTime = 0;
    globalTime = 0;
    slider.max = 1;
    slider.value = 0;
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
    editorBackgroundImage.style.filter = `brightness(${1 + 0.75 * settings.moviebrightness})`;
    inputDebounce();
    saveMaidata();

    idbSet('simai_background_image', null).catch(() => { });
    idbSet('simai_now_difficulty', nowDifficulty).catch(() => { });
    idbSet('simai_resource_bgm', null).catch(() => { });
    idbSet('simai_timeControl', 0).catch(() => { });
}

fetchFromMainoteButton.addEventListener('click', () => {
    const { createClient } = supabase;

    const supabaseUrl = "https://tntzyagdhlrdeswyrsjw.supabase.co";
    const supabaseKey = "sb_publishable_eoR0itFK2HCrDAMd-6Jbxg_OYCkGWTJ";
    const client = createClient(supabaseUrl, supabaseKey);

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
            // chartBaseOffset = result.baseOffset;
            clockBpm = result.bpm;
            rawData = simaiDataValue.split(',');
            draw();
            warnings = result.warnings || [];
            warningPositions = result.errpositions || [];
            if (result.warnings && result.warnings.length > 0) {
                warnEl.style.visibility = 'visible';
                warnEl.querySelector('.warnCount').textContent = result.warnings.length;
                console.warn('Decode warnings:', result.warnings);
            } else {
                warnEl.style.visibility = 'hidden';
            }
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
    slider.value = realTime;

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
    const playing = playButton.dataset.playing === 'true';

    settings.playbackSpeed = speed;
    audioManager.setPlaybackRate(speed);
    if (playing) {
        audioManager.playBGM(realTime);
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

    setElementDisplay(editorContainer, visible);
    setElementDisplay(editorInput, editorVisible);
    setElementDisplay(highlightLayer, editorVisible);
    setElementDisplay(visualEditor, visualVisible);

    if (visualVisible) {
        previewContainer.style.display = 'none';
        document.documentElement.style.setProperty('--playControls-height', '60px');
        resizeVisualEditor();
    } else {
        previewContainer.style.display = 'block';
        document.documentElement.style.setProperty('--playControls-height', '120px');
    }

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
        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:15px; margin-bottom: 4px;';

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

        const label = document.createElement('label');
        label.textContent = labelText;
        label.style.cssText = 'flex:1; color:#ddd; font-size: 15px;';

        element.style.cssText = 'width:100px; flex:0 0 auto; padding:6px 8px; border:1px solid #555; border-radius:4px; background:#222; color:#fff; font-size:14px; text-align: left; transition: border-color 0.2s;';
        row.appendChild(label);
        row.appendChild(element);
        return row;
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

    const inputRefs = {};

    // --- 根據設定檔生成 UI ---
    settingsConfig.forEach((category) => {
        const section = addTab(category.label);

        if (category.html) {
            section.innerHTML += category.html;
        }

        (category.items || []).forEach(item => {
            const targetRef = item.ref || settings;
            const targetKey = item.key || item.id;

            // 自動取得當前數值，優先權：自訂 get() > targetRef[targetKey] > def
            const currentVal = item.get ? item.get() : (targetRef[targetKey] ?? item.def);

            let el;
            if (item.type === 'checkbox') {
                el = createCheckbox(currentVal, `settings-${item.id}`);
                // 監聽變更以便偵錯與即時更新
                el.addEventListener('change', (e) => {
                    try {
                        console.log(`settings.checkbox.${item.id} ->`, e.target.checked);
                        // 立刻寫回 ref（不會儲存到 IndexedDB，除非按下 儲存）
                        targetRef[targetKey] = e.target.checked;
                    } catch (err) { /* ignore */ }
                });
                // 如果上層有攔截 click，盡量阻止上層冒泡影響
                el.addEventListener('click', (e) => e.stopPropagation());
            } else {
                el = createNumberInput(currentVal, item.step, item.min, item.max);
            }

            inputRefs[item.id] = { el, def: item.def, type: item.type, apply: item.apply, ref: targetRef, key: targetKey };
            section.appendChild(createRow(item.label, el));
        });
    });

    // 預設選擇第一個分頁
    switchTab(0);

    const applySettings = () => {
        const values = {};

        // 1. 統一取值 & 自動回寫物件
        Object.keys(inputRefs).forEach(id => {
            const config = inputRefs[id];
            const rawVal = config.type === 'checkbox' ? config.el.checked : parseFloat(config.el.value);
            const finalVal = config.type === 'checkbox'
                ? rawVal
                : (isNaN(rawVal) ? config.def : clamp(rawVal, Number(config.el.min), Number(config.el.max)));

            values[id] = finalVal;
            config.ref[config.key] = finalVal; // 自動指定到 ref[key]
        });

        // 2. 觸發需要額外執行的副作用邏輯
        Object.keys(inputRefs).forEach(id => {
            if (inputRefs[id].apply) {
                inputRefs[id].apply(values[id], values);
            }
        });

        saveSettingsDebounce();
        draw();
        simpleToast({ content: '設定已儲存', type: 'success', timeout: 1500 });
    };

    popupWindow({
        title: '設定',
        customContent: container,
        width: "85%",
        maxWidth: "500px",
        buttons: [
            {
                text: '儲存',
                onClick: (ctx) => {
                    applySettings();
                },
                hideOnClick: true
            },
            {
                text: '套用',
                onClick: (ctx) => {
                    applySettings();
                }
            },
            {
                text: '取消',
                hideOnClick: true
            },
            {
                text: '重置設定',
                onClick: (ctx) => {
                    Object.values(inputRefs).forEach(ref => {
                        if (ref.type === 'checkbox') {
                            ref.el.checked = ref.def;
                        } else {
                            ref.el.value = ref.def;
                        }
                    });
                    simpleToast({ content: '數值已還原（尚未儲存）', type: 'info', timeout: 1500 });
                }
            },

        ]
    });
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
        imgContainer.addEventListener('click', () => {
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
                    editorBackgroundImage.style.filter = `brightness(${1 + 0.75 * settings.moviebrightness})`;
                    idbSet('simai_background_image', file).catch((error) => {
                        console.error("儲存背景圖片到 IndexedDB 失敗:", error);
                    });
                }
            };
            fileInput.click();
        });

        const diffContainer = document.createElement('div');
        diffContainer.style.cssText = "width:60%;box-sizing:border-box;display:flex;flex-direction:column;padding:0 0 0 10px;";

        const createLabeledInput = (value, labelText, assign, isTextarea) => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = "display:flex;flex-direction:column;margin-bottom:6px;";

            const label = document.createElement('label');
            label.textContent = labelText;
            label.style.cssText = "font-size:12px;color:#888;margin-bottom:2px;";

            const input = isTextarea ? document.createElement('textarea') : document.createElement('input');
            if (!isTextarea) {
                input.type = 'text';
            }
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

        const excludedKeys = new Set(["title", "artist", "des", "first"]);
        for (let i = 1; i <= 7; i++) {
            excludedKeys.add(`des_${i}`);
            excludedKeys.add(`lv_${i}`);
            excludedKeys.add(`inote_${i}`);
        }
        const insVal = Object.keys(tempData)
            .filter(key => !excludedKeys.has(key))
            .map(key => `&${key} = ${tempData[key]}`)
            .join("\n");
        const { wrapper: customInstruction } = createLabeledInput(insVal, "自訂指令", "custom", true);
        diffContainer.appendChild(customInstruction);

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
                        if (key === 'custom') return;
                        maidata[key] = tempData[key];
                    });

                    if (typeof tempData.custom === 'string') {
                        tempData.custom.split(/\r?\n/).forEach(line => {
                            const trimmed = line.trim();
                            if (!trimmed) return;
                            const normalized = trimmed.startsWith('&') ? trimmed.slice(1) : trimmed;
                            const [key, ...rest] = normalized.split('=');
                            if (!key) return;
                            const value = rest.join('=');
                            maidata[key] = value;
                        });
                    }

                    if (tempData.difficulty) {
                        nowDifficulty = tempData.difficulty;
                        changeDifficulty.value = nowDifficulty;
                    }
                    saveMaidata();
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
        console.log("maidata exists, showing confirm");
        const confirmReset = confirm("載入新的資料夾將會覆蓋目前的編輯內容，是否繼續？");
        console.log("confirm result:", confirmReset);
        if (!confirmReset) {
            console.log("user cancelled, returning");
            return;
        }
    }
    input.value = ''; // 重置 input 值，確保即使選相同檔案也會觸發 change
    console.log("calling input.click()");
    input.click();
});

// 防止 input.click() 觸發的 click 事件冒泡回到 folderInput
folderInput.children[0].addEventListener('click', (e) => {
    console.log("input click event - stopping propagation");
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
    for (var i = 0; i < files.length; i++) {
        let file = files.item(i);
        if (file.name.startsWith('track.')) {
            // 音樂檔
            const url = URL.createObjectURL(file);
            await audioManager.setBackgroundMusic(url, file);
            setEndtime(endTime);
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
                maidataProcess(e.target.result);
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
            editorBackgroundImage.src = URL.createObjectURL(backgroundImage);
            editorBackgroundImage.style.display = 'block';
            editorBackgroundImage.style.filter = `brightness(${1 + 0.75 * settings.moviebrightness})`;
            idbSet('simai_background_image', file).catch((error) => {
                console.error("儲存背景圖到 IndexedDB 失敗:", error);
            });
        }
    }
    setEndtime(endTime);
};

readMaidataButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                maidataProcess(e.target.result);
                resize();
            };
            reader.readAsText(file);
        }
    };
    input.click();
});

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
    velocity: 0,
    axis: 'vertical',
    momentumFrame: null,
    friction: 0.95,

    pxToSec(px) {
        const zoom = visualEditorRenderer ? visualEditorRenderer.zoom : 100;
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
    slider.value = clampedTime;
    realTime = clampedTime;
    globalTime = clampedTime - musicDelay;

    audioManager.stopAllLongSounds();
    if (playButton.dataset.playing === 'true') {
        audioManager.playBGM(realTime);
    } else {
        audioManager.stopBGM();
        draw();
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

        if (Math.abs(vel) < 0.01 || !timeControlSliding) {
            visualScroller.momentumFrame = null;
            return;
        }

        const deltaSec = visualScroller.pxToSec(vel * dt * directionMult);
        updateVisualTime(realTime + deltaSec);

        vel *= visualScroller.friction;
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
        if (!visualEditorRenderer || e.button !== 0) return;
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
                const instantVel = (currentY - visualScroller.lastY) / dt;
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
        if (Math.abs(visualScroller.velocity) > 0.1) startMomentum();
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
        editorBackgroundImage.style.display = settings.hideBackgroundWhenPaused ? 'none' : ((editorBackgroundImage.complete && editorBackgroundImage.naturalWidth !== 0) ? 'block' : 'none');
        playButton.dataset.playing = 'false';
        playButton.children[0].innerText = "play_arrow";
        lastTimestamp = null;

        // --- 停止音效與 BGM ---
        audioManager.stopAllLongSounds();
        audioManager.stopBGM();

        notes.forEach(n => n._riserActive = false); // 強制重置標記

        draw(); // 立即更新畫布，反映暫停狀態
    } else {
        editorBackgroundImage.style.display = (editorBackgroundImage.complete && editorBackgroundImage.naturalWidth !== 0) ? 'block' : 'none';
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
    editorBackgroundImage.style.display = settings.hideBackgroundWhenPaused ? 'none' : ((editorBackgroundImage.complete && editorBackgroundImage.naturalWidth !== 0) ? 'block' : 'none');
    playButton.dataset.playing = 'false';
    playButton.children[0].innerText = "play_arrow";
    bgmUpdateTimer = null;
    lastTimestamp = null;
    realTime = 0;
    globalTime = realTime - musicDelay;
    slider.value = realTime;

    // --- 停止音效與 BGM ---
    audioManager.stopAllLongSounds();
    audioManager.stopBGM();

    notes.forEach(n => n._riserActive = false); // 強制重置標記

    draw(); // 立即更新畫布，反映停止狀態
});

hideButton.addEventListener('click', () => {
    const visualVisible = visualEditor.style.display !== 'none';
    const isHidden = hideButton.dataset.hidden === 'true';
    if (!isHidden) {
        hideButton.dataset.hidden = 'true';
        document.documentElement.style.setProperty('--playControls-height', '0px');
    } else {
        hideButton.dataset.hidden = 'false';
        if (visualVisible) {
            previewContainer.style.display = 'none';
            document.documentElement.style.setProperty('--playControls-height', '60px');
        } else {
            previewContainer.style.display = 'block';
            document.documentElement.style.setProperty('--playControls-height', '120px');
        }
    }
    resize();
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
        z: 's'
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
    const bp = settings.playbackSpeed || 1;
    if (lastTimestamp === null) lastTimestamp = timestamp;
    const dt = (timestamp - lastTimestamp) / 1000; // 秒
    lastTimestamp = timestamp;
    if (playButton.dataset.playing === 'true') {
        realTime += dt * bp;
        globalTime = realTime - musicDelay;
        if (bgmUpdateTimer === null || bgmUpdateTimer >= 1) {
            //audioManager.playBGM(realTime);
            const bgmTime = audioManager.haveBGM() ? audioManager.getBGMTime() : null;
            if (bgmTime !== null && Math.abs(bgmTime - realTime) > 0.03) {
                realTime = bgmTime;
                globalTime = realTime - musicDelay;
            }
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

// TODO
/*recordVideoButton.addEventListener('click', async () => {

});*/

window.addEventListener('resize', resize);

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        isContextEdited = false;

        simpleToast({ content: '已儲存！', type: 'success', timeout: 1200 });
        maidata['inote_' + nowDifficulty] = editorInput.value;
        saveMaidata();
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
    const maxSlideCount = settings.maxSlideCount;
    const middleDistance = settings.middleDistance;
    const speedCoeff = settings.speed * 0.8833 + 0.8167;
    const touchSpeedCoeff = settings.touchSpeed * 0.8833 + 0.8167;
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
    let slideOnScreenCount = 0;
    let foundIndexForThisFrame = false;

    // 核心音符迴圈
    for (let i = notesLength - 1; i >= 0; i--) {
        const note = notes[i];
        const noteT = note.time - globalTime;
        const noteType = note.type;
        const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0);

        // 索引追蹤（早期完成以減少迴圈計算）
        if (!foundIndexForThisFrame && realTime >= note.time && noteType !== "slide") {
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
            if (shouldCountCombo) playCombo++;
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
            && -noteT <= skipT + effectDecayTime * (note.isHanabi ? 2 : 1);

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
    });

    if ((!isVisualModeFlag || editorContainer.style.display === 'none') && previewVisibleFlag) {
        previewRender.drawFrame({
            globalTime,
            visualBuckets,
            audioBuffer: audioManager.bgmBuffer,
            offset: musicDelay,
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
                    realTime = savedTimeControl; slider.value = realTime; globalTime = realTime - musicDelay; update();
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
                // TODO
                // 取得頁面上的 video 元素（若存在）並安全地設定來源為已儲存的 Blob
                const videoEl = document.getElementById('bgaVideo');
                if (bgVideo && videoEl) {
                    videoEl.src = URL.createObjectURL(bgVideo);
                }
                if (bg) {
                    // 保留原本的 Blob，並同時將畫面上的 <img> 元素設為該來源
                    backgroundImage = bg;
                    editorBackgroundImage.src = URL.createObjectURL(bg);
                    editorBackgroundImage.style.display = settings.hideBackgroundWhenPaused ? 'none' : 'block';
                    editorBackgroundImage.style.filter = `brightness(${1 + 0.75 * settings.moviebrightness})`;
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
                audioManager.setPlaybackRate(settings.playbackSpeed);
                audioManager.setBGMVolume(settings.musicVolume);
                visualEditorRenderer.setZoom(settings.visualZoom);
                previewRender = new SimaiPreviewRenderer(previewCanvas, settings);
                previewRender.setZoom(settings.visualZoom);

                draw();
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