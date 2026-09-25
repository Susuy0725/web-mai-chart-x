import { openDB, idbGet, idbSet, idbSetProject, idbGetProject, projectList, projectCreate, projectDelete, projectRename, projectTouch, projectUpdateName, migrateFromLegacy } from '../Scripts/indexDB.js';
import { SimaiRenderer } from './renderer.js';
import { simaiDecode } from '../Scripts/decode.js';
import { parseMaidata, loadAllImages, scaleBase, noteRefPos, touchRefPos, audioManager, debounce, popupWindow, simpleToast, createCustomSlider, clamp } from '../Scripts/helper.js';
import { t, getCurrentLang, setLang } from '../Scripts/i18n.js';
import { SimulatedPlayController } from './simplay.js';
import { getSlideJudgeQueue } from './slidetables.js';
import { toggleSlideDebug, isSlideDebugEnabled, renderSlideDebugOverlay, updateSlideDebugPanel, setSlideDebugToggleCallback } from './slideDebug.js';
import { SyncManager } from '../Scripts/sync/syncManager.js';
import * as googleDriveService from '../Scripts/drive/googleDriveService.js';
import { createGoogleSignInButton } from '../Scripts/drive/googleButton.js';
import { openProjectManagerModal } from '../Scripts/projectManagerModal.js';
import { normalizeFiles, parseProjectBundle, saveProjectToIdb } from '../Scripts/projectLoader.js';

const simulatedPlayController = new SimulatedPlayController();

// -------------------------------------------------------------
// 統一 WebRTC 同步管理器 (SyncManager)
// -------------------------------------------------------------
const syncManager = new SyncManager({
    onStatusChange: () => {
        updateSyncStatusUI();
    },
    onPlay: async (startAt, speed) => {
        if (settings.playbackSpeed !== speed) {
            settings.playbackSpeed = speed;
            if (playbackSpeedInput) playbackSpeedInput.value = speed.toFixed(2);
        }
        await play(true, startAt);
    },
    onPause: () => {
        if (playing) {
            pause(true);
        }
    },
    onSeek: (time) => {
        realTime = time;
        pausedTime = time;
        globalTime = realTime - musicDelay;
        playStartTimestamp = performance.now();
        playStartRealTime = realTime;
        resetNotesForSeek(globalTime);
        if (playing) {
            audioManager.playBGM(realTime);
        }
        updateTimeControlUI();
        draw();
    },
    onRestart: () => {
        restart(true);
    },
    onSpeed: (speed) => {
        setPlaybackSpeed(speed, true);
        simpleToast({ content: t('toast.setPlaybackSpeed', { speed: speed.toFixed(2) }), type: 'info', timeout: 1500 });
    },
    onChart: async (data) => {
        if (playing) {
            pause(true);
        }
        realTime = 0;
        pausedTime = 0;
        setDataEmpty();
        if (data.selectedDifficulty) {
            selectedDifficulty = String(data.selectedDifficulty);
        }
        if (data.fullMaidata) {
            maidataProcess(data.fullMaidata);
        } else if (data.fumen) {
            if (data.fumen.includes('&inote_') || data.fumen.includes('&title=')) {
                maidataProcess(data.fumen);
            } else {
                const diffKey = "inote_" + (data.selectedDifficulty || selectedDifficulty || '3');
                rawdata = {
                    title: data.title || '',
                    artist: data.artist || '',
                    first: data.musicDelay !== undefined ? String(data.musicDelay) : '0',
                    [diffKey]: data.fumen
                };
                musicDelay = parseFloat(rawdata.first) || 0;
                getResult();
            }
        }
        globalTime = -musicDelay;
        updateTimeControlUI();
        resetNotesForSeek(0);
        draw();
    },
    onAudio: async (audioBlob) => {
        await audioManager.setBackgroundMusic(audioBlob);
    },
    onAudioClear: async () => {
        if (playing) {
            pause(true);
        }
        await audioManager.removeBackgroundMusic().catch(() => {});
    },
    getProjectData: async () => {
        if (!rawdata) return null;
        const fumenText = rawdata['inote_' + selectedDifficulty] || rawdata.inote_3 || '';
        let fullMaidata = '';
        if (rawdata.title || rawdata.artist || rawdata.first || fumenText) {
            const parts = [];
            if (rawdata.title) parts.push(`&title=${rawdata.title}`);
            if (rawdata.artist) parts.push(`&artist=${rawdata.artist}`);
            if (rawdata.first) parts.push(`&first=${rawdata.first}`);
            if (rawdata.des) parts.push(`&des=${rawdata.des}`);
            for (let i = 1; i <= 7; i++) {
                if (rawdata[`inote_${i}`]) {
                    parts.push(`&inote_${i}=\n${rawdata[`inote_${i}`]}`);
                }
            }
            fullMaidata = parts.join('\n');
        }

        let bgm = null;
        if (audioManager.bgmFile) {
            bgm = audioManager.bgmFile;
        } else if (audioManager.bgmBlob) {
            bgm = audioManager.bgmBlob;
        } else {
            const lastId = localStorage.getItem('simai_lastProjectId');
            if (lastId) {
                try {
                    bgm = await idbGetProject(lastId, 'resource_bgm');
                } catch (_) {}
            }
        }

        return {
            chart: {
                fumen: fumenText,
                fullMaidata: fullMaidata,
                title: rawdata.title || '',
                artist: rawdata.artist || '',
                musicDelay: typeof musicDelay !== 'undefined' ? musicDelay : 0,
                selectedDifficulty: selectedDifficulty || '3'
            },
            audio: bgm
        };
    }
});

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
    autoPlay: true, // true: 自動模擬播放, false: 手動打擊
    hideOutline: false, // 隱藏判定圈
    sensorHighlight: true, // 感應器高亮
    fatFinger: true, // 肥手指擴張判定
    fatFingerRadius: 4.2, // 肥手指判定半徑
    slideDebug: false, // Slide 判定隊列 Debug 視圖
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

const activeKeyboardSensors = new Set();
const activePointers = new Map(); // pointerId -> sensorId
const manualInputSensors = new Set();

const judgeEffects = [];

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
    let currentChainLeader = null;
    let prevSlide = null;

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

    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.type !== 'slide') continue;

        if (n.firstSlide) {
            currentChainLeader = n;
            prevSlide = n;
            n.prevSlide = null;
            n.chainLeader = n;

            const key = `${Math.round(n.time * 1000)}_${n.pos}`;
            if (starMap.has(key)) {
                n.headNote = starMap.get(key);
            }
        } else if (currentChainLeader) {
            n.prevSlide = prevSlide;
            n.chainLeader = currentChainLeader;
            if (prevSlide) {
                prevSlide.nextSlide = n;
            }
            prevSlide = n;
            if (n.lastSlide) {
                currentChainLeader = null;
                prevSlide = null;
            }
        }
    }
}

let datas = simaiDecode();
if (datas) {
    linkChainSlides(datas.notes);
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

if (canvasContainer) {
    canvasContainer.addEventListener('contextmenu', (e) => e.preventDefault());
    canvasContainer.addEventListener('selectstart', (e) => e.preventDefault());
}
if (canvas) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('selectstart', (e) => e.preventDefault());
}

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
const connectionBtn = getControlButton("connection");

function updateSyncStatusUI() {
    if (connectionBtn && syncManager) {
        syncManager.updateButtonUI(connectionBtn);
    }
}

if (connectionBtn) {
    connectionBtn.addEventListener("click", () => {
        syncManager.openSyncModal({
            onBeforeConnect: async () => {
                if (audioManager.ctx && audioManager.ctx.state === 'suspended') {
                    try {
                        await audioManager.ctx.resume();
                    } catch (_) { }
                }
            }
        });
    });
}


const playbackSpeedInput = document.getElementById("playbackSpeedInput");
const playbackSpeedBtn = getControlButton("playbackSpeed");
const playbackSpeedMinusBtn = getControlButton("playbackSpeedMinus");
const playbackSpeedAddBtn = getControlButton("playbackSpeedAdd");
const slideDebugBtn = getControlButton("slideDebug");

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
        simulatedPlayController.reset();
        activeKeyboardSensors.clear();
        activePointers.clear();
        manualInputSensors.clear();
        updateAutoPlayUI();
        idbSet('simai_settings', JSON.stringify(settings));
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

// --- MajdataPlay 判定標準系統 (JudgeEngine) ---
const FRAME_SEC = 1 / 60; // 0.0166667s (16.67ms)

const JUDGE_WINDOWS = {
    TAP: {
        CRITICAL_PERFECT: 1 * FRAME_SEC,  // <= 16.67ms (1st Perfect)
        PERFECT_2ND: 2 * FRAME_SEC,       // <= 33.33ms (2nd Perfect)
        PERFECT_3RD: 3 * FRAME_SEC,       // <= 50.00ms (3rd Perfect)
        GREAT_1ST: 4 * FRAME_SEC,         // <= 66.67ms (1st Great)
        GREAT_2ND: 5 * FRAME_SEC,         // <= 83.33ms (2nd Great)
        GREAT_3RD: 6 * FRAME_SEC,         // <= 100.00ms (3rd Great)
        GOOD: 9 * FRAME_SEC               // <= 150.00ms (Good)
    },
    TOUCH: {
        // MajdataPlay TouchDrop 規範：
        // 早按窗口限制在 150ms (TOUCH_JUDGE_SEG_1ST_PERFECT_MSEC = 9 * FRAME_SEC)。
        // 晚按窗口容錯至 300ms (TOUCH_JUDGE_GOOD_AREA_MSEC = 18 * FRAME_SEC)。
        FAST_PERFECT: 9 * FRAME_SEC,      // <= 150.00ms (早於此視窗不予判定)
        CRITICAL_PERFECT: 9 * FRAME_SEC,  // <= 150.00ms
        PERFECT_2ND: 10.5 * FRAME_SEC,    // <= 175.00ms (Late)
        PERFECT_3RD: 12 * FRAME_SEC,      // <= 200.00ms (Late)
        GREAT_1ST: 13 * FRAME_SEC,        // <= 216.67ms (Late)
        GREAT_2ND: 14 * FRAME_SEC,        // <= 233.33ms (Late)
        GREAT_3RD: 15 * FRAME_SEC,        // <= 250.00ms (Late)
        GOOD: 18 * FRAME_SEC              // <= 300.00ms (Late)
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
        RELEASE_IGNORE_SEC: 2 * FRAME_SEC, // 0.0333s (2 幀容錯)
        HEAD_IGNORE_SEC: 15 * FRAME_SEC,   // 0.2500s
        TAIL_IGNORE_SEC: 12 * FRAME_SEC    // 0.2000s
    }
};

function spawnJudgeEffect(note, judgeResult) {
    if (!renderer) return;
    let x = 0, y = 0;
    if (note.type === 'slide') {
        const endPos = note.slideEnd || note.pos;
        if (noteRefPos[endPos - 1]) {
            x = noteRefPos[endPos - 1].x;
            y = noteRefPos[endPos - 1].y;
        }
    } else if (note.type === 'touch') {
        const ref = touchRefPos[note.touchPos] ? touchRefPos[note.touchPos][note.pos - 1] : { x: 0, y: 0 };
        x = ref ? ref.x : 0;
        y = ref ? ref.y : 0;
    } else if (noteRefPos[note.pos - 1]) {
        x = noteRefPos[note.pos - 1].x;
        y = noteRefPos[note.pos - 1].y;
    }

    judgeEffects.push({
        text: judgeResult.grade === 'CRITICAL_PERFECT' ? 'PERFECT' : judgeResult.grade,
        subGrade: judgeResult.subGrade,
        grade: judgeResult.grade,
        startTime: performance.now(),
        duration: 380,
        x,
        y
    });

    if (judgeEffects.length > 25) judgeEffects.shift();
}

function renderJudgeEffects(ctx) {
    if (judgeEffects.length === 0) return;
    const now = performance.now();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = judgeEffects.length - 1; i >= 0; i--) {
        const eff = judgeEffects[i];
        const elapsed = now - eff.startTime;
        if (elapsed > eff.duration) {
            judgeEffects.splice(i, 1);
            continue;
        }
        const progress = elapsed / eff.duration;
        const alpha = Math.max(0, 1 - progress);
        const distOffset = progress * 1.8;
        const angle = Math.atan2(eff.y, eff.x);
        const curX = eff.x + (eff.x === 0 && eff.y === 0 ? 0 : Math.cos(angle) * distOffset);
        const curY = eff.y + (eff.x === 0 && eff.y === 0 ? -distOffset : Math.sin(angle) * distOffset);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(curX, curY);

        let mainColor = '#ffd700';
        let mainText = 'PERFECT';
        if (eff.grade === 'CRITICAL_PERFECT') {
            mainColor = '#ffe14d';
            mainText = 'PERFECT';
        } else if (eff.grade === 'PERFECT') {
            mainColor = '#ffbb00';
            mainText = 'PERFECT';
        } else if (eff.grade === 'GREAT') {
            mainColor = '#ff5fa2';
            mainText = 'GREAT';
        } else if (eff.grade === 'GOOD') {
            mainColor = '#43c122';
            mainText = 'GOOD';
        } else if (eff.grade === 'MISS') {
            mainColor = '#a0a0a0';
            mainText = 'MISS';
        }

        ctx.font = 'bold 3.2px combo';
        ctx.fillStyle = mainColor;
        ctx.shadowColor = mainColor;
        ctx.shadowBlur = 4;
        ctx.fillText(mainText, 0, 0);

        if (eff.subGrade) {
            ctx.font = 'bold 1.8px combo';
            ctx.fillStyle = eff.subGrade === 'FAST' ? '#00e5ff' : '#ff9100';
            ctx.shadowBlur = 2;
            ctx.fillText(eff.subGrade, 0, 2.6);
        }

        ctx.restore();
    }
    ctx.restore();
}

/**
 * 評估音符擊中評級
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

    if (isTouch) {
        const win = JUDGE_WINDOWS.TOUCH;
        // MajdataPlay: 早於 150ms 的點擊不予判定 (忽略等待進入窗口)
        if (isFast && absDiff > win.FAST_PERFECT) {
            return null;
        }

        if (absDiff <= win.CRITICAL_PERFECT) {
            grade = 'CRITICAL_PERFECT';
            scoreMultiplier = 1.0;
        } else if (absDiff <= win.PERFECT_3RD) {
            grade = 'PERFECT';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = 1.0;
        } else if (absDiff <= win.GREAT_3RD) {
            grade = 'GREAT';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = 0.8;
        } else if (absDiff <= win.GOOD) {
            grade = 'GOOD';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = 0.5;
        }
    } else {
        const win = JUDGE_WINDOWS.TAP;
        if (absDiff <= win.CRITICAL_PERFECT) {
            grade = 'CRITICAL_PERFECT';
            scoreMultiplier = 1.0;
        } else if (absDiff <= win.PERFECT_3RD) {
            grade = 'PERFECT';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = 1.0;
        } else if (absDiff <= win.GREAT_3RD) {
            grade = 'GREAT';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = 0.8;
        } else if (absDiff <= win.GOOD) {
            grade = 'GOOD';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = 0.5;
        }
    }

    // EX 音符特權：只要落在 Good 視窗以內，一律強制升為 CRITICAL_PERFECT
    if (note.isEx && grade !== 'MISS') {
        grade = 'CRITICAL_PERFECT';
        subGrade = '';
        scoreMultiplier = 1.0;
    }

    // 地雷音符 Mine：碰觸判定為 MISS
    if (note.isMine) {
        grade = 'MISS';
        subGrade = 'TOO_FAST';
        scoreMultiplier = 0;
    }

    return { grade, subGrade, isFast, diffMSec, scoreMultiplier };
}

/**
 * 評估 Slide 劃軌完成評級 (對齊 MajdataPlay SlideBase.cs 官方標準)
 * @param {number} diffSec 完成時間與基準判定時間的偏差 (秒, globalTime - judgeTiming, 負數代表提前FAST, 正數代表延後LATE)
 * @param {Object} note Slide 音符物件
 * @returns {Object} 判定結果物件
 */
function evaluateSlideGrade(diffSec, note) {
    const isFast = diffSec < 0;
    const absDiff = Math.abs(diffSec);
    const diffMSec = Math.round(diffSec * 1000 * 10) / 10;

    // MajdataPlay 動態 Perfect 視窗擴展公式：
    // stayTimeMSec = LastWaitTimeSec * 1000
    // ext = min(stayTimeMSec / 4, 22 * FRAME_LENGTH_MSEC)
    const stayTimeMSec = (note.lastWaitTimeSec ?? (note.slideDuration * (note.tableConst || 0.18))) * 1000;
    const extSec = Math.min(stayTimeMSec / 4000, JUDGE_WINDOWS.SLIDE.MAX_EXT_SEC);

    const PERFECT_3RD_SEC = JUDGE_WINDOWS.SLIDE.BASE_3RD_PERFECT_SEC + extSec;
    const PERFECT_1ST_SEC = PERFECT_3RD_SEC * 0.333333;
    const PERFECT_2ND_SEC = PERFECT_3RD_SEC * 0.666666;

    let grade = 'GOOD';
    let subGrade = isFast ? 'FAST' : 'LATE';
    let scoreMultiplier = 0.5;

    if (absDiff <= PERFECT_1ST_SEC) {
        grade = 'CRITICAL_PERFECT';
        subGrade = '';
        scoreMultiplier = 1.0;
    } else if (absDiff <= PERFECT_3RD_SEC) {
        grade = 'PERFECT';
        subGrade = isFast ? 'FAST' : 'LATE';
        scoreMultiplier = 1.0;
    } else if (absDiff <= JUDGE_WINDOWS.SLIDE.GREAT_3RD_SEC) {
        grade = 'GREAT';
        subGrade = isFast ? 'FAST' : 'LATE';
        scoreMultiplier = 0.8;
    } else {
        // 參照 MajdataPlay: 只要劃完全程，哪怕超出 0.6s，最低保底均為 GOOD，絕不判 MISS
        grade = 'GOOD';
        subGrade = isFast ? 'FAST' : 'LATE';
        scoreMultiplier = 0.5;
    }

    if (note.isEx && grade !== 'MISS') {
        grade = 'CRITICAL_PERFECT';
        subGrade = '';
        scoreMultiplier = 1.0;
    }

    if (note.isMine) {
        grade = 'MISS';
        subGrade = 'TOO_FAST';
        scoreMultiplier = 0;
    }

    return { grade, subGrade, isFast, diffMSec, scoreMultiplier };
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
            note.slideFinish = false;
            note._slideJudged = false;
            note.unlocked = false;
            note.judgeQueue = null;
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
            note._fullJudgeQueue = null;
            note._totalAreasCount = 0;
        }

        if (note.time >= targetGlobalTime) {
            note._answerSoundPlayed = false;
        }

        // 若音符在判定視窗以內或未來的時間，重置判定結果與擊中狀態
        const isTouch = (note.type === 'touch');
        const lateWin = isTouch ? JUDGE_WINDOWS.TOUCH.GOOD : (note.type === 'slide' ? 0.6 : JUDGE_WINDOWS.TAP.GOOD);
        if (note.time + lateWin >= targetGlobalTime) {
            note.triggered = false;
            note.judgeResult = null;
            note._missReported = false;
            note.isHolding = false;
            note._holdPressed = false;
            note._releaseDuration = 0;
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
        if (noteT > 0.35) break;

        // 依據音符類型檢查是否在可擊中時機窗口內
        if (isTouch) {
            // Touch 音符：早按限制 150ms 內，晚按至 300ms 內
            if (noteT > JUDGE_WINDOWS.TOUCH.FAST_PERFECT || noteT < -JUDGE_WINDOWS.TOUCH.GOOD) {
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
            const noteSensor = note.touchPos + note.pos;
            const normSensor = (noteSensor === 'C1' || noteSensor === 'C2') ? 'C' : noteSensor;
            matches = sensorSet.has(normSensor);
        } else {
            // 一般音符 (tap, hold, star)
            // 外鍵與 A 區感應器 (A1~A8) 或內圈 B 感應器 (B1~B8) 均可精確觸發
            matches = sensorSet.has('A' + note.pos) || sensorSet.has('B' + note.pos);
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
                    const noteSensor = note.touchPos + note.pos;
                    const normSensor = (noteSensor === 'C1' || noteSensor === 'C2') ? 'C' : noteSensor;
                    matches = sensorSet.has(normSensor);
                } else {
                    matches = sensorSet.has('A' + note.pos) || sensorSet.has('B' + note.pos);
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
            const diffForEval = (forceDiffSec !== null) ? forceDiffSec : (globalTime - hn.time);
            const evalRes = evaluateHitGrade(diffForEval, hn);
            if (!evalRes) continue;

            hn.triggered = true;
            hn.triggeredTime = globalTime;
            hn.judgeResult = evalRes;
            spawnJudgeEffect(hn, evalRes);

            if (hn.holdDuration > 0) {
                hn._holdPressed = true;
                hn.isHolding = true;
            }
            audioManager.queueHitSound(hn, globalTime);

            // Touch Hanabi 判定音效：需要判定命中且非 TouchHold 時在此播放
            if (hn.type === 'touch' && (!hn.holdDuration || hn.holdDuration <= 0) && hn.isHanabi && evalRes.grade !== 'MISS') {
                audioManager.queueSoundSingle('hanabi', globalTime);
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
    restartBtn.addEventListener("click", () => restart(false));
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
    judgeEffects.length = 0;

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
    const entries = await normalizeFiles(files);
    const bundle = await parseProjectBundle(entries);

    if (currentProjectId) {
        await saveProjectToIdb(currentProjectId, bundle);
    }

    if (bundle.bgm) {
        const url = URL.createObjectURL(bundle.bgm);
        await audioManager.setBackgroundMusic(url, bundle.bgm);
    }

    if (bundle.maidata) {
        maidataProcess(bundle.maidata);
        resize();
    }

    if (bundle.bgImage) {
        backgroundImage = bundle.bgImage;
        gameBackgroundImage.src = URL.createObjectURL(backgroundImage);
        gameBackgroundImage.style.display = 'block';
    }

    if (bundle.bgVideo) {
        backgroundVideo = bundle.bgVideo;
        gameBackgroundVideo.src = URL.createObjectURL(backgroundVideo);
        gameBackgroundVideo.style.display = 'none';
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
    const chartData = (rawdata && rawdata["inote_" + selectedDifficulty]) ||
        (rawdata && [7, 6, 5, 4, 3, 2, 1].map(d => rawdata["inote_" + d]).find(Boolean)) || "";
    datas = simaiDecode(chartData, 0);
    if (datas) {
        linkChainSlides(datas.notes);
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
    const displayTime = timeControlSliding ? parseFloat(timeControl.value) : realTime;
    if (!timeControlSliding) {
        timeControl.value = realTime;
    }
    const ratio = Math.max(0, Math.min(1, totalTime > 0 ? (displayTime / totalTime) : 0));
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

const slideInputDebounce = debounce(() => {
    timeControlSliding = false;
    if (playing) {
        const speed = settings.playbackSpeed || 1;
        playStartTimestamp = performance.now();
        playStartRealTime = realTime;
        audioManager.setPlaybackRate(speed);
        audioManager.playBGM(realTime);
    }
    if (syncManager && syncManager.isConnected()) {
        syncManager.sendSeek(realTime);
    }
}, 150);

if (timeControl) {
    const handleSeek = (isContinuous = false) => {
        timeControlSliding = true;
        const newTime = parseFloat(timeControl.value);
        pausedTime = newTime;
        realTime = newTime;
        globalTime = realTime - musicDelay;
        playStartTimestamp = performance.now();
        playStartRealTime = realTime;

        // 拖拽/跳轉時完整重置 Note 音效播放、劃軌進度與遊玩 Hit/判定狀態記錄
        resetNotesForSeek(globalTime);
        videoSeekDebounce(realTime);

        if (isContinuous) {
            audioManager.stopAllLongSounds();
            updateTimeControlUI();
            draw();
            slideInputDebounce();
        } else {
            timeControlSliding = false;
            audioManager.stopAllLongSounds();
            if (playing) {
                const speed = settings.playbackSpeed || 1;
                startTime = performance.now() - (pausedTime * 1000 / speed);
                audioManager.setPlaybackRate(speed);
                audioManager.playBGM(realTime);
            } else {
                audioManager.clearSoundQueue();
                audioManager.stopBGM();
            }
            updateTimeControlUI();
            draw();

            if (syncManager && syncManager.isConnected()) {
                syncManager.sendSeek(realTime);
            }
        }
    };

    timeControl.addEventListener("input", () => {
        handleSeek(true);
    });

    timeControl.addEventListener("change", () => {
        handleSeek(false);
    });

    timeControl.addEventListener("pointerdown", () => {
        timeControlSliding = true;
    });

    timeControl.addEventListener("pointerup", () => {
        slideInputDebounce();
    });
}

async function play(isRemote = false, startAt = null) {
    const remote = typeof isRemote === 'boolean' ? isRemote : false;
    if (playing && startAt === null) return;
    playing = true;

    // 1. 喚醒 AudioContext，消除硬體延遲
    if (audioManager && audioManager.ctx && audioManager.ctx.state === 'suspended') {
        try {
            await audioManager.ctx.resume();
        } catch (_) { }
    }

    // 2. 嚴格對準起始時間
    const targetTime = (typeof startAt === 'number') ? startAt : realTime;
    realTime = targetTime;
    pausedTime = targetTime;
    globalTime = realTime - musicDelay;

    // 3. 立即重置音符狀態與時間軸 UI
    resetNotesForSeek(globalTime);
    updateTimeControlUI();

    const speed = settings.playbackSpeed || 1;
    const now = performance.now();
    playStartRealTime = realTime;
    playStartTimestamp = now;
    startTime = now - (pausedTime * 1000 / speed);

    if (!remote) {
        if (syncManager && syncManager.isConnected()) {
            syncManager.sendPlay(realTime, speed);
        }
    }

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
        gameBackgroundVideo.play();
    }

    audioManager.setPlaybackRate(speed);
    audioManager.playBGM(realTime);
}

function restart(isRemote = false) {
    const remote = typeof isRemote === 'boolean' ? isRemote : false;
    pause(remote);

    if (!remote) {
        if (syncManager && syncManager.isConnected()) {
            syncManager.sendRestart();
        }
    }

    activePointers.clear();
    activeKeyboardSensors.clear();
    manualInputSensors.clear();
    simulatedPlayController.reset();

    playStartTimestamp = null;
    pausedTime = 0;
    realTime = 0;
    globalTime = realTime - musicDelay;
    nowIndex = 0;

    // 不論是否正在播放，強制停止所有長音效、清空佇列與 BGM
    audioManager.stopAllLongSounds();
    audioManager.clearSoundQueue();
    audioManager.stopBGM();

    resetNotesForSeek(globalTime);

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
            n._slideJudged = false;
            n.unlocked = false;
            n.headTriggered = false;
            n.judgeQueue = null;
            n._totalAreasCount = 0;
            n._checkedCps = null;
            n._holdPressed = false;
            n._releaseDuration = 0;
            n.judgeResult = null;
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
        // [ ] 隱藏 + [ ] 顯示封面圖 -> 優先顯示影片，若無影片但有背景圖則顯示背景圖
        if (hasVideo) {
            gameBackgroundImage.style.display = 'none';
            gameBackgroundVideo.style.display = 'block';
        } else if (hasImage) {
            gameBackgroundImage.style.display = 'block';
            gameBackgroundVideo.style.display = 'none';
        } else {
            gameBackgroundImage.style.display = 'none';
            gameBackgroundVideo.style.display = 'none';
        }
    }
}

function pause(isRemote = false) {
    const remote = typeof isRemote === 'boolean' ? isRemote : false;
    if (!playing) return;
    playing = false;
    playStartTimestamp = null;

    pausedTime = realTime;

    if (!remote) {
        if (syncManager && syncManager.isConnected()) {
            syncManager.sendPause();
        }
    }

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

async function togglePlay() {
    if (playing) {
        pause();
    } else {
        await play();
    }
    tryUpdateBackgroundBrightness();
}

const saveSettingsDebounce = debounce(() => {
    idbSet('simai_settings', JSON.stringify(settings)).catch((error) => {
        console.error('儲存設定到 IndexedDB 失敗:', error);
    });
}, 300);

function setPlaybackSpeed(speed, isRemote = false) {
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
        // 本地調速時同步至對端，遠端觸發時不回送（防回聲）
        if (!isRemote && syncManager && syncManager.isConnected()) {
            syncManager.sendPlay(realTime, speed);
        }
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
        if (!timeControlSliding && audioManager && typeof audioManager.getBGMTime === 'function') {
            const bgmTime = audioManager.getBGMTime();
            if (bgmTime !== null && bgmTime !== undefined) {
                realTime = bgmTime;
                globalTime = realTime - musicDelay;
                timeUpdatedByBgm = true;
                playStartTimestamp = now;
                playStartRealTime = realTime;
            }
        }

        // 2. 音訊無時脈輸出時使用 Timer Fallback（僅在非使用者手動滑動中推進）
        if (!timeUpdatedByBgm && !timeControlSliding) {
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
    parent.judgeQueue = [];
    if (parent.nextSlide) {
        parent.nextSlide.unlocked = true;
    }
    if (parent.prevSlide && !parent.prevSlide.slideFinish) {
        forceFinishParentSlide(parent.prevSlide);
    }
}

function updateManualPlayState({ globalTime, notes, renderer, playing, timeControlSliding, dt = 0.016, sensors = null }) {
    if (!playing || timeControlSliding) return;

    const currentSensors = sensors || manualInputSensors;
    if (!currentSensors) return;

    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const noteT = note.time - globalTime;
        const noteType = note.type;
        const isHold = (note.holdDuration > 0);

        // 0. Touch 音符支援手預先接觸或劃過感應區判定 (統一觸發 triggerManualHit)
        if (noteType === 'touch' && !note.triggered) {
            // MajdataPlay 規範：早按視窗為 150ms，晚按視窗為 300ms
            // noteT = note.time - globalTime (正數代表音符在未來)
            if (noteT <= JUDGE_WINDOWS.TOUCH.FAST_PERFECT && noteT >= -JUDGE_WINDOWS.TOUCH.GOOD) {
                const noteSensor = note.touchPos + note.pos;
                const normSensor = (noteSensor === 'C1' || noteSensor === 'C2') ? 'C' : noteSensor;
                if (currentSensors.has(normSensor)) {
                    triggerManualHit(normSensor);
                }
            }
        }

        // 1. Hold & TouchHold 按壓與結算判定
        if (isHold) {
            const rawSensorId = noteType === 'touch' ? (note.touchPos + note.pos) : ('A' + note.pos);
            const sensorId = (rawSensorId === 'C1' || rawSensorId === 'C2') ? 'C' : rawSensorId;
            const isSensorPressed = currentSensors.has(sensorId) ||
                (noteType !== 'touch' && (currentSensors.has('A' + note.pos) || currentSensors.has('B' + note.pos)));

            if (noteT <= 0.05 && -noteT <= note.holdDuration) {
                if (isSensorPressed) {
                    note.isHolding = true;
                    note._holdPressed = true;
                    note._waitReleaseSec = 0; // 重置放手計時
                } else {
                    note.isHolding = false;
                    // MajdataPlay 鬆手容錯: DELUXE_HOLD_RELEASE_IGNORE_TIME_SEC = 2 * FRAME_SEC (約 33.3ms)
                    if ((note._waitReleaseSec || 0) <= JUDGE_WINDOWS.HOLD.RELEASE_IGNORE_SEC) {
                        note._waitReleaseSec = (note._waitReleaseSec || 0) + dt;
                    } else {
                        note._releaseDuration = (note._releaseDuration || 0) + dt;
                    }
                }
            } else if (-noteT > note.holdDuration) {
                note.isHolding = false;
                if (note._holdPressed || note.triggered) {
                    if (!note.holdFinish) {
                        note.holdFinish = true;
                        // MajdataPlay HoldEndJudge: 扣除頭尾忽略時間 (合計 0.45s / 0.30s)
                        const ignoreSec = (noteType === 'touch')
                            ? (JUDGE_WINDOWS.HOLD.HEAD_IGNORE_SEC + JUDGE_WINDOWS.HOLD.TAIL_IGNORE_SEC) // 0.45s
                            : (6 * FRAME_SEC + 12 * FRAME_SEC); // 0.30s
                        const realityHT = Math.max(0, note.holdDuration - ignoreSec);
                        const release = note._releaseDuration || 0;
                        const pressRatio = (realityHT <= 0) ? 1.0 : Math.max(0, Math.min(1, (realityHT - release) / realityHT));

                        // 階梯降級邏輯 (參照 MajdataPlay NoteLongDrop.HoldEndJudge)
                        const headGrade = note.judgeResult ? note.judgeResult.grade : 'PERFECT';
                        let finalGrade = headGrade;
                        let finalScoreMult = 1.0;

                        if (pressRatio >= 1.0) {
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
                            } else {
                                finalGrade = headGrade;
                                finalScoreMult = (headGrade === 'PERFECT') ? 1.0 : (headGrade === 'GREAT' ? 0.8 : 0.5);
                            }
                        } else if (pressRatio >= 0.33) {
                            finalGrade = 'GREAT';
                            finalScoreMult = 0.8;
                        } else if (pressRatio >= 0.05) {
                            finalGrade = 'GOOD';
                            finalScoreMult = 0.5;
                        } else {
                            finalGrade = 'MISS';
                            finalScoreMult = 0;
                        }

                        if (note.isEx && finalGrade !== 'MISS') {
                            finalGrade = 'CRITICAL_PERFECT';
                            finalScoreMult = 1.0;
                        }

                        note.judgeResult = {
                            grade: finalGrade,
                            subGrade: '',
                            scoreMultiplier: finalScoreMult
                        };

                        // TouchHold Hanabi 結算音效：成功按壓結算且非 MISS 時播放
                        if (note.isHanabi && finalGrade !== 'MISS' && !note._hanabiSoundPlayed) {
                            note._hanabiSoundPlayed = true;
                            audioManager.queueSoundSingle('hanabi', globalTime);
                        }
                    }
                }
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
            if (!note.judgeQueue) {
                const baseQueue = getSlideJudgeQueue(note, renderer);
                note.judgeQueue = baseQueue.map(a => a.clone());
                note._totalAreasCount = note.judgeQueue.length;
                note._fullJudgeQueue = baseQueue.map(a => a.clone());
                note.tableConst = baseQueue.tableConst ?? (note.tableConst || 0.18);
                note._debugMeta = baseQueue._debugMeta || note._debugMeta;
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
                    // 連鎖 Slide 的後續段：嚴格在前一段判定完成後解鎖進入判定，避免提早偷吃後續軌跡
                    const parentFinished = note.prevSlide ? !!note.prevSlide.slideFinish : true;
                    if (parentFinished || note.unlocked) {
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
                continue;
            }

            // 若尚未結束且隊列中仍有判定區，進行隊列狀態機檢查 (含 Lookahead 容錯)
            if (!note.slideFinish && note.judgeQueue && note.judgeQueue.length > 0) {
                while (note.judgeQueue.length > 0) {
                    const first = note.judgeQueue[0];
                    const second = note.judgeQueue.length >= 2 ? note.judgeQueue[1] : null;

                    first.check(currentSensors);

                    let consumed = 0;
                    if (second && (first.isSkippable || first.on)) {
                        second.check(currentSensors);
                        if (second.isFinished) {
                            consumed = 2;
                        } else if (second.on) {
                            consumed = 1;
                        }
                    }

                    if (consumed === 0) {
                        if (first.isFinished) {
                            consumed = 1;
                        }
                    }

                    if (consumed > 0) {
                        note.judgeQueue.splice(0, consumed);
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

                // 實時更新滑條視覺進度
                if (note._totalAreasCount > 0) {
                    const finishedCount = note._totalAreasCount - note.judgeQueue.length;
                    note.slideProgress = Math.min(1, Math.max(note.slideProgress || 0, finishedCount / note._totalAreasCount));
                }

                // 若隊列清空，標記本段完成
                if (note.judgeQueue.length === 0) {
                    note.slideFinish = true;
                    note.slideProgress = 1;
                    if (note.nextSlide) {
                        note.nextSlide.unlocked = true;
                    }
                    if (note.prevSlide && !note.prevSlide.slideFinish) {
                        forceFinishParentSlide(note.prevSlide);
                    }

                    // 僅在最後一段結算總評級 (以 MajdataPlay 官方 judgeTiming 基準計算時間差)
                    if (isGroupPartEnd && !note._slideJudged) {
                        note._slideJudged = true;
                        const diffSec = globalTime - judgeTiming;
                        note.judgeResult = evaluateSlideGrade(diffSec, note);
                        spawnJudgeEffect(note, note.judgeResult);
                    }
                }
            }

            // 超時判定 (TooLateJudge - 600ms 寬容窗口: StartTiming + Length + 0.60s)
            const tooLateTiming = startTiming + slideDuration + JUDGE_WINDOWS.SLIDE.GOOD_AREA_SEC;
            if (globalTime > tooLateTiming && !note.slideFinish) {
                note.slideFinish = true;
                if (note.nextSlide) {
                    note.nextSlide.unlocked = true;
                }
                if (isGroupPartEnd && !note._slideJudged) {
                    note._slideJudged = true;
                    // 參照 MajdataPlay SlideBase.cs lines 639-646:
                    // 若超時時只剩最後 1 區未完成，給予 LATE GOOD 容錯保底；剩餘 2 區以上才判定為 MISS
                    if (note.judgeQueue && note.judgeQueue.length === 1) {
                        note.judgeResult = { grade: 'GOOD', subGrade: 'LATE', isFast: false, diffMSec: 600, scoreMultiplier: 0.5 };
                    } else {
                        note.judgeResult = { grade: 'MISS', subGrade: '', isFast: false, diffMSec: 600, scoreMultiplier: 0 };
                    }
                    spawnJudgeEffect(note, note.judgeResult);
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

    if (settings.autoPlay !== false) {
        // 自動模式：使用 SimulatedPlay 模擬玩家感應器觸發狀態，並透過 triggerManualHit 觸發打擊
        simulatedPlayController.update({
            globalTime,
            notes,
            renderer,
            playing,
            timeControlSliding,
            onHit: triggerManualHit
        });
        activeSensors = new Set(simulatedPlayController.activeSensors);
        for (const s of manualInputSensors) {
            activeSensors.add(s);
        }
    } else {
        // 手動模式：使用玩家鍵盤/觸控實時按壓 Sensor
        simulatedPlayController.reset();
        activeSensors = manualInputSensors;
    }

    updateManualPlayState({ globalTime, notes, renderer, playing, timeControlSliding, dt, sensors: activeSensors });

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
        const isHold = (noteType === 'hold' || (noteType === 'touch' && (note.holdDuration ?? 0) > 0));
        const holdDuration = note.holdDuration ?? 0;
        const slideDelay = note.slideDelay ?? 0;
        const slideDuration = note.slideDuration ?? 0;
        const skipT = holdDuration + slideDuration + slideDelay + (note.isMine ? (note.cullSkipExtend ?? 0) : 0);

        const isTouch = (noteType === 'touch');
        const lateJudgeWindow = isTouch ? JUDGE_WINDOWS.TOUCH.GOOD : JUDGE_WINDOWS.TAP.GOOD;

        // 如果 note 還在判定視窗之後的未來，後續 note 都在更遠的未來，結束檢查
        if (noteT > lateJudgeWindow) break;

        // 依據 MajdataPlay 判定標準評分與統計 Combo (自動與手動完全統一判定標準)
        if (noteType === 'slide') {
            const isGroupPartEnd = note.lastSlide || !note.nextSlide;
            if (!isGroupPartEnd) continue;

            const slideEndT = skipT + noteT;
            if (slideEndT > 0 && !note.slideFinish) continue;

            const baseW = note.isBreak ? 5 : 3;
            const maxNoteScore = (baseW * (playScoreRes.invScore || 0) * 100) + (note.isBreak ? (playScoreRes.breakScore || 0) : 0);

            const isHit = (note.judgeResult && note.judgeResult.grade !== 'MISS') || (note.slideFinish && (!note.judgeResult || note.judgeResult.grade !== 'MISS'));
            if (isHit) {
                const mult = note.judgeResult?.scoreMultiplier ?? 1.0;
                if (note.isBreak) noteQuantity.break++;
                else noteQuantity.slide++;
                playCombo++;
                const earnedScore = ((note.isBreak ? 5 : 3) * mult) * (playScoreRes.invScore || 0) * 100 + (note.isBreak ? (playScoreRes.breakScore || 0) * mult : 0);
                playScore += earnedScore;
                lostScore += (maxNoteScore - earnedScore);
            } else {
                playCombo = 0;
                lostScore += maxNoteScore;
            }
        } else if (isHold) {
            const holdEndT = holdDuration + noteT;

            // 若音符尚未被觸發，且仍在起手有效判定窗口內，繼續等待判定
            if (!note.triggered && !note._holdPressed && !note.isHolding) {
                if (noteT >= -lateJudgeWindow) {
                    continue;
                }
                // 超過起手晚判定視窗仍未觸發，判定為 MISS
                if (!note._missReported) {
                    note._missReported = true;
                    note.judgeResult = { grade: 'MISS', subGrade: '', scoreMultiplier: 0 };
                    spawnJudgeEffect(note, note.judgeResult);
                }
                playCombo = 0;
                const baseW = note.isBreak ? 5 : 2;
                const maxNoteScore = (baseW * (playScoreRes.invScore || 0) * 100) + (note.isBreak ? (playScoreRes.breakScore || 0) : 0);
                lostScore += maxNoteScore;
                continue;
            }

            // 音符已被觸發，若 Hold 尚未結束，繼續等待長按完成
            if (holdEndT > 0) {
                continue;
            }

            const baseW = note.isBreak ? 5 : 2;
            const maxNoteScore = (baseW * (playScoreRes.invScore || 0) * 100) + (note.isBreak ? (playScoreRes.breakScore || 0) : 0);

            // Hold 已結束結算
            const isHit = (note.judgeResult && note.judgeResult.grade !== 'MISS') || note.holdFinish;
            if (isHit) {
                const mult = note.judgeResult?.scoreMultiplier ?? 1.0;
                if (note.isBreak) noteQuantity.break++;
                else noteQuantity.hold++;
                playCombo++;
                const earnedScore = ((note.isBreak ? 5 : 2) * mult) * (playScoreRes.invScore || 0) * 100 + (note.isBreak ? (playScoreRes.breakScore || 0) * mult : 0);
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
                if (note.judgeResult && note.judgeResult.grade === 'MISS') {
                    playCombo = 0;
                    lostScore += maxNoteScore;
                } else {
                    if (note.isBreak) noteQuantity.break++;
                    else noteQuantity[noteType]++;
                    playCombo++;
                    const earnedScore = ((note.isBreak ? 5 : 1) * mult) * (playScoreRes.invScore || 0) * 100 + (note.isBreak ? (playScoreRes.breakScore || 0) * mult : 0);
                    playScore += earnedScore;
                    lostScore += (maxNoteScore - earnedScore);
                }
            } else {
                // 超過晚判定視窗才算 Miss
                if (noteT < -lateJudgeWindow) {
                    if (!note._missReported) {
                        note._missReported = true;
                        note.judgeResult = { grade: 'MISS', subGrade: '', scoreMultiplier: 0 };
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

            // 1. Answer 節拍提示音：始終在 note.time 準時播放，不隨玩家輸入改變時間
            const answerDiffT = note.time - globalTime;
            if (answerDiffT <= lookAhead && !note._answerSoundPlayed) {
                if (!note.isMine && !(noteType === 'slide' && !note.firstSlide) && answerDiffT >= -0.1) {
                    audioManager.queueSoundSingle('answer', note.time);
                }
                note._answerSoundPlayed = true;
            }

            // 2. Slide 開始音效：在 Slide 啟動時刻 (note.time + slideDelay) 準時播放
            const startTargetT = note.time + (note.slideDelay ?? 0);
            const startNoteT = startTargetT - globalTime;
            if (startNoteT <= lookAhead && !note._slideStartPlayed) {
                if (noteType === "slide" && !note.isMine && (note.firstSlide || !note.prevSlide)) {
                    if (startNoteT >= -0.1) {
                        audioManager.queueSound(note, startTargetT);
                    }
                }
                note._slideStartPlayed = true;
                note._startEffectPlayed = true;
            }

            // 3. 結束音效 (含前瞻，Hanabi 音效移至判定命中時播放，不再隨音符結束無腦播放)
            const endTargetT = note.time + skipT;
            const endNoteT = endTargetT - globalTime;
            if (endNoteT <= lookAhead && !note._endEffectPlayed) {
                const shouldPlayEndSound =
                    (noteType === "slide" && note.lastSlide && note.isBreak && (note.slideFinish || (note.slideProgress ?? 0) >= 0.5)) ||
                    (note.holdDuration !== undefined && noteType !== "tap" && !settings.notPlayHoldEnd && (note._holdPressed || note.holdFinish));
                if (shouldPlayEndSound && endNoteT >= -0.1) {
                    audioManager.queueSound(note, endTargetT);
                }
                note._endEffectPlayed = true;
            }
        } else {
            // 暫停或拖動時重置狀態
            const lookAhead = 0.1;
            const startTargetT = note.time + (note.slideDelay ?? 0);
            const endTargetT = note.time + skipT;
            if (note.time - globalTime > lookAhead) {
                note._answerSoundPlayed = false;
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
        playScoreMinus,
        noteQuantity,
        playScoreRes,
        nowIndex,
    });

    // 渲染手動打擊判定即時反饋特效 (PERFECT / GREAT / GOOD / MISS + FAST / LATE)
    renderJudgeEffects(ctx);

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

        if (syncManager && syncManager.isConnected()) {
            syncManager.sendPause();
            syncManager.sendSeek(0);
            await syncManager.pushProject();
        }

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
    openProjectManagerModal({
        currentProjectId,
        onLoadProject: async (projectId) => {
            await loadProject(projectId);
        },
        onDeleteCurrentProject: async () => {
            currentProjectId = null;
            localStorage.removeItem('simai_lastProjectId');
            setDataEmpty();
            simpleToast({ content: '已清空播放狀態，未指定專案', type: 'info', timeout: 1500 });
        },
        onImportFolder: (onSuccess) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.webkitdirectory = true;
            input.onchange = async (e) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    const newId = await projectCreate('匯入專案');
                    currentProjectId = newId;
                    localStorage.setItem('simai_lastProjectId', currentProjectId);
                    setDataEmpty();
                    await handleFolderInput(files);
                    if (rawdata?.title) {
                        await projectUpdateName(newId, rawdata.title);
                    }
                    draw();
                    resize();
                    updateTimeControlUI();
                    simpleToast({ content: '已匯入並播放專案', type: 'success', timeout: 1500 });
                    if (typeof onSuccess === 'function') onSuccess();
                }
            };
            input.click();
        },
        onImportZip: (onSuccess) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.zip';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const newId = await projectCreate(file.name.replace(/\.zip$/i, ''));
                        currentProjectId = newId;
                        localStorage.setItem('simai_lastProjectId', currentProjectId);
                        setDataEmpty();
                        const zip = await JSZip.loadAsync(file);
                        await handleFolderInput(zip.files);
                        if (rawdata?.title) {
                            await projectUpdateName(newId, rawdata.title);
                        }
                        draw();
                        resize();
                        updateTimeControlUI();
                        simpleToast({ content: '已匯入並播放專案', type: 'success', timeout: 1500 });
                        if (typeof onSuccess === 'function') onSuccess();
                    } catch (err) {
                        console.error('ZIP 匯入失敗:', err);
                        simpleToast({ content: `匯入失敗：${err.message || err}`, type: 'error', timeout: 3000 });
                    }
                }
            };
            input.click();
        },
        openSettings,
        simpleToast,
        popupWindow,
        assetPrefix: '../'
    });
}



// ============================================================
// 設定面板 (Settings Popup)
// ============================================================

function openSettings(initialTabIndex = 0) {
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
            element.style.cssText = 'width:20px; height:20px; flex:0 0 auto; cursor:pointer; margin: 0;';
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
            wrapper.appendChild(text);
            wrapper.appendChild(element);
            row.appendChild(wrapper);
            return row;
        }

        // 3. Object (子屬性折疊選單)
        if (element.dataset && element.dataset.type === 'object-container') {
            row.className = 'popup-setting-row';
            row.style.flexDirection = 'column';
            row.style.alignItems = 'stretch';

            const header = document.createElement('div');
            header.className = 'popup-setting-wrapper';
            header.style.padding = '4px 0';
            header.style.userSelect = 'none';
            header.innerHTML = `<span>${labelText}</span><span class="arrow-icon" style="transition:transform 0.2s; transform: rotate(0deg); font-size:12px;">▼</span>`;

            const subBody = element;
            subBody.className = 'popup-setting-subbody';

            header.addEventListener('click', () => {
                const isHidden = subBody.style.display === 'none';
                subBody.style.display = isHidden ? 'flex' : 'none';
                header.querySelector('.arrow-icon').style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
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
            o.textContent = opt.label.startsWith('settings.') ? t(opt.label) : opt.label;
            if (opt.value == value) o.selected = true;
            select.appendChild(o);
        });
        select.style.cursor = 'pointer';
        return select;
    };

    const inputRefs = {};
    let popupCtx = null;

    const playSettingsConfig = [
        {
            label: 'settings.tabs.general',
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
                    id: 'autoPlay', type: 'checkbox', label: 'Auto Play (自動打擊)', def: defaultSettings.autoPlay,
                    apply: (val) => {
                        settings.autoPlay = val;
                        simulatedPlayController.reset();
                        updateAutoPlayUI();
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

    // =========================================================
    // 同步 (Sync) 標籤頁
    // =========================================================
    const connSection = addTab(t('settings.tabs.sync') || '同步');

    const openSyncBtn = document.createElement('button');
    openSyncBtn.className = 'popup-button';
    openSyncBtn.textContent = t('settings.connection.btnOpen') || '開啟';
    openSyncBtn.style.padding = '6px 18px';
    openSyncBtn.addEventListener('click', () => {
        syncManager.openSyncModal({
            onBeforeConnect: async () => {
                if (audioManager.ctx && audioManager.ctx.state === 'suspended') {
                    try {
                        await audioManager.ctx.resume();
                    } catch (_) { }
                }
            }
        });
    });

    // 1. Google Drive 雲端同步區塊
    const gdriveBox = document.createElement('div');
    gdriveBox.style.cssText = 'display:flex; flex-direction:column; gap:10px; padding:12px; background:#181818; border:1px solid #333; border-radius:6px; margin-bottom:12px; width:100%; box-sizing:border-box;';

    const gdriveTitle = document.createElement('div');
    gdriveTitle.style.cssText = 'font-weight:600; font-size:13px; color:#fff; display:flex; align-items:center; gap:6px;';
    gdriveTitle.innerHTML = `<span class="material-symbols-outlined" style="color:#4a90e2; font-size:20px;">cloud</span>${t('settings.gdrive.title') || 'Google Drive 雲端同步'}`;
    gdriveBox.appendChild(gdriveTitle);

    const gdriveStatusRow = document.createElement('div');
    gdriveStatusRow.style.cssText = 'display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; font-size:12px; color:#aaa; gap:8px 12px;';

    const statusText = document.createElement('span');
    statusText.style.lineHeight = '1.4';
    const gdriveBtnContainer = document.createElement('div');
    gdriveBtnContainer.style.flexShrink = '0';

    const updateGdriveUI = () => {
        const loggedIn = googleDriveService.isLoggedIn();
        const user = googleDriveService.getCurrentUser();
        gdriveBtnContainer.innerHTML = '';

        if (loggedIn) {
            statusText.textContent = t('settings.gdrive.loggedInAs', { account: user?.email || user?.name || 'Google 使用者' });
            statusText.style.color = '#4caf50';
            statusText.style.whiteSpace = 'normal';
            statusText.style.wordBreak = 'break-all';

            const logoutBtn = document.createElement('button');
            logoutBtn.type = 'button';
            logoutBtn.className = 'popup-button';
            logoutBtn.style.cssText = 'padding:6px 14px; font-size:12px; cursor:pointer; flex-shrink:0; background:#3a2020; border-color:#662222; color:#fff; border-radius:6px;';
            logoutBtn.textContent = t('settings.gdrive.logoutBtn') || '登出帳號';
            logoutBtn.onclick = () => {
                googleDriveService.logout();
                simpleToast({ content: t('settings.gdrive.logoutSuccess') || '已登出 Google 帳號', type: 'info', timeout: 1500 });
                updateGdriveUI();
            };
            gdriveBtnContainer.appendChild(logoutBtn);
        } else {
            statusText.textContent = t('settings.gdrive.notLoggedIn') || '尚未登入';
            statusText.style.color = '#888';
            statusText.style.whiteSpace = 'nowrap';

            const googleBtn = createGoogleSignInButton({
                theme: 'dark',
                size: 'small',
                text: t('settings.gdrive.loginBtn') || '登入 Google 帳號',
                onClick: async () => {
                    try {
                        googleBtn.setLoading(true, t('settings.gdrive.loggingIn') || '正在登入...');
                        await googleDriveService.login();
                        simpleToast({ content: t('settings.gdrive.loginSuccess') || 'Google Drive 登入成功！', type: 'success', timeout: 1500 });
                        updateGdriveUI();
                    } catch (err) {
                        console.error('[GoogleDrive] 登入錯誤:', err);
                        simpleToast({ content: t('settings.gdrive.loginError', { error: err.message || err }), type: 'error', timeout: 3000 });
                        updateGdriveUI();
                    }
                }
            });
            gdriveBtnContainer.appendChild(googleBtn);
        }
    };

    updateGdriveUI();
    gdriveStatusRow.appendChild(statusText);
    gdriveStatusRow.appendChild(gdriveBtnContainer);
    gdriveBox.appendChild(gdriveStatusRow);
    connSection.appendChild(gdriveBox);

    connSection.appendChild(createRow(t('settings.connection.syncView') || '設定同步檢視', openSyncBtn));

    switchTab(initialTabIndex);

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
