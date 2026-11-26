import { findHighlightDomPos } from './editorHighlightOverlay.js';
import { t } from '../i18n.js';

const VIEWPORT_MARGIN = 8;
const MAX_VISIBLE_ITEMS = 8;

const DEFAULT_TIME_DIVISIONS = ['1', '2', '4', '8', '3', '6', '12', '16', '24', '32'];
const DEFAULT_TIME_COUNTS = ['1', '2', '3', '4', '5', '6', '7', '8', '12', '16'];
const DEFAULT_TIME_SEC_SUGGESTIONS = ['#0.5', '#1', '#0.25', '#0.75', '#1.5', '#2'];
const DEFAULT_SPLIT_SUGGESTIONS = ['4', '8', '12', '16', '24', '32', '48', '64', '1', '2', '3', '6'];
const DEFAULT_TAG_TEMPLATES = [
    { value: 'HS*1', insertText: 'HS*', cursorBeforeClose: true },
    { value: 'SIZE*1', insertText: 'SIZE*', cursorBeforeClose: true },
    { value: 'SIZE*(1,1)', insertText: 'SIZE*(1,1)', cursorBeforeClose: false },
    { value: 'COLOR*FFFFFF', insertText: 'COLOR*', cursorBeforeClose: true },
];

const CONTEXT_CONFIG = {
    '[': { close: ']', type: 'time' },
    '{': { close: '}', type: 'split' },
    '(': { close: ')', type: 'bpm' },
    '<': { close: '>', type: 'tag' },
};

const SLIDE_BUTTONS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * 計算指定起點與 Slide 類型（及 V 折點）的所有合法終點按鈕 (1~8)
 * 規則與 `Scripts/decode.js` 的 `computeSlidePath` 完全一致
 * @param {number} head
 * @param {string} slideType
 * @param {number|null} [mid=null]
 * @returns {number[]}
 */
export function getLegalSlideEnds(head, slideType, mid = null) {
    if (!Number.isInteger(head) || head < 1 || head > 8) return [];
    switch (slideType) {
        case '-':
            return SLIDE_BUTTONS.filter((end) => {
                const c = (end - head + 8) % 8;
                return end !== head && c !== 1 && c !== 7;
            });
        case '^':
        case 'v':
            return SLIDE_BUTTONS.filter((end) => {
                const c = (end - head + 8) % 8;
                return end !== head && c !== 4;
            });
        case '>':
        case '<':
        case 'p':
        case 'q':
        case 'pp':
        case 'qq':
            return [...SLIDE_BUTTONS];
        case 's':
        case 'z':
        case 'w':
            return [((head - 1 + 4) % 8) + 1];
        case 'V': {
            if (!Number.isInteger(mid) || mid < 1 || mid > 8 || mid === head) return [];
            const s = (head - mid + 8) % 8;
            if (s !== 2 && s !== 6) return [];
            return SLIDE_BUTTONS.filter((end) => {
                if (end === head || end === mid) return false;
                const m = (mid - end + 8) % 8;
                return s === 2 ? (m >= 2 && m <= 5) : (m >= 3 && m <= 6);
            });
        }
        default:
            return [];
    }
}

/**
 * 解析游標目前是否位於 Slide 符號後方，等待補全終點按鈕（例如 `1w`、`1-`、`1V`、`1V3`、`1-5*p`、`1-5[8:1]-`）
 * @param {string} text
 * @param {number} cursor
 * @returns {{ type: 'slide', head: number, slideType: string, mid: number|null, openIdx: number, replaceEnd: number, prefix: string, hasFollowingBracket: boolean, followingEmptyBracket: boolean } | null}
 */
export function detectSlideContext(text, cursor) {
    if (typeof text !== 'string' || cursor <= 0 || cursor > text.length) return null;
    if (isCursorInComment(text, cursor)) return null;

    // 往回取出目前這個音符群組片段（遇換行、逗號、斜線、反引號、空白或標籤結尾/未閉合括號停止；允許通過 `[...]`）
    let segStart = cursor;
    while (segStart > 0) {
        const ch = text[segStart - 1];
        if (/[\s,/`{}()<>]/.test(ch)) {
            // 注意 `<` 和 `>` 也可能是 Slide 符號，不可在此截斷！
            if (ch !== '<' && ch !== '>') break;
        }
        segStart--;
    }

    const noteSeg = text.slice(segStart, cursor);
    if (!noteSeg) return null;

    // 將 `[...]` 替換為佔位符以解析前方的軌道結構，保留原始字串長度對齊
    const stripped = noteSeg.replace(/\[[^\[\]]*\]/g, (m) => ' '.repeat(m.length));

    // 先檢查是否為 `V` 折線已輸入中繼點（如 `1V3`）或剛輸入 Slide 符號（`1w`、`1-`、`1pp`、`1V` 等）
    const slideTailMatch = stripped.match(/((?:pp)|(?:qq)|[-<>^vpqszVw])([1-8])?$/);
    if (!slideTailMatch) return null;

    const slideType = slideTailMatch[1];
    const midStr = slideTailMatch[2] || null;
    // 只有 V 允許在符號後先接一個中繼按鈕數字 `mid` 再補全終點；其餘符號接了數字即代表已完成終點
    if (midStr && slideType !== 'V') return null;

    const symbolStartInSeg = slideTailMatch.index;
    const beforeSymbol = stripped.slice(0, symbolStartInSeg);

    // 判斷此次 Slide 的起點按鈕 head：
    // 若緊鄰前面是 `*`（同頭多段 Slide，如 `1-5*p`），起點為整個滑星最前面的頭按鈕；
    // 否則起點為符號前最後一個位置數字（略過修飾符與 `[...]` 空白佔位）。
    let head = NaN;
    if (beforeSymbol.endsWith('*')) {
        const firstHeadMatch = stripped.match(/^(?:[bx$fh@?!m]*?)([1-8])/);
        if (firstHeadMatch) {
            head = parseInt(firstHeadMatch[1], 10);
        }
    } else {
        const cleanedBefore = beforeSymbol.replace(/[\sbx$fh@?!m]+$/g, '');
        const headMatch = cleanedBefore.match(/([1-8])$/);
        if (headMatch) {
            // 排除 Touch 區域前綴（例如 `A1-`、`B2>` 等非 Tap/Star 起點）
            const charBeforeDigit = headMatch.index > 0 ? cleanedBefore[headMatch.index - 1] : '';
            if (!/[ABCDE]/i.test(charBeforeDigit)) {
                head = parseInt(headMatch[1], 10);
            }
        }
    }

    if (isNaN(head) || head < 1 || head > 8) return null;

    const mid = midStr ? parseInt(midStr, 10) : null;
    const hasFollowingBracket = text[cursor] === '[';
    const followingEmptyBracket = text.slice(cursor, cursor + 2) === '[]';

    return {
        type: 'slide',
        head,
        slideType,
        mid,
        openIdx: cursor - 1,
        replaceEnd: cursor,
        prefix: '',
        hasFollowingBracket,
        followingEmptyBracket,
    };
}

/**
 * 判斷游標位置是否位於註解區段內（`|| ...` 單行註解或 `|* ... *|` 多行註解）
 * @param {string} text
 * @param {number} cursor
 * @returns {boolean}
 */
export function isCursorInComment(text, cursor) {
    let i = 0;
    const len = Math.min(cursor, text.length);
    let inBlockComment = false;
    let inLineComment = false;

    while (i < len) {
        const ch = text[i];
        const next = text[i + 1];
        if (inBlockComment) {
            if (ch === '*' && next === '|') {
                inBlockComment = false;
                i += 2;
                continue;
            }
            i++;
        } else if (inLineComment) {
            if (ch === '\n' || ch === '\r') {
                inLineComment = false;
            }
            i++;
        } else {
            if (ch === '|' && next === '*') {
                inBlockComment = true;
                i += 2;
                continue;
            }
            if (ch === '|' && next === '|') {
                inLineComment = true;
                i += 2;
                continue;
            }
            i++;
        }
    }
    return inBlockComment || inLineComment;
}

/**
 * 解析游標目前所在的語法補全上下文（`[...]`、`{...}`、`(...)`、`<...>`）
 * @param {string} text
 * @param {number} cursor
 * @returns {{ type: string, openChar: string, closeChar: string, openIdx: number, replaceEnd: number, hasClosing: boolean, prefix: string } | null}
 */
export function detectAutocompleteContext(text, cursor) {
    if (typeof text !== 'string' || cursor < 0 || cursor > text.length) return null;
    if (isCursorInComment(text, cursor)) return null;

    // 往回尋找最近的未閉合開括號，遇到換行、逗號或對應閉括號即停止
    let openIdx = -1;
    let openChar = '';
    for (let i = cursor - 1; i >= 0; i--) {
        const ch = text[i];
        if (ch === '\n' || ch === '\r' || ch === ',') break;
        if (ch === ']' || ch === '}' || ch === ')' || ch === '>') break;
        if (CONTEXT_CONFIG[ch]) {
            openIdx = i;
            openChar = ch;
            break;
        }
    }

    if (openIdx === -1) return null;

    const cfg = CONTEXT_CONFIG[openChar];
    const prefix = text.slice(openIdx + 1, cursor);

    // 檢查 `<` 是否為 Slide 符號（例如 `1<5`）而非屬性標籤（`<HS*...>`）
    if (openChar === '<') {
        const prevChar = openIdx > 0 ? text[openIdx - 1] : '';
        const looksLikeSlide = /[0-8*]/.test(prevChar);
        const hasTagLetter = /^[A-Za-z]/.test(prefix);
        if (looksLikeSlide && !hasTagLetter) {
            return null;
        }
    }

    // `[` 若內部已有換行或不合法字元，不觸發
    if (/[\r\n]/.test(prefix)) return null;

    // 檢查游標右側是否已有對應閉括號（可能游標與閉括號之間尚有殘餘字元或緊鄰閉括號）
    let closeIdx = -1;
    for (let j = cursor; j < text.length; j++) {
        const ch = text[j];
        if (ch === '\n' || ch === '\r' || ch === ',') break;
        if (ch === cfg.close) {
            closeIdx = j;
            break;
        }
        // 若右側是另一個開括號，代表當前這個還沒閉合
        if (CONTEXT_CONFIG[ch]) break;
    }

    // 僅在右側無空白且確實存在對應閉括號時消耗右側閉括號（例如 `[|]` 或 `[8|:1]`），避免誤吞無關內容
    const trailingInBracket = closeIdx !== -1 ? text.slice(cursor, closeIdx) : '';
    const hasClosing = closeIdx !== -1 && !/\s/.test(trailingInBracket);
    const replaceEnd = hasClosing ? closeIdx + 1 : cursor;

    return {
        type: cfg.type,
        openChar,
        closeChar: cfg.close,
        openIdx,
        replaceEnd,
        hasClosing,
        prefix,
    };
}

/**
 * 去除註解文字，避免從註解內誤收集語法候選值
 * @param {string} text
 * @returns {string}
 */
function stripComments(text) {
    return text
        .replace(/\|\*[\s\S]*?(?:\*\||$)/g, ' ')
        .replace(/\|\|.*$/gm, ' ');
}

/**
 * 從目前譜面蒐集指定括號內的使用值，依出現次數與距離游標的近度排序
 * @param {string} cleanText
 * @param {RegExp} regex
 * @param {number} cursor
 * @returns {string[]}
 */
function collectChartTokens(cleanText, regex, cursor) {
    const stats = new Map();
    let match;
    while ((match = regex.exec(cleanText)) !== null) {
        const val = (match[1] || '').trim();
        if (!val || /[\r\n]/.test(val)) continue;
        const dist = Math.abs(match.index - cursor);
        const entry = stats.get(val);
        if (entry) {
            entry.count += 1;
            if (dist < entry.minDist) entry.minDist = dist;
        } else {
            stats.set(val, { count: 1, minDist: dist });
        }
    }

    return Array.from(stats.entries())
        .sort((a, b) => {
            if (b[1].count !== a[1].count) return b[1].count - a[1].count;
            return a[1].minDist - b[1].minDist;
        })
        .map(([val]) => val);
}

/**
 * 從其他難度譜面 (`maidata.inote_*`) 蒐集指定括號內的使用值，依出現次數排序
 * @param {Object|null} maidata
 * @param {RegExp} regex
 * @param {string} currentText
 * @param {(val: string) => boolean} [filterFn]
 * @returns {string[]}
 */
function collectCrossDifficultyTokens(maidata, regex, currentText, filterFn = null) {
    if (!maidata || typeof maidata !== 'object') return [];
    const stats = new Map();
    const keys = Object.keys(maidata).filter((k) => /^inote_\d+$/.test(k)).sort();

    for (const key of keys) {
        const raw = maidata[key];
        if (typeof raw !== 'string' || !raw || raw === currentText) continue;
        const clean = stripComments(raw);
        const re = new RegExp(regex.source, regex.flags);
        let match;
        while ((match = re.exec(clean)) !== null) {
            const val = (match[1] || '').trim();
            if (!val || /[\r\n]/.test(val)) continue;
            if (filterFn && !filterFn(val)) continue;
            stats.set(val, (stats.get(val) || 0) + 1);
        }
    }

    return Array.from(stats.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([val]) => val);
}

/**
 * 依上下文產生自動補全候選清單
 * @param {{ type: string, closeChar: string, prefix: string }} ctx
 * @param {string} text
 * @param {number} cursor
 * @param {{ recentMap?: Map<string, string[]>, wholeBpm?: string|number|null, maidata?: Object|null }} opts
 * @returns {Array<{ value: string, display: string, insertText: string, cursorBeforeClose?: boolean }>}
 */
export function buildSuggestions(ctx, text, cursor, { recentMap, wholeBpm = null, maidata = null } = {}) {
    const cleanText = stripComments(text);
    const prefix = ctx.prefix;
    const prefixLower = prefix.toLowerCase();
    const recentList = recentMap?.get(ctx.type) || [];

    const seen = new Set();
    const rawItems = [];
    const pushItem = (value, insertText = value, cursorBeforeClose = false, extra = {}) => {
        if (!value || seen.has(value)) return;
        seen.add(value);
        rawItems.push({
            value,
            display: extra.display ?? `${value}${ctx.closeChar}`,
            insertText,
            cursorBeforeClose,
            ...extra,
        });
    };

    // 1. 最近採納過的項目最優先（兩階段時間補全會各自處理最近項目）
    if (ctx.type !== 'time') {
        for (const r of recentList) {
            pushItem(r);
        }
    }

    if (ctx.type === 'time') {
        if (prefix.startsWith('#')) {
            for (const r of recentList) {
                if (r.startsWith('#')) pushItem(r);
            }
            const chartTokens = collectChartTokens(cleanText, /\[([^\[\]\r\n]+)\]/g, cursor);
            for (const tok of chartTokens) {
                if (tok.startsWith('#')) pushItem(tok);
            }
            for (const def of DEFAULT_TIME_SEC_SUGGESTIONS) pushItem(def);
        } else if (prefix.includes(':')) {
            // 第二階段：冒號後方建議「幾切分」（分子），依目前冒號前分母蒐集常用值與預設 1~8
            const colonIdx = prefix.lastIndexOf(':');
            const divPart = prefix.slice(0, colonIdx);
            const countPrefix = prefix.slice(colonIdx + 1);
            const countPrefixLower = countPrefix.toLowerCase();
            const replaceStart = ctx.openIdx + 1 + colonIdx + 1;

            const recentCounts = recentMap?.get(`timeCount:${divPart}`) || [];
            for (const c of recentCounts) {
                pushItem(c, c, false, { replaceStart, recentKey: `timeCount:${divPart}` });
            }

            const chartTokens = collectChartTokens(cleanText, /\[([^\[\]\r\n]+)\]/g, cursor);
            for (const tok of chartTokens) {
                const tcIdx = tok.lastIndexOf(':');
                if (tcIdx === -1) continue;
                const tokDiv = tok.slice(0, tcIdx);
                const tokCount = tok.slice(tcIdx + 1);
                if (tokDiv === divPart && tokCount) {
                    pushItem(tokCount, tokCount, false, { replaceStart, recentKey: `timeCount:${divPart}` });
                }
            }

            for (const defCount of DEFAULT_TIME_COUNTS) {
                pushItem(defCount, defCount, false, { replaceStart, recentKey: `timeCount:${divPart}` });
            }

            if (!countPrefix) {
                return rawItems.slice(0, MAX_VISIBLE_ITEMS);
            }
            const starts = [];
            const contains = [];
            for (const item of rawItems) {
                const valLower = item.value.toLowerCase();
                if (valLower === countPrefixLower) continue;
                if (valLower.startsWith(countPrefixLower)) starts.push(item);
                else if (valLower.includes(countPrefixLower)) contains.push(item);
            }
            return [...starts, ...contains].slice(0, MAX_VISIBLE_ITEMS);
        } else {
            // 第一階段：建議基本切分 `1:`、`2:`、`4:`、`8:`、`3:`、`6:`、`12:` ...，採納後自動進入第二階段
            const chartTokens = collectChartTokens(cleanText, /\[([^\[\]\r\n]+)\]/g, cursor);
            const chartDivs = [];
            for (const tok of chartTokens) {
                const tcIdx = tok.lastIndexOf(':');
                if (tcIdx > 0) {
                    const div = tok.slice(0, tcIdx);
                    if (/^\d+$/.test(div)) chartDivs.push(div);
                }
            }
            const allDivs = [...DEFAULT_TIME_DIVISIONS, ...chartDivs];
            for (const div of allDivs) {
                const insertWithColon = `${div}:`;
                pushItem(div, insertWithColon, false, {
                    display: `${div}:`,
                    cursorOffset: insertWithColon.length,
                    autoTriggerNext: true,
                    skipRecent: true,
                });
            }
        }
    } else if (ctx.type === 'split') {
        const chartTokens = collectChartTokens(cleanText, /\{([^{}\r\n]+)\}/g, cursor);
        for (const tok of chartTokens) pushItem(tok);
        for (const def of DEFAULT_SPLIT_SUGGESTIONS) pushItem(def);
    } else if (ctx.type === 'bpm') {
        const isPositiveBpm = (v) => /^\d+(?:\.\d+)?$/.test(v) && parseFloat(v) > 0;
        const chartTokens = collectChartTokens(cleanText, /\(([^()\r\n]+)\)/g, cursor);
        for (const tok of chartTokens) {
            if (isPositiveBpm(tok)) pushItem(tok);
        }
        const otherDiffBpms = collectCrossDifficultyTokens(maidata, /\(([^()\r\n]+)\)/g, text, isPositiveBpm);
        for (const tok of otherDiffBpms) pushItem(tok);
        const resolvedWholeBpm = wholeBpm ?? maidata?.wholebpm ?? null;
        if (resolvedWholeBpm !== null && resolvedWholeBpm !== undefined && String(resolvedWholeBpm).trim() !== '') {
            const wb = String(resolvedWholeBpm).trim();
            if (isPositiveBpm(wb)) pushItem(wb);
        }
    } else if (ctx.type === 'slide') {
        const { head, slideType, mid, hasFollowingBracket, followingEmptyBracket } = ctx;
        const suffix = hasFollowingBracket ? '' : '[]';
        const pushSlideTarget = (targetStr) => {
            const insertText = `${targetStr}${suffix}`;
            const cursorOffset = hasFollowingBracket
                ? (followingEmptyBracket ? targetStr.length + 1 : targetStr.length)
                : targetStr.length + 1;
            rawItems.push({
                value: targetStr,
                display: insertText,
                insertText,
                cursorOffset,
                autoTriggerNext: !hasFollowingBracket || followingEmptyBracket,
            });
        };

        if (slideType === 'V' && mid === null) {
            const candidateMids = [((head - 1 + 2) % 8) + 1, ((head - 1 + 6) % 8) + 1].sort((a, b) => a - b);
            for (const m of candidateMids) {
                const ends = getLegalSlideEnds(head, 'V', m);
                for (const end of ends) {
                    pushSlideTarget(`${m}${end}`);
                }
            }
        } else {
            const ends = getLegalSlideEnds(head, slideType, mid);
            for (const end of ends) {
                pushSlideTarget(String(end));
            }
        }
        return rawItems.slice(0, MAX_VISIBLE_ITEMS);
    } else if (ctx.type === 'tag') {
        const chartTokens = collectChartTokens(cleanText, /<([A-Za-z][^<>\r\n]*)>/g, cursor);
        for (const tok of chartTokens) pushItem(tok);
        for (const tpl of DEFAULT_TAG_TEMPLATES) {
            pushItem(tpl.value, tpl.insertText, tpl.cursorBeforeClose);
        }
    }

    if (!prefix) {
        return rawItems.slice(0, MAX_VISIBLE_ITEMS);
    }

    // 前綴比對優先，其次子字串比對
    const startsWithMatches = [];
    const containsMatches = [];
    for (const item of rawItems) {
        const valLower = item.value.toLowerCase();
        if (valLower === prefixLower) continue; // 已完全輸入就無需重複提示
        if (valLower.startsWith(prefixLower)) {
            startsWithMatches.push(item);
        } else if (valLower.includes(prefixLower)) {
            containsMatches.push(item);
        }
    }

    return [...startsWithMatches, ...containsMatches].slice(0, MAX_VISIBLE_ITEMS);
}

/**
 * 計算編輯器 textarea 游標目前在視口中的座標 `{ left, top, bottom }`
 * 優先複用 `editorHighlightOverlay.textIndex` 以避免重建全文件 DOM；必要時回退至單行計算。
 * @param {HTMLTextAreaElement} editorInput
 * @param {HTMLElement} highlightLayer
 * @param {import('./editorHighlightOverlay.js').EditorHighlightOverlay|null} editorHighlightOverlay
 * @param {number} cursor
 * @returns {{ left: number, top: number, bottom: number } | null}
 */
function measureCaretViewportRect(editorInput, highlightLayer, editorHighlightOverlay, cursor) {
    if (!editorInput) return null;
    const text = editorInput.value || '';
    const refEl = highlightLayer || editorInput;
    const layerRect = refEl.getBoundingClientRect();
    const cs = window.getComputedStyle(editorInput);
    const padLeft = parseFloat(cs.paddingLeft) || 0;
    const padTop = parseFloat(cs.paddingTop) || 0;
    const fontSize = parseFloat(cs.fontSize) || 14;
    const rawLineHeight = parseFloat(cs.lineHeight);
    const lineHeight = Number.isFinite(rawLineHeight) ? rawLineHeight : Math.round(fontSize * 1.5);

    const isSynced = Boolean(
        editorHighlightOverlay
        && editorHighlightOverlay.textIndex.length > 0
        && highlightLayer
        && highlightLayer.textContent.length >= text.length
    );

    if (isSynced && text.length > 0) {
        const range = document.createRange();
        // 優先測量游標前一個非換行字元的右緣
        if (cursor > 0 && text[cursor - 1] !== '\n' && text[cursor - 1] !== '\r') {
            const startPos = findHighlightDomPos(editorHighlightOverlay.textIndex, cursor - 1, false);
            const endPos = findHighlightDomPos(editorHighlightOverlay.textIndex, cursor, true);
            if (startPos && endPos) {
                range.setStart(startPos.node, startPos.offset);
                range.setEnd(endPos.node, endPos.offset);
                const rects = range.getClientRects();
                const lastRect = rects && rects.length > 0 ? rects[rects.length - 1] : null;
                if (lastRect && lastRect.height > 0) {
                    return { left: lastRect.right, top: lastRect.top, bottom: lastRect.bottom };
                }
            }
        }

        // 若游標位於行首且右側有非換行字元，取該字元的左緣
        if (cursor < text.length && text[cursor] !== '\n' && text[cursor] !== '\r') {
            const startPos = findHighlightDomPos(editorHighlightOverlay.textIndex, cursor, false);
            const endPos = findHighlightDomPos(editorHighlightOverlay.textIndex, cursor + 1, true);
            if (startPos && endPos) {
                range.setStart(startPos.node, startPos.offset);
                range.setEnd(endPos.node, endPos.offset);
                const rects = range.getClientRects();
                const firstRect = rects && rects.length > 0 ? rects[0] : null;
                if (firstRect && firstRect.height > 0) {
                    return { left: firstRect.left, top: firstRect.top, bottom: firstRect.bottom };
                }
            }
        }
    }

    // 空行或尚未同步時的精簡回退：僅量測游標前行數與當前行前綴
    const before = text.slice(0, cursor);
    const lines = before.split('\n');
    const currentLineText = lines[lines.length - 1] || '';
    const lineIndex = lines.length - 1;

    const top = layerRect.top + padTop + lineIndex * lineHeight - editorInput.scrollTop;
    const bottom = top + lineHeight;
    let left = layerRect.left + padLeft - editorInput.scrollLeft;

    if (currentLineText.length > 0) {
        const canvas = measureCaretViewportRect._canvas || (measureCaretViewportRect._canvas = document.createElement('canvas'));
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            left += ctx.measureText(currentLineText).width;
        }
    }

    return { left, top, bottom };
}

/**
 * 初始化編輯器語法自動補全浮動選單
 * @param {Object} options
 */
export function initEditorAutocomplete({
    editorInput,
    editorContainer,
    highlightLayer,
    editorHighlightOverlay,
    getSettings,
    getMaidata,
    isVisualMode,
    applyHighlight,
    inputDebounce,
    recordEditorHistory,
    openSettings,
}) {
    if (!editorInput) {
        return {
            refresh: () => { },
            close: () => { },
            isOpen: () => false,
        };
    }

    const dropdown = document.createElement('div');
    dropdown.id = 'editor-autocomplete-dropdown';
    dropdown.className = 'utilityDropdown-content editor-autocomplete-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', t('settings.items.editorAutocomplete') || 'Autocomplete');

    const listEl = document.createElement('div');
    listEl.className = 'editor-autocomplete-list';
    dropdown.appendChild(listEl);

    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'editor-autocomplete-settings-btn';
    settingsBtn.setAttribute('aria-label', t('menu.settings') || '設定');
    settingsBtn.setAttribute('data-i18n-aria-label', 'menu.settings');
    settingsBtn.setAttribute('data-i18n-title', 'menu.settings');
    settingsBtn.title = t('menu.settings') || '設定';
    settingsBtn.innerHTML = '<span class="material-symbols-outlined" translate="no">settings</span>';
    dropdown.appendChild(settingsBtn);

    document.body.appendChild(dropdown);

    const recentMap = new Map();
    let isOpen = false;
    let items = [];
    let activeIndex = 0;
    let activeCtx = null;
    let dismissedAtKey = null;

    const recordRecent = (type, value) => {
        if (!type || !value) return;
        const prev = recentMap.get(type) || [];
        const next = [value, ...prev.filter(v => v !== value)].slice(0, 12);
        recentMap.set(type, next);
    };

    const getContextKey = (ctx) => (ctx ? `${ctx.type}:${ctx.openIdx}:${ctx.prefix}` : null);

    const close = (markDismissed = false) => {
        if (markDismissed && activeCtx) {
            dismissedAtKey = getContextKey(activeCtx);
        }
        if (!isOpen) return;
        isOpen = false;
        items = [];
        activeCtx = null;
        dropdown.classList.remove('open');
    };

    const updateActiveClass = () => {
        const children = listEl.children;
        for (let i = 0; i < children.length; i++) {
            children[i].classList.toggle('active', i === activeIndex);
            children[i].setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
        }
        const activeEl = children[activeIndex];
        if (activeEl && typeof activeEl.scrollIntoView === 'function') {
            activeEl.scrollIntoView({ block: 'nearest' });
        }
    };

    const positionDropdown = (caretRect) => {
        if (!caretRect) return;
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const vh = document.documentElement.clientHeight || window.innerHeight;

        // 先顯示於隱藏幾何狀態以便量測實際寬高
        const ddW = dropdown.offsetWidth || 150;
        const ddH = dropdown.offsetHeight || 160;

        let left = caretRect.left - 4;
        if (left + ddW > vw - VIEWPORT_MARGIN) {
            left = Math.max(VIEWPORT_MARGIN, vw - ddW - VIEWPORT_MARGIN);
        }
        if (left < VIEWPORT_MARGIN) {
            left = VIEWPORT_MARGIN;
        }

        const spaceBelow = vh - caretRect.bottom - VIEWPORT_MARGIN;
        const spaceAbove = caretRect.top - VIEWPORT_MARGIN;
        let top;
        if (spaceBelow >= ddH || spaceBelow >= spaceAbove) {
            top = Math.min(caretRect.bottom + 4, vh - ddH - VIEWPORT_MARGIN);
            dropdown.style.transformOrigin = 'top left';
        } else {
            top = Math.max(VIEWPORT_MARGIN, caretRect.top - ddH - 4);
            dropdown.style.transformOrigin = 'bottom left';
        }

        dropdown.style.left = `${Math.round(left)}px`;
        dropdown.style.top = `${Math.round(top)}px`;
    };

    const acceptItem = (index) => {
        const item = items[index];
        if (!item || !activeCtx) return;

        const { type, openIdx, replaceEnd, closeChar } = activeCtx;
        const replaceStart = typeof item.replaceStart === 'number' ? item.replaceStart : (openIdx + 1);
        const insertText = type === 'slide' ? item.insertText : `${item.insertText}${closeChar}`;

        editorInput.focus();
        editorInput.setRangeText(insertText, replaceStart, replaceEnd, 'end');

        let nextCursor;
        if (typeof item.cursorOffset === 'number') {
            nextCursor = replaceStart + item.cursorOffset;
        } else if (item.cursorBeforeClose) {
            nextCursor = replaceStart + item.insertText.length;
        } else {
            nextCursor = replaceStart + insertText.length;
        }
        editorInput.selectionStart = editorInput.selectionEnd = nextCursor;

        if (type !== 'slide' && !item.skipRecent) {
            recordRecent(item.recentKey || type, item.value);
        }
        dismissedAtKey = null;
        close(false);

        if (typeof applyHighlight === 'function') applyHighlight(editorInput.value);
        if (typeof inputDebounce === 'function') inputDebounce();
        if (typeof recordEditorHistory === 'function') recordEditorHistory();

        if (item.autoTriggerNext) {
            refresh();
        }
    };

    const renderList = () => {
        listEl.innerHTML = '';
        items.forEach((item, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'utilityButton editor-autocomplete-item';
            if (idx === activeIndex) btn.classList.add('active');
            btn.setAttribute('role', 'option');
            btn.setAttribute('aria-selected', idx === activeIndex ? 'true' : 'false');
            btn.textContent = item.display;

            btn.addEventListener('pointerdown', (e) => {
                // 避免點擊時搶走 editorInput 焦點而觸發 blur 關閉
                e.preventDefault();
                e.stopPropagation();
            });
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                acceptItem(idx);
            });
            btn.addEventListener('mouseenter', () => {
                if (activeIndex !== idx) {
                    activeIndex = idx;
                    updateActiveClass();
                }
            });

            listEl.appendChild(btn);
        });
    };

    const refresh = () => {
        const currentSettings = typeof getSettings === 'function' ? getSettings() : {};
        if (currentSettings?.editorAutocomplete === false) {
            close(false);
            return;
        }
        if (typeof isVisualMode === 'function' && isVisualMode()) {
            close(false);
            return;
        }
        if (editorContainer && editorContainer.style.display === 'none') {
            close(false);
            return;
        }
        if (document.querySelector('.popup-backdrop, .popup-window, .wmc-welcome-overlay, [role="dialog"], dialog[open]')) {
            close(false);
            return;
        }
        if (document.activeElement !== editorInput) {
            close(false);
            return;
        }
        const start = editorInput.selectionStart;
        const end = editorInput.selectionEnd;
        if (start !== end) {
            close(false);
            return;
        }

        const text = editorInput.value || '';
        const ctx = detectAutocompleteContext(text, start) || detectSlideContext(text, start);
        if (!ctx) {
            dismissedAtKey = null;
            close(false);
            return;
        }

        const key = getContextKey(ctx);
        if (dismissedAtKey === key) {
            return;
        }
        dismissedAtKey = null;

        const maidata = typeof getMaidata === 'function' ? getMaidata() : null;
        const suggestions = buildSuggestions(ctx, text, start, {
            recentMap,
            wholeBpm: maidata?.wholebpm ?? null,
            maidata,
        });

        if (suggestions.length === 0) {
            close(false);
            return;
        }

        activeCtx = ctx;
        items = suggestions;
        activeIndex = 0;
        renderList();
        isOpen = true;
        dropdown.classList.add('open');

        // 若 highlightLayer 尚未重繪，於下一幀重新校準游標位置
        const caretRect = measureCaretViewportRect(editorInput, highlightLayer, editorHighlightOverlay, start);
        positionDropdown(caretRect);
        requestAnimationFrame(() => {
            if (!isOpen || document.activeElement !== editorInput) return;
            const syncedRect = measureCaretViewportRect(editorInput, highlightLayer, editorHighlightOverlay, editorInput.selectionStart);
            positionDropdown(syncedRect);
        });
    };

    settingsBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    settingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        close(false);
        editorInput.blur();
        if (typeof openSettings === 'function') {
            openSettings();
        }
    });

    editorInput.addEventListener('keydown', (e) => {
        if (!isOpen) return;
        if (e.isComposing) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            activeIndex = (activeIndex + 1) % items.length;
            updateActiveClass();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            activeIndex = (activeIndex - 1 + items.length) % items.length;
            updateActiveClass();
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            acceptItem(activeIndex);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close(true);
        }
    });

    editorInput.addEventListener('input', () => {
        refresh();
    });

    editorInput.addEventListener('blur', () => {
        close(false);
    });

    editorInput.addEventListener('scroll', () => {
        if (!isOpen) return;
        const caretRect = measureCaretViewportRect(editorInput, highlightLayer, editorHighlightOverlay, editorInput.selectionStart);
        positionDropdown(caretRect);
    }, { passive: true });

    document.addEventListener('selectionchange', () => {
        if (document.activeElement !== editorInput) {
            if (isOpen) close(false);
            return;
        }
        refresh();
    });

    document.addEventListener('pointerdown', (e) => {
        if (!isOpen) return;
        if (dropdown.contains(e.target) || e.target === editorInput) return;
        close(false);
    });

    window.addEventListener('resize', () => {
        if (!isOpen) return;
        const caretRect = measureCaretViewportRect(editorInput, highlightLayer, editorHighlightOverlay, editorInput.selectionStart);
        positionDropdown(caretRect);
    });

    return {
        refresh,
        close,
        isOpen: () => isOpen,
    };
}
