import { PathRecorder, noteRefPos, innerCirleBase, isObject } from './core/chartGeometry.js';

export let warns = [];
export let warnpos = [];

let _sp = [];
let _disableSyntaxCheck = false;

const formatWarnArg = (arg) => {
    if (typeof arg === 'string') return arg;
    try {
        if (isObject(arg)) {
            if (arg.errpos !== undefined) {
                if (!_disableSyntaxCheck) warnpos.push(arg.errpos);
                return _sp[arg.errpos] !== undefined ? `${_sp[arg.errpos]}, at comma position: ${arg.errpos}` : `at comma position: ${arg.errpos}`;
            }
            return JSON.stringify(arg);
        }
    } catch {
        return String(arg);
    }
};

const pushWarn = (...args) => {
    if (_disableSyntaxCheck) return;
    warns.push(args.map(formatWarnArg).join(' '));
};

// Pre-compiled regular expressions for optimal performance
const REGEX_MULTILINE_COMMENT = /\|\*[\s\S]*?(?:\*\||$)/g;
const REGEX_COMMENT = /\|\|.*$/gm;
const REGEX_WHITESPACE = /\s+/g;
const REGEX_POS_MATCH = /^\d+/;
const REGEX_TOUCH_MATCH = /^([ABCDE])(\d+)|C/;
const REGEX_SLIDE_SYMBOL = /((?:pp)|(?:qq)|[-<>^vpqszVw])/g;
const REGEX_SLIDE_PATTERN = /((?:pp)|(?:qq)|[-<>^vpqszVw\*])\d*/g;
const REGEX_BRACKET_CONTENT = /\[[^\]]*\]/g;
const REGEX_SINGLE_BRACKET = /\[([^\[\]]*)\]/;
const REGEX_VALID_FLAGS = /[bx\$fh@?!m]/g;
const REGEX_POS_TOUCH_PREFIX = /^([ABCDE]\d+|C|\d+)/;

/**
 * Strict property tag parsing function.
 * Supported property tags:
 *  - <HS*number> (e.g. <HS*1.25>, <HS*1>, <HS*0.5>)
 *  - <SIZE*number> or <SIZE*(number,number)> (e.g. <SIZE*2>, <SIZE*(1.5,2)>)
 *  - <COLOR*RRGGBB> or <COLOR*RRGGBBAA> (e.g. <COLOR*FF0000>, <COLOR*00FF00AA>)
 *
 * @param {string} tagContent - The content inside <...> without angle brackets
 * @returns {{ valid: boolean, type?: 'HS'|'SIZE'|'COLOR', value?: any, raw: string, error?: string }}
 */
function parsePropertyTag(tagContent) {
    const trimmed = tagContent.trim();
    if (!trimmed) {
        return { valid: false, raw: trimmed, error: 'Empty property tag' };
    }

    // 1. HS Property: <HS*<number>>
    if (/^HS\*/i.test(trimmed)) {
        const valStr = trimmed.slice(3).trim();
        if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(valStr)) {
            return { valid: false, raw: trimmed, error: `Invalid HS value: "${valStr}"` };
        }
        const num = parseFloat(valStr);
        if (isNaN(num) || !isFinite(num)) {
            return { valid: false, raw: trimmed, error: `Invalid HS value: "${valStr}"` };
        }
        return { valid: true, type: 'HS', value: num, raw: trimmed };
    }

    // 2. SIZE Property: <SIZE*<number>> or <SIZE*(<number>,<number>)>
    if (/^SIZE\*/i.test(trimmed)) {
        const valStr = trimmed.slice(5).trim();
        // Form A: Single scale number, e.g. SIZE*2, SIZE*1.5
        if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(valStr)) {
            const num = parseFloat(valStr);
            if (isNaN(num) || !isFinite(num)) {
                return { valid: false, raw: trimmed, error: `Invalid SIZE value: "${valStr}"` };
            }
            return { valid: true, type: 'SIZE', value: num, raw: trimmed };
        }
        // Form B: 2D Tuple with explicit parentheses, e.g. SIZE*(1.5,2)
        const tupleMatch = valStr.match(/^\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\)$/);
        if (tupleMatch) {
            const v1 = parseFloat(tupleMatch[1]);
            const v2 = parseFloat(tupleMatch[2]);
            if (isNaN(v1) || !isFinite(v1) || isNaN(v2) || !isFinite(v2)) {
                return { valid: false, raw: trimmed, error: `Invalid SIZE tuple values: "${valStr}"` };
            }
            return { valid: true, type: 'SIZE', value: [v1, v2], raw: trimmed };
        }
        // Any other form (e.g. SIZE*NaN, SIZE*6,9 without parens) is invalid!
        return { valid: false, raw: trimmed, error: `Invalid SIZE format: "${valStr}"` };
    }

    // 3. COLOR Property: <COLOR*RRGGBB> (6-digit hex) or <COLOR*RRGGBBAA> (8-digit hex)
    if (/^COLOR\*/i.test(trimmed)) {
        const valStr = trimmed.slice(6).trim();
        if (!/^(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(valStr)) {
            return { valid: false, raw: trimmed, error: `Invalid COLOR format (must be 6 or 8 hex digits): "${valStr}"` };
        }
        return { valid: true, type: 'COLOR', value: '#' + valStr, raw: trimmed };
    }

    return { valid: false, raw: trimmed, error: `Unknown property tag: "${trimmed}"` };
}

/**
 * 解析滑星移動時間部分 (純移動秒數或拍數，可選覆蓋 BPM)
 * @param {string} str 可以是 "bpm#t:b"、"bpm#s"、"t:b"、"s"
 * @param {number} fallbackBpm
 * @returns {{ time: number, bpm?: number, error?: string }}
 */
function parseSlideMovement(str, fallbackBpm) {
    if (!str) return { time: -1, error: 'Empty movement duration' };
    const s = str.trim();

    // 含有指定 BPM "#" (例如 160#8:3 或 160#2)
    if (s.includes('#')) {
        const parts = s.split('#');
        if (parts.length !== 2) {
            return { time: -1, error: `Invalid slide format with multiple "#": "${s}"` };
        }
        const bpmStr = parts[0].trim();
        const tbStr = parts[1].trim();

        const overrideBpm = parseFloat(bpmStr);
        if (isNaN(overrideBpm) || overrideBpm <= 0 || !isFinite(overrideBpm)) {
            return { time: -1, error: `Invalid slide BPM value: "${bpmStr}"` };
        }
        if (!tbStr) {
            return { time: -1, error: `Missing slide duration after "#"` };
        }

        // 移動時間為拍數 "t:b"
        if (tbStr.includes(':')) {
            const beatRes = parseBeatRatio(tbStr, overrideBpm);
            if (beatRes.time < 0) return beatRes;
            return { time: beatRes.time, bpm: overrideBpm };
        }

        // 移動時間為純秒數 "s"
        const sec = parseFloat(tbStr);
        if (isNaN(sec) || sec < 0 || !isFinite(sec)) {
            return { time: -1, error: `Invalid slide seconds value: "${tbStr}"` };
        }
        return { time: sec, bpm: overrideBpm };
    }

    // 拍數 "t:b" (使用 fallbackBpm)
    if (s.includes(':')) {
        return parseBeatRatio(s, fallbackBpm);
    }

    // 純秒數 "s" (例如 [1.5] 或 [1])
    const sec = parseFloat(s);
    if (isNaN(sec) || sec < 0 || !isFinite(sec)) {
        return { time: -1, error: `Invalid slide duration format: "${s}"` };
    }
    return { time: sec };
}

/**
 * 解析拍數比例 "t:b" 並計算時長 (240 / bpm) * (b / t)
 * @param {string} str "4:1"
 * @param {number} bpm
 * @returns {{ time: number, error?: string }}
 */
function parseBeatRatio(str, bpm) {
    const parts = str.split(':');
    if (parts.length !== 2) {
        return { time: -1, error: `Invalid beat ratio format: "${str}"` };
    }
    const t = parseFloat(parts[0].trim());
    const b = parseFloat(parts[1].trim());
    if (isNaN(t) || isNaN(b) || t <= 0 || b < 0 || !isFinite(t) || !isFinite(b)) {
        return { time: -1, error: `Invalid beat ratio values: "${str}"` };
    }
    const time = (240 / bpm) * (b / t);
    return { time };
}

/**
 * 解析滑星時長字串 (完整支援 Simai 官方 8 種書式格式: [待ち時間 ## 移動時間])
 * @param {string} str 括號內字串，如 "1.5##160#4:1", "4:1", "1.5", "160#8:3", "3##1.5" 等
 * @param {number} currentBpm 當前曲目/小節基準 BPM
 * @returns {{ time: number, delay: number, error?: string }}
 */
export function parseSlideTime(str, currentBpm) {
    if (!str || typeof str !== 'string') {
        return { time: -1, delay: -1, error: 'Empty slide duration format' };
    }
    const clean = str.trim();
    if (!clean) {
        return { time: -1, delay: -1, error: 'Empty slide duration format' };
    }

    // 1. 自訂等待時間 (含有 "##")
    if (clean.includes('##')) {
        const parts = clean.split('##');
        if (parts.length !== 2) {
            return { time: -1, delay: -1, error: `Invalid slide timing format with multiple "##": "${clean}"` };
        }
        const delayStr = parts[0].trim();
        const moveStr = parts[1].trim();

        const delay = parseFloat(delayStr);
        if (isNaN(delay) || delay < 0 || !isFinite(delay)) {
            return { time: -1, delay: -1, error: `Invalid slide delay value: "${delayStr}"` };
        }
        if (!moveStr) {
            return { time: -1, delay: -1, error: 'Missing move duration after "##"' };
        }

        const moveRes = parseSlideMovement(moveStr, currentBpm);
        if (moveRes.time < 0) {
            return { time: -1, delay: -1, error: moveRes.error };
        }
        return { time: moveRes.time, delay, error: null };
    }

    // 2. 未指定等待時間 (無 "##")
    // 預設等待時間為 1 拍: 若有指定 bpm#，則為指定 bpm 的 1 拍 (60 / overrideBpm)；否則為 currentBpm 的 1 拍 (60 / currentBpm)
    const moveRes = parseSlideMovement(clean, currentBpm);
    if (moveRes.time < 0) {
        return { time: -1, delay: -1, error: moveRes.error };
    }
    const defaultDelay = 60 / (moveRes.bpm || currentBpm);
    return { time: moveRes.time, delay: defaultDelay, error: null };
}

/**
 * 解析 Hold 音符時長字串
 * @param {string} str 如 "4:1", "160#4:1", "#1.5", "1.5"
 * @param {number} currentBpm
 * @returns {{ time: number, delay: number, error?: string }}
 */
export function parseHoldTime(str, currentBpm) {
    if (!str || typeof str !== 'string') {
        return { time: -1, delay: 0, error: 'Empty hold duration format' };
    }
    const clean = str.trim();
    if (!clean) {
        return { time: -1, delay: 0, error: 'Empty hold duration format' };
    }

    // 1. 直給秒數格式: "#seconds"
    if (clean.startsWith('#')) {
        const sec = parseFloat(clean.slice(1).trim());
        if (isNaN(sec) || sec < 0 || !isFinite(sec)) {
            return { time: -1, delay: 0, error: `Invalid hold duration value: "${clean}"` };
        }
        return { time: sec, delay: 0, error: null };
    }

    // 2. 指定 BPM 之拍數或秒數: "bpm#t:b" 或 "bpm#s"
    if (clean.includes('#')) {
        const parts = clean.split('#');
        if (parts.length !== 2) {
            return { time: -1, delay: 0, error: `Invalid hold format with multiple "#": "${clean}"` };
        }
        const overrideBpm = parseFloat(parts[0].trim());
        if (isNaN(overrideBpm) || overrideBpm <= 0 || !isFinite(overrideBpm)) {
            return { time: -1, delay: 0, error: `Invalid hold BPM value: "${parts[0]}"` };
        }
        const tbStr = parts[1].trim();
        if (tbStr.includes(':')) {
            const beatRes = parseBeatRatio(tbStr, overrideBpm);
            if (beatRes.time < 0) return { time: -1, delay: 0, error: beatRes.error };
            return { time: beatRes.time, delay: 0, error: null };
        }
        const sec = parseFloat(tbStr);
        if (isNaN(sec) || sec < 0 || !isFinite(sec)) {
            return { time: -1, delay: 0, error: `Invalid hold seconds value: "${tbStr}"` };
        }
        return { time: sec, delay: 0, error: null };
    }

    // 3. 標準拍數: "t:b"
    if (clean.includes(':')) {
        const beatRes = parseBeatRatio(clean, currentBpm);
        if (beatRes.time < 0) return { time: -1, delay: 0, error: beatRes.error };
        return { time: beatRes.time, delay: 0, error: null };
    }

    // 4. 純秒數: "s"
    const sec = parseFloat(clean);
    if (!isNaN(sec) && sec >= 0 && isFinite(sec)) {
        return { time: sec, delay: 0, error: null };
    }

    return { time: -1, delay: 0, error: `Invalid hold duration format: "${clean}"` };
}

/**
 * 向下相容的 parseBeats 介面
 */
export function parseBeats(str, bpm, slide = false) {
    if (slide) {
        return parseSlideTime(str, bpm);
    }
    return parseHoldTime(str, bpm);
}
// Pre-computed mathematical constants
const PI = Math.PI;
const HALF_PI = Math.PI * 0.5;
const QUARTER_PI = Math.PI / 4;

const R_INNER_38 = innerCirleBase * 0.38;
const R_OUTER_42 = innerCirleBase * 0.42;
const R_INNER_S_Z = innerCirleBase * 0.414;
const R_CIR_CENTER = innerCirleBase * 0.456;
const R_CIR_ARC_1 = innerCirleBase * 0.472;
const R_CIR_ARC_2 = innerCirleBase * 0.466;

// Pre-computed lookup factors for pp and qq slides
const PP_C_FACTORS = [-0.3, -0.35, -0.2, 0, 0.02, 0, -0.15, -0.2];
const QQ_C_FACTORS = [0.3, 0.35, 0.2, 0, -0.02, 0, 0.15, 0.2];

const _slidePathCache = new Map();

/**
 * 清除滑星幾何路徑快取
 */
export function clearSlidePathCache() {
    _slidePathCache.clear();
}

/**
 * Calculates geometry path for a slide note (with memoization cache).
 * @param {number} start Start position (1-8)
 * @param {number} end End position (1-8)
 * @param {string} type Slide type identifier
 * @param {number|null} mid Middle position for V slides
 * @returns {{ path: PathRecorder, additional: Object, illegal: boolean }}
 */
export function getSlidePath(start, end, type, mid = null) {
    const key = `${start}_${end}_${type}_${mid ?? ''}`;
    const cached = _slidePathCache.get(key);
    if (cached) {
        return cached;
    }
    const computed = computeSlidePath(start, end, type, mid);
    _slidePathCache.set(key, computed);
    return computed;
}

function computeSlidePath(start, end, type, mid = null) {
    const r = new PathRecorder();
    const startInfo = noteRefPos[start - 1];
    const endInfo = noteRefPos[end - 1];
    let illegal = false;
    const c = (end - start + 8) % 8;
    const e = start === end;
    const additional = {};

    switch (type) {
        case '-':
            if (c === 1 || c === 7 || e) illegal = true;
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        case '^':
            if (c === 4 || e) illegal = true;
            if (e) {
                r.moveTo(startInfo.x, startInfo.y);
                break;
            }
            r.arc(0, 0, innerCirleBase, startInfo.rot - HALF_PI, endInfo.rot - HALF_PI, c > 4);
            break;
        case '>':
            r.arc(0, 0, innerCirleBase, startInfo.rot - HALF_PI, endInfo.rot - HALF_PI, start >= 3 && start <= 6);
            break;
        case '<':
            r.arc(0, 0, innerCirleBase, startInfo.rot - HALF_PI, endInfo.rot - HALF_PI, !(start >= 3 && start <= 6));
            break;
        case 'v':
            if (c === 4 || e) illegal = true;
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(0, 0);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        case 'V': {
            const s = (start - mid + 8) % 8;
            const m = (mid - end + 8) % 8;
            if (
                (s !== 2 && s !== 6) || e ||
                mid === end || start === mid ||
                (s === 2 && !(m >= 2 && m <= 5)) ||
                (s === 6 && !(m >= 3 && m <= 6))
            ) {
                illegal = true;
            }
            const midInfo = noteRefPos[mid - 1];
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(midInfo.x, midInfo.y);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        }
        case 'q': {
            const startAngle = startInfo.rot - PI * 0.12;
            const endAngle = endInfo.rot + PI * 1.09;
            const exitAngle = endInfo.rot + PI * 1.265;

            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(0, 0, R_INNER_38, startAngle);
            r.arc(0, 0, R_INNER_38 * 1.001, startAngle, endAngle, start < end && c >= 4);
            r.lineToArc(0, 0, R_OUTER_42, exitAngle);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        }
        case 'p': {
            const startAngle = startInfo.rot + PI * 1.09;
            const endAngle = endInfo.rot - PI * 0.12;
            const exitAngle = endInfo.rot - PI * 0.26;

            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(0, 0, R_INNER_38, startAngle);
            r.arc(0, 0, R_INNER_38 * 1.001, startAngle, endAngle, !(end < start && (end - start + 8) % 8 <= 4));
            r.lineToArc(0, 0, R_OUTER_42, exitAngle);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        }
        case 'pp': {
            const cir = {
                x: Math.cos((start - 0.971) * QUARTER_PI) * R_CIR_CENTER,
                y: Math.sin((start - 0.971) * QUARTER_PI) * R_CIR_CENTER,
            };
            const angleFactor = PP_C_FACTORS[c] || 0;
            const anticlockwise = (end > start && (end - start + 8) % 8 >= 3) || (start > end && (end - start + 8) % 8 === 3);

            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(cir.x, cir.y, R_CIR_ARC_1, startInfo.rot - PI);
            r.arc(cir.x, cir.y, R_CIR_ARC_2, startInfo.rot - PI, endInfo.rot + PI * angleFactor, true, anticlockwise);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        }
        case 'qq': {
            const qc = (start - end + 8) % 8;
            const cir = {
                x: Math.cos((start - 4.028) * QUARTER_PI) * R_CIR_CENTER,
                y: Math.sin((start - 4.028) * QUARTER_PI) * R_CIR_CENTER,
            };
            const angleFactor = QQ_C_FACTORS[qc] || 0;
            const anticlockwise = (start > end && qc >= 3) || (end > start && qc === 3);

            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(cir.x, cir.y, R_CIR_ARC_1, startInfo.rot);
            r.arc(cir.x, cir.y, R_CIR_ARC_2, startInfo.rot, endInfo.rot + PI * (-1 + angleFactor), false, anticlockwise);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        }
        case 's':
            if (c !== 4 || e) illegal = true;
            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(0, 0, R_INNER_S_Z, startInfo.rot - PI);
            r.lineToArc(0, 0, R_INNER_S_Z, startInfo.rot - PI * 2);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        case 'z':
            if (c !== 4 || e) illegal = true;
            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(0, 0, R_INNER_S_Z, startInfo.rot - PI * 2);
            r.lineToArc(0, 0, R_INNER_S_Z, startInfo.rot - PI);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        case 'w': {
            if (c !== 4 || e) illegal = true;
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(endInfo.x, endInfo.y);

            const a = noteRefPos[(end - 2 + 8) % 8];
            const b = noteRefPos[end % 8];
            additional.w1 = new PathRecorder();
            additional.w2 = new PathRecorder();

            additional.w1.moveTo(startInfo.x, startInfo.y);
            additional.w1.lineTo(a.x, a.y);

            additional.w2.moveTo(startInfo.x, startInfo.y);
            additional.w2.lineTo(b.x, b.y);
            break;
        }
        default:
            if (e) illegal = true;
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(endInfo.x, endInfo.y);
            pushWarn("Not implemented slide type, defaulting to straight line:", type);
            illegal = true;
            break;
    }

    return { path: r, additional, illegal };
}

function splitChartByComma(str) {
    const parts = [];
    let current = '';
    let inBracket = 0; // [...]
    let inParen = 0;   // (...)
    let inBrace = 0;   // {...}

    for (let i = 0; i < str.length; i++) {
        // If we encounter a property tag e.g. <SIZE*(1.5,2)> or <HS*1.25>, consume it atomically
        if (str[i] === '<') {
            const rest = str.slice(i);
            const propMatch = rest.match(/^<[A-Za-z]+\*[^>]*>/);
            if (propMatch) {
                current += propMatch[0];
                i += propMatch[0].length - 1;
                continue;
            }
        }

        const char = str[i];
        if (char === '[') inBracket++;
        else if (char === ']') inBracket = Math.max(0, inBracket - 1);
        else if (char === '(') inParen++;
        else if (char === ')') inParen = Math.max(0, inParen - 1);
        else if (char === '{') inBrace++;
        else if (char === '}') inBrace = Math.max(0, inBrace - 1);

        if (char === ',' && inBracket === 0 && inParen === 0 && inBrace === 0) {
            parts.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    if (current !== '' || str.endsWith(',')) {
        parts.push(current);
    }
    return parts;
}

let _incrementalCache = {
    raw: null,
    baseOffset: true,
    splitParts: null,
    blocks: null,
    result: null
};

/**
 * 清除增量解析快取
 */
export function clearIncrementalCache() {
    _incrementalCache = {
        raw: null,
        baseOffset: true,
        splitParts: null,
        blocks: null,
        result: null
    };
}

/**
 * 解析單個逗號小節區塊 (Comma Block)
 * @param {string} e 該小節原始字串
 * @param {number} noteCommaIndex 逗號索引
 * @param {Object} state 進場時間與設定狀態
 * @param {Object} context 共享上下文 (baseOffset, tags, pushWarn)
 */
function decodeCommaBlock(e, noteCommaIndex, state, context) {
    let { nowTime, nowBpm, nowSplit, overrideSplitTime, hispeed, firstBpm, lastBpmTag, lastSplitTag, lastSplitTagCommIndex } = state;
    const { baseOffset, tags, pushWarn } = context;
    const commaNotes = [];
    const eventProps = [];
    let eventHispeed = null;
    let eventSize = null;
    let eventColor = null;
    let tapCounts = 0, holdCounts = 0, slideCounts = 0, touchCounts = 0, breakCounts = 0;
    let maxEndTime = nowTime;
    let hasTimingChange = false;

    // 1. Extract leading tags (BPM, Split, and Property tags) in sequence
    while (e.length > 0) {
        if (e.startsWith('(')) {
            hasTimingChange = true;
            const closeIdx = e.indexOf(')');
            if (closeIdx === -1) { pushWarn("Unclosed BPM tag '(', ", { errpos: noteCommaIndex }); break; }
            const bpmContent = e.slice(1, closeIdx).trim();
            const bpmVal = parseFloat(bpmContent);
            if (isNaN(bpmVal) || bpmVal <= 0) {
                pushWarn(`Invalid BPM value in (${bpmContent}), `, { errpos: noteCommaIndex });
            } else {
                nowBpm = bpmVal;
                if (nowTime === 0 && baseOffset) nowTime = (60 / nowBpm) * 4;
                if (firstBpm === null) firstBpm = nowBpm;
                tags.push({ type: 'bpm', value: nowBpm, time: nowTime });

                let tg;
                if (lastBpmTag !== -1) {
                    tg = tags[lastBpmTag];
                    tg.nextTime = nowTime;
                }
                lastBpmTag = tags.length - 1;

                if (lastSplitTag !== -1 && tags[lastSplitTag].time !== nowTime && tg && tg.bpm !== nowBpm) {
                    tags.push({ type: 'split', value: nowSplit, bpm: nowBpm, time: nowTime, nohead: true, synthetic: true });
                    tags[lastSplitTag].renderTimes = noteCommaIndex - lastSplitTagCommIndex + 1;
                    lastSplitTag = tags.length - 1;
                    lastSplitTagCommIndex = noteCommaIndex;
                }
            }
            e = e.slice(closeIdx + 1);
        } else if (e.startsWith('{')) {
            hasTimingChange = true;
            const closeIdx = e.indexOf('}');
            if (closeIdx === -1) { pushWarn("Unclosed split tag '{', ", { errpos: noteCommaIndex }); break; }
            const splitContent = e.slice(1, closeIdx).trim();
            if (splitContent.startsWith('#')) {
                const dur = parseFloat(splitContent.slice(1));
                if (isNaN(dur) || dur < 0) {
                    pushWarn(`Invalid split duration in {${splitContent}}, `, { errpos: noteCommaIndex });
                } else {
                    overrideSplitTime = dur;
                    tags.push({
                        type: 'split', value: nowSplit, bpm: nowBpm, time: nowTime,
                        nohead: lastBpmTag !== -1 && tags[lastBpmTag].time === nowTime,
                    });
                    lastSplitTag = tags.length - 1;
                    lastSplitTagCommIndex = noteCommaIndex;
                }
            } else {
                const splitVal = parseFloat(splitContent);
                if (isNaN(splitVal) || splitVal <= 0) {
                    pushWarn(`Invalid split value in {${splitContent}}, `, { errpos: noteCommaIndex });
                } else {
                    nowSplit = splitVal;
                    overrideSplitTime = null;
                    tags.push({
                        type: 'split', value: nowSplit, bpm: nowBpm, time: nowTime,
                        nohead: lastBpmTag !== -1 && tags[lastBpmTag].time === nowTime,
                    });
                    lastSplitTag = tags.length - 1;
                    lastSplitTagCommIndex = noteCommaIndex;
                }
            }
            e = e.slice(closeIdx + 1);
        } else if (e.startsWith('<')) {
            const match = e.match(/^<([A-Za-z]+\*[^>]*)>/);
            if (!match) break;
            const tagContent = match[1];
            const parsed = parsePropertyTag(tagContent);
            if (!parsed.valid) {
                pushWarn(`Invalid property tag <${tagContent}>: ${parsed.error || 'invalid syntax'}, `, { errpos: noteCommaIndex });
            } else {
                eventProps.push(parsed.raw);
                if (parsed.type === 'HS') {
                    hispeed = parsed.value;
                    eventHispeed = parsed.value;
                } else if (parsed.type === 'SIZE') {
                    eventSize = parsed.value;
                } else if (parsed.type === 'COLOR') {
                    eventColor = parsed.value;
                }
            }
            e = e.slice(match[0].length);
        } else {
            break;
        }
    }

    if (lastSplitTag !== -1) {
        tags[lastSplitTag].renderTimes = noteCommaIndex - lastSplitTagCommIndex + 1;
    }

    if (overrideSplitTime) nowBpm = 240 / overrideSplitTime;

    // 2. Detect misplaced property tags inside e
    const misplacedTags = e.match(/<[A-Za-z]+\*[^>]*>/g);
    if (misplacedTags) {
        for (const tag of misplacedTags) {
            pushWarn(`Misplaced property tag "${tag}": property tags must only appear at the beginning of the note group, `, { errpos: noteCommaIndex });
        }
        e = e.replace(/<[A-Za-z]+\*[^>]*>/g, '');
    }

    const commaDuration = overrideSplitTime ?? (60 / nowBpm) * (4 / nowSplit);
    if (nowTime + commaDuration > maxEndTime) {
        maxEndTime = nowTime + commaDuration;
    }

    if (!e || e === '') {
        return {
            rawPart: e,
            commaIndex: noteCommaIndex,
            startTime: nowTime,
            duration: commaDuration,
            notes: commaNotes,
            counts: { tap: 0, hold: 0, slide: 0, touch: 0, break: 0 },
            maxEndTime,
            hasTimingChange,
            stateOut: {
                nowTime: nowTime + commaDuration,
                nowBpm,
                nowSplit,
                overrideSplitTime,
                hispeed,
                firstBpm,
                lastBpmTag,
                lastSplitTag,
                lastSplitTagCommIndex
            }
        };
    }

    // 3. Processing sub-notes split by `
    const rawSubNotes = e.includes('`') ? e.split('`') : [e];
    const notesToProcess = [];

    for (let i = 0; i < rawSubNotes.length; i++) {
        const trimmed = rawSubNotes[i].trim();
        if (trimmed === '') {
            if (e.includes('`')) pushWarn("Empty note detected in backticks, ", { errpos: noteCommaIndex });
        } else {
            notesToProcess.push({ raw: trimmed, time: e.includes('`') ? nowTime + i * 0.001 : nowTime });
        }
    }

    for (const { raw: rawItem, time } of notesToProcess) {
        let raw = rawItem;
        const splitrRaw = raw.includes('/') ? raw.split('/') : [raw];
        let hasEmptySplit = false;
        const splitr = [];

        for (let i = 0; i < splitrRaw.length; i++) {
            const item = splitrRaw[i].trim();
            if (item === '') {
                hasEmptySplit = true;
            } else {
                splitr.push(item);
            }
        }

        if (hasEmptySplit) {
            pushWarn("Empty note detected in split, ", { errpos: noteCommaIndex });
        }

        // Handle shorthand double tap e.g. "11" or "22"
        if (splitr.length === 1 && !isNaN(splitr[0]) && splitr[0].length === 2) {
            const s = splitr[0];
            if (s.charAt(0) === s.charAt(1)) {
                pushWarn("Overlapping note position:", { errpos: noteCommaIndex });
                continue;
            }
            const p1 = parseInt(s.charAt(0)), p2 = parseInt(s.charAt(1));
            if (p1 < 1 || p1 > 8 || p2 < 1 || p2 > 8) {
                pushWarn("Invalid note position:", { errpos: noteCommaIndex });
                continue;
            }
            commaNotes.push({
                pos: p1,
                props: eventProps.length > 0 ? eventProps : null,
                hispeed: eventHispeed !== null ? eventHispeed : hispeed,
                size: eventSize !== null ? eventSize : null,
                color: eventColor !== null ? eventColor : null,
                isDouble: true, time, type: 'tap', index: noteCommaIndex,
                isBreak: false, isHold: false, isMine: false, isEx: false
            }, {
                pos: p2,
                props: eventProps.length > 0 ? eventProps : null,
                hispeed: eventHispeed !== null ? eventHispeed : hispeed,
                size: eventSize !== null ? eventSize : null,
                color: eventColor !== null ? eventColor : null,
                isDouble: true, time, type: 'tap', index: noteCommaIndex,
                isBreak: false, isHold: false, isMine: false, isEx: false
            });
            tapCounts += 2;
            if (time > maxEndTime) maxEndTime = time;
            continue;
        }

        let doubleSlideCount = 0;
        if (splitr.length > 1) {
            for (const p of splitr) {
                if (p.match(REGEX_SLIDE_SYMBOL)) {
                    doubleSlideCount++;
                    if (doubleSlideCount > 1) break;
                }
            }
        }
        const doubleSlide = doubleSlideCount > 1;

        for (let noteStr of splitr) {
            const posMatch = noteStr.match(REGEX_POS_MATCH);
            const touchMatch = noteStr.match(REGEX_TOUCH_MATCH);

            if (!(posMatch || touchMatch)) {
                pushWarn("Invalid note format:", { errpos: noteCommaIndex });
                continue;
            }

            const slideMatch = noteStr.match(REGEX_SLIDE_SYMBOL);

            // Validation check for remaining invalid characters
            let tempCheck = noteStr
                .replace(REGEX_POS_TOUCH_PREFIX, '')
                .replace(REGEX_SLIDE_PATTERN, '')
                .replace(REGEX_BRACKET_CONTENT, '')
                .replace(REGEX_VALID_FLAGS, '');

            if (tempCheck.length > 0) {
                pushWarn(`Invalid character(s) "${tempCheck}" detected in note "${noteStr}", `, { errpos: noteCommaIndex });
                continue;
            }

            let pos, touchPos = null, type = 'tap';
            if (touchMatch) {
                if (touchMatch[0] === 'C') {
                    touchPos = 'C';
                    pos = 1;
                } else {
                    touchPos = touchMatch[1];
                    pos = parseInt(touchMatch[2]);
                    if (pos < 1 || pos > 8) {
                        pushWarn("Invalid touch position:", { errpos: noteCommaIndex });
                        continue;
                    }
                }
                type = 'touch';
                touchCounts++;
            } else {
                pos = parseInt(posMatch[0]);
                if (pos < 1 || pos > 8) {
                    pushWarn("Invalid note position:", { errpos: noteCommaIndex });
                    continue;
                }
                tapCounts++;
            }

            const noteObj = {
                pos,
                props: eventProps.length > 0 ? eventProps : null,
                hispeed: eventHispeed !== null ? eventHispeed : hispeed,
                size: eventSize !== null ? eventSize : null,
                color: eventColor !== null ? eventColor : null,
                touchPos,
                isDouble: splitr.length > 1,
                time,
                type,
                index: noteCommaIndex,
                isBreak: false,
                isHold: false,
                isMine: false,
                isEx: false
            };

            // Check Flags
            if (noteStr.includes('b') && !slideMatch) {
                if (touchMatch) {
                    pushWarn("Break flag 'b' is not allowed in touch notes, ", { errpos: noteCommaIndex });
                    continue;
                }
                noteObj.isBreak = true;
                breakCounts++;
                tapCounts--;
                noteStr = noteStr.replace(/b/g, '');
            }

            if (noteStr.includes('m') && !slideMatch) {
                noteObj.isMine = true;
                noteStr = noteStr.replace(/m/g, '');
            }

            if (noteStr.includes('$')) {
                if (slideMatch) pushWarn("Slide already have a star! This is unnecessary,", { errpos: noteCommaIndex });
                if (touchMatch) {
                    pushWarn("Star flag '$' is not allowed in touch notes, ", { errpos: noteCommaIndex });
                    continue;
                }
                if (noteStr.includes('h')) {
                    pushWarn("Star flag '$' is not allowed in hold notes, ", { errpos: noteCommaIndex });
                    continue;
                }
                noteObj.isStar = true;
                noteStr = noteStr.replace(/\$/g, '');
            }

            if (noteStr.includes('x')) {
                noteObj.isEx = true;
                noteStr = noteStr.replace(/x/g, '');
            }

            if (noteStr.includes('f')) {
                if (!slideMatch && touchMatch) {
                    noteObj.isHanabi = true;
                    if (noteStr.replace(/f/, '').includes('f')) {
                        pushWarn("Multiple Hanabi flags 'f' detected, ", { errpos: noteCommaIndex });
                        continue;
                    }
                } else {
                    pushWarn("Hanabi flag 'f' is not allowed in other notes!, ", { errpos: noteCommaIndex });
                    continue;
                }
            }

            if (noteStr.includes('h')) {
                if (slideMatch) {
                    pushWarn("Hold flag 'h' is not allowed in slide notes, ", { errpos: noteCommaIndex });
                    continue;
                }
                noteObj.isHold = true;
                if (noteObj.type !== 'touch') noteObj.type = 'hold';

                const match = noteStr.match(REGEX_SINGLE_BRACKET);
                const residue = noteStr.replace(REGEX_SINGLE_BRACKET, '').replace(/h/, '');
                if (residue.includes('h') || residue.includes('[') || residue.includes(']') || !(residue.match(/^\d$/) || touchMatch)) {
                    pushWarn("Invalid format in hold note, ", { errpos: noteCommaIndex });
                    continue;
                }

                noteObj.holdDuration = 1e-4;
                if (match) {
                    const durationStr = match[1].trim();
                    const holdRes = parseHoldTime(durationStr, nowBpm);
                    if (holdRes.time < 0 || isNaN(holdRes.time) || !isFinite(holdRes.time)) {
                        pushWarn(holdRes.error || "Invalid hold syntax in note, ", { errpos: noteCommaIndex });
                        continue;
                    }
                    const duration = holdRes.time;
                    noteObj.holdDuration = (duration > 0) ? duration : 1e-4;
                    if (duration + noteObj.time > maxEndTime) maxEndTime = duration + noteObj.time;
                }

                if (!noteObj.isBreak) {
                    holdCounts++;
                    if (noteObj.type === 'touch') {
                        touchCounts--;
                    } else {
                        tapCounts--;
                    }
                }
            }

            if (noteStr.includes('@') && !slideMatch) {
                pushWarn("Star flag '@' is not allowed in other notes, ", { errpos: noteCommaIndex });
                continue;
            }
            if (noteStr.includes('!') && !slideMatch) {
                pushWarn("Star flag '!' is not allowed in other notes, ", { errpos: noteCommaIndex });
                continue;
            }
            if (noteStr.includes('?') && !slideMatch) {
                pushWarn("Star flag '?' is not allowed in other notes, ", { errpos: noteCommaIndex });
                continue;
            }

            let noHeadSlide = false, hideHeadSlide = false;

            if (slideMatch && !noteStr.includes('h')) {
                let sameTimeSlide = false;
                let slideParts;

                if (noteStr.includes('*')) {
                    const p = noteStr.split('*').map(s => s.trim());
                    for (let i = 1; i < p.length; i++) {
                        if (!/^\d/.test(p[i])) {
                            p[i] = noteObj.pos + p[i];
                        }
                    }
                    slideParts = p;
                } else {
                    slideParts = [noteStr];
                }

                if (slideParts.length > 1) {
                    sameTimeSlide = true;
                    noteObj.isMultiple = true;
                }

                for (let i = 0; i < slideParts.length; i++) {
                    const slidePart = slideParts[i];
                    const slidePartMatch = slidePart.match(REGEX_SLIDE_SYMBOL);
                    if (!slidePartMatch) {
                        pushWarn("Missing slide type in slide note, ", { errpos: noteCommaIndex });
                        continue;
                    }

                    const timeMatches = slidePart.match(REGEX_BRACKET_CONTENT);
                    if (!timeMatches) {
                        pushWarn("Missing time format:", { errpos: noteCommaIndex });
                        continue;
                    }

                    const timeValues = timeMatches.map(m => m.slice(1, -1));
                    const residue = slidePart.replace(REGEX_BRACKET_CONTENT, '');
                    if (residue.includes('[') || residue.includes(']')) {
                        pushWarn("Invalid time format or empty in slide note, ", { errpos: noteCommaIndex });
                        continue;
                    }
                    noteObj.isStar = true;

                    const p = residue.split(REGEX_SLIDE_SYMBOL).filter((_, idx) => idx % 2 === 0);

                    if (p[0].includes('b')) {
                        noteObj.isBreak = true;
                        p[0] = p[0].replace(/b/g, '');
                        breakCounts++;
                        tapCounts--;
                    }
                    if (p[0].includes('m')) {
                        noteObj.isMine = true;
                        p[0] = p[0].replace(/m/g, '');
                    }
                    if (p[0].includes('@')) {
                        noteObj.isStar = false;
                        p[0] = p[0].replace(/@/g, '');
                    }
                    if (p[0].includes('?')) {
                        if (!noteObj.isStar) {
                            pushWarn("Star flag '@' at here is not allowed, ", { errpos: noteCommaIndex });
                            continue;
                        }
                        noHeadSlide = true;
                        p[0] = p[0].replace(/\?/g, '');
                        tapCounts--;
                    }
                    if (p[0].includes('!')) {
                        if (!noteObj.isStar) {
                            pushWarn("Star flag '@' at here is not allowed, ", { errpos: noteCommaIndex });
                            continue;
                        }
                        if (noHeadSlide) {
                            pushWarn("Using '!' and '?' at the same time is contradictory, ", { errpos: noteCommaIndex });
                        }
                        hideHeadSlide = true;
                        p[0] = p[0].replace(/!/g, '');
                    }

                    const isSlideBreak = p.some(part => part.includes('b'));
                    const isSlideMine = p.some(part => part.includes('m'));

                    if (isSlideBreak) {
                        for (let j = 0; j < p.length; j++) {
                            if (p[j].startsWith('b')) pushWarn("Not recommand write break flag like this since it may cause confusion, please put break flag at the end of the slide part!! :", { errpos: noteCommaIndex });
                            p[j] = p[j].replace(/b/g, '');
                        }
                    }
                    if (isSlideMine) {
                        for (let j = 0; j < p.length; j++) {
                            if (p[j].startsWith('m')) pushWarn("Not recommand write mine flag like this since it may cause confusion, please put mine flag at the end of the slide part!! :", { errpos: noteCommaIndex });
                            p[j] = p[j].replace(/m/g, '');
                        }
                    }

                    let d = 0, dlay = 0;
                    let timeError = false;

                    for (let j = 0; j < timeValues.length; j++) {
                        const slideRes = parseSlideTime(timeValues[j], nowBpm);
                        if (slideRes.time < 0 || isNaN(slideRes.time) || !isFinite(slideRes.time)) {
                            pushWarn(slideRes.error || "Invalid time format in slide note, ", { errpos: noteCommaIndex });
                            timeError = true;
                            break;
                        }
                        if (j === 0) dlay = slideRes.delay;
                        d += slideRes.time;
                    }
                    if (timeError) continue;

                    const segments = [];
                    let segError = false;

                    for (let j = 0; j < slidePartMatch.length; j++) {
                        const slideType = slidePartMatch[j];
                        const head = j === 0 ? noteObj.pos : parseInt(p[j].slice(-1));
                        const part = p[j + 1];
                        const end = parseInt(part.slice(-1));
                        const mid = part.length > 1 ? parseInt(part.slice(-2, -1)) : undefined;

                        if (isNaN(head) || head < 1 || head > 8 || isNaN(end) || end < 1 || end > 8) {
                            segError = true;
                            break;
                        }
                        if ((slideType === 'V' && mid === undefined) || (mid !== undefined && (isNaN(mid) || mid < 1 || mid > 8))) {
                            segError = true;
                            break;
                        }

                        const res = getSlidePath(head, end, slideType, mid);
                        if (res.illegal) {
                            pushWarn(`Illegal slide ${head}${slideType}${mid ?? ''}${end}, `, { errpos: noteCommaIndex });
                        }
                        segments.push({
                            head, end, mid, type: slideType, path: res.path, len: res.path.totalLength, illegal: res.illegal, additional: res.additional
                        });
                    }

                    if (segError) {
                        pushWarn("Invalid slide positions:", { errpos: noteCommaIndex });
                        continue;
                    }

                    if (segments.some(s => (s.mid && s.type !== 'V') || (s.type === 'V' && !s.mid))) {
                        pushWarn("Invalid slide positions:", { errpos: noteCommaIndex });
                        continue;
                    }

                    const totalLen = segments.reduce((sum, s) => sum + s.len, 0);
                    let currentDelay = dlay;
                    let cullSkipSum = 0;

                    for (let index = 0; index < segments.length; index++) {
                        const seg = segments[index];
                        const segmentDuration = totalLen > 0 ? d * (seg.len / totalLen) : d / segments.length;

                        if (index === 0) {
                            noteObj.slideDuration = segmentDuration;
                        }
                        cullSkipSum += segmentDuration;

                        commaNotes.push({
                            type: 'slide',
                            index: noteObj.index,
                            props: noteObj.props,
                            hispeed: noteObj.hispeed,
                            size: noteObj.size,
                            color: noteObj.color,
                            pos: seg.head,
                            firstSlide: index === 0,
                            lastSlide: index === segments.length - 1,
                            hideHead: hideHeadSlide ? true : index !== 0,
                            isDouble: sameTimeSlide || doubleSlide,
                            isBreak: isSlideBreak,
                            isHold: false,
                            isMine: isSlideMine,
                            isEx: false,
                            slideEnd: seg.end,
                            slideMid: seg.mid,
                            slideType: seg.type,
                            path: seg.path,
                            wPaths: seg.additional,
                            time: noteObj.time,
                            slideDelay: currentDelay,
                            slideDuration: segmentDuration,
                            isIllegal: seg.illegal,
                            cullSkipExtend: d - cullSkipSum,
                            endTangent: seg.path.endTangent(),
                        });

                        if (index === segments.length - 1) {
                            if (isSlideBreak) breakCounts++;
                            else slideCounts++;
                        }

                        if (noteObj.time + currentDelay + segmentDuration > maxEndTime) {
                            maxEndTime = noteObj.time + currentDelay + segmentDuration;
                        }
                        currentDelay += segmentDuration;
                    }
                }
            }

            if (!(noHeadSlide || hideHeadSlide)) {
                commaNotes.push(noteObj);
            }
        }
    }

    return {
        rawPart: e,
        commaIndex: noteCommaIndex,
        startTime: nowTime,
        duration: commaDuration,
        notes: commaNotes,
        counts: { tap: tapCounts, hold: holdCounts, slide: slideCounts, touch: touchCounts, break: breakCounts },
        maxEndTime,
        hasTimingChange,
        stateOut: {
            nowTime: nowTime + commaDuration,
            nowBpm,
            nowSplit,
            overrideSplitTime,
            hispeed,
            firstBpm,
            lastBpmTag,
            lastSplitTag,
            lastSplitTagCommIndex
        }
    };
}

/**
 * 執行完整的全量解析並建構 Block 快取清單
 */
function executeFullDecode(raw, splitParts, baseOffset, options) {
    const notes = [];
    const tags = [];
    let firstBpm = null;
    let endTime = 0;
    const indexToTime = [];
    const blocks = [];

    let tapCounts = 0, holdCounts = 0, slideCounts = 0, touchCounts = 0, breakCounts = 0;

    let currentState = {
        nowTime: 0,
        nowBpm: 60,
        nowSplit: 4,
        overrideSplitTime: null,
        hispeed: 1,
        firstBpm: null,
        lastBpmTag: -1,
        lastSplitTag: -1,
        lastSplitTagCommIndex: -1
    };

    const context = {
        baseOffset,
        tags,
        pushWarn
    };

    for (let i = 0; i < splitParts.length; i++) {
        const part = splitParts[i];
        indexToTime[i] = currentState.nowTime;

        const block = decodeCommaBlock(part, i, currentState, context);
        blocks.push(block);

        if (block.notes.length > 0) {
            for (let n = 0; n < block.notes.length; n++) {
                notes.push(block.notes[n]);
            }
        }

        tapCounts += block.counts.tap;
        holdCounts += block.counts.hold;
        slideCounts += block.counts.slide;
        touchCounts += block.counts.touch;
        breakCounts += block.counts.break;

        if (block.maxEndTime > endTime) {
            endTime = block.maxEndTime;
        }

        currentState = block.stateOut;
        if (firstBpm === null && currentState.firstBpm !== null) {
            firstBpm = currentState.firstBpm;
        }
    }

    indexToTime[splitParts.length] = currentState.nowTime;
    if (currentState.nowTime > endTime) endTime = currentState.nowTime;

    if (options && options.debug) {
        if (warns.length > 0) {
            console.warn("Decoding finished with warnings:", warns);
        }
        console.group("Decoded Notes:");
        console.log("notes: ", notes);
        console.log("endTime: ", endTime);
        console.log(
            `tap: ${tapCounts},
hold: ${holdCounts},
slide: ${slideCounts},
touch: ${touchCounts},
break: ${breakCounts}`
        );
        console.log(tags);
        console.groupEnd();
    }

    const result = {
        notes,
        endTime,
        tags,
        bpm: firstBpm || 60,
        baseOffset,
        notesCounts: {
            tap: tapCounts,
            hold: holdCounts,
            slide: slideCounts,
            touch: touchCounts,
            break: breakCounts,
        },
        score: (tapCounts + touchCounts + holdCounts * 2 + slideCounts * 3 + breakCounts * 5) || 0,
        failed: false,
        warnings: warns,
        errpositions: warnpos,
        indexToTime,
    };

    _incrementalCache.raw = raw;
    _incrementalCache.baseOffset = baseOffset;
    _incrementalCache.splitParts = splitParts;
    _incrementalCache.blocks = blocks;
    _incrementalCache.result = result;

    return result;
}

/**
 * Decodes Simai chart data into structured note, tag, and timing data.
 * @param {string} data Raw Simai chart string
 * @param {boolean} baseOffset Whether to compute initial offset based on first BPM tag
 * @param {Object} options 解析選項 (如 disableSyntaxCheck, forceFull, debug)
 */
export function simaiDecode(data = "", baseOffset = true, options = {}) {
    _disableSyntaxCheck = !!(options && options.disableSyntaxCheck);
    warns = [];
    warnpos = [];

    const raw = data
        .replace(REGEX_MULTILINE_COMMENT, "")
        .replace(REGEX_COMMENT, "")
        .replace(REGEX_WHITESPACE, '');
    if (raw === '') {
        clearIncrementalCache();
        return {
            notes: [],
            endTime: 0,
            tags: [],
            bpm: 60,
            baseOffset,
            notesCounts: {
                tap: 0,
                hold: 0,
                slide: 0,
                touch: 0,
                break: 0,
            },
            score: 0,
        };
    }

    // 檢查情境 1: 內容與 offset 完全一致，直接返回快取結果
    if (
        !options.forceFull &&
        _incrementalCache.raw === raw &&
        _incrementalCache.baseOffset === baseOffset &&
        _incrementalCache.result
    ) {
        return { ..._incrementalCache.result };
    }

    const splitParts = splitChartByComma(raw);
    if (raw.endsWith(',') || raw.endsWith('E')) {
        splitParts.pop();
    }
    _sp = splitParts;

    // 檢查情境 2: 嘗試增量解析 (逗號總數相同，且變更範圍不含 BPM / Split 等結構標籤)
    if (
        !options.forceFull &&
        _incrementalCache.splitParts &&
        _incrementalCache.blocks &&
        _incrementalCache.result &&
        _incrementalCache.baseOffset === baseOffset &&
        _incrementalCache.splitParts.length === splitParts.length &&
        _incrementalCache.blocks.length === splitParts.length
    ) {
        const oldParts = _incrementalCache.splitParts;
        const totalLen = splitParts.length;

        let prefixLen = 0;
        while (prefixLen < totalLen && splitParts[prefixLen] === oldParts[prefixLen]) {
            prefixLen++;
        }

        let suffixLen = 0;
        while (
            suffixLen < totalLen - prefixLen &&
            splitParts[totalLen - 1 - suffixLen] === oldParts[totalLen - 1 - suffixLen]
        ) {
            suffixLen++;
        }

        const changeStart = prefixLen;
        const changeEnd = totalLen - 1 - suffixLen;

        // 確保修改區段兩側與變更內容都不包含 BPM 或 Split 標籤
        let canIncremental = true;
        for (let i = changeStart; i <= changeEnd; i++) {
            const oldP = oldParts[i];
            const newP = splitParts[i];
            if (oldP.includes('(') || oldP.includes('{') || oldP.includes('<') ||
                newP.includes('(') || newP.includes('{') || newP.includes('<')) {
                canIncremental = false;
                break;
            }
        }

        if (canIncremental) {
            const context = {
                baseOffset,
                tags: _incrementalCache.result.tags,
                pushWarn
            };

            const newBlocks = [..._incrementalCache.blocks];
            for (let i = changeStart; i <= changeEnd; i++) {
                const prevBlock = i > 0 ? newBlocks[i - 1] : null;
                const stateIn = prevBlock
                    ? { ...prevBlock.stateOut, nowTime: newBlocks[i].startTime }
                    : {
                        nowTime: (baseOffset ? (60 / 60) * 4 : 0),
                        nowBpm: 60,
                        nowSplit: 4,
                        overrideSplitTime: null,
                        hispeed: 1,
                        firstBpm: null,
                        lastBpmTag: -1,
                        lastSplitTag: -1,
                        lastSplitTagCommIndex: -1
                    };
                newBlocks[i] = decodeCommaBlock(splitParts[i], i, stateIn, context);
            }

            // 重新匯總所有 Block
            const allNotes = [];
            let tapCounts = 0, holdCounts = 0, slideCounts = 0, touchCounts = 0, breakCounts = 0;
            let maxEndTime = 0;
            const indexToTime = [];

            for (let i = 0; i < totalLen; i++) {
                const b = newBlocks[i];
                indexToTime[i] = b.startTime;
                if (b.notes.length > 0) {
                    for (let n = 0; n < b.notes.length; n++) {
                        allNotes.push(b.notes[n]);
                    }
                }
                tapCounts += b.counts.tap;
                holdCounts += b.counts.hold;
                slideCounts += b.counts.slide;
                touchCounts += b.counts.touch;
                breakCounts += b.counts.break;
                if (b.maxEndTime > maxEndTime) maxEndTime = b.maxEndTime;
            }

            const lastBlock = newBlocks[totalLen - 1];
            indexToTime[totalLen] = lastBlock.stateOut.nowTime;
            if (lastBlock.stateOut.nowTime > maxEndTime) {
                maxEndTime = lastBlock.stateOut.nowTime;
            }

            const result = {
                notes: allNotes,
                endTime: maxEndTime,
                tags: _incrementalCache.result.tags,
                bpm: _incrementalCache.result.bpm,
                baseOffset,
                notesCounts: {
                    tap: tapCounts,
                    hold: holdCounts,
                    slide: slideCounts,
                    touch: touchCounts,
                    break: breakCounts,
                },
                score: (tapCounts + touchCounts + holdCounts * 2 + slideCounts * 3 + breakCounts * 5) || 0,
                failed: false,
                warnings: warns,
                errpositions: warnpos,
                indexToTime,
            };

            _incrementalCache.raw = raw;
            _incrementalCache.splitParts = splitParts;
            _incrementalCache.blocks = newBlocks;
            _incrementalCache.result = result;

            return result;
        }
    }

    // 情況 3: 全量解析並建立快取
    return executeFullDecode(raw, splitParts, baseOffset, options);
}