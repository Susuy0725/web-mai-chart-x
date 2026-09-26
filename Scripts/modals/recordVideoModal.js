import { ensureMediabunny, simpleToast, popupWindow, createLabeledInput1, videoRender } from '../helper.js';
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

    // 注入雙向滑桿與自訂面板所需的專用 CSS（如果還沒注入過的話）
    if (!document.getElementById('dual-range-style')) {
        const style = document.createElement('style');
        style.id = 'dual-range-style';
        style.textContent = `
            .dual-range-slider {
                position: relative;
                height: 24px;
                margin: 8px 0 4px 0;
            }
            .dual-range-slider input[type=range] {
                position: absolute;
                width: 100%;
                background: none;
                pointer-events: none;
                -webkit-appearance: none;
                top: 50%;
                transform: translateY(-50%);
                margin: 0;
            }
            /* 讓滑桿本體穿透，只有按鈕可以點擊 */
            .dual-range-slider input[type=range]::-webkit-slider-thumb {
                -webkit-appearance: none;
                pointer-events: auto;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #4a90e2;
                cursor: pointer;
                border: 2px solid #fff;
                box-shadow: 0 0 5px rgba(0,0,0,0.5);
                transition: transform 0.1s;
            }
            .dual-range-slider input[type=range]::-webkit-slider-thumb:active {
                transform: scale(1.2);
            }
        `;
        document.head.appendChild(style);
    }

    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:8px;font-size:13px;';

    const inputRefs = {};
    const endTime = typeof getEndTime === 'function' ? getEndTime() : 0;
    const musicDelay = typeof getMusicDelay === 'function' ? getMusicDelay() : 0;
    const settings = typeof getSettings === 'function' ? getSettings() : {};
    const maxDuration = Number((endTime + musicDelay).toFixed(2)); // 總曲長

    // ==========================================
    // 1. 核心：建立【雙向時間範圍選取器】组件
    // ==========================================
    const timeWrapper = document.createElement('div');
    timeWrapper.style.cssText = 'display:flex;flex-direction:column;margin-bottom:6px;';

    const timeLabel = document.createElement('label');
    timeLabel.style.cssText = 'font-size:12px;color:#888;margin-bottom:2px;';

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'dual-range-slider';

    // 灰色底軌
    const baseTrack = document.createElement('div');
    baseTrack.style.cssText = 'position:absolute;top:50%;left:0;width:100%;height:6px;background:#333;transform:translateY(-50%);border-radius:3px;';

    // 藍色進度條（代表被選中的範圍）
    const highlightTrack = document.createElement('div');
    highlightTrack.style.cssText = 'position:absolute;top:50%;height:6px;background:#4a90e2;transform:translateY(-50%);border-radius:3px;';

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
    // 2. 解析度選單 + 自訂欄位
    // ==========================================
    const resField = createLabeledInput1({
        value: '1280x720',
        labelText: t('popup.recordVideo.resolution'),
        type: 'select',
        assign: 'record_res_select',
        ref: inputRefs,
        options: [
            { value: '1920x1080', label: '1920 x 1080 (1080p 16:9)' },
            { value: '1080x1080', label: '1080 x 1080 (1080p 1:1)' },
            { value: '1280x720', label: '1280 x 720 (720p 16:9)' },
            { value: '720x720', label: '720 x 720 (720p 1:1)' },
            { value: '640x360', label: '640 x 360 (360p 16:9)' },
            { value: 'custom', label: t('popup.recordVideo.custom') }
        ]
    });

    const customResContainer = document.createElement('div');
    customResContainer.style.cssText = 'display:none; gap:8px; margin-top:4px;';
    const customWidth = createLabeledInput1({ value: 1080, labelText: t('popup.recordVideo.customWidth'), type: 'number', assign: 'custom_w', ref: inputRefs });
    const customHeight = createLabeledInput1({ value: 720, labelText: t('popup.recordVideo.customHeight'), type: 'number', assign: 'custom_h', ref: inputRefs });
    customWidth.wrapper.style.flex = '1';
    customHeight.wrapper.style.flex = '1';
    customResContainer.append(customWidth.wrapper, customHeight.wrapper);
    resField.wrapper.appendChild(customResContainer);

    resField.input.addEventListener('change', (e) => {
        customResContainer.style.display = e.target.value === 'custom' ? 'flex' : 'none';
    });

    // ==========================================
    // 3. FPS 選單 + 自訂欄位
    // ==========================================
    const fpsField = createLabeledInput1({
        value: '30',
        labelText: 'FPS:',
        type: 'select',
        assign: 'record_fps_select',
        ref: inputRefs,
        options: [
            { value: '120', label: '120' },
            { value: '60', label: '60' },
            { value: '30', label: '30' },
            { value: '24', label: '24' },
            { value: 'custom', label: t('popup.recordVideo.custom') }
        ]
    });

    const customFps = createLabeledInput1({ value: 30, labelText: t('popup.recordVideo.customFps'), type: 'number', assign: 'custom_fps', ref: inputRefs });
    customFps.wrapper.style.cssText = 'display:none; margin-top:4px;';
    fpsField.wrapper.appendChild(customFps.wrapper);

    fpsField.input.addEventListener('change', (e) => {
        customFps.wrapper.style.display = e.target.value === 'custom' ? 'block' : 'none';
    });

    // ==========================================
    // 4. 音量與音訊控制項
    // ==========================================
    const bgmVolField = createLabeledInput1({ value: settings.musicVolume ?? 0.8, labelText: t('popup.recordVideo.bgmVolume'), type: 'number', assign: 'record_bgm_vol', ref: inputRefs });
    const sfxVolField = createLabeledInput1({ value: settings.SfxVolume ?? 1, labelText: t('popup.recordVideo.sfxVolume'), type: 'number', assign: 'record_sfx_vol', ref: inputRefs });

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
    const allPerfectSwitch = createCustomSwitch(t('popup.recordVideo.includeAllPerfect'), false);

    container.append(
        timeWrapper,
        resField.wrapper,
        fpsField.wrapper,
        bgmVolField.wrapper,
        sfxVolField.wrapper,
        audioSwitch.wrapper,
        sfxSwitch.wrapper,
        introSwitch.wrapper,
    );

    popupWindow({
        title: t('popup.recordVideo.title'),
        customContent: container,
        width: '420px',
        buttons: [
            {
                text: t('popup.start'),
                onClick: async (pwCtx) => {
                    const startVal = Number(startInput.value);
                    const endVal = Number(endInput.value);

                    let widthVal, heightVal;
                    if (resField.input.value === 'custom') {
                        widthVal = parseInt(inputRefs.custom_w?.value || 1080, 10);
                        heightVal = parseInt(inputRefs.custom_h?.value || 720, 10);
                    } else {
                        [widthVal, heightVal] = resField.input.value.split('x').map(Number);
                    }

                    let fpsVal;
                    if (fpsField.input.value === 'custom') {
                        fpsVal = parseInt(inputRefs.custom_fps?.value || 30, 10);
                    } else {
                        fpsVal = parseInt(fpsField.input.value, 10);
                    }

                    const bgmVolValNum = Number(inputRefs.record_bgm_vol?.value || 1);
                    const sfxVolValNum = Number(inputRefs.record_sfx_vol?.value || 1);
                    const bgmLoaded = !!audioManager?.bgmBuffer;

                    if (playButton && playButton.dataset.playing === 'true') playButton.click();

                    const renderer = typeof getRenderer === 'function' ? getRenderer() : null;
                    const notes = typeof getNotes === 'function' ? getNotes() : [];
                    const playScoreRes = typeof getPlayScoreRes === 'function' ? getPlayScoreRes() : {};
                    const maidata = typeof getMaidata === 'function' ? getMaidata() : {};
                    const nowDifficulty = typeof getNowDifficulty === 'function' ? getNowDifficulty() : 5;

                    videoRender(audioManager, canvas, renderer, {
                        start: startVal,
                        end: endVal,
                        fps: fpsVal,
                        width: widthVal,
                        height: heightVal,
                        bgmVolume: bgmVolValNum,
                        sfxVolume: sfxVolValNum,
                        includeBgm: audioSwitch.checked && bgmLoaded,
                        includeSfx: sfxSwitch.checked,
                        includeIntro: introSwitch.checked,
                        includeAllPerfect: allPerfectSwitch.checked,
                        musicDelay,
                        editorBackgroundImage,
                        editorBackgroundVideo,
                        notes,
                        playScoreRes,
                        chartInfo: {
                            title: maidata.title ?? '',
                            artist: maidata.artist ?? '-',
                            des: maidata["des_" + nowDifficulty] ?? '-',
                            lv: maidata["lv_" + nowDifficulty] ?? '0',
                            difficulty: nowDifficulty,
                            bpm: maidata.wholebpm ?? 0,
                        },
                    });

                    pwCtx.close();
                },
            },
            { text: t('popup.cancel'), hideOnClick: true }
        ]
    });
}
