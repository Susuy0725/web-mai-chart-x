/**
 * slideEditorModal.js
 * 
 * 視覺化編輯器 - 滑星軌跡編輯視窗 (Material Design 原生 HTML + CSS)
 * 支援多段複合滑星切換編輯、純 simai 連接符形狀選擇、合規終點鍵位選擇、增減段落
 * 置頂固定預覽窗直接採用主渲染器 (SimaiRenderer) 繪製
 */

import { popupWindow, simpleToast } from '../helper.js';
import { SimaiRenderer } from '../renderer.js';
import { simaiDecode } from '../decode.js';
import { t } from '../i18n.js';

/**
 * 軌跡形狀符號清單 (純 simai 連接符，無多餘描述)
 */
const SLIDE_PATTERNS = ['-', '>', '<', '^', 'v', 'p', 'q', 'pp', 'qq', 's', 'z', 'w', 'V'];

/**
 * 判定給定起點、終點與形狀是否為 maimai 合法滑星軌跡
 * @param {number} start 起點鍵位 (1-8)
 * @param {number} end 終點鍵位 (1-8)
 * @param {string} type 軌跡符號
 * @param {number|null} [mid=null] 中繼點鍵位 (僅 V 字折角需要)
 * @returns {boolean} 是否合法
 */
export function isSlideLegal(start, end, type, mid = null) {
    if (!start || !end || start < 1 || start > 8 || end < 1 || end > 8) return false;
    const c = (end - start + 8) % 8;
    const e = (start === end);

    switch (type) {
        case '-':
            // 直線：不可為相鄰鍵 (距離 1 或 7) 或自身
            return !(c === 1 || c === 7 || e);
        case '^':
            // 折線：不可為對向鍵 (距離 4) 或自身
            return !(c === 4 || e);
        case '>':
        case '<':
            // 圓弧：不可為自身
            return !e;
        case 'v':
            // V 字形：不可為對向鍵 (距離 4) 或自身
            return !(c === 4 || e);
        case 's':
        case 'z':
        case 'w':
            // S 形、反 S 形、扇形：必須為正對向鍵 (距離 4) 且不可為自身
            return (c === 4 && !e);
        case 'p':
        case 'q':
        case 'pp':
        case 'qq':
            // 大圓弧、雙圓弧：允許自身鍵 (繞圈回到原鍵)
            return true;
        case 'V': {
            if (mid === null || mid === undefined) {
                for (let testMid = 1; testMid <= 8; testMid++) {
                    if (isSlideLegal(start, end, 'V', testMid)) return true;
                }
                return false;
            }
            const s = (start - mid + 8) % 8;
            const m = (mid - end + 8) % 8;
            if (
                (s !== 2 && s !== 6) || e ||
                mid === end || start === mid ||
                (s === 2 && !(m >= 2 && m <= 5)) ||
                (s === 6 && !(m >= 3 && m <= 6))
            ) {
                return false;
            }
            return true;
        }
        default:
            return true;
    }
}

/**
 * 判定給定起點與中繼點是否為合法大 V 中繼點位 (起點 +2 或 -2)
 * @param {number} start 起點鍵位 (1-8)
 * @param {number} mid 中繼點鍵位 (1-8)
 * @returns {boolean} 是否為合法中繼點
 */
export function isLegalVMid(start, mid) {
    if (!start || !mid || start < 1 || start > 8 || mid < 1 || mid > 8) return false;
    const diff = (start - mid + 8) % 8;
    return diff === 2 || diff === 6;
}

/**
 * 取得指定起點的合法中繼點，若 fallbackMid 為合法點位則回傳 fallbackMid，否則預設回傳起點 +2
 * @param {number} start 起點鍵位 (1-8)
 * @param {number|null} [fallbackMid=null] 備選中繼點
 * @returns {number} 合法中繼點 (1-8)
 */
export function getLegalVMid(start, fallbackMid = null) {
    if (fallbackMid && isLegalVMid(start, fallbackMid)) return fallbackMid;
    return ((start - 1 + 2) % 8) + 1;
}

/**
 * 尋找指定起點與形狀的第一個合法終點
 * @param {number} start 起點鍵位
 * @param {string} type 軌跡形狀
 * @param {number} fallback 當前終點
 * @param {number|null} mid 中繼點
 * @returns {number} 合法終點鍵位
 */
function findLegalEnd(start, type, fallback = 1, mid = null) {
    const validMid = (type === 'V') ? getLegalVMid(start, mid) : mid;
    if (isSlideLegal(start, fallback, type, validMid)) return fallback;
    for (let test = 1; test <= 8; test++) {
        if (isSlideLegal(start, test, type, validMid)) return test;
    }
    return fallback;
}

/**
 * 解析單一條滑線的段落 (不含起點鍵位與旗標)
 * @param {string} residue 軌跡字串 (如 "-4", ">3-5", "V24")
 * @param {number} headLane 起點鍵位 (1-8)
 * @returns {Array<{type: string, mid?: number, end: number}>}
 */
function parseSegmentsFromResidue(residue, headLane) {
    const segments = [];
    const REGEX_SEG = /((?:pp)|(?:qq)|[-<>^vpqszVw])(\d+)/g;
    let match;

    while ((match = REGEX_SEG.exec(residue)) !== null) {
        const type = match[1];
        const numStr = match[2];
        let mid = undefined;
        let end = 1;

        if (type === 'V') {
            const segStart = segments.length === 0 ? headLane : segments[segments.length - 1].end;
            if (numStr.length >= 2) {
                mid = parseInt(numStr[0], 10);
                end = parseInt(numStr.slice(1), 10);
            } else {
                mid = getLegalVMid(segStart);
                end = parseInt(numStr, 10);
            }
        } else {
            end = parseInt(numStr.slice(-1), 10);
        }

        segments.push({ type, mid, end });
    }

    if (segments.length === 0) {
        const defaultEnd = ((headLane + 3) % 8) + 1;
        segments.push({
            type: '-',
            mid: undefined,
            end: defaultEnd
        });
    }

    return segments;
}

/**
 * 解析滑星時長字串結構
 * @param {string} rawDur 原始時長 (例如 "[4:1]", "[1.5##160#4:1]", "[160#4:1]", "[1.0]")
 * @returns {Object} 時長狀態物件
 */
export function parseSlideDuration(rawDur) {
    const cleanDur = (rawDur || '').replace(/[\[\]]/g, '').trim();
    const state = {
        useCustomWait: false,      // 是否自訂等候時間 (預設 1 拍等候)
        waitMode: 'seconds',       // 'seconds' (語法 ##) | 'bpm' (語法 #)
        waitSec: 1.0,              // 自訂等候秒數
        slideWaitBpm: '',          // 指定等候 BPM
        slideTracingMode: 'beat',  // 'beat' | 'seconds'
        time: 4,                   // 幾分音符
        beat: 1,                   // 拍數
        slideBpm: '',              // 劃動 BPM (自訂等候秒數模式下)
        slideSeconds: 1.0          // 劃動秒數
    };

    if (!cleanDur) return state;

    if (cleanDur.includes('##')) {
        state.useCustomWait = true;
        state.waitMode = 'seconds';
        const parts = cleanDur.split('##');
        state.waitSec = parseFloat(parts[0]) || 1.0;
        const residue = parts[1] || '';
        if (residue.includes('#') && residue.includes(':')) {
            state.slideTracingMode = 'beat';
            const [bStr, tbStr] = residue.split('#');
            state.slideBpm = bStr;
            const [tStr, btStr] = tbStr.split(':');
            state.time = parseInt(tStr, 10) || 4;
            state.beat = parseInt(btStr, 10) || 1;
        } else if (residue.includes(':')) {
            state.slideTracingMode = 'beat';
            const [tStr, btStr] = residue.split(':');
            state.time = parseInt(tStr, 10) || 4;
            state.beat = parseInt(btStr, 10) || 1;
        } else {
            state.slideTracingMode = 'seconds';
            state.slideSeconds = parseFloat(residue) || 1.0;
        }
    } else if (cleanDur.includes('#')) {
        state.useCustomWait = true;
        state.waitMode = 'bpm';
        if (cleanDur.includes(':')) {
            state.slideTracingMode = 'beat';
            const [bStr, tbStr] = cleanDur.split('#');
            state.slideWaitBpm = bStr;
            const [tStr, btStr] = tbStr.split(':');
            state.time = parseInt(tStr, 10) || 4;
            state.beat = parseInt(btStr, 10) || 1;
        } else {
            state.slideTracingMode = 'seconds';
            const [bStr, sStr] = cleanDur.split('#');
            state.slideWaitBpm = bStr;
            state.slideSeconds = parseFloat(sStr) || 1.0;
        }
    } else {
        state.useCustomWait = false;
        state.waitMode = 'seconds';
        if (cleanDur.includes(':')) {
            state.slideTracingMode = 'beat';
            const [tStr, btStr] = cleanDur.split(':');
            state.time = parseInt(tStr, 10) || 4;
            state.beat = parseInt(btStr, 10) || 1;
        } else {
            state.slideTracingMode = 'seconds';
            state.slideSeconds = parseFloat(cleanDur) || 1.0;
        }
    }
    return state;
}

/**
 * 組合滑星時長字串
 * @param {Object} state 
 * @returns {string} 包含括號之時長字串 (如 "[4:1]", "[1##1.5]")
 */
export function buildSlideDurationString(state) {
    if (!state) return '[4:1]';
    let inner = '';
    // 當滑動時長為秒數模式時，依 simai 規範必須包含 delay，語法為 [dly##dur] 或 [bpm#dur]
    if (state.slideTracingMode === 'seconds') {
        const dly = (state.waitSec !== undefined && state.waitSec !== null && state.waitSec !== '') ? state.waitSec : 1.0;
        const dur = (state.slideSeconds !== undefined && state.slideSeconds !== null && state.slideSeconds !== '') ? state.slideSeconds : 1.0;
        if (state.useCustomWait && state.waitMode === 'bpm' && state.slideWaitBpm) {
            inner = `${state.slideWaitBpm}#${dur}`;
        } else {
            inner = `${dly}##${dur}`;
        }
    } else {
        // 拍數模式
        if (state.useCustomWait) {
            if (state.waitMode === 'seconds') {
                const dly = (state.waitSec !== undefined && state.waitSec !== null && state.waitSec !== '') ? state.waitSec : 1.0;
                const bpmPart = state.slideBpm ? `${state.slideBpm}#` : '';
                inner = `${dly}##${bpmPart}${state.time}:${state.beat}`;
            } else {
                const bpmPart = state.slideWaitBpm ? `${state.slideWaitBpm}#` : '';
                inner = `${bpmPart}${state.time}:${state.beat}`;
            }
        } else {
            inner = `${state.time}:${state.beat}`;
        }
    }
    return `[${inner}]`;
}

/**
 * 從滑星條身字串中分離效果旗標 ('b' | 'm') 與純軌跡部分
 * @param {string} residue 包含軌跡與可能之旗標 (如 "-4b", ">3-5m")
 * @returns {{ cleanResidue: string, effect: 'none' | 'break' | 'mine' }}
 */
function extractBranchEffect(residue) {
    let effect = 'none';
    let cleanResidue = residue || '';

    // 檢查結尾或段落中是否帶有 b 或 m (在 simai 中代表該滑星條身為 break 或 mine)
    if (/[bm]$/i.test(cleanResidue)) {
        if (/b$/i.test(cleanResidue)) {
            effect = 'break';
            cleanResidue = cleanResidue.replace(/b$/i, '');
        } else if (/m$/i.test(cleanResidue)) {
            effect = 'mine';
            cleanResidue = cleanResidue.replace(/m$/i, '');
        }
    } else if (cleanResidue.includes('b')) {
        effect = 'break';
        cleanResidue = cleanResidue.replace(/b/g, '');
    } else if (cleanResidue.includes('m')) {
        effect = 'mine';
        cleanResidue = cleanResidue.replace(/m/g, '');
    }

    return { cleanResidue, effect };
}

/**
 * 解析滑星字串結構 (支援單滑星與多分支滑星、起點與分支屬性)
 * 例如: "1>2-3<4[4:1]" -> { head: 1, headEffect: 'none', headIsEx: false, branches: [...] }
 * 例如: "1bx-4b[4:1]*-5m[4:1]" -> { head: 1, headEffect: 'break', headIsEx: true, branches: [...] }
 * @param {string} rawPart 
 * @param {number} defaultLane 
 */
export function parseSlideString(rawPart, defaultLane = 1) {
    const clean = (rawPart || '').trim();

    // 以星號 '*' 拆分各分支滑線
    const branchParts = clean.includes('*')
        ? clean.split('*').map(s => s.trim()).filter(Boolean)
        : (clean ? [clean] : []);

    let head = defaultLane;
    let headEffect = 'none'; // 'none' | 'break' | 'mine'
    let headIsEx = false;
    let headSpecial = '';    // 保留 @, ?, ! 等特殊標記
    const branches = [];

    // 解析第 0 分支 (包含音符起點鍵位與前綴旗標)
    const part0 = branchParts[0] || '';
    const bracket0 = part0.match(/\[([^\]]*)\]/);
    const duration0 = bracket0 ? bracket0[0] : '';
    let residue0 = part0.replace(/\[[^\]]*\]/g, '');

    const headMatch = residue0.match(/^(\d)([bm@?!x]*)/);
    if (headMatch) {
        head = parseInt(headMatch[1], 10);
        const flags = headMatch[2] || '';
        if (flags.includes('b')) headEffect = 'break';
        else if (flags.includes('m')) headEffect = 'mine';
        if (flags.includes('x')) headIsEx = true;
        headSpecial = flags.replace(/[bmx]/g, '');
        residue0 = residue0.slice(headMatch[0].length);
    } else {
        const laneMatch = residue0.match(/^\d+/);
        if (laneMatch) {
            head = parseInt(laneMatch[0], 10);
            residue0 = residue0.slice(laneMatch[0].length);
        }
    }

    const { cleanResidue: cRes0, effect: eff0 } = extractBranchEffect(residue0);
    const durState0 = parseSlideDuration(duration0 || '[4:1]');
    branches.push({
        segments: parseSegmentsFromResidue(cRes0, head),
        duration: buildSlideDurationString(durState0),
        durState: durState0,
        effect: eff0
    });

    // 解析第 1..N 分支
    for (let i = 1; i < branchParts.length; i++) {
        const partI = branchParts[i];
        const bracketI = partI.match(/\[([^\]]*)\]/);
        const durationI = bracketI ? bracketI[0] : (duration0 || '');
        let residueI = partI.replace(/\[[^\]]*\]/g, '');

        // 若使用者在星號後贅帶了起點鍵位 (如 *1-5)，先剝除贅帶的起點鍵位
        if (residueI.startsWith(String(head))) {
            residueI = residueI.slice(String(head).length);
        }

        const { cleanResidue: cResI, effect: effI } = extractBranchEffect(residueI);
        const durStateI = parseSlideDuration(durationI || duration0 || '[4:1]');
        branches.push({
            segments: parseSegmentsFromResidue(cResI, head),
            duration: buildSlideDurationString(durStateI),
            durState: durStateI,
            effect: effI
        });
    }

    if (branches.length === 0) {
        const defaultDurState = parseSlideDuration(duration0 || '[4:1]');
        branches.push({
            segments: parseSegmentsFromResidue('', head),
            duration: buildSlideDurationString(defaultDurState),
            durState: defaultDurState,
            effect: 'none'
        });
    }

    return {
        head,
        headEffect,
        headIsEx,
        headSpecial,
        branches,
        get prefixFlags() {
            let f = '';
            if (this.headEffect === 'break') f += 'b';
            else if (this.headEffect === 'mine') f += 'm';
            if (this.headIsEx) f += 'x';
            if (this.headSpecial) f += this.headSpecial;
            return f;
        },
        get segments() { return this.branches[0]?.segments || []; },
        get duration() { return this.branches[0]?.duration || ''; }
    };
}

/**
 * 組合滑星字串 (支援多分支滑星、起點與分支效果)
 * @param {Object} data 
 * @returns {string}
 */
export function buildSlideString(data) {
    const { head, headEffect = 'none', headIsEx = false, headSpecial = '', branches } = data;
    let headFlags = '';
    if (headEffect === 'break') headFlags += 'b';
    else if (headEffect === 'mine') headFlags += 'm';
    if (headIsEx) headFlags += 'x';
    if (headSpecial) headFlags += headSpecial;
    if (!headFlags && data.prefixFlags) headFlags = data.prefixFlags;

    if (!branches || branches.length === 0) {
        return `${head}${headFlags}`;
    }

    return branches.map((branch, bIdx) => {
        let segStr = '';
        for (const seg of branch.segments) {
            if (seg.type === 'V') {
                const midStr = seg.mid !== undefined ? String(seg.mid) : '';
                segStr += `${seg.type}${midStr}${seg.end}`;
            } else {
                segStr += `${seg.type}${seg.end}`;
            }
        }
        let branchFlag = '';
        if (branch.effect === 'break') branchFlag = 'b';
        else if (branch.effect === 'mine') branchFlag = 'm';

        const durStr = branch.duration || '';
        if (bIdx === 0) {
            return `${head}${headFlags}${segStr}${branchFlag}${durStr}`;
        } else {
            return `*${segStr}${branchFlag}${durStr}`;
        }
    }).join('');
}

/**
 * 注入編輯器專屬 Material Design 樣式
 */
function ensureSlideEditorStyles() {
    const styleId = 'wmc-slide-editor-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        /* 避免外層 popup-body 與 popup-custom-content 產生多餘滾動條與內距縫隙 */
        .popup-window:has(.sem-container) .popup-body {
            overflow: hidden !important;
            padding: 0 !important;
            gap: 0 !important;
        }

        .popup-window:has(.sem-container) .popup-custom-content {
            padding: 0 !important;
            border: none !important;
            background: transparent !important;
            overflow: hidden !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            min-height: 0 !important;
        }

        .sem-container {
            display: flex;
            flex-direction: column;
            height: 100%;
            min-height: 0;
            width: 100%;
            box-sizing: border-box;
            color: #e2e8f0;
            font-family: "Plus Jakarta Sans", "Noto Sans TC", sans-serif;
            font-size: 14px;
            user-select: none;
            -webkit-user-select: none;
            position: relative;
            overflow: hidden;
        }

        /* 頂部固定預覽窗容器 (不隨下方操作區滾動) */
        .sem-preview-sticky {
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #11141c;
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            padding: 8px 0 10px 0;
            margin: 0;
            position: relative;
            z-index: 10;
            width: 100%;
            box-sizing: border-box;
        }

        .sem-preview-canvas {
            display: block;
            width: 250px;
            height: 250px;
            border-radius: 50%;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.65);
        }

        /* 獨立可滾動操作內容區 (限制於預覽窗下方滾動，絕不穿透溢出) */
        .sem-scroll-body {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 12px 14px 16px 14px;
            box-sizing: border-box;
        }

        /* 語法與區間導覽列 */
        .sem-chain-container {
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid var(--popup-border, rgba(255, 255, 255, 0.08));
            border-radius: 10px;
            padding: 10px 14px;
        }

        .sem-chain-label {
            font-size: 12px;
            color: #94a3b8;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .sem-chain-track {
            display: flex;
            align-items: center;
            gap: 8px;
            overflow-x: auto;
            padding-bottom: 4px;
            scrollbar-width: thin;
        }

        .sem-chain-track::-webkit-scrollbar {
            height: 4px;
        }
        .sem-chain-track::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 2px;
        }

        /* 分支管理列 */
        .sem-branch-container {
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: rgba(255, 255, 255, 0.035);
            border: 1px solid var(--popup-border, rgba(255, 255, 255, 0.08));
            border-radius: 10px;
            padding: 10px 14px;
        }

        .sem-branch-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .sem-branch-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 600;
            color: #94a3b8;
        }

        .sem-branch-count-badge {
            font-size: 11px;
            background: var(--popup-accent-glow, rgba(56, 189, 248, 0.15));
            color: var(--popup-accent-hover, #38bdf8);
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 600;
        }

        .sem-branch-tab-track {
            display: flex;
            align-items: center;
            gap: 8px;
            overflow-x: auto;
            padding-bottom: 4px;
            scrollbar-width: thin;
        }

        .sem-branch-tab-track::-webkit-scrollbar {
            height: 4px;
        }

        .sem-branch-tab-track::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 2px;
        }

        .sem-branch-chip {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 86px;
            height: 34px;
            padding: 0 8px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 8px;
            color: #cbd5e1;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            box-sizing: border-box;
            flex-shrink: 0;
            font-family: monospace, sans-serif;
        }

        .sem-branch-chip:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
            border-color: rgba(255, 255, 255, 0.2);
        }

        .sem-branch-chip.active {
            background: var(--popup-accent, var(--accent-color, #49e)) !important;
            border-color: var(--popup-accent-hover, #38bdf8) !important;
            color: #ffffff !important;
            box-shadow: 0 2px 10px var(--popup-accent-glow, rgba(56, 189, 248, 0.35)) !important;
        }

        .sem-branch-chip-text {
            width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            text-align: center;
            display: block;
        }

        .sem-head-node {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 38px;
            height: 38px;
            padding: 0 10px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 8px;
            color: #f8fafc;
            font-size: 17px;
            font-weight: 700;
        }

        .sem-duration-editor {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-left: auto;
        }

        .sem-dur-badge {
            font-family: monospace;
            font-size: 13px;
            font-weight: 700;
            color: var(--popup-accent-hover, #38bdf8);
            background: var(--popup-accent-glow, rgba(56, 189, 248, 0.12));
            padding: 3px 8px;
            border-radius: 6px;
            border: 1px solid rgba(56, 189, 248, 0.25);
            display: inline-block;
        }

        /* 區間晶片 (Material Chip) */
        .sem-segment-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            height: 38px;
            padding: 0 14px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 8px;
            color: #cbd5e1;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
            white-space: nowrap;
        }

        .sem-segment-chip:hover {
            background: rgba(255, 255, 255, 0.12);
            color: #ffffff;
            border-color: rgba(255, 255, 255, 0.25);
        }

        /* 正在編輯的選取區間 */
        .sem-segment-chip.active {
            background: var(--popup-accent, var(--accent-color, #49e)) !important;
            border-color: var(--popup-accent-hover, #38bdf8) !important;
            color: #ffffff !important;
            box-shadow: 0 2px 10px var(--popup-accent-glow, rgba(56, 189, 248, 0.35)) !important;
            font-weight: 700;
        }

        .sem-duration-tag {
            font-size: 14px;
            color: #64748b;
            font-weight: 500;
            padding: 0 4px;
        }

        /* 區間操作條 */
        .sem-actions-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 2px;
        }

        .sem-status-indicator {
            font-size: 13px;
            color: var(--popup-accent-hover, #38bdf8);
            font-weight: 500;
        }

        .sem-seg-btn-group {
            display: flex;
            gap: 8px;
        }

        .sem-icon-btn {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #e2e8f0;
            padding: 5px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
        }

        .sem-icon-btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.14);
            color: #ffffff;
        }

        .sem-icon-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }

        /* 卡片分組 */
        .sem-card {
            background: rgba(255, 255, 255, 0.035);
            border: 1px solid var(--popup-border, rgba(255, 255, 255, 0.08));
            border-radius: 10px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .sem-card-title {
            font-size: 13px;
            font-weight: 600;
            color: #94a3b8;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        /* 軌跡形狀按鈕網格 (純 simai 連接符，無多餘文字) */
        .sem-pattern-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
            gap: 8px;
        }

        .sem-pattern-btn {
            height: 44px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            color: #cbd5e1;
            font-size: 18px;
            font-weight: 700;
            font-family: monospace, sans-serif;
        }

        .sem-pattern-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.25);
            color: #ffffff;
        }

        .sem-pattern-btn.active {
            background: var(--popup-accent, var(--accent-color, #49e)) !important;
            border-color: var(--popup-accent-hover, #38bdf8) !important;
            color: #ffffff !important;
            box-shadow: 0 2px 10px var(--popup-accent-glow, rgba(56, 189, 248, 0.35)) !important;
        }

        .sem-pattern-btn:disabled {
            opacity: 0.22 !important;
            background: rgba(255, 255, 255, 0.02) !important;
            border-color: rgba(255, 255, 255, 0.04) !important;
            color: #64748b !important;
            cursor: not-allowed !important;
            pointer-events: none;
        }

        /* 鍵位按鈕群組 (1 到 8 號鍵) */
        .sem-key-row {
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            gap: 6px;
        }

        .sem-key-btn {
            height: 42px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.12);
            color: #f1f5f9;
            font-size: 16px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .sem-key-btn:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.14);
            color: #ffffff;
        }

        .sem-key-btn.active {
            background: var(--popup-accent, var(--accent-color, #49e)) !important;
            border-color: var(--popup-accent-hover, #38bdf8) !important;
            color: #ffffff !important;
            box-shadow: 0 2px 10px var(--popup-accent-glow, rgba(56, 189, 248, 0.35)) !important;
        }

        /* 被禁用的不合法終點鍵位按鈕 */
        .sem-key-btn:disabled {
            opacity: 0.16 !important;
            background: rgba(255, 255, 255, 0.02) !important;
            border-color: rgba(255, 255, 255, 0.04) !important;
            color: #64748b !important;
            cursor: not-allowed !important;
            pointer-events: none;
        }

        /* 時長設定卡片 (Material Design 原生風格) */
        .sem-dur-card {
            background: rgba(255, 255, 255, 0.035);
            border: 1px solid var(--popup-border, rgba(255, 255, 255, 0.08));
            border-radius: 10px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .sem-dur-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 13px;
            font-weight: 600;
            color: #f1f5f9;
        }

        .sem-dur-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 600;
            color: #94a3b8;
        }

        .sem-dur-tab-row {
            display: flex;
            gap: 4px;
            background: rgba(0, 0, 0, 0.35);
            padding: 3px;
            border-radius: 8px;
            border: 1px solid var(--popup-border, rgba(255, 255, 255, 0.08));
            width: fit-content;
        }

        .sem-dur-tab-btn {
            border: none;
            background: transparent;
            color: #94a3b8;
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            -webkit-user-select: none;
            outline: none;
            white-space: nowrap;
        }

        .sem-dur-tab-btn:hover:not(.active) {
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
        }

        .sem-dur-tab-btn.active {
            background: var(--popup-accent, var(--accent-color, #49e)) !important;
            color: #ffffff !important;
            box-shadow: 0 2px 8px var(--popup-accent-glow, rgba(56, 189, 248, 0.25)) !important;
        }

        .sem-dur-row {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .sem-dur-field {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .sem-dur-label {
            font-size: 12px;
            color: #94a3b8;
            white-space: nowrap;
        }

        .sem-dur-input {
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(0, 0, 0, 0.45);
            border-radius: 6px;
            color: #ffffff;
            padding: 6px 8px;
            font-size: 13px;
            font-family: monospace;
            text-align: center;
            outline: none;
            box-sizing: border-box;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .sem-dur-input:focus {
            border-color: var(--popup-accent-hover, #38bdf8);
            box-shadow: 0 0 0 2px var(--popup-accent-glow, rgba(56, 189, 248, 0.25));
        }

        .sem-dur-checkbox-wrapper {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            position: relative;
        }

        .sem-dur-checkbox {
            appearance: auto;
            -webkit-appearance: checkbox;
            width: 17px !important;
            height: 17px !important;
            accent-color: var(--popup-accent, var(--accent-color, #49e)) !important;
            cursor: pointer !important;
            margin: 0 !important;
            flex-shrink: 0 !important;
        }

        .sem-dur-checkbox-label {
            cursor: pointer;
            font-size: 13px;
            color: #cbd5e1;
            user-select: none;
            -webkit-user-select: none;
            line-height: 1;
        }

        /* Material Design 分段按鈕群組 (Segmented Buttons) */
        .sem-segmented-btn-group {
            display: inline-flex;
            gap: 4px;
            background: rgba(0, 0, 0, 0.35);
            padding: 3px;
            border-radius: 8px;
            border: 1px solid var(--popup-border, rgba(255, 255, 255, 0.08));
            box-sizing: border-box;
            width: fit-content;
        }

        .sem-segmented-btn {
            border: none;
            background: transparent;
            color: #94a3b8;
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            -webkit-user-select: none;
            outline: none;
            white-space: nowrap;
        }

        .sem-segmented-btn:hover:not(.active) {
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
        }

        .sem-segmented-btn.active {
            background: var(--popup-accent, var(--accent-color, #49e));
            color: #ffffff;
            box-shadow: 0 2px 8px var(--popup-accent-glow, rgba(56, 189, 248, 0.25));
        }

        .sem-segmented-btn.active.break {
            background: linear-gradient(135deg, #f59e0b, #d97706) !important;
            color: #ffffff !important;
            box-shadow: 0 2px 8px rgba(245, 158, 11, 0.45) !important;
        }

        .sem-segmented-btn.active.mine {
            background: linear-gradient(135deg, #ef4444, #b91c1c) !important;
            color: #ffffff !important;
            box-shadow: 0 2px 8px rgba(239, 68, 68, 0.45) !important;
        }

        /* EX 切換按鈕 (Toggle Chip) */
        .sem-toggle-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(255, 255, 255, 0.05);
            color: #94a3b8;
            padding: 6px 14px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            -webkit-user-select: none;
            outline: none;
        }

        .sem-toggle-btn:hover:not(.active) {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
            border-color: rgba(255, 255, 255, 0.22);
        }

        .sem-toggle-btn.active {
            background: linear-gradient(135deg, #06b6d4, #0284c7) !important;
            border-color: #38bdf8 !important;
            color: #ffffff !important;
            box-shadow: 0 2px 10px rgba(6, 182, 212, 0.45) !important;
        }

        /* 分支晶片中的效果標籤徽章 */
        .sem-branch-effect-badge {
            font-size: 10px;
            font-weight: 700;
            padding: 1px 4px;
            border-radius: 4px;
            margin-left: 4px;
            line-height: 1.2;
            vertical-align: middle;
        }

        .sem-branch-effect-badge.break {
            background: rgba(245, 158, 11, 0.25);
            color: #fbbf24;
            border: 1px solid rgba(245, 158, 11, 0.4);
        }

        .sem-branch-effect-badge.mine {
            background: rgba(239, 68, 68, 0.25);
            color: #f87171;
            border: 1px solid rgba(239, 68, 68, 0.4);
        }
    `;
    document.head.appendChild(style);
}

/**
 * 開啟滑星軌跡編輯視窗
 * @param {Object} options
 * @param {Object} options.note 音符物件
 * @param {string} options.rawPart 音符文字 (如 1>2-3<4[4:1])
 * @param {Object} [options.renderer] 主渲染器實例
 * @param {Object} [options.settings] 全域設定
 * @param {Object} [options.images] 貼圖資源
 * @param {Function} options.onApply 套用回呼 (newSlideString) => void
 */
export function openSlideEditorModal({ note, rawPart = '', renderer, settings = {}, images, onApply }) {
    ensureSlideEditorStyles();

    const initialLane = note?.pos || 1;
    const slideData = parseSlideString(rawPart, initialLane);
    let activeBranchIndex = 0; // 當前正在編輯的分支索引
    let activeSegIndex = 0;    // 當前正在編輯的區間索引

    const container = document.createElement('div');
    container.className = 'sem-container';

    // 建立頂部固定的預覽畫布
    const previewSticky = document.createElement('div');
    previewSticky.className = 'sem-preview-sticky';
    previewSticky.innerHTML = `<canvas class="sem-preview-canvas" id="sem-preview-canvas" width="500" height="500"></canvas>`;
    container.appendChild(previewSticky);

    const scrollBody = document.createElement('div');
    scrollBody.className = 'sem-scroll-body';
    container.appendChild(scrollBody);

    let modalInstance = null;
    let previewRenderer = null;

    /**
     * 初始化主渲染器實例供預覽窗專用
     */
    function initPreviewRenderer() {
        const previewCanvas = container.querySelector('#sem-preview-canvas');
        if (!previewCanvas) return;

        const effectiveSettings = {
            ...(renderer?.settings || settings || {}),
            showJudge: false,
            showCriticalPerfect: false
        };
        const effectiveImages = renderer?.images || images;

        previewRenderer = new SimaiRenderer(previewCanvas, effectiveSettings);
        if (effectiveImages) {
            previewRenderer.setImages(effectiveImages);
        }

        const dpr = window.devicePixelRatio || 1;
        previewRenderer.resize(250, 250, dpr, true);
    }

    /**
     * 呼叫主渲染器繪製當前滑星預覽畫面 (包含所有分支與星星頭)
     */
    function updateRendererPreview() {
        if (!previewRenderer) return;

        const previewCanvas = container.querySelector('#sem-preview-canvas');
        if (previewCanvas) {
            const dpr = window.devicePixelRatio || 1;
            previewRenderer.resize(250, 250, dpr, true);
        }

        // 確保解碼時每個分支都有有效時長以利 simaiDecode 正確解碼
        const branchesWithDur = slideData.branches.map(b => ({
            ...b,
            duration: b.duration ? b.duration : '[4:1]'
        }));
        const fullSimai = buildSlideString({ ...slideData, branches: branchesWithDur });
        let decoded = null;

        try {
            decoded = simaiDecode(`(120){4}${fullSimai},`, 0);
        } catch (e) {
            console.warn('Decode slide error:', e);
        }

        const slideNotes = decoded?.notes?.filter(n => n.type === 'slide') || [];
        const headNotes = decoded?.notes?.filter(n => n.type === 'tap' || n.type === 'hold' || n.isStar) || [];

        // 呼叫主渲染器 drawFrame 繪製完整真實 maimai 機台畫面
        previewRenderer.drawFrame({
            globalTime: -0.001,
            buckets: {
                slide: slideNotes,
                tapnhold: headNotes,
                touch: []
            },
            dt: 0,
            showSensor: true,
            showSensorText: true,
            playCombo: 0,
            playScore: 0,
            isPlaying: false
        });
    }

    /**
     * 重新渲染可滾動內容區與預覽
     */
    function renderUI() {
        if (!slideData.branches || slideData.branches.length === 0) {
            slideData.branches = [{
                segments: [{ type: '-', mid: undefined, end: findLegalEnd(slideData.head, '-', ((slideData.head + 3) % 8) + 1) }],
                duration: '[4:1]',
                effect: 'none'
            }];
        }

        if (activeBranchIndex >= slideData.branches.length) {
            activeBranchIndex = Math.max(0, slideData.branches.length - 1);
        }

        const currentBranch = slideData.branches[activeBranchIndex];
        const branchCount = slideData.branches.length;

        if (activeSegIndex >= currentBranch.segments.length) {
            activeSegIndex = Math.max(0, currentBranch.segments.length - 1);
        }

        const currentSeg = currentBranch.segments[activeSegIndex];
        const segCount = currentBranch.segments.length;
        const lastSeg = currentBranch.segments[segCount - 1];
        const isAddDisabled = (lastSeg?.type === 'w');

        // 計算當前段落的起點 (第 0 段為起點鍵位，後續為前一段終點)
        const segStart = activeSegIndex === 0 ? slideData.head : currentBranch.segments[activeSegIndex - 1].end;

        // 若當前段落為 V 字形狀且中繼點不合法，自動校正
        if (currentSeg.type === 'V' && !isLegalVMid(segStart, currentSeg.mid)) {
            currentSeg.mid = getLegalVMid(segStart, currentSeg.mid);
            if (!isSlideLegal(segStart, currentSeg.end, 'V', currentSeg.mid)) {
                currentSeg.end = findLegalEnd(segStart, 'V', currentSeg.end, currentSeg.mid);
            }
        }

        const currentDurState = currentBranch.durState || (currentBranch.durState = parseSlideDuration(currentBranch.duration));

        scrollBody.innerHTML = `
            <!-- 最頂部：起點音符設定卡片 (Head Note Settings Card) -->
            <div class="sem-card">
                <div class="sem-card-title">
                    <span>${t('slideEditorModal.headSettings')}</span>
                    <span style="font-size: 11px; color: #94a3b8;">${t('slideEditorModal.headKey')}: ${slideData.head} 號鍵</span>
                </div>
                <div class="sem-key-row">
                    ${[1, 2, 3, 4, 5, 6, 7, 8].map(k => {
                        const isHeadActive = (slideData.head === k);
                        return `
                            <button type="button" class="sem-key-btn ${isHeadActive ? 'active' : ''}" data-head-key="${k}">
                                ${k}
                            </button>
                        `;
                    }).join('')}
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 12px; color: #94a3b8; font-weight: 500;">${t('slideEditorModal.headEffect')}:</span>
                        <div class="sem-segmented-btn-group">
                            <button type="button" class="sem-segmented-btn ${slideData.headEffect === 'none' ? 'active' : ''}" data-head-effect="none">
                                ${t('slideEditorModal.effectNone')}
                            </button>
                            <button type="button" class="sem-segmented-btn break ${slideData.headEffect === 'break' ? 'active' : ''}" data-head-effect="break">
                                ${t('slideEditorModal.effectBreak')}
                            </button>
                            <button type="button" class="sem-segmented-btn mine ${slideData.headEffect === 'mine' ? 'active' : ''}" data-head-effect="mine">
                                ${t('slideEditorModal.effectMine')}
                            </button>
                        </div>
                    </div>
                    <div>
                        <button type="button" class="sem-toggle-btn ${slideData.headIsEx ? 'active' : ''}" id="sem-head-ex-btn">
                            <span>${t('slideEditorModal.headEx')}</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 分支管理列 (Branch Navigation Bar) -->
            <div class="sem-branch-container">
                <div class="sem-branch-header">
                    <div class="sem-branch-title">
                        <span>${t('slideEditorModal.branchTitle')}</span>
                        <span class="sem-branch-count-badge">${t('slideEditorModal.branchCount', { count: branchCount })}</span>
                    </div>
                    <div class="sem-seg-btn-group">
                        <button type="button" class="sem-icon-btn" id="sem-add-branch" title="${t('slideEditorModal.addBranch')}">
                            <span>＋ ${t('slideEditorModal.addBranch')}</span>
                        </button>
                        <button type="button" class="sem-icon-btn" id="sem-del-branch" ${branchCount <= 1 ? 'disabled' : ''} title="${t('slideEditorModal.delBranch')}">
                            <span>－ ${t('slideEditorModal.delBranch')}</span>
                        </button>
                    </div>
                </div>
                <div class="sem-branch-tab-track">
                    ${slideData.branches.map((b, bIdx) => {
                        const isBActive = (bIdx === activeBranchIndex);
                        const bEffStr = b.effect === 'break' ? 'b' : (b.effect === 'mine' ? 'm' : '');
                        const bSummary = b.segments.map(s => s.type === 'V' ? `V${s.mid ?? ''}${s.end}` : `${s.type}${s.end}`).join('') + bEffStr + (b.duration || '');
                        const effectBadge = b.effect === 'break'
                            ? `<span class="sem-branch-effect-badge break">BK</span>`
                            : (b.effect === 'mine' ? `<span class="sem-branch-effect-badge mine">MINE</span>` : '');
                        return `
                            <button type="button" class="sem-branch-chip ${isBActive ? 'active' : ''}" data-branch-index="${bIdx}" title="${bSummary}">
                                <span class="sem-branch-chip-text">${bSummary}</span>
                                ${effectBadge}
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- 上方區間顯示與導航條 (當前分支) -->
            <div class="sem-chain-container">
                <div class="sem-chain-label">
                    <span>${t('slideEditorModal.trackChain')}</span>
                    <span class="sem-status-indicator">${t('slideEditorModal.editingSeg', { current: activeSegIndex + 1, total: segCount, start: segStart, end: currentSeg.end })}</span>
                </div>
                <div class="sem-chain-track">
                    <div class="sem-head-node" title="${t('slideEditorModal.headNode')}">${slideData.head}</div>
                    ${currentBranch.segments.map((seg, idx) => {
                        const isActive = (idx === activeSegIndex);
                        const label = seg.type === 'V'
                            ? `${seg.type}${seg.mid ?? ''}${seg.end}`
                            : `${seg.type} ${seg.end}`;
                        return `
                            <button type="button" class="sem-segment-chip ${isActive ? 'active' : ''}" data-seg-index="${idx}">
                                <span>${label}</span>
                            </button>
                        `;
                    }).join('')}
                    <div class="sem-duration-editor">
                        <span style="font-size: 11px; color: #94a3b8;">${t('slideEditorModal.branchDuration')}:</span>
                        <span class="sem-dur-badge" id="sem-branch-dur-badge">${currentBranch.duration || '[4:1]'}</span>
                    </div>
                </div>
                <div class="sem-actions-bar">
                    <span id="sem-syntax-text" style="font-size: 12px; color: #64748b;">${t('slideEditorModal.syntaxPreview', { syntax: buildSlideString(slideData) })}</span>
                    <div class="sem-seg-btn-group">
                        <button type="button" class="sem-icon-btn" id="sem-add-seg" ${isAddDisabled ? 'disabled' : ''} title="${isAddDisabled ? t('slideEditorModal.cannotAddAfterW') : t('slideEditorModal.addSeg')}">
                            <span>＋ ${t('slideEditorModal.addSeg')}</span>
                        </button>
                        <button type="button" class="sem-icon-btn" id="sem-del-seg" ${segCount <= 1 ? 'disabled' : ''} title="${t('slideEditorModal.delSeg')}">
                            <span>－ ${t('slideEditorModal.delSeg')}</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 當前分支效果卡片 (Branch Effect Card) -->
            <div class="sem-card">
                <div class="sem-card-title">
                    <span>${t('slideEditorModal.branchEffect')}</span>
                    <span style="font-size: 11px; color: #94a3b8;">${t('slideEditorModal.branchLabel', { index: activeBranchIndex + 1 })}</span>
                </div>
                <div class="sem-segmented-btn-group">
                    <button type="button" class="sem-segmented-btn ${currentBranch.effect === 'none' ? 'active' : ''}" data-branch-effect="none">
                        ${t('slideEditorModal.effectNone')}
                    </button>
                    <button type="button" class="sem-segmented-btn break ${currentBranch.effect === 'break' ? 'active' : ''}" data-branch-effect="break">
                        ${t('slideEditorModal.effectBreak')}
                    </button>
                    <button type="button" class="sem-segmented-btn mine ${currentBranch.effect === 'mine' ? 'active' : ''}" data-branch-effect="mine">
                        ${t('slideEditorModal.effectMine')}
                    </button>
                </div>
            </div>

            <!-- 軌跡形狀選擇器 (純 simai 連接符) -->
            <div class="sem-card">
                <div class="sem-card-title">
                    <span>${t('slideEditorModal.shapeSelect')}</span>
                    <span style="font-size: 11px; color: #64748b;">${t('slideEditorModal.startKey', { key: segStart })}</span>
                </div>
                <div class="sem-pattern-grid">
                    ${SLIDE_PATTERNS.map(pat => {
                        const isSelected = (currentSeg.type === pat);
                        const isPatternDisabled = (pat === 'w' && segCount > 1);
                        const patTitle = isPatternDisabled ? t('slideEditorModal.wCannotChain') : pat;
                        return `
                            <button type="button" class="sem-pattern-btn ${isSelected ? 'active' : ''}" data-pattern="${pat}" ${isPatternDisabled ? 'disabled' : ''} title="${patTitle}">
                                <span>${pat}</span>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- 若為 V 字形狀，額外顯示中繼點選擇 -->
            ${currentSeg.type === 'V' ? `
                <div class="sem-card">
                    <div class="sem-card-title">
                        <span>${t('slideEditorModal.midKey')}</span>
                        <span style="font-size: 11px; color: #eab308;">${t('slideEditorModal.midKeyHint')}</span>
                    </div>
                    <div class="sem-key-row">
                        ${[1, 2, 3, 4, 5, 6, 7, 8].map(k => {
                            const isMidActive = (currentSeg.mid === k);
                            const isLegalMid = isLegalVMid(segStart, k);
                            return `
                                <button type="button" class="sem-key-btn ${isMidActive ? 'active' : ''}" 
                                    data-mid-key="${k}" ${!isLegalMid ? 'disabled' : ''}>
                                    ${k}
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- 目標鍵位選擇器 (1-8 鍵) -->
            <div class="sem-card">
                <div class="sem-card-title">
                    <span>${t('slideEditorModal.endKey')}</span>
                    <span style="font-size: 11px; color: #eab308;">${t('slideEditorModal.endKeyHint')}</span>
                </div>
                <div class="sem-key-row">
                    ${[1, 2, 3, 4, 5, 6, 7, 8].map(k => {
                        const isEndActive = (currentSeg.end === k);
                        const isLegal = isSlideLegal(segStart, k, currentSeg.type, currentSeg.mid);
                        return `
                            <button type="button" class="sem-key-btn ${isEndActive ? 'active' : ''}" 
                                data-end-key="${k}" ${!isLegal ? 'disabled' : ''}>
                                    ${k}
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- 當前分支時長設定：等候時間卡片 (無圖示 Material Design 風格) -->
            <div class="sem-dur-card">
                <div class="sem-dur-header">
                    <div class="sem-dur-title">
                        <span>${t('noteDurationModal.waitTime')}</span>
                    </div>
                    <div class="sem-dur-checkbox-wrapper">
                        <input type="checkbox" id="sem-slide-custom-wait" class="sem-dur-checkbox" ${currentDurState.useCustomWait ? 'checked' : ''}>
                        <label for="sem-slide-custom-wait" class="sem-dur-checkbox-label">${t('noteDurationModal.customWait')}</label>
                    </div>
                </div>

                <div id="sem-wait-content" style="display: ${currentDurState.useCustomWait ? 'flex' : 'none'}; flex-direction: column; gap: 10px; margin-top: 4px;">
                    <div class="sem-dur-row">
                        <div class="sem-dur-tab-row">
                            <button type="button" class="sem-dur-tab-btn ${currentDurState.waitMode === 'seconds' ? 'active' : ''}" data-action="set-wait-mode-seconds">${t('noteDurationModal.specifySeconds')}</button>
                            <button type="button" class="sem-dur-tab-btn ${currentDurState.waitMode === 'bpm' ? 'active' : ''}" data-action="set-wait-mode-bpm">${t('noteDurationModal.specifyBpmWait')}</button>
                        </div>

                        <div class="sem-dur-field" id="sem-wait-sec-field" style="margin-left: auto; display: ${currentDurState.waitMode === 'seconds' ? 'flex' : 'none'};">
                            <span class="sem-dur-label">${t('noteDurationModal.waitSeconds')}</span>
                            <input type="number" class="sem-dur-input" id="sem-slide-wait-sec" value="${currentDurState.waitSec}" step="0.1" min="0.01" style="width: 80px;">
                            <span>${t('noteDurationModal.secondsUnit')}</span>
                        </div>

                        <div class="sem-dur-field" id="sem-wait-bpm-field" style="margin-left: auto; display: ${currentDurState.waitMode === 'bpm' ? 'flex' : 'none'};">
                            <span class="sem-dur-label">${t('noteDurationModal.waitBpm')}</span>
                            <input type="number" class="sem-dur-input" id="sem-slide-wait-bpm" value="${currentDurState.slideWaitBpm}" step="0.1" style="width: 80px;">
                        </div>
                    </div>
                </div>
            </div>

            <!-- 當前分支時長設定：劃動時長卡片 (無圖示 Material Design 風格) -->
            <div class="sem-dur-card">
                <div class="sem-dur-header">
                    <div class="sem-dur-title">
                        <span>${t('noteDurationModal.slideDuration')}</span>
                    </div>
                    <div class="sem-dur-tab-row">
                        <button type="button" class="sem-dur-tab-btn ${currentDurState.slideTracingMode === 'beat' ? 'active' : ''}" data-action="set-slide-tracing-beat">${t('noteDurationModal.modeBeat')}</button>
                        <button type="button" class="sem-dur-tab-btn ${currentDurState.slideTracingMode === 'seconds' ? 'active' : ''}" data-action="set-slide-tracing-seconds">${t('noteDurationModal.modeSeconds')}</button>
                    </div>
                </div>

                ${currentDurState.slideTracingMode === 'beat' ? `
                    <div class="sem-dur-row">
                        <div class="sem-dur-field">
                            <input type="number" class="sem-dur-input" id="sem-dur-time" value="${currentDurState.time}" min="1" max="128" style="width: 60px;">
                            <span class="sem-dur-label">${t('noteDurationModal.divisionTimes')}</span>
                            <input type="number" class="sem-dur-input" id="sem-dur-beat" value="${currentDurState.beat}" min="1" max="512" style="width: 60px;">
                            <span class="sem-dur-label">${t('noteDurationModal.beatCount')}</span>
                        </div>
                        <div class="sem-dur-field" id="sem-slide-tracing-bpm-field" style="margin-left: auto; display: ${(currentDurState.useCustomWait && currentDurState.waitMode === 'seconds') ? 'flex' : 'none'};">
                            <span class="sem-dur-label">${t('noteDurationModal.slideBpm')}</span>
                            <input type="number" class="sem-dur-input" id="sem-slide-tracing-bpm" value="${currentDurState.slideBpm}" step="0.1" style="width: 80px;">
                        </div>
                    </div>
                ` : `
                    <div class="sem-dur-row">
                        <div class="sem-dur-field">
                            <span class="sem-dur-label">${t('noteDurationModal.slideSeconds')}</span>
                            <input type="number" class="sem-dur-input" id="sem-slide-seconds" value="${currentDurState.slideSeconds}" step="0.05" min="0.01" style="width: 90px;">
                            <span>${t('noteDurationModal.secondsUnit')}</span>
                        </div>
                    </div>
                `}
            </div>
        `;

        bindEvents();
        updateRendererPreview();
    }

    /**
     * 綁定互動事件
     */
    function bindEvents() {
        const currentBranch = slideData.branches[activeBranchIndex];
        const currentDurState = currentBranch.durState || (currentBranch.durState = parseSlideDuration(currentBranch.duration));

        // 時長同步更新函式
        function syncBranchDuration() {
            currentBranch.duration = buildSlideDurationString(currentDurState);
            const syntaxElem = scrollBody.querySelector('#sem-syntax-text');
            if (syntaxElem) {
                syntaxElem.textContent = t('slideEditorModal.syntaxPreview', { syntax: buildSlideString(slideData) });
            }
            const durBadge = scrollBody.querySelector('#sem-branch-dur-badge');
            if (durBadge) {
                durBadge.textContent = currentBranch.duration;
            }
            // 更新分支晶片文字與提示
            const chipBtn = scrollBody.querySelector(`.sem-branch-chip[data-branch-index="${activeBranchIndex}"]`);
            if (chipBtn) {
                const bEffStr = currentBranch.effect === 'break' ? 'b' : (currentBranch.effect === 'mine' ? 'm' : '');
                const bSummary = currentBranch.segments.map(s => s.type === 'V' ? `V${s.mid ?? ''}${s.end}` : `${s.type}${s.end}`).join('') + bEffStr + (currentBranch.duration || '');
                chipBtn.title = bSummary;
                const chipText = chipBtn.querySelector('.sem-branch-chip-text');
                if (chipText) chipText.textContent = bSummary;
            }
            updateRendererPreview();
        }

        // 選擇起點鍵位 (1-8 鍵)
        scrollBody.querySelectorAll('[data-head-key]').forEach(btn => {
            btn.addEventListener('click', () => {
                const newHead = parseInt(btn.dataset.headKey, 10);
                if (slideData.head === newHead) return;
                slideData.head = newHead;
                // 自動校正所有分支第 0 段的合法性
                slideData.branches.forEach(b => {
                    if (b.segments && b.segments.length > 0) {
                        const s0 = b.segments[0];
                        if (s0.type === 'V' && !isLegalVMid(newHead, s0.mid)) {
                            s0.mid = getLegalVMid(newHead, s0.mid);
                        }
                        if (!isSlideLegal(newHead, s0.end, s0.type, s0.mid)) {
                            s0.end = findLegalEnd(newHead, s0.type, s0.end, s0.mid);
                        }
                    }
                });
                renderUI();
            });
        });

        // 選擇起點效果 (一般 / Break / 地雷)
        scrollBody.querySelectorAll('[data-head-effect]').forEach(btn => {
            btn.addEventListener('click', () => {
                slideData.headEffect = btn.dataset.headEffect;
                renderUI();
            });
        });

        // 切換起點 EX 音符
        const headExBtn = scrollBody.querySelector('#sem-head-ex-btn');
        if (headExBtn) {
            headExBtn.addEventListener('click', () => {
                slideData.headIsEx = !slideData.headIsEx;
                renderUI();
            });
        }

        // 選擇當前分支效果 (一般 / Break / 地雷)
        scrollBody.querySelectorAll('[data-branch-effect]').forEach(btn => {
            btn.addEventListener('click', () => {
                currentBranch.effect = btn.dataset.branchEffect;
                renderUI();
            });
        });

        // 切換編輯分支
        scrollBody.querySelectorAll('[data-branch-index]').forEach(btn => {
            btn.addEventListener('click', () => {
                activeBranchIndex = parseInt(btn.dataset.branchIndex, 10);
                activeSegIndex = 0;
                renderUI();
            });
        });

        // 新增分支 (使用標準預設值建立)
        const addBranchBtn = scrollBody.querySelector('#sem-add-branch');
        if (addBranchBtn) {
            addBranchBtn.addEventListener('click', () => {
                const newEnd = findLegalEnd(slideData.head, '-', ((slideData.head + 3) % 8) + 1);
                const defaultDurState = parseSlideDuration('[4:1]');
                const defaultDuration = buildSlideDurationString(defaultDurState);
                slideData.branches.push({
                    segments: [{
                        type: '-',
                        mid: undefined,
                        end: newEnd
                    }],
                    duration: defaultDuration,
                    durState: defaultDurState,
                    effect: 'none'
                });
                activeBranchIndex = slideData.branches.length - 1;
                activeSegIndex = 0;
                renderUI();
            });
        }

        // 刪除分支
        const delBranchBtn = scrollBody.querySelector('#sem-del-branch');
        if (delBranchBtn) {
            delBranchBtn.addEventListener('click', () => {
                if (slideData.branches.length <= 1) return;
                slideData.branches.splice(activeBranchIndex, 1);
                if (activeBranchIndex >= slideData.branches.length) {
                    activeBranchIndex = slideData.branches.length - 1;
                }
                activeSegIndex = 0;
                renderUI();
            });
        }

        // 自訂等候時間勾選
        const customWaitCheckbox = scrollBody.querySelector('#sem-slide-custom-wait');
        if (customWaitCheckbox) {
            customWaitCheckbox.addEventListener('change', () => {
                currentDurState.useCustomWait = customWaitCheckbox.checked;
                syncBranchDuration();
                renderUI();
            });
        }

        // 等候時間模式按鈕 (秒數 / BPM)
        scrollBody.querySelectorAll('[data-action^="set-wait-mode-"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.action.replace('set-wait-mode-', '');
                currentDurState.waitMode = mode;
                syncBranchDuration();
                renderUI();
            });
        });

        // 劃動時間模式按鈕 (節拍 / 秒數)
        scrollBody.querySelectorAll('[data-action^="set-slide-tracing-"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.action.replace('set-slide-tracing-', '');
                currentDurState.slideTracingMode = mode;
                if (mode === 'seconds') {
                    // 秒數模式下必須具備等候延遲 dly，確保啟用等候秒數以符合 [dly##dur] 規範
                    currentDurState.useCustomWait = true;
                    if (!currentDurState.waitSec) currentDurState.waitSec = 1.0;
                    if (!currentDurState.slideSeconds) currentDurState.slideSeconds = 1.0;
                }
                syncBranchDuration();
                renderUI();
            });
        });

        // 等候秒數輸入
        const waitSecInput = scrollBody.querySelector('#sem-slide-wait-sec');
        if (waitSecInput) {
            const onWaitSec = () => {
                const val = parseFloat(waitSecInput.value);
                currentDurState.waitSec = !isNaN(val) && val > 0 ? val : 1.0;
                syncBranchDuration();
            };
            waitSecInput.addEventListener('input', onWaitSec);
            waitSecInput.addEventListener('change', onWaitSec);
        }

        // 等候 BPM 輸入
        const waitBpmInput = scrollBody.querySelector('#sem-slide-wait-bpm');
        if (waitBpmInput) {
            const onWaitBpm = () => {
                currentDurState.slideWaitBpm = waitBpmInput.value.trim();
                syncBranchDuration();
            };
            waitBpmInput.addEventListener('input', onWaitBpm);
            waitBpmInput.addEventListener('change', onWaitBpm);
        }

        // 拍數分母 (time)
        const timeInput = scrollBody.querySelector('#sem-dur-time');
        if (timeInput) {
            const onTime = () => {
                const val = parseInt(timeInput.value, 10);
                currentDurState.time = !isNaN(val) && val > 0 ? val : 4;
                syncBranchDuration();
            };
            timeInput.addEventListener('input', onTime);
            timeInput.addEventListener('change', onTime);
        }

        // 拍數分子 (beat)
        const beatInput = scrollBody.querySelector('#sem-dur-beat');
        if (beatInput) {
            const onBeat = () => {
                const val = parseInt(beatInput.value, 10);
                currentDurState.beat = !isNaN(val) && val > 0 ? val : 1;
                syncBranchDuration();
            };
            beatInput.addEventListener('input', onBeat);
            beatInput.addEventListener('change', onBeat);
        }

        // 劃動 BPM 輸入
        const slideBpmInput = scrollBody.querySelector('#sem-slide-tracing-bpm');
        if (slideBpmInput) {
            const onSlideBpm = () => {
                currentDurState.slideBpm = slideBpmInput.value.trim();
                syncBranchDuration();
            };
            slideBpmInput.addEventListener('input', onSlideBpm);
            slideBpmInput.addEventListener('change', onSlideBpm);
        }

        // 劃動秒數輸入
        const slideSecInput = scrollBody.querySelector('#sem-slide-seconds');
        if (slideSecInput) {
            const onSlideSec = () => {
                const val = parseFloat(slideSecInput.value);
                currentDurState.slideSeconds = !isNaN(val) && val > 0 ? val : 1.0;
                syncBranchDuration();
            };
            slideSecInput.addEventListener('input', onSlideSec);
            slideSecInput.addEventListener('change', onSlideSec);
        }

        // 切換編輯區間
        scrollBody.querySelectorAll('[data-seg-index]').forEach(btn => {
            btn.addEventListener('click', () => {
                activeSegIndex = parseInt(btn.dataset.segIndex, 10);
                renderUI();
            });
        });

        // 新增區間
        const addBtn = scrollBody.querySelector('#sem-add-seg');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const lastSeg = currentBranch.segments[currentBranch.segments.length - 1];
                if (lastSeg?.type === 'w') return;
                const newStart = lastSeg.end;
                const newType = '-';
                const newEnd = findLegalEnd(newStart, newType, ((newStart + 3) % 8) + 1);

                currentBranch.segments.push({
                    type: newType,
                    mid: undefined,
                    end: newEnd
                });

                activeSegIndex = currentBranch.segments.length - 1;
                renderUI();
            });
        }

        // 刪除區間
        const delBtn = scrollBody.querySelector('#sem-del-seg');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                if (currentBranch.segments.length <= 1) return;
                currentBranch.segments.splice(activeSegIndex, 1);
                if (activeSegIndex >= currentBranch.segments.length) {
                    activeSegIndex = currentBranch.segments.length - 1;
                }
                for (let i = 0; i < currentBranch.segments.length; i++) {
                    const sStart = i === 0 ? slideData.head : currentBranch.segments[i - 1].end;
                    const sSeg = currentBranch.segments[i];
                    if (sSeg.type === 'V' && !isLegalVMid(sStart, sSeg.mid)) {
                        sSeg.mid = getLegalVMid(sStart, sSeg.mid);
                    }
                    if (!isSlideLegal(sStart, sSeg.end, sSeg.type, sSeg.mid)) {
                        sSeg.end = findLegalEnd(sStart, sSeg.type, sSeg.end, sSeg.mid);
                    }
                }
                renderUI();
            });
        }

        // 選擇軌跡形狀
        scrollBody.querySelectorAll('[data-pattern]').forEach(btn => {
            btn.addEventListener('click', () => {
                const newPattern = btn.dataset.pattern;
                if (newPattern === 'w' && currentBranch.segments.length > 1) return;
                const seg = currentBranch.segments[activeSegIndex];
                const segStart = activeSegIndex === 0 ? slideData.head : currentBranch.segments[activeSegIndex - 1].end;

                seg.type = newPattern;
                if (newPattern === 'V') {
                    if (!isLegalVMid(segStart, seg.mid)) {
                        seg.mid = getLegalVMid(segStart, seg.mid);
                    }
                } else {
                    seg.mid = undefined;
                }

                // 若當前終點對新形狀不合法，自動尋找最接近之合法終點
                if (!isSlideLegal(segStart, seg.end, newPattern, seg.mid)) {
                    seg.end = findLegalEnd(segStart, newPattern, seg.end, seg.mid);
                }

                renderUI();
            });
        });

        // 選擇中繼點 (V 字軌跡)
        scrollBody.querySelectorAll('[data-mid-key]').forEach(btn => {
            btn.addEventListener('click', () => {
                const midVal = parseInt(btn.dataset.midKey, 10);
                const seg = currentBranch.segments[activeSegIndex];
                const segStart = activeSegIndex === 0 ? slideData.head : currentBranch.segments[activeSegIndex - 1].end;

                if (!isLegalVMid(segStart, midVal)) return;

                seg.mid = midVal;
                if (!isSlideLegal(segStart, seg.end, 'V', seg.mid)) {
                    seg.end = findLegalEnd(segStart, 'V', seg.end, seg.mid);
                }
                renderUI();
            });
        });

        // 選擇終點鍵位
        scrollBody.querySelectorAll('[data-end-key]').forEach(btn => {
            btn.addEventListener('click', () => {
                const endVal = parseInt(btn.dataset.endKey, 10);
                const seg = currentBranch.segments[activeSegIndex];
                const segStart = activeSegIndex === 0 ? slideData.head : currentBranch.segments[activeSegIndex - 1].end;

                if (!isSlideLegal(segStart, endVal, seg.type, seg.mid)) {
                    return;
                }

                seg.end = endVal;

                // 若後面還有段落，檢查並修正後續段落的合法性
                for (let i = activeSegIndex + 1; i < currentBranch.segments.length; i++) {
                    const sStart = currentBranch.segments[i - 1].end;
                    const sSeg = currentBranch.segments[i];
                    if (sSeg.type === 'V' && !isLegalVMid(sStart, sSeg.mid)) {
                        sSeg.mid = getLegalVMid(sStart, sSeg.mid);
                    }
                    if (!isSlideLegal(sStart, sSeg.end, sSeg.type, sSeg.mid)) {
                        sSeg.end = findLegalEnd(sStart, sSeg.type, sSeg.end, sSeg.mid);
                    }
                }

                renderUI();
            });
        });
    }

    modalInstance = popupWindow({
        title: t('slideEditorModal.title'),
        customContent: container,
        width: 500,
        height: 680,
        maxHeight: '90vh',
        whenOpen: () => {
            const customWrapper = container.parentElement;
            const bodyElem = customWrapper?.parentElement;
            if (customWrapper) {
                customWrapper.style.padding = '0';
                customWrapper.style.border = 'none';
                customWrapper.style.background = 'transparent';
                customWrapper.style.height = '100%';
                customWrapper.style.display = 'flex';
                customWrapper.style.flexDirection = 'column';
                customWrapper.style.minHeight = '0';
                customWrapper.style.overflow = 'hidden';
            }
            if (bodyElem && bodyElem.classList.contains('popup-body')) {
                bodyElem.style.overflow = 'hidden';
                bodyElem.style.padding = '0';
                bodyElem.style.gap = '0';
            }
        },
        buttons: [
            {
                text: t('common.cancel'),
                onClick: () => {
                    modalInstance?.close();
                }
            },
            {
                text: t('common.apply'),
                isPrimary: true,
                onClick: () => {
                    const finalStr = buildSlideString(slideData);
                    if (typeof onApply === 'function') {
                        onApply(finalStr);
                    }
                    modalInstance?.close();
                    simpleToast({ content: t('slideEditorModal.appliedToast', { slide: finalStr }), type: 'success', timeout: 1200 });
                }
            }
        ]
    });

    // 延遲至 DOM 就緒後初始化預覽渲染器並執行首次繪製
    requestAnimationFrame(() => {
        initPreviewRenderer();
        renderUI();
    });
}
