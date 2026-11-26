/**
 * subdivision.js
 * 
 * simai 譜面切分細分與轉換核心模組
 * 支援倍化細分 (Subdivide)、壓縮折半 (Compress) 與任意拍號切分轉換 (Convert Division)
 */

/**
 * 將 simai 文本解析為拍點步驟 (steps) 與結尾內容 (trailing)
 * 完整保護 || 註解、/* 區塊註解、[..] 括號與 <..> 屬性標籤內的逗號
 * @param {string} text 
 * @returns {{ steps: Array<{ raw: string, comma: string, trailingSpace: string }>, trailing: string }}
 */
export function parseSimaiSteps(text) {
    if (!text || typeof text !== 'string') {
        return { steps: [], trailing: '' };
    }

    const steps = [];
    let current = '';
    let i = 0;
    const len = text.length;

    while (i < len) {
        // 1. 單行註解: || ...
        if (text[i] === '|' && text[i + 1] === '|') {
            let commentEnd = text.indexOf('\n', i + 2);
            if (commentEnd === -1) commentEnd = len;
            current += text.slice(i, commentEnd);
            i = commentEnd;
            continue;
        }

        // 2. 區塊註解: /* ... */ 或 |* ... *|
        if ((text[i] === '/' && text[i + 1] === '*') || (text[i] === '|' && text[i + 1] === '*')) {
            const closeMarker = text[i] === '/' ? '*/' : '*|';
            let commentEnd = text.indexOf(closeMarker, i + 2);
            if (commentEnd === -1) {
                current += text.slice(i);
                i = len;
            } else {
                current += text.slice(i, commentEnd + 2);
                i = commentEnd + 2;
            }
            continue;
        }

        // 3. 中括號: [...] (包含 Hold/Slide 時值參數)
        if (text[i] === '[') {
            let bracketEnd = text.indexOf(']', i + 1);
            if (bracketEnd === -1) bracketEnd = len;
            else bracketEnd += 1;
            current += text.slice(i, bracketEnd);
            i = bracketEnd;
            continue;
        }

        // 4. 尖括號: <...> (包含屬性標籤如 <SIZE*(1,2)>)
        if (text[i] === '<') {
            let angleEnd = text.indexOf('>', i + 1);
            if (angleEnd === -1) angleEnd = len;
            else angleEnd += 1;
            current += text.slice(i, angleEnd);
            i = angleEnd;
            continue;
        }

        // 5. 圓括號: (...) (包含 BPM 如 (140))
        if (text[i] === '(') {
            let parenEnd = text.indexOf(')', i + 1);
            if (parenEnd === -1) parenEnd = len;
            else parenEnd += 1;
            current += text.slice(i, parenEnd);
            i = parenEnd;
            continue;
        }

        // 6. 大括號: {...} (包含切分標籤如 {4})
        if (text[i] === '{') {
            let braceEnd = text.indexOf('}', i + 1);
            if (braceEnd === -1) braceEnd = len;
            else braceEnd += 1;
            current += text.slice(i, braceEnd);
            i = braceEnd;
            continue;
        }

        // 7. 拍點逗號: ,
        if (text[i] === ',') {
            // 抓取逗號後緊隨的空白或換行 (保留原本的換行排版結構)
            let nextI = i + 1;
            let trailing = '';
            while (nextI < len && (text[nextI] === ' ' || text[nextI] === '\t' || text[nextI] === '\r' || text[nextI] === '\n')) {
                trailing += text[nextI];
                if (text[nextI] === '\n') {
                    nextI++;
                    break;
                }
                nextI++;
            }

            steps.push({
                raw: current,
                comma: ',',
                trailingSpace: trailing
            });
            current = '';
            i = nextI;
            continue;
        }

        current += text[i];
        i++;
    }

    return {
        steps,
        trailing: current
    };
}

/**
 * 偵測光標或選取範圍前最後一個生效的切分 {D}
 * @param {string} fullText 完整譜面文字
 * @param {number} startIndex 選取開始位置
 * @returns {number} 偵測到的切分 (預設為 4)
 */
export function detectDivisionBefore(fullText, startIndex) {
    if (!fullText || startIndex <= 0) return 4;
    const prefix = fullText.slice(0, startIndex);
    const matches = [...prefix.matchAll(/\{(\d+(?:\.\d+)?)\}/g)];
    if (matches.length > 0) {
        const last = matches[matches.length - 1];
        const val = parseFloat(last[1]);
        if (!isNaN(val) && val > 0) return val;
    }
    return 4;
}

/**
 * 偵測文字片段中包含的所有切分標籤數值
 * @param {string} text 
 * @returns {number[]}
 */
export function detectDivisionsInText(text) {
    if (!text) return [];
    const matches = [...text.matchAll(/\{(\d+(?:\.\d+)?)\}/g)];
    return matches.map(m => parseFloat(m[1])).filter(v => !isNaN(v) && v > 0);
}

/**
 * 倍化細分 (Subdivide)
 * 將每個拍點細分為 multiplier 個拍點 (在拍點後插入 multiplier - 1 個空白逗號)
 * 例如 multiplier = 2 時，{4}1,2,3,4, -> {8}1,,2,,3,,4,,
 * 
 * @param {string} text 欲轉換的譜面文字
 * @param {number} multiplier 倍數 (必須 >= 2)
 * @param {Object} [options]
 * @param {number} [options.activeDivision=4] 當前生效之切分數
 * @param {boolean} [options.insertHeader=false] 若開頭無切分標籤是否補上新切分標籤
 * @param {boolean} [options.restoreHeader=false] 結尾是否還原原切分標籤
 * @returns {{ result: string, changed: boolean, originalSteps: number, newSteps: number }}
 */
export function subdivideSimaiText(text, multiplier = 2, options = {}) {
    multiplier = Math.max(1, Math.round(multiplier));
    if (!text || multiplier <= 1) {
        return { result: text, changed: false, originalSteps: 0, newSteps: 0 };
    }

    const {
        activeDivision = 4,
        insertHeader = false,
        restoreHeader = false,
    } = options;

    const { steps, trailing } = parseSimaiSteps(text);
    if (steps.length === 0) {
        return { result: text, changed: false, originalSteps: 0, newSteps: 0 };
    }

    let hasExplicitHeaderAtStart = false;
    const firstDivisionMatch = steps[0].raw.match(/\{(\d+(?:\.\d+)?)\}/);
    if (firstDivisionMatch) {
        hasExplicitHeaderAtStart = true;
    }

    const newSteps = [];
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        let raw = step.raw;

        // 將此拍內的任何切分標籤 {D} 倍化為 {D * multiplier}
        raw = raw.replace(/\{(\d+(?:\.\d+)?)\}/g, (_, dStr) => {
            const d = parseFloat(dStr);
            const newD = Math.round(d * multiplier);
            return `{${newD}}`;
        });

        // 首個逗號接在內容後，隨後追加 (multiplier - 1) 個空拍逗號，再接上原有空白換行
        const extraCommas = ','.repeat(multiplier - 1);
        const transformedStep = `${raw},${extraCommas}${step.trailingSpace}`;
        newSteps.push(transformedStep);
    }

    let result = newSteps.join('');

    // 若原文字開頭沒有切分標籤且使用者勾選插入新標籤
    if (!hasExplicitHeaderAtStart && insertHeader) {
        const targetDiv = Math.round(activeDivision * multiplier);
        result = `{${targetDiv}}` + result;
    }

    // 若勾選結尾還原切分標籤
    if (restoreHeader) {
        const endsWithDiv = /\{(\d+(?:\.\d+)?)\}\s*$/.test(trailing) || /\{(\d+(?:\.\d+)?)\}\s*$/.test(result);
        if (!endsWithDiv) {
            result = result + trailing + `{${activeDivision}}`;
            return {
                result,
                changed: true,
                originalSteps: steps.length,
                newSteps: steps.length * multiplier
            };
        }
    }

    result += trailing;

    return {
        result,
        changed: true,
        originalSteps: steps.length,
        newSteps: steps.length * multiplier
    };
}

/**
 * 壓縮折半 (Compress / Simplify)
 * 將連續 divisor 個拍點合併為 1 個拍點 (切分標籤除以 divisor)
 * 例如 divisor = 2 時，{8}1,,2,,3,,4,, -> {4}1,2,3,4,
 * 
 * @param {string} text 欲轉換的譜面文字
 * @param {number} divisor 除數 (必須 >= 2)
 * @param {Object} [options]
 * @param {number} [options.activeDivision=8] 當前生效之切分數
 * @param {boolean} [options.insertHeader=false] 若開頭無切分標籤是否補上新切分標籤
 * @param {boolean} [options.restoreHeader=false] 結尾是否還原原切分標籤
 * @param {boolean} [options.mergeConflictNotes=false] 若非空拍點合併時是否以 '/' 結合 (雙打音符)
 * @returns {{ result: string, changed: boolean, originalSteps: number, newSteps: number, conflicts: Array }}
 */
export function compressSimaiText(text, divisor = 2, options = {}) {
    divisor = Math.max(1, Math.round(divisor));
    if (!text || divisor <= 1) {
        return { result: text, changed: false, originalSteps: 0, newSteps: 0, conflicts: [] };
    }

    const {
        activeDivision = 8,
        insertHeader = false,
        restoreHeader = false,
        mergeConflictNotes = false,
    } = options;

    const { steps, trailing } = parseSimaiSteps(text);
    if (steps.length === 0) {
        return { result: text, changed: false, originalSteps: 0, newSteps: 0, conflicts: [] };
    }

    let hasExplicitHeaderAtStart = false;
    const firstDivisionMatch = steps[0].raw.match(/\{(\d+(?:\.\d+)?)\}/);
    if (firstDivisionMatch) {
        hasExplicitHeaderAtStart = true;
    }

    const newSteps = [];
    const conflicts = [];

    for (let i = 0; i < steps.length; i += divisor) {
        const group = steps.slice(i, i + divisor);
        const primary = group[0];
        let primaryRaw = primary.raw;

        // 將切分標籤 {D} 縮小為 {D / divisor}
        primaryRaw = primaryRaw.replace(/\{(\d+(?:\.\d+)?)\}/g, (_, dStr) => {
            const d = parseFloat(dStr);
            const newD = Math.max(1, Math.round(d / divisor));
            return `{${newD}}`;
        });

        // 檢查組內後續拍點是否有實體音符 (衝突檢查)
        let mergedNotes = [];
        let groupHasConflict = false;

        for (let j = 1; j < group.length; j++) {
            const sub = group[j];
            const cleanSub = sub.raw.replace(/\|\|.*$/gm, '').replace(/\|\*[\s\S]*?\*\|/g, '').trim();
            if (cleanSub.length > 0) {
                groupHasConflict = true;
                conflicts.push({
                    stepIndex: i + j,
                    content: cleanSub
                });
                mergedNotes.push(cleanSub);
            }
        }

        let finalRaw = primaryRaw;
        if (groupHasConflict && mergeConflictNotes && mergedNotes.length > 0) {
            finalRaw = `${finalRaw}/${mergedNotes.join('/')}`;
        }

        const lastStepInGroup = group[group.length - 1];
        const stepTrailing = lastStepInGroup.trailingSpace;
        newSteps.push(`${finalRaw},${stepTrailing}`);
    }

    let result = newSteps.join('');

    if (!hasExplicitHeaderAtStart && insertHeader) {
        const targetDiv = Math.max(1, Math.round(activeDivision / divisor));
        result = `{${targetDiv}}` + result;
    }

    if (restoreHeader) {
        const endsWithDiv = /\{(\d+(?:\.\d+)?)\}\s*$/.test(trailing) || /\{(\d+(?:\.\d+)?)\}\s*$/.test(result);
        if (!endsWithDiv) {
            result = result + trailing + `{${activeDivision}}`;
            return {
                result,
                changed: true,
                originalSteps: steps.length,
                newSteps: newSteps.length,
                conflicts
            };
        }
    }

    result += trailing;

    return {
        result,
        changed: true,
        originalSteps: steps.length,
        newSteps: newSteps.length,
        conflicts
    };
}

/**
 * 任意切分指定轉換 (Convert from Division A to Division B)
 * 例如 fromDiv = 4, toDiv = 8 -> 倍化 x2
 * 例如 fromDiv = 8, toDiv = 4 -> 壓縮 /2
 * 例如 fromDiv = 4, toDiv = 12 -> 倍化 x3
 * 
 * @param {string} text 
 * @param {number} fromDiv 來源切分 (如 4)
 * @param {number} toDiv 目標切分 (如 8, 12, 16)
 * @param {Object} [options] 
 * @returns {{ result: string, changed: boolean, originalSteps: number, newSteps: number, conflicts?: Array }}
 */
export function convertSimaiDivision(text, fromDiv, toDiv, options = {}) {
    fromDiv = parseFloat(fromDiv) || 4;
    toDiv = parseFloat(toDiv) || 4;

    if (fromDiv === toDiv) {
        return { result: text, changed: false, originalSteps: 0, newSteps: 0, conflicts: [] };
    }

    const ratio = toDiv / fromDiv;

    // 1. 純整數倍化細分 (例如 4 -> 8, 4 -> 12, 4 -> 16, 8 -> 16)
    if (ratio > 1 && Number.isInteger(ratio)) {
        return subdivideSimaiText(text, ratio, { ...options, activeDivision: fromDiv });
    }

    // 2. 純整數壓縮折半 (例如 8 -> 4, 16 -> 8, 12 -> 4, 16 -> 4)
    if (ratio < 1 && Number.isInteger(1 / ratio)) {
        return compressSimaiText(text, Math.round(1 / ratio), { ...options, activeDivision: fromDiv });
    }

    // 3. 跨切分轉換 (例如 8 -> 12, 12 -> 8, 12 -> 16 等)
    // 透過公約數先倍化後壓縮
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const g = gcd(fromDiv, toDiv);
    const mul = toDiv / g;
    const div = fromDiv / g;

    const subRes = subdivideSimaiText(text, mul, {
        ...options,
        activeDivision: fromDiv,
        insertHeader: false,
        restoreHeader: false
    });

    return compressSimaiText(subRes.result, div, {
        ...options,
        activeDivision: fromDiv
    });
}
