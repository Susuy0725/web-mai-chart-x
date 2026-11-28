import { createVisualNoteCallbacks, initVisualScroller, stripLeadingTags, openDivisionInputModal } from './features/visualEditor.js';
import { EditorHighlightOverlay } from './features/editorHighlightOverlay.js';
import { showFloatingMenu, hideFloatingMenu, showBoxFloatingMenu, hideBoxFloatingMenu, showTagFloatingMenu } from './features/visualFloatingMenu.js';
import { openNoteDurationModal } from './modals/noteDurationModal.js';
import { openSlideEditorModal } from './modals/slideEditorModal.js';
import { openTouchGroupModal } from './modals/touchGroupModal.js';
import { VisualSubMenu } from './features/visualSubMenu.js';
import { settingsConfig, defaultSettings } from './core/settingsConfig.js';
import { applyThemeSettings, applyThemeFromBackup, onThemeChange, DEFAULT_THEME_MODE, DEFAULT_ACCENT_COLOR } from './core/themeManager.js';
import { resolveKeybindingMatch } from './core/keybindings.js';
export { defaultSettings };
import {
    LAYOUT_DIRECTIONS,
    normalizeLayoutDirection,
    getSplitterPositionRatio,
    computeDraggedSplitRatio,
    computeEditorSlideAnimation,
    computeFloatingToolbarDock,
    computeCanvasAnimationRect,
    parseCanvasAspectRatio,
} from './core/panelLayout.js';
import { eventBus, EVENTS } from './core/eventBus.js';
import { appContext } from './core/appContext.js';
import { commandRegistry } from './core/commandRegistry.js';
import { extensionManager } from './core/extensionManager.js';
import { extensionOverrideRegistry } from './core/extensionOverrideRegistry.js';
import { loadStoredExtensions } from './core/extensionLoader.js';
import { initExtensionMenu } from './features/extensionMenu.js';
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
    formatCapsuleTime,
    clamp,
    defaultSyntaxColors,
    applySyntaxColors,
    syncDifficultySelectIndicators
} from './helper.js';
import { SimaiLogicControler } from './core/simaiLogicControler.js';
import { buildPlayScoreRes } from './core/noteScore.js';
import { SimaiRenderer, SimaiVisualEditor, SimaiPreviewRenderer } from './renderer.js';
import { simaiDecode } from './decode.js';
import { decodeWorkerManager } from './core/decodeWorkerManager.js';
import { t, setLang, getCurrentLang, applyI18nToDOM, i18nReady, onLanguageChange } from './i18n.js';
import { updateDiscordRPC } from '../rpc.js';
import { audioManager } from './audioManager.js';
import { majdataWs } from './majdataWs.js';
import { openBgmEditor, openTapBpm } from './modals/bgmEditor.js';
import { openMainoteFetcher } from './modals/mainoteFetcher.js';
import { openProjectManager } from './modals/projectManager.js';
import { checkAndHandleDriveOpenWith } from './services/driveOpenWith.js';
import { openRecordVideoModal } from './modals/recordVideoModal.js';
import { initFindReplace, openFindBar, closeFindBar } from './features/findReplace.js';
import { initEditorAutocomplete } from './features/editorAutocomplete.js';
import { toggleNoteFlag, handleToggleBkEx, applySelectedRotation, applyVerticalFlip, applyHorizontalFlip } from './features/noteModifier.js';
import { showWelcomeModal } from './modals/welcomeModal.js';
import { showLegalUpdateModal } from './modals/legalUpdateModal.js';
import { openSubdivisionModal } from './modals/subdivisionModal.js';
import { generateSmoothBpmByDuration, initSmoothBpmLauncher } from './features/smoothBpm.js';
import { openSmoothBpmModal } from './modals/smoothBpmModal.js';
import { handleFormatDocument, formatDocument, formatSimai } from './features/formatter.js';
export { toggleNoteFlag };

majdataWs.setToastHandler(simpleToast);

initServiceWorker();
disableNavigationGestures();

let
    isInitComplete = false,
    isImagesLoaded = false,
    isDatabaseEmpty = false,
    images = {},
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

try { applyThemeFromBackup(); } catch (_) { }
try { applySyntaxColors(defaultSyntaxColors); } catch (_) { }

const simaiLogicControler = new SimaiLogicControler(audioManager);
audioManager.onSoundLoaded = (key, audioBuffer) => {
    extensionOverrideRegistry.applyDefaultSoundBuffer(key, audioBuffer);
};

const isVisualMode = () => settings.displayMode === 'visual';

const BACKUP_SETTINGS_KEY = 'simai_settings_backup';

const saveSettingsDebounce = debounce(() => {
    // 效能與防覆寫保護：在初始化完成且設定已完整載入前，嚴禁回寫 IndexedDB，避免以空物件覆寫既有設定
    if (!isInitComplete || !settings || Object.keys(settings).length < 5) {
        return;
    }
    const cleanSettings = extensionOverrideRegistry.getCleanSettings(settings);
    if (majdataWs.isConnected()) {
        majdataWs.sendSetting(cleanSettings);
    }
    const settingsStr = JSON.stringify(cleanSettings);
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
const playCapsulesContainer = document.getElementById('playCapsulesContainer');
const timeDisplayCapsule = document.getElementById('timeDisplayCapsule');
const speedDisplayCapsule = document.getElementById('speedDisplayCapsule');
const speedControlButton = getButton("speed", "control");
const speedPopover = document.getElementById('speedPopover');
const speedPopoverMinus = document.getElementById('speedPopoverMinus');
const speedPopoverAdd = document.getElementById('speedPopoverAdd');
const speedPopoverReset = document.getElementById('speedPopoverReset');
const speedPopoverInput = document.getElementById('speedPopoverInput');
const playButton = getButton("play/pause", "control");
const hideButton = getButton("hide", "control");
const stopButton = getButton("stop", "control");
const resetButton = getButton("reset", "control");
const focusButton = getButton("focus", "control");
const quickGenerateButton = getButton("quickGenerate", "utility");
const hideEditorButton = getButton("hideEditor", "utility");
const hideUtilityButton = getButton("hideUtility", "utility");
const showUtilityButton = document.getElementById("showUtilityBtn");
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
const smoothBpmMenuButton = getButton("smoothBpm", "utility");
const smoothBpmBtn = document.getElementById("mpSmoothBpmBtn");
const previewContainer = document.getElementById('miniPreviewContainer');
const previewCanvas = document.getElementById('miniPreview');
const previewZoomInButton = document.getElementById('mpzoomIn');
const previewZoomOutButton = document.getElementById('mpzoomOut');
const editorContainer = document.getElementById('editorContainer');
const panelSplitter = document.getElementById('panelSplitter');
const panelSplitterToolbar = document.getElementById('panelSplitterToolbar');
const splitterDirectionBtn = document.getElementById('splitterDirectionBtn');
const splitterDragHandle = document.getElementById('splitterDragHandle');
const splitterSwapBtn = document.getElementById('splitterSwapBtn');
const editorInput = document.getElementById('editor-input');
const highlightLayer = document.getElementById('highlight-layer');
const editorHighlightCanvas = document.getElementById('editor-highlight-canvas');
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
let errors = [], errorPositions = [], errorItems = [];
let warnings = [], warningPositions = [], warningPositionsConst = [], warningItems = [];
let decodedTags = [];
let cachedChartSnapshot = null;
let playScoreRes = buildPlayScoreRes();

let lastCanvasSize = { w: 0, h: 0 };
let lastVisualEditorSize = { w: 0, h: 0 };

function getWorkspaceRect() {
    const appEl = document.getElementById('app');
    const topUtilityEl = document.getElementById('topUtilityBtns');
    const playEl = document.getElementById('playControls');
    const appRect = appEl
        ? appEl.getBoundingClientRect()
        : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

    const isExpanded = canvasContainer?.classList.contains('expanded') || panelSplitter?.classList.contains('expanded');
    let top = 0;
    if (!isExpanded) {
        const measuredUtilityH = topUtilityEl ? topUtilityEl.getBoundingClientRect().height : 0;
        if (measuredUtilityH > 0) {
            top = measuredUtilityH;
        } else {
            const cssUtilityH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--utility-height'));
            top = Number.isFinite(cssUtilityH) && cssUtilityH > 0 ? cssUtilityH : 40;
        }
    }
    const isPlayHidden = hideButton?.dataset.hidden === 'true';
    const playH = isPlayHidden ? 0 : (playEl ? playEl.getBoundingClientRect().height : 150);
    const height = Math.max(1, appRect.height - top - playH);
    return {
        left: 0,
        top,
        width: Math.max(1, appRect.width),
        height,
        appLeft: appRect.left,
        appTop: appRect.top,
    };
}

function applyPanelSwapState() {
    const direction = normalizeLayoutDirection(settings.layoutDirection);
    const isVertical = direction === LAYOUT_DIRECTIONS.VERTICAL;
    const swapped = Boolean(settings.panelSwapped);

    document.body.classList.toggle('layout-vertical', isVertical);
    document.body.classList.toggle('panels-swapped', swapped);

    if (panelSplitter) {
        panelSplitter.classList.toggle('orientation-vertical', isVertical);
        panelSplitter.classList.toggle('orientation-horizontal', !isVertical);
    }
    if (splitterSwapBtn) {
        const swapIcon = splitterSwapBtn.querySelector('.splitter-swap-icon');
        if (swapIcon) {
            swapIcon.textContent = isVertical ? 'swap_vert' : 'swap_horiz';
        }
    }
}

function updateSplitterToolbarDock() {
    if (!panelSplitter || !panelSplitterToolbar) return;
    const direction = normalizeLayoutDirection(settings.layoutDirection);
    const isVertical = direction === LAYOUT_DIRECTIONS.VERTICAL;
    const swapped = Boolean(settings.panelSwapped);
    const ws = getWorkspaceRect();
    const viewportSizePx = isVertical ? ws.height : ws.width;
    if (!viewportSizePx) return;

    const splitterCenterPx = canvasSnapped
        ? (swapped ? viewportSizePx - 5 : 5)
        : getSplitterPositionRatio({ splitRatio: settings.splitRatio ?? 0.5, swapped }) * viewportSizePx;

    const toolbarCrossSizePx = isVertical
        ? (panelSplitterToolbar.offsetHeight || 48)
        : (panelSplitterToolbar.offsetWidth || 48);

    const { dockedSide, offsetPx } = computeFloatingToolbarDock({
        splitterCenterPx,
        viewportSizePx,
        toolbarCrossSizePx,
        edgePadding: 0,
    });

    panelSplitter.style.setProperty('--toolbar-dock-offset', `${offsetPx}px`);
    panelSplitterToolbar.classList.toggle('docked-start', dockedSide === 'start');
    panelSplitterToolbar.classList.toggle('docked-end', dockedSide === 'end');
}

function applySnappedEditorLayout() {
    const isVertical = normalizeLayoutDirection(settings.layoutDirection) === LAYOUT_DIRECTIONS.VERTICAL;
    const swapped = Boolean(settings.panelSwapped);

    if (isVertical) {
        editorContainer.style.left = '';
        editorContainer.style.width = '';
        editorContainer.style.marginLeft = '';
        editorContainer.style.marginRight = '';
        editorContainer.style.top = 'var(--workspace-top)';
        editorContainer.style.height = 'calc(var(--workspace-height) - 10px)';
        editorContainer.style.marginTop = swapped ? '0' : '10px';
        editorContainer.style.marginBottom = swapped ? '10px' : '0';
    } else {
        editorContainer.style.top = '';
        editorContainer.style.height = '';
        editorContainer.style.marginTop = '';
        editorContainer.style.marginBottom = '';
        editorContainer.style.left = '0';
        editorContainer.style.width = 'calc(100% - 10px)';
        editorContainer.style.marginLeft = swapped ? '0' : '10px';
        editorContainer.style.marginRight = swapped ? '10px' : '0';
    }
}

function clearSnappedEditorLayout() {
    editorContainer.style.left = '';
    editorContainer.style.width = '';
    editorContainer.style.marginLeft = '';
    editorContainer.style.marginRight = '';
    editorContainer.style.top = '';
    editorContainer.style.height = '';
    editorContainer.style.marginTop = '';
    editorContainer.style.marginBottom = '';
}

function applyCanvasContainerAspectRatio() {
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
    const ws = getWorkspaceRect();
    const editorHidden = document.body.classList.contains('editor-hidden');
    const rect = computeCanvasAnimationRect({
        direction: normalizeLayoutDirection(settings.layoutDirection),
        swapped: Boolean(settings.panelSwapped),
        visible: !editorHidden,
        splitRatio: settings.splitRatio ?? 0.5,
        workspaceRect: ws,
        aspectRatio: ratioVal,
    });
    canvasContainer.classList.add('aspect-ratio-constrained');
    canvasContainer.style.left = rect.left;
    canvasContainer.style.top = rect.top;
    canvasContainer.style.width = rect.width;
    canvasContainer.style.height = rect.height;
}

function applySplitRatio(ratio) {
    applyPanelSwapState();
    document.documentElement.style.setProperty('--split-ratio', ratio);
    applyCanvasContainerAspectRatio();
    updateSplitterToolbarDock();
}

let canvasSnapped = false, noRender = false;

function snapHideCanvas() {
    canvasSnapped = true;
    noRender = true;
    canvasContainer.style.display = 'none';
    applyPanelSwapState();
    applySnappedEditorLayout();
    if (panelSplitter) {
        panelSplitter.style.display = 'block';
        panelSplitter.classList.add('snapped');
    }
    updateSplitterToolbarDock();
    resize(true);
    settings.canvasSnapped = true;
    saveSettingsDebounce();
}

function snapRestoreCanvas() {
    canvasSnapped = false;
    noRender = false;
    canvasContainer.style.display = '';
    clearSnappedEditorLayout();
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
        const i18nKey = isFullscreen ? 'menu.exitFullscreen' : 'menu.fullscreen';
        const labelText = t(i18nKey);
        fullscreenButton.setAttribute('data-i18n-title', i18nKey);
        fullscreenButton.setAttribute('data-i18n-aria-label', i18nKey);
        fullscreenButton.title = labelText;
        fullscreenButton.setAttribute('aria-label', labelText);
        emitViewModeChanged();
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
    let hasDraggedDistance = false;
    let dragStartCoord = 0;
    let dragStartRatio = 0.5;
    let dragStartTarget = null;
    let lastHandleTapTime = 0;
    let pendingRatio = null;
    let resizeRafId = null;

    if (splitterDirectionBtn) {
        splitterDirectionBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });
        splitterDirectionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVertical = normalizeLayoutDirection(settings.layoutDirection) === LAYOUT_DIRECTIONS.VERTICAL;
            settings.layoutDirection = isVertical ? LAYOUT_DIRECTIONS.HORIZONTAL : LAYOUT_DIRECTIONS.VERTICAL;
            applyPanelSwapState();
            if (canvasSnapped) {
                applySnappedEditorLayout();
            }
            updateSplitterToolbarDock();
            saveSettingsDebounce();
            resize(true);
        });
    }

    if (splitterSwapBtn) {
        splitterSwapBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
        });
        splitterSwapBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settings.panelSwapped = !settings.panelSwapped;
            applyPanelSwapState();
            if (canvasSnapped) {
                applySnappedEditorLayout();
            }
            updateSplitterToolbarDock();
            saveSettingsDebounce();
            resize(true);
        });
    }

    panelSplitter.addEventListener('pointerenter', (e) => {
        if (document.body.classList.contains('editor-pointer-active') || (e.buttons !== 0 && !isDraggingSplitter)) {
            return;
        }
        updateSplitterToolbarDock();
    });

    panelSplitter.addEventListener('pointerleave', () => {
        panelSplitter.classList.remove('suppress-toolbar');
    });

    panelSplitter.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        panelSplitter.classList.remove('suppress-toolbar');
        const isVertical = normalizeLayoutDirection(settings.layoutDirection) === LAYOUT_DIRECTIONS.VERTICAL;
        isDraggingSplitter = true;
        hasDraggedDistance = false;
        dragStartTarget = e.target;
        dragStartCoord = isVertical ? e.clientY : e.clientX;

        if (canvasSnapped) {
            // 從 snap 狀態開始拖動：先還原 canvas，從 0 開始計算 ratio
            snapRestoreCanvas();
            dragStartRatio = 0;
        } else {
            dragStartRatio = settings.splitRatio ?? 0.5;
            applyCanvasContainerAspectRatio();
        }

        document.body.classList.add('resizing-panels');
        panelSplitter.classList.add('dragging');
        panelSplitter.setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    panelSplitter.addEventListener('pointermove', (e) => {
        if (!isDraggingSplitter) return;
        const isVertical = normalizeLayoutDirection(settings.layoutDirection) === LAYOUT_DIRECTIONS.VERTICAL;
        const ws = getWorkspaceRect();
        const containerSizePx = isVertical ? ws.height : ws.width;
        if (containerSizePx <= 0) return;

        const currentCoord = isVertical ? e.clientY : e.clientX;
        const deltaPx = currentCoord - dragStartCoord;
        if (Math.abs(deltaPx) >= 4) {
            hasDraggedDistance = true;
        }

        pendingRatio = computeDraggedSplitRatio({
            dragStartRatio,
            deltaPx,
            containerSizePx,
            swapped: Boolean(settings.panelSwapped),
        });

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

        // 未拖曳僅點擊分割線時：手把雙擊置中，單擊切換浮動工具列顯示狀態
        if (!hasDraggedDistance && e.type === 'pointerup') {
            const clickedHandle = Boolean(dragStartTarget?.closest?.('#splitterDragHandle'));
            if (clickedHandle) {
                const now = performance.now();
                if (now - lastHandleTapTime < 350) {
                    lastHandleTapTime = 0;
                    if (canvasSnapped) {
                        snapRestoreCanvas();
                    }
                    settings.splitRatio = 0.5;
                    applySplitRatio(0.5);
                    saveSettingsDebounce();
                    resize(true);
                    dragStartTarget = null;
                    return;
                }
                lastHandleTapTime = now;
            } else {
                lastHandleTapTime = 0;
            }
            updateSplitterToolbarDock();
            panelSplitter.classList.toggle('toolbar-active');
        }
        dragStartTarget = null;
    };

    panelSplitter.addEventListener('pointerup', stopDraggingSplitter);
    panelSplitter.addEventListener('pointercancel', stopDraggingSplitter);

    document.addEventListener('pointerdown', (e) => {
        if (!panelSplitter.contains(e.target)) {
            panelSplitter.classList.remove('toolbar-active');
        }
        if (e.target === editorInput || editorContainer?.contains?.(e.target)) {
            document.body.classList.add('editor-pointer-active');
        }
    });

    const clearEditorPointerActive = (e) => {
        if (!document.body.classList.contains('editor-pointer-active')) return;
        document.body.classList.remove('editor-pointer-active');
        if (e && typeof e.clientX === 'number' && typeof e.clientY === 'number') {
            const rect = panelSplitter.getBoundingClientRect();
            if (
                e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom
            ) {
                panelSplitter.classList.add('suppress-toolbar');
            }
        }
    };

    window.addEventListener('pointerup', clearEditorPointerActive);
    window.addEventListener('pointercancel', clearEditorPointerActive);
    window.addEventListener('blur', () => {
        document.body.classList.remove('editor-pointer-active');
        panelSplitter.classList.remove('suppress-toolbar');
    });

    window.addEventListener('resize', () => {
        updateSplitterToolbarDock();
    });
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
        touch: { render: () => `<img id="currentNoteIcon" src="./Skin/Shared/TouchSkins/touch.png" alt="${t('visualToolbar.currentNote')}" class="current-note-img" style="width: 20px; height: 20px; object-fit: contain;">` },
        touchhold: { render: () => `<img id="currentNoteIcon" src="./Skin/Shared/TouchHoldSkins/touchhold_1.png" alt="${t('visualToolbar.currentNote')}" class="current-note-img" style="width: 20px; height: 20px; object-fit: contain;">` }
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

// 最底端展開/收納按鈕 (通用控制所有 .visual-tool-group 群組，支援按住固定)
let isVisualToolPinned = false;
let collapseHoldTimer = null;
let isHoldTriggered = false;
let holdPointerStartX = 0;
let holdPointerStartY = 0;
const HOLD_DURATION = 500; // 按住 500ms 觸發固定

function updateVisualCollapseBtnTooltip() {
    if (!visualToolCollapseBtn) return;
    if (isVisualToolPinned) {
        visualToolCollapseBtn.setAttribute('data-i18n-title', 'visualToolbar.unpinToolbar');
        visualToolCollapseBtn.setAttribute('data-i18n-aria-label', 'visualToolbar.unpinToolbar');
        const text = t('visualToolbar.unpinToolbar');
        visualToolCollapseBtn.title = text;
        visualToolCollapseBtn.setAttribute('aria-label', text);
    } else if (visualToolCollapseBtn.classList.contains('collapsed')) {
        visualToolCollapseBtn.setAttribute('data-i18n-title', 'visualToolbar.expandToolbar');
        visualToolCollapseBtn.setAttribute('data-i18n-aria-label', 'visualToolbar.expandToolbar');
        const text = t('visualToolbar.expandToolbar');
        visualToolCollapseBtn.title = text;
        visualToolCollapseBtn.setAttribute('aria-label', text);
    } else {
        visualToolCollapseBtn.setAttribute('data-i18n-title', 'visualToolbar.collapseToolbar');
        visualToolCollapseBtn.setAttribute('data-i18n-aria-label', 'visualToolbar.collapseToolbar');
        const text = t('visualToolbar.collapseToolbar');
        visualToolCollapseBtn.title = text;
        visualToolCollapseBtn.setAttribute('aria-label', text);
    }
}

function setVisualToolPinned(pinned) {
    isVisualToolPinned = pinned;
    if (visualToolCollapseBtn) {
        visualToolCollapseBtn.classList.toggle('pinned', pinned);
        const icon = visualToolCollapseBtn.querySelector('.material-symbols-outlined');
        if (pinned) {
            visualToolCollapseBtn.style.setProperty('background', '#ffffff', 'important');
            visualToolCollapseBtn.style.setProperty('color', '#000000', 'important');
            if (icon) {
                icon.style.setProperty('color', '#000000', 'important');
            }
        } else {
            visualToolCollapseBtn.style.removeProperty('background');
            visualToolCollapseBtn.style.removeProperty('color');
            if (icon) {
                icon.style.removeProperty('color');
            }
        }
        updateVisualCollapseBtnTooltip();
    }
}

function setVisualToolCollapsed(isCollapsed) {
    if (!visualToolCollapseBtn) return;
    if (isCollapsed) {
        setVisualToolPinned(false);
    }
    visualToolCollapseBtn.classList.toggle('collapsed', isCollapsed);
    document.querySelectorAll('.visual-tool-group').forEach(group => {
        group.classList.toggle('collapsed', isCollapsed);
    });
    if (isCollapsed) {
        VisualSubMenu.closeAll();
    }
    updateVisualCollapseBtnTooltip();
}

function clearCollapseHoldTimer() {
    if (collapseHoldTimer) {
        clearTimeout(collapseHoldTimer);
        collapseHoldTimer = null;
    }
}

if (visualToolCollapseBtn) {
    // 防止右鍵選單干擾長按
    visualToolCollapseBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    visualToolCollapseBtn.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        clearCollapseHoldTimer();
        isHoldTriggered = false;
        holdPointerStartX = e.clientX;
        holdPointerStartY = e.clientY;

        collapseHoldTimer = setTimeout(() => {
            isHoldTriggered = true;
            if (visualToolCollapseBtn.classList.contains('collapsed')) {
                setVisualToolCollapsed(false);
            }
            setVisualToolPinned(true);
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(40);
            }
        }, HOLD_DURATION);
    });

    visualToolCollapseBtn.addEventListener('pointermove', (e) => {
        if (!collapseHoldTimer) return;
        const dx = e.clientX - holdPointerStartX;
        const dy = e.clientY - holdPointerStartY;
        if (Math.hypot(dx, dy) > 10) {
            clearCollapseHoldTimer();
        }
    });

    const cancelHold = () => {
        clearCollapseHoldTimer();
    };

    visualToolCollapseBtn.addEventListener('pointerup', cancelHold);
    visualToolCollapseBtn.addEventListener('pointercancel', cancelHold);
    visualToolCollapseBtn.addEventListener('pointerleave', cancelHold);

    visualToolCollapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearCollapseHoldTimer();

        // 若剛觸發長按固定，放開時忽略 click 事件
        if (isHoldTriggered) {
            isHoldTriggered = false;
            return;
        }

        // 若處於固定狀態，再輕點一下解除固定並收起面板
        if (isVisualToolPinned) {
            setVisualToolPinned(false);
            setVisualToolCollapsed(true);
            return;
        }

        // 一般點擊切換展開/收納
        const willCollapse = !visualToolCollapseBtn.classList.contains('collapsed');
        setVisualToolCollapsed(willCollapse);
    });

    // 鍵盤無障礙支援 (Enter / 空白鍵)
    visualToolCollapseBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isVisualToolPinned) {
                setVisualToolPinned(false);
                setVisualToolCollapsed(true);
            } else {
                const willCollapse = !visualToolCollapseBtn.classList.contains('collapsed');
                setVisualToolCollapsed(willCollapse);
            }
        }
    });

    // 點擊到工具欄外的地方時把工具欄收起來 (固定狀態時不收起)
    document.addEventListener('pointerdown', (e) => {
        if (!visualToolBarEl || visualToolBarEl.style.display === 'none') return;
        if (visualToolCollapseBtn.classList.contains('collapsed')) return;
        if (isVisualToolPinned) return;

        // 若點擊目標在 visualToolBarEl 之內，不收合
        if (visualToolBarEl.contains(e.target)) return;

        // 若點擊目標為彈窗或上下文選單相關元素，避免誤關閉
        if (e.target.closest && (e.target.closest('.wmc-floating-note-menu') || e.target.closest('.wmc-box-floating-menu') || e.target.closest('.popup-container') || e.target.closest('.popup-window'))) {
            return;
        }

        setVisualToolCollapsed(true);
    }, true);

    // 監聽語言切換
    onLanguageChange(() => {
        updateVisualCollapseBtnTooltip();
    });
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

function switchVisualTool(mode, persist = true) {
    settings.visualToolMode = mode;
    setVisualToolUI(mode);
    if (visualToolModeSelect) visualToolModeSelect.value = mode;
    if (visualEditorRenderer && typeof visualEditorRenderer.setEditMode === 'function') {
        visualEditorRenderer.setEditMode(mode);
    }
    if (persist) {
        saveSettingsDebounce();
        draw();
    }
}

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
let cachedTimelineWidth = 300;
let lastSliderRatio = -1;
let lastSliderValue = -1;
let lastSliderUpdateTime = 0;

const updateCachedTimelineWidth = () => {
    if (timeline && timeline.style.display !== 'none') {
        cachedTimelineWidth = timeline.clientWidth || 300;
    }
};
window.addEventListener('resize', updateCachedTimelineWidth, { passive: true });

const setEndtime = (e) => {
    endTime = Math.max(e + 1, audioManager.getBGMDuration() + 1);
    cachedTimelineMax = endTime + musicDelay;
    timeline.max = cachedTimelineMax;
    updateCachedTimelineWidth();
    updateSlider(realTime, true);
};

let lastTimeCapsuleText = '';

/**
 * 更新播放控制器上方懸浮時間膠囊文字，僅於內容變化時寫入 DOM。
 * @param {number} time
 */
let lastTimeCapsuleUpdateTime = 0;
const updateTimeCapsule = (time, force = false) => {
    if (!timeDisplayCapsule || settings.timeDisplayCapsule === false) return;
    const now = performance.now();
    if (!force && now - lastTimeCapsuleUpdateTime < 33) return;
    lastTimeCapsuleUpdateTime = now;
    const clampedCurrent = Math.max(cachedTimelineMin, Math.min(cachedTimelineMax, Number(time) || 0));
    const text = `${formatCapsuleTime(clampedCurrent)} / ${formatCapsuleTime(cachedTimelineMax)}`;
    if (text !== lastTimeCapsuleText) {
        lastTimeCapsuleText = text;
        timeDisplayCapsule.textContent = text;
    }
};

/**
 * 更新播放控制器上方懸浮倍率膠囊文字。
 * @param {number} speed
 */
let lastSpeedCapsuleText = '';
const updateSpeedCapsule = (speed) => {
    if (!speedDisplayCapsule) return;
    const numericSpeed = Number(speed);
    const validSpeed = Number.isFinite(numericSpeed) && numericSpeed > 0 ? numericSpeed : 1;
    const text = `${validSpeed.toFixed(2)}x`;
    if (text !== lastSpeedCapsuleText) {
        lastSpeedCapsuleText = text;
        speedDisplayCapsule.textContent = text;
    }
    speedDisplayCapsule.classList.toggle('is-modified', text !== '1.00x');
};

let isTimelineDragging = false;

const syncTimelineProgress = (time) => {
    if (!timeline) return;
    const min = Number(timeline.min) || 0;
    const max = Number(timeline.max) || cachedTimelineMax;
    const ratio = Math.max(0, Math.min(1, max > min ? (time - min) / (max - min) : 0));
    const thumbWidth = 16;
    const stopPos = `calc(${thumbWidth * 0.5}px + ${ratio} * (100% - ${thumbWidth}px))`;
    timeline.style.setProperty('--timeline-progress', stopPos);
    return ratio;
};

const updateSlider = (time, force = false) => {
    updateTimeCapsule(time, force);
    if (!timeline || timeline.style.display === 'none') {
        return;
    }
    const now = performance.now();
    if (!force) {
        if (now - lastSliderUpdateTime < 33) {
            return;
        }
        if (Math.abs(time - lastSliderValue) < 0.02) {
            return;
        }
    }
    lastSliderUpdateTime = now;
    lastSliderValue = time;
    const min = cachedTimelineMin;
    const max = cachedTimelineMax;
    const ratio = Math.max(0, Math.min(1, max > min ? (time - min) / (max - min) : 0));

    // 使用快取寬度，避免在修改 DOM 後立即讀取 clientWidth 引發強制同步重排 (Forced Layout)
    const roundedRatio = Math.round(ratio * cachedTimelineWidth);
    if (force || roundedRatio !== lastSliderRatio) {
        lastSliderRatio = roundedRatio;
        if (!isTimelineDragging) {
            timeline.value = time;
        }
        syncTimelineProgress(isTimelineDragging ? parseFloat(timeline.value) : time);
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
        audioManager,
        settings,
        getMusicDelay: () => musicDelay,
        setMusicDelay: (val) => { musicDelay = val; },
        getClockBpm: () => clockBpm,
        getTimebase: () => ({
            tb1: Number(timebaseButton?.querySelector('input[name="tb1"]')?.value) || 4,
            tb2: Number(timebaseButton?.querySelector('input[name="tb2"]')?.value) || 4
        }),
        getDecodedTags: () => decodedTags,
        getDataIndexToTime: () => dataIndexToTime,
        findCommaCharIndex: (...args) => findCommaCharIndex(...args),
        updateEditorAndSave: (content) => updateEditorAndSave(content),
        offsetInput,
        offsetInputDebounce,
        editorInput,
        applyHighlight,
        inputDebounce,
        setEditorCss,
        draw,
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
    cachedChartSnapshot = null;
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
    updateDifficultyIndicators();
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
        setMaidata: (val) => {
            maidata = val;
            updateDifficultyIndicators();
        },
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
    cachedChartSnapshot = null;
    renderer?.clearJudgeEffects();
    renderer?.clearHitEffects();

    setEndtime(result.endTime);
    clockBpm = result.bpm;

    dataIndexToTime = result.indexToTime || [];

    playScoreRes = buildPlayScoreRes(result.notesCounts);
    rawData = splitSimaiPreservingAll(simaiDataValue);
    updateRawCharOffsets();
    lastCursorIndex = -1;

    // 預先計算二分搜尋結構與前綴和，確保播放無冷啟動延遲
    simaiLogicControler.prepare(notes, playScoreRes);

    const syntaxCheckEnabled = settings.enableSyntaxCheck !== false;
    errors = syntaxCheckEnabled ? (result.errors || []) : [];
    errorPositions = syntaxCheckEnabled ? (result.errorPositions || []) : [];
    errorItems = syntaxCheckEnabled ? (result.errorItems || []) : [];
    warnings = syntaxCheckEnabled ? (result.warnings || []) : [];
    warningPositions = syntaxCheckEnabled ? (result.warningPositions || result.errpositions || []) : [];
    warningPositionsConst = warningPositions;
    warningItems = syntaxCheckEnabled ? (result.warningItems || []) : [];

    updateDiagnosticBadge(errors.length, warnings.length);
    /*if (syntaxCheckEnabled) {
        if (errors.length > 0) console.error('Decode dangerous:', errors);
        if (warnings.length > 0) console.warn('Decode warnings:', warnings);
    }*/
    draw();
    // 立即以 Worker/同步解析出的最新 errorPositions / warningPositions 重新繪製編輯器紅/橘底線
    applyHighlight(editorInput.value, true);
    eventBus.emit(EVENTS.CHART_DECODED, {
        difficulty: nowDifficulty,
        noteCount: Array.isArray(notes) ? notes.length : 0
    });
}

function updateDiagnosticBadge(errCount, warnCount) {
    if (!warnEl) return;
    const errGroup = warnEl.querySelector('.errGroup');
    const warnGroup = warnEl.querySelector('.warnGroup');
    const errCountEl = warnEl.querySelector('.errCount');
    const warnCountEl = warnEl.querySelector('.warnCount');

    if (errGroup && errCountEl) {
        errGroup.style.display = errCount > 0 ? 'inline-flex' : 'none';
        errCountEl.textContent = errCount;
    }
    if (warnGroup && warnCountEl) {
        warnGroup.style.display = warnCount > 0 ? 'inline-flex' : 'none';
        warnCountEl.textContent = warnCount;
    }

    warnEl.classList.toggle('has-error', errCount > 0);
    warnEl.style.visibility = (errCount > 0 || warnCount > 0) ? 'visible' : 'hidden';
}

function escapeDiagHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDiagnosticItem(item, fallbackText) {
    if (!item || !item.code) return fallbackText || '';
    const params = { ...(item.params || {}) };
    if (item.reasonCode) {
        params.reason = t(item.reasonCode, item.reasonParams || {});
    }
    return t(item.code, params);
}

/**
 * 譜面解析進入點：支援 Web Worker 背景非同步解析與主線程同步降級
 */
const getres = async (simaiDataValue, options = {}) => {
    renderer?.clearJudgeEffects();
    renderer?.clearHitEffects();

    const decodeOpts = { enableSyntaxCheck: settings.enableSyntaxCheck !== false, ...options };

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
    const buildDiagnosticRows = (items, fallbackList, posList, level, emptyKey) => {
        const len = Math.max(items.length, fallbackList.length);
        if (len === 0) {
            return `<div class="diagnostic-empty">${escapeDiagHtml(t(emptyKey))}</div>`;
        }
        const rows = [];
        for (let i = 0; i < len; i++) {
            const item = items[i];
            const errpos = item?.errpos !== undefined ? item.errpos : posList[i];
            const text = escapeDiagHtml(formatDiagnosticItem(item, fallbackList[i]));
            const cls = level === 'error' ? 'warning-item is-error' : 'warning-item is-warning';
            if (errpos !== undefined && errpos !== null) {
                rows.push(`<div class="${cls} is-clickable" data-errpos="${errpos}">• ${text}</div>`);
            } else {
                rows.push(`<div class="${cls}">• ${text}</div>`);
            }
        }
        return rows.join('');
    };

    const defaultTab = errors.length > 0 ? 'error' : 'warning';
    const errorsTabLabel = escapeDiagHtml(t('popup.warning.errorsTab', { count: errors.length }));
    const warningsTabLabel = escapeDiagHtml(t('popup.warning.warningsTab', { count: warnings.length }));
    const errorRowsHTML = buildDiagnosticRows(errorItems, errors, errorPositions, 'error', 'popup.warning.emptyErrors');
    const warningRowsHTML = buildDiagnosticRows(warningItems, warnings, warningPositionsConst, 'warning', 'popup.warning.emptyWarnings');

    const contentHTML =
        `<div class="diagnostic-popup">` +
        `<div class="pm-tab-bar diagnostic-tabs" role="tablist">` +
        `<button type="button" class="pm-tab-btn diagnostic-tab is-error${defaultTab === 'error' ? ' pm-tab-btn--active' : ''}" data-tab="error" role="tab" aria-selected="${defaultTab === 'error'}">` +
        `<span class="material-symbols-outlined errIcon" translate="no">dangerous</span>` +
        `<span>${errorsTabLabel}</span>` +
        `</button>` +
        `<button type="button" class="pm-tab-btn diagnostic-tab is-warning${defaultTab === 'warning' ? ' pm-tab-btn--active' : ''}" data-tab="warning" role="tab" aria-selected="${defaultTab === 'warning'}">` +
        `<span class="material-symbols-outlined warnIcon" translate="no">warning</span>` +
        `<span>${warningsTabLabel}</span>` +
        `</button>` +
        `</div>` +
        `<div class="diagnostic-tab-panels">` +
        `<div class="diagnostic-panel${defaultTab === 'error' ? ' active' : ''}" data-panel="error" role="tabpanel">${errorRowsHTML}</div>` +
        `<div class="diagnostic-panel${defaultTab === 'warning' ? ' active' : ''}" data-panel="warning" role="tabpanel">${warningRowsHTML}</div>` +
        `</div>` +
        `</div>`;

    const popupCtx = popupWindow({
        title: t('popup.warning.title'),
        content: contentHTML,
        width: 380,
    });

    popupCtx.elements.content.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.diagnostic-tab');
        if (tabBtn) {
            const targetTab = tabBtn.dataset.tab;
            const root = popupCtx.elements.content;
            root.querySelectorAll('.diagnostic-tab').forEach(btn => {
                const isActive = btn.dataset.tab === targetTab;
                btn.classList.toggle('pm-tab-btn--active', isActive);
                btn.setAttribute('aria-selected', String(isActive));
            });
            root.querySelectorAll('.diagnostic-panel').forEach(panel => {
                panel.classList.toggle('active', panel.dataset.panel === targetTab);
            });
            return;
        }

        const item = e.target.closest('.warning-item.is-clickable');
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
    cachedChartSnapshot = null;
    eventBus.emit(EVENTS.MAIDATA_CHANGED, { ...maidata });

    return projSet('maidata', maidata).catch((error) => {
        console.error("儲存maidata到IndexedDB失敗:", error);
    });
}

const saveMaidata = debounce(() => {
    saveMaidataImmediate();
}, 500);

const inputDebounce = (() => {
    let timer = null;
    const runInputUpdate = () => {
        // 記錄歷史 (diff)
        recordEditorHistory();
        const value = editorInput.value;
        // 解析 Note 邏輯
        getres(value);
        applyHighlight(value);
        maidata["inote_" + nowDifficulty] = value;
        updateDifficultyIndicators();
        saveMaidata();
    };

    const debounced = () => {
        if (timer) clearTimeout(timer);
        const parsedDelay = Number(settings.inputDebounceTime);
        const delay = Number.isFinite(parsedDelay) ? Math.max(0, parsedDelay) : 800;
        timer = setTimeout(() => {
            timer = null;
            runInputUpdate();
        }, delay);
    };

    debounced.cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    debounced.flush = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
            runInputUpdate();
        }
    };

    return debounced;
})();

function setElementDisplay(element, visible, value = 'block') {
    element.style.display = visible ? value : 'none';
}

let currentCanvasAnimation = null;
let currentCanvasSyncRafId = null;

function stopCanvasSyncResize() {
    if (currentCanvasSyncRafId !== null) {
        cancelAnimationFrame(currentCanvasSyncRafId);
        currentCanvasSyncRafId = null;
    }
}

function animateCanvasWidth(visible, prevCanvasRect = null, wasCanvasHidden = false) {
    stopCanvasSyncResize();
    if (currentCanvasAnimation) {
        currentCanvasAnimation.cancel();
        currentCanvasAnimation = null;
    }

    if (!isInitComplete) {
        applyCanvasContainerAspectRatio();
        resize(true);
        return;
    }

    const direction = normalizeLayoutDirection(settings.layoutDirection);
    const swapped = Boolean(settings.panelSwapped);
    const targetRatio = settings.splitRatio ?? 0.5;
    const effectiveRatio = (visible && canvasSnapped) ? 0 : targetRatio;
    const aspectRatio = settings?.canvasAspectRatio || 'auto';
    const ws = getWorkspaceRect();

    const startFrame = (!wasCanvasHidden && prevCanvasRect && prevCanvasRect.width > 0 && prevCanvasRect.height > 0)
        ? {
            left: `${prevCanvasRect.left - ws.appLeft}px`,
            top: `${prevCanvasRect.top - ws.appTop}px`,
            width: `${prevCanvasRect.width}px`,
            height: `${prevCanvasRect.height}px`,
        }
        : computeCanvasAnimationRect({
            direction,
            swapped,
            visible: true,
            splitRatio: 0,
            workspaceRect: ws,
            aspectRatio,
        });

    const endFrame = computeCanvasAnimationRect({
        direction,
        swapped,
        visible,
        splitRatio: effectiveRatio,
        workspaceRect: ws,
        aspectRatio,
    });

    const canvasAnimation = canvasContainer.animate(
        [startFrame, endFrame],
        { duration: 400, fill: 'forwards', easing: 'ease' }
    );
    currentCanvasAnimation = canvasAnimation;

    let animationRunning = true;
    const throttledResize = throttle(() => resize(false), 16); // 限制每 16ms 最多调用一次（约 60fps）

    const stopSync = () => {
        animationRunning = false;
        stopCanvasSyncResize();
    };

    function syncResize() {
        if (!animationRunning || currentCanvasAnimation !== canvasAnimation) return;
        throttledResize();
        if (animationRunning && currentCanvasAnimation === canvasAnimation) {
            currentCanvasSyncRafId = requestAnimationFrame(syncResize);
        }
    }

    canvasAnimation.oncancel = () => {
        stopSync();
        if (currentCanvasAnimation === canvasAnimation) {
            currentCanvasAnimation = null;
        }
    };

    canvasAnimation.onfinish = () => {
        stopSync();
        if (currentCanvasAnimation === canvasAnimation) {
            currentCanvasAnimation = null;
        }
        canvasAnimation.cancel();
        applyCanvasContainerAspectRatio();
        if (visible && canvasSnapped) {
            noRender = true;
            canvasContainer.style.display = 'none';
        }
        resize(true);
    };

    syncResize();
}
let currentEditorAnimation = null;
let currentSplitterAnimation = null;

function animateEditorContainer(visible) {
    if (!editorContainer) return;

    let interruptedEditorTransform = null;
    if (currentEditorAnimation) {
        const computed = window.getComputedStyle(editorContainer).transform;
        if (computed && computed !== 'none') {
            interruptedEditorTransform = computed;
        }
        currentEditorAnimation.cancel();
        currentEditorAnimation = null;
    }

    let interruptedSplitterTransform = null;
    if (currentSplitterAnimation) {
        if (panelSplitter) {
            const computedS = window.getComputedStyle(panelSplitter).transform;
            if (computedS && computedS !== 'none') {
                interruptedSplitterTransform = computedS;
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

    setElementDisplay(editorContainer, true);
    if (panelSplitter) {
        setElementDisplay(panelSplitter, true);
    }

    const direction = normalizeLayoutDirection(settings.layoutDirection);
    const isVertical = direction === LAYOUT_DIRECTIONS.VERTICAL;
    const ws = getWorkspaceRect();
    const effectiveRatio = canvasSnapped ? 0 : (settings.splitRatio ?? 0.5);
    const fallbackSize = (isVertical ? ws.height : ws.width) * (1 - effectiveRatio);
    const editorSizePx = (isVertical ? editorContainer.offsetHeight : editorContainer.offsetWidth) || fallbackSize;

    const slideAnim = computeEditorSlideAnimation({
        direction,
        swapped: Boolean(settings.panelSwapped),
        visible,
        editorSizePx,
    });

    const editorStart = interruptedEditorTransform ?? slideAnim.editorStart;
    const splitterStart = interruptedSplitterTransform ?? slideAnim.splitterStart;
    const editorEnd = slideAnim.editorEnd;
    const splitterEnd = slideAnim.splitterEnd;

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

function setPlaybackSpeed(speed) {
    typeof speed === 'string' && (speed = parseFloat(speed));
    speed = clamp(speed, 0.01, 4); // 限制速度在 0.01x 到 4x 之間
    const playing = playButton.dataset.playing === 'true';

    settings.playbackSpeed = speed;
    if (speedPopoverInput && document.activeElement !== speedPopoverInput) {
        speedPopoverInput.value = `${speed.toFixed(2)}x`;
    }
    updateSpeedCapsule(speed);

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
        editorHighlightOverlay.render();
        _highlightSyncPending = false;
    });
}

const setEditorCss = (visible = null) => {
    // 同步捲動永遠執行（透過 rAF 批次處理，避免頻繁 layout thrash）
    syncHighlightLayerScroll();

    timeline.style.display = settings.globalTimeline ? 'block' : 'none';
    if (playCapsulesContainer) {
        const pos = settings.timeDisplayCapsulePosition;
        playCapsulesContainer.dataset.position = (pos === 'left' || pos === 'right') ? pos : 'center';
        const showCapsule = hideButton.dataset.hidden !== 'true' && settings.timeDisplayCapsule !== false;
        playCapsulesContainer.style.display = showCapsule ? '' : 'none';
        if (showCapsule) {
            updateTimeCapsule(playbackEngine?.realTime ?? realTime);
            updateSpeedCapsule(settings.playbackSpeed);
        }
    }
    if (visible === null) {
        if (hideButton.dataset.hidden !== 'true') {
            const shouldHidePreview = isVisualMode() || settings.showMiniPreview === false;
            const prevDisplay = previewContainer.style.display;
            const targetDisplay = shouldHidePreview ? 'none' : 'block';
            const rootComputed = window.getComputedStyle(document.documentElement);
            const targetHeight = shouldHidePreview
                ? rootComputed.getPropertyValue('--const-collapsed-playControls-height')
                : rootComputed.getPropertyValue('--const-max-playControls-height');
            previewContainer.style.display = targetDisplay;
            document.documentElement.style.setProperty('--playControls-height', targetHeight);
            if (prevDisplay !== targetDisplay) {
                resize();
            }
        }
        return;
    }

    const visualMode = isVisualMode();
    const editorVisible = visible && !visualMode;
    const visualVisible = visible && visualMode;
    const isHidden = hideButton.dataset.hidden === 'true';

    // 必須在修改 body class、canvas display 與 playControls 高度前擷取畫布目前幾何尺寸，供動畫 startFrame 使用
    const wasCanvasHidden = canvasContainer.style.display === 'none';
    const prevCanvasRect = !wasCanvasHidden ? canvasContainer.getBoundingClientRect() : null;

    if (visible) {
        setElementDisplay(editorInput, editorVisible);
        setElementDisplay(highlightLayer, editorVisible);
        setElementDisplay(editorHighlightCanvas, editorVisible);
        setElementDisplay(visualEditor, visualVisible);
        if (editorVisible) {
            editorHighlightOverlay.invalidateLayout();
            editorHighlightOverlay.render();
        }
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
            applySnappedEditorLayout();
            setElementDisplay(panelSplitter, true);
            if (panelSplitter) panelSplitter.classList.add('snapped');
            if (!isInitComplete) {
                noRender = true;
                canvasContainer.style.display = 'none';
            } else {
                // 動畫期間保持畫布可見以便平滑收合，動畫結束後再隱藏
                noRender = false;
                canvasContainer.style.display = '';
            }
        } else {
            noRender = false;
            canvasContainer.style.display = '';
            clearSnappedEditorLayout();
            setElementDisplay(panelSplitter, true);
            if (panelSplitter) panelSplitter.classList.remove('snapped');
        }
    }

    updatePlaycontrol(visualVisible, !isHidden);

    animateCanvasWidth(visible, prevCanvasRect, wasCanvasHidden);
    animateEditorContainer(visible);
};

settingsButton.addEventListener('click', () => {
    openSettingsModal();
});

chartInfoButton.addEventListener('click', () => {
    openChartInfoModal();
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
                isPlaying: Boolean(playing),
            });
        }
    }
    updateUnfocusedSelectionHighlight();
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
    updateDifficultyIndicators();

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
    updateDifficultyIndicators();
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
    setMaidata: (val) => {
        maidata = val;
        updateDifficultyIndicators();
    },
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

    if (currentlyHidden) {
        delete editorContainer.dataset.hidden;
    } else {
        editorContainer.dataset.hidden = 'true';
    }
    setEditorCss(currentlyHidden);
    emitViewModeChanged();
    console.log(`編輯器已${currentlyHidden ? '顯示' : '隱藏'}`);
});

const difficultyInputDebounce = debounce(() => {
    const difficulty = changeDifficulty.value;
    projSet('now_difficulty', difficulty).then(() => {
        console.log("已儲存難度到 IndexedDB:", difficulty);
    }).catch((error) => {
        console.error("儲存難度到 IndexedDB 失敗:", error);
    });
}, 500);

function updateDifficultyIndicators() {
    syncDifficultySelectIndicators(changeDifficulty, maidata, nowDifficulty, editorInput?.value);
}

changeDifficulty.addEventListener('pointerdown', updateDifficultyIndicators);
changeDifficulty.addEventListener('focus', updateDifficultyIndicators);

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
    editorAutocomplete?.close(false);

    // 載入新難度的歷史（若有）並同步 lastEditorValue
    loadHistoryForDifficulty(nowDifficulty);

    inputDebounce();
    difficultyInputDebounce();
    updateDifficultyIndicators();
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
        const isHidden = utilityContainerEl?.classList.contains('expanded');

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

function toggleTopUtilityBar(forceExpand = null) {
    const utilityBtns = topUtilityBtnsEl;
    const utilityContainer = utilityContainerEl;
    if (!utilityBtns || !utilityContainer) return;

    const isHidden = utilityContainer.classList.contains('expanded');
    const shouldExpand = forceExpand !== null ? Boolean(forceExpand) : isHidden;

    if (shouldExpand) {
        if (showUtilityButton) showUtilityButton.style.display = 'none';
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
            if (showUtilityButton && utilityContainer.classList.contains('expanded')) {
                showUtilityButton.style.display = 'flex';
            }
        };

        canvasContainer.classList.add('expanded');
        editorContainer.classList.add('expanded');
        panelSplitter?.classList.add('expanded');
        utilityContainer.classList.add('expanded');
    }

    resize();
}

hideUtilityButton?.addEventListener('click', () => toggleTopUtilityBar(false));
showUtilityButton?.addEventListener('click', () => toggleTopUtilityBar(true));

const utilityDropdowns = document.querySelectorAll('.utilityDropdown');
const DROPDOWN_VIEWPORT_MARGIN = 8;

function getDropdownViewportSize() {
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.visualViewport
        ? Math.min(window.innerHeight, window.visualViewport.height)
        : (document.documentElement.clientHeight || window.innerHeight);
    return { vw, vh };
}

function getSubmenuElement(menuTitle) {
    if (!menuTitle) return null;
    if (!menuTitle._submenu) {
        menuTitle._submenu = menuTitle.querySelector('.utilitySubmenu');
    }
    return menuTitle._submenu;
}

function closeSubmenu(menuTitle) {
    if (!menuTitle) return;
    if (menuTitle._hoverCloseTimer) {
        clearTimeout(menuTitle._hoverCloseTimer);
        menuTitle._hoverCloseTimer = null;
    }
    menuTitle.classList.remove('open');
    delete menuTitle.dataset.hoverOpen;
    const submenu = getSubmenuElement(menuTitle);
    if (submenu) {
        // 保留在 utilityContainerEl 中，避免搬移 DOM 中斷關閉動畫
        submenu.classList.remove('open');
    }
}

function closeSubmenusInContent(content, exceptMenuTitle = null) {
    if (!content) return;
    content.querySelectorAll('.utilityMenuTitle').forEach((m) => {
        if (m !== exceptMenuTitle) {
            closeSubmenu(m);
        }
    });
}

function ensureScrollIndicators(container) {
    if (!container) return null;
    let topInd = container._scrollTopIndicator;
    let bottomInd = container._scrollBottomIndicator;
    if (!topInd || !topInd.isConnected || topInd.parentElement !== container) {
        topInd = container.querySelector(':scope > .utility-scroll-indicator-top');
        if (!topInd) {
            topInd = document.createElement('div');
            topInd.className = 'utility-scroll-indicator utility-scroll-indicator-top';
            topInd.setAttribute('aria-hidden', 'true');
            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined';
            icon.setAttribute('translate', 'no');
            icon.textContent = 'keyboard_arrow_up';
            topInd.appendChild(icon);
            topInd.addEventListener('click', (event) => {
                event.stopPropagation();
                container.scrollBy({ top: -96, behavior: 'smooth' });
            });
            container.prepend(topInd);
        }
        container._scrollTopIndicator = topInd;
    }
    if (!bottomInd || !bottomInd.isConnected || bottomInd.parentElement !== container) {
        bottomInd = container.querySelector(':scope > .utility-scroll-indicator-bottom');
        if (!bottomInd) {
            bottomInd = document.createElement('div');
            bottomInd.className = 'utility-scroll-indicator utility-scroll-indicator-bottom';
            bottomInd.setAttribute('aria-hidden', 'true');
            const icon = document.createElement('span');
            icon.className = 'material-symbols-outlined';
            icon.setAttribute('translate', 'no');
            icon.textContent = 'keyboard_arrow_down';
            bottomInd.appendChild(icon);
            bottomInd.addEventListener('click', (event) => {
                event.stopPropagation();
                container.scrollBy({ top: 96, behavior: 'smooth' });
            });
            container.append(bottomInd);
        }
        container._scrollBottomIndicator = bottomInd;
    }
    return { topInd, bottomInd };
}

function updateScrollIndicatorState(container) {
    if (!container || !container.classList.contains('is-scrollable')) {
        container?.classList.remove('can-scroll-up', 'can-scroll-down');
        return;
    }
    const canUp = container.scrollTop > 2;
    const canDown = container.scrollTop + container.clientHeight < container.scrollHeight - 2;
    container.classList.toggle('can-scroll-up', canUp);
    container.classList.toggle('can-scroll-down', canDown);
}

function syncScrollableState(container) {
    if (!container) return;
    if (container.id === 'extensionsDropdownContent' || getComputedStyle(container).overflowY === 'hidden') {
        container.classList.remove('is-scrollable', 'can-scroll-up', 'can-scroll-down');
        container._scrollTopIndicator?.remove();
        container._scrollTopIndicator = null;
        container._scrollBottomIndicator?.remove();
        container._scrollBottomIndicator = null;
        return;
    }
    ensureScrollIndicators(container);
    container.classList.remove('is-scrollable', 'can-scroll-up', 'can-scroll-down');
    const needsScroll = container.scrollHeight > container.clientHeight + 1;
    if (needsScroll) {
        container.classList.add('is-scrollable');
        updateScrollIndicatorState(container);
    }
}

function positionSubmenu(menuTitle) {
    const submenu = getSubmenuElement(menuTitle);
    if (!menuTitle || !submenu) return;

    const { vw, vh } = getDropdownViewportSize();
    const isPortrait = window.matchMedia('(max-aspect-ratio: 1/1)').matches;
    const titleRect = menuTitle.getBoundingClientRect();

    const submenuWidth = submenu.offsetWidth || 155;
    let top = isPortrait ? titleRect.bottom : titleRect.top;
    let left = isPortrait ? titleRect.left : titleRect.right;

    if (!isPortrait) {
        if (left + submenuWidth > vw - DROPDOWN_VIEWPORT_MARGIN) {
            const leftSide = titleRect.left - submenuWidth;
            if (leftSide >= DROPDOWN_VIEWPORT_MARGIN) {
                left = leftSide;
            } else {
                left = Math.max(DROPDOWN_VIEWPORT_MARGIN, vw - submenuWidth - DROPDOWN_VIEWPORT_MARGIN);
            }
        }
    } else if (left + submenuWidth > vw - DROPDOWN_VIEWPORT_MARGIN) {
        left = Math.max(DROPDOWN_VIEWPORT_MARGIN, vw - submenuWidth - DROPDOWN_VIEWPORT_MARGIN);
    }

    const minVisibleHeight = Math.min(120, vh - DROPDOWN_VIEWPORT_MARGIN * 2);
    if (top + minVisibleHeight > vh - DROPDOWN_VIEWPORT_MARGIN) {
        top = Math.max(DROPDOWN_VIEWPORT_MARGIN, vh - minVisibleHeight - DROPDOWN_VIEWPORT_MARGIN);
    }

    const maxAvailableHeight = Math.max(80, vh - top - DROPDOWN_VIEWPORT_MARGIN);
    submenu.style.top = `${top}px`;
    submenu.style.left = `${left}px`;
    submenu.style.maxHeight = `${maxAvailableHeight}px`;
    syncScrollableState(submenu);
}

function ensureSubmenuListeners(menuTitle, submenu) {
    if (!submenu || submenu._listenersBound) return;
    submenu._listenersBound = true;

    submenu.addEventListener('click', (event) => {
        if (!event.target.closest('.utilityButton')) {
            event.stopPropagation();
        }
    });

    submenu.addEventListener('scroll', () => {
        updateScrollIndicatorState(submenu);
    }, { passive: true });

    submenu.addEventListener('mouseenter', () => {
        if (menuTitle._hoverCloseTimer) {
            clearTimeout(menuTitle._hoverCloseTimer);
            menuTitle._hoverCloseTimer = null;
        }
    });

    submenu.addEventListener('mouseleave', () => {
        const isPortrait = window.matchMedia('(max-aspect-ratio: 1/1)').matches;
        if (isPortrait || !window.matchMedia('(hover: hover)').matches) return;
        if (menuTitle._hoverCloseTimer) clearTimeout(menuTitle._hoverCloseTimer);
        menuTitle._hoverCloseTimer = setTimeout(() => {
            closeSubmenu(menuTitle);
        }, 100);
    });
}

function openSubmenu(menuTitle, content, byHover = false) {
    const submenu = getSubmenuElement(menuTitle);
    if (!menuTitle || !submenu) return;
    if (menuTitle._hoverCloseTimer) {
        clearTimeout(menuTitle._hoverCloseTimer);
        menuTitle._hoverCloseTimer = null;
    }

    closeSubmenusInContent(content, menuTitle);
    ensureSubmenuListeners(menuTitle, submenu);

    if (byHover && !menuTitle.classList.contains('open')) {
        menuTitle.dataset.hoverOpen = 'true';
    }
    menuTitle.classList.add('open');
    if (utilityContainerEl && submenu.parentElement !== utilityContainerEl) {
        utilityContainerEl.appendChild(submenu);
        // 剛搬移進 portal 容器時需強制重排，確保初始隱藏樣式生效後再觸發過渡動畫
        void submenu.offsetWidth;
    }
    positionSubmenu(menuTitle);
    submenu.classList.add('open');
}

function closeAllDropdowns() {
    utilityDropdowns.forEach((d) => {
        d.classList.remove('open');
        const content = d._dropdownContent || d.querySelector('.utilityDropdown-content');
        if (content) {
            closeSubmenusInContent(content);
            // 保留在 utilityContainerEl 中，避免搬回工具列導致關閉過渡動畫被強制中斷或裁切
            content.classList.remove('open');
        }
    });
}

function positionDropdownContent(dropdown) {
    const btn = dropdown.querySelector('.utilityDropdown-btn');
    const content = dropdown._dropdownContent || dropdown.querySelector('.utilityDropdown-content');
    if (!btn || !content) return;

    const { vw, vh } = getDropdownViewportSize();
    const btnRect = btn.getBoundingClientRect();
    const top = btnRect.bottom;
    content.style.top = `${top}px`;

    let left = btnRect.left;
    const contentWidth = content.offsetWidth || 120;
    if (left + contentWidth > vw - DROPDOWN_VIEWPORT_MARGIN) {
        left = Math.max(DROPDOWN_VIEWPORT_MARGIN, vw - contentWidth - DROPDOWN_VIEWPORT_MARGIN);
    }
    content.style.left = `${left}px`;

    const maxAvailableHeight = Math.max(80, vh - top - DROPDOWN_VIEWPORT_MARGIN);
    content.style.maxHeight = `${maxAvailableHeight}px`;
    if (content.id === 'extensionsDropdownContent') {
        content.style.overflowY = 'hidden';
        const extList = content.querySelector('#extensionsMenuList');
        if (extList) {
            extList.style.flex = '0 1 auto';
            extList.style.minHeight = '0';
            extList.style.overflowY = 'auto';
            extList.style.overflowX = 'hidden';
        }
    }
    syncScrollableState(content);

    content.querySelectorAll('.utilityMenuTitle.open').forEach((menuTitle) => {
        positionSubmenu(menuTitle);
    });
}

function updateOpenDropdownPositions() {
    utilityDropdowns.forEach((d) => {
        if (d.classList.contains('open')) {
            positionDropdownContent(d);
        }
    });
}

function handleUtilityBarScroll() {
    if (document.querySelector('.utilityDropdown.open')) {
        closeAllDropdowns();
    }
}

topUtilityBtnsEl?.addEventListener('scroll', handleUtilityBarScroll, { passive: true });
topUtilityBtnsEl?.querySelectorAll('.utility-row').forEach(r => r.addEventListener('scroll', handleUtilityBarScroll, { passive: true }));
window.addEventListener('resize', updateOpenDropdownPositions, { passive: true });
window.visualViewport?.addEventListener('resize', updateOpenDropdownPositions, { passive: true });

utilityDropdowns.forEach((utilityDropdown) => {
    const utilityDropdownBtn = utilityDropdown.querySelector('.utilityDropdown-btn');
    const content = utilityDropdown.querySelector('.utilityDropdown-content');
    if (!utilityDropdownBtn || !content) return;

    utilityDropdown._dropdownContent = content;

    // 初始化時即掛載到外層 utilityContainerEl（避免開關當下搬移 DOM 導致 CSS transition 失效）
    if (utilityContainerEl && content.parentElement !== utilityContainerEl) {
        utilityContainerEl.appendChild(content);
    }

    content.querySelectorAll('.utilityMenuTitle').forEach((menuTitle) => {
        const sub = getSubmenuElement(menuTitle);
        if (utilityContainerEl && sub && sub.parentElement !== utilityContainerEl) {
            utilityContainerEl.appendChild(sub);
        }
    });

    utilityDropdownBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = utilityDropdown.classList.contains('open');
        // 關閉所有其他 dropdown 及子選單
        closeAllDropdowns();
        if (!isOpen) {
            utilityDropdown.classList.add('open');
            if (utilityContainerEl && content.parentElement !== utilityContainerEl) {
                utilityContainerEl.appendChild(content);
                void content.offsetWidth;
            }
            positionDropdownContent(utilityDropdown);
            content.classList.add('open');
        }
    });

    const updateOpenSubmenus = () => {
        content.querySelectorAll('.utilityMenuTitle.open').forEach((menuTitle) => {
            positionSubmenu(menuTitle);
        });
    };

    content.addEventListener('scroll', () => {
        updateScrollIndicatorState(content);
        updateOpenSubmenus();
    }, { passive: true });

    content.querySelector('#extensionsMenuList')?.addEventListener('scroll', () => {
        updateOpenSubmenus();
    }, { passive: true });

    content.addEventListener('click', (event) => {
        if (event.target.closest('.utilitySubmenu .utilityButton')) {
            return;
        }
        const menuTitle = event.target.closest('.utilityMenuTitle');
        if (!menuTitle || !content.contains(menuTitle)) {
            if (!event.target.closest('.utilityButton')) {
                event.stopPropagation();
            }
            return;
        }
        event.stopPropagation();
        const isOpen = menuTitle.classList.contains('open');
        if (isOpen && menuTitle.dataset.hoverOpen === 'true') {
            delete menuTitle.dataset.hoverOpen;
            positionSubmenu(menuTitle);
            return;
        }
        if (isOpen) {
            closeSubmenu(menuTitle);
        } else {
            openSubmenu(menuTitle, content, false);
        }
    });

    content.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target.closest('.utilitySubmenu .utilityButton')) return;
        const menuTitle = event.target.closest('.utilityMenuTitle');
        if (!menuTitle || !content.contains(menuTitle)) return;
        event.preventDefault();
        event.stopPropagation();
        if (menuTitle.classList.contains('open')) {
            closeSubmenu(menuTitle);
        } else {
            openSubmenu(menuTitle, content, false);
        }
    });

    content.addEventListener('mouseover', (event) => {
        const isPortrait = window.matchMedia('(max-aspect-ratio: 1/1)').matches;
        if (isPortrait || !window.matchMedia('(hover: hover)').matches) return;
        const menuTitle = event.target.closest('.utilityMenuTitle');
        if (!menuTitle || !content.contains(menuTitle)) return;
        openSubmenu(menuTitle, content, true);
    });

    content.addEventListener('mouseout', (event) => {
        const isPortrait = window.matchMedia('(max-aspect-ratio: 1/1)').matches;
        if (isPortrait || !window.matchMedia('(hover: hover)').matches) return;
        const menuTitle = event.target.closest('.utilityMenuTitle');
        if (!menuTitle || !content.contains(menuTitle)) return;
        if (menuTitle.contains(event.relatedTarget)) return;
        if (menuTitle._hoverCloseTimer) clearTimeout(menuTitle._hoverCloseTimer);
        menuTitle._hoverCloseTimer = setTimeout(() => {
            closeSubmenu(menuTitle);
        }, 100);
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
editorInput.addEventListener('wheel', () => {
    cancelEditorAutoScroll();
}, { passive: true });
editorInput.addEventListener('pointerdown', () => {
    cancelEditorAutoScroll();
}, { passive: true });
editorInput.addEventListener('touchmove', () => {
    syncHighlightLayerScroll();
}, { passive: true });
editorInput.addEventListener('touchstart', () => {
    cancelEditorAutoScroll();
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
    const hasSelection = editorInput && editorInput.selectionStart !== editorInput.selectionEnd;
    if (settings.cursorFollow && !playbackEngine.isPlaying && !hasSelection) {
        const point = getCharOffsetAtIndex(nowIndex);
        editorInput.selectionStart = point;
        editorInput.selectionEnd = point;
        cursorLastIndexTime = dataIndexToTime[nowIndex] ?? 0;
    }
};

const smoothBpmLauncher = initSmoothBpmLauncher({
    smoothBpmBtn,
    getRealTime: () => playbackEngine.realTime,
    getDecodedTags: () => decodedTags,
    getClockBpm: () => clockBpm,
    getDataIndexToTime: () => dataIndexToTime,
    getAudioBuffer: () => audioManager.bgmBuffer,
    getMusicDelay: () => musicDelay,
    editorInput,
    findCommaCharIndex,
    updateEditorAndSave,
    simpleToast,
    t
});

const { visualScroller, startMomentum, stopSmoothWheel, bindScrollerEvents } = initVisualScroller({
    visualEditor,
    previewCanvas,
    getVisualEditorRenderer: () => visualEditorRenderer,
    getPreviewRender: () => previewRender,
    getRealTime: () => playbackEngine.realTime,
    updateVisualTime,
    slideInputDebounce: (...args) => slideInputDebounce(...args),
    getSettings: () => settings,
    saveSettingsDebounce: (...args) => saveSettingsDebounce(...args),
    draw,
    getPlayButton: () => playButton,
    getPlaybackEngine: () => playbackEngine
});

const pairs = { '(': ')', '{': '}', '[': ']' };
const closingChars = new Set(Object.values(pairs));

// 🔴 新增一個全域防重疊鎖
let isBracketProcessing = false;
let editorAutocomplete = null;

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
            editorAutocomplete?.refresh();

            // 🔴 釋放防護鎖
            isBracketProcessing = false;
        }, 0);

    } else if (closingChars.has(char) && start === end && value[start] === char) { // 閉括號：跳過
        e.preventDefault();
        editorInput.selectionStart = editorInput.selectionEnd = start + 1;
        editorAutocomplete?.refresh();
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
        editorAutocomplete?.refresh();
    }
});

let _highlightRafId = null;
let _pendingHighlightText = null;
let _lastRenderedHighlightText = null;
let _lastRenderedWarningKey = null;

const editorHighlightOverlay = new EditorHighlightOverlay({
    canvas: editorHighlightCanvas,
    highlightLayer,
    getDPR,
});

editorAutocomplete = initEditorAutocomplete({
    editorInput,
    editorContainer,
    highlightLayer,
    editorHighlightOverlay,
    getSettings: () => settings,
    getMaidata: () => maidata,
    isVisualMode,
    applyHighlight,
    inputDebounce,
    recordEditorHistory,
    openSettings: () => openSettingsModal({ initialTab: 'operation' }),
});
let _lastHighlightedNoteIndex = -1;
let _lastHighlightedText = null;
let _lastHighlightedEnabled = null;
let _lastAutoScrollEnabled = null;
let _editorAutoScrollRafId = null;
let _editorAutoScrollTarget = null;
let _lastUnfocusedSelKey = '';

function cancelEditorAutoScroll() {
    if (_editorAutoScrollRafId !== null) {
        cancelAnimationFrame(_editorAutoScrollRafId);
        _editorAutoScrollRafId = null;
    }
    _editorAutoScrollTarget = null;
}

function smoothScrollEditorTo(targetTop) {
    const viewH = editorInput.clientHeight;
    const maxScroll = Math.max(0, editorInput.scrollHeight - viewH);
    const clamped = Math.max(0, Math.min(maxScroll, targetTop));
    if (Math.abs(clamped - editorInput.scrollTop) < 1) return;

    _editorAutoScrollTarget = clamped;
    if (_editorAutoScrollRafId !== null) return;

    const step = () => {
        _editorAutoScrollRafId = null;
        if (_editorAutoScrollTarget === null) return;
        const cur = editorInput.scrollTop;
        const diff = _editorAutoScrollTarget - cur;
        if (Math.abs(diff) <= 1.2) {
            editorInput.scrollTop = _editorAutoScrollTarget;
            highlightLayer.scrollTop = editorInput.scrollTop;
            editorHighlightOverlay.render();
            _editorAutoScrollTarget = null;
            return;
        }
        const factor = Math.abs(diff) > editorInput.clientHeight ? 0.35 : 0.22;
        editorInput.scrollTop = cur + diff * factor;
        highlightLayer.scrollTop = editorInput.scrollTop;
        editorHighlightOverlay.render();
        _editorAutoScrollRafId = requestAnimationFrame(step);
    };
    _editorAutoScrollRafId = requestAnimationFrame(step);
}

function getTrimmedNoteRange(text, start, end) {
    let s = Math.max(0, start);
    let e = Math.min(text.length, end);
    while (s < e) {
        if (/\s/.test(text[s])) {
            s++;
        } else if (text[s] === '|' && text[s + 1] === '|') {
            s += 2;
            while (s < e && text[s] !== '\n' && text[s] !== '\r') s++;
        } else if (text[s] === '|' && text[s + 1] === '*') {
            s += 2;
            while (s < e) {
                if (text[s] === '*' && text[s + 1] === '|') {
                    s += 2;
                    break;
                }
                s++;
            }
        } else {
            break;
        }
    }
    while (e > s && /\s/.test(text[e - 1])) {
        e--;
    }
    return { start: s, end: e };
}

function clearCurrentNoteHighlight() {
    editorHighlightOverlay.clearCurrentNoteRects();
    _lastHighlightedNoteIndex = -1;
}

function updateUnfocusedSelectionHighlight(force = false) {
    const editorShown = editorContainer && editorContainer.style.display !== 'none' && !isVisualMode();
    const isEditorFocused = document.activeElement === editorInput && (typeof document.hasFocus !== 'function' || document.hasFocus());
    const selStart = editorInput?.selectionStart ?? 0;
    const selEnd = editorInput?.selectionEnd ?? 0;
    const shouldShow = Boolean(editorShown && !isEditorFocused && selStart < selEnd);

    if (!shouldShow) {
        if (_lastUnfocusedSelKey !== '') {
            editorHighlightOverlay.clearSelectionRects();
            _lastUnfocusedSelKey = '';
        }
        return;
    }

    const key = `${selStart}:${selEnd}:${editorHighlightOverlay.textIndex.length}:${editorInput.value.length}`;
    if (!force && key === _lastUnfocusedSelKey) return;
    _lastUnfocusedSelKey = key;

    const rects = editorHighlightOverlay.measureContentRects(selStart, selEnd, 1, false);
    editorHighlightOverlay.setSelectionRects(rects);
}

editorInput.addEventListener('focus', () => updateUnfocusedSelectionHighlight(true));
editorInput.addEventListener('blur', () => updateUnfocusedSelectionHighlight(true));
window.addEventListener('focus', () => updateUnfocusedSelectionHighlight(true));
window.addEventListener('blur', () => updateUnfocusedSelectionHighlight(true));

function updateCurrentNoteHighlight(force = false) {
    const highlightEnabled = settings.highlightCurrentNote !== false;
    const autoScrollEnabled = settings.editorAutoScroll !== false && Boolean(playbackEngine?.isPlaying);
    const editorShown = editorContainer && editorContainer.style.display !== 'none' && !isVisualMode();
    if ((!highlightEnabled && !autoScrollEnabled) || !editorShown || notes.length === 0 || rawData.length === 0) {
        if (_lastHighlightedEnabled !== false || _lastAutoScrollEnabled !== false || _lastHighlightedNoteIndex !== -1) {
            clearCurrentNoteHighlight();
            cancelEditorAutoScroll();
            _lastHighlightedEnabled = false;
            _lastAutoScrollEnabled = false;
        }
        return;
    }

    const text = editorInput.value;
    if (
        !force &&
        _lastHighlightedEnabled === highlightEnabled &&
        _lastAutoScrollEnabled === autoScrollEnabled &&
        nowIndex === _lastHighlightedNoteIndex &&
        text === _lastHighlightedText
    ) {
        return;
    }

    _lastHighlightedEnabled = highlightEnabled;
    _lastAutoScrollEnabled = autoScrollEnabled;
    _lastHighlightedNoteIndex = nowIndex;
    _lastHighlightedText = text;

    const rawRange = getNoteRangeAtIndex(nowIndex);
    const rangeOffsets = getTrimmedNoteRange(text, rawRange.start, rawRange.end);
    const rects = editorHighlightOverlay.measureContentRects(rangeOffsets.start, rangeOffsets.end, 2, true);

    if (highlightEnabled) {
        editorHighlightOverlay.setCurrentNoteRects(rects);
    } else {
        editorHighlightOverlay.clearCurrentNoteRects();
    }

    if (autoScrollEnabled && rects && rects.length > 0) {
        const firstRect = rects[0];
        const noteTop = firstRect.y;
        const noteBottom = noteTop + firstRect.h;
        const viewTop = _editorAutoScrollTarget !== null ? _editorAutoScrollTarget : editorInput.scrollTop;
        const viewH = editorInput.clientHeight;
        if (viewH > 0) {
            const topSafe = viewH * 0.15;
            const bottomSafe = viewH * 0.65;
            if (noteTop < viewTop + topSafe || noteBottom > viewTop + bottomSafe) {
                smoothScrollEditorTo(noteTop - viewH * 0.35);
            }
        }
    }
}

function renderHighlightNow(text) {
    const diagnosticRanges = settings.enableSyntaxCheck === false ? [] : [
        ...errorPositions.map(index => {
            const range = getNoteRangeAtIndex(index);
            return { start: range.start, end: range.end, level: 'error' };
        }),
        ...warningPositions.map(index => {
            const range = getNoteRangeAtIndex(index);
            return { start: range.start, end: range.end, level: 'warning' };
        })
    ];
    const warningKey = diagnosticRanges.map(r => `${r.level}:${r.start}:${r.end}`).join(',');

    // 若文字與錯誤/警告範圍完全未變，直接跳過 DOM 重構以杜絕不必要的 Reflow
    if (text === _lastRenderedHighlightText && warningKey === _lastRenderedWarningKey) {
        return;
    }

    _lastRenderedHighlightText = text;
    _lastRenderedWarningKey = warningKey;
    highlightLayer.innerHTML = getHighlight(text, diagnosticRanges);
    editorHighlightOverlay.invalidateText();
    updateCurrentNoteHighlight(true);
    updateUnfocusedSelectionHighlight(true);
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
    updateSlider: (time, force = false) => updateSlider(time, force),
    projSet,
    t,
    simpleToast,
    getIsImagesLoaded: () => isImagesLoaded,
    stopSmoothWheel: () => stopSmoothWheel(),
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
eventBus.on(EVENTS.PLAYBACK_STATE_CHANGED, ({ isPlaying, realTime }) => {
    hideFloatingMenu();
    playButton.dataset.playing = isPlaying ? 'true' : 'false';
    playButton.children[0].innerText = isPlaying ? 'pause' : 'play_arrow';
    updateSlider(realTime ?? playbackEngine.realTime, true);
    if (isPlaying) {
        updateCurrentNoteHighlight(true);
    } else {
        cancelEditorAutoScroll();
    }
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

timeline.addEventListener('pointerdown', () => {
    isTimelineDragging = true;
    playbackEngine.timeControlSliding = true;
    if (playbackEngine.isPlaying) {
        audioManager?.stopBGM();
    }
});
timeline.addEventListener('input', () => {
    playbackEngine.timeControlSliding = true;
    const val = parseFloat(timeline.value);
    syncTimelineProgress(val);
    updateVisualTime(val);
    slideInputDebounce();
});
timeline.addEventListener('pointerup', () => {
    isTimelineDragging = false;
    slideInputDebounce();
});
timeline.addEventListener('pointercancel', () => {
    isTimelineDragging = false;
    syncTimelineProgress(parseFloat(timeline.value));
    slideInputDebounce();
});
timeline.addEventListener('change', () => {
    isTimelineDragging = false;
    const val = parseFloat(timeline.value);
    syncTimelineProgress(val);
    slideInputDebounce();
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

const formatSpeedPopoverValue = (speed) => {
    const numericSpeed = Number(speed);
    const validSpeed = Number.isFinite(numericSpeed) && numericSpeed > 0 ? numericSpeed : 1;
    return `${validSpeed.toFixed(2)}x`;
};

const setSpeedPopoverOpen = (open) => {
    if (!speedPopover || !speedControlButton) return;
    const isOpen = Boolean(open);
    speedPopover.classList.toggle('is-open', isOpen);
    speedControlButton.classList.toggle('is-active', isOpen);
    speedControlButton.setAttribute('aria-expanded', String(isOpen));
    speedPopover.setAttribute('aria-hidden', String(!isOpen));
    if (isOpen && speedPopoverInput) {
        speedPopoverInput.value = formatSpeedPopoverValue(settings.playbackSpeed);
    }
};

if (speedControlButton && speedPopover) {
    speedControlButton.addEventListener('click', (e) => {
        e.stopPropagation();
        setSpeedPopoverOpen(!speedPopover.classList.contains('is-open'));
    });

    speedPopover.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    speedPopoverMinus?.addEventListener('click', () => {
        const sp = Math.max(0.25, (Number(settings.playbackSpeed) || 1) - 0.25);
        setPlaybackSpeed(sp);
    });

    speedPopoverAdd?.addEventListener('click', () => {
        const sp = Math.min(2.0, (Number(settings.playbackSpeed) || 1) + 0.25);
        setPlaybackSpeed(sp);
    });

    speedPopoverReset?.addEventListener('click', () => {
        setPlaybackSpeed(1);
        simpleToast({ content: t('toast.resetPlaybackSpeed'), type: 'success', timeout: 1800 });
    });

    if (speedPopoverInput) {
        speedPopoverInput.addEventListener('focus', () => {
            speedPopoverInput.select();
        });

        speedPopoverInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                speedPopoverInput.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                speedPopoverInput.value = formatSpeedPopoverValue(settings.playbackSpeed);
                speedPopoverInput.blur();
                setSpeedPopoverOpen(false);
            }
        });

        speedPopoverInput.addEventListener('change', () => {
            const raw = speedPopoverInput.value.trim().replace(/x$/i, '');
            const speed = parseFloat(raw);
            if (isNaN(speed) || speed <= 0) {
                simpleToast({ content: t('toast.invalidPlaybackSpeed'), type: 'warning', timeout: 1800 });
                speedPopoverInput.value = formatSpeedPopoverValue(settings.playbackSpeed);
                return;
            }
            setPlaybackSpeed(speed);
            speedPopoverInput.value = formatSpeedPopoverValue(settings.playbackSpeed);
            simpleToast({ content: t('toast.setPlaybackSpeed', { speed: settings.playbackSpeed }), type: 'success', timeout: 1800 });
        });
    }

    document.addEventListener('click', (e) => {
        if (!speedPopover.classList.contains('is-open')) return;
        if (!speedPopover.contains(e.target) && !speedControlButton.contains(e.target)) {
            setSpeedPopoverOpen(false);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && speedPopover.classList.contains('is-open')) {
            setSpeedPopoverOpen(false);
        }
    });
}

function updatePlaycontrol(visualVisible = false, isHidden = false) {
    const c = window.getComputedStyle(document.documentElement);
    const pc = document.querySelector('#playControlContainer');
    const mc = document.querySelector('#miniPreviewContainer');
    const d = document.documentElement.style;

    const maxPlayControlsHeight = c.getPropertyValue('--const-max-playControls-height');
    const collapsedPlayControlsHeight = c.getPropertyValue('--const-collapsed-playControls-height');
    if (!isHidden) {
        setSpeedPopoverOpen(false);
        timeline.style.display = 'none';
        mc.style.display = 'none';
        pc.style.display = 'none';
        if (playCapsulesContainer) playCapsulesContainer.style.display = 'none';
        hideButton.dataset.hidden = 'true';
        d.setProperty('--playControls-height', '0px');
        showPlayControlsBtn.style.display = 'flex';
    } else {
        showPlayControlsBtn.style.display = 'none';
        if (playCapsulesContainer) {
            const showCapsule = settings.timeDisplayCapsule !== false;
            playCapsulesContainer.style.display = showCapsule ? '' : 'none';
            if (showCapsule) {
                updateTimeCapsule(playbackEngine?.realTime ?? realTime);
                updateSpeedCapsule(settings.playbackSpeed);
            }
        }
        hideButton.dataset.hidden = 'false';
        timeline.style.display = settings.globalTimeline ? 'block' : 'none';
        mc.style.display = 'block';
        pc.style.display = 'flex';
        if (visualVisible || settings.showMiniPreview === false) {
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

/**
 * 選取指定索引音符並將編輯器捲動至對應位置（同步高亮層與誤差 fallback）。
 * @param {number} noteIdx
 */
function scrollEditorToIndex(noteIdx) {
    const range = getNoteRangeAtIndex(noteIdx);
    const text = editorInput.value;
    const trimmed = getTrimmedNoteRange(text, range.start, range.end);

    editorInput.focus({ preventScroll: true });
    editorInput.setSelectionRange(range.start, range.end);

    const viewH = editorInput.clientHeight;
    if (viewH <= 0) return;

    let noteTop = null;
    let rects = editorHighlightOverlay.measureContentRects(trimmed.start, trimmed.end, 2, true);
    if ((!rects || rects.length === 0) && text.length > 0) {
        const anchor = Math.min(Math.max(0, range.start), text.length - 1);
        rects = editorHighlightOverlay.measureContentRects(anchor, anchor + 1, 2, false);
    }

    if (rects && rects.length > 0) {
        noteTop = rects[0].y;
    } else {
        const style = getComputedStyle(editorInput);
        const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.4) || 20;
        const lineIdx = text.slice(0, range.start).split('\n').length - 1;
        noteTop = lineIdx * lineHeight;
    }

    const maxScroll = Math.max(0, editorInput.scrollHeight - viewH);
    const targetTop = Math.max(0, Math.min(maxScroll, noteTop - viewH * 0.35));
    cancelEditorAutoScroll();
    smoothScrollEditorTo(targetTop);
}

getNowNoteIndex.addEventListener('click', () => {
    scrollEditorToIndex(nowIndex);
});

focusButton.addEventListener('click', () => {
    getNowNoteIndex.click();
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
if (smoothBpmMenuButton) {
    smoothBpmMenuButton.addEventListener('click', () => {
        smoothBpmLauncher?.openModal();
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
    applyCanvasContainerAspectRatio();
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
    editorHighlightOverlay.invalidateLayout();
    editorHighlightOverlay.refreshAccentColor();
    updateCurrentNoteHighlight(true);
    updateUnfocusedSelectionHighlight(true);
    emitViewModeChanged();
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

const KEYBINDING_HANDLERS = {
    'playback.toggle': () => playButton?.click(),
    'playback.reset': () => resetButton?.click(),
    'playback.stop': () => stopButton?.click(),
    'playback.speedUp': () => {
        const sp = Math.min(2.0, (settings.playbackSpeed || 1) + 0.25);
        setPlaybackSpeed(sp);
        simpleToast({ content: t('toast.setPlaybackSpeed', { speed: sp.toFixed(2) }), type: 'success', timeout: 1800 });
    },
    'playback.speedDown': () => {
        const sp = Math.max(0.25, (settings.playbackSpeed || 1) - 0.25);
        setPlaybackSpeed(sp);
        simpleToast({ content: t('toast.setPlaybackSpeed', { speed: sp.toFixed(2) }), type: 'success', timeout: 1800 });
    },
    'playback.seekBackward': () => {
        const rawStep = Number(settings.seekStepSeconds);
        const step = (Number.isFinite(rawStep) && rawStep > 0) ? rawStep : 5;
        const cur = playbackEngine?.realTime ?? realTime ?? 0;
        updateVisualTime(cur - step);
    },
    'playback.seekForward': () => {
        const rawStep = Number(settings.seekStepSeconds);
        const step = (Number.isFinite(rawStep) && rawStep > 0) ? rawStep : 5;
        const cur = playbackEngine?.realTime ?? realTime ?? 0;
        updateVisualTime(cur + step);
    },
    'playback.jumpToCursor': () => getCursorNoteIndex?.click(),
    'playback.cursorToPlayhead': () => getNowNoteIndex?.click(),
    'edit.save': () => {
        isContextEdited = false;
        simpleToast({ content: t('toast.saved'), type: 'success', timeout: 1200 });
        maidata['inote_' + nowDifficulty] = editorInput.value;
        saveMaidata();
    },
    'edit.find': () => openFindBar(false),
    'edit.replace': () => openFindBar(true),
    'edit.undo': () => {
        if (undoStack.length > 0) {
            undoButton.click();
            if (document.activeElement === editorInput) {
                simpleToast({ content: t('toast.undoSuccess'), type: 'info', timeout: 1200 });
            }
        }
    },
    'edit.redo': () => {
        if (redoStack.length > 0) {
            redoButton.click();
            if (document.activeElement === editorInput) {
                simpleToast({ content: t('toast.redoSuccess'), type: 'info', timeout: 1200 });
            }
        }
    },
    'edit.format': () => handleFormatDocument(editorInput, { simpleToast, t }),
    'edit.toggleBk': () => handleToggleBkEx('bk', { editorInput }),
    'edit.toggleEx': () => handleToggleBkEx('ex', { editorInput }),
    'edit.rotateClockwise': () => rotateSelection(1),
    'edit.rotateCounterClockwise': () => rotateSelection(-1),
    'edit.rotate180': () => rotateSelection(4),
    'edit.flipVertical': () => flipVertical(),
    'edit.flipHorizontal': () => flipHorizontal(),
    'edit.subdivision': () => openSubdivisionModal({ editorInput, applyHighlight, recordEditorHistory, inputDebounce }),
    'edit.smoothBpm': () => smoothBpmLauncher?.openModal(),
    'visual.toolPlace': () => switchVisualTool('edit'),
    'visual.toolSelect': () => switchVisualTool('select', false),
    'visual.toolBoxSelect': () => switchVisualTool('boxSelect'),
    'visual.deleteSelected': () => {
        if (visualEditorRenderer?.selectedNotes?.size > 0) {
            const selectedList = Array.from(visualEditorRenderer.selectedNotes);
            visualDeleteNote(selectedList);
            visualEditorRenderer.clearSelection();
        }
    },
    'visual.clearSelection': () => {
        if (visualEditorRenderer && typeof visualEditorRenderer.clearSelection === 'function') {
            visualEditorRenderer.clearSelection();
        }
    },
    'view.toggleEditor': () => hideEditorButton?.click(),
    'view.toggleMode': () => {
        if (!displayModeSelect) return;
        displayModeSelect.value = isVisualMode() ? 'simai' : 'visual';
        displayModeSelect.dispatchEvent(new Event('change'));
    },
    'view.togglePlayControls': () => hideButton?.click(),
    'view.fullscreen': () => fullscreenButton?.click(),
    'view.openSettings': () => openSettingsModal(),
};

window.addEventListener('keydown', (e) => {
    if (!isInitComplete || e.isComposing || e.defaultPrevented) return;
    if (document.querySelector('[data-recording-keybinding="true"]')) return;
    if (document.querySelector('.popup-backdrop, .popup-window, .wmc-welcome-overlay, [role="dialog"], dialog[open]')) return;

    const match = resolveKeybindingMatch(e, settings.customKeybindings, {
        isVisualMode: isVisualMode(),
        editorInput
    });
    if (!match) return;

    const handler = KEYBINDING_HANDLERS[match.action.id];
    if (!handler) return;

    e.preventDefault();
    handler(e);
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
        readyBeat: !!settings.readyBeat,
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
    updateCurrentNoteHighlight();

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
            isPlaying: Boolean(playing),
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
        projGet('tb1'),
        projGet('tb2'),
    ]);

    if (myGen !== loadGeneration) return;

    restoreTimebase(tb1, tb2);

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
        updateDifficultyIndicators();

        musicDelay = parseFloat(maidata.first) || 0;
        offsetInput.value = musicDelay;
        cachedTimelineMax = endTime + musicDelay;
        timeline.max = cachedTimelineMax;
        globalTime = targetRealTime - musicDelay;
    } else {
        maidata = {};
        editorInput.value = '';
        applyHighlight('');
        updateDifficultyIndicators();
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
    if (isInitComplete) {
        setEditorCss(!hideEditor);
    }
    emitViewModeChanged();

    if (myGen !== loadGeneration) return;

    playbackEngine.setTime(targetRealTime);
    playbackEngine.resetNotesPlaybackState(playbackEngine.globalTime);
    cachedChartSnapshot = null;
    draw();
    updateSlider(playbackEngine.realTime, true);
    eventBus.emit(EVENTS.PROJECT_LOADED);
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
                setMaidata: (val) => {
                    maidata = val;
                    updateDifficultyIndicators();
                },
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
            applyThemeSettings({
                themeMode: val?.themeMode ?? DEFAULT_THEME_MODE,
                accentColor: val?.accentColor ?? DEFAULT_ACCENT_COLOR,
            });
            if (val && val.skin) currentSkin = val.skin;
            if (val && val.syntaxColors) applySyntaxColors(val.syntaxColors);
            if (speedPopoverInput && document.activeElement !== speedPopoverInput) {
                speedPopoverInput.value = formatSpeedPopoverValue(val?.playbackSpeed);
            }
            syncVisualSubMenus();
        },
        syncVisualSubMenus,
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
        setImages: (val) => {
            extensionOverrideRegistry.refreshImagesBase(val);
            images = val;
            appContext.state.images = val;
        },
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
            const welcomeShown = showWelcomeModal({ isDatabaseEmpty });
            if (!welcomeShown) {
                showLegalUpdateModal();
            }

            window.settings = settings;
            Object.defineProperty(window, 'globalTime', {
                get() {
                    return globalTime;
                },
                configurable: true
            });

            initExtensionMenu();
            eventBus.emit(EVENTS.APP_READY);
            extensionManager.activateAll();
            loadStoredExtensions().catch((err) => {
                console.error('[Extensions] 載入已安裝外掛失敗:', err);
            });
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
window.generateSmoothBpmByDuration = generateSmoothBpmByDuration;
window.openSmoothBpmModal = openSmoothBpmModal;
window.smoothBpmLauncher = smoothBpmLauncher;

let currentSkin = settings?.skin || 'Default';
let isSwitchingSkin = false;

export async function switchSkin(newSkin) {
    if (!newSkin || (newSkin === currentSkin && !isSwitchingSkin)) return;
    if (isSwitchingSkin) return;
    isSwitchingSkin = true;
    try {
        const newImages = await loadAllImages(null, newSkin);
        extensionOverrideRegistry.refreshImagesBase(newImages);
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
appContext.register('generateSmoothBpmByDuration', generateSmoothBpmByDuration);
appContext.register('smoothBpmLauncher', smoothBpmLauncher);
appContext.register('saveSettingsDebounce', saveSettingsDebounce);
appContext.register('setEditorCss', setEditorCss);
appContext.register('applyMovieBrightness', applyMovieBrightness);
appContext.register('updateVideoBackgroundDisplay', updateVideoBackgroundDisplay);
appContext.register('updatePauseBackgroundDisplay', updatePauseBackgroundDisplay);
appContext.register('applySplitRatio', applySplitRatio);
appContext.register('snapRestoreCanvas', snapRestoreCanvas);
appContext.register('getMaidata', () => maidata);
appContext.register('setMaidata', (val) => {
    maidata = val;
    cachedChartSnapshot = null;
    updateDifficultyIndicators();
});
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
appContext.register('simpleToast', simpleToast);
appContext.register('commandRegistry', commandRegistry);
appContext.register('extensionManager', extensionManager);
appContext.register('seekToTime', (targetTime) => seekToTime(targetTime));
appContext.register('getDuration', () => Number(timeline?.max) || 0);
function getCurrentViewMode() {
    const isEditorHidden = editorContainer?.dataset?.hidden === 'true';
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
    const w = document.documentElement.clientWidth || window.innerWidth || 1;
    const h = document.documentElement.clientHeight || window.innerHeight || 1;
    return {
        isEditorHidden,
        isFullscreen,
        isVerticalMode: (w / h) <= 0.587,
        showAuxiliaryText: Boolean(settings?.renderSurroundingAuxiliaryText)
    };
}

let lastViewModeKey = '';
function emitViewModeChanged(force = false) {
    const mode = getCurrentViewMode();
    const key = `${mode.isEditorHidden}|${mode.isFullscreen}|${mode.isVerticalMode}|${mode.showAuxiliaryText}`;
    if (!force && key === lastViewModeKey) return;
    lastViewModeKey = key;
    eventBus.emit(EVENTS.VIEW_MODE_CHANGED, mode);
}

appContext.register('getViewMode', () => getCurrentViewMode());
appContext.register('getChartSnapshot', () => {
    const currentDuration = Number(timeline?.max) || 0;
    if (cachedChartSnapshot &&
        cachedChartSnapshot.difficulty === nowDifficulty &&
        cachedChartSnapshot.duration === currentDuration) {
        return cachedChartSnapshot;
    }

    const frozenMaidata = Object.freeze(maidata ? { ...maidata } : {});
    const frozenNotes = Object.freeze(
        Array.isArray(notes) ? notes.map((n) => Object.freeze({ ...n })) : []
    );
    const frozenTags = Object.freeze(
        Array.isArray(decodedTags) ? decodedTags.map((tag) => Object.freeze({ ...tag })) : []
    );

    cachedChartSnapshot = Object.freeze({
        difficulty: nowDifficulty,
        maidata: frozenMaidata,
        duration: currentDuration,
        notes: frozenNotes,
        tags: frozenTags
    });
    return cachedChartSnapshot;
});
appContext.register('getEditorText', () => (editorInput ? editorInput.value : ''));
appContext.register('getEditorSelection', () => {
    if (!editorInput) return { start: 0, end: 0, text: '' };
    const start = editorInput.selectionStart ?? 0;
    const end = editorInput.selectionEnd ?? 0;
    return {
        start,
        end,
        text: editorInput.value.slice(start, end)
    };
});
appContext.register('replaceEditorSelection', (replacement, start, end) => {
    if (!editorInput) return false;
    const text = String(replacement ?? '');
    const value = editorInput.value;
    const selStart = typeof start === 'number' ? Math.max(0, Math.min(start, value.length)) : (editorInput.selectionStart ?? 0);
    const selEnd = typeof end === 'number' ? Math.max(selStart, Math.min(end, value.length)) : (editorInput.selectionEnd ?? selStart);

    editorInput.value = value.slice(0, selStart) + text + value.slice(selEnd);
    const nextCursor = selStart + text.length;
    editorInput.selectionStart = selStart;
    editorInput.selectionEnd = nextCursor;
    applyHighlight(editorInput.value);
    recordEditorHistory();
    inputDebounce();
    return true;
});
appContext.register('onEditorEvent', (eventName, handler) => {
    if (!editorInput || typeof handler !== 'function') return () => { };
    const allowed = new Set(['input', 'keydown', 'blur', 'selectionchange']);
    if (!allowed.has(eventName)) return () => { };

    const buildSnapshot = () => ({
        text: editorInput.value,
        selectionStart: editorInput.selectionStart ?? 0,
        selectionEnd: editorInput.selectionEnd ?? 0
    });

    if (eventName === 'selectionchange') {
        const onSelectionChange = () => {
            if (document.activeElement !== editorInput) return;
            handler(buildSnapshot());
        };
        document.addEventListener('selectionchange', onSelectionChange);
        return () => document.removeEventListener('selectionchange', onSelectionChange);
    }

    const listener = (e) => {
        const payload = buildSnapshot();
        if (eventName === 'keydown') {
            payload.key = e.key;
            payload.code = e.code;
            payload.ctrlKey = e.ctrlKey;
            payload.metaKey = e.metaKey;
            payload.altKey = e.altKey;
            payload.shiftKey = e.shiftKey;
            payload.isComposing = e.isComposing;
            payload.preventDefault = () => e.preventDefault();
            payload.stopPropagation = () => e.stopPropagation();
        }
        handler(payload);
    };
    editorInput.addEventListener(eventName, listener);
    return () => editorInput.removeEventListener(eventName, listener);
});

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
    if (previewRender && previewRender.settings) {
        previewRender.settings[key] = value;
    }

    // 2. 音效設定即時生效
    if (key === 'globalVolume') audioManager?.setGlobalVolume(value);
    if (key === 'musicVolume') audioManager?.setBGMVolume(value);
    if (key === 'SfxVolume') audioManager?.setSFXVolume(value);
    if (key === 'sfxVolumes') audioManager?.setSFXVolumes(value);

    // 語法高亮自訂顏色與主題 / 主色同步
    if (key === 'syntaxColors') applySyntaxColors(value);
    if (key === 'themeMode') {
        applyThemeSettings({ themeMode: value, accentColor: settings?.accentColor });
    }
    if (key === 'accentColor') {
        applyThemeSettings({ themeMode: settings?.themeMode, accentColor: value });
    }

    // 3. 背景與影片設定即時生效
    if (key === 'moviebrightness') applyMovieBrightness(value);
    if (['enableVideo', 'showBackgroundWhenPaused', 'showCoverWhenPaused'].includes(key)) {
        updateVideoBackgroundDisplay();
    }
    if (key === 'renderSurroundingAuxiliaryText') {
        emitViewModeChanged();
    }

    // 4. 判定線顯示開關
    if (key === 'showOutline') {
        const canvasOutline = document.getElementById('canvasOutline');
        if (canvasOutline) canvasOutline.style.display = value ? '' : 'none';
    }

    // 5. 低解析度模式與畫面比例
    if (key === 'lowRes' || key === 'canvasAspectRatio') {
        resize(true);
    }

    // 6. 需觸發畫布重繪與膠囊/編輯器版面同步的項目
    if (['timeDisplayCapsule', 'timeDisplayCapsulePosition', 'globalTimeline', 'showMiniPreview'].includes(key)) {
        setEditorCss();
    }
    const redrawKeys = [
        'showOutline', 'showBorder', 'showUI', 'showUIPosition',
        'showJudge', 'showCriticalPerfect', 'showBreakCriticalPerfect',
        'richHitEffect', 'drawHanabiEffect', 'richHanabi',
        'previewAudioVisualMode', 'previewWaveformColor',
        'previewSpectrogramMinFreq', 'previewSpectrogramMaxFreq', 'previewSpectrogramBrightness',
        'previewTagOpacity', 'previewBpmLineOpacity',
        'enablePreviewWaveform', 'rotateStars', 'pinkStars',
        'showSensor', 'showSensorTextWhenPaused', 'slideArrowHideBySensor',
        'middleDisplay', 'speed', 'touchSpeed', 'slideSpeed',
        'noteBaseSize', 'middleDistance'
    ];
    if (redrawKeys.includes(key)) {
        draw();
    }

    // 7. 皮膚切換
    if (key === 'skin') {
        switchSkin(value);
    }

    // 8. 啟用語法檢查與目前音符高亮 / 自動捲動
    if (key === 'highlightCurrentNote' || key === 'editorAutoScroll') {
        if (key === 'editorAutoScroll' && !value) {
            cancelEditorAutoScroll();
        }
        updateCurrentNoteHighlight(true);
    }
    if (key === 'enableSyntaxCheck') {
        if (!value) {
            errors = [];
            errorPositions = [];
            errorItems = [];
            warnings = [];
            warningPositions = [];
            warningPositionsConst = [];
            warningItems = [];
            updateDiagnosticBadge(0, 0);
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
    settings.layoutDirection = LAYOUT_DIRECTIONS.HORIZONTAL;
    settings.panelSwapped = false;
    settings.canvasSnapped = false;
    if (canvasSnapped) {
        if (editorContainer?.dataset.hidden === 'true') {
            canvasSnapped = false;
            noRender = false;
            canvasContainer.style.display = '';
            clearSnappedEditorLayout();
            if (panelSplitter) {
                panelSplitter.classList.remove('snapped');
            }
            applySplitRatio(0.5);
        } else {
            snapRestoreCanvas();
        }
    } else {
        applySplitRatio(0.5);
    }
    setEditorCss();
    resize(true);
    draw();
    saveSettingsDebounce();
});
window.openWelcomeModal = () => showWelcomeModal(true);
window.openLegalUpdateModal = () => showLegalUpdateModal(true);
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

onThemeChange(() => {
    try { applySyntaxColors(settings?.syntaxColors || defaultSyntaxColors); } catch (_) { }
    try {
        if (typeof editorHighlightOverlay !== 'undefined' && editorHighlightOverlay) {
            editorHighlightOverlay.refreshAccentColor();
            editorHighlightOverlay.render();
        }
    } catch (_) { }
});

_init();
