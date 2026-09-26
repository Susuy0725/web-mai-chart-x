import { simpleToast } from '../helper.js';
import { t } from '../i18n.js';

let findMatches = [];
let currentMatchIndex = -1;
let domElements = {};

export function initFindReplace(elements) {
    domElements = elements;
    const {
        findReplaceBar,
        findInput,
        replaceInput,
        findPrevBtn,
        findNextBtn,
        findCloseBtn,
        replaceOneBtn,
        replaceAllBtn,
        findReplaceButton,
        editorContainer,
    } = elements;

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

    if (replaceOneBtn) replaceOneBtn.addEventListener('click', executeReplaceOne);
    if (replaceAllBtn) replaceAllBtn.addEventListener('click', executeReplaceAll);

    // 面板自由拖曳移動邏輯
    if (findReplaceBar) {
        let isDraggingBar = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let initialLeft = 0;
        let initialTop = 0;

        findReplaceBar.addEventListener('pointerdown', (e) => {
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
}

export function updateFindMatches() {
    findMatches = [];
    currentMatchIndex = -1;

    const { findInput, editorInput, findMatchCount } = domElements;
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

export function updateFindCountUI() {
    const { findMatchCount } = domElements;
    if (!findMatchCount) return;
    if (findMatches.length === 0) {
        findMatchCount.textContent = '0/0';
    } else {
        findMatchCount.textContent = `${currentMatchIndex + 1}/${findMatches.length}`;
    }
}

export function jumpToMatch(index, autoFocusEditor = true) {
    if (findMatches.length === 0) return;
    const { editorInput } = domElements;
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

export function openFindBar(showReplace = false) {
    const { findReplaceBar, replaceRow, editorInput, findInput } = domElements;
    if (!findReplaceBar) return;
    findReplaceBar.style.display = 'flex';
    if (replaceRow) {
        replaceRow.style.display = showReplace ? 'flex' : 'none';
    }

    if (editorInput && findInput) {
        const selStart = editorInput.selectionStart;
        const selEnd = editorInput.selectionEnd;
        if (selStart !== selEnd && (selEnd - selStart) < 100) {
            const selText = editorInput.value.slice(selStart, selEnd);
            if (selText && !selText.includes('\n')) {
                findInput.value = selText;
            }
        }
    }

    updateFindMatches();
    if (findInput) {
        findInput.focus();
        findInput.select();
    }
}

export function closeFindBar() {
    const { findReplaceBar, editorInput } = domElements;
    if (findReplaceBar) {
        findReplaceBar.style.display = 'none';
    }
    if (editorInput) {
        editorInput.focus();
    }
}

export function executeReplaceOne() {
    if (findMatches.length === 0 || currentMatchIndex === -1) return;
    const { editorInput, replaceInput } = domElements;
    if (!editorInput) return;

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

export function executeReplaceAll() {
    const { editorInput, findInput, replaceInput } = domElements;
    if (!editorInput) return;

    const searchText = findInput ? findInput.value : '';
    if (!searchText) return;

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
