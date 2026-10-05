/**
 * subdivisionModal.js
 * 
 * simai 譜面切分細分與轉換工具彈窗
 * 支援選取區塊/全譜面的倍化細分 (x2, x3, x4)、壓縮折半 (/2, /3, /4) 與自訂切分轉換
 */

import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';
import {
    detectDivisionBefore,
    detectDivisionsInText,
    subdivideSimaiText,
    compressSimaiText,
    convertSimaiDivision
} from '../features/subdivision.js';

function ensureSubdivisionStyles() {
    const styleId = 'wmc-subdivision-modal-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .subdiv-modal-container {
            display: flex;
            flex-direction: column;
            gap: 14px;
            color: #d0d0d0;
            font-size: 13px;
            max-width: 640px;
            width: 100%;
            box-sizing: border-box;
        }

        .subdiv-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            padding: 8px 12px;
            gap: 12px;
        }

        .subdiv-banner-info {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .subdiv-tag {
            background: rgba(73, 158, 238, 0.15);
            border: 1px solid rgba(73, 158, 238, 0.4);
            color: #38bdf8;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
        }

        .subdiv-segmented {
            display: flex;
            background: #18181b;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 2px;
            gap: 2px;
        }

        .subdiv-segment-btn {
            background: transparent;
            border: none;
            color: #888;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            user-select: none;
        }

        .subdiv-segment-btn:hover {
            color: #fff;
            background: rgba(255, 255, 255, 0.05);
        }

        .subdiv-segment-btn.active {
            background: var(--popup-accent, #49e);
            color: #fff;
            box-shadow: 0 2px 6px rgba(73, 158, 238, 0.3);
        }

        .subdiv-section {
            background: #202024;
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 6px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .subdiv-section-title {
            font-size: 12px;
            font-weight: 600;
            color: #9e9e9e;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .subdiv-button-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
            gap: 8px;
        }

        .subdiv-preset-btn {
            background: #2a2a30;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 6px;
            color: #e0e0e0;
            padding: 8px 10px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            text-align: center;
            transition: all 0.15s ease;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
        }

        .subdiv-preset-btn:hover {
            border-color: rgba(73, 158, 238, 0.5);
            background: #32323a;
        }

        .subdiv-preset-btn.active {
            background: rgba(73, 158, 238, 0.2);
            border-color: var(--popup-accent, #49e);
            color: #fff;
        }

        .subdiv-preset-hint {
            font-size: 11px;
            color: #888;
        }

        .subdiv-custom-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 4px;
        }

        .subdiv-custom-input {
            background: #18181b;
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 4px;
            color: #fff;
            padding: 6px 10px;
            font-size: 13px;
            width: 70px;
            text-align: center;
            outline: none;
        }

        .subdiv-custom-input:focus {
            border-color: var(--popup-accent, #49e);
        }

        .subdiv-options-row {
            display: flex;
            flex-direction: column;
            gap: 6px;
            background: rgba(255, 255, 255, 0.02);
            padding: 8px 10px;
            border-radius: 6px;
        }

        .subdiv-checkbox-label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            font-size: 12px;
            color: #bbb;
            user-select: none;
        }

        .subdiv-checkbox-label input[type="checkbox"] {
            accent-color: var(--popup-accent, #49e);
            width: 15px;
            height: 15px;
            cursor: pointer;
        }

        .subdiv-preview-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }

        @media (max-width: 520px) {
            .subdiv-preview-container {
                grid-template-columns: 1fr;
            }
        }

        .subdiv-preview-box {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .subdiv-preview-header {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #888;
            font-weight: 500;
        }

        .subdiv-preview-content {
            background: #141416;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 8px;
            font-family: Consolas, "Courier New", monospace;
            font-size: 12px;
            color: #a5d6a7;
            height: 90px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
            line-height: 1.4;
        }

        .subdiv-preview-content.original {
            color: #bbb;
        }

        .subdiv-stats-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
            color: #9e9e9e;
            padding: 4px 6px;
        }

        .subdiv-conflict-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.4);
            color: #f87171;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
        }

        .subdiv-success-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid rgba(16, 185, 129, 0.4);
            color: #34d399;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
        }
    `;
    document.head.appendChild(style);
}

/**
 * 開啟切分細分與轉換工具彈窗
 * @param {Object} options
 * @param {HTMLTextAreaElement} options.editorInput
 * @param {Function} [options.applyHighlight]
 * @param {Function} [options.recordEditorHistory]
 * @param {Function} [options.inputDebounce]
 */
export function openSubdivisionModal({
    editorInput,
    applyHighlight,
    recordEditorHistory,
    inputDebounce
}) {
    if (!editorInput) return;
    ensureSubdivisionStyles();

    const fullText = editorInput.value || '';
    const selStart = editorInput.selectionStart;
    const selEnd = editorInput.selectionEnd;
    const hasSelection = selStart !== selEnd && selEnd > selStart;

    // 狀態設定
    let scope = hasSelection ? 'selection' : 'all';
    let mode = 'multiply'; // 'multiply' | 'compress' | 'convert'
    let multiplier = 2;
    let divisor = 2;
    let fromDivision = 4;
    let toDivision = 8;
    let insertHeader = true;
    let restoreHeader = hasSelection;
    let mergeConflict = false;

    // 偵測光標或選取區前的生效切分
    const detectedDiv = detectDivisionBefore(fullText, selStart);
    fromDivision = detectedDiv;
    toDivision = Math.round(detectedDiv * 2);

    // 取得當前作用範圍的文字
    function getWorkingText() {
        if (scope === 'selection' && hasSelection) {
            return fullText.slice(selStart, selEnd);
        }
        return fullText;
    }

    // 計算轉換結果
    function computeResult() {
        const text = getWorkingText();
        const activeDiv = detectedDiv || 4;

        if (mode === 'multiply') {
            return subdivideSimaiText(text, multiplier, {
                activeDivision: activeDiv,
                insertHeader,
                restoreHeader: scope === 'selection' && restoreHeader
            });
        } else if (mode === 'compress') {
            return compressSimaiText(text, divisor, {
                activeDivision: activeDiv,
                insertHeader,
                restoreHeader: scope === 'selection' && restoreHeader,
                mergeConflictNotes: mergeConflict
            });
        } else if (mode === 'convert') {
            return convertSimaiDivision(text, fromDivision, toDivision, {
                insertHeader,
                restoreHeader: scope === 'selection' && restoreHeader
            });
        }
        return { result: text, changed: false, originalSteps: 0, newSteps: 0, conflicts: [] };
    }

    // DOM 節點容器
    const container = document.createElement('div');
    container.className = 'subdiv-modal-container';

    // 頂部資訊列 (範圍切換與目前切分顯示)
    const banner = document.createElement('div');
    banner.className = 'subdiv-banner';

    const bannerInfo = document.createElement('div');
    bannerInfo.className = 'subdiv-banner-info';
    bannerInfo.innerHTML = `
        <span>${t('subdivision.detectedDivision') || '目前切分'}:</span>
        <span class="subdiv-tag">{${detectedDiv}}</span>
        ${hasSelection ? `<span style="color:#888; font-size:12px;">(${selEnd - selStart} ${t('subdivision.scopeChars') || '字元'})</span>` : ''}
    `;

    const scopeSegmented = document.createElement('div');
    scopeSegmented.className = 'subdiv-segmented';
    if (hasSelection) {
        scopeSegmented.innerHTML = `
            <button type="button" class="subdiv-segment-btn ${scope === 'selection' ? 'active' : ''}" data-scope="selection">${t('subdivision.scopeSelection') || '選取範圍'}</button>
            <button type="button" class="subdiv-segment-btn ${scope === 'all' ? 'active' : ''}" data-scope="all">${t('subdivision.scopeAll') || '全譜面'}</button>
        `;
    } else {
        scopeSegmented.innerHTML = `
            <button type="button" class="subdiv-segment-btn active" data-scope="all">${t('subdivision.scopeAll') || '全譜面'}</button>
        `;
    }

    banner.append(bannerInfo, scopeSegmented);

    // 模式切換 Tabs
    const modeTabs = document.createElement('div');
    modeTabs.className = 'subdiv-segmented';
    modeTabs.style.width = '100%';
    modeTabs.innerHTML = `
        <button type="button" class="subdiv-segment-btn ${mode === 'multiply' ? 'active' : ''}" data-mode="multiply" style="flex:1;">
            ${t('subdivision.modeMultiply') || '倍化細分'} (x2, x3, x4...)
        </button>
        <button type="button" class="subdiv-segment-btn ${mode === 'compress' ? 'active' : ''}" data-mode="compress" style="flex:1;">
            ${t('subdivision.modeCompress') || '壓縮折半'} (/2, /3, /4...)
        </button>
        <button type="button" class="subdiv-segment-btn ${mode === 'convert' ? 'active' : ''}" data-mode="convert" style="flex:1;">
            ${t('subdivision.modeConvert') || '指定切分轉換'}
        </button>
    `;

    // 參數控制區
    const configSection = document.createElement('div');
    configSection.className = 'subdiv-section';

    // 選項勾選區
    const optionsSection = document.createElement('div');
    optionsSection.className = 'subdiv-options-row';

    // 預覽區
    const previewContainer = document.createElement('div');
    previewContainer.className = 'subdiv-preview-container';

    const originalBox = document.createElement('div');
    originalBox.className = 'subdiv-preview-box';
    originalBox.innerHTML = `
        <div class="subdiv-preview-header">
            <span>${t('subdivision.previewOriginal') || '轉換前 (Original)'}</span>
            <span id="subdiv-orig-count">0 拍</span>
        </div>
        <div class="subdiv-preview-content original" id="subdiv-preview-orig"></div>
    `;

    const resultBox = document.createElement('div');
    resultBox.className = 'subdiv-preview-box';
    resultBox.innerHTML = `
        <div class="subdiv-preview-header">
            <span>${t('subdivision.previewResult') || '轉換後 (Result)'}</span>
            <span id="subdiv-res-count">0 拍</span>
        </div>
        <div class="subdiv-preview-content" id="subdiv-preview-res"></div>
    `;

    previewContainer.append(originalBox, resultBox);

    // 統計指標列
    const statsBar = document.createElement('div');
    statsBar.className = 'subdiv-stats-bar';

    container.append(banner, modeTabs, configSection, optionsSection, previewContainer, statsBar);

    // 渲染模式控制項目
    function renderConfigUI() {
        if (mode === 'multiply') {
            configSection.innerHTML = `
                <div class="subdiv-section-title">${t('subdivision.multiplier') || '細分倍數'}</div>
                <div class="subdiv-button-grid">
                    <button type="button" class="subdiv-preset-btn ${multiplier === 2 ? 'active' : ''}" data-mul="2">
                        <span>x2 (2倍細分)</span>
                        <span class="subdiv-preset-hint">{${detectedDiv}} → {${detectedDiv * 2}}</span>
                    </button>
                    <button type="button" class="subdiv-preset-btn ${multiplier === 3 ? 'active' : ''}" data-mul="3">
                        <span>x3 (三連音)</span>
                        <span class="subdiv-preset-hint">{${detectedDiv}} → {${detectedDiv * 3}}</span>
                    </button>
                    <button type="button" class="subdiv-preset-btn ${multiplier === 4 ? 'active' : ''}" data-mul="4">
                        <span>x4 (4倍細分)</span>
                        <span class="subdiv-preset-hint">{${detectedDiv}} → {${detectedDiv * 4}}</span>
                    </button>
                </div>
                <div class="subdiv-custom-row">
                    <span>${t('subdivision.customMultiplier') || '自訂倍數'}:</span>
                    <input type="number" min="2" max="16" value="${multiplier}" class="subdiv-custom-input" id="subdiv-custom-mul">
                    <span style="color:#888; font-size:12px;">(每個拍點擴充為 N 個逗號)</span>
                </div>
            `;
        } else if (mode === 'compress') {
            configSection.innerHTML = `
                <div class="subdiv-section-title">${t('subdivision.divisor') || '壓縮除數'}</div>
                <div class="subdiv-button-grid">
                    <button type="button" class="subdiv-preset-btn ${divisor === 2 ? 'active' : ''}" data-div="2">
                        <span>/2 (折半壓縮)</span>
                        <span class="subdiv-preset-hint">{${detectedDiv}} → {${Math.max(1, Math.round(detectedDiv / 2))}}</span>
                    </button>
                    <button type="button" class="subdiv-preset-btn ${divisor === 3 ? 'active' : ''}" data-div="3">
                        <span>/3 (3等分壓縮)</span>
                        <span class="subdiv-preset-hint">{${detectedDiv}} → {${Math.max(1, Math.round(detectedDiv / 3))}}</span>
                    </button>
                    <button type="button" class="subdiv-preset-btn ${divisor === 4 ? 'active' : ''}" data-div="4">
                        <span>/4 (4等分壓縮)</span>
                        <span class="subdiv-preset-hint">{${detectedDiv}} → {${Math.max(1, Math.round(detectedDiv / 4))}}</span>
                    </button>
                </div>
                <div class="subdiv-custom-row">
                    <span>${t('subdivision.customDivisor') || '自訂除數'}:</span>
                    <input type="number" min="2" max="16" value="${divisor}" class="subdiv-custom-input" id="subdiv-custom-div">
                    <span style="color:#888; font-size:12px;">(每 N 個拍點合併為 1 個拍點)</span>
                </div>
            `;
        } else if (mode === 'convert') {
            const divs = [4, 8, 12, 16, 24, 32, 48, 64];
            configSection.innerHTML = `
                <div class="subdiv-section-title">${t('subdivision.targetDivision') || '切分轉換'}</div>
                <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span>來源:</span>
                        <select id="subdiv-from-div" style="background:#18181b; color:#fff; border:1px solid #444; border-radius:4px; padding:4px 8px;">
                            ${divs.map(d => `<option value="${d}" ${d === fromDivision ? 'selected' : ''}>{${d}} (${d}分音符)</option>`).join('')}
                        </select>
                    </div>
                    <span style="color:#888;">➔</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span>目標:</span>
                        <select id="subdiv-to-div" style="background:#18181b; color:#fff; border:1px solid #444; border-radius:4px; padding:4px 8px;">
                            ${divs.map(d => `<option value="${d}" ${d === toDivision ? 'selected' : ''}>{${d}} (${d}分音符)</option>`).join('')}
                        </select>
                    </div>
                </div>
            `;
        }

        renderOptionsUI();
        updatePreview();
    }

    // 渲染選項核取方塊
    function renderOptionsUI() {
        optionsSection.innerHTML = `
            <label class="subdiv-checkbox-label">
                <input type="checkbox" id="subdiv-opt-insert-header" ${insertHeader ? 'checked' : ''}>
                <span>${t('subdivision.insertHeader') || '在開頭補上新切分標籤 (例如 {8})'}</span>
            </label>
            ${scope === 'selection' ? `
                <label class="subdiv-checkbox-label">
                    <input type="checkbox" id="subdiv-opt-restore-header" ${restoreHeader ? 'checked' : ''}>
                    <span>${t('subdivision.restoreHeader') || '在結尾還原原切分標籤 (避免干擾後續譜面節奏)'}</span>
                </label>
            ` : ''}
            ${mode === 'compress' ? `
                <label class="subdiv-checkbox-label">
                    <input type="checkbox" id="subdiv-opt-merge-conflict" ${mergeConflict ? 'checked' : ''}>
                    <span>${t('subdivision.mergeConflict') || '壓縮遇實體音符時合併為雙打音符 (如 1/5)'}</span>
                </label>
            ` : ''}
        `;
    }

    // 更新即時預覽與統計
    function updatePreview() {
        const origText = getWorkingText();
        const res = computeResult();

        const origEl = document.getElementById('subdiv-preview-orig');
        const resEl = document.getElementById('subdiv-preview-res');
        const origCountEl = document.getElementById('subdiv-orig-count');
        const resCountEl = document.getElementById('subdiv-res-count');

        if (origEl) origEl.textContent = origText;
        if (resEl) resEl.textContent = res.result;
        if (origCountEl) origCountEl.textContent = `${res.originalSteps || 0} 拍`;
        if (resCountEl) resCountEl.textContent = `${res.newSteps || 0} 拍`;

        let badgeHtml = '';
        if (res.conflicts && res.conflicts.length > 0) {
            badgeHtml = `<span class="subdiv-conflict-badge">⚠️ 發現 ${res.conflicts.length} 處拍點衝突音符</span>`;
        } else {
            badgeHtml = `<span class="subdiv-success-badge">✓ 時值精確無損</span>`;
        }

        statsBar.innerHTML = `
            <span>${t('subdivision.stepsChange') || '拍數'}: ${res.originalSteps || 0} ➔ ${res.newSteps || 0}</span>
            ${badgeHtml}
        `;
    }

    // 綁定動態事件監聽
    container.addEventListener('click', (e) => {
        // 1. 範圍切換
        const scopeBtn = e.target.closest('[data-scope]');
        if (scopeBtn) {
            scope = scopeBtn.dataset.scope;
            container.querySelectorAll('[data-scope]').forEach(b => b.classList.remove('active'));
            scopeBtn.classList.add('active');
            restoreHeader = (scope === 'selection');
            renderOptionsUI();
            updatePreview();
            return;
        }

        // 2. 模式切換
        const modeBtn = e.target.closest('[data-mode]');
        if (modeBtn) {
            mode = modeBtn.dataset.mode;
            container.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
            modeBtn.classList.add('active');
            renderConfigUI();
            return;
        }

        // 3. 細分倍數按鈕
        const mulBtn = e.target.closest('[data-mul]');
        if (mulBtn) {
            multiplier = parseInt(mulBtn.dataset.mul, 10);
            renderConfigUI();
            return;
        }

        // 4. 壓縮除數按鈕
        const divBtn = e.target.closest('[data-div]');
        if (divBtn) {
            divisor = parseInt(divBtn.dataset.div, 10);
            renderConfigUI();
            return;
        }
    });

    container.addEventListener('input', (e) => {
        if (e.target.id === 'subdiv-custom-mul') {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 2) {
                multiplier = val;
                updatePreview();
            }
        } else if (e.target.id === 'subdiv-custom-div') {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 2) {
                divisor = val;
                updatePreview();
            }
        }
    });

    container.addEventListener('change', (e) => {
        if (e.target.id === 'subdiv-from-div') {
            fromDivision = parseFloat(e.target.value) || 4;
            updatePreview();
        } else if (e.target.id === 'subdiv-to-div') {
            toDivision = parseFloat(e.target.value) || 8;
            updatePreview();
        } else if (e.target.id === 'subdiv-opt-insert-header') {
            insertHeader = e.target.checked;
            updatePreview();
        } else if (e.target.id === 'subdiv-opt-restore-header') {
            restoreHeader = e.target.checked;
            updatePreview();
        } else if (e.target.id === 'subdiv-opt-merge-conflict') {
            mergeConflict = e.target.checked;
            updatePreview();
        }
    });

    renderConfigUI();

    // 建立彈窗
    let modalInstance = null;
    modalInstance = popupWindow({
        title: t('subdivision.title') || '切分細分與轉換',
        customContent: container,
        width: 660,
        buttons: [
            {
                text: t('popup.cancel') || '取消',
                onClick: () => {
                    modalInstance?.close();
                }
            },
            {
                text: t('subdivision.apply') || '套用轉換',
                isPrimary: true,
                onClick: () => {
                    const res = computeResult();
                    if (!res.changed && res.result === getWorkingText()) {
                        modalInstance?.close();
                        return;
                    }

                    const originalFull = editorInput.value || '';

                    if (scope === 'selection' && hasSelection) {
                        const newFull = `${originalFull.slice(0, selStart)}${res.result}${originalFull.slice(selEnd)}`;
                        editorInput.value = newFull;
                        editorInput.selectionStart = selStart;
                        editorInput.selectionEnd = selStart + res.result.length;
                        editorInput.setSelectionRange(selStart, selStart + res.result.length);
                    } else {
                        editorInput.value = res.result;
                        editorInput.selectionStart = 0;
                        editorInput.selectionEnd = res.result.length;
                        editorInput.setSelectionRange(0, 0);
                    }

                    if (typeof applyHighlight === 'function') {
                        applyHighlight(editorInput.value);
                    }
                    if (typeof recordEditorHistory === 'function') {
                        recordEditorHistory();
                    }
                    if (typeof inputDebounce === 'function') {
                        inputDebounce();
                    }

                    editorInput.focus();
                    simpleToast({
                        content: t('subdivision.appliedToast') || '已成功套用切分細分與轉換',
                        type: 'success',
                        timeout: 1800
                    });

                    modalInstance?.close();
                }
            }
        ]
    });
}
