/**
 * slideEditorModal.js
 * 
 * 視覺化編輯器 - 滑星軌跡編輯視窗 (Material Design 原生 HTML + CSS)
 * 支援多段複合滑星切換編輯、形狀選擇、合規終點鍵位選擇、增減段落、置頂圓形即時軌跡預覽
 */

import { popupWindow, simpleToast, noteRefPos, innerCirleBase } from '../helper.js';
import { getSlidePath } from '../decode.js';

/**
 * 軌跡形狀定義清單
 */
const SLIDE_PATTERNS = [
    { type: '-', label: '直線 (-)', desc: '直線劃動' },
    { type: '>', label: '順弧 (>)', desc: '順時針圓弧' },
    { type: '<', label: '逆弧 (<)', desc: '逆時針圓弧' },
    { type: '^', label: '折線 (^)', desc: '折線外弧' },
    { type: 'v', label: 'V 字 (v)', desc: '通過圓心折線' },
    { type: 'p', label: '大順弧 (p)', desc: '大順時針圓弧' },
    { type: 'q', label: '大逆弧 (q)', desc: '大逆時針圓弧' },
    { type: 'pp', label: '雙順弧 (pp)', desc: '雙圓弧順時針' },
    { type: 'qq', label: '雙逆弧 (qq)', desc: '雙圓弧逆時針' },
    { type: 's', label: 'S 形 (s)', desc: 'S 形弧線' },
    { type: 'z', label: '反 S (z)', desc: '反 S 形弧線' },
    { type: 'w', label: '扇形 (w)', desc: '扇形擴散' },
    { type: 'V', label: '折角 (V)', desc: '頂點折角' }
];

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
            // 大圓弧、雙圓弧：不可為自身
            return !e;
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
 * 尋找指定起點與形狀的第一個合法終點
 * @param {number} start 起點鍵位
 * @param {string} type 軌跡形狀
 * @param {number} fallback 當前終點
 * @param {number|null} mid 中繼點
 * @returns {number} 合法終點鍵位
 */
function findLegalEnd(start, type, fallback = 1, mid = null) {
    if (isSlideLegal(start, fallback, type, mid)) return fallback;
    for (let test = 1; test <= 8; test++) {
        if (isSlideLegal(start, test, type, mid)) return test;
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
            if (numStr.length >= 2) {
                mid = parseInt(numStr[0], 10);
                end = parseInt(numStr.slice(1), 10);
            } else {
                mid = (head + 1) % 8 + 1;
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
        .sem-container {
            display: flex;
            flex-direction: column;
            gap: 14px;
            color: #e2e8f0;
            font-family: "Plus Jakarta Sans", "Noto Sans TC", sans-serif;
            font-size: 14px;
            width: 100%;
            box-sizing: border-box;
            user-select: none;
            -webkit-user-select: none;
        }

        /* 置頂圓形預覽窗容器 */
        .sem-preview-box {
            display: flex;
            justify-content: center;
            align-items: center;
            background: radial-gradient(circle, rgba(20, 24, 33, 0.95) 0%, rgba(10, 12, 16, 1) 100%);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 14px;
            padding: 12px 0;
            position: relative;
            box-shadow: inset 0 2px 12px rgba(0, 0, 0, 0.7);
        }

        .sem-preview-canvas {
            display: block;
            width: 250px;
            height: 250px;
            cursor: pointer;
            border-radius: 50%;
            touch-action: none;
        }

        /* 語法與區間導覽列 */
        .sem-chain-container {
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            padding: 12px 14px;
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

        /* 軌跡形狀按鈕網格 */
        .sem-pattern-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(105px, 1fr));
            gap: 8px;
        }

        .sem-pattern-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 8px 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            cursor: pointer;
            transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
            color: #cbd5e1;
            text-align: center;
        }

        .sem-pattern-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.2);
            color: #ffffff;
        }

        .sem-pattern-btn.active {
            background: rgba(37, 99, 235, 0.2) !important;
            border-color: #3b82f6 !important;
            color: #60a5fa !important;
            font-weight: 600;
        }

        .sem-pattern-sym {
            font-size: 15px;
            font-weight: 700;
        }

        .sem-pattern-desc {
            font-size: 11px;
            color: #94a3b8;
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
            opacity: 0.18 !important;
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
 * 繪製星星符號
 */
function drawStarIcon(ctx, cx, cy, spikes, outerRadius, innerRadius, fillStyle) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.shadowColor = fillStyle;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
}

/**
 * 沿路徑繪製軌跡線與箭頭
 */
function drawRecordedPath(ctx, recorder, color, lineWidth, isHighlight) {
    if (!recorder || !recorder.segments || recorder.segments.length === 0) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (isHighlight) {
        ctx.shadowColor = '#60a5fa';
        ctx.shadowBlur = 10;
    }

    ctx.beginPath();
    for (let i = 0; i < recorder.segments.length; i++) {
        const seg = recorder.segments[i];
        if (seg.type === 'line') {
            if (i === 0) ctx.moveTo(seg.start.x, seg.start.y);
            ctx.lineTo(seg.end.x, seg.end.y);
        } else if (seg.type === 'arc') {
            ctx.arc(seg.cx, seg.cy, seg.r, seg.startAngle, seg.endAngle, seg.diff < 0);
        }
    }
    ctx.stroke();

    // 繪製沿途導向箭頭
    const numArrows = Math.max(1, Math.round(recorder.totalLength / 22));
    ctx.fillStyle = isHighlight ? '#ffffff' : color;
    for (let j = 1; j <= numArrows; j++) {
        const t = (j - 0.5) / numArrows;
        const pt = recorder.getPointAt(t);
        if (!pt) continue;

        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.rot);
        ctx.beginPath();
        const arrowSize = isHighlight ? 4.5 : 3.5;
        ctx.moveTo(arrowSize * 1.2, 0);
        ctx.lineTo(-arrowSize, -arrowSize * 0.85);
        ctx.lineTo(-arrowSize * 0.4, 0);
        ctx.lineTo(-arrowSize, arrowSize * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    ctx.restore();
}

/**
 * 繪製置頂圓形預覽畫面
 * @param {HTMLCanvasElement} canvas 
 * @param {Object} slideData 
 * @param {number} activeIndex 
 */
function renderSlidePreview(canvas, slideData, activeIndex) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const centerX = w / 2;
    const centerY = h / 2;

    // 坐標映射比例: innerCirleBase 對應畫布半徑的 82%
    const viewRadius = Math.min(centerX, centerY) * 0.82;
    const scale = viewRadius / innerCirleBase;

    // 1. 繪製機台深色圓盤背景與同心環
    ctx.save();
    ctx.translate(centerX, centerY);

    // 外環背景
    ctx.beginPath();
    ctx.arc(0, 0, viewRadius * 1.15, 0, Math.PI * 2);
    ctx.fillStyle = '#090b10';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 內圓螢幕基線
    ctx.beginPath();
    ctx.arc(0, 0, viewRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 中央輔助圓點
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fill();

    // 2. 繪製滑星軌跡
    ctx.save();
    ctx.scale(scale, scale);

    // 先繪製非當前段落，再繪製當前選中段落（確保藍色高亮在最上層）
    const segIndices = slideData.segments.map((_, i) => i);
    segIndices.sort((a, b) => (a === activeIndex ? 1 : 0) - (b === activeIndex ? 1 : 0));

    for (const idx of segIndices) {
        const seg = slideData.segments[idx];
        const segStart = (idx === 0) ? slideData.head : slideData.segments[idx - 1].end;
        const isHighlight = (idx === activeIndex);

        try {
            const res = getSlidePath(segStart, seg.end, seg.type, seg.mid);
            if (res && res.path) {
                const color = isHighlight ? '#3b82f6' : 'rgba(255, 255, 255, 0.4)';
                const lw = (isHighlight ? 5.5 : 3) / scale;
                drawRecordedPath(ctx, res.path, color, lw, isHighlight);

                // 扇形 (w) 額外路徑
                if (res.additional) {
                    if (res.additional.w1) drawRecordedPath(ctx, res.additional.w1, color, lw * 0.8, isHighlight);
                    if (res.additional.w2) drawRecordedPath(ctx, res.additional.w2, color, lw * 0.8, isHighlight);
                }
            }
        } catch (e) {
            console.error('預覽路徑繪製失敗:', e);
        }
    }

    ctx.restore(); // 結束路徑 scale

    // 3. 繪製 8 個鍵位感測區按鈕 (1 到 8)
    const currentSeg = slideData.segments[activeIndex];
    const segStart = (activeIndex === 0) ? slideData.head : slideData.segments[activeIndex - 1].end;

    for (let k = 1; k <= 8; k++) {
        const ref = noteRefPos[k - 1];
        if (!ref) continue;
        const kx = ref.x * scale;
        const ky = ref.y * scale;

        const isStart = (k === segStart);
        const isEnd = (k === currentSeg.end);
        const isLegal = isSlideLegal(segStart, k, currentSeg.type, currentSeg.mid);

        ctx.save();
        ctx.beginPath();
        const nodeRadius = 14;
        ctx.arc(kx, ky, nodeRadius, 0, Math.PI * 2);

        if (isEnd) {
            ctx.fillStyle = '#2563eb';
            ctx.shadowColor = '#3b82f6';
            ctx.shadowBlur = 10;
        } else if (isStart) {
            ctx.fillStyle = '#eab308';
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur = 8;
        } else if (!isLegal) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        }
        ctx.fill();

        ctx.strokeStyle = isEnd ? '#60a5fa' : (isStart ? '#fef08a' : (isLegal ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.05)'));
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 鍵位號碼
        ctx.fillStyle = (!isLegal && !isEnd && !isStart) ? '#475569' : '#ffffff';
        ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(k), kx, ky);
        ctx.restore();
    }

    // 4. 起點處繪製專屬星星圖示標記
    const headRef = noteRefPos[slideData.head - 1];
    if (headRef) {
        const hx = headRef.x * scale;
        const hy = headRef.y * scale;
        drawStarIcon(ctx, hx, hy, 5, 8, 4, '#fbbf24');
    }

    ctx.restore(); // 結束 translate
}

/**
 * 開啟滑星軌跡編輯視窗
 * @param {Object} options
 * @param {Object} options.note 音符物件
 * @param {string} options.rawPart 音符文字 (如 1>2-3<4[4:1])
 * @param {Function} options.onApply 套用回呼 (newSlideString) => void
 */
export function openSlideEditorModal({ note, rawPart = '', onApply }) {
    ensureSlideEditorStyles();

    const initialLane = note?.pos || 1;
    const slideData = parseSlideString(rawPart, initialLane);
    let activeIndex = 0; // 當前正在編輯的區間索引

    const container = document.createElement('div');
    container.className = 'sem-container';

    let modalInstance = null;

    /**
     * 重新渲染整個介面與預覽
     */
    function renderUI() {
        if (activeIndex >= slideData.segments.length) {
            activeIndex = Math.max(0, slideData.segments.length - 1);
        }

        const currentSeg = slideData.segments[activeIndex];
        const segCount = slideData.segments.length;

        // 計算當前段落的起點
        const segStart = activeIndex === 0 ? slideData.head : slideData.segments[activeIndex - 1].end;

        container.innerHTML = `
            <!-- 置頂圓形即時軌跡預覽窗 -->
            <div class="sem-preview-box">
                <canvas class="sem-preview-canvas" id="sem-preview-canvas" width="500" height="500" title="點擊鍵位可直接指定終點"></canvas>
            </div>

            <!-- 上方區間顯示與導航條 -->
            <div class="sem-chain-container">
                <div class="sem-chain-label">
                    <span>軌跡鏈（點擊切換編輯區間）</span>
                    <span class="sem-status-indicator">正在編輯第 ${activeIndex + 1} / ${segCount} 段 (${segStart} ➔ ${currentSeg.end})</span>
                </div>
                <div class="sem-chain-track">
                    <div class="sem-head-node" title="起點">${slideData.head}</div>
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
                    <span style="font-size: 12px; color: #64748b;">語法預覽: ${buildSlideString(slideData)}</span>
                    <div class="sem-seg-btn-group">
                        <button type="button" class="sem-icon-btn" id="sem-add-seg" title="在末端新增一段軌跡">
                            <span>＋ 新增區間</span>
                        </button>
                        <button type="button" class="sem-icon-btn" id="sem-del-seg" ${segCount <= 1 ? 'disabled' : ''} title="刪除此段落">
                            <span>－ 刪除區間</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 軌跡形狀選擇器 -->
            <div class="sem-card">
                <div class="sem-card-title">
                    <span>軌跡形狀選擇</span>
                    <span style="font-size: 11px; color: #64748b;">起點: ${segStart} 號鍵</span>
                </div>
                <div class="sem-pattern-grid">
                    ${SLIDE_PATTERNS.map(pat => {
                        const isSelected = (currentSeg.type === pat.type);
                        return `
                            <button type="button" class="sem-pattern-btn ${isSelected ? 'active' : ''}" data-pattern="${pat.type}">
                                <span class="sem-pattern-sym">${pat.label}</span>
                                <span class="sem-pattern-desc">${pat.desc}</span>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- 若為 V 字形狀，額外顯示中繼點選擇 -->
            ${currentSeg.type === 'V' ? `
                <div class="sem-card">
                    <div class="sem-card-title">
                        <span>折角中繼鍵位 (Mid)</span>
                    </div>
                    <div class="sem-key-row">
                        ${[1, 2, 3, 4, 5, 6, 7, 8].map(k => {
                            const isMidActive = (currentSeg.mid === k);
                            const isLegalMid = (k !== segStart && k !== currentSeg.end);
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
                    <span>終點鍵位選擇 (目標鍵)</span>
                    <span style="font-size: 11px; color: #eab308;">不允許的終點已自動禁用</span>
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

        // 即時繪製預覽畫布
        const canvas = container.querySelector('#sem-preview-canvas');
        if (canvas) {
            renderSlidePreview(canvas, slideData, activeIndex);
        }
    }

    /**
     * 綁定互動事件
     */
    function bindEvents() {
        // 切換編輯區間
        container.querySelectorAll('[data-seg-index]').forEach(btn => {
            btn.addEventListener('click', () => {
                activeIndex = parseInt(btn.dataset.segIndex, 10);
                renderUI();
            });
        });

        // 預覽畫布點擊鍵位直接選擇
        const previewCanvas = container.querySelector('#sem-preview-canvas');
        if (previewCanvas) {
            previewCanvas.addEventListener('pointerdown', (e) => {
                const rect = previewCanvas.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                const viewRadius = (rect.width / 2) * 0.82;
                const scale = viewRadius / innerCirleBase;

                // 檢查點擊最靠近哪個鍵位
                let closestKey = null;
                let minDist = 24; // 判定容許範圍 (像素)

                for (let k = 1; k <= 8; k++) {
                    const ref = noteRefPos[k - 1];
                    if (!ref) continue;
                    const kx = ref.x * scale;
                    const ky = ref.y * scale;
                    const dist = Math.hypot(x - kx, y - ky);
                    if (dist < minDist) {
                        minDist = dist;
                        closestKey = k;
                    }
                }

                if (closestKey !== null) {
                    const seg = slideData.segments[activeIndex];
                    const segStart = activeIndex === 0 ? slideData.head : slideData.segments[activeIndex - 1].end;
                    if (isSlideLegal(segStart, closestKey, seg.type, seg.mid)) {
                        seg.end = closestKey;
                        renderUI();
                    }
                }
            });
        }

        // 新增區間
        const addBtn = container.querySelector('#sem-add-seg');
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
        const delBtn = container.querySelector('#sem-del-seg');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                if (slideData.segments.length <= 1) return;
                slideData.segments.splice(activeIndex, 1);
                if (activeIndex >= slideData.segments.length) {
                    activeIndex = slideData.segments.length - 1;
                }
                renderUI();
            });
        }

        // 選擇軌跡形狀
        container.querySelectorAll('[data-pattern]').forEach(btn => {
            btn.addEventListener('click', () => {
                const newPattern = btn.dataset.pattern;
                const seg = slideData.segments[activeIndex];
                const segStart = activeIndex === 0 ? slideData.head : slideData.segments[activeIndex - 1].end;

                seg.type = newPattern;
                if (newPattern === 'V' && (seg.mid === undefined || seg.mid === null)) {
                    seg.mid = (segStart + 1) % 8 + 1;
                } else if (newPattern !== 'V') {
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
        container.querySelectorAll('[data-mid-key]').forEach(btn => {
            btn.addEventListener('click', () => {
                const midVal = parseInt(btn.dataset.midKey, 10);
                const seg = slideData.segments[activeIndex];
                const segStart = activeIndex === 0 ? slideData.head : slideData.segments[activeIndex - 1].end;

                seg.mid = midVal;
                if (!isSlideLegal(segStart, seg.end, 'V', seg.mid)) {
                    seg.end = findLegalEnd(segStart, 'V', seg.end, seg.mid);
                }
                renderUI();
            });
        });

        // 選擇終點鍵位
        container.querySelectorAll('[data-end-key]').forEach(btn => {
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
                    if (!isSlideLegal(sStart, sSeg.end, sSeg.type, sSeg.mid)) {
                        sSeg.end = findLegalEnd(sStart, sSeg.type, sSeg.end, sSeg.mid);
                    }
                }

                renderUI();
            });
        });
    }

    renderUI();

    modalInstance = popupWindow({
        title: '編輯滑星軌跡',
        customContent: container,
        width: 520,
        buttons: [
            {
                text: '取消',
                onClick: () => {
                    modalInstance?.close();
                }
            },
            {
                text: '確認套用',
                isPrimary: true,
                onClick: () => {
                    const finalStr = buildSlideString(slideData);
                    if (typeof onApply === 'function') {
                        onApply(finalStr);
                    }
                    modalInstance?.close();
                    simpleToast({ content: `已套用滑星軌跡: ${finalStr}`, type: 'success', timeout: 1200 });
                }
            }
        ]
    });
}
