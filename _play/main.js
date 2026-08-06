import { openDB, idbGet, idbSet, idbSetProject, idbGetProject, projectList, projectCreate, projectDelete, projectRename, projectTouch, projectUpdateName, migrateFromLegacy } from '../Scripts/indexDB.js';
import { SimaiRenderer } from './renderer.js';
import { simaiDecode } from '../Scripts/decode.js';
import { parseMaidata, loadAllImages, scaleBase, getButton, audioManager, debounce } from '../Scripts/helper.js';
import { SimulatedPlayController } from './simplay.js';

const simulatedPlayController = new SimulatedPlayController();

const defaultSettings = {
    // Game
    speed: 6.5,
    touchSpeed: 7,
    slideSpeed: 0,
    middleDisplay: 1, // 0: 關閉, 1: COMBO, 2: 分數
    moviebrightness: -4,
    showSensor: true,
    rotateStars: true,
    pinkStars: false,
    autoPlay: true, // true: 自動模擬播放, false: 手動打擊
    hideOutline: false, // 隱藏判定圈
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
    showCoverWhenPaused: false, // 暫停時顯示封面圖
    disableVideo: false, // 關閉影片背景（如果有的話）
    renderSurroundingAuxiliaryText: true,
    splitRatio: 0.5, // 左右面板分割比例
    slideIllegalRed: false,
    showUI: false,
    // Sound & Playback
    notPlayHoldEnd: false,
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
    globalTimeline: true, // 全局時間軸
    restoreDefaults: function () {
        settings = { ...defaultSettings };
    }
};

const _pc = document.getElementById("playControls");
const _pcc = document.getElementById("playControlContainer");
const _ccon = _pcc.querySelector(".controlsContainer");
const _ccb = _ccon.querySelectorAll(".controlButton");

function getControlButton(action) {
    const btn = Array.from(_ccb).find(el => el.dataset.buttonaction === action);
    if (!btn) console.warn(`no button ${action}`);
    return btn;
}

let datas = simaiDecode();

const canvas = document.querySelector("#main");
const ctx = canvas.getContext("2d");

let settings = {};
let images;
let renderer;

images = await loadAllImages();
const savedSettings = await idbGet('simai_settings');
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
} else {
    settings = { ...defaultSettings }
    await idbSet('simai_settings', JSON.stringify(settings));
};
renderer = new SimaiRenderer(canvas, settings);
renderer.setImages(images);

let globalTime = 0;
let realTime = 0;
let musicDelay = 0;
let buckets = {
    slide: [],
    tapnhold: [],
    touch: [],
};
let dt = 0;
let playCombo = 0;
let playScore = 0;
let noteQuantity = {
    slide: 0,
    tap: 0,
    hold: 0,
    touch: 0,
    break: 0,
};
let playScoreRes = 0;
let nowIndex = 0;
let playing = false;
let pausedTime = 0;

let rawdata;
let startTime = 0;
let selectedDifficulty = 5;
let hidden = false;

let backgroundImage, backgroundVideo;

let playStartTimestamp = null;
let playStartRealTime = 0;
let lastVideoSeekTime = 0;
const VIDEO_SEEK_THRESHOLD = 0.3;
const VIDEO_MIN_SEEK_INTERVAL = 0.8;

let timeControlSliding = false;

function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvasContainer.clientWidth * dpr;
    const h = canvasContainer.clientHeight * dpr;

    const scaleValue = renderer?.scale ?? scale;
    const p = Math.min(w, h) / scaleBase * scaleValue;

    canvas.width = w;
    canvas.height = h;
    ctx.setTransform(p, 0, 0, p, w / 2, h / 2);
    draw();
}

resize();

window.addEventListener('resize', resize);

const playPauseBtn = getControlButton("play/pause");
const restartBtn = getControlButton("reset");
const autoPlayBtn = getControlButton("autoPlay");
const hideBtn = getControlButton("hide");
const hideShowBtn = document.getElementById("showPlayControlsBtn");
const folderBtn = getControlButton("openFolder");

const gameBackgroundImage = document.getElementById("backgroundImage");
const gameBackgroundVideo = document.getElementById("backgroundVideo");
const canvasOutline = document.getElementById("canvasOutline");

const timeControl = document.getElementById("timeControl");

function updateOutlineUI() {
    if (canvasOutline) {
        canvasOutline.style.display = settings.hideOutline ? 'none' : '';
    }
}
updateOutlineUI();

function updateAutoPlayUI() {
    if (!autoPlayBtn) return;
    const isAuto = settings.autoPlay !== false;
    autoPlayBtn.dataset.autoplay = isAuto ? "true" : "false";
    if (autoPlayBtn.children[0]) {
        autoPlayBtn.children[0].innerText = isAuto ? "smart_toy" : "touch_app";
    }
}

if (autoPlayBtn) {
    autoPlayBtn.addEventListener("click", () => {
        settings.autoPlay = !(settings.autoPlay !== false);
        updateAutoPlayUI();
    });
}
updateAutoPlayUI();

// 手動遊玩輸入與鍵盤/觸控對應 (Manual Play Controls)
const KEY_TO_SENSOR = {
    '1': 'A1', '2': 'A2', '3': 'A3', '4': 'A4', '5': 'A5', '6': 'A6', '7': 'A7', '8': 'A8',
    'a': 'A1', 's': 'A2', 'd': 'A3', 'f': 'A4', 'j': 'A5', 'k': 'A6', 'l': 'A7', ';': 'A8',
    'A': 'A1', 'S': 'A2', 'D': 'A3', 'F': 'A4', 'J': 'A5', 'K': 'A6', 'L': 'A7',
};
const manualInputSensors = new Set();

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const sensor = KEY_TO_SENSOR[e.key];
    if (sensor) {
        manualInputSensors.add(sensor);
        triggerManualHit(sensor);
    }
});

window.addEventListener('keyup', (e) => {
    const sensor = KEY_TO_SENSOR[e.key];
    if (sensor) {
        manualInputSensors.delete(sensor);
    }
});

function triggerManualHit(sensorId) {
    if (!datas || !datas.notes || !playing || settings.autoPlay !== false) return;
    const hitWindow = 0.50; // 120ms 手動打擊判定視窗

    for (let i = 0; i < datas.notes.length; i++) {
        const note = datas.notes[i];
        if (note.triggered) continue;
        const noteT = note.time - globalTime;

        if (Math.abs(noteT) <= hitWindow) {
            let matches = false;
            if (note.type === 'touch') {
                const noteSensor = note.touchPos + note.pos;
                const normSensor = (noteSensor === 'C1' || noteSensor === 'C2') ? 'C' : noteSensor;
                matches = (normSensor === sensorId);
            } else {
                matches = ('A' + note.pos) === sensorId;
            }

            if (matches) {
                note.triggered = true;
                note.triggeredTime = globalTime;
                audioManager.queueSound(note, note.time);
                break;
            }
        }
    }
}

if (canvas) {
    const handlePointerHit = (e) => {
        if (!renderer || settings.autoPlay !== false || !playing) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const dpr = window.devicePixelRatio || 1;
        const p = Math.min(canvas.width, canvas.height) / scaleBase * renderer.scale;
        const rx = (x * dpr - canvas.width * 0.5) / p;
        const ry = (y * dpr - canvas.height * 0.5) / p;

        const sensorId = renderer.getSensorIdAtPoint(rx, ry);
        if (sensorId) {
            manualInputSensors.add(sensorId);
            triggerManualHit(sensorId);
            setTimeout(() => manualInputSensors.delete(sensorId), 100);
        }
    };

    canvas.addEventListener('pointerdown', handlePointerHit);
    canvas.addEventListener('pointermove', (e) => {
        if (e.buttons > 0) handlePointerHit(e);
    });
}

if (restartBtn) {
    restartBtn.addEventListener("click", restart);
}

if (hideBtn) {
    hideBtn.addEventListener('click', toggleHide);
}

if (hideShowBtn) {
    hideShowBtn.addEventListener('click', toggleHide);
}

folderBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    const input = document.createElement('input');
    input.type = "file";
    input.webkitdirectory = true;
    input.directory = true;
    input.multiple = true;

    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async (e) => {
        const files = e.target.files;
        document.body.removeChild(input);

        if (!files || files.length === 0) {
            console.warn("未選擇任何檔案");
            return;
        }

        try {
            setDataEmpty();
            await handleFolderInput(files);
            update();
        } catch (err) {
            console.error("處理資料夾檔案時發生錯誤：", err);
        }
    };

    input.click();
});

update();

function maidataProcess(e) {
    musicDelay = 0;
    rawdata = parseMaidata(e);
    if (rawdata["first"]) {
        musicDelay = (() => {
            const val = parseFloat(rawdata["first"]);
            if (isNaN(val)) {
                console.warn("偏移值無效，請輸入數字");
                return 0;
            }
            return val;
        })();
    }
    getResult();
}

function setDataEmpty() {

}

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
            /*if (isVideo) {
                // 可能為命名錯誤
                // 背景影片
                backgroundVideo = file;
                editorBackgroundVideo.src = URL.createObjectURL(backgroundVideo);
                editorBackgroundVideo.style.display = 'none';
                editorBackgroundVideo.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
                projSet('background_video', file).catch((error) => {
                    console.error('儲存背景圖到 IndexedDB 失敗:', error);
                });
                continue;
            }*/
            if (isImage) {
                // 背景圖
                backgroundImage = file;
                gameBackgroundImage.src = URL.createObjectURL(backgroundImage);
                gameBackgroundImage.style.display = 'block';
                continue;
            }
        }
        if (lowerName.startsWith('pv.')) {
            if (isVideo) {
                // 背景影片
                backgroundVideo = file;
                gameBackgroundVideo.src = URL.createObjectURL(backgroundVideo);
                gameBackgroundVideo.style.display = 'none';
                continue;
            }
        }
    }
    tryUpdateBackgroundBrightness();
}

function tryUpdateBackgroundBrightness() {
    gameBackgroundImage.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
    gameBackgroundVideo.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
    console.log(gameBackgroundVideo);
}

function calculatePlayScoreRes(datas) {
    if (!datas) return { tap: 0, hold: 0, slide: 0, touch: 0, break: 0, score: 0, breakScore: 0, invScore: 0 };
    const counts = datas.notesCounts || { tap: 0, hold: 0, slide: 0, touch: 0, break: 0 };
    const score = datas.score || 0;
    const breakCount = counts.break || 0;
    const invScore = score > 0 ? (1 / score) : 0;
    const breakScore = breakCount > 0 ? (1 / breakCount) : 0;
    return {
        ...counts,
        score,
        invScore,
        breakScore
    };
}

function getResult() {
    datas = simaiDecode(rawdata["inote_" + selectedDifficulty], 0);
    if (datas) {
        playScoreRes = calculatePlayScoreRes(datas);
    }
}

function getTotalTime() {
    return Math.max(datas?.endTime || 0, 0) + 1;
}

function updateTimeControlUI() {
    if (!timeControl) return;
    const totalTime = getTotalTime();
    timeControl.max = totalTime;
    if (!timeControlSliding) {
        timeControl.value = realTime;
    }
    const ratio = Math.max(0, Math.min(1, totalTime > 0 ? (realTime / totalTime) : 0));
    const thumbWidth = 16;
    const stopPos = `calc(${thumbWidth * 0.5}px + ${ratio} * (100% - ${thumbWidth}px))`;
    timeControl.style.background = `linear-gradient(90deg, var(--timeline-color, #962d2d) 0%, var(--timeline-color, #962d2d) ${stopPos}, var(--timeline-color-background, #222) ${stopPos}, var(--timeline-color-background, #222) 100%)`;
}

const videoSeekDebounce = debounce((time) => {
    if (gameBackgroundVideo && gameBackgroundVideo.readyState >= 1) {
        if (Math.abs(gameBackgroundVideo.currentTime - time) > 0.05) {
            try { gameBackgroundVideo.currentTime = time; } catch (_) { }
        }
    }
}, 50);

if (timeControl) {
    const handleSeek = () => {
        const newTime = parseFloat(timeControl.value);
        pausedTime = newTime;
        realTime = newTime;
        globalTime = realTime - musicDelay;
        playStartTimestamp = null;

        // 拖拽/跳轉時重置 Note 音效播放與遊玩 Hit 狀態記錄
        if (datas && datas.notes) {
            for (let i = 0; i < datas.notes.length; i++) {
                const note = datas.notes[i];
                const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0) + (note.isMine ? (note.cullSkipExtend ?? 0) : 0);
                const startTargetT = note.time + (note.slideDelay ?? 0);
                const endTargetT = note.time + skipT;

                if (startTargetT - globalTime > 0.1) {
                    note._startEffectPlayed = false;
                    note.triggered = false;
                }
                if (endTargetT - globalTime > 0.1) {
                    note._endEffectPlayed = false;
                    note.holdFinish = false;
                    note.slideFinish = false;
                }
                if (note.time - globalTime > 0) {
                    note.isHolding = false;
                    if (note._riserActive) {
                        audioManager.stopLongSound(`riser_${note.pos}_${note.time}`);
                        note._riserActive = false;
                    }
                }
            }
        }

        videoSeekDebounce(realTime);

        if (playing) {
            const speed = settings.playbackSpeed || 1;
            startTime = performance.now() - (pausedTime * 1000 / speed);
            audioManager.stopAllLongSounds();
            audioManager.playBGM(realTime);
            audioManager.setPlaybackRate(speed);
        } else {
            audioManager.stopAllLongSounds();
            audioManager.clearSoundQueue();
            audioManager.stopBGM();
        }
        updateTimeControlUI();
        draw();
    };

    timeControl.addEventListener("input", () => {
        timeControlSliding = true;
        handleSeek();
    });

    timeControl.addEventListener("change", () => {
        timeControlSliding = false;
        handleSeek();
    });

    timeControl.addEventListener("pointerdown", () => {
        timeControlSliding = true;
    });

    timeControl.addEventListener("pointerup", () => {
        timeControlSliding = false;
    });
}

function play() {
    if (playing) return;
    playing = true;
    playStartTimestamp = null;

    const speed = settings.playbackSpeed || 1;
    startTime = performance.now() - (pausedTime * 1000 / speed);

    if (playPauseBtn) {
        playPauseBtn.classList.add("playing");
        if (playPauseBtn.children[0]) playPauseBtn.children[0].innerText = "pause";
    }

    gameBackgroundImage.style.display = (gameBackgroundImage.complete && gameBackgroundImage.naturalWidth !== 0) ? 'block' : 'none';
    gameBackgroundVideo.style.display = ((gameBackgroundVideo.readyState === 4) ? 'block' : 'none');
    if (gameBackgroundVideo.readyState >= 1) {
        gameBackgroundVideo.currentTime = realTime;
    }
    if (gameBackgroundVideo.paused && gameBackgroundVideo.readyState >= 1) {
        gameBackgroundVideo.play();
    }

    audioManager.playBGM(realTime);
    audioManager.setPlaybackRate(speed);
}

function restart() {
    pause();

    playStartTimestamp = null;
    pausedTime = 0;
    realTime = 0;
    globalTime = realTime - musicDelay;

    if (datas && datas.notes) {
        datas.notes.forEach(n => {
            n._startEffectPlayed = false;
            n._endEffectPlayed = false;
            n._riserActive = false;
            n.triggered = false;
            n.isHolding = false;
            n.holdFinish = false;
            n.slideProgress = 0;
            n.slideFinish = false;
            n._checkedCps = null;
            n._holdPressed = false;
        });
    }

    if (gameBackgroundVideo && gameBackgroundVideo.readyState >= 1) {
        gameBackgroundVideo.currentTime = 0;
    }

    updateTimeControlUI();
    draw();
}

function updatePauseBackgroundDisplay() {
    const hideBg = !!settings.hideBackgroundWhenPaused;
    const showCover = !!settings.showCoverWhenPaused;

    const hasVideo = !!(gameBackgroundVideo && gameBackgroundVideo.src && gameBackgroundVideo.readyState >= 1);
    const hasImage = !!(gameBackgroundImage && gameBackgroundImage.complete && gameBackgroundImage.naturalWidth !== 0);

    if (hideBg) {
        // [v] 暫停時隱藏背景 -> 以隱藏為優先
        gameBackgroundImage.style.display = 'none';
        gameBackgroundVideo.style.display = 'none';
    } else if (showCover) {
        // [ ] 隱藏 + [v] 顯示封面圖 -> 優先顯示封面圖
        gameBackgroundImage.style.display = hasImage ? 'block' : 'none';
        gameBackgroundVideo.style.display = 'none';
    } else {
        // [ ] 隱藏 + [ ] 顯示封面圖 -> 顯示影片，無影片直接全部隱藏
        gameBackgroundImage.style.display = 'none';
        gameBackgroundVideo.style.display = hasVideo ? 'block' : 'none';
    }
}

function pause() {
    if (!playing) return;
    playing = false;
    playStartTimestamp = null;

    pausedTime = realTime;

    if (playPauseBtn) {
        playPauseBtn.classList.remove("playing");
        if (playPauseBtn.children[0]) playPauseBtn.children[0].innerText = "play_arrow";
    }

    updatePauseBackgroundDisplay();
    gameBackgroundVideo.pause();

    audioManager.stopAllLongSounds();
    audioManager.clearSoundQueue();
    audioManager.stopBGM();

    if (datas && datas.notes) {
        datas.notes.forEach(n => {
            n._riserActive = false;
            n.isHolding = false;
        });
    }

    draw();
}

function togglePlay() {
    if (playing) {
        pause();
    } else {
        play();
    }
    tryUpdateBackgroundBrightness();
}

const _cssroot = document.querySelector(':root');

function toggleHide() {
    if (hidden) {
        _pc.classList.remove("hide");
        hideBtn.classList.remove("hide");
        hidden = false;
        _cssroot.style.setProperty('--playControls-height', 'var(--playControls-height-max)');
    } else {
        _pc.classList.add("hide");
        hideBtn.classList.add("hide");
        hidden = true;
        _cssroot.style.setProperty('--playControls-height', '0px');
    }
    resize();
}

// 綁定點擊事件
if (playPauseBtn) {
    playPauseBtn.addEventListener("click", togglePlay);
}

// --- update 邏輯 ---
function update() {
    requestAnimationFrame(update);

    const now = performance.now();

    if (playing) {
        const speed = settings.playbackSpeed || 1;
        let timeUpdatedByBgm = false;

        // 1. 優先使用音訊 AudioContext 硬體時脈同步，避免主線程計時器產生時間對不上
        if (audioManager && typeof audioManager.getBGMTime === 'function') {
            const bgmTime = audioManager.getBGMTime();
            if (bgmTime !== null && bgmTime !== undefined) {
                realTime = bgmTime;
                globalTime = realTime - musicDelay;
                timeUpdatedByBgm = true;
                playStartTimestamp = now;
                playStartRealTime = realTime;
            }
        }

        // 2. 音訊無時脈輸出時使用 Timer Fallback
        if (!timeUpdatedByBgm) {
            if (playStartTimestamp === null) {
                playStartTimestamp = now;
                playStartRealTime = realTime;
            }
            const elapsed = (now - playStartTimestamp) * 0.001;
            realTime = playStartRealTime + elapsed * speed;
            globalTime = realTime - musicDelay;
        }

        // 3. 背景 PV 影片同步（設置 0.3s 閾值避防無效流轉卡頓）
        if (gameBackgroundVideo && gameBackgroundVideo.src && gameBackgroundVideo.readyState >= 2) {
            const nowSec = now * 0.001;
            const diff = Math.abs(gameBackgroundVideo.currentTime - realTime);
            if (diff > VIDEO_SEEK_THRESHOLD && (nowSec - lastVideoSeekTime) >= VIDEO_MIN_SEEK_INTERVAL) {
                try {
                    gameBackgroundVideo.currentTime = realTime;
                    lastVideoSeekTime = nowSec;
                } catch (e) {
                    console.warn('背景影片 seek 失敗', e);
                }
            }
        }
    } else {
        realTime = pausedTime;
        globalTime = realTime - musicDelay;
        playStartTimestamp = null;
    }

    updateTimeControlUI();
    draw();
}

function updateManualPlayState({ globalTime, notes, renderer, playing, timeControlSliding }) {
    if (!playing || timeControlSliding || settings.autoPlay !== false) return;

    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const noteT = note.time - globalTime;
        const noteType = note.type;

        // 1. Hold & TouchHold 手動按壓與結算判定
        if (note.holdDuration > 0) {
            const rawSensorId = noteType === 'touch' ? (note.touchPos + note.pos) : ('A' + note.pos);
            const sensorId = (rawSensorId === 'C1' || rawSensorId === 'C2') ? 'C' : rawSensorId;

            if (noteT <= 0 && -noteT <= note.holdDuration) {
                if (manualInputSensors.has(sensorId)) {
                    note.isHolding = true;
                    note._holdPressed = true;
                } else {
                    note.isHolding = false;
                }
            } else if (-noteT > note.holdDuration) {
                note.isHolding = false;
                if (note._holdPressed || note.triggered) {
                    note.holdFinish = true;
                }
            }
        }

        // 2. Slide 手動劃軌 Checkpoint 判定
        if (noteType === 'slide') {
            const slideDelay = note.slideDelay ?? 0;
            const slideDuration = note.slideDuration ?? 0;

            if (-noteT > slideDelay && slideDuration > 0 && !note.isMine) {
                const checkpoints = simulatedPlayController.getOrCreateSlideCheckpoints(note, renderer);
                const totalCp = checkpoints.length;

                if (totalCp > 0) {
                    if (!note._checkedCps) note._checkedCps = new Set();

                    for (let c = 0; c < totalCp; c++) {
                        const cp = checkpoints[c];
                        if (cp && cp.sensorId && manualInputSensors.has(cp.sensorId)) {
                            note._checkedCps.add(c);
                        }
                    }

                    const checkedCount = note._checkedCps.size;
                    note.slideProgress = Math.min(1, checkedCount / totalCp);

                    if (checkedCount >= Math.ceil(totalCp * 0.6) || note.slideProgress >= 0.9) {
                        note.slideFinish = true;
                    }
                } else {
                    note.slideProgress = Math.min(1, (-noteT - slideDelay) / slideDuration);
                    if (-noteT >= slideDelay + slideDuration) {
                        note.slideFinish = true;
                    }
                }
            }
        }
    }
}

function draw() {
    if (!datas || !datas.notes) return;
    const notes = datas.notes;

    const effectDecayTime = settings.effectDecayTime ?? 0.2;
    const hanabiEffectDecayTime = settings.hanabiEffectDecayTime ?? 0.3;
    const maxSlideCount = settings.maxSlideCount;
    const middleDistance = settings.middleDistance;
    const notesLength = notes.length;

    let activeSensors = null;

    if (settings.autoPlay !== false) {
        // 自動模式：使用 SimulatedPlay 模擬玩家感應器觸發狀態
        simulatedPlayController.update({
            globalTime,
            notes,
            renderer,
            playing,
            timeControlSliding,
            effectDecayTime
        });
        activeSensors = simulatedPlayController.activeSensors;
    } else {
        // 手動模式：更新音符手動判定並使用玩家鍵盤/觸控實時按壓 Sensor
        simulatedPlayController.reset();
        updateManualPlayState({ globalTime, notes, renderer, playing, timeControlSliding });
        activeSensors = manualInputSensors;
    }

    // 初始化 index
    if (notesLength > 0 && notes[0] && realTime < notes[0].time) {
        nowIndex = 0;
    }

    // Clear existing arrays without allocating new ones
    buckets.slide.length = 0;
    buckets.tapnhold.length = 0;
    buckets.touch.length = 0;

    noteQuantity.slide = 0;
    noteQuantity.tap = 0;
    noteQuantity.hold = 0;
    noteQuantity.touch = 0;
    noteQuantity.break = 0;

    let playCombo = 0;
    let playScore = 0;
    let slideOnScreenCount = 0;
    let foundIndexForThisFrame = false;

    // 正序 (0 ~ notesLength-1) 統計 Combo 與 Score (解決倒序統計導致 Miss Combo 無法清 0 的問題)
    for (let i = 0; i < notesLength; i++) {
        const note = notes[i];
        const noteT = note.time - globalTime;
        const noteType = note.type;
        const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0) + (note.cullSkipExtend ?? 0);

        const noteTimePassed = (noteType === "slide" ? (note.lastSlide && skipT + noteT < 0) :
            noteType === "hold" ? (skipT + noteT < 0) :
                noteType === "touch" && note.holdDuration !== undefined ? (skipT + noteT < 0) :
                    noteT < 0);

        if (!noteTimePassed) break;

        const isHit = (settings.autoPlay !== false)
            ? true
            : (note.triggered || note.isHolding || note.holdFinish || note.slideFinish || false);

        if (isHit) {
            if (note.isBreak) {
                noteQuantity.break++;
            } else if (note.isHold) {
                noteQuantity.hold++;
            } else {
                noteQuantity[noteType]++;
            }
            playCombo++;
            playScore += ((note.isBreak ? 5 :
                (noteType === "slide" ? 3 :
                    note.holdDuration !== undefined ? 2 : 1)
            ) * (playScoreRes.invScore || 0)) * 100 + (note.isBreak ? (playScoreRes.breakScore || 0) : 0);
        } else {
            // 未擊中 Miss: Combo 中斷歸零
            playCombo = 0;
        }
    }

    const calcPiecewiseSpeed = (x) => {
        if (x >= 1) {
            return x * 0.8833 + 0.8167;
        } else if (x <= -1) {
            return x * 0.8833 - 0.8167;
        } else {
            return x * 1.7;
        }
    };

    // 核心音符繪製與音效迴圈
    for (let i = notesLength - 1; i >= 0; i--) {
        const note = notes[i];
        const noteT = note.time - globalTime;
        const noteType = note.type;
        const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0) + (note.cullSkipExtend ?? 0);

        const noteHispeed = note.hispeed ?? 1;
        const speedCoeff = calcPiecewiseSpeed(settings.speed * noteHispeed);
        const touchSpeedCoeff = calcPiecewiseSpeed(settings.touchSpeed * noteHispeed);

        if (!foundIndexForThisFrame && realTime >= (note.time + musicDelay) && noteType !== "slide") {
            nowIndex = note.index ?? nowIndex;
            foundIndexForThisFrame = true;
        }

        // 音效和狀態管理 (Sound Queue & Long Sound Riser)
        if (playing && !timeControlSliding) {
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

            const lookAhead = 0.1; // 100ms look-ahead

            // 開始音效 (含前瞻)
            const startTargetT = note.time + (note.slideDelay ?? 0);
            const startNoteT = startTargetT - globalTime;
            if (startNoteT <= lookAhead && !note._startEffectPlayed) {
                if (!(noteType === "slide" && !note.firstSlide)) {
                    audioManager.queueSound(note, startTargetT);
                }
                note._startEffectPlayed = true;
            }
            // 結束音效 (含前瞻)
            const endTargetT = note.time + skipT;
            const endNoteT = endTargetT - globalTime;
            if (endNoteT <= lookAhead && !note._endEffectPlayed) {
                const shouldPlayEndSound =
                    (noteType === "slide" && note.lastSlide && note.isBreak) ||
                    note.isHanabi ||
                    (note.holdDuration !== undefined && noteType !== "tap" && !settings.notPlayHoldEnd);
                if (shouldPlayEndSound) {
                    audioManager.queueSound(note, endTargetT);
                }
                note._endEffectPlayed = true;
            }
        } else {
            // 暫停或拖動時重置狀態
            const lookAhead = 0.1;
            const startTargetT = note.time + (note.slideDelay ?? 0);
            const endTargetT = note.time + skipT;
            if (startTargetT - globalTime > lookAhead) {
                note._startEffectPlayed = false;
            }
            if (endTargetT - globalTime > lookAhead) {
                note._endEffectPlayed = false;
            }
            if (note.time - globalTime > 0) {
                if (note._riserActive) {
                    audioManager.stopLongSound(`riser_${note.pos}_${note.time}`);
                    note._riserActive = false;
                }
            }
        }

        // 繪製可見性判斷
        const t = 1 - renderer.timeFunction(noteT * Math.abs(speedCoeff));
        const touchT = 1 - renderer.timeFunction(noteT * Math.abs(touchSpeedCoeff));

        const isVisible =
            (noteType === "slide" ? t >= middleDistance :
                noteType === "touch" ? touchT >= -1 :
                    t >= -1)
            && -noteT <= skipT + (note.isHanabi ? hanabiEffectDecayTime : effectDecayTime);

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
    }

    renderer.drawFrame({
        globalTime,
        buckets,
        dt,
        showSensor: settings.showSensor,
        showSensorText: (settings.showSensorTextWhenPaused && !playing),
        activeSensors,
        playCombo,
        playScore,
        noteQuantity,
        playScoreRes,
        nowIndex,
    });

    audioManager.update(globalTime);
}
