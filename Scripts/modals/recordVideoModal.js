import { ensureMediabunny, simpleToast, popupWindow, getButton } from '../helper.js';
import {
    createSettingSectionTitle,
    createSettingRow,
    createSettingDropdown,
    createSettingNumberInput,
    createSettingRangeInput,
    createSettingCheckbox,
} from './settingsModal.js';
import { videoRender } from '../features/videoRender.js';
import { SimaiLogicControler } from '../core/simaiLogicControler.js';
import { SimaiRenderer } from '../renderer.js';
import { t } from '../i18n.js';

/**
 * 開啟錄製影片彈窗
 */
export async function openRecordVideoModal({
    audioManager,
    canvas,
    getRenderer,
    playButton,
    getEndTime,
    getMusicDelay,
    editorBackgroundImage,
    editorBackgroundVideo,
    getNotes,
    getPlayScoreRes,
    getMaidata,
    getNowDifficulty,
    getSettings,
    draw,
}) {
    if (!window.Mediabunny) {
        try {
            await ensureMediabunny();
        } catch (e) {
            console.warn('載入 Mediabunny 失敗:', e);
        }
    }
    if (!window.Mediabunny) {
        simpleToast({ content: t('toast.mediabunnyMissing'), type: 'error' });
        return;
    }

    // 若主畫面正在播放，先暫停避免干擾
    if (playButton && playButton.dataset.playing === 'true') {
        playButton.click();
    }

    const container = document.createElement('div');
    container.className = 'popup-form-container record-video-modal';

    const inputRefs = {};
    const endTime = typeof getEndTime === 'function' ? getEndTime() : 0;
    const musicDelay = typeof getMusicDelay === 'function' ? getMusicDelay() : 0;
    const settings = typeof getSettings === 'function' ? getSettings() : {};
    const maxDuration = Math.max(0.1, Number((endTime + musicDelay).toFixed(2))); // 總曲長
    const mainRenderer = typeof getRenderer === 'function' ? getRenderer() : null;
    const notes = typeof getNotes === 'function' ? getNotes() : [];
    const playScoreRes = typeof getPlayScoreRes === 'function' ? getPlayScoreRes() : { tap: 0, hold: 0, slide: 0, touch: 0, break: 0, score: 0, breakScore: 0, invScore: 0 };
    const maidata = typeof getMaidata === 'function' ? getMaidata() : {};

    // 格式化時間 (分:秒.毫秒)
    const formatTime = (sec) => {
        const s = Math.max(0, Number(sec) || 0);
        const m = Math.floor(s / 60);
        const rem = (s % 60).toFixed(2).padStart(5, '0');
        return `${String(m).padStart(2, '0')}:${rem}`;
    };

    // ==========================================
    // 1. 核心：建立【渲染視圖預覽】與獨立渲染器
    // ==========================================
    const previewCanvas = document.createElement('canvas');
    previewCanvas.className = 'render-preview-canvas';
    previewCanvas.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;';

    const previewCtx = previewCanvas.getContext('2d');
    const previewRenderer = new SimaiRenderer(previewCanvas, settings);
    previewRenderer._isRenderingVideo = true;
    if (mainRenderer) {
        if (mainRenderer.images) previewRenderer.setImages(mainRenderer.images);
        if (mainRenderer._tintCache) previewRenderer._tintCache = mainRenderer._tintCache;
        if (mainRenderer.scale) previewRenderer.scale = mainRenderer.scale;
    }
    const previewLogicControler = new SimaiLogicControler();

    // 開啟全域設定 (點擊 topUtility 中的 settings 按鈕)
    const openSettings = () => {
        const btn = getButton('settings', 'utility');
        if (btn) {
            btn.click();
        } else {
            console.warn('未找到設定按鈕 (utilityButton settings)');
        }
    };

    // 預覽卡片介面
    const previewCard = document.createElement('div');
    previewCard.className = 'render-preview-card record-video-preview-card';

    const previewHeader = document.createElement('div');
    previewHeader.className = 'record-video-preview-header';

    const previewTitle = document.createElement('span');
    previewTitle.className = 'record-video-preview-title';
    previewTitle.innerHTML = `<span class="material-symbols-outlined" translate="no">videocam</span><span>${t('popup.recordVideo.previewTitle')}</span>`;

    const previewHeaderRight = document.createElement('div');
    previewHeaderRight.className = 'record-video-preview-actions';

    const previewTimeBadge = document.createElement('span');
    previewTimeBadge.className = 'record-video-time-badge';

    const headerSettingsBtn = document.createElement('button');
    headerSettingsBtn.type = 'button';
    headerSettingsBtn.className = 'popup-setting-sub-reset-btn record-video-header-btn';
    headerSettingsBtn.title = t('menu.settings') || '設定';
    headerSettingsBtn.innerHTML = `<span class="material-symbols-outlined" translate="no">settings</span><span>${t('menu.settings') || '設定'}</span>`;
    headerSettingsBtn.addEventListener('click', openSettings);

    previewHeaderRight.append(previewTimeBadge, headerSettingsBtn);
    previewHeader.append(previewTitle, previewHeaderRight);

    const previewViewport = document.createElement('div');
    previewViewport.className = 'render-preview-viewport record-video-preview-viewport';
    previewViewport.appendChild(previewCanvas);

    // 時間軸與控制項
    const previewControls = document.createElement('div');
    previewControls.className = 'record-video-preview-controls';

    const createSmallBtn = (html, title, onClick) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'popup-setting-kb-icon-btn record-video-ctrl-btn';
        btn.innerHTML = html;
        btn.title = title;
        btn.addEventListener('click', onClick);
        return btn;
    };

    let isPreviewPlaying = false;
    let previewPlayRafId = null;
    let lastPlayTimestamp = 0;

    const playPauseBtn = createSmallBtn('<span class="material-symbols-outlined" translate="no">play_arrow</span>', t('popup.recordVideo.playPreview'), () => {
        if (isPreviewPlaying) {
            stopPreviewPlay();
        } else {
            startPreviewPlay();
        }
    });

    const timelineSlider = document.createElement('input');
    timelineSlider.type = 'range';
    timelineSlider.min = '0';
    timelineSlider.max = String(maxDuration);
    timelineSlider.step = '0.01';
    timelineSlider.value = '0';
    timelineSlider.className = 'popup-setting-range record-video-timeline-slider';

    const updateTimelineSliderFill = () => {
        const minNum = parseFloat(timelineSlider.min) || 0;
        const maxNum = parseFloat(timelineSlider.max) || 0;
        const curVal = parseFloat(timelineSlider.value) || 0;
        const pct = (maxNum <= minNum) ? 0 : Math.max(0, Math.min(100, ((curVal - minNum) / (maxNum - minNum)) * 100));
        timelineSlider.style.setProperty('--range-pct', `${pct}%`);
    };

    previewControls.append(playPauseBtn, timelineSlider);
    previewCard.append(previewHeader, previewViewport, previewControls);

    // ==========================================
    // 2. 核心：建立【雙向時間範圍選取器】組件
    // ==========================================
    const timeWrapper = document.createElement('div');
    timeWrapper.className = 'record-video-range-block';

    const timeLabel = document.createElement('span');
    timeLabel.className = 'popup-setting-text record-video-range-label';

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'dual-range-slider record-video-dual-slider';

    // 灰色底軌
    const baseTrack = document.createElement('div');
    baseTrack.className = 'record-video-dual-base';

    // 主題色進度條（代表被選中的範圍）
    const highlightTrack = document.createElement('div');
    highlightTrack.className = 'record-video-dual-highlight';

    const startInput = document.createElement('input');
    startInput.type = 'range'; startInput.min = '0'; startInput.max = String(maxDuration); startInput.step = '0.01'; startInput.value = '0';

    const endInput = document.createElement('input');
    endInput.type = 'range'; endInput.min = '0'; endInput.max = String(maxDuration); endInput.step = '0.01'; endInput.value = String(maxDuration);

    sliderContainer.append(baseTrack, highlightTrack, startInput, endInput);
    timeWrapper.append(timeLabel, sliderContainer);

    let isTimelineReady = false;

    // 更新雙向滑桿的視覺外觀與文字
    const updateDualSlider = () => {
        if (Number(startInput.value) > Number(endInput.value)) {
            startInput.value = endInput.value;
        }
        const startVal = Number(startInput.value);
        const endVal = Number(endInput.value);

        const leftPercent = (startVal / maxDuration) * 100;
        const widthPercent = ((endVal - startVal) / maxDuration) * 100;

        highlightTrack.style.left = `${leftPercent}%`;
        highlightTrack.style.width = `${widthPercent}%`;
        timeLabel.textContent = `${t('popup.recordVideo.recordRange', { start: startVal, end: endVal, dur: (endVal - startVal).toFixed(2) })}`;

        timelineSlider.min = String(startVal);
        timelineSlider.max = String(endVal);
        if (isTimelineReady) {
            if (currentPreviewTime < startVal || currentPreviewTime > endVal) {
                setPreviewCurrentTime(currentPreviewTime, true);
            } else {
                timelineSlider.value = String(currentPreviewTime);
                updateTimelineSliderFill();
                previewTimeBadge.textContent = `${formatTime(currentPreviewTime)} / ${formatTime(endVal)}`;
            }
        }
    };

    startInput.addEventListener('input', updateDualSlider);
    endInput.addEventListener('input', updateDualSlider);
    updateDualSlider(); // 初始渲染

    // ==========================================
    // 3. 解析度選單 + 自訂欄位
    // ==========================================
    const resSelect = createSettingDropdown('1280x720', [
        { value: '2560x1440', label: '2K 16:9' },
        { value: '1440x1440', label: '2K 1:1' },
        { value: '1920x1080', label: '1080P 16:9' },
        { value: '1080x1080', label: '1080P 1:1' },
        { value: '1280x720', label: '720P 16:9' },
        { value: '720x720', label: '720P 1:1' },
        { value: '854x480', label: '480P 16:9' },
        { value: '640x360', label: '360P 16:9' },
        { value: 'custom', label: t('popup.recordVideo.custom') }
    ], 'record-video-dropdown');
    const resRow = createSettingRow(t('popup.recordVideo.resolution'), resSelect);
    const resField = { wrapper: resRow, input: resSelect };

    const customWidthInput = createSettingNumberInput(1920, 2, 100, 7680);
    const customHeightInput = createSettingNumberInput(1080, 2, 100, 4320);
    inputRefs.custom_w = customWidthInput;
    inputRefs.custom_h = customHeightInput;

    const customResContainer = document.createElement('div');
    customResContainer.className = 'popup-setting-subbody record-video-subbody';
    customResContainer.append(
        createSettingRow(t('popup.recordVideo.customWidth'), customWidthInput),
        createSettingRow(t('popup.recordVideo.customHeight'), customHeightInput)
    );

    resSelect.addEventListener('change', (e) => {
        customResContainer.classList.toggle('open', e.target.value === 'custom');
        requestPreviewUpdate();
    });
    customWidthInput.addEventListener('input', () => requestPreviewUpdate());
    customHeightInput.addEventListener('input', () => requestPreviewUpdate());

    const getTargetResolution = () => {
        if (resField.input.value === 'custom') {
            const w = parseInt(inputRefs.custom_w?.value || 1920, 10);
            const h = parseInt(inputRefs.custom_h?.value || 1080, 10);
            return [
                Math.max(2, Math.round((Math.max(100, isNaN(w) ? 1920 : w)) / 2) * 2),
                Math.max(2, Math.round((Math.max(100, isNaN(h) ? 1080 : h)) / 2) * 2)
            ];
        }
        const parts = resField.input.value.split('x').map(Number);
        return [
            Math.max(2, Math.round((parts[0] || 1920) / 2) * 2),
            Math.max(2, Math.round((parts[1] || 1080) / 2) * 2)
        ];
    };

    // ==========================================
    // 4. FPS 選單 + 自訂欄位
    // ==========================================
    const fpsSelect = createSettingDropdown('60', [
        { value: '120', label: '120 FPS' },
        { value: '60', label: '60 FPS' },
        { value: '30', label: '30 FPS' },
        { value: '24', label: '24 FPS' },
        { value: 'custom', label: t('popup.recordVideo.custom') }
    ], 'record-video-dropdown');
    const fpsRow = createSettingRow('FPS', fpsSelect);
    const fpsField = { wrapper: fpsRow, input: fpsSelect };

    const customFpsInput = createSettingNumberInput(60, 1, 1, 240);
    inputRefs.custom_fps = customFpsInput;

    const customFpsContainer = document.createElement('div');
    customFpsContainer.className = 'popup-setting-subbody record-video-subbody';
    customFpsContainer.appendChild(createSettingRow(t('popup.recordVideo.customFps'), customFpsInput));

    fpsSelect.addEventListener('change', (e) => {
        customFpsContainer.classList.toggle('open', e.target.value === 'custom');
    });

    // ==========================================
    // 4.1 碼率選單 + 自訂欄位
    // ==========================================
    const qualitySelect = createSettingDropdown('low', [
        { value: 'ultra', label: t('popup.recordVideo.qualityUltra') || '極高 (~25 Mbps)' },
        { value: 'high', label: t('popup.recordVideo.qualityHigh') || '高 (~18 Mbps, 推薦)' },
        { value: 'medium', label: t('popup.recordVideo.qualityMedium') || '標準 (~10 Mbps)' },
        { value: 'low', label: t('popup.recordVideo.qualityLow') || '低 (~5 Mbps)' },
        { value: 'lowest', label: t('popup.recordVideo.qualityLowest') || '極低 (~2 Mbps)' },
        { value: 'custom', label: t('popup.recordVideo.custom') }
    ], 'record-video-dropdown');
    const qualityRow = createSettingRow(t('popup.recordVideo.quality') || '碼率', qualitySelect);
    const qualityField = { wrapper: qualityRow, input: qualitySelect };

    const customBitrateInput = createSettingNumberInput(18, 1, 1, 200);
    inputRefs.custom_bitrate = customBitrateInput;

    const customBitrateContainer = document.createElement('div');
    customBitrateContainer.className = 'popup-setting-subbody record-video-subbody';
    customBitrateContainer.appendChild(createSettingRow(t('popup.recordVideo.customBitrate') || '自訂碼率 (Mbps)', customBitrateInput));

    qualitySelect.addEventListener('change', (e) => {
        customBitrateContainer.classList.toggle('open', e.target.value === 'custom');
    });

    // ==========================================
    // 4.2 編碼加速模式選單
    // ==========================================
    const speedSelect = createSettingDropdown('fast', [
        { value: 'fast', label: t('popup.recordVideo.speedFast') || '速度優先' },
        { value: 'quality', label: t('popup.recordVideo.speedQuality') || '畫質優先' }
    ], 'record-video-dropdown');
    const speedRow = createSettingRow(t('popup.recordVideo.speedMode') || '匯出速度模式', speedSelect);
    const speedField = { wrapper: speedRow, input: speedSelect };

    // ==========================================
    // 5. 音量與音訊控制項
    // ==========================================
    const bgmVolInput = createSettingRangeInput(
        audioManager?.bgmBuffer ? Math.round((settings.musicVolume ?? 0.8) * 100) : 0,
        0,
        200,
        5,
        null,
        { suffix: '%' }
    );
    const sfxVolInput = createSettingRangeInput(
        Math.round((settings.SfxVolume ?? 1) * 100),
        0,
        200,
        5,
        null,
        { suffix: '%' }
    );
    inputRefs.record_bgm_vol = bgmVolInput;
    inputRefs.record_sfx_vol = sfxVolInput;
    const bgmVolField = { wrapper: createSettingRow(t('popup.recordVideo.bgmVolume'), bgmVolInput), input: bgmVolInput };
    const sfxVolField = { wrapper: createSettingRow(t('popup.recordVideo.sfxVolume'), sfxVolInput), input: sfxVolInput };

    // ==========================================
    // 6. 區塊標題與畫面設定滑桿 (整體影片 / 音符)
    // ==========================================
    const videoSectionTitle = createSettingSectionTitle(t('popup.recordVideo.videoSection') || '影片輸出');
    const brightSectionTitle = createSettingSectionTitle(t('popup.recordVideo.brightnessSection') || '畫面設定');
    const audioSectionTitle = createSettingSectionTitle(t('popup.recordVideo.audioSection') || '音訊設定');

    const createBrightnessSlider = ({ labelText, min = 0, max = 150, step = 1, defaultValue = 100 }) => {
        const sliderWrap = createSettingRangeInput(defaultValue, min, max, step, () => {
            requestPreviewUpdate();
        }, { suffix: '%' });
        const row = createSettingRow(labelText, sliderWrap);

        return {
            wrapper: row,
            input: sliderWrap,
            get value() { return Number(sliderWrap.value); }
        };
    };

    const overallBrightSlider = createBrightnessSlider({
        labelText: t('popup.recordVideo.overallBrightness'),
        min: 0,
        max: 150,
        defaultValue: 100
    });

    const noteBrightSlider = createBrightnessSlider({
        labelText: t('popup.recordVideo.noteBrightness'),
        min: 0,
        max: 150,
        defaultValue: 100
    });

    const createSettingSwitch = (labelText, defaultChecked) => {
        const checkbox = createSettingCheckbox(defaultChecked);
        const row = createSettingRow(labelText, checkbox);

        return {
            wrapper: row,
            checkbox,
            get checked() { return checkbox.checked; }
        };
    };

    const introSwitch = createSettingSwitch(t('popup.recordVideo.includeIntro'), true);

    // ==========================================
    // 7. 預覽渲染排程與控制器邏輯
    // ==========================================
    let currentPreviewTime = 0;
    const setPreviewCurrentTime = (time, syncSlider = true) => {
        const startBound = Number(startInput.value) || 0;
        const endBound = Math.max(startBound, Number(endInput.value) || maxDuration);
        currentPreviewTime = Math.max(startBound, Math.min(endBound, Number(time) || 0));
        timelineSlider.min = String(startBound);
        timelineSlider.max = String(endBound);
        if (syncSlider) {
            timelineSlider.value = String(currentPreviewTime);
        }
        updateTimelineSliderFill();
        previewTimeBadge.textContent = `${formatTime(currentPreviewTime)} / ${formatTime(endBound)}`;
        updateVideoTime(currentPreviewTime);
        requestPreviewUpdate();
    };
    isTimelineReady = true;

    let videoSeekTimer = null;
    const updateVideoTime = (time) => {
        const curSettings = typeof getSettings === 'function' ? getSettings() : settings;
        if (curSettings.enableVideo === false) {
            clearTimeout(videoSeekTimer);
            return;
        }
        if (editorBackgroundVideo && editorBackgroundVideo.src && editorBackgroundVideo.readyState >= 1) {
            clearTimeout(videoSeekTimer);
            videoSeekTimer = setTimeout(() => {
                try {
                    editorBackgroundVideo.currentTime = Math.max(0, Math.min((editorBackgroundVideo.duration || 0) - 0.001, time));
                } catch (e) { }
            }, 25);
        }
    };

    const onVideoSeeked = () => {
        requestPreviewUpdate();
    };
    editorBackgroundVideo?.addEventListener('seeked', onVideoSeeked);

    const startPreviewPlay = () => {
        if (isPreviewPlaying) return;
        isPreviewPlaying = true;
        playPauseBtn.innerHTML = '<span class="material-symbols-outlined" translate="no">pause</span>';
        playPauseBtn.title = t('popup.recordVideo.pausePreview');
        lastPlayTimestamp = performance.now();

        const playLoop = (now) => {
            if (!isPreviewPlaying) return;
            const delta = (now - lastPlayTimestamp) / 1000;
            lastPlayTimestamp = now;

            let nextTime = currentPreviewTime + delta;
            const recordEnd = Number(endInput.value) || maxDuration;
            if (nextTime >= recordEnd || nextTime >= maxDuration) {
                const recordStart = Number(startInput.value) || 0;
                nextTime = recordStart;
            }
            setPreviewCurrentTime(nextTime, true);
            previewPlayRafId = requestAnimationFrame(playLoop);
        };
        previewPlayRafId = requestAnimationFrame(playLoop);
    };

    const stopPreviewPlay = () => {
        isPreviewPlaying = false;
        playPauseBtn.innerHTML = '<span class="material-symbols-outlined" translate="no">play_arrow</span>';
        playPauseBtn.title = t('popup.recordVideo.playPreview');
        if (previewPlayRafId) {
            cancelAnimationFrame(previewPlayRafId);
            previewPlayRafId = null;
        }
    };

    timelineSlider.addEventListener('input', (e) => {
        stopPreviewPlay();
        setPreviewCurrentTime(Number(e.target.value), false);
    });

    let previewUpdateRaf = null;
    const requestPreviewUpdate = () => {
        if (previewUpdateRaf) return;
        previewUpdateRaf = requestAnimationFrame(() => {
            previewUpdateRaf = null;
            renderPreviewFrame();
        });
    };

    const renderPreviewFrame = () => {
        const [targetW, targetH] = getTargetResolution();

        // 動態設定預覽視窗比例
        previewViewport.style.aspectRatio = `${targetW} / ${targetH}`;

        const maxDim = 640;
        let pWidth, pHeight;
        if (targetW >= targetH) {
            pWidth = maxDim;
            pHeight = Math.max(100, Math.round(maxDim * (targetH / targetW)));
        } else {
            pHeight = maxDim;
            pWidth = Math.max(100, Math.round(maxDim * (targetW / targetH)));
        }

        if (previewCanvas.width !== pWidth || previewCanvas.height !== pHeight) {
            previewCanvas.width = pWidth;
            previewCanvas.height = pHeight;
        }
        previewRenderer.resize(pWidth, pHeight, 1, true);

        const curSettings = typeof getSettings === 'function' ? getSettings() : settings;
        if (previewRenderer) {
            previewRenderer.settings = curSettings;
        }

        previewCtx.save();
        previewCtx.setTransform(1, 0, 0, 1, 0, 0);
        previewCtx.fillStyle = curSettings.backgroundColor || '#000000';
        previewCtx.fillRect(0, 0, pWidth, pHeight);

        const overallBrightness = overallBrightSlider.value / 100;
        const noteBrightness = noteBrightSlider.value / 100;
        const baseMovieBrightness = Math.max(0, 1 + 0.1875 * (curSettings.moviebrightness ?? -3));
        const finalBgBrightness = Math.max(0, baseMovieBrightness * overallBrightness);
        const finalNoteBrightness = Math.max(0, noteBrightness * overallBrightness);

        const rs = previewRenderer.scale || 0.98;
        const boxSize = Math.min(pWidth, pHeight);
        const boxX = Math.round((pWidth - boxSize) / 2);
        const boxY = Math.round((pHeight - boxSize) / 2);
        const boxW = boxSize, boxH = boxSize;

        const drawContain = (srcW, srcH, drawFn) => {
            if (!srcW || !srcH) return drawFn(0, 0, srcW, srcH, boxX, boxY, boxW, boxH);
            const scale = Math.min(boxW / srcW, boxH / srcH) * rs;
            const dw = Math.round(srcW * scale);
            const dh = Math.round(srcH * scale);
            const dx = Math.round(boxX + (boxW - dw) / 2);
            const dy = Math.round(boxY + (boxH - dh) / 2);
            return drawFn(0, 0, srcW, srcH, dx, dy, dw, dh);
        };

        let bgDrawn = false;
        const videoEnabled = curSettings.enableVideo !== false;
        if (videoEnabled && editorBackgroundVideo && editorBackgroundVideo.src && editorBackgroundVideo.videoWidth > 0) {
            try {
                if (finalBgBrightness > 1.0) {
                    previewCtx.filter = `brightness(${finalBgBrightness})`;
                }
                const vw = editorBackgroundVideo.videoWidth || boxW;
                const vh = editorBackgroundVideo.videoHeight || boxH;
                drawContain(vw, vh, (sx, sy, sw, sh, dx, dy, dw, dh) => {
                    previewCtx.drawImage(editorBackgroundVideo, sx, sy, sw || vw, sh || vh, dx, dy, dw, dh);
                });
                previewCtx.filter = 'none';
                bgDrawn = true;
            } catch (e) {
                previewCtx.filter = 'none';
            }
        }

        if (!bgDrawn && editorBackgroundImage && editorBackgroundImage.src && editorBackgroundImage.complete) {
            try {
                if (finalBgBrightness > 1.0) {
                    previewCtx.filter = `brightness(${finalBgBrightness})`;
                }
                const iw = editorBackgroundImage.naturalWidth || editorBackgroundImage.width || boxW;
                const ih = editorBackgroundImage.naturalHeight || editorBackgroundImage.height || boxH;
                drawContain(iw, ih, (sx, sy, sw, sh, dx, dy, dw, dh) => {
                    previewCtx.drawImage(editorBackgroundImage, sx, sy, sw || iw, sh || ih, dx, dy, dw, dh);
                });
                previewCtx.filter = 'none';
                bgDrawn = true;
            } catch (e) {
                previewCtx.filter = 'none';
            }
        }

        // 使用單層 Alpha 遮罩取代 ctx.filter 調暗，確保 iOS Safari 等不支援 Canvas filter 的瀏覽器預覽一致
        if (bgDrawn && finalBgBrightness < 1.0) {
            previewCtx.fillStyle = `rgba(0, 0, 0, ${Math.max(0, Math.min(1, 1 - finalBgBrightness))})`;
            previewCtx.fillRect(0, 0, pWidth, pHeight);
        }

        previewCtx.restore();

        const globalT = currentPreviewTime - (musicDelay || 0);
        const {
            buckets,
            playCombo,
            playScore,
            noteQuantity,
            nowIndex
        } = previewLogicControler.get({
            renderer: previewRenderer,
            globalTime: globalT,
            realTime: currentPreviewTime,
            musicDelay,
            playing: false,
            timeControlSliding: true,
            readyBeat: false,
            playedClock: [],
            settings: curSettings,
            visualHeight: 0,
            notes,
            decodedTags: [],
            playScoreRes,
            nowIndex: 0,
            skipAudioQueue: true,
        });

        try {
            if (finalNoteBrightness !== 1.0) {
                previewCtx.filter = `brightness(${finalNoteBrightness})`;
            }
        } catch (e) {
            previewCtx.filter = 'none';
        }

        previewRenderer.drawFrame({
            globalTime: globalT,
            buckets,
            dt: 1 / 60,
            showSensor: curSettings.showSensor,
            showSensorText: false,
            playCombo,
            playScore,
            nowIndex,
            skipClear: true,
            noteQuantity,
            playScoreRes,
        });
        previewCtx.filter = 'none';
    };

    // 初始化預覽時間為開始時間並觸發繪製
    setPreviewCurrentTime(Number(startInput.value) || 0);

    // ==========================================
    // 8. 組裝彈窗容器
    // ==========================================
    container.append(
        previewCard,
        timeWrapper,
        videoSectionTitle,
        resField.wrapper,
        customResContainer,
        fpsField.wrapper,
        customFpsContainer,
        qualityField.wrapper,
        customBitrateContainer,
        speedField.wrapper,
        brightSectionTitle,
        introSwitch.wrapper,
        overallBrightSlider.wrapper,
        noteBrightSlider.wrapper,
        audioSectionTitle,
        bgmVolField.wrapper,
        sfxVolField.wrapper
    );

    const onContainerEnter = () => {
        requestPreviewUpdate();
    };
    container.addEventListener('pointerenter', onContainerEnter);

    popupWindow({
        title: t('popup.recordVideo.title'),
        customContent: container,
        width: '440px',
        onClose: () => {
            stopPreviewPlay();
            if (previewUpdateRaf) cancelAnimationFrame(previewUpdateRaf);
            container.removeEventListener('pointerenter', onContainerEnter);
            if (editorBackgroundVideo) {
                editorBackgroundVideo.removeEventListener('seeked', onVideoSeeked);
            }
            if (previewCanvas) {
                previewCanvas.width = 0;
                previewCanvas.height = 0;
            }
            if (previewRenderer) {
                previewRenderer.ctx = null;
                previewRenderer.canvas = null;
            }
        },
        buttons: [
            {
                text: t('popup.start'),
                onClick: async (pwCtx) => {
                    stopPreviewPlay();

                    const startVal = Number(startInput.value);
                    const endVal = Number(endInput.value);

                    let widthVal, heightVal;
                    if (resField.input.value === 'custom') {
                        widthVal = parseInt(inputRefs.custom_w?.value || 1920, 10);
                        heightVal = parseInt(inputRefs.custom_h?.value || 1080, 10);
                    } else {
                        [widthVal, heightVal] = resField.input.value.split('x').map(Number);
                    }

                    // 強制確保輸出尺寸為正偶數 (AVC/H.264 與 WebCodecs 編碼器規範)
                    widthVal = Math.max(2, Math.round((Number(widthVal) || 1920) / 2) * 2);
                    heightVal = Math.max(2, Math.round((Number(heightVal) || 1080) / 2) * 2);

                    let fpsVal;
                    if (fpsField.input.value === 'custom') {
                        fpsVal = parseInt(inputRefs.custom_fps?.value || 60, 10);
                    } else {
                        fpsVal = parseInt(fpsField.input.value, 10);
                    }

                    let qualityVal = qualityField.input.value || 'high';
                    let bitrateVal = null;
                    if (qualityVal === 'custom') {
                        const mbps = parseFloat(inputRefs.custom_bitrate?.value || 18);
                        bitrateVal = Math.round(Math.max(1, isNaN(mbps) ? 18 : mbps) * 1_000_000);
                    }

                    const rawBgmVol = Number(inputRefs.record_bgm_vol?.value);
                    const rawSfxVol = Number(inputRefs.record_sfx_vol?.value);
                    const bgmVolValNum = Number.isFinite(rawBgmVol) ? rawBgmVol / 100 : (settings.musicVolume ?? 0.8);
                    const sfxVolValNum = Number.isFinite(rawSfxVol) ? rawSfxVol / 100 : (settings.SfxVolume ?? 1);
                    const bgmLoaded = !!audioManager?.bgmBuffer;

                    const renderer = typeof getRenderer === 'function' ? getRenderer() : null;
                    const nowDifficulty = typeof getNowDifficulty === 'function' ? getNowDifficulty() : 5;

                    pwCtx.close();

                    const curSettings = typeof getSettings === 'function' ? getSettings() : settings;
                    const speedModeVal = speedField.input?.value || 'fast';
                    const shouldIncludeBgm = bgmLoaded && bgmVolValNum > 0;
                    const shouldIncludeSfx = sfxVolValNum > 0;

                    videoRender(audioManager, canvas, renderer, {
                        start: startVal,
                        end: endVal,
                        fps: fpsVal,
                        width: widthVal,
                        height: heightVal,
                        quality: qualityVal,
                        speedMode: speedModeVal,
                        bitrate: bitrateVal,
                        bgmVolume: bgmVolValNum,
                        sfxVolume: sfxVolValNum,
                        overallBrightness: overallBrightSlider.value / 100,
                        noteBrightness: noteBrightSlider.value / 100,
                        includeAudio: shouldIncludeBgm || shouldIncludeSfx,
                        includeBgm: shouldIncludeBgm,
                        includeSfx: shouldIncludeSfx,
                        includeIntro: introSwitch.checked,
                        includeAllPerfect: false,
                        musicDelay,
                        editorBackgroundImage,
                        editorBackgroundVideo,
                        notes,
                        playScoreRes,
                        chartInfo: {
                            title: maidata.title ?? '',
                            artist: maidata.artist ?? '',
                            designer: maidata[`des_${nowDifficulty}`] || maidata.des || '',
                            des: maidata[`des_${nowDifficulty}`] || maidata.des || '',
                            difficulty: nowDifficulty,
                            diff: nowDifficulty,
                            lv: String(maidata[`lv_${nowDifficulty}`] || ''),
                        },
                        settings: curSettings,
                        draw,
                    });
                }
            },
            {
                text: t('menu.settings') || '設定',
                onClick: () => {
                    openSettings();
                }
            },
            {
                text: t('popup.cancel'),
                hideOnClick: true,
                onClick: () => {
                    stopPreviewPlay();
                    if (typeof draw === 'function') {
                        draw();
                    }
                }
            }
        ]
    });
}
