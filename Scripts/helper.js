import { idbGet, idbSet, idbDelete } from "./indexDB.js";
import { audioManager } from "./audioManager.js";
import { getSkinCandidateUrls, skinAliases } from "./core/skinConfig.js";
export { audioManager };
export const GRADE_DETUNE = audioManager.GRADE_DETUNE;

import {
    scaleBase,
    innerCirleBase,
    PathRecorder,
    touchRefPos,
    noteRefPos,
    visualNoteRefPos,
    isObject
} from "./core/chartGeometry.js";
export {
    scaleBase,
    innerCirleBase,
    PathRecorder,
    touchRefPos,
    noteRefPos,
    visualNoteRefPos,
    isObject
};

import { SimaiLogicControler } from "./core/simaiLogicControler.js";
export { SimaiLogicControler };

import { videoRender } from "./features/videoRender.js";
export { videoRender };

export function imgNotExists(image) {
    if (!image || !image.complete || image.naturalWidth === 0) {
        return true;
    }
    return false;
}

const baseURL = (typeof window !== 'undefined' && window.location.pathname.includes('/_play/')) ? '../Skin/' : './Skin/';

// 核心渲染素材（首屏 Canvas 必備打擊元件，優先載入以大幅加速 LCP）
const coreImageKeys = [
    'no_image',
    'outline',
    'tap', 'tap_break', 'tap_each', 'tap_ex',
    'NormalArc', 'BreakArc', 'EachArc', 'SlideArc',
    'hold', 'hold_break', 'hold_each', 'hold_ex',
    'hold_break_on', 'hold_each_on', 'hold_on', 'hold_off',
    'Hold_End', 'Hold_Break_End', 'Hold_Each_End',
    'touch', 'touch_each', 'touch_point', 'touch_point_each',
    'touch_border_2', 'touch_border_3', 'touch_border_2_each', 'touch_border_3_each',
    'star', 'star_pink', 'star_break', 'star_each', 'star_ex',
    'slide', 'slide_each', 'slide_break',
    'touchhold_0', 'touchhold_1', 'touchhold_2', 'touchhold_3', 'touchhold_border',
    'touch_just', 'touchhold_off',
    'judge_text_good', 'judge_text_miss', 'judge_text_great',
    'judge_text_perfect', 'judge_text_normal', 'judge_text_break',
    'judge_text_cPerfect_break', 'judge_text_perfect_break',
    'fast', 'late',
    // Slide 專屬 JUST 判定素材
    'just_curv_l', 'just_curv_l_p', 'just_curv_l_fast_gd', 'just_curv_l_fast_gr', 'just_curv_l_late_gd', 'just_curv_l_late_gr',
    'just_curv_r', 'just_curv_r_p', 'just_curv_r_fast_gd', 'just_curv_r_fast_gr', 'just_curv_r_late_gd', 'just_curv_r_late_gr',
    'just_str_l', 'just_str_l_p', 'just_str_l_fast_gd', 'just_str_l_fast_gr', 'just_str_l_late_gd', 'just_str_l_late_gr',
    'just_str_r', 'just_str_r_p', 'just_str_r_fast_gd', 'just_str_r_fast_gr', 'just_str_r_late_gd', 'just_str_r_late_gr',
    'just_wifi_d', 'just_wifi_d_p', 'just_wifi_d_fast_gd', 'just_wifi_d_fast_gr', 'just_wifi_d_late_gd', 'just_wifi_d_late_gr',
    'just_wifi_u', 'just_wifi_u_p', 'just_wifi_u_fast_gd', 'just_wifi_u_fast_gr', 'just_wifi_u_late_gd', 'just_wifi_u_late_gr',
    // Slide 專屬 MISS 判定素材
    'miss_curv_l', 'miss_curv_r', 'miss_str_l', 'miss_str_r', 'miss_wifi_d', 'miss_wifi_u'
];

// 次要/特殊素材（WiFi 連續動畫幀、地雷、雙押星等，由背景非同步載入不阻塞首屏）
const secondaryImageKeys = [
    'tap_mine', 'MineArc',
    'hold_mine', 'Hold_Mine_End',
    'touch_mine', 'touch_point_mine', 'touch_border_2_mine', 'touch_border_3_mine',
    'star_mine', 'star_double', 'star_pink_double', 'star_break_double', 'star_each_double', 'star_ex_double', 'star_mine_double',
    'slide_mine',
    'ColorBall',
    'touchhold_0_mine', 'touchhold_1_mine', 'touchhold_2_mine', 'touchhold_3_mine', 'touchhold_border_mine'
];
const wifiPrefixes = ['wifi_', 'wifi_break_', 'wifi_each_', 'wifi_mine_'];

export const exColor = {
    tap: '#D8A2C9',
    star: '#00DBF4',
    double: '#DCDA6B',
    break: '#EBBA63',
};
export function drawImgAtcenter(ctx, img, size, offsetX = 0, offsetY = 0, imgWidthMul = 1, imgHeightMul = 1) {
    if (!img || typeof img === 'string') return;
    try {
        ctx.drawImage(
            img,
            -size / 2 * imgWidthMul + offsetX,
            -size / 2 * imgHeightMul + offsetY,
            size * imgWidthMul,
            size * imgHeightMul
        );
    } catch (e) {
        console.warn('drawImgAtcenter 繪製失敗:', e);
    }
}
export function getButton(action, type = "control") {
    return document.querySelector(`${type === "control" ? "#playControls .controlButton" : "#topUtilityBtns .utilityButton"}[data-buttonAction="${action}"]`);
}
/**
* @param {Function} func - 要執行的函式
* @param {number} delay - 延遲時間（毫秒）
*/
export function debounce(func, delay = 300) {
    let timer = null;
    let lastArgs = null;
    let lastThis = null;

    const debounced = function (...args) {
        lastArgs = args;
        lastThis = this;
        if (timer) clearTimeout(timer);

        timer = setTimeout(() => {
            const a = lastArgs;
            const t = lastThis;
            timer = null;
            lastArgs = null;
            lastThis = null;
            func.apply(t, a);
        }, delay);
    };

    debounced.cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        lastArgs = null;
        lastThis = null;
    };

    debounced.flush = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
            const a = lastArgs;
            const t = lastThis;
            lastArgs = null;
            lastThis = null;
            return func.apply(t, a);
        }
    };

    debounced.pending = () => timer !== null;
    return debounced;
}

export function throttle(func, delay = 16) {
    let lastCall = 0;

    return function (...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            func.apply(this, args);
        }
    };
}


/*export function drawArrowShape(ctx) {
    const size = 2.5; // 箭頭大小
    ctx.beginPath();
    ctx.moveTo(-size, -size); // 左後
    ctx.lineTo(size, 0);      // 尖端 (朝向前方)
    ctx.lineTo(-size, size);  // 右後
    ctx.lineTo(-size * 0.6, 0); // 往內凹一點點，看起來更像箭頭
    ctx.closePath();
    ctx.fill();
}*/


const touchPathConfigs = {
    A: { points: [[0.31, 1.0], [0.31, 0.65], [0.15, 0.6]] },
    B: { points: [[0.22, 0.53], [0.46, 0.415], [0.45, 0.35], [0, 0.275]] },
    D: { points: [[0.167, 1], [0.155, 0.66], [0, 0.732]] },
    E: { points: [[0, 0.7], [0.29, 0.585], [0, 0.437]] }
};

export const touchPaths = [];

for (let i = 1; i <= 8; i++) {
    // 根據圖片，A/B 的 base 與 D/E 的 base 角度有位移
    // 這裡我們把 A/B 設在中心，D/E 設在間隔處
    const baseAngles = { A: i - 2.5, B: i - 2.5, D: i - 3, E: i - 3 };

    ['B', 'E', 'A', 'D'].forEach(type => {
        const path = new Path2D();
        const config = touchPathConfigs[type];
        const len = config.points.length;
        const base = baseAngles[type];

        for (let j = 0; j < len * 2; j++) {
            let [angleOffset, radiusMult] = (j < len)
                ? config.points[j]
                : config.points[len - 1 - (j - len)];

            if (j >= len) angleOffset = -angleOffset;

            const angle = (base - angleOffset) * (Math.PI / 4);
            const radius = innerCirleBase * radiusMult * 1.135;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            if (j === 0) path.moveTo(x, y);
            else path.lineTo(x, y);
        }
        path.closePath();

        // 將路徑與資訊存入陣列
        touchPaths.push({ id: `${type}${i}`, type, path });
    });

}
const c1 = new Path2D();
c1.moveTo(Math.cos(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135 - 3, Math.sin(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135);
c1.lineTo(Math.cos(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135);
c1.lineTo(Math.cos(Math.PI * (-0.375 + 0.25)) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * (-0.375 + 0.25)) * innerCirleBase * 0.205 * 1.135);
c1.lineTo(Math.cos(Math.PI * (-0.375 + 0.5)) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * (-0.375 + 0.5)) * innerCirleBase * 0.205 * 1.135);
c1.lineTo(Math.cos(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135);
c1.lineTo(Math.cos(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135 - 3, Math.sin(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135);
c1.closePath();
touchPaths.push({ id: `C1`, type: 'C1', path: c1 });
const c2 = new Path2D();
// mirrored horizontally: negate x and adjust offset
c2.moveTo(-(Math.cos(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135 - 3), Math.sin(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135);
c2.lineTo(-Math.cos(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * -0.375) * innerCirleBase * 0.205 * 1.135);
c2.lineTo(-Math.cos(Math.PI * (-0.375 + 0.25)) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * (-0.375 + 0.25)) * innerCirleBase * 0.205 * 1.135);
c2.lineTo(-Math.cos(Math.PI * (-0.375 + 0.5)) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * (-0.375 + 0.5)) * innerCirleBase * 0.205 * 1.135);
c2.lineTo(-Math.cos(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135, Math.sin(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135);
c2.lineTo(-(Math.cos(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135 - 3), Math.sin(Math.PI * (-0.375 + 0.75)) * innerCirleBase * 0.205 * 1.135);
c2.closePath();
touchPaths.push({ id: `C2`, type: 'C2', path: c2 });

const COMBINED_HIGHLIGHT_REGEX = /(\|\*[\s\S]*?\*\||\|\|.*$)|((?:&lt;[A-Za-z][^&]*?&gt;)|(?:pp)|(?:qq)|(?:&amp;)|[-^vpqszVw]|(?:&lt;)|(?:&gt;))|(\([^()]*\))|(\{[^{}]*\})|(\[[^[\]]*\])|(\,)|(h)|(f)|(b)|(x)|(m)|(([ABCDE])(\d+)|C|C(d+))/gm;

export function getHighlight(text, errpos = []) {
    if (!text) {
        return '';
    }

    const escapeHTML = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const normalizeRanges = (pos) => {
        if (!Array.isArray(pos) || pos.length === 0) return [];

        const normalizeRange = ({ start, end }) => {
            const s = Number(start);
            const e = Number(end);
            if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) return null;
            return { start: Math.max(0, Math.min(text.length, s)), end: Math.max(0, Math.min(text.length, e)) };
        };

        const mergeRanges = (validRanges) => {
            const merged = [];
            for (const current of validRanges) {
                if (merged.length === 0) {
                    merged.push(current);
                } else {
                    const last = merged[merged.length - 1];
                    if (current.start <= last.end) {
                        last.end = Math.max(last.end, current.end);
                    } else {
                        merged.push(current);
                    }
                }
            }
            return merged;
        };

        if (pos.every(item => item && typeof item === 'object' && 'start' in item && 'end' in item)) {
            const valid = pos
                .map(normalizeRange)
                .filter(Boolean)
                .sort((a, b) => a.start - b.start);
            return mergeRanges(valid);
        }

        if (pos.length === 2 && Array.isArray(pos[0]) && Array.isArray(pos[1])) {
            const [starts, ends] = pos;
            const ranges = [];
            for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
                const range = normalizeRange({ start: starts[i], end: ends[i] });
                if (range) ranges.push(range);
            }
            const valid = ranges.sort((a, b) => a.start - b.start);
            return mergeRanges(valid);
        }

        return [];
    };

    const ranges = normalizeRanges(errpos);

    const highlightText = (segment) => {
        const escaped = escapeHTML(segment);
        return escaped.replace(COMBINED_HIGHLIGHT_REGEX, (match, comment, slide, bpm, split, time, comm, hold, f, bk, ex, mine, touch) => {
            if (comment) return `<span style="color: #508564;">${comment}</span>`;
            if (slide) {
                if (slide === '&amp;') return '&amp;';
                if (slide.startsWith('&lt;') && slide.endsWith('&gt;')) {
                    return `<span style="color: #c492bf;">${slide}</span>`;
                }
                return `<span style="color: #7EBAF0;">${slide}</span>`;
            }
            if (touch) return `<span style="color: #7EBAF0;">${touch}</span>`;
            if (bpm) return `<span style="color: #ffbf5f; font-weight: bold;">${bpm}</span>`;
            if (split) return `<span style="color: #c97554ff; font-weight: bold;">${split}</span>`;
            if (time) return `<span style="color: #b5cea8;">${time}</span>`;
            if (hold) return `<span style="color: #9fd47b;">${hold}</span>`;
            if (bk) return `<span style="color: #FF9707;">${bk}</span>`;
            if (ex) return `<span style="color: #d1c70f;">${ex}</span>`;
            if (mine) return `<span style="color: #c24e61;">${mine}</span>`;
            if (f) return `<span style="color: #d092ef;">${f}</span>`;
            if (comm) return `<span style="color: #656b6d;">${comm}</span>`;
            return match;
        });
    };

    if (ranges.length === 0) {
        return highlightText(text) + (text.endsWith('\n') ? ' ' : '');
    }

    let html = '';
    let cursor = 0;
    for (const range of ranges) {
        if (cursor < range.start) {
            html += highlightText(text.slice(cursor, range.start));
        }
        html += `<span class="highlight-warning">${highlightText(text.slice(range.start, range.end))}</span>`;
        cursor = range.end;
    }
    if (cursor < text.length) {
        html += highlightText(text.slice(cursor));
    }

    return html + (text.endsWith('\n') ? ' ' : '');
}

export function parseMaidata(raw) {
    if (!raw) { console.warn("empty rawdata!"); return {} };
    console.log("Parsing Maidata...");
    const maidata = {};
    raw.split("&").forEach(part => {
        const [key, value] = part.split("=");
        if (key && value) {
            maidata[key] = value.trim();
        }
    });
    return maidata;
}

export function getSimaiDataString(maidata) {
    if (!maidata || typeof maidata !== "object") return "";
    return "&" + Object.entries(maidata)
        .filter(([key, value]) => value.toString().trim().length > 0)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n&");
}
/**
 * popupWindow
 *
 * 新 API：
 * - onOpen(ctx): 開啟後呼叫，可使用 ctx 操作內容、按鈕、進度、關閉等。
 * - onClose(): 關閉後呼叫。
 * - buttons: [{ text, onClick(ctx), hideOnClick, disabled }]
 *
 * 相容舊 API：
 * - closeWhen(close, update, updButtons, setProgress)
 * - whenOpen(update, updButtons, setProgress, contentElem)
 */
export function popupWindow({
    title = "",
    content = "",
    customContent = null,
    buttons = [],
    width = 340,
    maxWidth = 600,
    height = undefined,
    maxHeight = "100dvh",
    unclosable = false,
    isPage = undefined,
    mode = undefined,
    onOpen,
    onClose,
    closeWhen,
    whenOpen
} = {}) {
    const popupWidth = typeof width === 'number' ? `${width}px` : width;
    const popupHeight = height ? (typeof height === 'number' ? `${height}px` : height) : 'auto';
    const popupMaxHeight = maxHeight ? (typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight) : '100vh';

    // 判定是否為頁面模式 (Page Route) 或 對話框模式 (Dialog)
    // 預設規則：有 customContent 且非手動指定則為 Page，純文字提示 (只有 content) 預設為 Dialog
    const isPageRoute = (isPage !== undefined)
        ? Boolean(isPage)
        : (mode === 'page' ? true : (mode === 'dialog' ? false : Boolean(customContent)));

    const applyContent = (container, value) => {
        container.innerHTML = '';
        if (!value) {
            container.style.display = 'none';
            return;
        }
        container.style.display = 'block';
        if (value instanceof Node) {
            container.appendChild(value);
            return;
        }
        container.innerHTML = `${value}`;
    };

    const createBtn = (btn, ctx) => {
        const normalized = typeof btn === 'string' ? { text: btn } : btn;
        const button = document.createElement('button');
        button.className = 'popup-button';
        button.innerText = normalized.text ?? '按鈕';

        button.disabled = !!normalized.disabled;
        button.onclick = () => {
            if (normalized.disabled) return;
            if (typeof normalized.onClick === 'function') {
                const compatArg = Object.assign(
                    (...args) => ctx.close(...args),
                    ctx
                );
                if (normalized.onClick.length <= 1) {
                    // support both new API (ctx) and legacy single-arg close callback
                    normalized.onClick(compatArg);
                } else {
                    // backward compatibility: onClick(close, update, updButtons, contentElem)
                    normalized.onClick(ctx.close, ctx.setContent, ctx.setButtons, ctx.elements.content, compatArg);
                }
            }
            if (normalized.hideOnClick) ctx.close();
        };
        return button;
    };

    // 1. 建立背景 (Backdrop)
    const backdrop = document.createElement('div');
    backdrop.className = isPageRoute ? 'popup-backdrop popup-backdrop-page' : 'popup-backdrop popup-backdrop-dialog';

    // 2. 建立彈窗主體 (Popup)
    const popup = document.createElement('div');
    popup.className = isPageRoute ? 'popup-window popup-page' : 'popup-window popup-dialog';
    popup.style.maxWidth = maxWidth ? (typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth) : '90%';
    popup.style.width = title ? popupWidth : 'fit-content';
    popup.style.height = popupHeight;
    popup.style.maxHeight = popupMaxHeight;

    // 3. 建立頂部導覽列 (Header / AppBar)
    const headerElem = document.createElement('div');
    headerElem.className = 'popup-header';
    if (!title) headerElem.classList.add('no-title');

    let closeBtn = null;
    if (!unclosable) {
        backdrop.onclick = (e) => {
            // 注意：onclick 屬性處理器若回傳 false 會呼叫 preventDefault，
            // 導致彈窗內核取方塊等原生控制項無法切換，故此處不可回傳值
            if (e.target === backdrop) closePopup();
        };
        closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'popup-close-btn';
        closeBtn.setAttribute('aria-label', isPageRoute ? 'Back' : 'Close');
        closeBtn.innerHTML = isPageRoute
            ? `
                <span class="material-symbols-outlined popup-icon-close" translate="no">close_small</span>
                <span class="material-symbols-outlined popup-icon-back" translate="no">arrow_back</span>
              `
            : `<span class="material-symbols-outlined popup-icon-close" translate="no">close_small</span>`;
        closeBtn.onclick = () => closePopup();
        headerElem.appendChild(closeBtn);
    }

    const titleElem = document.createElement('h2');
    titleElem.className = 'popup-title';
    if (!title) titleElem.style.display = 'none';
    titleElem.innerText = title;
    headerElem.appendChild(titleElem);

    if (!title && unclosable) {
        headerElem.style.display = 'none';
    }

    const progressContainer = document.createElement('div');
    progressContainer.className = 'popup-progress-container';
    const progressBar = document.createElement('div');
    progressBar.className = 'popup-progress-bar';
    progressContainer.appendChild(progressBar);

    // Scrollable content wrapper
    const bodyElem = document.createElement('div');
    bodyElem.className = 'popup-body';

    const contentElem = document.createElement('div');
    contentElem.className = 'popup-content';
    applyContent(contentElem, typeof content === 'string' ? content.trim() : content);

    const customContentElem = document.createElement('div');
    customContentElem.className = 'popup-custom-content';

    bodyElem.append(contentElem, customContentElem);

    const btnContainer = document.createElement('div');
    btnContainer.className = 'popup-buttons';

    // --- 功能函式 ---

    let closed = false;
    const isMobileBreakpoint = () => window.innerWidth <= 440;

    const closePopup = () => {
        if (closed) return;
        closed = true;
        ctx.isClosed = true;
        backdrop.style.pointerEvents = 'none';
        backdrop.style.opacity = '0';

        if (isMobileBreakpoint() && isPageRoute) {
            // 移動端全螢幕 Page Route: 向右滑出
            popup.animate([
                { transform: 'translateX(0)', opacity: 1 },
                { transform: 'translateX(100%)', opacity: 0.8 }
            ], { duration: 240, easing: 'cubic-bezier(0.3, 0, 0.8, 0.15)' }).onfinish = () => {
                backdrop.remove();
                if (typeof onClose === 'function') onClose();
            };
        } else if (!isPageRoute) {
            // Dialog 模式: 縮放淡出
            popup.animate([
                { transform: 'scale(1)', opacity: 1 },
                { transform: 'scale(0.88)', opacity: 0 }
            ], { duration: 150, easing: 'ease-in' }).onfinish = () => {
                backdrop.remove();
                if (typeof onClose === 'function') onClose();
            };
        } else {
            // 桌面端 Page 彈窗: 3D 旋轉淡出
            popup.animate([
                { transform: 'rotateX(0deg)', opacity: 1 },
                { transform: 'rotateX(30deg)', opacity: 0 }
            ], { duration: 200, easing: 'ease-in' }).onfinish = () => {
                backdrop.remove();
                if (typeof onClose === 'function') onClose();
            };
        }
    };

    const setContent = (value) => {
        applyContent(contentElem, value);
        customContentElem.style.display = 'none';
    };

    const setCustomContent = (value) => {
        customContentElem.innerHTML = '';
        if (!value) {
            customContentElem.style.display = 'none';
            return;
        }
        customContentElem.style.display = 'block';
        if (value instanceof Node) {
            customContentElem.appendChild(value);
            return;
        }
        customContentElem.innerHTML = `${value}`;
        contentElem.style.display = 'none';
    };

    const ctx = {
        close: closePopup,
        setContent,
        setCustomContent,
        setButtons: (newBtns = []) => setButtons(newBtns),
        setProgress: (pct) => {
            progressContainer.style.display = 'block';
            progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        },
        isClosed: false,
        isPage: isPageRoute,
        elements: {
            backdrop,
            popup,
            header: headerElem,
            title: titleElem,
            closeButton: closeBtn,
            body: bodyElem,
            content: contentElem,
            customContent: customContentElem,
            progressBar,
            buttons: btnContainer
        }
    };

    const setButtons = (newBtns = []) => {
        btnContainer.innerHTML = '';
        btnContainer.style.display = newBtns.length ? 'flex' : 'none';
        btnContainer.classList.toggle('popup-buttons-vertical', newBtns.length >= 3);
        newBtns.forEach(btn => {
            btnContainer.appendChild(createBtn(btn, ctx));
        });
    };

    // --- 初始化組合 ---

    popup.append(headerElem, progressContainer, bodyElem, btnContainer);

    if (customContent) {
        setCustomContent(customContent);
    }

    backdrop.appendChild(popup);
    document.body.appendChild(backdrop);

    // 啟動動畫
    requestAnimationFrame(() => {
        backdrop.style.opacity = '1';
        if (isMobileBreakpoint() && isPageRoute) {
            // 移動端全螢幕 Page: 自右側滑入
            popup.animate([
                { transform: 'translateX(100%)' },
                { transform: 'translateX(0)' }
            ], { duration: 280, easing: 'cubic-bezier(0.05, 0.7, 0.1, 1.0)' });
        } else if (!isPageRoute) {
            // Dialog 模式: 縮放彈入
            popup.animate([
                { transform: 'scale(0.85)', opacity: 0 },
                { transform: 'scale(1)', opacity: 1 }
            ], { duration: 180, easing: 'cubic-bezier(0.12, 0.8, 0.32, 1)' });
        } else {
            // 桌面端 Page: 3D 浮起彈入
            popup.animate([
                { transform: 'rotateX(30deg) scaleY(0.75) scaleX(0.8)', opacity: 0 },
                { transform: 'rotateX(0deg) scaleY(1) scaleX(1)', opacity: 1 }
            ], { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
        }
    });

    // 執行回調
    setButtons(buttons);

    if (typeof closeWhen === 'function') {
        // backward compatibility
        closeWhen(ctx.close, ctx.setContent, ctx.setButtons, ctx.setProgress);
    }

    if (typeof whenOpen === 'function') {
        // backward compatibility
        whenOpen(ctx.setContent, ctx.setButtons, ctx.setProgress, contentElem);
    }

    if (typeof onOpen === 'function') {
        onOpen(ctx);
    }

    return ctx;
}
export function simpleToast(options = {}) {
    const opts = typeof options === 'string' ? { content: options } : (options || {});
    const {
        content = "",
        timeout = 2000,
        type = "info"
    } = opts;

    const MAX_TOASTS = 3;

    let container = document.getElementById('hint-container');

    if (!container) {
        container = document.createElement('div');
        container.id = 'hint-container';
        document.body.appendChild(container);
    }

    // =========================
    // 限制最大 toast 數量
    // =========================

    const activeToasts =
        [...container.children]
            .filter(v => !v._isRemoving);

    if (activeToasts.length >= MAX_TOASTS) {
        const oldest = activeToasts[0];
        oldest?._triggerRemove?.();
    }

    // =========================
    // 建立 toast
    // =========================

    const popup = document.createElement('div');
    popup.className = `toast-item toast-${type}`;

    // 安全版
    popup.textContent = content;

    container.appendChild(popup);

    // =========================
    // 出現動畫
    // =========================

    popup.animate(
        [
            {
                transform: 'translateX(-40px)',
                opacity: 0
            },
            {
                transform: 'translateX(0)',
                opacity: 1
            }
        ],
        {
            duration: 300,
            easing:
                'cubic-bezier(0.58,0.18,0.34,1.41)'
        }
    );

    // =========================
    // 移除邏輯
    // =========================

    const removePopup = () => {

        if (popup._isRemoving) return;

        popup._isRemoving = true;

        clearTimeout(timer);

        popup.style.maxHeight = '0px';

        popup.style.marginTop = '0px';
        popup.style.marginBottom = '0px';

        popup.style.paddingTop = '0px';
        popup.style.paddingBottom = '0px';

        popup.style.opacity = '0';

        popup.style.transform =
            'translateX(-40px)';

        popup.style.pointerEvents = 'none';

        // transitionend 有時不穩
        // 直接 timeout 最穩

        setTimeout(() => {

            popup.remove();

            if (
                container &&
                container.children.length === 0
            ) {
                container.remove();
            }

        }, 450);
    };

    popup._triggerRemove = removePopup;

    // =========================
    // 自動關閉
    // =========================

    const timer =
        setTimeout(removePopup, timeout);

    // =========================
    // 點擊關閉
    // =========================

    popup.onclick = removePopup;
}

/**
 * 載入所有圖片素材，支援進度回報
 * @param {Function} onProgress - 回傳 (目前百分比, 當前 Key)
 */
export async function loadAllImages(onProgress, skinName = 'Default') {
    const images = {};

    const totalCore = coreImageKeys.length;
    let loadedCore = 0;

    const report = (key) => {
        loadedCore++;
        if (onProgress) onProgress((loadedCore / totalCore) * 100, key);
    };

    const registerImgWithAliases = (key, img) => {
        images[key] = img;
        const alias = skinAliases[key];
        if (alias && !images[alias]) images[alias] = img;
    };

    // 1. 優先載入首屏必需的核心元件（大幅縮減 LCP 阻塞時間）
    const coreQueue = coreImageKeys.map(async key => {
        const candidates = getSkinCandidateUrls(key, baseURL, skinName);
        try {
            try {
                const img = await getImgWithCandidates(candidates, key, skinName);
                if (img) registerImgWithAliases(key, img);
            } catch (err) {
                console.warn(`[資源缺失] 無法載入 ${key}:`, err);
            }
        } finally {
            report(key);
        }
    });

    await Promise.all(coreQueue);

    // 2. 次要素材（44 張 WiFi 動畫幀、地雷變形等）改於背景以小批次非同步載入，不阻塞首屏渲染與彈窗關閉
    const secondaryKeys = [
        ...secondaryImageKeys,
        ...wifiPrefixes.flatMap(prefix => Array.from({ length: 11 }, (_, i) => `${prefix}${i}`))
    ];

    (async () => {
        const batchSize = 6;
        for (let i = 0; i < secondaryKeys.length; i += batchSize) {
            const batch = secondaryKeys.slice(i, i + batchSize);
            await Promise.all(batch.map(async key => {
                const candidates = getSkinCandidateUrls(key, baseURL, skinName);
                try {
                    const img = await getImgWithCandidates(candidates, key, skinName);
                    if (img) registerImgWithAliases(key, img);
                } catch (err) {
                    console.warn(`[背景資源缺失] 無法載入 ${key}:`, err);
                }
            }));
        }
    })();

    return images;
}

/**
 * 載入指定 key 的圖片素材，依優先序回退：
 * 1. 優先從 Skin/{skinName}/{type}/{fileName} 載入
 * 2. 若指定皮膚不存在且非 Default，嘗試 Skin/Default/...
 * 3. 嘗試 Skin/Shared/{type}/{fileName} (或 Skin/Shared/{fileName}) 載入
 * 4. 降級保底原有的 Skin/{fileName} 載入
 * @param {string[]} candidateUrls 候選 URL 陣列 (依優先序排列)
 * @param {string} key 素材識別碼
 * @param {string} [skinName='Default']
 */
async function getImgWithCandidates(candidateUrls, key, skinName = 'Default') {
    const loadBlobAsImage = (b) => new Promise((resolve, reject) => {
        const img = new Image();
        const objUrl = URL.createObjectURL(b);
        img.onload = () => {
            // 注意：不要在 onload 立即 revokeObjectURL，因為 images[key] 是全域常駐字典，
            // 其它 DOM 元件 (如專案總管封面、譜面資訊彈窗) 會直接讀取 img.src。
            resolve(img);
        };
        img.onerror = async () => {
            URL.revokeObjectURL(objUrl);
            await idbDelete(`img_cache_skin_${skinName}_${key}`).catch(() => { });
            reject(new Error(`Failed to decode image blob for key: ${key}`));
        };
        img.src = objUrl;
    });

    const cacheKey = `img_cache_skin_${skinName}_${key}`;

    // 1. 嘗試從 IndexedDB 取得皮膚快取 (依 skinName 隔離快取，Default 支援向下相容舊 key)
    let blob = await idbGet(cacheKey).catch(() => null);
    if (!blob && skinName === 'Default') {
        blob = await idbGet(`img_cache_skin_${key}`).catch(() => null);
    }

    if (blob && blob.type && !blob.type.startsWith('image/')) {
        await idbDelete(cacheKey).catch(() => { });
        blob = null;
    }

    if (blob) {
        try {
            return await loadBlobAsImage(blob);
        } catch {
            blob = null;
        }
    }

    // 2. 依候選路徑依序嘗試載入：優先指定皮膚 -> 其次 Default -> 再次 Shared -> 最後 Fallback
    let lastError = null;
    for (const url of candidateUrls) {
        try {
            const response = await fetch(url);
            if (!response.ok) continue; // 404 或其他狀態碼，嘗試下一個候選
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) continue; // Vite SPA fallback
            blob = await response.blob();
            const img = await loadBlobAsImage(blob);
            await idbSet(cacheKey, blob).catch(() => { });
            return img;
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error(`All candidate skin URLs failed for ${key}`);
}

async function getImgWithCache(url, key, skinName = 'Default') {
    const candidates = [url, ...getSkinCandidateUrls(key, baseURL, skinName)];
    return await getImgWithCandidates(candidates, key, skinName);
}
export function generatePath(startPos, endPos) {
    console.warn("path missing, using straight line as fallback");
    const recorder = new PathRecorder();
    const startInfo = noteRefPos[startPos - 1];
    const endInfo = noteRefPos[endPos - 1];

    recorder.moveTo(startInfo.x, startInfo.y);
    recorder.lineTo(endInfo.x, endInfo.y);

    return recorder;
}
/**
 * 對圖像套用色調 (Flat Tint)
 */
function tintImage(img, r, g, b, amount = 0.5) {
    const w = img.width || img.naturalWidth || 0;
    const h = img.height || img.naturalHeight || 0;
    if (w === 0 || h === 0) return null;

    // 1. 優先使用 OffscreenCanvas (效能較佳且不影響 DOM)
    let canvas;
    if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(w, h);
    } else {
        canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
    }

    const ctx = canvas.getContext('2d');

    // 2. 繪製原始圖像
    ctx.drawImage(img, 0, 0, w, h);

    if (amount <= 0) return canvas;

    // 3. 使用 GPU 混合模式套用色彩乘法混合 (若有 CORS 限制則會拋錯降級)
    try {
        // 建立一個暫時的 Canvas 用來染色
        let tintCanvas;
        if (typeof OffscreenCanvas !== 'undefined') {
            tintCanvas = new OffscreenCanvas(w, h);
        } else {
            tintCanvas = document.createElement('canvas');
            tintCanvas.width = w;
            tintCanvas.height = h;
        }
        const tctx = tintCanvas.getContext('2d');

        // a. 在 tintCanvas 上繪製原圖
        tctx.drawImage(img, 0, 0, w, h);

        // b. 將顏色填充至非透明區域 (source-in 取得純色剪影)
        tctx.save();
        tctx.globalCompositeOperation = 'source-in';
        tctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
        tctx.fillRect(0, 0, w, h);
        tctx.restore();

        // c. 與原圖進行色彩乘法混合 (multiply)
        tctx.save();
        tctx.globalCompositeOperation = 'multiply';
        tctx.drawImage(img, 0, 0, w, h);
        tctx.restore();

        // d. 確保透明度通道完全正確
        tctx.save();
        tctx.globalCompositeOperation = 'destination-in';
        tctx.drawImage(img, 0, 0, w, h);
        tctx.restore();

        // 4. 將染色圖像按 amount 的透明度疊加至主 canvas 上
        ctx.save();
        ctx.globalAlpha = amount;
        ctx.drawImage(tintCanvas, 0, 0);
        ctx.restore();
    } catch (e) {
        console.warn("GPU tint failed: falling back to source-atop method.", e);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
        ctx.globalAlpha = Math.max(0, Math.min(1, amount));
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    return canvas;
}
// 建議定義在全域或模組頂層
let _tintCache = new WeakMap();

/**
 * 取得染色後的圖片 (具備快取機制)
 */
export function getTintedImage(img, amount = 0.5, { r = 255, g = 255, b = 255, colorCode = null } = {}) {
    if (!img) return null;

    // 快速通道：若不需染色，直接回傳原圖，避開快取與 Canvas 染色負載
    if (amount <= 0) return img;

    // 1. 初始化圖片對應的快取 Map (使用 WeakMap 避免記憶體洩漏)
    let map = _tintCache.get(img);
    if (!map) {
        map = new Map();
        _tintCache.set(img, map);
    }

    // 2. 處理 Hex 色碼 (支援 #號、3位與6位格式)
    if (colorCode !== null) {
        let hex = colorCode.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }

        if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        } else {
            console.warn("Invalid tint color code:", colorCode);
        }
    }

    // 3. 數值邊界檢查與正規化
    const clampVal = (v) => Math.max(0, Math.min(255, Math.round(v)));
    r = clampVal(r); g = clampVal(g); b = clampVal(b);

    // Amount 正規化為 0.05 粒度，提高閃爍時的快取命中率
    const normalizedAmount = Math.round(amount * 20) / 20;

    // 4. 快取檢索
    const key = `${r}|${g}|${b}|${normalizedAmount}`;
    if (map.has(key)) return map.get(key);

    // 5. 執行真正的染色邏輯
    const canvas = tintImage(img, r, g, b, normalizedAmount);
    map.set(key, canvas);

    return canvas;
}

/**
 * 清除 tint 快取
 * 如果傳入 img 只清該圖的快取；不傳則清除全部快取
 * @param {HTMLImageElement} [img]
 */
export function clearTintCache(img) {
    if (img) {
        _tintCache.delete(img);
    } else {
        _tintCache = new WeakMap();
    }
}

async function cacheFontWithAPI(url) {
    const cache = await caches.open('font-assets-v1');

    // 檢查是否有快取
    let response = await cache.match(url);

    if (!response) {
        console.log("[CacheAPI] 抓取並儲存字體...");
        await cache.add(url);
    }

    // 即使在 Cache API 中，你最後還是要在 CSS 寫 @font-face 
    // 或者用上述的 FontFace API 來載入。
}
export function formatSize(size) {
    if (size < 1024) return `${size} B`;
    for (const unit of ['KiB', 'MiB', 'GiB']) {
        size /= 1024;
        if (size < 1024) return `${size.toFixed(1)} ${unit}`;
    }
}
export const wSlideRatio = [
    111, 68, -3, 0,
    160, 90, -3.5, -0.004,
    204, 110, -4.6, -0.0035,
    253, 136, -5.5, -0.004,
    298, 154, -6.5, -0.003,
    353, 179, -6.2, -0.003,
    410, 205, -5.75, -0.003,
    464, 226, -5.45, -0.003,
    519, 251, -5.4, -0.004,
    571, 271, -5.2, -0.003,
    653, 313, -3.9, -0.003,
];

export const contantRotate = (selected, direction) => {
    if (typeof selected !== 'string' || selected.length === 0) return selected;

    const bracketPairs = {
        '[': ']',
        '{': '}',
        '(': ')'
    };

    const rotateDigit = (digit) => {
        const base = parseInt(digit, 10);
        if (Number.isNaN(base) || base < 1 || base > 8) return digit;
        return String(((base - 1 + direction) % 8 + 8) % 8 + 1);
    };

    const extractEdgeTags = (token) => {
        let prefix = '';
        let current = token;
        while (current.startsWith('<')) {
            const closeIndex = current.indexOf('>');
            if (closeIndex <= 0) break;
            const inner = current.slice(1, closeIndex);
            if (inner.length === 1 && /^[0-9]$/.test(inner)) break;
            prefix += current.slice(0, closeIndex + 1);
            current = current.slice(closeIndex + 1);
        }

        let suffix = '';
        while (current.endsWith('>')) {
            const openIndex = current.lastIndexOf('<');
            if (openIndex < 0) break;
            const inner = current.slice(openIndex + 1, current.length - 1);
            if (inner.length === 1 && /^[0-9]$/.test(inner)) break;
            suffix = current.slice(openIndex) + suffix;
            current = current.slice(0, openIndex);
        }

        return { prefix, content: current, suffix };
    };

    const processContent = (content) => {
        const stack = [];
        let result = '';
        let lastOldDigit = null;
        let lastNewDigit = null;
        let firstOldDigit = null;
        let firstNewDigit = null;

        for (let i = 0; i < content.length; i++) {
            const ch = content[i];
            if (bracketPairs[ch]) {
                stack.push(bracketPairs[ch]);
                result += ch;
                continue;
            }
            if (stack.length > 0) {
                if (ch === stack[stack.length - 1]) {
                    stack.pop();
                }
                result += ch;
                continue;
            }
            if (ch >= '1' && ch <= '8') {
                const oldD = parseInt(ch, 10);
                const rotated = rotateDigit(ch);
                const newD = parseInt(rotated, 10);

                lastOldDigit = oldD;
                lastNewDigit = newD;
                if (firstOldDigit === null) {
                    firstOldDigit = oldD;
                    firstNewDigit = newD;
                }
                result += rotated;
            } else if (ch === '*') {
                lastOldDigit = firstOldDigit;
                lastNewDigit = firstNewDigit;
                result += ch;
            } else if (ch === '<' || ch === '>') {
                if (lastOldDigit !== null && lastNewDigit !== null) {
                    const oldFlip = (lastOldDigit >= 3 && lastOldDigit <= 6);
                    const newFlip = (lastNewDigit >= 3 && lastNewDigit <= 6);
                    if (oldFlip !== newFlip) {
                        result += (ch === '<' ? '>' : '<');
                    } else {
                        result += ch;
                    }
                } else {
                    result += ch;
                }
            } else {
                result += ch;
            }
        }
        return result;
    };

    return selected.split(/(\s*,\s*)/).map((part, index) => {
        if (index % 2 === 1) return part;
        const { prefix, content, suffix } = extractEdgeTags(part);
        return prefix + processContent(content) + suffix;
    }).join('');
};
export function flipSelectedText(selected, deMap, transformDigit, swapPairs = {}) {
    if (typeof selected !== 'string') return selected;

    const bracketPairs = {
        '[': ']',
        '{': '}',
        '(': ')'
    };

    const extractEdgeTags = (token) => {
        let prefix = '';
        let current = token;

        while (current.startsWith('<')) {
            const closeIndex = current.indexOf('>');
            if (closeIndex <= 0) break;
            const inner = current.slice(1, closeIndex);
            if (inner.length === 1 && /^[0-9]$/.test(inner)) break;
            prefix += current.slice(0, closeIndex + 1);
            current = current.slice(closeIndex + 1);
        }

        let suffix = '';
        while (current.endsWith('>')) {
            const openIndex = current.lastIndexOf('<');
            if (openIndex < 0) break;
            const inner = current.slice(openIndex + 1, current.length - 1);
            if (inner.length === 1 && /^[0-9]$/.test(inner)) break;
            suffix = current.slice(openIndex) + suffix;
            current = current.slice(0, openIndex);
        }

        return { prefix, content: current, suffix };
    };

    const processContent = (content) => {
        const stack = [];
        let result = '';

        for (let i = 0; i < content.length; i++) {
            const ch = content[i];
            if (bracketPairs[ch]) {
                stack.push(bracketPairs[ch]);
                result += ch;
                continue;
            }

            if (stack.length > 0) {
                if (ch === stack[stack.length - 1]) {
                    stack.pop();
                }
                result += ch;
                continue;
            }

            const up = ch.toUpperCase();
            if (up === 'C') {
                const next = content[i + 1];
                if (next === '1') {
                    result += ch + next;
                    i++;
                    continue;
                }
                result += ch;
                continue;
            }

            if (up === 'D' || up === 'E') {
                const next = content[i + 1];
                if (next && /\d/.test(next)) {
                    const d = parseInt(next, 10);
                    if (d >= 1 && d <= 8) {
                        const mapped = deMap[d];
                        result += ch + mapped.toString();
                        i++;
                        continue;
                    }
                }
                result += ch;
                continue;
            }

            if (/\d/.test(ch)) {
                result += transformDigit(ch);
                continue;
            }

            if (swapPairs[ch]) {
                result += swapPairs[ch];
                continue;
            }

            result += ch;
        }

        return result;
    };

    return selected.split(/(\s*,\s*)/).map((part, index) => {
        if (index % 2 === 1) return part;
        const { prefix, content, suffix } = extractEdgeTags(part);
        return prefix + processContent(content) + suffix;
    }).join('');
}
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// 確保 .backgroundContainer 永遠為父容器內最大的正方形
function updateBackgroundSquare(canvasContainerEl) {
    if (!canvasContainerEl) return;
    const bg = canvasContainerEl.querySelector('.backgroundContainer');
    if (!bg) return;
    const rect = canvasContainerEl.getBoundingClientRect();
    const side = Math.max(0, Math.min(rect.width, rect.height));
    bg.style.width = side + 'px';
    bg.style.height = side + 'px';
    // keep centered
    bg.style.left = '50%';
    bg.style.top = '50%';
    bg.style.transform = 'translate(-50%, -50%)';
}
const _cEl = document.getElementById('canvasContainer');
// 監聽容器尺寸變化（ResizeObserver 優先），並在視窗 resize 時也更新
try {
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => updateBackgroundSquare(_cEl));
        ro.observe(_cEl);
    }
} catch (e) {
    // ignore
}
window.addEventListener('resize', () => updateBackgroundSquare(_cEl));
// 初次更新
setTimeout(() => updateBackgroundSquare(_cEl), 0);

export const createLabeledInput1 = ({
    value,
    labelText,
    type = 'text', // 現在支援 'text' | 'textarea' | 'select' | 'number' | 'range' | 'color' 等等
    assign,
    data = {},
    ref = {},
    options = []
} = {}) => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = "display:flex;flex-direction:column;margin-bottom:6px;";

    const label = document.createElement('label');
    label.textContent = labelText;
    label.style.cssText = "font-size:12px;color:#888;margin-bottom:2px;";

    let input;
    if (type === 'textarea') {
        input = document.createElement('textarea');
    } else if (type === 'select') {
        input = document.createElement('select');
        // 填充選項的邏輯保持你寫的，寫得很好
        if (Array.isArray(options)) {
            options.forEach(opt => {
                const optionEl = document.createElement('option');
                if (opt && typeof opt === 'object' && ('value' in opt || 'label' in opt)) {
                    optionEl.value = opt.value != null ? String(opt.value) : String(opt.label ?? '');
                    optionEl.textContent = opt.label != null ? String(opt.label) : String(opt.value ?? opt);
                } else {
                    optionEl.value = optionEl.textContent = String(opt);
                }
                input.appendChild(optionEl);
            });
        } else if (options && typeof options === 'object') {
            Object.keys(options).forEach(k => {
                const optionEl = document.createElement('option');
                optionEl.value = k;
                optionEl.textContent = options[k];
                input.appendChild(optionEl);
            });
        }
    } else {
        input = document.createElement('input');
        input.type = type; // 讓它能直接支援 number、color、range、checkbox 等原生類型！
    }

    if (type !== 'select') {
        input.value = value ?? '';
    } else {
        if (value != null) input.value = String(value);
    }

    input.title = labelText;
    if (type !== 'select' && type !== 'color' && type !== 'range') {
        input.placeholder = labelText;
    }

    input.style.cssText = "border:1px solid #333;border-radius:4px;background:#111;color:#fff;font-size:12px;resize:vertical;padding:8px;box-sizing:border-box;";

    const handleChange = () => {
        let newValue = input.value;

        // 貼心小優化：如果類型是數字，自動轉成數字型態再存進 data，免得以後計算還要 parseInt
        if (type === 'number' || type === 'range') {
            newValue = Number(newValue);
        }

        if (assign) data[assign] = newValue;
    };

    if (type === 'select') {
        input.addEventListener('change', handleChange);
    } else {
        input.addEventListener('input', handleChange);
    }

    if (assign) ref[assign] = input;

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return { wrapper, input };
};

export const createCustomSlider = (initialValue, min = 0, max = 1, step = 0.1, onInputCallback) => {
    const thumbWidth = 4;
    const thumbHeight = 34;
    const trackHeight = 24;
    const gap = 4; // 滑鈕兩側 4px 間隙
    const halfThumb = thumbWidth / 2; // 2px

    // 1. 主容器 (模擬 input[type="range"] 讓外部能夠讀取與賦值 .value)
    const container = document.createElement('div');
    container.className = 'custom-slider-container';
    container.setAttribute('type', 'range');
    container.type = 'range';
    container.value = initialValue;
    container.min = min;
    container.max = max;
    container.step = step;
    container.style.cssText = `
        width: 140px;
        min-width: 120px;
        flex-shrink: 0;
        height: ${trackHeight}px;
        margin-top: 14px;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        position: relative;
        cursor: pointer;
        user-select: none;
        touch-action: none;
        box-sizing: border-box;
    `;

    // 2. 軌道主體容器 (Track)
    const track = document.createElement('div');
    track.style.cssText = `
        width: 100%;
        height: ${trackHeight}px;
        position: relative;
        display: flex;
        align-items: center;
    `;

    // 3. 填滿進度軌道 (Active Fill)
    const fill = document.createElement('div');
    fill.style.cssText = `
        height: 100%;
        background: var(--accent-color);
        border-radius: 999px 4px 4px 999px;
        position: absolute;
        left: 0;
        top: 0;
        width: 0%;
        pointer-events: none;
        transition: width 0.15s ease-out;
    `;

    // 4. 未填滿軌道 (Inactive Track)
    const unfill = document.createElement('div');
    unfill.style.cssText = `
        height: 100%;
        background: rgba(255, 255, 255, 0.14);
        border-radius: 4px 999px 999px 4px;
        position: absolute;
        right: 0;
        top: 0;
        left: 0%;
        pointer-events: none;
        transition: left 0.15s ease-out;
    `;

    // 5. 垂直膠囊滑鈕 (Vertical Capsule Thumb)
    const thumb = document.createElement('div');
    thumb.style.cssText = `
        width: ${thumbWidth}px;
        height: ${thumbHeight}px;
        background: var(--accent-color);
        border-radius: 999px;
        position: absolute;
        top: 50%;
        left: 0%;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
        box-sizing: border-box;
        pointer-events: none;
        transition: left 0.15s ease-out, transform 0.15s ease-out, box-shadow 0.15s ease-out;
    `;

    // 6. 頂部浮動數值氣泡 (Value Bubble)
    const bubble = document.createElement('div');
    bubble.style.cssText = `
        position: absolute;
        left: 0%;
        opacity: 0;
        transform: translateX(-50%);
        min-width: 22px;
        height: 22px;
        padding: 0 5px;
        box-sizing: border-box;
        border-radius: 4px;
        background: #f2effa;
        color: #1a1721;
        font-family: 'mono', monospace, sans-serif;
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
        pointer-events: none;
        white-space: nowrap;
        transition: left 0.3s ease-out, transform 0.1s ease-out, opacity 0.1s ease-out;
    `;

    track.appendChild(unfill);
    track.appendChild(fill);
    track.appendChild(thumb);
    track.appendChild(bubble);
    container.appendChild(track);

    // 格式化顯示數值（整數不帶贅餘 0，小數依步長自適應）
    const formatValue = (v) => {
        if (step >= 1) return Math.round(v).toString();
        const precision = step < 0.01 ? 3 : (step < 0.1 ? 2 : 1);
        return parseFloat(v.toFixed(precision)).toString();
    };

    // 內部更新視覺與數值函式
    const updateVisuals = (val) => {
        val = Math.max(min, Math.min(max, val));
        const percent = (max === min) ? 0 : Math.max(0, Math.min(1, (val - min) / (max - min)));

        const offsetGap = halfThumb + gap; // 2 + 4 = 6px

        fill.style.display = 'block';
        fill.style.width = `calc(${percent * 100}% - ${offsetGap}px)`;
        fill.style.borderRadius = '10px 4px 4px 10px';

        unfill.style.display = 'block';
        unfill.style.left = `calc(${percent * 100}% + ${offsetGap}px)`;
        unfill.style.borderRadius = '4px 10px 10px 4px';

        thumb.style.left = `${percent * 100}%`;
        bubble.style.left = `${percent * 100}%`;

        bubble.textContent = formatValue(val);
        container.value = val;
    };

    // 處理拖曳/點擊邏輯
    let isDragging = false;

    const handlePointerMove = (e) => {
        const rect = track.getBoundingClientRect();
        if (rect.width <= 0) return;

        const clickX = e.clientX - rect.left;
        let pct = Math.max(0, Math.min(1, clickX / rect.width));

        let rawVal = min + pct * (max - min);
        let steppedVal = Math.round(rawVal / step) * step;

        steppedVal = parseFloat(steppedVal.toFixed(4));
        steppedVal = Math.max(min, Math.min(max, steppedVal));

        updateVisuals(steppedVal);
        if (onInputCallback) onInputCallback(steppedVal);
    };

    container.addEventListener('pointerdown', (e) => {
        isDragging = true;
        container.setPointerCapture(e.pointerId);
        thumb.style.transform = 'translate(-50%, -50%) scaleY(1.1) scaleX(1.3)';
        bubble.style.opacity = 1;
        bubble.style.transform = 'translateX(-50%) translateY(-75%)';
        handlePointerMove(e);
    });

    container.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        handlePointerMove(e);
    });

    const stopDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        thumb.style.transform = 'translate(-50%, -50%) scale(1)';
        bubble.style.opacity = 0;
        bubble.style.transform = 'translateX(-50%)';
        updateVisuals(container.value);
    };

    container.addEventListener('pointerup', stopDrag);
    container.addEventListener('pointercancel', stopDrag);

    // 初始化數值視覺
    updateVisuals(initialValue);

    // 提供外部更新或重置介面
    container._updateDisplay = () => {
        updateVisuals(container.value);
    };

    return container;
};

const activeDebug = () => {
    const debugInfoEl = document.createElement('div');
    debugInfoEl.style.position = 'fixed';
    debugInfoEl.style.minWidth = '50px';
    debugInfoEl.style.minHeight = '50px';
    debugInfoEl.style.top = '10px';
    debugInfoEl.style.right = '10px';
    debugInfoEl.style.padding = '5px 10px';
    debugInfoEl.style.backgroundColor = 'rgba(24, 171, 122, 0.58)';
    debugInfoEl.style.color = '#fff';
    debugInfoEl.style.fontSize = '12px';
    debugInfoEl.style.zIndex = '10000';
    debugInfoEl.style.cursor = 'move'; // 提示使用者這可以拖曳
    debugInfoEl.style.userSelect = 'none'; // 防止拖曳時不小心選取到文字

    // 拖曳邏輯變數
    let isDragging = false;
    let offsetX, offsetY;

    debugInfoEl.addEventListener('mousedown', (e) => {
        isDragging = true;
        // 計算滑鼠點擊點與元素左上角的相對距離
        const rect = debugInfoEl.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
    });

    // 監聽 window 而不是元素本身，這樣滑鼠移太快才不會斷掉
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        // 計算新位置
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;

        // 限制不要拖出視窗外（選用，如果你想讓它隨便飛可以刪掉邊界限制）
        const maxX = window.innerWidth - debugInfoEl.offsetWidth;
        const maxY = window.innerHeight - debugInfoEl.offsetHeight;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        // 因為原本設定了 right: 10px，拖曳時我們改用 left 和 top 來精準定位
        debugInfoEl.style.right = 'auto';
        debugInfoEl.style.left = `${newX}px`;
        debugInfoEl.style.top = `${newY}px`;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    document.body.appendChild(debugInfoEl);
    window.debugInfoEl = debugInfoEl;
}

window.activeDebug = activeDebug;

export function easeOutQuad(x) {
    return 1 - (1 - x) * (1 - x);
}
export function easeInBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;

    return c3 * x * x * x - c1 * x * x;
}

export function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            if (existing.dataset.loaded === 'true') {
                return resolve();
            }
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', (e) => reject(e), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
        };
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
    });
}

export async function ensureMediabunny() {
    if (window.Mediabunny) return window.Mediabunny;
    await loadScript('Scripts/mediabunny.cjs');
    return window.Mediabunny;
}

export async function ensureJSZip() {
    if (window.JSZip) return window.JSZip;
    await loadScript('Scripts/jszip.min.js');
    return window.JSZip;
}

export async function ensureSupabase() {
    if (globalThis.supabase?.createClient) return globalThis.supabase;
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    return globalThis.supabase;
}

export async function ensureJsMediaTags() {
    if (window.jsmediatags) return window.jsmediatags;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js');
    return window.jsmediatags;
}
/**
 * 禁用手機/瀏覽器的「滑動上一頁/下一頁」與「下拉重新整理」原生手勢
 */
export function disableNavigationGestures() {
    if (typeof window === 'undefined') return;

    // 1. 禁用邊緣滑動歷史導覽手勢 (iOS Safari / Android Chrome 側滑上一頁/下一頁)
    let touchStartX = 0;
    let touchStartY = 0;
    let isEdgeTouch = false;

    window.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;

            // 判斷觸控起點是否在螢幕兩側邊緣 24px 內
            isEdgeTouch = touchStartX < 24 || touchStartX > window.innerWidth - 24;

            // 若點擊目標為按鈕或可互動元件，絕不在此階段阻止 touchstart，以保證正常觸發 click 事件
            const isInteractive = e.target && e.target.closest('button, [role="button"], .utilityButton, input, select, textarea, a, label, #utilityContainer');
            if (isInteractive) {
                isEdgeTouch = false;
                return;
            }
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!e.cancelable || !e.touches) return;

        // 多指觸控 (如雙指捏合 Pinch-to-zoom) 一律阻斷，防止頁面縮放
        if (e.touches.length > 1) {
            e.preventDefault();
            return;
        }

        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;

        // 邊緣滑動歷史導覽手勢阻斷 (側滑上一頁/下一頁)
        if (isEdgeTouch) {
            const diffX = Math.abs(currentX - touchStartX);
            const diffY = Math.abs(currentY - touchStartY);
            if (diffX > 5 && diffX > diffY) {
                e.preventDefault();
                return;
            }
        }

        const isPullingDown = currentY > touchStartY;

        let el = e.target;
        let canScrollDown = false;
        while (el && el !== document.body && el !== document.documentElement) {
            const style = window.getComputedStyle(el);
            const overflowY = style.overflowY;
            if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
                // 如果已經在最頂端還往下拉，阻斷它以避免觸發 pull-to-refresh
                if (isPullingDown && el.scrollTop <= 0) {
                    canScrollDown = false;
                } else {
                    canScrollDown = true;
                }
                break;
            }
            el = el.parentElement;
        }

        if (!canScrollDown && isPullingDown) {
            e.preventDefault();
        }
    }, { passive: false });

    // 3. 禁用 iOS Safari 專屬手勢縮放 (Pinch-to-zoom)
    document.addEventListener('gesturestart', (e) => {
        if (e.cancelable) e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturechange', (e) => {
        if (e.cancelable) e.preventDefault();
    }, { passive: false });
    document.addEventListener('gestureend', (e) => {
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    // 4. 禁用雙點放大 (Double-tap to zoom)
    let lastTouchEndTime = 0;
    document.addEventListener('touchend', (e) => {
        const now = Date.now();
        // 若在 300ms 內快速連續點擊兩次
        if (now - lastTouchEndTime <= 300) {
            // 若點擊目標為按鈕或可互動元件，允許高速連點，不阻斷 click 生成
            const isInteractive = e.target && e.target.closest('button, [role="button"], .utilityButton, input, select, textarea, a, label, #utilityContainer');
            if (!isInteractive) {
                if (e.cancelable) {
                    e.preventDefault();
                }
            }
        }
        lastTouchEndTime = now;
    }, { passive: false });
}
