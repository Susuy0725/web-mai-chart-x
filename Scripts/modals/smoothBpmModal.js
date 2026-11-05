/**
 * smoothBpmModal.js
 * 
 * 平滑變速產生器 (Smooth BPM) 彈窗元件
 * 包含彈窗內獨立的高效能 Preview 畫布時間軸，支援直接在彈窗內點擊與拖曳選取時段，
 * 算出後即可一鍵或按下 Enter 直接帶入譜面。
 */

import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';
import { getAudioWaveformPeaks } from '../renderer.js';
import {
    generateSmoothBpmByDuration,
    getActiveBpmAtTime,
    getNextBpmAfterTime,
    getActiveDivisionAtTime,
    applySmoothBpmToChart
} from '../features/smoothBpm.js';

function ensureSmoothBpmModalStyles() {
    const styleId = 'wmc-smooth-bpm-modal-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .sbm-container {
            display: flex;
            flex-direction: column;
            gap: 10px;
            color: var(--popup-text-main, #e2e8f0);
            font-family: "Plus Jakarta Sans", "Noto Sans TC", sans-serif;
            font-size: 13px;
            max-width: 580px;
            width: 100%;
            box-sizing: border-box;
            user-select: none;
            -webkit-user-select: none;
        }

        .sbm-card {
            background: rgba(255, 255, 255, 0.035);
            border: 1px solid var(--popup-border, rgba(255, 255, 255, 0.08));
            border-radius: 10px;
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .sbm-header-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }

        .sbm-section-title {
            font-weight: 600;
            font-size: 12.5px;
            color: #f1f5f9;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .sbm-badge {
            background: rgba(0, 229, 255, 0.12);
            color: #00e5ff;
            border: 1px solid rgba(0, 229, 255, 0.3);
            border-radius: 6px;
            padding: 2px 8px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.3px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        /* Preview Canvas Container */
        .sbm-preview-wrapper {
            position: relative;
            width: 100%;
            background: #090d16;
            border: 1px solid rgba(0, 229, 255, 0.25);
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .sbm-preview-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(0, 0, 0, 0.4);
            padding: 4px 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            font-size: 11px;
        }

        .sbm-preview-tools-left,
        .sbm-preview-tools-right {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .sbm-tool-btn {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #cbd5e1;
            border-radius: 4px;
            padding: 2px 6px;
            font-size: 11px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 3px;
            transition: all 0.12s ease;
        }

        .sbm-tool-btn:hover {
            background: rgba(0, 229, 255, 0.18);
            border-color: rgba(0, 229, 255, 0.4);
            color: #fff;
        }

        .sbm-tool-btn.active {
            background: #00bcd4;
            color: #000;
            font-weight: 600;
            border-color: #00e5ff;
        }

        .sbm-canvas-box {
            position: relative;
            width: 100%;
            height: 110px;
            background: #060911;
            cursor: crosshair;
        }

        .sbm-canvas-box canvas {
            display: block;
            width: 100%;
            height: 100%;
        }

        .sbm-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .sbm-field {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .sbm-field-label {
            font-size: 11px;
            color: var(--popup-text-muted, #94a3b8);
            font-weight: 500;
        }

        .sbm-input {
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid var(--popup-border, rgba(255, 255, 255, 0.12));
            color: #fff;
            border-radius: 6px;
            padding: 5px 8px;
            font-size: 12.5px;
            outline: none;
            transition: border-color 0.15s, box-shadow 0.15s;
            box-sizing: border-box;
            width: 100%;
        }

        .sbm-input:focus {
            border-color: #00e5ff;
            box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.2);
        }

        .sbm-pills-row {
            display: flex;
            gap: 5px;
            flex-wrap: wrap;
        }

        .sbm-pill-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #cbd5e1;
            border-radius: 5px;
            padding: 2px 7px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.12s ease;
            user-select: none;
        }

        .sbm-pill-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            color: #fff;
        }

        .sbm-pill-btn.active {
            background: #00bcd4;
            color: #000;
            font-weight: 600;
            border-color: #00e5ff;
        }

        .sbm-checkbox-label {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            font-size: 11.5px;
            color: #cbd5e1;
        }

        .sbm-checkbox-label input {
            accent-color: #00bcd4;
            cursor: pointer;
        }

        .sbm-stat-box {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            background: rgba(0, 0, 0, 0.25);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            padding: 6px 10px;
            text-align: center;
        }

        .sbm-stat-item {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .sbm-stat-val {
            font-size: 13px;
            font-weight: 700;
            color: #00e5ff;
            font-family: monospace;
        }

        .sbm-stat-sub {
            font-size: 10px;
            color: #94a3b8;
        }

        .sbm-code-container {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .sbm-code-box {
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            padding: 6px 8px;
            font-family: Consolas, "Fira Code", monospace;
            font-size: 11px;
            color: #7dd3fc;
            max-height: 58px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
            user-select: text;
            -webkit-user-select: text;
        }

        .sbm-radio-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .sbm-radio-label {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            font-size: 11.5px;
            color: #e2e8f0;
        }

        .sbm-radio-label input {
            accent-color: #00bcd4;
            cursor: pointer;
        }

        .sbm-tip {
            font-size: 10.5px;
            color: #64748b;
            line-height: 1.4;
        }
    `;
    document.head.appendChild(style);
}

/**
 * 開啟平滑變速彈窗（內建獨立 Preview 畫布，支援點擊與拖曳選取）
 */
export function openSmoothBpmModal(options = {}) {
    ensureSmoothBpmModalStyles();

    const {
        initialTime = 0,
        decodedTags = [],
        clockBpm = 120,
        dataIndexToTime = [],
        audioBuffer = null,
        musicDelay = 0,
        editorInput,
        findCommaCharIndex,
        updateEditorAndSave,
        onClose,
        simpleToast: toastFn = simpleToast,
        t: i18nFn = t
    } = options;

    // 初始時間範圍：以 initialTime 為起點，向後預設 2 秒（或前一個拍點至後一個拍點）
    let selStart = Math.max(0, initialTime);
    let selEnd = selStart + 2.0;

    // 偵測預設值
    let currentStartBpm = getActiveBpmAtTime(selStart, decodedTags, clockBpm);
    const candidateNextBpm = getNextBpmAfterTime(selEnd, decodedTags);
    let currentEndBpm = candidateNextBpm !== null ? candidateNextBpm : currentStartBpm;
    let currentDivision = 64;
    let isRestoreDivChecked = true;
    let currentRestoreDiv = getActiveDivisionAtTime(selEnd, decodedTags, 4);
    let currentInsertMode = 'start'; // 'start' | 'replace' | 'cursor'

    let durationSec = Math.max(0.001, selEnd - selStart);
    let computedResult = generateSmoothBpmByDuration(currentStartBpm, currentEndBpm, durationSec, currentDivision);

    const container = document.createElement('div');
    container.className = 'sbm-container';

    // 1. 卡片一：彈窗專屬 Preview 畫布
    const cardPreview = document.createElement('div');
    cardPreview.className = 'sbm-card';
    cardPreview.innerHTML = `
        <div class="sbm-header-row">
            <span class="sbm-section-title">
                <span class="material-symbols-outlined" style="font-size:17px; color:#00e5ff;">graphic_eq</span>
                ${i18nFn('smoothBpm.previewSelectTitle') || '時間軸預覽 (點擊或拖曳選取時段)'}
            </span>
            <span class="sbm-badge" id="sbmRangeBadge">
                Δ ${(durationSec).toFixed(3)}s
            </span>
        </div>
        <div class="sbm-preview-wrapper">
            <div class="sbm-preview-toolbar">
                <div class="sbm-preview-tools-left">
                    <button type="button" class="sbm-tool-btn" id="sbmZoomOut" title="縮小視野">-</button>
                    <button type="button" class="sbm-tool-btn" id="sbmZoomIn" title="放大視野">+</button>
                    <button type="button" class="sbm-tool-btn" id="sbmFitRange" title="將視野聚焦至選取時段">🔍 置中選區</button>
                    <button type="button" class="sbm-tool-btn" id="sbmCenterPlayhead" title="定位視野至播放頭">🎯 播放頭</button>
                </div>
                <div class="sbm-preview-tools-right">
                    <button type="button" class="sbm-tool-btn" id="sbmSetStartToPlayhead" title="將選取起點設為播放頭">🚩 起點=播放頭</button>
                    <button type="button" class="sbm-tool-btn" id="sbmSetEndToPlayhead" title="將選取終點設為播放頭">🏁 終點=播放頭</button>
                </div>
            </div>
            <div class="sbm-canvas-box" id="sbmCanvasBox">
                <canvas id="sbmCanvas"></canvas>
            </div>
        </div>
        <div class="sbm-grid-2">
            <div class="sbm-field">
                <span class="sbm-field-label">${i18nFn('smoothBpm.startSec') || '起點時間'}</span>
                <input type="number" class="sbm-input" id="sbmInputStartSec" step="0.001" min="0" value="${selStart.toFixed(3)}">
            </div>
            <div class="sbm-field">
                <span class="sbm-field-label">${i18nFn('smoothBpm.endSec') || '終點時間'}</span>
                <input type="number" class="sbm-input" id="sbmInputEndSec" step="0.001" min="0" value="${selEnd.toFixed(3)}">
            </div>
        </div>
    `;
    container.appendChild(cardPreview);

    // 2. 卡片二：速度與切分設定
    const cardParams = document.createElement('div');
    cardParams.className = 'sbm-card';
    cardParams.innerHTML = `
        <div class="sbm-header-row">
            <span class="sbm-section-title">
                <span class="material-symbols-outlined" style="font-size:17px; color:#f59e0b;">speed</span>
                ${i18nFn('smoothBpm.speedParams') || '速度與切分設定'}
            </span>
        </div>
        <div class="sbm-grid-2">
            <div class="sbm-field">
                <span class="sbm-field-label">${i18nFn('smoothBpm.startBpm') || '起始 BPM'}</span>
                <input type="number" class="sbm-input" id="sbmInputStartBpm" step="0.1" min="1" max="1000" value="${currentStartBpm}">
            </div>
            <div class="sbm-field">
                <span class="sbm-field-label">${i18nFn('smoothBpm.endBpm') || '結束 BPM'}</span>
                <input type="number" class="sbm-input" id="sbmInputEndBpm" step="0.1" min="1" max="1000" value="${currentEndBpm}">
            </div>
        </div>
        <div class="sbm-field">
            <span class="sbm-field-label">${i18nFn('smoothBpm.division') || '細分 (Division)'}</span>
            <div class="sbm-pills-row">
                ${[16, 32, 48, 64, 96, 128].map(d => `
                    <button type="button" class="sbm-pill-btn ${d === currentDivision ? 'active' : ''}" data-div="${d}">
                        {${d}}
                    </button>
                `).join('')}
                <input type="number" class="sbm-input" id="sbmInputDivCustom" min="1" max="512" value="${currentDivision}" style="width: 65px; padding: 2px 6px; font-size:12px;">
            </div>
        </div>
        <div class="sbm-header-row">
            <label class="sbm-checkbox-label">
                <input type="checkbox" id="sbmRestoreDivCheck" ${isRestoreDivChecked ? 'checked' : ''}>
                <span>${i18nFn('smoothBpm.restoreDivision') || '結束時恢復原切分'}</span>
            </label>
            <input type="text" class="sbm-input" id="sbmRestoreDivVal" value="${currentRestoreDiv}" style="width: 55px; padding: 2px 6px; font-size:11.5px; text-align:center;">
        </div>
    `;
    container.appendChild(cardParams);

    // 3. 卡片三：演算即時預覽與統計
    const cardStats = document.createElement('div');
    cardStats.className = 'sbm-card';
    cardStats.innerHTML = `
        <div class="sbm-stat-box">
            <div class="sbm-stat-item">
                <span class="sbm-stat-val" id="sbmStatSteps">${computedResult.steps}</span>
                <span class="sbm-stat-sub">${i18nFn('smoothBpm.steps') || '拍點步數'}</span>
            </div>
            <div class="sbm-stat-item">
                <span class="sbm-stat-val" id="sbmStatP">${computedResult.p.toFixed(3)}</span>
                <span class="sbm-stat-sub">${i18nFn('smoothBpm.curveP') || '曲線指數 p'}</span>
            </div>
            <div class="sbm-stat-item">
                <span class="sbm-stat-val" id="sbmStatActual">${computedResult.actualSec.toFixed(3)}s</span>
                <span class="sbm-stat-sub" id="sbmStatDiff">±0.0ms</span>
            </div>
        </div>
        <div class="sbm-code-container">
            <div class="sbm-header-row">
                <span class="sbm-field-label">${i18nFn('smoothBpm.previewCode') || '生成代碼預覽'}</span>
            </div>
            <div class="sbm-code-box" id="sbmCodeBox">${computedResult.chart}</div>
        </div>
    `;
    container.appendChild(cardStats);

    // 4. 卡片四：帶入目標位置選擇
    const cardTarget = document.createElement('div');
    cardTarget.className = 'sbm-card';
    cardTarget.innerHTML = `
        <div class="sbm-header-row">
            <span class="sbm-section-title">
                <span class="material-symbols-outlined" style="font-size:17px; color:#3b82f6;">input</span>
                ${i18nFn('smoothBpm.insertLocation') || '帶入位置'}
            </span>
        </div>
        <div class="sbm-radio-group">
            <label class="sbm-radio-label">
                <input type="radio" name="sbmInsertMode" value="start" checked>
                <span>${i18nFn('smoothBpm.insertAtStart') || '自動插入至選取起點時間處'} (${selStart.toFixed(2)}s)</span>
            </label>
            <label class="sbm-radio-label">
                <input type="radio" name="sbmInsertMode" value="replace">
                <span>${i18nFn('smoothBpm.replaceRange') || '替換選取時段內的拍點逗號'}</span>
            </label>
            <label class="sbm-radio-label">
                <input type="radio" name="sbmInsertMode" value="cursor">
                <span>${i18nFn('smoothBpm.insertAtCursor') || '插入至目前文字編輯器游標處'}</span>
            </label>
        </div>
        <div class="sbm-tip">
            💡 ${i18nFn('smoothBpm.enterKeyTip') || '按鍵盤 Enter 鍵即可直接帶入；亦可使用 Ctrl+Z 隨時復原。'}
        </div>
    `;
    container.appendChild(cardTarget);

    // ==========================================
    // Popup 內建 Preview 畫布渲染與手柄互動引擎
    // ==========================================
    const canvas = container.querySelector('#sbmCanvas');
    const canvasBox = container.querySelector('#sbmCanvasBox');
    const ctx = canvas.getContext('2d');

    // 視角參數：中心時間與每秒像素 (zoom)
    let viewZoom = 120; // 1 秒 = 120px
    let viewCenterTime = (selStart + selEnd) * 0.5;

    // 拖曳狀態：'none' | 'drag-new' | 'handle-start' | 'handle-end' | 'pan-selection' | 'pan-view'
    let dragMode = 'none';
    let dragStartX = 0;
    let dragStartTime = 0;
    let initialSelStart = selStart;
    let initialSelEnd = selEnd;
    let isPointerDown = false;
    let hasMoved = false;

    // 時間 <-> X 座標換算
    const timeToX = (time, w) => {
        const hw = w * 0.5;
        return hw + (time - viewCenterTime) * viewZoom;
    };

    const xToTime = (x, w) => {
        const hw = w * 0.5;
        return viewCenterTime + (x - hw) / viewZoom;
    };

    // 繪製 Preview 畫布
    const redrawPreview = () => {
        if (!canvas || !ctx) return;
        const rect = canvasBox.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(rect.width * dpr);
        const h = Math.round(rect.height * dpr);

        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }

        ctx.clearRect(0, 0, w, h);

        const leftTime = xToTime(0, w);
        const rightTime = xToTime(w, w);
        const viewDur = rightTime - leftTime;

        // 1. 繪製音訊波形 (若有 buffer)
        if (audioBuffer) {
            const wavePeaks = getAudioWaveformPeaks(audioBuffer);
            if (wavePeaks) {
                const { peaks, rate: bucketRate, duration: audioDur } = wavePeaks;
                const totalBuckets = peaks.length;
                const gt = leftTime - musicDelay;
                const waveH = h * 0.35;
                const midY = h * 0.55;

                ctx.save();
                ctx.lineWidth = 2 * dpr;
                ctx.strokeStyle = 'rgba(74, 144, 226, 0.35)';
                ctx.beginPath();

                const stepPx = 2 * dpr;
                for (let px = 0; px <= w; px += stepPx) {
                    const t = leftTime + (px / w) * viewDur - musicDelay;
                    if (t < 0 || t > audioDur) continue;
                    const b = Math.floor(t * bucketRate);
                    if (b >= 0 && b < totalBuckets) {
                        const peak = peaks[b];
                        if (peak > 0.002) {
                            const ph = peak * waveH;
                            ctx.moveTo(px, midY - ph);
                            ctx.lineTo(px, midY + ph);
                        }
                    }
                }
                ctx.stroke();
                ctx.restore();
            }
        }

        // 2. 繪製時間網格與刻度
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillStyle = '#64748b';
        ctx.font = `${Math.round(10 * dpr)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // 依據 zoom 動態決定秒數刻度間隔
        let gridStep = 1.0;
        if (viewZoom > 250) gridStep = 0.25;
        else if (viewZoom > 120) gridStep = 0.5;
        else if (viewZoom < 50) gridStep = 2.0;

        const firstGrid = Math.floor(leftTime / gridStep) * gridStep;
        for (let gt = firstGrid; gt <= rightTime; gt += gridStep) {
            const gx = timeToX(gt, w);
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, h);
            ctx.stroke();
            if (gt >= 0) {
                ctx.fillText(`${gt.toFixed(gridStep < 1 ? 2 : 1)}s`, gx, 3 * dpr);
            }
        }
        ctx.restore();

        // 3. 繪製 BPM 標籤（黃線）與切分線（灰白線）
        if (decodedTags && decodedTags.length > 0) {
            ctx.save();
            for (let i = 0; i < decodedTags.length; i++) {
                const tag = decodedTags[i];
                if (tag.time >= leftTime - 0.1 && tag.time <= rightTime + 0.1) {
                    const tx = timeToX(tag.time, w);
                    if (tag.type === 'bpm') {
                        ctx.strokeStyle = '#eab308';
                        ctx.lineWidth = 1.5 * dpr;
                        ctx.beginPath();
                        ctx.moveTo(tx, 14 * dpr);
                        ctx.lineTo(tx, h);
                        ctx.stroke();

                        ctx.fillStyle = '#eab308';
                        ctx.font = `bold ${Math.round(9.5 * dpr)}px sans-serif`;
                        ctx.textAlign = 'left';
                        ctx.fillText(`(${tag.value})`, tx + 2 * dpr, 14 * dpr);
                    } else if (tag.type === 'split') {
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                        ctx.lineWidth = 1 * dpr;
                        ctx.beginPath();
                        ctx.moveTo(tx, 14 * dpr);
                        ctx.lineTo(tx, h);
                        ctx.stroke();
                    }
                }
            }
            ctx.restore();
        }

        // 4. 繪製選取時段高亮區域 [selStart, selEnd]
        const sTime = Math.min(selStart, selEnd);
        const eTime = Math.max(selStart, selEnd);
        const sx = timeToX(sTime, w);
        const ex = timeToX(eTime, w);

        const drawLeft = Math.max(0, sx);
        const drawRight = Math.min(w, ex);
        const drawW = drawRight - drawLeft;

        if (drawW > 0) {
            ctx.save();
            // 半透明底色
            const grad = ctx.createLinearGradient(sx, 0, ex, 0);
            grad.addColorStop(0, 'rgba(0, 229, 255, 0.32)');
            grad.addColorStop(0.5, 'rgba(0, 185, 247, 0.20)');
            grad.addColorStop(1, 'rgba(245, 158, 11, 0.28)');
            ctx.fillStyle = grad;
            ctx.fillRect(drawLeft, 0, drawW, h);

            // 中間頂部時長徽章
            const badgeW = 60 * dpr;
            const badgeH = 16 * dpr;
            const badgeX = Math.max(drawLeft, Math.min(drawRight - badgeW, (sx + ex) * 0.5 - badgeW * 0.5));
            ctx.fillStyle = 'rgba(10, 25, 45, 0.85)';
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 1 * dpr;
            ctx.beginPath();
            ctx.rect(badgeX, 18 * dpr, badgeW, badgeH);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#00e5ff';
            ctx.font = `bold ${Math.round(10 * dpr)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Δ ${(eTime - sTime).toFixed(2)}s`, badgeX + badgeW * 0.5, 18 * dpr + badgeH * 0.5);

            ctx.restore();
        }

        // 5. 繪製起點指針手柄 (Start Line & Handle)
        if (sx >= -10 && sx <= w + 10) {
            ctx.save();
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 2 * dpr;
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, h);
            ctx.stroke();

            // 頂部起點旗標
            ctx.fillStyle = '#00e5ff';
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx + 10 * dpr, 6 * dpr);
            ctx.lineTo(sx, 12 * dpr);
            ctx.closePath();
            ctx.fill();

            ctx.font = `bold ${Math.round(9 * dpr)}px sans-serif`;
            ctx.fillStyle = '#00e5ff';
            ctx.textAlign = 'right';
            ctx.fillText(`${sTime.toFixed(2)}s`, sx - 3 * dpr, 10 * dpr);
            ctx.restore();
        }

        // 6. 繪製終點指針手柄 (End Line & Handle)
        if (ex >= -10 && ex <= w + 10) {
            ctx.save();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2 * dpr;
            ctx.beginPath();
            ctx.moveTo(ex, 0);
            ctx.lineTo(ex, h);
            ctx.stroke();

            // 頂部終點旗標
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.moveTo(ex, 0);
            ctx.lineTo(ex - 10 * dpr, 6 * dpr);
            ctx.lineTo(ex, 12 * dpr);
            ctx.closePath();
            ctx.fill();

            ctx.font = `bold ${Math.round(9 * dpr)}px sans-serif`;
            ctx.fillStyle = '#f59e0b';
            ctx.textAlign = 'left';
            ctx.fillText(`${eTime.toFixed(2)}s`, ex + 3 * dpr, 10 * dpr);
            ctx.restore();
        }

        // 7. 繪製播放頭位置 (紅線)
        if (initialTime >= leftTime && initialTime <= rightTime) {
            const hx = timeToX(initialTime, w);
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.5 * dpr;
            ctx.beginPath();
            ctx.moveTo(hx, 0);
            ctx.lineTo(hx, h);
            ctx.stroke();

            // 頂部倒三角
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.moveTo(hx - 5 * dpr, 0);
            ctx.lineTo(hx + 5 * dpr, 0);
            ctx.lineTo(hx, 6 * dpr);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    };

    // UI 計算與輸入框聯動更新
    const updateCalculations = () => {
        const s = Math.min(selStart, selEnd);
        const e = Math.max(selStart, selEnd);
        durationSec = Math.max(0.001, e - s);

        computedResult = generateSmoothBpmByDuration(currentStartBpm, currentEndBpm, durationSec, currentDivision);

        const elBadge = container.querySelector('#sbmRangeBadge');
        const elInpStart = container.querySelector('#sbmInputStartSec');
        const elInpEnd = container.querySelector('#sbmInputEndSec');
        const elSteps = container.querySelector('#sbmStatSteps');
        const elP = container.querySelector('#sbmStatP');
        const elActual = container.querySelector('#sbmStatActual');
        const elDiff = container.querySelector('#sbmStatDiff');
        const elCodeBox = container.querySelector('#sbmCodeBox');

        if (elBadge) elBadge.textContent = `Δ ${durationSec.toFixed(3)}s`;
        if (elInpStart && document.activeElement !== elInpStart) elInpStart.value = s.toFixed(3);
        if (elInpEnd && document.activeElement !== elInpEnd) elInpEnd.value = e.toFixed(3);

        if (elSteps) elSteps.textContent = String(computedResult.steps);
        if (elP) elP.textContent = computedResult.p.toFixed(3);
        if (elActual) elActual.textContent = `${computedResult.actualSec.toFixed(3)}s`;

        const diffMs = (computedResult.actualSec - durationSec) * 1000;
        if (elDiff) {
            elDiff.textContent = `${diffMs >= 0 ? '+' : ''}${diffMs.toFixed(1)}ms`;
            elDiff.style.color = Math.abs(diffMs) < 5 ? '#4ade80' : '#f59e0b';
        }

        if (elCodeBox) {
            let codeDisplay = computedResult.chart;
            if (isRestoreDivChecked && currentRestoreDiv) {
                codeDisplay += `{${currentRestoreDiv}}`;
            }
            elCodeBox.textContent = codeDisplay;
        }
    };

    // 拍點吸附輔助
    const snapToBeat = (time) => {
        if (!dataIndexToTime || dataIndexToTime.length === 0) return time;
        for (let i = 0; i < dataIndexToTime.length; i++) {
            if (Math.abs(dataIndexToTime[i] - time) < 0.035) {
                return dataIndexToTime[i];
            }
        }
        return time;
    };

    // ==========================================
    // 畫布滑鼠與觸控事件：點擊 或 拖曳 來選擇
    // ==========================================
    const getCanvasMousePos = (e) => {
        const rect = canvasBox.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const dpr = window.devicePixelRatio || 1;
        const canvasX = clientX * dpr;
        const w = rect.width * dpr;
        const time = xToTime(canvasX, w);
        return { clientX, canvasX, w, time };
    };

    // 懸停時游標反饋
    canvasBox.addEventListener('pointermove', (e) => {
        if (isPointerDown) return;
        const { canvasX, w } = getCanvasMousePos(e);
        const sTime = Math.min(selStart, selEnd);
        const eTime = Math.max(selStart, selEnd);
        const sx = timeToX(sTime, w);
        const ex = timeToX(eTime, w);
        const dpr = window.devicePixelRatio || 1;
        const handleThreshold = 10 * dpr;

        if (Math.abs(canvasX - sx) <= handleThreshold || Math.abs(canvasX - ex) <= handleThreshold) {
            canvasBox.style.cursor = 'col-resize';
        } else if (canvasX > sx && canvasX < ex) {
            canvasBox.style.cursor = 'ew-resize';
        } else {
            canvasBox.style.cursor = 'crosshair';
        }
    });

    // 按下 pointerdown
    canvasBox.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        isPointerDown = true;
        hasMoved = false;

        const { clientX, canvasX, w, time } = getCanvasMousePos(e);
        dragStartX = clientX;
        dragStartTime = time;
        initialSelStart = selStart;
        initialSelEnd = selEnd;

        const sTime = Math.min(selStart, selEnd);
        const eTime = Math.max(selStart, selEnd);
        const sx = timeToX(sTime, w);
        const ex = timeToX(eTime, w);
        const dpr = window.devicePixelRatio || 1;
        const handleThreshold = 10 * dpr;

        // 判斷按下的區域
        if (Math.abs(canvasX - sx) <= handleThreshold) {
            dragMode = (selStart <= selEnd) ? 'handle-start' : 'handle-end';
        } else if (Math.abs(canvasX - ex) <= handleThreshold) {
            dragMode = (selStart <= selEnd) ? 'handle-end' : 'handle-start';
        } else if (canvasX > sx && canvasX < ex && !e.shiftKey) {
            dragMode = 'pan-selection';
        } else {
            // 空白處拖曳：拉出全新選取區塊
            dragMode = 'drag-new';
            const snappedTime = e.altKey ? time : snapToBeat(time);
            selStart = snappedTime;
            selEnd = snappedTime;
            redrawPreview();
        }

        try {
            canvasBox.setPointerCapture(e.pointerId);
        } catch (_) {}
    });

    // 移動 pointermove
    canvasBox.addEventListener('pointermove', (e) => {
        if (!isPointerDown) return;
        const { clientX, time } = getCanvasMousePos(e);
        const deltaPx = clientX - dragStartX;
        if (Math.abs(deltaPx) > 3) hasMoved = true;

        const targetTime = e.altKey ? time : snapToBeat(time);

        if (dragMode === 'drag-new') {
            selEnd = targetTime;
            redrawPreview();
            updateCalculations();
        } else if (dragMode === 'handle-start') {
            selStart = Math.max(0, targetTime);
            redrawPreview();
            updateCalculations();
        } else if (dragMode === 'handle-end') {
            selEnd = Math.max(0, targetTime);
            redrawPreview();
            updateCalculations();
        } else if (dragMode === 'pan-selection') {
            const deltaTime = (deltaPx / (canvasBox.clientWidth || 1)) * ((xToTime(canvas.width, canvas.width) - xToTime(0, canvas.width)));
            const dur = Math.abs(initialSelEnd - initialSelStart);
            const newStart = Math.max(0, Math.min(initialSelStart, initialSelEnd) + deltaTime);
            selStart = newStart;
            selEnd = newStart + dur;
            redrawPreview();
            updateCalculations();
        }
    });

    // 放開 pointerup
    const handlePointerUp = (e) => {
        if (!isPointerDown) return;
        isPointerDown = false;

        try {
            canvasBox.releasePointerCapture(e.pointerId);
        } catch (_) {}

        // 若為純點擊（位移 < 4px），執行點擊選取邏輯
        if (!hasMoved) {
            const { time } = getCanvasMousePos(e);
            const clickTime = e.altKey ? time : snapToBeat(time);
            const sTime = Math.min(selStart, selEnd);
            const eTime = Math.max(selStart, selEnd);

            // 若點擊靠近起點，將起點移動至點擊處；否則將終點移動至點擊處
            const distToStart = Math.abs(clickTime - sTime);
            const distToEnd = Math.abs(clickTime - eTime);

            if (distToStart < distToEnd) {
                selStart = Math.max(0, clickTime);
            } else {
                selEnd = Math.max(selStart + 0.01, clickTime);
            }
        }

        // 正規化起訖時間
        if (selStart > selEnd) {
            const tmp = selStart;
            selStart = selEnd;
            selEnd = tmp;
        }
        if (selEnd - selStart < 0.01) {
            selEnd = selStart + 0.1;
        }

        dragMode = 'none';
        redrawPreview();
        updateCalculations();
    };

    canvasBox.addEventListener('pointerup', handlePointerUp);
    canvasBox.addEventListener('pointercancel', handlePointerUp);

    // 滾輪縮放與水平視野移動
    canvasBox.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey) {
            const factor = e.deltaY > 0 ? (1 / 1.15) : 1.15;
            viewZoom = Math.max(20, Math.min(600, viewZoom * factor));
        } else {
            const deltaSec = (e.deltaY / viewZoom) * 0.4;
            viewCenterTime = Math.max(0, viewCenterTime + deltaSec);
        }
        redrawPreview();
    }, { passive: false });

    // ==========================================
    // 預覽工具列按鈕事件
    // ==========================================
    container.querySelector('#sbmZoomIn')?.addEventListener('click', () => {
        viewZoom = Math.min(600, viewZoom * 1.25);
        redrawPreview();
    });

    container.querySelector('#sbmZoomOut')?.addEventListener('click', () => {
        viewZoom = Math.max(20, viewZoom * 0.8);
        redrawPreview();
    });

    container.querySelector('#sbmFitRange')?.addEventListener('click', () => {
        const s = Math.min(selStart, selEnd);
        const e = Math.max(selStart, selEnd);
        viewCenterTime = (s + e) * 0.5;
        const dur = Math.max(0.2, e - s);
        viewZoom = Math.max(30, Math.min(400, (canvasBox.clientWidth * 0.6) / dur));
        redrawPreview();
    });

    container.querySelector('#sbmCenterPlayhead')?.addEventListener('click', () => {
        viewCenterTime = initialTime;
        redrawPreview();
    });

    container.querySelector('#sbmSetStartToPlayhead')?.addEventListener('click', () => {
        selStart = Math.max(0, initialTime);
        if (selEnd <= selStart) selEnd = selStart + 1.0;
        redrawPreview();
        updateCalculations();
    });

    container.querySelector('#sbmSetEndToPlayhead')?.addEventListener('click', () => {
        selEnd = Math.max(selStart + 0.01, initialTime);
        redrawPreview();
        updateCalculations();
    });

    // ==========================================
    // 輸入框與參數事件綁定
    // ==========================================
    const inpStartBpm = container.querySelector('#sbmInputStartBpm');
    const inpEndBpm = container.querySelector('#sbmInputEndBpm');
    const inpDivCustom = container.querySelector('#sbmInputDivCustom');
    const pillBtns = container.querySelectorAll('.sbm-pill-btn');
    const inpStartSec = container.querySelector('#sbmInputStartSec');
    const inpEndSec = container.querySelector('#sbmInputEndSec');
    const chkRestoreDiv = container.querySelector('#sbmRestoreDivCheck');
    const inpRestoreDivVal = container.querySelector('#sbmRestoreDivVal');
    const radioModes = container.querySelectorAll('input[name="sbmInsertMode"]');

    inpStartBpm?.addEventListener('input', () => {
        currentStartBpm = Math.max(0.1, parseFloat(inpStartBpm.value) || 120);
        updateCalculations();
    });

    inpEndBpm?.addEventListener('input', () => {
        currentEndBpm = Math.max(0.1, parseFloat(inpEndBpm.value) || 120);
        updateCalculations();
    });

    inpDivCustom?.addEventListener('input', () => {
        const val = parseInt(inpDivCustom.value, 10);
        if (val && val > 0) {
            currentDivision = val;
            pillBtns.forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.div, 10) === currentDivision);
            });
            updateCalculations();
        }
    });

    pillBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseInt(btn.dataset.div, 10);
            if (val) {
                currentDivision = val;
                if (inpDivCustom) inpDivCustom.value = String(val);
                pillBtns.forEach(b => b.classList.toggle('active', b === btn));
                updateCalculations();
            }
        });
    });

    inpStartSec?.addEventListener('change', () => {
        selStart = Math.max(0, parseFloat(inpStartSec.value) || 0);
        if (selEnd <= selStart) selEnd = selStart + 0.1;
        redrawPreview();
        updateCalculations();
    });

    inpEndSec?.addEventListener('change', () => {
        selEnd = Math.max(selStart + 0.01, parseFloat(inpEndSec.value) || (selStart + 0.1));
        redrawPreview();
        updateCalculations();
    });

    chkRestoreDiv?.addEventListener('change', () => {
        isRestoreDivChecked = chkRestoreDiv.checked;
        if (inpRestoreDivVal) inpRestoreDivVal.disabled = !isRestoreDivChecked;
        updateCalculations();
    });

    inpRestoreDivVal?.addEventListener('input', () => {
        currentRestoreDiv = inpRestoreDivVal.value.trim() || '4';
        updateCalculations();
    });

    radioModes.forEach(r => {
        r.addEventListener('change', () => {
            if (r.checked) currentInsertMode = r.value;
        });
    });

    let modalCtx = null;

    // 執行直接帶入動作
    const performApply = () => {
        const s = Math.min(selStart, selEnd);
        const e = Math.max(selStart, selEnd);

        const success = applySmoothBpmToChart({
            chartText: computedResult.chart,
            insertMode: currentInsertMode,
            startTime: s,
            endTime: e,
            restoreDivision: isRestoreDivChecked ? currentRestoreDiv : null,
            editorInput,
            dataIndexToTime,
            findCommaCharIndex,
            updateEditorAndSave
        });

        if (success) {
            const msg = i18nFn('smoothBpm.appliedSuccess') || '已成功帶入平滑變速！';
            toastFn({ content: msg, timeout: 1500, type: 'success' });
            if (modalCtx && typeof modalCtx.close === 'function') {
                modalCtx.close();
            }
        }
    };

    // 複製代碼動作
    const performCopy = () => {
        let code = computedResult.chart;
        if (isRestoreDivChecked && currentRestoreDiv) {
            code += `{${currentRestoreDiv}}`;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(() => {
                toastFn({ content: i18nFn('smoothBpm.copied') || '已複製代碼！', timeout: 1200, type: 'info' });
            }).catch(() => {});
        }
    };

    // 鍵盤快速鍵：按 Enter 直接帶入
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            performApply();
        }
    };
    container.addEventListener('keydown', handleKeyDown);

    // 彈出 popupWindow
    popupWindow({
        title: `🚀 ${i18nFn('smoothBpm.title') || '平滑變速產生器 (Smooth BPM)'}`,
        customContent: container,
        width: 560,
        maxWidth: 620,
        buttons: [
            {
                text: `✨ ${i18nFn('smoothBpm.apply') || '直接帶入'} (Enter)`,
                onClick: () => {
                    performApply();
                }
            },
            {
                text: `📋 ${i18nFn('smoothBpm.copy') || '複製代碼'}`,
                hideOnClick: false,
                onClick: () => {
                    performCopy();
                }
            },
            {
                text: i18nFn('smoothBpm.cancel') || '關閉',
                hideOnClick: true
            }
        ],
        onOpen: (ctx) => {
            modalCtx = ctx;
            setTimeout(() => {
                redrawPreview();
                updateCalculations();
            }, 60);
        },
        onClose: () => {
            container.removeEventListener('keydown', handleKeyDown);
            if (typeof onClose === 'function') onClose();
        }
    });
}
