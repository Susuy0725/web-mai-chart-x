import { createVisualNoteCallbacks, initVisualScroller, stripLeadingTags } from './features/visualEditor.js';
import { settingsConfig, defaultSettings } from './core/settingsConfig.js';
export { defaultSettings };
import { initServiceWorker } from './core/swManager.js';
import { runInitModal } from './core/init.js';
import { SecondaryWindowManager } from './features/secondaryWindow.js';
import { initFileHandlers } from './features/fileHandler.js';
import { initQuickPanel } from './features/quickPanel.js';
import { openHelpModal } from './modals/helpModal.js';
import { openChartInfoModal } from './modals/chartInfoModal.js';
import { openResourceManager } from './modals/resourceManagerModal.js';
import { openDB, idbGet, idbSet, idbSetProject, idbGetProject, projectList, projectCreate, projectDelete, projectRename, projectTouch, projectUpdateName, migrateFromLegacy } from './indexDB.js';
import {
    getButton, disableNavigationGestures, debounce, throttle,
    getHighlight, parseMaidata, popupWindow, loadAllImages,
    simpleToast,
    clamp, createCustomSlider,
    SimaiLogicControler
} from './helper.js';
import { SimaiRenderer, SimaiVisualEditor, SimaiPreviewRenderer } from './renderer.js';
import { simaiDecode } from './decode.js';
import { t, setLang, getCurrentLang, applyI18nToDOM } from './i18n.js';
import { updateDiscordRPC } from '../rpc.js';
import { audioManager } from './audioManager.js';
import { majdataWs } from './majdataWs.js';
import { openBgmEditor, openTapBpm } from './modals/bgmEditor.js';
import { openMainoteFetcher } from './modals/mainoteFetcher.js';
import { openProjectManager } from './modals/projectManager.js';
import { openRecordVideoModal } from './modals/recordVideoModal.js';
import { initFindReplace, openFindBar, closeFindBar } from './features/findReplace.js';
import { toggleNoteFlag, handleToggleBkEx, applySelectedRotation, applyVerticalFlip, applyHorizontalFlip } from './features/noteModifier.js';
export { toggleNoteFlag };

// 初始化進行靜態翻譯
applyI18nToDOM();
majdataWs.setToastHandler(simpleToast);

initServiceWorker();
disableNavigationGestures();

let
    isInitComplete = false,
    images,
    readyBeat = false,
    maidata = {},
    nowDifficulty = 5,
    backgroundImage,
    backgroundVideo,
    renderer,
    visualEditorRenderer,
    previewRender,
    settings = {},
    isContextEdited = false,
    isVerticalMode = (document.documentElement.clientWidth / document.documentElement.clientHeight) <= 0.587,
    currentProjectId = null,
    lastEditorValue = '';

// 專案命名空間化的讀寫包裝
const projSet = (key, value) => idbSetProject(currentProjectId, key, value);
const projGet = (key) => idbGetProject(currentProjectId, key);

window.popupWindow = popupWindow;
window.simpleToast = simpleToast;

const simaiLogicControler = new SimaiLogicControler(audioManager);



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

const canvas = document.getElementById('main');
const canvasContainer = document.getElementById('canvasContainer');
const timeline = document.getElementById('timeControl');
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
const addVideoButton = getButton("addVideo", "utility");
const importFromVideoButton = getButton("importFromVideo", "utility");
const readMaidataButton = getButton("readMaidata", "utility");
const readZipButton = getButton("readZip", "utility");
const chartInfoButton = getButton("chartInfo", "utility");
const settingsButton = getButton("settings", "utility");
const popup = getButton("popup", "utility");
const folderInput = getButton("readFolder", "utility");
const getNowNoteIndex = getButton("getNowNoteIndex", "utility");
const switchBoxRadios = document.querySelectorAll('input[name="switchBoxMode"]');
const setSwitchBoxDisplayModeUI = (mode) => {
    const radioVal = (mode === 'simai') ? 'keyboard' : 'selector';
    const radio = document.querySelector(`input[name="switchBoxMode"][value="${radioVal}"]`);
    if (radio) radio.checked = true;
};
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
if (editorBackgroundVideo) {
    editorBackgroundVideo.playsInline = true;
    editorBackgroundVideo.defaultMuted = true;
    editorBackgroundVideo.muted = true;
    editorBackgroundVideo.setAttribute('playsinline', '');
    editorBackgroundVideo.setAttribute('webkit-playsinline', '');
    editorBackgroundVideo.setAttribute('x5-playsinline', '');
    editorBackgroundVideo.setAttribute('disablePictureInPicture', '');
    editorBackgroundVideo.setAttribute('disableRemotePlayback', '');
    editorBackgroundVideo.addEventListener('webkitbeginfullscreen', (e) => {
        e.preventDefault();
        try {
            if (typeof editorBackgroundVideo.webkitExitFullscreen === 'function') {
                editorBackgroundVideo.webkitExitFullscreen();
            }
        } catch (_) { }
    });
    editorBackgroundVideo.addEventListener('webkitpresentationmodechanged', () => {
        if (editorBackgroundVideo.webkitPresentationMode === 'fullscreen' && typeof editorBackgroundVideo.webkitSetPresentationMode === 'function') {
            editorBackgroundVideo.webkitSetPresentationMode('inline');
        }
    });
}
const tapBpmButton = getButton("tapBpm", "utility");
const manageResourcesButton = getButton("manageResources", "utility");
const playbackSpeedInput = getButton("playbackSpeed", "utility").children[0];
const playbackReset = getButton("playbackSpeed", "utility");
const undoButton = getButton("undo", "utility");
const redoButton = getButton("redo", "utility");
const helpButton = getButton("help", "utility");
const fullscreenButton = getButton("fullscreen", "utility");
const findReplaceButton = getButton("findReplace", "utility");
const toggleBkButton = getButton("toggleBk", "utility");
const toggleExButton = getButton("toggleEx", "utility");
const connectMajdataViewButton = getButton("connectMajdataView", "utility");
const recordVideoButton = getButton("recordVideo", "utility");
const fetchFromMainoteButton = getButton("fetchFromMainote", "utility");
const previewContainer = document.getElementById('miniPreviewContainer');
const previewCanvas = document.getElementById('miniPreview');
const previewZoomInButton = document.getElementById('mpzoomIn');
const previewZoomOutButton = document.getElementById('mpzoomOut');
const editorContainer = document.getElementById('editorContainer');
const panelSplitter = document.getElementById('panelSplitter');
const editorInput = document.getElementById('editor-input');
const highlightLayer = document.getElementById('highlight-layer');
const findReplaceBar = document.getElementById('findReplaceBar');
const findInput = document.getElementById('findInput');
const replaceInput = document.getElementById('replaceInput');
const findMatchCount = document.getElementById('findMatchCount');
const findPrevBtn = document.getElementById('findPrevBtn');
const findNextBtn = document.getElementById('findNextBtn');
const findCloseBtn = document.getElementById('findCloseBtn');
const replaceRow = document.getElementById('replaceRow');
const replaceOneBtn = document.getElementById('replaceOneBtn');
const replaceAllBtn = document.getElementById('replaceAllBtn');
const showPlayControlsBtn = document.getElementById('showPlayControlsBtn');
const quickPanel = document.getElementById('quick-panel');
const timebaseButton = document.querySelector('.utilityButton[data-buttonAction="timebase"]');
const canvasOutline = document.getElementById('canvasOutline');
const backgroundContainer = document.querySelector('#canvasContainer .backgroundContainer');
const gridDivisionBtn = document.querySelector('.utilityButton[data-buttonAction="gridDivision"]');
const gridDivisionSelect = gridDivisionBtn ? gridDivisionBtn.querySelector('select[name="gridDivision"]') : null;
const visualToolModeBtn = document.querySelector('.utilityButton[data-buttonAction="visualToolMode"]');
const visualToolModeSelect = visualToolModeBtn ? visualToolModeBtn.querySelector('select[name="visualToolMode"]') : null;

let globalTime = 0, realTime = 0;
let lastTimestamp = null;
let playStartTimestamp = null;
let playStartRealTime = 0;
let secondCtx = null;
let externalWindow = null;
let timeControlSliding = false; // 新增滑動狀態標記
let keepRenderingWhilePause = false; // 是否在暫停時繼續渲染（保持畫面更新）
let nowIndex = 0;
let lastCursorIndex = -1;
let visualCtx = null;
let warnings = [], warningPositions = [], warningPositionsConst = [];
let decodedTags = [];
let playScoreRes = { tap: 0, hold: 0, slide: 0, touch: 0, break: 0, score: 0, breakScore: 0, invScore: 0 };

let lastCanvasSize = { w: 0, h: 0 };
let lastVisualEditorSize = { w: 0, h: 0 };

function applySplitRatio(ratio) {
    document.documentElement.style.setProperty('--split-ratio', ratio);
}

let canvasSnapped = false, noRender = false;

function snapHideCanvas() {
    canvasSnapped = true;
    noRender = true;
    canvasContainer.style.display = 'none';
    editorContainer.style.left = '0';
    editorContainer.style.width = '100%';
    editorContainer.style.marginLeft = '10px';
    if (panelSplitter) {
        panelSplitter.style.display = 'block';
        panelSplitter.classList.add('snapped');
    }
    resize(true);
    settings.canvasSnapped = true;
    saveSettingsDebounce();
}

function snapRestoreCanvas() {
    canvasSnapped = false;
    noRender = false;
    canvasContainer.style.display = '';
    editorContainer.style.left = '';
    editorContainer.style.width = '';
    editorContainer.style.marginLeft = '';
    if (panelSplitter) {
        panelSplitter.classList.remove('snapped');
    }
    applySplitRatio(settings.splitRatio ?? 0.5);
    resize(true);
    settings.canvasSnapped = false;
    saveSettingsDebounce();
}

if (fullscreenButton) {
    fullscreenButton.addEventListener('click', () => {
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
        const iconSpan = fullscreenButton.querySelector('.material-symbols-outlined');
        if (iconSpan) {
            iconSpan.textContent = isFullscreen ? 'fullscreen_exit' : 'fullscreen';
        }
        fullscreenButton.title = isFullscreen ? '退出全螢幕' : '全螢幕';
    };

    document.addEventListener('fullscreenchange', updateFullscreenIcon);
    document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
    document.addEventListener('msfullscreenchange', updateFullscreenIcon);
}

// ==========================================
// 1. 切換 Break (bk) 與 EX (ex) 音符旗標
// ==========================================
if (toggleBkButton) {
    toggleBkButton.addEventListener('click', () => handleToggleBkEx('bk', { editorInput }));
}
if (toggleExButton) {
    toggleExButton.addEventListener('click', () => handleToggleBkEx('ex', { editorInput }));
}

// ==========================================
// 2. 尋找與取代 (Find & Replace)
// ==========================================
initFindReplace({
    findReplaceBar,
    findInput,
    replaceInput,
    findMatchCount,
    findPrevBtn,
    findNextBtn,
    findCloseBtn,
    replaceRow,
    replaceOneBtn,
    replaceAllBtn,
    findReplaceButton,
    editorInput,
    editorContainer,
});

if (panelSplitter) {
    let isDraggingSplitter = false;
    let dragStartX = 0;
    let dragStartRatio = 0.5;
    let resizeRafId = null;

    panelSplitter.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        isDraggingSplitter = true;
        dragStartX = e.clientX;

        if (canvasSnapped) {
            // 從 snap 狀態開始拖動：先還原 canvas，從 0 開始計算 ratio
            snapRestoreCanvas();
            dragStartRatio = 0;
        } else {
            dragStartRatio = settings.splitRatio ?? 0.5;
            canvasContainer.style.width = '';
        }

        panelSplitter.classList.add('dragging');
        panelSplitter.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    panelSplitter.addEventListener('pointermove', (e) => {
        if (!isDraggingSplitter) return;
        const windowWidth = window.innerWidth;
        if (windowWidth <= 0) return;
        const deltaX = e.clientX - dragStartX;
        let newRatio = dragStartRatio + (deltaX / windowWidth);
        if (newRatio < 0.15) {
            newRatio = 0;
        } else {
            newRatio = Math.min(0.85, newRatio);
        }

        settings.splitRatio = newRatio;
        applySplitRatio(newRatio);

        if (!resizeRafId) {
            resizeRafId = requestAnimationFrame(() => {
                resizeRafId = null;
                resize(true);
            });
        }
    });

    const stopDraggingSplitter = (e) => {
        if (!isDraggingSplitter) return;
        isDraggingSplitter = false;
        panelSplitter.classList.remove('dragging');
        if (e.pointerId !== undefined && panelSplitter.hasPointerCapture(e.pointerId)) {
            try { panelSplitter.releasePointerCapture(e.pointerId); } catch (_) { }
        }
        if ((settings.splitRatio ?? 0.5) < 0.15) {
            snapHideCanvas();
        } else {
            saveSettingsDebounce();
            resize(true);
        }
    };

    panelSplitter.addEventListener('pointerup', stopDraggingSplitter);
    panelSplitter.addEventListener('pointercancel', stopDraggingSplitter);
}

function updateTimebase() {
    const v1 = parseInt(timebaseButton.querySelector('input[name="tb1"]').value, 10) || 4;
    const v2 = parseInt(timebaseButton.querySelector('input[name="tb2"]').value, 10) || 4;
    projSet('tb1', v1).catch(console.error);
    projSet('tb2', v2).catch(console.error);
    visualEditorRenderer.setTimebase(v1, v2);
    previewRender.setTimebase(v1, v2);
}
function restoreTimebase(t1 = 4, t2 = 4) {
    const v1 = parseInt(t1, 10) || 4;
    const v2 = parseInt(t2, 10) || 4;
    timebaseButton.querySelector('input[name="tb1"]').value = v1;
    timebaseButton.querySelector('input[name="tb2"]').value = v2;
}
timebaseButton.addEventListener('input', function () {
    updateTimebase();
    draw();
});

function updateGridDivisionVisibility() {
    const isVis = isVisualMode();
    if (gridDivisionBtn) {
        gridDivisionBtn.style.display = isVis ? '' : 'none';
    }
    if (visualToolModeBtn) {
        visualToolModeBtn.style.display = isVis ? '' : 'none';
    }
}

function setGridDivisionUI(val) {
    if (!gridDivisionSelect) return;
    const strVal = String(val);
    let opt = Array.from(gridDivisionSelect.options).find(o => o.value === strVal);
    if (!opt && val > 0) {
        const customOpt = document.createElement('option');
        customOpt.value = strVal;
        customOpt.textContent = `1/${val}`;
        const lastOpt = gridDivisionSelect.options[gridDivisionSelect.options.length - 1];
        if (lastOpt && lastOpt.value === 'custom') {
            gridDivisionSelect.insertBefore(customOpt, lastOpt);
        } else {
            gridDivisionSelect.appendChild(customOpt);
        }
    }
    gridDivisionSelect.value = strVal;
}

if (gridDivisionSelect) {
    gridDivisionSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            const input = prompt('請輸入切分數值 (正整數，例如 7, 14, 42 等)：', settings.gridDivision || 4);
            if (input === null) {
                setGridDivisionUI(settings.gridDivision || 4);
                return;
            }
            const val = parseInt(input.trim(), 10);
            if (!isNaN(val) && val > 0) {
                settings.gridDivision = val;
                setGridDivisionUI(val);
                saveSettingsDebounce();
                draw();
            } else {
                alert('請輸入有效的正整數切分數值。');
                setGridDivisionUI(settings.gridDivision || 4);
            }
        } else {
            const val = parseInt(e.target.value, 10) || 4;
            settings.gridDivision = val;
            saveSettingsDebounce();
            draw();
        }
    });
}

if (visualToolModeSelect) {
    visualToolModeSelect.addEventListener('change', (e) => {
        const mode = e.target.value;
        settings.visualToolMode = mode;
        if (visualEditorRenderer && typeof visualEditorRenderer.setEditMode === 'function') {
            visualEditorRenderer.setEditMode(mode);
        }
        saveSettingsDebounce();
        draw();
    });
}

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    // 支援 Ctrl+Z / Cmd+Z (復原) 與 Ctrl+Y / Cmd+Y / Ctrl+Shift+Z (重做)
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
            if (isVisualMode() || e.target !== editorInput) {
                e.preventDefault();
                if (e.shiftKey) {
                    redoButton.click();
                } else {
                    undoButton.click();
                }
                return;
            }
        } else if (key === 'y') {
            if (isVisualMode() || e.target !== editorInput) {
                e.preventDefault();
                redoButton.click();
                return;
            }
        }
    }

    if (e.target.tagName === 'TEXTAREA') return;

    if (isVisualMode()) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (visualEditorRenderer && visualEditorRenderer.selectedNotes && visualEditorRenderer.selectedNotes.size > 0) {
                const selectedList = Array.from(visualEditorRenderer.selectedNotes);
                visualDeleteNote(selectedList);
                visualEditorRenderer.clearSelection();
            }
        } else if (e.key === 'Escape') {
            if (visualEditorRenderer && typeof visualEditorRenderer.clearSelection === 'function') {
                visualEditorRenderer.clearSelection();
            }
        } else if (e.key === 'e' || e.key === 'E') {
            if (visualToolModeSelect) {
                visualToolModeSelect.value = 'edit';
                visualToolModeSelect.dispatchEvent(new Event('change'));
            }
        } else if (e.key === 'v' || e.key === 'V' || e.key === 's' || e.key === 'S') {
            if (visualToolModeSelect) {
                visualToolModeSelect.value = 'select';
                visualToolModeSelect.dispatchEvent(new Event('change'));
            }
        }
    }
});

let notes = [], endTime = 1, musicDelay = 0, rawData = [], dataIndexToTime = [];

let ctx = canvas.getContext('2d');

//-----Quick panel-----
initQuickPanel({
    quickPanel,
    settings,
    isInitComplete: () => isInitComplete,
    onRotateSelection: (dir) => rotateSelection(dir),
    onFlipVertical: () => flipVertical(),
    onFlipHorizontal: () => flipHorizontal(),
    redoButton,
    undoButton,
    getCursorNoteIndex
});

const scale = 0.98;
const
    MAX_ZOOM = 1000,
    MIN_ZOOM = 15,
    ZOOM_STEP = 10;

function applyAudioSettings(s) {
    if (!audioManager || !s) return;
    if (s.globalVolume !== undefined) audioManager.setGlobalVolume(s.globalVolume);
    if (s.musicVolume !== undefined) audioManager.setBGMVolume(s.musicVolume);
    if (s.SfxVolume !== undefined) audioManager.setSFXVolume(s.SfxVolume);
    if (s.sfxVolumes) audioManager.setSFXVolumes(s.sfxVolumes);
}


function applyMovieBrightness(val) {
    if (backgroundImage) editorBackgroundImage.style.filter = `brightness(${1 + 0.1875 * val})`;
    if (backgroundVideo) editorBackgroundVideo.style.filter = `brightness(${1 + 0.1875 * val})`;
}

// 上次對影片進行 seek 的時間（秒），用來避免頻繁設定 currentTime
let lastVideoSeekTime = 0;
const VIDEO_MIN_SEEK_INTERVAL = 0.8; // 最短 seek 間隔（秒）
const VIDEO_SEEK_THRESHOLD = 0.3; // 當差距超過此值才執行 seek（秒）

let clockBpm = 60;

const isVisualMode = () => settings.displayMode === 'visual';
const previewVisible = () => (previewContainer.style.display !== 'none' && document.getElementById('playControls').style.display !== 'none');

const saveSettingsDebounce = debounce(() => {
    if (majdataWs.isConnected()) {
        majdataWs.sendSetting(settings);
    }
    idbSet('simai_settings', JSON.stringify(settings)).catch((error) => {
        console.error('儲存設定到 IndexedDB 失敗:', error);
    });
}, 300);

const setEndtime = (e) => {
    endTime = Math.max(e + 1, audioManager.getBGMDuration() + 1);
    timeline.max = endTime + musicDelay;
    updateSlider(realTime);
};

const updateSlider = (time) => {
    const min = parseFloat(timeline.min) || 0;
    const max = parseFloat(timeline.max) || 100;
    const ratio = Math.max(0, Math.min(1, max > min ? (time - min) / (max - min) : 0));
    timeline.value = time;
    const thumbWidth = 16;
    const stopPos = `calc(${thumbWidth * 0.5}px + ${ratio} * (100% - ${thumbWidth}px))`;
    timeline.style.setProperty('--timeline-progress', stopPos);
};

manageResourcesButton.addEventListener('click', () => {
    openResourceManager();
});

editMusicButton.addEventListener('click', () => {
    openBgmEditor({
        audioManager,
        getMusicDelay: () => musicDelay,
        setMusicDelay: (val) => { musicDelay = val; },
        getClockBpm: () => clockBpm,
        offsetInput,
        editorInput,
        applyHighlight,
        inputDebounce,
        offsetInputDebounce,
        projSet,
    });
});

tapBpmButton.addEventListener('click', () => {
    openTapBpm({
        editorInput,
        applyHighlight,
        inputDebounce,
        setEditorCss,
    });
});

function setDataEmpty() {
    playButton.dataset.playing = 'false';
    playButton.children[0].innerText = "play_arrow";
    playStartTimestamp = null;
    maidata = {};
    nowDifficulty = 5;
    backgroundImage = null;
    backgroundVideo = null;
    applyHighlight('');
    musicDelay = 0;
    realTime = 0;
    globalTime = 0;
    timeline.max = 1;
    timeline.value = 0;
    updateSlider(0);
    offsetInput.value = 0;
    editorInput.value = '';
    // 清除編輯歷史（新譜面應該重新開始）
    undoStack = [];
    redoStack = [];
    historyMap = {};
    lastEditorValue = '';
    updateUndoRedoUI();
    audioManager.removeBackgroundMusic().catch(() => { });
    changeDifficulty.value = nowDifficulty;
    editorBackgroundImage.src = "";
    editorBackgroundImage.style.display = 'none';
    editorBackgroundVideo.src = "";
    editorBackgroundVideo.style.display = 'none';
    applyMovieBrightness(settings.moviebrightness);
    inputDebounce();
    saveMaidata();

    //projSet('background_image', null).catch(() => { });
    //projSet('background_video', null).catch(() => { });
    //projSet('now_difficulty', nowDifficulty).catch(() => { });
    //projSet('resource_bgm', null).catch(() => { });
    //projSet('timeControl', 0).catch(() => { });
}

fetchFromMainoteButton.addEventListener('click', () => {
    openMainoteFetcher({
        audioManager,
        getMaidata: () => maidata,
        setMaidata: (val) => { maidata = val; },
        setNowDifficulty: (val) => { nowDifficulty = val; },
        changeDifficulty,
        editorInput,
        getCurrentProjectId: () => currentProjectId,
        setCurrentProjectId: (val) => { currentProjectId = val; },
        setDataEmpty,
        getres,
        applyHighlight,
        saveMaidata,
        resetHistory: () => {
            undoStack = [];
            redoStack = [];
            historyMap = {};
            lastEditorValue = editorInput.value || '';
            updateUndoRedoUI();
        },
        projSet,
    });
});

createNewButton.addEventListener('click', async () => {
    if (!confirm(t('popup.createNewProject.confirm'))) return;
    const newId = await projectCreate(t('popup.projectManager.untitled'));
    loadProject(newId);
    simpleToast({ content: t('toast.projectCreated'), type: 'success', timeout: 1200 });
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
                ...result.notesCounts,
                score: result.score,
            };
            playScoreRes.breakScore = playScoreRes.break == 0 ? 0 : (1 / playScoreRes.break);
            playScoreRes.invScore = 1 / playScoreRes.score;
            rawData = splitRespectingLineComments(simaiDataValue);
            lastCursorIndex = -1;

            warnings = result.warnings || [];
            warningPositions = result.errpositions || [];
            warningPositionsConst = warningPositions;
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
    console.log(dataIndexToTime);
    const contentHTML = warnings.map((w, i) => {
        const errpos = warningPositionsConst[i];
        console.log(warningPositionsConst, i, errpos);
        if (errpos !== undefined) {
            return `<div class="warning-item" style="cursor: pointer; color: #ccc; text-decoration: underline; margin-bottom: 8px; font-family: 'Plus Jakarta Sans', 'Noto Sans TC', sans-serif; font-size: 13px;" data-errpos="${errpos}">• ${w}</div>`;
        }
        return `<div style="margin-bottom: 8px; color: #ccc; font-family: sans-serif; font-size: 13px;">• ${w}</div>`;
    }).join('');

    const popupCtx = popupWindow({
        title: t('popup.warning.title'),
        content: contentHTML,
    });

    popupCtx.elements.content.addEventListener('click', (e) => {
        console.log(e.target);
        const item = e.target.closest('.warning-item');
        if (item) {
            const errpos = parseInt(item.dataset.errpos, 10);
            if (!isNaN(errpos)) {
                const charIdx = findCommaCharIndex(editorInput.value, errpos);
                editorInput.selectionStart = charIdx;
                editorInput.selectionEnd = charIdx;
                editorInput.focus();
            }
            popupCtx.close();
        }
    });
});

const offsetInputDebounce = debounce(() => {
    timeline.max = endTime + musicDelay;
    updateSlider(realTime);

    globalTime = realTime - musicDelay;

    if (playButton.dataset.playing === 'true') {
        audioManager.playBGM(realTime); // 調整音樂播放位置，讓它與節拍更貼合
        syncPlayTimer();
    }
    maidata.first = musicDelay;
    saveMaidata();
    draw();
}, 500);

const saveMaidata = debounce(() => {
    projSet('maidata', maidata).catch((error) => {
        console.error("儲存maidata到IndexedDB失敗:", error);
    });
    if (currentProjectId) {
        const name = maidata?.title || null;
        projectTouch(currentProjectId).catch(() => { });
        if (name) projectUpdateName(currentProjectId, name).catch(() => { });
    }

    // 更新 Discord RPC 狀態
    updateDiscordRPC(maidata, nowDifficulty);
}, 2000);

const inputDebounce = debounce(() => {
    // 記錄歷史 (diff)
    recordEditorHistory();
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
    const targetRatio = settings.splitRatio ?? 0.5;
    const targetWidth = visible ? `${targetRatio * 100}%` : '100%';
    const canvasAnimation = canvasContainer.animate(
        [{ width: targetWidth }],
        { duration: 400, fill: 'forwards', easing: 'ease' }
    );

    let animationRunning = true;
    const throttledResize = throttle(() => resize(true), 16); // 限制每 16ms 最多调用一次（约 60fps）

    function syncResize() {
        if (animationRunning) {
            throttledResize();
            requestAnimationFrame(syncResize);
        }
    }

    canvasAnimation.onfinish = () => {
        animationRunning = false;
        canvasAnimation.cancel();
        if (visible) {
            canvasContainer.style.width = '';
        } else {
            canvasContainer.style.width = '100%';
        }
        resize(true);
    };

    syncResize();
}
let currentEditorAnimation = null;
let currentSplitterAnimation = null;

function animateEditorContainer(visible) {
    if (!editorContainer) return;

    // 計算分割線平移距離（與 editorContainer 等寬）
    const width = editorContainer.offsetWidth || (window.innerWidth * (1 - (settings.splitRatio ?? 0.5)));
    const targetDistance = `${width}px`;

    let editorStart = visible ? 'translateX(100%)' : 'translateX(0)';
    let splitterStart = visible ? `translateX(${targetDistance})` : 'translateX(0)';

    if (currentEditorAnimation) {
        const computed = window.getComputedStyle(editorContainer).transform;
        if (computed && computed !== 'none') {
            editorStart = computed;
        }
        currentEditorAnimation.cancel();
        currentEditorAnimation = null;
    }

    if (currentSplitterAnimation) {
        if (panelSplitter) {
            const computedS = window.getComputedStyle(panelSplitter).transform;
            if (computedS && computedS !== 'none') {
                splitterStart = computedS;
            }
        }
        currentSplitterAnimation.cancel();
        currentSplitterAnimation = null;
    }

    // 初始化尚未完成時，不播放過渡動畫，直接靜態設定
    if (!isInitComplete) {
        setElementDisplay(editorContainer, visible);
        if (panelSplitter) {
            setElementDisplay(panelSplitter, visible);
            panelSplitter.style.transform = '';
        }
        editorContainer.style.transform = '';
        return;
    }

    const editorEnd = visible ? 'translateX(0)' : 'translateX(100%)';
    const splitterEnd = visible ? 'translateX(0)' : `translateX(${targetDistance})`;

    setElementDisplay(editorContainer, true);
    if (panelSplitter) {
        setElementDisplay(panelSplitter, true);
    }

    currentEditorAnimation = editorContainer.animate(
        [
            { transform: editorStart },
            { transform: editorEnd }
        ],
        { duration: 400, fill: 'forwards', easing: 'ease' }
    );

    if (panelSplitter) {
        currentSplitterAnimation = panelSplitter.animate(
            [
                { transform: splitterStart },
                { transform: splitterEnd }
            ],
            { duration: 400, fill: 'forwards', easing: 'ease' }
        );
    }

    currentEditorAnimation.onfinish = () => {
        currentEditorAnimation?.cancel();
        currentEditorAnimation = null;
        if (!visible) {
            setElementDisplay(editorContainer, false);
        }
        editorContainer.style.transform = '';
    };

    if (panelSplitter) {
        currentSplitterAnimation.onfinish = () => {
            currentSplitterAnimation?.cancel();
            currentSplitterAnimation = null;
            if (!visible) {
                setElementDisplay(panelSplitter, false);
            }
            panelSplitter.style.transform = '';
        };
    }
}


function getDPR(win = window) {
    return settings?.lowRes ? 1 : (win.devicePixelRatio || 1);
}

function ensureVisualEditorContext() {
    if (!visualCtx) {
        visualCtx = visualEditor.getContext('2d');
    }
    return visualCtx;
}

function resizeVisualEditor(force = false) {
    if (!editorContainer || !visualEditorRenderer) return false;
    const dpr = getDPR();
    const changed = visualEditorRenderer.resize(editorContainer.clientWidth, editorContainer.clientHeight, dpr, force);
    if (changed) draw();
    return changed;
}

function resizePreviewCanvas(force = false) {
    if (!previewContainer || !previewRender) return false;
    const dpr = getDPR();
    return previewRender.resize(previewContainer.clientWidth, previewContainer.clientHeight, dpr, force);
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

playbackReset.addEventListener('click', () => {
    setPlaybackSpeed(1);
    simpleToast({ content: '重置播放速度', type: 'success', timeout: 1800 });
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
        syncPlayTimer();
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

    timeline.style.display = settings.globalTimeline ? 'block' : 'none';
    if (visible === null) return;

    const visualMode = isVisualMode();
    const editorVisible = visible && !visualMode;
    const visualVisible = visible && visualMode;
    const isHidden = hideButton.dataset.hidden === 'true';

    if (visible) {
        setElementDisplay(editorInput, editorVisible);
        setElementDisplay(highlightLayer, editorVisible);
        setElementDisplay(visualEditor, visualVisible);
    }

    if (!visible) {
        // 當隱藏 Editor 時：Editor 隱藏，Canvas 必須顯示，分割線隱藏 (保留 canvasSnapped 狀態)
        canvasContainer.style.display = '';
        noRender = false;
        showPlayControlsBtn?.classList.add('editor-hidden');
        document.body.classList.add('editor-hidden');
    } else {
        showPlayControlsBtn?.classList.remove('editor-hidden');
        document.body.classList.remove('editor-hidden');
        // 當顯示 Editor 時：還原到目前的 Snap 狀態
        if (canvasSnapped) {
            noRender = true;
            canvasContainer.style.display = 'none';
            editorContainer.style.left = '0';
            editorContainer.style.width = '100%';
            setElementDisplay(panelSplitter, true);
            if (panelSplitter) panelSplitter.classList.add('snapped');
        } else {
            noRender = false;
            canvasContainer.style.display = '';
            editorContainer.style.left = '';
            editorContainer.style.width = '';
            setElementDisplay(panelSplitter, true);
            if (panelSplitter) panelSplitter.classList.remove('snapped');
        }
    }

    updatePlaycontrol(visualVisible, !isHidden);

    animateCanvasWidth(visible);
    animateEditorContainer(visible);
};

settingsButton.addEventListener('click', () => {
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

        // 2. Range (自訂 div 滑桿主容器)
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

    const applySettings = () => {
        const values = {};

        Object.keys(inputRefs).forEach(id => {
            const config = inputRefs[id];
            let finalVal;

            if (config.type === 'button') {
                return;
            } else if (config.type === 'checkbox') {
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
        setEditorCss();
        draw();
        simpleToast({ content: t('toast.settingsSaved'), type: 'success', timeout: 1500 });
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
        input.className = 'popup-setting-checkbox';
        input.id = id;
        input.checked = checked;
        return input;
    };

    function applyAudioSettings(s) {
        if (!audioManager || !s) return;
        if (s.globalVolume !== undefined) audioManager.setGlobalVolume(s.globalVolume);
        if (s.musicVolume !== undefined) audioManager.setBGMVolume(s.musicVolume);
        if (s.SfxVolume !== undefined) audioManager.setSFXVolume(s.SfxVolume);
        if (s.sfxVolumes) audioManager.setSFXVolumes(s.sfxVolumes);
    }

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

    // 重構原本的生成迴圈段落
    settingsConfig.forEach((category) => {
        const section = addTab(t(category.label));

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
                    if (item.id === 'lang') {
                        setLang(e.target.value);
                        idbSet('simai_settings', JSON.stringify(settings)).catch(() => { });
                        if (popupCtx) {
                            popupCtx.close();
                            settingsButton.click();
                        }
                    }
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
            // --- E. 處理 Button ---
            else if (item.type === 'button') {
                el = document.createElement('button');
                el.type = 'button';
                el.textContent = t(item.btnText || 'popup.reset');
                if (item.onClick) {
                    el.addEventListener('click', item.onClick);
                }
            }
            // --- F. 一般 Number ---
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
            section.appendChild(createRow(t(item.label), el));
        });
    });

    switchTab(0);

    const oldAudioSettings = {
        globalVolume: settings.globalVolume,
        musicVolume: settings.musicVolume,
        SfxVolume: settings.SfxVolume,
        sfxVolumes: settings.sfxVolumes ? { ...settings.sfxVolumes } : null
    };

    popupCtx = popupWindow({
        title: t('settings.title'),
        customContent: container,
        width: "85%",
        maxWidth: "500px",
        buttons: [
            {
                text: t('popup.save'),
                onClick: (ctx) => { applySettings(); },
                hideOnClick: true
            },
            {
                text: t('popup.apply'),
                onClick: (ctx) => { applySettings(); }
            },
            {
                text: t('popup.cancel'),
                onClick: () => {
                    applyAudioSettings(oldAudioSettings);
                },
                hideOnClick: true
            },
            {
                text: t('popup.reset'),
                onClick: (ctx) => {
                    Object.values(inputRefs).forEach(ref => {
                        if (ref.type === 'button') {
                            return;
                        } else if (ref.type === 'checkbox') {
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
                    simpleToast({ content: t('toast.restoreSaved'), type: 'info', timeout: 1500 });
                }
            },
        ]
    });
});

chartInfoButton.addEventListener('click', () => {
    openChartInfoModal({
        getMaidata: () => maidata,
        setMaidata: (val) => { maidata = val; },
        getBackgroundImage: () => backgroundImage,
        setBackgroundImage: (val) => { backgroundImage = val; },
        images,
        editorBackgroundImage,
        audioManager,
        getNowDifficulty: () => nowDifficulty,
        setNowDifficulty: (val) => { nowDifficulty = val; },
        changeDifficulty,
        saveMaidata,
        projSet
    });
});

readyBeatCheckbox.checked = readyBeat;
readyBeatCheckbox.addEventListener('change', () => {
    readyBeat = readyBeatCheckbox.checked;
    projSet('ready_beat', readyBeatCheckbox.checked).then(() => {
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

function updateUndoRedoUI() {
    if (undoButton) {
        const canUndo = Array.isArray(undoStack) && undoStack.length > 0;
        undoButton.classList.toggle('disabled', !canUndo);
        undoButton.setAttribute('aria-disabled', String(!canUndo));
    }
    if (redoButton) {
        const canRedo = Array.isArray(redoStack) && redoStack.length > 0;
        redoButton.classList.toggle('disabled', !canRedo);
        redoButton.setAttribute('aria-disabled', String(!canRedo));
    }
}

const pushUndoChange = (change) => {
    if (!change) return;
    // 新的使用者編輯會清空 redo
    redoStack = [];
    undoStack.push(change);
    if (undoStack.length > maxHistorySize) undoStack.shift();
    updateUndoRedoUI();
};

const pushUndo = (change) => {
    if (!change) return;
    undoStack.push(change);
    if (undoStack.length > maxHistorySize) undoStack.shift();
    updateUndoRedoUI();
};

const pushRedo = (change) => {
    if (!change) return;
    redoStack.push(change);
    if (redoStack.length > maxHistorySize) redoStack.shift();
    updateUndoRedoUI();
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
    updateUndoRedoUI();
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
    if (visualEditorRenderer && typeof visualEditorRenderer.clearSelection === 'function') {
        visualEditorRenderer.clearSelection();
    }
    updateUndoRedoUI();
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
    if (visualEditorRenderer && typeof visualEditorRenderer.clearSelection === 'function') {
        visualEditorRenderer.clearSelection();
    }
    updateUndoRedoUI();
});

// 初始化按鈕禁用狀態
updateUndoRedoUI();

helpButton.addEventListener('click', () => {
    openHelpModal();
});

function getGridSlots(maxTime) {
    const slots = [];
    let gridDiv = parseInt(settings.gridDivision, 10);
    if (isNaN(gridDiv) || gridDiv <= 0) gridDiv = 4;

    if (maxTime === null || maxTime === undefined || isNaN(maxTime) || !isFinite(maxTime) || maxTime < 0) {
        maxTime = (endTime && isFinite(endTime) && endTime > 0) ? endTime + 2.0 : 100.0;
    }

    const limitMaxTime = Math.min(maxTime, 7200.0);

    if (!decodedTags || decodedTags.length === 0) {
        const bpm = (clockBpm && clockBpm > 0) ? clockBpm : 60;
        const beatPeriod = (240 / bpm) / gridDiv;
        if (!isFinite(beatPeriod) || beatPeriod <= 0.0001) return [0];

        let count = 0;
        for (let t = 0; t <= limitMaxTime + 0.001 && count < 20000; t += beatPeriod) {
            slots.push(t);
            count++;
        }
        return slots;
    }

    const bpmTags = decodedTags.filter(t => t.type === 'bpm' && t.value > 0).sort((a, b) => a.time - b.time);
    if (bpmTags.length === 0) {
        bpmTags.push({ time: 0, value: (clockBpm && clockBpm > 0) ? clockBpm : 60 });
    }

    const fallbackEndTime = (endTime && isFinite(endTime) && endTime > 0) ? Math.max(endTime, limitMaxTime) : limitMaxTime;

    for (let i = 0; i < bpmTags.length; i++) {
        const tag = bpmTags[i];
        const nextTag = bpmTags[i + 1];
        let endTimeForTag = nextTag ? nextTag.time : fallbackEndTime;

        if (!isFinite(endTimeForTag) || isNaN(endTimeForTag) || endTimeForTag > fallbackEndTime) {
            endTimeForTag = fallbackEndTime;
        }

        const bpmVal = (tag.value && tag.value > 0) ? tag.value : 60;
        const beatPeriod = (240 / bpmVal) / gridDiv;

        if (!isFinite(beatPeriod) || beatPeriod <= 0.0001) continue;

        let t = tag.time;
        let count = 0;
        while (t < endTimeForTag - 0.001 && count < 20000) {
            slots.push(t);
            t += beatPeriod;
            count++;
        }
        if (slots.length > 50000) break;
    }

    if (slots.length === 0 || slots[slots.length - 1] < fallbackEndTime - 0.001) {
        slots.push(fallbackEndTime);
    }

    return slots;
}

const quantizeTime = (time) => {
    if (time === null || time === undefined || isNaN(time) || !isFinite(time)) return null;
    const slots = getGridSlots(time + 2.0);
    if (!slots || slots.length === 0) return null;

    let closestTime = 0;
    let minDiff = Infinity;
    for (const t of slots) {
        const diff = Math.abs(t - time);
        if (diff < minDiff) {
            minDiff = diff;
            closestTime = t;
        }
    }
    if (minDiff > 2.0) return null;
    return closestTime;
};

function updateEditorAndSave(newContent) {
    recordEditorHistory();
    editorInput.value = newContent;
    recordEditorHistory();

    applyHighlight(newContent);
    getres(newContent);

    maidata["inote_" + nowDifficulty] = newContent;
    saveMaidata();
}

const {
    getOrCreateCommaIndex,
    visualPlaceNote,
    visualPlaceHoldNote,
    visualDeleteNote,
    visualChangeNote
} = createVisualNoteCallbacks({
    quantizeTime,
    getRawData: () => rawData,
    setRawData: (v) => { rawData = v; },
    getDataIndexToTime: () => dataIndexToTime,
    setDataIndexToTime: (v) => { dataIndexToTime = v; },
    getClockBpm: () => clockBpm,
    getSettings: () => settings,
    getDecodedTags: () => decodedTags,
    updateEditorAndSave
});

function recordEditorHistory() {
    if (editorInput.value !== lastEditorValue) {
        const change = computeChange(lastEditorValue, editorInput.value);
        if (change) {
            pushUndoChange(change);
            console.log("記錄歷史狀態（diff）:", change);
        }
        lastEditorValue = editorInput.value;
    }
}

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
    projSet('now_difficulty', nowDifficulty).then(() => {
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
    updateUndoRedoUI();
}

initFileHandlers({
    folderInput,
    readMaidataButton,
    readZipButton,
    addMusicButton,
    addVideoButton,
    importFromVideoButton,
    downloadButton,
    audioManager,
    getMaidata: () => maidata,
    setMaidata: (val) => { maidata = val; },
    maidataProcess,
    setDataEmpty,
    draw,
    resize,
    setEndtime,
    getEndTime: () => endTime,
    getCurrentProjectId: () => currentProjectId,
    setCurrentProjectId: (val) => { currentProjectId = val; },
    getBackgroundImage: () => backgroundImage,
    setBackgroundImage: (val) => { backgroundImage = val; },
    editorBackgroundImage,
    getBackgroundVideo: () => backgroundVideo,
    setBackgroundVideo: (val) => { backgroundVideo = val; },
    editorBackgroundVideo,
    getSettings: () => settings,
    applyMovieBrightness,
    projSet
});

hideEditorButton.addEventListener('click', () => {
    // 檢查目前是否為隱藏狀態
    const currentlyHidden = editorContainer.dataset.hidden === 'true';
    hideEditorButton.children[0].innerText = currentlyHidden ? 'right_panel_close' : 'right_panel_open';

    // 儲存的是 "是否隱藏" 的狀態
    projSet('hide_editor', !currentlyHidden).then(() => {
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
    projSet('now_difficulty', difficulty).then(() => {
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

switchBoxRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.checked) {
            settings.displayMode = (e.target.value === 'keyboard') ? 'simai' : 'visual';
            updateGridDivisionVisibility();
            visualEditorRenderer.setZoom(settings.visualZoom);
            previewRender.setZoom(settings.visualZoom);
            saveSettingsDebounce();
            setEditorCss(editorContainer.dataset.hidden !== 'true');
            draw();
        }
    });
});

function setupZoomButton(button, isZoomIn) {
    let timeoutId = null;
    let intervalId = null;
    let isPressed = false;

    const performZoom = () => {
        const step = isZoomIn ? ZOOM_STEP : -ZOOM_STEP;
        settings.visualZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, settings.visualZoom + step));
        visualEditorRenderer.setZoom(settings.visualZoom);
        previewRender.setZoom(settings.visualZoom);
        saveSettingsDebounce();
        draw();
    };

    const stopZoom = () => {
        if (!isPressed) return;
        isPressed = false;
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', stopZoom);
        window.removeEventListener('pointercancel', stopZoom);
    };

    const handlePointerMove = (e) => {
        if (!isPressed) return;
        const rect = button.getBoundingClientRect();
        const isInBounds = (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
        );
        if (!isInBounds) {
            stopZoom();
        }
    };

    button.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; // Only primary button (left click) or touch
        isPressed = true;
        e.preventDefault();

        performZoom();

        timeoutId = setTimeout(() => {
            if (!isPressed) return;
            intervalId = setInterval(() => {
                performZoom();
            }, 50);
        }, 400);

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', stopZoom);
        window.addEventListener('pointercancel', stopZoom);
    });

    button.addEventListener('click', (e) => {
        e.preventDefault();
    });
}

setupZoomButton(previewZoomInButton, true);
setupZoomButton(previewZoomOutButton, false);


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
        if (panelSplitter) panelSplitter.classList.remove('expanded');
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
        if (panelSplitter) panelSplitter.classList.add('expanded');
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
        title: t('popup.quickGenerate.title'),
        content: `
${t('popup.quickGenerate.bpmLabel')} <input type="number" id="quickBpm" value="60" style="width: 80px;"><br>
${t('popup.quickGenerate.beatLabel')} <input type="number" id="quickBeat" value="4" style="width: 80px;"><br>`,
        buttons: [
            {
                text: t('popup.quickGenerate.generateBtn'),
                onClick: (ctx) => {
                    const bpm = ctx.elements.content.querySelector('#quickBpm').value;
                    const beat = ctx.elements.content.querySelector('#quickBeat').value;
                    if (isNaN(parseFloat(bpm)) || isNaN(parseFloat(beat))) {
                        popupWindow({ title: t('popup.quickGenerate.invalidInput') });
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
}, { passive: true });
editorInput.addEventListener('touchstart', () => {
    syncHighlightLayerScroll();
}, { passive: true });

/**
 * 2. 核心更新與慣性邏輯 (Unified Time & Scroller Pipeline)
 */
const updateVisualTime = (newTime) => {
    const min = parseFloat(timeline.min) || 0;
    const max = parseFloat(timeline.max) || 0;
    const clampedTime = Math.max(min, Math.min(max, newTime));

    timeControlSliding = true;
    updateSlider(clampedTime);
    realTime = clampedTime;
    globalTime = clampedTime - musicDelay;

    audioManager.stopAllLongSounds();
    videoSeekDebounce(realTime);

    if (playButton.dataset.playing === 'true') {
        const currentBgmTime = audioManager.getBGMTime();
        if (currentBgmTime === null || Math.abs(currentBgmTime - realTime) > 0.2) {
            audioManager.playBGM(realTime);
            syncPlayTimer();
        }
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

const { visualScroller, startMomentum, bindScrollerEvents } = initVisualScroller({
    visualEditor,
    previewCanvas,
    getVisualEditorRenderer: () => visualEditorRenderer,
    getPreviewRender: () => previewRender,
    getRealTime: () => realTime,
    updateVisualTime,
    slideInputDebounce: (...args) => slideInputDebounce(...args),
    getSettings: () => settings,
    saveSettingsDebounce: (...args) => saveSettingsDebounce(...args),
    draw,
    getPlayButton: () => playButton
});

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
        if (typeof inputDebounce === 'function') inputDebounce();
    }
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
    projSet('timeControl', realTime).catch((error) => {
        console.error("儲存時間控制值到 IndexedDB 失敗:", error);
    });
}, 300);

const videoSeekDebounce = debounce((time) => {
    if (editorBackgroundVideo && editorBackgroundVideo.readyState >= 1) {
        if (Math.abs(editorBackgroundVideo.currentTime - time) > 0.05) {
            try { editorBackgroundVideo.currentTime = time; } catch (_) { }
        }
    }
}, 50);

timeline.addEventListener('input', () => {
    updateVisualTime(parseFloat(timeline.value));
});

let bgmUpdateTimer = null;

if (keepRenderingWhilePause) requestAnimationFrame(update);

function updatePauseBackgroundDisplay() {
    const hideBg = !!settings.hideBackgroundWhenPaused;
    const showCover = !!settings.showCoverWhenPaused;

    const hasVideo = !!(backgroundVideo && editorBackgroundVideo.src && editorBackgroundVideo.readyState >= 1);
    const hasImage = !!(backgroundImage && editorBackgroundImage.complete && editorBackgroundImage.naturalWidth !== 0);

    if (hideBg) {
        // [v] 暫停時隱藏背景 -> 以隱藏為優先
        editorBackgroundImage.style.display = 'none';
        editorBackgroundVideo.style.display = 'none';
    } else if (showCover) {
        // [ ] 隱藏 + [v] 顯示封面圖 -> 優先顯示封面圖
        editorBackgroundImage.style.display = hasImage ? 'block' : 'none';
        editorBackgroundVideo.style.display = 'none';
    } else {
        // [ ] 隱藏 + [ ] 顯示封面圖 -> 顯示影片，無影片直接全部隱藏
        editorBackgroundImage.style.display = 'none';
        editorBackgroundVideo.style.display = hasVideo ? 'block' : 'none';
    }
}

let lastStartTime = 0;

function sendMajdataPlay() {
    if (!majdataWs.isConnected()) return;

    // 確保 MajdataViewX 的 _state 進入 ViewStatus.Loaded
    majdataWs.sendLoad({
        trackPath: '',
        imagePath: '',
        videoPath: ''
    });

    const fumenText = editorInput.value || '';
    const diffVal = changeDifficulty ? changeDifficulty.value : '3';
    const diffIdx = isNaN(parseInt(diffVal)) ? 3 : Math.max(0, parseInt(diffVal) - 1);
    const titleStr = (maidata && maidata.title) ? maidata.title : '';
    const artistStr = (maidata && maidata.artist) ? maidata.artist : '';
    const designerStr = (maidata && maidata['des_' + diffVal]) ? maidata['des_' + diffVal] : '';
    const levelStr = (maidata && maidata['lv_' + diffVal]) ? maidata['lv_' + diffVal] : '';
    const offsetVal = (typeof musicDelay !== 'undefined') ? musicDelay : 0;

    majdataWs.play({
        mode: 0,
        startAt: realTime || 0,
        speed: settings.playbackSpeed || 1,
        title: titleStr,
        artist: artistStr,
        offset: offsetVal,
        designer: designerStr,
        level: levelStr,
        fumen: fumenText,
        difficulty: diffIdx
    });
}

playButton.addEventListener('click', () => {
    bgmUpdateTimer = null; // 重置 BGM 更新計時器
    if (playButton.dataset.playing === 'true') {
        updatePauseBackgroundDisplay();
        editorBackgroundVideo.pause();

        playButton.dataset.playing = 'false';
        playButton.children[0].innerText = "play_arrow";
        lastTimestamp = null;
        playStartTimestamp = null;

        // --- 停止音效與 BGM ---
        audioManager.stopAllLongSounds();
        audioManager.stopBGM();

        notes.forEach(n => n._riserActive = false); // 強制重置標記

        if (majdataWs.isConnected()) {
            majdataWs.pause();
        }

        draw(); // 立即更新畫布，反映暫停狀態
    } else {
        lastStartTime = realTime; // 記錄開始播放的時間點
        editorBackgroundImage.style.display = (editorBackgroundImage.complete && editorBackgroundImage.naturalWidth !== 0) ? 'block' : 'none';
        editorBackgroundVideo.style.display =
            ((editorBackgroundVideo.readyState === 4) ? 'block' : 'none');
        editorBackgroundVideo.currentTime = realTime;
        if (editorBackgroundVideo.paused && editorBackgroundVideo.readyState >= 1) {
            editorBackgroundVideo.play().catch(() => { });
        }
        playButton.dataset.playing = 'true';
        playButton.children[0].innerText = "pause";
        lastTimestamp = performance.now();
        playStartRealTime = realTime;
        playStartTimestamp = performance.now();

        // --- 從當前的 realTime 同步啟動 BGM ---
        audioManager.playBGM(realTime);

        if (majdataWs.isConnected()) {
            sendMajdataPlay();
        }

        update(lastTimestamp);
    }
    slideInputDebounce();
});

resetButton.addEventListener('click', () => {
    updatePauseBackgroundDisplay();
    editorBackgroundVideo.pause();
    playButton.dataset.playing = 'false';
    playButton.children[0].innerText = "play_arrow";
    bgmUpdateTimer = null;
    lastTimestamp = null;
    playStartTimestamp = null;
    realTime = 0;
    globalTime = realTime - musicDelay;
    updateSlider(realTime);

    // --- 停止音效與 BGM ---
    audioManager.stopAllLongSounds();
    audioManager.stopBGM();

    videoSeekDebounce(0);

    notes.forEach(n => n._riserActive = false); // 強制重置標記

    if (majdataWs.isConnected()) {
        majdataWs.stop();
    }

    draw(); // 立即更新畫布，反映停止狀態
});

stopButton.addEventListener('click', () => {
    updatePauseBackgroundDisplay();
    editorBackgroundVideo.pause();
    playButton.dataset.playing = 'false';
    playButton.children[0].innerText = "play_arrow";
    bgmUpdateTimer = null;
    lastTimestamp = null;
    playStartTimestamp = null;
    realTime = lastStartTime || 0;
    globalTime = realTime - musicDelay;
    updateSlider(realTime);

    // --- 停止音效與 BGM ---
    audioManager.stopAllLongSounds();
    audioManager.stopBGM();

    notes.forEach(n => n._riserActive = false); // 強制重置標記

    if (majdataWs.isConnected()) {
        majdataWs.stop();
    }

    draw(); // 立即更新畫布，反映停止狀態
});

if (connectMajdataViewButton) {
    connectMajdataViewButton.addEventListener('click', () => {
        const url = settings.majdataWsUrl || 'ws://127.0.0.1:8083/majdata';
        majdataWs.toggleConnection(url);
    });
}

keyboardButton.addEventListener('click', () => {
    editorInput.focus();
});

function updatePlaycontrol(visualVisible = false, isHidden = false) {
    const c = window.getComputedStyle(document.documentElement);
    const pc = document.querySelector('#playControlContainer');
    const mc = document.querySelector('#miniPreviewContainer');
    const d = document.documentElement.style;

    const maxPlayControlsHeight = c.getPropertyValue('--const-max-playControls-height');
    const collapsedPlayControlsHeight = c.getPropertyValue('--const-collapsed-playControls-height');
    if (!isHidden) {
        timeline.style.display = 'none';
        mc.style.display = 'none';
        pc.style.display = 'none';
        hideButton.dataset.hidden = 'true';
        d.setProperty('--playControls-height', '0px');
        showPlayControlsBtn.style.display = 'flex';
    } else {
        showPlayControlsBtn.style.display = 'none';
        hideButton.dataset.hidden = 'false';
        timeline.style.display = settings.globalTimeline ? 'block' : 'none';
        mc.style.display = 'block';
        pc.style.display = 'flex';
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

function seekToTime(targetTime) {
    if (targetTime === undefined || isNaN(targetTime)) return;
    const value = targetTime + musicDelay;
    globalTime = targetTime;
    realTime = value;
    updateSlider(realTime);
    slideInputDebounce();
    audioManager.stopAllLongSounds();

    if (playButton.dataset.playing === 'true') {
        audioManager.playBGM(realTime);
        syncPlayTimer();
    } else {
        draw();
    }
}

function findCommaCharIndex(text, commaIndex) {
    let count = 0;
    let i = 0;
    while (i < text.length && count < commaIndex) {
        const a = text[i];
        const b = text[i + 1];
        if (a === '|' && b === '|') {
            i += 2;
            while (i < text.length && text[i] !== '\n' && text[i] !== '\r') {
                i++;
            }
            continue;
        }
        if (a === ',') {
            count++;
        }
        i++;
    }
    return i;
}

function indexFromCursor(text, point) {
    const textBefore = text.substring(0, point);
    const cleanedText = textBefore.replace(/\|\|.*$/gm, "");
    return (cleanedText.match(/,/g) || []).length;
}

getCursorNoteIndex.addEventListener('click', () => {
    const point = editorInput.selectionStart;
    const targetTime = dataIndexToTime[indexFromCursor(editorInput.value, point)];
    seekToTime(targetTime);
    editorInput.focus();
});

const rotateSelection = (dir) => applySelectedRotation(dir, { editorInput, applyHighlight, recordEditorHistory, inputDebounce });
const flipVertical = () => applyVerticalFlip({ editorInput, applyHighlight, recordEditorHistory, inputDebounce });
const flipHorizontal = () => applyHorizontalFlip({ editorInput, applyHighlight, recordEditorHistory, inputDebounce });

rCwiseButton.addEventListener('click', () => rotateSelection(1));
rCCwiseButton.addEventListener('click', () => rotateSelection(-1));
r180Button.addEventListener('click', () => rotateSelection(4));
fVerticalButton.addEventListener('click', flipVertical);
fHorizontalButton.addEventListener('click', flipHorizontal);

function syncPlayTimer() {
    if (playButton.dataset.playing === 'true') {
        playStartRealTime = realTime;
        playStartTimestamp = performance.now();
    }
}

function update(timestamp) {
    // 1. 基本時間計算
    const bp = settings.playbackSpeed || 1;
    if (lastTimestamp === null) lastTimestamp = timestamp;
    const dt = (timestamp - lastTimestamp) / 1000; // 秒
    lastTimestamp = timestamp;

    const isPlaying = playButton.dataset.playing === 'true';

    // 2. 邏輯更新區塊：僅在播放狀態且非使用者手動滑動/拖曳時推進時間
    if (isPlaying) {
        let timeUpdatedByBgm = false;
        if (!timeControlSliding && audioManager.haveBGM()) {
            const bgmTime = audioManager.getBGMTime();
            if (bgmTime !== null) {
                realTime = bgmTime;
                globalTime = realTime - musicDelay;
                timeUpdatedByBgm = true;
                // 更新 playStart 以供 fallback 使用
                playStartTimestamp = performance.now();
                playStartRealTime = realTime;
            }
        }

        if (!timeUpdatedByBgm && !timeControlSliding) {
            if (playStartTimestamp === null) {
                playStartTimestamp = performance.now();
                playStartRealTime = realTime;
            }
            const elapsed = (performance.now() - playStartTimestamp) / 1000;
            realTime = playStartRealTime + elapsed * bp;
            globalTime = realTime - musicDelay;
        }

        if (settings.cursorFollow && nowIndex !== lastCursorIndex) {
            lastCursorIndex = nowIndex;
            cursorLastIndexTime = dataIndexToTime[nowIndex] || 0; // 更新游標對應的時間
            const point = rawData.slice(0, nowIndex + 1).join(',').length;
            // 2. 設定游標位置
            editorInput.selectionStart = point;
            editorInput.selectionEnd = point;
        }

        // 背景影片同步邏輯（每秒檢查一次）
        if (bgmUpdateTimer === null || bgmUpdateTimer >= 1) {
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
            playStartTimestamp = null;
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

function resize(force = false) {
    const dpr = getDPR();

    if (secondCtx) {
        // 若外部視窗開啟中，主視窗 Canvas 僅繪製提示訊息，僅需更新物理像素尺寸
        if (canvasContainer) {
            const w = Math.round(canvasContainer.clientWidth * dpr);
            const h = Math.round(canvasContainer.clientHeight * dpr);
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
        }
    } else if (canvasContainer && renderer) {
        renderer.resize(canvasContainer.clientWidth, canvasContainer.clientHeight, dpr, force);
    }

    if (editorContainer && visualEditorRenderer) {
        visualEditorRenderer.resize(editorContainer.clientWidth, editorContainer.clientHeight, dpr, force);
    }

    if (previewContainer && previewRender) {
        previewRender.resize(previewContainer.clientWidth, previewContainer.clientHeight, dpr, force);
    }

    draw();
}

const secondaryWindow = new SecondaryWindowManager();
popup.addEventListener('click', () => {
    secondaryWindow.open({
        canvas,
        renderer,
        backgroundContainer,
        canvasOutline,
        editorBackgroundImage,
        editorBackgroundVideo,
        playButton,
        getSettings: () => settings,
        getRealTime: () => realTime,
        getDPR,
        resize,
        draw,
        onClose: () => {
            secondCtx = null;
        }
    });
    secondCtx = secondaryWindow.secondCtx;
});

recordVideoButton.addEventListener('click', () => {
    openRecordVideoModal({
        audioManager,
        canvas,
        getRenderer: () => renderer,
        playButton,
        getEndTime: () => endTime,
        getMusicDelay: () => musicDelay,
        editorBackgroundImage,
        editorBackgroundVideo,
        getNotes: () => notes,
        getPlayScoreRes: () => playScoreRes,
        getMaidata: () => maidata,
        getNowDifficulty: () => nowDifficulty,
        getSettings: () => settings,
    });
});

window.addEventListener('resize', resize);

getButton("playbackSpeedAdd", "utility").addEventListener("click", () => {
    let sp = settings.playbackSpeed + 0.25;
    if (sp >= 2.0) sp = 2.0;
    setPlaybackSpeed(sp);
});

getButton("playbackSpeedMinus", "utility").addEventListener("click", () => {
    let sp = settings.playbackSpeed - 0.25;
    if (sp <= 0.25) sp = 0.25;
    setPlaybackSpeed(sp);
});

window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        // 🔴 修正：拿掉外面的 e.preventDefault()，改在需要攔截的 case 內個別加上

        switch (e.key.toLowerCase()) {
            case 'f':
                e.preventDefault();
                openFindBar(false);
                break;

            case 'h':
                e.preventDefault();
                openFindBar(true);
                break;

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
                e.preventDefault();
                let sp = settings.playbackSpeed + 0.25;
                if (sp >= 2.0) sp = 2.0;
                setPlaybackSpeed(sp);
                simpleToast({ content: `已設定播放速度：${sp.toFixed(2)}x`, type: 'success', timeout: 1800 });
                break;
            }

            case 'z': {
                if (document.activeElement === editorInput) {
                    e.preventDefault();
                    if (undoStack.length > 0) {
                        undoButton.click();
                        simpleToast({ content: '復原譜面變更', type: 'info', timeout: 1200 });
                    }
                }
                break;
            }

            case 'y': {
                if (document.activeElement === editorInput) {
                    e.preventDefault();
                    if (redoStack.length > 0) {
                        redoButton.click();
                        simpleToast({ content: '重作譜面變更', type: 'info', timeout: 1200 });
                    }
                }
                break;
            }
        }
        switch (e.code) {
            case 'Space': {
                e.preventDefault();
                playButton.click();
                break;
            }
            case 'Backspace': {
                e.preventDefault();
                resetButton.click();
                break;
            }
        }
    }
});

function closeExternalWindow() {
    if (externalWindow && !externalWindow.closed) {
        try {
            externalWindow.close();
        } catch (_) { }
    }
}

window.addEventListener("beforeunload", (event) => {
    closeExternalWindow();
    if (isContextEdited) {
        // Cancel the event as stated by the standard.
        event.preventDefault();
        // Chrome requires returnValue to be set.
        event.returnValue = "";
    }
});

window.addEventListener("pagehide", closeExternalWindow);

let playedClock = [false, false, false, false];



let syncSecondWindowBackground = () => { };

function drawMainCanvasOpenedInExternalWindow() {
    if (!ctx || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 繪製背景深色卡片
    ctx.fillStyle = '#111116';
    ctx.fillRect(0, 0, w, h);

    const text = t('menu.toolsPopupOpened') || '已在外部視窗開啟';

    // 繪製居中文字
    ctx.fillStyle = 'rgba(74, 144, 226, 0.9)';
    ctx.font = `600 ${Math.max(14, Math.round(18 * dpr))}px "Plus Jakarta Sans", "Noto Sans TC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🗔 ${text}`, w / 2, h / 2);

    ctx.restore();
}

function draw(dt = 0) {
    if (!renderer) return;
    if (secondCtx && externalWindow) {
        syncSecondWindowBackground();
    }

    // 早期初始化：提取常用值避免重複計算
    const playing = playButton.dataset.playing === 'true';
    const previewVisibleFlag = previewVisible();
    const isVisualModeFlag = isVisualMode();
    const visualHeight = !previewVisibleFlag
        ? visualEditorRenderer.getCanvasWH().height
        : previewRender.getCanvasWH().width / 2;

    const { buckets, playCombo, playScore, visualBuckets, noteQuantity, nowIndex: nowIndexRender } = simaiLogicControler.get({
        renderer,
        globalTime,
        realTime,
        musicDelay,
        playing,
        timeControlSliding,
        readyBeat,
        playedClock,
        settings,
        visualHeight,
        notes,
        decodedTags,
        playScoreRes,
        nowIndex,
        audioManager,
    });

    nowIndex = nowIndexRender;

    // 渲染和更新
    if (secondCtx !== null) {
        // 獨立外部視窗存在：在外部視窗 Context 上渲染遊戲圓盤，主視窗 Canvas 繪製 i18n 提示
        renderer.drawFrame({
            globalTime,
            buckets,
            dt,
            showSensor: settings.showSensor,
            showSensorText: (settings.showSensorTextWhenPaused && !playing),
            playCombo,
            playScore,
            noteQuantity,
            playScoreRes,
            nowIndex,
        });
        drawMainCanvasOpenedInExternalWindow();
    } else if (!noRender) {
        // 正常狀態：主視窗繪製遊戲圓盤
        renderer.drawFrame({
            globalTime,
            buckets,
            dt,
            showSensor: settings.showSensor,
            showSensorText: (settings.showSensorTextWhenPaused && !playing),
            playCombo,
            playScore,
            noteQuantity,
            playScoreRes,
            nowIndex,
        });
    }

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

// ============================================================
// 專案管理核心函數
// ============================================================

/**
 * 載入當前 currentProjectId 的專案資料到編輯器
 * @param {function} [step] - 進度回呼 (progress, message)
 */
async function loadProjectData(step) {
    const s = step || (() => { });
    s(84, "正在載入專案資料...");

    const [
        savedTimeControl,
        savedBgm,
        savedMaiData,
        savedDifficulty,
        bg,
        bgVideo,
        hideEditor,
        savedReadyBeat,
        tb1,
        tb2,
    ] = await Promise.all([
        projGet('timeControl'),
        projGet('resource_bgm'),
        projGet('maidata'),
        projGet('now_difficulty'),
        projGet('background_image'),
        projGet('background_video'),
        projGet('hide_editor'),
        projGet('ready_beat'),
        projGet('tb1'),
        projGet('tb2'),
    ]);

    restoreTimebase(tb1, tb2);

    readyBeat = savedReadyBeat === true || savedReadyBeat === 'true';
    readyBeatCheckbox.checked = readyBeat;

    if (savedTimeControl && !isNaN(savedTimeControl)) {
        realTime = savedTimeControl;
        globalTime = realTime - musicDelay;
    } else {
        realTime = 0;
        globalTime = -musicDelay;
    }

    if (savedDifficulty) {
        nowDifficulty = savedDifficulty;
        changeDifficulty.value = nowDifficulty;
    }

    if (savedMaiData) {
        s(88, "還原編輯內容...");
        maidata = savedMaiData;
        editorInput.value = maidata["inote_" + nowDifficulty] || '';
        getres(editorInput.value);
        applyHighlight(editorInput.value);

        // 初始化時同步 lastEditorValue 並清空當前 session 歷史
        undoStack = [];
        redoStack = [];
        historyMap = {};
        lastEditorValue = editorInput.value || '';
        updateUndoRedoUI();

        musicDelay = parseFloat(maidata.first) || 0;
        offsetInput.value = musicDelay;
        offsetInputDebounce();
    } else {
        maidata = {};
        editorInput.value = '';
        applyHighlight('');
        undoStack = [];
        redoStack = [];
        historyMap = {};
        lastEditorValue = '';
        updateUndoRedoUI();
        musicDelay = 0;
        offsetInput.value = 0;
    }

    if (bgVideo) {
        backgroundVideo = bgVideo;
        editorBackgroundVideo.src = URL.createObjectURL(bgVideo);
        editorBackgroundVideo.style.display = 'none';
    } else {
        backgroundVideo = null;
        editorBackgroundVideo.src = "";
        editorBackgroundVideo.style.display = 'none';
    }

    if (bg) {
        backgroundImage = bg;
        editorBackgroundImage.src = URL.createObjectURL(bg);
        editorBackgroundImage.style.display = settings.hideBackgroundWhenPaused ? 'none' : 'block';
    } else {
        backgroundImage = null;
        editorBackgroundImage.src = "";
        editorBackgroundImage.style.display = 'none';
    }
    applyMovieBrightness(settings.moviebrightness);

    if (savedBgm) {
        s(95, "正在還原背景音樂...");
        await audioManager.setBackgroundMusic(savedBgm);
        setEndtime(endTime);
    } else {
        audioManager.removeBackgroundMusic().catch(() => { });
    }

    if (hideEditor) {
        hideEditorButton.children[0].textContent = "right_panel_open";
        editorContainer.dataset.hidden = 'true';
    } else {
        hideEditorButton.children[0].textContent = "right_panel_close";
        delete editorContainer.dataset.hidden;
    }

    update();
    draw();
    updateSlider(realTime);
}

/**
 * 切換到指定專案（完整流程：停止播放 → 清除狀態 → 載入新專案）
 * @param {string} projectId
 */
async function loadProject(projectId) {
    // 停止播放
    if (playButton.dataset.playing === 'true') {
        playButton.dataset.playing = 'false';
        playButton.children[0].innerText = "play_arrow";
        playStartTimestamp = null;
        audioManager.stopBGM();
    }

    currentProjectId = projectId;
    localStorage.setItem('simai_lastProjectId', currentProjectId);

    setDataEmpty();

    // 載入專案資料
    await loadProjectData();

    const list = await projectList();
    const proj = list.find(p => p.id === projectId);
    return proj;
}

/**
 * 開啟專案總管 UI
 */
// 綁定專案總管按鈕
const projectManagerButton = getButton("projectManager", "utility");
if (projectManagerButton) {
    projectManagerButton.addEventListener('click', () => {
        openProjectManager({
            getCurrentProjectId: () => currentProjectId,
            loadProject,
        });
    });
}

function _init() {
    runInitModal({
        audioManager,
        loadAllImages,
        migrateFromLegacy,
        projectList,
        projectCreate,
        getCurrentProjectId: () => currentProjectId,
        setCurrentProjectId: (val) => { currentProjectId = val; },
        idbGet,
        idbSet,
        defaultSettings,
        setSettings: (val) => { settings = val; },
        playbackSpeedInput,
        applyAudioSettings,
        loadProjectData,
        majdataWs,
        applySplitRatio,
        snapHideCanvas,
        setSwitchBoxDisplayModeUI,
        visualToolModeSelect,
        setGridDivisionUI,
        updateGridDivisionVisibility,
        SimaiRenderer,
        SimaiVisualEditor,
        SimaiPreviewRenderer,
        canvas,
        visualEditor,
        previewCanvas,
        visualCtx,
        visualPlaceNote,
        visualDeleteNote,
        visualChangeNote,
        visualPlaceHoldNote,
        quantizeTime,
        timebaseButton,
        setPlaybackSpeed,
        canvasOutline,
        applyMovieBrightness,
        draw,
        updateSlider,
        getRealTime: () => realTime,
        projGet,
        setEditorCss,
        resize,
        setIsInitComplete: (val) => { isInitComplete = val; },
        updateDiscordRPC,
        getMaidata: () => maidata,
        getNowDifficulty: () => nowDifficulty,
        setImages: (val) => { images = val; },
        setRenderer: (val) => { renderer = val; },
        setVisualEditorRenderer: (val) => { visualEditorRenderer = val; },
        setPreviewRender: (val) => { previewRender = val; }
    });
}

// 全域解鎖 AudioContext 監聽器，確保首次使用者互動時能解鎖被瀏覽器掛起的 AudioContext
const unlockAudio = () => {
    if (audioManager) {
        audioManager.ensureContextSync();
    }
};
window.addEventListener('click', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
window.applyMovieBrightness = applyMovieBrightness;
window.applySplitRatio = applySplitRatio;
window.snapRestoreCanvas = snapRestoreCanvas;
window.setEditorCss = setEditorCss;
window.resize = resize;
window.draw = draw;
window.saveSettingsDebounce = saveSettingsDebounce;

_init();
