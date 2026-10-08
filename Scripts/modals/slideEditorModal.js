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
 * 解析滑星字串結構
 * 例如: "1>2-3<4[4:1]" -> { head: 1, prefixFlags: "", segments: [...], duration: "[4:1]" }
 * @param {string} rawPart 
 * @param {number} defaultLane 
 */
export function parseSlideString(rawPart, defaultLane = 1) {
    let clean = (rawPart || '').trim();

    // 擷取時長方括號
    const bracketMatch = clean.match(/\[([^\]]*)\]/);
    const duration = bracketMatch ? bracketMatch[0] : '';
    clean = clean.replace(/\[[^\]]*\]/g, '');

    // 擷取起點與前綴修飾旗標
    const headMatch = clean.match(/^(\d)([bm@?!]*)/);
    let head = defaultLane;
    let prefixFlags = '';
    let residue = clean;

    if (headMatch) {
        head = parseInt(headMatch[1], 10);
        prefixFlags = headMatch[2] || '';
        residue = clean.slice(headMatch[0].length);
    } else {
        const laneMatch = clean.match(/^\d+/);
        if (laneMatch) {
            head = parseInt(laneMatch[0], 10);
            residue = clean.slice(laneMatch[0].length);
        }
    }

    const segments = [];
    const REGEX_SEG = /((?:pp)|(?:qq)|[-<>^vpqszVw])(\d+)/g;
    let match;

    while ((match = REGEX_SEG.exec(residue)) !== null) {
        const type = match[1];
        const numStr = match[2];
        let mid = undefined;
        let end = 1;

        if (type === 'V') {
            const segStart = segments.length === 0 ? head : segments[segments.length - 1].end;
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

    // 若無任何有效段落，提供一筆預設段落
    if (segments.length === 0) {
        const defaultEnd = ((head + 3) % 8) + 1;
        segments.push({
            type: '-',
            mid: undefined,
            end: defaultEnd
        });
    }

    return {
        head,
        prefixFlags,
        segments,
        duration
    };
}

/**
 * 組合滑星字串
 * @param {Object} data 
 * @returns {string}
 */
export function buildSlideString(data) {
    const { head, prefixFlags, segments, duration } = data;
    let result = `${head}${prefixFlags || ''}`;

    for (const seg of segments) {
        if (seg.type === 'V') {
            const midStr = seg.mid !== undefined ? String(seg.mid) : '';
            result += `${seg.type}${midStr}${seg.end}`;
        } else {
            result += `${seg.type}${seg.end}`;
        }
    }

    if (duration) {
        result += duration;
    }

    return result;
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
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
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

        /* 正在編輯的選取區間（藍底高亮） */
        .sem-segment-chip.active {
            background: #2563eb !important;
            border-color: #3b82f6 !important;
            color: #ffffff !important;
            box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45);
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
            color: #38bdf8;
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
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
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
            background: #2563eb !important;
            border-color: #3b82f6 !important;
            color: #ffffff !important;
            box-shadow: 0 2px 10px rgba(37, 99, 235, 0.45);
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
            background: #2563eb !important;
            border-color: #3b82f6 !important;
            color: #ffffff !important;
            box-shadow: 0 2px 10px rgba(37, 99, 235, 0.4);
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
    let activeIndex = 0; // 當前正在編輯的區間索引

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
     * 呼叫主渲染器繪製當前滑星預覽畫面
     */
    function updateRendererPreview() {
        if (!previewRenderer) return;

        const previewCanvas = container.querySelector('#sem-preview-canvas');
        if (previewCanvas) {
            const dpr = window.devicePixelRatio || 1;
            previewRenderer.resize(250, 250, dpr, true);
        }

        const slideStr = buildSlideString(slideData);
        const fullSimai = slideData.duration ? slideStr : `${slideStr}[4:1]`;
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
            globalTime: 0,
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
        if (activeIndex >= slideData.segments.length) {
            activeIndex = Math.max(0, slideData.segments.length - 1);
        }

        const currentSeg = slideData.segments[activeIndex];
        const segCount = slideData.segments.length;

        // 計算當前段落的起點
        const segStart = activeIndex === 0 ? slideData.head : slideData.segments[activeIndex - 1].end;

        // 若當前段落為 V 字形狀且中繼點不合法，自動校正
        if (currentSeg.type === 'V' && !isLegalVMid(segStart, currentSeg.mid)) {
            currentSeg.mid = getLegalVMid(segStart, currentSeg.mid);
            if (!isSlideLegal(segStart, currentSeg.end, 'V', currentSeg.mid)) {
                currentSeg.end = findLegalEnd(segStart, 'V', currentSeg.end, currentSeg.mid);
            }
        }

        scrollBody.innerHTML = `
            <!-- 上方區間顯示與導航條 -->
            <div class="sem-chain-container">
                <div class="sem-chain-label">
                    <span>${t('slideEditorModal.trackChain')}</span>
                    <span class="sem-status-indicator">${t('slideEditorModal.editingSeg', { current: activeIndex + 1, total: segCount, start: segStart, end: currentSeg.end })}</span>
                </div>
                <div class="sem-chain-track">
                    <div class="sem-head-node" title="${t('slideEditorModal.headNode')}">${slideData.head}</div>
                    ${slideData.segments.map((seg, idx) => {
                        const isActive = (idx === activeIndex);
                        const label = seg.type === 'V'
                            ? `${seg.type}${seg.mid ?? ''}${seg.end}`
                            : `${seg.type} ${seg.end}`;
                        return `
                            <button type="button" class="sem-segment-chip ${isActive ? 'active' : ''}" data-seg-index="${idx}">
                                <span>${label}</span>
                            </button>
                        `;
                    }).join('')}
                    ${slideData.duration ? `<div class="sem-duration-tag">${slideData.duration}</div>` : ''}
                </div>
                <div class="sem-actions-bar">
                    <span style="font-size: 12px; color: #64748b;">${t('slideEditorModal.syntaxPreview', { syntax: buildSlideString(slideData) })}</span>
                    <div class="sem-seg-btn-group">
                        <button type="button" class="sem-icon-btn" id="sem-add-seg" title="${t('slideEditorModal.addSeg')}">
                            <span>＋ ${t('slideEditorModal.addSeg')}</span>
                        </button>
                        <button type="button" class="sem-icon-btn" id="sem-del-seg" ${segCount <= 1 ? 'disabled' : ''} title="${t('slideEditorModal.delSeg')}">
                            <span>－ ${t('slideEditorModal.delSeg')}</span>
                        </button>
                    </div>
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
                        return `
                            <button type="button" class="sem-pattern-btn ${isSelected ? 'active' : ''}" data-pattern="${pat}" title="${pat}">
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
        `;

        bindEvents();
        updateRendererPreview();
    }

    /**
     * 綁定互動事件
     */
    function bindEvents() {
        // 切換編輯區間
        scrollBody.querySelectorAll('[data-seg-index]').forEach(btn => {
            btn.addEventListener('click', () => {
                activeIndex = parseInt(btn.dataset.segIndex, 10);
                renderUI();
            });
        });

        // 新增區間
        const addBtn = scrollBody.querySelector('#sem-add-seg');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const lastSeg = slideData.segments[slideData.segments.length - 1];
                const newStart = lastSeg.end;
                const newType = '-';
                const newEnd = findLegalEnd(newStart, newType, ((newStart + 3) % 8) + 1);

                slideData.segments.push({
                    type: newType,
                    mid: undefined,
                    end: newEnd
                });

                activeIndex = slideData.segments.length - 1;
                renderUI();
            });
        }

        // 刪除區間
        const delBtn = scrollBody.querySelector('#sem-del-seg');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                if (slideData.segments.length <= 1) return;
                slideData.segments.splice(activeIndex, 1);
                if (activeIndex >= slideData.segments.length) {
                    activeIndex = slideData.segments.length - 1;
                }
                for (let i = 0; i < slideData.segments.length; i++) {
                    const sStart = i === 0 ? slideData.head : slideData.segments[i - 1].end;
                    const sSeg = slideData.segments[i];
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
                const seg = slideData.segments[activeIndex];
                const segStart = activeIndex === 0 ? slideData.head : slideData.segments[activeIndex - 1].end;

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
                const seg = slideData.segments[activeIndex];
                const segStart = activeIndex === 0 ? slideData.head : slideData.segments[activeIndex - 1].end;

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
                const seg = slideData.segments[activeIndex];
                const segStart = activeIndex === 0 ? slideData.head : slideData.segments[activeIndex - 1].end;

                if (!isSlideLegal(segStart, endVal, seg.type, seg.mid)) {
                    return;
                }

                seg.end = endVal;

                // 若後面還有段落，檢查並修正後續段落的合法性
                for (let i = activeIndex + 1; i < slideData.segments.length; i++) {
                    const sStart = slideData.segments[i - 1].end;
                    const sSeg = slideData.segments[i];
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
