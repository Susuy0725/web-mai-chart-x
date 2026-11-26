/**
 * smoothBpm.js
 * 
 * 平滑變速產生器 (Smooth BPM Generator)
 * 支援多項式加速/減速曲線精確計算各細分拍點的 BPM，
 * 並能直接將生成的 simai 代碼帶入譜面編輯器中。
 */

import { openSmoothBpmModal } from '../modals/smoothBpmModal.js';

/**
 * 依據起始速度、結束速度、目標持續秒數與切分細分，計算出平滑漸變的 BPM 序列
 * 
 * @param {number} startBpm 起始 BPM
 * @param {number} endBpm 結束 BPM
 * @param {number} durationSec 目標持續時間（秒）
 * @param {number} division 拍點細分（預設 64 分音符）
 * @returns {{ chart: string, steps: number, p: number, actualSec: number }}
 */
export function generateSmoothBpmByDuration(startBpm, endBpm, durationSec, division = 64) {
    const sBpm = Math.max(0.1, Number(startBpm) || 120);
    const eBpm = Math.max(0.1, Number(endBpm) || 120);
    const durSec = Math.max(0.001, Number(durationSec) || 0.1);
    const div = Math.max(1, parseInt(division, 10) || 64);

    const beatStep = 4 / div; // 每個逗號佔幾拍（四分音符 = 1 拍）
    const secPerStep = (bpm) => (beatStep * 60) / bpm;

    // 第 i 個逗號的 BPM：i=0 恰為 start，i=n-1 恰為 end
    const bpmAt = (i, n, p) => {
        if (n <= 1) return sBpm;
        const t = i / (n - 1);
        const val = sBpm ** 2 + (eBpm ** 2 - sBpm ** 2) * (t ** p);
        return Math.sqrt(Math.max(0.01, val));
    };

    const totalSec = (n, p) => {
        let sum = 0;
        for (let i = 0; i < n; i++) {
            sum += secPerStep(bpmAt(i, n, p));
        }
        return sum;
    };

    // 1. 挑出「p = 1 時總時間最接近目標」的步數
    const ideal = ((sBpm + eBpm) / 2 / 60) * durSec / beatStep;
    let steps = 2, bestErr = Infinity;
    const minN = Math.max(2, Math.floor(ideal) - 3);
    const maxN = Math.max(minN + 1, Math.ceil(ideal) + 3);
    for (let n = minN; n <= maxN; n++) {
        const err = Math.abs(totalSec(n, 1) - durSec);
        if (err < bestErr) {
            bestErr = err;
            steps = n;
        }
    }

    // 2. 二分法微調 p（加速時 p 越大 BPM 越低時間越長；減速時反之），讓總時間貼齊 durationSec
    let lo = 0.05, hi = 20, p = 1;
    const isAccel = eBpm >= sBpm;
    for (let k = 0; k < 60; k++) {
        p = (lo + hi) / 2;
        const cur = totalSec(steps, p);
        if (isAccel) {
            if (cur < durSec) lo = p; else hi = p;
        } else {
            if (cur < durSec) hi = p; else lo = p;
        }
    }

    // 3. 輸出，並用四捨五入後的值驗算實際時間
    let result = `{${div}}`;
    let actualSec = 0;
    for (let i = 0; i < steps; i++) {
        const bpmStr = bpmAt(i, steps, p).toFixed(2);
        result += `(${bpmStr}),`;
        actualSec += secPerStep(Number(bpmStr));
    }

    return { chart: result, steps, p, actualSec };
}

/**
 * 取得指定時間點當前生效的 BPM
 */
export function getActiveBpmAtTime(time, decodedTags, clockBpm = 120) {
    if (decodedTags && Array.isArray(decodedTags)) {
        const bpmTag = decodedTags
            .filter(t => t.type === 'bpm' && t.time <= time + 0.005)
            .sort((a, b) => b.time - a.time)[0];
        if (bpmTag && bpmTag.value) return Number(bpmTag.value);
    }
    return Number(clockBpm) || 120;
}

/**
 * 取得指定時間點後的第一個 BPM 標籤值（若無則回傳 null）
 */
export function getNextBpmAfterTime(time, decodedTags) {
    if (decodedTags && Array.isArray(decodedTags)) {
        const bpmTag = decodedTags
            .filter(t => t.type === 'bpm' && t.time > time + 0.005)
            .sort((a, b) => a.time - b.time)[0];
        if (bpmTag && bpmTag.value) return Number(bpmTag.value);
    }
    return null;
}

/**
 * 取得指定時間點當前生效的切分值（division）
 */
export function getActiveDivisionAtTime(time, decodedTags, fallbackDiv = 4) {
    if (decodedTags && Array.isArray(decodedTags)) {
        const splitTag = decodedTags
            .filter(t => t.type === 'split' && t.time <= time + 0.005)
            .sort((a, b) => b.time - a.time)[0];
        if (splitTag && splitTag.value) return splitTag.value;
    }
    return fallbackDiv;
}

/**
 * 將生成的平滑變速代碼直接套用/帶入至譜面文字中
 */
export function applySmoothBpmToChart({
    chartText,
    insertMode = 'start', // 'start' | 'replace' | 'cursor'
    startTime = 0,
    endTime = 0,
    restoreDivision = null,
    editorInput,
    dataIndexToTime = [],
    findCommaCharIndex,
    updateEditorAndSave
}) {
    if (!editorInput || typeof updateEditorAndSave !== 'function') return false;

    const fullText = editorInput.value || '';
    let codeToInsert = chartText;
    if (restoreDivision) {
        codeToInsert += `{${restoreDivision}}`;
    }

    let insertStart = -1;
    let insertEnd = -1;

    if (insertMode === 'cursor') {
        insertStart = editorInput.selectionStart ?? fullText.length;
        insertEnd = editorInput.selectionEnd ?? insertStart;
    } else if (insertMode === 'replace' && dataIndexToTime && dataIndexToTime.length > 0) {
        let firstComma = -1;
        let lastComma = -1;
        for (let i = 0; i < dataIndexToTime.length; i++) {
            const t = dataIndexToTime[i];
            if (t >= startTime - 0.02 && t <= endTime + 0.02) {
                if (firstComma === -1) firstComma = i;
                lastComma = i;
            }
        }
        if (firstComma !== -1 && lastComma !== -1 && typeof findCommaCharIndex === 'function') {
            insertStart = firstComma > 0 ? findCommaCharIndex(fullText, firstComma) : 0;
            insertEnd = findCommaCharIndex(fullText, lastComma + 1);
        }
    }

    // 若未匹配或為 'start' 模式
    if (insertStart === -1 || insertEnd === -1) {
        if (!dataIndexToTime || dataIndexToTime.length === 0 || startTime <= 0.01) {
            insertStart = 0;
            insertEnd = 0;
        } else {
            let bestIdx = 0;
            let minDiff = Infinity;
            for (let i = 0; i < dataIndexToTime.length; i++) {
                const diff = Math.abs(dataIndexToTime[i] - startTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestIdx = i;
                }
            }
            if (bestIdx >= dataIndexToTime.length - 1 && startTime > dataIndexToTime[bestIdx] + 0.05) {
                insertStart = fullText.length;
                insertEnd = fullText.length;
            } else if (typeof findCommaCharIndex === 'function') {
                const commaChar = findCommaCharIndex(fullText, bestIdx);
                insertStart = commaChar;
                insertEnd = commaChar;
            } else {
                insertStart = fullText.length;
                insertEnd = fullText.length;
            }
        }
    }

    const newText = fullText.slice(0, insertStart) + codeToInsert + fullText.slice(insertEnd);
    updateEditorAndSave(newText);

    // 聚焦並高亮選取新插入的代碼文字區塊
    setTimeout(() => {
        try {
            editorInput.focus();
            editorInput.selectionStart = insertStart;
            editorInput.selectionEnd = insertStart + codeToInsert.length;
            if (typeof editorInput.setSelectionRange === 'function') {
                editorInput.setSelectionRange(insertStart, insertStart + codeToInsert.length);
            }
        } catch (_) {}
    }, 50);

    return true;
}

/**
 * 綁定平滑變速呼叫按鈕（點擊直接打開 Popup，不在編輯區做選取）
 */
export function initSmoothBpmLauncher(options) {
    const {
        smoothBpmBtn,
        getRealTime,
        getDecodedTags,
        getClockBpm,
        getDataIndexToTime,
        getAudioBuffer,
        getMusicDelay,
        editorInput,
        findCommaCharIndex,
        updateEditorAndSave,
        simpleToast,
        t
    } = options;

    const launchModal = () => {
        const curRealTime = typeof getRealTime === 'function' ? getRealTime() : 0;
        openSmoothBpmModal({
            initialTime: curRealTime,
            decodedTags: typeof getDecodedTags === 'function' ? getDecodedTags() : [],
            clockBpm: typeof getClockBpm === 'function' ? getClockBpm() : 120,
            dataIndexToTime: typeof getDataIndexToTime === 'function' ? getDataIndexToTime() : [],
            audioBuffer: typeof getAudioBuffer === 'function' ? getAudioBuffer() : null,
            musicDelay: typeof getMusicDelay === 'function' ? getMusicDelay() : 0,
            editorInput,
            findCommaCharIndex,
            updateEditorAndSave,
            simpleToast,
            t
        });
    };

    if (smoothBpmBtn) {
        smoothBpmBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            launchModal();
        });
    }

    return {
        openModal: launchModal
    };
}
