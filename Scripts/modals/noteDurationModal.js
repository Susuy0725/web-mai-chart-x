/**
 * noteDurationModal.js
 * 
 * 視覺化編輯器 - 音符時長修改視窗
 * 完整支援 simai 的 Hold 與 Slide 各式時長語法：
 * - 拍數切分 [分母:分子] (如 4:1, 8:3)
 * - 指定 BPM [BPM#分母:分子] (如 160#8:3, 150#2:1)
 * - 指定劃動秒數 [BPM#秒數] (如 160#2)
 * - 自訂等候秒數 [秒數##秒數] (如 3##1.5)
 * - 自訂等候秒數與拍數 [秒數##分母:分子] (如 3##8:3)
 * - 自訂等候秒數與自訂 BPM 劃動 [秒數##BPM#分母:分子] (如 3##160#8:3)
 * - 直接秒數 Hold [#秒數] (如 #5.678)
 */

import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';

function ensureNoteDurationModalStyles() {
    const styleId = 'wmc-note-duration-modal-styles';
    let style = document.getElementById(styleId);
    if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        document.head.appendChild(style);
    }

    style.textContent = `
        .ndm-container {
            display: flex;
            flex-direction: column;
            gap: 14px;
            color: #d0d0d0;
            font-size: 13px;
            max-width: 520px;
            width: 100%;
            box-sizing: border-box;
            user-select: none;
            -webkit-user-select: none;
        }

        .ndm-section-card {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .ndm-section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 13px;
            font-weight: 600;
            color: #f1f5f9;
        }

        .ndm-section-title {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .ndm-section-title .material-symbols-outlined {
            font-size: 18px;
            color: var(--popup-accent, #00e5ff);
        }

        .ndm-tab-row {
            display: flex;
            gap: 6px;
            background: rgba(0, 0, 0, 0.3);
            padding: 3px;
            border-radius: 6px;
            width: fit-content;
        }

        .ndm-tab-btn {
            border: none;
            background: transparent;
            color: #94a3b8;
            padding: 5px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.12s ease;
        }

        .ndm-tab-btn.active {
            background: rgba(255, 255, 255, 0.12);
            color: #ffffff;
            font-weight: 600;
        }

        .ndm-row {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .ndm-field {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .ndm-label {
            font-size: 12px;
            color: #94a3b8;
            white-space: nowrap;
        }

        .ndm-input {
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(0, 0, 0, 0.4);
            border-radius: 6px;
            color: #ffffff;
            padding: 6px 8px;
            font-size: 13px;
            font-family: monospace;
            text-align: center;
            outline: none;
            box-sizing: border-box;
            transition: border-color 0.12s ease;
        }

        .ndm-input:focus {
            border-color: var(--popup-accent, #00e5ff);
        }

        .ndm-checkbox-wrapper {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            position: relative;
            z-index: 2;
        }

        .ndm-checkbox {
            appearance: auto;
            -webkit-appearance: checkbox;
            width: 17px !important;
            height: 17px !important;
            accent-color: var(--popup-accent, #00e5ff) !important;
            cursor: pointer !important;
            margin: 0 !important;
            flex-shrink: 0 !important;
            pointer-events: auto !important;
        }

        .ndm-checkbox-label {
            cursor: pointer;
            font-size: 13px;
            color: #cbd5e1;
            user-select: none;
            -webkit-user-select: none;
            line-height: 1;
        }

        .ndm-preview-card {
            background: rgba(0, 229, 255, 0.08);
            border: 1px solid rgba(0, 229, 255, 0.25);
            border-radius: 8px;
            padding: 10px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .ndm-preview-label {
            font-size: 12px;
            color: #94a3b8;
        }

        .ndm-preview-code {
            font-family: monospace;
            font-size: 15px;
            font-weight: 700;
            color: #00e5ff;
            letter-spacing: 0.5px;
        }
    `;
}

/**
 * 開啟音符時長修改彈窗
 * @param {Object} options
 * @param {Object} options.note 目標音符
 * @param {string} [options.currentDuration] 當前音符時長標籤
 * @param {boolean} [options.isSlide] 是否為 Slide 音符
 * @param {Function} options.onApply 套用時長回呼 (durationStr) => void
 */
export function openNoteDurationModal({
    note,
    currentDuration = '',
    isSlide = false,
    onApply
}) {
    ensureNoteDurationModalStyles();

    // 初始狀態解析
    const cleanDur = currentDuration.replace(/[\[\]]/g, '').trim();

    const state = {
        isSlide,
        mode: 'beat', // 'beat' | 'seconds' (用於 Hold)
        time: 4,
        beat: 1,
        holdBpm: '',
        holdSeconds: 1.0,
        holdUseHash: true, // Hold 秒數模式是否帶 # (例如 #5.678)

        // Slide 特有參數
        useCustomWait: false, // 是否啟用自訂等候設定 (未勾選時為預設 1 拍等候，收合欄位)
        waitMode: 'seconds', // 'seconds' (語法 ##) | 'bpm' (語法 指定 BPM #)
        waitSec: 1.0,
        slideWaitBpm: '', // 指定等候時的 BPM
        slideTracingMode: 'beat', // 'beat' | 'seconds'
        slideBpm: '', // 自訂等候秒數時的劃動 BPM
        slideSeconds: 1.0 // 劃動秒數
    };

    // 反向解析現有代碼
    if (cleanDur) {
        if (isSlide) {
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
        } else {
            // Hold
            if (cleanDur.startsWith('#')) {
                state.mode = 'seconds';
                state.holdUseHash = true;
                state.holdSeconds = parseFloat(cleanDur.substring(1)) || 1.0;
            } else if (cleanDur.includes('#') && cleanDur.includes(':')) {
                state.mode = 'beat';
                const [bStr, tbStr] = cleanDur.split('#');
                state.holdBpm = bStr;
                const [tStr, btStr] = tbStr.split(':');
                state.time = parseInt(tStr, 10) || 4;
                state.beat = parseInt(btStr, 10) || 1;
            } else if (cleanDur.includes(':')) {
                state.mode = 'beat';
                const [tStr, btStr] = cleanDur.split(':');
                state.time = parseInt(tStr, 10) || 4;
                state.beat = parseInt(btStr, 10) || 1;
            } else if (!isNaN(parseFloat(cleanDur))) {
                state.mode = 'seconds';
                state.holdUseHash = false;
                state.holdSeconds = parseFloat(cleanDur) || 1.0;
            }
        }
    }

    /**
     * 計算最終語法字串
     */
    function buildResultString() {
        if (!state.isSlide) {
            // Hold 模式
            if (state.mode === 'seconds') {
                return state.holdUseHash ? `#${state.holdSeconds}` : `${state.holdSeconds}`;
            } else {
                const bpmPart = state.holdBpm ? `${state.holdBpm}#` : '';
                return `${bpmPart}${state.time}:${state.beat}`;
            }
        } else {
            // Slide 模式
            if (state.useCustomWait) {
                if (state.waitMode === 'seconds') {
                    // 自訂秒數等候 (waitSec##...)
                    if (state.slideTracingMode === 'seconds') {
                        return `${state.waitSec}##${state.slideSeconds}`;
                    } else {
                        const bpmPart = state.slideBpm ? `${state.slideBpm}#` : '';
                        return `${state.waitSec}##${bpmPart}${state.time}:${state.beat}`;
                    }
                } else {
                    // 指定等候 BPM (#...)
                    const bpmPart = state.slideWaitBpm ? `${state.slideWaitBpm}#` : '';
                    if (state.slideTracingMode === 'seconds') {
                        return `${bpmPart}${state.slideSeconds}`;
                    } else {
                        return `${bpmPart}${state.time}:${state.beat}`;
                    }
                }
            } else {
                // 預設 1 拍等候 (無自訂前綴)
                if (state.slideTracingMode === 'seconds') {
                    return `${state.slideSeconds}`;
                } else {
                    return `${state.time}:${state.beat}`;
                }
            }
        }
    }

    // 建立 DOM 結構
    const container = document.createElement('div');
    container.className = 'ndm-container';

    function renderUI() {
        container.innerHTML = '';

        if (!state.isSlide) {
            // ==================== HOLD 介面 ====================
            const holdCard = document.createElement('div');
            holdCard.className = 'ndm-section-card';
            holdCard.innerHTML = `
                <div class="ndm-section-header">
                    <div class="ndm-section-title">
                        <span>${t('noteDurationModal.holdDuration')}</span>
                    </div>
                    <div class="ndm-tab-row">
                        <button type="button" class="ndm-tab-btn ${state.mode === 'beat' ? 'active' : ''}" data-action="set-mode-beat">${t('noteDurationModal.modeBeat')}</button>
                        <button type="button" class="ndm-tab-btn ${state.mode === 'seconds' ? 'active' : ''}" data-action="set-mode-seconds">${t('noteDurationModal.modeSeconds')}</button>
                    </div>
                </div>

                ${state.mode === 'beat' ? `
                    <div class="ndm-row">
                        <div class="ndm-field">
                            <input type="number" class="ndm-input" id="ndm-time" value="${state.time}" min="1" max="128" style="width: 60px;">
                            <span class="ndm-label">${t('noteDurationModal.divisionTimes')}</span>
                            <input type="number" class="ndm-input" id="ndm-beat" value="${state.beat}" min="1" max="512" style="width: 60px;">
                            <span class="ndm-label">${t('noteDurationModal.beatCount')}</span>
                        </div>
                        <div class="ndm-field" style="margin-left: auto;">
                            <span class="ndm-label">${t('noteDurationModal.specifyBpm')}</span>
                            <input type="number" class="ndm-input" id="ndm-hold-bpm" value="${state.holdBpm}" step="0.1" style="width: 80px;">
                        </div>
                    </div>
                ` : `
                    <div class="ndm-row">
                        <div class="ndm-field">
                            <span class="ndm-label">${t('noteDurationModal.durationSeconds')}</span>
                            <input type="number" class="ndm-input" id="ndm-hold-seconds" value="${state.holdSeconds}" step="0.001" min="0.001" style="width: 100px;">
                            <span>${t('noteDurationModal.secondsUnit')}</span>
                        </div>
                        <div class="ndm-checkbox-wrapper" style="margin-left: auto;">
                            <input type="checkbox" id="ndm-hold-hash" class="ndm-checkbox" ${state.holdUseHash ? 'checked' : ''}>
                            <label for="ndm-hold-hash" class="ndm-checkbox-label">${t('noteDurationModal.useHash')}</label>
                        </div>
                    </div>
                `}
            `;

            container.appendChild(holdCard);
        } else {
            // ==================== SLIDE 介面 ====================
            // 1. 等候時間區塊
            const waitCard = document.createElement('div');
            waitCard.className = 'ndm-section-card';
            waitCard.innerHTML = `
                <div class="ndm-section-header">
                    <div class="ndm-section-title">
                        <span>${t('noteDurationModal.waitTime')}</span>
                    </div>
                    <div class="ndm-checkbox-wrapper">
                        <input type="checkbox" id="ndm-slide-custom-wait" class="ndm-checkbox" ${state.useCustomWait ? 'checked' : ''}>
                        <label for="ndm-slide-custom-wait" class="ndm-checkbox-label">${t('noteDurationModal.customWait')}</label>
                    </div>
                </div>

                <div id="ndm-wait-content" style="display: ${state.useCustomWait ? 'flex' : 'none'}; flex-direction: column; gap: 10px; margin-top: 4px;">
                    <div class="ndm-row">
                        <div class="ndm-tab-row">
                            <button type="button" class="ndm-tab-btn ${state.waitMode === 'seconds' ? 'active' : ''}" data-action="set-wait-mode-seconds">${t('noteDurationModal.specifySeconds')}</button>
                            <button type="button" class="ndm-tab-btn ${state.waitMode === 'bpm' ? 'active' : ''}" data-action="set-wait-mode-bpm">${t('noteDurationModal.specifyBpmWait')}</button>
                        </div>

                        <div class="ndm-field" id="ndm-wait-sec-field" style="margin-left: auto; display: ${state.waitMode === 'seconds' ? 'flex' : 'none'};">
                            <span class="ndm-label">${t('noteDurationModal.waitSeconds')}</span>
                            <input type="number" class="ndm-input" id="ndm-slide-wait-sec" value="${state.waitSec}" step="0.1" min="0.01" style="width: 80px;">
                            <span>${t('noteDurationModal.secondsUnit')}</span>
                        </div>

                        <div class="ndm-field" id="ndm-wait-bpm-field" style="margin-left: auto; display: ${state.waitMode === 'bpm' ? 'flex' : 'none'};">
                            <span class="ndm-label">${t('noteDurationModal.waitBpm')}</span>
                            <input type="number" class="ndm-input" id="ndm-slide-wait-bpm" value="${state.slideWaitBpm}" step="0.1" style="width: 80px;">
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(waitCard);

            // 2. 劃動時間區塊
            const tracingCard = document.createElement('div');
            tracingCard.className = 'ndm-section-card';
            tracingCard.innerHTML = `
                <div class="ndm-section-header">
                    <div class="ndm-section-title">
                        <span>${t('noteDurationModal.slideDuration')}</span>
                    </div>
                    <div class="ndm-tab-row">
                        <button type="button" class="ndm-tab-btn ${state.slideTracingMode === 'beat' ? 'active' : ''}" data-action="set-slide-tracing-beat">${t('noteDurationModal.modeBeat')}</button>
                        <button type="button" class="ndm-tab-btn ${state.slideTracingMode === 'seconds' ? 'active' : ''}" data-action="set-slide-tracing-seconds">${t('noteDurationModal.modeSeconds')}</button>
                    </div>
                </div>

                ${state.slideTracingMode === 'beat' ? `
                    <div class="ndm-row">
                        <div class="ndm-field">
                            <input type="number" class="ndm-input" id="ndm-time" value="${state.time}" min="1" max="128" style="width: 60px;">
                            <span class="ndm-label">${t('noteDurationModal.divisionTimes')}</span>
                            <input type="number" class="ndm-input" id="ndm-beat" value="${state.beat}" min="1" max="512" style="width: 60px;">
                            <span class="ndm-label">${t('noteDurationModal.beatCount')}</span>
                        </div>
                        <div class="ndm-field" id="ndm-slide-tracing-bpm-field" style="margin-left: auto; display: ${(state.useCustomWait && state.waitMode === 'seconds') ? 'flex' : 'none'};">
                            <span class="ndm-label">${t('noteDurationModal.slideBpm')}</span>
                            <input type="number" class="ndm-input" id="ndm-slide-tracing-bpm" value="${state.slideBpm}" step="0.1" style="width: 80px;">
                        </div>
                    </div>
                ` : `
                    <div class="ndm-row">
                        <div class="ndm-field">
                            <span class="ndm-label">${t('noteDurationModal.slideSeconds')}</span>
                            <input type="number" class="ndm-input" id="ndm-slide-seconds" value="${state.slideSeconds}" step="0.05" min="0.01" style="width: 90px;">
                            <span>${t('noteDurationModal.secondsUnit')}</span>
                        </div>
                    </div>
                `}
            `;
            container.appendChild(tracingCard);
        }

        // 3. 即時預覽卡片
        const previewCard = document.createElement('div');
        previewCard.className = 'ndm-preview-card';
        previewCard.innerHTML = `
            <span class="ndm-preview-label">${t('noteDurationModal.previewLabel')}</span>
            <span class="ndm-preview-code" id="ndmResultCode">[${buildResultString()}]</span>
        `;
        container.appendChild(previewCard);
    }

    function updatePreviewText() {
        const previewEl = container.querySelector('#ndmResultCode');
        if (previewEl) {
            previewEl.innerText = `[${buildResultString()}]`;
        }
    }

    // 容器級事件委派 (永不遺失監聽)
    container.addEventListener('change', (e) => {
        const target = e.target;
        if (!target) return;

        if (target.id === 'ndm-slide-custom-wait') {
            const isChecked = Boolean(target.checked);
            state.useCustomWait = isChecked;

            const waitContent = container.querySelector('#ndm-wait-content');
            const slideBpmField = container.querySelector('#ndm-slide-tracing-bpm-field');

            if (waitContent) waitContent.style.display = isChecked ? 'flex' : 'none';
            if (slideBpmField) slideBpmField.style.display = (isChecked && state.waitMode === 'seconds' && state.slideTracingMode === 'beat') ? 'flex' : 'none';

            updatePreviewText();
        } else if (target.id === 'ndm-hold-hash') {
            state.holdUseHash = Boolean(target.checked);
            updatePreviewText();
        }
    });

    container.addEventListener('input', (e) => {
        const target = e.target;
        if (!target) return;

        if (target.id === 'ndm-time') {
            state.time = parseInt(target.value, 10) || 4;
            updatePreviewText();
        } else if (target.id === 'ndm-beat') {
            state.beat = parseInt(target.value, 10) || 1;
            updatePreviewText();
        } else if (target.id === 'ndm-hold-bpm') {
            state.holdBpm = target.value.trim();
            updatePreviewText();
        } else if (target.id === 'ndm-hold-seconds') {
            state.holdSeconds = parseFloat(target.value) || 1.0;
            updatePreviewText();
        } else if (target.id === 'ndm-slide-wait-sec') {
            state.waitSec = parseFloat(target.value) || 1.0;
            updatePreviewText();
        } else if (target.id === 'ndm-slide-wait-bpm') {
            state.slideWaitBpm = target.value.trim();
            updatePreviewText();
        } else if (target.id === 'ndm-slide-tracing-bpm') {
            state.slideBpm = target.value.trim();
            updatePreviewText();
        } else if (target.id === 'ndm-slide-seconds') {
            state.slideSeconds = parseFloat(target.value) || 1.0;
            updatePreviewText();
        }
    });

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        if (action === 'set-mode-beat') {
            state.mode = 'beat';
            renderUI();
        } else if (action === 'set-mode-seconds') {
            state.mode = 'seconds';
            renderUI();
        } else if (action === 'set-wait-mode-seconds') {
            state.waitMode = 'seconds';
            renderUI();
        } else if (action === 'set-wait-mode-bpm') {
            state.waitMode = 'bpm';
            renderUI();
        } else if (action === 'set-slide-tracing-beat') {
            state.slideTracingMode = 'beat';
            renderUI();
        } else if (action === 'set-slide-tracing-seconds') {
            state.slideTracingMode = 'seconds';
            renderUI();
        }
    });

    renderUI();

    // 建立通用無邊框彈窗
    let modalInstance = null;
    modalInstance = popupWindow({
        title: isSlide ? t('noteDurationModal.titleSlide') : t('noteDurationModal.titleHold'),
        customContent: container,
        width: 480,
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
                    const finalCode = buildResultString();
                    if (typeof onApply === 'function') {
                        onApply(finalCode);
                    }
                    modalInstance?.close();
                    simpleToast({ content: t('noteDurationModal.appliedToast', { code: finalCode }), type: 'success', timeout: 1200 });
                }
            }
        ]
    });
}

