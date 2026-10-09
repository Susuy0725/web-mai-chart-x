import { createVisualNoteCallbacks, initVisualScroller, stripLeadingTags, openDivisionInputModal } from './features/visualEditor.js';
import { showFloatingMenu, hideFloatingMenu, showBoxFloatingMenu, hideBoxFloatingMenu, showTagFloatingMenu } from './features/visualFloatingMenu.js';
import { openNoteDurationModal } from './modals/noteDurationModal.js';
import { openSlideEditorModal } from './modals/slideEditorModal.js';
import { openTouchGroupModal } from './modals/touchGroupModal.js';
import { VisualSubMenu } from './features/visualSubMenu.js';
import { settingsConfig, defaultSettings } from './core/settingsConfig.js';
export { defaultSettings };
import { eventBus, EVENTS } from './core/eventBus.js';
import { appContext } from './core/appContext.js';
import { PlaybackEngine } from './core/playbackEngine.js';
import { initServiceWorker } from './core/swManager.js';
import { runInitModal } from './core/init.js';
import { SecondaryWindowManager } from './features/secondaryWindow.js';
import { frameProfiler } from './core/frameProfiler.js';
import { initFileHandlers } from './features/fileHandler.js';
import { initQuickPanel } from './features/quickPanel.js';
import { openHelpModal } from './modals/helpModal.js';
import { openAboutModal } from './modals/aboutModal.js';
import { openChangelogModal } from './modals/changelogModal.js';
import { openChartInfoModal } from './modals/chartInfoModal.js';
import { openResourceManager } from './modals/resourceManagerModal.js';
import { openSettingsModal } from './modals/settingsModal.js';
import { openDB, idbGet, idbSet, idbSetProject, idbGetProject, projectList, projectCreate, projectDelete, projectRename, projectTouch, projectUpdateName, migrateFromLegacy } from './indexDB.js';
import {
    getButton, disableNavigationGestures, debounce, throttle,
    getHighlight, parseMaidata, popupWindow, loadAllImages,
    simpleToast,
    clamp, createCustomSlider
} from './helper.js';
import { SimaiLogicControler } from './core/simaiLogicControler.js';
import { SimaiRenderer, SimaiVisualEditor, SimaiPreviewRenderer } from './renderer.js';
import { simaiDecode } from './decode.js';
import { decodeWorkerManager } from './core/decodeWorkerManager.js';
import { t, setLang, getCurrentLang, applyI18nToDOM, i18nReady } from './i18n.js';
import { updateDiscordRPC } from '../rpc.js';
import { audioManager } from './audioManager.js';
import { majdataWs } from './majdataWs.js';
import { openBgmEditor, openTapBpm } from './modals/bgmEditor.js';
import { openMainoteFetcher } from './modals/mainoteFetcher.js';
import { openProjectManager } from './modals/projectManager.js';
import { checkAndHandleDriveOpenWith } from './services/driveOpenWith.js';
import { openRecordVideoModal } from './modals/recordVideoModal.js';
import { initFindReplace, openFindBar, closeFindBar } from './features/findReplace.js';
import { toggleNoteFlag, handleToggleBkEx, applySelectedRotation, applyVerticalFlip, applyHorizontalFlip } from './features/noteModifier.js';
import { showWelcomeModal } from './modals/welcomeModal.js';
import { openSubdivisionModal } from './modals/subdivisionModal.js';
import { handleFormatDocument, formatDocument, formatSimai } from './features/formatter.js';
export { toggleNoteFlag };

majdataWs.setToastHandler(simpleToast);

initServiceWorker();
disableNavigationGestures();

let
    isInitComplete = false,
    isImagesLoaded = false,
    isDatabaseEmpty = false,
    images,
    readyBeat = false,
    maidata = {},
    nowDifficulty = 5,
    backgroundImage,
    backgroundVideo,
    currentBgBlobUrl = null,
    currentBgVideoBlobUrl = null,
    loadGeneration = 0,
    renderer,
    visualEditorRenderer,
    previewRender,
    settings = {},
    isContextEdited = false,
    isVerticalMode = (document.documentElement.clientWidth / document.documentElement.clientHeight) <= 0.587,
    currentProjectId = null,
    lastEditorValue = '',
    globalTime = 0,
    realTime = 0,
    lastStartTime = 0;

function revokeBlobUrls() {
    if (currentBgBlobUrl) {
        try { URL.revokeObjectURL(currentBgBlobUrl); } catch (_) { }
        currentBgBlobUrl = null;
    }
    if (currentBgVideoBlobUrl) {
        try { URL.revokeObjectURL(currentBgVideoBlobUrl); } catch (_) { }
        currentBgVideoBlobUrl = null;
    }
}

// 專案命名空間化的讀寫包裝
const projSet = (key, value) => idbSetProject(currentProjectId, key, value);
const projGet = (key) => idbGetProject(currentProjectId, key);

window.popupWindow = popupWindow;
window.simpleToast = simpleToast;

const simaiLogicControler = new SimaiLogicControler(audioManager);

const isVisualMode = () => settings.displayMode === 'visual';

const BACKUP_SETTINGS_KEY = 'simai_settings_backup';

const saveSettingsDebounce = debounce(() => {
    // 效能與防覆寫保護：在初始化完成且設定已完整載入前，嚴禁回寫 IndexedDB，避免以空物件覆寫既有設定
    if (!isInitComplete || !settings || Object.keys(settings).length < 5) {
        return;
    }
    if (majdataWs.isConnected()) {
        majdataWs.sendSetting(settings);
    }
    const settingsStr = JSON.stringify(settings);
    idbSet('simai_settings', settingsStr).catch((error) => {
        console.error('儲存設定到 IndexedDB 失敗:', error);
    });
    try {
        localStorage.setItem(BACKUP_SETTINGS_KEY, settingsStr);
    } catch (_) { }
}, 300);



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
const chartInfoButton = getButton("chartInfo", "utility");
const settingsButton = getButton("settings", "utility");
const popup = getButton("popup", "utility");
const getNowNoteIndex = getButton("getNowNoteIndex", "utility");
const visualToolBarEl = document.getElementById('visualToolBar');
const visualToolGroupEl = document.getElementById('visualToolGroup');
const visualNotePaletteEl = document.getElementById('visualNotePalette');
const visualToolCollapseBtn = document.getElementById('visualToolCollapseBtn');
const toolPlaceLabel = document.getElementById('toolPlaceLabel');
const currentNoteIcon = document.getElementById('currentNoteIcon');
const visualToolRadios = document.querySelectorAll('input[name="visualTool"]');
const paletteItems = document.querySelectorAll('#visualNotePalette .palette-item');
const visualHistoryGroupEl = document.getElementById('visualHistoryGroup');
const visualZoomGroupEl = document.getElementById('visualZoomGroup');
const visualUndoBtn = document.getElementById('visualUndoBtn');
const visualRedoBtn = document.getElementById('visualRedoBtn');
const visualZoomInBtn = document.getElementById('visualZoomInBtn');
const visualZoomOutBtn = document.getElementById('visualZoomOutBtn');
const visualModifierBtn = document.getElementById('visualModifierBtn');
const visualModifierPaletteEl = document.getElementById('visualModifierPalette');
const currentModifierIcon = document.getElementById('currentModifierIcon');
const modifierPaletteItems = document.querySelectorAll('#visualModifierPalette .palette-item');
const visualDivisionGroupEl = document.getElementById('visualDivisionGroup');
const visualDivisionBtn = document.getElementById('visualDivisionBtn');
const visualDivisionPaletteEl = document.getElementById('visualDivisionPalette');
const currentDivisionText = document.getElementById('currentDivisionText');
const currentNoteIconContainer = document.getElementById('currentNoteIconContainer');
const visualLayerGroupEl = document.getElementById('visualLayerGroup');
const visualLayerBtn = document.getElementById('visualLayerBtn');

const setVisualToolUI = (mode) => {
    hideFloatingMenu();
    const radioVal = (mode === 'edit') ? 'place' : mode;
    const radio = document.querySelector(`input[name="visualTool"][value="${radioVal}"]`);
    if (radio) radio.checked = true;
};
const displayModeBtn = document.querySelector('.utilityButton[data-buttonAction="displayMode"]');
const displayModeSelect = displayModeBtn ? displayModeBtn.querySelector('select[name="displayMode"]') : null;
const setDisplayModeUI = (mode) => {
    if (displayModeSelect) displayModeSelect.value = mode;
    updateGridDivisionVisibility();
};
const getCursorNoteIndex = getButton("getCursorNoteIndex", "utility");
const visualEditor = document.getElementById('visualEditor');
const downloadButton = getButton("download", "utility");
const warnEl = document.querySelector("#utilityContainer .warnbtn");
const editMusicButton = getButton("editMusic", "utility");
const rCwiseButton = getButton("rotateClockwise", "utility");
const rCCwiseButton = getButton("rotateCounterClockwise", "utility");
const r180Button = getButton("rotate180", "utility");
const fVerticalButton = getButton("flipVertical", "utility");
const fHorizontalButton = getButton("flipHorizontal", "utility");
const subdivisionButton = getButton("subdivisionTool", "utility");
const formatDocumentButton = getButton("formatDocument", "utility");
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
const helpBasicButton = getButton("helpBasic", "utility");
const helpShortcutsButton = getButton("helpShortcuts", "utility");
const changelogButton = getButton("changelog", "utility");
const aboutButton = getButton("about", "utility");
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
const visualToolModeBtn = document.querySelector('.utilityButton[data-buttonAction="visualToolMode"]');
const visualToolModeSelect = visualToolModeBtn ? visualToolModeBtn.querySelector('select[name="visualToolMode"]') : null;

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
    let pendingRatio = null;
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

        document.body.classList.add('resizing-panels');
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

        pendingRatio = newRatio;

        if (!resizeRafId) {
            resizeRafId = requestAnimationFrame(() => {
                resizeRafId = null;
                if (pendingRatio !== null) {
                    settings.splitRatio = pendingRatio;
                    applySplitRatio(pendingRatio);
                    resize(false);
                }
            });
        }
    });

    const stopDraggingSplitter = (e) => {
        if (!isDraggingSplitter) return;
        isDraggingSplitter = false;
        document.body.classList.remove('resizing-panels');
        panelSplitter.classList.remove('dragging');
        if (resizeRafId) {
            cancelAnimationFrame(resizeRafId);
            resizeRafId = null;
        }
        if (e.pointerId !== undefined && panelSplitter.hasPointerCapture(e.pointerId)) {
            try { panelSplitter.releasePointerCapture(e.pointerId); } catch (_) { }
        }
        if (pendingRatio !== null) {
            settings.splitRatio = pendingRatio;
            applySplitRatio(pendingRatio);
            pendingRatio = null;
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
    if (visualToolModeBtn) {
        visualToolModeBtn.style.display = isVis ? '' : 'none';
    }
    if (visualToolBarEl) {
        visualToolBarEl.style.display = isVis ? 'inline-flex' : 'none';
        if (!isVis) {
            VisualSubMenu.hideAllPalettes();
        }
    }
}

function ensureDivisionOption(val) {
    // 保持 BPM 子面板僅有 BPM 與 {...}，不向面板動態插入多餘按鈕
}

function setGridDivisionUI(val) {
    const numVal = parseInt(val, 10);
    if (!isNaN(numVal) && numVal > 0) {
        settings.gridDivision = numVal;
        if (settings.visualSelectedTiming !== 'bpm') {
            divisionSubMenu?.setValue('custom', true);
        }
    }
}

if (displayModeSelect) {
    displayModeSelect.addEventListener('change', (e) => {
        settings.displayMode = e.target.value;
        updateGridDivisionVisibility();
        visualEditorRenderer?.setZoom(settings.visualZoom);
        previewRender?.setZoom(settings.visualZoom);
        saveSettingsDebounce();
        setEditorCss(editorContainer.dataset.hidden !== 'true');
        draw();
    });
}

// 視覺工具切換 (place / select / eraser)
visualToolRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.checked) {
            const tool = e.target.value;
            const editMode = (tool === 'place') ? 'edit' : tool;
            settings.visualToolMode = editMode;
            if (visualEditorRenderer && typeof visualEditorRenderer.setEditMode === 'function') {
                visualEditorRenderer.setEditMode(editMode);
            }
            if (tool !== 'place' && tool !== 'modifier') {
                VisualSubMenu.closeAll();
            }
            saveSettingsDebounce();
            draw();
        }
    });
});

// --- 可復用子選單組件 (音符種類、效果附加、BPM與網格切分) ---
const noteTypeSubMenu = new VisualSubMenu({
    id: 'noteType',
    triggerEl: toolPlaceLabel,
    paletteEl: visualNotePaletteEl,
    iconContainerEl: currentNoteIconContainer || toolPlaceLabel,
    defaultValue: 'tap',
    isEnabled: () => (settings.visualLayerMode !== 'bpm'),
    itemDefinitions: {
        tap: { render: () => `<img id="currentNoteIcon" src="./Skin/Default/TapSkins/tap.png" alt="${t('visualToolbar.currentNote')}" class="current-note-img" style="width: 20px; height: 20px; object-fit: contain;">` },
        hold: { render: () => `<img id="currentNoteIcon" src="./Skin/Default/HoldSkins/hold.png" alt="${t('visualToolbar.currentNote')}" class="current-note-img" style="width: 20px; height: 20px; object-fit: contain;">` },
        slide: { render: () => `<img id="currentNoteIcon" src="./Skin/Default/StarSkins/star.png" alt="${t('visualToolbar.currentNote')}" class="current-note-img" style="width: 20px; height: 20px; object-fit: contain;">` },
        touch: { render: () => `<img id="currentNoteIcon" src="./Skin/Default/TouchSkins/touch.png" alt="${t('visualToolbar.currentNote')}" class="current-note-img" style="width: 20px; height: 20px; object-fit: contain;">` },
        touchhold: { render: () => `<img id="currentNoteIcon" src="./Skin/Default/TouchHoldSkins/touchhold_1.png" alt="${t('visualToolbar.currentNote')}" class="current-note-img" style="width: 20px; height: 20px; object-fit: contain;">` }
    },
    onSelect: (noteType) => {
        settings.visualSelectedNoteType = noteType;
        const placeRadio = document.getElementById('tool-mode-place');
        if (placeRadio && !placeRadio.checked) {
            placeRadio.checked = true;
            placeRadio.dispatchEvent(new Event('change'));
        }
        saveSettingsDebounce();
    }
});

const modifierSubMenu = new VisualSubMenu({
    id: 'modifier',
    triggerEl: toolModifierLabel,
    paletteEl: visualModifierPaletteEl,
    iconContainerEl: currentModifierIcon,
    defaultValue: 'none',
    highlightNonDefault: false,
    itemDefinitions: {
        none: { render: () => '<span class="material-symbols-outlined" translate="no" style="font-size: 20px;">block</span>' },
        ex: { render: () => '<span class="modifier-text-btn" translate="no">EX</span>' },
        break: { render: () => '<img src="./Skin/Default/TapSkins/tap_break.png" alt="Break" style="width: 20px; height: 20px; object-fit: contain;">' },
        mine: { render: () => `<img src="./Skin/Default/TapSkins/tap_mine.png" alt="${t('visualToolbar.modMine')}" style="width: 20px; height: 20px; object-fit: contain;">` },
        firework: { render: () => '<span class="modifier-text-btn" translate="no">FW</span>' }
    },
    onSelect: (modType) => {
        settings.visualSelectedModifier = modType;
        saveSettingsDebounce();
    }
});

const divisionSubMenu = new VisualSubMenu({
    id: 'division',
    triggerEl: toolPlaceLabel,
    paletteEl: visualDivisionPaletteEl,
    iconContainerEl: currentNoteIconContainer || toolPlaceLabel,
    defaultValue: 'custom',
    itemValueAttr: 'divisionVal',
    highlightNonDefault: false,
    isEnabled: () => (settings.visualLayerMode === 'bpm'),
    itemDefinitions: {
        bpm: {
            render: () => '<span class="modifier-text-btn" translate="no" style="font-size: 11px; font-weight: 800; color: #ffffff;">BPM</span>'
        },
        custom: {
            render: () => '<span class="division-text-btn" translate="no" style="font-size: 11px; font-weight: 800; color: #ffffff;">{...}</span>'
        }
    },
    onSelect: (divVal) => {
        if (divVal === 'bpm') {
            settings.visualSelectedTiming = 'bpm';
        } else {
            settings.visualSelectedTiming = 'custom';
        }
        const placeRadio = document.getElementById('tool-mode-place');
        if (placeRadio && !placeRadio.checked) {
            placeRadio.checked = true;
            placeRadio.dispatchEvent(new Event('change'));
        }
        saveSettingsDebounce();
    }
});

const setVisualLayerUI = (mode, showNotice = false) => {
    const isBpm = (mode === 'bpm');
    settings.visualLayerMode = mode;
    if (visualEditorRenderer && typeof visualEditorRenderer.setLayerMode === 'function') {
        visualEditorRenderer.setLayerMode(mode);
    }
    if (visualToolBarEl) {
        visualToolBarEl.classList.toggle('layer-mode-bpm', isBpm);
    }
    if (visualLayerBtn) {
        visualLayerBtn.classList.toggle('active-bpm', isBpm);
        visualLayerBtn.title = isBpm ? (t('visualToolbar.switchToNoteLayer') || '切換至音符圖層') : (t('visualToolbar.switchToBpmLayer') || '切換至 BPM 與時值圖層');
        visualLayerBtn.setAttribute('aria-label', visualLayerBtn.title);
    }
    const layerIconEl = document.getElementById('visualLayerCurrentIcon');
    if (layerIconEl) {
        if (isBpm) {
            // 目前為 BPM 圖層，顯示目標（音符）圖示 Tap (20px，與放置按鈕完全一致)
            layerIconEl.innerHTML = '<img src="./Skin/Default/TapSkins/tap.png" alt="Tap" class="layer-tap-img" width="20" height="20" style="width: 20px; height: 20px; object-fit: contain; display: block;">';
        } else {
            // 目前為音符圖層，顯示目標（BPM）文字圖示 (白色粗體)
            layerIconEl.innerHTML = '<span class="modifier-text-btn layer-bpm-text" translate="no" style="color: #ffffff; font-size: 11px; font-weight: 800;">BPM</span>';
        }
    }
    if (toolPlaceLabel) {
        toolPlaceLabel.title = isBpm ? (t('visualToolbar.toolPlaceTiming') || '放置 BPM / 時值') : (t('visualToolbar.toolPlace') || '放置音符');
        toolPlaceLabel.setAttribute('aria-label', toolPlaceLabel.title);
    }
    if (currentNoteIconContainer) {
        if (isBpm) {
            const activeTiming = (settings.visualSelectedTiming === 'bpm') ? 'bpm' : 'custom';
            divisionSubMenu?.setValue(activeTiming, true);
        } else {
            noteTypeSubMenu?.setValue(settings.visualSelectedNoteType || 'tap', true);
        }
    }
    const toolModifierLabel = document.getElementById('toolModifierLabel');
    const toolModifierRadio = document.getElementById('tool-mode-modifier');
    const visualModifierPalette = document.getElementById('visualModifierPalette');
    if (toolModifierLabel) {
        toolModifierLabel.style.display = isBpm ? 'none' : '';
    }
    if (toolModifierRadio) {
        toolModifierRadio.style.display = 'none';
    }
    if (visualModifierPalette && isBpm) {
        visualModifierPalette.style.display = 'none';
    }

    if (isBpm) {
        VisualSubMenu.closeAll();
        if (toolModifierRadio && toolModifierRadio.checked) {
            const placeRadio = document.getElementById('tool-mode-place');
            if (placeRadio) {
                placeRadio.checked = true;
                placeRadio.dispatchEvent(new Event('change'));
            }
        }
    }
    saveSettingsDebounce();
    draw();
    if (showNotice) {
        simpleToast({
            content: isBpm ? (t('visualEditor.switchedToBpmLayer') || '已切換至 BPM 與時值圖層 (左側放置 BPM，右側放置時值)') : (t('visualEditor.switchedToNoteLayer') || '已切換至音符圖層'),
            type: 'info',
            timeout: 1800
        });
    }
};

if (visualLayerBtn) {
    visualLayerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextMode = (settings.visualLayerMode === 'bpm') ? 'note' : 'bpm';
        setVisualLayerUI(nextMode, true);
    });
}

// 根據目前設定初始化子選單項目與主按鈕外觀
const syncVisualSubMenus = () => {
    if (settings.visualSelectedNoteType === 'break' || settings.visualSelectedNoteType === 'bpm') {
        settings.visualSelectedNoteType = 'tap';
    }
    if (settings.visualSelectedNoteType) {
        noteTypeSubMenu.setValue(settings.visualSelectedNoteType, true);
    }
    if (settings.visualSelectedModifier) {
        modifierSubMenu.setValue(settings.visualSelectedModifier, true);
    }
    const activeTiming = (settings.visualSelectedTiming === 'bpm') ? 'bpm' : 'custom';
    divisionSubMenu.setValue(activeTiming, true);
    setVisualLayerUI(settings.visualLayerMode || 'note', false);
};
syncVisualSubMenus();

// 縮放按鈕 (+ / -)
const handleVisualZoom = (factor) => {
    const MIN_ZOOM = 50, MAX_ZOOM = 1000;
    const currentZoom = (visualEditorRenderer && visualEditorRenderer.zoom) || settings.visualZoom || 100;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * factor));
    settings.visualZoom = newZoom;
    if (visualEditorRenderer && typeof visualEditorRenderer.setZoom === 'function') {
        visualEditorRenderer.setZoom(newZoom);
    }
    saveSettingsDebounce();
    draw();
};

if (visualZoomInBtn) {
    visualZoomInBtn.addEventListener('click', () => handleVisualZoom(1.25));
}
if (visualZoomOutBtn) {
    visualZoomOutBtn.addEventListener('click', () => handleVisualZoom(1 / 1.25));
}

// 復原 / 重作按鈕 (Undo / Redo)
if (visualUndoBtn) {
    visualUndoBtn.addEventListener('click', () => {
        if (undoButton && !undoButton.classList.contains('disabled')) {
            undoButton.click();
        }
    });
}
if (visualRedoBtn) {
    visualRedoBtn.addEventListener('click', () => {
        if (redoButton && !redoButton.classList.contains('disabled')) {
            redoButton.click();
        }
    });
}

// 最底端展開/收納按鈕 (通用控制所有 .visual-tool-group 群組)
function setVisualToolCollapsed(isCollapsed) {
    if (!visualToolCollapseBtn) return;
    visualToolCollapseBtn.classList.toggle('collapsed', isCollapsed);
    document.querySelectorAll('.visual-tool-group').forEach(group => {
        group.classList.toggle('collapsed', isCollapsed);
    });
    if (isCollapsed) {
        VisualSubMenu.closeAll();
    }
}

if (visualToolCollapseBtn) {
    visualToolCollapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willCollapse = !visualToolCollapseBtn.classList.contains('collapsed');
        setVisualToolCollapsed(willCollapse);
    });

    // 點擊到工具欄外的地方時把工具欄收起來
    document.addEventListener('pointerdown', (e) => {
        if (!visualToolBarEl || visualToolBarEl.style.display === 'none') return;
        if (visualToolCollapseBtn.classList.contains('collapsed')) return;

        // 若點擊目標在 visualToolBarEl 之內，不收合
        if (visualToolBarEl.contains(e.target)) return;

        // 若點擊目標為彈窗或上下文選單相關元素，避免誤關閉
        if (e.target.closest && (e.target.closest('.wmc-floating-note-menu') || e.target.closest('.wmc-box-floating-menu') || e.target.closest('.popup-container') || e.target.closest('.popup-window'))) {
            return;
        }

        setVisualToolCollapsed(true);
    }, true);
}

if (visualToolModeSelect) {
    visualToolModeSelect.addEventListener('change', (e) => {
        const mode = e.target.value;
        settings.visualToolMode = mode;
        setVisualToolUI(mode);
        if (visualEditorRenderer && typeof visualEditorRenderer.setEditMode === 'function') {
            visualEditorRenderer.setEditMode(mode);
        }
        saveSettingsDebounce();
        draw();
    });
}

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    // 支援 Shift + Alt + F (VS Code 標準 Format Document / Selection)
    if (e.shiftKey && e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        handleFormatDocument(editorInput, { simpleToast, t });
        return;
    }

    // 支援 Ctrl + Shift + I (格式化快捷鍵)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        handleFormatDocument(editorInput, { simpleToast, t });
        return;
    }

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
            settings.visualToolMode = 'edit';
            setVisualToolUI('edit');
            if (visualToolModeSelect) visualToolModeSelect.value = 'edit';
            if (visualEditorRenderer && typeof visualEditorRenderer.setEditMode === 'function') {
                visualEditorRenderer.setEditMode('edit');
            }
            saveSettingsDebounce();
            draw();
        } else if (e.key === 'v' || e.key === 'V' || e.key === 's' || e.key === 'S') {
            settings.visualToolMode = 'select';
            setVisualToolUI('select');
            if (visualToolModeSelect) visualToolModeSelect.value = 'select';
            if (visualEditorRenderer && typeof visualEditorRenderer.setEditMode === 'function') {
                visualEditorRenderer.setEditMode('select');
            }
        } else if (e.key === 'b' || e.key === 'B') {
            settings.visualToolMode = 'boxSelect';
            setVisualToolUI('boxSelect');
            if (visualEditorRenderer && typeof visualEditorRenderer.setEditMode === 'function') {
                visualEditorRenderer.setEditMode('boxSelect');
            }
            saveSettingsDebounce();
            draw();
        }
    }
});

let notes = [], endTime = 1, musicDelay = 0, rawData = [], dataIndexToTime = [];
let rawCharOffsets = new Int32Array(0);

const updateRawCharOffsets = () => {
    const len = rawData.length;
    if (rawCharOffsets.length !== len + 1) {
        rawCharOffsets = new Int32Array(len + 1);
    }
    let acc = 0;
    rawCharOffsets[0] = 0;
    for (let i = 0; i < len; i++) {
        acc += (rawData[i]?.length || 0);
        rawCharOffsets[i + 1] = acc;
        acc += 1;
    }
};

const getCharOffsetAtIndex = (idx) => {
    if (idx < 0) return 0;
    const target = idx + 1;
    if (target < rawCharOffsets.length) {
        return rawCharOffsets[target];
    }
    return rawData.slice(0, idx + 1).join(',').length;
};

const getNoteRangeAtIndex = (idx) => {
    if (idx < 0 || rawData.length === 0) return { start: 0, end: 0 };
    const safeIdx = Math.min(idx, rawData.length - 1);
    const start = safeIdx === 0 ? 0 : (rawCharOffsets[safeIdx] ?? 0) + 1;
    const end = rawCharOffsets[safeIdx + 1] ?? start;
    return { start, end };
};

let ctx = canvas.getContext('2d');

//-----Quick panel-----
initQuickPanel({
    quickPanel,
    settings,
    getSettings: () => settings,
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
    const raw = (val !== undefined && val !== null) ? val : settings.moviebrightness;
    const num = parseFloat(raw);
    const b = Math.max(0, 1 + 0.1875 * (isNaN(num) ? -3 : num));
    if (editorBackgroundImage) editorBackgroundImage.style.filter = `brightness(${b})`;
    if (editorBackgroundVideo) editorBackgroundVideo.style.filter = `brightness(${b})`;
    if (secondCtx && externalWindow && typeof syncSecondWindowBackground === 'function') {
        syncSecondWindowBackground();
    }
}

// 上次對影片進行 seek 的時間（秒），用來避免頻繁設定 currentTime
let lastVideoSeekTime = 0;
const VIDEO_MIN_SEEK_INTERVAL = 0.8; // 最短 seek 間隔（秒）
const VIDEO_SEEK_THRESHOLD = 0.3; // 當差距超過此值才執行 seek（秒）

let clockBpm = 60;

const playControlsElement = document.getElementById('playControls');
const previewVisible = () => (previewContainer.style.display !== 'none' && playControlsElement?.style.display !== 'none');

let cachedTimelineMin = 0;
let cachedTimelineMax = 100;
let lastSliderRatio = -1;
let lastSliderValue = -1;

const setEndtime = (e) => {
    endTime = Math.max(e + 1, audioManager.getBGMDuration() + 1);
    cachedTimelineMax = endTime + musicDelay;
    timeline.max = cachedTimelineMax;
    updateSlider(realTime, true);
};

const updateSlider = (time, force = false) => {
    if (!force && Math.abs(time - lastSliderValue) < 0.016) {
        return;
    }
    lastSliderValue = time;
    const min = cachedTimelineMin;
    const max = cachedTimelineMax;
    const ratio = Math.max(0, Math.min(1, max > min ? (time - min) / (max - min) : 0));
    timeline.value = time;
    const roundedRatio = Math.round(ratio * 10000);
    if (force || roundedRatio !== lastSliderRatio) {
        lastSliderRatio = roundedRatio;
        const thumbWidth = 16;
        const stopPos = `calc(${thumbWidth * 0.5}px + ${ratio} * (100% - ${thumbWidth}px))`;
        timeline.style.setProperty('--timeline-progress', stopPos);
    }
};

if (manageResourcesButton) {
    manageResourcesButton.addEventListener('click', () => {
        openResourceManager();
    });
}

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

function setDataEmpty(skipPersist = false) {
    if (playbackEngine) {
        playbackEngine.stop();
    } else {
        playButton.dataset.playing = 'false';
        playButton.children[0].innerText = "play_arrow";
        playStartTimestamp = null;
    }
    maidata = {};
    nowDifficulty = 5;
    backgroundImage = null;
    backgroundVideo = null;
    revokeBlobUrls();
    getres('');
    applyHighlight('');
    musicDelay = 0;
    playbackEngine?.setTime(0);
    cachedTimelineMax = 1;
    timeline.max = cachedTimelineMax;
    timeline.value = 0;
    updateSlider(0, true);
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
    if (!skipPersist) {
        inputDebounce();
        saveMaidata();
    }
    renderer?.clearJudgeEffects();
    renderer?.clearHitEffects();
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

// 以逗號切分，支援 Simai 新語法（多行註解、單行註解、屬性標籤 <SIZE*(1.5,2)> 等內部的逗號不分割，且完整保留所有字元）
const splitSimaiPreservingAll = (text) => {
    if (!text) return [];
    const out = [];
    let cur = '';
    let inBracket = 0;
    let inParen = 0;
    let inBrace = 0;
    const len = text.length;

    for (let i = 0; i < len;) {
        const c = text[i];
        const next = text[i + 1];

        // 1. 單行註解 ||：保留直到行尾（註解內逗號不分割）
        if (c === '|' && next === '|') {
            cur += '||';
            i += 2;
            while (i < len && text[i] !== '\n' && text[i] !== '\r') {
                cur += text[i++];
            }
            if (i < len && text[i] === '\r') {
                cur += '\r';
                i++;
                if (i < len && text[i] === '\n') { cur += '\n'; i++; }
            } else if (i < len && text[i] === '\n') {
                cur += '\n';
                i++;
            }
            continue;
        }

        // 2. 多行註解 |* ... *|：保留完整內容（註解內逗號不分割）
        if (c === '|' && next === '*') {
            cur += '|*';
            i += 2;
            while (i < len) {
                if (text[i] === '*' && text[i + 1] === '|') {
                    cur += '*|';
                    i += 2;
                    break;
                }
                cur += text[i++];
            }
            continue;
        }

        // 3. 屬性標籤 <[A-Za-z]+\*[^>]*> (例如 <SIZE*(1.5,2)>, <HS*1.25>, <COLOR*...>)：原子消費（內含逗號不分割）
        if (c === '<') {
            const rest = text.slice(i);
            const propMatch = rest.match(/^<[A-Za-z]+\*[^>]*>/);
            if (propMatch) {
                cur += propMatch[0];
                i += propMatch[0].length;
                continue;
            }
        }

        // 4. 括號巢狀層級追蹤
        if (c === '[') inBracket++;
        else if (c === ']') inBracket = Math.max(0, inBracket - 1);
        else if (c === '(') inParen++;
        else if (c === ')') inParen = Math.max(0, inParen - 1);
        else if (c === '{') inBrace++;
        else if (c === '}') inBrace = Math.max(0, inBrace - 1);

        // 5. 頂層逗號分隔符
        if (c === ',' && inBracket === 0 && inParen === 0 && inBrace === 0) {
            out.push(cur);
            cur = '';
            i++;
            continue;
        }

        cur += c;
        i++;
    }

    out.push(cur);
    return out;
};

/**
 * 套用解碼結果至主線程狀態與渲染器
 */
function applyDecodeResult(result, simaiDataValue) {
    if (!result || result._isStale) return;
    if (result.failed) {
        simpleToast({ content: '解析譜面失敗，請檢查格式是否正確', type: 'error', timeout: 2000 });
        return;
    }

    notes = result.notes;
    decodedTags = result.tags || [];
    renderer?.clearJudgeEffects();
    renderer?.clearHitEffects();

    setEndtime(result.endTime);
    clockBpm = result.bpm;

    dataIndexToTime = result.indexToTime || [];

    playScoreRes = {
        ...result.notesCounts,
        score: result.score,
    };
    playScoreRes.breakScore = playScoreRes.break == 0 ? 0 : (1 / playScoreRes.break);
    playScoreRes.invScore = 1 / playScoreRes.score;
    rawData = splitSimaiPreservingAll(simaiDataValue);
    updateRawCharOffsets();
    lastCursorIndex = -1;

    // 預先計算二分搜尋結構與前綴和，確保播放無冷啟動延遲
    simaiLogicControler.prepare(notes, playScoreRes);

    warnings = settings.disableSyntaxCheck ? [] : (result.warnings || []);
    warningPositions = settings.disableSyntaxCheck ? [] : (result.errpositions || []);
    warningPositionsConst = warningPositions;
    if (!settings.disableSyntaxCheck && result.warnings && result.warnings.length > 0) {
        warnEl.style.visibility = 'visible';
        warnEl.querySelector('.warnCount').textContent = result.warnings.length;
        console.warn('Decode warnings:', result.warnings);
    } else {
        warnEl.style.visibility = 'hidden';
    }
    draw();
}

/**
 * 譜面解析進入點：支援 Web Worker 背景非同步解析與主線程同步降級
 */
const getres = async (simaiDataValue, options = {}) => {
    renderer?.clearJudgeEffects();
    renderer?.clearHitEffects();

    const decodeOpts = { disableSyntaxCheck: !!settings.disableSyntaxCheck, ...options };

    // 若指定同步或 Worker 不可用，直接同步解析 (維持最高相容性)
    if (options.sync || !decodeWorkerManager.isAvailable()) {
        try {
            const result = decodeWorkerManager.decodeSync(simaiDataValue, 0, decodeOpts);
            applyDecodeResult(result, simaiDataValue);
            return result;
        } catch (e) {
            console.error("解析失敗", e);
            return null;
        }
    }

    // 預設採用背景 Worker 非同步解析，主線程 0 卡頓
    try {
        const result = await decodeWorkerManager.decodeAsync(simaiDataValue, 0, decodeOpts);
        applyDecodeResult(result, simaiDataValue);
        return result;
    } catch (e) {
        console.error("Worker 解析失敗，降級同步解析", e);
        try {
            const fallbackResult = decodeWorkerManager.decodeSync(simaiDataValue, 0, decodeOpts);
            applyDecodeResult(fallbackResult, simaiDataValue);
            return fallbackResult;
        } catch (err) {
            console.error("同步解析降級亦失敗", err);
            return null;
        }
    }
};

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
    cachedTimelineMax = endTime + musicDelay;
    timeline.max = cachedTimelineMax;
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

function saveMaidataImmediate() {
    if (!maidata) return Promise.resolve();
    if (currentProjectId) {
        const name = maidata?.title || null;
        projectTouch(currentProjectId).catch(() => { });
        if (name) projectUpdateName(currentProjectId, name).catch(() => { });
    }

    // 更新 Discord RPC 狀態
    updateDiscordRPC(maidata, nowDifficulty);

    return projSet('maidata', maidata).catch((error) => {
        console.error("儲存maidata到IndexedDB失敗:", error);
    });
}

const saveMaidata = debounce(() => {
    saveMaidataImmediate();
}, 500);

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

playbackReset.addEventListener('click', (e) => {
    if (e.target === playbackSpeedInput) return;
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
        if (visualToolBarEl) {
            visualToolBarEl.style.display = visualVisible ? 'inline-flex' : 'none';
            if (!visualVisible && visualNotePaletteEl) {
                visualNotePaletteEl.style.display = 'none';
            }
        }
    } else {
        if (visualToolBarEl) {
            visualToolBarEl.style.display = 'none';
            if (visualNotePaletteEl) {
                visualNotePaletteEl.style.display = 'none';
            }
        }
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
    openSettingsModal();
});

chartInfoButton.addEventListener('click', () => {
    openChartInfoModal();
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
    const canUndo = Array.isArray(undoStack) && undoStack.length > 0;
    const canRedo = Array.isArray(redoStack) && redoStack.length > 0;
    if (undoButton) {
        undoButton.classList.toggle('disabled', !canUndo);
        undoButton.setAttribute('aria-disabled', String(!canUndo));
    }
    if (redoButton) {
        redoButton.classList.toggle('disabled', !canRedo);
        redoButton.setAttribute('aria-disabled', String(!canRedo));
    }
    if (visualUndoBtn) {
        visualUndoBtn.classList.toggle('disabled', !canUndo);
        visualUndoBtn.setAttribute('aria-disabled', String(!canUndo));
    }
    if (visualRedoBtn) {
        visualRedoBtn.classList.toggle('disabled', !canRedo);
        visualRedoBtn.setAttribute('aria-disabled', String(!canRedo));
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

if (helpBasicButton) {
    helpBasicButton.addEventListener('click', () => {
        openHelpModal('basic');
    });
}

if (helpShortcutsButton) {
    helpShortcutsButton.addEventListener('click', () => {
        openHelpModal('shortcuts');
    });
}

if (changelogButton) {
    changelogButton.addEventListener('click', () => {
        openChangelogModal();
    });
}

if (aboutButton) {
    aboutButton.addEventListener('click', () => {
        openAboutModal();
    });
}

function getGridSlots(maxTime) {
    const slots = [];
    let toolbarGridDiv = parseInt(settings.gridDivision, 10);
    if (isNaN(toolbarGridDiv) || toolbarGridDiv <= 0) toolbarGridDiv = 4;

    if (maxTime === null || maxTime === undefined || isNaN(maxTime) || !isFinite(maxTime) || maxTime < 0) {
        maxTime = (endTime && isFinite(endTime) && endTime > 0) ? endTime + 2.0 : 100.0;
    }

    const limitMaxTime = Math.min(maxTime, 7200.0);
    const lastCommaTime = (dataIndexToTime && dataIndexToTime.length > 0) ? (dataIndexToTime[dataIndexToTime.length - 1] || 0) : 0;
    const fallbackEndTime = Math.max(endTime || 0, limitMaxTime, lastCommaTime + 10.0);

    if (!decodedTags || decodedTags.length === 0) {
        const bpm = (clockBpm && clockBpm > 0) ? clockBpm : 60;
        const beatPeriod = (240 / bpm) / toolbarGridDiv;
        if (!isFinite(beatPeriod) || beatPeriod <= 0.0001) return [0];

        let count = 0;
        for (let t = 0; t <= fallbackEndTime + 0.001 && count < 20000; t += beatPeriod) {
            slots.push(t);
            count++;
        }
        return slots;
    }

    const bpmTags = decodedTags.filter(t => t.type === 'bpm' && t.value > 0).sort((a, b) => a.time - b.time);
    const splitTags = decodedTags.filter(t => t.type === 'split' && t.value > 0).sort((a, b) => a.time - b.time);

    const boundarySet = new Set([0]);
    boundarySet.add(fallbackEndTime);
    for (const tag of bpmTags) {
        if (tag.time <= fallbackEndTime) boundarySet.add(tag.time);
    }
    for (const tag of splitTags) {
        if (tag.time <= fallbackEndTime) boundarySet.add(tag.time);
    }

    const boundaries = Array.from(boundarySet).sort((a, b) => a - b);

    let currentBpm = (clockBpm && clockBpm > 0) ? clockBpm : 60;
    let currentSplit = 4;

    for (let k = 0; k < boundaries.length - 1; k++) {
        const tStart = boundaries[k];
        const tEnd = boundaries[k + 1];
        if (tEnd <= tStart) continue;

        const effectiveBpmTag = bpmTags.filter(t => t.time <= tStart + 0.001).sort((a, b) => b.time - a.time)[0];
        if (effectiveBpmTag) currentBpm = effectiveBpmTag.value;

        const effectiveSplitTag = splitTags.filter(t => t.time <= tStart + 0.001).sort((a, b) => b.time - a.time)[0];
        if (effectiveSplitTag) currentSplit = effectiveSplitTag.value;

        const splitPeriod = (240 / currentBpm) / currentSplit;
        if (isFinite(splitPeriod) && splitPeriod > 0.0001) {
            let t = tStart;
            let count = 0;
            while (t < tEnd - 0.0001 && count < 20000) {
                slots.push(t);
                t += splitPeriod;
                count++;
            }
        }

        if (toolbarGridDiv && toolbarGridDiv !== currentSplit) {
            const gridPeriod = (240 / currentBpm) / toolbarGridDiv;
            if (isFinite(gridPeriod) && gridPeriod > 0.0001) {
                let t = tStart;
                let count = 0;
                while (t < tEnd - 0.0001 && count < 20000) {
                    slots.push(t);
                    t += gridPeriod;
                    count++;
                }
            }
        }
    }

    if (dataIndexToTime && dataIndexToTime.length > 0) {
        for (let i = 0; i < dataIndexToTime.length; i++) {
            const t = dataIndexToTime[i];
            if (t !== undefined && t !== null && isFinite(t) && t <= fallbackEndTime) {
                slots.push(t);
            }
        }
    }

    slots.sort((a, b) => a - b);
    const uniqueSlots = [];
    for (let i = 0; i < slots.length; i++) {
        const val = slots[i];
        if (uniqueSlots.length === 0 || Math.abs(val - uniqueSlots[uniqueSlots.length - 1]) > 0.0005) {
            uniqueSlots.push(val);
        }
    }

    return uniqueSlots;
}

const quantizeTime = (time) => {
    if (time === null || time === undefined || isNaN(time) || !isFinite(time)) return null;
    const slots = getGridSlots(time + 2.0);
    if (!slots || slots.length === 0) return null;

    let low = 0;
    let high = slots.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (slots[mid] === time) return slots[mid];
        if (slots[mid] < time) low = mid + 1;
        else high = mid - 1;
    }

    const idx1 = Math.max(0, high);
    const idx2 = Math.min(slots.length - 1, low);
    const diff1 = Math.abs(slots[idx1] - time);
    const diff2 = Math.abs(slots[idx2] - time);
    const closest = (diff1 <= diff2) ? slots[idx1] : slots[idx2];
    if (Math.abs(closest - time) > 2.0) return null;
    return closest;
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
    visualChangeNote,
    getNoteCurrentProperties,
    visualUpdateNoteProperty,
    getNoteTouchGroup,
    visualUpdateTouchGroup,
    visualPlaceTimingTag,
    visualDeleteTag,
    visualEditTag,
    visualUpdateHoldDuration
} = createVisualNoteCallbacks({
    quantizeTime,
    getRawData: () => rawData,
    setRawData: (v) => { rawData = v; updateRawCharOffsets(); },
    getDataIndexToTime: () => dataIndexToTime,
    setDataIndexToTime: (v) => { dataIndexToTime = v; },
    getClockBpm: () => clockBpm,
    getSettings: () => settings,
    getDecodedTags: () => decodedTags,
    updateEditorAndSave
});

const onVisualTagSelect = (tag, screenPos) => {
    hideFloatingMenu();
    if (!tag || !screenPos) {
        visualEditorRenderer?.clearSelectedTag();
        return;
    }
    visualEditorRenderer?.setSelectedTag(tag);
    showTagFloatingMenu(tag, screenPos, {
        onEdit: (t) => {
            visualEditTag(t);
        },
        onDelete: (t) => {
            visualDeleteTag(t);
            visualEditorRenderer?.clearSelectedTag();
        },
        onClose: () => {
            visualEditorRenderer?.clearSelectedTag();
        }
    });
};

const onVisualSelectionChange = (selectedNotes) => {
    // 1. 若處於框選模式且有作用中大框
    const boxRect = visualEditorRenderer?.getBoxScreenRect();
    if (boxRect && selectedNotes && selectedNotes.size > 0) {
        hideFloatingMenu();
        showBoxFloatingMenu(boxRect, selectedNotes.size, {
            onDelete: () => {
                visualDeleteNote(Array.from(selectedNotes));
                visualEditorRenderer?.clearActiveBox();
                draw();
            }
        });
        return;
    }
    hideBoxFloatingMenu();

    // 2. 單一音符選取 (支援 Tap、Hold、Slide、Touch 等所有單選音符選單與刪除)
    if (selectedNotes && selectedNotes.size === 1) {
        const note = Array.from(selectedNotes)[0];
        const props = getNoteCurrentProperties(note) || {};
        const screenPos = visualEditorRenderer?.getNoteScreenPos(note);
        if (screenPos) {
            showFloatingMenu(note, screenPos, props, {
                onChangeDuration: () => {
                    hideFloatingMenu();
                    openNoteDurationModal({
                        note,
                        currentDuration: props.duration || '',
                        isSlide: props.isSlide,
                        onApply: (newDurationStr) => {
                            visualUpdateNoteProperty(note, { duration: newDurationStr });
                            draw();
                        }
                    });
                },
                onChangePattern: () => {
                    hideFloatingMenu();
                    openSlideEditorModal({
                        note,
                        rawPart: props.part,
                        renderer,
                        settings,
                        images,
                        onApply: (newSlideStr) => {
                            visualUpdateNoteProperty(note, { fullSlideString: newSlideStr });
                            draw();
                        }
                    });
                },
                onEditTouchGroup: () => {
                    hideFloatingMenu();
                    const groupData = getNoteTouchGroup(note);
                    if (!groupData) {
                        simpleToast({ content: t('visualEditor.touchGroupLoadFailed'), type: 'error', timeout: 1500 });
                        return;
                    }
                    openTouchGroupModal({
                        note,
                        touchGroupData: groupData,
                        renderer,
                        settings,
                        images,
                        bpm: clockBpm,
                        onApply: ({ touchNotes }) => {
                            visualUpdateTouchGroup(groupData.commaIndex, {
                                leadingTags: groupData.leadingTags,
                                nonTouchParts: groupData.nonTouchParts,
                                touchNotes
                            });
                            draw();
                        }
                    });
                },
                onDelete: () => {
                    hideFloatingMenu();
                    visualDeleteNote(note);
                    visualEditorRenderer?.clearSelection();
                    draw();
                }
            });
            return;
        }
    }
    hideFloatingMenu();
};

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
            if (isVisualModeFlag) {
                return visualEditorRenderer?.getCanvasWH()?.height || 0;
            } else if (previewVisibleFlag) {
                return (previewRender?.getCanvasWH()?.width || 0) / 2;
            }
            return 0;
        })();
        const visualBuckets = { slide: [], tapnhold: [], touch: [], tags: [] };
        const V = (visualHeight || 0) / (settings.visualZoom || 1);

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
    renderer?.clearJudgeEffects();
    renderer?.clearHitEffects();
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
    readMaidataButton,
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
    renderer?.clearJudgeEffects();
    renderer?.clearHitEffects();
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


const topUtilityBtnsEl = document.getElementById('topUtilityBtns');
const utilityContainerEl = document.getElementById('utilityContainer');

function getUtilityRowHeight() {
    const val = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--utility-row-height'));
    return Number.isFinite(val) && val > 0 ? val : 40;
}

function getExpectedUtilityRows() {
    const val = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--utility-rows'));
    return Number.isFinite(val) && val > 0 ? val : 1;
}

function calculateUtilityRows() {
    const rowHeight = getUtilityRowHeight();
    if (!topUtilityBtnsEl || topUtilityBtnsEl.offsetHeight <= 0) {
        return getExpectedUtilityRows();
    }
    return Math.max(1, Math.round(topUtilityBtnsEl.offsetHeight / rowHeight));
}

function updateUtilityHeight() {
    const rowHeight = getUtilityRowHeight();
    const rows = calculateUtilityRows();
    const expectedRows = getExpectedUtilityRows();

    if (rows > expectedRows) {
        document.documentElement.style.setProperty('--utility-rows', rows);
    } else {
        document.documentElement.style.removeProperty('--utility-rows');
        document.documentElement.style.removeProperty('--utility-height');
    }

    return rows * rowHeight;
}

if (window.ResizeObserver && topUtilityBtnsEl) {
    let lastObservedRows = getExpectedUtilityRows();
    const utilityObserver = new ResizeObserver(() => {
        const isHidden = hideUtilityButton?.dataset.hidden === 'true';

        if (!isHidden && topUtilityBtnsEl.style.display !== 'none') {
            const currentRows = calculateUtilityRows();
            if (currentRows !== lastObservedRows) {
                lastObservedRows = currentRows;
                updateUtilityHeight();
                resize();
            }
        }
    });

    utilityObserver.observe(topUtilityBtnsEl);
}

/**
 * 增強工具列水平滑動體驗 (支援滑鼠滾輪直接橫向滾動、滑鼠拖曳滑動、觸控防誤觸與邊界陰影指示)
 */
function setupUtilityHorizontalScroll() {
    if (!topUtilityBtnsEl) return;

    const utilityContainer = utilityContainerEl || document.getElementById('utilityContainer');
    const rows = Array.from(topUtilityBtnsEl.querySelectorAll('.utility-row'));

    // 取得當前真正具有橫向滾動能力的容器
    function getScrollContainer(target) {
        if (target) {
            const row = target.closest('.utility-row');
            if (row && window.getComputedStyle(row).display !== 'contents') {
                return row;
            }
        }
        return topUtilityBtnsEl;
    }

    // 更新邊界陰影指示器與可拖曳樣式
    function updateScrollIndicators() {
        const isMobile = window.matchMedia('(max-aspect-ratio: 1/1)').matches;
        let canLeft = false;
        let canRight = false;

        const checkEl = (el) => {
            if (!el || window.getComputedStyle(el).display === 'contents') return;
            const maxScroll = el.scrollWidth - el.clientWidth;
            if (maxScroll > 1) {
                el.classList.add('is-draggable');
                if (el.scrollLeft > 2) canLeft = true;
                if (el.scrollLeft < maxScroll - 2) canRight = true;
            } else {
                el.classList.remove('is-draggable');
            }
        };

        if (isMobile && rows.length > 0) {
            rows.forEach(checkEl);
        } else {
            checkEl(topUtilityBtnsEl);
        }

        if (utilityContainer) {
            utilityContainer.classList.toggle('can-scroll-left', canLeft);
            utilityContainer.classList.toggle('can-scroll-right', canRight);
        }
    }

    // 1. 滑鼠滾輪直接橫向滾動 (Wheel to Horizontal Scroll)
    topUtilityBtnsEl.addEventListener('wheel', (e) => {
        const container = getScrollContainer(e.target);
        if (!container) return;

        const maxScroll = container.scrollWidth - container.clientWidth;
        if (maxScroll <= 0) return;

        // 若垂直 deltaY 佔主導，將其轉換為水平滾動；若本身就是橫向 deltaX 則直接使用
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (delta === 0) return;

        // 單位標準化 (處理 line deltaMode)
        const step = (e.deltaMode === 1) ? delta * 33 : (e.deltaMode === 2 ? delta * 100 : delta);

        const canScrollLeft = container.scrollLeft > 0;
        const canScrollRight = container.scrollLeft < maxScroll - 1;

        if ((step < 0 && canScrollLeft) || (step > 0 && canScrollRight)) {
            e.preventDefault();
            container.scrollLeft += step;
            updateScrollIndicators();
        }
    }, { passive: false });

    // 2. 滑鼠拖曳滑動 (Mouse Drag-to-Scroll)
    let isMouseDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let hasDragged = false;
    let activeDragContainer = null;

    topUtilityBtnsEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        // 若點擊的是輸入框或下拉選單，不觸發拖曳以保證正常輸入/選取
        if (e.target.closest('input, select')) return;

        const container = getScrollContainer(e.target);
        if (!container || container.scrollWidth <= container.clientWidth) return;

        isMouseDown = true;
        hasDragged = false;
        activeDragContainer = container;
        startX = e.clientX;
        startScrollLeft = container.scrollLeft;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isMouseDown || !activeDragContainer) return;

        const dx = e.clientX - startX;
        if (!hasDragged && Math.abs(dx) > 4) {
            hasDragged = true;
            activeDragContainer.classList.add('is-dragging');
            topUtilityBtnsEl.classList.add('is-dragging');
        }

        if (hasDragged) {
            e.preventDefault();
            activeDragContainer.scrollLeft = startScrollLeft - dx;
            updateScrollIndicators();
        }
    });

    window.addEventListener('mouseup', () => {
        if (!isMouseDown) return;
        isMouseDown = false;

        if (activeDragContainer) {
            activeDragContainer.classList.remove('is-dragging');
            topUtilityBtnsEl.classList.remove('is-dragging');
            activeDragContainer = null;
        }

        if (hasDragged) {
            // 在 capture 階段阻斷下一個 click 事件，防止拖曳放開時誤點按鈕
            const suppressClick = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
            };
            window.addEventListener('click', suppressClick, { capture: true, once: true });
            setTimeout(() => {
                window.removeEventListener('click', suppressClick, { capture: true });
                hasDragged = false;
            }, 60);
        }
    });

    // 3. 觸控滑動防誤觸 (Touch swipe click suppression)
    let touchStartX = 0;
    let touchStartY = 0;
    let touchHasMoved = false;

    topUtilityBtnsEl.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchHasMoved = false;
        }
    }, { passive: true });

    topUtilityBtnsEl.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches.length === 1) {
            const dx = Math.abs(e.touches[0].clientX - touchStartX);
            if (dx > 7) {
                touchHasMoved = true;
            }
        }
    }, { passive: true });

    topUtilityBtnsEl.addEventListener('touchend', () => {
        if (touchHasMoved) {
            const suppressClick = (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
            };
            window.addEventListener('click', suppressClick, { capture: true, once: true });
            setTimeout(() => {
                window.removeEventListener('click', suppressClick, { capture: true });
                touchHasMoved = false;
            }, 80);
        }
    }, { passive: true });

    // 監聽滾動以即時更新陰影指示器
    topUtilityBtnsEl.addEventListener('scroll', updateScrollIndicators, { passive: true });
    rows.forEach(r => r.addEventListener('scroll', updateScrollIndicators, { passive: true }));
    window.addEventListener('resize', updateScrollIndicators, { passive: true });

    // 初始化與變更觀察
    updateScrollIndicators();
    if (window.ResizeObserver) {
        new ResizeObserver(updateScrollIndicators).observe(topUtilityBtnsEl);
    }
}

setupUtilityHorizontalScroll();

hideUtilityButton.addEventListener('click', () => {
    const utilityBtns = topUtilityBtnsEl;
    const utilityContainer = utilityContainerEl;
    const isHidden = hideUtilityButton.dataset.hidden === 'true';

    if (isHidden) {
        utilityBtns.style.display = 'flex';
        utilityBtns.style.height = 'auto';

        const targetHeight = updateUtilityHeight();

        utilityBtns.animate([
            { opacity: 0, height: '0px', minHeight: '0px', padding: '0 5px' },
            { opacity: 1, height: `${targetHeight}px`, minHeight: '0px', padding: '5px' }
        ], {
            duration: 200,
            easing: 'ease'
        }).onfinish = () => {
            utilityBtns.style.height = '';
        };

        canvasContainer.classList.remove('expanded');
        editorContainer.classList.remove('expanded');
        panelSplitter?.classList.remove('expanded');
        utilityContainer.classList.remove('expanded');

    } else {
        const currentHeight = updateUtilityHeight();

        utilityBtns.animate([
            { opacity: 1, height: `${currentHeight}px`, minHeight: '0px', padding: '5px' },
            { opacity: 0, height: '0px', minHeight: '0px', padding: '0 5px' }
        ], {
            duration: 200,
            easing: 'ease'
        }).onfinish = () => {
            utilityBtns.style.display = 'none';
            utilityBtns.style.height = '';
        };

        canvasContainer.classList.add('expanded');
        editorContainer.classList.add('expanded');
        panelSplitter?.classList.add('expanded');
        utilityContainer.classList.add('expanded');
    }

    hideUtilityButton.innerText = isHidden ? '▲' : '▼';
    hideUtilityButton.dataset.hidden = isHidden ? 'false' : 'true';

    resize();
});

const utilityDropdowns = document.querySelectorAll('.utilityDropdown');

function closeAllDropdowns() {
    utilityDropdowns.forEach((d) => {
        d.classList.remove('open');
        d.querySelectorAll('.utilityMenuTitle.open').forEach(menu => menu.classList.remove('open'));
    });
}

function positionDropdownContent(dropdown) {
    const btn = dropdown.querySelector('.utilityDropdown-btn');
    const content = dropdown.querySelector('.utilityDropdown-content');
    if (!btn || !content) return;

    const btnRect = btn.getBoundingClientRect();
    content.style.top = `${btnRect.bottom}px`;
    let left = btnRect.left;
    const contentWidth = content.offsetWidth || 120;
    if (left + contentWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - contentWidth - 8);
    }
    content.style.left = `${left}px`;
}

utilityDropdowns.forEach((utilityDropdown) => {
    const utilityDropdownBtn = utilityDropdown.querySelector('.utilityDropdown-btn');
    if (!utilityDropdownBtn) return;

    utilityDropdownBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = utilityDropdown.classList.contains('open');
        // 關閉所有其他 dropdown 及子選單
        closeAllDropdowns();
        if (!isOpen) {
            utilityDropdown.classList.add('open');
            positionDropdownContent(utilityDropdown);
        }
    });

    const menuTitles = utilityDropdown.querySelectorAll('.utilityMenuTitle');
    menuTitles.forEach((menuTitle) => {
        menuTitle.addEventListener('click', (event) => {
            // 若點擊的是子選單內的按鈕，不在此攔截，讓按鈕動作與關閉邏輯處理
            if (event.target.closest('.utilitySubmenu .utilityButton')) {
                return;
            }
            event.stopPropagation();
            const isOpen = menuTitle.classList.contains('open');
            menuTitles.forEach(m => m.classList.remove('open'));
            if (!isOpen) {
                menuTitle.classList.add('open');
            }
        });
    });

    const submenus = utilityDropdown.querySelectorAll('.utilitySubmenu');
    submenus.forEach((submenu) => {
        submenu.addEventListener('click', (event) => {
            // 若點擊子選單非按鈕區域（如分隔線或空白），避免冒泡導致選單關閉
            if (!event.target.closest('.utilityButton')) {
                event.stopPropagation();
            }
        });
    });
});

document.addEventListener('click', () => {
    closeAllDropdowns();
});


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
    hideFloatingMenu();
    const min = cachedTimelineMin;
    const max = cachedTimelineMax;
    const clampedTime = Math.max(min, Math.min(max, newTime));

    playbackEngine.seekToRealTime(clampedTime);
    if (settings.cursorFollow && !playbackEngine.isPlaying) {
        const point = getCharOffsetAtIndex(nowIndex);
        editorInput.selectionStart = point;
        editorInput.selectionEnd = point;
        cursorLastIndexTime = dataIndexToTime[nowIndex] ?? 0;
    }
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

let _highlightRafId = null;
let _pendingHighlightText = null;
let _lastRenderedHighlightText = null;
let _lastRenderedWarningKey = null;

function renderHighlightNow(text) {
    const warningRanges = settings.disableSyntaxCheck ? [] : warningPositions.map(index => {
        const range = getNoteRangeAtIndex(index);
        return { start: range.start, end: range.end };
    });
    const warningKey = warningRanges.map(r => `${r.start}:${r.end}`).join(',');

    // 若文字與警告範圍完全未變，直接跳過 DOM 重構以杜絕不必要的 Reflow
    if (text === _lastRenderedHighlightText && warningKey === _lastRenderedWarningKey) {
        warningPositions = [];
        return;
    }

    _lastRenderedHighlightText = text;
    _lastRenderedWarningKey = warningKey;
    highlightLayer.innerHTML = getHighlight(text, warningRanges);
    warningPositions = []; // 重置警告位置，等待下一次解析更新
}

function applyHighlight(text, immediate = false) {
    _pendingHighlightText = text;

    if (immediate) {
        if (_highlightRafId !== null) {
            cancelAnimationFrame(_highlightRafId);
            _highlightRafId = null;
        }
        renderHighlightNow(text);
        return;
    }

    if (_highlightRafId !== null) return;

    _highlightRafId = requestAnimationFrame(() => {
        _highlightRafId = null;
        if (_pendingHighlightText !== null) {
            renderHighlightNow(_pendingHighlightText);
        }
    });
}

// === 實例化中央播放引擎 (PlaybackEngine) ===
const playbackEngine = new PlaybackEngine({
    appContext,
    audioManager,
    majdataWs,
    getSettings: () => settings,
    getRenderer: () => renderer,
    getNotes: () => notes,
    getEndTime: () => endTime,
    getMusicDelay: () => musicDelay,
    getNowIndex: () => nowIndex,
    getRawData: () => rawData,
    getDataIndexToTime: () => dataIndexToTime,
    getCharOffsetAtIndex,
    getSecondaryWindow: () => secondaryWindow,
    getSecondCtx: () => secondCtx,
    getBackgroundImage: () => backgroundImage,
    getBackgroundVideo: () => backgroundVideo,
    editorBackgroundImage,
    editorBackgroundVideo,
    editorInput,
    changeDifficulty,
    getMaidata: () => maidata,
    draw: (dt) => draw(dt),
    updateSlider: (time) => updateSlider(time),
    projSet,
    t,
    simpleToast,
    getIsImagesLoaded: () => isImagesLoaded,
    onTimeUpdate: (rt, gt, lst) => {
        realTime = rt;
        globalTime = gt;
        if (lst !== undefined) lastStartTime = lst;
    }
});

appContext.register('playbackEngine', playbackEngine);
appContext.register('getIsImagesLoaded', () => isImagesLoaded);
appContext.register('getIsInitComplete', () => isInitComplete);

// 監聽播放狀態變更，自動同步按鈕 UI
eventBus.on(EVENTS.PLAYBACK_STATE_CHANGED, ({ isPlaying }) => {
    hideFloatingMenu();
    playButton.dataset.playing = isPlaying ? 'true' : 'false';
    playButton.children[0].innerText = isPlaying ? 'pause' : 'play_arrow';
});

// UI 控制按鈕綁定
playButton.addEventListener('click', () => {
    if (!isImagesLoaded) {
        simpleToast({ content: t('toast.loadingAssetsWait') || '素材載入中，請稍候...', type: 'warning' });
        return;
    }
    playbackEngine.toggle();
});
resetButton.addEventListener('click', () => playbackEngine.reset());
stopButton.addEventListener('click', () => playbackEngine.stop());

timeline.addEventListener('input', () => {
    updateVisualTime(parseFloat(timeline.value));
});
timeline.addEventListener('change', () => {
    projSet('timeControl', playbackEngine.realTime).catch(() => { });
});

// 保持既有輔助函式簽名向後相容
function updatePauseBackgroundDisplay() {
    playbackEngine.updatePauseBackgroundDisplay();
}

function updateVideoBackgroundDisplay() {
    playbackEngine.updateVideoBackgroundDisplay();
}

function requestNextFrame(callback) {
    playbackEngine.requestNextFrame(callback);
}

function cancelNextFrame() {
    playbackEngine.cancelNextFrame();
}

const slideInputDebounce = () => playbackEngine.slideInputDebounce();
const videoSeekDebounce = (time) => playbackEngine.videoSeekDebounce(time);

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
    const range = getNoteRangeAtIndex(nowIndex);
    editorInput.selectionStart = range.start;
    editorInput.selectionEnd = range.end;
    editorInput.focus();
});

function seekToTime(targetTime) {
    playbackEngine.seekToTime(targetTime);
}

function findCommaCharIndex(text, commaIndex) {
    if (!text || commaIndex <= 0) return 0;
    let count = 0;
    let i = 0;
    let inBracket = 0;
    let inParen = 0;
    let inBrace = 0;
    const len = text.length;

    while (i < len && count < commaIndex) {
        const c = text[i];
        const next = text[i + 1];

        // 1. 單行註解 ||
        if (c === '|' && next === '|') {
            i += 2;
            while (i < len && text[i] !== '\n' && text[i] !== '\r') i++;
            if (i < len && text[i] === '\r') {
                i++;
                if (i < len && text[i] === '\n') i++;
            } else if (i < len && text[i] === '\n') {
                i++;
            }
            continue;
        }

        // 2. 多行註解 |* ... *|
        if (c === '|' && next === '*') {
            i += 2;
            while (i < len) {
                if (text[i] === '*' && text[i + 1] === '|') {
                    i += 2;
                    break;
                }
                i++;
            }
            continue;
        }

        // 3. 屬性標籤 <[A-Za-z]+\*[^>]*> (例如 <SIZE*(1.5,2)>)
        if (c === '<') {
            const rest = text.slice(i);
            const propMatch = rest.match(/^<[A-Za-z]+\*[^>]*>/);
            if (propMatch) {
                i += propMatch[0].length;
                continue;
            }
        }

        // 4. 括號追蹤
        if (c === '[') inBracket++;
        else if (c === ']') inBracket = Math.max(0, inBracket - 1);
        else if (c === '(') inParen++;
        else if (c === ')') inParen = Math.max(0, inParen - 1);
        else if (c === '{') inBrace++;
        else if (c === '}') inBrace = Math.max(0, inBrace - 1);

        // 5. 頂層逗號分隔符
        if (c === ',' && inBracket === 0 && inParen === 0 && inBrace === 0) {
            count++;
        }

        i++;
    }

    return i;
}

function indexFromCursor(text, point) {
    if (!text || point <= 0) return 0;
    const limit = Math.min(point, text.length);
    let count = 0;
    let inBracket = 0;
    let inParen = 0;
    let inBrace = 0;

    for (let i = 0; i < limit;) {
        const c = text[i];
        const next = text[i + 1];

        // 1. 單行註解 ||
        if (c === '|' && next === '|') {
            i += 2;
            while (i < limit && text[i] !== '\n' && text[i] !== '\r') i++;
            if (i < limit && text[i] === '\r') {
                i++;
                if (i < limit && text[i] === '\n') i++;
            } else if (i < limit && text[i] === '\n') {
                i++;
            }
            continue;
        }

        // 2. 多行註解 |* ... *|
        if (c === '|' && next === '*') {
            i += 2;
            while (i < limit) {
                if (text[i] === '*' && text[i + 1] === '|') {
                    i += 2;
                    break;
                }
                i++;
            }
            continue;
        }

        // 3. 屬性標籤 <[A-Za-z]+\*[^>]*>
        if (c === '<') {
            const rest = text.slice(i);
            const propMatch = rest.match(/^<[A-Za-z]+\*[^>]*>/);
            if (propMatch) {
                i += propMatch[0].length;
                continue;
            }
        }

        // 4. 括號追蹤
        if (c === '[') inBracket++;
        else if (c === ']') inBracket = Math.max(0, inBracket - 1);
        else if (c === '(') inParen++;
        else if (c === ')') inParen = Math.max(0, inParen - 1);
        else if (c === '{') inBrace++;
        else if (c === '}') inBrace = Math.max(0, inBrace - 1);

        // 5. 頂層逗號分隔符
        if (c === ',' && inBracket === 0 && inParen === 0 && inBrace === 0) {
            count++;
        }

        i++;
    }

    return count;
}

getCursorNoteIndex.addEventListener('click', () => {
    const point = editorInput.selectionStart;
    const noteIdx = indexFromCursor(editorInput.value, point);
    const targetTime = dataIndexToTime[noteIdx] ?? 0;
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
if (subdivisionButton) {
    subdivisionButton.addEventListener('click', () => {
        openSubdivisionModal({
            editorInput,
            applyHighlight,
            recordEditorHistory,
            inputDebounce
        });
    });
}
if (formatDocumentButton) {
    formatDocumentButton.addEventListener('click', () => {
        handleFormatDocument(editorInput, { simpleToast, t });
    });
}

function syncPlayTimer() {
    playbackEngine.syncPlayTimer();
}

function update(timestamp) {
    playbackEngine.update(timestamp);
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
        if (!renderer._isRenderingVideo && renderer.canvas === canvas) {
            renderer.resize(canvasContainer.clientWidth, canvasContainer.clientHeight, dpr, force);
        } else if (canvas) {
            const w = Math.round(canvasContainer.clientWidth * dpr);
            const h = Math.round(canvasContainer.clientHeight * dpr);
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
        }
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
        updatePauseBackgroundDisplay,
        updateVideoBackgroundDisplay,
        onClose: () => {
            secondCtx = null;
            externalWindow = null;
            syncSecondWindowBackground = () => { };
            if (typeof draw === 'function') draw();
        }
    });
    secondCtx = secondaryWindow.secondCtx;
    externalWindow = secondaryWindow.externalWindow;
    syncSecondWindowBackground = secondaryWindow.syncBackground;
    if (playButton.dataset.playing === 'true' || keepRenderingWhilePause) {
        requestNextFrame(update);
    }
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
        draw,
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
    if (!renderer || !isImagesLoaded) return;
    frameProfiler.beginFrame();
    if (secondCtx && externalWindow) {
        syncSecondWindowBackground();
    }

    // 早期初始化：提取常用值避免重複計算
    const playing = playbackEngine.isPlaying;
    const previewVisibleFlag = previewVisible();
    const isVisualModeFlag = isVisualMode();
    const visualHeight = isVisualModeFlag
        ? (visualEditorRenderer?.getCanvasWH()?.height || 0)
        : (previewVisibleFlag ? ((previewRender?.getCanvasWH()?.width || 0) / 2) : 0);

    frameProfiler.start('1. logicGet');
    const { buckets, playCombo, playScore, visualBuckets, noteQuantity, nowIndex: nowIndexRender } = simaiLogicControler.get({
        renderer,
        globalTime,
        realTime,
        musicDelay,
        playing,
        timeControlSliding: playbackEngine.timeControlSliding,
        readyBeat,
        clockBpm,
        playedClock,
        settings,
        visualHeight,
        notes,
        decodedTags,
        playScoreRes,
        nowIndex,
        audioManager,
    });
    frameProfiler.end('1. logicGet');

    nowIndex = nowIndexRender;

    // 渲染和更新
    frameProfiler.start('2. rendererDraw');
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
            isPlaying: playing,
        });
        drawMainCanvasOpenedInExternalWindow();
    } else if (!noRender) {
        // 正常狀態：主視窗繪製遊戲圓盤 (若正在匯出影片則跳過對錄製畫布的干擾)
        if (!renderer._isRenderingVideo) {
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
                isPlaying: playing,
            });
        }
    }
    frameProfiler.end('2. rendererDraw');

    if ((!isVisualModeFlag || editorContainer.style.display === 'none') && previewVisibleFlag) {
        frameProfiler.start('3. previewDraw');
        previewRender.drawFrame({
            globalTime,
            visualBuckets,
            audioBuffer: audioManager.bgmBuffer,
            offset: musicDelay,
            indexTime: (lastStartTime ?? 0) - musicDelay,
            cursorIndexTime: cursorLastIndexTime,
        });
        frameProfiler.end('3. previewDraw');
    }

    audioManager.update(globalTime);
    if (!isVisualModeFlag || editorContainer.style.display === 'none') {
        frameProfiler.endFrame();
        return;
    }
    frameProfiler.start('4. visualRender');
    visualEditorRenderer?.render(isVisualModeFlag, ensureVisualEditorContext, {
        globalTime,
        visualBuckets,
        audioBuffer: audioManager.bgmBuffer,
        offset: musicDelay,
    });
    frameProfiler.end('4. visualRender');
    frameProfiler.endFrame();
}

// ============================================================
// 專案管理核心函數
// ============================================================

/**
 * 載入當前 currentProjectId 的專案資料到編輯器
 * @param {function} [step] - 進度回呼 (progress, message)
 * @param {number|null} [expectedGen] - 預期的載入世代 (用於避免切換專案競爭)
 */
async function loadProjectData(step, expectedGen = null) {
    const myGen = expectedGen !== null ? expectedGen : loadGeneration;
    const s = step || (() => { });
    s(84, t('popup.init.loadingProjectData'));

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

    if (myGen !== loadGeneration) return;

    restoreTimebase(tb1, tb2);

    readyBeat = savedReadyBeat === true || savedReadyBeat === 'true';
    readyBeatCheckbox.checked = readyBeat;

    const targetRealTime = (savedTimeControl && !isNaN(savedTimeControl)) ? Number(savedTimeControl) : 0;

    if (savedDifficulty) {
        nowDifficulty = savedDifficulty;
        changeDifficulty.value = nowDifficulty;
    }

    if (savedMaiData) {
        s(88, t('popup.init.restoringContent'));
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
        cachedTimelineMax = endTime + musicDelay;
        timeline.max = cachedTimelineMax;
        globalTime = targetRealTime - musicDelay;
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
        cachedTimelineMax = 1;
        timeline.max = cachedTimelineMax;
        globalTime = 0;
    }

    revokeBlobUrls();

    if (bgVideo) {
        backgroundVideo = bgVideo;
        currentBgVideoBlobUrl = URL.createObjectURL(bgVideo);
        editorBackgroundVideo.src = currentBgVideoBlobUrl;
        editorBackgroundVideo.style.display = 'none';
    } else {
        backgroundVideo = null;
        editorBackgroundVideo.src = "";
        editorBackgroundVideo.style.display = 'none';
    }

    if (bg) {
        backgroundImage = bg;
        currentBgBlobUrl = URL.createObjectURL(bg);
        editorBackgroundImage.src = currentBgBlobUrl;
    } else {
        backgroundImage = null;
        editorBackgroundImage.src = "";
    }
    updatePauseBackgroundDisplay();
    applyMovieBrightness(settings.moviebrightness);

    if (savedBgm) {
        s(95, t('popup.init.restoringBgm'));
        audioManager.setBackgroundMusic(savedBgm).then(() => {
            if (myGen !== loadGeneration) return;
            setEndtime(endTime);
            draw();
        }).catch((err) => {
            console.warn('Failed to decode BGM:', err);
        });
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

    if (myGen !== loadGeneration) return;

    playbackEngine.setTime(targetRealTime);
    playbackEngine.resetNotesPlaybackState(playbackEngine.globalTime);
    draw();
    updateSlider(playbackEngine.realTime, true);
}

/**
 * 切換到指定專案（完整流程：停止播放 → 清除狀態 → 載入新專案）
 * @param {string} projectId
 */
async function loadProject(projectId) {
    const currentGen = ++loadGeneration;

    // 停止播放
    if (playbackEngine) {
        playbackEngine.stop();
    } else if (playButton.dataset.playing === 'true') {
        playButton.dataset.playing = 'false';
        playButton.children[0].innerText = "play_arrow";
        playStartTimestamp = null;
        audioManager.stopBGM();
    }

    // 在切換 currentProjectId 前，先 flush 舊專案未寫入的修改，並取消任何未執行的防抖
    saveMaidata.flush?.();
    inputDebounce.cancel?.();

    currentProjectId = projectId;
    localStorage.setItem('simai_lastProjectId', currentProjectId);

    // 清除狀態（傳入 skipPersist = true，避免覆蓋新選中的專案）
    setDataEmpty(true);

    // 載入專案資料與獲取專案清單平行化
    const [, list] = await Promise.all([
        loadProjectData(null, currentGen),
        projectList()
    ]);

    if (currentGen !== loadGeneration) {
        return null;
    }

    const proj = list.find(p => p.id === projectId);
    return proj;
}

/**
 * 開啟專案總管 UI
 */
const projectManagerButton = getButton("projectManager", "utility");
if (projectManagerButton) {
    projectManagerButton.addEventListener('click', () => {
        openProjectManager({
            getCurrentProjectId: () => currentProjectId,
            loadProject,
            images,
            getFileHandlerCtx: () => ({
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
                settings,
                applyMovieBrightness,
                projSet
            }),
        });
    });
}

async function _init() {
    await i18nReady;
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
        setSettings: (val) => {
            settings = val;
            appContext.settings = val;
            if (val && val.skin) currentSkin = val.skin;
            syncVisualSubMenus();
        },
        syncVisualSubMenus,
        playbackSpeedInput,
        applyAudioSettings,
        loadProjectData,
        majdataWs,
        applySplitRatio,
        snapHideCanvas,
        setDisplayModeUI,
        setVisualToolUI,
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
        visualUpdateHoldDuration,
        visualPlaceTimingTag,
        visualDeleteTag,
        visualEditTag,
        onVisualTagSelect,
        onSelectionChange: onVisualSelectionChange,
        quantizeTime,
        timebaseButton,
        setPlaybackSpeed,
        canvasOutline,
        applyMovieBrightness,
        draw,
        updateSlider,
        updateVisualTime,
        getRealTime: () => playbackEngine.realTime,
        projGet,
        setEditorCss,
        resize,
        setIsInitComplete: (val) => { isInitComplete = val; appContext.isInitComplete = val; },
        setIsImagesLoaded: (val) => { isImagesLoaded = val; appContext.isImagesLoaded = val; },
        getIsImagesLoaded: () => isImagesLoaded,
        setIsDatabaseEmpty: (val) => { isDatabaseEmpty = val; },
        getImages: () => images,
        getRenderer: () => renderer,
        getVisualEditorRenderer: () => visualEditorRenderer,
        getPreviewRender: () => previewRender,
        updateDiscordRPC,
        getMaidata: () => maidata,
        getNowDifficulty: () => nowDifficulty,
        setImages: (val) => { images = val; },
        setRenderer: (val) => { renderer = val; },
        setVisualEditorRenderer: (val) => {
            visualEditorRenderer = val;
            visualEditorRenderer?.setSelectionCallback(onVisualSelectionChange);
        },
        setPreviewRender: (val) => { previewRender = val; },
        onInitFinished: () => {
            checkAndHandleDriveOpenWith({
                loadProject
            });
            showWelcomeModal({ isDatabaseEmpty });
        }
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
window.updateVideoBackgroundDisplay = updateVideoBackgroundDisplay;
window.updatePauseBackgroundDisplay = updatePauseBackgroundDisplay;
window.applySplitRatio = applySplitRatio;
window.snapRestoreCanvas = snapRestoreCanvas;
window.setEditorCss = setEditorCss;
window.resize = resize;
window.draw = draw;
window.saveSettingsDebounce = saveSettingsDebounce;
window.getRenderer = () => renderer;
window.findCommaCharIndex = findCommaCharIndex;
window.indexFromCursor = indexFromCursor;
window.getNoteRangeAtIndex = getNoteRangeAtIndex;
window.getCharOffsetAtIndex = getCharOffsetAtIndex;

let currentSkin = settings?.skin || 'Default';
let isSwitchingSkin = false;

export async function switchSkin(newSkin) {
    if (!newSkin || (newSkin === currentSkin && !isSwitchingSkin)) return;
    if (isSwitchingSkin) return;
    isSwitchingSkin = true;
    try {
        const newImages = await loadAllImages(null, newSkin);
        images = newImages;
        currentSkin = newSkin;
        appContext.state.images = newImages;
        if (renderer) renderer.setImages(newImages);
        if (visualEditorRenderer) visualEditorRenderer.setImages(newImages);
        if (previewRender && typeof previewRender.setImages === 'function') {
            previewRender.setImages(newImages);
        }
        draw();
        simpleToast({
            content: t('skinChange.restart') || 'Skin changed successfully',
            type: 'success',
            timeout: 2000
        });
    } catch (err) {
        console.error('Failed to switch skin:', err);
        simpleToast({
            content: 'Failed to load skin: ' + err.message,
            type: 'error',
            timeout: 3000
        });
    } finally {
        isSwitchingSkin = false;
    }
}
window.switchSkin = switchSkin;

try {
    Object.defineProperty(window, 'renderer', {
        get: () => renderer,
        configurable: true
    });
} catch (e) {
    window.renderer = renderer;
}

// === 註冊核心服務到 appContext (解耦 Props Drilling) ===
appContext.register('switchSkin', switchSkin);
appContext.register('audioManager', audioManager);
appContext.register('getRenderer', () => renderer);
appContext.register('getVisualEditorRenderer', () => visualEditorRenderer);
appContext.register('getPreviewRender', () => previewRender);
appContext.register('draw', draw);
appContext.register('resize', resize);
appContext.register('saveSettingsDebounce', saveSettingsDebounce);
appContext.register('setEditorCss', setEditorCss);
appContext.register('applyMovieBrightness', applyMovieBrightness);
appContext.register('updateVideoBackgroundDisplay', updateVideoBackgroundDisplay);
appContext.register('updatePauseBackgroundDisplay', updatePauseBackgroundDisplay);
appContext.register('applySplitRatio', applySplitRatio);
appContext.register('snapRestoreCanvas', snapRestoreCanvas);
appContext.register('getMaidata', () => maidata);
appContext.register('setMaidata', (val) => { maidata = val; });
appContext.register('getCurrentProjectId', () => currentProjectId);
appContext.register('setCurrentProjectId', (val) => { currentProjectId = val; });
appContext.register('projSet', projSet);
appContext.register('projGet', projGet);
appContext.register('getBackgroundImage', () => backgroundImage);
appContext.register('setBackgroundImage', (val) => { backgroundImage = val; });
appContext.register('getNowDifficulty', () => nowDifficulty);
appContext.register('setNowDifficulty', (val) => { nowDifficulty = val; });
appContext.register('images', () => images);
appContext.register('editorBackgroundImage', editorBackgroundImage);
appContext.register('changeDifficulty', changeDifficulty);
appContext.register('saveMaidata', saveMaidata);

// === 全域 EventBus 事件訂閱 (解耦副作用與跨模組直接調用) ===
eventBus.on(EVENTS.CANVAS_REDRAW, () => {
    draw();
});

eventBus.on(EVENTS.CANVAS_RESIZE, ({ force } = {}) => {
    resize(force);
});

eventBus.on(EVENTS.SETTINGS_CHANGED, ({ key, value }) => {
    // 1. 同步到 Renderers
    if (renderer && renderer.settings) {
        renderer.settings[key] = value;
    }
    if (visualEditorRenderer && visualEditorRenderer.settings) {
        visualEditorRenderer.settings[key] = value;
    }

    // 2. 音效設定即時生效
    if (key === 'globalVolume') audioManager?.setGlobalVolume(value);
    if (key === 'musicVolume') audioManager?.setBGMVolume(value);
    if (key === 'SfxVolume') audioManager?.setSFXVolume(value);
    if (key === 'sfxVolumes') audioManager?.setSFXVolumes(value);

    // 3. 背景與影片設定即時生效
    if (key === 'moviebrightness') applyMovieBrightness(value);
    if (['disableVideo', 'hideBackgroundWhenPaused', 'showCoverWhenPaused'].includes(key)) {
        updateVideoBackgroundDisplay();
    }

    // 4. 判定圈顯示開關
    if (key === 'hideOutline') {
        const canvasOutline = document.getElementById('canvasOutline');
        if (canvasOutline) canvasOutline.style.display = value ? 'none' : '';
    }

    // 5. 低解析度模式
    if (key === 'lowRes') {
        resize(true);
    }

    // 6. 需觸發畫布重繪的項目
    const redrawKeys = [
        'hideOutline',
        'showJudge', 'showCriticalPerfect', 'showBreakCriticalPerfect',
        'drawHitEffect', 'drawHanabiEffect', 'rotateStars', 'pinkStars',
        'showSensor', 'showSensorTextWhenPaused', 'slideArrowHideBySensor',
        'middleDisplay', 'speed', 'touchSpeed', 'slideSpeed'
    ];
    if (redrawKeys.includes(key)) {
        draw();
    }

    // 7. 皮膚切換
    if (key === 'skin') {
        switchSkin(value);
    }

    // 8. 禁用語法檢查
    if (key === 'disableSyntaxCheck') {
        if (value) {
            warnEl.style.visibility = 'hidden';
            warnings = [];
            warningPositions = [];
            warningPositionsConst = [];
            applyHighlight(editorInput.value);
        } else {
            getres(editorInput.value);
            applyHighlight(editorInput.value);
        }
    }
});

eventBus.on(EVENTS.SETTINGS_SAVED, () => {
    saveSettingsDebounce();
    setEditorCss();
    draw();
});

eventBus.on(EVENTS.LAYOUT_RESET, () => {
    settings.splitRatio = 0.5;
    settings.canvasSnapped = false;
    applySplitRatio(0.5);
    if (window.canvasSnapped) {
        snapRestoreCanvas();
    }
    setEditorCss();
    resize(true);
    draw();
    saveSettingsDebounce();
});
window.openWelcomeModal = () => showWelcomeModal(true);
window.openSubdivisionModal = () => openSubdivisionModal({ editorInput, applyHighlight, recordEditorHistory, inputDebounce });
window.formatDocument = () => handleFormatDocument(editorInput, { simpleToast, t });

// 全域頁面卸載/重新整理保護：立即 flush 尚未寫入 IndexedDB 的 maidata 與 settings
const flushPendingSaves = () => {
    if (typeof saveMaidata !== 'undefined' && typeof saveMaidata.flush === 'function') {
        saveMaidata.flush();
    } else if (typeof saveMaidataImmediate === 'function') {
        saveMaidataImmediate();
    }
    if (isInitComplete && settings && Object.keys(settings).length >= 5) {
        if (typeof saveSettingsDebounce !== 'undefined' && typeof saveSettingsDebounce.flush === 'function') {
            saveSettingsDebounce.flush();
        }
    }
};

window.addEventListener('beforeunload', flushPendingSaves);
window.addEventListener('pagehide', flushPendingSaves);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        flushPendingSaves();
    }
});

_init();
