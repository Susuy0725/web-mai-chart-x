/**
 * touchGroupModal.js
 * 
 * 視覺化編輯器 - Touch 群組編輯視窗 (Material Design 原生 HTML + CSS)
 * 支援同拍點內 Touch 音符增減、種類切換 (Touch / TouchHold)、效果設定 (花火、地雷、EX)、TouchHold 時長設定 (比照 noteDurationModal 規格)
 * 置頂固定預覽窗採用 SimaiRenderer 繪製真實機台畫面，全面關閉判定顯示 (無 CRITICAL PERFECT)
 */

import { popupWindow, simpleToast } from '../helper.js';
import { SimaiRenderer } from '../renderer.js';
import { simaiDecode } from '../decode.js';

// maimai 所有 33 個 Touch 感應區清單
export const ALL_TOUCH_POSITIONS = [
    'C',
    'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8',
    'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8',
    'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8',
    'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'
];

/**
 * 注入 Touch 群組編輯器專屬 Material Design 樣式
 */
function ensureTouchGroupStyles() {
    const styleId = 'wmc-touch-group-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .tgm-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
            color: #e2e8f0;
            font-family: "Plus Jakarta Sans", "Noto Sans TC", sans-serif;
            font-size: 13px;
            width: 100%;
            box-sizing: border-box;
            user-select: none;
            -webkit-user-select: none;
            position: relative;
        }

        /* 置頂固定預覽窗容器 */
        .tgm-preview-sticky {
            position: sticky;
            top: 0;
            z-index: 30;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: rgba(17, 20, 28, 0.98);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            padding: 8px 0 10px 0;
            margin: -8px -8px 0 -8px;
            border-radius: 12px 12px 0 0;
        }

        .tgm-preview-canvas {
            display: block;
            width: 240px;
            height: 240px;
            border-radius: 50%;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.65);
        }

        /* 可滾動內容區 (由彈窗全域捲軸統一管理，支援任意位置上下平滑滑動) */
        .tgm-scroll-body {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 4px 0;
        }

        /* 模組卡片樣式 (Material Card) */
        .tgm-card {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            box-sizing: border-box;
        }

        .tgm-card-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 13px;
            font-weight: 600;
            color: #f1f5f9;
        }

        .tgm-card-title-left {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        /* 音符列表列 (Note Chips List) */
        .tgm-notes-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .tgm-note-chip {
            border: 1px solid rgba(255, 255, 255, 0.16);
            background: rgba(255, 255, 255, 0.06);
            color: #e2e8f0;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.15s ease;
        }

        .tgm-note-chip:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.25);
        }

        .tgm-note-chip.active {
            background: rgba(0, 229, 255, 0.18);
            border-color: #00e5ff;
            color: #ffffff;
            box-shadow: 0 0 10px rgba(0, 229, 255, 0.25);
        }

        .tgm-chip-del-btn {
            background: transparent;
            border: none;
            color: #94a3b8;
            padding: 0;
            font-size: 14px;
            cursor: pointer;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            transition: color 0.12s ease, background 0.12s ease;
        }

        .tgm-chip-del-btn:hover {
            color: #ef4444;
            background: rgba(239, 68, 68, 0.15);
        }

        .tgm-btn-add {
            border: 1px dashed rgba(0, 229, 255, 0.5);
            background: rgba(0, 229, 255, 0.05);
            color: #00e5ff;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.15s ease;
        }

        .tgm-btn-add:hover {
            background: rgba(0, 229, 255, 0.15);
            border-color: #00e5ff;
        }

        /* 選區與選位組合式樣式 */
        .tgm-comb-container {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .tgm-comb-row {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .tgm-comb-label {
            font-size: 12px;
            font-weight: 600;
            color: #94a3b8;
            width: 24px;
            flex-shrink: 0;
            text-align: center;
        }

        .tgm-comb-btn-group {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            flex: 1;
        }

        .tgm-comb-btn {
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(255, 255, 255, 0.04);
            color: #cbd5e1;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            min-width: 38px;
            text-align: center;
            transition: all 0.12s ease;
        }

        .tgm-comb-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            color: #ffffff;
        }

        .tgm-comb-btn.active {
            background: #00e5ff;
            color: #000000;
            border-color: #00e5ff;
            box-shadow: 0 0 8px rgba(0, 229, 255, 0.4);
        }

        .tgm-comb-btn.has-note:not(.active) {
            border-color: rgba(0, 229, 255, 0.45);
            background: rgba(0, 229, 255, 0.1);
            color: #67e8f9;
        }

        /* 音符種類切換 (Segmented Control) */
        .tgm-seg-control {
            display: flex;
            background: rgba(0, 0, 0, 0.35);
            border-radius: 8px;
            padding: 3px;
            gap: 4px;
            border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .tgm-seg-btn {
            flex: 1;
            border: none;
            background: transparent;
            color: #94a3b8;
            padding: 7px 12px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.12s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .tgm-seg-btn.active {
            background: rgba(255, 255, 255, 0.14);
            color: #ffffff;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }

        /* 效果開關 (Effect Chips) */
        .tgm-effects-row {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .tgm-effect-chip {
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.04);
            color: #94a3b8;
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.15s ease;
        }

        .tgm-effect-chip:hover {
            background: rgba(255, 255, 255, 0.08);
            color: #e2e8f0;
        }

        .tgm-effect-chip.active[data-flag="f"] {
            border-color: #f59e0b;
            background: rgba(245, 158, 11, 0.15);
            color: #fbbf24;
        }

        .tgm-effect-chip.active[data-flag="m"] {
            border-color: #ef4444;
            background: rgba(239, 68, 68, 0.15);
            color: #f87171;
        }

        .tgm-effect-chip.active[data-flag="x"] {
            border-color: #3b82f6;
            background: rgba(59, 130, 246, 0.15);
            color: #60a5fa;
        }

        /* 時長設定面板 (比照 noteDurationModal 標準) */
        .tgm-duration-card {
            display: flex;
            flex-direction: column;
            gap: 12px;
            background: rgba(0, 0, 0, 0.25);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 12px;
        }

        .tgm-dur-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .tgm-tab-row {
            display: flex;
            gap: 6px;
            background: rgba(0, 0, 0, 0.35);
            padding: 3px;
            border-radius: 6px;
            width: fit-content;
        }

        .tgm-tab-btn {
            border: none;
            background: transparent;
            color: #94a3b8;
            padding: 5px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.12s ease;
        }

        .tgm-tab-btn.active {
            background: rgba(255, 255, 255, 0.12);
            color: #ffffff;
            font-weight: 600;
        }



        .tgm-dur-row {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .tgm-field {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .tgm-label {
            font-size: 12px;
            color: #94a3b8;
            white-space: nowrap;
        }

        .tgm-input {
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(0, 0, 0, 0.4);
            border-radius: 6px;
            color: #ffffff;
            padding: 6px 8px;
            font-size: 13px;
            font-family: inherit;
            outline: none;
            box-sizing: border-box;
            transition: border-color 0.12s ease;
        }

        .tgm-input:focus {
            border-color: #00e5ff;
        }

        .tgm-checkbox-wrapper {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            position: relative;
        }

        .tgm-checkbox {
            appearance: auto;
            -webkit-appearance: checkbox;
            width: 16px !important;
            height: 16px !important;
            accent-color: #00e5ff !important;
            cursor: pointer !important;
            margin: 0 !important;
            flex-shrink: 0 !important;
        }

        .tgm-checkbox-label {
            cursor: pointer;
            font-size: 12px;
            color: #cbd5e1;
            line-height: 1;
        }

        /* 底欄語法預覽 */
        .tgm-syntax-bar {
            background: rgba(0, 0, 0, 0.45);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            padding: 8px 12px;
            font-family: "JetBrains Mono", Consolas, monospace;
            font-size: 12px;
            color: #94a3b8;
            display: flex;
            align-items: center;
            justify-content: space-between;
            overflow-x: auto;
        }

        .tgm-syntax-val {
            color: #38bdf8;
            font-weight: bold;
        }
    `;
    document.head.appendChild(style);
}

/**
 * 解析 Hold 時長字串為結構化物件 (符合 noteDurationModal 標準)
 * @param {string} rawDur 
 */
function parseHoldDurationState(rawDur) {
    const clean = (rawDur || '4:1').replace(/[\[\]]/g, '').trim();
    const state = {
        mode: 'beat', // 'beat' | 'seconds'
        time: 4,
        beat: 1,
        holdBpm: '',
        holdSeconds: 1.0,
        holdUseHash: true
    };

    if (clean.startsWith('#')) {
        state.mode = 'seconds';
        state.holdUseHash = true;
        state.holdSeconds = parseFloat(clean.substring(1)) || 1.0;
    } else if (clean.includes('#') && clean.includes(':')) {
        state.mode = 'beat';
        const [bStr, tbStr] = clean.split('#');
        state.holdBpm = bStr;
        const [tStr, btStr] = tbStr.split(':');
        state.time = parseInt(tStr, 10) || 4;
        state.beat = parseInt(btStr, 10) || 1;
    } else if (clean.includes(':')) {
        state.mode = 'beat';
        const [tStr, btStr] = clean.split(':');
        state.time = parseInt(tStr, 10) || 4;
        state.beat = parseInt(btStr, 10) || 1;
    } else if (!isNaN(parseFloat(clean))) {
        state.mode = 'seconds';
        state.holdUseHash = false;
        state.holdSeconds = parseFloat(clean) || 1.0;
    }

    return state;
}

/**
 * 依據狀態物件組裝時長語法 (符合 noteDurationModal 標準)
 * @param {Object} state 
 * @returns {string} 例如 "4:1" 或 "#1.5" 或 "160#4:1"
 */
function buildHoldDurationString(state) {
    if (state.mode === 'seconds') {
        return state.holdUseHash ? `#${state.holdSeconds}` : `${state.holdSeconds}`;
    } else {
        const bpmPart = state.holdBpm ? `${state.holdBpm}#` : '';
        return `${bpmPart}${state.time || 4}:${state.beat || 1}`;
    }
}

/**
 * 將單個 Touch 音符物件轉為 simai 字串
 * @param {Object} item 
 * @returns {string}
 */
export function buildSingleTouchString(item) {
    if (!item || !item.pos) return '';
    const flagsArr = Array.from(item.flags || []);
    // 依序排列 flag
    const flagOrder = { f: 1, m: 2, x: 3 };
    flagsArr.sort((a, b) => (flagOrder[a] || 9) - (flagOrder[b] || 9));
    const flagsStr = flagsArr.join('');

    if (item.isHold) {
        const dur = item.duration ? item.duration.replace(/[\[\]]/g, '') : '4:1';
        return `${item.pos}h[${dur}]${flagsStr}`;
    }
    return `${item.pos}${flagsStr}`;
}

/**
 * 組合所有 Touch 音符為 simai 拍點群組片段
 * @param {Array} touchNotes 
 * @returns {string}
 */
export function buildTouchGroupString(touchNotes) {
    if (!touchNotes || touchNotes.length === 0) return '';
    return touchNotes.map(tn => buildSingleTouchString(tn)).join('/');
}

/**
 * 開啟 Touch 群組編輯對話框
 * @param {Object} options
 * @param {Object} options.note 當前選取的音符物件
 * @param {Object} options.touchGroupData 由 getNoteTouchGroup 解析出的拍點資料
 * @param {Object} options.renderer 主渲染器實例
 * @param {Object} options.settings 主設定
 * @param {Object} options.images 圖資物件
 * @param {number} options.bpm 當前拍點 BPM
 * @param {Function} options.onApply 套用回呼 ({ touchNotes }) => void
 */
export function openTouchGroupModal({
    note,
    touchGroupData,
    renderer,
    settings,
    images,
    bpm = 120,
    onApply
}) {
    ensureTouchGroupStyles();

    let modalInstance = null;
    let previewRenderer = null;

    // 複製資料以進行局部編輯
    const initialNotes = (touchGroupData?.touchNotes || []).map(tn => ({
        pos: tn.pos,
        isHold: Boolean(tn.isHold),
        duration: tn.duration || '4:1',
        flags: new Set(tn.flags || [])
    }));

    // 若原本完全沒有 Touch 音符，建立一個以目標音符為準的預設項目
    if (initialNotes.length === 0) {
        const defaultPos = note?.touchPos === 'C' ? 'C' : ((note?.touchPos && note?.pos) ? `${note.touchPos}${note.pos}` : 'C');
        initialNotes.push({
            pos: defaultPos,
            isHold: Boolean(note?.isHold),
            duration: '4:1',
            flags: new Set()
        });
    }

    let touchNotes = initialNotes;
    let activeIndex = Math.min(touchGroupData?.initialSelectedIndex ?? 0, touchNotes.length - 1);
    if (activeIndex < 0) activeIndex = 0;
    let selectedZone = touchNotes[activeIndex]?.pos ? (touchNotes[activeIndex].pos === 'C' ? 'C' : touchNotes[activeIndex].pos[0]) : 'C';

    const container = document.createElement('div');
    container.className = 'tgm-container';

    // 1. 置頂機台即時預覽區
    const previewContainer = document.createElement('div');
    previewContainer.className = 'tgm-preview-sticky';
    previewContainer.innerHTML = `
        <canvas id="tgm-preview-canvas" class="tgm-preview-canvas" width="240" height="240"></canvas>
    `;
    container.appendChild(previewContainer);

    // 2. 可滾動操作內容區
    const scrollBody = document.createElement('div');
    scrollBody.className = 'tgm-scroll-body';
    container.appendChild(scrollBody);

    // 3. 底部語法條
    const syntaxBar = document.createElement('div');
    syntaxBar.className = 'tgm-syntax-bar';
    container.appendChild(syntaxBar);

    /**
     * 初始化主渲染器實例供預覽窗專用 (全面關閉判定顯示)
     */
    function initPreviewRenderer() {
        const previewCanvas = container.querySelector('#tgm-preview-canvas');
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
        previewRenderer.resize(240, 240, dpr, true);
    }

    /**
     * 呼叫主渲染器繪製當前 Touch 群組真實機台預覽
     */
    function updateRendererPreview() {
        if (!previewRenderer) return;

        const previewCanvas = container.querySelector('#tgm-preview-canvas');
        if (previewCanvas) {
            const dpr = window.devicePixelRatio || 1;
            previewRenderer.resize(240, 240, dpr, true);
        }

        const groupSimaiStr = buildTouchGroupString(touchNotes);
        // 前方加入一拍空拍 (120){4}, 使 Touch 音符落在 time = 0.5s 上，確保在正的時間軸上
        const fullSimai = groupSimaiStr ? `(120){4},${groupSimaiStr},` : `(120){4},`;
        let decoded = null;

        try {
            decoded = simaiDecode(fullSimai, 0);
        } catch (e) {
            console.warn('Decode touch group error:', e);
        }

        const touchBucket = decoded?.notes?.filter(n => n.type === 'touch' || Boolean(n.touchPos)) || [];
        const firstNoteTime = touchBucket[0]?.time ?? 0.5;
        // 將 globalTime 校準至判定前夕 0.08 秒，使四枚箭頭精確聚焦於中心點，避免 noteT <= 0 觸發隱藏
        const previewTime = firstNoteTime - 0.08;

        // 繪製機台預覽 (無任何 CRITICAL PERFECT 判定干擾)
        previewRenderer.drawFrame({
            globalTime: previewTime,
            buckets: {
                slide: [],
                tapnhold: [],
                touch: touchBucket
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
     * 更新底部語法條文字
     */
    function updateSyntaxBar() {
        const groupStr = buildTouchGroupString(touchNotes);
        syntaxBar.innerHTML = `
            <span>群組語法預覽:</span>
            <span class="tgm-syntax-val">${groupStr || '(無音符)'}</span>
        `;
    }

    /**
     * 重新繪製整個介面與機台預覽
     */
    function renderUI() {
        if (activeIndex >= touchNotes.length) {
            activeIndex = Math.max(0, touchNotes.length - 1);
        }

        const currentItem = touchNotes[activeIndex] || null;
        if (currentItem) {
            selectedZone = currentItem.pos === 'C' ? 'C' : currentItem.pos[0];
        }

        // 解析當前音符的時長狀態
        const durState = parseHoldDurationState(currentItem?.duration);

        scrollBody.innerHTML = `
            <!-- 卡片 1: 音符列表管理 (增減音符) -->
            <div class="tgm-card">
                <div class="tgm-card-title">
                    <div class="tgm-card-title-left">
                        <span>Touch 群組音符列表 (${touchNotes.length})</span>
                    </div>
                    <button type="button" class="tgm-btn-add" id="tgm-add-note-btn">
                        <span>＋ 新增音符</span>
                    </button>
                </div>
                <div class="tgm-notes-row">
                    ${touchNotes.map((tn, idx) => {
                        const isActive = (idx === activeIndex);
                        const label = tn.pos + (tn.isHold ? ' [Hold]' : '') + (tn.flags.has('f') ? ' [花火]' : '') + (tn.flags.has('m') ? ' [地雷]' : '');
                        return `
                            <div class="tgm-note-chip ${isActive ? 'active' : ''}" data-index="${idx}">
                                <span>${label}</span>
                                <button type="button" class="tgm-chip-del-btn" data-del-index="${idx}" title="刪除此音符">✕</button>
                            </div>
                        `;
                    }).join('')}
                    ${touchNotes.length === 0 ? '<div style="color: #64748b; font-size: 12px;">此拍點目前無 Touch 音符，點擊「新增音符」或點擊下方感應區新增</div>' : ''}
                </div>
            </div>

            <!-- 卡片 2: 感應區位置選擇 (組合式: 先選區再選位，寫 A B C D E 就好) -->
            <div class="tgm-card">
                <div class="tgm-card-title">
                    <div class="tgm-card-title-left">
                        <span>感應區位置選擇</span>
                    </div>
                    <span style="font-size: 11px; color: #94a3b8;">當前位置: ${currentItem ? currentItem.pos : '-'}</span>
                </div>
                <div class="tgm-comb-container">
                    <!-- 選區: A B C D E -->
                    <div class="tgm-comb-row">
                        <span class="tgm-comb-label">區</span>
                        <div class="tgm-comb-btn-group">
                            ${['A', 'B', 'C', 'D', 'E'].map(z => {
                                const isAct = (z === selectedZone);
                                return `<button type="button" class="tgm-comb-btn ${isAct ? 'active' : ''}" data-zone="${z}">${z}</button>`;
                            }).join('')}
                        </div>
                    </div>

                    <!-- 選位: 若選 C 則顯示 C，若選 A/B/D/E 則顯示 1-8 -->
                    <div class="tgm-comb-row">
                        <span class="tgm-comb-label">位</span>
                        <div class="tgm-comb-btn-group">
                            ${selectedZone === 'C' ? `
                                ${(() => {
                                    const isAct = currentItem?.pos === 'C';
                                    const hasNote = touchNotes.some(t => t.pos === 'C');
                                    return `<button type="button" class="tgm-comb-btn ${isAct ? 'active' : ''} ${hasNote ? 'has-note' : ''}" data-fullpos="C">C</button>`;
                                })()}
                            ` : `
                                ${[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
                                    const fullPos = `${selectedZone}${num}`;
                                    const isAct = (currentItem?.pos === fullPos);
                                    const hasNote = touchNotes.some(t => t.pos === fullPos);
                                    return `<button type="button" class="tgm-comb-btn ${isAct ? 'active' : ''} ${hasNote ? 'has-note' : ''}" data-fullpos="${fullPos}">${num}</button>`;
                                }).join('')}
                            `}
                        </div>
                    </div>
                </div>
            </div>

            ${currentItem ? `
                <!-- 卡片 3: 當前音符屬性 (種類與效果) -->
                <div class="tgm-card">
                    <div class="tgm-card-title">
                        <div class="tgm-card-title-left">
                            <span>音符種類與效果 (${currentItem.pos})</span>
                        </div>
                    </div>
                    
                    <!-- 種類切換 Segmented Control -->
                    <div class="tgm-seg-control">
                        <button type="button" class="tgm-seg-btn ${!currentItem.isHold ? 'active' : ''}" id="tgm-type-touch">
                            <span>普通 Touch</span>
                        </button>
                        <button type="button" class="tgm-seg-btn ${currentItem.isHold ? 'active' : ''}" id="tgm-type-hold">
                            <span>Touch Hold</span>
                        </button>
                    </div>

                    <!-- 效果旗標 Chips -->
                    <div class="tgm-effects-row">
                        <button type="button" class="tgm-effect-chip ${currentItem.flags.has('f') ? 'active' : ''}" data-flag="f">
                            <span>花火 (Hanabi / f)</span>
                        </button>
                        <button type="button" class="tgm-effect-chip ${currentItem.flags.has('m') ? 'active' : ''}" data-flag="m">
                            <span>地雷 (Mine / m)</span>
                        </button>
                        <button type="button" class="tgm-effect-chip ${currentItem.flags.has('x') ? 'active' : ''}" data-flag="x">
                            <span>EX 判定 (x)</span>
                        </button>
                    </div>

                    <!-- TouchHold 時長面板 (比照 noteDurationModal 標準規格) -->
                    ${currentItem.isHold ? `
                        <div class="tgm-duration-card">
                            <div class="tgm-dur-header">
                                <div class="tgm-tab-row">
                                    <button type="button" class="tgm-tab-btn ${durState.mode === 'beat' ? 'active' : ''}" id="tgm-dur-mode-beat">節拍模式</button>
                                    <button type="button" class="tgm-tab-btn ${durState.mode === 'seconds' ? 'active' : ''}" id="tgm-dur-mode-seconds">直接秒數</button>
                                </div>
                            </div>

                            ${durState.mode === 'beat' ? `
                                <div class="tgm-dur-row">
                                    <div class="tgm-field">
                                        <input type="number" class="tgm-input" id="tgm-dur-time" value="${durState.time}" min="1" max="128" style="width: 55px; text-align: center;">
                                        <span class="tgm-label">切分 ×</span>
                                        <input type="number" class="tgm-input" id="tgm-dur-beat" value="${durState.beat}" min="1" max="512" style="width: 55px; text-align: center;">
                                        <span class="tgm-label">個</span>
                                    </div>
                                    <div class="tgm-field" style="margin-left: auto;">
                                        <span class="tgm-label">指定 BPM (選填)：</span>
                                        <input type="number" class="tgm-input" id="tgm-dur-bpm" value="${durState.holdBpm}" step="0.1" style="width: 80px; text-align: center;" placeholder="當前 BPM">
                                    </div>
                                </div>
                            ` : `
                                <div class="tgm-dur-row">
                                    <div class="tgm-field">
                                        <span class="tgm-label">持續秒數：</span>
                                        <input type="number" class="tgm-input" id="tgm-dur-seconds" value="${durState.holdSeconds}" step="0.001" min="0.001" style="width: 90px; text-align: center;">
                                        <span class="tgm-label">秒</span>
                                    </div>
                                    <div class="tgm-checkbox-wrapper" style="margin-left: auto;">
                                        <input type="checkbox" id="tgm-dur-hash" class="tgm-checkbox" ${durState.holdUseHash ? 'checked' : ''}>
                                        <label for="tgm-dur-hash" class="tgm-checkbox-label">附加 # 前綴 (如 [#1.5])</label>
                                    </div>
                                </div>
                            `}
                        </div>
                    ` : ''}
                </div>
            ` : ''}
        `;

        bindEvents();
        updateSyntaxBar();
        updateRendererPreview();
    }

    /**
     * 綁定互動事件
     */
    function bindEvents() {
        function applyPosition(targetPos) {
            const existingIdx = touchNotes.findIndex(t => t.pos === targetPos);
            if (existingIdx !== -1) {
                activeIndex = existingIdx;
                selectedZone = targetPos === 'C' ? 'C' : targetPos[0];
                renderUI();
                return;
            }

            if (touchNotes[activeIndex]) {
                touchNotes[activeIndex].pos = targetPos;
                selectedZone = targetPos === 'C' ? 'C' : targetPos[0];
            } else {
                touchNotes.push({
                    pos: targetPos,
                    isHold: false,
                    duration: '4:1',
                    flags: new Set()
                });
                activeIndex = 0;
                selectedZone = targetPos === 'C' ? 'C' : targetPos[0];
            }
            renderUI();
        }

        // 1. 切換音符選取
        scrollBody.querySelectorAll('.tgm-note-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                if (e.target.closest('.tgm-chip-del-btn')) return;
                const idx = parseInt(chip.getAttribute('data-index'), 10);
                if (!isNaN(idx) && idx !== activeIndex) {
                    activeIndex = idx;
                    if (touchNotes[activeIndex]) {
                        selectedZone = touchNotes[activeIndex].pos === 'C' ? 'C' : touchNotes[activeIndex].pos[0];
                    }
                    renderUI();
                }
            });
        });

        // 2. 刪除音符
        scrollBody.querySelectorAll('.tgm-chip-del-btn').forEach(delBtn => {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(delBtn.getAttribute('data-del-index'), 10);
                if (!isNaN(idx)) {
                    touchNotes.splice(idx, 1);
                    if (activeIndex >= touchNotes.length) {
                        activeIndex = Math.max(0, touchNotes.length - 1);
                    }
                    if (touchNotes[activeIndex]) {
                        selectedZone = touchNotes[activeIndex].pos === 'C' ? 'C' : touchNotes[activeIndex].pos[0];
                    }
                    renderUI();
                }
            });
        });

        // 3. 新增音符按鈕
        const addNoteBtn = scrollBody.querySelector('#tgm-add-note-btn');
        if (addNoteBtn) {
            addNoteBtn.addEventListener('click', () => {
                const used = new Set(touchNotes.map(t => t.pos));
                const nextPos = ALL_TOUCH_POSITIONS.find(p => !used.has(p)) || 'C';
                touchNotes.push({
                    pos: nextPos,
                    isHold: false,
                    duration: '4:1',
                    flags: new Set()
                });
                activeIndex = touchNotes.length - 1;
                selectedZone = nextPos === 'C' ? 'C' : nextPos[0];
                renderUI();
            });
        }

        // 4. 點選選區按鈕 (A B C D E)
        scrollBody.querySelectorAll('[data-zone]').forEach(zoneBtn => {
            zoneBtn.addEventListener('click', () => {
                const z = zoneBtn.getAttribute('data-zone');
                if (!z) return;
                selectedZone = z;
                const curItem = touchNotes[activeIndex];
                if (z === 'C') {
                    applyPosition('C');
                } else {
                    if (curItem && curItem.pos !== 'C') {
                        const curNum = curItem.pos.slice(1);
                        applyPosition(`${z}${curNum || 1}`);
                    } else if (curItem && curItem.pos === 'C') {
                        applyPosition(`${z}1`);
                    } else {
                        renderUI();
                    }
                }
            });
        });

        // 5. 點選選位按鈕 (1-8 或 C)
        scrollBody.querySelectorAll('[data-fullpos]').forEach(posBtn => {
            posBtn.addEventListener('click', () => {
                const fullPos = posBtn.getAttribute('data-fullpos');
                if (!fullPos) return;
                applyPosition(fullPos);
            });
        });

        // 6. 種類切換
        const typeTouchBtn = scrollBody.querySelector('#tgm-type-touch');
        const typeHoldBtn = scrollBody.querySelector('#tgm-type-hold');
        if (typeTouchBtn && touchNotes[activeIndex]) {
            typeTouchBtn.addEventListener('click', () => {
                if (touchNotes[activeIndex].isHold) {
                    touchNotes[activeIndex].isHold = false;
                    renderUI();
                }
            });
        }
        if (typeHoldBtn && touchNotes[activeIndex]) {
            typeHoldBtn.addEventListener('click', () => {
                if (!touchNotes[activeIndex].isHold) {
                    touchNotes[activeIndex].isHold = true;
                    if (!touchNotes[activeIndex].duration) {
                        touchNotes[activeIndex].duration = '4:1';
                    }
                    renderUI();
                }
            });
        }

        // 7. 效果旗標切換
        scrollBody.querySelectorAll('.tgm-effect-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const flag = chip.getAttribute('data-flag');
                if (!flag || !touchNotes[activeIndex]) return;

                const flags = touchNotes[activeIndex].flags;
                if (flags.has(flag)) {
                    flags.delete(flag);
                } else {
                    flags.add(flag);
                }
                renderUI();
            });
        });

        // 8. TouchHold 時長切換模式與數值輸入 (noteDurationModal 規格)
        const curItem = touchNotes[activeIndex];
        if (curItem && curItem.isHold) {
            const durState = parseHoldDurationState(curItem.duration);

            const modeBeatBtn = scrollBody.querySelector('#tgm-dur-mode-beat');
            const modeSecBtn = scrollBody.querySelector('#tgm-dur-mode-seconds');

            if (modeBeatBtn) {
                modeBeatBtn.addEventListener('click', () => {
                    if (durState.mode !== 'beat') {
                        durState.mode = 'beat';
                        curItem.duration = buildHoldDurationString(durState);
                        renderUI();
                    }
                });
            }

            if (modeSecBtn) {
                modeSecBtn.addEventListener('click', () => {
                    if (durState.mode !== 'seconds') {
                        durState.mode = 'seconds';
                        curItem.duration = buildHoldDurationString(durState);
                        renderUI();
                    }
                });
            }

            // 節拍模式輸入框
            const timeInput = scrollBody.querySelector('#tgm-dur-time');
            const beatInput = scrollBody.querySelector('#tgm-dur-beat');
            const bpmInput = scrollBody.querySelector('#tgm-dur-bpm');

            const handleBeatChange = () => {
                if (timeInput) durState.time = parseInt(timeInput.value, 10) || 4;
                if (beatInput) durState.beat = parseInt(beatInput.value, 10) || 1;
                if (bpmInput) durState.holdBpm = bpmInput.value.trim();
                curItem.duration = buildHoldDurationString(durState);
                updateSyntaxBar();
                updateRendererPreview();
            };

            if (timeInput) timeInput.addEventListener('input', handleBeatChange);
            if (beatInput) beatInput.addEventListener('input', handleBeatChange);
            if (bpmInput) bpmInput.addEventListener('input', handleBeatChange);

            // 秒數模式輸入框
            const secInput = scrollBody.querySelector('#tgm-dur-seconds');
            const hashCheckbox = scrollBody.querySelector('#tgm-dur-hash');

            const handleSecChange = () => {
                if (secInput) durState.holdSeconds = parseFloat(secInput.value) || 1.0;
                if (hashCheckbox) durState.holdUseHash = hashCheckbox.checked;
                curItem.duration = buildHoldDurationString(durState);
                updateSyntaxBar();
                updateRendererPreview();
            };

            if (secInput) secInput.addEventListener('input', handleSecChange);
            if (hashCheckbox) hashCheckbox.addEventListener('change', handleSecChange);
        }
    }

    modalInstance = popupWindow({
        title: '編輯 Touch 群組',
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
                    if (typeof onApply === 'function') {
                        onApply({ touchNotes });
                    }
                    modalInstance?.close();
                    simpleToast({ content: '已成功套用 Touch 群組', type: 'success', timeout: 1200 });
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
