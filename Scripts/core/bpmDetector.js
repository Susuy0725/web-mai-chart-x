/**
 * 音訊 BPM 與第一拍偏移 (Offset) 自動檢測演算法
 * 純數值計算（無 DOM 相依），可用於瀏覽器主執行緒或 Node.js 單元測試。
 */

const ENVELOPE_RATE = 200; // 每秒 200 點 (5ms 解析度)
const MAX_ANALYZE_SECONDS = 150;

/**
 * 將 AudioBuffer 轉為單聲道 200Hz 雙頻段能量突增包絡線 (Onset Strength Envelope)
 * 同時偵測低頻底鼓衝擊與高頻瞬態打擊，提高電子與流行樂的節拍捕捉準確度。
 */
export function computeOnsetEnvelope(audioBuffer, options = {}) {
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
    const targetEnvRate = options.envelopeRate || ENVELOPE_RATE;
    const maxSec = options.maxSeconds || MAX_ANALYZE_SECONDS;
    const rawStartSec = (typeof options.startTime === 'number' && isFinite(options.startTime))
        ? Math.max(0, options.startTime)
        : 0;
    const startSample = Math.min(ch0.length, Math.floor(rawStartSec * sampleRate));
    const maxEndBySpan = startSample + Math.floor(maxSec * sampleRate);
    const rawEndSample = (typeof options.endTime === 'number' && isFinite(options.endTime))
        ? Math.min(ch0.length, Math.floor(options.endTime * sampleRate))
        : ch0.length;
    const endSampleLimit = Math.min(maxEndBySpan, Math.max(startSample, rawEndSample));
    const hopSamples = Math.max(1, Math.floor(sampleRate / targetEnvRate));
    const envRate = sampleRate / hopSamples;
    const frameCount = Math.floor((endSampleLimit - startSample) / hopSamples);
    if (frameCount < 4) return null;

    const eLow = new Float32Array(frameCount);
    const eHigh = new Float32Array(frameCount);
    const framePeaks = new Float32Array(frameCount);

    // 1-pole 低通截止約 200Hz，用來抽取 Kick / Bass 瞬態
    const lpAlpha = Math.min(1, (2 * Math.PI * 200) / sampleRate);
    let lpState = 0;
    let prevSample = startSample > 0 ? (ch1 ? 0.5 * (ch0[startSample - 1] + ch1[startSample - 1]) : ch0[startSample - 1]) : 0;

    for (let f = 0; f < frameCount; f++) {
        const start = startSample + f * hopSamples;
        const end = Math.min(endSampleLimit, start + hopSamples);
        let sumLowSq = 0;
        let sumHighSq = 0;
        let peak = 0;

        for (let i = start; i < end; i++) {
            const x = ch1 ? 0.5 * (ch0[i] + ch1[i]) : ch0[i];
            const absX = Math.abs(x);
            if (absX > peak) peak = absX;

            lpState += lpAlpha * (x - lpState);
            const hp = x - prevSample;
            prevSample = x;

            sumLowSq += lpState * lpState;
            sumHighSq += hp * hp;
        }

        const count = Math.max(1, end - start);
        eLow[f] = Math.log1p(120 * (sumLowSq / count));
        eHigh[f] = Math.log1p(120 * (sumHighSq / count));
        framePeaks[f] = peak;
    }

    const rawOnset = new Float32Array(frameCount);
    if (startSample === 0) {
        rawOnset[0] = eLow[0] * 0.65 + eHigh[0] * 0.35;
    }
    for (let f = 1; f < frameCount; f++) {
        const dLow = Math.max(0, eLow[f] - eLow[f - 1]);
        const dHigh = Math.max(0, eHigh[f] - eHigh[f - 1]);
        rawOnset[f] = dLow * 0.65 + dHigh * 0.35;
    }

    // 自適應局部均值扣除 (約 ±75ms 視窗)，凸顯真正打擊點並抑制持續基底雜訊
    const onset = new Float32Array(frameCount);
    const halfWin = Math.max(2, Math.round(0.075 * envRate));
    const prefix = new Float64Array(frameCount + 1);
    for (let f = 0; f < frameCount; f++) {
        prefix[f + 1] = prefix[f] + rawOnset[f];
    }
    for (let f = 0; f < frameCount; f++) {
        const l = Math.max(0, f - halfWin);
        const r = Math.min(frameCount - 1, f + halfWin);
        const localMean = (prefix[r + 1] - prefix[l]) / (r - l + 1);
        const v = rawOnset[f] - localMean * 1.05;
        onset[f] = v > 0 ? v : 0;
    }

    return {
        onset,
        framePeaks,
        envRate,
        startTime: startSample / sampleRate,
        duration: (frameCount * hopSamples) / sampleRate
    };
}

function sampleLinear(arr, floatIdx) {
    if (floatIdx < 0 || floatIdx >= arr.length - 1) {
        const i = Math.round(floatIdx);
        return (i >= 0 && i < arr.length) ? arr[i] : 0;
    }
    const i0 = Math.floor(floatIdx);
    const frac = floatIdx - i0;
    return arr[i0] * (1 - frac) + arr[i0 + 1] * frac;
}

/**
 * 計算指定 BPM 在包絡線上的週期性梳狀濾波分數與最佳相位
 */
function scoreBpmComb(onset, envRate, bpm, maxFramesToEval) {
    const periodFrames = (60 / bpm) * envRate;
    const pInt = Math.max(1, Math.round(periodFrames));
    const evalLen = Math.min(onset.length, maxFramesToEval);
    const numSteps = Math.min(pInt, 80);
    const phaseStep = Math.max(1, Math.floor(pInt / numSteps));

    let bestScore = -1;
    let bestPhase = 0;

    for (let ph = 0; ph < pInt; ph += phaseStep) {
        let sum = 0;
        let count = 0;
        for (let pos = ph; pos < evalLen; pos += periodFrames) {
            sum += sampleLinear(onset, pos);
            count++;
        }
        const avg = count > 0 ? sum / Math.sqrt(count) : 0;
        if (avg > bestScore) {
            bestScore = avg;
            bestPhase = ph;
        }
    }

    // 細調相位（±phaseStep 內每 0.25 幀取樣）
    const fineStart = Math.max(0, bestPhase - phaseStep);
    const fineEnd = Math.min(periodFrames, bestPhase + phaseStep);
    for (let ph = fineStart; ph <= fineEnd; ph += 0.25) {
        let sum = 0;
        let count = 0;
        for (let pos = ph; pos < evalLen; pos += periodFrames) {
            sum += sampleLinear(onset, pos);
            count++;
        }
        const avg = count > 0 ? sum / Math.sqrt(count) : 0;
        if (avg > bestScore) {
            bestScore = avg;
            bestPhase = ph;
        }
    }

    return { score: bestScore, phaseFrames: bestPhase };
}

/**
 * 從 AudioBuffer 自動檢測 BPM
 * @param {AudioBuffer} audioBuffer
 * @param {Object} [options={}]
 * @returns {{ bpm: number, confidence: number } | null}
 */
export function detectBpmFromAudioBuffer(audioBuffer, options = {}) {
    const env = computeOnsetEnvelope(audioBuffer, options);
    if (!env) return null;

    const { onset, envRate } = env;
    const minBpm = Math.max(40, options.minBpm || 60);
    const maxBpm = Math.min(300, options.maxBpm || 220);

    const minLag = Math.max(2, Math.floor((60 / maxBpm) * envRate));
    const maxLag = Math.min(onset.length >> 1, Math.ceil((60 / minBpm) * envRate));
    if (minLag >= maxLag) return null;

    // 1. 快速自相關計算各整數 lag 相關強度，找出高潛力 BPM 區段
    const evalFrames = Math.min(onset.length, Math.floor(90 * envRate));
    const acf = new Float32Array(maxLag + 1);
    for (let lag = minLag; lag <= maxLag; lag++) {
        let sum = 0;
        const limit = evalFrames - lag;
        for (let i = 0; i < limit; i++) {
            sum += onset[i] * onset[i + lag];
        }
        acf[lag] = limit > 0 ? sum / limit : 0;
    }

    // 彙整候選 BPM 峰值 (涵蓋倍拍/半拍抑制與常見音遊 BPM 加權)
    const candidates = [];
    for (let lag = minLag + 1; lag < maxLag; lag++) {
        if (acf[lag] >= acf[lag - 1] && acf[lag] >= acf[lag + 1] && acf[lag] > 0) {
            const bpm = (60 * envRate) / lag;
            if (bpm >= minBpm && bpm <= maxBpm) {
                candidates.push({ bpm, acf: acf[lag] });
            }
        }
    }
    candidates.sort((a, b) => b.acf - a.acf);

    // 加上細掃錨點（確保即使高 BPM 整數 lag 間距較粗也不遺漏真實峰值）
    const topSeeds = candidates.slice(0, 8).map(c => c.bpm);
    for (const c of candidates.slice(0, 4)) {
        if (c.bpm * 2 <= maxBpm) topSeeds.push(c.bpm * 2);
        if (c.bpm * 0.5 >= minBpm) topSeeds.push(c.bpm * 0.5);
    }

    const dedupSeeds = [];
    for (const b of topSeeds) {
        if (!dedupSeeds.some(s => Math.abs(s - b) < 1.5)) {
            dedupSeeds.push(b);
        }
    }
    if (dedupSeeds.length === 0) {
        dedupSeeds.push(120);
    }

    // 2. 以 Comb Filter 進行高解析度對比與小數點細調
    let bestBpm = dedupSeeds[0];
    let bestWeighted = -1;
    let rawBestScore = 0;

    // 音遊曲目常見自然拍速偏好 (110~185 BPM 平滑高權重，防止過度偏往 70 BPM 或 260 BPM)
    const tempoPrior = (bpm) => {
        const logDist = Math.log2(bpm / 145);
        return Math.exp(-0.5 * (logDist / 0.52) ** 2);
    };

    for (const seed of dedupSeeds) {
        let localBestBpm = seed;
        let localBestScore = -1;
        const low = Math.max(minBpm, seed - 2.0);
        const high = Math.min(maxBpm, seed + 2.0);
        for (let b = low; b <= high; b += 0.1) {
            const { score } = scoreBpmComb(onset, envRate, b, evalFrames);
            if (score > localBestScore) {
                localBestScore = score;
                localBestBpm = b;
            }
        }
        const weighted = localBestScore * (0.7 + 0.3 * tempoPrior(localBestBpm));
        if (weighted > bestWeighted) {
            bestWeighted = weighted;
            bestBpm = localBestBpm;
            rawBestScore = localBestScore;
        }
    }

    // 3. 最終 0.005 BPM 精細收斂
    let finalBpm = bestBpm;
    let finalScore = -1;
    for (let b = Math.max(minBpm, bestBpm - 0.15); b <= Math.min(maxBpm, bestBpm + 0.15); b += 0.005) {
        const { score } = scoreBpmComb(onset, envRate, b, evalFrames);
        if (score > finalScore) {
            finalScore = score;
            finalBpm = b;
        }
    }

    // 若極接近整數（例如 174.002 與 174.000 分數幾乎一致），不強行修改但保留 3 位小數精度
    const roundedBpm = Math.round(finalBpm * 1000) / 1000;

    let meanOnset = 0;
    for (let i = 0; i < evalFrames; i++) meanOnset += onset[i];
    meanOnset /= Math.max(1, evalFrames);
    const confidence = meanOnset > 1e-6 ? Math.min(1, rawBestScore / (meanOnset * 8)) : 0;

    return {
        bpm: roundedBpm,
        confidence
    };
}

/**
 * 依據指定 BPM 從 AudioBuffer 自動檢測第一拍偏移 (Offset 秒數)
 * @param {AudioBuffer} audioBuffer
 * @param {number} bpm
 * @param {Object} [options={}]
 * @returns {{ offset: number, confidence: number } | null}
 */
export function detectOffsetFromAudioBuffer(audioBuffer, bpm, options = {}) {
    if (!bpm || !isFinite(bpm) || bpm <= 0) return null;
    const env = computeOnsetEnvelope(audioBuffer, options);
    if (!env) return null;

    const { onset, framePeaks, envRate, duration } = env;
    const beatPeriod = 60 / bpm;
    const periodFrames = beatPeriod * envRate;

    // 1. 以 1ms 解析度掃描 [0, beatPeriod) 內哪個相位最貼合全曲打擊點
    const stepSec = 0.001;
    let bestPhaseSec = 0;
    let bestScore = -1;
    let avgScore = 0;
    let numSteps = 0;

    const maxBeatsToEval = Math.min(Math.floor(duration / beatPeriod), 256);

    for (let ph = 0; ph < beatPeriod; ph += stepSec) {
        const phFrames = ph * envRate;
        let sum = 0;
        for (let k = 0; k < maxBeatsToEval; k++) {
            const idx = phFrames + k * periodFrames;
            if (idx >= onset.length) break;
            // 給予歌曲前中段較高權重，避免尾奏漸弱偏離
            const weight = 1 / (1 + k * 0.015);
            sum += sampleLinear(onset, idx) * weight;
        }
        avgScore += sum;
        numSteps++;
        if (sum > bestScore) {
            bestScore = sum;
            bestPhaseSec = ph;
        }
    }

    // 2. 跳過開頭純靜音，找出實際有音訊能量出現的第一拍 (k0 >= 0)
    const sortedPeaks = Float32Array.from(framePeaks).sort();
    const p95 = sortedPeaks[Math.min(sortedPeaks.length - 1, Math.floor(sortedPeaks.length * 0.95))] || 0.1;
    const activeThreshold = Math.max(0.015, p95 * 0.08);

    let firstBeatSec = bestPhaseSec;
    const maxLeadBeats = Math.floor((duration - bestPhaseSec) / beatPeriod);
    for (let k = 0; k < maxLeadBeats; k++) {
        const candSec = bestPhaseSec + k * beatPeriod;
        const centerFrame = Math.round(candSec * envRate);
        const scanEnd = Math.min(framePeaks.length - 1, centerFrame + Math.round(0.15 * envRate));
        const scanStart = Math.max(0, centerFrame - Math.round(0.015 * envRate));
        let localPeak = 0;
        for (let f = scanStart; f <= scanEnd; f++) {
            if (framePeaks[f] > localPeak) localPeak = framePeaks[f];
        }
        if (localPeak >= activeThreshold) {
            firstBeatSec = candSec;
            break;
        }
    }

    const meanScore = numSteps > 0 ? avgScore / numSteps : 0;
    const confidence = meanScore > 1e-6 ? Math.min(1, Math.max(0, (bestScore / meanScore - 1) / 3)) : 0;

    return {
        offset: Math.round(firstBeatSec * 1000) / 1000,
        confidence
    };
}

/**
 * 將目標時間點吸附至附近最強的音訊瞬態 / 鼓點起始位置
 * @param {AudioBuffer} audioBuffer
 * @param {number} targetTime 目標音訊時間 (秒)
 * @param {number} [maxSnapSec=0.04] 最大搜尋半徑 (秒)
 * @returns {number} 吸附後時間 (秒，精確到 ms)；若附近無顯著瞬態則回傳原值
 */
export function snapTimeToNearestOnset(audioBuffer, targetTime, maxSnapSec = 0.04) {
    if (!audioBuffer || !isFinite(targetTime)) return targetTime;
    const windowStart = Math.max(0, targetTime - maxSnapSec - 0.12);
    const windowEnd = targetTime + maxSnapSec + 0.06;
    const env = computeOnsetEnvelope(audioBuffer, {
        startTime: windowStart,
        endTime: windowEnd,
        envelopeRate: 1000 // 1ms 高解析度微幅視窗吸附
    });
    if (!env) return targetTime;

    const { onset, envRate, startTime } = env;
    let maxGlobal = 0;
    for (let i = 0; i < onset.length; i++) {
        if (onset[i] > maxGlobal) maxGlobal = onset[i];
    }
    if (maxGlobal <= 1e-5) return targetTime;

    const minF = Math.max(0, Math.floor((targetTime - maxSnapSec - startTime) * envRate));
    const maxF = Math.min(onset.length - 1, Math.ceil((targetTime + maxSnapSec - startTime) * envRate));

    let bestF = -1;
    let bestScore = 0;
    for (let f = minF; f <= maxF; f++) {
        const distSec = Math.abs((startTime + f / envRate) - targetTime);
        const proximityWeight = 1 - 0.25 * (distSec / Math.max(1e-4, maxSnapSec));
        const score = onset[f] * proximityWeight;
        if (score > bestScore) {
            bestScore = score;
            bestF = f;
        }
    }

    if (bestF === -1 || onset[bestF] < maxGlobal * 0.2) {
        return targetTime;
    }

    const snapped = startTime + bestF / envRate;
    return Math.round(snapped * 1000) / 1000;
}
