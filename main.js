import { openDB, idbGet, idbSet } from './indexDB.js';
import { scaleBase, getButton, debounce, audioManager, getHighlight, parseMaidata, popupWindow, loadAllImages, simpleToast, formatSize, getSimaiDataString } from './helper.js';
import { simaiDecode } from './decode.js';
import { SimaiRenderer, SimaiVisualEditor } from './renderer.js';

let images, readyBeat = false, maidata = {}, nowDifficulty = 5, backgroundImage, renderer, visualEditorRenderer, settings = {};

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
                savedTimeControl, savedBgm, savedMaiData, savedDifficulty, bg, hideEditor, savedSettings
            ] = await Promise.all([
                idbGet('simai_timeControl'),
                idbGet('simai_resource_bgm'),
                idbGet('simai_maidata'),
                idbGet('simai_now_difficulty'),
                idbGet('simai_background_image'),
                idbGet('simai_hide_editor'),
                idbGet('simai_settings')
            ]);

            if (savedTimeControl && !isNaN(savedTimeControl)) {
                realTime = savedTimeControl; slider.value = realTime; globalTime = realTime - musicDelay; update();
            }

            if (savedDifficulty) { nowDifficulty = savedDifficulty; changeDifficulty.value = nowDifficulty; }
            if (savedMaiData) {
                maidata = savedMaiData;
                editorInput.value = maidata["inote_" + nowDifficulty];
                applyHighlight(editorInput.value);
                getres(editorInput.value);

                musicDelay = parseFloat(maidata.first) || 0;
                offsetInput.value = musicDelay;
                offsetInputDebounce();
            };
            if (bg) { backgroundImage = bg; }
            if (savedBgm) {
                step(95, "正在還原背景音樂...");
                await audioManager.setBackgroundMusic(savedBgm);
                setEndtime(endTime);
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
            visualEditorRenderer = new SimaiVisualEditor(visualEditor, settings);
            visualEditorRenderer.setImages(images);
            visualEditorRenderer.setContext(visualCtx || visualEditor.getContext('2d'));
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
const downloadButton = getButton("download", "utility");
const createNewButton = getButton("createNew", "utility");
const warnEl = document.querySelector("#utilityContainer .warnbtn");
const editMusicButton = getButton("editMusic", "utility");
const rCwiseButton = getButton("rotateClockwise", "utility");
const rCCwiseButton = getButton("rotateCounterClockwise", "utility");
const r180Button = getButton("rotate180", "utility");
const fVerticalButton = getButton("flipVertical", "utility");
const fHorizontalButton = getButton("flipHorizontal", "utility");

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

const tapBpmButton = getButton("tapBpm", "utility");
const manageResourcesButton = getButton("manageResources", "utility");

let ctx = canvas.getContext('2d');
const scale = 0.98;
export const defaultSettings = {
    speed: 6.5,
    touchSpeed: 7,
    effectDecayTime: 0.4,
    middleDistance: 0.25,
    noteBaseSize: 11,
    play_combo: 0,
    play_score: 0,
    middleDisplay: 1, // 0: 關閉, 1: COMBO, 2: 分數
    moviebrightness: -1,
    // #ffffff -> #404040
    displayMode: 'simai', // simai 或 visual
    showSensor: true,
    showSensorTextWhenPaused: true,
    maxSlideCount: 500, // on screen
};
let globalTime = 0, realTime = 0;
let lastTimestamp = null;
let secondCtx = null;
let externalWindow = null;
let timeControlSliding = false; // 新增滑動狀態標記
let keepRenderingWhilePause = false; // 是否在暫停時繼續渲染（保持畫面更新）
let nowIndex = 0;
let visualCtx = null;
let warnings = [];

let lastCanvasSize = { w: 0, h: 0 };
let lastVisualEditorSize = { w: 0, h: 0 };

let clockBpm = 60;

const isVisualMode = () => settings.displayMode === 'visual';

const saveSettingsDebounce = debounce(() => {
    idbSet('simai_settings', JSON.stringify(settings)).catch((error) => {
        console.error('儲存設定到 IndexedDB 失敗:', error);
    });
}, 300);

const setEndtime = (e) => {
    endTime = Math.max(e + 1, audioManager.getBGMDuration() + 1);
    slider.max = endTime - musicDelay;
};

const editorContainer = document.getElementById('editorContainer');
const editorInput = document.getElementById('editor-input');
const highlightLayer = document.getElementById('highlight-layer');
let notes = [], endTime = 1, musicDelay = 0, rawData = [];

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
    audioManager.removeBackgroundMusic().catch(() => { });
    changeDifficulty.value = nowDifficulty;
    inputDebounce();
    saveMaidata();

    idbSet('simai_editor_content', '').catch(() => { });
    idbSet('simai_background_image', null).catch(() => { });
    idbSet('simai_now_difficulty', nowDifficulty).catch(() => { });
    idbSet('simai_resource_bgm', null).catch(() => { });
    idbSet('simai_timeControl', 0).catch(() => { });
}

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
            setEndtime(result.endTime);
            // chartBaseOffset = result.baseOffset;
            clockBpm = result.bpm;
            rawData = simaiDataValue.split(',');
            draw();
            warnings = result.warnings || [];
            if (result.warnings && result.warnings.length > 0) {
                warnEl.style.visibility = 'visible';
                warnEl.querySelector('.warnCount').textContent = result.warnings.length;
                /*const maxShow = 3;
                const preview = result.warnings.slice(0, maxShow).join('； ');
                const suffix = result.warnings.length > maxShow ? ` +${result.warnings.length - maxShow} more` : '';
                simpleToast({
                    content: `解析完成，含 ${result.warnings.length} 則警告：${preview}${suffix}`,
                    type: 'warning',
                    timeout: 3600
                });*/
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
    slider.max = endTime - musicDelay;
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
    console.log("Saving maidata to IndexedDB...", maidata);
    idbSet('simai_maidata', maidata).catch((error) => {
        console.error("儲存maidata到IndexedDB失敗:", error);
    });
}, 500);

const inputDebounce = debounce(() => {
    const value = editorInput.value;
    // 解析 Note 邏輯
    getres(value);
    maidata["inote_" + nowDifficulty] = value;

    saveMaidata();
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
        resizeVisualEditor();
        /*visualEditorRenderer?.render(isVisualMode, ensureVisualEditorContext, {

        });*/
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
}

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
        setDataEmpty(); // 先清空現有資料，避免讀取失敗時殘留舊資料干擾
        for (var i = 0; i < files.length; i++) {
            let file = files.item(i);
            if (file.name.startsWith('track.')) {
                // 音樂檔
                const url = URL.createObjectURL(file);
                audioManager.setBackgroundMusic(url, file);
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
                //const url = URL.createObjectURL(file);
                //document.body.style.backgroundImage = `url(${url})`;
                idbSet('simai_background_image', file).catch((error) => {
                    console.error("儲存背景圖到 IndexedDB 失敗:", error);
                });
            }
        }
        setEndtime(endTime);
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

// visualEditor 滾輪縮放功能
visualEditor.addEventListener('wheel', (e) => {
    if (!visualEditorRenderer) return;

    e.preventDefault();

    // 計算縮放變化（向上滾動放大，向下滾動縮小）
    const zoomSpeed = 10; // 每次滾動改變 10 單位的縮放
    const deltaZoom = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;

    // 應用新的縮放值，設定最小和最大限制
    const minZoom = 50;
    const maxZoom = 500;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, visualEditorRenderer.zoom + deltaZoom));

    visualEditorRenderer.setZoom(newZoom);
    draw();
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
            audioManager.setBackgroundMusic(url, file);
            setEndtime(endTime);
            idbSet('simai_resource_bgm', file);
        }
    };
    input.click();
});

downloadButton.addEventListener('click', () => {
    popupWindow({
        title: "下載譜面",
        content: "",
        buttons: [
            {
                text: "下載 Maidata",
                onClick: (ctx) => {
                    // Implementation for downloading Maidata
                    const blob = new Blob([getSimaiDataString(maidata)], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'maidata.txt';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            },
            {
                text: "下載壓縮檔",
                onClick: async (ctx) => {
                    // Implementation for downloading ZIP
                    let zip = JSZip();
                    zip.file("maidata.txt", getSimaiDataString(maidata));

                    const getBackgroundFilename = (bg) => {
                        if (!bg) return 'bg.png';
                        const mime = bg.type || '';
                        const fallback = 'png';
                        if (!mime.includes('/')) return `bg.${fallback}`;
                        const ext = mime.split('/')[1].split(';')[0].trim() || fallback;
                        return `bg.${ext}`;
                    };

                    if (backgroundImage) {
                        const bgFilename = getBackgroundFilename(backgroundImage);
                        console.log('Background image type:', backgroundImage.type, '->', bgFilename);
                        zip.file(bgFilename, backgroundImage);
                    }

                    if (audioManager.haveBGM()) {
                        const bgmFile = audioManager.bgmFile;
                        const bgmFilename = (bgmFile && bgmFile.name) ? bgmFile.name : 'track.mp3';
                        console.log('BGM file name:', bgmFilename, 'Type:', bgmFile?.type);

                        // 確保傳遞給 JSZip 的是 Blob 或 File，不是 URL
                        if (bgmFile instanceof Blob) {
                            zip.file(bgmFilename, bgmFile);
                        } else if (typeof bgmFile === 'string') {
                            // 如果是 URL/ObjectURL，需要先轉換為 Blob
                            try {
                                const response = await fetch(bgmFile);
                                const blob = await response.blob();
                                zip.file(bgmFilename, blob);
                            } catch (e) {
                                console.error('無法取得 BGM Blob:', e);
                            }
                        }
                    }

                    try {
                        const content = await zip.generateAsync({ type: "blob" });
                        const url = URL.createObjectURL(content);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'simai_package.zip';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    } catch (e) {
                        console.error('ZIP 生成失敗', e);
                    }
                }
            }
        ]
    });
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

        notes.forEach(n => n._riserActive = false); // 強制重置標記

        draw(); // 立即更新畫布，反映暫停狀態
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

    notes.forEach(n => n._riserActive = false); // 強制重置標記

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

const contantRotate = (selected, direction) => {
    if (typeof selected !== 'string' || selected.length === 0) return selected;

    const bracketPairs = {
        '[': ']',
        '{': '}',
        '(': ')'
    };

    const rotateDigit = (digit) => {
        const base = parseInt(digit, 10);
        if (Number.isNaN(base) || base < 1 || base > 8) return digit;
        return String(((base - 1 + direction) % 8 + 8) % 8 + 1);
    };

    const extractEdgeTags = (token) => {
        let prefix = '';
        let current = token;
        while (current.startsWith('<')) {
            const closeIndex = current.indexOf('>');
            if (closeIndex <= 0) break;
            const inner = current.slice(1, closeIndex);
            if (inner.length === 1 && /^[0-9]$/.test(inner)) break;
            prefix += current.slice(0, closeIndex + 1);
            current = current.slice(closeIndex + 1);
        }

        let suffix = '';
        while (current.endsWith('>')) {
            const openIndex = current.lastIndexOf('<');
            if (openIndex < 0) break;
            const inner = current.slice(openIndex + 1, current.length - 1);
            if (inner.length === 1 && /^[0-9]$/.test(inner)) break;
            suffix = current.slice(openIndex) + suffix;
            current = current.slice(0, openIndex);
        }

        return { prefix, content: current, suffix };
    };

    const processContent = (content) => {
        const stack = [];
        let result = '';
        let lastOldDigit = null;
        let lastNewDigit = null;
        let firstOldDigit = null;
        let firstNewDigit = null;

        for (let i = 0; i < content.length; i++) {
            const ch = content[i];
            if (bracketPairs[ch]) {
                stack.push(bracketPairs[ch]);
                result += ch;
                continue;
            }
            if (stack.length > 0) {
                if (ch === stack[stack.length - 1]) {
                    stack.pop();
                }
                result += ch;
                continue;
            }
            if (ch >= '1' && ch <= '8') {
                const oldD = parseInt(ch, 10);
                const rotated = rotateDigit(ch);
                const newD = parseInt(rotated, 10);

                lastOldDigit = oldD;
                lastNewDigit = newD;
                if (firstOldDigit === null) {
                    firstOldDigit = oldD;
                    firstNewDigit = newD;
                }
                result += rotated;
            } else if (ch === '*') {
                lastOldDigit = firstOldDigit;
                lastNewDigit = firstNewDigit;
                result += ch;
            } else if (ch === '<' || ch === '>') {
                if (lastOldDigit !== null && lastNewDigit !== null) {
                    const oldFlip = (lastOldDigit >= 3 && lastOldDigit <= 6);
                    const newFlip = (lastNewDigit >= 3 && lastNewDigit <= 6);
                    if (oldFlip !== newFlip) {
                        result += (ch === '<' ? '>' : '<');
                    } else {
                        result += ch;
                    }
                } else {
                    result += ch;
                }
            } else {
                result += ch;
            }
        }
        return result;
    };

    return selected.split(/(\s*,\s*)/).map((part, index) => {
        if (index % 2 === 1) return part;
        const { prefix, content, suffix } = extractEdgeTags(part);
        return prefix + processContent(content) + suffix;
    }).join('');
};

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

function update(timestamp) {
    if (lastTimestamp === null) lastTimestamp = timestamp;
    const dt = (timestamp - lastTimestamp) / 1000; // 秒
    lastTimestamp = timestamp;
    if (playButton.dataset.playing === 'true') {
        realTime += dt;
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

window.addEventListener('resize', resize);

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        // 如果你有儲存邏輯可放這裡
        simpleToast({ content: '已儲存！', type: 'success', timeout: 1200 });
        maidata['inote_' + nowDifficulty] = editorInput.value;
        saveMaidata();
    }
});

let playClock = [false, false, false, false];
function draw(dt = 0) {
    // 1. 清除畫布
    //ctx.clearRect(-canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2);
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

    const visualBuckets = {
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
    let slideOnScreenCount = 0;
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
                if (!note._riserActive) {
                    const soundOffset = -noteT;
                    audioManager.startLongSound(noteId, 'touchHold_riser', soundOffset);
                    note._riserActive = true;
                }
            } else if (note._riserActive) {
                audioManager.stopLongSound(noteId);
                note._riserActive = false;
            }

            // B. 處理開始打擊音效 (Tap / Slide Start / Hold Start)
            if (noteT <= 0 && !note._startEffectPlayed) {
                // 排除連鎖滑軌的非首個箭頭音效
                if (!(note.type === "slide" && !note.firstSlide)) {
                    audioManager.queueSound(note, note.time + (note.slideDelay ?? 0));
                }
                note._startEffectPlayed = true;
            }

            // C. 處理結束音效 (Hold End / Slide End / Hanabi)
            if (-noteT > skipT && !note._endEffectPlayed) {
                if ((note.type === "slide" && note.lastSlide && note.isBreak) || (note.type !== "slide" && note.isBreak) || note.isHanabi || (note.holdDuration !== undefined && note.type !== "tap")) {
                    audioManager.queueSound(note, note.time + skipT);
                }
                note._endEffectPlayed = true;
            }
        }

        // --- 倒帶或 Slider 拖動時的狀態重置 ---
        if (noteT > 0) {
            note._startEffectPlayed = false;
            note._endEffectPlayed = false;
            if (note._riserActive) {
                audioManager.stopLongSound(`riser_${note.pos}_${note.time}`);
                note._riserActive = false;
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
            if (note.type === 'slide') {
                if (slideOnScreenCount >= settings.maxSlideCount) continue;
                buckets.slide.push(note);
                slideOnScreenCount++;
            }
            else if (note.type === 'hold') buckets.tapnhold.push(note);
            else if (note.type === 'tap') buckets.tapnhold.push(note);
            else if (note.type === 'touch') buckets.touch.push(note);
        }
        {
            if (note.type === 'slide') visualBuckets.slide.push(note);
            else if (note.type === 'hold') visualBuckets.tapnhold.push(note);
            else if (note.type === 'tap') visualBuckets.tapnhold.push(note);
            else if (note.type === 'touch') visualBuckets.touch.push(note);
        }
    }

    renderer.drawFrame({
        globalTime,
        notes,
        buckets,
        dt,
        showSensor: settings.showSensor,
        showSensorText: (settings.showSensorTextWhenPaused && !playing),
        backgroundImage,
    });

    // 5. 統一更新 Web Audio API 播放佇列
    audioManager.update(globalTime);

    // visual 模式使用獨立 canvas 渲染時間軸預覽
    visualEditorRenderer?.render(isVisualMode, ensureVisualEditorContext,
        {
            globalTime,
            notes,
            visualBuckets,
            audioBuffer: audioManager.buffers,
            dt
        });
}