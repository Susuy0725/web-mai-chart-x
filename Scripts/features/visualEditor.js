import { simpleToast } from '../helper.js';

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
            const currentBpm = getClockBpm() || 60;
            const currentGrid = getSettings().gridDivision || 4;
            const timeStep = (240 / currentBpm) / currentGrid;

            const numCommas = Math.round((snappedTime - lastTime) / timeStep);
            if (numCommas > 0) {
                for (let k = 0; k < numCommas; k++) {
                    rawData.push("");
                }
                for (let k = 1; k <= numCommas; k++) {
                    dataIndexToTime[lastIndex + k] = lastTime + k * timeStep;
                }
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
            const origDiv = Math.round((240 / currentBpm) / origDuration);

            const duration1 = snappedTime - tK;
            const duration2 = tKNext - snappedTime;
            if (duration1 <= 0.001 || duration2 <= 0.001) return null;

            const newDiv1 = Math.round((240 / currentBpm) / duration1);
            const newDiv2 = Math.round((240 / currentBpm) / duration2);

            if (isNaN(newDiv1) || newDiv1 <= 0 || isNaN(newDiv2) || newDiv2 <= 0) return null;

            let segK = rawData[k] ? rawData[k].trim() : "";
            if (segK.includes('{')) {
                segK = segK.replace(/\{[^\}]*\}/g, `{${newDiv1}}`);
            } else {
                const match = segK.match(/^((?:\([^\)]*\)|<[^>]*>)*)(.*)/);
                if (match) {
                    segK = match[1] + `{${newDiv1}}` + match[2];
                } else {
                    segK = `{${newDiv1}}` + segK;
                }
            }
            rawData[k] = segK;

            let newSegKNext1 = "";
            if (newDiv2 !== newDiv1) {
                newSegKNext1 = `{${newDiv2}}`;
            }
            rawData.splice(k + 1, 0, newSegKNext1);

            let segKNext2 = rawData[k + 2] ? rawData[k + 2].trim() : "";
            if (!segKNext2.includes('{') && origDiv > 0) {
                const match = segKNext2.match(/^((?:\([^\)]*\)|<[^>]*>)*)(.*)/);
                if (match) {
                    segKNext2 = match[1] + `{${origDiv}}` + match[2];
                } else {
                    segKNext2 = `{${origDiv}}` + segKNext2;
                }
                rawData[k + 2] = segKNext2;
            }

            const newContent = rawData.join(',');
            updateEditorAndSave(newContent);

            return k + 1;
        }

        return null;
    };

    const visualPlaceNote = (lane, clickTime) => {
        const snappedTime = quantizeTime(clickTime);
        if (snappedTime === null || snappedTime === undefined) {
            simpleToast({ content: '點擊位置離最近的節拍線太遠，無法放置音符', type: 'warning', timeout: 1500 });
            return;
        }

        const closestIndex = getOrCreateCommaIndex(snappedTime);
        if (closestIndex === null || closestIndex === undefined) {
            simpleToast({ content: '無法定位或擴充該時間位置的拍子', type: 'warning', timeout: 1500 });
            return;
        }

        const rawData = getRawData();
        const segment = rawData[closestIndex] ? rawData[closestIndex].trim() : "";
        if (segment.startsWith("||")) {
            simpleToast({ content: '無法在註解行內放置音符', type: 'warning', timeout: 1500 });
            return;
        }

        const parts = segment === "" ? [] : segment.split('/');
        const alreadyOccupied = parts.some(p => {
            const clean = stripLeadingTags(p);
            return clean.startsWith(String(lane));
        });

        if (alreadyOccupied) {
            return;
        }

        const cleanNotePart = stripLeadingTags(segment);
        let newSegment = "";
        if (cleanNotePart === "") {
            newSegment = segment + String(lane);
        } else {
            newSegment = segment + "/" + String(lane);
        }

        rawData[closestIndex] = newSegment;
        const newContent = rawData.join(',');
        updateEditorAndSave(newContent);

        simpleToast({ content: `已在軌道 ${lane} 放置 Tap 音符`, type: 'success', timeout: 1000 });
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
        const gridDiv = settings.gridDivision || 4;
        const tickPeriod = (240 / currentBpm) / gridDiv;

        let numTicks = Math.max(0, Math.round(durationTime / tickPeriod));
        let noteStr = `${lane}h[${gridDiv}:${numTicks}]`;

        if (numTicks == 0) {
            noteStr = `${lane}h`;
        }

        if (originalNote && originalNote.isBreak) {
            noteStr = `${lane}bh[${gridDiv}:${numTicks}]`;
            if (numTicks == 0) {
                noteStr = `${lane}bh`;
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

        simpleToast({ content: `已將軌道 ${lane} 設定為 Hold [${gridDiv}:${numTicks}]`, type: 'success', timeout: 1000 });
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
            if (!lane) continue;

            const segment = rawData[commaIndex] ? rawData[commaIndex].trim() : "";
            if (segment === "" || segment.startsWith("||")) continue;

            const parts = segment.split('/');
            const partIndex = parts.findIndex(p => {
                const clean = stripLeadingTags(p);
                return clean.startsWith(String(lane));
            });

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
                const firstLane = list[0]?.pos;
                simpleToast({ content: `已刪除軌道 ${firstLane || ''} 的音符`, type: 'info', timeout: 1000 });
            } else {
                simpleToast({ content: `已刪除 ${deletedCount} 個音符`, type: 'info', timeout: 1000 });
            }
        }
    };

    const visualChangeNote = (note) => {
        const commaIndex = note.index;
        if (commaIndex === undefined || commaIndex === null) return;
        const lane = note.pos;
        if (!lane) return;

        const rawData = getRawData();
        const segment = rawData[commaIndex] ? rawData[commaIndex].trim() : "";
        if (segment === "" || segment.startsWith("||")) return;

        const parts = segment.split('/');
        const partIndex = parts.findIndex(p => {
            const clean = stripLeadingTags(p);
            return clean.startsWith(String(lane));
        });

        if (partIndex === -1) return;

        const originalPart = parts[partIndex];
        const clean = stripLeadingTags(originalPart);
        const prefix = originalPart.substring(0, originalPart.length - clean.length);

        const nextClean = getNextNoteClean(clean, lane);
        const newPart = prefix + nextClean;

        parts[partIndex] = newPart;
        rawData[commaIndex] = parts.join('/');

        const newContent = rawData.join(',');
        updateEditorAndSave(newContent);

        simpleToast({ content: `已改變音符類型: ${nextClean}`, type: 'success', timeout: 1000 });
    };

    return {
        getOrCreateCommaIndex,
        stripLeadingTags,
        visualPlaceNote,
        visualPlaceHoldNote,
        visualDeleteNote,
        visualChangeNote
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
                const scrollDelta = visualScroller.pxToSec(e.deltaY * (e.deltaMode === 1 ? 20 : 1));
                updateVisualTime(getRealTime() + scrollDelta);
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
