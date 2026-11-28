import { idbGet, idbSet, idbGetProject, idbSetProject, projectList, migrateFromLegacy } from '../Scripts/indexDB.js';
import { saveProjectFilesToIDB } from '../Scripts/features/fileHandler.js';
import { createSettingSectionTitle, createSettingRow, createSettingRangeInput, createSettingCheckbox, createSettingDropdown, createSettingColorInput } from '../Scripts/modals/settingControls.js';
import { applyThemeSettings, applyThemeFromBackup, DEFAULT_THEME_MODE, DEFAULT_ACCENT_COLOR } from '../Scripts/core/themeManager.js';
import { openProjectManager } from '../Scripts/modals/projectManager.js';
import { SimaiRenderer } from './renderer.js';
import { simaiDecode } from '../Scripts/decode.js';
import { cullSlideBucket } from '../Scripts/core/simaiLogicControler.js';
import { buildPlayScoreRes, getNoteBaseScores, getNoteJudgeScore, calcAchievement, calcAchievementMinus } from '../Scripts/core/noteScore.js';
import { parseMaidata, disableNavigationGestures, loadAllImages, scaleBase, noteRefPos, touchRefPos, audioManager, debounce, popupWindow, simpleToast, formatCapsuleTime, clamp, imgNotExists } from '../Scripts/helper.js';
import { parseCanvasAspectRatio, fitRectToAspectRatio } from '../Scripts/core/panelLayout.js';
import { t, getAvailableLanguages, getLangSetting, onLanguageChange, setLang } from '../Scripts/i18n.js';
import { SimulatedPlayController } from './simplay.js';
import { getSlideJudgeQueue, getSlideStepState, getSlideBranchPath } from './slidetables.js';
import { toggleSlideDebug, isSlideDebugEnabled, renderSlideDebugOverlay, updateSlideDebugPanel, setSlideDebugToggleCallback } from './slideDebug.js';

disableNavigationGestures();
try { applyThemeFromBackup(); } catch (_) { }
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
    showOutline: true, // 顯示判定線
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
    showBackgroundWhenPaused: true,
    showCoverWhenPaused: false, // 暫停時顯示封面圖
    enableVideo: true, // 啟用影片背景（如果有的話）
    renderSurroundingAuxiliaryText: true,
    splitRatio: 0.5, // 左右面板分割比例
    slideIllegalRed: false,
    canvasAspectRatio: 'auto',
    themeMode: DEFAULT_THEME_MODE,
    accentColor: DEFAULT_ACCENT_COLOR,
    showUI: false,
    showUIPosition: 'top-left',
    timeDisplayCapsule: true,
    timeDisplayCapsulePosition: 'center',
    richHitEffect: 'wmcx', // 'off' | 'wmcx' | 'standard'
    drawHanabiEffect: true,
    richHanabi: false,
    simplayPerfect: true,
    simplayUseButton: true,
    randomOffset: 0,
    // Sound & Playback
    playHoldEnd: true,
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
const usedSensorsThisFrame = new Set();

const _pc = document.getElementById("playControls");
const playToolbar = document.getElementById("playToolbar");
const hideToolbarBtn = document.getElementById("hidePlayToolbar");
const showToolbarBtn = document.getElementById("showPlayToolbar");

function getControlButton(action) {
    const btn = document.querySelector(`#app [data-buttonAction="${action}"]`);
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
 * 依據 sdgb NotesReader.IsTouchNext 與 Touch-Group 相鄰規範判斷兩個 Touch 音符是否相鄰
 * - B 與 B: 環狀相鄰 (差 1 或 7)
 * - B 與 C: 總相鄰 (C 與 C 亦相鄰)
 * - B 與 E: E[i] 鄰接 B[i] 與 B[i-1] (即 B[p] 鄰接 E[p] 與 E[p+1])
 * - B 與 A: 同號相鄰 (A[p] <-> B[p])
 * - E 與 A: E[i] 鄰接 A[i] 與 A[i-1] (即 A[p] 鄰接 E[p] 與 E[p+1])
 * - E 與 D: 同號相鄰 (D[p] <-> E[p])
 * - A 與 D: D[i] 鄰接 A[i] 與 A[i-1] (即 A[p] 鄰接 D[p] 與 D[p+1])
 */
function areTouchNotesAdjacent(a, b) {
    if (a === b) return true;
    const typeA = a.touchPos;
    const typeB = b.touchPos;
    const posA = Number(a.pos) || 1;
    const posB = Number(b.pos) || 1;

    if (typeA === 'C' && typeB === 'C') return true;
    if (typeA === 'C') return typeB === 'B';
    if (typeB === 'C') return typeA === 'B';

    // B 與 B: 最近的兩個 (如 B1 和 B8/B2)
    if (typeA === 'B' && typeB === 'B') {
        const diff = Math.abs(posA - posB);
        return diff === 1 || diff === 7;
    }

    // 順時針同夾角鄰接關係：{outer}(p) 鄰接 {inner}(p) 與 {inner}(p%8 + 1)
    // E_p / D_p 位於 p 與 p-1 之間，故同時鄰接 B_p, B_{p-1} 與 A_p, A_{p-1}
    if ((typeA === 'B' || typeA === 'A') && (typeB === 'E' || (typeA === 'A' && typeB === 'D'))) {
        return posB === posA || posB === (posA % 8) + 1;
    }
    if ((typeB === 'B' || typeB === 'A') && (typeA === 'E' || (typeB === 'A' && typeA === 'D'))) {
        return posA === posB || posA === (posB % 8) + 1;
    }

    // B <-> A、D <-> E 同編號位置正對相鄰
    if ((typeA === 'A' && typeB === 'B') || (typeA === 'B' && typeB === 'A')) return posA === posB;
    if ((typeA === 'D' && typeB === 'E') || (typeA === 'E' && typeB === 'D')) return posA === posB;

    return false;
}

/**
 * 依據 sdgb NotesReader.calcEach & IsEachTouchTapLink 規範構建 Touch-Group
 * 注意：僅一般 TouchTap 參與 Touch-Group 連結，TouchHold 不納入容錯群組
 */
function linkTouchGroups(notes) {
    if (!notes || !Array.isArray(notes)) return;

    // 1. 依時間聚合同時出現的一般 Touch 音符 (排除 TouchHold 與 Mine)
    const timeBuckets = new Map();
    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.type !== 'touch') continue;
        n.touchGroup = null;
        if (n.isMine || n.isHold || (n.holdDuration && n.holdDuration > 0)) continue;
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
    if (!group || group.size < 3 || group.isResolved || !lastResult || lastResult.grade === 'MISS') return;
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
                    if (remainNote.holdDuration > 0 || remainNote.isHold) {
                        renderer.queueHitEffect(null, 0, remainNote.judgeResult, posInfo.x, posInfo.y);
                    } else {
                        renderer.queueTouchEffect(0, remainNote.judgeResult, posInfo.x, posInfo.y);
                    }
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

function lowerBound(arr, val) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid] < val) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function upperBound(arr, val) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid] <= val) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function createFreshScoreState() {
    return {
        settledCursor: 0,
        pendingNotes: [],
        pendingSet: new Set(),
        committedNormalScore: 0,
        committedBonusScore: 0,
        committedLostNormalScore: 0,
        committedLostBonusScore: 0,
        committedQty: { tap: 0, hold: 0, slide: 0, touch: 0, break: 0 },
        committedCombo: 0,
        pendingComboEvents: [],
        lastGlobalTime: -Infinity,
    };
}

function preparePlayNotesIndex(dataObj) {
    if (!dataObj || !Array.isArray(dataObj.notes)) return;
    const notes = dataObj.notes;
    const len = notes.length;
    const noteTimes = new Float64Array(len);
    const nsTimes = [];
    const nsIndexes = [];
    const longNotes = [];
    const slowFutureNotes = [];
    let isSorted = true;
    let minAbsHispeed = 1;

    for (let i = 0; i < len; i++) {
        const n = notes[i];
        noteTimes[i] = n.time;
        if (i > 0 && n.time < notes[i - 1].time) {
            isSorted = false;
        }
        if (n.type !== 'slide' && n.index !== undefined && n.index !== null) {
            nsTimes.push(n.time);
            nsIndexes.push(n.index);
        }
        const skipT = (n.holdDuration ?? 0) + (n.slideDuration ?? 0) + (n.slideDelay ?? 0) + (n.cullSkipExtend ?? 0);
        if (skipT + 1.0 > 3.5) {
            longNotes.push(i);
        }
        const hs = Math.abs(n.hispeed ?? 1);
        if (hs < 0.25) {
            slowFutureNotes.push(i);
        } else if (hs < minAbsHispeed) {
            minAbsHispeed = hs;
        }
    }

    dataObj._noteTimes = noteTimes;
    dataObj._nonSlideTimes = new Float64Array(nsTimes);
    dataObj._nonSlideIndexes = new Int32Array(nsIndexes);
    dataObj._longNotes = longNotes;
    dataObj._slowFutureNotes = slowFutureNotes;
    dataObj._isSorted = isSorted;
    dataObj._minAbsHispeed = minAbsHispeed;
    dataObj._playRuntime = {
        judgeCursor: 0,
        judgeActiveHolds: [],
        judgeHoldSet: new Set(),
        stateCursor: 0,
        stateActiveLongs: [],
        stateLongSet: new Set(),
        lastStateTime: -Infinity,
        scoreState: createFreshScoreState(),
    };
}

function resetPlayRuntimeCursors(dataObj) {
    if (!dataObj) return;
    if (Array.isArray(dataObj.notes)) {
        for (let i = 0; i < dataObj.notes.length; i++) {
            dataObj.notes[i]._settledCommitted = false;
        }
    }
    if (!dataObj._playRuntime) {
        preparePlayNotesIndex(dataObj);
        return;
    }
    const rt = dataObj._playRuntime;
    rt.judgeCursor = 0;
    rt.judgeActiveHolds.length = 0;
    rt.judgeHoldSet.clear();
    rt.stateCursor = 0;
    rt.stateActiveLongs.length = 0;
    rt.stateLongSet.clear();
    rt.lastStateTime = -Infinity;
    rt.scoreState = createFreshScoreState();
}

let datas = simaiDecode();
if (datas) {
    linkChainSlides(datas.notes);
    linkTouchGroups(datas.notes);
    preparePlayNotesIndex(datas);
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

let savedSettings = await idbGet('simai_settings');
if (!savedSettings || savedSettings === '{}') {
    try {
        savedSettings = localStorage.getItem('simai_settings_backup');
    } catch (_) { }
}
if (savedSettings) {
    try {
        const parsed = JSON.parse(savedSettings);
        if (parsed && typeof parsed === 'object') {
            settings = { ...defaultSettings, ...parsed };
            const legacyInvertedMap = [
                ['hideOutline', 'showOutline'],
                ['noBorder', 'showBorder'],
                ['disableVideo', 'enableVideo'],
                ['hideBackgroundWhenPaused', 'showBackgroundWhenPaused'],
                ['notPlayHoldEnd', 'playHoldEnd'],
                ['disableSyntaxCheck', 'enableSyntaxCheck'],
                ['disablePreviewWaveform', 'enablePreviewWaveform'],
            ];
            for (const [oldKey, newKey] of legacyInvertedMap) {
                if (oldKey in parsed) {
                    if (!(newKey in parsed)) {
                        settings[newKey] = !parsed[oldKey];
                    }
                    delete settings[oldKey];
                }
            }
            if (defaultSettings.sfxVolumes) {
                settings.sfxVolumes = { ...defaultSettings.sfxVolumes, ...(parsed.sfxVolumes || {}) };
            }
            if (settings.autoPlay === true) {
                settings.autoPlay = 'computer';
            } else if (settings.autoPlay === false) {
                settings.autoPlay = 'off';
            }
            if (!('richHitEffect' in parsed)) {
                if (parsed.drawHitEffect === false) {
                    settings.richHitEffect = 'off';
                } else if (parsed.richHitEffectBeta === true) {
                    settings.richHitEffect = 'standard';
                } else if ('drawHitEffect' in parsed || 'richHitEffectBeta' in parsed) {
                    settings.richHitEffect = 'wmcx';
                }
            }
            delete settings.drawHitEffect;
            delete settings.richHitEffectBeta;
        } else {
            settings = { ...defaultSettings };
        }
    } catch (e) {
        console.warn('解析已儲存設定失敗:', e);
        settings = { ...defaultSettings };
    }
} else {
    settings = { ...defaultSettings };
}
applyThemeSettings({
    themeMode: settings.themeMode ?? DEFAULT_THEME_MODE,
    accentColor: settings.accentColor ?? DEFAULT_ACCENT_COLOR,
});
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
const _comboEvents = [];
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

// --- 墨滢-moying maimai 判定全解標準系統 (JudgeEngine) ---
// 注意：必須於模組頂層初次 resize() -> draw() 呼叫前宣告，避免 TDZ ReferenceError
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
        // 參照 NoteJudge.cs judgeParamTbl[3]:
        // -9~+9 幀為 Critical；+9~+10.5~+12 幀為 Late Perfect (2550/2500)；
        // +12~+13~+14~+15 幀為 Late Great (2000/1500/1250)；+15~+18 幀為 Late Good (1000)
        FAST_WINDOW: 36 * FRAME_SEC,           // 提前擦玻璃容許窗口 (600ms)
        CRITICAL_PERFECT: 9 * FRAME_SEC,       // -9 至 +9 幀 (150ms) 均為 Critical Perfect
        PERFECT_LATE_2ND: 10.5 * FRAME_SEC,    // +9 至 +10.5 幀
        PERFECT_LATE: 12 * FRAME_SEC,          // +10.5 至 +12 幀 (200ms)
        GREAT_LATE_1ST: 13 * FRAME_SEC,        // +12 至 +13 幀
        GREAT_LATE_2ND: 14 * FRAME_SEC,        // +13 至 +14 幀
        GREAT_LATE: 15 * FRAME_SEC,            // +14 至 +15 幀 (250ms)
        GOOD_LATE: 18 * FRAME_SEC              // +15 至 +18 幀 (300ms)
    },
    SLIDE: {
        // 參照 NoteJudge.cs judgeParamTbl[2] (SlideOut) 與 GetSlideJudgeTiming
        BASE_3RD_PERFECT_SEC: 14 * FRAME_SEC,  // 基礎 ±14 幀
        FAST_GREAT_1ST_SEC: 18 * FRAME_SEC,    // Fast -14 ~ -18 幀
        FAST_GREAT_2ND_SEC: 22 * FRAME_SEC,    // Fast -18 ~ -22 幀
        FAST_GREAT_3RD_SEC: 26 * FRAME_SEC,    // Fast -22 ~ -26 幀
        LATE_GREAT_1ST_SEC: 16 * FRAME_SEC,    // Late +14 ~ +16 幀
        LATE_GREAT_2ND_SEC: 22 * FRAME_SEC,    // Late +16 ~ +22 幀
        LATE_GREAT_3RD_SEC: 26 * FRAME_SEC,    // Late +22 ~ +26 幀
        GOOD_AREA_SEC: 36 * FRAME_SEC          // ±36 幀 (600.00ms)
    },
    HOLD: {
        RELEASE_IGNORE_SEC: 3 * FRAME_SEC,     // 0.0500s (3 幀鬆開等待保護，3 幀內重按不計入鬆手)
        HEAD_IGNORE_SEC: 6 * FRAME_SEC,        // 0.1000s (Hold 起始忽略 6 幀)
        TOUCH_HEAD_IGNORE_SEC: 15 * FRAME_SEC, // 0.2500s (Touch-Hold 起始忽略 15 幀)
        TAIL_IGNORE_SEC: 12 * FRAME_SEC        // 0.2000s (結尾提前放開忽略 12 幀)
    }
};

const canvasContainer = document.getElementById("canvasContainer");

function applyPlayCanvasAspectRatio() {
    if (!canvasContainer) return;
    const ratioVal = settings?.canvasAspectRatio || 'auto';
    if (!parseCanvasAspectRatio(ratioVal)) {
        canvasContainer.classList.remove('aspect-ratio-constrained');
        canvasContainer.style.left = '';
        canvasContainer.style.top = '';
        canvasContainer.style.width = '';
        canvasContainer.style.height = '';
        return;
    }
    const appRect = canvasContainer.parentElement?.getBoundingClientRect()
        || { width: window.innerWidth, height: window.innerHeight };
    const playH = _pc.offsetHeight;
    const toolbarHeight = playToolbar.inert ? 0 : playToolbar.offsetHeight;
    const rect = fitRectToAspectRatio({
        left: 0,
        top: toolbarHeight,
        width: Math.max(1, appRect.width),
        height: Math.max(1, appRect.height - playH - toolbarHeight),
    }, ratioVal);
    canvasContainer.classList.add('aspect-ratio-constrained');
    canvasContainer.style.left = `${rect.left}px`;
    canvasContainer.style.top = `${rect.top}px`;
    canvasContainer.style.width = `${rect.width}px`;
    canvasContainer.style.height = `${rect.height}px`;
}

function getPlayDPR(win = window) {
    if (settings?.lowRes) return 1;
    const raw = win.devicePixelRatio || 1;
    const isCoarseMobile = typeof win.matchMedia === 'function'
        && win.matchMedia('(pointer: coarse)').matches
        && Math.min(win.innerWidth || 0, win.innerHeight || 0) <= 900;
    return Math.min(raw, isCoarseMobile ? 1.5 : 2);
}

function resize() {
    applyPlayCanvasAspectRatio();
    const dpr = getPlayDPR();
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

function setToolbarCollapsed(collapsed) {
    playToolbar.inert = collapsed;
    showToolbarBtn.hidden = !collapsed;
    (collapsed ? showToolbarBtn : hideToolbarBtn).focus({ preventScroll: true });
    resize();
}

hideToolbarBtn.addEventListener('click', () => setToolbarCollapsed(true));
showToolbarBtn.addEventListener('click', () => setToolbarCollapsed(false));

const playPauseBtn = getControlButton("play/pause");
const restartBtn = getControlButton("reset");
const autoPlayBtn = getControlButton("autoPlay");
const hideBtn = getControlButton("hide");
const hideShowBtn = document.getElementById("showPlayControlsBtn");
const projectBtn = getControlButton("openProject");
const difficultySelect = document.getElementById("playDifficulty");
const settingsBtn = getControlButton("settings");
const fullscreenBtn = getControlButton("fullscreen");

const speedControlButton = getControlButton("speed");
const speedPopover = document.getElementById("speedPopover");
const playbackSpeedInput = document.getElementById("speedPopoverInput");
const playbackSpeedBtn = document.getElementById("speedPopoverReset");
const playbackSpeedMinusBtn = document.getElementById("speedPopoverMinus");
const playbackSpeedAddBtn = document.getElementById("speedPopoverAdd");
const playCapsules = document.getElementById("playCapsulesContainer");
const timeDisplayCapsule = document.getElementById("timeDisplayCapsule");
const speedDisplayCapsule = document.getElementById("speedDisplayCapsule");
function updatePlayCapsules() {
    playCapsules.hidden = settings.timeDisplayCapsule === false;
    const position = settings.timeDisplayCapsulePosition;
    playCapsules.dataset.position = position === 'left' || position === 'right' ? position : 'center';
}
updatePlayCapsules();
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
        canvasOutline.style.display = settings.showOutline === false ? 'none' : '';
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
    const icons = { computer: 'computer', simulate: 'smart_toy', off: 'touch_app' };
    autoPlayBtn.children[0].textContent = icons[mode];
    autoPlayBtn.title = t(`settings.autoPlayOpts.${mode}`);
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

        simpleToast({ content: t(`settings.autoPlayOpts.${nextMode}`), type: 'info', timeout: 1000 });
    });
}
onLanguageChange(updateAutoPlayUI);
updateAutoPlayUI();

// 手動遊玩輸入與鍵盤/觸控對應 (Manual Play Controls)
// 外鍵 (Buttons): K1~K8 (只能判定一般外圈 tap/hold/star，不能觸發觸控螢幕內部的 A 區 Touch 感應器)
// 觸控感應區 (Touch Sensors): A1~A8, B1~B8, C, D1~D8, E1~E8
const KEY_TO_SENSOR = {
    '1': 'K1', '2': 'K2', '3': 'K3', '4': 'K4', '5': 'K5', '6': 'K6', '7': 'K7', '8': 'K8',
    'a': 'K1', 's': 'K2', 'd': 'K3', 'f': 'K4', 'j': 'K5', 'k': 'K6', 'l': 'K7', ';': 'K8',
    'A': 'K1', 'S': 'K2', 'D': 'K3', 'F': 'K4', 'J': 'K5', 'K': 'K6', 'L': 'K7',
    'q': 'K8', 'w': 'K1', 'e': 'K2', 'r': 'K3', 'u': 'K4', 'i': 'K5', 'o': 'K6', 'p': 'K7',
    ' ': 'C', 'c': 'C', 'C': 'C',
    'Numpad1': 'K5', 'Numpad2': 'K6', 'Numpad3': 'K7', 'Numpad4': 'K4',
    'Numpad5': 'C', 'Numpad6': 'K8', 'Numpad7': 'K3', 'Numpad8': 'K2', 'Numpad9': 'K1'
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
            case 'f': {
                e.preventDefault();
                fullscreenBtn?.click();
                return;
            }
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
                simpleToast({ content: t(nextState ? 'toast.slideDebugOpened' : 'toast.slideDebugClosed'), type: 'info', timeout: 1200 });
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

        // 參照 NoteJudge.cs judgeParamTbl[3] (Touch):
        // -9~+9 幀 (含提前擦玻璃) 為 CP；之後依 10.5 / 12 / 13 / 14 / 15 / 18 幀細分 LatePerfect / LateGreat / LateGood
        if (isFast || diffSec <= win.CRITICAL_PERFECT) {
            grade = 'CRITICAL_PERFECT';
            subGrade = '';
            scoreMultiplier = 1.0;
            breakMultiplier = 1.0;
            breakScoreValue = 2600;
        } else if (diffSec <= win.PERFECT_LATE_2ND) {
            grade = 'PERFECT';
            subGrade = 'LATE';
            scoreMultiplier = 1.0;
            breakMultiplier = 0.75;
            breakScoreValue = 2550;
        } else if (diffSec <= win.PERFECT_LATE) {
            grade = 'PERFECT';
            subGrade = 'LATE';
            scoreMultiplier = 1.0;
            breakMultiplier = 0.5;
            breakScoreValue = 2500;
        } else if (diffSec <= win.GREAT_LATE_1ST) {
            grade = 'GREAT';
            subGrade = 'LATE';
            scoreMultiplier = 0.8;
            breakMultiplier = 0.4;
            breakScoreValue = 2000;
        } else if (diffSec <= win.GREAT_LATE_2ND) {
            grade = 'GREAT';
            subGrade = 'LATE';
            scoreMultiplier = note.isBreak ? 0.6 : 0.8;
            breakMultiplier = 0.4;
            breakScoreValue = 1500;
        } else if (diffSec <= win.GREAT_LATE) {
            grade = 'GREAT';
            subGrade = 'LATE';
            scoreMultiplier = note.isBreak ? 0.5 : 0.8;
            breakMultiplier = 0.4;
            breakScoreValue = 1250;
        } else if (diffSec <= win.GOOD_LATE) {
            grade = 'GOOD';
            subGrade = 'LATE';
            scoreMultiplier = note.isBreak ? 0.4 : 0.5;
            breakMultiplier = 0.3;
            breakScoreValue = 1000;
        } else {
            // +19 幀之後: Too Late (MISS)，不顯示 LATE 副標籤
            grade = 'MISS';
            subGrade = '';
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

    const { normalScore, bonusScore } = getNoteJudgeScore(note, {
        grade,
        scoreMultiplier,
        breakMultiplier,
        breakScoreValue,
    });
    return { grade, subGrade, isFast, diffMSec, isBreak: !!note.isBreak, scoreMultiplier, breakMultiplier, breakScoreValue, normalScore, breakBonus: bonusScore };
}
/*
 * @param {number} diffSec 完成時間與基準判定時間的偏差 (秒, globalTime - judgeTiming, 負數代表提前FAST, 正數代表延後LATE)
 * @param {Object} note Slide 音符物件
 * @returns {Object} 判定結果物件
 */
function evaluateSlideGrade(diffSec, note) {
    const win = JUDGE_WINDOWS.SLIDE;
    const isFast = diffSec < 0;
    const absDiff = Math.abs(diffSec);
    const diffMSec = Math.round(diffSec * 1000 * 10) / 10;

    // 參照 NoteJudge.cs GetSlideJudgeTiming:
    // ext = lastWaitTime / 4，擴大後的 CP 視窗夾擠於 ±36 幀 (GOOD_AREA_SEC) 內；
    // 超出 CP 後依 Fast (-14/-18/-22/-26/-36) 與 Late (+14/+16/+22/+26/+36) 非對稱區間判定
    const lastWaitSec = note.lastWaitTimeSec ?? (note.slideDuration * (note.tableConst || 0.18));
    const extSec = lastWaitSec / 4;
    const PERFECT_SEC = Math.min(win.GOOD_AREA_SEC, win.BASE_3RD_PERFECT_SEC + extSec);
    const great1st = isFast ? win.FAST_GREAT_1ST_SEC : win.LATE_GREAT_1ST_SEC;
    const great2nd = isFast ? win.FAST_GREAT_2ND_SEC : win.LATE_GREAT_2ND_SEC;
    const great3rd = isFast ? win.FAST_GREAT_3RD_SEC : win.LATE_GREAT_3RD_SEC;

    let grade = 'GOOD';
    let subGrade = isFast ? 'FAST' : 'LATE';
    let scoreMultiplier = note.isBreak ? 0.4 : 0.5;
    let breakMultiplier = 0.3;
    let breakScoreValue = 1000;

    if (absDiff <= PERFECT_SEC) {
        grade = 'CRITICAL_PERFECT';
        subGrade = '';
        scoreMultiplier = 1.0;
        breakMultiplier = 1.0;
        breakScoreValue = 2600;
    } else if (absDiff <= great1st) {
        grade = 'GREAT';
        subGrade = isFast ? 'FAST' : 'LATE';
        scoreMultiplier = 0.8;
        breakMultiplier = 0.4;
        breakScoreValue = 2000;
    } else if (absDiff <= great2nd) {
        grade = 'GREAT';
        subGrade = isFast ? 'FAST' : 'LATE';
        scoreMultiplier = note.isBreak ? 0.6 : 0.8;
        breakMultiplier = 0.4;
        breakScoreValue = 1500;
    } else if (absDiff <= great3rd) {
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

    const { normalScore, bonusScore } = getNoteJudgeScore(note, {
        grade,
        scoreMultiplier,
        breakMultiplier,
        breakScoreValue,
    });
    return { grade, subGrade, isFast, diffMSec, isBreak: !!note.isBreak, scoreMultiplier, breakMultiplier, breakScoreValue, normalScore, breakBonus: bonusScore };
}
/*
 * 依主體有效區間內的鬆手時間比例[0, 33, 67, 95, 100] % 對頭部判定進行階梯降級，並保留 Fast / Late 與 Break 分級
*/
function evaluateHoldTotalGrade(note, headJudge, releaseDuration, holdDuration, bodyPressed, isTouchHold) {
    const headIgnoreSec = isTouchHold
        ? JUDGE_WINDOWS.HOLD.TOUCH_HEAD_IGNORE_SEC
        : JUDGE_WINDOWS.HOLD.HEAD_IGNORE_SEC;
    const tailIgnoreSec = JUDGE_WINDOWS.HOLD.TAIL_IGNORE_SEC;
    const totalIgnoreSec = headIgnoreSec + tailIgnoreSec;

    const headGrade = headJudge?.grade || 'MISS';
    const headSub = headJudge?.subGrade || '';
    const isBreak = !!note.isBreak;

    const makeResult = (grade, subGrade = '', scoreMult = null, breakMult = null, breakScore = null) => {
        let sMult = scoreMult;
        if (sMult === null) {
            if (grade === 'CRITICAL_PERFECT' || grade === 'PERFECT') sMult = 1.0;
            else if (grade === 'GREAT') sMult = 0.8;
            else if (grade === 'GOOD') sMult = isBreak ? 0.4 : 0.5;
            else sMult = 0;
        }
        let bMult = 0;
        let bScore = 0;
        if (isBreak) {
            if (grade === 'CRITICAL_PERFECT') {
                bMult = 1.0;
                bScore = 2600;
            } else if (grade === 'PERFECT') {
                bMult = breakMult ?? headJudge?.breakMultiplier ?? 0.75;
                bScore = breakScore ?? (bMult === 0.5 ? 2500 : 2550);
            } else if (grade === 'GREAT') {
                bMult = breakMult ?? 0.4;
                bScore = breakScore ?? (sMult <= 0.5 ? 1250 : (sMult <= 0.6 ? 1500 : 2000));
            } else if (grade === 'GOOD') {
                bMult = 0.3;
                bScore = 1000;
            }
        }
        const { normalScore, bonusScore } = getNoteJudgeScore(note, {
            grade,
            scoreMultiplier: sMult,
            breakMultiplier: bMult,
            breakScoreValue: bScore,
        });
        return {
            grade,
            subGrade: grade === 'CRITICAL_PERFECT' || grade === 'MISS' ? '' : subGrade,
            isBreak,
            scoreMultiplier: sMult,
            breakMultiplier: bMult,
            breakScoreValue: bScore,
            normalScore,
            breakBonus: bonusScore,
        };
    };

    // 短 Hold：忽略按壓長度計算，最終結果完全取決於頭部判定
    if (holdDuration <= totalIgnoreSec) {
        return makeResult(
            headGrade,
            headSub,
            headJudge?.scoreMultiplier ?? null,
            headJudge?.breakMultiplier ?? null,
            headJudge?.breakScoreValue ?? null
        );
    }

    const realityHT = holdDuration - totalIgnoreSec;
    const fallbackSub = (headGrade === 'CRITICAL_PERFECT') ? 'LATE' : headSub;

    // 全程未曾按壓主體 (bodyOn = false)：頭部未 Miss 則保底 GOOD，否則 MISS
    if (!bodyPressed) {
        return (headGrade === 'MISS') ? makeResult('MISS', '') : makeResult('GOOD', fallbackSub);
    }

    const releasePercent = Math.min(100, Math.ceil((Math.max(0, releaseDuration) / realityHT) * 100));

    // Tier 0: 0% 鬆開 (完整按住) -> 原樣保留頭部判定（若頭部 MISS 但途中補按滿則給 GOOD）
    if (releasePercent <= 0) {
        if (headGrade === 'MISS') return makeResult('GOOD', '');
        return makeResult(
            headGrade,
            headSub,
            headJudge?.scoreMultiplier ?? null,
            headJudge?.breakMultiplier ?? null,
            headJudge?.breakScoreValue ?? null
        );
    }

    // Tier 1: <= 33% 鬆開 -> CP 降為 LatePerfect，其餘 Perfect/Great/Good 維持，Miss 升 Good
    if (releasePercent <= 33) {
        if (headGrade === 'CRITICAL_PERFECT') return makeResult('PERFECT', 'LATE', 1.0, 0.75, 2550);
        if (headGrade === 'MISS') return makeResult('GOOD', '');
        return makeResult(
            headGrade,
            headSub,
            headJudge?.scoreMultiplier ?? null,
            headJudge?.breakMultiplier ?? null,
            headJudge?.breakScoreValue ?? null
        );
    }

    // Tier 2: <= 67% 鬆開 -> CP/Perfect/Great 皆為 Great (保留 Fast/Late 與頭部 Great 細分)，Good/Miss 維持 Good
    if (releasePercent <= 67) {
        if (headGrade === 'CRITICAL_PERFECT') return makeResult('GREAT', 'LATE', 0.8, 0.4, 2000);
        if (headGrade === 'PERFECT') return makeResult('GREAT', headSub, 0.8, 0.4, 2000);
        if (headGrade === 'GREAT') {
            return makeResult(
                'GREAT',
                headSub,
                headJudge?.scoreMultiplier ?? 0.8,
                headJudge?.breakMultiplier ?? 0.4,
                headJudge?.breakScoreValue ?? 2000
            );
        }
        return makeResult('GOOD', headGrade === 'MISS' ? '' : headSub);
    }

    // Tier 3: <= 95% 鬆開 -> 一律降為 GOOD
    if (releasePercent <= 95) {
        return makeResult('GOOD', headGrade === 'MISS' ? '' : fallbackSub);
    }

    // Tier 4: > 95% 鬆開 -> 頭部非 MISS 保底 GOOD，否則 MISS
    return (headGrade === 'MISS') ? makeResult('MISS', '') : makeResult('GOOD', fallbackSub);
}

function makeCriticalPerfectResult(note) {
    const isBreak = !!note?.isBreak;
    return {
        grade: 'CRITICAL_PERFECT',
        subGrade: '',
        isFast: false,
        diffMSec: 0,
        isBreak,
        scoreMultiplier: 1.0,
        breakMultiplier: 1.0,
        breakScoreValue: isBreak ? 2600 : 0,
    };
}

function resetNotesForSeek(targetGlobalTime) {
    if (!datas || !datas.notes) return;
    usedSensorsThisFrame.clear();
    resetPlayRuntimeCursors(datas);
    for (let i = 0; i < datas.notes.length; i++) {
        const note = datas.notes[i];
        const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0) + (note.cullSkipExtend ?? 0);
        const startTargetT = note.time + (note.slideDelay ?? 0);
        const endTargetT = note.time + skipT;
        const isHoldNote = (note.type === 'hold' || note.isHold || (note.type === 'touch' && ((note.holdDuration ?? 0) > 0 || note.isHold)));

        if (note.type === 'slide') {
            if (endTargetT < targetGlobalTime) {
                // 已超過整個 Slide 完成時間：未結算者預設視為 CRITICAL_PERFECT（而非 MISS）
                if (!note._slideJudged && !note.slideFinish && !note.isMine) {
                    note.triggered = true;
                    note.headTriggered = true;
                    note.triggeredTime = note.time;
                    note.unlocked = true;
                    note.slideFinish = true;
                    note.chainFinished = true;
                    note.hideStar = true;
                    note._slideJudged = true;
                    note._judgeEffectSpawned = true;
                    note._judgeSettleTime = endTargetT;
                    note.slideProgress = 1;
                    note._startEffectPlayed = true;
                    note._slideStartPlayed = true;
                    note._endEffectPlayed = true;
                    note._simplayAutoCompleted = false;
                    note.judgeResult = makeCriticalPerfectResult(note);
                }
            } else {
                // Slide 尚未結束：重設結束與軌跡狀態
                note._endEffectPlayed = false;
                note.slideFinish = false;
                note.chainFinished = false;
                note.hideStar = false;
                note._slideJudged = false;
                note._judgeEffectSpawned = false;
                note._judgeSettleTime = null;
                note.judgeResult = null;
                note._simplayAutoCompleted = false;

                if (startTargetT >= targetGlobalTime) {
                    note._startEffectPlayed = false;
                    note._slideStartPlayed = false;
                    note.slideProgress = 0;
                    note._lastSimStepIdx = undefined;
                    note._singleAreaTriggered = false;
                    note.unlocked = false;
                    note.judgeQueue = null;
                    note.judgeQueues = null;
                    note._fullJudgeQueue = null;
                    note._totalAreasCount = 0;
                } else {
                    note.unlocked = true;
                    note._startEffectPlayed = true;
                    note._slideStartPlayed = true;
                }

                if (note.time >= targetGlobalTime) {
                    note.triggered = false;
                    note.headTriggered = false;
                } else {
                    note.triggered = true;
                    note.headTriggered = true;
                    note.triggeredTime = note.time;
                }
            }
        } else if (isHoldNote) {
            if (endTargetT < targetGlobalTime) {
                // 已超過 Hold / TouchHold 結束時間：未結算者預設視為 CRITICAL_PERFECT
                if (!note.holdFinish && !note.judgeResult && !note.isMine) {
                    note.triggered = true;
                    note.triggeredTime = note.time;
                    note._holdPressed = true;
                    note.isHolding = false;
                    note.holdFinish = true;
                    note._headMiss = false;
                    note._headJudge = makeCriticalPerfectResult(note);
                    note.judgeResult = makeCriticalPerfectResult(note);
                    note._startEffectPlayed = true;
                    note._endEffectPlayed = true;
                    note._answerSoundPlayed = true;
                    note._holdEndAnswerPlayed = true;
                    note._hanabiSoundPlayed = true;
                }
            } else {
                note._endEffectPlayed = false;
                note._hanabiSoundPlayed = false;
                note.holdFinish = false;
                note.isHolding = false;
                note._holdPressed = false;
                note._releaseDuration = 0;
                note.judgeResult = null;

                if (note.time >= targetGlobalTime) {
                    note._startEffectPlayed = false;
                    note._answerSoundPlayed = false;
                    note._holdEndAnswerPlayed = false;
                    note.triggered = false;
                    note._headMiss = false;
                    note._headJudge = null;
                    if (note._riserActive) {
                        audioManager.stopLongSound(`riser_${note.pos}_${note.time}`);
                        note._riserActive = false;
                    }
                } else if (!note.isMine) {
                    // 拖曳至 Hold 中段：頭部預設視為 CRITICAL_PERFECT，避免補判頭 MISS
                    note.triggered = true;
                    note.triggeredTime = note.time;
                    note._headMiss = false;
                    note._headJudge = makeCriticalPerfectResult(note);
                    note._startEffectPlayed = true;
                    note._answerSoundPlayed = true;
                }
            }
        } else {
            // Tap / Star / 普通 Touch
            if (note.time < targetGlobalTime) {
                if (!note.triggered && !note.isMine) {
                    const cpRes = makeCriticalPerfectResult(note);
                    note.triggered = true;
                    note.triggeredTime = note.time;
                    note._judgeSettleTime = note.time;
                    note.judgeResult = cpRes;
                    note._missReported = false;
                    note._startEffectPlayed = true;
                    note._answerSoundPlayed = true;
                    note._hanabiSoundPlayed = true;
                    if (note.touchGroup) {
                        note.touchGroup.lastJudgeResult = cpRes;
                        note.touchGroup.isResolved = true;
                    }
                }
            } else {
                note._startEffectPlayed = false;
                note._endEffectPlayed = false;
                note._answerSoundPlayed = false;
                note._hanabiSoundPlayed = false;
                note.triggered = false;
                note.judgeResult = null;
                note._judgeSettleTime = null;
                note._missReported = false;
                if (note.touchGroup) {
                    note.touchGroup.isResolved = false;
                    note.touchGroup.lastJudgeResult = null;
                }
            }
        }
    }
}

function getFrontmostLaneKey(note) {
    if (note.type === 'touch') {
        return note.touchPos === 'C' ? 'TOUCH_C' : `TOUCH_${note.touchPos}_${note.pos}`;
    }
    return `OUTER_${note.pos}`;
}

function getFrameInputSlot(note) {
    // 參照 InputManager.SetUsedThisFrame: 外圈按鍵與 Touch A 區共用 TouchAreaA[pos]
    if (note.type === 'touch') {
        if (note.touchPos === 'C') return 'C';
        if (note.touchPos === 'A') return `BTN_A_${note.pos}`;
        return `${note.touchPos}${note.pos}`;
    }
    return `BTN_A_${note.pos}`;
}

function isPosOccupiedByHolding(note, activeHoldNotes) {
    const isTouch = (note.type === 'touch');
    const noteSensor = isTouch ? ((note.touchPos === 'C') ? 'C' : (note.touchPos + note.pos)) : null;
    for (let k = 0; k < activeHoldNotes.length; k++) {
        const other = activeHoldNotes[k];
        if (other === note || !other.triggered || other.holdFinish || !other.isHolding) continue;
        if (globalTime >= other.time + (other.holdDuration ?? 0)) continue;
        if (isTouch) {
            const otherSensor = (other.touchPos === 'C') ? 'C' : (other.touchPos + other.pos);
            if (other.type === 'touch' && otherSensor === noteSensor) return true;
        } else {
            const otherIsHold = (other.type !== 'touch') && (other.holdDuration > 0 || other.isHold || other.type === 'hold');
            if (otherIsHold && other.pos === note.pos) return true;
        }
    }
    return false;
}

function triggerManualHit(sensorInput, forceDiffSec = null) {
    if (!datas || !datas.notes || !playing) return;

    const sensorSet = (sensorInput instanceof Set)
        ? sensorInput
        : new Set(Array.isArray(sensorInput) ? sensorInput : [sensorInput]);

    if (sensorSet.size === 0) return;

    const notes = datas.notes;
    const rt = datas._playRuntime;
    const activeHolds = rt ? rt.judgeActiveHolds : [];
    const activeHoldSet = rt ? rt.judgeHoldSet : null;

    // 清理並同步已過濾出滑動游標的長按 Hold，避免每鍵擊都重頭掃描整首譜面
    if (rt) {
        if (globalTime < rt.lastStateTime - 0.05) {
            rt.judgeCursor = 0;
            activeHolds.length = 0;
            activeHoldSet.clear();
        }
        for (let k = activeHolds.length - 1; k >= 0; k--) {
            const h = activeHolds[k];
            const hDur = h.holdDuration ?? 0;
            const lateWin = (h.type === 'touch') ? JUDGE_WINDOWS.TOUCH.GOOD_LATE : JUDGE_WINDOWS.TAP.GOOD;
            const isExpired = h.holdFinish || (h.triggered ? (globalTime >= h.time + hDur) : (globalTime - h.time > Math.max(hDur, lateWin)));
            if (isExpired) {
                activeHoldSet.delete(h);
                activeHolds.splice(k, 1);
            }
        }
    }

    const startIdx = (rt && datas._isSorted !== false) ? rt.judgeCursor : 0;
    const blockedLanes = new Set();
    const frameHolds = activeHolds.length > 0 ? activeHolds.slice() : [];

    // 先依前置尚未結束的長按 Hold 封鎖對應鍵位（供同幀後續掃描阻塞判斷與佔用檢查）
    for (let k = 0; k < activeHolds.length; k++) {
        const h = activeHolds[k];
        blockedLanes.add(getFrontmostLaneKey(h));
    }

    const candidates = [];
    let bestNote = null;
    let minDiff = Infinity;
    let canAdvanceCursor = !!(rt && datas._isSorted !== false);

    for (let i = startIdx; i < notes.length; i++) {
        const note = notes[i];
        if (note.type === 'slide') {
            if (canAdvanceCursor) rt.judgeCursor = i + 1;
            continue; // Slide 由劃軌 Checkpoint 判定，不接受點擊觸發
        }

        const noteT = note.time - globalTime;
        // 音符在未來且超過最大容許判定視窗，後續音符更靠後，直接結束搜尋
        if (noteT > 0.65) break;

        const isTouch = (note.type === 'touch');
        const isHoldNoteType = (note.holdDuration > 0 || note.isHold || note.type === 'hold');
        const laneKey = getFrontmostLaneKey(note);
        const lateWin = isTouch ? JUDGE_WINDOWS.TOUCH.GOOD_LATE : JUDGE_WINDOWS.TAP.GOOD;

        // 檢查該音符是否仍在同鍵位上尚未結束 (未結算且未逾時)
        const holdDuration = note.holdDuration ?? 0;
        const isEndedInLane = isHoldNoteType
            ? (!!note.holdFinish || (note.triggered ? (globalTime >= note.time + holdDuration) : (-noteT > Math.max(holdDuration, lateWin))))
            : (!!note.triggered || -noteT > lateWin);

        if (canAdvanceCursor) {
            if (isEndedInLane && (!note.isHolding || globalTime >= note.time + holdDuration)) {
                rt.judgeCursor = i + 1;
                continue;
            }
            if (isHoldNoteType && -noteT > 0.65) {
                if (!activeHoldSet.has(note)) {
                    activeHoldSet.add(note);
                    activeHolds.push(note);
                }
                rt.judgeCursor = i + 1;
            } else {
                canAdvanceCursor = false;
            }
        }

        if (isEndedInLane) continue;

        if (isHoldNoteType) {
            frameHolds.push(note);
        }

        const isBlockedByEarlier = blockedLanes.has(laneKey);
        // 目前最前端未結束音符一旦出現即阻塞同鍵位後續音符
        blockedLanes.add(laneKey);
        if (isBlockedByEarlier) continue;
        if (note.triggered) continue;

        // 依據音符類型檢查是否在可擊中時機窗口內
        if (isTouch) {
            if (noteT > JUDGE_WINDOWS.TOUCH.FAST_WINDOW || noteT < -JUDGE_WINDOWS.TOUCH.GOOD_LATE) {
                continue;
            }
        } else {
            if (noteT > JUDGE_WINDOWS.TAP.GOOD || noteT < -JUDGE_WINDOWS.TAP.GOOD) {
                continue;
            }
        }

        const slotKey = getFrameInputSlot(note);
        if (usedSensorsThisFrame.has(slotKey)) continue;

        let matches = false;
        if (isTouch) {
            const normSensor = (note.touchPos === 'C') ? 'C' : (note.touchPos + note.pos);
            matches = sensorSet.has(normSensor);
        } else {
            matches = sensorSet.has('K' + note.pos) || sensorSet.has('A' + note.pos);
        }
        if (!matches) continue;

        if (!isHoldNoteType && isPosOccupiedByHolding(note, frameHolds)) {
            continue;
        }

        const diffForEval = (forceDiffSec !== null) ? forceDiffSec : (globalTime - note.time);
        const evalRes = evaluateHitGrade(diffForEval, note);
        if (!evalRes || evalRes.grade === 'MISS') continue;

        const absDiff = Math.abs(diffForEval);
        candidates.push({ note, laneKey, slotKey, evalRes });
        if (absDiff < minDiff) {
            minDiff = absDiff;
            bestNote = note;
        }
    }

    if (bestNote) {
        const targetTime = bestNote.time;
        const usedBatchLanes = new Set();
        const usedBatchSlots = new Set();

        for (let c = 0; c < candidates.length; c++) {
            const { note: hn, laneKey, slotKey, evalRes } = candidates[c];
            if (hn !== bestNote && Math.abs(hn.time - targetTime) > 0.03) continue;
            if (usedBatchLanes.has(laneKey) || usedBatchSlots.has(slotKey) || usedSensorsThisFrame.has(slotKey)) continue;
            if (hn.triggered && hn.judgeResult) continue; // 若已在此輪循環中被 TouchGroup 傳導判定，避免重複處理

            usedBatchLanes.add(laneKey);
            usedBatchSlots.add(slotKey);
            usedSensorsThisFrame.add(slotKey);

            const isHoldNote = (hn.holdDuration > 0 || hn.isHold || hn.type === 'hold');

            hn.triggered = true;
            hn.triggeredTime = globalTime;

            if (isHoldNote) {
                hn._holdPressed = true;
                hn.isHolding = true;
                hn._headJudge = evalRes;
                if (activeHoldSet && !activeHoldSet.has(hn)) {
                    activeHoldSet.add(hn);
                    activeHolds.push(hn);
                }
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
            if (hn.type !== 'touch') {
                const chainSearchStart = Math.max(0, startIdx);
                for (let j = chainSearchStart; j < notes.length; j++) {
                    const sn = notes[j];
                    if (sn.time - hn.time > 0.06) break;
                    if (sn.type === 'slide' && sn.firstSlide && sn.pos === hn.pos && Math.abs(sn.time - hn.time) < 0.05) {
                        sn.headTriggered = true;
                        sn.unlocked = true;
                    }
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

    const dpr = getPlayDPR();
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

function setSpeedPopoverOpen(open) {
    speedControlButton.setAttribute('aria-expanded', String(open));
    speedControlButton.classList.toggle('is-active', open);
    speedPopover.classList.toggle('is-open', open);
    speedPopover.inert = !open;
    speedPopover.setAttribute('aria-hidden', String(!open));
}

speedControlButton.addEventListener('click', () => setSpeedPopoverOpen(speedPopover.inert));
document.addEventListener('pointerdown', (event) => {
    if (!speedPopover.inert && !speedControlButton.parentElement.contains(event.target)) {
        setSpeedPopoverOpen(false);
    }
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !speedPopover.inert) {
        if (document.activeElement === playbackSpeedInput) {
            playbackSpeedInput.value = speedDisplayCapsule.textContent;
        }
        speedControlButton.focus();
        setSpeedPopoverOpen(false);
    }
});

playbackSpeedInput.addEventListener('focus', () => playbackSpeedInput.select());
playbackSpeedInput.addEventListener('change', () => {
    const speed = Number(playbackSpeedInput.value.trim().replace(/x$/i, ''));
    if (!Number.isFinite(speed) || speed <= 0) {
        simpleToast({ content: t('toast.invalidPlaybackSpeed'), type: 'warning', timeout: 1800 });
        playbackSpeedInput.value = speedDisplayCapsule.textContent;
        return;
    }
    setPlaybackSpeed(speed);
    simpleToast({ content: t('toast.setPlaybackSpeed', { speed: settings.playbackSpeed.toFixed(2) }), type: 'success', timeout: 1800 });
});
playbackSpeedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') speedControlButton.focus();
});

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
        simpleToast({ content: t(nextState ? 'toast.slideDebugOpened' : 'toast.slideDebugClosed'), type: 'info', timeout: 1200 });
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
        openProjectManager({
            getCurrentProjectId: () => currentProjectId,
            loadProject,
            getFileHandlerCtx,
            images,
        });
    });
}

if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSettings();
    });
}

if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
            const docEl = document.documentElement;
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen().catch(err => console.warn('進入全螢幕失敗:', err));
            } else if (docEl.webkitRequestFullscreen) {
                docEl.webkitRequestFullscreen();
            } else if (docEl.msRequestFullscreen) {
                docEl.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(err => console.warn('退出全螢幕失敗:', err));
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    });

    const updateFullscreenIcon = () => {
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
        const iconSpan = fullscreenBtn.querySelector('.material-symbols-outlined');
        if (iconSpan) {
            iconSpan.textContent = isFullscreen ? 'fullscreen_exit' : 'fullscreen';
        }
        const labelKey = isFullscreen ? 'menu.exitFullscreen' : 'menu.fullscreen';
        fullscreenBtn.dataset.i18nTitle = labelKey;
        fullscreenBtn.dataset.i18nAriaLabel = labelKey;
        const titleText = t(labelKey);
        fullscreenBtn.title = titleText;
        fullscreenBtn.setAttribute('aria-label', titleText);
        setTimeout(resize, 100);
    };

    document.addEventListener('fullscreenchange', updateFullscreenIcon);
    document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
    document.addEventListener('msfullscreenchange', updateFullscreenIcon);
}

difficultySelect.addEventListener('change', () => {
    restart();
    selectedDifficulty = Number(difficultySelect.value);
    getResult();
    updateTimeControlUI(true);
    draw();
    if (currentProjectId) idbSetProject(currentProjectId, 'now_difficulty', selectedDifficulty);
});

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
    updateDifficultyOptions();
    getResult();
}

function setDataEmpty() {
    pause();
    restart();
    rawdata = null;
    updateDifficultyOptions();
    datas = null;
    playScoreRes = buildPlayScoreRes();
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

    updateTimeControlUI(true);
}

function tryUpdateBackgroundBrightness() {
    const b = Math.max(0, 1 + 0.1875 * (Number(settings.moviebrightness) || 0));
    const applyDim = (el) => {
        if (!el) return;
        if (b <= 1) {
            el.style.filter = 'none';
            el.style.opacity = String(b);
        } else {
            el.style.opacity = '1';
            el.style.filter = `brightness(${b})`;
        }
    };
    applyDim(gameBackgroundImage);
    applyDim(gameBackgroundVideo);
}

function calculatePlayScoreRes(datas) {
    return buildPlayScoreRes(datas?.notesCounts);
}

function getResult() {
    if (renderer) {
        renderer.clearJudgeEffects();
        renderer.clearHitEffects();
    }
    const chartData = rawdata?.[`inote_${selectedDifficulty}`] || "";
    datas = simaiDecode(chartData, 0);
    if (datas) {
        linkChainSlides(datas.notes);
        linkTouchGroups(datas.notes);
        preparePlayNotesIndex(datas);
        playScoreRes = calculatePlayScoreRes(datas);
    }
}

function getTotalTime() {
    return Math.max(datas?.endTime || 0, 0) + 1;
}

let _lastPlayTimeUiUpdate = 0;
let _lastPlayTimelineMax = -1;
let _lastPlaySliderRatio = -1;
let _lastPlayCapsuleText = '';

function updateTimeControlUI(force = false) {
    if (!timeControl) return;
    const now = performance.now();
    if (!force && playing && !timeControlSliding && (now - _lastPlayTimeUiUpdate) < 66) {
        return;
    }
    _lastPlayTimeUiUpdate = now;

    const totalTime = getTotalTime();
    if (force || totalTime !== _lastPlayTimelineMax) {
        _lastPlayTimelineMax = totalTime;
        timeControl.max = totalTime;
    }

    const rawRatio = Math.max(0, Math.min(1, totalTime > 0 ? (realTime / totalTime) : 0));
    const quantized = Math.round(rawRatio * 500) / 500;
    if (force || quantized !== _lastPlaySliderRatio) {
        _lastPlaySliderRatio = quantized;
        if (!timeControlSliding) {
            timeControl.value = realTime;
        }
        const thumbWidth = 16;
        const stopPos = `calc(${thumbWidth * 0.5}px + ${quantized} * (100% - ${thumbWidth}px))`;
        timeControl.style.setProperty('--timeline-progress', stopPos);
    }

    if (!hidden && !playCapsules.hidden) {
        const text = `${formatCapsuleTime(Math.min(realTime, totalTime))} / ${formatCapsuleTime(totalTime)}`;
        if (force || _lastPlayCapsuleText !== text) {
            _lastPlayCapsuleText = text;
            timeDisplayCapsule.textContent = text;
        }
    }
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
        updateTimeControlUI(true);
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

    const hasImage = !!(gameBackgroundImage && gameBackgroundImage.complete && gameBackgroundImage.naturalWidth !== 0);
    const showVideo = !!(gameBackgroundVideo && gameBackgroundVideo.src && gameBackgroundVideo.readyState >= 2);
    if (gameBackgroundVideo) {
        if (gameBackgroundVideo._onPlayLoadedData && typeof gameBackgroundVideo.removeEventListener === 'function') {
            gameBackgroundVideo.removeEventListener('loadeddata', gameBackgroundVideo._onPlayLoadedData);
            gameBackgroundVideo._onPlayLoadedData = null;
        }
        gameBackgroundVideo.style.display = showVideo ? 'block' : 'none';
        if (!showVideo && gameBackgroundVideo.src && typeof gameBackgroundVideo.addEventListener === 'function') {
            gameBackgroundVideo._onPlayLoadedData = () => {
                gameBackgroundVideo._onPlayLoadedData = null;
                if (playing) {
                    gameBackgroundVideo.style.display = 'block';
                    if (gameBackgroundImage) gameBackgroundImage.style.display = 'none';
                }
            };
            gameBackgroundVideo.addEventListener('loadeddata', gameBackgroundVideo._onPlayLoadedData, { once: true });
        }
    }
    if (gameBackgroundImage) {
        gameBackgroundImage.style.display = (!showVideo && hasImage) ? 'block' : 'none';
    }
    if (gameBackgroundVideo && gameBackgroundVideo.readyState >= 1) {
        gameBackgroundVideo.currentTime = realTime;
        gameBackgroundVideo.playbackRate = speed;
    }
    if (gameBackgroundVideo && gameBackgroundVideo.paused && gameBackgroundVideo.readyState >= 1) {
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
            n._settledCommitted = false;
            n._simplayAutoCompleted = false;
            if (n.touchGroup) {
                n.touchGroup.isResolved = false;
                n.touchGroup.lastJudgeResult = null;
            }
        });
        resetPlayRuntimeCursors(datas);
    }
    usedSensorsThisFrame.clear();

    if (gameBackgroundVideo && gameBackgroundVideo.readyState >= 1) {
        gameBackgroundVideo.currentTime = 0;
    }

    updateTimeControlUI(true);
    draw();
}

function updatePauseBackgroundDisplay() {
    const hideBg = settings.showBackgroundWhenPaused === false;
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

const persistPlaySettings = () => {
    const settingsStr = JSON.stringify(settings);
    idbSet('simai_settings', settingsStr).catch((error) => {
        console.error('儲存設定到 IndexedDB 失敗:', error);
    });
    try {
        localStorage.setItem('simai_settings_backup', settingsStr);
    } catch (_) { }
};

const saveSettingsDebounce = debounce(persistPlaySettings, 300);

const flushPlaySettingsSave = () => {
    if (typeof saveSettingsDebounce?.flush === 'function') {
        saveSettingsDebounce.flush();
    }
};
window.addEventListener('beforeunload', flushPlaySettingsSave);
window.addEventListener('pagehide', flushPlaySettingsSave);

function setPlaybackSpeed(speed) {
    typeof speed === 'string' && (speed = parseFloat(speed));
    speed = clamp(speed, 0.01, 4); // 限制速度在 0.01x 到 4x 之間

    settings.playbackSpeed = speed;
    const label = `${speed.toFixed(2)}x`;
    playbackSpeedInput.value = label;
    speedDisplayCapsule.textContent = label;
    speedDisplayCapsule.classList.toggle('is-modified', label !== '1.00x');

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
        updateTimeControlUI(true);
    } else {
        setSpeedPopoverOpen(false);
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

function isNoteFinishedForPlayState(note, globalTime) {
    const noteType = note.type;
    const isHold = (noteType === 'hold' || note.isHold || (noteType === 'touch' && ((note.holdDuration ?? 0) > 0 || note.isHold)));
    if (noteType === 'slide') {
        const slideDelay = note.slideDelay ?? 0;
        const slideDuration = note.slideDuration ?? 0;
        const isGroupPartEnd = note.lastSlide || !note.nextSlide;
        const minDelayTiming = (note.chainLeader || note).time + ((note.chainLeader || note).slideDelay ?? 0);
        const tooLateTiming = note.time + slideDelay + slideDuration + (JUDGE_WINDOWS.SLIDE?.GOOD_AREA_SEC ?? 0.6);
        if (isGroupPartEnd && note._slideJudged && !note._judgeEffectSpawned && globalTime < minDelayTiming) {
            return false;
        }
        return !!note.slideFinish && (globalTime > tooLateTiming || !isGroupPartEnd || note._judgeEffectSpawned || note._slideJudged);
    }
    if (isHold) {
        return !!note.holdFinish && globalTime > note.time + (note.holdDuration ?? 0) + 0.1;
    }
    const lateWin = (noteType === 'touch') ? JUDGE_WINDOWS.TOUCH.GOOD_LATE : JUDGE_WINDOWS.TAP.GOOD;
    return !!note.triggered && globalTime > note.time + Math.max(0.1, lateWin) + 0.05;
}

/**
 * 電腦自動播放 (Computer Autoplay)
 * 就像譜面純播放展示一樣，無論如何全部音符結算為 CRITICAL_PERFECT (All Perfect)
 */
function updateComputerPlayState({ globalTime, notes, renderer, playing, timeControlSliding, dt = 0.016 }) {
    const compSensors = new Set();
    if (!playing || timeControlSliding || !notes) return compSensors;

    const rt = datas?._playRuntime;
    if (rt && globalTime < rt.lastStateTime - 0.05) {
        rt.stateCursor = 0;
        rt.stateActiveLongs.length = 0;
        rt.stateLongSet.clear();
    }

    const handleNote = (note) => {
        const noteT = note.time - globalTime;
        const noteType = note.type;
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
                    note.judgeResult = makeCriticalPerfectResult(note);
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
                    note.judgeResult = makeCriticalPerfectResult(note);
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
                    note._headJudge = makeCriticalPerfectResult(note);
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
                        note.judgeResult = makeCriticalPerfectResult(note);
                        spawnJudgeEffect(note, note.judgeResult);

                        if (settings.playHoldEnd !== false && noteType !== 'tap') {
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
                            note._fullJudgeQueue = baseQueue.map(a => a.clone());
                            note._fullJudgeQueues = [note._fullJudgeQueue];
                        }
                    }
                    const fullQueues = note._fullJudgeQueues && note._fullJudgeQueues.length > 0
                        ? note._fullJudgeQueues
                        : (note._fullJudgeQueue ? [note._fullJudgeQueue] : []);
                    if (fullQueues.length > 0) {
                        const branchCount = fullQueues.length;
                        for (let b = 0; b < branchCount; b++) {
                            const fullQ = fullQueues[b];
                            if (!fullQ || fullQ.length === 0) continue;
                            const bPath = getSlideBranchPath(note, b, branchCount);
                            const { curIdx } = getSlideStepState(fullQ, bPath, p);
                            const curArea = fullQ[curIdx];
                            if (curArea && curArea.areas) {
                                for (let s = 0; s < curArea.areas.length; s++) {
                                    compSensors.add(curArea.areas[s]);
                                }
                            }
                        }
                    } else {
                        const currentPos = (p >= 1) ? (note.slideEnd || note.pos) : note.pos;
                        compSensors.add('A' + currentPos);
                    }
                }

                // 到達結尾時刻，結算劃軌
                if (globalTime >= endTiming) {
                    note.slideProgress = 1.0;
                    if (!note.slideFinish) {
                        finishSlideNote(note);
                        note._slideJudged = true;
                        note._judgeSettleTime = endTiming;
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
    };

    if (rt && datas?._isSorted !== false) {
        for (let idx = rt.stateActiveLongs.length - 1; idx >= 0; idx--) {
            const ln = rt.stateActiveLongs[idx];
            if (isNoteFinishedForPlayState(ln, globalTime)) {
                rt.stateLongSet.delete(ln);
                rt.stateActiveLongs.splice(idx, 1);
            } else {
                handleNote(ln);
            }
        }

        let canAdvance = true;
        const notesLength = notes.length;
        for (let i = rt.stateCursor; i < notesLength; i++) {
            const note = notes[i];
            const noteT = note.time - globalTime;
            if (noteT > 0.5) break;

            handleNote(note);

            if (canAdvance) {
                if (isNoteFinishedForPlayState(note, globalTime)) {
                    rt.stateCursor = i + 1;
                } else if (noteT < -0.65) {
                    if (!rt.stateLongSet.has(note)) {
                        rt.stateLongSet.add(note);
                        rt.stateActiveLongs.push(note);
                    }
                    rt.stateCursor = i + 1;
                } else {
                    canAdvance = false;
                }
            }
        }
        rt.lastStateTime = globalTime;
    } else {
        for (let i = 0; i < notes.length; i++) {
            if (notes[i].time - globalTime > 0.5) break;
            handleNote(notes[i]);
        }
    }

    return compSensors;
}

function updateManualPlayState({ globalTime, notes, renderer, playing, timeControlSliding, dt = 0.016, sensors = null }) {
    if (!playing || timeControlSliding) return;

    const currentSensors = sensors || manualInputSensors;
    if (!currentSensors) return;

    const rt = datas?._playRuntime;
    if (rt && globalTime < rt.lastStateTime - 0.05) {
        rt.stateCursor = 0;
        rt.stateActiveLongs.length = 0;
        rt.stateLongSet.clear();
    }

    const handleNote = (note) => {
        const noteT = note.time - globalTime;
        const noteType = note.type;
        const isHold = (note.holdDuration > 0 || note.isHold || noteType === 'hold');

        // 1. Hold & TouchHold 按壓與結算判定
        // （註：Touch 音符與 Tap 一樣必須由玩家在窗口內主動按下 pointerdown/keydown 或剛劃入 newlyAdded 觸發，不支援按住自動判定）
        if (isHold) {
            let isSensorPressed = false;
            if (noteType === 'touch') {
                const sensorId = (note.touchPos === 'C') ? 'C' : (note.touchPos + note.pos);
                isSensorPressed = currentSensors.has(sensorId);
            } else {
                isSensorPressed = currentSensors.has('K' + note.pos) || currentSensors.has('A' + note.pos);
            }

            const headIgnoreSec = (noteType === 'touch')
                ? JUDGE_WINDOWS.HOLD.TOUCH_HEAD_IGNORE_SEC
                : JUDGE_WINDOWS.HOLD.HEAD_IGNORE_SEC;
            const tailIgnoreSec = JUDGE_WINDOWS.HOLD.TAIL_IGNORE_SEC;
            const elapsedHold = -noteT;

            if (noteT <= 0.05 && elapsedHold <= note.holdDuration) {
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
                                isBreak: !!note.isBreak,
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
                    // 參照 NoteJudge.cs JudgeHoldTotal：僅在扣除頭尾忽略幀後的主體區間內才累計鬆手時間
                    const inHoldBody = elapsedHold >= headIgnoreSec && elapsedHold <= (note.holdDuration - tailIgnoreSec);
                    if (inHoldBody) {
                        if (note._holdPressed) {
                            if ((note._waitReleaseSec || 0) <= JUDGE_WINDOWS.HOLD.RELEASE_IGNORE_SEC) {
                                note._waitReleaseSec = (note._waitReleaseSec || 0) + dt;
                            } else {
                                note._releaseDuration = (note._releaseDuration || 0) + dt;
                            }
                        } else {
                            // 尚未按壓過時，主體區間內流逝時間直接計入 releaseDuration
                            note._releaseDuration = (note._releaseDuration || 0) + dt;
                        }
                    }
                }
            } else if (-noteT > note.holdDuration) {
                note.isHolding = false;
                if (!note.holdFinish) {
                    note.holdFinish = true;
                    if (note._holdPressed || note.triggered) {
                        const headJudge = note._headJudge || (note._headMiss ? { grade: 'MISS', subGrade: '' } : { grade: 'MISS', subGrade: '' });
                        note.judgeResult = evaluateHoldTotalGrade(
                            note,
                            headJudge,
                            note._releaseDuration || 0,
                            note.holdDuration,
                            !!note._holdPressed,
                            noteType === 'touch'
                        );
                        const finalGrade = note.judgeResult.grade;
                        spawnJudgeEffect(note, note.judgeResult);

                        // 結算音效 (手動遊玩結尾音效)
                        if (settings.playHoldEnd !== false && noteType !== 'tap' && finalGrade !== 'MISS') {
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
                        note.judgeResult = { grade: 'MISS', subGrade: '', isBreak: !!note.isBreak, scoreMultiplier: 0, breakMultiplier: 0, breakScoreValue: 0 };
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
                    isBreak: !!note.isBreak,
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
                    subGrade: '',
                    isFast: false,
                    diffMSec: Math.round(-noteT * 1000 * 10) / 10,
                    isBreak: !!note.isBreak,
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
                    const triggerSlideStartSound = (slideNote) => {
                        const leader = slideNote.chainLeader || slideNote;
                        if (!leader._slideStartPlayed && !leader.isMine) {
                            leader._slideStartPlayed = true;
                            // 確保呼叫時 leader._startEffectPlayed 為 false，讓 audioManager 識別為開頭 (break_slide_start / slide)
                            leader._startEffectPlayed = false;
                            audioManager.queueSound(leader, globalTime, { includeAnswer: false });
                            const chainList = leader.chainList || [leader];
                            for (let k = 0; k < chainList.length; k++) {
                                chainList[k]._slideStartPlayed = true;
                                chainList[k]._startEffectPlayed = true;
                            }
                        }
                    };

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
                                    triggerSlideStartSound(note);

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
                        if (note._simplayAutoCompleted) {
                            note._simplayAutoCompleted = false;
                            triggerSlideStartSound(note);
                        }
                        finishSlideNote(note);
                    }
                }
            }

            // 參照 SlideRoot.cs Judge() & IsNoteCheckTimeStart()：
            // 必須進入有效判定起點 (leader.startTiming - 0.60s) 後才結算最終評級；早於 ±36 幀完成依 SlideRoot.cs L890 轉為 FastGood
            const minDelayTiming = (note.chainLeader || note).time + ((note.chainLeader || note).slideDelay ?? 0);
            const judgeCheckStart = minDelayTiming - JUDGE_WINDOWS.SLIDE.GOOD_AREA_SEC;
            if (isGroupPartEnd && note.slideFinish && !note._slideJudged && globalTime >= judgeCheckStart) {
                note._slideJudged = true;
                note._judgeSettleTime = Math.max(globalTime, minDelayTiming);
                const isAuto = getAutoPlayMode() !== 'off';
                const diffSec = (isAuto && (settings.simplayPerfect ?? true)) ? 0 : (globalTime - judgeTiming);
                note.judgeResult = evaluateSlideGrade(diffSec, note);
            }

            // 判定特效與 Break 結尾音效顯示：在 slideDelay 後顯示 (若提前完成，等待至超過 slideDelay 時同步觸發)
            if (isGroupPartEnd && note._slideJudged && !note._judgeEffectSpawned) {
                if (globalTime >= minDelayTiming) {
                    note._judgeEffectSpawned = true;
                    spawnJudgeEffect(note, note.judgeResult);
                    if (note.isBreak && !note._endEffectPlayed && note.judgeResult && note.judgeResult.grade !== 'MISS') {
                        note._startEffectPlayed = true;
                        audioManager.queueSound(note, globalTime, { includeAnswer: false, grade: note.judgeResult.grade });
                        note._endEffectPlayed = true;
                    }
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
                        note._judgeSettleTime = tooLateTiming;
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
                                isBreak: !!note.isBreak,
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
                                subGrade: 'TOO_LATE',
                                isFast: false,
                                diffMSec: 600,
                                isBreak: !!note.isBreak,
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
                        tail._judgeSettleTime = tooLateTiming;
                        tail.judgeResult = {
                            grade: 'MISS',
                            subGrade: 'TOO_LATE',
                            isFast: false,
                            diffMSec: 600,
                            isBreak: !!tail.isBreak,
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
    };

    if (rt && datas?._isSorted !== false) {
        for (let idx = rt.stateActiveLongs.length - 1; idx >= 0; idx--) {
            const ln = rt.stateActiveLongs[idx];
            if (isNoteFinishedForPlayState(ln, globalTime)) {
                rt.stateLongSet.delete(ln);
                rt.stateActiveLongs.splice(idx, 1);
            } else {
                handleNote(ln);
            }
        }

        let canAdvance = true;
        const notesLength = notes.length;
        for (let i = rt.stateCursor; i < notesLength; i++) {
            const note = notes[i];
            const noteT = note.time - globalTime;
            if (noteT > 0.65) break;

            handleNote(note);

            if (canAdvance) {
                if (isNoteFinishedForPlayState(note, globalTime)) {
                    rt.stateCursor = i + 1;
                } else if (noteT < -0.65) {
                    if (!rt.stateLongSet.has(note)) {
                        rt.stateLongSet.add(note);
                        rt.stateActiveLongs.push(note);
                    }
                    rt.stateCursor = i + 1;
                } else {
                    canAdvance = false;
                }
            }
        }
        rt.lastStateTime = globalTime;
    } else {
        for (let i = 0; i < notes.length; i++) {
            if (notes[i].time - globalTime > 0.65) break;
            handleNote(notes[i]);
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
            useButton: settings.simplayUseButton ?? true,
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

    // 初始化 nowIndex (使用預編譯 _nonSlideTimes 進行 O(log N) 二分搜尋)
    if (notesLength > 0 && notes[0] && realTime < notes[0].time) {
        nowIndex = 0;
    } else if (datas._nonSlideTimes && datas._nonSlideTimes.length > 0) {
        const nsIdx = upperBound(datas._nonSlideTimes, realTime - musicDelay) - 1;
        nowIndex = (nsIdx >= 0) ? datas._nonSlideIndexes[nsIdx] : 0;
    }

    // Clear existing arrays without allocating new ones
    buckets.slide.length = 0;
    buckets.tapnhold.length = 0;
    buckets.touch.length = 0;

    let playCombo = 0;
    let playScore = 0;
    let lostScore = 0;
    _comboEvents.length = 0;
    const maxFutureJudgeWindow = Math.max(JUDGE_WINDOWS.TOUCH.FAST_WINDOW, JUDGE_WINDOWS.TAP.GOOD);

    const rt = datas._playRuntime;
    const scoreState = rt ? rt.scoreState : null;
    if (scoreState && globalTime < scoreState.lastGlobalTime - 0.05) {
        resetPlayRuntimeCursors(datas);
    }
    const activeScoreState = rt ? rt.scoreState : createFreshScoreState();
    activeScoreState.lastGlobalTime = globalTime;

    let minUnsettledTime = Infinity;
    let firstFutureIdx = notesLength;

    const evaluateScoreNote = (note, commitAllowed) => {
        const noteT = note.time - globalTime;
        const noteType = note.type;
        const isHold = (noteType === 'hold' || note.isHold || (noteType === 'touch' && ((note.holdDuration ?? 0) > 0 || note.isHold)));
        const holdDuration = note.holdDuration ?? 0;
        const slideDelay = note.slideDelay ?? 0;
        const slideDuration = note.slideDuration ?? 0;
        const isTouch = (noteType === 'touch');
        const lateJudgeWindow = isTouch ? JUDGE_WINDOWS.TOUCH.GOOD_LATE : JUDGE_WINDOWS.TAP.GOOD;

        if (noteT > lateJudgeWindow && !note.triggered) {
            if (note.time - maxFutureJudgeWindow < minUnsettledTime) {
                minUnsettledTime = note.time - maxFutureJudgeWindow;
            }
            return true; // 仍在視窗前尚未觸發
        }

        if (noteType === 'slide') {
            const isGroupPartEnd = note.lastSlide || !note.nextSlide;
            if (!isGroupPartEnd) return false;

            const startTiming = note.time + slideDelay;
            const minDelayTiming = (note.chainLeader || note).time + ((note.chainLeader || note).slideDelay ?? 0);
            const tooLateTiming = startTiming + slideDuration + (JUDGE_WINDOWS.SLIDE?.GOOD_AREA_SEC ?? 0.6);

            if ((!note.slideFinish && !note._slideJudged && globalTime <= tooLateTiming) || (note.slideFinish && globalTime < minDelayTiming)) {
                if (note.time < minUnsettledTime) minUnsettledTime = note.time;
                return true;
            }

            const { normalMax, bonusMax } = getNoteBaseScores(note);
            const isHit = (note.judgeResult && note.judgeResult.grade !== 'MISS') || (note.slideFinish && (!note.judgeResult || note.judgeResult.grade !== 'MISS'));
            const settleTime = isHit
                ? (note._judgeSettleTime ?? Math.max(startTiming + slideDuration, minDelayTiming))
                : (note._judgeSettleTime ?? tooLateTiming);
            const earned = isHit ? getNoteJudgeScore(note, note.judgeResult) : { normalScore: 0, bonusScore: 0 };

            if (commitAllowed && !note._settledCommitted) {
                note._settledCommitted = true;
                activeScoreState.committedNormalScore += earned.normalScore;
                activeScoreState.committedBonusScore += earned.bonusScore;
                activeScoreState.committedLostNormalScore += (normalMax - earned.normalScore);
                activeScoreState.committedLostBonusScore += (bonusMax - earned.bonusScore);
                if (isHit) {
                    if (note.isBreak) activeScoreState.committedQty.break++;
                    else activeScoreState.committedQty.slide++;
                }
                activeScoreState.pendingComboEvents.push({ time: settleTime, isHit: !!isHit });
            }
            return false;
        }

        if (isHold) {
            const holdEndT = holdDuration + noteT;

            if (!note.triggered && !note._holdPressed && !note.isHolding) {
                if (noteT >= -lateJudgeWindow) {
                    if (note.time - maxFutureJudgeWindow < minUnsettledTime) minUnsettledTime = note.time - maxFutureJudgeWindow;
                    return true;
                }
                if (!note._headMiss) {
                    note._headMiss = true;
                    note._headJudge = { grade: 'MISS', subGrade: '', scoreMultiplier: 0, breakMultiplier: 0 };
                }
                if (holdEndT > 0 && !note.holdFinish) {
                    // Hold 仍處於中途可補按區間，僅加入當幀暫時斷連事件而不永久提交
                    _comboEvents.push({ time: note.time + lateJudgeWindow, isHit: false });
                    if (note.time + lateJudgeWindow < minUnsettledTime) minUnsettledTime = note.time + lateJudgeWindow;
                    return true;
                }
                const { normalMax, bonusMax } = getNoteBaseScores(note);
                if (commitAllowed && !note._settledCommitted) {
                    note._settledCommitted = true;
                    activeScoreState.committedLostNormalScore += normalMax;
                    activeScoreState.committedLostBonusScore += bonusMax;
                    activeScoreState.pendingComboEvents.push({ time: note.time + holdDuration, isHit: false });
                }
                return false;
            }

            if (holdEndT > 0 && !note.holdFinish) {
                if (note.time + holdDuration < minUnsettledTime) minUnsettledTime = note.time + holdDuration;
                return true;
            }

            const { normalMax, bonusMax } = getNoteBaseScores(note);
            const isHit = (note.judgeResult && note.judgeResult.grade !== 'MISS') || (note.holdFinish && (!note.judgeResult || note.judgeResult.grade !== 'MISS'));
            const holdSettleTime = note.time + holdDuration;
            const earned = isHit ? getNoteJudgeScore(note, note.judgeResult) : { normalScore: 0, bonusScore: 0 };

            if (commitAllowed && !note._settledCommitted) {
                note._settledCommitted = true;
                activeScoreState.committedNormalScore += earned.normalScore;
                activeScoreState.committedBonusScore += earned.bonusScore;
                activeScoreState.committedLostNormalScore += (normalMax - earned.normalScore);
                activeScoreState.committedLostBonusScore += (bonusMax - earned.bonusScore);
                if (isHit) {
                    if (note.isBreak) activeScoreState.committedQty.break++;
                    else activeScoreState.committedQty.hold++;
                }
                activeScoreState.pendingComboEvents.push({ time: holdSettleTime, isHit: !!isHit });
            }
            return false;
        }

        // Tap / Star / Touch
        const { normalMax, bonusMax } = getNoteBaseScores(note);

        if (note.triggered) {
            const isHit = !(note.judgeResult && note.judgeResult.grade === 'MISS');
            const triggerSettleTime = note.triggeredTime ?? note.time;
            const earned = isHit ? getNoteJudgeScore(note, note.judgeResult) : { normalScore: 0, bonusScore: 0 };

            if (commitAllowed && !note._settledCommitted) {
                note._settledCommitted = true;
                activeScoreState.committedNormalScore += earned.normalScore;
                activeScoreState.committedBonusScore += earned.bonusScore;
                activeScoreState.committedLostNormalScore += (normalMax - earned.normalScore);
                activeScoreState.committedLostBonusScore += (bonusMax - earned.bonusScore);
                if (isHit) {
                    if (note.isBreak) activeScoreState.committedQty.break++;
                    else activeScoreState.committedQty[noteType]++;
                }
                activeScoreState.pendingComboEvents.push({ time: triggerSettleTime, isHit });
            }
            return false;
        }

        if (noteT < -lateJudgeWindow) {
            if (!note._missReported) {
                note._missReported = true;
                note.judgeResult = { grade: 'MISS', subGrade: '', isBreak: !!note.isBreak, scoreMultiplier: 0, breakMultiplier: 0, breakScoreValue: 0 };
                spawnJudgeEffect(note, note.judgeResult);
            }
            if (commitAllowed && !note._settledCommitted) {
                note._settledCommitted = true;
                activeScoreState.committedLostNormalScore += normalMax;
                activeScoreState.committedLostBonusScore += bonusMax;
                activeScoreState.pendingComboEvents.push({ time: note.time + lateJudgeWindow, isHit: false });
            }
            return false;
        }

        if (note.time - maxFutureJudgeWindow < minUnsettledTime) {
            minUnsettledTime = note.time - maxFutureJudgeWindow;
        }
        return true;
    };

    // 1. 先處理上次游標前仍未結算的長 Hold / 長 Slide
    for (let idx = activeScoreState.pendingNotes.length - 1; idx >= 0; idx--) {
        const pn = activeScoreState.pendingNotes[idx];
        const stillPending = evaluateScoreNote(pn, true);
        if (!stillPending) {
            activeScoreState.pendingSet.delete(pn);
            activeScoreState.pendingNotes.splice(idx, 1);
        }
    }

    // 2. 僅掃描當前游標之後尚未進入遠未來的音符，將已結算項目增量累加並推進游標
    let canAdvanceScoreCursor = (datas._isSorted !== false);
    for (let i = activeScoreState.settledCursor; i < notesLength; i++) {
        const note = notes[i];
        const noteT = note.time - globalTime;
        if (noteT > maxFutureJudgeWindow) {
            firstFutureIdx = i;
            break;
        }

        const stillPending = evaluateScoreNote(note, true);
        if (canAdvanceScoreCursor) {
            if (!stillPending) {
                activeScoreState.settledCursor = i + 1;
            } else if (noteT < -0.65) {
                if (!activeScoreState.pendingSet.has(note)) {
                    activeScoreState.pendingSet.add(note);
                    activeScoreState.pendingNotes.push(note);
                }
                activeScoreState.settledCursor = i + 1;
            } else {
                canAdvanceScoreCursor = false;
            }
        }
    }

    if (firstFutureIdx < notesLength) {
        const nextFutureEarliest = notes[firstFutureIdx].time - maxFutureJudgeWindow;
        if (nextFutureEarliest < minUnsettledTime) {
            minUnsettledTime = nextFutureEarliest;
        }
    }

    // 3. 排序僅剩的近年待合併 Combo 事件，將早於 minUnsettledTime 且安全排序的事件永久摺疊進 committedCombo
    const pendingEvs = activeScoreState.pendingComboEvents;
    if (pendingEvs.length > 0) {
        pendingEvs.sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            if (a.isHit !== b.isHit) return a.isHit ? -1 : 1;
            return 0;
        });

        let foldCount = 0;
        while (foldCount < pendingEvs.length && pendingEvs[foldCount].time < minUnsettledTime) {
            if (pendingEvs[foldCount].isHit) activeScoreState.committedCombo++;
            else activeScoreState.committedCombo = 0;
            foldCount++;
        }
        if (foldCount > 0) {
            pendingEvs.splice(0, foldCount);
        }
    }

    noteQuantity.tap = activeScoreState.committedQty.tap;
    noteQuantity.hold = activeScoreState.committedQty.hold;
    noteQuantity.slide = activeScoreState.committedQty.slide;
    noteQuantity.touch = activeScoreState.committedQty.touch;
    noteQuantity.break = activeScoreState.committedQty.break;

    playCombo = activeScoreState.committedCombo;
    if (_comboEvents.length === 0) {
        for (let i = 0; i < pendingEvs.length; i++) {
            if (pendingEvs[i].isHit) playCombo++;
            else playCombo = 0;
        }
    } else {
        for (let i = 0; i < pendingEvs.length; i++) {
            _comboEvents.push(pendingEvs[i]);
        }
        _comboEvents.sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            if (a.isHit !== b.isHit) return a.isHit ? -1 : 1;
            return 0;
        });
        for (let i = 0; i < _comboEvents.length; i++) {
            if (_comboEvents[i].isHit) playCombo++;
            else playCombo = 0;
        }
    }

    playScore = calcAchievement(
        activeScoreState.committedNormalScore,
        activeScoreState.committedBonusScore,
        playScoreRes.allPerfectScore,
        playScoreRes.breakBonusScore
    );
    const playScoreMinus = calcAchievementMinus(
        activeScoreState.committedLostNormalScore,
        activeScoreState.committedLostBonusScore,
        playScoreRes.allPerfectScore,
        playScoreRes.breakBonusScore
    );

    const calcPiecewiseSpeed = (x) => {
        if (x >= 1) {
            return x * 0.8833 + 0.8167;
        } else if (x <= -1) {
            return x * 0.8833 - 0.8167;
        } else {
            return x * 1.7;
        }
    };

    const baseSpeedCoeff = calcPiecewiseSpeed(settings.speed);
    const baseTouchSpeedCoeff = calcPiecewiseSpeed(settings.touchSpeed);
    const minBaseSpeedCoeff = Math.min(Math.abs(baseSpeedCoeff), Math.abs(baseTouchSpeedCoeff));
    const maxDecayTail = Math.max(effectDecayTime, hanabiEffectDecayTime, (JUDGE_WINDOWS.SLIDE?.GOOD_AREA_SEC ?? 0.6) + effectDecayTime, 0.5);
    const useBinaryRenderWindow = Boolean(datas._isSorted && datas._noteTimes && minBaseSpeedCoeff >= 0.05);
    let visLo = 0;
    let visHi = notesLength;
    if (useBinaryRenderWindow) {
        const effMinSpeed = Math.max(0.05, minBaseSpeedCoeff * (datas._minAbsHispeed || 1));
        const maxFutureVisSec = Math.max(2.5, 4.3 / effMinSpeed + 0.2);
        visLo = lowerBound(datas._noteTimes, globalTime - (3.5 + maxDecayTail));
        visHi = upperBound(datas._noteTimes, globalTime + maxFutureVisSec);
    }

    const processVisibleAndAudioNote = (note) => {
        const noteT = note.time - globalTime;
        const noteType = note.type;
        const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0) + (note.cullSkipExtend ?? 0);

        const noteHispeed = note.hispeed ?? 1;
        const speedCoeff = noteHispeed === 1 ? baseSpeedCoeff : calcPiecewiseSpeed(settings.speed * noteHispeed);
        const touchSpeedCoeff = noteHispeed === 1 ? baseTouchSpeedCoeff : calcPiecewiseSpeed(settings.touchSpeed * noteHispeed);

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
                    (note.holdDuration !== undefined && noteType !== "tap" && settings.playHoldEnd !== false && (note._holdPressed || note.holdFinish) && (!note.judgeResult || note.judgeResult.grade !== 'MISS'));
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
                if (!isFinished) {
                    buckets.slide.push(note);
                }
            } else if (noteType === 'hold' || noteType === 'tap') {
                buckets.tapnhold.push(note);
            } else if (noteType === 'touch') {
                buckets.touch.push(note);
            }
        }
    };

    // 核心音符繪製與音效迴圈：僅遍歷二分搜尋可見/音效視窗、慢速 hi-speed 未來音符與尚未結束的長音符
    if (useBinaryRenderWindow && datas._slowFutureNotes && datas._slowFutureNotes.length > 0) {
        const slowNotes = datas._slowFutureNotes;
        for (let k = slowNotes.length - 1; k >= 0; k--) {
            const idx = slowNotes[k];
            if (idx < visHi) break;
            processVisibleAndAudioNote(notes[idx]);
        }
    }
    for (let i = visHi - 1; i >= visLo; i--) {
        processVisibleAndAudioNote(notes[i]);
    }
    if (useBinaryRenderWindow && datas._longNotes && datas._longNotes.length > 0) {
        const longNotes = datas._longNotes;
        for (let k = longNotes.length - 1; k >= 0; k--) {
            const idx = longNotes[k];
            if (idx < visLo) {
                const ln = notes[idx];
                const skipT = (ln.holdDuration ?? 0) + (ln.slideDuration ?? 0) + (ln.slideDelay ?? 0) + (ln.cullSkipExtend ?? 0);
                if (globalTime <= ln.time + skipT + maxDecayTail + 0.2) {
                    processVisibleAndAudioNote(ln);
                }
            }
        }
    }

    cullSlideBucket(buckets.slide, maxSlideCount);

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
    usedSensorsThisFrame.clear();
}

// ============================================================
// 專案管理與專案載入 (Project Manager & Load Project)
// ============================================================

let currentProjectId = null;

const difficultyNames = ['EASY', 'BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER', '宴'];

function updateDifficultyOptions() {
    difficultySelect.replaceChildren();
    for (let difficulty = difficultyNames.length; difficulty > 0; difficulty--) {
        if (!rawdata?.[`inote_${difficulty}`]?.trim()) continue;
        const name = difficultyNames[difficulty - 1];
        const level = rawdata[`lv_${difficulty}`];
        difficultySelect.add(new Option(level ? `${name} · ${level}` : name, String(difficulty)));
    }
    difficultySelect.disabled = difficultySelect.options.length === 0;
    if (difficultySelect.disabled) return;
    difficultySelect.value = String(selectedDifficulty);
    if (difficultySelect.selectedIndex < 0) difficultySelect.selectedIndex = 0;
    selectedDifficulty = Number(difficultySelect.value);
}

async function loadProject(projectId) {
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

        if (currentProjectId !== projectId) return null;
        selectedDifficulty = Number(savedDifficulty) || 5;
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
            gameBackgroundImage.style.display = settings.showBackgroundWhenPaused === false ? 'none' : 'block';
        }

        tryUpdateBackgroundBrightness();

        if (savedBgm) {
            const url = URL.createObjectURL(savedBgm);
            await audioManager.setBackgroundMusic(url, savedBgm);
            audioManager.setPlaybackRate(settings.playbackSpeed || 1);
        }

        resize();
        draw();
        updateTimeControlUI(true);

        const list = await projectList();
        const proj = list.find(p => p.id === projectId);
        return proj;
    } catch (err) {
        console.error('載入專案失敗:', err);
        simpleToast({ content: '載入專案失敗：' + (err.message || err), type: 'error' });
        return null;
    }
}

function getFileHandlerCtx() {
    return {
        audioManager,
        getMaidata: () => rawdata,
        getBackgroundImage: () => backgroundImage,
        getBackgroundVideo: () => backgroundVideo,
        getCurrentProjectId: () => currentProjectId,
        importProjectFiles: async (files, name, targetId) => {
            const previousId = currentProjectId;
            const { projectId } = await saveProjectFilesToIDB(files, name, targetId, { replaceMissing: true });
            if (currentProjectId === previousId) await loadProject(projectId);
        },
    };
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

    const inputRefs = {};
    let popupCtx = null;

    const playSettingsConfig = [
        {
            label: 'settings.tabs.basic',
            items: [
                { type: 'header', label: 'settings.sections.speedAndNotes' },
                {
                    id: 'speed', type: 'range', label: 'settings.items.speed', min: 1, max: 20, step: 0.1, def: defaultSettings.speed,
                    apply: (val) => { renderer.settings.speed = val; draw(); }
                },
                {
                    id: 'slideSpeed', type: 'range', label: 'settings.items.slideSpeed', min: -1, max: 1, step: 0.05, def: defaultSettings.slideSpeed,
                    apply: (val) => { renderer.settings.slideSpeed = val; draw(); }
                },
                {
                    id: 'touchSpeed', type: 'range', label: 'settings.items.touchSpeed', min: 1, max: 20, step: 0.1, def: defaultSettings.touchSpeed,
                    apply: (val) => { renderer.settings.touchSpeed = val; draw(); }
                },
                {
                    id: 'pinkStars', type: 'checkbox', label: 'settings.items.pinkStars', def: defaultSettings.pinkStars,
                    apply: (val) => { renderer.settings.pinkStars = val; draw(); }
                },
                { type: 'header', label: 'settings.sections.playAndTouch' },
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
                    id: 'simplayPerfect', type: 'checkbox', label: 'settings.items.simplayPerfect', def: defaultSettings.simplayPerfect,
                    visibleWhen: (s) => s.autoPlay === 'simulate',
                    apply: (val) => {
                        settings.simplayPerfect = val;
                    }
                },
                {
                    id: 'simplayUseButton', type: 'checkbox', label: 'settings.items.simplayUseButton', def: defaultSettings.simplayUseButton ?? true,
                    visibleWhen: (s) => s.autoPlay === 'simulate',
                    apply: (val) => {
                        settings.simplayUseButton = val;
                    }
                },
                {
                    id: 'randomOffset', type: 'range', label: 'settings.items.randomOffset', def: defaultSettings.randomOffset, min: 0, max: 0.75, step: 0.01,
                    visibleWhen: (s) => s.autoPlay === 'simulate' && !s.simplayPerfect,
                    apply: (val) => {
                        settings.randomOffset = val;
                    }
                },
                {
                    id: 'fatFinger', type: 'checkbox', label: 'settings.items.fatFinger', def: defaultSettings.fatFinger ?? true,
                    apply: (val) => {
                        settings.fatFinger = val;
                    }
                },
                {
                    id: 'fatFingerRadius', type: 'range', label: 'settings.items.fatFingerRadius', min: 1, max: 10, step: 0.2, def: defaultSettings.fatFingerRadius ?? 4.2,
                    visibleWhen: (s) => s.fatFinger,
                    apply: (val) => {
                        settings.fatFingerRadius = parseFloat(val);
                    }
                },
                { type: 'header', label: 'settings.sections.language' },
                {
                    id: 'lang', type: 'dropdown', label: 'settings.items.lang',
                    options: [
                        { value: 'auto', label: 'settings.items.langAuto' },
                        ...getAvailableLanguages().map(({ code, name }) => ({ value: code, label: name })),
                    ],
                    get: getLangSetting,
                    apply: async (val) => {
                        if (val === getLangSetting() || !await setLang(val)) return;
                        flushPlaySettingsSave();
                        if (popupCtx) {
                            popupCtx.close();
                            openSettings();
                        }
                    }
                },
            ],
        },
        {
            label: 'settings.tabs.display',
            items: [
                { type: 'header', label: 'settings.sections.theme' },
                {
                    id: 'themeMode', type: 'dropdown', label: 'settings.items.themeMode',
                    options: [
                        { value: 'dark', label: 'settings.themeModeOpts.dark' },
                        { value: 'light', label: 'settings.themeModeOpts.light' },
                        { value: 'auto', label: 'settings.themeModeOpts.auto' },
                    ],
                    def: defaultSettings.themeMode || DEFAULT_THEME_MODE,
                    apply: (val) => {
                        settings.themeMode = val;
                        applyThemeSettings({ themeMode: val, accentColor: settings.accentColor });
                    }
                },
                {
                    id: 'accentColor', type: 'color', label: 'settings.items.accentColor',
                    def: defaultSettings.accentColor || DEFAULT_ACCENT_COLOR,
                    apply: (val) => {
                        settings.accentColor = val;
                        applyThemeSettings({ themeMode: settings.themeMode, accentColor: val });
                    }
                },
                { type: 'header', label: 'settings.sections.appearanceAndNotes' },
                {
                    id: 'rotateStars', type: 'checkbox', label: 'settings.items.rotateStars', def: defaultSettings.rotateStars,
                    apply: (val) => { renderer.settings.rotateStars = val; draw(); }
                },
                {
                    id: 'slideArrowHideBySensor', type: 'checkbox', label: 'settings.items.slideArrowHideBySensor', def: defaultSettings.slideArrowHideBySensor ?? true,
                    apply: (val) => { renderer.settings.slideArrowHideBySensor = val; draw(); }
                },
                {
                    id: 'showOutline', type: 'checkbox', label: 'settings.items.showOutline', def: defaultSettings.showOutline,
                    apply: (val) => {
                        settings.showOutline = val;
                        updateOutlineUI();
                    }
                },
                {
                    id: 'slideIllegalRed', type: 'checkbox', label: 'settings.items.slideIllegalRed', def: defaultSettings.slideIllegalRed,
                    apply: (val) => { renderer.settings.slideIllegalRed = val; draw(); }
                },
                {
                    id: 'canvasAspectRatio', type: 'dropdown', label: 'settings.items.canvasAspectRatio',
                    options: [
                        { value: 'auto', label: 'settings.aspectRatioOpts.auto' },
                        { value: '16:9', label: 'settings.aspectRatioOpts.r16_9' },
                        { value: '4:3', label: 'settings.aspectRatioOpts.r4_3' },
                        { value: '1:1', label: 'settings.aspectRatioOpts.r1_1' },
                        { value: '3:4', label: 'settings.aspectRatioOpts.r3_4' },
                        { value: '9:16', label: 'settings.aspectRatioOpts.r9_16' },
                    ],
                    def: defaultSettings.canvasAspectRatio || 'auto',
                    apply: (val) => { settings.canvasAspectRatio = val; resize(); }
                },
                { type: 'header', label: 'settings.sections.effectsAndJudge' },
                {
                    id: 'richHitEffect', type: 'dropdown', label: 'settings.items.richHitEffect',
                    options: [
                        { value: 'off', label: 'settings.richHitEffectOpts.off' },
                        { value: 'wmcx', label: 'settings.richHitEffectOpts.wmcx' },
                        { value: 'standard', label: 'settings.richHitEffectOpts.standard' },
                    ],
                    def: defaultSettings.richHitEffect || 'wmcx',
                    apply: (val) => { renderer.settings.richHitEffect = val; draw(); }
                },
                {
                    id: 'drawHanabiEffect', type: 'checkbox', label: 'settings.items.drawHanabiEffect', def: defaultSettings.drawHanabiEffect ?? true,
                    apply: (val) => { renderer.settings.drawHanabiEffect = val; draw(); }
                },
                {
                    id: 'richHanabi', type: 'checkbox', label: 'settings.items.richHanabi', def: defaultSettings.richHanabi,
                    visibleWhen: (s) => s.drawHanabiEffect,
                    apply: () => draw()
                },
                {
                    id: 'showJudge', type: 'checkbox', label: 'settings.items.showJudge', def: defaultSettings.showJudge ?? true,
                    apply: (val) => { renderer.settings.showJudge = val; draw(); }
                },
                {
                    id: 'showCriticalPerfect', type: 'checkbox', label: 'settings.items.showCriticalPerfect', def: defaultSettings.showCriticalPerfect ?? true,
                    visibleWhen: (s) => s.showJudge,
                    apply: (val) => { renderer.settings.showCriticalPerfect = val; draw(); }
                },
                {
                    id: 'showBreakCriticalPerfect', type: 'checkbox', label: 'settings.items.showBreakCriticalPerfect', def: defaultSettings.showBreakCriticalPerfect ?? true,
                    visibleWhen: (s) => s.showJudge && s.showCriticalPerfect,
                    apply: (val) => { renderer.settings.showBreakCriticalPerfect = val; draw(); }
                },
                {
                    id: 'showFastLate', type: 'checkbox', label: 'settings.items.showFastLate', def: defaultSettings.showFastLate ?? true,
                    visibleWhen: (s) => s.showJudge,
                    apply: (val) => { renderer.settings.showFastLate = val; draw(); }
                },
                { type: 'header', label: 'settings.sections.backgroundAndSensor' },
                {
                    id: 'moviebrightness', type: 'dropdown', label: 'settings.items.moviebrightness',
                    options: [
                        { value: '0', label: 'settings.items.bright' },
                        { value: '-1', label: 'settings.items.normal' },
                        { value: '-2', label: 'settings.items.dark' },
                        { value: '-3', label: 'settings.items.veryDark' },
                        { value: '-4', label: 'settings.items.minimumBrightness' }
                    ],
                    def: defaultSettings.moviebrightness ?? -4,
                    apply: (val) => {
                        settings.moviebrightness = parseInt(val);
                        tryUpdateBackgroundBrightness();
                    }
                },
                {
                    id: 'showBackgroundWhenPaused', type: 'checkbox', label: 'settings.items.showBackgroundWhenPaused', def: defaultSettings.showBackgroundWhenPaused,
                    apply: (val) => {
                        settings.showBackgroundWhenPaused = val;
                        if (!playing) updatePauseBackgroundDisplay();
                    }
                },
                {
                    id: 'showCoverWhenPaused', type: 'checkbox', label: 'settings.items.showCoverWhenPaused', def: defaultSettings.showCoverWhenPaused,
                    visibleWhen: (s) => s.showBackgroundWhenPaused,
                    apply: (val) => {
                        settings.showCoverWhenPaused = val;
                        if (!playing) updatePauseBackgroundDisplay();
                    }
                },
                {
                    id: 'showSensor', type: 'checkbox', label: 'settings.items.showSensor', def: defaultSettings.showSensor,
                    apply: (val) => { renderer.settings.showSensor = val; draw(); }
                },
                {
                    id: 'showSensorTextWhenPaused', type: 'checkbox', label: 'settings.items.showSensorTextWhenPaused', def: defaultSettings.showSensorTextWhenPaused,
                    apply: (val) => { renderer.settings.showSensorTextWhenPaused = val; draw(); }
                },
                {
                    id: 'sensorHighlight', type: 'checkbox', label: 'settings.items.sensorHighlight', def: defaultSettings.sensorHighlight ?? true,
                    apply: (val) => { renderer.settings.sensorHighlight = val; draw(); }
                },
                { type: 'header', label: 'settings.sections.canvasInfo' },
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
                    id: 'showUI', type: 'checkbox', label: 'settings.items.showUI', def: defaultSettings.showUI,
                    apply: () => draw()
                },
                {
                    id: 'showUIPosition', type: 'dropdown', label: 'settings.items.showUIPosition',
                    options: [
                        { value: 'top-left', label: 'settings.positionOpts.topLeft' },
                        { value: 'top-right', label: 'settings.positionOpts.topRight' },
                        { value: 'bottom-left', label: 'settings.positionOpts.bottomLeft' },
                        { value: 'bottom-right', label: 'settings.positionOpts.bottomRight' },
                    ],
                    def: defaultSettings.showUIPosition,
                    visibleWhen: (s) => s.showUI,
                    apply: () => draw()
                },
                {
                    id: 'timeDisplayCapsule', type: 'checkbox', label: 'settings.items.timeDisplayCapsule', def: defaultSettings.timeDisplayCapsule,
                    apply: () => { updatePlayCapsules(); updateTimeControlUI(true); }
                },
                {
                    id: 'timeDisplayCapsulePosition', type: 'dropdown', label: 'settings.items.timeDisplayCapsulePosition',
                    options: [
                        { value: 'left', label: 'settings.positionOpts.left' },
                        { value: 'center', label: 'settings.positionOpts.center' },
                        { value: 'right', label: 'settings.positionOpts.right' },
                    ],
                    def: defaultSettings.timeDisplayCapsulePosition,
                    visibleWhen: (s) => s.timeDisplayCapsule,
                    apply: updatePlayCapsules
                },
                {
                    id: 'slideDebug', type: 'checkbox', label: 'settings.items.slideDebug', def: defaultSettings.slideDebug ?? false,
                    apply: (val) => { toggleSlideDebug(val); }
                },
            ],
        },
        {
            label: 'settings.tabs.sfx',
            items: [
                { type: 'header', label: 'settings.sections.volume' },
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
                    id: 'sfxVolumes', type: 'object', label: 'settings.items.sfxVolumes', def: defaultSettings.sfxVolumes,
                    apply: (val) => { audioManager.setSFXVolumes(val); }
                },
                { type: 'header', label: 'settings.sections.sfxBehavior' },
                {
                    id: 'playbackSpeed', type: 'range', label: 'menu.playbackSpeed', min: 0.25, max: 2, step: 0.05, def: defaultSettings.playbackSpeed || 1,
                    apply: (val) => {
                        setPlaybackSpeed(val);
                    }
                },
                {
                    id: 'playHoldEnd', type: 'checkbox', label: 'settings.items.playHoldEnd', def: defaultSettings.playHoldEnd,
                    apply: (val) => { settings.playHoldEnd = val; }
                },
            ],
        },
    ];

    const conditionalRows = [];
    playSettingsConfig.forEach((category) => {
        const section = addTab(t(category.label));

        category.items.forEach(item => {
            if (item.type === 'header') {
                const heading = createSettingSectionTitle(t(item.label));
                heading.dataset.i18n = item.label;
                section.appendChild(heading);
                return;
            }
            const targetRef = item.ref || settings;
            const targetKey = item.key || item.id;
            const currentVal = item.get ? item.get() : (targetRef[targetKey] ?? item.def);

            let el;

            // A. Checkbox
            if (item.type === 'checkbox') {
                el = createSettingCheckbox(currentVal, `settings-${item.id}`);
                el.addEventListener('change', (e) => {
                    targetRef[targetKey] = e.target.checked;
                    if (item.apply) item.apply(e.target.checked);
                    saveSettingsDebounce();
                });
                el.addEventListener('click', (e) => e.stopPropagation());
            }
            // B. Dropdown
            else if (item.type === 'dropdown') {
                el = createSettingDropdown(currentVal, item.options);
                el.addEventListener('change', (e) => {
                    const parsedVal = isNaN(e.target.value) ? e.target.value : parseFloat(e.target.value);
                    targetRef[targetKey] = parsedVal;
                    if (item.apply) item.apply(parsedVal);
                    saveSettingsDebounce();
                });
            }
            // C. Range
            else if (item.type === 'range') {
                el = createSettingRangeInput(currentVal, item.min, item.max, item.step, (val) => {
                    targetRef[targetKey] = val;
                    if (item.apply) item.apply(val);
                    saveSettingsDebounce();
                });
            }
            // C2. Color
            else if (item.type === 'color') {
                el = createSettingColorInput(currentVal, (newColor) => {
                    targetRef[targetKey] = newColor;
                    if (item.apply) item.apply(newColor);
                    saveSettingsDebounce();
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

                    const subSlider = createSettingRangeInput(subCurrent, 0, 1, 0.05, (subVal) => {
                        el.value[subKey] = subVal;
                        targetRef[targetKey][subKey] = subVal;
                        if (item.apply) item.apply(targetRef[targetKey]);
                        saveSettingsDebounce();
                    });

                    el._subRefs[subKey] = subSlider;
                    const subRow = createSettingRow(t(`settings.sfxVolumeOpts.${subKey}`), subSlider);
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

            const row = createSettingRow(t(item.label), el);
            if (item.visibleWhen) conditionalRows.push({ row, visibleWhen: item.visibleWhen });
            section.appendChild(row);
        });
    });

    const refreshVisibility = () => {
        for (const { row, visibleWhen } of conditionalRows) {
            row.style.display = visibleWhen(settings) ? '' : 'none';
        }
    };
    container.addEventListener('change', refreshVisibility);
    refreshVisibility();
    switchTab(0);

    popupCtx = popupWindow({
        title: t('settings.title'),
        customContent: container,
        width: "85%",
        maxWidth: "560px",
        onClose: () => {
            flushPlaySettingsSave();
        },
        buttons: [
            {
                text: t('popup.restorePlayDefaults'),
                onClick: () => {
                    if (!confirm(t('popup.confirmRestorePlayDefaults'))) return;
                    Object.assign(settings, JSON.parse(JSON.stringify(defaultSettings)));
                    applyThemeSettings({
                        themeMode: settings.themeMode ?? DEFAULT_THEME_MODE,
                        accentColor: settings.accentColor ?? DEFAULT_ACCENT_COLOR,
                    });
                    applyAudioSettings(settings);
                    setPlaybackSpeed(settings.playbackSpeed || 1);
                    toggleSlideDebug(false);
                    renderer.settings = settings;
                    updateOutlineUI();
                    updatePlayCapsules();
                    updateTimeControlUI(true);
                    updateAutoPlayUI();
                    tryUpdateBackgroundBrightness();
                    resize();
                    persistPlaySettings();
                    simpleToast({ content: t('toast.playDefaultsRestored'), type: 'info', timeout: 1500 });
                    if (popupCtx) {
                        popupCtx.close();
                        openSettings();
                    }
                }
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

