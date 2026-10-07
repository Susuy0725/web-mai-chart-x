import { openDB, idbGet, idbSet, idbSetProject, idbGetProject, projectList, projectCreate, projectDelete, projectRename, projectTouch, projectUpdateName, migrateFromLegacy } from '../Scripts/indexDB.js';
import { SimaiRenderer } from './renderer.js';
import { simaiDecode } from '../Scripts/decode.js';
import { parseMaidata, disableNavigationGestures, loadAllImages, scaleBase, noteRefPos, touchRefPos, audioManager, debounce, popupWindow, simpleToast, createCustomSlider, clamp, imgNotExists } from '../Scripts/helper.js';
import { t, getCurrentLang, setLang } from '../Scripts/i18n.js';
import { SimulatedPlayController } from './simplay.js';
import { getSlideJudgeQueue } from './slidetables.js';
import { toggleSlideDebug, isSlideDebugEnabled, renderSlideDebugOverlay, updateSlideDebugPanel, setSlideDebugToggleCallback } from './slideDebug.js';

disableNavigationGestures();
audioManager.setPlayMode(true);
const simulatedPlayController = new SimulatedPlayController();

const defaultSettings = {
    // Game
    speed: 6.5,
    touchSpeed: 7,
    slideSpeed: 0,
    middleDisplay: 1, // 0: 關閉, 1: COMBO, 2: 分數(101%+), 3: 分數(101%-)
    moviebrightness: -4,
    showSensor: true,
    rotateStars: true,
    pinkStars: false,
    autoPlay: 'computer', // 'computer': Autoplay (電腦), 'simulate': Autoplay (模擬), 'off': 手動遊玩
    hideOutline: false, // 隱藏判定圈
    sensorHighlight: true, // 感應器高亮
    fatFinger: true, // 肥手指擴張判定
    fatFingerRadius: 4.2, // 肥手指判定半徑
    slideDebug: false, // Slide 判定隊列 Debug 視圖
    showJudge: true, // 顯示判定
    showCriticalPerfect: true, // 顯示 critical perfect
    showBreakCriticalPerfect: true, // 顯示 break critical perfect
    showFastLate: true, // 顯示 fast / late
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
    simplayPerfect: true,
    randomOffset: 0,
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
        'judge_great': 0.4,
        'judge_good': 0.4,
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

const activeKeyboardSensors = new Set();
const activePointers = new Map(); // pointerId -> sensorId
const manualInputSensors = new Set();

const _pc = document.getElementById("playControls");
const _pcc = document.getElementById("playControlContainer");
const _ccon = _pcc.querySelector(".controlsContainer");
const _ccb = _ccon.querySelectorAll(".controlButton");

function getControlButton(action) {
    const btn = Array.from(_ccb).find(el => el.dataset.buttonaction === action);
    if (!btn) console.warn(`no button ${action}`);
    return btn;
}

function linkChainSlides(notes) {
    if (!notes || !Array.isArray(notes)) return;
    let currentChain = [];

    // 建立 (time, pos) -> tap/star note 快速查找表
    const starMap = new Map();
    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.type === 'tap' || n.type === 'touch') {
            const key = `${Math.round(n.time * 1000)}_${n.pos}`;
            if (!starMap.has(key)) {
                starMap.set(key, n);
            }
        }
    }

    const finalizeChain = (chain) => {
        if (!chain || chain.length === 0) return;
        const tail = chain[chain.length - 1];
        for (let j = 0; j < chain.length; j++) {
            chain[j].chainTail = tail;
            chain[j].chainList = chain;
        }
    };

    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.type !== 'slide') continue;

        if (n.firstSlide) {
            finalizeChain(currentChain);
            currentChain = [n];
            n.prevSlide = null;
            n.chainLeader = n;

            const key = `${Math.round(n.time * 1000)}_${n.pos}`;
            if (starMap.has(key)) {
                n.headNote = starMap.get(key);
            }

            if (n.lastSlide) {
                finalizeChain(currentChain);
                currentChain = [];
            }
        } else if (currentChain.length > 0) {
            const prev = currentChain[currentChain.length - 1];
            n.prevSlide = prev;
            prev.nextSlide = n;
            n.chainLeader = currentChain[0];
            currentChain.push(n);

            if (n.lastSlide) {
                finalizeChain(currentChain);
                currentChain = [];
            }
        } else {
            n.chainLeader = n;
            n.chainTail = n;
            n.chainList = [n];
        }
    }
    finalizeChain(currentChain);
}

/**
 * 依據墨滢-moying maimai 判定全解規範判斷兩個 Touch 音符是否相鄰 (見 Touch-Group 相鄰判斷表)
 * 表格定義：
 * - B 與 B: 最近的兩個 (如 B1 和 B8/B2，即環狀差 1 或 7)
 * - B 與 C: 總相鄰
 * - C 與 C: 相鄰
 * - C 與 E: 都不相鄰
 * - E 與 E: 都不相鄰
 * - B 與 E: 最近的兩個 (如 B1 和 E1/E2，如 E1 和 B1/B8)
 */
function areTouchNotesAdjacent(a, b) {
    if (a === b) return true;
    const typeA = a.touchPos;
    const typeB = b.touchPos;
    const posA = Number(a.pos) || 1;
    const posB = Number(b.pos) || 1;

    const isCA = (typeA === 'C');
    const isCB = (typeB === 'C');

    if (isCA && isCB) return true;
    if (isCA) return (typeB === 'B'); // C 僅與 B 總相鄰，與 E 都不相鄰
    if (isCB) return (typeA === 'B');

    // B 與 B: 最近的兩個 (如 B1 和 B8/B2)
    if (typeA === 'B' && typeB === 'B') {
        const diff = Math.abs(posA - posB);
        return diff === 1 || diff === 7;
    }

    // E 與 E: 都不相鄰
    if (typeA === 'E' && typeB === 'E') {
        return false;
    }

    // B 與 E: 最近的兩個 (如 B1 和 E1/E2，如 E1 和 B1/B8)
    if (typeA === 'B' && typeB === 'E') {
        return posB === posA || posB === (posA % 8) + 1;
    }
    if (typeA === 'E' && typeB === 'B') {
        return posA === posB || posA === (posB % 8) + 1;
    }

    // A/D 區 (若譜面包含): A 靠近 B, D 靠近 E
    if (typeA === 'A' && typeB === 'B') return posA === posB;
    if (typeA === 'B' && typeB === 'A') return posA === posB;
    if (typeA === 'D' && typeB === 'E') return posA === posB;
    if (typeA === 'E' && typeB === 'D') return posA === posB;

    return false;
}

/**
 * 依據墨滢-moying maimai 判定全解規範構建 Touch-Group
 * 在同一時刻出現 (黃色多押 Touch) 且彼此相鄰的 Touch，相互鏈接形成 Touch-Group
 * 採用無向圖連通分量 (Connected Components) 算法
 */
function linkTouchGroups(notes) {
    if (!notes || !Array.isArray(notes)) return;

    // 1. 依時間聚合同時出現的 Touch 音符 (時間差 <= 0.005s)
    const timeBuckets = new Map();
    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.type !== 'touch') continue;
        n.touchGroup = null;
        const timeKey = Math.round(n.time * 1000);
        if (!timeBuckets.has(timeKey)) {
            timeBuckets.set(timeKey, []);
        }
        timeBuckets.get(timeKey).push(n);
    }

    // 2. 對每個時間桶，使用相鄰關係構建連通分量形成 Group
    for (const [timeKey, groupNotes] of timeBuckets) {
        if (groupNotes.length === 1) {
            const grp = {
                id: `tg_${timeKey}_0`,
                notes: [groupNotes[0]],
                size: 1,
                lastJudgeResult: null,
                isResolved: false
            };
            groupNotes[0].touchGroup = grp;
            continue;
        }

        const visited = new Set();
        let subIndex = 0;

        for (let i = 0; i < groupNotes.length; i++) {
            const startNote = groupNotes[i];
            if (visited.has(startNote)) continue;

            const component = [];
            const queue = [startNote];
            visited.add(startNote);

            while (queue.length > 0) {
                const curr = queue.shift();
                component.push(curr);

                for (let j = 0; j < groupNotes.length; j++) {
                    const neighbor = groupNotes[j];
                    if (!visited.has(neighbor) && areTouchNotesAdjacent(curr, neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }

            const grp = {
                id: `tg_${timeKey}_${subIndex++}`,
                notes: component,
                size: component.length,
                lastJudgeResult: null,
                isResolved: false
            };

            for (const n of component) {
                n.touchGroup = grp;
            }
        }
    }
}

/**
 * 墨滢專欄 Touch-Group 容錯傳導機制：
 * 當 Touch-Group 中超過半數 (> 50%) 的 Touch 獲得判定後，剩餘的 Touch 也會立即獲得相同的判定。
 * 這個判定以最後一個判定的 Touch 為準。
 * （注意：大小為 2 的 Group 不享受此機制）
 */
function resolveTouchGroup(group, lastResult, triggerSourceNote = null) {
    if (!group || group.size < 3 || group.isResolved) return;
    group.lastJudgeResult = lastResult;

    // 計算當前已判定的數量 (包含剛剛判定的 triggerSourceNote)
    const judgedCount = group.notes.filter(n => n.triggered || n === triggerSourceNote).length;

    if (judgedCount > group.size * 0.5) {
        group.isResolved = true;
        const resultTemplate = { ...group.lastJudgeResult };

        for (let i = 0; i < group.notes.length; i++) {
            const remainNote = group.notes[i];
            if (!remainNote.triggered) {
                remainNote.triggered = true;
                remainNote.triggeredTime = globalTime;
                remainNote.judgeResult = { ...resultTemplate };
                spawnJudgeEffect(remainNote, remainNote.judgeResult);
                audioManager.queueHitSound(remainNote, globalTime, remainNote.judgeResult.grade);
                remainNote._startEffectPlayed = true;

                if (renderer && remainNote.judgeResult.grade !== 'MISS') {
                    const posInfo = touchRefPos[remainNote.touchPos]
                        ? touchRefPos[remainNote.touchPos][remainNote.touchPos === "C" ? 0 : remainNote.pos - 1]
                        : { x: 0, y: 0 };
                    renderer.queueHitEffect(null, 0, remainNote.judgeResult, posInfo.x, posInfo.y);
                }

                if (remainNote.isHanabi && remainNote.judgeResult.grade !== 'MISS') {
                    audioManager.queueSoundSingle('hanabi', globalTime);
                }

                if (remainNote.holdDuration > 0 || remainNote.isHold) {
                    remainNote._holdPressed = true;
                    remainNote.isHolding = true;
                    remainNote._headJudge = { ...remainNote.judgeResult };
                }
            }
        }
    }
}

let datas = simaiDecode();
if (datas) {
    linkChainSlides(datas.notes);
    linkTouchGroups(datas.notes);
}

const canvas = document.querySelector("#main");
const ctx = canvas.getContext("2d");

let settings = {};

let images;
let renderer;

function applyAudioSettings(s) {
    if (!audioManager || !s) return;
    if (s.globalVolume !== undefined) audioManager.setGlobalVolume(s.globalVolume);
    if (s.musicVolume !== undefined) audioManager.setBGMVolume(s.musicVolume);
    if (s.SfxVolume !== undefined) audioManager.setSFXVolume(s.SfxVolume);
    if (s.sfxVolumes) audioManager.setSFXVolumes(s.sfxVolumes);
    if (s.playbackSpeed !== undefined) audioManager.setPlaybackRate(s.playbackSpeed);
}

images = await loadAllImages();
if (audioManager && audioManager.soundFiles) {
    for (const key in audioManager.soundFiles) {
        audioManager.soundFiles[key] = new URL(`../${audioManager.soundFiles[key].replace(/^\.\//, '')}`, import.meta.url).href;
    }
    try {
        await audioManager.init();
    } catch (err) {
        console.warn('音效載入失敗:', err);
    }
}

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
    if (settings.autoPlay === true) {
        settings.autoPlay = 'computer';
        isMissingSettings = true;
    } else if (settings.autoPlay === false) {
        settings.autoPlay = 'off';
        isMissingSettings = true;
    }
    if (isMissingSettings) {
        await idbSet('simai_settings', JSON.stringify(settings));
    }
} else {
    settings = { ...defaultSettings };
    await idbSet('simai_settings', JSON.stringify(settings));
};
applyAudioSettings(settings);
if (settings.slideDebug) {
    toggleSlideDebug(true);
}
setSlideDebugToggleCallback((state) => {
    settings.slideDebug = state;
    idbSet('simai_settings', JSON.stringify(settings)).catch(() => { });
});
renderer = new SimaiRenderer(canvas, settings);
renderer.setImages(images);

let globalTime = 0;
let realTime = 0;
let lastObservedTime = 0;
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

const canvasContainer = document.getElementById("canvasContainer");

function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = (canvasContainer ? canvasContainer.clientWidth : window.innerWidth) * dpr;
    const h = (canvasContainer ? canvasContainer.clientHeight : window.innerHeight) * dpr;

    const scaleValue = renderer?.scale ?? 0.98;
    const p = Math.min(w, h) / scaleBase * scaleValue;

    canvas.width = w;
    canvas.height = h;
    ctx.setTransform(p, 0, 0, p, w / 2, h / 2);
    draw();
}


if (typeof document !== 'undefined' && document.fonts) {
    Promise.all([
        document.fonts.load('10px combo'),
        document.fonts.load('10px mono'),
        document.fonts.load('10px title'),
    ]).then(() => {
        if (renderer) {
            renderer._sensorCacheParams = { w: 0, h: 0, scale: 0 };
            renderer._middleDisplayCacheParams = { w: 0, h: 0, scale: 0 };
        }
        if (typeof draw === 'function') {
            draw();
        }
    });
}

resize();

window.addEventListener('resize', resize);

const playPauseBtn = getControlButton("play/pause");
const restartBtn = getControlButton("reset");
const autoPlayBtn = getControlButton("autoPlay");
const hideBtn = getControlButton("hide");
const hideShowBtn = document.getElementById("showPlayControlsBtn");
const projectBtn = getControlButton("openProject");
const folderBtn = getControlButton("openFolder");
const settingsBtn = getControlButton("settings");

const playbackSpeedInput = document.getElementById("playbackSpeedInput");
const playbackSpeedBtn = getControlButton("playbackSpeed");
const playbackSpeedMinusBtn = getControlButton("playbackSpeedMinus");
const playbackSpeedAddBtn = getControlButton("playbackSpeedAdd");
const slideDebugBtn = getControlButton("slideDebug");

const gameBackgroundImage = document.getElementById("backgroundImage");
const gameBackgroundVideo = document.getElementById("backgroundVideo");
if (gameBackgroundVideo) {
    gameBackgroundVideo.playsInline = true;
    gameBackgroundVideo.defaultMuted = true;
    gameBackgroundVideo.muted = true;
    gameBackgroundVideo.setAttribute('playsinline', '');
    gameBackgroundVideo.setAttribute('webkit-playsinline', '');
    gameBackgroundVideo.setAttribute('x5-playsinline', '');
    gameBackgroundVideo.setAttribute('disablePictureInPicture', '');
    gameBackgroundVideo.setAttribute('disableRemotePlayback', '');
    gameBackgroundVideo.addEventListener('webkitbeginfullscreen', (e) => {
        e.preventDefault();
        try {
            if (typeof gameBackgroundVideo.webkitExitFullscreen === 'function') {
                gameBackgroundVideo.webkitExitFullscreen();
            }
        } catch (_) { }
    });
    gameBackgroundVideo.addEventListener('webkitpresentationmodechanged', () => {
        if (gameBackgroundVideo.webkitPresentationMode === 'fullscreen' && typeof gameBackgroundVideo.webkitSetPresentationMode === 'function') {
            gameBackgroundVideo.webkitSetPresentationMode('inline');
        }
    });
}
const canvasOutline = document.getElementById("canvasOutline");

const timeControl = document.getElementById("timeControl");

function updateOutlineUI() {
    if (canvasOutline) {
        canvasOutline.style.display = settings.hideOutline ? 'none' : '';
    }
}
updateOutlineUI();

function getAutoPlayMode() {
    if (settings.autoPlay === true || settings.autoPlay === 'computer') return 'computer';
    if (settings.autoPlay === 'simulate') return 'simulate';
    return 'off';
}

function updateAutoPlayUI() {
    if (!autoPlayBtn) return;
    const mode = getAutoPlayMode();
    autoPlayBtn.dataset.autoplay = mode;
    if (autoPlayBtn.children[0]) {
        if (mode === 'computer') {
            autoPlayBtn.children[0].innerText = "computer";
            autoPlayBtn.title = t('settings.autoPlayOpts.computer') || "Autoplay (電腦)";
        } else if (mode === 'simulate') {
            autoPlayBtn.children[0].innerText = "smart_toy";
            autoPlayBtn.title = t('settings.autoPlayOpts.simulate') || "Autoplay (模擬)";
        } else {
            autoPlayBtn.children[0].innerText = "touch_app";
            autoPlayBtn.title = t('settings.autoPlayOpts.off') || "手動遊玩";
        }
    }
}

if (autoPlayBtn) {
    autoPlayBtn.addEventListener("click", () => {
        const currentMode = getAutoPlayMode();
        let nextMode = 'computer';
        if (currentMode === 'computer') {
            nextMode = 'simulate';
        } else if (currentMode === 'simulate') {
            nextMode = 'off';
        } else {
            nextMode = 'computer';
        }
        settings.autoPlay = nextMode;
        simulatedPlayController.reset();
        activeKeyboardSensors.clear();
        activePointers.clear();
        manualInputSensors.clear();
        updateAutoPlayUI();
        idbSet('simai_settings', JSON.stringify(settings));

        const label = nextMode === 'computer'
            ? (t('settings.autoPlayOpts.computer') || 'Autoplay (電腦)')
            : (nextMode === 'simulate' ? (t('settings.autoPlayOpts.simulate') || 'Autoplay (模擬)') : (t('settings.autoPlayOpts.off') || '手動遊玩'));
        simpleToast({ content: label, type: 'info', timeout: 1000 });
    });
}
updateAutoPlayUI();

// 手動遊玩輸入與鍵盤/觸控對應 (Manual Play Controls)
const KEY_TO_SENSOR = {
    '1': 'A1', '2': 'A2', '3': 'A3', '4': 'A4', '5': 'A5', '6': 'A6', '7': 'A7', '8': 'A8',
    'a': 'A1', 's': 'A2', 'd': 'A3', 'f': 'A4', 'j': 'A5', 'k': 'A6', 'l': 'A7', ';': 'A8',
    'A': 'A1', 'S': 'A2', 'D': 'A3', 'F': 'A4', 'J': 'A5', 'K': 'A6', 'L': 'A7',
    'q': 'A8', 'w': 'A1', 'e': 'A2', 'r': 'A3', 'u': 'A4', 'i': 'A5', 'o': 'A6', 'p': 'A7',
    ' ': 'C', 'c': 'C', 'C': 'C',
    'Numpad1': 'A5', 'Numpad2': 'A6', 'Numpad3': 'A7', 'Numpad4': 'A4',
    'Numpad5': 'C', 'Numpad6': 'A8', 'Numpad7': 'A3', 'Numpad8': 'A2', 'Numpad9': 'A1'
};

function updateManualSensors() {
    manualInputSensors.clear();
    for (const s of activeKeyboardSensors) manualInputSensors.add(s);
    for (const s of activePointers.values()) {
        if (s instanceof Set) {
            for (const id of s) manualInputSensors.add(id);
        } else if (s) {
            manualInputSensors.add(s);
        }
    }
}

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.repeat) return;

    if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
            case 'o': {
                e.preventDefault();
                let sp = (settings.playbackSpeed || 1) - 0.25;
                if (sp <= 0.25) sp = 0.25;
                setPlaybackSpeed(sp);
                simpleToast({ content: t('toast.setPlaybackSpeed', { speed: sp.toFixed(2) }), type: 'success', timeout: 1800 });
                return;
            }
            case 'p': {
                e.preventDefault();
                let sp = (settings.playbackSpeed || 1) + 0.25;
                if (sp >= 2.0) sp = 2.0;
                setPlaybackSpeed(sp);
                simpleToast({ content: t('toast.setPlaybackSpeed', { speed: sp.toFixed(2) }), type: 'success', timeout: 1800 });
                return;
            }
            case 'd': {
                e.preventDefault();
                const nextState = toggleSlideDebug();
                settings.slideDebug = nextState;
                idbSet('simai_settings', JSON.stringify(settings)).catch(() => { });
                simpleToast({ content: `Slide Debug 視圖：${nextState ? '開啟' : '關閉'}`, type: 'info', timeout: 1200 });
                return;
            }
        }
        switch (e.code) {
            case 'Space': {
                e.preventDefault();
                togglePlay();
                return;
            }
            case 'Backspace': {
                e.preventDefault();
                restart();
                return;
            }
        }
        return;
    }

    const sensor = KEY_TO_SENSOR[e.key] || KEY_TO_SENSOR[e.code];
    if (sensor) {
        activeKeyboardSensors.add(sensor);
        updateManualSensors();
        triggerManualHit(sensor);
    }
});

window.addEventListener('keyup', (e) => {
    const sensor = KEY_TO_SENSOR[e.key] || KEY_TO_SENSOR[e.code];
    if (sensor) {
        activeKeyboardSensors.delete(sensor);
        updateManualSensors();
    }
});

// --- 墨滢-moying maimai 判定全解標準系統 (JudgeEngine) ---
const FRAME_SEC = 1 / 60; // 0.0166667s (16.67ms)

const JUDGE_WINDOWS = {
    TAP: {
        CRITICAL_PERFECT: 1 * FRAME_SEC,  // <= 16.67ms (大P / CP，不分 Fast/Late)
        PERFECT_2ND: 2 * FRAME_SEC,       // <= 33.33ms (2nd Perfect，分 Fast/Late)
        PERFECT_3RD: 3 * FRAME_SEC,       // <= 50.00ms (3rd Perfect，分 Fast/Late)
        GREAT_1ST: 4 * FRAME_SEC,         // <= 66.67ms (1st Great，分 Fast/Late)
        GREAT_2ND: 5 * FRAME_SEC,         // <= 83.33ms (2nd Great，分 Fast/Late)
        GREAT_3RD: 6 * FRAME_SEC,         // <= 100.00ms (3rd Great，分 Fast/Late)
        GOOD: 9 * FRAME_SEC               // <= 150.00ms (Good，分 Fast/Late)
    },
    TOUCH: {
        // 墨滢-moying 判定全解規範 (見第5節 Touch判定表)：
        // 1. Touch 沒有 Fast 判定，在 Touch 出現前不斷嘗試觸碰 (擦玻璃) 均不扣分，進入窗口即可判定。
        // 2. 判定區間 (相對中央幀)：
        //    Critical Perfect: -9 至 +9 幀 (18 幀時長，±150ms 均為 CP)
        //    Late Perfect:     +10 至 +12 幀 (3 幀時長，150ms ~ 200ms)
        //    Late Great:       +13 至 +15 幀 (3 幀時長，200ms ~ 250ms)
        //    Late Good:        +16 至 +18 幀 (3 幀時長，250ms ~ 300ms)
        //    Too Late:         +19 幀之後 (Miss)
        FAST_WINDOW: 36 * FRAME_SEC,           // 提前擦玻璃容許窗口 (600ms)
        CRITICAL_PERFECT: 9 * FRAME_SEC,       // -9 至 +9 幀 (150ms) 均為 Critical Perfect
        PERFECT_LATE: 12 * FRAME_SEC,          // +10 至 +12 幀 (200ms)
        GREAT_LATE: 15 * FRAME_SEC,            // +13 至 +15 幀 (250ms)
        GOOD_LATE: 18 * FRAME_SEC              // +16 至 +18 幀 (300ms)
    },
    SLIDE: {
        MAX_EXT_SEC: 22 * FRAME_SEC,          // 0.3667s (366.67ms)
        BASE_3RD_PERFECT_SEC: 14 * FRAME_SEC, // 0.2333s (233.33ms)
        GREAT_1ST_SEC: 21 * FRAME_SEC,        // 0.3500s (350.00ms)
        GREAT_2ND_SEC: 25 * FRAME_SEC,        // 0.4167s (416.67ms)
        GREAT_3RD_SEC: 29 * FRAME_SEC,        // 0.4833s (483.33ms)
        GOOD_AREA_SEC: 36 * FRAME_SEC         // 0.6000s (600.00ms)
    },
    HOLD: {
        RELEASE_IGNORE_SEC: 3 * FRAME_SEC,     // 0.0500s (3 幀鬆開等待保護，3 幀內重按不計入鬆手)
        HEAD_IGNORE_SEC: 6 * FRAME_SEC,        // 0.1000s (Hold 起始忽略 6 幀)
        TOUCH_HEAD_IGNORE_SEC: 15 * FRAME_SEC, // 0.2500s (Touch-Hold 起始忽略 15 幀)
        TAIL_IGNORE_SEC: 12 * FRAME_SEC        // 0.2000s (結尾提前放開忽略 12 幀)
    }
};

function spawnJudgeEffect(note, judgeResult) {
    if (!renderer) return;
    renderer.spawnJudgeEffect(note, judgeResult, globalTime);
}

/**
 * 評估音符擊中評級 (對齊墨滢-moying maimai判定全解)
 * @param {number} diffSec 擊中時間偏差 (秒, globalTime - note.time, 負數代表提早FAST, 正數代表較晚LATE)
 * @param {Object} note 音符物件
 * @returns {Object|null} 判定結果物件，若尚未進入早按視窗則回傳 null (不觸發判定)
 */
function evaluateHitGrade(diffSec, note) {
    const isTouch = (note.type === 'touch');
    const isFast = diffSec < 0;
    const absDiff = Math.abs(diffSec);
    const diffMSec = Math.round(diffSec * 1000 * 10) / 10;

    let grade = 'MISS';
    let subGrade = '';
    let scoreMultiplier = 0;
    let breakMultiplier = 0;
    let breakScoreValue = 0;

    if (isTouch) {
        const win = JUDGE_WINDOWS.TOUCH;
        // 早於提前檢測窗口 (600ms) 的點擊不予判定 (等待進入窗口)
        if (isFast && absDiff > win.FAST_WINDOW) {
            return null;
        }

        // 墨滢-moying 判定全解規範 (截圖表)：
        // 1. -9 至 +9 幀 (時長 18 幀，±150ms)：Critical Perfect，且不帶 FAST/LATE 標記
        // 2. 提前擦玻璃擊中一律為 Critical Perfect
        if (isFast || diffSec <= win.CRITICAL_PERFECT) {
            grade = 'CRITICAL_PERFECT';
            subGrade = '';
            scoreMultiplier = 1.0;
            breakMultiplier = 1.0;
            breakScoreValue = 2600;
        } else if (diffSec <= win.PERFECT_LATE) {
            // +10 至 +12 幀 (時長 3 幀): Late Perfect
            grade = 'PERFECT';
            subGrade = 'LATE';
            scoreMultiplier = 1.0;
            breakMultiplier = 0.75;
            breakScoreValue = 2550;
        } else if (diffSec <= win.GREAT_LATE) {
            // +13 至 +15 幀 (時長 3 幀): Late Great
            grade = 'GREAT';
            subGrade = 'LATE';
            scoreMultiplier = note.isBreak ? 0.6 : 0.8;
            breakMultiplier = 0.4;
            breakScoreValue = 1500;
        } else if (diffSec <= win.GOOD_LATE) {
            // +16 至 +18 幀 (時長 3 幀): Late Good
            grade = 'GOOD';
            subGrade = 'LATE';
            scoreMultiplier = note.isBreak ? 0.4 : 0.5;
            breakMultiplier = 0.3;
            breakScoreValue = 1000;
        } else {
            // +19 幀之後: Too Late (MISS)
            grade = 'MISS';
            subGrade = 'LATE';
            scoreMultiplier = 0;
            breakMultiplier = 0;
            breakScoreValue = 0;
        }
    } else {
        const win = JUDGE_WINDOWS.TAP;
        if (absDiff <= win.CRITICAL_PERFECT) {
            grade = 'CRITICAL_PERFECT';
            subGrade = ''; // CP 不分 Fast/Late
            scoreMultiplier = 1.0;
            breakMultiplier = 1.0;
            breakScoreValue = 2600;
        } else if (absDiff <= win.PERFECT_2ND) {
            grade = 'PERFECT';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = 1.0;
            breakMultiplier = 0.75;
            breakScoreValue = 2550;
        } else if (absDiff <= win.PERFECT_3RD) {
            grade = 'PERFECT';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = 1.0;
            breakMultiplier = 0.5;
            breakScoreValue = 2500;
        } else if (absDiff <= win.GREAT_1ST) {
            grade = 'GREAT';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = 0.8;
            breakMultiplier = 0.4;
            breakScoreValue = 2000;
        } else if (absDiff <= win.GREAT_2ND) {
            grade = 'GREAT';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = note.isBreak ? 0.6 : 0.8;
            breakMultiplier = 0.4;
            breakScoreValue = 1500;
        } else if (absDiff <= win.GREAT_3RD) {
            grade = 'GREAT';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = note.isBreak ? 0.5 : 0.8;
            breakMultiplier = 0.4;
            breakScoreValue = 1250;
        } else if (absDiff <= win.GOOD) {
            grade = 'GOOD';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = note.isBreak ? 0.4 : 0.5;
            breakMultiplier = 0.3;
            breakScoreValue = 1000;
        }
    }

    // EX 音符特權：只要落在 Good 視窗以內，一律強制升為 CRITICAL_PERFECT
    if (note.isEx && grade !== 'MISS') {
        grade = 'CRITICAL_PERFECT';
        subGrade = '';
        scoreMultiplier = 1.0;
        breakMultiplier = 1.0;
        breakScoreValue = 2600;
    }

    // 地雷音符 Mine：碰觸判定為 MISS
    if (note.isMine) {
        grade = 'MISS';
        subGrade = 'TOO_FAST';
        scoreMultiplier = 0;
        breakMultiplier = 0;
        breakScoreValue = 0;
    }

    return { grade, subGrade, isFast, diffMSec, scoreMultiplier, breakMultiplier, breakScoreValue };
}

/**
 * 評估 Slide 劃軌完成評級 (對齊墨滢-moying maimai判定全解)
 * @param {number} diffSec 完成時間與基準判定時間的偏差 (秒, globalTime - judgeTiming, 負數代表提前FAST, 正數代表延後LATE)
 * @param {Object} note Slide 音符物件
 * @returns {Object} 判定結果物件
 */
function evaluateSlideGrade(diffSec, note) {
    const isFast = diffSec < 0;
    const absDiff = Math.abs(diffSec);
    const diffMSec = Math.round(diffSec * 1000 * 10) / 10;

    // 墨滢-moying 判定全解規範：
    // 1. Slide 軌跡的所有 Perfect 判定均為 Critical Perfect（絕無 2550/2500 落）！
    // 2. 動態擴展 Perfect 視窗公式：
    //    stayTimeMSec = LastWaitTimeSec * 1000
    //    ext = min(stayTimeMSec / 4, 22 * FRAME_LENGTH_MSEC)
    //    擴大後的 CP 區間會覆蓋原有的 Great / Good 判定區間 (但上限不超過 36 幀)
    const stayTimeMSec = (note.lastWaitTimeSec ?? (note.slideDuration * (note.tableConst || 0.18))) * 1000;
    const extSec = Math.min(stayTimeMSec / 4000, JUDGE_WINDOWS.SLIDE.MAX_EXT_SEC);
    const PERFECT_SEC = JUDGE_WINDOWS.SLIDE.BASE_3RD_PERFECT_SEC + extSec;

    let grade = 'GOOD';
    let subGrade = isFast ? 'FAST' : 'LATE';
    let scoreMultiplier = note.isBreak ? 0.4 : 0.5;
    let breakMultiplier = 0.3;
    let breakScoreValue = 1000;

    if (absDiff <= PERFECT_SEC) {
        // 在 Perfect 視窗內一律為 Critical Perfect，不分 Fast/Late，Break 滿分 2600
        grade = 'CRITICAL_PERFECT';
        subGrade = '';
        scoreMultiplier = 1.0;
        breakMultiplier = 1.0;
        breakScoreValue = 2600;
    } else if (absDiff <= JUDGE_WINDOWS.SLIDE.GREAT_1ST_SEC) {
        grade = 'GREAT';
        subGrade = isFast ? 'FAST' : 'LATE';
        scoreMultiplier = 0.8;
        breakMultiplier = 0.4;
        breakScoreValue = 2000;
    } else if (absDiff <= JUDGE_WINDOWS.SLIDE.GREAT_2ND_SEC) {
        grade = 'GREAT';
        subGrade = isFast ? 'FAST' : 'LATE';
        scoreMultiplier = note.isBreak ? 0.6 : 0.8;
        breakMultiplier = 0.4;
        breakScoreValue = 1500;
    } else if (absDiff <= JUDGE_WINDOWS.SLIDE.GREAT_3RD_SEC) {
        grade = 'GREAT';
        subGrade = isFast ? 'FAST' : 'LATE';
        scoreMultiplier = note.isBreak ? 0.5 : 0.8;
        breakMultiplier = 0.4;
        breakScoreValue = 1250;
    } else {
        // 只要劃完全程，保底為 GOOD
        grade = 'GOOD';
        subGrade = isFast ? 'FAST' : 'LATE';
        scoreMultiplier = note.isBreak ? 0.4 : 0.5;
        breakMultiplier = 0.3;
        breakScoreValue = 1000;
    }

    if (note.isEx && grade !== 'MISS') {
        grade = 'CRITICAL_PERFECT';
        subGrade = '';
        scoreMultiplier = 1.0;
        breakMultiplier = 1.0;
        breakScoreValue = 2600;
    }

    if (note.isMine) {
        grade = 'MISS';
        subGrade = 'TOO_FAST';
        scoreMultiplier = 0;
        breakMultiplier = 0;
        breakScoreValue = 0;
    }

    return { grade, subGrade, isFast, diffMSec, scoreMultiplier, breakMultiplier, breakScoreValue };
}

function resetNotesForSeek(targetGlobalTime) {
    if (!datas || !datas.notes) return;
    for (let i = 0; i < datas.notes.length; i++) {
        const note = datas.notes[i];
        const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0) + (note.cullSkipExtend ?? 0);
        const startTargetT = note.time + (note.slideDelay ?? 0);
        const endTargetT = note.time + skipT;

        // 若 Slide/音符尚未完全結束（結束時間大於目標時間），重置結束標記與完成狀態
        if (endTargetT > targetGlobalTime) {
            note._endEffectPlayed = false;
            note._hanabiSoundPlayed = false;
            note.holdFinish = false;
            note.isHolding = false;
            note._holdPressed = false;
            note._releaseDuration = 0;
            note._headMiss = false;
            note._headJudge = null;
            note.slideFinish = false;
            note.chainFinished = false;
            note.hideStar = false;
            note._slideJudged = false;
            note._judgeEffectSpawned = false;
            note.unlocked = false;
            note.judgeQueue = null;
            note.judgeQueues = null;
            note._fullJudgeQueue = null;
            note._totalAreasCount = 0;
        }

        // 若 Slide 劃軌尚未開始（目標時間尚未到達 slideDelay），進度歸零並清空隊列判定紀錄
        if (startTargetT >= targetGlobalTime) {
            note._startEffectPlayed = false;
            note._slideStartPlayed = false;
            note.slideProgress = 0;
            note.unlocked = false;
            note.headTriggered = false;
            note.judgeQueue = null;
            note.judgeQueues = null;
            note._fullJudgeQueue = null;
            note._totalAreasCount = 0;
        }

        if (note.time >= targetGlobalTime) {
            note._answerSoundPlayed = false;
        }

        // 若音符在判定視窗以內或未來的時間，重置判定結果與擊中狀態
        const isTouch = (note.type === 'touch');
        const lateWin = isTouch ? JUDGE_WINDOWS.TOUCH.GOOD_LATE : (note.type === 'slide' ? 0.6 : JUDGE_WINDOWS.TAP.GOOD);
        if (note.time + lateWin >= targetGlobalTime) {
            note.triggered = false;
            note.judgeResult = null;
            note._missReported = false;
            note.isHolding = false;
            note._holdPressed = false;
            note._releaseDuration = 0;
            note._headMiss = false;
            note._headJudge = null;
            if (note.touchGroup) {
                note.touchGroup.isResolved = false;
                note.touchGroup.lastJudgeResult = null;
            }
        }

        if (note.time > targetGlobalTime) {
            if (note._riserActive) {
                audioManager.stopLongSound(`riser_${note.pos}_${note.time}`);
                note._riserActive = false;
            }
        }
    }
}

function triggerManualHit(sensorInput, forceDiffSec = null) {
    if (!datas || !datas.notes || !playing) return;

    const sensorSet = (sensorInput instanceof Set)
        ? sensorInput
        : new Set(Array.isArray(sensorInput) ? sensorInput : [sensorInput]);

    if (sensorSet.size === 0) return;

    let bestNote = null;
    let minDiff = Infinity;
    let bestEval = null;

    for (let i = 0; i < datas.notes.length; i++) {
        const note = datas.notes[i];
        if (note.triggered) continue;
        if (note.type === 'slide') continue; // Slide 由劃軌 Checkpoint 判定，不接受點擊觸發
        const noteT = note.time - globalTime; // 音符時間相對於當前時間之差 (正數代表在未來)
        const isTouch = (note.type === 'touch');

        // 音符在未來且超過最大容許判定視窗，後續音符更靠後，直接結束搜尋
        if (noteT > 0.65) break;

        // 依據音符類型檢查是否在可擊中時機窗口內
        if (isTouch) {
            // Touch 音符：墨滢專欄指出 Touch 無 Fast 判定，進入提前 600ms 窗口內即可擊中，晚按至 300ms 內 (GOOD_LATE)
            if (noteT > JUDGE_WINDOWS.TOUCH.FAST_WINDOW || noteT < -JUDGE_WINDOWS.TOUCH.GOOD_LATE) {
                continue;
            }
        } else {
            // Tap / Hold / Star 音符：早按與晚按皆為 150ms (9 幀)
            if (noteT > JUDGE_WINDOWS.TAP.GOOD || noteT < -JUDGE_WINDOWS.TAP.GOOD) {
                continue;
            }
        }

        let matches = false;
        if (isTouch) {
            const normSensor = (note.touchPos === 'C') ? 'C' : (note.touchPos + note.pos);
            matches = sensorSet.has(normSensor);
        } else {
            // 一般音符 (tap, hold, star)
            // 外鍵與 A 區感應器 (A1~A8) 觸發
            matches = sensorSet.has('A' + note.pos);
        }

        if (matches) {
            // 統一差值定義：globalTime - note.time (提早擊中為負數 FAST，延後擊中為正數 LATE)
            const diffForEval = (forceDiffSec !== null) ? forceDiffSec : (globalTime - note.time);
            const evalRes = evaluateHitGrade(diffForEval, note);
            if (evalRes && evalRes.grade !== 'MISS') {
                const diff = Math.abs(diffForEval);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestNote = note;
                    bestEval = evalRes;
                }
            }
        }
    }

    if (bestNote && bestEval) {
        // 觸發最接近的音符，以及在同一時間（如雙押 / Each 音符）且感應器覆蓋的其他音符
        const hitNotes = [bestNote];
        const targetTime = bestNote.time;

        for (let i = 0; i < datas.notes.length; i++) {
            const note = datas.notes[i];
            if (note === bestNote || note.triggered || note.type === 'slide') continue;
            if (Math.abs(note.time - targetTime) <= 0.03) {
                let matches = false;
                if (note.type === 'touch') {
                    const normSensor = (note.touchPos === 'C') ? 'C' : (note.touchPos + note.pos);
                    matches = sensorSet.has(normSensor);
                } else {
                    matches = sensorSet.has('A' + note.pos);
                }
                if (matches) {
                    const diffForEval = (forceDiffSec !== null) ? forceDiffSec : (globalTime - note.time);
                    const evalRes = evaluateHitGrade(diffForEval, note);
                    if (evalRes && evalRes.grade !== 'MISS') {
                        hitNotes.push(note);
                    }
                }
            }
        }

        for (const hn of hitNotes) {
            if (hn.triggered && hn.judgeResult) continue; // 若已在此輪循環中被 TouchGroup 傳導判定，避免重複處理
            const diffForEval = (forceDiffSec !== null) ? forceDiffSec : (globalTime - hn.time);
            const evalRes = evaluateHitGrade(diffForEval, hn);
            if (!evalRes) continue;

            const isHoldNote = (hn.holdDuration > 0 || hn.isHold || hn.type === 'hold');

            hn.triggered = true;
            hn.triggeredTime = globalTime;

            if (isHoldNote) {
                hn._holdPressed = true;
                hn.isHolding = true;
                hn._headJudge = evalRes;
                // Hold 判定不是在開始時進行的，不在起手呼叫 spawnJudgeEffect 與設置最終 judgeResult
            } else {
                hn.judgeResult = evalRes;
                spawnJudgeEffect(hn, evalRes);
            }

            audioManager.queueHitSound(hn, globalTime, evalRes.grade);
            hn._startEffectPlayed = true;

            // Touch Hanabi 判定音效：需要判定命中且非 TouchHold 時在此播放
            if (hn.type === 'touch' && (!hn.holdDuration || hn.holdDuration <= 0) && hn.isHanabi && evalRes.grade !== 'MISS') {
                audioManager.queueSoundSingle('hanabi', globalTime);
            }

            // 墨滢專欄：Touch-Group 容錯傳導機制觸發
            if (hn.type === 'touch' && hn.touchGroup) {
                resolveTouchGroup(hn.touchGroup, evalRes, hn);
            }

            // 若擊中的是 slide 頭部 star，立即解鎖對應 slide 允許滑動
            for (let j = 0; j < datas.notes.length; j++) {
                const sn = datas.notes[j];
                if (sn.type === 'slide' && sn.firstSlide && sn.pos === hn.pos && Math.abs(sn.time - hn.time) < 0.05) {
                    sn.headTriggered = true;
                    sn.unlocked = true;
                }
            }
        }
    }
}

function areSetsEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.size !== b.size) return false;
    for (const item of a) {
        if (!b.has(item)) return false;
    }
    return true;
}

function getSensorsFromPointer(e) {
    if (!renderer) return new Set();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dpr = window.devicePixelRatio || 1;
    const p = Math.min(canvas.width, canvas.height) / scaleBase * renderer.scale;
    const rx = (x * dpr - canvas.width * 0.5) / p;
    const ry = (y * dpr - canvas.height * 0.5) / p;

    let radius = 0;
    if (settings.fatFinger !== false) {
        radius = settings.fatFingerRadius ?? 4.2;
        if (e.width && e.width > 0 && p > 0) {
            const touchR = (e.width * dpr * 0.5) / p;
            if (touchR > radius) {
                radius = Math.min(8.0, touchR);
            }
        }
    }

    return renderer.getSensorsAtPointWithRadius(rx, ry, radius);
}

if (canvas) {
    canvas.addEventListener('pointerdown', (e) => {
        if (!renderer) return;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
        const sensors = getSensorsFromPointer(e);
        activePointers.set(e.pointerId, sensors);
        updateManualSensors();
        if (sensors.size > 0 && playing) {
            triggerManualHit(sensors);
        }
        if (!playing) draw();
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!renderer) return;
        if (!activePointers.has(e.pointerId) && e.buttons === 0) return;
        const sensors = getSensorsFromPointer(e);
        const prevSensors = activePointers.get(e.pointerId);

        if (!areSetsEqual(sensors, prevSensors)) {
            activePointers.set(e.pointerId, sensors);
            updateManualSensors();
            if (sensors.size > 0 && playing) {
                const newlyAdded = new Set();
                for (const s of sensors) {
                    if (!prevSensors || !prevSensors.has(s)) {
                        newlyAdded.add(s);
                    }
                }
                if (newlyAdded.size > 0) {
                    triggerManualHit(newlyAdded);
                }
            }
            if (!playing) draw();
        }
    });

    const handlePointerUp = (e) => {
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) { }
        if (activePointers.has(e.pointerId)) {
            activePointers.delete(e.pointerId);
            updateManualSensors();
            if (!playing) draw();
        }
    };
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
}

if (restartBtn) {
    restartBtn.addEventListener("click", restart);
}

if (playbackSpeedInput) {
    playbackSpeedInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    playbackSpeedInput.addEventListener('change', () => {
        const speed = parseFloat(playbackSpeedInput.value);
        if (isNaN(speed) || speed <= 0) {
            simpleToast({ content: t('toast.invalidPlaybackSpeed'), type: 'warning', timeout: 1800 });
            playbackSpeedInput.value = (settings.playbackSpeed || 1).toFixed(2);
            return;
        }
        setPlaybackSpeed(speed);
        simpleToast({ content: t('toast.setPlaybackSpeed', { speed: speed.toFixed(2) }), type: 'success', timeout: 1800 });
    });
    playbackSpeedInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            playbackSpeedInput.blur();
        }
    });
}

if (playbackSpeedBtn) {
    playbackSpeedBtn.addEventListener('click', () => {
        setPlaybackSpeed(1);
        simpleToast({ content: t('toast.resetPlaybackSpeed'), type: 'success', timeout: 1800 });
    });
}

if (playbackSpeedAddBtn) {
    playbackSpeedAddBtn.addEventListener('click', () => {
        let sp = (settings.playbackSpeed || 1) + 0.25;
        if (sp >= 2.0) sp = 2.0;
        setPlaybackSpeed(sp);
        simpleToast({ content: t('toast.setPlaybackSpeed', { speed: sp.toFixed(2) }), type: 'success', timeout: 1800 });
    });
}

if (playbackSpeedMinusBtn) {
    playbackSpeedMinusBtn.addEventListener('click', () => {
        let sp = (settings.playbackSpeed || 1) - 0.25;
        if (sp <= 0.25) sp = 0.25;
        setPlaybackSpeed(sp);
        simpleToast({ content: t('toast.setPlaybackSpeed', { speed: sp.toFixed(2) }), type: 'success', timeout: 1800 });
    });
}

if (slideDebugBtn) {
    slideDebugBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const nextState = toggleSlideDebug();
        settings.slideDebug = nextState;
        idbSet('simai_settings', JSON.stringify(settings)).catch(() => { });
        simpleToast({ content: `Slide Debug 視圖：${nextState ? '開啟' : '關閉'}`, type: 'info', timeout: 1200 });
    });
}

if (hideBtn) {
    hideBtn.addEventListener('click', toggleHide);
}

if (hideShowBtn) {
    hideShowBtn.addEventListener('click', toggleHide);
}

if (projectBtn) {
    projectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openProjectManager();
    });
}

if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSettings();
    });
}

if (folderBtn) {
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
}

update();

function maidataProcess(e) {
    musicDelay = 0;
    rawdata = typeof e === 'string' ? parseMaidata(e) : (e || {});
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
    pause();
    restart();
    rawdata = null;
    datas = null;
    playScoreRes = { tap: 0, hold: 0, slide: 0, touch: 0, break: 0, score: 0, breakScore: 0, invScore: 0 };
    playCombo = 0;
    playScore = 0;
    if (renderer) renderer.clearJudgeEffects();

    if (audioManager) {
        audioManager.removeBackgroundMusic().catch(() => { });
    }

    backgroundImage = null;
    if (gameBackgroundImage) {
        gameBackgroundImage.src = '';
        gameBackgroundImage.style.display = 'none';
    }

    backgroundVideo = null;
    if (gameBackgroundVideo) {
        gameBackgroundVideo.src = '';
        gameBackgroundVideo.style.display = 'none';
    }

    updateTimeControlUI();
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
    //console.log(gameBackgroundVideo);
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
    if (renderer) {
        renderer.clearJudgeEffects();
        renderer.clearHitEffects();
    }
    const chartData = (rawdata && rawdata["inote_" + selectedDifficulty]) ||
        (rawdata && [7, 6, 5, 4, 3, 2, 1].map(d => rawdata["inote_" + d]).find(Boolean)) || "";
    datas = simaiDecode(chartData, 0);
    if (datas) {
        linkChainSlides(datas.notes);
        linkTouchGroups(datas.notes);
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

        // 拖拽/跳轉時完整重置 Note 音效播放、劃軌進度與遊玩 Hit/判定狀態記錄
        resetNotesForSeek(globalTime);
        if (renderer) {
            renderer.clearJudgeEffects();
            renderer.clearHitEffects();
        }

        videoSeekDebounce(realTime);

        if (playing) {
            const speed = settings.playbackSpeed || 1;
            startTime = performance.now() - (pausedTime * 1000 / speed);
            audioManager.stopAllLongSounds();
            audioManager.setPlaybackRate(speed);
            audioManager.playBGM(realTime);
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
        gameBackgroundVideo.playbackRate = speed;
    }
    if (gameBackgroundVideo.paused && gameBackgroundVideo.readyState >= 1) {
        gameBackgroundVideo.play().catch(() => { });
    }

    audioManager.setPlaybackRate(speed);
    audioManager.playBGM(realTime);
}

function restart() {
    pause();
    if (renderer) {
        renderer.clearJudgeEffects();
        renderer.clearHitEffects();
    }

    activePointers.clear();
    activeKeyboardSensors.clear();
    manualInputSensors.clear();
    simulatedPlayController.reset();

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
            n.chainFinished = false;
            n.hideStar = false;
            n._slideJudged = false;
            n._judgeEffectSpawned = false;
            n.unlocked = false;
            n.headTriggered = false;
            n.judgeQueue = null;
            n.judgeQueues = null;
            n._totalAreasCount = 0;
            n._checkedCps = null;
            n._holdPressed = false;
            n._releaseDuration = 0;
            n.judgeResult = null;
            n._headJudge = null;
            n._headMiss = false;
            n._missReported = false;
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
    if (renderer) {
        renderer.clearJudgeEffects();
        renderer.clearHitEffects();
    }

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

const saveSettingsDebounce = debounce(() => {
    idbSet('simai_settings', JSON.stringify(settings)).catch((error) => {
        console.error('儲存設定到 IndexedDB 失敗:', error);
    });
}, 300);

function setPlaybackSpeed(speed) {
    typeof speed === 'string' && (speed = parseFloat(speed));
    speed = clamp(speed, 0.01, 4); // 限制速度在 0.01x 到 4x 之間

    settings.playbackSpeed = speed;
    if (playbackSpeedInput) {
        playbackSpeedInput.value = speed.toFixed(2);
    }

    audioManager.setPlaybackRate(speed);
    if (playing) {
        startTime = performance.now() - (realTime * 1000 / speed);
        playStartTimestamp = performance.now();
        playStartRealTime = realTime;
        audioManager.playBGM(realTime);
    }
    if (gameBackgroundVideo && gameBackgroundVideo.src) {
        gameBackgroundVideo.playbackRate = speed;
    }
    saveSettingsDebounce();
}

// 根據目前 settings 初始化播放速度與 UI
setPlaybackSpeed(settings.playbackSpeed || 1);

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

    if (realTime < lastObservedTime - 0.05) {
        resetNotesForSeek(globalTime);
    }
    lastObservedTime = realTime;

    updateTimeControlUI();
    draw();
}

function forceFinishParentSlide(parent) {
    if (!parent) return;
    parent.slideFinish = true;
    parent.slideProgress = 1;
    if (parent.judgeQueues) {
        for (let i = 0; i < parent.judgeQueues.length; i++) {
            parent.judgeQueues[i].length = 0;
        }
    }
    parent.judgeQueue = [];
    if (parent.nextSlide) {
        parent.nextSlide.unlocked = true;
    }
    if (parent.prevSlide && !parent.prevSlide.slideFinish) {
        forceFinishParentSlide(parent.prevSlide);
    }
}

function finishSlideNote(note) {
    note.slideFinish = true;
    note.slideProgress = 1;
    if (note.judgeQueues) {
        for (let i = 0; i < note.judgeQueues.length; i++) {
            note.judgeQueues[i].length = 0;
        }
    }
    note.judgeQueue = [];
    if (note.nextSlide) {
        note.nextSlide.unlocked = true;
    }
    if (note.prevSlide && !note.prevSlide.slideFinish) {
        forceFinishParentSlide(note.prevSlide);
    }
    // 若該段為末段 (chainTail / lastSlide)，整條 chain 的星星全部不顯示，且標記整條 chain 完成
    if (note.lastSlide || !note.nextSlide) {
        note.hideStar = true;
        note.chainFinished = true;
        if (note.chainList) {
            for (let i = 0; i < note.chainList.length; i++) {
                const seg = note.chainList[i];
                seg.slideFinish = true;
                seg.hideStar = true;
                seg.chainFinished = true;
            }
        }
    }
}

/**
 * 電腦自動播放 (Computer Autoplay)
 * 就像譜面純播放展示一樣，無論如何全部音符結算為 CRITICAL_PERFECT (All Perfect)
 */
function updateComputerPlayState({ globalTime, notes, renderer, playing, timeControlSliding, dt = 0.016 }) {
    const compSensors = new Set();
    if (!playing || timeControlSliding || !notes) return compSensors;

    const notesLength = notes.length;
    for (let i = 0; i < notesLength; i++) {
        const note = notes[i];
        const noteT = note.time - globalTime;
        const noteType = note.type;

        // 音符在未來超過 0.5 秒，後面更靠後，提前退出搜尋
        if (noteT > 0.5) break;

        const isHold = (noteType === 'hold' || note.isHold || (noteType === 'touch' && ((note.holdDuration ?? 0) > 0 || note.isHold)));
        const holdDuration = note.holdDuration ?? 0;
        const slideDelay = note.slideDelay ?? 0;
        const slideDuration = note.slideDuration ?? 0;

        // 1. Tap & Star 音符 (非 Hold, 非 Slide, 非 Touch)
        if (!isHold && noteType === 'tap') {
            if (noteT <= 0) {
                if (!note.triggered) {
                    note.triggered = true;
                    note.triggeredTime = note.time;
                    note.judgeResult = {
                        grade: 'CRITICAL_PERFECT',
                        subGrade: '',
                        scoreMultiplier: 1.0,
                        breakMultiplier: 1.0,
                        breakScoreValue: note.isBreak ? 2600 : 0
                    };
                    spawnJudgeEffect(note, note.judgeResult);
                    audioManager.queueHitSound(note, globalTime, 'CRITICAL_PERFECT');
                    note._startEffectPlayed = true;
                }
                if (-noteT <= 0.06) {
                    compSensors.add('A' + note.pos);
                }
            }
        }
        // 2. Touch 音符 (非 TouchHold)
        else if (!isHold && noteType === 'touch') {
            if (noteT <= 0) {
                if (!note.triggered) {
                    note.triggered = true;
                    note.triggeredTime = note.time;
                    note.judgeResult = {
                        grade: 'CRITICAL_PERFECT',
                        subGrade: '',
                        scoreMultiplier: 1.0,
                        breakMultiplier: 1.0,
                        breakScoreValue: note.isBreak ? 2600 : 0
                    };
                    spawnJudgeEffect(note, note.judgeResult);
                    audioManager.queueHitSound(note, globalTime, 'CRITICAL_PERFECT');
                    note._startEffectPlayed = true;

                    if (note.isHanabi && !note._hanabiSoundPlayed) {
                        note._hanabiSoundPlayed = true;
                        audioManager.queueSoundSingle('hanabi', globalTime);
                        //renderer.triggerHanabiEffect(note, globalTime);
                    }
                }
                if (-noteT <= 0.06) {
                    const noteSensor = note.touchPos + note.pos;
                    const normSensor = (noteSensor === 'C1' || noteSensor === 'C2') ? 'C' : noteSensor;
                    compSensors.add(normSensor);
                }
            }
        }
        // 3. Hold & TouchHold 音符
        else if (isHold) {
            const rawSensor = noteType === 'touch' ? (note.touchPos + note.pos) : ('A' + note.pos);
            const sensorId = (rawSensor === 'C1' || rawSensor === 'C2') ? 'C' : rawSensor;

            if (noteT <= 0) {
                // 起手觸發
                if (!note.triggered) {
                    note.triggered = true;
                    note.triggeredTime = note.time;
                    note.isHolding = true;
                    note._holdPressed = true;
                    note._startEffectPlayed = true;
                    note._headJudge = {
                        grade: 'CRITICAL_PERFECT',
                        subGrade: '',
                        scoreMultiplier: 1.0,
                        breakMultiplier: 1.0,
                        breakScoreValue: note.isBreak ? 2600 : 0
                    };
                    audioManager.queueHitSound(note, globalTime, 'CRITICAL_PERFECT');
                }

                // 長按期間
                if (globalTime < note.time + holdDuration) {
                    note.isHolding = true;
                    compSensors.add(sensorId);
                } else {
                    note.isHolding = false;
                    // 結束結算
                    if (!note.holdFinish) {
                        note.holdFinish = true;
                        note.judgeResult = {
                            grade: 'CRITICAL_PERFECT',
                            subGrade: '',
                            scoreMultiplier: 1.0,
                            breakMultiplier: 1.0,
                            breakScoreValue: note.isBreak ? 2600 : 0
                        };
                        spawnJudgeEffect(note, note.judgeResult);

                        if (!settings.notPlayHoldEnd && noteType !== 'tap') {
                            const soundKey = note.isBreak ? 'judge_break' : (note.isEx ? 'judge_ex' : 'judge');
                            audioManager.queueSoundSingle(soundKey, globalTime);
                        }

                        if (note.isHanabi && !note._hanabiSoundPlayed) {
                            note._hanabiSoundPlayed = true;
                            audioManager.queueSoundSingle('hanabi', globalTime);
                            //renderer.triggerHanabiEffect(note, globalTime);
                        }
                    }
                    if (-noteT - holdDuration <= 0.04) {
                        compSensors.add(sensorId);
                    }
                }
            }
        }
        // 4. Slide 音符
        else if (noteType === 'slide') {
            // A. 頭部 Tap/Star 點擊
            const isHead = note.firstSlide || !note.prevSlide;
            if (isHead && noteT <= 0) {
                if (!note.triggered) {
                    note.triggered = true;
                    note.headTriggered = true;
                    note.triggeredTime = note.time;
                    note._startEffectPlayed = true;
                    audioManager.queueHitSound(note, globalTime, 'CRITICAL_PERFECT');
                }
                if (-noteT <= 0.06) {
                    compSensors.add('A' + note.pos);
                }
            }

            // B. 劃軌軌跡推進與結算
            const startTiming = note.time + slideDelay;
            const endTiming = startTiming + slideDuration;

            if (globalTime >= startTiming) {
                note.slideStart = true;
                const p = slideDuration > 0 ? Math.min(1, Math.max(0, (globalTime - startTiming) / slideDuration)) : 1;
                note.slideProgress = p;

                // Slide 啟動音效：第一個步驟剛完成時播放
                const leader = note.chainLeader || note;
                const firstStepRatio = 1 / Math.max(2, (note._totalAreasCount || 4));
                if (!leader._slideStartPlayed && !leader.isMine && (p >= firstStepRatio || slideDuration === 0)) {
                    leader._slideStartPlayed = true;
                    audioManager.queueSound(leader, globalTime, { includeAnswer: false });
                    const chainList = leader.chainList || [leader];
                    for (let k = 0; k < chainList.length; k++) {
                        chainList[k]._slideStartPlayed = true;
                        chainList[k]._startEffectPlayed = true;
                    }
                }

                // 滑動過程中的感應區反饋：僅在劃軌期間以及到達終點後的短暫停留窗口內高亮，逾期徹底放手不殘留
                const touchHoldEnd = (note.lastSlide || !note.nextSlide) ? 0.08 : 0.02;
                if (globalTime <= endTiming + touchHoldEnd) {
                    if (!note.judgeQueue && !note.judgeQueues) {
                        const baseQueue = getSlideJudgeQueue(note, renderer);
                        note.tableConst = baseQueue.tableConst ?? 0.18;
                        note.judgeQueue = baseQueue.map(a => a.clone());
                        note.judgeQueues = [note.judgeQueue];
                        note._totalAreasCount = note.judgeQueue.length;
                        note._fullJudgeQueue = baseQueue.map(a => a.clone());
                        note._fullJudgeQueues = [note._fullJudgeQueue];
                    }
                    const fullQ = note._fullJudgeQueue || (note._fullJudgeQueues ? note._fullJudgeQueues[0] : null);
                    if (fullQ && fullQ.length > 0) {
                        const stepIndex = Math.min(fullQ.length - 1, Math.floor(p * (fullQ.length - 1)));
                        const curArea = fullQ[stepIndex];
                        if (curArea && curArea.areas) {
                            for (let s = 0; s < curArea.areas.length; s++) {
                                compSensors.add(curArea.areas[s]);
                            }
                        }
                    } else {
                        const currentPos = (p > 0.5) ? (note.slideEnd || note.pos) : note.pos;
                        compSensors.add('A' + currentPos);
                    }
                }

                // 到達結尾時刻，結算劃軌
                if (globalTime >= endTiming) {
                    note.slideProgress = 1.0;
                    if (!note.slideFinish) {
                        finishSlideNote(note);
                        note._slideJudged = true;
                        note.judgeResult = {
                            grade: 'CRITICAL_PERFECT',
                            subGrade: '',
                            scoreMultiplier: 1.0,
                            breakMultiplier: 1.0,
                            breakScoreValue: note.isBreak ? 2600 : 0
                        };
                        const isGroupPartEnd = note.lastSlide || !note.nextSlide;
                        if (isGroupPartEnd) {
                            spawnJudgeEffect(note, note.judgeResult);
                            if (note.isBreak && !note._endEffectPlayed) {
                                note._startEffectPlayed = true;
                                audioManager.queueSound(note, globalTime, { includeAnswer: false, grade: 'CRITICAL_PERFECT' });
                                note._endEffectPlayed = true;
                            }
                        }
                    }
                }
            }
        }
    }

    return compSensors;
}

function updateManualPlayState({ globalTime, notes, renderer, playing, timeControlSliding, dt = 0.016, sensors = null }) {
    if (!playing || timeControlSliding) return;

    const currentSensors = sensors || manualInputSensors;
    if (!currentSensors) return;

    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const noteT = note.time - globalTime;
        const noteType = note.type;
        const isHold = (note.holdDuration > 0 || note.isHold || noteType === 'hold');

        // 1. Hold & TouchHold 按壓與結算判定
        // （註：Touch 音符與 Tap 一樣必須由玩家在窗口內主動按下 pointerdown/keydown 或剛劃入 newlyAdded 觸發，不支援按住自動判定）
        if (isHold) {
            const rawSensorId = noteType === 'touch' ? (note.touchPos + note.pos) : ('A' + note.pos);
            const sensorId = (rawSensorId === 'C1' || rawSensorId === 'C2') ? 'C' : rawSensorId;
            const isSensorPressed = currentSensors.has(sensorId);

            if (noteT <= 0.05 && -noteT <= note.holdDuration) {
                // 支援任意時刻中途補按/續按：只要在 Hold 持續時間內按壓即可生效長按，非必須起手擊中
                if (isSensorPressed) {
                    note.isHolding = true;
                    note._holdPressed = true;
                    note._waitReleaseSec = 0; // 重置放手計時

                    // 補齊 Hold 音符到達瞬間的起手打擊音效與提前按壓判定 (音符已到達 noteT <= 0 且尚未播放過開頭音效)
                    if (noteT <= 0 && !note._startEffectPlayed) {
                        if (!note.triggered) {
                            note.triggered = true;
                            note.triggeredTime = globalTime;
                            note._headJudge = {
                                grade: 'CRITICAL_PERFECT',
                                subGrade: '',
                                isFast: false,
                                diffMSec: 0,
                                scoreMultiplier: 1.0,
                                breakMultiplier: 1.0,
                                breakScoreValue: note.isBreak ? 2600 : 0
                            };
                        }
                        const headGrade = note._headJudge?.grade || 'CRITICAL_PERFECT';
                        audioManager.queueHitSound(note, globalTime, headGrade);
                        note._startEffectPlayed = true;
                    }
                } else {
                    note.isHolding = false;
                    // 墨滢專欄 鬆手等待容錯: RELEASE_IGNORE_SEC = 3 * FRAME_SEC (約 50ms 鬆開等待保護)
                    if (note._holdPressed) {
                        if ((note._waitReleaseSec || 0) <= JUDGE_WINDOWS.HOLD.RELEASE_IGNORE_SEC) {
                            note._waitReleaseSec = (note._waitReleaseSec || 0) + dt;
                        } else {
                            note._releaseDuration = (note._releaseDuration || 0) + dt;
                        }
                    } else {
                        // 尚未按壓過時，流逝時間直接計入 releaseDuration
                        note._releaseDuration = (note._releaseDuration || 0) + dt;
                    }
                }
            } else if (-noteT > note.holdDuration) {
                note.isHolding = false;
                if (!note.holdFinish) {
                    note.holdFinish = true;
                    if (note._holdPressed || note.triggered) {
                        // 墨滢專欄：Hold / Touch-Hold 按壓判定忽略開頭與結尾
                        // 普通 Hold：開頭忽略 6 幀 (0.10s)，結尾提前放開忽略 12 幀 (0.20s)，合計 18 幀 (0.30s)
                        // Touch-Hold：開頭忽略 15 幀 (0.25s)，結尾提前放開忽略 12 幀 (0.20s)，合計 27 幀 (0.45s)
                        const headIgnoreSec = (noteType === 'touch')
                            ? JUDGE_WINDOWS.HOLD.TOUCH_HEAD_IGNORE_SEC
                            : JUDGE_WINDOWS.HOLD.HEAD_IGNORE_SEC;
                        const tailIgnoreSec = JUDGE_WINDOWS.HOLD.TAIL_IGNORE_SEC;
                        const totalIgnoreSec = headIgnoreSec + tailIgnoreSec;

                        // 墨滢專欄規範：若總時長不足忽略幀數 (Hold <= 18 幀, Touch-Hold <= 27 幀)，
                        // 按壓判定直接忽略，最終判定完全取決於頭部判定！
                        const isShortHold = note.holdDuration <= totalIgnoreSec;
                        const realityHT = Math.max(0, note.holdDuration - totalIgnoreSec);
                        const release = note._releaseDuration || 0;
                        const pressRatio = isShortHold ? (note._holdPressed ? 1.0 : 0) : Math.max(0, Math.min(1, (realityHT - release) / realityHT));

                        // 階梯降級邏輯 (參照墨滢專欄 & MajdataPlay NoteLongDrop.HoldEndJudge)
                        const headGrade = note._headJudge ? note._headJudge.grade : (note._headMiss ? 'MISS' : 'MISS');
                        let finalGrade = headGrade;
                        let finalScoreMult = 1.0;

                        if (isShortHold) {
                            // 短 Hold：按壓判定被忽略，最終判定完全取決於頭部判定
                            finalGrade = headGrade;
                            finalScoreMult = (headGrade === 'CRITICAL_PERFECT' || headGrade === 'PERFECT') ? 1.0 : (headGrade === 'GREAT' ? 0.8 : (headGrade === 'GOOD' ? 0.5 : 0));
                        } else if (pressRatio >= 1.0) {
                            if (headGrade === 'MISS') {
                                finalGrade = 'GOOD';
                                finalScoreMult = 0.5;
                            } else if (headGrade === 'GOOD') {
                                finalGrade = 'GREAT';
                                finalScoreMult = 0.8;
                            } else {
                                finalGrade = headGrade;
                                finalScoreMult = (headGrade === 'CRITICAL_PERFECT' || headGrade === 'PERFECT') ? 1.0 : 0.8;
                            }
                        } else if (pressRatio >= 0.67) {
                            if (headGrade === 'CRITICAL_PERFECT') {
                                finalGrade = 'PERFECT';
                                finalScoreMult = 1.0;
                            } else if (headGrade === 'MISS') {
                                finalGrade = 'GOOD';
                                finalScoreMult = 0.5;
                            } else if (headGrade === 'GOOD') {
                                finalGrade = 'GREAT';
                                finalScoreMult = 0.8;
                            } else {
                                finalGrade = headGrade;
                                finalScoreMult = (headGrade === 'PERFECT') ? 1.0 : 0.8;
                            }
                        } else if (pressRatio >= 0.33) {
                            if (headGrade === 'MISS') {
                                finalGrade = 'GOOD';
                                finalScoreMult = 0.5;
                            } else {
                                finalGrade = 'GREAT';
                                finalScoreMult = 0.8;
                            }
                        } else if (pressRatio >= 0.05) {
                            finalGrade = 'GOOD';
                            finalScoreMult = 0.5;
                        } else {
                            if (headGrade === 'MISS') {
                                finalGrade = 'MISS';
                                finalScoreMult = 0;
                            } else {
                                finalGrade = 'GOOD';
                                finalScoreMult = 0.5;
                            }
                        }

                        let breakMult = 0;
                        let breakScoreValue = 0;
                        if (note.isBreak) {
                            if (finalGrade === 'CRITICAL_PERFECT') {
                                breakMult = 1.0;
                                breakScoreValue = 2600;
                            } else if (finalGrade === 'PERFECT') {
                                breakMult = note._headJudge?.breakMultiplier ?? 0.75;
                                breakScoreValue = (breakMult === 0.5) ? 2500 : 2550;
                            } else if (finalGrade === 'GREAT') {
                                breakMult = 0.4;
                                breakScoreValue = (finalScoreMult <= 0.5) ? 1250 : ((finalScoreMult <= 0.6) ? 1500 : 2000);
                            } else if (finalGrade === 'GOOD') {
                                breakMult = 0.3;
                                breakScoreValue = 1000;
                            } else {
                                breakMult = 0;
                                breakScoreValue = 0;
                            }
                        }

                        // 注意：墨滢專欄明確說明 Ex 保護僅作用於頭部判定；
                        // 若後續完全不按壓或按壓不足，最終判定依然正常降級，不被 Ex 強制變回 CP！

                        note.judgeResult = {
                            grade: finalGrade,
                            subGrade: '',
                            scoreMultiplier: finalScoreMult,
                            breakMultiplier: breakMult,
                            breakScoreValue: breakScoreValue
                        };
                        spawnJudgeEffect(note, note.judgeResult);

                        // 結算音效 (手動遊玩結尾音效)
                        if (!settings.notPlayHoldEnd && noteType !== 'tap' && finalGrade !== 'MISS') {
                            const soundKey = note.isBreak ? 'judge_break' : (note.isEx ? 'judge_ex' : 'judge');
                            audioManager.queueSoundSingle(soundKey, globalTime);
                        }

                        // TouchHold Hanabi 結算音效：成功按壓結算且非 MISS 時播放
                        if (note.isHanabi && finalGrade !== 'MISS' && !note._hanabiSoundPlayed) {
                            note._hanabiSoundPlayed = true;
                            audioManager.queueSoundSingle('hanabi', globalTime);
                        }
                    } else {
                        // 全程未曾按壓
                        note.judgeResult = { grade: 'MISS', subGrade: '', scoreMultiplier: 0, breakMultiplier: 0, breakScoreValue: 0 };
                        if (!note._missReported) {
                            note._missReported = true;
                            spawnJudgeEffect(note, note.judgeResult);
                        }
                    }
                }
            }
        }

        // 3. 一般 Tap 音符超時判定 (超過 9 幀 / 150ms)
        if (!isHold && noteType === 'tap' && !note.triggered) {
            if (-noteT > JUDGE_WINDOWS.TAP.GOOD) {
                note.triggered = true;
                note.triggeredTime = globalTime;
                note.judgeResult = {
                    grade: 'MISS',
                    subGrade: '',
                    isFast: false,
                    diffMSec: Math.round(-noteT * 1000 * 10) / 10,
                    scoreMultiplier: 0,
                    breakMultiplier: 0,
                    breakScoreValue: 0
                };
                spawnJudgeEffect(note, note.judgeResult);
            }
        }

        // 4. 一般 Touch 音符超時判定 (超過 18 幀 / 300ms, Too Late)
        if (!isHold && noteType === 'touch' && !note.triggered) {
            if (-noteT > JUDGE_WINDOWS.TOUCH.GOOD_LATE) {
                note.triggered = true;
                note.triggeredTime = globalTime;
                note.judgeResult = {
                    grade: 'MISS',
                    subGrade: 'LATE',
                    isFast: false,
                    diffMSec: Math.round(-noteT * 1000 * 10) / 10,
                    scoreMultiplier: 0,
                    breakMultiplier: 0,
                    breakScoreValue: 0
                };
                spawnJudgeEffect(note, note.judgeResult);
            }
        }

        // 2. Slide 劃軌判定 (移植 MajdataPlay SlideTables & SlideArea 狀態機)
        if (noteType === 'slide') {
            const slideDelay = note.slideDelay ?? 0;
            const slideDuration = note.slideDuration ?? 0;
            const isConnPart = !!(note.prevSlide || note.nextSlide);
            const isGroupPartHead = note.firstSlide || !note.prevSlide;
            const isGroupPartEnd = note.lastSlide || !note.nextSlide;
            const startTiming = note.time + slideDelay;
            const arriveTiming = startTiming + slideDuration;

            // 尚未建立隊列時，從 slidetables 取得標準 SlideArea 隊列
            if (!note.judgeQueue && !note.judgeQueues) {
                const baseQueue = getSlideJudgeQueue(note, renderer);
                note.tableConst = baseQueue.tableConst ?? (note.tableConst || 0.18);
                note._debugMeta = baseQueue._debugMeta || note._debugMeta;
                if (baseQueue.isWifi && baseQueue.branches) {
                    note.isWifi = true;
                    note.judgeQueues = [
                        baseQueue.branches.left.map(a => a.clone()),
                        baseQueue.branches.center.map(a => a.clone()),
                        baseQueue.branches.right.map(a => a.clone())
                    ];
                    note.judgeQueue = note.judgeQueues[1];
                    note._totalAreasCount = 4;
                    note._fullJudgeQueue = baseQueue.branches.center.map(a => a.clone());
                } else {
                    note.isWifi = false;
                    note.judgeQueue = baseQueue.map(a => a.clone());
                    note.judgeQueues = [note.judgeQueue];
                    note._totalAreasCount = note.judgeQueue.length;
                    note._fullJudgeQueue = baseQueue.map(a => a.clone());
                }
            }

            // 計算 MajdataPlay 官方基準判定時機與最後等待時間
            const tableConst = note.tableConst ?? 0.18;
            const lastWaitTimeSec = slideDuration * tableConst;
            const judgeTiming = startTiming + slideDuration * (1 - tableConst);
            note.lastWaitTimeSec = lastWaitTimeSec;
            note.judgeTiming = judgeTiming;

            // 檢查是否可進入判定 (IsCheckable)
            // MajdataPlay 規範：只要到達 note.time - 0.05s (即頭部 star 擊打前 50ms 起) 即可開始劃動判定
            let isCheckable = false;
            const isHeadTriggered = !!(note.headNote?.triggered || note.headTriggered);
            const isNoteTimeReached = (globalTime >= note.time - 0.05);
            const canSlideHead = note.hideHead ? isNoteTimeReached : (isHeadTriggered || isNoteTimeReached);

            if (isConnPart) {
                if (isGroupPartHead) {
                    if (canSlideHead || note.unlocked) {
                        isCheckable = true;
                        note.unlocked = true;
                    }
                } else {
                    // 連鎖 Slide 的後續段：在前一段判定完成，或前段已劃至終點 (隊列剩 <=1 且已摸到終點) 時解鎖進入判定
                    const parentFinished = note.prevSlide ? !!note.prevSlide.slideFinish : true;
                    const prevQueues = note.prevSlide ? (note.prevSlide.judgeQueues || (note.prevSlide.judgeQueue ? [note.prevSlide.judgeQueue] : [])) : [];
                    const parentReachedEnd = prevQueues.length > 0 && Math.max(...prevQueues.map(q => q.length)) <= 1 && prevQueues.every(q => q.length === 0 || q[0]?.on);
                    if (parentFinished || parentReachedEnd || note.unlocked) {
                        isCheckable = true;
                        note.unlocked = true;
                    }
                }
            } else {
                // 獨立 Slide
                if (canSlideHead || note.unlocked) {
                    isCheckable = true;
                    note.unlocked = true;
                }
            }

            if (!isCheckable) {
                if (!note.slideFinish) {
                    note.slideProgress = 0;
                }
            } else {
                if (!note.judgeQueues && !note.judgeQueue) {
                    const baseQueue = getSlideJudgeQueue(note, renderer);
                    note.tableConst = baseQueue.tableConst ?? (note.tableConst || 0.18);
                    if (baseQueue.isWifi && baseQueue.branches) {
                        note.isWifi = true;
                        note.judgeQueues = [
                            baseQueue.branches.left.map(a => a.clone()),
                            baseQueue.branches.center.map(a => a.clone()),
                            baseQueue.branches.right.map(a => a.clone())
                        ];
                        note.judgeQueue = note.judgeQueues[1];
                        note._totalAreasCount = 4;
                        note._fullJudgeQueues = [
                            baseQueue.branches.left.map(a => a.clone()),
                            baseQueue.branches.center.map(a => a.clone()),
                            baseQueue.branches.right.map(a => a.clone())
                        ];
                    } else {
                        note.isWifi = false;
                        note.judgeQueue = baseQueue.map(a => a.clone());
                        note.judgeQueues = [note.judgeQueue];
                        note._totalAreasCount = note.judgeQueue.length;
                        note._fullJudgeQueues = [baseQueue.map(a => a.clone())];
                    }
                }
                const queues = note.judgeQueues || (note.judgeQueue ? [note.judgeQueue] : []);
                const hasRemaining = queues.some(q => q.length > 0);
                if (!note.slideFinish) {
                    if (hasRemaining) {
                        for (let x = 0; x < queues.length; x++) {
                            const queue = queues[x];
                            while (queue.length > 0) {
                                const first = queue[0];
                                const second = queue.length >= 2 ? queue[1] : null;

                                first.check(currentSensors);

                                let consumed = 0;
                                // 參照 MajdataPlay SlideBase.cs lines 305-340:
                                // 1. 若 first 已經完成 (first.isFinished: 已劃進並離開)，first 確定消耗；若 second 同時已完成則 consumed = 2
                                // 2. 若 first 尚未完成但允許略過 (first.isSkippable)，且玩家直接觸發了 second，則略過 first 推進
                                // 3. 不可略過區 (first.isSkippable === false) 絕不能因 second.on 被跳過
                                if (first.isFinished) {
                                    consumed = 1;
                                    if (second) {
                                        second.check(currentSensors);
                                        if (second.isFinished) {
                                            consumed = 2;
                                        }
                                    }
                                } else if (first.isSkippable && second) {
                                    second.check(currentSensors);
                                    if (second.isFinished) {
                                        consumed = 2;
                                    } else if (second.on) {
                                        consumed = 1;
                                    }
                                }

                                if (consumed > 0) {
                                    // Slide 開頭音效：第一個感應器剛被完成時播放
                                    const leader = note.chainLeader || note;
                                    if (!leader._slideStartPlayed && !leader.isMine) {
                                        leader._slideStartPlayed = true;
                                        // 呼叫時 leader._startEffectPlayed 需為 false，讓 audioManager 識別為開頭 (break_slide_start / slide)
                                        audioManager.queueSound(leader, globalTime, { includeAnswer: false });
                                        const chainList = leader.chainList || [leader];
                                        for (let k = 0; k < chainList.length; k++) {
                                            chainList[k]._slideStartPlayed = true;
                                            chainList[k]._startEffectPlayed = true;
                                        }
                                    }

                                    queue.splice(0, consumed);
                                    if (note.prevSlide && !note.prevSlide.slideFinish) {
                                        forceFinishParentSlide(note.prevSlide);
                                    }
                                    continue;
                                }

                                if (first.on) {
                                    if (note.prevSlide && !note.prevSlide.slideFinish) {
                                        forceFinishParentSlide(note.prevSlide);
                                    }
                                }
                                break;
                            }
                        }
                    }

                    const queueRemaining = queues.length > 0 ? Math.max(...queues.map(q => q.length)) : 0;

                    // 實時更新滑條視覺進度 (依已放開感應區比例更新，放開時 track 箭頭才消失)
                    if (note._totalAreasCount > 0) {
                        const finishedCount = note._totalAreasCount - queueRemaining;
                        note.slideProgress = Math.min(1, Math.max(note.slideProgress || 0, finishedCount / note._totalAreasCount));
                    }

                    // 若隊列清空，標記本段完成 (在感應區放開後正式清空觸發)
                    if (queueRemaining === 0) {
                        finishSlideNote(note);

                        // 僅在最後一段結算總評級 (以 MajdataPlay 官方 judgeTiming 基準計算放開當下的時間差)
                        if (isGroupPartEnd && !note._slideJudged) {
                            note._slideJudged = true;
                            const isAuto = getAutoPlayMode() !== 'off';
                            const diffSec = (isAuto && (settings.simplayPerfect ?? true)) ? 0 : (globalTime - judgeTiming);
                            note.judgeResult = evaluateSlideGrade(diffSec, note);

                            // Break Slide 結尾判定音效：判定成功時 (非 MISS) 立即播放結尾判定音效 (judge_break_slide + break_slide)
                            if (note.isBreak && !note._endEffectPlayed && note.judgeResult.grade !== 'MISS') {
                                note._startEffectPlayed = true;
                                const soundGrade = note.judgeResult.grade;
                                audioManager.queueSound(note, globalTime, { includeAnswer: false, grade: soundGrade });
                                note._endEffectPlayed = true;
                            }
                        }
                    }
                }
            }

            // 判定特效顯示：在 slideDelay 後顯示 (若提前完成，等待至超過 slideDelay 時觸發顯示)
            if (isGroupPartEnd && note._slideJudged && !note._judgeEffectSpawned) {
                const minDelayTiming = (note.chainLeader || note).time + ((note.chainLeader || note).slideDelay ?? 0);
                if (globalTime >= minDelayTiming) {
                    note._judgeEffectSpawned = true;
                    spawnJudgeEffect(note, note.judgeResult);
                }
            }

            // 超時判定 (TooLateJudge - 600ms 寬容窗口: StartTiming + Length + 0.60s)
            // 連鎖 Slide 的前段需以整條 chain 末段的時間為準，否則後段尚在進行時前段就會提早讓整條 MISS
            const chainTail = note.chainTail || note;
            const tailStartTiming = chainTail.time + (chainTail.slideDelay ?? 0);
            const tailDuration = chainTail.slideDuration ?? 0;
            const ownTooLate = startTiming + slideDuration + JUDGE_WINDOWS.SLIDE.GOOD_AREA_SEC;
            const tailTooLate = tailStartTiming + tailDuration + JUDGE_WINDOWS.SLIDE.GOOD_AREA_SEC;
            const tooLateTiming = (chainTail === note || isGroupPartEnd) ? ownTooLate : Math.max(ownTooLate, tailTooLate);
            if (globalTime > tooLateTiming && !note.slideFinish) {
                const tail = chainTail;
                const isTail = (note === tail || isGroupPartEnd);

                if (isTail) {
                    // 末段超時：進行最終判定與 MISS / LATE GOOD 結算
                    if (!note._slideJudged) {
                        note._slideJudged = true;
                        const queues = note.judgeQueues || (note.judgeQueue ? [note.judgeQueue] : []);
                        const queueRemaining = queues.length > 0 ? Math.max(...queues.map(q => q.length)) : 0;
                        const allParentsFinished = !note.prevSlide || note.prevSlide.slideFinish;

                        // 參照 MajdataPlay SlideBase.cs lines 639-646:
                        // 僅在前置段落全部完成且末段只剩最後 1 區未完成時，給予 LATE GOOD 保底；其餘一律判定為 MISS
                        if (allParentsFinished && queueRemaining === 1) {
                            note.judgeResult = {
                                grade: 'GOOD',
                                subGrade: 'LATE',
                                isFast: false,
                                diffMSec: 600,
                                scoreMultiplier: note.isBreak ? 0.4 : 0.5,
                                breakMultiplier: note.isBreak ? 0.3 : 0,
                                breakScoreValue: note.isBreak ? 1000 : 0
                            };
                            if (note.isBreak && !note._endEffectPlayed) {
                                note._startEffectPlayed = true;
                                audioManager.queueSound(note, globalTime, { includeAnswer: false, grade: 'GOOD' });
                                note._endEffectPlayed = true;
                            }
                        } else {
                            note.judgeResult = {
                                grade: 'MISS',
                                subGrade: '',
                                isFast: false,
                                diffMSec: 600,
                                scoreMultiplier: 0,
                                breakMultiplier: 0,
                                breakScoreValue: 0
                            };
                        }
                        note._judgeEffectSpawned = true;
                        spawnJudgeEffect(note, note.judgeResult);
                    }
                    finishSlideNote(note);
                } else {
                    // 非末段 (連鎖 Slide 前段) 超時：說明玩家連前置段都未在時限內劃完，整條 chain slide 確定 MISS
                    if (!tail._slideJudged) {
                        tail._slideJudged = true;
                        tail.judgeResult = {
                            grade: 'MISS',
                            subGrade: '',
                            isFast: false,
                            diffMSec: 600,
                            scoreMultiplier: 0,
                            breakMultiplier: 0,
                            breakScoreValue: 0
                        };
                        tail._judgeEffectSpawned = true;
                        spawnJudgeEffect(tail, tail.judgeResult);
                    }
                    finishSlideNote(tail);
                    finishSlideNote(note);
                }

                if (note.judgeQueues) {
                    for (let i = 0; i < note.judgeQueues.length; i++) {
                        note.judgeQueues[i].length = 0;
                    }
                }
                note.judgeQueue = [];
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

    const autoMode = getAutoPlayMode();

    if (autoMode === 'computer') {
        // 電腦模式：就像譜面播放展示一樣，無論如何 All Perfect
        simulatedPlayController.reset();
        const compSensors = updateComputerPlayState({ globalTime, notes, renderer, playing, timeControlSliding, dt });
        activeSensors = new Set(compSensors);
        for (const s of manualInputSensors) {
            activeSensors.add(s);
        }
    } else if (autoMode === 'simulate') {
        // 模擬模式：使用 SimulatedPlay 模擬玩家感應器觸發狀態，並透過 triggerManualHit 觸發打擊
        simulatedPlayController.update({
            globalTime,
            notes,
            renderer,
            playing,
            timeControlSliding,
            onHit: triggerManualHit,
            forcePerfect: settings.simplayPerfect ?? true,
            randomOffset: (Math.random() - 0.5) * settings.randomOffset * 2,
        });
        activeSensors = new Set(simulatedPlayController.activeSensors);
        for (const s of manualInputSensors) {
            activeSensors.add(s);
        }
        updateManualPlayState({ globalTime, notes, renderer, playing, timeControlSliding, dt, sensors: activeSensors });
    } else {
        // 手動模式：使用玩家鍵盤/觸控實時按壓 Sensor
        simulatedPlayController.reset();
        activeSensors = manualInputSensors;
        updateManualPlayState({ globalTime, notes, renderer, playing, timeControlSliding, dt, sensors: activeSensors });
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
    let lostScore = 0;
    let slideOnScreenCount = 0;
    let foundIndexForThisFrame = false;

    // 正序 (0 ~ notesLength-1) 統計 Combo 與 Score (自動與手動完全統一判定標準)
    for (let i = 0; i < notesLength; i++) {
        const note = notes[i];
        const noteT = note.time - globalTime;
        const noteType = note.type;
        const isHold = (noteType === 'hold' || note.isHold || (noteType === 'touch' && ((note.holdDuration ?? 0) > 0 || note.isHold)));
        const holdDuration = note.holdDuration ?? 0;
        const slideDelay = note.slideDelay ?? 0;
        const slideDuration = note.slideDuration ?? 0;
        const skipT = holdDuration + slideDuration + slideDelay + (note.cullSkipExtend ?? 0);

        const isTouch = (noteType === 'touch');
        const lateJudgeWindow = isTouch ? JUDGE_WINDOWS.TOUCH.GOOD : JUDGE_WINDOWS.TAP.GOOD;

        // 如果 note 還在判定視窗之後的未來，後續 note 都在更遠的未來，結束檢查
        if (noteT > lateJudgeWindow) break;

        // 依據 MajdataPlay 判定標準評分與統計 Combo (自動與手動完全統一判定標準)
        if (noteType === 'slide') {
            const isGroupPartEnd = note.lastSlide || !note.nextSlide;
            if (!isGroupPartEnd) continue;

            const startTiming = note.time + slideDelay;
            const minDelayTiming = (note.chainLeader || note).time + ((note.chainLeader || note).slideDelay ?? 0);
            const tooLateTiming = startTiming + slideDuration + (JUDGE_WINDOWS.SLIDE?.GOOD_AREA_SEC ?? 0.6);

            // 若尚未結算且尚未超時，說明仍處於滑動中或終點放開判定等待窗口，繼續等待判定，絕不提前斷連
            if (!note.slideFinish && !note._slideJudged && globalTime <= tooLateTiming) {
                continue;
            }
            // 若已滑動完成但尚未到達 slideDelay，繼續等待至超過 slideDelay 後才結算顯示
            if (note.slideFinish && globalTime < minDelayTiming) {
                continue;
            }

            const baseW = note.isBreak ? 5 : 3;
            const maxNoteScore = (baseW * (playScoreRes.invScore || 0) * 100) + (note.isBreak ? (playScoreRes.breakScore || 0) : 0);

            const isHit = (note.judgeResult && note.judgeResult.grade !== 'MISS') || (note.slideFinish && (!note.judgeResult || note.judgeResult.grade !== 'MISS'));
            if (isHit) {
                const mult = note.judgeResult?.scoreMultiplier ?? 1.0;
                const breakMult = note.isBreak ? (note.judgeResult?.breakMultiplier ?? (note.judgeResult?.grade === 'CRITICAL_PERFECT' ? 1.0 : (note.judgeResult?.grade === 'PERFECT' ? 0.75 : 0.4))) : 0;
                if (note.isBreak) noteQuantity.break++;
                else noteQuantity.slide++;
                playCombo++;
                const earnedScore = ((note.isBreak ? 5 : 3) * mult) * (playScoreRes.invScore || 0) * 100 + (note.isBreak ? (playScoreRes.breakScore || 0) * breakMult : 0);
                playScore += earnedScore;
                lostScore += (maxNoteScore - earnedScore);
            } else {
                playCombo = 0;
                lostScore += maxNoteScore;
            }
        } else if (isHold) {
            const holdEndT = holdDuration + noteT;

            // 若音符尚未被觸發且未被按壓
            if (!note.triggered && !note._holdPressed && !note.isHolding) {
                // 若仍在起手有效判定窗口內，繼續等待判定
                if (noteT >= -lateJudgeWindow) {
                    continue;
                }
                // 超過起手晚判定視窗仍未觸發，標記起手頭部 MISS（但不立即結算或彈出 MISS 特效，等待 Hold 結束結算）
                if (!note._headMiss) {
                    note._headMiss = true;
                    note._headJudge = { grade: 'MISS', subGrade: '', scoreMultiplier: 0, breakMultiplier: 0 };
                }
                // 若 Hold 仍在進行中 (holdEndT > 0)，允許玩家隨時中途補按續按，此時 Combo 暫時中斷但等待後續補按或結算
                if (holdEndT > 0 && !note.holdFinish) {
                    playCombo = 0;
                    continue;
                }
                playCombo = 0;
                const baseW = note.isBreak ? 5 : 2;
                const maxNoteScore = (baseW * (playScoreRes.invScore || 0) * 100) + (note.isBreak ? (playScoreRes.breakScore || 0) : 0);
                lostScore += maxNoteScore;
                continue;
            }

            // 音符已被觸發或正在長按，若 Hold 尚未結束，繼續等待長按完成
            if (holdEndT > 0 && !note.holdFinish) {
                continue;
            }

            const baseW = note.isBreak ? 5 : 2;
            const maxNoteScore = (baseW * (playScoreRes.invScore || 0) * 100) + (note.isBreak ? (playScoreRes.breakScore || 0) : 0);

            // Hold 已結束結算
            const isHit = (note.judgeResult && note.judgeResult.grade !== 'MISS') || (note.holdFinish && (!note.judgeResult || note.judgeResult.grade !== 'MISS'));
            if (isHit) {
                const mult = note.judgeResult?.scoreMultiplier ?? 1.0;
                const breakMult = note.isBreak ? (note.judgeResult?.breakMultiplier ?? (note.judgeResult?.grade === 'CRITICAL_PERFECT' ? 1.0 : (note.judgeResult?.grade === 'PERFECT' ? 0.75 : 0.4))) : 0;
                if (note.isBreak) noteQuantity.break++;
                else noteQuantity.hold++;
                playCombo++;
                const earnedScore = ((note.isBreak ? 5 : 2) * mult) * (playScoreRes.invScore || 0) * 100 + (note.isBreak ? (playScoreRes.breakScore || 0) * breakMult : 0);
                playScore += earnedScore;
                lostScore += (maxNoteScore - earnedScore);
            } else {
                playCombo = 0;
                lostScore += maxNoteScore;
            }
        } else {
            // Tap / Star / Touch
            const baseW = note.isBreak ? 5 : 1;
            const maxNoteScore = (baseW * (playScoreRes.invScore || 0) * 100) + (note.isBreak ? (playScoreRes.breakScore || 0) : 0);

            if (note.triggered) {
                const mult = note.judgeResult?.scoreMultiplier ?? 1.0;
                const breakMult = note.isBreak ? (note.judgeResult?.breakMultiplier ?? (note.judgeResult?.grade === 'CRITICAL_PERFECT' ? 1.0 : (note.judgeResult?.grade === 'PERFECT' ? 0.75 : 0.4))) : 0;
                if (note.judgeResult && note.judgeResult.grade === 'MISS') {
                    playCombo = 0;
                    lostScore += maxNoteScore;
                } else {
                    if (note.isBreak) noteQuantity.break++;
                    else noteQuantity[noteType]++;
                    playCombo++;
                    const earnedScore = ((note.isBreak ? 5 : 1) * mult) * (playScoreRes.invScore || 0) * 100 + (note.isBreak ? (playScoreRes.breakScore || 0) * breakMult : 0);
                    playScore += earnedScore;
                    lostScore += (maxNoteScore - earnedScore);
                }
            } else {
                // 超過晚判定視窗才算 Miss
                if (noteT < -lateJudgeWindow) {
                    if (!note._missReported) {
                        note._missReported = true;
                        note.judgeResult = { grade: 'MISS', subGrade: '', scoreMultiplier: 0, breakMultiplier: 0, breakScoreValue: 0 };
                        spawnJudgeEffect(note, note.judgeResult);
                    }
                    playCombo = 0;
                    lostScore += maxNoteScore;
                }
            }
        }
    }

    const maxTotalScore = (datas.score > 0 ? 100 : 0) + ((datas.notesCounts?.break > 0) ? 1 : 0);
    const playScoreMinus = Math.max(0, Math.min(maxTotalScore, maxTotalScore - lostScore));

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
                const isHolding = isInsideHold && note.isHolding;
                if (isHolding && !note._riserActive) {
                    audioManager.startLongSound(noteId, 'touchHold_riser', -noteT);
                    note._riserActive = true;
                } else if (!isHolding && note._riserActive) {
                    audioManager.stopLongSound(noteId);
                    note._riserActive = false;
                }
            }

            const lookAhead = 0.1; // 100ms look-ahead

            // 1. Answer 節拍提示音：始終在 note.time 準時播放，不隨玩家輸入改變時間 (Slide 音符本身不播放 answer)
            const answerDiffT = note.time - globalTime;
            if (answerDiffT <= lookAhead && !note._answerSoundPlayed) {
                if (!note.isMine && noteType !== 'slide' && answerDiffT >= -0.1) {
                    audioManager.queueSoundSingle('answer', note.time);
                }
                note._answerSoundPlayed = true;
            }

            // 1b. Hold 尾端 Answer 提示音：始終在 Hold 結束時刻準時播放 (無論是否 MISS)
            const isHoldNoteObj = (note.holdDuration > 0 || note.isHold || noteType === 'hold');
            if (isHoldNoteObj && !note.isMine && (note.holdDuration ?? 0) > 0) {
                const holdEndTargetT = note.time + (note.holdDuration ?? 0);
                const holdEndDiffT = holdEndTargetT - globalTime;
                if (holdEndDiffT <= lookAhead && !note._holdEndAnswerPlayed) {
                    if (holdEndDiffT >= -0.1) {
                        audioManager.queueSoundSingle('answer', holdEndTargetT);
                    }
                    note._holdEndAnswerPlayed = true;
                }
            }

            // 2. 結束音效 (含前瞻，排除 answer，因尾端 answer 已由 1b 獨立準時播放)
            // (註：Slide 開始音效已改為在第一個感應器判定啟動時即時播放，不再隨時間提前排程)
            const endTargetT = note.time + skipT;
            const endNoteT = endTargetT - globalTime;
            if (endNoteT <= lookAhead && !note._endEffectPlayed) {
                const shouldPlayEndSound =
                    (noteType === "slide" && note.lastSlide && note.isBreak && (note.slideFinish || (note.slideProgress ?? 0) >= 0.5)) ||
                    (note.holdDuration !== undefined && noteType !== "tap" && !settings.notPlayHoldEnd && (note._holdPressed || note.holdFinish) && (!note.judgeResult || note.judgeResult.grade !== 'MISS'));
                if (shouldPlayEndSound && endNoteT >= -0.1) {
                    const soundGrade = note.judgeResult?.grade || note._headJudge?.grade || null;
                    note._startEffectPlayed = true;
                    audioManager.queueSound(note, endTargetT, { includeAnswer: false, grade: soundGrade });
                }
                note._endEffectPlayed = true;
            }
        } else {
            // 暫停或拖動時重置狀態
            const lookAhead = 0.1;
            const startTargetT = note.time + (note.slideDelay ?? 0);
            const endTargetT = note.time + skipT;
            const isHoldNoteObj = (note.holdDuration > 0 || note.isHold || noteType === 'hold');
            if (note.time - globalTime > lookAhead) {
                note._answerSoundPlayed = false;
            }
            if (isHoldNoteObj && (note.time + (note.holdDuration ?? 0) - globalTime > lookAhead)) {
                note._holdEndAnswerPlayed = false;
            }
            if (startTargetT - globalTime > lookAhead) {
                note._slideStartPlayed = false;
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
            && -noteT <= skipT + (noteType === "slide" ? (JUDGE_WINDOWS.SLIDE.GOOD_AREA_SEC + effectDecayTime) : (note.isHanabi ? hanabiEffectDecayTime : effectDecayTime));

        // 快速分類到桶子
        if (isVisible) {
            if (noteType === 'slide') {
                const tail = note.chainTail || note;
                const isFinished = tail.slideFinish || note.chainFinished;
                if (!isFinished && slideOnScreenCount < maxSlideCount) {
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
        playScoreMinus,
        noteQuantity,
        playScoreRes,
        nowIndex,
        isPlaying: playing,
    });

    if (isSlideDebugEnabled()) {
        renderSlideDebugOverlay(ctx, {
            globalTime,
            notes,
            renderer,
            activeSensors
        });
        updateSlideDebugPanel({
            globalTime,
            notes,
            renderer,
            activeSensors,
            playing
        });
    }

    audioManager.update(globalTime);
}

// ============================================================
// 專案管理與專案載入 (Project Manager & Load Project)
// ============================================================

let currentProjectId = localStorage.getItem('simai_lastProjectId') || null;

const DIFFICULTY_NAMES = {
    1: 'Easy',
    2: 'Basic',
    3: 'Advanced',
    4: 'Expert',
    5: 'Master',
    6: 'Re:Master',
    7: '宴'
};
const DIFFICULTY_COLORS = {
    1: '#43a047',
    2: '#1e88e5',
    3: '#fb8c00',
    4: '#e53935',
    5: '#8e24aa',
    6: '#e0e0e0',
    7: '#d81b60'
};

async function loadProject(projectId, targetDifficulty = null) {
    if (!projectId) return null;

    setDataEmpty();

    currentProjectId = projectId;
    localStorage.setItem('simai_lastProjectId', projectId);

    try {
        const [
            savedBgm,
            savedMaiData,
            savedDifficulty,
            bg,
            bgVideo
        ] = await Promise.all([
            idbGetProject(projectId, 'resource_bgm'),
            idbGetProject(projectId, 'maidata'),
            idbGetProject(projectId, 'now_difficulty'),
            idbGetProject(projectId, 'background_image'),
            idbGetProject(projectId, 'background_video')
        ]);

        if (targetDifficulty !== null && targetDifficulty !== undefined) {
            selectedDifficulty = parseInt(targetDifficulty) || 5;
        } else if (savedDifficulty) {
            selectedDifficulty = parseInt(savedDifficulty) || 5;
        } else {
            selectedDifficulty = 5;
        }

        if (savedMaiData) {
            maidataProcess(savedMaiData);
        }

        if (bgVideo) {
            backgroundVideo = bgVideo;
            gameBackgroundVideo.src = URL.createObjectURL(bgVideo);
            gameBackgroundVideo.style.display = 'none';
        }

        if (bg) {
            backgroundImage = bg;
            gameBackgroundImage.src = URL.createObjectURL(bg);
            gameBackgroundImage.style.display = settings.hideBackgroundWhenPaused ? 'none' : 'block';
        }

        tryUpdateBackgroundBrightness();

        if (savedBgm) {
            const url = URL.createObjectURL(savedBgm);
            await audioManager.setBackgroundMusic(url, savedBgm);
            audioManager.setPlaybackRate(settings.playbackSpeed || 1);
        }

        resize();
        draw();
        updateTimeControlUI();

        const list = await projectList();
        const proj = list.find(p => p.id === projectId);
        return proj;
    } catch (err) {
        console.error('載入專案失敗:', err);
        simpleToast({ content: '載入專案失敗：' + (err.message || err), type: 'error' });
        return null;
    }
}

async function openProjectManager() {
    const setStyle = (el, styles) => Object.assign(el.style, styles);

    const buildList = async (container) => {
        container.innerHTML = '';
        let list = await projectList();

        if (list.length === 0) {
            const migratedId = await migrateFromLegacy();
            if (migratedId) {
                list = await projectList();
            }
        }

        if (list.length === 0) {
            container.innerHTML = '<div style="color: #888; text-align: center; padding: 24px;">尚無任何專案</div>';
            return;
        }

        // 按更新時間排序（最近的在上）
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        for (const proj of list) {
            const isCurrent = proj.id === currentProjectId;
            const row = document.createElement('div');
            setStyle(row, {
                display: 'flex',
                flexDirection: 'column',
                padding: '10px 12px',
                background: isCurrent ? 'rgba(74, 144, 226, 0.15)' : '#262626',
                border: isCurrent ? '1px solid #4a90e2' : '1px solid #383838',
                borderRadius: '8px',
                marginBottom: '8px',
                gap: '8px',
                transition: 'all 0.15s ease',
            });

            // 上半部：名稱 + 狀態 + 操作按鈕
            const topRow = document.createElement('div');
            setStyle(topRow, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
            });

            // 左側：名稱與標籤
            const infoDiv = document.createElement('div');
            setStyle(infoDiv, { flex: '1', minWidth: '0', overflow: 'hidden' });

            const titleContainer = document.createElement('div');
            setStyle(titleContainer, { display: 'flex', alignItems: 'center', gap: '6px' });

            const nameSpan = document.createElement('span');
            nameSpan.textContent = proj.name || '未命名專案';
            setStyle(nameSpan, {
                fontWeight: '600',
                fontSize: '14px',
                color: isCurrent ? '#6ba4f8' : '#eee',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            });
            titleContainer.appendChild(nameSpan);

            if (isCurrent) {
                const currentBadge = document.createElement('span');
                currentBadge.textContent = '使用中';
                setStyle(currentBadge, {
                    fontSize: '10px',
                    color: '#fff',
                    background: '#2b6cb0',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    flexShrink: '0'
                });
                titleContainer.appendChild(currentBadge);
            }

            const timeSpan = document.createElement('span');
            const d = new Date(proj.updatedAt || proj.createdAt);
            timeSpan.textContent = `最後更新：${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            setStyle(timeSpan, { fontSize: '11px', color: '#888', display: 'block', marginTop: '2px' });

            infoDiv.appendChild(titleContainer);
            infoDiv.appendChild(timeSpan);

            // 右側按鈕組
            const btnGroup = document.createElement('div');
            setStyle(btnGroup, { display: 'flex', gap: '6px', flexShrink: '0' });

            const makeBtn = (text, onClick, bgColor = '#3a3a3a') => {
                const btn = document.createElement('button');
                btn.textContent = text;
                setStyle(btn, {
                    background: bgColor,
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'opacity 0.15s ease'
                });
                btn.addEventListener('mouseenter', () => btn.style.opacity = '0.8');
                btn.addEventListener('mouseleave', () => btn.style.opacity = '1');
                btn.onclick = (e) => {
                    e.stopPropagation();
                    onClick();
                };
                return btn;
            };

            const openBtn = makeBtn(isCurrent ? '重新載入' : '開啟', async () => {
                await loadProject(proj.id);
                simpleToast({ content: `已載入專案：${proj?.name || '未命名'}`, type: 'success', timeout: 1500 });
                buildList(container);
            }, isCurrent ? '#2d5a88' : '#2e7d32');
            btnGroup.appendChild(openBtn);

            btnGroup.appendChild(makeBtn('重新命名', async () => {
                const newName = prompt('請輸入新的專案名稱：', proj.name || '');
                if (newName !== null && newName.trim() !== '') {
                    await projectRename(proj.id, newName.trim());
                    buildList(container);
                    simpleToast({ content: '專案名稱已更新', type: 'info', timeout: 1200 });
                }
            }));

            btnGroup.appendChild(makeBtn('刪除', async () => {
                if (isCurrent) {
                    alert('無法刪除目前正在播放的專案。\n請先切換到其他專案後再刪除。');
                    return;
                }
                if (!confirm(`確定要刪除專案「${proj.name || '未命名'}」嗎？\n此操作無法復原！`)) return;
                await projectDelete(proj.id);
                buildList(container);
                simpleToast({ content: '已刪除專案', type: 'success', timeout: 1200 });
            }, '#c62828'));

            topRow.appendChild(infoDiv);
            topRow.appendChild(btnGroup);
            row.appendChild(topRow);

            // 下半部：難度選擇標籤 (若有 maidata)
            const diffRow = document.createElement('div');
            setStyle(diffRow, {
                display: 'flex',
                gap: '6px',
                flexWrap: 'wrap',
                alignItems: 'center',
                marginTop: '2px'
            });

            idbGetProject(proj.id, 'maidata').then(projMaiData => {
                if (!projMaiData) return;
                const mData = typeof projMaiData === 'string' ? parseMaidata(projMaiData) : projMaiData;
                const availableDiffs = [1, 2, 3, 4, 5, 6, 7].filter(d => !!mData[`inote_${d}`]);
                if (availableDiffs.length === 0) return;

                const diffTitle = document.createElement('span');
                diffTitle.textContent = '難度：';
                setStyle(diffTitle, { fontSize: '11px', color: '#999' });
                diffRow.appendChild(diffTitle);

                availableDiffs.forEach(diffNum => {
                    const diffBtn = document.createElement('button');
                    const isSelectedDiff = isCurrent && selectedDifficulty === diffNum;
                    diffBtn.textContent = `${DIFFICULTY_NAMES[diffNum] || diffNum}`;
                    setStyle(diffBtn, {
                        fontSize: '10px',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        border: isSelectedDiff ? '1px solid #fff' : '1px solid transparent',
                        background: DIFFICULTY_COLORS[diffNum] || '#555',
                        color: diffNum === 6 ? '#000' : '#fff',
                        cursor: 'pointer',
                        fontWeight: isSelectedDiff ? 'bold' : 'normal',
                        opacity: isSelectedDiff ? '1' : '0.85'
                    });
                    diffBtn.title = `點擊切換為此難度播放`;
                    diffBtn.onclick = async (e) => {
                        e.stopPropagation();
                        await loadProject(proj.id, diffNum);
                        simpleToast({ content: `已切換難度至：${DIFFICULTY_NAMES[diffNum]}`, type: 'success', timeout: 1200 });
                        buildList(container);
                    };
                    diffRow.appendChild(diffBtn);
                });
            });

            row.appendChild(diffRow);
            container.appendChild(row);
        }
    };

    const container = document.createElement('div');
    setStyle(container, {
        maxHeight: '400px',
        overflowY: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: '#555 transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
    });

    buildList(container);

    popupWindow({
        title: "專案總管",
        customContent: container,
        width: 520,
        maxWidth: 620,
        buttons: [
            {
                text: "新建空白專案",
                onClick: async () => {
                    const name = prompt('請輸入專案名稱：', '未命名專案');
                    if (name === null) return;
                    const newId = await projectCreate(name.trim() || '未命名專案');
                    await loadProject(newId);
                    simpleToast({ content: `已建立並切換至專案：${name.trim() || '未命名專案'}`, type: 'success', timeout: 1500 });
                    buildList(container);
                }
            },
            {
                text: "關閉",
                hideOnClick: true,
            }
        ]
    });
}

// ============================================================
// 設定面板 (Settings Popup)
// ============================================================

function openSettings() {
    const container = document.createElement('div');
    container.className = 'popup-setting-container';

    // 左側導覽列 (Tabs)
    const sidebar = document.createElement('div');
    sidebar.className = 'popup-setting-sidebar';

    // 右側內容區
    const contentArea = document.createElement('div');
    contentArea.className = 'popup-setting-content';

    container.appendChild(sidebar);
    container.appendChild(contentArea);

    const sections = [];
    const tabs = [];

    const switchTab = (index) => {
        tabs.forEach((tab, i) => {
            tab.classList.toggle('active', i === index);
        });
        sections.forEach((sec, i) => {
            sec.classList.toggle('active', i === index);
        });
    };

    const addTab = (label) => {
        const index = tabs.length;
        const tab = document.createElement('div');
        tab.textContent = label;
        tab.className = 'popup-setting-tab';
        tab.addEventListener('click', () => switchTab(index));
        sidebar.appendChild(tab);
        tabs.push(tab);

        const section = document.createElement('div');
        section.className = 'popup-setting-section';

        contentArea.appendChild(section);
        sections.push(section);

        return section;
    };

    const createRow = (labelText, element) => {
        const row = document.createElement('div');
        row.className = 'popup-setting-row';

        // 1. Checkbox
        if (element.type === 'checkbox') {
            const wrapper = document.createElement('label');
            wrapper.className = 'popup-setting-wrapper';
            const text = document.createElement('span');
            text.textContent = labelText;
            text.className = 'popup-setting-text';
            wrapper.appendChild(text);
            wrapper.appendChild(element);
            row.appendChild(wrapper);
            return row;
        }

        // 2. Range
        if (element.type === 'range') {
            const wrapper = document.createElement('label');
            wrapper.className = 'popup-setting-wrapper';
            const text = document.createElement('span');
            text.textContent = labelText;
            text.className = 'popup-setting-text';

            element.style.width = '140px';
            element.style.flexShrink = '0';
            wrapper.appendChild(text);
            wrapper.appendChild(element);
            row.appendChild(wrapper);
            return row;
        }

        // 3. Object (子屬性折疊選單)
        if (element.dataset && element.dataset.type === 'object-container') {
            row.className = 'popup-setting-row popup-setting-row-object';

            const header = document.createElement('div');
            header.className = 'popup-setting-object-header';
            header.innerHTML = `<span>${labelText}</span><span class="popup-setting-arrow-icon">▼</span>`;

            const subBody = element;
            subBody.className = 'popup-setting-subbody';

            header.addEventListener('click', () => {
                const isExpanded = subBody.classList.toggle('open');
                header.querySelector('.popup-setting-arrow-icon').classList.toggle('expanded', isExpanded);
            });

            row.appendChild(header);
            row.appendChild(subBody);
            return row;
        }

        // 4. Button
        if (element.tagName === 'BUTTON') {
            const label = document.createElement('label');
            label.textContent = labelText;
            label.className = 'popup-setting-label';
            element.className = 'popup-setting-element';
            row.appendChild(label);
            row.appendChild(element);
            return row;
        }

        // 5. 一般 Number / Dropdown
        const label = document.createElement('label');
        label.textContent = labelText;
        label.className = 'popup-setting-label';
        element.className = 'popup-setting-input';
        row.appendChild(label);
        row.appendChild(element);
        return row;
    };

    const createCheckbox = (checked, id) => {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'popup-setting-checkbox';
        input.id = id;
        input.checked = checked;
        return input;
    };

    const createDropdown = (value, options = []) => {
        const select = document.createElement('select');
        select.className = 'popup-setting-dropdown';
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label.startsWith('settings.') ? t(opt.label) : opt.label;
            if (opt.value == value) o.selected = true;
            select.appendChild(o);
        });
        return select;
    };

    const inputRefs = {};
    let popupCtx = null;

    const playSettingsConfig = [
        {
            label: 'settings.tabs.basic',
            items: [
                {
                    id: 'speed', type: 'range', label: 'settings.items.speed', min: 1, max: 20, step: 0.1, def: defaultSettings.speed,
                    apply: (val) => { renderer.settings.speed = val; draw(); }
                },
                {
                    id: 'touchSpeed', type: 'range', label: 'settings.items.touchSpeed', min: 1, max: 20, step: 0.1, def: defaultSettings.touchSpeed,
                    apply: (val) => { renderer.settings.touchSpeed = val; draw(); }
                },
                {
                    id: 'slideSpeed', type: 'range', label: 'settings.items.slideSpeed', min: -1, max: 1, step: 0.05, def: defaultSettings.slideSpeed,
                    apply: (val) => { renderer.settings.slideSpeed = val; draw(); }
                },
                {
                    id: 'middleDisplay', type: 'dropdown', label: 'settings.items.middleDisplay',
                    options: [
                        { value: 0, label: 'settings.middleDisplayOpts.off' },
                        { value: 1, label: 'settings.middleDisplayOpts.combo' },
                        { value: 2, label: 'settings.middleDisplayOpts.scorePlus' },
                        { value: 3, label: 'settings.middleDisplayOpts.scoreMinus' }
                    ],
                    def: defaultSettings.middleDisplay,
                    apply: (val) => { renderer.settings.middleDisplay = parseInt(val); draw(); }
                },
                {
                    id: 'moviebrightness', type: 'dropdown', label: 'settings.items.moviebrightness',
                    options: [
                        { value: '0', label: 'settings.items.bright' },
                        { value: '-1', label: 'settings.items.normal' },
                        { value: '-2', label: 'settings.items.dark' },
                        { value: '-3', label: 'settings.items.veryDark' },
                        { value: '-4', label: '全黑' }
                    ],
                    def: defaultSettings.moviebrightness ?? -4,
                    apply: (val) => {
                        settings.moviebrightness = parseInt(val);
                        tryUpdateBackgroundBrightness();
                    }
                },
                {
                    id: 'autoPlay', type: 'dropdown', label: 'settings.items.autoPlay',
                    options: [
                        { value: 'computer', label: 'settings.autoPlayOpts.computer' },
                        { value: 'simulate', label: 'settings.autoPlayOpts.simulate' },
                        { value: 'off', label: 'settings.autoPlayOpts.off' }
                    ],
                    def: defaultSettings.autoPlay,
                    get: () => getAutoPlayMode(),
                    apply: (val) => {
                        settings.autoPlay = val;
                        simulatedPlayController.reset();
                        updateAutoPlayUI();
                    }
                },
                {
                    id: 'simplayPerfect', type: 'checkbox', label: 'Auto Play 強制完美', def: defaultSettings.simplayPerfect,
                    apply: (val) => {
                        settings.simplayPerfect = val;
                    }
                },
                {
                    id: 'randomOffset', type: 'range', label: 'Auto Play 判定偏移', def: defaultSettings.randomOffset, min: 0, max: 0.75, step: 0.01,
                    apply: (val) => {
                        settings.randomOffset = val;
                    }
                },
                {
                    id: 'fatFinger', type: 'checkbox', label: '肥手指判定擴張 (多感應區覆蓋)', def: defaultSettings.fatFinger ?? true,
                    apply: (val) => {
                        settings.fatFinger = val;
                    }
                },
                {
                    id: 'fatFingerRadius', type: 'range', label: '肥手指判定半徑', min: 1, max: 10, step: 0.2, def: defaultSettings.fatFingerRadius ?? 4.2,
                    apply: (val) => {
                        settings.fatFingerRadius = parseFloat(val);
                    }
                },
                {
                    id: 'hideOutline', type: 'checkbox', label: 'settings.items.hideOutline', def: defaultSettings.hideOutline,
                    apply: (val) => {
                        settings.hideOutline = val;
                        updateOutlineUI();
                    }
                },
                {
                    id: 'rotateStars', type: 'checkbox', label: 'settings.items.rotateStars', def: defaultSettings.rotateStars,
                    apply: (val) => { renderer.settings.rotateStars = val; draw(); }
                },
                {
                    id: 'pinkStars', type: 'checkbox', label: 'settings.items.pinkStars', def: defaultSettings.pinkStars,
                    apply: (val) => { renderer.settings.pinkStars = val; draw(); }
                },
                {
                    id: 'lang', type: 'dropdown', label: 'settings.items.lang',
                    options: [
                        { value: 'zh-TW', label: '繁體中文' },
                        { value: 'en', label: 'English' },
                        { value: 'ja', label: '日本語' }
                    ],
                    def: getCurrentLang(),
                    get: () => getCurrentLang(),
                    apply: (val) => {
                        setLang(val);
                        idbSet('simai_settings', JSON.stringify(settings)).catch(() => { });
                        if (popupCtx) {
                            popupCtx.close();
                            openSettings();
                        }
                    }
                }
            ]
        },
        {
            label: 'settings.tabs.display',
            items: [
                {
                    id: 'showSensor', type: 'checkbox', label: 'settings.items.showSensor', def: defaultSettings.showSensor,
                    apply: (val) => { renderer.settings.showSensor = val; draw(); }
                },
                {
                    id: 'showSensorTextWhenPaused', type: 'checkbox', label: 'settings.items.showSensorTextWhenPaused', def: defaultSettings.showSensorTextWhenPaused,
                    apply: (val) => { renderer.settings.showSensorTextWhenPaused = val; draw(); }
                },
                {
                    id: 'hideBackgroundWhenPaused', type: 'checkbox', label: 'settings.items.hideBackgroundWhenPaused', def: defaultSettings.hideBackgroundWhenPaused,
                    apply: (val) => {
                        settings.hideBackgroundWhenPaused = val;
                        if (!playing) updatePauseBackgroundDisplay();
                    }
                },
                {
                    id: 'showCoverWhenPaused', type: 'checkbox', label: 'settings.items.showCoverWhenPaused', def: defaultSettings.showCoverWhenPaused,
                    apply: (val) => {
                        settings.showCoverWhenPaused = val;
                        if (!playing) updatePauseBackgroundDisplay();
                    }
                },
                {
                    id: 'slideIllegalRed', type: 'checkbox', label: '劃軌判定偏紅 (非法劃軌顯示紅色)', def: defaultSettings.slideIllegalRed,
                    apply: (val) => { renderer.settings.slideIllegalRed = val; draw(); }
                },
                {
                    id: 'slideArrowHideBySensor', type: 'checkbox', label: 'settings.items.slideArrowHideBySensor', def: defaultSettings.slideArrowHideBySensor ?? true,
                    apply: (val) => { renderer.settings.slideArrowHideBySensor = val; draw(); }
                },
                {
                    id: 'drawHitEffect', type: 'checkbox', label: 'settings.items.drawHitEffect', def: defaultSettings.drawHitEffect ?? true,
                    apply: (val) => { renderer.settings.drawHitEffect = val; draw(); }
                },
                {
                    id: 'drawHanabiEffect', type: 'checkbox', label: 'settings.items.drawHanabiEffect', def: defaultSettings.drawHanabiEffect ?? true,
                    apply: (val) => { renderer.settings.drawHanabiEffect = val; draw(); }
                },
                {
                    id: 'showJudge', type: 'checkbox', label: 'settings.items.showJudge', def: defaultSettings.showJudge ?? true,
                    apply: (val) => { renderer.settings.showJudge = val; draw(); }
                },
                {
                    id: 'showCriticalPerfect', type: 'checkbox', label: 'settings.items.showCriticalPerfect', def: defaultSettings.showCriticalPerfect ?? true,
                    apply: (val) => { renderer.settings.showCriticalPerfect = val; draw(); }
                },
                {
                    id: 'showBreakCriticalPerfect', type: 'checkbox', label: 'settings.items.showBreakCriticalPerfect', def: defaultSettings.showBreakCriticalPerfect ?? true,
                    apply: (val) => { renderer.settings.showBreakCriticalPerfect = val; draw(); }
                },
                {
                    id: 'showFastLate', type: 'checkbox', label: 'settings.items.showFastLate', def: defaultSettings.showFastLate ?? true,
                    apply: (val) => { renderer.settings.showFastLate = val; draw(); }
                },
                {
                    id: 'sensorHighlight', type: 'checkbox', label: '感應器高亮反饋', def: defaultSettings.sensorHighlight ?? true,
                    apply: (val) => { renderer.settings.sensorHighlight = val; draw(); }
                },
                {
                    id: 'slideDebug', type: 'checkbox', label: 'Slide 判定隊列 Debug 視圖 (Ctrl+D)', def: defaultSettings.slideDebug ?? false,
                    apply: (val) => { toggleSlideDebug(val); }
                }
            ]
        },
        {
            label: 'settings.tabs.sfx',
            items: [
                {
                    id: 'globalVolume', type: 'range', label: 'settings.items.globalVolume', min: 0, max: 1, step: 0.05, def: defaultSettings.globalVolume,
                    apply: (val) => { audioManager.setGlobalVolume(val); }
                },
                {
                    id: 'musicVolume', type: 'range', label: 'settings.items.musicVolume', min: 0, max: 1, step: 0.05, def: defaultSettings.musicVolume,
                    apply: (val) => { audioManager.setBGMVolume(val); }
                },
                {
                    id: 'SfxVolume', type: 'range', label: 'settings.items.SfxVolume', min: 0, max: 1, step: 0.05, def: defaultSettings.SfxVolume,
                    apply: (val) => { audioManager.setSFXVolume(val); }
                },
                {
                    id: 'playbackSpeed', type: 'range', label: '播放速度', min: 0.25, max: 2, step: 0.05, def: defaultSettings.playbackSpeed || 1,
                    apply: (val) => {
                        setPlaybackSpeed(val);
                    }
                },
                {
                    id: 'notPlayHoldEnd', type: 'checkbox', label: 'settings.items.notPlayHoldEnd', def: defaultSettings.notPlayHoldEnd,
                    apply: (val) => { settings.notPlayHoldEnd = val; }
                },
                {
                    id: 'sfxVolumes', type: 'object', label: 'settings.items.sfxVolumes', def: defaultSettings.sfxVolumes,
                    apply: (val) => { audioManager.setSFXVolumes(val); }
                }
            ]
        }
    ];

    playSettingsConfig.forEach((category) => {
        const section = addTab(t(category.label));

        (category.items || []).forEach(item => {
            const targetRef = item.ref || settings;
            const targetKey = item.key || item.id;
            const currentVal = item.get ? item.get() : (targetRef[targetKey] ?? item.def);

            let el;

            // A. Checkbox
            if (item.type === 'checkbox') {
                el = createCheckbox(currentVal, `settings-${item.id}`);
                el.addEventListener('change', (e) => {
                    targetRef[targetKey] = e.target.checked;
                    if (item.apply) item.apply(e.target.checked);
                });
                el.addEventListener('click', (e) => e.stopPropagation());
            }
            // B. Dropdown
            else if (item.type === 'dropdown') {
                el = createDropdown(currentVal, item.options);
                el.addEventListener('change', (e) => {
                    const parsedVal = isNaN(e.target.value) ? e.target.value : parseFloat(e.target.value);
                    targetRef[targetKey] = parsedVal;
                    if (item.apply) item.apply(parsedVal);
                });
            }
            // C. Range
            else if (item.type === 'range') {
                el = createCustomSlider(currentVal, item.min, item.max, item.step, (val) => {
                    targetRef[targetKey] = val;
                    if (item.apply) item.apply(val);
                });
            }
            // D. Object (sfxVolumes)
            else if (item.type === 'object') {
                el = document.createElement('div');
                el.dataset.type = 'object-container';
                el.value = { ...currentVal };

                el._subRefs = {};

                Object.keys(item.def).forEach((subKey) => {
                    const subDefault = item.def[subKey];
                    const subCurrent = currentVal[subKey] ?? subDefault;

                    const subSlider = createCustomSlider(subCurrent, 0, 1, 0.05, (subVal) => {
                        el.value[subKey] = subVal;
                        targetRef[targetKey][subKey] = subVal;
                        if (item.apply) item.apply(targetRef[targetKey]);
                    });

                    el._subRefs[subKey] = subSlider;
                    const subRow = createRow(subKey, subSlider);
                    el.appendChild(subRow);
                });
            }

            inputRefs[item.id] = {
                el,
                def: item.def,
                type: item.type,
                apply: item.apply,
                ref: targetRef,
                key: targetKey
            };

            section.appendChild(createRow(t(item.label), el));
        });
    });

    switchTab(0);

    const applyAndSave = () => {
        Object.keys(inputRefs).forEach(id => {
            const config = inputRefs[id];
            let finalVal;

            if (config.type === 'checkbox') {
                finalVal = config.el.checked;
            } else if (config.type === 'dropdown') {
                finalVal = isNaN(config.el.value) ? config.el.value : parseFloat(config.el.value);
            } else if (config.type === 'object') {
                finalVal = { ...config.el.value };
            } else if (config.type === 'range') {
                finalVal = parseFloat(config.el.value);
            } else {
                finalVal = config.el.value;
            }

            if (config.type === 'object') {
                Object.assign(config.ref[config.key], finalVal);
            } else {
                config.ref[config.key] = finalVal;
            }

            if (config.apply) {
                config.apply(finalVal);
            }
        });

        idbSet('simai_settings', JSON.stringify(settings)).catch(() => { });
        simpleToast({ content: t('toast.settingsSaved'), type: 'success', timeout: 1500 });
    };

    popupCtx = popupWindow({
        title: t('settings.title'),
        customContent: container,
        width: "85%",
        maxWidth: "520px",
        buttons: [
            {
                text: t('popup.reset'),
                onClick: () => {
                    if (!confirm('確定要將設定還原為預設值嗎？')) return;
                    Object.assign(settings, JSON.parse(JSON.stringify(defaultSettings)));
                    applyAudioSettings(settings);
                    setPlaybackSpeed(settings.playbackSpeed || 1);
                    toggleSlideDebug(false);
                    renderer.settings = settings;
                    updateOutlineUI();
                    updateAutoPlayUI();
                    tryUpdateBackgroundBrightness();
                    draw();
                    idbSet('simai_settings', JSON.stringify(settings)).catch(() => { });
                    simpleToast({ content: '已還原預設設定', type: 'info', timeout: 1500 });
                    if (popupCtx) {
                        popupCtx.close();
                        openSettings();
                    }
                }
            },
            {
                text: t('popup.save'),
                onClick: () => {
                    applyAndSave();
                },
                hideOnClick: true
            },
            {
                text: t('popup.close'),
                hideOnClick: true
            }
        ]
    });
}

// ============================================================
// 初始自動載入最後使用的專案
// ============================================================
(async () => {
    try {
        let lastId = localStorage.getItem('simai_lastProjectId');
        const list = await projectList();
        if (lastId && list.some(p => p.id === lastId)) {
            await loadProject(lastId);
        } else if (list.length > 0) {
            await loadProject(list[0].id);
        } else {
            const migratedId = await migrateFromLegacy();
            if (migratedId) {
                await loadProject(migratedId);
            }
        }
    } catch (e) {
        console.warn('初始化載入專案失敗:', e);
    }
})();

