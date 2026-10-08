import { simpleToast, popupWindow } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 去除字串開頭的 BPM、拍號等前綴標籤
 * @param {string} str 
 * @returns {string}
 */
export function stripLeadingTags(str) {
    return str.replace(/^(?:(?:\([^\)]*\))|(?:\{[^\}]*\})|(?:<[^>]*>))+/, '');
}

/**
 * 輔助判斷音符變換邏輯
 */
export function getNextNoteClean(clean, L) {
    const slide = clean.match(/((?:pp)|(?:qq)|[-<>^vpqszVw])/g);
    const hold = clean.includes('h');
    const touch = clean.match(/^([ABCDE])(\d+)|C/);

    const isBreak = clean.includes('b');
    const isEx = clean.includes('x');

    console.log(`isBreak=${isBreak}, isEx=${isEx}, slide=${slide}, hold=${hold}, touch=${touch}`);
    return String(clean);
}

/**
 * 剝皮解析音符字串結構 (參考 decode.js 解析流水線)
 * @param {string} clean 
 */
export function peelNoteStructure(clean) {
    // 1. 剝離時長
    const bracketMatch = clean.match(/\[([^\]]*)\]/);
    const duration = bracketMatch ? bracketMatch[0] : '';
    const withoutBracket = clean.replace(/\[[^\]]*\]/g, '');

    // 2. 判斷是否為 Slide
    const REGEX_SLIDE_SYM = /((?:pp)|(?:qq)|[-<>^vpqszVw])/;
    const slideMatch = withoutBracket.match(REGEX_SLIDE_SYM);

    if (slideMatch) {
        const slideIndex = slideMatch.index;
        const headPart = withoutBracket.slice(0, slideIndex);
        const trackPart = withoutBracket.slice(slideIndex);

        const headLaneMatch = headPart.match(/^\d+/);
        const headLane = headLaneMatch ? headLaneMatch[0] : '1';
        const headFlagsRaw = headPart.slice(headLane.length);
        const headFlags = new Set(headFlagsRaw.match(/[bxm$@?!]/g) || []);

        const trackFlags = new Set(trackPart.match(/[bm]/g) || []);
        const cleanTrack = trackPart.replace(/[bm]/g, '');

        return {
            type: 'slide',
            headLane,
            headFlags,
            trackPart: cleanTrack,
            trackFlags,
            duration,
            isTouch: false
        };
    }

    // 3. 判斷是否為 Touch 類音符
    const touchMatch = withoutBracket.match(/^([ABCDE]\d+|C)/i);
    if (touchMatch) {
        const touchPos = touchMatch[0].toUpperCase();
        const rest = withoutBracket.slice(touchPos.length);
        const isHold = rest.includes('h');
        const flagsRaw = rest.replace(/h/g, '');
        const flags = new Set(flagsRaw.match(/[mfx]/g) || []);

        return {
            type: isHold ? 'touchhold' : 'touch',
            pos: touchPos,
            isHold,
            flags,
            duration,
            isTouch: true
        };
    }

    // 4. 普通音符 / Hold 音符
    const laneMatch = withoutBracket.match(/^\d+/);
    const lane = laneMatch ? laneMatch[0] : '1';
    const rest = withoutBracket.slice(lane.length);
    const isHold = rest.includes('h');
    const flagsRaw = rest.replace(/h/g, '');
    const flags = new Set(flagsRaw.match(/[bxm]/g) || []);

    return {
        type: isHold ? 'hold' : 'tap',
        pos: lane,
        isHold,
        flags,
        duration,
        isTouch: false
    };
}

/**
 * 將剝皮後的結構重新拼裝為標準 simai 字串
 * @param {Object} peeled 
 */
export function rebuildPeeledNote(peeled) {
    if (peeled.type === 'slide') {
        const headFlagsArr = Array.from(peeled.headFlags);
        headFlagsArr.sort((a, b) => {
            const order = { b: 1, x: 2, m: 3 };
            return (order[a] || 9) - (order[b] || 9);
        });
        const headFlagsStr = headFlagsArr.join('');
        const trackFlagsStr = Array.from(peeled.trackFlags).join('');
        return `${peeled.headLane}${headFlagsStr}${peeled.trackPart}${trackFlagsStr}${peeled.duration}`;
    }

    if (peeled.isTouch) {
        const flagsStr = Array.from(peeled.flags).join('');
        const holdStr = peeled.isHold ? 'h' : '';
        const durStr = peeled.isHold ? (peeled.duration ? (peeled.duration.startsWith('[') ? peeled.duration : `[${peeled.duration}]`) : '[4:1]') : '';
        return `${peeled.pos}${holdStr}${durStr}${flagsStr}`;
    }

    const flagsArr = Array.from(peeled.flags);
    flagsArr.sort((a, b) => {
        const order = { b: 1, x: 2, m: 3 };
        return (order[a] || 9) - (order[b] || 9);
    });
    const flagsStr = flagsArr.join('');
    const holdStr = peeled.isHold ? 'h' : '';
    return `${peeled.pos}${flagsStr}${holdStr}${peeled.duration}`;
}

/**
 * 彈出設定拍點 BPM 數值的視窗 (Material Design 原生 HTML + CSS)
 * @param {Object} options
 * @param {number} options.currentBpm 當前 BPM 數值
 * @param {Function} options.onApply 套用回呼 (newBpm) => void
 */
export function openBpmInputModal({ currentBpm = 120, onApply }) {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 14px; color: #e2e8f0; font-family: "Plus Jakarta Sans", "Noto Sans TC", sans-serif; user-select: none; -webkit-user-select: none;';

    container.innerHTML = `
        <div style="font-size: 13px; color: #94a3b8;">${t('visualEditor.setBpmPrompt')}</div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <input type="number" id="wmc-bpm-input" step="0.1" min="1" max="999" value="${currentBpm}" 
                style="flex: 1; height: 42px; padding: 0 14px; font-size: 18px; font-weight: bold; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #ffffff; outline: none; transition: border-color 0.15s ease;">
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${[-10, -5, -1, 1, 5, 10].map(delta => `
                <button type="button" class="wmc-bpm-delta-btn" data-delta="${delta}"
                    style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #cbd5e1; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s ease;">
                    ${delta > 0 ? `+${delta}` : delta}
                </button>
            `).join('')}
        </div>
    `;

    const input = container.querySelector('#wmc-bpm-input');
    container.querySelectorAll('.wmc-bpm-delta-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const delta = parseFloat(btn.dataset.delta);
            const val = parseFloat(input.value) || currentBpm;
            input.value = Math.max(1, Math.round((val + delta) * 10) / 10);
        });
    });

    let modal = null;
    const handleApply = () => {
        const val = parseFloat(input.value);
        if (isNaN(val) || val <= 0) {
            simpleToast({ content: t('visualEditor.bpmInvalid'), type: 'warning', timeout: 1500 });
            return;
        }
        if (typeof onApply === 'function') {
            onApply(val);
        }
        modal?.close();
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleApply();
        }
    });

    modal = popupWindow({
        title: t('visualEditor.setBpmTitle'),
        customContent: container,
        width: 340,
        buttons: [
            {
                text: t('common.cancel'),
                onClick: () => modal?.close()
            },
            {
                text: t('common.apply'),
                isPrimary: true,
                onClick: handleApply
            }
        ]
    });

    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);
}

/**
 * 彈出設定拍點時值/切分數值的視窗 (Material Design 原生 HTML + CSS)
 * @param {Object} options
 * @param {string|number} options.currentDiv 當前時值
 * @param {Function} options.onApply 套用回呼 (newDiv) => void
 */
export function openDivisionInputModal({ currentDiv = 4, onApply }) {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 14px; color: #e2e8f0; font-family: "Plus Jakarta Sans", "Noto Sans TC", sans-serif; user-select: none; -webkit-user-select: none;';

    const presets = [4, 8, 12, 16, 24, 32, 48, 64];

    container.innerHTML = `
        <div style="font-size: 13px; color: #94a3b8;">${t('visualEditor.setDivisionPrompt') || '設定此拍點的時值標籤 (如 4, 8, 16 或 #0.5)：'}</div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <input type="text" id="wmc-div-input" value="${currentDiv}" 
                style="flex: 1; height: 42px; padding: 0 14px; font-size: 18px; font-weight: bold; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #ffffff; outline: none; transition: border-color 0.15s ease;">
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            ${presets.map(p => `
                <button type="button" class="wmc-div-preset-btn" data-preset="${p}"
                    style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #cbd5e1; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s ease;">
                    1/${p}
                </button>
            `).join('')}
        </div>
    `;

    const input = container.querySelector('#wmc-div-input');
    container.querySelectorAll('.wmc-div-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            input.value = btn.dataset.preset;
        });
    });

    let modal = null;
    const handleApply = () => {
        const valStr = input.value.trim();
        if (!valStr) return;
        if (typeof onApply === 'function') {
            onApply(valStr);
        }
        modal?.close();
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleApply();
        }
    });

    modal = popupWindow({
        title: t('visualEditor.setDivisionTitle') || '設定拍點時值',
        customContent: container,
        width: 340,
        buttons: [
            {
                text: t('common.cancel'),
                onClick: () => modal?.close()
            },
            {
                text: t('common.apply'),
                isPrimary: true,
                onClick: handleApply
            }
        ]
    });

    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);
}

/**
 * 建立視覺化音符編輯操作回呼（放置 Tap、Hold、刪除與變更）
 * @param {Object} ctx
 */
export function createVisualNoteCallbacks(ctx) {
    const {
        quantizeTime,
        getRawData,
        setRawData,
        getDataIndexToTime,
        setDataIndexToTime,
        getClockBpm,
        getSettings,
        getDecodedTags,
        updateEditorAndSave
    } = ctx;

    const getOrCreateCommaIndex = (snappedTime) => {
        let rawData = getRawData();
        let dataIndexToTime = getDataIndexToTime();

        if (!dataIndexToTime || dataIndexToTime.length === 0) {
            rawData = [""];
            dataIndexToTime = [0];
            setRawData(rawData);
            setDataIndexToTime(dataIndexToTime);
            return 0;
        }

        // 1. 檢查是否有現成的拍點可以直接使用 (誤差在 0.02 秒內)
        for (let idx = 0; idx < dataIndexToTime.length; idx++) {
            if (Math.abs(dataIndexToTime[idx] - snappedTime) < 0.02) {
                return idx;
            }
        }

        const lastIndex = dataIndexToTime.length - 1;
        const lastTime = dataIndexToTime[lastIndex];

        // 2. 如果點擊的時間在現有音符之後，在尾端擴充逗號
        if (snappedTime > lastTime + 0.02) {
            let currentBpm = getClockBpm() || 60;
            const decodedTags = getDecodedTags();
            if (decodedTags) {
                const bpmTag = decodedTags.filter(t => t.type === 'bpm' && t.time <= snappedTime + 0.001).sort((a, b) => b.time - a.time)[0];
                if (bpmTag) currentBpm = bpmTag.value;
            }
            const currentGrid = getSettings().gridDivision || 4;
            const timeStep = (240 / currentBpm) / currentGrid;

            const numCommas = Math.round((snappedTime - lastTime) / timeStep);
            if (numCommas > 0) {
                let lastActiveDiv = 4;
                if (decodedTags) {
                    const splitTag = decodedTags.filter(t => t.type === 'split' && t.time <= lastTime + 0.001).sort((a, b) => b.time - a.time)[0];
                    if (splitTag) lastActiveDiv = splitTag.value;
                }

                for (let k = 0; k < numCommas; k++) {
                    if (k === 0 && lastActiveDiv !== currentGrid) {
                        rawData.push(`{${currentGrid}}`);
                    } else {
                        rawData.push("");
                    }
                }
                for (let k = 1; k <= numCommas; k++) {
                    dataIndexToTime[lastIndex + k] = lastTime + k * timeStep;
                }
                const newContent = rawData.join(',');
                updateEditorAndSave(newContent);
                return lastIndex + numCommas;
            }
            return null;
        }

        // 3. 如果點擊的時間在現有音符中間 (中間插拍/細分拍數)
        let k = -1;
        for (let i = 0; i < dataIndexToTime.length - 1; i++) {
            if (snappedTime > dataIndexToTime[i] + 0.005 && snappedTime < dataIndexToTime[i + 1] - 0.005) {
                k = i;
                break;
            }
        }

        if (k !== -1) {
            const tK = dataIndexToTime[k];
            const tKNext = dataIndexToTime[k + 1];

            let currentBpm = getClockBpm() || 60;
            const decodedTags = getDecodedTags();
            if (decodedTags) {
                const bpmTag = decodedTags.filter(t => t.type === 'bpm' && t.time <= tK + 0.001).sort((a, b) => b.time - a.time)[0];
                if (bpmTag) currentBpm = bpmTag.value;
            }

            const origDuration = tKNext - tK;
            if (origDuration <= 0.001) return null;
            const origDiv = Math.max(1, Math.round((240 / currentBpm) / origDuration));

            const targetDiv = getSettings().gridDivision || 4;
            const stepDuration = (240 / currentBpm) / targetDiv;
            if (stepDuration <= 0.001) return null;

            // 該區間內按照 targetDiv 劃分需要幾步
            let totalSteps = Math.max(2, Math.round(origDuration / stepDuration));
            let targetStep = Math.round((snappedTime - tK) / stepDuration);
            targetStep = Math.max(1, Math.min(totalSteps - 1, targetStep));

            let segK = rawData[k] ? rawData[k].trim() : "";
            if (segK.includes('{')) {
                segK = segK.replace(/\{[^\}]*\}/g, `{${targetDiv}}`);
            } else {
                const match = segK.match(/^((?:\([^\)]*\)|<[^>]*>)*)(.*)/);
                if (match) {
                    segK = match[1] + `{${targetDiv}}` + match[2];
                } else {
                    segK = `{${targetDiv}}` + segK;
                }
            }
            rawData[k] = segK;

            // 插入 totalSteps - 1 個空拍逗號
            const insertArray = new Array(totalSteps - 1).fill("");
            rawData.splice(k + 1, 0, ...insertArray);

            // 在區間結尾 (原 k+1，現為 k + totalSteps) 還原原切分
            let segEnd = rawData[k + totalSteps] ? rawData[k + totalSteps].trim() : "";
            if (!segEnd.includes('{') && origDiv > 0 && origDiv !== targetDiv) {
                const match = segEnd.match(/^((?:\([^\)]*\)|<[^>]*>)*)(.*)/);
                if (match) {
                    segEnd = match[1] + `{${origDiv}}` + match[2];
                } else {
                    segEnd = `{${origDiv}}` + segEnd;
                }
                rawData[k + totalSteps] = segEnd;
            }

            const newContent = rawData.join(',');
            updateEditorAndSave(newContent);

            return k + targetStep;
        }

        return null;
    };

    const visualPlaceNote = (lane, clickTime) => {
        const settings = getSettings();
        const selectedType = settings?.visualSelectedNoteType || 'tap';

        const isTouchLane = (lane === 'T' || lane === 9);
        const isTouchType = (selectedType === 'touch' || selectedType === 'touchhold');

        if (isTouchLane && !isTouchType) {
            simpleToast({ content: t('visualEditor.touchLaneOnlyTouch'), type: 'warning', timeout: 1500 });
            return;
        }
        if (!isTouchLane && isTouchType) {
            simpleToast({ content: t('visualEditor.touchNoteOnlyTouchLane'), type: 'warning', timeout: 1500 });
            return;
        }

        const snappedTime = quantizeTime(clickTime);
        if (snappedTime === null || snappedTime === undefined) {
            simpleToast({ content: t('visualEditor.tooFarFromBeat'), type: 'warning', timeout: 1500 });
            return;
        }

        const closestIndex = getOrCreateCommaIndex(snappedTime);
        if (closestIndex === null || closestIndex === undefined) {
            simpleToast({ content: t('visualEditor.cannotLocateBeat'), type: 'warning', timeout: 1500 });
            return;
        }

        const rawData = getRawData();
        const segment = rawData[closestIndex] ? rawData[closestIndex].trim() : "";
        if (segment.startsWith("||")) {
            simpleToast({ content: t('visualEditor.cannotPlaceInComment'), type: 'warning', timeout: 1500 });
            return;
        }

        // 放置 BPM 標籤模式
        if (selectedType === 'bpm') {
            let currentBpm = getClockBpm() || 120;
            const decodedTags = getDecodedTags();
            if (decodedTags) {
                const bpmTag = decodedTags.filter(t => t.type === 'bpm' && t.time <= snappedTime + 0.001).sort((a, b) => b.time - a.time)[0];
                if (bpmTag) currentBpm = bpmTag.value;
            }

            const existingBpmMatch = segment.match(/\(([0-9]+(?:\.[0-9]+)?)\)/);
            if (existingBpmMatch) {
                currentBpm = parseFloat(existingBpmMatch[1]);
            }

            openBpmInputModal({
                currentBpm,
                onApply: (bpmVal) => {
                    const raw = getRawData();
                    let curSegment = raw[closestIndex] ? raw[closestIndex].trim() : "";
                    if (curSegment.match(/\([0-9]+(?:\.[0-9]+)?\)/)) {
                        curSegment = curSegment.replace(/\([0-9]+(?:\.[0-9]+)?\)/, `(${bpmVal})`);
                    } else {
                        curSegment = `(${bpmVal})` + curSegment;
                    }
                    raw[closestIndex] = curSegment;
                    const newContent = raw.join(',');
                    updateEditorAndSave(newContent);
                    simpleToast({ content: t('visualEditor.bpmSetSuccess', { bpm: bpmVal }), type: 'success', timeout: 1000 });
                }
            });
            return;
        }

        const parts = segment === "" ? [] : segment.split('/');
        const existingIndex = parts.findIndex(p => {
            const clean = stripLeadingTags(p);
            if (isTouchLane) {
                return /^[A-E]\d|C/i.test(clean);
            }
            return clean.startsWith(String(lane));
        });

        const selectedModifier = settings?.visualSelectedModifier || 'none';
        const effectiveType = selectedType === 'break' ? 'tap' : selectedType;

        const modChar = (selectedModifier === 'ex') ? 'x' :
                        (selectedModifier === 'break') ? 'b' :
                        (selectedModifier === 'mine') ? 'm' :
                        (selectedModifier === 'firework') ? 'f' : '';

        // 已存在音符時：同種類不更動，不同種類就地替換
        if (existingIndex !== -1) {
            const origPart = parts[existingIndex];
            const origClean = stripLeadingTags(origPart);
            const leadingTags = origPart.substring(0, origPart.length - origClean.length);

            // 辨識原有音符種類
            const REGEX_SLIDE_SYM = /(?:pp)|(?:qq)|[-<>^vpqszVw]/;
            let origType = 'tap';
            if (REGEX_SLIDE_SYM.test(origClean)) {
                origType = 'slide';
            } else if (/^[A-E]\d|C/i.test(origClean)) {
                origType = origClean.includes('h') ? 'touchhold' : 'touch';
            } else if (origClean.includes('h')) {
                origType = 'hold';
            } else {
                origType = 'tap';
            }

            // 1. 拿著相同種類音符點擊：維持原樣不發生任何變更
            if (origType === effectiveType) {
                return;
            }

            // 2. 拿著不同種類音符點擊：執行就地替換，使用預設值（不繼承舊時長與旗標）
            let newNoteStr = String(lane);
            let newLabel = 'Tap';

            if (effectiveType === 'slide') {
                const endLane = ((lane + 3) % 8) + 1;
                const headMod = (selectedModifier === 'firework') ? '' : modChar;
                newNoteStr = `${lane}${headMod}-${endLane}[4:1]`;
                newLabel = 'Slide';
            } else if (effectiveType === 'touch') {
                const touchMod = (selectedModifier === 'mine') ? 'm' : (selectedModifier === 'firework') ? 'f' : '';
                newNoteStr = `C${touchMod}`;
                newLabel = 'Touch';
            } else if (effectiveType === 'touchhold') {
                const touchMod = (selectedModifier === 'mine') ? 'm' : (selectedModifier === 'firework') ? 'f' : '';
                newNoteStr = `Ch${touchMod}[4:1]`;
                newLabel = 'TouchHold';
            } else if (effectiveType === 'hold') {
                let holdTag = 'h';
                if (selectedModifier === 'break') holdTag = 'bh';
                else if (selectedModifier === 'ex') holdTag = 'hx';
                else if (selectedModifier === 'mine') holdTag = 'hm';
                newNoteStr = `${lane}${holdTag}[4:1]`;
                newLabel = 'Hold';
            } else {
                const tapMod = (selectedModifier === 'firework') ? '' : modChar;
                newNoteStr = `${lane}${tapMod}`;
                newLabel = 'Tap';
            }

            parts[existingIndex] = leadingTags + newNoteStr;
            rawData[closestIndex] = parts.join('/');
            updateEditorAndSave(rawData.join(','));

            const laneLabel = isTouchLane ? t('visualEditor.touchLane') : t('visualEditor.laneLabel', { lane });
            simpleToast({ content: t('visualEditor.noteReplaced', { lane: laneLabel, note: newLabel }), type: 'info', timeout: 1000 });
            return;
        }

        const cleanNotePart = stripLeadingTags(segment);

        let noteString = String(lane);
        let noteLabel = 'Tap';

        if (effectiveType === 'slide') {
            const endLane = ((lane + 3) % 8) + 1;
            const headMod = (selectedModifier === 'firework') ? '' : modChar;
            noteString = `${lane}${headMod}-${endLane}[4:1]`;
            noteLabel = 'Slide';
        } else if (effectiveType === 'touch') {
            const touchMod = (selectedModifier === 'mine') ? 'm' : (selectedModifier === 'firework') ? 'f' : '';
            noteString = `C${touchMod}`;
            noteLabel = 'Touch';
        } else if (effectiveType === 'touchhold') {
            const touchMod = (selectedModifier === 'mine') ? 'm' : (selectedModifier === 'firework') ? 'f' : '';
            noteString = `Ch${touchMod}[4:1]`;
            noteLabel = 'TouchHold';
        } else if (effectiveType === 'hold') {
            let holdTag = 'h';
            if (selectedModifier === 'break') holdTag = 'bh';
            else if (selectedModifier === 'ex') holdTag = 'hx';
            else if (selectedModifier === 'mine') holdTag = 'hm';
            noteString = `${lane}${holdTag}[4:1]`;
            noteLabel = 'Hold';
        } else {
            const tapMod = (selectedModifier === 'firework') ? '' : modChar;
            noteString = `${lane}${tapMod}`;
        }

        let newSegment = "";
        if (cleanNotePart === "") {
            newSegment = segment + noteString;
        } else {
            newSegment = segment + "/" + noteString;
        }

        rawData[closestIndex] = newSegment;
        const newContent = rawData.join(',');
        updateEditorAndSave(newContent);

        const modName = (selectedModifier === 'ex') ? 'EX ' :
                        (selectedModifier === 'break') ? 'Break ' :
                        (selectedModifier === 'mine') ? `${t('visualToolbar.modMine')} ` :
                        (selectedModifier === 'firework') ? `${t('visualToolbar.modFirework')} ` : '';
        const targetLabel = isTouchLane ? t('visualEditor.touchLane') : t('visualEditor.laneLabel', { lane });
        simpleToast({ content: t('visualEditor.notePlaced', { lane: targetLabel, note: `${modName}${noteLabel}` }), type: 'success', timeout: 1000 });
    };

    const visualPlaceHoldNote = (lane, clickTime, durationTime, originalNote = null) => {
        const snappedTime = quantizeTime(clickTime);
        if (snappedTime === null || snappedTime === undefined) return;

        const closestIndex = getOrCreateCommaIndex(snappedTime);
        if (closestIndex === null || closestIndex === undefined) return;

        let currentBpm = getClockBpm() || 60;
        const decodedTags = getDecodedTags();
        if (decodedTags) {
            const bpmTag = decodedTags.filter(t => t.type === 'bpm' && t.time <= snappedTime + 0.001).sort((a, b) => b.time - a.time)[0];
            if (bpmTag) currentBpm = bpmTag.value;
        }

        const settings = getSettings();
        const selectedModifier = settings?.visualSelectedModifier || 'none';
        const gridDiv = settings.gridDivision || 4;
        const tickPeriod = (240 / currentBpm) / gridDiv;

        let numTicks = Math.max(0, Math.round(durationTime / tickPeriod));
        let holdTag = 'h';
        if (selectedModifier === 'break') holdTag = 'bh';
        else if (selectedModifier === 'ex') holdTag = 'hx';
        else if (selectedModifier === 'mine') holdTag = 'hm';

        let noteStr = numTicks === 0 ? `${lane}${holdTag}` : `${lane}${holdTag}[${gridDiv}:${numTicks}]`;

        if (originalNote) {
            if (originalNote.isBreak) {
                noteStr = numTicks === 0 ? `${lane}bh` : `${lane}bh[${gridDiv}:${numTicks}]`;
            } else if (originalNote.isMine) {
                noteStr = numTicks === 0 ? `${lane}hm` : `${lane}hm[${gridDiv}:${numTicks}]`;
            } else if (originalNote.isEx) {
                noteStr = numTicks === 0 ? `${lane}hx` : `${lane}hx[${gridDiv}:${numTicks}]`;
            }
        }

        const rawData = getRawData();
        const segment = rawData[closestIndex] ? rawData[closestIndex].trim() : "";
        if (segment.startsWith("||")) return;

        let parts = segment === "" ? [] : segment.split('/');
        const existingIndex = parts.findIndex(p => {
            const clean = stripLeadingTags(p);
            return clean.startsWith(String(lane));
        });

        if (existingIndex !== -1) {
            const targetPart = parts[existingIndex];
            const clean = stripLeadingTags(targetPart);
            const leadingTags = targetPart.substring(0, targetPart.length - clean.length);
            parts[existingIndex] = leadingTags + noteStr;
        } else {
            const cleanNotePart = stripLeadingTags(segment);
            if (cleanNotePart === "") {
                parts = [segment + noteStr];
            } else {
                parts.push(noteStr);
            }
        }

        rawData[closestIndex] = parts.join('/');
        const newContent = rawData.join(',');
        updateEditorAndSave(newContent);

        simpleToast({ content: t('visualEditor.holdSetSuccess', { lane, division: gridDiv, ticks: numTicks }), type: 'success', timeout: 1000 });
    };

    const visualDeleteNote = (noteOrNotes) => {
        const list = Array.isArray(noteOrNotes) ? noteOrNotes : (noteOrNotes instanceof Set ? Array.from(noteOrNotes) : (noteOrNotes ? [noteOrNotes] : []));
        if (list.length === 0) return;

        let deletedCount = 0;
        const rawData = getRawData();

        for (const note of list) {
            if (!note) continue;
            const commaIndex = note.index;
            if (commaIndex === undefined || commaIndex === null) continue;
            const lane = note.pos;
            const isTouch = (note.type === 'touch' || Boolean(note.touchPos));
            if (!lane && !isTouch) continue;

            const segment = rawData[commaIndex] ? rawData[commaIndex].trim() : "";
            if (segment === "" || segment.startsWith("||")) continue;

            const parts = segment.split('/');
            let partIndex = parts.findIndex(p => {
                const clean = stripLeadingTags(p);
                if (isTouch) {
                    if (note.touchPos === 'C') return clean.startsWith('C');
                    if (note.touchPos && note.pos) return clean.startsWith(note.touchPos + note.pos);
                    return /^[A-E]\d|C/i.test(clean);
                }
                if (!clean.startsWith(String(lane))) return false;
                const isSlide = (note.type === 'slide' || Boolean(note.isSlide));
                const isHold = (note.type === 'hold' || Boolean(note.isHold));
                const hasSlideChar = /[-<>^vpqszVw]/.test(clean);
                const hasHoldChar = clean.includes('h');
                if (isSlide) return hasSlideChar;
                if (isHold) return hasHoldChar && !hasSlideChar;
                return !hasSlideChar && !hasHoldChar;
            });

            if (partIndex === -1 && !isTouch) {
                partIndex = parts.findIndex(p => {
                    const clean = stripLeadingTags(p);
                    return clean.startsWith(String(lane));
                });
            }

            if (partIndex === -1) continue;

            const targetPart = parts[partIndex];
            const clean = stripLeadingTags(targetPart);
            const leadingTags = targetPart.substring(0, targetPart.length - clean.length);

            if (leadingTags) {
                if (parts.length === 1) {
                    parts[0] = leadingTags;
                } else if (partIndex + 1 < parts.length) {
                    parts[partIndex + 1] = leadingTags + parts[partIndex + 1];
                    parts.splice(partIndex, 1);
                } else if (partIndex > 0) {
                    parts[partIndex - 1] = leadingTags + parts[partIndex - 1];
                    parts.splice(partIndex, 1);
                }
            } else {
                parts.splice(partIndex, 1);
            }

            rawData[commaIndex] = parts.join('/');
            deletedCount++;
        }

        if (deletedCount > 0) {
            const newContent = rawData.join(',');
            updateEditorAndSave(newContent);
            if (deletedCount === 1) {
                const firstNote = list[0];
                const isTouch = (firstNote?.type === 'touch' || Boolean(firstNote?.touchPos));
                const label = isTouch ? t('visualToolbar.noteTouch') : t('visualEditor.laneLabel', { lane: firstNote?.pos || '' });
                simpleToast({ content: t('visualEditor.noteDeleted', { lane: label }), type: 'info', timeout: 1000 });
            } else {
                simpleToast({ content: t('visualEditor.notesDeleted', { count: deletedCount }), type: 'info', timeout: 1000 });
            }
        }
    };

    const visualChangeNote = (note) => {
        const commaIndex = note.index;
        if (commaIndex === undefined || commaIndex === null) return;
        const lane = note.pos;
        const isTouch = (note.type === 'touch' || Boolean(note.touchPos));
        if (!lane && !isTouch) return;

        const rawData = getRawData();
        const segment = rawData[commaIndex] ? rawData[commaIndex].trim() : "";
        if (segment === "" || segment.startsWith("||")) return;

        const parts = segment.split('/');
        const partIndex = parts.findIndex(p => {
            const clean = stripLeadingTags(p);
            if (isTouch) {
                if (note.touchPos === 'C') return clean.startsWith('C');
                if (note.touchPos && note.pos) return clean.startsWith(note.touchPos + note.pos);
                return /^[A-E]\d|C/i.test(clean);
            }
            return clean.startsWith(String(lane));
        });

        if (partIndex === -1) return;

        const originalPart = parts[partIndex];
        const clean = stripLeadingTags(originalPart);
        const prefix = originalPart.substring(0, originalPart.length - clean.length);

        const settings = getSettings();
        const toolMode = settings?.visualToolMode;
        let nextClean = clean;

        if (toolMode === 'modifier') {
            const selectedModifier = settings?.visualSelectedModifier || 'none';
            const peeled = peelNoteStructure(clean);

            // 1. 若選擇「無效果 (none)」：徹底剝除所有 flags
            if (selectedModifier === 'none') {
                if (peeled.type === 'slide') {
                    const isTrackClick = (note.hitPart === 'track') || (note.type === 'slide' && note.hitPart !== 'head');
                    if (isTrackClick) {
                        peeled.trackFlags.clear();
                        simpleToast({ content: t('visualEditor.clearSlideModifier'), type: 'info', timeout: 1000 });
                    } else {
                        peeled.headFlags.clear();
                        simpleToast({ content: t('visualEditor.clearStarModifier'), type: 'info', timeout: 1000 });
                    }
                } else {
                    peeled.flags.clear();
                    simpleToast({ content: t('visualEditor.clearAllModifiers'), type: 'info', timeout: 1000 });
                }
                nextClean = rebuildPeeledNote(peeled);
            } else {
                // 2. 具體旗標操作
                const targetFlag = selectedModifier === 'ex' ? 'x' :
                                   selectedModifier === 'break' ? 'b' :
                                   selectedModifier === 'mine' ? 'm' :
                                   selectedModifier === 'firework' ? 'f' : '';
                const modLabel = selectedModifier === 'ex' ? 'EX' :
                                 selectedModifier === 'break' ? 'Break' :
                                 selectedModifier === 'mine' ? t('visualToolbar.modMine') :
                                 selectedModifier === 'firework' ? t('visualToolbar.modFirework') : '';

                // 相容性防呆校驗 (參考 decode.js)
                if (targetFlag === 'b' && peeled.isTouch) {
                    simpleToast({ content: t('visualEditor.touchNoBreak'), type: 'warning', timeout: 1500 });
                    return;
                }
                if (targetFlag === 'f' && !peeled.isTouch) {
                    simpleToast({ content: t('visualEditor.fireworkTouchOnly'), type: 'warning', timeout: 1500 });
                    return;
                }

                if (peeled.type === 'slide') {
                    const isTrackClick = (note.hitPart === 'track') || (note.type === 'slide' && note.hitPart !== 'head');
                    if (isTrackClick) {
                        // 點擊軌跡：支援 b 與 m
                        if (targetFlag === 'x') {
                            simpleToast({ content: t('visualEditor.slideNoEx'), type: 'warning', timeout: 1500 });
                            return;
                        }
                        if (targetFlag === 'f') {
                            simpleToast({ content: t('visualEditor.fireworkTouchOnly'), type: 'warning', timeout: 1500 });
                            return;
                        }

                        if (peeled.trackFlags.has(targetFlag)) {
                            // 已存在 -> 剝除 (Toggle off)
                            peeled.trackFlags.delete(targetFlag);
                            simpleToast({ content: t('visualEditor.modRemoved', { target: t('visualEditor.targetTrack'), mod: modLabel }), type: 'info', timeout: 1000 });
                        } else {
                            // 不存在 -> 注入 (Toggle on)，互斥處理
                            if (targetFlag === 'm') peeled.trackFlags.delete('b');
                            if (targetFlag === 'b') peeled.trackFlags.delete('m');
                            peeled.trackFlags.add(targetFlag);
                            simpleToast({ content: t('visualEditor.modApplied', { target: t('visualEditor.targetTrack'), mod: modLabel }), type: 'success', timeout: 1000 });
                        }
                    } else {
                        // 點擊星星頭：支援 b, x, m (x 與 b 完美共存)
                        if (targetFlag === 'f') {
                            simpleToast({ content: t('visualEditor.fireworkTouchOnly'), type: 'warning', timeout: 1500 });
                            return;
                        }

                        if (peeled.headFlags.has(targetFlag)) {
                            // 已存在 -> 剝除 (Toggle off)
                            peeled.headFlags.delete(targetFlag);
                            simpleToast({ content: t('visualEditor.modRemoved', { target: t('visualEditor.targetStarHead'), mod: modLabel }), type: 'info', timeout: 1000 });
                        } else {
                            // 不存在 -> 注入 (Toggle on)
                            if (targetFlag === 'm') {
                                peeled.headFlags.delete('b');
                                peeled.headFlags.delete('x');
                            } else {
                                peeled.headFlags.delete('m');
                            }
                            peeled.headFlags.add(targetFlag);
                            simpleToast({ content: t('visualEditor.modApplied', { target: t('visualEditor.targetStarHead'), mod: modLabel }), type: 'success', timeout: 1000 });
                        }
                    }
                } else {
                    // 普通 / Hold / Touch 音符
                    if (peeled.flags.has(targetFlag)) {
                        // 已存在 -> 剝除 (Toggle off)
                        peeled.flags.delete(targetFlag);
                        simpleToast({ content: t('visualEditor.modRemoved', { target: t('visualEditor.targetNote'), mod: modLabel }), type: 'info', timeout: 1000 });
                    } else {
                        // 不存在 -> 注入 (Toggle on)
                        if (targetFlag === 'm') {
                            peeled.flags.delete('b');
                            peeled.flags.delete('x');
                        } else if (targetFlag === 'b' || targetFlag === 'x') {
                            peeled.flags.delete('m');
                        }
                        peeled.flags.add(targetFlag);
                        simpleToast({ content: t('visualEditor.modApplied', { target: t('visualEditor.targetNote'), mod: modLabel }), type: 'success', timeout: 1000 });
                    }
                }

                nextClean = rebuildPeeledNote(peeled);
            }
        } else {
            nextClean = getNextNoteClean(clean, lane);
            simpleToast({ content: t('visualEditor.noteTypeChanged', { note: nextClean }), type: 'success', timeout: 1000 });
        }

        const newPart = prefix + nextClean;

        parts[partIndex] = newPart;
        rawData[commaIndex] = parts.join('/');

        const newContent = rawData.join(',');
        updateEditorAndSave(newContent);
    };

    const getNoteCurrentProperties = (note) => {
        const commaIndex = note?.index;
        if (commaIndex === undefined || commaIndex === null) return null;
        const lane = note.pos;
        const isTouch = (note.type === 'touch' || Boolean(note.touchPos));
        if (!lane && !isTouch) return null;

        const rawData = getRawData();
        const segment = rawData[commaIndex] ? rawData[commaIndex].trim() : "";
        if (segment === "" || segment.startsWith("||")) return null;

        const parts = segment.split('/');
        const partIndex = parts.findIndex(p => {
            const clean = stripLeadingTags(p);
            if (isTouch) {
                if (note.touchPos === 'C') return clean.startsWith('C');
                if (note.touchPos && note.pos) return clean.startsWith(note.touchPos + note.pos);
                return /^[A-E]\d|C/i.test(clean);
            }
            return clean.startsWith(String(lane));
        });

        if (partIndex === -1) return null;

        const originalPart = parts[partIndex];
        const clean = stripLeadingTags(originalPart);

        const bracketMatch = clean.match(/\[([^\]]*)\]/);
        const duration = bracketMatch ? bracketMatch[1] : null;

        const slideMatch = clean.match(/((?:pp)|(?:qq)|[-<>^vpqszVw])/);
        const slidePattern = slideMatch ? slideMatch[1] : null;

        const isSlide = !!slideMatch || note.type === 'slide' || !!note.slideType;
        const isHold = clean.includes('h') || !!note.isHold || !!note.isTouchHold;
        const isTouchNote = note.type === 'touch' || Boolean(note.touchPos) || /^[A-E]\d|C/i.test(clean);

        return {
            part: clean,
            duration,
            slidePattern,
            isSlide,
            isHold,
            isTouch: isTouchNote,
            hitPart: note.hitPart || (note.type === 'slide' ? 'track' : 'head')
        };
    };

    const visualUpdateNoteProperty = (note, { duration, slidePattern, fullSlideString }) => {
        const commaIndex = note?.index;
        if (commaIndex === undefined || commaIndex === null) return;
        const lane = note.pos;
        const isTouch = (note.type === 'touch' || Boolean(note.touchPos));
        if (!lane && !isTouch) return;

        const rawData = getRawData();
        const segment = rawData[commaIndex] ? rawData[commaIndex].trim() : "";
        if (segment === "" || segment.startsWith("||")) return;

        const parts = segment.split('/');
        const partIndex = parts.findIndex(p => {
            const clean = stripLeadingTags(p);
            if (isTouch) {
                if (note.touchPos === 'C') return clean.startsWith('C');
                if (note.touchPos && note.pos) return clean.startsWith(note.touchPos + note.pos);
                return /^[A-E]\d|C/i.test(clean);
            }
            return clean.startsWith(String(lane));
        });

        if (partIndex === -1) return;

        const originalPart = parts[partIndex];
        const clean = stripLeadingTags(originalPart);
        const prefix = originalPart.substring(0, originalPart.length - clean.length);

        let nextClean = clean;

        if (fullSlideString !== undefined && fullSlideString !== null) {
            nextClean = fullSlideString;
        } else {
            if (duration !== undefined && duration !== null) {
                const durFormatted = `[${duration.replace(/[\[\]]/g, '')}]`;
                if (nextClean.includes('[')) {
                    nextClean = nextClean.replace(/\[[^\]]*\]/, durFormatted);
                } else {
                    nextClean = nextClean + durFormatted;
                }
            }

            if (slidePattern !== undefined && slidePattern !== null) {
                const REGEX_SLIDE_SYM = /((?:pp)|(?:qq)|[-<>^vpqszVw])/;
                if (REGEX_SLIDE_SYM.test(nextClean)) {
                    nextClean = nextClean.replace(REGEX_SLIDE_SYM, slidePattern);
                }
            }
        }

        const newPart = prefix + nextClean;
        parts[partIndex] = newPart;
        rawData[commaIndex] = parts.join('/');

        const newContent = rawData.join(',');
        updateEditorAndSave(newContent);
        simpleToast({ content: t('visualEditor.noteUpdated', { note: nextClean }), type: 'success', timeout: 1000 });
    };

    const getNoteTouchGroup = (note) => {
        const commaIndex = note?.index;
        if (commaIndex === undefined || commaIndex === null) return null;
        const rawData = getRawData();
        const segment = rawData[commaIndex] ? rawData[commaIndex].trim() : "";
        if (segment === "" || segment.startsWith("||")) return null;

        const parts = segment.split('/');
        let leadingTags = "";
        const touchNotes = [];
        const nonTouchParts = [];

        parts.forEach((p, idx) => {
            const clean = stripLeadingTags(p);
            if (idx === 0) {
                leadingTags = p.substring(0, p.length - clean.length);
            }
            const peeled = peelNoteStructure(clean);
            if (peeled.isTouch) {
                touchNotes.push({
                    raw: clean,
                    pos: peeled.pos,
                    isHold: peeled.isHold,
                    duration: peeled.duration ? peeled.duration.replace(/[\[\]]/g, '') : '',
                    flags: new Set(peeled.flags)
                });
            } else {
                nonTouchParts.push(clean);
            }
        });

        let initialSelectedIndex = 0;
        const targetPos = note.touchPos === 'C' ? 'C' : ((note.touchPos && note.pos) ? `${note.touchPos}${note.pos}` : null);
        if (targetPos) {
            const foundIdx = touchNotes.findIndex(t => t.pos === targetPos);
            if (foundIdx !== -1) initialSelectedIndex = foundIdx;
        }

        return {
            commaIndex,
            leadingTags,
            touchNotes,
            nonTouchParts,
            initialSelectedIndex
        };
    };

    const visualUpdateTouchGroup = (commaIndex, { leadingTags = "", nonTouchParts = [], touchNotes = [] }) => {
        const rawData = getRawData();
        if (commaIndex === undefined || commaIndex === null || commaIndex >= rawData.length) return;

        const touchPartStrings = touchNotes.map(tn => {
            const flagsStr = Array.from(tn.flags || []).join('');
            const holdStr = tn.isHold ? 'h' : '';
            const durStr = tn.isHold ? (tn.duration ? `[${tn.duration.replace(/[\[\]]/g, '')}]` : '[4:1]') : '';
            return `${tn.pos}${holdStr}${durStr}${flagsStr}`;
        });

        const allParts = [...nonTouchParts, ...touchPartStrings];
        let newSegment = "";
        if (allParts.length > 0) {
            allParts[0] = leadingTags + allParts[0];
            newSegment = allParts.join('/');
        } else {
            newSegment = leadingTags;
        }

        rawData[commaIndex] = newSegment;
        const newContent = rawData.join(',');
        updateEditorAndSave(newContent);
    };

    const visualPlaceTimingTag = (type, clickTime, originalTag = null) => {
        const snappedTime = quantizeTime(clickTime);
        if (snappedTime === null || snappedTime === undefined) {
            simpleToast({ content: t('visualEditor.tooFarFromBeat'), type: 'warning', timeout: 1500 });
            return;
        }

        const closestIndex = getOrCreateCommaIndex(snappedTime);
        if (closestIndex === null || closestIndex === undefined) {
            simpleToast({ content: t('visualEditor.cannotLocateBeat'), type: 'warning', timeout: 1500 });
            return;
        }

        const rawData = getRawData();
        let segment = rawData[closestIndex] ? rawData[closestIndex].trim() : "";
        if (segment.startsWith("||")) {
            simpleToast({ content: t('visualEditor.cannotPlaceInComment'), type: 'warning', timeout: 1500 });
            return;
        }

        if (type === 'bpm') {
            let currentBpm = originalTag ? originalTag.value : (getClockBpm() || 120);
            const decodedTags = getDecodedTags();
            if (!originalTag && decodedTags) {
                const bpmTag = decodedTags.filter(t => t.type === 'bpm' && t.time <= snappedTime + 0.001).sort((a, b) => b.time - a.time)[0];
                if (bpmTag) currentBpm = bpmTag.value;
            }

            const existingBpmMatch = segment.match(/\(([0-9]+(?:\.[0-9]+)?)\)/);
            if (existingBpmMatch) {
                currentBpm = parseFloat(existingBpmMatch[1]);
            }

            const applyBpm = (bpmVal) => {
                const raw = getRawData();
                let curSegment = raw[closestIndex] ? raw[closestIndex].trim() : "";
                if (curSegment.match(/\([0-9]+(?:\.[0-9]+)?\)/)) {
                    curSegment = curSegment.replace(/\([0-9]+(?:\.[0-9]+)?\)/, `(${bpmVal})`);
                } else {
                    curSegment = `(${bpmVal})` + curSegment;
                }
                raw[closestIndex] = curSegment;
                updateEditorAndSave(raw.join(','));
                simpleToast({ content: t('visualEditor.bpmSetSuccess', { bpm: bpmVal }), type: 'success', timeout: 1000 });
            };

            if (!originalTag) {
                applyBpm(currentBpm);
            } else {
                openBpmInputModal({
                    currentBpm,
                    onApply: applyBpm
                });
            }
        } else if (type === 'split') {
            let currentDiv = originalTag ? originalTag.value : (getSettings().gridDivision || 4);
            const decodedTags = getDecodedTags();
            if (!originalTag && decodedTags) {
                const splitTag = decodedTags.filter(t => t.type === 'split' && t.time <= snappedTime + 0.001).sort((a, b) => b.time - a.time)[0];
                if (splitTag) currentDiv = splitTag.value;
            }

            const existingDivMatch = segment.match(/\{([^\}]+)\}/);
            if (existingDivMatch) {
                currentDiv = existingDivMatch[1];
            }

            const applyDiv = (divVal) => {
                const raw = getRawData();
                let curSegment = raw[closestIndex] ? raw[closestIndex].trim() : "";
                if (curSegment.match(/\{[^\}]+\}/)) {
                    curSegment = curSegment.replace(/\{[^\}]+\}/, `{${divVal}}`);
                } else {
                    curSegment = `{${divVal}}` + curSegment;
                }
                raw[closestIndex] = curSegment;
                updateEditorAndSave(raw.join(','));
                simpleToast({ content: t('visualEditor.divisionSetSuccess', { division: divVal }), type: 'success', timeout: 1000 });
            };

            // 放置或編輯時皆彈窗詢問該點要放置的時值
            openDivisionInputModal({
                currentDiv,
                onApply: applyDiv
            });
        }
    };

    const visualDeleteTag = (tag) => {
        if (!tag) return;
        const rawData = getRawData();
        const dataIndexToTime = getDataIndexToTime();
        if (!dataIndexToTime || dataIndexToTime.length === 0) return;

        let targetIdx = -1;
        for (let idx = 0; idx < dataIndexToTime.length; idx++) {
            if (Math.abs(dataIndexToTime[idx] - tag.time) < 0.02) {
                targetIdx = idx;
                break;
            }
        }
        if (targetIdx === -1) return;

        let segment = rawData[targetIdx] ? rawData[targetIdx] : "";
        if (tag.type === 'bpm') {
            segment = segment.replace(/\([0-9]+(?:\.[0-9]+)?\)/, '');
            rawData[targetIdx] = segment;
            updateEditorAndSave(rawData.join(','));
            simpleToast({ content: t('visualEditor.bpmDeleted') || '已刪除 BPM 標籤', type: 'success', timeout: 1000 });
        } else if (tag.type === 'split') {
            segment = segment.replace(/\{[^\}]+\}/, '');
            rawData[targetIdx] = segment;
            updateEditorAndSave(rawData.join(','));
            simpleToast({ content: t('visualEditor.divisionDeleted') || '已刪除時值標籤', type: 'success', timeout: 1000 });
        }
    };

    const visualEditTag = (tag) => {
        if (!tag) return;
        visualPlaceTimingTag(tag.type, tag.time, tag);
    };

    return {
        getOrCreateCommaIndex,
        stripLeadingTags,
        visualPlaceNote,
        visualPlaceHoldNote,
        visualDeleteNote,
        visualChangeNote,
        getNoteCurrentProperties,
        visualUpdateNoteProperty,
        getNoteTouchGroup,
        visualUpdateTouchGroup,
        visualPlaceTimingTag,
        visualDeleteTag,
        visualEditTag
    };
}

/**
 * 建立視覺化編輯器滾動與指針拖曳控制器
 * @param {Object} ctx
 */
export function initVisualScroller(ctx) {
    const {
        visualEditor,
        previewCanvas,
        getVisualEditorRenderer,
        getPreviewRender,
        getRealTime,
        updateVisualTime,
        slideInputDebounce,
        getSettings,
        saveSettingsDebounce,
        draw,
        getPlayButton
    } = ctx;

    const MIN_ZOOM = 15;
    const MAX_ZOOM = 400;

    const visualScroller = {
        isActive: false,
        startX: 0, startY: 0,
        lastX: 0, lastY: 0,
        startTime: 0,
        lastTime: 0,
        velocity: 0,
        axis: 'vertical',
        momentumFrame: null,
        frictionCoeff: 0.01,

        pxToSec(px) {
            const visualEditorRenderer = getVisualEditorRenderer();
            const previewRender = getPreviewRender();
            const currentRenderer = this.axis === 'vertical' ? visualEditorRenderer : previewRender;
            const zoom = currentRenderer ? currentRenderer.zoom : 100;
            return px / zoom;
        }
    };

    const startMomentum = () => {
        cancelAnimationFrame(visualScroller.momentumFrame);
        let vel = visualScroller.velocity;
        let lastFrameTime = performance.now();
        const directionMult = visualScroller.axis === 'vertical' ? 1 : -1;

        const step = (now) => {
            const dt = now - lastFrameTime;
            lastFrameTime = now;
            const clampedDt = Math.min(100, dt);

            if (Math.abs(vel) < 0.04) {
                visualScroller.momentumFrame = null;
                slideInputDebounce();
                return;
            }

            const deltaPx = vel * clampedDt * directionMult;
            const deltaSec = visualScroller.pxToSec(deltaPx);

            updateVisualTime(getRealTime() + deltaSec);
            vel *= Math.exp(-visualScroller.frictionCoeff * clampedDt);
            visualScroller.momentumFrame = requestAnimationFrame(step);
        };
        visualScroller.momentumFrame = requestAnimationFrame(step);
    };

    const bindScrollerEvents = (element, axis = 'vertical') => {
        if (!element) return;
        element.style.touchAction = 'none';
        element.style.cursor = 'grab';

        element.addEventListener('pointerdown', (e) => {
            const playButton = getPlayButton();
            const settings = getSettings();
            if (playButton && playButton.dataset.playing === 'true' && settings.autoPauseOnScroll) {
                playButton.click();
            }
            if (e.button !== 0) return;
            cancelAnimationFrame(visualScroller.momentumFrame);

            visualScroller.isActive = true;
            visualScroller.axis = axis;
            visualScroller.lastTime = performance.now();
            visualScroller.startTime = getRealTime();
            visualScroller.velocity = 0;

            if (axis === 'vertical') {
                visualScroller.startY = e.clientY;
                visualScroller.lastY = e.clientY;
            } else {
                visualScroller.startX = e.clientX;
                visualScroller.lastX = e.clientX;
            }

            element.setPointerCapture(e.pointerId);
            element.style.cursor = 'grabbing';
        });

        element.addEventListener('pointermove', (e) => {
            if (!visualScroller.isActive) return;

            const now = performance.now();
            const dt = now - visualScroller.lastTime;

            if (axis === 'vertical') {
                const currentY = e.clientY;
                if (dt > 0) {
                    const instantVel = (currentY - visualScroller.lastY) / dt;
                    visualScroller.velocity = visualScroller.velocity * 0.3 + instantVel * 0.7;
                }
                const deltaSec = visualScroller.pxToSec(visualScroller.startY - currentY);
                updateVisualTime(visualScroller.startTime - deltaSec);
                visualScroller.lastY = currentY;
            } else {
                const currentX = e.clientX;
                if (dt > 0) {
                    const instantVel = (currentX - visualScroller.lastX) / dt;
                    visualScroller.velocity = visualScroller.velocity * 0.3 + instantVel * 0.7;
                }
                const deltaSec = visualScroller.pxToSec(visualScroller.startX - currentX);
                updateVisualTime(visualScroller.startTime + deltaSec);
                visualScroller.lastX = currentX;
            }
            visualScroller.lastTime = now;
        });

        const handlePointerUp = (e) => {
            if (!visualScroller.isActive) return;
            visualScroller.isActive = false;
            element.releasePointerCapture(e.pointerId);
            element.style.cursor = 'grab';

            if (Math.abs(visualScroller.velocity) > 0.05) {
                startMomentum();
            } else {
                slideInputDebounce();
            }
        };

        element.addEventListener('pointerup', handlePointerUp);
        element.addEventListener('pointercancel', handlePointerUp);

        element.addEventListener('wheel', (e) => {
            e.preventDefault();
            const visualEditorRenderer = getVisualEditorRenderer();
            const previewRender = getPreviewRender();
            const renderer = axis === 'vertical' ? visualEditorRenderer : previewRender;
            if (!renderer) return;

            const settings = getSettings();
            if (e.ctrlKey) {
                const factor = e.deltaY > 0 ? (1 / 1.15) : 1.15;
                const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, settings.visualZoom * factor));
                settings.visualZoom = newZoom;
                renderer.setZoom(newZoom);
                saveSettingsDebounce();
                draw();
            } else {
                // 將 deltaY 根據 deltaMode 標準化為像素位移量 (像素模式直接使用，行模式換算為基準行高 24px)
                const deltaPixels = e.deltaMode === 1
                    ? e.deltaY * 24
                    : (e.deltaMode === 2 ? e.deltaY * 200 : e.deltaY);
                // 依據當前實際縮放倍率 (zoom) 動態換算時間位移量
                const currentZoom = renderer.zoom || settings.visualZoom || 100;
                const scrollDelta = deltaPixels / currentZoom;
                // 反轉上下方向：向上滾動 (deltaY < 0) 推進時間，向下滾動 (deltaY > 0) 倒退時間，與觸控板操作體驗保持一致
                updateVisualTime(getRealTime() - scrollDelta);
            }
        }, { passive: false });
    };

    if (visualEditor) bindScrollerEvents(visualEditor, 'vertical');
    if (previewCanvas) bindScrollerEvents(previewCanvas, 'horizontal');

    return {
        visualScroller,
        startMomentum,
        bindScrollerEvents
    };
}
