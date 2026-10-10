import { ensureMediabunny, simpleToast, popupWindow } from '../helper.js';
import { SimaiLogicControler } from '../core/simaiLogicControler.js';

async function resampleAudioBuffer(audioBuffer, targetSampleRate = 44100) {
    if (audioBuffer.sampleRate === targetSampleRate) {
        return audioBuffer;
    }
    const numberOfChannels = audioBuffer.numberOfChannels;
    const duration = audioBuffer.duration;
    const offlineCtx = new OfflineAudioContext(
        numberOfChannels,
        Math.max(1, Math.ceil(targetSampleRate * duration)),
        targetSampleRate
    );
    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(offlineCtx.destination);
    bufferSource.start();
    return await offlineCtx.startRendering();
}

function padAudioBuffer(audioBuffer, targetLength) {
    if (audioBuffer.length >= targetLength) {
        return audioBuffer;
    }
    const nb = new AudioBuffer({
        length: targetLength,
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate
    });
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        nb.getChannelData(ch).set(audioBuffer.getChannelData(ch));
    }
    return nb;
}

function padAudioBufferFront(buf, frontSeconds) {
    if (!buf || frontSeconds <= 0) return buf;
    const sr = buf.sampleRate;
    const padSamples = Math.floor(frontSeconds * sr);
    const newLen = buf.length + padSamples;
    const nb = new AudioBuffer({ length: newLen, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const dst = nb.getChannelData(ch);
        const src = buf.getChannelData(ch);
        dst.set(src, padSamples);
    }
    return nb;
}

function mixAudioBuffer(dstBuffer, srcBuffer, startSec, volume = 1.0, detune = 0, maxDurationSec = null) {
    if (!dstBuffer || !srcBuffer || volume <= 0) return;
    const dstSr = dstBuffer.sampleRate;
    const srcSr = srcBuffer.sampleRate || dstSr;

    const pitchRatio = detune !== 0 ? Math.pow(2, detune / 1200) : 1.0;
    const ratio = (srcSr / dstSr) * pitchRatio;

    const startSample = Math.floor(startSec * dstSr);

    let srcDurationSec = srcBuffer.duration / pitchRatio;
    let isTruncated = false;
    if (typeof maxDurationSec === 'number' && maxDurationSec > 0 && maxDurationSec < srcDurationSec) {
        srcDurationSec = maxDurationSec;
        isTruncated = true;
    }
    const totalDstSamples = Math.floor(srcDurationSec * dstSr);

    const dstStart = Math.max(0, startSample);
    const dstEnd = Math.min(dstBuffer.length, startSample + totalDstSamples);
    if (dstStart >= dstEnd) return;

    // 若被 mono 截斷或時間裁切，在結尾處提供 5ms (~220 samples) 線性淡出防爆音 (click/pop artifact)
    const fadeSamples = isTruncated ? Math.min(Math.floor(0.005 * dstSr), Math.floor((dstEnd - dstStart) * 0.5)) : 0;

    const dstChannels = dstBuffer.numberOfChannels;
    const srcChannels = srcBuffer.numberOfChannels;

    for (let ch = 0; ch < dstChannels; ch++) {
        const dstData = dstBuffer.getChannelData(ch);
        const srcData = srcBuffer.getChannelData(ch < srcChannels ? ch : 0);
        const srcLen = srcData.length;

        for (let dstIdx = dstStart; dstIdx < dstEnd; dstIdx++) {
            const i = dstIdx - startSample;
            const srcPos = i * ratio;
            const idx0 = Math.floor(srcPos);
            if (idx0 >= srcLen) break;
            const idx1 = idx0 + 1 < srcLen ? idx0 + 1 : idx0;
            const frac = srcPos - idx0;
            const s0 = srcData[idx0] || 0;
            const s1 = srcData[idx1] || 0;
            let val = (s0 * (1 - frac) + s1 * frac) * volume;

            // 淡出平滑處理
            if (fadeSamples > 0 && (dstEnd - dstIdx) <= fadeSamples) {
                const fadeFactor = (dstEnd - dstIdx) / fadeSamples;
                val *= fadeFactor;
            }

            dstData[dstIdx] += val;
        }
    }
}

function drawAllPerfectOverlay(ctx, apT, w, h) {
    if (apT <= 0) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const cx = w / 2;
    const cy = h / 2;

    const alpha = Math.min(1, apT * 3);
    const easeScale = Math.min(1, Math.sin(Math.min(1, apT * 2.5) * Math.PI * 0.5) * 1.1 - Math.max(0, apT * 2.5 - 1) * 0.1);

    ctx.globalAlpha = alpha;

    // 1. 金色背景放射光環與耀斑
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(easeScale, easeScale);

    const glowGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, Math.min(w, h) * 0.45);
    glowGrad.addColorStop(0, 'rgba(255, 230, 0, 0.4)');
    glowGrad.addColorStop(0.5, 'rgba(255, 120, 0, 0.15)');
    glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(w, h) * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(apT * 0.5);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255, 220, 100, 0.15)';
    for (let k = 0; k < 8; k++) {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-15, -Math.min(w, h) * 0.35, 30, Math.min(w, h) * 0.7);
    }
    ctx.restore();

    // 2. ALL PERFECT 金色金屬立體字樣
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(easeScale, easeScale);

    const fontSize = Math.min(w, h) * 0.13;
    ctx.font = `italic 900 ${fontSize}px "title", "combo", "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = "ALL PERFECT";

    ctx.lineWidth = fontSize * 0.15;
    ctx.strokeStyle = '#220800';
    ctx.strokeText(text, 0, fontSize * 0.05);

    ctx.lineWidth = fontSize * 0.08;
    ctx.strokeStyle = '#fff';
    ctx.strokeText(text, 0, 0);

    const textGrad = ctx.createLinearGradient(0, -fontSize * 0.5, 0, fontSize * 0.5);
    textGrad.addColorStop(0, '#FFFFFF');
    textGrad.addColorStop(0.25, '#FFF275');
    textGrad.addColorStop(0.5, '#FFB300');
    textGrad.addColorStop(0.85, '#FF6000');
    textGrad.addColorStop(1, '#FFE000');

    ctx.fillStyle = textGrad;
    ctx.fillText(text, 0, 0);

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(text, 0, -fontSize * 0.03);

    ctx.restore();
    ctx.restore();
}

export async function videoRender(audioManager, canvas, renderer, {
    start = 0,
    end = 0,
    fps = 60,
    width = 1920,
    height = 1080,
    bitrate = null,
    quality = 'high',
    bgmVolume = 0.8,
    sfxVolume = 1.0,
    includeAudio = true,
    includeBgm = true,
    includeSfx = true,
    includeIntro = true,
    includeAllPerfect = true,
    musicDelay = 0,
    editorBackgroundImage = null,
    editorBackgroundVideo = null,
    notes = [],
    playScoreRes = { tap: 0, hold: 0, slide: 0, touch: 0, break: 0, score: 0, breakScore: 0, invScore: 0 },
    chartInfo = {},
    overallBrightness = 1.0,
    movieBrightness = null,
    noteBrightness = 1.0,
    settings: customSettings = null,
    outlineImage: customOutlineImage = null,
    draw = null,
} = {}) {
    const effectiveDraw = typeof draw === 'function'
        ? draw
        : (typeof window !== 'undefined' && typeof window.draw === 'function' ? window.draw : null);

    if (!window.Mediabunny) {
        await ensureMediabunny();
    }
    const settings = customSettings || renderer?.settings || window.settings || {};

    // 計算背景與音符的最終亮度係數
    const baseMovieBrightness = movieBrightness !== null && movieBrightness !== undefined
        ? Number(movieBrightness)
        : Math.max(0, 1 + 0.1875 * (settings.moviebrightness ?? -3));
    const finalBgBrightness = Math.max(0, baseMovieBrightness * overallBrightness);
    const finalNoteBrightness = Math.max(0, (noteBrightness ?? 1.0) * overallBrightness);
    const {
        Output,
        BufferTarget,
        Mp4OutputFormat,
        CanvasSource,
        AudioBufferSource,
        QUALITY_HIGH,
        QUALITY_VERY_HIGH,
    } = window.Mediabunny || {};

    const introDuration = includeIntro ? 6 : 0;

    let outlineImage = customOutlineImage;
    if (!outlineImage && !settings.hideOutline) {
        const domOutline = typeof document !== 'undefined' ? document.getElementById('canvasOutline') : null;
        if (domOutline && domOutline.complete && domOutline.naturalWidth > 0) {
            outlineImage = domOutline;
        } else {
            outlineImage = await (async () => {
                try {
                    const outlineSrc = domOutline?.src || './Skin/Shared/outline.png';
                    const response = await fetch(outlineSrc);
                    if (!response.ok) throw new Error('fetch failed: ' + response.status);
                    const blob = await response.blob();
                    try {
                        if (window.createImageBitmap) return await createImageBitmap(blob, { resizeQuality: 'high' });
                    } catch (e) {
                        console.warn('createImageBitmap 失敗，改用 Image element', e);
                    }
                    return await new Promise((res, rej) => {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => { URL.revokeObjectURL(img.src); res(img); };
                        img.onerror = (err) => { URL.revokeObjectURL(img.src); rej(err); };
                        img.src = URL.createObjectURL(blob);
                    });
                } catch (e) {
                    console.error(`外框圖片載入失敗`, e);
                    return null;
                }
            })();
        }
    }

    if (end <= start) {
        console.log(end, start);
        simpleToast({ content: '結束時間需大於開始時間', type: 'error' });
        return;
    }

    const mainCtx = canvas.getContext('2d');
    const currentContext = renderer?.ctx || mainCtx;

    let exportVideo = null;
    let output = null;
    let mediabunnyInput = null;
    let mediabunnyCanvasSink = null;
    let videoTrack = null;
    let canvasIterator = null;
    let currentCanvasFrame = null;

    const popup = popupWindow({
        title: "渲染影片",
        content: "準備中...",
        unclosable: true,
        buttons: [{ text: '取消', hideOnClick: true }],
    })
    try {
        if (popup.isClosed) return;

        if (renderer) {
            renderer._isRenderingVideo = true;
        }

        // 強制確保寬高為偶數 (AVC/H.264 編碼器嚴格要求，避免奇數尺寸拋錯)
        const targetW = Math.max(2, Math.round((Number(width) || 1920) / 2) * 2);
        const targetH = Math.max(2, Math.round((Number(height) || 1080) / 2) * 2);

        const off = document.createElement('canvas');
        off.width = targetW;
        off.height = targetH;
        const offCtx = off.getContext('2d', {
            alpha: false,
            desynchronized: false,
            willReadFrequently: false
        });

        // 確保離屏繪製 context 具備高品質影像平滑
        offCtx.imageSmoothingEnabled = true;
        offCtx.imageSmoothingQuality = 'high';
        if ('textRendering' in offCtx) {
            try { offCtx.textRendering = 'geometricPrecision'; } catch (_) { }
        }

        // 鎖定 off 畫布尺寸，避免外部事件或意外 resize 竄改寬高
        try {
            const fixedW = targetW;
            const fixedH = targetH;
            Object.defineProperty(off, 'width', {
                get: () => fixedW,
                set: () => { },
                configurable: true
            });
            Object.defineProperty(off, 'height', {
                get: () => fixedH,
                set: () => { },
                configurable: true
            });
        } catch (_) { }

        // 建立獨立的匯出渲染器實例，徹底隔離主畫面的 window resize 與 drawFrame 迴圈
        let exportRenderer;
        let isUsingCustomRenderer = false;
        try {
            if (renderer && renderer.constructor) {
                exportRenderer = new renderer.constructor(off, settings);
                if (renderer.images) exportRenderer.setImages(renderer.images);
                if (renderer._tintCache) exportRenderer._tintCache = renderer._tintCache;
                if (renderer.scale) exportRenderer.scale = renderer.scale;
                isUsingCustomRenderer = true;
            }
        } catch (e) {
            console.warn('建立獨立匯出渲染器失敗，回退至主渲染器', e);
        }

        if (!isUsingCustomRenderer) {
            exportRenderer = renderer;
            renderer._isRenderingVideo = true;
            renderer.setContext(offCtx);
        }
        exportRenderer.resize(targetW, targetH, 1, true);
        if (exportRenderer.ctx) {
            exportRenderer.ctx.imageSmoothingEnabled = true;
            exportRenderer.ctx.imageSmoothingQuality = 'high';
        }

        const target = new BufferTarget();
        const format = new Mp4OutputFormat({ fastStart: 'in-memory' });
        output = new Output({ format, target });

        // 計算最適合音遊高速動態畫面的視訊編碼位元率 (Bitrate)
        let resolvedBitrate;
        if (typeof bitrate === 'number' && bitrate > 0) {
            resolvedBitrate = Math.round(bitrate);
        } else {
            // 根據解析度、FPS 與品質模式動態自適應計算 (bps)
            // 基準：1080p 60fps
            const pixels = targetW * targetH;
            const refPixels = 1920 * 1080;
            const pixelRatio = Math.max(0.5, pixels / refPixels);
            const fpsRatio = Math.max(0.6, Math.min(fps, 120) / 60);

            let baseBps = 20_000_000; // 預設 high: 20 Mbps @ 1080p 60fps
            if (quality === 'ultra') {
                baseBps = 28_000_000; // ultra: 28 Mbps @ 1080p 60fps
            } else if (quality === 'medium') {
                baseBps = 10_000_000; // medium: 10 Mbps @ 1080p 60fps
            } else if (quality === 'low') {
                baseBps = 5_000_000; // medium: 5 Mbps @ 1080p 60fps
            } else if (quality === 'lowest') {
                baseBps = 1_000_000; // medium: 1 Mbps @ 1080p 60fps
            }
            resolvedBitrate = Math.round(Math.max(6_000_000, baseBps * Math.pow(pixelRatio, 0.9) * Math.pow(fpsRatio, 0.75)));
        }

        // 視訊軌設定
        const encodingConfig = {
            codec: 'avc',
            bitrate: resolvedBitrate,
            keyFrameInterval: 2.0, // 2 秒關鍵幀，提升 GOP 編碼效率與動態畫質，消除過密 I 幀帶來的瞬時模糊
            latencyMode: 'quality',
            bitrateMode: 'variable'
        };

        const videoSource = new CanvasSource(off, encodingConfig);
        output.addVideoTrack(videoSource, { frameRate: fps });

        let exportVideoReady = false;
        if (editorBackgroundVideo && editorBackgroundVideo.src && editorBackgroundVideo.videoWidth > 0) {
            try {
                const { Input, UrlSource, BlobSource, CanvasSink, ALL_FORMATS } = window.Mediabunny;
                if (Input && CanvasSink) {
                    const source = editorBackgroundVideo.src.startsWith('blob:')
                        ? new BlobSource(await fetch(editorBackgroundVideo.src).then(r => r.blob()))
                        : new UrlSource(editorBackgroundVideo.src);

                    mediabunnyInput = new Input({
                        formats: ALL_FORMATS,
                        source
                    });

                    videoTrack = await mediabunnyInput.getPrimaryVideoTrack();
                    if (videoTrack) {
                        mediabunnyCanvasSink = new CanvasSink(videoTrack, { poolSize: 5 });
                        exportVideoReady = true;
                    }
                }
            } catch (e) {
                console.warn('建立 Mediabunny 背景影片解碼器失敗，將嘗試使用舊版影片元素 fallback', e);
            }

            if (!mediabunnyCanvasSink) {
                try {
                    exportVideo = document.createElement('video');
                    exportVideo.src = editorBackgroundVideo.src;
                    exportVideo.playsInline = true;
                    exportVideo.defaultMuted = true;
                    exportVideo.muted = true;
                    exportVideo.setAttribute('playsinline', '');
                    exportVideo.setAttribute('webkit-playsinline', '');
                    exportVideo.setAttribute('x5-playsinline', '');
                    exportVideo.setAttribute('disablePictureInPicture', '');
                    exportVideo.setAttribute('disableRemotePlayback', '');
                    exportVideo.crossOrigin = 'anonymous';
                    exportVideo.preload = 'auto';
                    exportVideo.style.position = 'fixed';
                    exportVideo.style.left = '-9999px';
                    exportVideo.style.top = '0';
                    exportVideo.style.width = '1px';
                    exportVideo.style.height = '1px';
                    exportVideo.style.opacity = '0.01';
                    exportVideo.style.pointerEvents = 'none';
                    document.body.appendChild(exportVideo);
                    await new Promise((res) => {
                        let done = false;
                        const onloaded = () => { if (done) return; done = true; res(); };
                        exportVideo.addEventListener('loadedmetadata', onloaded);
                        setTimeout(() => { if (done) return; done = true; res(); }, 1500);
                    });
                    exportVideoReady = true;
                } catch (e) {
                    console.warn('建立匯出用背景影片 (fallback) 失敗', e);
                }
            }
        }

        if (popup.isClosed) return;

        let audioSource = null;
        let slicedAudio = null;

        // 🔴 核心重構：先完整合成好音訊，拿到規格後再向 output 註冊音軌
        if (includeAudio) {
            if (includeBgm) {
                const t = audioManager.getBGMDuration();
                if (start < t && start < end) {
                    const sliceAudioBuffer = (buf, s, e) => {
                        const sr = buf.sampleRate;
                        const startSample = Math.max(0, Math.floor(s * sr));
                        const endSample = Math.min(buf.length, Math.floor(e * sr));
                        const len = Math.max(0, endSample - startSample);
                        if (len <= 0) return null;
                        const nb = new AudioBuffer({ length: len, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
                        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
                            const data = buf.getChannelData(ch).subarray(startSample, endSample);
                            nb.getChannelData(ch).set(data);
                        }
                        return nb;
                    };

                    const bgmBuf = audioManager.bgmBuffer;
                    slicedAudio = bgmBuf ? sliceAudioBuffer(bgmBuf, start, end) : null;
                }
            }

            if (includeSfx) {
                const sfxEvents = [];
                const longSoundEvents = [];
                const sfxFrameSet = new Set();

                for (let ni = 0; ni < notes.length; ni++) {
                    const note = notes[ni];
                    const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0);
                    const startT = note.time + musicDelay;
                    const endT = note.time + skipT + musicDelay;

                    if (startT >= start && startT <= end) {
                        note._startEffectPlayed = false;
                        const evs = audioManager.getSfxEventsForNote(note, startT + (note.slideDelay ?? 0));
                        if (!(note.type === "slide" && !note.firstSlide)) {
                            for (const ev of evs) {
                                // 改為毫秒級去重（避免以 fps 為單位而濾掉高頻觸發）
                                const timeMs = Math.floor(ev.time * 1000);
                                const dedupeKey = `${timeMs}_${ev.key}`;
                                if (sfxFrameSet.has(dedupeKey)) continue;
                                sfxFrameSet.add(dedupeKey);

                                sfxEvents.push({ key: ev.key, time: ev.time, isMono: ev.isMono, volume: ev.volume });
                            }
                            note._startEffectPlayed = true;
                        }
                    }
                    if (endT >= start && endT <= end) {
                        note._startEffectPlayed = true;
                        const shouldPlayEndSound =
                            (note.type === "slide" && note.lastSlide && note.isBreak) ||
                            note.isHanabi ||
                            (note.holdDuration !== undefined && note.type !== "tap");
                        if (shouldPlayEndSound) {
                            const evsEnd = audioManager.getSfxEventsForNote(note, endT);
                            for (const ev of evsEnd) {
                                // 改為毫秒級去重（避免以 fps 為單位而濾掉高頻觸發）
                                const timeMs = Math.floor(ev.time * 1000);
                                const dedupeKey = `${timeMs}_${ev.key}`;
                                if (sfxFrameSet.has(dedupeKey)) continue;
                                sfxFrameSet.add(dedupeKey);

                                sfxEvents.push({ key: ev.key, time: ev.time, isMono: ev.isMono, volume: ev.volume });
                            }
                        }
                        note._endEffectPlayed = true;
                    }
                    if (note.type === 'touch' && note.holdDuration > 0) {
                        if (startT < end && endT > start) {
                            longSoundEvents.push({ key: 'touchHold_riser', startSec: startT, endSec: endT });
                        }
                    }
                }

                sfxEvents.sort((a, b) => a.time - b.time);

                // 內部核心混音工廠
                const mixSfxInto = (baseBuf, events, longEvents, s, e) => {
                    const sr = baseBuf ? baseBuf.sampleRate : (audioManager.ctx.sampleRate || 48000);
                    const outLen = Math.max(1, Math.ceil((e - s) * sr));
                    const bgmChannels = baseBuf ? baseBuf.numberOfChannels : 0;

                    let sfxMaxCh = 1;
                    for (const [k, b] of audioManager.bufferMap.entries()) {
                        if (b && b.numberOfChannels > sfxMaxCh) sfxMaxCh = b.numberOfChannels;
                    }
                    const outCh = Math.max(bgmChannels || 0, sfxMaxCh || 1);
                    const out = new AudioBuffer({ length: outLen, numberOfChannels: outCh, sampleRate: sr });

                    if (baseBuf) {
                        for (let ch = 0; ch < outCh; ch++) {
                            const dst = out.getChannelData(ch);
                            const src = baseBuf.getChannelData(ch < baseBuf.numberOfChannels ? ch : 0);
                            const copyLen = Math.min(src.length, outLen);
                            for (let i = 0; i < copyLen; i++) {
                                dst[i] = src[i] * bgmVolume;
                            }
                        }
                    }

                    const addLoopingBufferAt = (key, eventStartSec, eventEndSec) => {
                        const sfxBuf = audioManager.bufferMap.get(key);
                        if (!sfxBuf) return;
                        const loop = audioManager.loopPoints[key];
                        const keyVol = audioManager.sfxVolumes[key] ?? 1.0;
                        const sfxRate = sfxBuf.sampleRate || sr;

                        const audibleStartSec = Math.max(s, eventStartSec);
                        const audibleEndSec = Math.min(e, eventEndSec);
                        if (audibleStartSec >= audibleEndSec) return;

                        const startIdx = Math.floor((audibleStartSec - s) * sr);
                        const endIdx = Math.floor((audibleEndSec - s) * sr);

                        for (let ch = 0; ch < sfxBuf.numberOfChannels; ch++) {
                            const src = sfxBuf.getChannelData(ch);
                            const dst = out.getChannelData(ch < outCh ? ch : 0);

                            for (let idx = startIdx; idx < endIdx; idx++) {
                                if (idx < 0 || idx >= outLen) continue;
                                const currentSec = s + idx / sr;
                                let activeCount = 0;
                                for (const lev of longEvents) {
                                    if (lev.key === key && currentSec >= lev.startSec && currentSec < lev.endSec) {
                                        activeCount++;
                                    }
                                }
                                if (activeCount === 0) activeCount = 1;

                                const finalVol = (keyVol / activeCount) * sfxVolume;
                                const timeSinceEventStart = currentSec - eventStartSec;
                                let sampleSec = timeSinceEventStart;

                                if (loop) {
                                    if (sampleSec >= loop.end) {
                                        sampleSec = loop.start + ((sampleSec - loop.end) % (loop.end - loop.start));
                                    }
                                } else if (sampleSec >= sfxBuf.length / sfxRate) {
                                    continue;
                                }

                                const srcPos = sampleSec * sfxRate;
                                const srcIdx0 = Math.floor(srcPos);
                                const srcIdx1 = srcIdx0 + 1;
                                const frac = srcPos - srcIdx0;
                                const s0 = (srcIdx0 >= 0 && srcIdx0 < src.length) ? src[srcIdx0] : 0;
                                const s1 = (srcIdx1 >= 0 && srcIdx1 < src.length) ? src[srcIdx1] : 0;
                                const sampleVal = s0 * (1 - frac) + s1 * frac;
                                dst[idx] += sampleVal * finalVol;
                            }
                        }
                    };

                    for (const lev of longEvents) {
                        addLoopingBufferAt(lev.key, lev.startSec, lev.endSec);
                    }

                    const addBufferAt = (sfxBuf, atSec, baseVol, isMono, cutoffSec) => {
                        if (!sfxBuf) return;
                        const finalVol = (baseVol ?? 1) * sfxVolume;
                        const dstRate = sr;
                        const srcRate = sfxBuf.sampleRate || sr;
                        const dstStart = Math.floor((atSec - s) * dstRate);
                        const ratio = srcRate / dstRate;

                        let maxDurationSec = sfxBuf.length / srcRate;
                        if (isMono && cutoffSec !== undefined) {
                            maxDurationSec = Math.min(maxDurationSec, cutoffSec - atSec);
                        }
                        const maxDstSamples = Math.floor(maxDurationSec * dstRate);

                        for (let ch = 0; ch < outCh; ch++) {
                            const src = sfxBuf.getChannelData(ch < sfxBuf.numberOfChannels ? ch : 0);
                            const dst = out.getChannelData(ch);

                            for (let i = 0; i < maxDstSamples; i++) {
                                const dstIdx = dstStart + i;
                                if (dstIdx < 0) continue;
                                if (dstIdx >= outLen) break;

                                const srcPos = i * ratio;
                                const srcIdx0 = Math.floor(srcPos);
                                const srcIdx1 = srcIdx0 + 1;
                                if (srcIdx0 >= src.length) break;

                                const frac = srcPos - srcIdx0;
                                const s0 = src[srcIdx0] || 0;
                                const s1 = src[srcIdx1] || 0;
                                const sample = s0 * (1 - frac) + s1 * frac;

                                dst[dstIdx] += sample * finalVol;
                            }
                        }
                    };

                    const lastTriggerTimes = new Map();

                    for (let i = 0; i < events.length; i++) {
                        const ev = events[i];
                        if (lastTriggerTimes.has(ev.key)) {
                            const lastTime = lastTriggerTimes.get(ev.key);
                            if (ev.time - lastTime == 0) {
                                continue;
                            }
                        }
                        lastTriggerTimes.set(ev.key, ev.time);

                        const sfxBuf = audioManager.bufferMap.get(ev.key);
                        if (!sfxBuf) continue;

                        let cutoffSec = undefined;
                        if (ev.isMono) {
                            for (let j = i + 1; j < events.length; j++) {
                                if (events[j].key === ev.key && events[j].isMono) {
                                    cutoffSec = events[j].time;
                                    break;
                                }
                            }
                        }
                        addBufferAt(sfxBuf, ev.time, ev.volume, ev.isMono, cutoffSec);
                    }

                    let peak = 0;
                    for (let ch = 0; ch < outCh; ch++) {
                        const d = out.getChannelData(ch);
                        for (let i = 0; i < d.length; i++) {
                            const v = Math.abs(d[i]);
                            if (v > peak) peak = v;
                        }
                    }
                    if (peak > 1) {
                        const scale = 1 / peak;
                        for (let ch = 0; ch < outCh; ch++) {
                            const d = out.getChannelData(ch);
                            for (let i = 0; i < d.length; i++) {
                                d[i] *= scale;
                            }
                        }
                    }
                    return out;
                };

                slicedAudio = mixSfxInto(slicedAudio, sfxEvents, longSoundEvents, start, end);
            }

            if (!slicedAudio && includeAudio && includeSfx && introDuration > 0) {
                const sr = 44100;
                const totalSec = introDuration + (end - start);
                const outLen = Math.max(1, Math.ceil(totalSec * sr));
                slicedAudio = new AudioBuffer({ length: outLen, numberOfChannels: 2, sampleRate: sr });
            }

            if (slicedAudio) {
                // 🔴 關鍵修正：強制將採樣率轉換為 44100 Hz (AAC 編碼器要求)
                slicedAudio = await resampleAudioBuffer(slicedAudio, 44100);

                if (introDuration > 0) {
                    const padAudioBufferFront = (buf, frontSeconds) => {
                        if (!buf || frontSeconds <= 0) return buf;
                        const sr = buf.sampleRate;
                        const padSamples = Math.floor(frontSeconds * sr);
                        const newLen = buf.length + padSamples;
                        const nb = new AudioBuffer({ length: newLen, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
                        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
                            const dst = nb.getChannelData(ch);
                            const src = buf.getChannelData(ch);
                            dst.set(src, padSamples);
                        }
                        return nb;
                    };
                    slicedAudio = padAudioBufferFront(slicedAudio, introDuration);

                    // 🔴 在 0.0 秒處 (影片 Intro 動畫登場點) 混入 track_start.wav 音效
                    const trackStartBuf = audioManager.bufferMap.get('track_start');
                    if (includeSfx && trackStartBuf && slicedAudio) {
                        const sr = slicedAudio.sampleRate;
                        const srcRate = trackStartBuf.sampleRate || sr;
                        const ratio = srcRate / sr;
                        const baseVol = audioManager.sfxVolumes['track_start'] ?? 0.8;
                        const finalVol = baseVol * sfxVolume;
                        const maxDstSamples = Math.min(
                            slicedAudio.length,
                            Math.floor((trackStartBuf.length / srcRate) * sr)
                        );
                        for (let ch = 0; ch < slicedAudio.numberOfChannels; ch++) {
                            const dst = slicedAudio.getChannelData(ch);
                            const src = trackStartBuf.getChannelData(ch < trackStartBuf.numberOfChannels ? ch : 0);
                            for (let i = 0; i < maxDstSamples; i++) {
                                const srcPos = i * ratio;
                                const idx0 = Math.floor(srcPos);
                                const idx1 = idx0 + 1;
                                if (idx0 >= src.length) break;
                                const frac = srcPos - idx0;
                                const s0 = src[idx0] || 0;
                                const s1 = src[idx1] || 0;
                                const sampleVal = s0 * (1 - frac) + s1 * frac;
                                dst[i] += sampleVal * finalVol;
                            }
                        }
                    }
                }

                // 🔴 在 end 結尾處 (最後約 2.5 秒) 混入 all_perfect.wav 音效
                const allPerfectBuf = audioManager.bufferMap.get('all_perfect');
                if (includeAllPerfect && includeSfx && allPerfectBuf && slicedAudio) {
                    const sr = slicedAudio.sampleRate;
                    const srcRate = allPerfectBuf.sampleRate || sr;
                    const ratio = srcRate / sr;
                    const baseVol = audioManager.sfxVolumes['all_perfect'] ?? 1.0;
                    const finalVol = baseVol * sfxVolume;

                    const bufDuration = allPerfectBuf.length / srcRate;
                    const apStartSec = introDuration + (end - start) - Math.min(bufDuration, 2.5);
                    const startSample = Math.max(0, Math.floor(apStartSec * sr));
                    const maxDstSamples = Math.min(
                        slicedAudio.length - startSample,
                        Math.floor(bufDuration * sr)
                    );

                    if (maxDstSamples > 0) {
                        for (let ch = 0; ch < slicedAudio.numberOfChannels; ch++) {
                            const dst = slicedAudio.getChannelData(ch);
                            const src = allPerfectBuf.getChannelData(ch < allPerfectBuf.numberOfChannels ? ch : 0);
                            for (let i = 0; i < maxDstSamples; i++) {
                                const srcPos = i * ratio;
                                const idx0 = Math.floor(srcPos);
                                const idx1 = idx0 + 1;
                                if (idx0 >= src.length) break;
                                const frac = srcPos - idx0;
                                const s0 = src[idx0] || 0;
                                const s1 = src[idx1] || 0;
                                const sampleVal = s0 * (1 - frac) + s1 * frac;
                                if (startSample + i < dst.length) {
                                    dst[startSample + i] += sampleVal * finalVol;
                                }
                            }
                        }
                    }
                }

                // 🔴 補上靜音，使音軌長度與視訊精確對齊
                const totalSec = introDuration + (end - start);
                const targetLen = Math.max(1, Math.ceil(totalSec * slicedAudio.sampleRate));
                slicedAudio = padAudioBuffer(slicedAudio, targetLen);
            }
        }

        if (popup.isClosed) {
            try { renderer.setContext(currentContext); } catch (e) { }
            return;
        }

        if (slicedAudio) {
            audioSource = new AudioBufferSource({
                codec: 'aac',
                bitrate: QUALITY_HIGH,
                sampleRate: slicedAudio.sampleRate,
                numberOfChannels: slicedAudio.numberOfChannels
            });
            output.addAudioTrack(audioSource);
        }

        // 🔴 順序修正：此時音、視訊軌皆已配置完整，安心啟動
        await output.start();

        // 啟動後，將音訊資料塞入
        if (includeAudio && audioSource && slicedAudio) {
            await audioSource.add(slicedAudio);
        }

        if (!isUsingCustomRenderer) {
            renderer.setContext(offCtx);
        }

        const seekVideoTo = (video, time) => {
            if (!video) return Promise.resolve();
            return new Promise((res) => {
                let done = false;
                const onseek = () => {
                    if (done) return;
                    done = true;
                    video.removeEventListener('seeked', onseek);
                    res();
                };
                video.addEventListener('seeked', onseek);
                try {
                    video.currentTime = time;
                } catch (e) {
                    console.error("seek video failed", e);
                }
                setTimeout(() => {
                    if (done) return;
                    done = true;
                    res();
                }, 150);
            });
        };

        if (mediabunnyCanvasSink) {
            canvasIterator = mediabunnyCanvasSink.canvases(start, end);
        }

        const introFrameCount = Math.round(introDuration * fps);
        const gameFrameCount = Math.max(1, Math.ceil((end - start) * fps));
        const frameCount = introFrameCount + gameFrameCount;
        const step = 1 / fps;

        const simaiLogicControler = new SimaiLogicControler();
        let nowIndexLocal = 0;
        const startTime = performance.now();

        popup.setContent(`開始逐幀渲染：${frameCount} 幀`);
        for (let i = 0; i < frameCount; i++) {
            if (popup.isClosed) {
                console.log('逐幀渲染已取消');
                if (!isUsingCustomRenderer) {
                    try { renderer._isRenderingVideo = false; renderer.setContext(currentContext); } catch (e) { }
                }
                return;
            }

            const isIntroFrame = includeIntro && (i < introFrameCount);
            const gameFrameIdx = i - introFrameCount;
            const t = start + (isIntroFrame ? gameFrameIdx : i - introFrameCount) * step;
            const globalT = t - (musicDelay || 0);

            const {
                buckets,
                playCombo: playComboLocal,
                playScore: playScoreLocal,
                noteQuantity,
                nowIndex: updatedNowIndex
            } = simaiLogicControler.get({
                renderer: exportRenderer,
                globalTime: globalT,
                realTime: t,
                musicDelay,
                playing: false,
                timeControlSliding: false,
                readyBeat: false,
                playedClock: [],
                settings,
                visualHeight: 0,
                notes,
                decodedTags: [],
                playScoreRes,
                nowIndex: nowIndexLocal,
                skipAudioQueue: true,
            });
            nowIndexLocal = updatedNowIndex;

            try {
                offCtx.save();
                offCtx.setTransform(1, 0, 0, 1, 0, 0);
                offCtx.imageSmoothingEnabled = true;
                offCtx.imageSmoothingQuality = 'high';
                offCtx.fillStyle = settings.backgroundColor || '#000';
                offCtx.fillRect(0, 0, off.width, off.height);
                const rs = exportRenderer.scale || scale;

                const boxSize = Math.min(off.width, off.height);
                const boxX = Math.round((off.width - boxSize) / 2);
                const boxY = Math.round((off.height - boxSize) / 2);
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

                let drawBGDone = false;
                if (canvasIterator && exportVideoReady) {
                    try {
                        while (true) {
                            if (!currentCanvasFrame) {
                                const nextResult = await canvasIterator.next();
                                if (nextResult.done) {
                                    break;
                                }
                                currentCanvasFrame = nextResult.value;
                            }

                            const frameDuration = currentCanvasFrame.duration || (1 / 25);
                            const frameEnd = currentCanvasFrame.timestamp + frameDuration;
                            if (frameEnd <= t) {
                                const nextResult = await canvasIterator.next();
                                if (nextResult.done) {
                                    break;
                                }
                                currentCanvasFrame = nextResult.value;
                            } else {
                                break;
                            }
                        }

                        if (currentCanvasFrame && currentCanvasFrame.canvas) {
                            try { offCtx.filter = `brightness(${finalBgBrightness})`; } catch (e) { offCtx.filter = 'none'; }
                            const vw = currentCanvasFrame.canvas.width;
                            const vh = currentCanvasFrame.canvas.height;
                            drawContain(vw, vh, (sx, sy, sw, sh, dx, dy, dw, dh) =>
                                offCtx.drawImage(currentCanvasFrame.canvas, sx, sy, sw || vw, sh || vh, dx, dy, dw, dh)
                            );
                            offCtx.filter = 'none';
                            drawBGDone = true;
                        }
                    } catch (e) {
                        console.warn('Mediabunny 影格順序讀取/繪製失敗，嘗試 fallback 到影片元素', e);
                    }
                }

                if (!drawBGDone && exportVideo && exportVideoReady && (exportVideo.duration || exportVideo.videoWidth)) {
                    const bgTarget = Math.max(0, Math.min((exportVideo.duration || 0) - 0.001, t));
                    await seekVideoTo(exportVideo, bgTarget);
                    try { offCtx.filter = `brightness(${finalBgBrightness})`; } catch (e) { offCtx.filter = 'none'; }
                    const vw = exportVideo.videoWidth || exportVideo.width || boxW;
                    const vh = exportVideo.videoHeight || exportVideo.height || boxH;
                    drawContain(vw, vh, (sx, sy, sw, sh, dx, dy, dw, dh) => offCtx.drawImage(exportVideo, sx, sy, sw || vw, sh || vh, dx, dy, dw, dh));
                    offCtx.filter = 'none';
                    drawBGDone = true;
                }

                if (!drawBGDone && editorBackgroundImage && editorBackgroundImage.src && editorBackgroundImage.complete) {
                    const img = editorBackgroundImage;
                    const iw = img.naturalWidth || img.width || boxW;
                    const ih = img.naturalHeight || img.height || boxH;
                    try { offCtx.filter = `brightness(${finalBgBrightness})`; } catch (e) { offCtx.filter = 'none'; }
                    drawContain(iw, ih, (sx, sy, sw, sh, dx, dy, dw, dh) => offCtx.drawImage(img, sx, sy, sw || iw, sh || ih, dx, dy, dw, dh));
                    offCtx.filter = 'none';
                }

                /*if (!settings.hideOutline && outlineImage) {
                    const p = Math.min(targetW, targetH) / scaleBase * rs;
                    offCtx.setTransform(p, 0, 0, p, targetW / 2, targetH / 2);
                    offCtx.imageSmoothingEnabled = true;
                    offCtx.imageSmoothingQuality = 'high';
                    offCtx.drawImage(outlineImage, scaleBase * -0.5 * 0.9, scaleBase * -0.5 * 0.9, scaleBase * 0.9, scaleBase * 0.9);
                }*/
            } finally {
                offCtx.restore();
                offCtx.imageSmoothingEnabled = true;
                offCtx.imageSmoothingQuality = 'high';
            }

            try {
                if (finalNoteBrightness !== 1.0) {
                    offCtx.filter = `brightness(${finalNoteBrightness})`;
                }
            } catch (e) {
                offCtx.filter = 'none';
            }

            exportRenderer.drawFrame({
                globalTime: globalT,
                buckets,
                dt: step,
                showSensor: settings.showSensor,
                showSensorText: false,
                playCombo: playComboLocal,
                playScore: playScoreLocal,
                nowIndex: nowIndexLocal,
                skipClear: true,
                noteQuantity,
                playScoreRes,
            });

            offCtx.filter = 'none';

            if (isIntroFrame) {
                try {
                    if (overallBrightness !== 1.0) {
                        offCtx.filter = `brightness(${overallBrightness})`;
                    }
                } catch (e) { }
                exportRenderer.drawLoadingIntro({
                    t: i * step,
                    duration: introDuration,
                    backgroundImage: editorBackgroundImage,
                    chartInfo,
                });
                offCtx.filter = 'none';
            } else if (includeAllPerfect && t >= end - 2.5) {
                const apT = (t - (end - 2.5)) / 2.5;
                try {
                    if (overallBrightness !== 1.0) {
                        offCtx.filter = `brightness(${overallBrightness})`;
                    }
                } catch (e) { }
                drawAllPerfectOverlay(offCtx, apT, targetW, targetH);
                offCtx.filter = 'none';
            }

            const tsRelative = i * step;
            await videoSource.add(tsRelative, step);

            if (i % 5 === 0 || i === frameCount - 1) {
                const elapsed = performance.now() - startTime;
                const avgTimePerFrame = elapsed / (i + 1);
                const remainingFrames = frameCount - (i + 1);
                const remainingSec = Math.round((remainingFrames * avgTimePerFrame) / 1000);
                const formatRemainingTime = (sec) => {
                    if (sec < 60) return `${sec} 秒`;
                    const mins = Math.floor(sec / 60);
                    const secs = sec % 60;
                    return `${mins} 分 ${secs} 秒`;
                };
                const remainingStr = i > 2 ? `\n預估剩餘 ${formatRemainingTime(remainingSec)}` : `，計算剩餘時間中...`;

                popup.setProgress(((i + 1) / frameCount) * 100);
                popup.setContent(`渲染中：第 ${i + 1} / ${frameCount} 幀 (${(((i + 1) / frameCount) * 100).toFixed(2)}%)${remainingStr}`);

                // 讓出主執行緒，供瀏覽器重繪 UI 與處理點擊取消事件
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        await output.finalize();
        const mime = await output.getMimeType();
        const ext = output.format?.fileExtension || '.mp4';
        const buf = target.buffer;
        if (!buf) throw new Error('未取得輸出 buffer');

        const blob = new Blob([buf], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `simai_render${ext}`; document.body.appendChild(a); a.click(); a.remove();

        simpleToast({ content: '逐幀渲染完成，檔案已下載', type: 'success', timeout: 2500 });

        popup.setProgress(100);
        popup.setContent('完成');

        setTimeout(() => {
            popup.close();
        }, 3000);
    } catch (err) {
        console.error('逐幀渲染失敗', err);
        simpleToast({ content: '渲染失敗：' + String(err), type: 'error' });
        try { popup.setContent('錯誤：' + String(err)); } catch (e) { }
    } finally {
        if (exportVideo && exportVideo.parentNode) {
            exportVideo.parentNode.removeChild(exportVideo);
        }
        if (canvasIterator) {
            try {
                await canvasIterator.return();
            } catch (e) {
                console.error("Error returning canvasIterator:", e);
            }
        }
        if (mediabunnyInput) {
            try {
                const res = mediabunnyInput.dispose();
                if (res && typeof res.catch === 'function') {
                    res.catch(e => console.error("Error disposing Mediabunny input:", e));
                }
            } catch (e) {
                console.error("Error disposing Mediabunny input:", e);
            }
        }
        if (output && output.state !== 'finalized' && output.state !== 'canceled') {
            try {
                const res = output.cancel();
                if (res && typeof res.catch === 'function') {
                    res.catch(e => console.error("Error cancelling output:", e));
                }
            } catch (e) {
                console.error("Error cancelling output:", e);
            }
        }
        if (renderer) {
            renderer._isRenderingVideo = false;
            try { renderer.setContext(currentContext); } catch (e) { }
            if (currentContext && currentContext.canvas) {
                try { renderer.resize(currentContext.canvas.width, currentContext.canvas.height, 1, true); } catch (e) { }
            }
        }
        if (effectiveDraw) {
            try {
                effectiveDraw();
            } catch (e) {
                console.error("videoRender 完成後呼叫 draw 失敗:", e);
            }
        }
    }
}
