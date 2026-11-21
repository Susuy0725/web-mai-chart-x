import { popupWindow, simpleToast, clamp } from '../helper.js';
import { t } from '../i18n.js';
import { appContext } from '../core/appContext.js';
import { SimaiPreviewRenderer } from '../renderer.js';
import { createSettingRangeInput } from './settingsModal.js';
import {
    detectBpmFromAudioBuffer,
    detectOffsetFromAudioBuffer,
    snapTimeToNearestOnset
} from '../core/bpmDetector.js';
import {
    formatBpmValue,
    normalizeBpmSegments,
    collectSegmentPreviewTags,
    hitTestYellowLinesOrAnchors,
    computeBpmFromSpan,
    buildMultiBpmChartSkeleton,
    buildInsertedSegmentChartText
} from '../core/bpmSegments.js';

/**
 * 開啟 BPM / 偏移檢測、多段黃線插點、音軌區間量測與 Tap BPM 試聽校準彈窗
 * @param {Object} [options={}]
 */
export function openTapBpm(options = {}) {
    const audioManager = options.audioManager || appContext.audioManager;
    const settings = options.settings || appContext.settings || {};
    const editorInput = options.editorInput || document.getElementById('editorInput');
    const applyHighlight = options.applyHighlight;
    const inputDebounce = options.inputDebounce;
    const setEditorCss = options.setEditorCss;
    const updateEditorAndSave = options.updateEditorAndSave;
    const offsetInput = options.offsetInput || document.getElementById('offsetInput');
    const offsetInputDebounce = options.offsetInputDebounce;
    const getMusicDelay = options.getMusicDelay || (() => parseFloat(offsetInput?.value) || 0);
    const setMusicDelay = options.setMusicDelay;
    const getClockBpm = options.getClockBpm || (() => 120);
    const getTimebase = options.getTimebase || (() => ({ tb1: 4, tb2: 4 }));
    const getDecodedTags = options.getDecodedTags || (() => []);
    const getDataIndexToTime = options.getDataIndexToTime || (() => []);
    const findCommaCharIndex = options.findCommaCharIndex;
    const onRedraw = options.draw || (() => appContext.draw?.());

    const initBpmRaw = Number(getClockBpm());
    const fallbackBpm = (isFinite(initBpmRaw) && initBpmRaw > 0) ? initBpmRaw : 120;
    let beatsPerMeasure = Math.max(1, parseInt(getTimebase()?.tb1, 10) || 4);
    let currentOffset = Number(getMusicDelay()) || 0;
    let subdivision = 4; // 4 = 1/4, 8 = 1/8, 16 = 1/16
    let sfxVolumePercent = Math.round(clamp((settings?.sfxVolumes?.clock ?? 0.6) * 100, 0, 100));

    // 從目前譜面自動載入既有多段 BPM 標籤（問題 2）
    const existingBpmTags = (typeof getDecodedTags === 'function' ? getDecodedTags() : [])
        .filter(tag => tag && tag.type === 'bpm' && isFinite(tag.value) && tag.value > 0 && isFinite(tag.time) && tag.time >= 0)
        .map(tag => ({ time: tag.time, bpm: tag.value }));

    let segments = normalizeBpmSegments(existingBpmTags, fallbackBpm);
    let activeSegIndex = 0;

    // 音軌區間量測狀態
    let measureEndAudioTime = null;
    let spanCount = 1;
    let spanUnit = 'measure'; // 'measure' | 'beat'

    let previewZoom = clamp(Number(settings?.visualZoom) || 200, 50, 1000);
    let previewTime = Math.max(0, currentOffset);
    let lastAuditionStartTime = previewTime;
    let isSfxEnabled = true;
    let isAuditioning = false;
    let auditionRafId = null;
    let lastScheduledClickAudioTime = -Infinity;
    let taps = [];
    let hoverTarget = null; // { kind: 'anchor'|'line', segIndex, relTime, x }

    const modalPreviewSettings = {
        ...settings,
        previewAudioVisualMode: (settings?.previewAudioVisualMode === 'off')
            ? 'waveform'
            : (settings?.previewAudioVisualMode || 'waveform')
    };

    const getActiveSegment = () => segments[activeSegIndex] || segments[0];
    const getActiveSegmentAudioRange = () => {
        const seg = getActiveSegment();
        const nextSeg = segments[activeSegIndex + 1];
        const startAudio = Math.max(0, currentOffset + seg.time);
        const endAudio = nextSeg ? Math.max(startAudio + 0.1, currentOffset + nextSeg.time) : (audioManager?.bgmBuffer?.duration || undefined);
        return { startAudio, endAudio };
    };

    const container = document.createElement('div');
    container.className = 'popup-tap-container';

    // === 1. 頂部 Preview 區塊 (音訊與多段 BPM 線，無音符) ===
    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'popup-tap-preview-wrap';

    const zoomBox = document.createElement('div');
    zoomBox.className = 'popup-tap-zoom-box';
    const zoomInBtn = document.createElement('button');
    zoomInBtn.type = 'button';
    zoomInBtn.className = 'popup-tap-zoom-btn';
    zoomInBtn.textContent = '+';
    zoomInBtn.title = '+';
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.type = 'button';
    zoomOutBtn.className = 'popup-tap-zoom-btn';
    zoomOutBtn.textContent = '-';
    zoomOutBtn.title = '-';
    zoomBox.append(zoomInBtn, zoomOutBtn);

    const previewCanvasHost = document.createElement('div');
    previewCanvasHost.className = 'popup-tap-preview-canvas-host';
    const previewCanvas = document.createElement('canvas');
    previewCanvas.className = 'popup-tap-preview-canvas';
    previewCanvasHost.appendChild(previewCanvas);

    const previewTimeLabel = document.createElement('div');
    previewTimeLabel.className = 'popup-tap-preview-time';
    previewCanvasHost.appendChild(previewTimeLabel);

    previewWrapper.append(zoomBox, previewCanvasHost);
    container.appendChild(previewWrapper);

    // 1B. 變速段清單（由上往下列表）
    const segmentsSection = document.createElement('div');
    segmentsSection.className = 'popup-tap-segments-section';

    const segmentsHeader = document.createElement('div');
    segmentsHeader.className = 'popup-tap-segments-header';
    const segmentsTitle = document.createElement('span');
    segmentsTitle.className = 'popup-tap-segments-title';
    segmentsTitle.textContent = t('popup.tapBpm.segmentsTitle');

    const addAtPlayheadBtn = document.createElement('button');
    addAtPlayheadBtn.type = 'button';
    addAtPlayheadBtn.className = 'popup-tap-seg-add-btn';
    addAtPlayheadBtn.textContent = t('popup.tapBpm.addAtPlayhead');
    addAtPlayheadBtn.addEventListener('click', () => {
        const relT = Math.max(0, previewTime - currentOffset);
        insertOrSelectSegmentAtRelTime(relT);
    });
    segmentsHeader.append(segmentsTitle, addAtPlayheadBtn);

    const segmentsBar = document.createElement('div');
    segmentsBar.className = 'popup-tap-segments-list';
    segmentsSection.append(segmentsHeader, segmentsBar);
    container.appendChild(segmentsSection);

    const previewRenderer = new SimaiPreviewRenderer(previewCanvas, modalPreviewSettings);

    const getAudioDuration = () => audioManager?.bgmBuffer?.duration || 0;

    const resizePreviewCanvas = () => {
        const rect = previewCanvasHost.getBoundingClientRect();
        const w = Math.max(120, Math.floor(rect.width || 460));
        const h = Math.max(70, Math.floor(rect.height || 92));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        previewRenderer.resize(w, h, dpr, false);
    };

    const drawPreviewOverlay = () => {
        const ctx = previewCanvas.getContext('2d');
        const w = previewCanvas.width;
        const h = previewCanvas.height;
        if (!ctx || w <= 0 || h <= 0) return;

        const hw = w * 0.5;
        const zoom = previewZoom || 200;
        const centerRelTime = previewTime - currentOffset;
        const relTimeToX = (rt) => hw + (rt - centerRelTime) * zoom;
        const audioTimeToX = (at) => relTimeToX(at - currentOffset);

        ctx.save();

        // 1. 音軌區間量測選區與可拖曳終點手柄
        const activeSeg = getActiveSegment();
        const segStartAudio = currentOffset + activeSeg.time;
        if (measureEndAudioTime !== null && isFinite(measureEndAudioTime) && measureEndAudioTime > segStartAudio) {
            const x1 = audioTimeToX(segStartAudio);
            const x2 = audioTimeToX(measureEndAudioTime);
            const leftX = Math.max(0, Math.min(x1, x2));
            const rightX = Math.min(w, Math.max(x1, x2));
            if (rightX > leftX) {
                ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
                ctx.fillRect(leftX, 0, rightX - leftX, h);
            }
            if (x2 >= -20 && x2 <= w + 20) {
                ctx.strokeStyle = '#34d399';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(x2, 0);
                ctx.lineTo(x2, h);
                ctx.stroke();
                ctx.setLineDash([]);

                // 底部菱形手柄
                ctx.fillStyle = '#34d399';
                ctx.beginPath();
                ctx.moveTo(x2, h - 10);
                ctx.lineTo(x2 + 6, h - 4);
                ctx.lineTo(x2, h);
                ctx.lineTo(x2 - 6, h - 4);
                ctx.closePath();
                ctx.fill();
            }
        }

        // 2. 既有 BPM 變速段起點標記
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const sx = relTimeToX(seg.time);
            if (sx < -40 || sx > w + 40) continue;
            const isActive = i === activeSegIndex;

            ctx.strokeStyle = isActive ? '#38bdf8' : 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = isActive ? 2 : 1.5;
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, h);
            ctx.stroke();

            const badge = `#${i + 1} ${formatBpmValue(seg.bpm)}`;
            ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
            const tw = ctx.measureText(badge).width + 8;
            const bx = clamp(sx + 3, 2, Math.max(2, w - tw - 2));
            const by = 4;
            ctx.fillStyle = isActive ? 'rgba(14, 116, 144, 0.92)' : 'rgba(20, 24, 34, 0.85)';
            ctx.strokeStyle = isActive ? '#38bdf8' : 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(bx, by, tw, 15, 4);
            } else {
                ctx.rect(bx, by, tw, 15);
            }
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(badge, bx + 4, by + 7.5);
        }

        // 3. 滑鼠懸停黃線插入 / 選取提示
        if (hoverTarget) {
            const hx = relTimeToX(hoverTarget.relTime);
            if (hx >= 0 && hx <= w) {
                ctx.strokeStyle = hoverTarget.kind === 'anchor' ? '#38bdf8' : '#fde047';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(hx, 0);
                ctx.lineTo(hx, h);
                ctx.stroke();

                const audioAtHover = currentOffset + hoverTarget.relTime;
                const hintText = hoverTarget.kind === 'anchor'
                    ? `#${hoverTarget.segIndex + 1}`
                    : `+ BPM @ ${audioAtHover.toFixed(3)}s`;
                ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
                const hwText = ctx.measureText(hintText).width + 10;
                const tx = clamp(hx - hwText * 0.5, 2, Math.max(2, w - hwText - 2));
                const ty = h - 19;
                ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                ctx.strokeStyle = hoverTarget.kind === 'anchor' ? '#38bdf8' : '#facc15';
                ctx.lineWidth = 1;
                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(tx, ty, hwText, 15, 4);
                } else {
                    ctx.rect(tx, ty, hwText, 15);
                }
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = hoverTarget.kind === 'anchor' ? '#7dd3fc' : '#fef08a';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(hintText, tx + hwText * 0.5, ty + 7.5);
            }
        }

        ctx.restore();
    };

    const drawPreview = () => {
        resizePreviewCanvas();
        previewRenderer.setTimebase(beatsPerMeasure, subdivision);
        previewRenderer.setZoom(previewZoom);

        const relTime = previewTime - currentOffset;
        previewRenderer.drawFrame({
            globalTime: relTime,
            visualBuckets: {
                slide: [],
                tapnhold: [],
                touch: [],
                tags: collectSegmentPreviewTags(segments)
            },
            audioBuffer: audioManager?.bgmBuffer || null,
            offset: currentOffset,
            indexTime: relTime,
            cursorIndexTime: 0,
            isPlaying: isAuditioning
        });

        drawPreviewOverlay();
        previewTimeLabel.textContent = `${previewTime.toFixed(3)}s`;
    };

    // === 2. BPM、區間量測、Tap BPM、計數拍、偏移與細分 ===
    const formGrid = document.createElement('div');
    formGrid.className = 'popup-tap-form-grid';

    // 2A. BPM Row (作用於目前選中段)
    const bpmRow = document.createElement('div');
    bpmRow.className = 'popup-tap-row';
    const bpmLabel = document.createElement('label');
    bpmLabel.className = 'popup-tap-label';
    bpmLabel.textContent = t('popup.tapBpm.bpmLabel');

    const bpmControl = document.createElement('div');
    bpmControl.className = 'popup-tap-field-col';
    const bpmLine = document.createElement('div');
    bpmLine.className = 'popup-tap-input-group';

    const bpmInput = document.createElement('input');
    bpmInput.type = 'number';
    bpmInput.step = 'any';
    bpmInput.min = '1';
    bpmInput.max = '999';
    bpmInput.className = 'popup-setting-input';

    const detectBpmBtn = document.createElement('button');
    detectBpmBtn.type = 'button';
    detectBpmBtn.className = 'popup-btn popup-btn-secondary popup-btn-sm popup-tap-detect-btn';
    detectBpmBtn.textContent = t('popup.tapBpm.autoDetect');

    const bpmResultText = document.createElement('div');
    bpmResultText.className = 'popup-tap-detect-result';
    bpmResultText.style.display = 'none';

    bpmLine.append(bpmInput, detectBpmBtn);
    bpmControl.append(bpmLine, bpmResultText);
    bpmRow.append(bpmLabel, bpmControl);
    formGrid.appendChild(bpmRow);

    // 2B. 音軌區間量測卡片 (Measure by Audio Span)
    const spanCard = document.createElement('div');
    spanCard.className = 'popup-tap-span-card';

    const spanHeader = document.createElement('div');
    spanHeader.className = 'popup-tap-span-header';
    const spanTitle = document.createElement('span');
    spanTitle.className = 'popup-tap-span-title';
    spanTitle.textContent = t('popup.tapBpm.spanTitle');
    const spanStartBadge = document.createElement('span');
    spanStartBadge.className = 'popup-tap-span-start';
    spanHeader.append(spanTitle, spanStartBadge);

    const spanBody = document.createElement('div');
    spanBody.className = 'popup-tap-span-controls';

    const spanEndInput = document.createElement('input');
    spanEndInput.type = 'number';
    spanEndInput.step = '0.001';
    spanEndInput.placeholder = t('popup.tapBpm.spanEndPlaceholder');
    spanEndInput.className = 'popup-form-input popup-tap-span-end-input';

    const setSpanEndHereBtn = document.createElement('button');
    setSpanEndHereBtn.type = 'button';
    setSpanEndHereBtn.className = 'popup-btn popup-btn-secondary popup-btn-sm';
    setSpanEndHereBtn.textContent = t('popup.tapBpm.spanSetEndHere');

    const snapSpanEndBtn = document.createElement('button');
    snapSpanEndBtn.type = 'button';
    snapSpanEndBtn.className = 'popup-btn popup-btn-secondary popup-btn-sm';
    snapSpanEndBtn.textContent = t('popup.tapBpm.spanSnapPeak');

    const clearSpanEndBtn = document.createElement('button');
    clearSpanEndBtn.type = 'button';
    clearSpanEndBtn.className = 'popup-btn popup-btn-secondary popup-btn-sm';
    clearSpanEndBtn.textContent = '×';
    clearSpanEndBtn.title = t('popup.tapBpm.spanClear');

    const spanCountRow = document.createElement('div');
    spanCountRow.className = 'popup-tap-span-count-row';

    const spanLenLabel = document.createElement('span');
    spanLenLabel.className = 'popup-tap-span-sub-label';
    spanLenLabel.textContent = t('popup.tapBpm.spanEquals');

    const spanCountInput = document.createElement('input');
    spanCountInput.type = 'number';
    spanCountInput.min = '0.25';
    spanCountInput.step = '1';
    spanCountInput.value = '1';
    spanCountInput.className = 'popup-form-input popup-tap-span-count-input';

    const spanUnitSelect = document.createElement('select');
    spanUnitSelect.className = 'popup-form-select popup-tap-span-unit-select';
    spanUnitSelect.innerHTML = `
        <option value="measure">${t('popup.tapBpm.unitMeasure')}</option>
        <option value="beat">${t('popup.tapBpm.unitBeat')}</option>
    `;

    const spanBpmOut = document.createElement('span');
    spanBpmOut.className = 'popup-tap-span-result';

    spanBody.append(spanEndInput, setSpanEndHereBtn, snapSpanEndBtn, clearSpanEndBtn);
    spanCountRow.append(spanLenLabel, spanCountInput, spanUnitSelect, spanBpmOut);
    spanCard.append(spanHeader, spanBody, spanCountRow);
    formGrid.appendChild(spanCard);

    // 2C. Tap BPM 保留功能區
    const tapCard = document.createElement('div');
    tapCard.className = 'popup-tap-manual-card';

    const tapStats = document.createElement('div');
    tapStats.className = 'popup-tap-manual-header';
    tapStats.innerHTML = `
        <span>${t('popup.tapBpm.count')}<strong id="tapBpmCount">0</strong></span>
        <span id="tapBpmMsg" class="popup-tap-message">${t('popup.tapBpm.msgNotStarted')}</span>
    `;

    const tapActions = document.createElement('div');
    tapActions.className = 'popup-tap-manual-actions';

    const tapButton = document.createElement('button');
    tapButton.type = 'button';
    tapButton.className = 'popup-tap-btn';
    tapButton.textContent = t('popup.tapBpm.btnTap');

    const resetTapButton = document.createElement('button');
    resetTapButton.type = 'button';
    resetTapButton.className = 'popup-tap-reset-btn';
    resetTapButton.textContent = t('popup.tapBpm.btnReset');

    tapActions.append(tapButton, resetTapButton);
    tapCard.append(tapStats, tapActions);
    formGrid.appendChild(tapCard);

    // 2D. 計數拍 Row
    const beatsRow = document.createElement('div');
    beatsRow.className = 'popup-tap-row';
    const beatsLabel = document.createElement('label');
    beatsLabel.className = 'popup-tap-label';
    beatsLabel.textContent = t('popup.tapBpm.beatsPerMeasure');

    const beatsInput = document.createElement('input');
    beatsInput.type = 'number';
    beatsInput.min = '1';
    beatsInput.max = '32';
    beatsInput.step = '1';
    beatsInput.className = 'popup-setting-input';
    beatsInput.value = String(beatsPerMeasure);

    beatsRow.append(beatsLabel, beatsInput);
    formGrid.appendChild(beatsRow);

    // 2E. 偏移 Row
    const offsetRow = document.createElement('div');
    offsetRow.className = 'popup-tap-row';
    const offsetLabel = document.createElement('label');
    offsetLabel.className = 'popup-tap-label';
    offsetLabel.textContent = t('popup.tapBpm.offsetLabel');

    const offsetControl = document.createElement('div');
    offsetControl.className = 'popup-tap-field-col';
    const offsetLine = document.createElement('div');
    offsetLine.className = 'popup-tap-input-group';

    const offsetField = document.createElement('input');
    offsetField.type = 'number';
    offsetField.step = '0.001';
    offsetField.className = 'popup-setting-input';
    offsetField.value = currentOffset.toFixed(3);

    const detectOffsetBtn = document.createElement('button');
    detectOffsetBtn.type = 'button';
    detectOffsetBtn.className = 'popup-btn popup-btn-secondary popup-btn-sm popup-tap-detect-btn';
    detectOffsetBtn.textContent = t('popup.tapBpm.autoDetect');

    const jumpOffsetBtn = document.createElement('button');
    jumpOffsetBtn.type = 'button';
    jumpOffsetBtn.className = 'popup-btn popup-btn-secondary popup-btn-sm popup-tap-jump-btn';
    jumpOffsetBtn.textContent = '⌖';
    jumpOffsetBtn.title = t('popup.tapBpm.jumpToOffset');

    const offsetResultText = document.createElement('div');
    offsetResultText.className = 'popup-tap-detect-result';
    offsetResultText.style.display = 'none';

    offsetLine.append(offsetField, detectOffsetBtn, jumpOffsetBtn);
    offsetControl.append(offsetLine, offsetResultText);
    offsetRow.append(offsetLabel, offsetControl);
    formGrid.appendChild(offsetRow);

    // 分隔線
    const divider = document.createElement('div');
    divider.className = 'popup-tap-divider';
    formGrid.appendChild(divider);

    // 2F. 細分 (1/4, 1/8, 1/16)
    const subRow = document.createElement('div');
    subRow.className = 'popup-tap-row';
    const subLabel = document.createElement('label');
    subLabel.className = 'popup-tap-label';
    subLabel.textContent = t('popup.tapBpm.subdivision');

    const subGroup = document.createElement('div');
    subGroup.className = 'popup-tap-sub-group';
    const subButtons = [4, 8, 16].map(val => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'popup-tap-sub-btn';
        if (val === subdivision) btn.classList.add('active');
        btn.dataset.sub = String(val);
        btn.textContent = `1/${val}`;
        btn.addEventListener('click', () => {
            subdivision = val;
            subButtons.forEach(b => b.classList.toggle('active', b === btn));
            resetAuditionSchedule();
            drawPreview();
        });
        subGroup.appendChild(btn);
        return btn;
    });
    subRow.append(subLabel, subGroup);
    formGrid.appendChild(subRow);

    // 2G. 啟用音效按鈕 + 音效音量 (Clock)
    const volRow = document.createElement('div');
    volRow.className = 'popup-tap-row';
    const volLabel = document.createElement('label');
    volLabel.className = 'popup-tap-label';
    volLabel.textContent = t('popup.tapBpm.sfxVolume');

    const volControl = document.createElement('div');
    volControl.className = 'popup-tap-sfx-control';

    const sfxToggleBtn = document.createElement('button');
    sfxToggleBtn.type = 'button';
    sfxToggleBtn.className = 'popup-tap-sfx-toggle active';
    sfxToggleBtn.textContent = t('popup.tapBpm.enableSfx');
    sfxToggleBtn.setAttribute('aria-pressed', 'true');

    const volSlider = createSettingRangeInput(sfxVolumePercent, 0, 100, 1, (val) => {
        sfxVolumePercent = clamp(Number(val) || 0, 0, 100);
    }, { suffix: '%' });

    sfxToggleBtn.addEventListener('click', () => {
        isSfxEnabled = !isSfxEnabled;
        sfxToggleBtn.classList.toggle('active', isSfxEnabled);
        sfxToggleBtn.setAttribute('aria-pressed', String(isSfxEnabled));
        volSlider.classList.toggle('is-muted', !isSfxEnabled);
        if (!isSfxEnabled && isAuditioning) {
            audioManager?.stopAllScheduledSounds?.();
        }
    });

    volControl.append(sfxToggleBtn, volSlider);
    volRow.append(volLabel, volControl);
    formGrid.appendChild(volRow);

    // 2H. 試聽傳輸控制列 (圖 2：Stop + Play/Pause)
    const auditionRow = document.createElement('div');
    auditionRow.className = 'popup-tap-transport-bar';

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'popup-tap-transport-btn';
    stopBtn.title = t('popup.tapBpm.stopAndReturn');
    stopBtn.setAttribute('aria-label', t('popup.tapBpm.stopAndReturn'));
    stopBtn.innerHTML = '<span class="material-symbols-outlined" translate="no">stop</span>';

    const auditionBtn = document.createElement('button');
    auditionBtn.type = 'button';
    auditionBtn.className = 'popup-tap-transport-btn';
    auditionBtn.title = t('popup.tapBpm.startAudition');
    auditionBtn.setAttribute('aria-label', t('popup.tapBpm.startAudition'));
    auditionBtn.innerHTML = '<span class="material-symbols-outlined" translate="no">play_arrow</span>';

    auditionRow.append(stopBtn, auditionBtn);
    formGrid.appendChild(auditionRow);

    container.appendChild(formGrid);

    // === 3. 變速段同步與量測更新邏輯 ===
    const updateSpanUI = () => {
        const seg = getActiveSegment();
        const segStartAudio = currentOffset + seg.time;
        spanStartBadge.textContent = `${t('popup.tapBpm.spanStart')}: ${segStartAudio.toFixed(3)}s`;

        if (measureEndAudioTime !== null && isFinite(measureEndAudioTime) && measureEndAudioTime > segStartAudio + 0.01) {
            if (document.activeElement !== spanEndInput) {
                spanEndInput.value = measureEndAudioTime.toFixed(3);
            }
            const measured = computeBpmFromSpan(segStartAudio, measureEndAudioTime, spanCount, spanUnit, beatsPerMeasure);
            spanBpmOut.textContent = measured ? `= ${measured.toFixed(3)} BPM` : '--';
        } else {
            if (document.activeElement !== spanEndInput) {
                spanEndInput.value = '';
            }
            spanBpmOut.textContent = '';
        }
    };

    const renderSegmentsBar = () => {
        segmentsBar.innerHTML = '';

        segments.forEach((seg, idx) => {
            const row = document.createElement('div');
            row.className = 'popup-tap-seg-item';
            if (idx === activeSegIndex) row.classList.add('active');

            const labelBtn = document.createElement('button');
            labelBtn.type = 'button';
            labelBtn.className = 'popup-tap-seg-item-btn';
            const audioT = currentOffset + seg.time;
            labelBtn.innerHTML = `
                <span class="popup-tap-seg-idx">#${idx + 1}</span>
                <span class="popup-tap-seg-bpm">${formatBpmValue(seg.bpm)} BPM</span>
                <span class="popup-tap-seg-time">@ ${audioT.toFixed(3)}s</span>
            `;
            labelBtn.addEventListener('click', () => {
                selectSegment(idx, true);
            });
            row.appendChild(labelBtn);

            if (idx > 0) {
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'popup-tap-seg-item-del';
                delBtn.textContent = '×';
                delBtn.title = t('popup.tapBpm.deleteSegment');
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    segments.splice(idx, 1);
                    if (activeSegIndex >= segments.length) {
                        activeSegIndex = segments.length - 1;
                    } else if (activeSegIndex === idx) {
                        activeSegIndex = Math.max(0, idx - 1);
                    }
                    measureEndAudioTime = null;
                    syncActiveSegmentUI();
                    resetAuditionSchedule();
                    drawPreview();
                });
                row.appendChild(delBtn);
            }

            segmentsBar.appendChild(row);
        });
    };

    const syncActiveSegmentUI = () => {
        const seg = getActiveSegment();
        if (document.activeElement !== bpmInput) {
            bpmInput.value = formatBpmValue(seg.bpm);
        }
        bpmResultText.style.display = 'none';
        updateSpanUI();
        renderSegmentsBar();
    };

    const selectSegment = (idx, seekToSeg = false) => {
        if (idx < 0 || idx >= segments.length) return;
        activeSegIndex = idx;
        measureEndAudioTime = null;
        if (seekToSeg) {
            previewTime = Math.max(0, currentOffset + segments[idx].time);
        }
        syncActiveSegmentUI();
        if (seekToSeg && isAuditioning) {
            startAudition();
        } else {
            drawPreview();
        }
    };

    const insertOrSelectSegmentAtRelTime = (relTime) => {
        const cleanRel = Math.max(0, Math.round(relTime * 10000) / 10000);
        const existingIdx = segments.findIndex(s => Math.abs(s.time - cleanRel) < 0.01);
        if (existingIdx !== -1) {
            selectSegment(existingIdx, false);
            return;
        }
        // 新段預設繼承前一段的 BPM 作為起始參考值
        let inheritBpm = segments[0].bpm;
        for (const s of segments) {
            if (s.time <= cleanRel) inheritBpm = s.bpm;
        }
        segments.push({ time: cleanRel, bpm: inheritBpm });
        segments.sort((a, b) => a.time - b.time);
        const insertedIdx = segments.findIndex(s => Math.abs(s.time - cleanRel) < 0.001);
        activeSegIndex = insertedIdx !== -1 ? insertedIdx : 0;
        measureEndAudioTime = null;
        syncActiveSegmentUI();
        resetAuditionSchedule();
        drawPreview();
    };

    const applyActiveSpanMeasurement = () => {
        const seg = getActiveSegment();
        const segStartAudio = currentOffset + seg.time;
        if (measureEndAudioTime === null || !isFinite(measureEndAudioTime) || measureEndAudioTime <= segStartAudio + 0.01) {
            updateSpanUI();
            return;
        }
        const measured = computeBpmFromSpan(segStartAudio, measureEndAudioTime, spanCount, spanUnit, beatsPerMeasure);
        if (measured && isFinite(measured) && measured > 0) {
            seg.bpm = measured;
            bpmInput.value = formatBpmValue(measured);
            resetAuditionSchedule();
            renderSegmentsBar();
            drawPreview();
        }
        updateSpanUI();
    };

    // 初始化表單數值
    syncActiveSegmentUI();

    // === 4. Web Audio Sample-Accurate Multi-BPM Clock 試聽排程器 ===
    function resetAuditionSchedule() {
        if (!isAuditioning || !audioManager) return;
        audioManager.stopAllScheduledSounds?.();
        const bgmTime = audioManager.getBGMTime?.() ?? previewTime;
        lastScheduledClickAudioTime = bgmTime - 0.002;
    }

    const syncTransportUI = () => {
        const iconSpan = auditionBtn.querySelector('.material-symbols-outlined');
        if (iconSpan) {
            iconSpan.textContent = isAuditioning ? 'pause' : 'play_arrow';
        }
        const label = isAuditioning ? t('popup.tapBpm.stopAudition') : t('popup.tapBpm.startAudition');
        auditionBtn.title = label;
        auditionBtn.setAttribute('aria-label', label);
        auditionBtn.classList.toggle('is-playing', isAuditioning);
    };

    function stopAudition(returnToLastStart = false) {
        if (auditionRafId !== null) {
            cancelAnimationFrame(auditionRafId);
            auditionRafId = null;
        }
        if (isAuditioning) {
            isAuditioning = false;
            audioManager?.stopBGM?.();
        }
        if (returnToLastStart) {
            previewTime = clamp(lastAuditionStartTime, 0, Math.max(getAudioDuration(), currentOffset + 5, 10));
        }
        syncTransportUI();
        drawPreview();
    }

    function startAudition(recordStartTime = false) {
        if (!audioManager?.bgmBuffer) {
            simpleToast({ content: t('toast.needBgm'), type: 'warning' });
            return;
        }
        stopAudition(false);

        const dur = getAudioDuration();
        if (previewTime >= dur) previewTime = 0;
        if (recordStartTime) {
            lastAuditionStartTime = previewTime;
        }

        isAuditioning = true;
        syncTransportUI();

        audioManager.playBGM(previewTime, 1);
        lastScheduledClickAudioTime = previewTime - 0.002;

        const lookAheadSec = 0.12;
        const tick = () => {
            if (!isAuditioning) return;
            const bgmTime = audioManager.getBGMTime?.();
            if (bgmTime === null || bgmTime === undefined) {
                auditionRafId = requestAnimationFrame(tick);
                return;
            }
            if (bgmTime >= dur) {
                previewTime = dur;
                stopAudition(false);
                return;
            }

            previewTime = bgmTime;
            const playbackRate = audioManager.playbackRate || 1;
            const baseVol = isSfxEnabled ? clamp(sfxVolumePercent / 100, 0, 1) : 0;
            const stepsPerBeat = Math.max(1, Math.round(subdivision / 4));
            const targetEnd = bgmTime + lookAheadSec;

            for (let sIdx = 0; sIdx < segments.length; sIdx++) {
                const seg = segments[sIdx];
                const nextSeg = segments[sIdx + 1];
                const safeBpm = (isFinite(seg.bpm) && seg.bpm > 0) ? seg.bpm : 120;
                const stepSec = (60 / safeBpm) * (4 / subdivision);
                const segAudioStart = currentOffset + seg.time;
                const segAudioEnd = nextSeg ? (currentOffset + nextSeg.time - 0.002) : Infinity;

                if (segAudioEnd < bgmTime - 0.015 || segAudioStart > targetEnd) continue;

                const minTime = Math.max(bgmTime - 0.015, lastScheduledClickAudioTime + 0.002, segAudioStart);
                let k = Math.max(0, Math.ceil((minTime - segAudioStart - 1e-6) / stepSec));

                let guard = 0;
                while (guard < 48) {
                    const clickAudioTime = segAudioStart + k * stepSec;
                    if (clickAudioTime > targetEnd || clickAudioTime > segAudioEnd) break;
                    if (clickAudioTime > lastScheduledClickAudioTime + 0.001 && audioManager.ctx) {
                        const ctxTime = audioManager.ctx.currentTime + Math.max(0, (clickAudioTime - bgmTime) / playbackRate);
                        const isMainBeat = (k % stepsPerBeat) === 0;
                        const clickVol = isMainBeat ? baseVol : baseVol * 0.52;
                        if (isSfxEnabled && clickVol > 0.005) {
                            audioManager.play('clock', false, clickVol, ctxTime);
                        }
                        lastScheduledClickAudioTime = clickAudioTime;
                    }
                    k++;
                    guard++;
                }
            }

            drawPreview();
            auditionRafId = requestAnimationFrame(tick);
        };

        auditionRafId = requestAnimationFrame(tick);
    }

    auditionBtn.addEventListener('click', () => {
        if (isAuditioning) stopAudition(false);
        else startAudition(true);
    });

    stopBtn.addEventListener('click', () => {
        stopAudition(true);
    });

    // === 5. 表單與量測事件綁定 ===
    bpmInput.addEventListener('input', () => {
        const v = parseFloat(bpmInput.value);
        if (isFinite(v) && v > 0) {
            getActiveSegment().bpm = Math.round(v * 1000) / 1000;
            resetAuditionSchedule();
            renderSegmentsBar();
            drawPreview();
        }
    });

    spanEndInput.addEventListener('input', () => {
        const v = parseFloat(spanEndInput.value);
        if (isFinite(v)) {
            measureEndAudioTime = v;
            applyActiveSpanMeasurement();
        } else {
            measureEndAudioTime = null;
            updateSpanUI();
            drawPreview();
        }
    });

    setSpanEndHereBtn.addEventListener('click', () => {
        const segStartAudio = currentOffset + getActiveSegment().time;
        if (previewTime <= segStartAudio + 0.01) {
            simpleToast({ content: t('popup.tapBpm.spanEndAfterStart'), type: 'warning', timeout: 1800 });
            return;
        }
        measureEndAudioTime = Math.round(previewTime * 1000) / 1000;
        spanEndInput.value = measureEndAudioTime.toFixed(3);
        applyActiveSpanMeasurement();
    });

    snapSpanEndBtn.addEventListener('click', () => {
        if (!audioManager?.bgmBuffer) {
            simpleToast({ content: t('toast.needBgm'), type: 'warning' });
            return;
        }
        const target = (measureEndAudioTime !== null && isFinite(measureEndAudioTime))
            ? measureEndAudioTime
            : previewTime;
        const snapped = snapTimeToNearestOnset(audioManager.bgmBuffer, target, 0.04);
        const segStartAudio = currentOffset + getActiveSegment().time;
        if (snapped <= segStartAudio + 0.01) {
            simpleToast({ content: t('popup.tapBpm.spanEndAfterStart'), type: 'warning', timeout: 1800 });
            return;
        }
        measureEndAudioTime = snapped;
        spanEndInput.value = snapped.toFixed(3);
        applyActiveSpanMeasurement();
    });

    clearSpanEndBtn.addEventListener('click', () => {
        measureEndAudioTime = null;
        spanEndInput.value = '';
        updateSpanUI();
        drawPreview();
    });

    spanCountInput.addEventListener('input', () => {
        const v = parseFloat(spanCountInput.value);
        if (isFinite(v) && v > 0) {
            spanCount = v;
            applyActiveSpanMeasurement();
        }
    });

    spanUnitSelect.addEventListener('change', () => {
        spanUnit = spanUnitSelect.value === 'beat' ? 'beat' : 'measure';
        applyActiveSpanMeasurement();
    });

    beatsInput.addEventListener('input', () => {
        const v = parseInt(beatsInput.value, 10);
        if (isFinite(v) && v >= 1 && v <= 32) {
            beatsPerMeasure = v;
            applyActiveSpanMeasurement();
            drawPreview();
        }
    });

    offsetField.addEventListener('input', () => {
        const v = parseFloat(offsetField.value);
        if (isFinite(v)) {
            currentOffset = v;
            updateSpanUI();
            renderSegmentsBar();
            resetAuditionSchedule();
            drawPreview();
        }
    });

    jumpOffsetBtn.addEventListener('click', () => {
        const target = Math.max(0, Math.min(getAudioDuration() || Infinity, currentOffset + getActiveSegment().time));
        previewTime = target;
        if (isAuditioning) {
            startAudition();
        } else {
            drawPreview();
        }
    });

    detectBpmBtn.addEventListener('click', () => {
        if (!audioManager?.bgmBuffer) {
            simpleToast({ content: t('toast.needBgm'), type: 'warning' });
            return;
        }
        const { startAudio, endAudio } = getActiveSegmentAudioRange();
        const res = detectBpmFromAudioBuffer(audioManager.bgmBuffer, {
            startTime: startAudio,
            endTime: endAudio
        });
        if (!res || !isFinite(res.bpm)) {
            simpleToast({ content: t('toast.tapBpmError'), type: 'error' });
            return;
        }
        getActiveSegment().bpm = res.bpm;
        bpmInput.value = res.bpm.toFixed(3);
        bpmResultText.textContent = t('popup.tapBpm.detectBpmResult', { bpm: res.bpm.toFixed(3) });
        bpmResultText.style.display = 'block';
        bpmResultText.onclick = () => {
            getActiveSegment().bpm = res.bpm;
            bpmInput.value = res.bpm.toFixed(3);
            resetAuditionSchedule();
            renderSegmentsBar();
            drawPreview();
        };
        resetAuditionSchedule();
        renderSegmentsBar();
        drawPreview();
    });

    detectOffsetBtn.addEventListener('click', () => {
        if (!audioManager?.bgmBuffer) {
            simpleToast({ content: t('toast.needBgm'), type: 'warning' });
            return;
        }
        const res = detectOffsetFromAudioBuffer(audioManager.bgmBuffer, segments[0].bpm);
        if (!res || !isFinite(res.offset)) {
            simpleToast({ content: t('toast.tapBpmError'), type: 'error' });
            return;
        }
        currentOffset = res.offset;
        offsetField.value = res.offset.toFixed(3);
        previewTime = Math.max(0, currentOffset);
        updateSpanUI();
        renderSegmentsBar();
        offsetResultText.textContent = t('popup.tapBpm.detectOffsetResult', { offset: res.offset.toFixed(3) });
        offsetResultText.style.display = 'block';
        offsetResultText.onclick = () => {
            currentOffset = res.offset;
            offsetField.value = res.offset.toFixed(3);
            previewTime = Math.max(0, currentOffset);
            updateSpanUI();
            renderSegmentsBar();
            if (isAuditioning) startAudition();
            else drawPreview();
        };
        if (isAuditioning) startAudition();
        else drawPreview();
    });

    // Tap BPM 邏輯
    const updateTapDisplay = () => {
        const countElem = container.querySelector('#tapBpmCount');
        const msgElem = container.querySelector('#tapBpmMsg');
        if (countElem) countElem.textContent = String(taps.length);

        if (taps.length < 2) {
            if (msgElem) {
                msgElem.textContent = taps.length === 0
                    ? t('popup.tapBpm.msgNotStarted')
                    : t('popup.tapBpm.msgOneMore');
            }
            return;
        }

        const intervals = [];
        for (let i = 1; i < taps.length; i++) {
            intervals.push(taps[i] - taps[i - 1]);
        }
        const avg = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
        const bpm = 60000 / avg;
        if (isFinite(bpm) && bpm > 0) {
            const rounded = Math.round(bpm * 100) / 100;
            getActiveSegment().bpm = rounded;
            bpmInput.value = bpm.toFixed(2);
            if (msgElem) {
                msgElem.textContent = `${bpm.toFixed(2)} BPM (${t('popup.tapBpm.msgIntervals', { count: intervals.length })})`;
            }
            resetAuditionSchedule();
            renderSegmentsBar();
            drawPreview();
        }
    };

    tapButton.addEventListener('click', () => {
        taps.push(performance.now());
        if (taps.length > 16) taps.shift();
        updateTapDisplay();
    });

    resetTapButton.addEventListener('click', () => {
        taps = [];
        updateTapDisplay();
    });

    // === 6. Preview 縮放、點擊黃線插點與量測終點拖曳 ===
    zoomInBtn.addEventListener('click', () => {
        previewZoom = clamp(previewZoom * 1.25, 50, 1200);
        drawPreview();
    });
    zoomOutBtn.addEventListener('click', () => {
        previewZoom = clamp(previewZoom / 1.25, 50, 1200);
        drawPreview();
    });

    const getCanvasX = (clientX) => {
        const rect = previewCanvas.getBoundingClientRect();
        if (!rect.width) return 0;
        return (clientX - rect.left) * (previewCanvas.width / rect.width);
    };

    let dragMode = 'none'; // 'none' | 'pan' | 'measure-end'
    let dragStartX = 0;
    let dragStartTime = 0;
    let hasDragged = false;
    let resumeAfterDrag = false;

    const hitTestMeasureEndHandle = (canvasX) => {
        if (measureEndAudioTime === null || !isFinite(measureEndAudioTime)) return false;
        const hw = previewCanvas.width * 0.5;
        const centerRel = previewTime - currentOffset;
        const endX = hw + ((measureEndAudioTime - currentOffset) - centerRel) * previewZoom;
        return Math.abs(canvasX - endX) <= 10;
    };

    const startDrag = (clientX) => {
        const canvasX = getCanvasX(clientX);
        dragStartX = clientX;
        hasDragged = false;
        resumeAfterDrag = isAuditioning;

        if (hitTestMeasureEndHandle(canvasX)) {
            dragMode = 'measure-end';
            dragStartTime = measureEndAudioTime;
            if (isAuditioning) stopAudition();
            return;
        }

        dragMode = 'pan';
        dragStartTime = previewTime;
        if (isAuditioning) stopAudition();
    };

    const onMouseMove = (e) => {
        if (dragMode === 'measure-end') {
            const dxPx = (e.clientX - dragStartX) * (previewCanvas.width / Math.max(1, previewCanvas.getBoundingClientRect().width));
            const segStartAudio = currentOffset + getActiveSegment().time;
            const maxT = Math.max(getAudioDuration(), segStartAudio + 20);
            measureEndAudioTime = clamp(Math.round((dragStartTime + dxPx / previewZoom) * 1000) / 1000, segStartAudio + 0.05, maxT);
            spanEndInput.value = measureEndAudioTime.toFixed(3);
            applyActiveSpanMeasurement();
            return;
        }

        if (dragMode === 'pan') {
            const dxCss = e.clientX - dragStartX;
            if (Math.abs(dxCss) >= 4) hasDragged = true;
            if (!hasDragged) return;
            const dxCanvas = dxCss * (previewCanvas.width / Math.max(1, previewCanvas.getBoundingClientRect().width));
            const maxT = Math.max(getAudioDuration(), currentOffset + 5, 10);
            previewTime = clamp(dragStartTime - dxCanvas / previewZoom, 0, maxT);
            hoverTarget = null;
            drawPreview();
            return;
        }

        // Hover 偵測（只在指標位於 previewCanvas 內時顯示）
        const rect = previewCanvas.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
            if (hoverTarget) {
                hoverTarget = null;
                previewCanvasHost.style.cursor = 'grab';
                drawPreview();
            }
            return;
        }

        const canvasX = getCanvasX(e.clientX);
        if (hitTestMeasureEndHandle(canvasX)) {
            if (hoverTarget) {
                hoverTarget = null;
                drawPreview();
            }
            previewCanvasHost.style.cursor = 'ew-resize';
            return;
        }

        const hit = hitTestYellowLinesOrAnchors(
            canvasX,
            previewCanvas.width,
            previewTime,
            currentOffset,
            previewZoom,
            segments,
            beatsPerMeasure,
            subdivision,
            10
        );
        const changed = (hit?.relTime !== hoverTarget?.relTime) || (hit?.kind !== hoverTarget?.kind);
        hoverTarget = hit;
        previewCanvasHost.style.cursor = hit ? 'pointer' : 'grab';
        if (changed) drawPreview();
    };

    const onTouchMove = (e) => {
        if (e.touches.length === 0) return;
        const touch = e.touches[0];
        if (dragMode === 'pan') {
            const dxCss = touch.clientX - dragStartX;
            if (Math.abs(dxCss) >= 4) hasDragged = true;
            if (!hasDragged) return;
            const dxCanvas = dxCss * (previewCanvas.width / Math.max(1, previewCanvas.getBoundingClientRect().width));
            const maxT = Math.max(getAudioDuration(), currentOffset + 5, 10);
            previewTime = clamp(dragStartTime - dxCanvas / previewZoom, 0, maxT);
            drawPreview();
        }
    };

    const endDrag = (e) => {
        if (dragMode === 'none') return;
        const prevMode = dragMode;
        dragMode = 'none';

        if (prevMode === 'pan' && !hasDragged && e && typeof e.clientX === 'number') {
            const canvasX = getCanvasX(e.clientX);
            const hit = hitTestYellowLinesOrAnchors(
                canvasX,
                previewCanvas.width,
                previewTime,
                currentOffset,
                previewZoom,
                segments,
                beatsPerMeasure,
                subdivision,
                10
            );
            if (hit) {
                if (hit.kind === 'anchor') {
                    selectSegment(hit.segIndex, false);
                } else {
                    insertOrSelectSegmentAtRelTime(hit.relTime);
                }
            }
        }

        if (resumeAfterDrag) {
            resumeAfterDrag = false;
            startAudition();
        }
    };

    previewCanvas.addEventListener('mousedown', (e) => startDrag(e.clientX));
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', endDrag);

    previewCanvas.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) startDrag(e.touches[0].clientX);
    }, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', endDrag);

    previewCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const maxT = Math.max(getAudioDuration(), currentOffset + 5, 10);
        previewTime = clamp(previewTime + delta / previewZoom, 0, maxT);
        if (isAuditioning) {
            startAudition();
        } else {
            drawPreview();
        }
    }, { passive: false });

    const onWindowResize = () => drawPreview();
    window.addEventListener('resize', onWindowResize);

    // === 7. 套用 / 寫回編輯器輔助 ===
    const applyOffsetToProject = () => {
        const safeOffset = isFinite(currentOffset) ? Math.round(currentOffset * 1000) / 1000 : 0;
        if (typeof setMusicDelay === 'function') setMusicDelay(safeOffset);
        if (offsetInput) offsetInput.value = safeOffset;
        if (typeof offsetInputDebounce === 'function') offsetInputDebounce();
        if (typeof onRedraw === 'function') onRedraw();
    };

    const commitEditorText = (newText, selStart, selEnd) => {
        if (typeof updateEditorAndSave === 'function') {
            updateEditorAndSave(newText);
        } else if (editorInput) {
            editorInput.value = newText;
            if (typeof applyHighlight === 'function') applyHighlight(newText);
            if (typeof inputDebounce === 'function') inputDebounce();
        }
        if (typeof setEditorCss === 'function') setEditorCss();
        if (editorInput && typeof selStart === 'number' && typeof selEnd === 'number') {
            setTimeout(() => {
                try {
                    editorInput.focus();
                    editorInput.setSelectionRange?.(selStart, selEnd);
                } catch (_) { }
            }, 30);
        }
    };

    popupWindow({
        title: t('popup.tapBpm.title'),
        customContent: container,
        width: '94%',
        maxWidth: '560px',
        onClose: () => {
            stopAudition();
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', endDrag);
            window.removeEventListener('touchmove', onTouchMove, { passive: true });
            window.removeEventListener('touchend', endDrag);
            window.removeEventListener('resize', onWindowResize);
        },
        buttons: [
            {
                text: t('popup.tapBpm.btnApplyOffset'),
                onClick: () => {
                    applyOffsetToProject();
                    simpleToast({
                        content: t('toast.offsetApplied', { offset: currentOffset.toFixed(3) }),
                        type: 'success',
                        timeout: 1800
                    });
                }
            },
            {
                text: t('popup.tapBpm.btnInsertSegment'),
                onClick: (ctx) => {
                    const seg = getActiveSegment();
                    if (!isFinite(seg.bpm) || seg.bpm <= 0) {
                        simpleToast({ content: t('toast.tapBpmError'), type: 'error', timeout: 1800 });
                        return;
                    }
                    const fullText = editorInput?.value || '';
                    const res = buildInsertedSegmentChartText(fullText, seg, {
                        dataIndexToTime: typeof getDataIndexToTime === 'function' ? getDataIndexToTime() : [],
                        findCommaCharIndex,
                        cursorPos: editorInput?.selectionStart ?? fullText.length
                    });
                    if (res) {
                        commitEditorText(res.newText, res.selStart, res.selEnd);
                    }
                    applyOffsetToProject();
                    simpleToast({ content: t('toast.tapBpmSuccess', { bpm: formatBpmValue(seg.bpm) }), type: 'success', timeout: 1800 });
                    ctx.close();
                }
            },
            {
                text: t('popup.tapBpm.btnGenerateSkeleton'),
                onClick: (ctx) => {
                    if (editorInput && editorInput.value.trim().length > 0) {
                        if (!confirm(t('popup.tapBpm.confirmOverwriteSkeleton'))) return;
                    }
                    const skeleton = buildMultiBpmChartSkeleton(segments, beatsPerMeasure, subdivision);
                    commitEditorText(skeleton, 0, skeleton.length);
                    applyOffsetToProject();
                    simpleToast({
                        content: t('toast.multiBpmSkeletonGenerated', { count: segments.length }),
                        type: 'success',
                        timeout: 1800
                    });
                    ctx.close();
                }
            },
            {
                text: t('popup.close'),
                hideOnClick: true
            }
        ]
    });

    requestAnimationFrame(() => drawPreview());
}
