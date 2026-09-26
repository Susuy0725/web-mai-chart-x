import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 將 AudioBuffer 轉換為 16-bit PCM WAV Blob
 */
export function audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // 1 = raw PCM
    const bitDepth = 16;

    let result;
    if (numOfChan === 2) {
        result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
        result = buffer.getChannelData(0);
    }

    return writeWavFile(result, numOfChan, sampleRate, format, bitDepth);
}

function interleave(inputL, inputR) {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;
    while (index < length) {
        result[index++] = inputL[inputIndex];
        result[index++] = inputR[inputIndex];
        inputIndex++;
    }
    return result;
}

function writeWavFile(samples, numOfChan, sampleRate, format, bitDepth) {
    const blockAlign = numOfChan * (bitDepth / 8);
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * (bitDepth / 8);
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numOfChan, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * 音訊緩衝區管理器（負責音訊運算、備份與復原）
 */
export class BgmEditorBufferManager {
    constructor(audioManager) {
        this.audioManager = audioManager;
        // 核心儲存：保留最原始的音訊備份
        this.originalBuffer = audioManager.bgmBuffer;
        // 當前編輯中的緩衝區
        this.currentBuffer = audioManager.bgmBuffer;
    }

    get buffer() { return this.currentBuffer; }
    get duration() { return this.currentBuffer ? this.currentBuffer.duration : 0; }
    get sampleRate() { return this.currentBuffer ? this.currentBuffer.sampleRate : 44100; }

    /** 復原功能：還原至最原始匯入的狀態 */
    restoreOriginal() {
        this.currentBuffer = this.originalBuffer;
        this.audioManager.bgmBuffer = this.originalBuffer;
    }

    /** 建立新的 AudioBuffer 並複製資料 */
    createNewBuffer(newLength, copyCallback) {
        const ctx = this.audioManager.ctx;
        const oldBuf = this.currentBuffer;
        const newBuffer = ctx.createBuffer(oldBuf.numberOfChannels, newLength, oldBuf.sampleRate);

        for (let ch = 0; ch < oldBuf.numberOfChannels; ch++) {
            const oldData = oldBuf.getChannelData(ch);
            const newData = newBuffer.getChannelData(ch);
            copyCallback(oldData, newData);
        }

        this.currentBuffer = newBuffer;
        this.audioManager.bgmBuffer = newBuffer;
        return newBuffer;
    }

    /** 裁切音訊：刪除起點前或指定長度的音訊 */
    cropStart(offsetTime) {
        const startSample = Math.floor(offsetTime * this.sampleRate);
        const newLen = this.currentBuffer.length - startSample;
        if (newLen <= 0) return false;

        this.createNewBuffer(newLen, (oldData, newData) => {
            newData.set(oldData.subarray(startSample));
        });
        return true;
    }

    /** 補白音訊：在開頭插入指定秒數的靜音 */
    padStart(seconds) {
        const padSamples = Math.floor(seconds * this.sampleRate);
        const newLen = this.currentBuffer.length + padSamples;

        this.createNewBuffer(newLen, (oldData, newData) => {
            newData.set(oldData, padSamples); // 前面自動補 0 靜音
        });
    }
}

/**
 * 波形畫布管理器（負責視覺波形渲染計算）
 */
export class BgmEditorWaveformCanvas {
    constructor(canvas, bufferManager) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.bm = bufferManager;
    }

    /** 繪製渲染核心 */
    draw(offsetTime, zoomValue) {
        const bgmBuffer = this.bm.buffer;
        if (!bgmBuffer) return;
        const duration = this.bm.duration;
        const data = bgmBuffer.getChannelData(0);

        const zoom = Math.max(1, parseFloat(zoomValue) || 1);
        const viewLength = Math.max(0.1, duration / zoom);
        const viewCenter = Math.min(duration, Math.max(0, offsetTime));

        let viewStart = viewCenter - viewLength / 2;
        if (viewStart < 0) viewStart = 0;
        if (viewStart + viewLength > duration) viewStart = Math.max(0, duration - viewLength);
        const viewEnd = viewStart + viewLength;

        const startSample = Math.floor(viewStart * this.bm.sampleRate);
        const endSample = Math.min(data.length, Math.ceil(viewEnd * this.bm.sampleRate));
        const viewSamples = Math.max(1, endSample - startSample);
        const step = Math.ceil(viewSamples / this.canvas.width);

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. 繪製藍色音訊波形
        this.ctx.fillStyle = '#1e90ff';
        for (let i = 0; i < this.canvas.width; i++) {
            let min = 1.0, max = -1.0;
            const sampleBase = startSample + Math.floor((i / this.canvas.width) * viewSamples);
            for (let j = 0; j < step; j++) {
                const idx = sampleBase + j;
                if (idx >= endSample) break;
                const datum = data[idx];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            const y = (1 - max) * this.canvas.height / 2;
            const h = Math.max(1, (max - min) * this.canvas.height / 2);
            this.ctx.fillRect(i, y, 1, h);
        }

        // 2. 繪製紅色播放頭
        const x = ((offsetTime - viewStart) / viewLength) * this.canvas.width;
        this.ctx.strokeStyle = '#ff3333';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(Math.max(0, Math.min(this.canvas.width, x)), 0);
        this.ctx.lineTo(Math.max(0, Math.min(this.canvas.width, x)), this.canvas.height);
        this.ctx.stroke();
    }
}

/**
 * 開啟 BGM 波形編輯器彈窗
 */
export function openBgmEditor({
    audioManager,
    getMusicDelay,
    setMusicDelay,
    getClockBpm,
    offsetInput,
    editorInput,
    applyHighlight,
    inputDebounce,
    offsetInputDebounce,
    projSet,
}) {
    if (!audioManager.bgmBuffer) {
        simpleToast({ content: t('toast.needBgm'), type: 'warning' });
        return;
    }

    const clockBpm = typeof getClockBpm === 'function' ? getClockBpm() : 60;
    const initialMusicDelay = typeof getMusicDelay === 'function' ? getMusicDelay() : 0;

    const bufferManager = new BgmEditorBufferManager(audioManager);
    let offsetTime = initialMusicDelay;
    let isPreviewing = false;
    let previewInterval;
    let editTaps = [];
    let wasPreviewingBeforeDrag = false;

    const container = document.createElement('div');
    container.className = 'popup-waveform-container';

    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 120;
    canvas.className = 'popup-waveform-canvas';
    container.appendChild(canvas);

    const wfCanvas = new BgmEditorWaveformCanvas(canvas, bufferManager);

    const controls = document.createElement('div');
    controls.className = 'popup-waveform-controls';
    controls.innerHTML = `
        <!-- 第一排: BPM 敲擊與第一拍偏移 -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
            <!-- BPM 區塊 -->
            <div style="background:#1a1a1a; padding:10px; border-radius:6px; border:1px solid #333; display:flex; flex-direction:column; gap:6px;">
                <span style="font-weight:bold; color:#00a2ff; font-size:12px;">BPM & Tap Estimator</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <input type="number" id="editBpmInput" value="${clockBpm}" style="width:70px; background:#111; color:#fff; border:1px solid #444; padding:6px; border-radius:4px; font-weight:bold; text-align:center; font-size:13px;">
                    <button id="editTapBpmBtn" type="button" style="padding:6px 14px; background:#0055ff; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px; user-select:none; transition:background 0.2s;">Tap</button>
                    <button id="editTapResetBtn" type="button" style="padding:6px 8px; background:#333; color:#ccc; border:1px solid #444; border-radius:4px; cursor:pointer; font-size:11px;">${t('popup.tapBpm.btnReset')}</button>
                </div>
                <span id="editTapBpmStatus" style="font-size:11px; color:#888;">${t('popup.tapBpm.msgNotStarted')}</span>
            </div>

            <!-- 第一拍偏移區塊 -->
            <div style="background:#1a1a1a; padding:10px; border-radius:6px; border:1px solid #333; display:flex; flex-direction:column; gap:6px; justify-content:space-between;">
                <div>
                    <span style="font-weight:bold; color:#00a2ff; font-size:12px;">${t('popup.editMusic.firstBeatOffset')}</span>
                    <div style="display:flex; align-items:center; gap:6px; margin-top:6px; flex-wrap:wrap;">
                        <input type="number" id="editOffsetInput" value="${initialMusicDelay.toFixed(2)}" step="0.01" style="width:85px; background:#111; color:#fff; border:1px solid #444; padding:6px; border-radius:4px; font-weight:bold; text-align:center; font-size:13px;">
                        <span style="color:#aaa; font-size:12px; margin-right:4px;">s</span>
                        <button id="shiftDecBeatBtn" type="button" style="padding:6px 10px; background:#2a2a2a; color:#ff4d4d; border:1px solid #444; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px; user-select:none; transition:background 0.2s;">-1 拍</button>
                        <button id="shiftIncBeatBtn" type="button" style="padding:6px 10px; background:#2a2a2a; color:#22c55e; border:1px solid #444; border-radius:4px; cursor:pointer; font-weight:bold; font-size:11px; user-select:none; transition:background 0.2s;">+1 拍</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 第二排: Waveform Zoom & BGM Vol -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px; background:#1a1a1a; padding:12px; border-radius:6px; border:1px solid #333;">
            <div style="display:flex; flex-direction:column; gap:6px; justify-content:center;">
                <span style="font-weight:bold; color:#00a2ff; font-size:12px;">Zoom Waveform</span>
                <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                    <button id="zoomOutBtn" type="button" style="width:30px; height:30px; background:#333; color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer; font-weight:bold; display:flex; align-items:center; justify-content:center; font-size:16px; user-select:none;">-</button>
                    <input type="range" id="editZoomSlider" min="1" max="20" step="0.5" value="1" style="flex:1; cursor:pointer; margin:0; height:6px;">
                    <button id="zoomInBtn" type="button" style="width:30px; height:30px; background:#333; color:#fff; border:1px solid #444; border-radius:4px; cursor:pointer; font-weight:bold; display:flex; align-items:center; justify-content:center; font-size:16px; user-select:none;">+</button>
                    <span id="zoomValLabel" style="font-size:11px; color:#ccc; min-width:32px; text-align:right; font-weight:bold;">1.0x</span>
                </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px; justify-content:center;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; color:#aaa; font-size:12px;">BGM Volume</span>
                    <input type="number" id="editBgmVolumeInput" value="0.75" min="0" max="1" step="0.05" style="width:65px; background:#111; color:#fff; border:1px solid #444; padding:5px 8px; border-radius:4px; text-align:center; font-size:13px; font-weight:bold;">
                </div>
            </div>
        </div>

        <!-- 第三排: 節拍器預覽與精準 Shift 偏移 -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
            <button id="playClockBtn" type="button" style="width:100%; height:44px; background:#222; color:#00a2ff; border:1px solid #00a2ff; border-radius:6px; cursor:pointer; font-weight:bold; font-size:13px; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s;">
                <span style="font-size:16px;">⏱️</span> ${t('popup.editMusic.previewMetronome')}
            </button>
        </div>
    `;
    container.appendChild(controls);

    const bpmInput = controls.querySelector('#editBpmInput');
    const offsetInputNode = controls.querySelector('#editOffsetInput');
    const bgmVolumeInput = controls.querySelector('#editBgmVolumeInput');

    const editTapBpmBtn = controls.querySelector('#editTapBpmBtn');
    const editTapResetBtn = controls.querySelector('#editTapResetBtn');
    const editTapBpmStatus = controls.querySelector('#editTapBpmStatus');

    const zoomSlider = controls.querySelector('#editZoomSlider');
    const zoomInBtn = controls.querySelector('#zoomInBtn');
    const zoomOutBtn = controls.querySelector('#zoomOutBtn');
    const zoomValLabel = controls.querySelector('#zoomValLabel');

    const playClockBtn = controls.querySelector('#playClockBtn');
    const shiftDecBeatBtn = controls.querySelector('#shiftDecBeatBtn');
    const shiftIncBeatBtn = controls.querySelector('#shiftIncBeatBtn');

    // 首拍對齊 UI 卡片
    const alignCard = document.createElement('div');
    alignCard.className = 'popup-align-card';

    const alignHeader = document.createElement('div');
    alignHeader.className = 'popup-align-header';
    alignHeader.innerHTML = `<span>${t('popup.editMusic.alignmentTitle')}</span><span id="currentBeatsSpan" style="color:#aaa;"></span>`;

    const alignBody = document.createElement('div');
    alignBody.className = 'popup-align-body';
    alignBody.innerHTML = `
        <span>${t('popup.editMusic.alignmentPrefix')}</span>
        <input type="number" id="alignBeatsInput" value="4" style="width:55px; background:#111; color:#fff; border:1px solid #444; padding:5px; border-radius:4px; text-align:center; font-weight:bold; font-size:12px;">
        <span>${t('popup.editMusic.alignmentSuffix')}</span>
        <button id="alignBeatsBtn" type="button" style="padding:6px 14px; background:#006400; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">${t('popup.editMusic.alignmentBtn')}</button>
    `;

    const alignFooter = document.createElement('div');
    alignFooter.className = 'popup-align-footer';
    alignFooter.textContent = t('popup.editMusic.alignmentDesc');

    alignCard.appendChild(alignHeader);
    alignCard.appendChild(alignBody);
    alignCard.appendChild(alignFooter);
    container.appendChild(alignCard);

    const alignBeatsInput = alignBody.querySelector('#alignBeatsInput');
    const alignBeatsBtn = alignBody.querySelector('#alignBeatsBtn');
    const currentBeatsSpan = alignHeader.querySelector('#currentBeatsSpan');

    const updateAlignmentUI = () => {
        const bpm = parseFloat(bpmInput.value) || clockBpm;
        const secPerBeat = 60 / bpm;
        const curBeats = offsetTime / secPerBeat;
        currentBeatsSpan.textContent = t('popup.editMusic.alignmentCurrent', { beats: curBeats.toFixed(2) });

        if (document.activeElement !== alignBeatsInput) {
            const suggested = Math.max(4, Math.ceil(curBeats / 4) * 4);
            alignBeatsInput.value = suggested;
        }
    };

    const triggerRedraw = () => {
        wfCanvas.draw(offsetTime, parseFloat(zoomSlider.value));
        updateAlignmentUI();
    };

    const startPreview = () => {
        stopPreview();
        const bpm = parseFloat(bpmInput.value) || clockBpm;
        const msPerBeat = 60000 / bpm;

        audioManager.playBGM(offsetTime, parseFloat(bgmVolumeInput.value) || 0.75);

        let expectedTickTime = performance.now() + msPerBeat;
        previewInterval = setInterval(() => {
            const now = performance.now();
            if (now >= expectedTickTime) {
                audioManager.play('clock');
                expectedTickTime += msPerBeat;
            }
        }, 10);

        playClockBtn.innerHTML = `<span style="font-size:16px;">⏱️</span> ${t('popup.editMusic.stopPreview')}`;
        isPreviewing = true;
    };

    const stopPreview = () => {
        if (isPreviewing || previewInterval) {
            clearInterval(previewInterval);
            previewInterval = null;
            audioManager.stopBGM();
            playClockBtn.innerHTML = `<span style="font-size:16px;">⏱️</span> ${t('popup.editMusic.previewMetronome')}`;
            isPreviewing = false;
        }
    };

    const updateZoom = (val) => {
        val = Math.max(1, Math.min(30, parseFloat(val) || 1));
        zoomSlider.value = val;
        zoomValLabel.textContent = `${val.toFixed(1)}x`;
        triggerRedraw();
    };
    zoomSlider.addEventListener('input', () => updateZoom(zoomSlider.value));
    zoomInBtn.addEventListener('click', () => updateZoom(parseFloat(zoomSlider.value) + 1));
    zoomOutBtn.addEventListener('click', () => updateZoom(parseFloat(zoomSlider.value) - 1));

    const updateTapDisplay = () => {
        if (editTaps.length === 0) {
            editTapBpmStatus.textContent = t('popup.tapBpm.msgNotStarted');
        } else if (editTaps.length === 1) {
            editTapBpmStatus.textContent = t('popup.tapBpm.msgOneMore');
        } else {
            const intervals = [];
            for (let i = 1; i < editTaps.length; i++) {
                intervals.push(editTaps[i] - editTaps[i - 1]);
            }
            const avg = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
            const bpm = 60000 / avg;
            if (isFinite(bpm) && bpm > 0) {
                bpmInput.value = bpm.toFixed(1);
                editTapBpmStatus.textContent = `${bpm.toFixed(1)} BPM (${editTaps.length} taps)`;
                updateAlignmentUI();
            }
        }
    };
    editTapBpmBtn.addEventListener('click', () => {
        editTaps.push(performance.now());
        if (editTaps.length > 12) editTaps.shift();
        updateTapDisplay();
    });
    editTapResetBtn.addEventListener('click', () => {
        editTaps = [];
        updateTapDisplay();
    });

    bpmInput.addEventListener('input', updateAlignmentUI);
    offsetInputNode.addEventListener('change', (e) => {
        offsetTime = parseFloat(e.target.value) || 0;
        triggerRedraw();
    });

    const adjustOffsetByBeat = (direction) => {
        const bpm = parseFloat(bpmInput.value) || clockBpm;
        if (bpm <= 0) return;
        const secPerBeat = 60 / bpm;

        const wasPlaying = isPreviewing;
        if (wasPlaying) {
            stopPreview();
        }

        offsetTime = Math.max(0, offsetTime + direction * secPerBeat);
        offsetInputNode.value = offsetTime.toFixed(2);
        triggerRedraw();

        if (wasPlaying) {
            startPreview();
        }
    };

    shiftDecBeatBtn.addEventListener('click', () => adjustOffsetByBeat(-1));
    shiftIncBeatBtn.addEventListener('click', () => adjustOffsetByBeat(1));

    let isDragging = false;
    let startX = 0;
    let startOffset = 0;

    const handleStart = (clientX) => {
        isDragging = true;
        startX = clientX;
        startOffset = offsetTime;

        wasPreviewingBeforeDrag = isPreviewing;
        if (isPreviewing) {
            audioManager.stopBGM();
            clearInterval(previewInterval);
        }

        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const zoom = parseFloat(zoomSlider.value) || 1;
        const duration = bufferManager.duration;
        const viewLength = Math.max(0.1, duration / zoom);
        const viewCenter = Math.min(duration, Math.max(0, offsetTime));

        let viewStart = viewCenter - viewLength / 2;
        if (viewStart < 0) viewStart = 0;
        if (viewStart + viewLength > duration) viewStart = Math.max(0, duration - viewLength);

        offsetTime = Math.max(0, Math.min(duration, viewStart + (x / rect.width) * viewLength));
        offsetInputNode.value = offsetTime.toFixed(2);
        startOffset = offsetTime;
        triggerRedraw();
    };

    const handleMove = (clientX) => {
        if (!isDragging) return;
        const rect = canvas.getBoundingClientRect();
        const deltaX = clientX - startX;
        const zoom = parseFloat(zoomSlider.value) || 1;
        const duration = bufferManager.duration;
        const viewLength = Math.max(0.1, duration / zoom);
        const deltaTime = (deltaX / rect.width) * viewLength;

        offsetTime = Math.max(0, Math.min(duration, startOffset - deltaTime));
        offsetInputNode.value = offsetTime.toFixed(2);
        triggerRedraw();
    };

    const handleEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        if (wasPreviewingBeforeDrag) {
            startPreview();
        }
    };

    playClockBtn.addEventListener('click', () => {
        if (isPreviewing) stopPreview(); else startPreview();
    });

    const onWindowMouseMove = (e) => handleMove(e.clientX);
    const onWindowMouseUp = () => handleEnd();
    const onWindowTouchMove = (e) => {
        if (e.touches.length > 0) {
            handleMove(e.touches[0].clientX);
        }
    };
    const onWindowTouchEnd = () => handleEnd();

    canvas.addEventListener('mousedown', (e) => handleStart(e.clientX));
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            handleStart(e.touches[0].clientX);
        }
    }, { passive: true });
    window.addEventListener('touchmove', onWindowTouchMove, { passive: true });
    window.addEventListener('touchend', onWindowTouchEnd);

    alignBeatsBtn.addEventListener('click', () => {
        stopPreview();
        const bpm = parseFloat(bpmInput.value) || clockBpm;
        const secPerBeat = 60 / bpm;
        const targetBeats = parseFloat(alignBeatsInput.value) || 4;
        const targetDuration = targetBeats * secPerBeat;
        const padDuration = targetDuration - offsetTime;

        if (padDuration > 0) {
            bufferManager.padStart(padDuration);
            offsetTime = targetDuration;
            offsetInputNode.value = offsetTime.toFixed(2);
            triggerRedraw();
            simpleToast({
                content: t('toast.padBeatsSuccess', {
                    seconds: padDuration.toFixed(3),
                    beats: targetBeats
                }),
                type: 'success'
            });
        } else {
            simpleToast({ content: t('toast.padBeatsInvalid'), type: 'warning' });
        }
    });

    const actionBox = document.createElement('div');
    actionBox.className = 'popup-action-box';

    const cropBtn = document.createElement('button');
    cropBtn.id = 'cropBtn';
    cropBtn.type = 'button';
    cropBtn.innerHTML = `✂️ ${t('popup.editMusic.cropBefore')}`;
    cropBtn.className = 'popup-crop-btn';
    cropBtn.addEventListener('click', () => {
        if (offsetTime <= 0) return;
        if (!confirm(t('popup.editMusic.confirmCropBefore'))) return;

        stopPreview();
        if (bufferManager.cropStart(offsetTime)) {
            offsetTime = 0;
            offsetInputNode.value = "0.00";
            triggerRedraw();
            simpleToast({ content: t('toast.cropSuccess'), type: 'success' });
        }
    });

    const padBtn = document.createElement('button');
    padBtn.id = 'padBtn';
    padBtn.type = 'button';
    padBtn.innerHTML = `➕ ${t('popup.editMusic.padOneBeat')}`;
    padBtn.className = 'popup-pad-btn';
    padBtn.addEventListener('click', () => {
        stopPreview();
        const bpm = parseFloat(bpmInput.value) || clockBpm;
        const secPerBeat = 60 / bpm;

        bufferManager.padStart(secPerBeat);
        offsetTime += secPerBeat;
        offsetInputNode.value = offsetTime.toFixed(2);
        triggerRedraw();
        simpleToast({ content: t('toast.padSuccess'), type: 'success' });
    });

    const restoreBtn = document.createElement('button');
    restoreBtn.id = 'restoreBtn';
    restoreBtn.type = 'button';
    restoreBtn.innerHTML = `🔄 ${t('popup.editMusic.restoreOriginal')}`;
    restoreBtn.className = 'popup-restore-btn';
    restoreBtn.addEventListener('click', () => {
        if (!confirm(t('popup.editMusic.confirmRestore'))) return;
        stopPreview();
        bufferManager.restoreOriginal();
        offsetTime = initialMusicDelay;
        offsetInputNode.value = offsetTime.toFixed(2);
        triggerRedraw();
        simpleToast({ content: t('toast.restoreSuccess'), type: 'info' });
    });

    actionBox.appendChild(cropBtn);
    actionBox.appendChild(padBtn);
    actionBox.appendChild(restoreBtn);
    container.appendChild(actionBox);

    setTimeout(triggerRedraw, 100);

    popupWindow({
        title: t('popup.editMusic.title'),
        customContent: container,
        width: 'max-content',
        buttons: [
            {
                text: t('popup.apply'),
                onClick: async (ctx) => {
                    const bpm = parseFloat(bpmInput.value) || clockBpm;
                    const newDelay = parseFloat(offsetTime.toFixed(2));
                    if (typeof setMusicDelay === 'function') {
                        setMusicDelay(newDelay);
                    }

                    if (offsetInput) offsetInput.value = newDelay.toFixed(2);
                    if (editorInput) editorInput.value += `\n(${bpm})`;

                    if (typeof applyHighlight === 'function') applyHighlight(editorInput.value);
                    if (typeof inputDebounce === 'function') inputDebounce();
                    if (typeof offsetInputDebounce === 'function') offsetInputDebounce();

                    stopPreview();

                    simpleToast({ content: t('toast.savingMusic'), type: 'info' });

                    try {
                        const wavBlob = audioBufferToWav(audioManager.bgmBuffer);
                        let fileName = 'bgm.wav';
                        if (audioManager.bgmFile && audioManager.bgmFile.name) {
                            fileName = audioManager.bgmFile.name;
                            if (!fileName.toLowerCase().endsWith('.wav')) {
                                const lastDotIdx = fileName.lastIndexOf('.');
                                if (lastDotIdx !== -1) {
                                    fileName = fileName.substring(0, lastDotIdx) + '.wav';
                                } else {
                                    fileName = fileName + '.wav';
                                }
                            }
                        }
                        const editedFile = new File([wavBlob], fileName, { type: 'audio/wav' });
                        audioManager.bgmFile = editedFile;

                        if (typeof projSet === 'function') {
                            await projSet('resource_bgm', editedFile);
                        }
                        simpleToast({ content: t('toast.saveMusicSuccess'), type: 'success' });
                    } catch (err) {
                        console.error('Failed to save BGM:', err);
                        simpleToast({ content: t('toast.saveMusicError'), type: 'error' });
                    }

                    ctx.close();
                }
            },
            {
                text: t('popup.cancel'),
                hideOnClick: true,
                onClick: () => {
                    stopPreview();
                    bufferManager.restoreOriginal();
                }
            }
        ],
        onClose: () => {
            stopPreview();
            window.removeEventListener('mousemove', onWindowMouseMove);
            window.removeEventListener('mouseup', onWindowMouseUp);
            window.removeEventListener('touchmove', onWindowTouchMove, { passive: true });
            window.removeEventListener('touchend', onWindowTouchEnd);
        }
    });
}

/**
 * 開啟 Tap BPM 估算彈窗
 */
export function openTapBpm({ editorInput, applyHighlight, inputDebounce, setEditorCss }) {
    let taps = [];

    const container = document.createElement('div');
    container.className = 'popup-tap-container';

    const hint = document.createElement('div');
    hint.innerText = t('popup.tapBpm.hint');
    container.appendChild(hint);

    const stats = document.createElement('div');
    stats.className = 'popup-tap-stats';
    stats.innerHTML = `
        <div>${t('popup.tapBpm.count')}<strong id="tapBpmCount">0</strong></div>
        <div>${t('popup.tapBpm.bpm')}<strong id="tapBpmValue">--</strong></div>
    `;
    container.appendChild(stats);

    const tapButton = document.createElement('button');
    tapButton.type = 'button';
    tapButton.innerText = t('popup.tapBpm.btnTap');
    tapButton.className = 'popup-tap-btn';
    container.appendChild(tapButton);

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.innerText = t('popup.tapBpm.btnReset');
    resetButton.className = 'popup-tap-reset-btn';
    container.appendChild(resetButton);

    const message = document.createElement('div');
    message.className = 'popup-tap-message';
    message.innerText = t('popup.tapBpm.msgNotStarted');
    container.appendChild(message);

    const updateDisplay = () => {
        const countElem = container.querySelector('#tapBpmCount');
        const bpmElem = container.querySelector('#tapBpmValue');
        if (countElem) countElem.innerText = taps.length.toString();

        if (taps.length < 2) {
            if (bpmElem) bpmElem.innerText = '--';
            message.innerText = taps.length === 0 ? t('popup.tapBpm.msgNotStarted') : t('popup.tapBpm.msgOneMore');
            return;
        }

        const intervals = [];
        for (let i = 1; i < taps.length; i++) {
            intervals.push(taps[i] - taps[i - 1]);
        }
        const avg = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
        const bpm = 60000 / avg;
        if (bpmElem) bpmElem.innerText = isFinite(bpm) ? bpm.toFixed(1) : '--';
        message.innerText = t('popup.tapBpm.msgIntervals', { count: intervals.length });
    };

    tapButton.addEventListener('click', () => {
        taps.push(performance.now());
        if (taps.length > 12) taps.shift();
        updateDisplay();
    });

    resetButton.addEventListener('click', () => {
        taps = [];
        updateDisplay();
    });

    popupWindow({
        title: t('popup.tapBpm.title'),
        customContent: container,
        buttons: [
            {
                text: t('popup.tapBpm.btnSave'),
                onClick: (ctx) => {
                    if (taps.length < 2) {
                        simpleToast({ content: t('toast.tapBpmWarning'), type: 'warning', timeout: 1800 });
                        return;
                    }

                    const intervals = [];
                    for (let i = 1; i < taps.length; i++) {
                        intervals.push(taps[i] - taps[i - 1]);
                    }
                    const avg = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
                    const bpm = 60000 / avg;
                    if (!isFinite(bpm) || bpm <= 0) {
                        simpleToast({ content: t('toast.tapBpmError'), type: 'error', timeout: 1800 });
                        return;
                    }
                    if (editorInput) editorInput.value += `(${bpm.toFixed(1)})`;

                    if (typeof setEditorCss === 'function') setEditorCss();
                    if (typeof applyHighlight === 'function') applyHighlight(editorInput.value);
                    if (typeof inputDebounce === 'function') inputDebounce();

                    simpleToast({ content: t('toast.tapBpmSuccess', { bpm: bpm.toFixed(1) }), type: 'success', timeout: 1800 });
                    ctx.close();
                },
                hideOnClick: true
            },
            {
                text: t('popup.close'),
                hideOnClick: true
            }
        ]
    });
}
