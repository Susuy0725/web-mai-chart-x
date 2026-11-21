/**
 * 多段變速 (Multi-BPM Segments) 與音軌區間量測純資料與幾何輔助模組
 * 無 DOM 相依，供 tapBpmModal 與單元測試共同使用。
 */

export function formatBpmValue(bpm) {
    if (!isFinite(bpm) || bpm <= 0) return '';
    return Number.isInteger(bpm) ? String(bpm) : parseFloat(bpm.toFixed(3)).toString();
}

/**
 * 規範化變速段列表（確保第 0 段從相對時間 0 開始，依時間排序並去除過近重複點）
 * @param {Array<{time: number, bpm: number}>} rawSegments
 * @param {number} [fallbackBpm=120]
 */
export function normalizeBpmSegments(rawSegments, fallbackBpm = 120) {
    const safeFallback = (isFinite(fallbackBpm) && fallbackBpm > 0) ? fallbackBpm : 120;
    if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
        return [{ time: 0, bpm: safeFallback }];
    }

    const valid = rawSegments
        .filter(s => s && isFinite(s.time) && s.time >= 0 && isFinite(s.bpm) && s.bpm > 0)
        .map(s => ({ time: Math.round(s.time * 10000) / 10000, bpm: Math.round(s.bpm * 1000) / 1000 }))
        .sort((a, b) => a.time - b.time);

    if (valid.length === 0) {
        return [{ time: 0, bpm: safeFallback }];
    }

    const deduped = [];
    for (const seg of valid) {
        const prev = deduped[deduped.length - 1];
        if (prev && Math.abs(seg.time - prev.time) < 0.005) {
            prev.bpm = seg.bpm;
        } else {
            deduped.push({ ...seg });
        }
    }

    if (deduped[0].time > 0.005) {
        deduped.unshift({ time: 0, bpm: safeFallback });
    } else {
        deduped[0].time = 0;
    }

    return deduped;
}

/**
 * 產生供 SimaiPreviewRenderer 使用的 BPM Tag 列表
 */
export function collectSegmentPreviewTags(segments) {
    if (!Array.isArray(segments) || segments.length === 0) return [];
    const tags = [];
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const nextSeg = segments[i + 1];
        tags.push({
            type: 'bpm',
            value: seg.bpm,
            time: seg.time,
            nextTime: nextSeg ? nextSeg.time : undefined
        });
    }
    return tags;
}

/**
 * 列舉預覽視窗 [leftRelTime, rightRelTime] 內的所有黃色小節線與節拍線
 */
export function collectVisibleYellowLines(segments, beatsPerMeasure = 4, subdivision = 4, leftRelTime = 0, rightRelTime = 10) {
    if (!Array.isArray(segments) || segments.length === 0) return [];
    const tb1 = Math.max(1, beatsPerMeasure || 4);
    const tb2 = Math.max(4, subdivision || 4);
    const parts = (tb1 * tb2) / 4;
    const lines = [];

    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
        const seg = segments[sIdx];
        const nextSeg = segments[sIdx + 1];
        const bpm = seg.bpm;
        if (!isFinite(bpm) || bpm <= 0) continue;

        const period = (60 * tb1) / bpm;
        const beatPeriod = (240 / bpm) / tb2;
        if (period <= 0) continue;

        let minI = Math.max(0, Math.ceil((leftRelTime - seg.time) / period) - 1);
        let maxI = Math.floor((rightRelTime - seg.time) / period) + 1;
        if (nextSeg) {
            const maxMeasureByNext = Math.floor((nextSeg.time - seg.time - 0.001) / period);
            maxI = Math.min(maxI, maxMeasureByNext);
        }
        maxI = Math.min(maxI, minI + 500);

        for (let i = minI; i <= maxI; i++) {
            const measureTime = seg.time + i * period;
            if (measureTime >= leftRelTime - 0.05 && measureTime <= rightRelTime + 0.05) {
                lines.push({
                    relTime: measureTime,
                    segIndex: sIdx,
                    isMeasureLine: true,
                    isAnchor: i === 0
                });
            }
            if (parts > 1) {
                for (let b = 1; b < parts; b++) {
                    const subTime = measureTime + b * beatPeriod;
                    if (nextSeg && subTime >= nextSeg.time - 0.001) continue;
                    if (subTime >= leftRelTime - 0.05 && subTime <= rightRelTime + 0.05) {
                        lines.push({
                            relTime: subTime,
                            segIndex: sIdx,
                            isMeasureLine: false,
                            isAnchor: false
                        });
                    }
                }
            }
        }
    }

    return lines;
}

/**
 * 依像素門檻命中測試最接近鼠標的變速點或黃色節拍線
 */
export function hitTestYellowLinesOrAnchors(mouseX, width, previewTime, currentOffset, previewZoom, segments, beatsPerMeasure, subdivision, thresholdPx = 10) {
    const hw = width * 0.5;
    const zoom = previewZoom || 200;
    const centerRelTime = previewTime - currentOffset;
    const leftRelTime = centerRelTime - hw / zoom;
    const rightRelTime = centerRelTime + hw / zoom;

    const timeToX = (relTime) => hw + (relTime - centerRelTime) * zoom;

    // 1. 優先命中既有變速段起點錨點
    let bestAnchor = null;
    let bestAnchorDist = thresholdPx;
    for (let i = 0; i < segments.length; i++) {
        const ax = timeToX(segments[i].time);
        const dist = Math.abs(mouseX - ax);
        if (dist <= bestAnchorDist) {
            bestAnchorDist = dist;
            bestAnchor = { kind: 'anchor', segIndex: i, relTime: segments[i].time, x: ax };
        }
    }
    if (bestAnchor) return bestAnchor;

    // 2. 次之命中黃色小節／節拍線
    const lines = collectVisibleYellowLines(segments, beatsPerMeasure, subdivision, leftRelTime, rightRelTime);
    let bestLine = null;
    let bestLineDist = thresholdPx;
    for (const line of lines) {
        const lx = timeToX(line.relTime);
        const dist = Math.abs(mouseX - lx);
        if (dist <= bestLineDist) {
            bestLineDist = dist;
            bestLine = {
                kind: 'line',
                segIndex: line.segIndex,
                relTime: line.relTime,
                isMeasureLine: line.isMeasureLine,
                x: lx
            };
        }
    }
    return bestLine;
}

/**
 * 依起點、終點時間與區間小節/拍數反推 BPM
 * @param {number} startAudioTime
 * @param {number} endAudioTime
 * @param {number} spanCount 小節數或拍數
 * @param {'measure'|'beat'} spanUnit
 * @param {number} [beatsPerMeasure=4]
 */
export function computeBpmFromSpan(startAudioTime, endAudioTime, spanCount, spanUnit = 'measure', beatsPerMeasure = 4) {
    const dt = endAudioTime - startAudioTime;
    const count = Number(spanCount);
    const tb1 = Math.max(1, Number(beatsPerMeasure) || 4);
    if (!isFinite(dt) || dt <= 0.01 || !isFinite(count) || count <= 0) return null;
    const totalBeats = spanUnit === 'beat' ? count : count * tb1;
    const bpm = (60 * totalBeats) / dt;
    if (!isFinite(bpm) || bpm <= 0) return null;
    return Math.round(bpm * 1000) / 1000;
}

/**
 * 依多段變速時間軸生成完整 simai 空白拍位骨架字串
 * @param {Array<{time: number, bpm: number}>} segments
 * @param {number} [beatsPerMeasure=4]
 * @param {number} [tailSubdivision=4]
 */
export function buildMultiBpmChartSkeleton(segments, beatsPerMeasure = 4, tailSubdivision = 4) {
    if (!Array.isArray(segments) || segments.length === 0) return '';
    const tb1 = Math.max(1, beatsPerMeasure || 4);
    const tailDiv = Math.max(4, tailSubdivision || 4);
    const parts = [];
    const candidateDivs = [4, 8, 12, 16, 24, 32];

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const bpmTag = `(${formatBpmValue(seg.bpm)})`;
        const nextSeg = segments[i + 1];

        if (!nextSeg) {
            parts.push(`${bpmTag}{${tailDiv}}`);
            break;
        }

        const segDuration = nextSeg.time - seg.time;
        if (segDuration <= 0.001) {
            parts.push(bpmTag);
            continue;
        }

        let matchedDiv = null;
        let matchedCount = 0;
        for (const div of candidateDivs) {
            const stepSec = (240 / seg.bpm) / div;
            if (!isFinite(stepSec) || stepSec <= 0) continue;
            const count = Math.round(segDuration / stepSec);
            if (count > 0 && Math.abs(segDuration - count * stepSec) <= 0.004) {
                matchedDiv = div;
                matchedCount = count;
                break;
            }
        }

        if (matchedDiv !== null) {
            const commasPerMeasure = Math.max(1, Math.round((tb1 * matchedDiv) / 4));
            let body = `${bpmTag}{${matchedDiv}}`;
            let remaining = matchedCount;
            while (remaining > 0) {
                const chunk = Math.min(remaining, commasPerMeasure);
                body += ','.repeat(chunk);
                remaining -= chunk;
                if (remaining > 0) body += '\n';
            }
            parts.push(body + '\n');
        } else {
            parts.push(`${bpmTag}{#${segDuration.toFixed(4)}},\n`);
        }
    }

    return parts.join('');
}

/**
 * 將單一變速段的 BPM 插入既有的 simai 譜面文字（依時間對應逗號位置或游標處）
 */
export function buildInsertedSegmentChartText(fullText, seg, options = {}) {
    const text = typeof fullText === 'string' ? fullText : '';
    const bpmStr = formatBpmValue(seg?.bpm);
    if (!bpmStr) return null;

    const tag = `(${bpmStr})`;
    const {
        dataIndexToTime = [],
        findCommaCharIndex = null,
        cursorPos = text.length
    } = options;

    // 若為起點段 (time <= 0.01)，優先替換開頭既有 BPM 標籤或插於最前面
    if ((seg?.time ?? 0) <= 0.01) {
        const leadingMatch = text.match(/^(\s*)\([^)]*\)/);
        if (leadingMatch) {
            const replaced = `${leadingMatch[1]}${tag}${text.slice(leadingMatch[0].length)}`;
            const start = leadingMatch[1].length;
            return { newText: replaced, selStart: start, selEnd: start + tag.length, mode: 'replacedLeading' };
        }
        return { newText: tag + text, selStart: 0, selEnd: tag.length, mode: 'prepended' };
    }

    // 嘗試依 dataIndexToTime 與 findCommaCharIndex 匹配最接近 seg.time 的拍點逗號位置
    if (Array.isArray(dataIndexToTime) && dataIndexToTime.length > 0 && typeof findCommaCharIndex === 'function') {
        let bestIdx = -1;
        let minDiff = Infinity;
        for (let i = 0; i < dataIndexToTime.length; i++) {
            const diff = Math.abs(dataIndexToTime[i] - seg.time);
            if (diff < minDiff) {
                minDiff = diff;
                bestIdx = i;
            }
        }
        if (bestIdx !== -1 && minDiff <= 0.05) {
            let charIdx = findCommaCharIndex(text, bestIdx);
            // 跳過逗號後方的換行與空白，讓 BPM 標籤緊鄰該拍點內容前
            while (charIdx < text.length && (text[charIdx] === ' ' || text[charIdx] === '\t' || text[charIdx] === '\r' || text[charIdx] === '\n')) {
                charIdx++;
            }
            // 若該位置開頭已經存在 BPM 標籤則原地替換，避免產生重疊 ((160))
            const tail = text.slice(charIdx);
            const existingBpmMatch = tail.match(/^\([^)]*\)/);
            if (existingBpmMatch) {
                const oldEnd = charIdx + existingBpmMatch[0].length;
                const newText = text.slice(0, charIdx) + tag + text.slice(oldEnd);
                return { newText, selStart: charIdx, selEnd: charIdx + tag.length, mode: 'replacedAtTime' };
            }
            const newText = text.slice(0, charIdx) + tag + text.slice(charIdx);
            return { newText, selStart: charIdx, selEnd: charIdx + tag.length, mode: 'insertedAtTime' };
        }
    }

    // 降級：插入至游標處（或末尾）
    const safePos = Math.max(0, Math.min(text.length, Number(cursorPos) || text.length));
    const newText = text.slice(0, safePos) + tag + text.slice(safePos);
    return { newText, selStart: safePos, selEnd: safePos + tag.length, mode: 'insertedAtCursor' };
}
