import { ensureMediabunny, simpleToast, popupWindow, createLabeledInput1, getButton } from '../helper.js';
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
    container.className = 'popup-form-container';

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
    if (mainRenderer) {
        if (mainRenderer.images) previewRenderer.setImages(mainRenderer.images);
        if (mainRenderer._tintCache) previewRenderer._tintCache = mainRenderer._tintCache;
        if (mainRenderer.scale) previewRenderer.scale = mainRenderer.scale;
    }
    const previewLogicControler = new SimaiLogicControler();

    // 預載入外框圖片
    let outlineImage = null;
    const getEffectiveOutlineImage = () => {
        if (outlineImage) return outlineImage;
        const domOutline = document.getElementById('canvasOutline');
        if (domOutline && domOutline.complete && domOutline.naturalWidth > 0) {
            return domOutline;
        }
        return null;
    };

    (async () => {
        try {
            const outlineSrc = document.getElementById('canvasOutline')?.src || './Skin/Shared/outline.png';
            const response = await fetch(outlineSrc);
            if (response.ok) {
                const blob = await response.blob();
                try {
                    if (window.createImageBitmap) outlineImage = await createImageBitmap(blob, { resizeQuality: 'high' });
                } catch (e) { }
                if (!outlineImage) {
                    outlineImage = await new Promise((res, rej) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => { URL.revokeObjectURL(img.src); res(img); };
                        img.onerror = rej;
                        img.src = URL.createObjectURL(blob);
                    });
                }
                if (previewRenderer) previewRenderer.setOutlineImage(outlineImage);
                requestPreviewUpdate();
            }
        } catch (e) {
            console.warn('載入外框圖片失敗 (預覽將省略外框)', e);
        }
    })();

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
    previewCard.className = 'render-preview-card';
    previewCard.style.cssText = 'display:flex;flex-direction:column;gap:8px;background:var(--popup-surface-active, rgba(255,255,255,0.04));border:1px solid var(--popup-border, rgba(255,255,255,0.1));border-radius:8px;padding:10px;margin-bottom:6px;';

    const previewHeader = document.createElement('div');
    previewHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

    const previewTitle = document.createElement('span');
    previewTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--popup-text, #fff);display:flex;align-items:center;gap:6px;';
    previewTitle.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;color:var(--popup-accent, #4a90e2);" translate="no">videocam</span> ${t('popup.recordVideo.previewTitle')}`;

    const previewHeaderRight = document.createElement('div');
    previewHeaderRight.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const previewTimeBadge = document.createElement('span');
    previewTimeBadge.style.cssText = 'font-size:11px;font-family:monospace;font-weight:600;color:var(--popup-accent, #4a90e2);background:rgba(74, 144, 226, 0.12);padding:2px 6px;border-radius:4px;border:1px solid rgba(74, 144, 226, 0.25);';

    const headerSettingsBtn = document.createElement('button');
    headerSettingsBtn.type = 'button';
    headerSettingsBtn.title = t('menu.settings') || '設定';
    headerSettingsBtn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:2px 6px;font-size:11px;color:#ccc;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:4px;cursor:pointer;transition:all 0.2s;';
    headerSettingsBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;" translate="no">settings</span><span>${t('menu.settings') || '設定'}</span>`;
    headerSettingsBtn.addEventListener('mouseenter', () => {
        headerSettingsBtn.style.background = 'rgba(255,255,255,0.16)';
        headerSettingsBtn.style.color = '#fff';
    });
    headerSettingsBtn.addEventListener('mouseleave', () => {
        headerSettingsBtn.style.background = 'rgba(255,255,255,0.08)';
        headerSettingsBtn.style.color = '#ccc';
    });
    headerSettingsBtn.addEventListener('click', openSettings);

    previewHeaderRight.append(previewTimeBadge, headerSettingsBtn);
    previewHeader.append(previewTitle, previewHeaderRight);

    const previewViewport = document.createElement('div');
    previewViewport.className = 'render-preview-viewport';
    previewViewport.style.cssText = 'width:100%;max-height:240px;background:#050508;border-radius:6px;overflow:hidden;position:relative;box-shadow:0 4px 16px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.08);aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;';
    previewViewport.appendChild(previewCanvas);

    // 時間軸與控制項
    const previewControls = document.createElement('div');
    previewControls.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:2px;';

    const createSmallBtn = (html, title, onClick) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = html;
        btn.title = title;
        btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;padding:0;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:#eee;cursor:pointer;transition:all 0.2s;flex-shrink:0;';
        btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(255,255,255,0.16)');
        btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(255,255,255,0.08)');
        btn.addEventListener('click', onClick);
        return btn;
    };

    let isPreviewPlaying = false;
    let previewPlayRafId = null;
    let lastPlayTimestamp = 0;

    const playPauseBtn = createSmallBtn('<span class="material-symbols-outlined" style="font-size:18px;" translate="no">play_arrow</span>', t('popup.recordVideo.playPreview'), () => {
        if (isPreviewPlaying) {
            stopPreviewPlay();
        } else {
            startPreviewPlay();
        }
    });

    const jumpStartBtn = createSmallBtn('<span class="material-symbols-outlined" style="font-size:18px;" translate="no">skip_previous</span>', t('popup.recordVideo.jumpStart'), () => {
        setPreviewCurrentTime(Number(startInput.value));
    });

    const jumpEndBtn = createSmallBtn('<span class="material-symbols-outlined" style="font-size:18px;" translate="no">skip_next</span>', t('popup.recordVideo.jumpEnd'), () => {
        setPreviewCurrentTime(Number(endInput.value));
    });

    const timelineSlider = document.createElement('input');
    timelineSlider.type = 'range';
    timelineSlider.min = '0';
    timelineSlider.max = String(maxDuration);
    timelineSlider.step = '0.01';
    timelineSlider.value = '0';
    timelineSlider.className = 'custom-slider';
    timelineSlider.style.cssText = 'flex:1;cursor:pointer;accent-color:var(--popup-accent, #4a90e2);height:6px;';

    previewControls.append(jumpStartBtn, playPauseBtn, jumpEndBtn, timelineSlider);
    previewCard.append(previewHeader, previewViewport, previewControls);

    // ==========================================
    // 2. 核心：建立【雙向時間範圍選取器】组件
    // ==========================================
    const timeWrapper = document.createElement('div');
    timeWrapper.style.cssText = 'display:flex;flex-direction:column;margin-bottom:6px;';

    const timeLabel = document.createElement('label');
    timeLabel.style.cssText = 'font-size:12px;color:#888;margin-bottom:2px;';

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'dual-range-slider';

    // 灰色底軌
    const baseTrack = document.createElement('div');
    baseTrack.style.cssText = 'position:absolute;top:50%;left:0;width:100%;height:6px;background:var(--popup-surface-active);transform:translateY(-50%);border-radius:3px;';

    // 藍色進度條（代表被選中的範圍）
    const highlightTrack = document.createElement('div');
    highlightTrack.style.cssText = 'position:absolute;top:50%;height:6px;background:var(--popup-accent);transform:translateY(-50%);border-radius:3px;box-shadow:0 0 8px var(--popup-accent-glow);';

    const startInput = document.createElement('input');
    startInput.type = 'range'; startInput.min = '0'; startInput.max = String(maxDuration); startInput.step = '0.01'; startInput.value = '0';

    const endInput = document.createElement('input');
    endInput.type = 'range'; endInput.min = '0'; endInput.max = String(maxDuration); endInput.step = '0.01'; endInput.value = String(maxDuration);

    sliderContainer.append(baseTrack, highlightTrack, startInput, endInput);
    timeWrapper.append(timeLabel, sliderContainer);

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
    };

    startInput.addEventListener('input', updateDualSlider);
    endInput.addEventListener('input', updateDualSlider);
    updateDualSlider(); // 初始渲染

    // ==========================================
    // 3. 解析度選單 + 自訂欄位
    // ==========================================
    const resField = createLabeledInput1({
        value: '1920x1080',
        labelText: t('popup.recordVideo.resolution'),
        type: 'select',
        assign: 'record_res_select',
        ref: inputRefs,
        options: [
            { value: '2560x1440', label: '2560 x 1440 (2K 1440p 16:9)' },
            { value: '1440x1440', label: '1440 x 1440 (2K 1:1)' },
            { value: '1920x1080', label: '1920 x 1080 (1080p 16:9)' },
            { value: '1080x1080', label: '1080 x 1080 (1080p 1:1)' },
            { value: '1280x720', label: '1280 x 720 (720p 16:9)' },
            { value: '720x720', label: '720 x 720 (720p 1:1)' },
            { value: '854x480', label: '854 x 480 (480p 16:9)' },
            { value: '640x360', label: '640 x 360 (360p 16:9)' },
            { value: 'custom', label: t('popup.recordVideo.custom') }
        ]
    });

    const customResContainer = document.createElement('div');
    customResContainer.style.cssText = 'display:none; gap:8px; margin-top:4px;';
    const customWidth = createLabeledInput1({ value: 1920, labelText: t('popup.recordVideo.customWidth'), type: 'number', assign: 'custom_w', ref: inputRefs });
    const customHeight = createLabeledInput1({ value: 1080, labelText: t('popup.recordVideo.customHeight'), type: 'number', assign: 'custom_h', ref: inputRefs });
    customWidth.wrapper.style.flex = '1';
    customHeight.wrapper.style.flex = '1';
    customResContainer.append(customWidth.wrapper, customHeight.wrapper);
    resField.wrapper.appendChild(customResContainer);

    resField.input.addEventListener('change', (e) => {
        customResContainer.style.display = e.target.value === 'custom' ? 'flex' : 'none';
        requestPreviewUpdate();
    });
    customWidth.input?.addEventListener('input', () => requestPreviewUpdate());
    customHeight.input?.addEventListener('input', () => requestPreviewUpdate());

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
    const fpsField = createLabeledInput1({
        value: '60',
        labelText: 'FPS:',
        type: 'select',
        assign: 'record_fps_select',
        ref: inputRefs,
        options: [
            { value: '120', label: '120 FPS' },
            { value: '60', label: '60 FPS' },
            { value: '30', label: '30 FPS' },
            { value: '24', label: '24 FPS' },
            { value: 'custom', label: t('popup.recordVideo.custom') }
        ]
    });

    const customFps = createLabeledInput1({ value: 60, labelText: t('popup.recordVideo.customFps'), type: 'number', assign: 'custom_fps', ref: inputRefs });
    customFps.wrapper.style.cssText = 'display:none; margin-top:4px;';
    fpsField.wrapper.appendChild(customFps.wrapper);

    fpsField.input.addEventListener('change', (e) => {
        customFps.wrapper.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });

    // ==========================================
    // 4.1 畫質 / 碼率選單 + 自訂欄位
    // ==========================================
    const qualityField = createLabeledInput1({
        value: 'high',
        labelText: t('popup.recordVideo.quality') || '畫質 / 碼率:',
        type: 'select',
        assign: 'record_quality_select',
        ref: inputRefs,
        options: [
            { value: 'ultra', label: t('popup.recordVideo.qualityUltra') || '極致超清 (~25 Mbps)' },
            { value: 'high', label: t('popup.recordVideo.qualityHigh') || '高畫質 (~18 Mbps, 推薦)' },
            { value: 'medium', label: t('popup.recordVideo.qualityMedium') || '標準畫質 (~10 Mbps)' },
            { value: 'low', label: t('popup.recordVideo.qualityLow') || '低畫質 (~5 Mbps)' },
            { value: 'lowest', label: t('popup.recordVideo.qualityLowest') || '極低畫質 (~2 Mbps)' },
            { value: 'custom', label: t('popup.recordVideo.custom') }
        ]
    });

    const customBitrate = createLabeledInput1({ value: 20, labelText: t('popup.recordVideo.customBitrate') || '自訂碼率 (Mbps):', type: 'number', assign: 'custom_bitrate', ref: inputRefs });
    customBitrate.wrapper.style.cssText = 'display:none; margin-top:4px;';
    qualityField.wrapper.appendChild(customBitrate.wrapper);

    qualityField.input.addEventListener('change', (e) => {
        customBitrate.wrapper.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });

    // ==========================================
    // 5. 音量與音訊控制項
    // ==========================================
    const bgmVolField = createLabeledInput1({ value: settings.musicVolume ?? 0.8, labelText: t('popup.recordVideo.bgmVolume'), type: 'number', assign: 'record_bgm_vol', ref: inputRefs });
    const sfxVolField = createLabeledInput1({ value: settings.SfxVolume ?? 1, labelText: t('popup.recordVideo.sfxVolume'), type: 'number', assign: 'record_sfx_vol', ref: inputRefs });

    // ==========================================
    // 6. 畫面與明暗度控制滑桿 (整體影片 / 音符)
    // ==========================================
    const brightSectionTitle = document.createElement('div');
    brightSectionTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--popup-text-sub, #aaa);margin:10px 0 6px 0;border-top:1px solid var(--popup-border, rgba(255,255,255,0.08));padding-top:8px;';
    brightSectionTitle.textContent = t('popup.recordVideo.brightnessSection');

    const createBrightnessSlider = ({ labelText, min = 0, max = 150, step = 1, defaultValue = 100 }) => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;flex-direction:column;margin-bottom:8px;';

        const label = document.createElement('label');
        label.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--popup-text-sub, #aaa);margin-bottom:3px;user-select:none;';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = labelText;

        const valSpan = document.createElement('span');
        valSpan.style.cssText = 'font-weight:600;color:var(--popup-accent, #4a90e2);font-family:monospace;font-size:12px;';

        label.append(titleSpan, valSpan);

        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(defaultValue);
        input.className = 'custom-slider';
        input.style.cssText = 'width:100%;cursor:pointer;accent-color:var(--popup-accent, #4a90e2);margin:2px 0;';

        const updateVal = (val) => {
            valSpan.textContent = `${val}%`;
        };

        input.addEventListener('input', (e) => {
            updateVal(e.target.value);
            requestPreviewUpdate();
        });

        updateVal(defaultValue);
        wrapper.append(label, input);

        return {
            wrapper,
            input,
            get value() { return Number(input.value); }
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

    const createCustomSwitch = (labelText, defaultChecked) => {
        const labelWrapper = document.createElement('label');
        labelWrapper.style.cssText = 'display:flex;align-items:center;justify-content:between;gap:12px;cursor:pointer;margin-top:4px;user-select:none;width:fit-content;';

        const span = document.createElement('span');
        span.textContent = labelText;
        span.style.cssText = 'color:#ddd;font-size:13px;width:110px;';

        const switchTrack = document.createElement('div');
        switchTrack.style.cssText = 'display:flex;align-items:center;width:36px;height:20px;background:#333;border-radius:10px;position:relative;transition:all 0.2s ease;border:1px solid #444;';

        const switchThumb = document.createElement('div');
        switchThumb.style.cssText = 'width:14px;height:14px;background:#fff;border-radius:50%;position:absolute;left:2px;transition:all 0.2s ease;';
        switchTrack.appendChild(switchThumb);

        let isChecked = defaultChecked;

        const refreshUI = () => {
            if (isChecked) {
                switchTrack.style.background = '#4a90e2';
                switchTrack.style.borderColor = '#5fa4f5';
                switchThumb.style.left = '18px';
            } else {
                switchTrack.style.background = '#1a1a1a';
                switchTrack.style.borderColor = '#333';
                switchThumb.style.left = '3px';
            }
        };
        refreshUI();

        labelWrapper.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isChecked = !isChecked;
            refreshUI();
        });

        labelWrapper.append(span, switchTrack);

        return {
            wrapper: labelWrapper,
            get checked() { return isChecked; }
        };
    };

    const audioSwitch = createCustomSwitch(t('popup.recordVideo.includeAudio'), !!audioManager?.bgmBuffer);
    const sfxSwitch = createCustomSwitch(t('popup.recordVideo.includeSfx'), true);
    const introSwitch = createCustomSwitch(t('popup.recordVideo.includeIntro'), true);

    // ==========================================
    // 7. 預覽渲染排程與控制器邏輯
    // ==========================================
    let currentPreviewTime = 0;
    const setPreviewCurrentTime = (time, syncSlider = true) => {
        currentPreviewTime = Math.max(0, Math.min(maxDuration, Number(time) || 0));
        if (syncSlider) {
            timelineSlider.value = String(currentPreviewTime);
        }
        previewTimeBadge.textContent = `${formatTime(currentPreviewTime)} / ${formatTime(maxDuration)}`;
        updateVideoTime(currentPreviewTime);
        requestPreviewUpdate();
    };

    let videoSeekTimer = null;
    const updateVideoTime = (time) => {
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
        playPauseBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;" translate="no">pause</span>';
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
        playPauseBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;" translate="no">play_arrow</span>';
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
        if (editorBackgroundVideo && editorBackgroundVideo.src && editorBackgroundVideo.videoWidth > 0) {
            try {
                previewCtx.filter = `brightness(${finalBgBrightness})`;
                const vw = editorBackgroundVideo.videoWidth || boxW;
                const vh = editorBackgroundVideo.videoHeight || boxH;
                drawContain(vw, vh, (sx, sy, sw, sh, dx, dy, dw, dh) => {
                    previewCtx.drawImage(editorBackgroundVideo, sx, sy, sw || vw, sh || vh, dx, dy, dw, dh);
                });
                previewCtx.filter = 'none';
                bgDrawn = true;
            } catch (e) { }
        }

        if (!bgDrawn && editorBackgroundImage && editorBackgroundImage.src && editorBackgroundImage.complete) {
            try {
                previewCtx.filter = `brightness(${finalBgBrightness})`;
                const iw = editorBackgroundImage.naturalWidth || editorBackgroundImage.width || boxW;
                const ih = editorBackgroundImage.naturalHeight || editorBackgroundImage.height || boxH;
                drawContain(iw, ih, (sx, sy, sw, sh, dx, dy, dw, dh) => {
                    previewCtx.drawImage(editorBackgroundImage, sx, sy, sw || iw, sh || ih, dx, dy, dw, dh);
                });
                previewCtx.filter = 'none';
            } catch (e) { }
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
            settings,
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
            showSensor: settings.showSensor,
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
        resField.wrapper,
        fpsField.wrapper,
        qualityField.wrapper,
        bgmVolField.wrapper,
        sfxVolField.wrapper,
        brightSectionTitle,
        overallBrightSlider.wrapper,
        noteBrightSlider.wrapper,
        audioSwitch.wrapper,
        sfxSwitch.wrapper,
        introSwitch.wrapper
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
                        const mbps = parseFloat(inputRefs.custom_bitrate?.value || 20);
                        bitrateVal = Math.round(Math.max(1, isNaN(mbps) ? 20 : mbps) * 1_000_000);
                    }

                    const bgmVolValNum = Number(inputRefs.record_bgm_vol?.value || 1);
                    const sfxVolValNum = Number(inputRefs.record_sfx_vol?.value || 1);
                    const bgmLoaded = !!audioManager?.bgmBuffer;

                    const renderer = typeof getRenderer === 'function' ? getRenderer() : null;
                    const nowDifficulty = typeof getNowDifficulty === 'function' ? getNowDifficulty() : 5;

                    pwCtx.close();

                    const curSettings = typeof getSettings === 'function' ? getSettings() : settings;
                    videoRender(audioManager, canvas, renderer, {
                        start: startVal,
                        end: endVal,
                        fps: fpsVal,
                        width: widthVal,
                        height: heightVal,
                        quality: qualityVal,
                        bitrate: bitrateVal,
                        bgmVolume: bgmVolValNum,
                        sfxVolume: sfxVolValNum,
                        overallBrightness: overallBrightSlider.value / 100,
                        noteBrightness: noteBrightSlider.value / 100,
                        includeBgm: audioSwitch.checked && bgmLoaded,
                        includeSfx: sfxSwitch.checked,
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
                        outlineImage: getEffectiveOutlineImage(),
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
