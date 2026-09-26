import { contantRotate, flipSelectedText, simpleToast } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 切換 Break (bk) 與 EX (ex) 音符旗標邏輯
 */
export function toggleNoteFlag(inputStr, flagType) {
    if (!inputStr) return inputStr;

    const slideSymbolRegex = /(?:pp)|(?:qq)|[-<>^vpqszVw]/;

    function toggleSinglePart(part) {
        let note = part.trim();
        if (!note) return part;

        // 1. Touch 音符不適用 (如 C, Cf, A1, E8f)
        if (/^(?:[ABCDE][1-8]|C)/.test(note)) {
            return part;
        }

        // 2. 雙打縮寫音符 (如 35, 42, 81)
        if (/^[1-8]{2}$/.test(note)) {
            const pos1 = note[0];
            const pos2 = note[1];
            if (flagType === 'bk') {
                return `${pos1}b/${pos2}b`;
            } else if (flagType === 'ex') {
                return `${pos1}x/${pos2}x`;
            }
        }

        const isSlide = slideSymbolRegex.test(note);

        if (flagType === 'bk') {
            if (isSlide) {
                const headHasB = /^\d+b|\*\d+b/.test(note);
                const firstSlideMatch = note.match(/(?:pp)|(?:qq)|[-<>^vpqszVw]/);
                const slideBody = firstSlideMatch ? note.slice(firstSlideMatch.index) : '';
                const endHasB = /b/.test(slideBody);

                let nextHeadB = false;
                let nextEndB = false;

                if (!headHasB && !endHasB) {
                    nextHeadB = true;
                    nextEndB = true;
                } else if (headHasB && endHasB) {
                    nextHeadB = false;
                    nextEndB = false;
                } else if (headHasB && !endHasB) {
                    nextHeadB = false;
                    nextEndB = true;
                } else {
                    nextHeadB = true;
                    nextEndB = false;
                }

                let res = note.replace(/b/g, '');
                if (nextHeadB) {
                    res = res.replace(/^(\d+)/, '$1b');
                    res = res.replace(/\*(\d+)/g, '*$1b');
                }
                if (nextEndB) {
                    res = res.replace(/(\[[^\]]+\])/g, '$1b');
                }
                return res;
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

        const tagMatch = codeToken.match(/^((?:\([^\)]*\)|\{[^\}]*\}|\s+)*)([\s\S]*)$/);
        if (!tagMatch) return toggleSinglePart(codeToken);

        const prefixTags = tagMatch[1];
        const noteContent = tagMatch[2];

        if (!noteContent.trim()) {
            return prefixTags;
        }

        const parts = noteContent.split('/');

        if (parts.length === 2) {
            const p1 = parts[0].trim();
            const p2 = parts[1].trim();

            if (flagType === 'bk') {
                const match1 = p1.match(/^([1-8])b$/);
                const match2 = p2.match(/^([1-8])b$/);
                if (match1 && match2) {
                    return prefixTags + match1[1] + match2[1];
                }
            } else if (flagType === 'ex') {
                const match1 = p1.match(/^([1-8])x$/);
                const match2 = p2.match(/^([1-8])x$/);
                if (match1 && match2) {
                    return prefixTags + match1[1] + match2[1];
                }
            }
        }

        const newParts = parts.map(part => toggleSinglePart(part));
        return prefixTags + newParts.join('/');
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

/**
 * 處理選取區間或全文的 BK/EX 切換
 */
export function handleToggleBkEx(flagType, { editorInput }) {
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

/**
 * 針對選取範圍進行度數旋轉
 */
export function applySelectedRotation(direction, { editorInput, applyHighlight, recordEditorHistory, inputDebounce }) {
    if (!editorInput) return;
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
    if (typeof applyHighlight === 'function') applyHighlight(newText);
    if (typeof recordEditorHistory === 'function') recordEditorHistory();
    if (typeof inputDebounce === 'function') inputDebounce();
    editorInput.focus();
}

/**
 * 垂直鏡像翻轉
 */
export function applyVerticalFlip({ editorInput, applyHighlight, recordEditorHistory, inputDebounce }) {
    if (!editorInput) return;
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
    });

    const newText = `${fullText.slice(0, start)}${rotated}${fullText.slice(end)}`;
    editorInput.value = newText;
    editorInput.selectionStart = start;
    editorInput.selectionEnd = start + rotated.length;
    editorInput.setSelectionRange(start, start + rotated.length);
    if (typeof applyHighlight === 'function') applyHighlight(newText);
    if (typeof recordEditorHistory === 'function') recordEditorHistory();
    if (typeof inputDebounce === 'function') inputDebounce();
    editorInput.focus();
}

/**
 * 水平鏡像翻轉
 */
export function applyHorizontalFlip({ editorInput, applyHighlight, recordEditorHistory, inputDebounce }) {
    if (!editorInput) return;
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
        '<': '>',
        '>': '<'
    });

    const newText = `${fullText.slice(0, start)}${rotated}${fullText.slice(end)}`;
    editorInput.value = newText;
    editorInput.selectionStart = start;
    editorInput.selectionEnd = start + rotated.length;
    editorInput.setSelectionRange(start, start + rotated.length);
    if (typeof applyHighlight === 'function') applyHighlight(newText);
    if (typeof recordEditorHistory === 'function') recordEditorHistory();
    if (typeof inputDebounce === 'function') inputDebounce();
    editorInput.focus();
}
