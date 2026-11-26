/**
 * formatter.js
 * 
 * Simai 譜面格式化與分拍優化核心模組 (Format Document)
 * 能夠將碎片化的切分標籤 (例如 {16}5,{48},{24},{24},{48}4...)
 * 自動推導並優化重構為整潔、簡約的最優分拍 (例如 {12}1,,2b,,,...)
 */

import { detectDivisionBefore } from './subdivision.js';

const TICKS = 80640; // 80640 ticks (2^8 * 3^2 * 5 * 7) 可精準整除 1, 2, 4, 8, 16, 32, 64, 12, 24, 48, 96, 5, 10, 20, 40, 7, 14, 28, 56, 9, 18 等連音分拍
const STANDARD_DIVISIONS = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 3, 6, 5, 10, 20, 7, 14, 28, 56, 9, 18, 36, 40];

/**
 * 將文字解析為 Simai Token 串流
 * @param {string} text 
 * @returns {Array<{ type: string, value: string, num?: number }>}
 */
export function parseTokens(text) {
    if (!text || typeof text !== 'string') return [];
    const tokens = [];
    let i = 0;
    const len = text.length;

    while (i < len) {
        // 1. 單行註解: || ...
        if (text[i] === '|' && text[i + 1] === '|') {
            let end = text.indexOf('\n', i + 2);
            if (end === -1) end = len;
            tokens.push({ type: 'comment', value: text.slice(i, end) });
            i = end;
            continue;
        }

        // 2. 區塊註解: /* ... */ 或 |* ... *|
        if ((text[i] === '/' && text[i + 1] === '*') || (text[i] === '|' && text[i + 1] === '*')) {
            const closeMarker = text[i] === '/' ? '*/' : '*|';
            let end = text.indexOf(closeMarker, i + 2);
            if (end === -1) end = len;
            else end += 2;
            tokens.push({ type: 'comment', value: text.slice(i, end) });
            i = end;
            continue;
        }

        // 3. BPM 變更: (bpm)
        if (text[i] === '(') {
            let end = text.indexOf(')', i + 1);
            if (end === -1) end = len;
            else end += 1;
            tokens.push({ type: 'bpm', value: text.slice(i, end) });
            i = end;
            continue;
        }

        // 4. 分拍標籤: {div}
        if (text[i] === '{') {
            let end = text.indexOf('}', i + 1);
            if (end === -1) end = len;
            else end += 1;
            const inner = text.slice(i + 1, end - 1);
            tokens.push({ type: 'div', value: text.slice(i, end), num: parseFloat(inner) });
            i = end;
            continue;
        }

        // 5. 逗號: ,
        if (text[i] === ',') {
            tokens.push({ type: 'comma', value: ',' });
            i++;
            continue;
        }

        // 6. 空白 / 換行
        if (text[i] === ' ' || text[i] === '\t' || text[i] === '\r' || text[i] === '\n') {
            let end = i + 1;
            while (end < len && (text[end] === ' ' || text[end] === '\t' || text[end] === '\r' || text[end] === '\n')) {
                end++;
            }
            tokens.push({ type: 'whitespace', value: text.slice(i, end) });
            i = end;
            continue;
        }

        // 7. 音符內容 (保護 [...] 時值參數括號)
        let end = i;
        while (end < len) {
            if (text[end] === '[') {
                const bend = text.indexOf(']', end + 1);
                const nextNewline = text.indexOf('\n', end + 1);
                // 確保中括號在同行內閉合，避免未閉合中括號吞噬後續音符
                if (bend !== -1 && (nextNewline === -1 || bend < nextNewline)) {
                    end = bend + 1;
                    continue;
                }
            }
            if (text[end] === ',' || text[end] === '{' || text[end] === '(' ||
                text[end] === ' ' || text[end] === '\t' || text[end] === '\r' || text[end] === '\n' ||
                (text[end] === '|' && (text[end + 1] === '|' || text[end + 1] === '*')) ||
                (text[end] === '/' && text[end + 1] === '*')) {
                break;
            }
            end++;
        }
        tokens.push({ type: 'note', value: text.slice(i, end) });
        i = end;
    }

    return tokens;
}

/**
 * 尋找指定時間範圍內最佳分拍
 */
function findBestDivForRange(eventsInRange, startTick, endTick, candidateDivisions = STANDARD_DIVISIONS) {
    const duration = endTick - startTick;
    if (duration <= 0) return null;
    let best = null;
    for (const d of candidateDivisions) {
        if (!d || d <= 0) continue;
        const step = Math.round(TICKS / d);
        if (step <= 0 || duration % step !== 0) continue;
        const valid = eventsInRange.every(e => (e.tick - startTick) % step === 0);
        if (valid) {
            const commaCount = duration / step;
            // 優先選用小分拍與常用分拍 (1, 2, 4, 8, 16, 12 等)
            let divWeight = 1.0;
            if (d === 1) divWeight = 0.5;
            else if (d === 2) divWeight = 0.55;
            else if (d === 4) divWeight = 0.6;
            else if (d === 8) divWeight = 0.7;
            else if (d === 16) divWeight = 0.8;
            else if (d === 12) divWeight = 0.85;
            else if (d === 24) divWeight = 1.2;
            else if (d === 32) divWeight = 1.5;
            else if (d === 48) divWeight = 2.0;
            else if (d === 64) divWeight = 3.0;
            else if (d === 96) divWeight = 3.5;
            else if (d === 3 || d === 6) divWeight = 1.0;
            else if (d === 5 || d === 10 || d === 20) divWeight = 1.3;
            else if (d === 7 || d === 14 || d === 28 || d === 56) divWeight = 1.4;
            else if (d === 9 || d === 18 || d === 36) divWeight = 1.5;
            else divWeight = 2.5;

            const score = commaCount * divWeight;
            if (!best || score < best.score) {
                best = { div: d, step, commaCount, score };
            }
        }
    }
    return best;
}

/**
 * 動態規劃尋優：優化連續拍點區段
 * @param {Array<{ tick: number, text: string }>} events 
 * @param {number} totalTicks 
 * @param {number} activeDiv 進入此區段前生效的分拍
 * @param {boolean} forceHeader 是否強制在此區段輸出起始分拍標籤
 * @param {Array<number>} customDivs 該區段內出現過的分拍
 */
function optimizeTimedSection(events, totalTicks, activeDiv = 4, forceHeader = false, customDivs = []) {
    if (totalTicks === 0) {
        return { text: events.map(e => e.text).join(''), finalDiv: activeDiv };
    }

    const candidateDivisions = Array.from(new Set([...customDivs, ...STANDARD_DIVISIONS])).filter(d => typeof d === 'number' && d > 0);

    const pointsSet = new Set();
    pointsSet.add(0);
    pointsSet.add(totalTicks);
    for (const e of events) {
        pointsSet.add(e.tick);
    }
    for (let t = 0; t <= totalTicks; t += TICKS) {
        pointsSet.add(t);
    }
    for (let t = 0; t <= totalTicks; t += Math.round(TICKS / 2)) {
        pointsSet.add(t);
    }
    const cutPoints = Array.from(pointsSet).sort((a, b) => a - b);
    const n = cutPoints.length;

    const dp = new Array(n).fill(null);
    dp[0] = { cost: 0, prevIdx: -1, div: activeDiv, segText: '' };

    for (let j = 1; j < n; j++) {
        const endTick = cutPoints[j];
        for (let i = 0; i < j; i++) {
            if (!dp[i]) continue;
            const startTick = cutPoints[i];
            const duration = endTick - startTick;
            if (duration > 16 * TICKS) continue; // 限制單一子段不超過 16 拍

            const eventsInRange = events.filter(e => e.tick >= startTick && e.tick < endTick);
            const best = findBestDivForRange(eventsInRange, startTick, endTick, candidateDivisions);
            if (!best) continue;

            const isStart = (i === 0);
            const needHeader = isStart ? (forceHeader || activeDiv !== best.div) : (dp[i].div !== best.div);
            let segText = needHeader ? `{${best.div}}` : '';

            const eventMap = new Map();
            for (const e of eventsInRange) {
                const idx = Math.round((e.tick - startTick) / best.step);
                eventMap.set(idx, (eventMap.get(idx) || '') + e.text);
            }
            for (let stepIdx = 0; stepIdx < best.commaCount; stepIdx++) {
                if (eventMap.has(stepIdx)) {
                    segText += eventMap.get(stepIdx);
                }
                segText += ',';
            }

            // 懲罰過於頻繁切換分拍 (15 chars penalty)，鼓勵整段統一
            const switchPenalty = needHeader ? 15 : 0;
            const stepCost = segText.length + switchPenalty;
            const totalCost = dp[i].cost + stepCost;

            if (!dp[j] || totalCost < dp[j].cost) {
                dp[j] = {
                    cost: totalCost,
                    prevIdx: i,
                    div: best.div,
                    segText
                };
            }
        }
    }

    if (!dp[n - 1]) return null;

    let curr = n - 1;
    const segs = [];
    while (curr > 0) {
        segs.unshift(dp[curr].segText);
        curr = dp[curr].prevIdx;
    }
    return { text: segs.join(''), finalDiv: dp[n - 1].div };
}

/**
 * 合併連續碎片行（例如以相同的分拍如 {32} 切碎每音一行的連續快速音符流）
 */
function mergeFragmentLines(text, options = {}) {
    if (!text || typeof text !== 'string') return text;
    const tokens = parseTokens(text);
    if (tokens.length === 0) return text;

    const rawLines = [];
    let curLineTokens = [];
    for (const tok of tokens) {
        if (tok.type === 'whitespace' && tok.value.includes('\n')) {
            rawLines.push({ tokens: curLineTokens, newline: tok.value });
            curLineTokens = [];
        } else {
            curLineTokens.push(tok);
        }
    }
    if (curLineTokens.length > 0) {
        rawLines.push({ tokens: curLineTokens, newline: '' });
    }

    if (rawLines.length <= 1) return text;

    let activeDiv = options.activeDivision || 4;
    const lines = [];

    for (const line of rawLines) {
        let lineStartDiv = activeDiv;
        let hasComment = false;
        let hasBpm = false;
        let lineExplicitDiv = null;
        let lineTicks = 0;
        let noteCount = 0;

        for (const tok of line.tokens) {
            if (tok.type === 'comment') hasComment = true;
            if (tok.type === 'bpm') hasBpm = true;
            if (tok.type === 'div') {
                if (lineExplicitDiv === null) lineExplicitDiv = tok.num;
                activeDiv = tok.num;
            }
            if (tok.type === 'note') noteCount++;
            if (tok.type === 'comma') {
                lineTicks += Math.round(TICKS / activeDiv);
            }
        }

        lines.push({
            tokens: line.tokens,
            newline: line.newline,
            startDiv: lineStartDiv,
            endDiv: activeDiv,
            explicitDiv: lineExplicitDiv,
            hasComment,
            hasBpm,
            ticks: lineTicks,
            noteCount
        });
    }

    const mergedLines = [];
    let i = 0;
    while (i < lines.length) {
        let cur = lines[i];
        let j = i + 1;

        while (j < lines.length) {
            const next = lines[j];
            // 若兩行之間有空行 (例如 \n\n) 或包含註解/BPM，不合併
            if (cur.newline.replace(/[^\n]/g, '').length > 1) break;
            if (cur.hasComment || cur.hasBpm || next.hasComment || next.hasBpm) break;

            const sameDiv = (next.explicitDiv !== null && next.explicitDiv === cur.endDiv) ||
                            (next.explicitDiv === null && next.startDiv === cur.endDiv);
            if (!sameDiv) break;

            // 判斷是否為碎片行：
            // 1. 下一行重複宣告相同的分拍 (如 {32}8,\n{32}7,)
            // 2. 或兩行皆為未滿 1/2 小節之極小碎片且分拍 >= 16
            const isExplicitRepeat = (next.explicitDiv !== null && next.explicitDiv === cur.endDiv);
            const isTinyFragment = (next.explicitDiv === null && cur.ticks <= Math.round(TICKS / 2) && next.ticks <= Math.round(TICKS / 2) && cur.endDiv >= 16);

            if (!isExplicitRepeat && !isTinyFragment) break;
            if (cur.ticks + next.ticks > TICKS) break; // 單行不超過 1 小節

            // 合併：若下一行以重複的相同 {div} 開頭，消除該多餘的 div 標籤
            let nextTokens = next.tokens;
            if (nextTokens.length > 0 && nextTokens[0].type === 'div' && nextTokens[0].num === cur.endDiv) {
                nextTokens = nextTokens.slice(1);
            }

            cur.tokens = cur.tokens.concat(nextTokens);
            cur.newline = next.newline;
            cur.ticks += next.ticks;
            cur.noteCount += next.noteCount;
            cur.endDiv = next.endDiv;
            j++;
        }

        mergedLines.push(cur);
        i = j;
    }

    let out = '';
    for (const l of mergedLines) {
        out += l.tokens.map(t => t.value).join('') + l.newline;
    }
    return out;
}

/**
 * 格式化 Simai 譜面文字
 * @param {string} text 欲格式化的譜面片段或全文
 * @param {Object} [options]
 * @param {number} [options.activeDivision=4] 起始生效分拍
 * @returns {string} 格式化後的文本
 */
export function formatSimai(text, options = {}) {
    if (!text || typeof text !== 'string') return text;

    const mergedText = mergeFragmentLines(text, options);
    const tokens = parseTokens(mergedText);
    if (tokens.length === 0) return text;

    let result = '';
    let activeDiv = options.activeDivision || 4;
    let sectionEvents = [];
    let sectionRawTokens = [];
    let sectionCurrentTick = 0;
    let sectionHasExplicitDiv = false;
    let sectionDivisions = new Set();

    function flushCurrentSection() {
        if (sectionEvents.length === 0 && sectionCurrentTick === 0) {
            for (const t of sectionRawTokens) {
                result += t.value;
            }
            sectionRawTokens = [];
            sectionDivisions.clear();
            return;
        }

        const customDivs = Array.from(sectionDivisions);
        if (activeDiv && !customDivs.includes(activeDiv)) {
            customDivs.push(activeDiv);
        }

        const opt = optimizeTimedSection(sectionEvents, sectionCurrentTick, activeDiv, sectionHasExplicitDiv, customDivs);
        if (opt) {
            result += opt.text;
            activeDiv = opt.finalDiv;
        } else {
            // 安全回退：如果無法優化（例如非標準拍、無法整除切分等），100% 完整還原原始 Token，絕不遺失音符或逗號！
            for (const t of sectionRawTokens) {
                result += t.value;
            }
        }
        sectionEvents = [];
        sectionRawTokens = [];
        sectionDivisions.clear();
        sectionCurrentTick = 0;
        sectionHasExplicitDiv = false;
    }

    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];

        if (tok.type === 'bpm') {
            flushCurrentSection();
            result += tok.value;
            continue;
        }

        if (tok.type === 'comment') {
            flushCurrentSection();
            result += tok.value;
            continue;
        }

        if (tok.type === 'whitespace') {
            if (tok.value.includes('\n')) {
                flushCurrentSection();
                result += tok.value;
            } else {
                sectionRawTokens.push(tok);
            }
            continue;
        }

        if (tok.type === 'div') {
            if (tok.num !== activeDiv) {
                activeDiv = tok.num;
                sectionHasExplicitDiv = true;
            }
            if (tok.num) sectionDivisions.add(tok.num);
            sectionRawTokens.push(tok);
            continue;
        }

        if (tok.type === 'note') {
            // 檢查是否為譜面結尾標籤 E (後面若無後續實質音符或逗號即為結束符號)
            if (tok.value === 'E') {
                const hasMoreNotes = tokens.slice(i + 1).some(t => t.type === 'note' || t.type === 'comma');
                if (!hasMoreNotes) {
                    flushCurrentSection();
                    result += 'E';
                    continue;
                }
            }
            sectionEvents.push({ tick: sectionCurrentTick, text: tok.value });
            sectionRawTokens.push(tok);
            continue;
        }

        if (tok.type === 'comma') {
            sectionCurrentTick += Math.round(TICKS / activeDiv);
            sectionRawTokens.push(tok);
            continue;
        }
    }

    flushCurrentSection();
    return result;
}



/**
 * 格式化整篇文件 (支援完整 maidata.txt 含 &inote_ 標籤)
 * @param {string} fullText 
 * @param {Object} [options]
 * @returns {string}
 */
export function formatDocument(fullText, options = {}) {
    if (!fullText || typeof fullText !== 'string') return fullText;

    // 若為完整 maidata.txt (含 &inote_\d+= 標籤)，個別格式化各難度之譜面內容
    const inoteRegex = /(&inote_\d+\s*=)([\s\S]*?)(?=(?:&inote_\d+\s*=|\n&[a-zA-Z0-9_]+\s*=|(?:\r?\n)?E(?:\r?\n)?$|$))/gi;
    if (/&inote_\d+\s*=/i.test(fullText)) {
        return fullText.replace(inoteRegex, (match, prefix, content) => {
            const trimmed = content.trim();
            if (!trimmed) return match;
            return prefix + '\n' + formatSimai(trimmed, options) + '\n';
        });
    }

    return formatSimai(fullText, options);
}

/**
 * 處理編輯器輸入框中的格式化請求 (Format Document / Format Selection)
 * @param {HTMLTextAreaElement} editorInput 
 * @param {Object} [options]
 * @param {Function} [options.simpleToast]
 * @param {Function} [options.t]
 * @returns {boolean} 是否進行了變更
 */
export function handleFormatDocument(editorInput, options = {}) {
    if (!editorInput) return false;

    const { simpleToast = () => {}, t = (k) => k } = options;
    const fullText = editorInput.value || '';
    const selStart = editorInput.selectionStart;
    const selEnd = editorInput.selectionEnd;
    const hasSelection = (selStart !== selEnd && selEnd > selStart);

    let newFullText = '';
    let newSelStart = selStart;
    let newSelEnd = selEnd;

    if (hasSelection) {
        // 格式化選取範圍 (Format Selection)
        const selectedText = fullText.slice(selStart, selEnd);
        const activeDiv = detectDivisionBefore(fullText, selStart);
        const formattedSelection = formatSimai(selectedText, { activeDivision: activeDiv });

        if (formattedSelection === selectedText) {
            simpleToast({
                content: t('menu.formatDocumentNoChange') || '選取範圍已是最佳切分格式',
                type: 'info',
                timeout: 1500
            });
            return false;
        }

        newFullText = fullText.slice(0, selStart) + formattedSelection + fullText.slice(selEnd);
        newSelStart = selStart;
        newSelEnd = selStart + formattedSelection.length;
    } else {
        // 格式化整篇文件 (Format Document)
        newFullText = formatDocument(fullText);

        if (newFullText === fullText) {
            simpleToast({
                content: t('menu.formatDocumentNoChange') || '文件格式已是最佳狀態',
                type: 'info',
                timeout: 1500
            });
            return false;
        }
        newSelStart = selStart;
        newSelEnd = selEnd;
    }

    editorInput.value = newFullText;
    editorInput.setSelectionRange(newSelStart, newSelEnd);

    // 觸發 input 事件以同步高亮、觸發歷史堆疊 (Undo/Redo) 與即時解析
    editorInput.dispatchEvent(new Event('input', { bubbles: true }));

    simpleToast({
        content: hasSelection
            ? (t('menu.formatSelectionDone') || '已完成選取範圍格式化')
            : (t('menu.formatDocumentDone') || '已完成文件格式化 (Format Document)'),
        type: 'success',
        timeout: 1800
    });

    return true;
}
