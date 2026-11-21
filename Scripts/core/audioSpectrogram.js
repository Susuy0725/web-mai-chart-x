/**
 * 音訊頻譜圖 (Spectrogram) 預計算與分塊離屏快取引擎
 *
 * 設計重點：
 * 1. 純原生 Radix-2 Cooley-Tukey FFT，使用預計算位元反轉與旋轉因子表，無任何外部依賴。
 * 2. 以固定時間分塊 (預設每塊 4 秒) 延遲計算並快取 STFT 量化分貝矩陣 (Uint8Array)，
 *    避免於載入或 60fps 渲染時一次對整首數分鐘音訊進行全量 FFT 造成掉幀，同時避開單張超大畫布的尺寸限制。
 * 3. 當使用者調整頻率顯示區間 (minFreq / maxFreq) 或增益倍率時，直接復用快取的 STFT 矩陣
 *    重新著色對應分塊的離屏畫布 (< 0.5ms/塊)，無須重算 FFT。
 */

export const SPECTROGRAM_FFT_SIZE = 2048;
export const SPECTROGRAM_FRAMES_PER_SEC = 120;
export const SPECTROGRAM_CHUNK_SECONDS = 4;
export const SPECTROGRAM_IMAGE_HEIGHT = 160;

const MIN_DB = -90;
const MAX_DB = -6;
const DB_RANGE = MAX_DB - MIN_DB;
const LOG_FREQ_OFFSET = 20;
const MAX_CACHED_CHUNKS_PER_BUFFER = 60;

function clampVal(v, min, max) {
    return v < min ? min : (v > max ? max : v);
}

const _fftPlanCache = new Map();
const _audioSpectrogramCache = new WeakMap();

/**
 * 建立並快取指定 FFT 大小的運算計畫 (Hann 窗、位元反轉表、Twiddle Factors)
 * @param {number} [fftSize=SPECTROGRAM_FFT_SIZE] 必須為 2 的冪次方
 */
export function createFFTPlan(fftSize = SPECTROGRAM_FFT_SIZE) {
    if (_fftPlanCache.has(fftSize)) {
        return _fftPlanCache.get(fftSize);
    }
    if ((fftSize & (fftSize - 1)) !== 0 || fftSize < 8) {
        throw new Error(`FFT size must be a power of 2 >= 8, got ${fftSize}`);
    }

    const halfSize = fftSize >> 1;
    const binsCount = halfSize + 1;

    let bits = 0;
    for (let s = fftSize; s > 1; s >>= 1) bits++;

    const bitRev = new Uint16Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
        let rev = 0;
        let x = i;
        for (let b = 0; b < bits; b++) {
            rev = (rev << 1) | (x & 1);
            x >>= 1;
        }
        bitRev[i] = rev;
    }

    const cosTable = new Float32Array(halfSize);
    const sinTable = new Float32Array(halfSize);
    for (let i = 0; i < halfSize; i++) {
        const angle = (-2 * Math.PI * i) / fftSize;
        cosTable[i] = Math.cos(angle);
        sinTable[i] = Math.sin(angle);
    }

    const window = new Float32Array(fftSize);
    let windowSum = 0;
    const denom = fftSize - 1;
    for (let n = 0; n < fftSize; n++) {
        const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / denom));
        window[n] = w;
        windowSum += w;
    }

    const plan = {
        fftSize,
        halfSize,
        binsCount,
        bitRev,
        cosTable,
        sinTable,
        window,
        windowSum,
        invWindowSum: 1 / windowSum,
        invWindowHalfSum: 2 / windowSum
    };
    _fftPlanCache.set(fftSize, plan);
    return plan;
}

/**
 * 對實數音訊區段計算單邊正規化振幅頻譜
 * @param {Float32Array} samples 單聲道或已混音樣本
 * @param {number} sampleStart 視窗起始索引 (可超出 [0, samples.length) 範圍，將以 0 填充)
 * @param {ReturnType<typeof createFFTPlan>} plan
 * @param {Float32Array} re 長度為 fftSize 的工作緩衝區
 * @param {Float32Array} im 長度為 fftSize 的工作緩衝區
 * @param {Float32Array} outMags 長度為 binsCount 的輸出振幅緩衝區
 * @param {Float32Array|null} [samplesR=null] 若為雙聲道，可即時與左聲道平均
 */
export function computeFFTMagnitudes(samples, sampleStart, plan, re, im, outMags, samplesR = null) {
    const {
        fftSize, halfSize, binsCount, bitRev, cosTable, sinTable, window,
        invWindowSum, invWindowHalfSum
    } = plan;
    const totalSamples = samples.length;

    for (let i = 0; i < fftSize; i++) {
        const srcIdx = sampleStart + i;
        let v = 0;
        if (srcIdx >= 0 && srcIdx < totalSamples) {
            v = samplesR ? 0.5 * (samples[srcIdx] + samplesR[srcIdx]) : samples[srcIdx];
        }
        const revIdx = bitRev[i];
        re[revIdx] = v * window[i];
        im[revIdx] = 0;
    }

    // Iterative Cooley-Tukey Radix-2 FFT
    for (let size = 2; size <= fftSize; size <<= 1) {
        const halfStep = size >> 1;
        const tableStep = fftSize / size;
        for (let i = 0; i < fftSize; i += size) {
            let k = 0;
            for (let j = i; j < i + halfStep; j++) {
                const pairIdx = j + halfStep;
                const c = cosTable[k];
                const s = sinTable[k];
                const pr = re[pairIdx];
                const pi = im[pairIdx];
                const tr = pr * c - pi * s;
                const ti = pr * s + pi * c;

                re[pairIdx] = re[j] - tr;
                im[pairIdx] = im[j] - ti;
                re[j] += tr;
                im[j] += ti;

                k += tableStep;
            }
        }
    }

    outMags[0] = Math.hypot(re[0], im[0]) * invWindowSum;
    for (let k = 1; k < halfSize; k++) {
        outMags[k] = Math.hypot(re[k], im[k]) * invWindowHalfSum;
    }
    outMags[binsCount - 1] = Math.hypot(re[halfSize], im[halfSize]) * invWindowSum;
}

/**
 * 規範化使用者設定的頻譜顯示區間 [minFreq, maxFreq]
 * @param {number} minFreq
 * @param {number} maxFreq
 * @param {number} sampleRate
 */
export function normalizeFrequencyRange(minFreq, maxFreq, sampleRate) {
    const nyquist = Math.max(200, (sampleRate || 44100) * 0.5);
    const rawMin = Number.isFinite(minFreq) ? minFreq : 20;
    const rawMax = Number.isFinite(maxFreq) ? maxFreq : 16000;
    const effMax = clampVal(rawMax, 100, nyquist);
    const effMin = clampVal(rawMin, 0, Math.max(0, effMax - 50));
    return {
        minFreq: effMin,
        maxFreq: Math.max(effMin + 50, effMax),
        nyquist
    };
}

/**
 * 預計算離屏畫布每一像素列 (y = 0 為高頻頂端, y = height - 1 為低頻底端) 對應的 FFT Bin 映射表
 * 使用帶偏移的對數頻率刻度 (log(f + 20))，讓低頻鼓點與中高頻泛音在窄畫布中同時具備清晰解析度。
 */
export function buildRowToBinTable(sampleRate, fftSize, minFreq, maxFreq, imageHeight) {
    const { minFreq: fMin, maxFreq: fMax } = normalizeFrequencyRange(minFreq, maxFreq, sampleRate);
    const binsCount = (fftSize >> 1) + 1;
    const maxBin = binsCount - 1;
    const hzToBin = fftSize / (sampleRate || 44100);

    const logMin = Math.log(fMin + LOG_FREQ_OFFSET);
    const logMax = Math.log(fMax + LOG_FREQ_OFFSET);
    const logSpan = Math.max(1e-6, logMax - logMin);

    const rows = new Array(imageHeight);
    for (let y = 0; y < imageHeight; y++) {
        const tHigh = 1 - y / imageHeight;
        const tLow = 1 - (y + 1) / imageHeight;
        const tMid = (tHigh + tLow) * 0.5;

        const fLow = Math.exp(logMin + tLow * logSpan) - LOG_FREQ_OFFSET;
        const fHigh = Math.exp(logMin + tHigh * logSpan) - LOG_FREQ_OFFSET;
        const fMid = Math.exp(logMin + tMid * logSpan) - LOG_FREQ_OFFSET;

        const bLow = clampVal(fLow * hzToBin, 0, maxBin);
        const bHigh = clampVal(fHigh * hzToBin, 0, maxBin);
        const bMid = clampVal(fMid * hzToBin, 0, maxBin);

        if (bHigh - bLow >= 1.25) {
            rows[y] = {
                mode: 'max',
                startBin: Math.floor(bLow),
                endBin: Math.min(maxBin, Math.ceil(bHigh))
            };
        } else {
            const b0 = Math.floor(bMid);
            const b1 = Math.min(maxBin, b0 + 1);
            rows[y] = {
                mode: 'lerp',
                bin0: b0,
                bin1: b1,
                frac: bMid - b0
            };
        }
    }
    return rows;
}

/**
 * 依據 audioAmp 與 brightnessGain 建立 256 階 RGBA 調色盤查找表 (Magma / Inferno 風格，低能量底噪透明)
 */
function buildSpectrogramColorLUT(audioAmp = 1.0, brightnessGain = 1.0) {
    const lut = new Uint8ClampedArray(256 * 4);
    const gain = Number.isFinite(brightnessGain) && brightnessGain > 1 ? brightnessGain : 1.0;
    const ampDb = (audioAmp > 0 ? 20 * Math.log10(audioAmp) : -90) + (gain > 1 ? 20 * Math.log10(Math.pow(gain, 1.5)) : 0);
    const rgbBoost = gain > 1 ? (1 + (gain - 1) * 0.28) : 1.0;

    // 色階錨點: [位置 0..1, r, g, b, alpha]
    const stops = [
        [0.00, 12, 6, 36, 0],
        [0.14, 34, 14, 82, 70],
        [0.34, 120, 26, 124, 175],
        [0.56, 204, 58, 92, 225],
        [0.78, 248, 138, 34, 245],
        [1.00, 255, 244, 165, 255]
    ];

    for (let i = 0; i < 256; i++) {
        const db = MIN_DB + (i / 255) * DB_RANGE + ampDb;
        const norm = clampVal((db - MIN_DB) / DB_RANGE, 0, 1);

        let sIdx = 0;
        while (sIdx < stops.length - 2 && norm > stops[sIdx + 1][0]) {
            sIdx++;
        }
        const s0 = stops[sIdx];
        const s1 = stops[sIdx + 1];
        const span = Math.max(1e-6, s1[0] - s0[0]);
        const localT = clampVal((norm - s0[0]) / span, 0, 1);

        const base = i * 4;
        lut[base] = Math.min(255, Math.round((s0[1] + (s1[1] - s0[1]) * localT) * rgbBoost));
        lut[base + 1] = Math.min(255, Math.round((s0[2] + (s1[2] - s0[2]) * localT) * rgbBoost));
        lut[base + 2] = Math.min(255, Math.round((s0[3] + (s1[3] - s0[3]) * localT) * rgbBoost));
        lut[base + 3] = Math.round(s0[4] + (s1[4] - s0[4]) * localT);
    }

    return lut;
}

/**
 * 從 AudioBuffer 取出聲道資料
 */
function extractBufferChannels(audioBuffer) {
    if (!audioBuffer) return null;
    let ch0 = null;
    let ch1 = null;
    if (typeof audioBuffer.getChannelData === 'function') {
        ch0 = audioBuffer.getChannelData(0);
        if ((audioBuffer.numberOfChannels || 1) > 1) {
            ch1 = audioBuffer.getChannelData(1);
        }
    } else if (audioBuffer.data) {
        ch0 = audioBuffer.data;
    } else if (audioBuffer instanceof Float32Array) {
        ch0 = audioBuffer;
    }
    if (!ch0 || ch0.length === 0) return null;

    const sampleRate = audioBuffer.sampleRate || 44100;
    const totalSamples = ch0.length;
    const duration = totalSamples / sampleRate;
    return { ch0, ch1, sampleRate, totalSamples, duration };
}

/**
 * 計算單一分塊的 STFT 量化分貝網格 (Uint8Array)
 */
export function computeSpectrogramChunkData(audioBuffer, chunkIndex, options = {}) {
    const extracted = extractBufferChannels(audioBuffer);
    if (!extracted) return null;

    const { ch0, ch1, sampleRate, duration } = extracted;
    const fftSize = options.fftSize || SPECTROGRAM_FFT_SIZE;
    const framesPerSec = options.framesPerSec || SPECTROGRAM_FRAMES_PER_SEC;
    const chunkSeconds = options.chunkSeconds || SPECTROGRAM_CHUNK_SECONDS;

    const chunkStartTime = chunkIndex * chunkSeconds;
    const chunkEndTime = Math.min(duration, (chunkIndex + 1) * chunkSeconds);
    const chunkDuration = chunkEndTime - chunkStartTime;
    if (chunkDuration <= 0) return null;

    const frameCount = Math.max(1, Math.round(chunkDuration * framesPerSec));
    const plan = createFFTPlan(fftSize);
    const binsCount = plan.binsCount;
    const halfFFT = fftSize >> 1;

    const dbGrid = new Uint8Array(frameCount * binsCount);
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);
    const mags = new Float32Array(binsCount);

    const invDbRange255 = 255 / DB_RANGE;
    const frameStepSec = chunkDuration / frameCount;

    for (let f = 0; f < frameCount; f++) {
        const frameTime = chunkStartTime + (f + 0.5) * frameStepSec;
        const centerSample = Math.round(frameTime * sampleRate);
        const sampleStart = centerSample - halfFFT;

        computeFFTMagnitudes(ch0, sampleStart, plan, re, im, mags, ch1);

        const rowOffset = f * binsCount;
        for (let k = 0; k < binsCount; k++) {
            const mag = mags[k];
            if (mag <= 1e-6) {
                dbGrid[rowOffset + k] = 0;
            } else {
                const db = 20 * Math.log10(mag);
                const q = Math.round((db - MIN_DB) * invDbRange255);
                dbGrid[rowOffset + k] = q < 0 ? 0 : (q > 255 ? 255 : q);
            }
        }
    }

    return {
        chunkIndex,
        chunkStartTime,
        chunkEndTime,
        chunkDuration,
        sampleRate,
        fftSize,
        binsCount,
        frameCount,
        dbGrid
    };
}

function defaultCanvasFactory(width, height) {
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        return c;
    }
    if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(width, height);
    }
    return null;
}

/**
 * 將 STFT 分塊資料依頻率區間 [minFreq, maxFreq] 與增益著色至離屏畫布
 */
function renderChunkToCanvas(chunkData, minFreq, maxFreq, audioAmp, brightnessGain, imageHeight, canvasFactory) {
    const { frameCount, binsCount, dbGrid, sampleRate, fftSize } = chunkData;
    const factory = canvasFactory || defaultCanvasFactory;
    const canvas = factory(frameCount, imageHeight);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imgData = ctx.createImageData(frameCount, imageHeight);
    const pixels = imgData.data;
    const lut = buildSpectrogramColorLUT(audioAmp, brightnessGain);
    const rowTable = buildRowToBinTable(sampleRate, fftSize, minFreq, maxFreq, imageHeight);

    for (let y = 0; y < imageHeight; y++) {
        const mapping = rowTable[y];
        const pixelRowOffset = y * frameCount * 4;

        if (mapping.mode === 'max') {
            const startBin = mapping.startBin;
            const endBin = mapping.endBin;
            for (let x = 0; x < frameCount; x++) {
                const colOffset = x * binsCount;
                let maxQ = 0;
                for (let b = startBin; b <= endBin; b++) {
                    const q = dbGrid[colOffset + b];
                    if (q > maxQ) maxQ = q;
                }
                const lutBase = maxQ * 4;
                const pxBase = pixelRowOffset + x * 4;
                pixels[pxBase] = lut[lutBase];
                pixels[pxBase + 1] = lut[lutBase + 1];
                pixels[pxBase + 2] = lut[lutBase + 2];
                pixels[pxBase + 3] = lut[lutBase + 3];
            }
        } else {
            const { bin0, bin1, frac } = mapping;
            const invFrac = 1 - frac;
            for (let x = 0; x < frameCount; x++) {
                const colOffset = x * binsCount;
                const q = Math.round(dbGrid[colOffset + bin0] * invFrac + dbGrid[colOffset + bin1] * frac);
                const lutBase = (q < 0 ? 0 : (q > 255 ? 255 : q)) * 4;
                const pxBase = pixelRowOffset + x * 4;
                pixels[pxBase] = lut[lutBase];
                pixels[pxBase + 1] = lut[lutBase + 1];
                pixels[pxBase + 2] = lut[lutBase + 2];
                pixels[pxBase + 3] = lut[lutBase + 3];
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

/**
 * 取得可見時間區間 [startTime, endTime] 內的所有頻譜圖分塊畫布 (帶 LRU 快取與即時設定重著色)
 */
export function getSpectrogramChunkTiles(audioBuffer, startTime, endTime, options = {}) {
    if (!audioBuffer) return [];
    const extracted = extractBufferChannels(audioBuffer);
    if (!extracted) return [];

    const { sampleRate, duration } = extracted;
    const minVisible = Math.max(0, startTime);
    const maxVisible = Math.min(duration, endTime);
    if (maxVisible <= minVisible) return [];

    const { minFreq, maxFreq } = normalizeFrequencyRange(
        options.minFreq,
        options.maxFreq,
        sampleRate
    );
    const audioAmp = Number.isFinite(options.audioAmp) && options.audioAmp > 0 ? options.audioAmp : 1.0;
    const brightnessGain = Number.isFinite(options.brightnessGain) && options.brightnessGain > 1 ? options.brightnessGain : 1.0;
    const imageHeight = options.imageHeight || SPECTROGRAM_IMAGE_HEIGHT;
    const chunkSeconds = options.chunkSeconds || SPECTROGRAM_CHUNK_SECONDS;

    let bufferCache = _audioSpectrogramCache.get(audioBuffer);
    if (!bufferCache || bufferCache.sampleRate !== sampleRate || bufferCache.duration !== duration) {
        bufferCache = {
            sampleRate,
            duration,
            chunks: new Map()
        };
        _audioSpectrogramCache.set(audioBuffer, bufferCache);
    }

    const firstChunk = Math.max(0, Math.floor(minVisible / chunkSeconds));
    const maxChunkIdx = Math.max(0, Math.ceil(duration / chunkSeconds) - 1);
    const lastChunk = Math.min(maxChunkIdx, Math.floor(Math.max(0, maxVisible - 1e-6) / chunkSeconds));

    const tiles = [];
    for (let idx = firstChunk; idx <= lastChunk; idx++) {
        let entry = bufferCache.chunks.get(idx);
        if (!entry) {
            const data = computeSpectrogramChunkData(audioBuffer, idx, { chunkSeconds });
            if (!data) continue;
            entry = {
                data,
                canvas: null,
                minFreq: -1,
                maxFreq: -1,
                audioAmp: -1,
                brightnessGain: -1,
                imageHeight: -1
            };
            bufferCache.chunks.set(idx, entry);
        } else {
            // LRU 刷新順序
            bufferCache.chunks.delete(idx);
            bufferCache.chunks.set(idx, entry);
        }

        if (
            !entry.canvas ||
            entry.minFreq !== minFreq ||
            entry.maxFreq !== maxFreq ||
            entry.audioAmp !== audioAmp ||
            entry.brightnessGain !== brightnessGain ||
            entry.imageHeight !== imageHeight
        ) {
            entry.canvas = renderChunkToCanvas(
                entry.data,
                minFreq,
                maxFreq,
                audioAmp,
                brightnessGain,
                imageHeight,
                options.canvasFactory
            );
            entry.minFreq = minFreq;
            entry.maxFreq = maxFreq;
            entry.audioAmp = audioAmp;
            entry.brightnessGain = brightnessGain;
            entry.imageHeight = imageHeight;
        }

        if (entry.canvas) {
            tiles.push({
                canvas: entry.canvas,
                tileWidth: entry.data.frameCount,
                tileHeight: imageHeight,
                chunkStartTime: entry.data.chunkStartTime,
                chunkEndTime: entry.data.chunkEndTime,
                chunkDuration: entry.data.chunkDuration
            });
        }
    }

    while (bufferCache.chunks.size > MAX_CACHED_CHUNKS_PER_BUFFER) {
        const oldestKey = bufferCache.chunks.keys().next().value;
        bufferCache.chunks.delete(oldestKey);
    }

    return tiles;
}

