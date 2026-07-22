import { openDB, idbGet, idbSet, idbSetProject, idbGetProject, projectList, projectCreate, projectDelete, projectRename, projectTouch, projectUpdateName, migrateFromLegacy } from './indexDB.js';
import {
    scaleBase, getButton, debounce, throttle,
    audioManager, getHighlight, parseMaidata, popupWindow, loadAllImages,
    simpleToast, formatSize, getSimaiDataString, contantRotate, flipSelectedText,
    clamp, createLabeledInput1, createCustomSlider, videoRender
} from './helper.js';
import { SimaiRenderer, SimaiVisualEditor, SimaiPreviewRenderer } from './renderer.js';
import { simaiDecode } from './decode.js';
import { t, setLang, getCurrentLang, applyI18nToDOM } from './i18n.js';
import { updateDiscordRPC } from '../rpc.js';

// 初始化進行靜態翻譯
applyI18nToDOM();

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
            console.log('Service worker registered:', reg);

            // 監聽是否有新的 Service Worker 正在等待接管
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    // 當新版下載完成並進入 waiting 狀態時
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // 🌟 直接呼叫你之前寫的 Toast 提示系統！
                        simpleToast({
                            content: '遊戲有新版本更新！請重新整理網頁套用。',
                            type: 'info'
                        });
                    }
                });
            });

            // 強制立刻檢查更新，並捕獲可能發生的錯誤
            reg.update().catch((err) => {
                console.warn('Service worker update failed:', err);
            });
        })
        .catch((err) => {
            console.warn('Service worker registration failed:', err);
        });
}

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

_init();

if (typeof document !== 'undefined' && document.fonts) {
    Promise.all([
        document.fonts.load('10px combo'),
        document.fonts.load('10px mono')
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
const addVideoButton = getButton("addVideo", "utility");
const importFromVideoButton = getButton("importFromVideo", "utility");
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
const playbackReset = getButton("playbackSpeed", "utility");
const undoButton = getButton("undo", "utility");
const redoButton = getButton("redo", "utility");
const helpButton = getButton("help", "utility");
const fullscreenButton = getButton("fullscreen", "utility");
const findReplaceButton = getButton("findReplace", "utility");
const toggleBkButton = getButton("toggleBk", "utility");
const toggleExButton = getButton("toggleEx", "utility");
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
// 1. 切換 Break (bk) 與 EX (ex) 音符旗標邏輯
// ==========================================
export function toggleNoteFlag(inputStr, flagType) {
    if (!inputStr) return inputStr;

    const slideSymbolRegex = /(?:pp)|(?:qq)|[-<>^vpqszVw]/;

    function toggleSinglePart(part) {
        let note = part.trim();
        if (!note) return part;

        // Touch 音符不適用 (如 C, A1, E8)
        if (/^(?:[ABCDE]\d+|C)(?![a-zA-Z0-9])/.test(note)) {
            return part;
        }

        const isSlide = slideSymbolRegex.test(note);

        if (flagType === 'bk') {
            if (isSlide) {
                const hasAnyB = /b/.test(note);
                if (hasAnyB) {
                    return note.replace(/b/g, '');
                } else {
                    let res = note;
                    res = res.replace(/^(\d+)/, '$1b');
                    res = res.replace(/\*(\d+)/g, '*$1b');
                    res = res.replace(/(\[[^\]]+\])/g, '$1b');
                    return res;
                }
            } else {
                const hasB = /b/.test(note);
                if (hasB) {
                    return note.replace(/b/g, '');
                } else {
                    if (/\[[^\]]+\]/.test(note)) {
                        return note.replace(/(\[[^\]]+\])/, '$1b');
                    } else {
                        return note.replace(/^(\d+)/, '$1b');
                    }
                }
            }
        } else if (flagType === 'ex') {
            if (isSlide) {
                const hasStarX = /^\d+b?x|\*\d+b?x/.test(note);
                if (hasStarX) {
                    let res = note;
                    res = res.replace(/^(\d+b?)x/, '$1');
                    res = res.replace(/\*(\d+b?)x/g, '*$1');
                    return res;
                } else {
                    let res = note;
                    res = res.replace(/^(\d+b?)/, '$1x');
                    res = res.replace(/\*(\d+b?)/g, '*$1x');
                    return res;
                }
            } else {
                const hasX = /x/.test(note);
                if (hasX) {
                    return note.replace(/x/g, '');
                } else {
                    if (/\[[^\]]+\]/.test(note)) {
                        if (/\[[^\]]+\]b/.test(note)) {
                            return note.replace(/(\[[^\]]+\]b)/, '$1x');
                        }
                        return note.replace(/(\[[^\]]+\])/, '$1x');
                    } else {
                        if (/^\d+b/.test(note)) {
                            return note.replace(/^(\d+b)/, '$1x');
                        }
                        return note.replace(/^(\d+)/, '$1x');
                    }
                }
            }
        }

        return part;
    }

    function processCodeToken(codeToken) {
        if (!codeToken.trim()) return codeToken;
        if (/^\s*\([^\)]*\)\s*$/.test(codeToken) || /^\s*\{[^\}]*\}\s*$/.test(codeToken)) {
            return codeToken;
        }

        const parts = codeToken.split('/');
        const newParts = parts.map(part => {
            const tagMatch = part.match(/^((?:\([^\)]*\)|\{[^\}]*\}|\s+)*)(.*)$/);
            if (tagMatch && tagMatch[2]) {
                const prefixTags = tagMatch[1];
                const noteContent = tagMatch[2];
                return prefixTags + toggleSinglePart(noteContent);
            }
            return toggleSinglePart(part);
        });

        return newParts.join('/');
    }

    const tokens = inputStr.split(',');
    const newTokens = tokens.map(token => {
        if (token.includes('||')) {
            const parts = token.split('||');
            const codePart = parts[0];
            const commentPart = parts.slice(1).join('||');
            return processCodeToken(codePart) + '||' + commentPart;
        }
        return processCodeToken(token);
    });

    return newTokens.join(',');
}

function handleToggleBkEx(flagType) {
    if (!editorInput) return;
    const start = editorInput.selectionStart;
    const end = editorInput.selectionEnd;
    const val = editorInput.value;

    let newVal = '';
    let isSelection = false;

    if (start !== undefined && end !== undefined && start !== end) {
        isSelection = true;
        const selectedText = val.slice(start, end);
        const transformed = toggleNoteFlag(selectedText, flagType);
        newVal = val.slice(0, start) + transformed + val.slice(end);
    } else {
        newVal = toggleNoteFlag(val, flagType);
    }

    if (newVal !== val) {
        editorInput.value = newVal;
        editorInput.dispatchEvent(new Event('input'));

        if (isSelection) {
            editorInput.setSelectionRange(start, start + (newVal.length - val.length + (end - start)));
        }

        const toastKey = flagType === 'bk'
            ? (isSelection ? 'findReplace.toastToggleBkSelection' : 'findReplace.toastToggleBkFull')
            : (isSelection ? 'findReplace.toastToggleExSelection' : 'findReplace.toastToggleExFull');
        simpleToast({ content: t(toastKey), type: 'success', timeout: 1500 });
    }
}

if (toggleBkButton) {
    toggleBkButton.addEventListener('click', () => handleToggleBkEx('bk'));
}
if (toggleExButton) {
    toggleExButton.addEventListener('click', () => handleToggleBkEx('ex'));
}

// ==========================================
// 2. 尋找與取代 (Find & Replace) 浮動面板與導覽邏輯
// ==========================================
let findMatches = [];
let currentMatchIndex = -1;

function updateFindMatches() {
    findMatches = [];
    currentMatchIndex = -1;

    const searchText = findInput ? findInput.value : '';
    if (!searchText || !editorInput) {
        if (findMatchCount) findMatchCount.textContent = '0/0';
        return;
    }

    const text = editorInput.value;
    const searchLower = searchText.toLowerCase();
    const textLower = text.toLowerCase();
    let pos = 0;

    while ((pos = textLower.indexOf(searchLower, pos)) !== -1) {
        findMatches.push({ start: pos, end: pos + searchText.length });
        pos += Math.max(1, searchText.length);
    }

    if (findMatches.length > 0) {
        const cursor = editorInput.selectionStart || 0;
        let idx = findMatches.findIndex(m => m.start >= cursor);
        currentMatchIndex = idx !== -1 ? idx : 0;
    }

    updateFindCountUI();
}

function updateFindCountUI() {
    if (!findMatchCount) return;
    if (findMatches.length === 0) {
        findMatchCount.textContent = '0/0';
    } else {
        findMatchCount.textContent = `${currentMatchIndex + 1}/${findMatches.length}`;
    }
}

function jumpToMatch(index, autoFocusEditor = true) {
    if (findMatches.length === 0) return;
    currentMatchIndex = (index + findMatches.length) % findMatches.length;
    const m = findMatches[currentMatchIndex];

    const applyFocusAndScroll = () => {
        if (!editorInput) return;
        if (autoFocusEditor) {
            editorInput.focus();
        }
        editorInput.setSelectionRange(m.start, m.end);

        const lineCount = editorInput.value.slice(0, m.start).split('\n').length;
        const totalLines = editorInput.value.split('\n').length;
        if (totalLines > 0) {
            const scrollPct = (lineCount - 1) / totalLines;
            editorInput.scrollTop = scrollPct * editorInput.scrollHeight;
        }
    };

    applyFocusAndScroll();
    if (autoFocusEditor) {
        requestAnimationFrame(applyFocusAndScroll);
    }

    updateFindCountUI();
}

function openFindBar(showReplace = false) {
    if (!findReplaceBar) return;
    findReplaceBar.style.display = 'flex';
    if (replaceRow) {
        replaceRow.style.display = showReplace ? 'flex' : 'none';
    }

    const selStart = editorInput.selectionStart;
    const selEnd = editorInput.selectionEnd;
    if (selStart !== selEnd && (selEnd - selStart) < 100) {
        const selText = editorInput.value.slice(selStart, selEnd);
        if (selText && !selText.includes('\n')) {
            findInput.value = selText;
        }
    }

    updateFindMatches();
    findInput.focus();
    findInput.select();
}

function closeFindBar() {
    if (findReplaceBar) {
        findReplaceBar.style.display = 'none';
    }
    if (editorInput) {
        editorInput.focus();
    }
}

if (findReplaceButton) {
    findReplaceButton.addEventListener('click', () => openFindBar(true));
}

if (findInput) {
    findInput.addEventListener('input', () => {
        updateFindMatches();
        if (findMatches.length > 0) {
            jumpToMatch(0, false);
        }
    });

    findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                jumpToMatch(currentMatchIndex - 1, true);
            } else {
                jumpToMatch(currentMatchIndex + 1, true);
            }
        } else if (e.key === 'Escape') {
            closeFindBar();
        }
    });
}

if (replaceInput) {
    replaceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeFindBar();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            executeReplaceOne();
        }
    });
}

const bindNavBtn = (btn, action) => {
    if (!btn) return;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        action();
    });
};

bindNavBtn(findPrevBtn, () => jumpToMatch(currentMatchIndex - 1, true));
bindNavBtn(findNextBtn, () => jumpToMatch(currentMatchIndex + 1, true));
if (findCloseBtn) findCloseBtn.addEventListener('click', closeFindBar);

function executeReplaceOne() {
    if (findMatches.length === 0 || currentMatchIndex === -1) return;
    const m = findMatches[currentMatchIndex];
    const repText = replaceInput ? replaceInput.value : '';
    const val = editorInput.value;

    const newVal = val.slice(0, m.start) + repText + val.slice(m.end);
    editorInput.value = newVal;
    editorInput.dispatchEvent(new Event('input'));

    updateFindMatches();
    if (findMatches.length > 0) {
        jumpToMatch(currentMatchIndex % findMatches.length);
    }
}

function executeReplaceAll() {
    const searchText = findInput ? findInput.value : '';
    if (!searchText || !editorInput) return;

    const repText = replaceInput ? replaceInput.value : '';
    const val = editorInput.value;

    const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const newVal = val.replace(regex, repText);

    if (newVal !== val) {
        editorInput.value = newVal;
        editorInput.dispatchEvent(new Event('input'));
        updateFindMatches();
        simpleToast({ content: t('findReplace.replaceAll'), type: 'success', timeout: 1200 });
    }
}

if (replaceOneBtn) replaceOneBtn.addEventListener('click', executeReplaceOne);
if (replaceAllBtn) replaceAllBtn.addEventListener('click', executeReplaceAll);

// ==========================================
// 3. 尋找與取代 (Find & Replace) 面板自由拖曳移動邏輯
// ==========================================
if (findReplaceBar) {
    let isDraggingBar = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    findReplaceBar.addEventListener('pointerdown', (e) => {
        // 當點擊輸入框、按鈕時不觸發拖曳
        if (['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            return;
        }

        isDraggingBar = true;
        findReplaceBar.classList.add('dragging');
        findReplaceBar.setPointerCapture(e.pointerId);

        dragStartX = e.clientX;
        dragStartY = e.clientY;

        const rect = findReplaceBar.getBoundingClientRect();
        const containerRect = editorContainer ? editorContainer.getBoundingClientRect() : { left: 0, top: 0 };

        initialLeft = rect.left - containerRect.left;
        initialTop = rect.top - containerRect.top;

        findReplaceBar.style.left = `${initialLeft}px`;
        findReplaceBar.style.top = `${initialTop}px`;
        findReplaceBar.style.right = 'auto';

        e.preventDefault();
    });

    findReplaceBar.addEventListener('pointermove', (e) => {
        if (!isDraggingBar) return;

        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        if (editorContainer) {
            const containerW = editorContainer.clientWidth;
            const containerH = editorContainer.clientHeight;
            const barW = findReplaceBar.offsetWidth;
            const barH = findReplaceBar.offsetHeight;

            newLeft = Math.max(0, Math.min(containerW - barW, newLeft));
            newTop = Math.max(0, Math.min(containerH - barH, newTop));
        }

        findReplaceBar.style.left = `${newLeft}px`;
        findReplaceBar.style.top = `${newTop}px`;
    });

    const stopDraggingBar = (e) => {
        if (!isDraggingBar) return;
        isDraggingBar = false;
        findReplaceBar.classList.remove('dragging');
        try {
            findReplaceBar.releasePointerCapture(e.pointerId);
        } catch (err) { }
    };

    findReplaceBar.addEventListener('pointerup', stopDraggingBar);
    findReplaceBar.addEventListener('pointercancel', stopDraggingBar);
}

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
    projSet('tb1', v1).catch(console.error);
}
function restoreTimebase(t1 = 4) {
    const v1 = parseInt(t1, 10) || 4;
    timebaseButton.querySelector('input[name="tb1"]').value = v1;
}
timebaseButton.addEventListener('input', function () {
    updateTimebase();
    draw();
});

let notes = [], endTime = 1, musicDelay = 0, rawData = [], dataIndexToTime = [];

let ctx = canvas.getContext('2d');

//-----Quick panel-----

let isCtrlShiftPressed = false;

let directionOfPointer = '0'; // middle, left, right, up, down
let positionOfQuickPanel = { x: 0, y: 0 };
let positionOfPointer = { x: 0, y: 0, moved: false };
let dirBuffer = '';

// 1. 滑鼠移動事件：同時負責「更新位置」與「計算方向」
document.addEventListener('mousemove', function (event) {
    positionOfPointer.moved = true;
    positionOfPointer.x = event.clientX;
    positionOfPointer.y = event.clientY;

    // 只有當 Ctrl+Shift 被按住時，才計算相對方向
    if (isCtrlShiftPressed && quickPanel) {
        const dx = positionOfPointer.x - positionOfQuickPanel.x;
        const dy = positionOfPointer.y - positionOfQuickPanel.y;
        const distanceSq = dx * dx + dy * dy;

        let currentDirection = "";

        if (distanceSq < 900) {
            currentDirection = "middle";
        } else {
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            if (angle > -22.5 && angle <= 22.5) {
                currentDirection = "right";
            } else if (angle > 22.5 && angle <= 67.5) {
                currentDirection = "down-right";
            } else if (angle > 67.5 && angle <= 112.5) {
                currentDirection = "down";
            } else if (angle > 112.5 && angle <= 157.5) {
                currentDirection = "down-left";
            } else if (angle > 157.5 || angle <= -157.5) {
                currentDirection = "left";
            } else if (angle > -157.5 && angle <= -112.5) {
                currentDirection = "up-left";
            } else if (angle > -112.5 && angle <= -67.5) {
                currentDirection = "up";
            } else if (angle > -67.5 && angle <= -22.5) {
                currentDirection = "up-right";
            }
        }

        // 當方向改變時才更新，避免效能浪費
        if (dirBuffer !== currentDirection) {
            dirBuffer = currentDirection;
            directionOfPointer = currentDirection;
            quickPanel.setAttribute('data-active-dir', directionOfPointer);
        }
    }
});

// 2. 鍵盤按下事件：只負責啟用狀態、鎖定中心點
window.addEventListener('keydown', (e) => {
    if (!isInitComplete || !settings.enableQuickPanel || !quickPanel) return;

    // 檢查是否同時按下 Ctrl 和 Shift，且目前還沒被標記為按下
    if (e.ctrlKey && e.shiftKey && !isCtrlShiftPressed) {
        if (!positionOfPointer.moved) {
            simpleToast({
                content: t("toast.moveMouseToOpen"),
                type: "info",
            });
            return;
        }

        isCtrlShiftPressed = true;

        // 鎖定當前滑鼠位置為 QuickPanel 的中心點
        positionOfQuickPanel.x = positionOfPointer.x;
        positionOfQuickPanel.y = positionOfPointer.y;

        // 顯示並定位面板
        quickPanel.style.left = positionOfPointer.x + 'px';
        quickPanel.style.top = positionOfPointer.y + 'px';
        quickPanel.style.display = 'grid';

        // 初始化狀態為 middle
        dirBuffer = 'middle';
        directionOfPointer = 'middle';
        quickPanel.setAttribute('data-active-dir', 'middle');
    } else if (isCtrlShiftPressed && e.key !== 'Control' && e.key !== 'Shift') {
        isCtrlShiftPressed = false;
        quickPanel.style.display = 'none';
        quickPanel.removeAttribute('data-active-dir');
        directionOfPointer = 'middle';
        dirBuffer = 'middle';
    }
});

// 3. 鍵盤放開事件：精準解除狀態
window.addEventListener('keyup', (e) => {
    // 💡 改用 e.key 判斷：只要放開的是 Control 或 Shift 鍵，就關閉面板
    if ((e.key === 'Control' || e.key === 'Shift') && isCtrlShiftPressed) {
        isCtrlShiftPressed = false;
        if (directionOfPointer === 'right') {
            applySelectedRotation(1);
        } else if (directionOfPointer === 'left') {
            applySelectedRotation(-1);
        } else if (directionOfPointer === 'up') {
            applyVerticalFlip();
        } else if (directionOfPointer === 'down') {
            applyHorizontalFlip();
        } else if (directionOfPointer === 'up-left') {
            applySelectedRotation(4);
        } else if (directionOfPointer === 'up-right') {
            redoButton.click();
        } else if (directionOfPointer === 'down-left') {
            getCursorNoteIndex.click();
        } else if (directionOfPointer === 'down-right') {
            undoButton.click();
        }
        dirBuffer = ''; // 清空緩衝

        if (quickPanel) {
            quickPanel.style.display = 'none';
            quickPanel.removeAttribute('data-active-dir');
        }
    }
});

// -----
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
    rotateStars: true,
    pinkStars: false,
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
    renderSurroundingAuxiliaryText: true,
    visualZoom: 200, // 視覺模式下的縮放倍率
    splitRatio: 0.5, // 左右面板分割比例
    canvasSnapped: false, // Canvas 是否被 snap 隱藏
    slideIllegalRed: false,
    showUI: false,
    enableQuickPanel: false,
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

function applyAudioSettings(s) {
    if (!audioManager || !s) return;
    if (s.globalVolume !== undefined) audioManager.setGlobalVolume(s.globalVolume);
    if (s.musicVolume !== undefined) audioManager.setBGMVolume(s.musicVolume);
    if (s.SfxVolume !== undefined) audioManager.setSFXVolume(s.SfxVolume);
    if (s.sfxVolumes) audioManager.setSFXVolumes(s.sfxVolumes);
}

const settingsConfig = [
    {
        label: 'settings.tabs.basic',
        items: [
            { id: 'speed', type: 'number', label: 'settings.items.speed', step: 0.1, min: 1, max: 20, def: defaultSettings.speed },
            { id: 'slideSpeed', type: 'number', label: 'settings.items.slideSpeed', step: 0.1, min: -1, max: 1, def: defaultSettings.slideSpeed, },
            { id: 'touchSpeed', type: 'number', label: 'settings.items.touchSpeed', step: 0.1, min: 1, max: 20, def: defaultSettings.touchSpeed },
            { id: 'middleDisplay', type: 'dropdown', label: 'settings.items.middleDisplay', options: [{ value: 0, label: 'settings.middleDisplayOpts.off' }, { value: 1, label: 'settings.middleDisplayOpts.combo' }, { value: 2, label: 'settings.middleDisplayOpts.score' }], def: defaultSettings.middleDisplay },
            {
                id: 'moviebrightness',
                type: 'dropdown',
                label: 'settings.items.moviebrightness',
                options: [
                    { value: '0', label: 'settings.items.bright' },
                    { value: '-1', label: 'settings.items.normal' },
                    { value: '-2', label: 'settings.items.dark' },
                    { value: '-3', label: 'settings.items.veryDark' },
                ],
                def: defaultSettings.moviebrightness || 0,
                apply: (val) => {
                    if (backgroundImage) editorBackgroundImage.style.filter = `brightness(${1 + 0.1875 * val})`;
                    if (backgroundVideo) editorBackgroundVideo.style.filter = `brightness(${1 + 0.1875 * val})`;
                },
            },
            {
                id: 'pinkStars',
                type: 'checkbox',
                label: 'settings.items.pinkStars',
                def: defaultSettings.pinkStars || false
            },
            {
                id: 'lang',
                type: 'dropdown',
                label: 'settings.items.lang',
                options: [
                    { value: 'zh-TW', label: '繁體中文' },
                    { value: 'en', label: 'English' },
                    { value: 'ja', label: '日本語' },
                ],
                def: getCurrentLang(),
                get: () => getCurrentLang(),
                apply: (val) => {
                    setLang(val);
                }
            },
        ]
    },
    {
        label: 'settings.tabs.display',
        items: [
            {
                id: 'showSensor',
                type: 'checkbox',
                label: 'settings.items.showSensor',
                def: defaultSettings.showSensor
            },
            {
                id: 'showSensorTextWhenPaused',
                type: 'checkbox',
                label: 'settings.items.showSensorTextWhenPaused',
                def: defaultSettings.showSensorTextWhenPaused
            },
            {
                id: 'hideBackgroundWhenPaused',
                type: 'checkbox',
                label: 'settings.items.hideBackgroundWhenPaused',
                def: defaultSettings.hideBackgroundWhenPaused
            },
            {
                id: 'rotateStars',
                type: 'checkbox',
                label: 'settings.items.rotateStars',
                def: defaultSettings.rotateStars || false
            }
        ]
    },
    {
        label: 'settings.tabs.sfx',
        items: [
            {
                id: 'globalVolume', type: 'range', label: 'settings.items.globalVolume', min: 0, max: 1, step: 0.1, def: defaultSettings.globalVolume,
                apply: (val) => { audioManager.setGlobalVolume(val); }
            },
            {
                id: 'musicVolume', type: 'range', label: 'settings.items.musicVolume', min: 0, max: 1, step: 0.1, def: defaultSettings.musicVolume,
                apply: (val) => { audioManager.setBGMVolume(val); }
            },
            {
                id: 'SfxVolume', type: 'range', label: 'settings.items.SfxVolume', min: 0, max: 1, step: 0.1, def: defaultSettings.SfxVolume,
                apply: (val) => { audioManager.setSFXVolume(val); }
            },
            {
                id: 'sfxVolumes', type: 'object', label: 'settings.items.sfxVolumes', def: defaultSettings.sfxVolumes,
                apply: (val) => { audioManager.setSFXVolumes(val); }
            },
            {
                id: 'notPlayHoldEnd',
                type: 'checkbox',
                label: 'settings.items.notPlayHoldEnd',
                def: defaultSettings.notPlayHoldEnd
            }
        ]
    },
    {
        label: 'settings.tabs.other',
        items: [
            {
                id: 'autocomplete', type: 'checkbox', label: 'settings.items.autocomplete', def: defaultSettings.autocomplete
            },
            {
                id: 'maxSlideCount', type: 'number', label: 'settings.items.maxSlideCount', min: 1, max: 100, step: 1, def: defaultSettings.maxSlideCount
            },
            {
                id: 'inputDebounceTime', type: 'number', label: 'settings.items.inputDebounceTime', min: 0, max: 2000, step: 50, def: defaultSettings.inputDebounceTime
            },
            {
                id: 'showUI', type: 'checkbox', label: 'settings.items.showUI', def: defaultSettings.showUI
            },
            {
                id: 'autoPauseOnScroll', type: 'checkbox', label: 'settings.items.autoPauseOnScroll', def: defaultSettings.autoPauseOnScroll
            },
            {
                id: 'globalTimeline', type: 'checkbox', label: 'settings.items.globalTimeline', def: defaultSettings.globalTimeline
            },
            {
                id: 'enableQuickPanel', type: 'checkbox', label: 'settings.items.enableQuickPanel', def: defaultSettings.enableQuickPanel
            }
        ]
    }
];

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

// 上次對影片進行 seek 的時間（秒），用來避免頻繁設定 currentTime
let lastVideoSeekTime = 0;
const VIDEO_MIN_SEEK_INTERVAL = 0.8; // 最短 seek 間隔（秒）
const VIDEO_SEEK_THRESHOLD = 0.3; // 當差距超過此值才執行 seek（秒）

let clockBpm = 60;

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
        title: t('popup.resource.title'),
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
                                text: t('popup.close'),
                                hideOnClick: true
                            }
                        ]
                    });
                }
            },
            {
                text: t('popup.close'),
                hideOnClick: true
            }
        ]
    });
});
/**
 * 將 AudioBuffer 轉換為 16-bit PCM WAV Blob
 */
function audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // 1 = raw PCM
    const bitDepth = 16;

    let result;
    if (numOfChan === 2) {
        result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
        result = buffer.getChannelData(0);
    }

    return writeWavFile(result, numOfChan, sampleRate, format, bitDepth);
}

function interleave(inputL, inputR) {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;
    while (index < length) {
        result[index++] = inputL[inputIndex];
        result[index++] = inputR[inputIndex];
        inputIndex++;
    }
    return result;
}

function writeWavFile(samples, numOfChan, sampleRate, format, bitDepth) {
    const blockAlign = numOfChan * (bitDepth / 8);
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * (bitDepth / 8);
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numOfChan, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

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
    draw(offsetTime, zoomValue) {
        const bgmBuffer = this.bm.buffer;
        const duration = this.bm.duration;
        const data = bgmBuffer.getChannelData(0);

        const zoom = Math.max(1, parseFloat(zoomValue) || 1);
        const viewLength = Math.max(0.1, duration / zoom);
        const viewCenter = Math.min(duration, Math.max(0, offsetTime));

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
        simpleToast({ content: t('toast.needBgm'), type: 'warning' });
        return;
    }

    const bufferManager = new BgmEditorBufferManager(audioManager);
    let offsetTime = musicDelay;
    let isPreviewing = false;
    let previewInterval;
    let editTaps = [];

    // 用來記錄拖曳前是不是正在播放，拖曳時要先閉嘴
    let wasPreviewingBeforeDrag = false;

    // 建立 UI 容器與元素
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:12px;font-size:13px;box-sizing:border-box;color:#e0e0e0;';

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 120;
    canvas.style.cssText = 'width:100%;height:120px;background:#0f0f0f;border:1px solid #444;border-radius:6px;cursor:crosshair;display:block;';
    container.appendChild(canvas);

    const wfCanvas = new BgmEditorWaveformCanvas(canvas, bufferManager);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;flex-direction:column;gap:12px;width:100%;';
    controls.innerHTML = `
        <!-- 第一排: BPM 敲擊與第一拍偏移 -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
            <!-- BPM 區塊 -->
            <div style="background:#1a1a1a; padding:10px; border-radius:6px; border:1px solid #333; display:flex; flex-direction:column; gap:6px;">
                <span style="font-weight:bold; color:#00a2ff; font-size:12px;">BPM & Tap Estimator</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <input type="number" id="editBpmInput" value="${clockBpm}" style="width:70px; background:#111; color:#fff; border:1px solid #444; padding:6px; border-radius:4px; font-weight:bold; text-align:center; font-size:13px;">
                    <button id="editTapBpmBtn" type="button" style="padding:6px 14px; background:#0055ff; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px; user-select:none; transition:background 0.2s;">Tap</button>
                    <button id="editTapResetBtn" type="button" style="padding:6px 8px; background:#333; color:#ccc; border:1px solid #444; border-radius:4px; cursor:pointer; font-size:11px;">${t('popup.tapBpm.btnReset')}</button>
                </div>
                <span id="editTapBpmStatus" style="font-size:11px; color:#888;">${t('popup.tapBpm.msgNotStarted')}</span>
            </div>

            <!-- 第一拍偏移區塊 -->
            <div style="background:#1a1a1a; padding:10px; border-radius:6px; border:1px solid #333; display:flex; flex-direction:column; gap:6px; justify-content:space-between;">
                <div>
                    <span style="font-weight:bold; color:#00a2ff; font-size:12px;">${t('popup.editMusic.firstBeatOffset')}</span>
                    <div style="display:flex; align-items:center; gap:6px; margin-top:6px; flex-wrap:wrap;">
                        <input type="number" id="editOffsetInput" value="${musicDelay.toFixed(2)}" step="0.01" style="width:85px; background:#111; color:#fff; border:1px solid #444; padding:6px; border-radius:4px; font-weight:bold; text-align:center; font-size:13px;">
                        <span style="color:#aaa; font-size:12px; margin-right:4px;">s</span>
                        <button id="shiftDecBeatBtn" type="button" style="padding:6px 10px; background:#2a2a2a; color:#ff4d4d; border:1px solid #444; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px; user-select:none; transition:background 0.2s;">-1 拍</button>
                        <button id="shiftIncBeatBtn" type="button" style="padding:6px 10px; background:#2a2a2a; color:#22c55e; border:1px solid #444; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px; user-select:none; transition:background 0.2s;">+1 拍</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 第二排: Waveform Zoom & BGM Vol -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px; background:#1a1a1a; padding:12px; border-radius:6px; border:1px solid #333;">
            <div style="display:flex; flex-direction:column; gap:6px; justify-content:center;">
                <span style="font-weight:bold; color:#00a2ff; font-size:12px;">Zoom Waveform</span>
                <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                    <button id="zoomOutBtn" type="button" style="width:30px; height:30px; background:#333; color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer; font-weight:bold; display:flex; align-items:center; justify-content:center; font-size:16px; user-select:none;">-</button>
                    <input type="range" id="editZoomSlider" min="1" max="20" step="0.5" value="1" style="flex:1; cursor:pointer; margin:0; height:6px;">
                    <button id="zoomInBtn" type="button" style="width:30px; height:30px; background:#333; color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer; font-weight:bold; display:flex; align-items:center; justify-content:center; font-size:16px; user-select:none;">+</button>
                    <span id="zoomValLabel" style="font-size:11px; color:#ccc; min-width:32px; text-align:right; font-weight:bold;">1.0x</span>
                </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px; justify-content:center;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; color:#aaa; font-size:12px;">BGM Volume</span>
                    <input type="number" id="editBgmVolumeInput" value="0.75" min="0" max="1" step="0.05" style="width:65px; background:#111; color:#fff; border:1px solid #444; padding:5px 8px; border-radius:4px; text-align:center; font-size:13px; font-weight:bold;">
                </div>
            </div>
        </div>

        <!-- 第三排: 節拍器預覽與精準 Shift 偏移 -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
            <button id="playClockBtn" type="button" style="width:100%; height:44px; background:#222; color:#00a2ff; border:1px solid #00a2ff; border-radius:6px; cursor:pointer; font-weight:bold; font-size:13px; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s;">
                <span style="font-size:16px;">⏱️</span> ${t('popup.editMusic.previewMetronome')}
            </button>
        </div>
    `;
    container.appendChild(controls);

    // 快捷 DOM 查詢
    const bpmInput = controls.querySelector('#editBpmInput');
    const offsetInputNode = controls.querySelector('#editOffsetInput');
    const bgmVolumeInput = controls.querySelector('#editBgmVolumeInput');

    const editTapBpmBtn = controls.querySelector('#editTapBpmBtn');
    const editTapResetBtn = controls.querySelector('#editTapResetBtn');
    const editTapBpmStatus = controls.querySelector('#editTapBpmStatus');

    const zoomSlider = controls.querySelector('#editZoomSlider');
    const zoomInBtn = controls.querySelector('#zoomInBtn');
    const zoomOutBtn = controls.querySelector('#zoomOutBtn');
    const zoomValLabel = controls.querySelector('#zoomValLabel');

    const playClockBtn = controls.querySelector('#playClockBtn');
    const shiftDecBeatBtn = controls.querySelector('#shiftDecBeatBtn');
    const shiftIncBeatBtn = controls.querySelector('#shiftIncBeatBtn');

    // 建立首拍對齊 UI 卡片 (使用者體驗優化)
    const alignCard = document.createElement('div');
    alignCard.style.cssText = 'background:#1a1a1a; border:1px solid #333; border-radius:6px; padding:12px; display:flex; flex-direction:column; gap:8px; width:100%; box-sizing:border-box;';

    const alignHeader = document.createElement('div');
    alignHeader.style.cssText = 'font-weight:bold; color:#00a2ff; font-size:12px; display:flex; justify-content:space-between; align-items:center;';
    alignHeader.innerHTML = `<span>${t('popup.editMusic.alignmentTitle')}</span><span id="currentBeatsSpan" style="color:#aaa;"></span>`;

    const alignBody = document.createElement('div');
    alignBody.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap; color:#ddd; font-size:12px;';
    alignBody.innerHTML = `
        <span>${t('popup.editMusic.alignmentPrefix')}</span>
        <input type="number" id="alignBeatsInput" value="4" style="width:55px; background:#111; color:#fff; border:1px solid #444; padding:5px; border-radius:4px; text-align:center; font-weight:bold; font-size:12px;">
        <span>${t('popup.editMusic.alignmentSuffix')}</span>
        <button id="alignBeatsBtn" type="button" style="padding:6px 14px; background:#006400; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">${t('popup.editMusic.alignmentBtn')}</button>
    `;

    const alignFooter = document.createElement('div');
    alignFooter.style.cssText = 'font-size:11px; color:#888; line-height:1.4;';
    alignFooter.textContent = t('popup.editMusic.alignmentDesc');

    alignCard.appendChild(alignHeader);
    alignCard.appendChild(alignBody);
    alignCard.appendChild(alignFooter);
    container.appendChild(alignCard);

    const alignBeatsInput = alignBody.querySelector('#alignBeatsInput');
    const alignBeatsBtn = alignBody.querySelector('#alignBeatsBtn');
    const currentBeatsSpan = alignHeader.querySelector('#currentBeatsSpan');

    const updateAlignmentUI = () => {
        const bpm = parseFloat(bpmInput.value) || clockBpm;
        const secPerBeat = 60 / bpm;
        const curBeats = offsetTime / secPerBeat;
        currentBeatsSpan.textContent = t('popup.editMusic.alignmentCurrent', { beats: curBeats.toFixed(2) });

        // 自動推薦下一個 4 的倍數拍數（除非使用者正在輸入）
        if (document.activeElement !== alignBeatsInput) {
            const suggested = Math.max(4, Math.ceil(curBeats / 4) * 4);
            alignBeatsInput.value = suggested;
        }
    };

    // 封裝重繪快取方法
    const triggerRedraw = () => {
        wfCanvas.draw(offsetTime, parseFloat(zoomSlider.value));
        updateAlignmentUI();
    };

    const startPreview = () => {
        stopPreview(); // 確保乾淨
        const bpm = parseFloat(bpmInput.value) || clockBpm;
        const msPerBeat = 60000 / bpm;

        // 1. 播放音樂
        audioManager.playBGM(offsetTime, parseFloat(bgmVolumeInput.value) || 0.75);

        // 2. 啟動同步節拍器
        let expectedTickTime = performance.now() + msPerBeat;
        previewInterval = setInterval(() => {
            const now = performance.now();
            if (now >= expectedTickTime) {
                audioManager.play('clock');
                expectedTickTime += msPerBeat;
            }
        }, 10);

        playClockBtn.innerHTML = `<span style="font-size:16px;">⏱️</span> ${t('popup.editMusic.stopPreview')}`;
        isPreviewing = true;
    };

    const stopPreview = () => {
        if (isPreviewing || previewInterval) {
            clearInterval(previewInterval);
            previewInterval = null;
            audioManager.stopBGM();
            playClockBtn.innerHTML = `<span style="font-size:16px;">⏱️</span> ${t('popup.editMusic.previewMetronome')}`;
            isPreviewing = false;
        }
    };

    // --- Zoom 操作與人因優化 ---
    const updateZoom = (val) => {
        val = Math.max(1, Math.min(30, parseFloat(val) || 1));
        zoomSlider.value = val;
        zoomValLabel.textContent = `${val.toFixed(1)}x`;
        triggerRedraw();
    };
    zoomSlider.addEventListener('input', () => updateZoom(zoomSlider.value));
    zoomInBtn.addEventListener('click', () => updateZoom(parseFloat(zoomSlider.value) + 1));
    zoomOutBtn.addEventListener('click', () => updateZoom(parseFloat(zoomSlider.value) - 1));

    // --- Tap BPM 估算器邏輯 ---
    const updateTapDisplay = () => {
        if (editTaps.length === 0) {
            editTapBpmStatus.textContent = t('popup.tapBpm.msgNotStarted');
        } else if (editTaps.length === 1) {
            editTapBpmStatus.textContent = t('popup.tapBpm.msgOneMore');
        } else {
            const intervals = [];
            for (let i = 1; i < editTaps.length; i++) {
                intervals.push(editTaps[i] - editTaps[i - 1]);
            }
            const avg = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
            const bpm = 60000 / avg;
            if (isFinite(bpm) && bpm > 0) {
                bpmInput.value = bpm.toFixed(1);
                editTapBpmStatus.textContent = `${bpm.toFixed(1)} BPM (${editTaps.length} taps)`;
                updateAlignmentUI();
            }
        }
    };
    editTapBpmBtn.addEventListener('click', () => {
        editTaps.push(performance.now());
        if (editTaps.length > 12) editTaps.shift();
        updateTapDisplay();
    });
    editTapResetBtn.addEventListener('click', () => {
        editTaps = [];
        updateTapDisplay();
    });

    // --- UI 事件監聽與跨平台觸控綁定 ---
    bpmInput.addEventListener('input', updateAlignmentUI);
    offsetInputNode.addEventListener('change', (e) => {
        offsetTime = parseFloat(e.target.value) || 0;
        triggerRedraw();
    });

    const adjustOffsetByBeat = (direction) => {
        const bpm = parseFloat(bpmInput.value) || clockBpm;
        if (bpm <= 0) return;
        const secPerBeat = 60 / bpm;

        const wasPlaying = isPreviewing;
        if (wasPlaying) {
            stopPreview();
        }

        offsetTime = Math.max(0, offsetTime + direction * secPerBeat);
        offsetInputNode.value = offsetTime.toFixed(2);
        triggerRedraw();

        if (wasPlaying) {
            startPreview();
        }
    };

    shiftDecBeatBtn.addEventListener('click', () => adjustOffsetByBeat(-1));
    shiftIncBeatBtn.addEventListener('click', () => adjustOffsetByBeat(1));

    // --- 核心優化：重新整理跨平台拖曳互動 ---
    let isDragging = false;
    let startX = 0;
    let startOffset = 0;

    const handleStart = (clientX) => {
        isDragging = true;
        startX = clientX;
        startOffset = offsetTime;

        // 【優化點 1】按下的瞬間，如果正在預覽，先暫停聲音，避免鬼畜爆音
        wasPreviewingBeforeDrag = isPreviewing;
        if (isPreviewing) {
            audioManager.stopBGM(); // 僅停止聲音，不清除計時器大架構，或者直接調 stopPreview()
            clearInterval(previewInterval); // 暫停節拍器
        }

        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const zoom = parseFloat(zoomSlider.value) || 1;
        const duration = bufferManager.duration;
        const viewLength = Math.max(0.1, duration / zoom);
        const viewCenter = Math.min(duration, Math.max(0, offsetTime));

        let viewStart = viewCenter - viewLength / 2;
        if (viewStart < 0) viewStart = 0;
        if (viewStart + viewLength > duration) viewStart = Math.max(0, duration - viewLength);

        offsetTime = Math.max(0, Math.min(duration, viewStart + (x / rect.width) * viewLength));
        offsetInputNode.value = offsetTime.toFixed(2);
        startOffset = offsetTime;
        triggerRedraw();
    };

    const handleMove = (clientX) => {
        if (!isDragging) return;
        const rect = canvas.getBoundingClientRect();
        const deltaX = clientX - startX;
        const zoom = parseFloat(zoomSlider.value) || 1;
        const duration = bufferManager.duration;
        const viewLength = Math.max(0.1, duration / zoom);
        const deltaTime = (deltaX / rect.width) * viewLength;

        // 這裡維持你原本的拖曳方向邏輯
        offsetTime = Math.max(0, Math.min(duration, startOffset - deltaTime));
        offsetInputNode.value = offsetTime.toFixed(2);
        triggerRedraw(); // 純重繪，絕對不跑音訊播放！
    };

    const handleEnd = () => {
        if (!isDragging) return;
        isDragging = false;

        // 【優化點 2】手放開、拖曳結束了，才一次性重啟音樂與節拍器
        if (wasPreviewingBeforeDrag) {
            startPreview();
        }
    };

    // --- 綁定事件 ---
    playClockBtn.addEventListener('click', () => {
        if (isPreviewing) stopPreview(); else startPreview();
    });

    const onWindowMouseMove = (e) => handleMove(e.clientX);
    const onWindowMouseUp = () => handleEnd();
    const onWindowTouchMove = (e) => {
        if (e.touches.length > 0) {
            handleMove(e.touches[0].clientX);
        }
    };
    const onWindowTouchEnd = () => handleEnd();

    canvas.addEventListener('mousedown', (e) => handleStart(e.clientX));
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            handleStart(e.touches[0].clientX);
        }
    }, { passive: true });
    window.addEventListener('touchmove', onWindowTouchMove, { passive: true });
    window.addEventListener('touchend', onWindowTouchEnd);

    // 首拍對齊執行按鈕監聽
    alignBeatsBtn.addEventListener('click', () => {
        stopPreview();
        const bpm = parseFloat(bpmInput.value) || clockBpm;
        const secPerBeat = 60 / bpm;
        const targetBeats = parseFloat(alignBeatsInput.value) || 4;
        const targetDuration = targetBeats * secPerBeat;
        const padDuration = targetDuration - offsetTime;

        if (padDuration > 0) {
            bufferManager.padStart(padDuration);
            offsetTime = targetDuration;
            offsetInputNode.value = offsetTime.toFixed(2);
            triggerRedraw();
            simpleToast({
                content: t('toast.padBeatsSuccess', {
                    seconds: padDuration.toFixed(3),
                    beats: targetBeats
                }),
                type: 'success'
            });
        } else {
            simpleToast({ content: t('toast.padBeatsInvalid'), type: 'warning' });
        }
    });

    // --- 功能性按鈕箱配置 ---
    const actionBox = document.createElement('div');
    actionBox.style.cssText = 'display:flex;gap:10px;margin-top:5px;flex-wrap:wrap;width:100%;';

    // 按鈕 1：裁切
    const cropBtn = document.createElement('button');
    cropBtn.id = 'cropBtn';
    cropBtn.type = 'button';
    cropBtn.innerHTML = `✂️ ${t('popup.editMusic.cropBefore')}`;
    cropBtn.style.cssText = 'flex:1; min-width:140px; height:38px; background:#8b0000; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px; display:flex; align-items:center; justify-content:center; gap:6px;';
    cropBtn.addEventListener('click', () => {
        if (offsetTime <= 0) return;
        if (!confirm(t('popup.editMusic.confirmCropBefore'))) return;

        stopPreview();
        if (bufferManager.cropStart(offsetTime)) {
            offsetTime = 0;
            offsetInputNode.value = "0.00";
            triggerRedraw();
            simpleToast({ content: t('toast.cropSuccess'), type: 'success' });
        }
    });

    // 按鈕 2：依 BPM 補白
    const padBtn = document.createElement('button');
    padBtn.id = 'padBtn';
    padBtn.type = 'button';
    padBtn.innerHTML = `➕ ${t('popup.editMusic.padOneBeat')}`;
    padBtn.style.cssText = 'flex:1; min-width:140px; height:38px; background:#006400; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px; display:flex; align-items:center; justify-content:center; gap:6px;';
    padBtn.addEventListener('click', () => {
        stopPreview();
        const bpm = parseFloat(bpmInput.value) || clockBpm;
        const secPerBeat = 60 / bpm;

        bufferManager.padStart(secPerBeat);
        offsetTime += secPerBeat;
        offsetInputNode.value = offsetTime.toFixed(2);
        triggerRedraw();
        simpleToast({ content: t('toast.padSuccess'), type: 'success' });
    });

    // ✨ 按鈕 4：緊急安全備份還原
    const restoreBtn = document.createElement('button');
    restoreBtn.id = 'restoreBtn';
    restoreBtn.type = 'button';
    restoreBtn.innerHTML = `🔄 ${t('popup.editMusic.restoreOriginal')}`;
    restoreBtn.style.cssText = 'flex:1; min-width:140px; height:38px; background:#333; color:#aaa; border:1px solid #444; border-radius:6px; cursor:pointer; font-weight:bold; font-size:12px; display:flex; align-items:center; justify-content:center; gap:6px;';
    restoreBtn.addEventListener('click', () => {
        if (!confirm(t('popup.editMusic.confirmRestore'))) return;
        stopPreview();
        bufferManager.restoreOriginal();
        offsetTime = musicDelay;
        offsetInputNode.value = offsetTime.toFixed(2);
        triggerRedraw();
        simpleToast({ content: t('toast.restoreSuccess'), type: 'info' });
    });

    actionBox.appendChild(cropBtn);
    actionBox.appendChild(padBtn);
    actionBox.appendChild(restoreBtn);
    container.appendChild(actionBox);

    // 初始化第一次繪製
    setTimeout(triggerRedraw, 100);

    // 彈出視窗配置
    popupWindow({
        title: t('popup.editMusic.title'),
        customContent: container,
        width: 'max-content',
        buttons: [
            {
                text: t('popup.apply'),
                onClick: async (ctx) => {
                    const bpm = parseFloat(bpmInput.value) || clockBpm;
                    musicDelay = parseFloat(offsetTime.toFixed(2));

                    // 連動更新外部編輯器控制項數值
                    if (typeof offsetInput !== 'undefined') offsetInput.value = musicDelay.toFixed(2);
                    editorInput.value += `\n(${bpm})`;

                    if (typeof applyHighlight === 'function') applyHighlight(editorInput.value);
                    if (typeof inputDebounce === 'function') inputDebounce();
                    if (typeof offsetInputDebounce === 'function') offsetInputDebounce();

                    stopPreview();

                    // ✨ 核心功能：將修改後的音訊儲存至 IndexedDB
                    simpleToast({ content: t('toast.savingMusic'), type: 'info' });

                    try {
                        const wavBlob = audioBufferToWav(audioManager.bgmBuffer);
                        let fileName = 'bgm.wav';
                        if (audioManager.bgmFile && audioManager.bgmFile.name) {
                            fileName = audioManager.bgmFile.name;
                            // 確保檔名尾碼是 .wav
                            if (!fileName.toLowerCase().endsWith('.wav')) {
                                const lastDotIdx = fileName.lastIndexOf('.');
                                if (lastDotIdx !== -1) {
                                    fileName = fileName.substring(0, lastDotIdx) + '.wav';
                                } else {
                                    fileName = fileName + '.wav';
                                }
                            }
                        }
                        const editedFile = new File([wavBlob], fileName, { type: 'audio/wav' });
                        audioManager.bgmFile = editedFile;

                        await projSet('resource_bgm', editedFile);
                        simpleToast({ content: t('toast.saveMusicSuccess'), type: 'success' });
                    } catch (err) {
                        console.error('Failed to save BGM:', err);
                        simpleToast({ content: t('toast.saveMusicError'), type: 'error' });
                    }

                    ctx.close();
                }
            },
            {
                text: t('popup.cancel'),
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
            window.removeEventListener('mousemove', onWindowMouseMove);
            window.removeEventListener('mouseup', onWindowMouseUp);
            window.removeEventListener('touchmove', onWindowTouchMove, { passive: true });
            window.removeEventListener('touchend', onWindowTouchEnd);
        }
    });
});

tapBpmButton.addEventListener('click', () => {
    let taps = [];

    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:10px;font-size:13px;';

    const hint = document.createElement('div');
    hint.innerText = t('popup.tapBpm.hint');
    container.appendChild(hint);

    const stats = document.createElement('div');
    stats.style.cssText = 'display:flex;justify-content:space-between;gap:10px; flex-wrap:wrap;';
    stats.innerHTML = `
            <div>${t('popup.tapBpm.count')}<strong id="tapBpmCount">0</strong></div>
            <div>${t('popup.tapBpm.bpm')}<strong id="tapBpmValue">--</strong></div>
        `;
    container.appendChild(stats);

    const tapButton = document.createElement('button');
    tapButton.type = 'button';
    tapButton.innerText = t('popup.tapBpm.btnTap');
    tapButton.style.cssText = 'width:100%;padding:10px 0;font-size:16px;font-weight:600;background:#333;color:#fff;border:1px solid #555;border-radius:6px;cursor:pointer;';
    container.appendChild(tapButton);

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.innerText = t('popup.tapBpm.btnReset');
    resetButton.style.cssText = 'width:100%;padding:8px 0;font-size:14px;background:#222;color:#fff;border:1px solid #444;border-radius:6px;cursor:pointer;';
    container.appendChild(resetButton);

    const message = document.createElement('div');
    message.style.cssText = 'color:#ccc;font-size:12px;line-height:1.4;';
    message.innerText = t('popup.tapBpm.msgNotStarted');
    container.appendChild(message);

    const updateDisplay = () => {
        const countElem = container.querySelector('#tapBpmCount');
        const bpmElem = container.querySelector('#tapBpmValue');
        if (countElem) countElem.innerText = taps.length.toString();

        if (taps.length < 2) {
            if (bpmElem) bpmElem.innerText = '--';
            message.innerText = taps.length === 0 ? t('popup.tapBpm.msgNotStarted') : t('popup.tapBpm.msgOneMore');
            return;
        }

        const intervals = [];
        for (let i = 1; i < taps.length; i++) {
            intervals.push(taps[i] - taps[i - 1]);
        }
        const avg = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
        const bpm = 60000 / avg;
        if (bpmElem) bpmElem.innerText = isFinite(bpm) ? bpm.toFixed(1) : '--';
        message.innerText = t('popup.tapBpm.msgIntervals', { count: intervals.length });
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
        title: t('popup.tapBpm.title'),
        customContent: container,
        buttons: [
            {
                text: t('popup.tapBpm.btnSave'),
                onClick: (ctx) => {
                    if (taps.length < 2) {
                        simpleToast({ content: t('toast.tapBpmWarning'), type: 'warning', timeout: 1800 });
                        return;
                    }

                    const intervals = [];
                    for (let i = 1; i < taps.length; i++) {
                        intervals.push(taps[i] - taps[i - 1]);
                    }
                    const avg = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
                    const bpm = 60000 / avg;
                    if (!isFinite(bpm) || bpm <= 0) {
                        simpleToast({ content: t('toast.tapBpmError'), type: 'error', timeout: 1800 });
                        return;
                    }
                    editorInput.value += `(${bpm.toFixed(1)})`;

                    setEditorCss();
                    applyHighlight(editorInput.value);

                    inputDebounce();
                    simpleToast({ content: t('toast.tapBpmSuccess', { bpm: bpm.toFixed(1) }), type: 'success', timeout: 1800 });
                    ctx.close();
                },
                hideOnClick: true
            },
            {
                text: t('popup.close'),
                hideOnClick: true
            }
        ]
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

    //projSet('background_image', null).catch(() => { });
    //projSet('background_video', null).catch(() => { });
    //projSet('now_difficulty', nowDifficulty).catch(() => { });
    //projSet('resource_bgm', null).catch(() => { });
    //projSet('timeControl', 0).catch(() => { });
}

fetchFromMainoteButton.addEventListener('click', () => {
    // 以 globalThis 取得 Supabase，避免在 module/非 module 環境中直接存取未宣告的全域變數導致錯誤
    const createClient = globalThis.supabase?.createClient;
    if (typeof createClient !== 'function') {
        console.warn('Supabase client not found on globalThis.');
        simpleToast({ content: t('toast.supabaseWarning'), type: 'warning', timeout: 4000 });
        return;
    }

    const SUPABASE_CONFIG = {
        url: "https://tntzyagdhlrdeswyrsjw.supabase.co",
        key: "sb_publishable_eoR0itFK2HCrDAMd-6Jbxg_OYCkGWTJ"
    };
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
            if (version) query = query.eq('songs.version', version);
            if (category) query = query.eq('songs.genre', category);

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
            simpleToast({ content: t('toast.chartsFound', { count: data.length }), type: 'success', timeout: 1500 });
            return data;

        } catch (err) {
            console.error('查詢失敗:', err);
            simpleToast({ content: t('toast.chartQueryError', { message: err.message }), type: 'error', timeout: 2000 });
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
    const levelOptions = [{ value: '', text: t('popup.fetchMainote.allLevels') }];
    for (let i = 1; i <= 6; i++) levelOptions.push({ value: i.toString(), text: `Level ${i}` });
    for (let i = 7; i <= 14; i++) {
        levelOptions.push({ value: i.toString(), text: `Level ${i}` })
        levelOptions.push({ value: i.toString() + '+', text: `Level ${i}+` })
    };
    levelOptions.push({ value: 15, text: `Level 15` });

    const difficultyOptions = [
        { value: '', text: t('popup.fetchMainote.allDifficulties') },
        { value: 'Re:MASTER', text: 'Re:MASTER' },
        { value: 'MASTER', text: 'MASTER' },
        { value: 'EXPERT', text: 'EXPERT' },
        { value: 'ADVANCED', text: 'ADVANCED' },
        { value: 'BASIC', text: 'BASIC' },
        { value: 'EASY', text: 'EASY' },
    ];

    const versionOptions = [
        { value: '', text: t('popup.fetchMainote.allVersions') },
        { value: 'maimai', text: 'maimai' },
        { value: 'maimai PLUS', text: 'maimai PLUS' },
        { value: 'GreeN', text: 'GreeN' },
        { value: 'GreeN PLUS', text: 'GreeN PLUS' },
        { value: 'ORANGE', text: 'ORANGE' },
        { value: 'ORANGE PLUS', text: 'ORANGE PLUS' },
        { value: 'PiNK', text: 'PiNK' },
        { value: 'PiNK PLUS', text: 'PiNK PLUS' },
        { value: 'MURASAKi', text: 'MURASAKi' },
        { value: 'MURASAKi PLUS', text: 'MURASAKi PLUS' },
        { value: 'MiLK', text: 'MiLK' },
        { value: 'MiLK PLUS', text: 'MiLK PLUS' },
        { value: 'FiNALE', text: 'FiNALE' },
        { value: 'でらっくす', text: 'でらっくす (DX)' },
        { value: 'でらっくす PLUS', text: 'でらっくす PLUS' },
        { value: 'Splash', text: 'Splash' },
        { value: 'Splash PLUS', text: 'Splash PLUS' },
        { value: 'UNiVERSE', text: 'UNiVERSE' },
        { value: 'UNiVERSE PLUS', text: 'UNiVERSE PLUS' },
        { value: 'FESTiVAL', text: 'FESTiVAL' },
        { value: 'FESTiVAL PLUS', text: 'FESTiVAL PLUS' },
        { value: 'BUDDiES', text: 'BUDDiES' },
        { value: 'BUDDiES PLUS', text: 'BUDDiES PLUS' },
        { value: 'PRiSM', text: 'PRiSM' },
        { value: 'PRiSM PLUS', text: 'PRiSM PLUS' },
        { value: 'CiRCLE', text: 'CiRCLE' },
        { value: 'CiRCLE PLUS', text: 'CiRCLE PLUS' },
    ];

    const categoryOptions = [
        { value: '', text: t('popup.fetchMainote.allCategories') },
        { value: 'POPS＆アニメ', text: 'POPS & ANIME' },
        { value: 'niconico＆ボーカロイド', text: 'niconico & VOCALOID' },
        { value: '東方Project', text: '東方Project' },
        { value: 'ゲーム＆バラエティ', text: 'GAME & VARIETY' },
        { value: 'maimai', text: 'maimai' },
        { value: 'オンゲキ＆CHUNITHM', text: 'Ongeki & CHUNITHM' }
    ];

    // 建立 UI 元件
    const { row: songRow, input: songInput } = createInput(t('popup.fetchMainote.songTitle'), t('popup.fetchMainote.songTitlePlaceholder'));
    const { row: levelRow, select: levelSelect } = createSelect(t('popup.fetchMainote.level'), levelOptions);
    const { row: difficultyRow, select: difficultySelect } = createSelect(t('popup.fetchMainote.difficulty'), difficultyOptions);
    const { row: versionRow, select: versionSelect } = createSelect(t('popup.fetchMainote.version'), versionOptions);
    const { row: categoryRow, select: categorySelect } = createSelect(t('popup.fetchMainote.category'), categoryOptions);

    container.append(songRow, levelRow, difficultyRow, versionRow, categoryRow);

    // 搜尋按鈕
    const searchBtn = document.createElement('button');
    searchBtn.textContent = t('popup.fetchMainote.btnSearch');
    searchBtn.style.cssText = 'padding:10px;background:#0066cc;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:500;margin-top:8px;transition:background 0.2s;';
    searchBtn.onmouseover = () => searchBtn.style.background = '#0052a3';
    searchBtn.onmouseout = () => searchBtn.style.background = '#0066cc';

    searchBtn.addEventListener('click', async () => {
        searchBtn.disabled = true;
        searchBtn.textContent = t('popup.fetchMainote.searching');

        const result = await getLevelCharts({
            level: levelSelect.value,
            songTitle: songInput.value,
            version: versionSelect.value,
            category: categorySelect.value,
            difficulty: difficultySelect.value
        });

        if (!result || result.length === 0) {
            simpleToast({ content: t('toast.chartsNotFound'), type: 'warning', timeout: 1800 });
            searchBtn.disabled = false;
            searchBtn.textContent = t('popup.fetchMainote.btnSearch');
            return;
        }

        // 建立結果列表 (此部分維持原樣)
        const resultContainer = document.createElement('div');
        resultContainer.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;padding-right:4px;';

        let resultPopupCtx = null;
        result.forEach((chart) => {
            const item = document.createElement('div');
            item.style.cssText = 'padding:10px;background:#2a2a2a;border:1px solid #444;border-radius:4px;cursor:pointer;transition:all 0.2s;';

            const songTitle = chart.songs?.title || t('popup.fetchMainote.unknownSong');
            item.innerHTML = `
                <div style="font-weight:500;color:#fff;margin-bottom:4px;">${songTitle}</div>
                <div style="font-size:12px;color:#bbb;">
                    ${t('popup.fetchMainote.chartDifficulty')}: <strong>${chart.difficulty || 'N/A'}</strong> | ${t('popup.fetchMainote.chartLevel')}: <strong>${chart.level || 'N/A'}</strong>
                </div>
            `;

            item.onclick = () => {
                const maidataHaveContext = (() => {
                    if (audioManager.haveBGM && audioManager.haveBGM()) return true;
                    for (let i = 1; i <= 7; i++) {
                        if (maidata && maidata[`inote_${i}`] && maidata[`inote_${i}`].trim() !== "") return true;
                    }
                    return false;
                })();

                const loadChart = async (mode) => {
                    if (mode === 'new') {
                        const newId = await projectCreate(t('popup.projectManager.untitled'));
                        currentProjectId = newId;
                        localStorage.setItem('simai_lastProjectId', currentProjectId);
                        console.log(`[Project] 已建立新專案: ${newId}`);
                    }

                    setDataEmpty();

                    // chart_data 是純 simai note 資料，需手動組裝 maidata 物件
                    const diffKey = (chart.difficulty || 'MASTER').toUpperCase();
                    const diffMap = { 'EASY': 1, 'BASIC': 2, 'ADVANCED': 3, 'EXPERT': 4, 'MASTER': 5, 'RE:MASTER': 6, 'UTAGE': 7 };
                    const targetDiff = diffMap[diffKey] || 5;

                    maidata = {};
                    maidata.title = chart.songs?.title || songTitle || '';
                    maidata[`inote_${targetDiff}`] = chart.chart_data || '';

                    // 設定難度
                    nowDifficulty = targetDiff;
                    changeDifficulty.value = nowDifficulty;
                    projSet('now_difficulty', nowDifficulty).catch(() => { });

                    // 填入編輯器
                    editorInput.value = maidata[`inote_${targetDiff}`] || '';
                    getres(editorInput.value);
                    applyHighlight(editorInput.value);

                    // 重置編輯歷史
                    undoStack = [];
                    redoStack = [];
                    historyMap = {};
                    lastEditorValue = editorInput.value || '';

                    saveMaidata();

                    // 嘗試以歌曲標題更新專案名稱
                    const displayName = maidata.title || songTitle;
                    if (displayName && currentProjectId) {
                        projectUpdateName(currentProjectId, displayName).catch(() => { });
                    }

                    simpleToast({ content: t('toast.chartLoaded', { title: songTitle }), type: 'success', timeout: 1500 });
                    if (resultPopupCtx) resultPopupCtx.close();
                };

                if (maidataHaveContext) {
                    popupWindow({
                        title: t('popup.fetchMainote.loadChartTitle'),
                        content: t('popup.fetchMainote.loadChartConfirm'),
                        buttons: [
                            {
                                text: t('popup.fetchMainote.overwriteProject'),
                                onClick: (ctx) => { ctx.close(); loadChart('overwrite'); }
                            },
                            {
                                text: t('popup.fetchMainote.openNewProject'),
                                onClick: (ctx) => { ctx.close(); loadChart('new'); }
                            },
                            {
                                text: t('popup.fetchMainote.cancel'),
                                hideOnClick: true
                            }
                        ]
                    });
                } else {
                    loadChart('overwrite');
                }
            };

            item.onmouseenter = () => { item.style.borderColor = '#0066cc'; item.style.background = '#333'; };
            item.onmouseleave = () => { item.style.borderColor = '#444'; item.style.background = '#2a2a2a'; };
            resultContainer.appendChild(item);
        });

        resultPopupCtx = popupWindow({
            title: t('popup.fetchMainote.searchResults', { count: result.length }),
            customContent: resultContainer,
            buttons: [{ text: t('popup.close'), hideOnClick: true }]
        });

        searchBtn.disabled = false;
        searchBtn.textContent = t('popup.fetchMainote.btnSearch');
    });

    container.appendChild(searchBtn);

    popupWindow({
        title: t('popup.fetchMainote.title'),
        customContent: container,
        buttons: [{ text: t('popup.close'), hideOnClick: true }]
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
            return `<div class="warning-item" style="cursor: pointer; color: #ccc; text-decoration: underline; margin-bottom: 8px; font-family: Google Sans; font-size: 13px;" data-errpos="${errpos}">• ${w}</div>`;
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
    slider.max = endTime + musicDelay;
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

function ensureVisualEditorContext() {
    if (!visualCtx) {
        visualCtx = visualEditor.getContext('2d');
    }
    return visualCtx;
}

function resizeVisualEditor(force = false) {
    const ctx2d = ensureVisualEditorContext();
    const dpr = window.devicePixelRatio || 1;
    const w = editorContainer.clientWidth * dpr;
    const h = editorContainer.clientHeight * dpr;

    if (!force && lastVisualEditorSize.w === w && lastVisualEditorSize.h === h) {
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

    slider.style.display = settings.globalTimeline ? 'block' : 'none';
    if (visible === null) return;

    const visualMode = isVisualMode();
    const editorVisible = visible && !visualMode;
    const visualVisible = visible && visualMode;
    const isHidden = hideButton.dataset.hidden === 'true';

    setElementDisplay(editorContainer, visible);
    setElementDisplay(editorInput, editorVisible);
    setElementDisplay(highlightLayer, editorVisible);
    setElementDisplay(visualEditor, visualVisible);

    if (!visible) {
        // 當隱藏 Editor 時：Editor 隱藏，Canvas 必須顯示，分割線隱藏 (保留 canvasSnapped 狀態)
        canvasContainer.style.display = '';
        noRender = false;
        setElementDisplay(panelSplitter, false);
    } else {
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
        input.id = id;
        input.checked = checked;
        input.style.cursor = 'pointer';
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
            simpleToast({ content: t('toast.noAudioFile'), type: "error" });
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
                    simpleToast({ content: t('toast.tagReadSuccess', { title: title || t('popup.chartInfo.noTitle') }), type: "success" });
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
            simpleToast({ content: t('toast.fileNameParsed'), type: "info" });
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
        overlay.textContent = t('popup.chartInfo.clickToChangeImage');

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
                    projSet('background_image', file);
                }
            };
            fileInput.click();
        });
        imgContainer.appendChild(imgWrapper);
        imgContainer.appendChild(createButton(t('popup.chartInfo.readFromTrack'), () => {
            processAudioMetadata(audioManager.bgmFile);
        }));
        imgContainer.appendChild(createButton(t('popup.chartInfo.readOtherMetadata'), () => {
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
        const titleField = createLabeledInput1({ value: tempData.title, labelText: t('popup.chartInfo.titleLabel'), type: 'text', assign: "title", data: tempData, ref: inputRefs });
        const artistField = createLabeledInput1({ value: tempData.artist, labelText: t('popup.chartInfo.artistLabel'), type: 'text', assign: "artist", data: tempData, ref: inputRefs });
        const descField = createLabeledInput1({ value: tempData.des, labelText: t('popup.chartInfo.designerLabel'), type: 'text', assign: "des", data: tempData, ref: inputRefs });

        diffContainer.append(titleField.wrapper, artistField.wrapper, descField.wrapper);

        // 難度選擇與等級 (使用 createLabeledInput1 的 select)
        const dropdownField = createLabeledInput1({
            value: nowDifficulty || "5",
            labelText: t('popup.chartInfo.diffLabel'),
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

        // 難度選擇與等級 (使用 createLabeledInput1 的 select)
        dropdownField.input.addEventListener('change', (e) => {
            tempData.difficulty = e.target.value;
            updateDiffFields(e.target.value);
        });

        const infoText = document.createElement('div');
        const updateDiffFields = (diff) => {
            infoText.innerHTML = "";
            const lv = createLabeledInput1({ value: tempData[`lv_${diff}`], labelText: t('popup.chartInfo.levelLabel'), type: 'text', assign: `lv_${diff}`, data: tempData, ref: inputRefs });
            const des = createLabeledInput1({ value: tempData[`des_${diff}`], labelText: t('popup.chartInfo.designerDiffLabel'), type: 'text', assign: `des_${diff}`, data: tempData, ref: inputRefs });
            infoText.append(lv.wrapper, des.wrapper);
        };

        // 🌟 關鍵修正：這裡改塞整個 wrapper，灰色小字才會出來
        diffContainer.appendChild(dropdownField.wrapper);
        diffContainer.appendChild(infoText);

        // 初始觸發一次，帶入目前的 select 值
        updateDiffFields(dropdownField.input.value);

        // 自訂指令[cite: 1]
        const excludedKeys = new Set(["title", "artist", "des", "first", "difficulty"]);
        const insVal = Object.keys(tempData)
            .filter(key => !excludedKeys.has(key) && !key.startsWith('lv_') && !key.startsWith('des_') && !key.startsWith('inote_'))
            .map(key => `&${key} = ${tempData[key]}`)
            .join("\n");
        const customIns = createLabeledInput1({ value: insVal, labelText: t('popup.chartInfo.customLabel'), type: 'textarea', assign: "custom", data: tempData, ref: inputRefs });
        diffContainer.appendChild(customIns.wrapper);

        container.appendChild(imgContainer);
        container.appendChild(diffContainer);
        return container;
    };

    popupWindow({
        title: t('popup.chartInfo.title'),
        customContent: createPopupContent(),
        buttons: [
            {
                text: t('popup.ok'),
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
            { text: t('popup.cancel'), hideOnClick: true }
        ]
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
    // 💡 以後想改內容、加新功能，只要改這個設定陣列就好！
    const helpData = [
        {
            tabTitle: t('popup.help.basicTab'),
            title: t('popup.help.basicTitle'),
            items: t('popup.help.basicItems'),
            isList: false // 控制要用一般段落 <p> 還是一般列表 <ul>
        },
        {
            tabTitle: t('popup.help.shortcutTab'),
            title: t('popup.help.shortcutTitle'),
            items: t('popup.help.shortcutItems'),
            isList: true
        }
    ];

    // --- 1. CSS 樣式獨立抽出來 ---
    const style = `
    <style>
      .help-container {
        color: #aaaaaa;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .help-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 20px;
        border-bottom: 1px solid #2d2d2d;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .help-tabs::-webkit-scrollbar { display: none; }
      .tab-btn {
        background: transparent;
        color: #757575;
        border: none;
        padding: 10px 20px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
        position: relative;
        transition: color 0.2s ease;
      }
      .tab-btn:hover { color: #ffffff; }
      .tab-btn.active { color: #ffffff; font-weight: bold; }
      .tab-btn.active::after {
        content: "";
        position: absolute;
        bottom: -1px; left: 20px; right: 20px; height: 3px;
        background-color: #3b82f6;
      }
      .tab-pane {
        font-size: 13.5px;
        line-height: 1.8;
        color: #aaaaaa;
        animation: fadeIn 0.15s ease-out;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .tab-pane h4 {
        color: #ffffff; font-size: 15px; margin-top: 0; margin-bottom: 16px;
        border-left: 3px solid #3b82f6; padding-left: 8px; font-weight: 600;
      }
      .tab-pane p { margin: 8px 0 12px 0; }
      .tab-pane ul { margin: 8px 0 12px 0; padding-left: 0; list-style: none; }
      .tab-pane li { position: relative; padding-left: 16px; margin-bottom: 8px; }
      .tab-pane li::before {
        content: "•"; color: #3b82f6; font-weight: bold;
        position: absolute; left: 4px; top: 0;
      }
      .tab-pane b { color: #ffffff; }
      .code-highlight {
        background: #242424; color: #ffffff; padding: 3px 8px; border-radius: 4px;
        font-family: Consolas, Monaco, monospace; font-size: 12px; border: 1px solid #3a3a3a;
        display: inline-block; line-height: 1.2; margin: 0 2px; vertical-align: middle;
      }
      /* 讓 Material Icons 在文字裡對齊更完美 */
      .material-symbols-outlined {
        vertical-align: middle;
        font-size: 18px;
        margin: 0 2px;
      }
    </style>`;

    // --- 2. 透過 Array 串接自動產生 HTML 結構 ---
    const tabsHTML = helpData.map((data, i) => `
        <button class="tab-btn ${i === 0 ? 'active' : ''}">${data.tabTitle}</button>
    `).join('');

    const panesHTML = helpData.map((data, i) => {
        // 依據 isList 決定渲染成 <ul><li> 還是複數個 <p>
        const contentBody = data.isList
            ? `<ul>${data.items.map(item => `<li>${item}</li>`).join('')}</ul>`
            : data.items.map(item => `<p>${item}</p>`).join('');

        return `
            <div class="tab-pane" style="display: ${i === 0 ? 'block' : 'none'};">
                <h4>${data.title}</h4>
                ${contentBody}
            </div>
        `;
    }).join('');

    // 組合成最終內容
    const content = `
        ${style}
        <div class="help-container">
            <div class="help-tabs">${tabsHTML}</div>
            ${panesHTML}
        </div>
    `;

    // --- 3. 開啟彈窗與事件綁定（邏輯完全不需要動）---
    popupWindow({
        title: t('popup.help.title'),
        customContent: content,
        width: 480,
        height: "80%",
        buttons: [
            { text: t('popup.close'), hideOnClick: true }
        ],
        onOpen: (ctx) => {
            const container = ctx.elements.customContent;
            const buttons = container.querySelectorAll('.tab-btn');
            const panes = container.querySelectorAll('.tab-pane');
            buttons.forEach((btn, index) => {
                btn.onclick = () => {
                    buttons.forEach(b => b.classList.remove('active'));
                    panes.forEach(p => p.style.display = 'none');
                    btn.classList.add('active');
                    panes[index].style.display = 'block';
                };
            });
        }
    });
});

function getGridSlots(maxTime) {
    const slots = [];
    if (!decodedTags || decodedTags.length === 0) {
        const bpm = clockBpm || 60;
        const tb2 = settings.tb2 || 4;
        const beatPeriod = (240 / bpm) / tb2;
        for (let t = 0; t <= maxTime; t += beatPeriod) {
            slots.push(t);
        }
        return slots;
    }

    const bpmTags = decodedTags.filter(t => t.type === 'bpm').sort((a, b) => a.time - b.time);
    if (bpmTags.length === 0) {
        bpmTags.push({ time: 0, value: clockBpm || 60 });
    }

    const tb2 = settings.tb2 || 4;

    for (let i = 0; i < bpmTags.length; i++) {
        const tag = bpmTags[i];
        const nextTag = bpmTags[i + 1];
        const endTimeForTag = nextTag ? nextTag.time : Math.max(endTime, maxTime);
        const beatPeriod = (240 / tag.value) / tb2;

        let t = tag.time;
        while (t < endTimeForTag - 0.001) {
            slots.push(t);
            t += beatPeriod;
        }
    }

    if (slots.length === 0 || slots[slots.length - 1] < Math.max(endTime, maxTime) - 0.001) {
        slots.push(Math.max(endTime, maxTime));
    }

    return slots;
}

const quantizeTime = (time) => {
    const slots = getGridSlots(time + 2.0);
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

const getOrCreateCommaIndex = (snappedTime) => {
    if (!dataIndexToTime || dataIndexToTime.length === 0) {
        rawData = [""];
        dataIndexToTime = [0];
        return 0;
    }

    for (let idx = 0; idx < dataIndexToTime.length; idx++) {
        if (Math.abs(dataIndexToTime[idx] - snappedTime) < 0.05) {
            return idx;
        }
    }

    const lastIndex = dataIndexToTime.length - 1;
    const lastTime = dataIndexToTime[lastIndex];
    if (snappedTime > lastTime) {
        const currentBpm = clockBpm || 60;
        const currentGrid = settings.tb2 || 4;
        const timeStep = (240 / currentBpm) / currentGrid;

        const numCommas = Math.round((snappedTime - lastTime) / timeStep);
        if (numCommas > 0) {
            for (let k = 0; k < numCommas; k++) {
                rawData.push("");
            }
            for (let k = 1; k <= numCommas; k++) {
                dataIndexToTime[lastIndex + k] = lastTime + k * timeStep;
            }
            return lastIndex + numCommas;
        }
    }

    return null;
};

function stripLeadingTags(str) {
    return str.replace(/^(?:(?:\([^\)]*\))|(?:\{[^\}]*\})|(?:<[^>]*>))+/, '');
}

function updateEditorAndSave(newContent) {
    recordEditorHistory();
    editorInput.value = newContent;
    recordEditorHistory();

    applyHighlight(newContent);
    getres(newContent);

    maidata["inote_" + nowDifficulty] = newContent;
    saveMaidata();
}

const visualPlaceNote = (lane, clickTime) => {
    const snappedTime = quantizeTime(clickTime);
    if (snappedTime === null || snappedTime === undefined) {
        simpleToast({ content: '點擊位置離最近的節拍線太遠，無法放置音符', type: 'warning', timeout: 1500 });
        return;
    }

    const closestIndex = getOrCreateCommaIndex(snappedTime);
    if (closestIndex === null || closestIndex === undefined) {
        simpleToast({ content: '無法定位或擴充該時間位置的拍子', type: 'warning', timeout: 1500 });
        return;
    }

    const segment = rawData[closestIndex] ? rawData[closestIndex].trim() : "";
    if (segment.startsWith("||")) {
        simpleToast({ content: '無法在註解行內放置音符', type: 'warning', timeout: 1500 });
        return;
    }

    const parts = segment === "" ? [] : segment.split('/');
    const alreadyOccupied = parts.some(p => {
        const clean = stripLeadingTags(p);
        return clean.startsWith(String(lane));
    });

    if (alreadyOccupied) {
        return;
    }

    const cleanNotePart = stripLeadingTags(segment);
    let newSegment = "";
    if (cleanNotePart === "") {
        newSegment = segment + String(lane);
    } else {
        newSegment = segment + "/" + String(lane);
    }

    rawData[closestIndex] = newSegment;
    const newContent = rawData.join(',');
    updateEditorAndSave(newContent);

    simpleToast({ content: `已在軌道 ${lane} 放置 Tap 音符`, type: 'success', timeout: 1000 });
};

const visualDeleteNote = (note) => {
    const commaIndex = note.index;
    if (commaIndex === undefined || commaIndex === null) return;
    const lane = note.pos;
    if (!lane) return;

    const segment = rawData[commaIndex] ? rawData[commaIndex].trim() : "";
    if (segment === "" || segment.startsWith("||")) return;

    const parts = segment.split('/');
    const partIndex = parts.findIndex(p => {
        const clean = stripLeadingTags(p);
        return clean.startsWith(String(lane));
    });

    if (partIndex === -1) return;

    parts.splice(partIndex, 1);
    const newSegment = parts.join('/');
    rawData[commaIndex] = newSegment;

    const newContent = rawData.join(',');
    updateEditorAndSave(newContent);

    simpleToast({ content: `已刪除軌道 ${lane} 的音符`, type: 'info', timeout: 1000 });
};

function getNextNoteClean(clean, L) {
    const isSpecial = /[h\-<>^vpqszVw]/.test(clean);
    if (isSpecial) {
        return String(L);
    }

    const isBreak = clean.includes('b');
    const isStar = clean.includes('$');
    const isEx = clean.includes('x');

    if (!isBreak && !isStar && !isEx) {
        return `${L}$`;
    } else if (isStar && !isBreak && !isEx) {
        return `${L}b`;
    } else if (isBreak && !isStar && !isEx) {
        return `${L}x`;
    } else if (isEx && !isBreak && !isStar) {
        return `${L}b$`;
    } else if (isBreak && isStar && !isEx) {
        return `${L}bx`;
    } else if (isBreak && isEx && !isStar) {
        return `${L}x$`;
    } else if (isEx && isStar && !isBreak) {
        return `${L}bx$`;
    } else {
        return String(L);
    }
}

const visualChangeNote = (note) => {
    const commaIndex = note.index;
    if (commaIndex === undefined || commaIndex === null) return;
    const lane = note.pos;
    if (!lane) return;

    const segment = rawData[commaIndex] ? rawData[commaIndex].trim() : "";
    if (segment === "" || segment.startsWith("||")) return;

    const parts = segment.split('/');
    const partIndex = parts.findIndex(p => {
        const clean = stripLeadingTags(p);
        return clean.startsWith(String(lane));
    });

    if (partIndex === -1) return;

    const originalPart = parts[partIndex];
    const clean = stripLeadingTags(originalPart);
    const prefix = originalPart.substring(0, originalPart.length - clean.length);

    const nextClean = getNextNoteClean(clean, lane);
    const newPart = prefix + nextClean;

    parts[partIndex] = newPart;
    const newSegment = parts.join('/');
    rawData[commaIndex] = newSegment;

    const newContent = rawData.join(',');
    updateEditorAndSave(newContent);

    simpleToast({ content: `已改變音符類型: ${nextClean}`, type: 'success', timeout: 1000 });
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
}

// 暫存使用者選擇的檔案，等待使用者選擇「覆蓋」或「新專案」後再處理
let _pendingFolderFiles = null;

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
        // 有現有內容，先讓使用者選擇怎麼處理
        _pendingFolderFiles = null; // 先清空
        popupWindow({
            title: t('popup.loadConfirm.titleFolder'),
            content: t('popup.loadConfirm.content'),
            buttons: [
                {
                    text: t('popup.loadConfirm.overwrite'),
                    onClick: (ctx) => {
                        ctx.close();
                        // 標記模式後開啟檔案選擇器
                        _pendingFolderFiles = 'overwrite';
                        input.value = '';
                        input.click();
                    }
                },
                {
                    text: t('popup.loadConfirm.newProject'),
                    onClick: (ctx) => {
                        ctx.close();
                        _pendingFolderFiles = 'new';
                        input.value = '';
                        input.click();
                    }
                },
                {
                    text: t('popup.cancel'),
                    hideOnClick: true
                }
            ]
        });
    } else {
        // 沒有現有內容，直接開啟檔案選擇器（視為覆蓋）
        _pendingFolderFiles = 'overwrite';
        input.value = '';
        input.click();
    }
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

    const mode = _pendingFolderFiles || 'overwrite';
    _pendingFolderFiles = null;

    if (mode === 'new') {
        // 建立新專案
        const newId = await projectCreate(t('popup.projectManager.untitled'));
        currentProjectId = newId;
        localStorage.setItem('simai_lastProjectId', currentProjectId);
        console.log(`[Project] 已建立新專案: ${newId}`);
    }

    setDataEmpty(); // 先清空現有資料，避免讀取失敗時殘留舊資料干擾
    await handleFolderInput(files);
    setEndtime(endTime);
    draw();

    // 嘗試用 maidata.title 更新專案名稱
    if (maidata?.title && currentProjectId) {
        projectUpdateName(currentProjectId, maidata.title).catch(() => { });
    }
    simpleToast({ content: mode === 'new' ? t('toast.projectOpenedNew') : t('toast.projectLoadedCurrent'), type: 'success', timeout: 1500 });
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
            projSet('resource_bgm', file).then(() => {
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
                projSet('background_video', file).catch((error) => {
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
                projSet('background_image', file).catch((error) => {
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
                projSet('background_video', file).catch((error) => {
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

    const triggerZipInput = (mode) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    if (mode === 'new') {
                        // 建立新專案
                        const newId = await projectCreate(t('popup.projectManager.untitled'));
                        currentProjectId = newId;
                        localStorage.setItem('simai_lastProjectId', currentProjectId);
                        console.log(`[Project] 已建立新專案: ${newId}`);
                    }
                    setDataEmpty();
                    JSZip.loadAsync(file).then(async (zip) => {
                        await handleFolderInput(zip.files);
                        setEndtime(endTime);
                        draw();
                        // 嘗試用 maidata.title 更新專案名稱
                        if (maidata?.title && currentProjectId) {
                            projectUpdateName(currentProjectId, maidata.title).catch(() => { });
                        }
                        simpleToast({ content: mode === 'new' ? t('toast.projectOpenedNew') : t('toast.projectLoadedCurrent'), type: 'success', timeout: 1500 });
                    });
                    resize();
                };
                reader.readAsArrayBuffer(file);
            }
        };
        input.click();
    };

    if (maidataHaveContext) {
        popupWindow({
            title: t('popup.loadConfirm.titleZip'),
            content: t('popup.loadConfirm.content'),
            buttons: [
                {
                    text: t('popup.loadConfirm.overwrite'),
                    onClick: (ctx) => {
                        ctx.close();
                        triggerZipInput('overwrite');
                    }
                },
                {
                    text: t('popup.loadConfirm.newProject'),
                    onClick: (ctx) => {
                        ctx.close();
                        triggerZipInput('new');
                    }
                },
                {
                    text: t('popup.cancel'),
                    hideOnClick: true
                }
            ]
        });
    } else {
        triggerZipInput('overwrite');
    }
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

changeDisplayMode.addEventListener('change', (e) => {
    settings.displayMode = e.target.value;
    visualEditorRenderer.setZoom(settings.visualZoom);
    previewRender.setZoom(settings.visualZoom);
    saveSettingsDebounce();
    setEditorCss(editorContainer.dataset.hidden !== 'true');
    draw();
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
        syncPlayTimer();
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
            projSet('resource_bgm', file);
        }
    };
    input.click();
});

addVideoButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            backgroundVideo = file;
            editorBackgroundVideo.src = URL.createObjectURL(backgroundVideo);
            editorBackgroundVideo.style.display = 'none';
            editorBackgroundVideo.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
            projSet('background_video', file).then(() => {
                simpleToast({ content: '已儲存背景影片', type: 'success' });
            }).catch((error) => {
                console.error('儲存背景影片失敗:', error);
            });
        }
    };
    input.click();
});

importFromVideoButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            // 1. 載入背景影片
            backgroundVideo = file;
            editorBackgroundVideo.src = URL.createObjectURL(backgroundVideo);
            editorBackgroundVideo.style.display = 'none';
            editorBackgroundVideo.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
            await projSet('background_video', file);

            // 2. 載入背景音樂 (直接使用影片檔案作為音訊來源解碼)
            const url = URL.createObjectURL(file);
            await audioManager.setBackgroundMusic(url, file);
            setEndtime(endTime);
            await projSet('resource_bgm', file);

            simpleToast({ content: t('toast.videoImportSuccess'), type: 'success' });
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
    textEl.textContent = t('popup.download.fileName');
    textEl.style.cssText = "display:block;margin-bottom:5px;font-size:12px;color: lightgray;";
    container.appendChild(textEl);
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = t('popup.download.placeholder');
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
        title: t('popup.download.title'),
        customContent: container,
        buttons: [
            {
                text: t('popup.download.downloadMaidata'),
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
                text: t('popup.download.packZip'),
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
            { text: t('popup.cancel'), hideOnClick: true }
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
    projSet('timeControl', realTime).catch((error) => {
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
        syncPlayTimer();
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
        playStartTimestamp = null;

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
        playStartRealTime = realTime;
        playStartTimestamp = performance.now();

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
    playStartTimestamp = null;
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
    playStartTimestamp = null;
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
        slider.style.display = settings.globalTimeline ? 'block' : 'none';
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
    recordEditorHistory();
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
    recordEditorHistory();
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
    recordEditorHistory();
    inputDebounce();
    editorInput.focus();
}

fVerticalButton.addEventListener('click', () => {
    applyVerticalFlip();
});

fHorizontalButton.addEventListener('click', () => {
    applyHorizontalFlip();
});

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

    // 2. 邏輯更新區塊：僅在播放狀態下推進時間
    if (isPlaying) {
        let timeUpdatedByBgm = false;
        if (audioManager.haveBGM()) {
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

        if (!timeUpdatedByBgm) {
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
    const dpr = window.devicePixelRatio || 1;
    const w = canvasContainer.clientWidth * dpr;
    const h = canvasContainer.clientHeight * dpr;

    if (!force && lastCanvasSize.w === w && lastCanvasSize.h === h) {
        resizeVisualEditor(force);
        return; // 尺寸不變，避免重設畫布造成多餘重排
    }

    lastCanvasSize.w = w;
    lastCanvasSize.h = h;

    const scaleValue = renderer?.scale ?? scale;
    const p = Math.min(w, h) / scaleBase * scaleValue;

    canvas.width = w;
    canvas.height = h;
    if (!secondCtx) ctx.setTransform(p, 0, 0, p, w / 2, h / 2);
    resizeVisualEditor(force);
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

    // 複製主視窗的 style 與 link 標籤（含字型定義）
    Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).forEach(node => {
        externalWindow.document.head.appendChild(node.cloneNode(true));
    });

    // 注入基礎樣式與 Canvas 結構
    const style = externalWindow.document.createElement('style');
    style.textContent = `
        @font-face {
            font-family: 'combo';
            src: url('Fonts/Inter.ttf') format('truetype');
            font-display: swap;
        }
        @font-face {
            font-family: 'mono';
            src: url('Fonts/ShareTechMono-Regular.ttf') format('truetype');
            font-display: swap;
        }
        body {
            margin: 0;
            padding: 0;
            overflow: hidden;
            background-color: #000;
            font-family: "Google Sans", sans-serif;
        }
        #canvasContainer {
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            user-select: none;
            -webkit-user-select: none;
        }
        #secOutline {
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
        .backgroundContainer {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            overflow: hidden;
            user-select: none;
            -webkit-user-select: none;
            z-index: 0;
        }
        .backgroundContainer img,
        .backgroundContainer video {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
    `;
    externalWindow.document.head.appendChild(style);
    externalWindow.document.body.innerHTML = `
        <div id="canvasContainer">
            <div class="backgroundContainer" id="secBackgroundContainer">
                <img id="secBackgroundImage" src="" alt="" onerror="this.style.display='none'">
                <video id="secBackgroundVideo" src="" alt="" onerror="this.style.display='none'" muted></video>
            </div>
            <img src="./Skin/outline.png" alt="" id="secOutline" onerror="this.style.display='none'">
            <canvas id="secondary"></canvas>
        </div>
    `;

    const extCanvas = externalWindow.document.getElementById('secondary');
    const secBgImg = externalWindow.document.getElementById('secBackgroundImage');
    const secBgVideo = externalWindow.document.getElementById('secBackgroundVideo');
    const secBgContainer = externalWindow.document.getElementById('secBackgroundContainer');

    extCanvas.width = 800;
    extCanvas.height = 800;
    secondCtx = extCanvas.getContext('2d');

    syncSecondWindowBackground = function () {
        if (!externalWindow || externalWindow.closed) return;
        const size = Math.min(externalWindow.innerWidth, externalWindow.innerHeight);
        if (secBgContainer) {
            secBgContainer.style.width = size + 'px';
            secBgContainer.style.height = size + 'px';
        }

        const brightnessFilter = `brightness(${1 + 0.1875 * (settings.moviebrightness ?? -4)})`;

        if (secBgImg && editorBackgroundImage) {
            if (secBgImg.src !== editorBackgroundImage.src) {
                secBgImg.src = editorBackgroundImage.src;
            }
            secBgImg.style.display = editorBackgroundImage.style.display;
            secBgImg.style.filter = brightnessFilter;
        }

        if (secBgVideo && editorBackgroundVideo) {
            if (secBgVideo.src !== editorBackgroundVideo.src) {
                secBgVideo.src = editorBackgroundVideo.src;
            }
            secBgVideo.style.display = editorBackgroundVideo.style.display;
            secBgVideo.style.filter = brightnessFilter;

            if (editorBackgroundVideo.src) {
                const playing = playButton.dataset.playing === 'true';

                // 主視窗 Canvas 被隱藏或已開啟外部預覽視窗時，主視窗影片強制暫停以節省資源
                if (!editorBackgroundVideo.paused) {
                    try { editorBackgroundVideo.pause(); } catch (_) { }
                }

                // 獨立視窗影片時間與播放同步
                if (Math.abs(secBgVideo.currentTime - realTime) > VIDEO_SEEK_THRESHOLD) {
                    try { secBgVideo.currentTime = realTime; } catch (_) { }
                }

                if (playing && secBgVideo.paused) {
                    secBgVideo.play().catch(() => { });
                } else if (!playing && !secBgVideo.paused) {
                    secBgVideo.pause();
                }

                secBgVideo.playbackRate = settings.playbackSpeed || 1;
            }
        }
    };

    // 隱藏主視窗的背景 Containers 與 Canvas Outline (Skin)
    if (backgroundContainer) backgroundContainer.style.display = 'none';
    if (canvasOutline) canvasOutline.style.display = 'none';
    if (editorBackgroundVideo && !editorBackgroundVideo.paused) {
        try { editorBackgroundVideo.pause(); } catch (_) { }
    }

    externalWindow.addEventListener('beforeunload', () => {
        console.log("警告：外部視窗即將關閉");
        syncSecondWindowBackground = () => { };
        secondCtx = null;
        ctx = canvas.getContext('2d'); // 切回主 Canvas 的上下文
        renderer.setContext(ctx); // 告訴 renderer 使用主 Canvas 的上下文
        if (backgroundContainer) backgroundContainer.style.display = '';
        if (canvasOutline) canvasOutline.style.display = '';
        draw(); // 重新繪製到主 Canvas
    });

    const syncResize = () => {
        const dpr = externalWindow.devicePixelRatio || 1;
        const size = Math.min(externalWindow.innerWidth, externalWindow.innerHeight);
        extCanvas.width = externalWindow.innerWidth * dpr;
        extCanvas.height = externalWindow.innerHeight * dpr;

        // 重新套用座標系統
        const p = size / scaleBase * (renderer?.scale ?? scale) * dpr;
        secondCtx.setTransform(p, 0, 0, p, extCanvas.width / 2, extCanvas.height / 2);
        syncSecondWindowBackground();
        draw();
    };

    syncResize();

    externalWindow.addEventListener('resize', syncResize);
    if (externalWindow.document.fonts) {
        externalWindow.document.fonts.ready.then(() => {
            syncResize();
        });
    }

    renderer.setContext(secondCtx); // 告訴 renderer 使用第二個 Canvas 的上下文
    draw(); // 重新繪製到第二個 Canvas
}

recordVideoButton.addEventListener('click', async () => {
    if (!window.Mediabunny) {
        simpleToast({ content: t('toast.mediabunnyMissing'), type: 'error' });
        return;
    }

    // 注入雙向滑桿與自訂面板所需的專用 CSS（如果還沒注入過的話）
    if (!document.getElementById('dual-range-style')) {
        const style = document.createElement('style');
        style.id = 'dual-range-style';
        style.textContent = `
            .dual-range-slider {
                position: relative;
                height: 24px;
                margin: 8px 0 4px 0;
            }
            .dual-range-slider input[type=range] {
                position: absolute;
                width: 100%;
                background: none;
                pointer-events: none;
                -webkit-appearance: none;
                top: 50%;
                transform: translateY(-50%);
                margin: 0;
            }
            /* 讓滑桿本體穿透，只有按鈕可以點擊 */
            .dual-range-slider input[type=range]::-webkit-slider-thumb {
                -webkit-appearance: none;
                pointer-events: auto;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #4a90e2;
                cursor: pointer;
                border: 2px solid #fff;
                box-shadow: 0 0 5px rgba(0,0,0,0.5);
                transition: transform 0.1s;
            }
            .dual-range-slider input[type=range]::-webkit-slider-thumb:active {
                transform: scale(1.2);
            }
        `;
        document.head.appendChild(style);
    }

    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:8px;font-size:13px;';

    const inputRefs = {};
    const maxDuration = Number((endTime + musicDelay).toFixed(2)); // 總曲長

    // ==========================================
    // 1. 核心：建立【雙向時間範圍選取器】组件
    // ==========================================
    const timeWrapper = document.createElement('div');
    timeWrapper.style.cssText = 'display:flex;flex-direction:column;margin-bottom:6px;';

    const timeLabel = document.createElement('label');
    timeLabel.style.cssText = 'font-size:12px;color:#888;margin-bottom:2px;';

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'dual-range-slider';

    // 灰色底軌
    const baseTrack = document.createElement('div');
    baseTrack.style.cssText = 'position:absolute;top:50%;left:0;width:100%;height:6px;background:#333;transform:translateY(-50%);border-radius:3px;';

    // 藍色進度條（代表被選中的範圍）
    const highlightTrack = document.createElement('div');
    highlightTrack.style.cssText = 'position:absolute;top:50%;height:6px;background:#4a90e2;transform:translateY(-50%);border-radius:3px;';

    const startInput = document.createElement('input');
    startInput.type = 'range'; startInput.min = '0'; startInput.max = String(maxDuration); startInput.step = '0.01'; startInput.value = '0';

    const endInput = document.createElement('input');
    endInput.type = 'range'; endInput.min = '0'; endInput.max = String(maxDuration); endInput.step = '0.01'; endInput.value = String(maxDuration);

    sliderContainer.append(baseTrack, highlightTrack, startInput, endInput);
    timeWrapper.append(timeLabel, sliderContainer);

    // 更新雙向滑桿的視覺外觀與文字
    const updateDualSlider = () => {
        if (Number(startInput.value) > Number(endInput.value)) {
            startInput.value = endInput.value;
        }
        const startVal = Number(startInput.value);
        const endVal = Number(endInput.value);

        const leftPercent = (startVal / maxDuration) * 100;
        const widthPercent = ((endVal - startVal) / maxDuration) * 100;

        highlightTrack.style.left = `${leftPercent}%`;
        highlightTrack.style.width = `${widthPercent}%`;
        timeLabel.textContent = `${t('popup.recordVideo.recordRange', { start: startVal, end: endVal, dur: (endVal - startVal).toFixed(2) })}`;
    };

    startInput.addEventListener('input', updateDualSlider);
    endInput.addEventListener('input', updateDualSlider);
    updateDualSlider(); // 初始渲染

    // ==========================================
    // 2. 解析度選單 + 自訂欄位
    // ==========================================
    const resField = createLabeledInput1({
        value: '1280x720',
        labelText: t('popup.recordVideo.resolution'),
        type: 'select',
        assign: 'record_res_select',
        ref: inputRefs,
        options: [
            { value: '1920x1080', label: '1920 x 1080 (1080p 16:9)' },
            { value: '1080x1080', label: '1080 x 1080 (1080p 1:1)' },
            { value: '1280x720', label: '1280 x 720 (720p 16:9)' },
            { value: '720x720', label: '720 x 720 (720p 1:1)' },
            { value: '640x360', label: '640 x 360 (360p 16:9)' },
            { value: 'custom', label: t('popup.recordVideo.custom') }
        ]
    });

    const customResContainer = document.createElement('div');
    customResContainer.style.cssText = 'display:none; gap:8px; margin-top:4px;';
    const customWidth = createLabeledInput1({ value: 1080, labelText: t('popup.recordVideo.customWidth'), type: 'number', assign: 'custom_w', ref: inputRefs });
    const customHeight = createLabeledInput1({ value: 720, labelText: t('popup.recordVideo.customHeight'), type: 'number', assign: 'custom_h', ref: inputRefs });
    customWidth.wrapper.style.flex = '1';
    customHeight.wrapper.style.flex = '1';
    customResContainer.append(customWidth.wrapper, customHeight.wrapper);
    resField.wrapper.appendChild(customResContainer);

    resField.input.addEventListener('change', (e) => {
        customResContainer.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    });

    // ==========================================
    // 3. FPS 選單 + 自訂欄位
    // ==========================================
    const fpsField = createLabeledInput1({
        value: '30',
        labelText: 'FPS:',
        type: 'select',
        assign: 'record_fps_select',
        ref: inputRefs,
        options: [
            { value: '120', label: '120' },
            { value: '60', label: '60' },
            { value: '30', label: '30' },
            { value: '24', label: '24' },
            { value: 'custom', label: t('popup.recordVideo.custom') }
        ]
    });

    const customFps = createLabeledInput1({ value: 30, labelText: t('popup.recordVideo.customFps'), type: 'number', assign: 'custom_fps', ref: inputRefs });
    customFps.wrapper.style.cssText = 'display:none; margin-top:4px;';
    fpsField.wrapper.appendChild(customFps.wrapper);

    fpsField.input.addEventListener('change', (e) => {
        customFps.wrapper.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });
    // ==========================================
    // 4. 音量與音訊控制項（改用自訂開關，徹底免疫卡死 Bug）
    // ==========================================
    const bgmVolField = createLabeledInput1({ value: settings.musicVolume, labelText: t('popup.recordVideo.bgmVolume'), type: 'number', assign: 'record_bgm_vol', ref: inputRefs });
    const sfxVolField = createLabeledInput1({ value: settings.SfxVolume, labelText: t('popup.recordVideo.sfxVolume'), type: 'number', assign: 'record_sfx_vol', ref: inputRefs });

    // 💡 封裝一個高質感自訂開關產生器
    const createCustomSwitch = (labelText, defaultChecked) => {
        const labelWrapper = document.createElement('label');
        labelWrapper.style.cssText = 'display:flex;align-items:center;justify-content:between;gap:12px;cursor:pointer;margin-top:4px;user-select:none;width:fit-content;';

        const span = document.createElement('span');
        span.textContent = labelText;
        span.style.cssText = 'color:#ddd;font-size:13px;width:110px;';

        // 開關的外殼軌道
        const switchTrack = document.createElement('div');
        switchTrack.style.cssText = 'display:flex;align-items:center;width:36px;height:20px;background:#333;border-radius:10px;position:relative;transition:all 0.2s ease;border:1px solid #444;';

        // 開關裡面的圓鈕
        const switchThumb = document.createElement('div');
        switchThumb.style.cssText = 'width:14px;height:14px;background:#fff;border-radius:50%;position:absolute;left:2px;transition:all 0.2s ease;';
        switchTrack.appendChild(switchThumb);

        // 內部狀態變數
        let isChecked = defaultChecked;

        // 刷新視覺外觀的函式
        const refreshUI = () => {
            if (isChecked) {
                switchTrack.style.background = '#4a90e2';
                switchTrack.style.borderColor = '#5fa4f5';
                switchThumb.style.left = '18px';
            } else {
                switchTrack.style.background = '#1a1a1a';
                switchTrack.style.borderColor = '#333';
                switchThumb.style.left = '3px';
            }
        };
        refreshUI(); // 初始渲染

        // 點擊事件：手動切換狀態，並強制阻止任何可能卡死它的全域預設行為
        labelWrapper.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isChecked = !isChecked;
            refreshUI();
        });

        labelWrapper.append(span, switchTrack);

        return {
            wrapper: labelWrapper,
            // 讓外部可以用 .checked 隨時撈出當前布林值
            get checked() { return isChecked; }
        };
    };

    // 實體化兩個帥氣的藍色動態開關
    const audioSwitch = createCustomSwitch(t('popup.recordVideo.includeAudio'), !!audioManager?.bgmBuffer);
    const sfxSwitch = createCustomSwitch(t('popup.recordVideo.includeSfx'), true);

    // 全部塞進彈窗大容器
    container.append(
        timeWrapper,
        resField.wrapper,
        fpsField.wrapper,
        bgmVolField.wrapper,
        sfxVolField.wrapper,
        audioSwitch.wrapper, // 塞入外殼
        sfxSwitch.wrapper   // 塞入外殼
    );

    popupWindow({
        title: t('popup.recordVideo.title'),
        customContent: container,
        width: '420px',
        buttons: [
            {
                text: t('popup.start'),
                onClick: async (pwCtx) => {
                    const startVal = Number(startInput.value);
                    const endVal = Number(endInput.value);

                    let widthVal, heightVal;
                    if (resField.input.value === 'custom') {
                        widthVal = parseInt(inputRefs.custom_w?.value || 1080, 10);
                        heightVal = parseInt(inputRefs.custom_h?.value || 720, 10);
                    } else {
                        [widthVal, heightVal] = resField.input.value.split('x').map(Number);
                    }

                    let fpsVal;
                    if (fpsField.input.value === 'custom') {
                        fpsVal = parseInt(inputRefs.custom_fps?.value || 30, 10);
                    } else {
                        fpsVal = parseInt(fpsField.input.value, 10);
                    }

                    const bgmVolValNum = Number(inputRefs.record_bgm_vol?.value || 1);
                    const sfxVolValNum = Number(inputRefs.record_sfx_vol?.value || 1);
                    const bgmLoaded = !!audioManager?.bgmBuffer;

                    if (playButton.dataset.playing === 'true') playButton.click();

                    videoRender(audioManager, canvas, renderer, {
                        start: startVal,
                        end: endVal,
                        fps: fpsVal,
                        width: widthVal,
                        height: heightVal,
                        bgmVolume: bgmVolValNum,
                        sfxVolume: sfxVolValNum,
                        includeBgm: audioSwitch.checked && bgmLoaded, // 讀取自訂狀態
                        includeSfx: sfxSwitch.checked,                 // 讀取自訂狀態
                        musicDelay,
                        editorBackgroundImage,
                        editorBackgroundVideo,
                        notes,
                        playScoreRes,
                    });

                    pwCtx.close();
                },
            },
            { text: t('popup.cancel'), hideOnClick: true }
        ]
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
                    undoButton.click();
                    simpleToast({ content: '復原譜面變更', type: 'info', timeout: 1200 });
                }
                break;
            }

            case 'y': {
                if (document.activeElement === editorInput) {
                    e.preventDefault();
                    redoButton.click();
                    simpleToast({ content: '重作譜面變更', type: 'info', timeout: 1200 });
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
window.addEventListener("unload", closeExternalWindow);

let playedClock = [false, false, false, false];

import { SimaiLogicControler } from './helper.js';
const simaiLogicControler = new SimaiLogicControler(audioManager);

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
    ctx.font = `600 ${Math.max(14, Math.round(18 * dpr))}px "Google Sans", sans-serif`;
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
        nowIndex
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
    ]);

    restoreTimebase(tb1);

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
        musicDelay = 0;
        offsetInput.value = 0;
    }

    if (bgVideo) {
        backgroundVideo = bgVideo;
        editorBackgroundVideo.src = URL.createObjectURL(bgVideo);
        editorBackgroundVideo.style.display = 'none';
        editorBackgroundVideo.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
    } else {
        backgroundVideo = null;
        editorBackgroundVideo.src = "";
        editorBackgroundVideo.style.display = 'none';
    }

    if (bg) {
        backgroundImage = bg;
        editorBackgroundImage.src = URL.createObjectURL(bg);
        editorBackgroundImage.style.display = settings.hideBackgroundWhenPaused ? 'none' : 'block';
        editorBackgroundImage.style.filter = `brightness(${1 + 0.1875 * settings.moviebrightness})`;
    } else {
        backgroundImage = null;
        editorBackgroundImage.src = "";
        editorBackgroundImage.style.display = 'none';
    }

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
function openProjectManager() {
    const setStyle = (el, styles) => Object.assign(el.style, styles);

    const buildList = async (container) => {
        container.innerHTML = '';
        const list = await projectList();

        if (list.length === 0) {
            container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">尚無任何專案</div>';
            return;
        }

        // 按更新時間排序（最近的在上）
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        for (const proj of list) {
            const isCurrent = proj.id === currentProjectId;
            const row = document.createElement('div');
            setStyle(row, {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: isCurrent ? '#333' : '#1a1a1a',
                border: isCurrent ? '1px solid #ccc' : '1px solid #333',
                borderRadius: '6px',
                marginBottom: '6px',
                gap: '8px',
                transition: 'background 0.15s',
            });

            // 左側：名稱 + 時間
            const infoDiv = document.createElement('div');
            setStyle(infoDiv, { flex: '1', minWidth: '0', overflow: 'hidden' });

            const nameSpan = document.createElement('span');
            nameSpan.textContent = proj.name || '未命名專案';
            setStyle(nameSpan, {
                fontWeight: '600',
                fontSize: '13px',
                color: isCurrent ? '#fff' : '#ccc',
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            });
            if (isCurrent) nameSpan.textContent += ' （目前）';

            const timeSpan = document.createElement('span');
            const d = new Date(proj.updatedAt || proj.createdAt);
            timeSpan.textContent = `上次編輯：${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
            setStyle(timeSpan, { fontSize: '10px', color: '#888', display: 'block', marginTop: '2px' });

            infoDiv.appendChild(nameSpan);
            infoDiv.appendChild(timeSpan);

            // 右側：按鈕
            const btnGroup = document.createElement('div');
            setStyle(btnGroup, { display: 'flex', gap: '4px', flexShrink: '0' });

            const makeBtn = (text, onClick, color = '#404040') => {
                const btn = document.createElement('button');
                btn.textContent = text;
                setStyle(btn, {
                    background: color,
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                });
                btn.addEventListener('mouseenter', () => btn.style.opacity = '0.8');
                btn.addEventListener('mouseleave', () => btn.style.opacity = '1');
                btn.onclick = onClick;
                return btn;
            };

            if (!isCurrent) {
                btnGroup.appendChild(makeBtn('開啟', async () => {
                    await loadProject(proj.id);
                    simpleToast({ content: `已切換至專案：${proj?.name || '未命名'}`, type: 'success', timeout: 1500 });
                    buildList(container);
                }, '#2d6e2d'));
            }

            btnGroup.appendChild(makeBtn('重新命名', async () => {
                const newName = prompt('請輸入新的專案名稱：', proj.name || '');
                if (newName !== null && newName.trim() !== '') {
                    await projectRename(proj.id, newName.trim());
                    buildList(container);
                }
            }));

            btnGroup.appendChild(makeBtn('刪除', async () => {
                if (isCurrent) {
                    alert('無法刪除目前正在使用的專案。\n請先切換到其他專案後再刪除。');
                    return;
                }
                if (!confirm(`確定要刪除專案「${proj.name || '未命名'}」嗎？\n此操作無法復原！`)) return;
                await projectDelete(proj.id);
                buildList(container);
                simpleToast({ content: '已刪除專案', type: 'success', timeout: 1200 });
            }, '#6e2d2d'));

            row.appendChild(infoDiv);
            row.appendChild(btnGroup);
            container.appendChild(row);
        }
    };

    const container = document.createElement('div');
    setStyle(container, {
        maxHeight: '350px',
        overflowY: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: '#555 transparent',
    });

    buildList(container);

    popupWindow({
        title: "專案總管",
        customContent: container,
        width: 480,
        maxWidth: 560,
        buttons: [
            {
                text: "新建空白專案",
                onClick: async () => {
                    const name = prompt('請輸入專案名稱：', '未命名專案');
                    if (name === null) return;
                    const newId = await projectCreate(t('popup.projectManager.untitled'));
                    const proj = await loadProject(newId);
                    simpleToast({ content: `已切換至專案：${proj.name || '未命名'}`, type: 'success', timeout: 1500 });
                    buildList(container);
                }
            },
            {
                text: t('popup.close'),
                hideOnClick: true,
            }
        ]
    });
}

// 綁定專案總管按鈕
const projectManagerButton = getButton("projectManager", "utility");
if (projectManagerButton) {
    projectManagerButton.addEventListener('click', () => {
        openProjectManager();
    });
}

function _init() {
    popupWindow({
        title: t('popup.init.title'),
        content: "",
        buttons: [],
        unclosable: true,
        onOpen: async (ctx) => {
            try {
                const step = (p, msg) => (ctx.setProgress(p), ctx.setContent(msg));
                await audioManager.init((pct, key) => step(pct * 0.4, t('popup.init.loadingSfx', { key, percent: Math.round(pct) })));

                images = await loadAllImages((pct, key) => step(40 + pct * 0.4, t('popup.init.loadingAssets', { key, percent: Math.round(pct) })));

                // === 專案系統初始化 ===
                step(78, t('popup.init.initProjects'));
                const migratedId = await migrateFromLegacy();
                if (migratedId) {
                    currentProjectId = migratedId;
                    localStorage.setItem('simai_lastProjectId', currentProjectId);
                    console.log(`[Project] 遷移完成，使用專案: ${currentProjectId}`);
                } else {
                    // 嘗試從 localStorage 取得上次使用的專案
                    const lastId = localStorage.getItem('simai_lastProjectId');
                    const list = await projectList();
                    if (lastId && list.some(p => p.id === lastId)) {
                        currentProjectId = lastId;
                    } else if (list.length > 0) {
                        // 使用最後更新的專案
                        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                        currentProjectId = list[0].id;
                    } else {
                        // 全新使用者，建立預設空白專案
                        currentProjectId = await projectCreate(t('popup.projectManager.untitled'));
                    }
                    localStorage.setItem('simai_lastProjectId', currentProjectId);
                }

                // === 載入全域設定 (不隨專案切換) ===
                step(80, t('popup.init.restoringSettings'));
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
                    playbackSpeedInput.value = settings.playbackSpeed;
                } else {
                    settings = { ...defaultSettings }
                    await idbSet('simai_settings', JSON.stringify(settings));
                };

                // 🟢 關鍵修復：初始化完成後立刻將載入的音量設定套用到 audioManager
                applyAudioSettings(settings);

                // === 載入當前專案資料 ===
                step(84, t('popup.init.restoringState'));
                await loadProjectData(step);

                window.settings = settings;
                applySplitRatio(settings.splitRatio ?? 0.5);
                if (settings.canvasSnapped) {
                    snapHideCanvas();
                }
                changeDisplayMode.value = settings.displayMode ?? 'simai';
                renderer = new SimaiRenderer(canvas, settings);
                renderer.setImages(images);
                visualEditorRenderer = new SimaiVisualEditor(visualEditor, settings);
                visualEditorRenderer.setImages(images);
                visualEditorRenderer.setContext(visualCtx || visualEditor.getContext('2d'));
                visualEditorRenderer.setZoom(settings.visualZoom);
                visualEditorRenderer.setNoteEditCallbacks(visualPlaceNote, visualDeleteNote, visualChangeNote);
                visualEditorRenderer.setTimeQuantizer(quantizeTime);
                audioManager.setBGMVolume(settings.musicVolume);
                previewRender = new SimaiPreviewRenderer(previewCanvas, settings);
                previewRender.setZoom(settings.visualZoom);
                setPlaybackSpeed(settings.playbackSpeed);
                draw();
                updateSlider(realTime);
                setEditorCss(!await projGet('hide_editor'));
                step(100, "完成！正在渲染畫面...");
                resize(); ctx.close();
                isInitComplete = true;
                updateDiscordRPC(maidata, nowDifficulty);
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
                                if (typeof key === 'string' && (key.startsWith('simai_') || key.startsWith('proj_') || key === '__project_list__')) {
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
                    text: t('popup.close'),
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

// 全域解鎖 AudioContext 監聽器，確保首次使用者互動時能解鎖被瀏覽器掛起的 AudioContext
const unlockAudio = () => {
    if (audioManager) {
        audioManager.ensureContextSync();
    }
};
window.addEventListener('click', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
window.addEventListener('touchstart', unlockAudio, { once: true });