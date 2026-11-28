import { getSlideJudgeQueue, getSlideStepState, getSlideBranchPath } from './slidetables.js';

/**
 * 確保 note 的判定隊列 (judgeQueues) 已正確建立
 * 與 main.js 統一結構，作為 Autoplay 與判定狀態機共通的單一資料來源
 */
function ensureSlideJudgeQueues(note, renderer) {
    if (!note.judgeQueue && !note.judgeQueues) {
        const baseQueue = getSlideJudgeQueue(note, renderer);
        note.tableConst = baseQueue.tableConst ?? (note.tableConst || 0.18);
        note._debugMeta = baseQueue._debugMeta || note._debugMeta;
        if (baseQueue.isWifi && baseQueue.branches) {
            note.isWifi = true;
            note.judgeQueues = [
                baseQueue.branches.left.map(a => a.clone()),
                baseQueue.branches.center.map(a => a.clone()),
                baseQueue.branches.right.map(a => a.clone())
            ];
            note.judgeQueue = note.judgeQueues[1];
            note._totalAreasCount = 4;
            note._fullJudgeQueue = baseQueue.branches.center.map(a => a.clone());
            note._fullJudgeQueues = [
                baseQueue.branches.left.map(a => a.clone()),
                baseQueue.branches.center.map(a => a.clone()),
                baseQueue.branches.right.map(a => a.clone())
            ];
        } else {
            note.isWifi = false;
            note.judgeQueue = baseQueue.map(a => a.clone());
            note.judgeQueues = [note.judgeQueue];
            note._totalAreasCount = note.judgeQueue.length;
            note._fullJudgeQueue = baseQueue.map(a => a.clone());
            note._fullJudgeQueues = [note._fullJudgeQueue];
        }
    } else if (!note._fullJudgeQueues) {
        note._fullJudgeQueues = note.judgeQueues
            ? note.judgeQueues.map(q => q.map(a => a.clone()))
            : (note.judgeQueue ? [note.judgeQueue.map(a => a.clone())] : []);
    }
    return note.judgeQueues || (note.judgeQueue ? [note.judgeQueue] : []);
}

export class SimulatedPlayController {
    constructor() {
        this.activeSensors = new Set();
        this.slideQueue = [];
        this._slideAreasMap = new WeakMap();
        this._simulatTouchDuration = 0.06;
        this._notesRef = null;
        this._scanCursor = 0;
        this._activeHolds = [];
        this._activeHoldSet = new Set();
        this._holdingTouchSet = new Set();
        this._lastGlobalTime = -Infinity;
    }

    reset() {
        this.activeSensors.clear();
        this.slideQueue.length = 0;
        this._slideAreasMap = new WeakMap();
        this._notesRef = null;
        this._scanCursor = 0;
        this._activeHolds.length = 0;
        this._activeHoldSet.clear();
        this._holdingTouchSet.clear();
        this._lastGlobalTime = -Infinity;
    }

    getOrCreateSlideAreas(note, renderer) {
        if (this._slideAreasMap.has(note)) {
            return this._slideAreasMap.get(note);
        }
        const queue = getSlideJudgeQueue(note, renderer);
        this._slideAreasMap.set(note, queue);
        return queue;
    }

    update({ globalTime, notes = [], renderer, playing, timeControlSliding, onHit = null, forcePerfect = true, randomOffset = 0, useButton = true }) {
        this.activeSensors.clear();
        this.slideQueue.length = 0;
        if (!playing || timeControlSliding) return;

        if (this._notesRef !== notes || globalTime < this._lastGlobalTime - 0.05) {
            this._notesRef = notes;
            this._scanCursor = 0;
            this._activeHolds.length = 0;
            this._activeHoldSet.clear();
        }
        this._lastGlobalTime = globalTime;

        const normalPrefix = useButton ? 'K' : 'A';
        const touchDur = this._simulatTouchDuration;

        // 1. 清理並彙整目前仍在長按期間的前置 Hold 狀態（O(activeHolds) 取代原本每音符掃全譜的 O(N^2)）
        let holdingOuterMask = 0;
        this._holdingTouchSet.clear();
        for (let hIdx = this._activeHolds.length - 1; hIdx >= 0; hIdx--) {
            const h = this._activeHolds[hIdx];
            const hEnd = Math.max(h.holdDuration ?? 0, touchDur);
            if (h.holdFinish || globalTime > h.time + hEnd + 0.1) {
                this._activeHoldSet.delete(h);
                this._activeHolds.splice(hIdx, 1);
                continue;
            }
            if (h.triggered && !h.holdFinish && h.isHolding && globalTime < h.time + (h.holdDuration ?? 0)) {
                if (h.type === 'touch') {
                    this._holdingTouchSet.add(h.touchPos === 'C' ? 'C' : (h.touchPos + h.pos));
                } else {
                    holdingOuterMask |= (1 << h.pos);
                }
            }
        }

        // 先收錄掃描視窗內將要遇到的 Hold 長按狀態（包含已觸發或即將在本幀觸發後供同幀其他音符檢查）
        let canAdvanceCursor = true;
        const notesLen = notes.length;

        for (let i = this._scanCursor; i < notesLen; i++) {
            const note = notes[i];
            const noteT = note.time - globalTime;
            const noteType = note.type;

            // 若音符還在判定視窗未來的時間之後，後續音符都在更遠未來，提前結束檢查
            if (noteT > 0.5) break;

            const isHoldNote = (note.isHold || noteType === 'hold' || (note.holdDuration !== undefined && note.holdDuration > 0));
            const slideDelay = note.slideDelay ?? 0;
            const slideDuration = note.slideDuration ?? 0;
            const touchHoldEnd = (note.lastSlide || !note.nextSlide) ? 0.08 : 0.02;
            const maxActiveSpan = isHoldNote
                ? Math.max(note.holdDuration ?? 0, touchDur) + 0.1
                : (noteType === 'slide' ? (slideDelay + slideDuration + touchHoldEnd + 0.1) : (touchDur + 0.1));

            const isPastDone = (globalTime > note.time + maxActiveSpan) &&
                (noteType === 'slide' ? (note.slideFinish || note.isMine || slideDuration <= 0) : (note.triggered || note.isMine || -noteT > touchDur));

            if (canAdvanceCursor) {
                if (isPastDone) {
                    this._scanCursor = i + 1;
                    continue;
                }
                if (isHoldNote && noteT < -0.5) {
                    // 長按中的長條轉交 _activeHolds 管理，允許游標繼續越過大量短音符
                    if (!this._activeHoldSet.has(note)) {
                        this._activeHoldSet.add(note);
                        this._activeHolds.push(note);
                    }
                    this._scanCursor = i + 1;
                } else if (noteType === 'slide' && noteT < -0.5) {
                    // 長 Slide 仍在滑行中時先處理本段，後續仍在滑動的留在下次檢查
                    canAdvanceCursor = false;
                } else {
                    canAdvanceCursor = false;
                }
            }

            // 1. Tap / Star / 普通 Touch：在擊中時刻產生感應器輸入並觸發判定
            if (!note.isMine && !isHoldNote && (noteType === 'tap' || noteType === 'touch')) {
                const sensorId = (noteType === 'touch')
                    ? ((note.touchPos === 'C') ? 'C' : (note.touchPos + note.pos))
                    : (normalPrefix + note.pos);
                if (noteT <= 0 && -noteT <= touchDur) {
                    this.activeSensors.add(sensorId);

                    if (!note.triggered && onHit) {
                        const isOccupiedByHolding = (noteType === 'touch')
                            ? this._holdingTouchSet.has(sensorId)
                            : ((holdingOuterMask & (1 << note.pos)) !== 0);

                        if (!isOccupiedByHolding) {
                            onHit(sensorId, forcePerfect ? 0 : -noteT + randomOffset);
                        }
                    }
                }
            }

            // 2. Hold & TouchHold：在到達時刻觸發判定，並在長按期間持續產生感應器輸入
            if (!note.isMine && isHoldNote) {
                const sensorId = (noteType === 'touch')
                    ? ((note.touchPos === 'C') ? 'C' : (note.touchPos + note.pos))
                    : (normalPrefix + note.pos);
                const holdEnd = Math.max(note.holdDuration ?? 0, touchDur);

                if (noteT <= 0 && -noteT <= holdEnd) {
                    this.activeSensors.add(sensorId);
                }
                if (!note.triggered && noteT <= 0 && -noteT <= holdEnd && onHit) {
                    onHit(sensorId, forcePerfect ? 0 : -noteT + randomOffset);
                }
                if (note.triggered && !note.holdFinish && note.isHolding && globalTime < note.time + (note.holdDuration ?? 0)) {
                    if (!this._activeHoldSet.has(note)) {
                        this._activeHoldSet.add(note);
                        this._activeHolds.push(note);
                    }
                    if (noteType === 'touch') {
                        this._holdingTouchSet.add(sensorId);
                    } else {
                        holdingOuterMask |= (1 << note.pos);
                    }
                }
            }

            // 3. Slide：使用隊列方式逐步解決劃軌判定與感應區輸入
            if (noteType === 'slide') {
                const slideDelay = note.slideDelay ?? 0;
                const slideDuration = note.slideDuration ?? 0;

                // 頭部點擊感應：僅在單一 Slide 或連鎖 Slide 的第一段時產生
                // 只在打擊窗口內短暫按壓起點，不在星星開始滑動前持續按住起點
                const isHeadPart = note.firstSlide || !note.prevSlide;
                const slideT = -noteT - slideDelay;
                if (!note.isMine && isHeadPart && noteT <= 0 && -noteT <= this._simulatTouchDuration) {
                    this.activeSensors.add(normalPrefix + note.pos);
                    if (!note.headTriggered && !note.triggered) {
                        note.headTriggered = true;
                        note.triggered = true;
                        note.triggeredTime = note.time;
                    }
                }

                // 劃軌判定感應模擬（隊列驅動解決）
                if (!note.isMine && slideDuration > 0) {
                    // 若整條 Slide 已經判定處理完畢，直接忽略
                    if (note.slideFinish) {
                        continue;
                    }
                    // 若前段連鎖 Slide 尚未判定完成，等待前段隊列結算後再啟動
                    if (note.prevSlide && !note.prevSlide.slideFinish) {
                        continue;
                    }

                    const queues = ensureSlideJudgeQueues(note, renderer);
                    // 末段或獨立 slide 的最後感應區於基準判定時機 judgeTiming (= slideDuration * (1 - tableConst)) 按下，
                    // 與玩家真實判定基準一致；連鎖前段則延伸至整段結尾平滑交接
                    const isGroupPartEnd = note.lastSlide || !note.nextSlide;
                    const tableConst = note.tableConst ?? 0.18;
                    const arriveEndTime = Math.max(0.001, isGroupPartEnd ? (slideDuration * (1 - tableConst)) : slideDuration);
                    // 連鎖最後一段或獨立 slide 在摸到終點後停留 0.08 秒，非最後一段在交接時只保留 0.02 秒
                    const touchHoldEnd = isGroupPartEnd ? 0.08 : 0.02;

                    // 記錄至當前活耀的 Slide 隊列
                    if (slideT >= 0 && slideT <= arriveEndTime + touchHoldEnd) {
                        this.slideQueue.push(note);
                    }

                    if (slideT >= 0 && slideT <= arriveEndTime + touchHoldEnd) {
                        const totalCount = note._totalAreasCount || 1;
                        const progress = Math.min(1, Math.max(0, slideT / arriveEndTime));

                        if (totalCount <= 1) {
                            // 單一感應區 Slide：等待結束時刻才觸發最後一個（唯一）感應區
                            if (progress >= 1.0) {
                                for (let b = 0; b < queues.length; b++) {
                                    const q = queues[b];
                                    if (q.length > 0) {
                                        const area = q[0];
                                        if (area && area.areas) {
                                            for (let s = 0; s < area.areas.length; s++) {
                                                this.activeSensors.add(area.areas[s]);
                                            }
                                            if (!note._singleAreaTriggered && onHit) {
                                                note._singleAreaTriggered = true;
                                                for (let s = 0; s < area.areas.length; s++) {
                                                    onHit(area.areas[s]);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            // 多步驟 Slide：依路徑幾何非線性映射推進各感應區（視覺勻速滑動，最後一區於 progress = 1.0 按下）
                            const branchCount = queues.length;
                            const repBranchIdx = (branchCount === 3) ? 1 : 0;
                            const repQueue = queues[repBranchIdx];
                            const repFullQ = (note._fullJudgeQueues && note._fullJudgeQueues[repBranchIdx])
                                ? note._fullJudgeQueues[repBranchIdx]
                                : (note._fullJudgeQueue || repQueue);
                            const repPath = getSlideBranchPath(note, repBranchIdx, branchCount);
                            const repState = getSlideStepState(repFullQ, repPath, progress);

                            // 當手指推進至新感應區時，觸發該感應區的剛劃入輸入事件 (真實影響同位置 Tap/Touch 判定)
                            if (note._lastSimStepIdx !== repState.curIdx) {
                                note._lastSimStepIdx = repState.curIdx;
                                if (onHit) {
                                    for (let b = 0; b < branchCount; b++) {
                                        const queue = queues[b];
                                        const fullQ = (note._fullJudgeQueues && note._fullJudgeQueues[b]) ? note._fullJudgeQueues[b] : (note._fullJudgeQueue || queue);
                                        const bPath = getSlideBranchPath(note, b, branchCount);
                                        const bState = (b === repBranchIdx) ? repState : getSlideStepState(fullQ, bPath, progress);
                                        if (bState.curIdx < fullQ.length) {
                                            const stepArea = fullQ[bState.curIdx];
                                            if (stepArea && stepArea.areas) {
                                                for (let s = 0; s < stepArea.areas.length; s++) {
                                                    onHit(stepArea.areas[s]);
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            for (let b = 0; b < branchCount; b++) {
                                const queue = queues[b];
                                // 若分支隊列已經被處理完 (清空)，直接忽略
                                if (!queue || queue.length === 0) continue;

                                const fullQ = (note._fullJudgeQueues && note._fullJudgeQueues[b]) ? note._fullJudgeQueues[b] : (note._fullJudgeQueue || queue);
                                const branchTotal = fullQ.length;
                                const processedCount = branchTotal - queue.length;
                                const bPath = getSlideBranchPath(note, b, branchCount);
                                const { curIdx, frac } = (b === repBranchIdx)
                                    ? repState
                                    : getSlideStepState(fullQ, bPath, progress);

                                // 1. 當前手指區域：若已在隊列中被處理 (curIdx < processedCount)，則忽略！
                                if (curIdx >= processedCount && curIdx < branchTotal) {
                                    const currentArea = fullQ[curIdx];
                                    if (currentArea && currentArea.areas) {
                                        for (let s = 0; s < currentArea.areas.length; s++) {
                                            this.activeSensors.add(currentArea.areas[s]);
                                        }
                                    }
                                }

                                // 2. 兩區交接：僅在非最後一區之前交疊，絕不在 progress < 1.0 時提前觸發最後一個感應區
                                if (progress < 1.0 && curIdx > 0 && frac < 0.35) {
                                    if (curIdx - 1 >= processedCount) {
                                        const prevArea = fullQ[curIdx - 1];
                                        if (prevArea && prevArea.areas) {
                                            for (let s = 0; s < prevArea.areas.length; s++) {
                                                this.activeSensors.add(prevArea.areas[s]);
                                            }
                                        }
                                    }
                                } else if (progress < 1.0 && curIdx < branchTotal - 2 && frac > 0.65) {
                                    if (curIdx + 1 >= processedCount) {
                                        const nextArea = fullQ[curIdx + 1];
                                        if (nextArea && nextArea.areas) {
                                            for (let s = 0; s < nextArea.areas.length; s++) {
                                                this.activeSensors.add(nextArea.areas[s]);
                                            }
                                        }
                                    }
                                }

                                // 3. 終點停留：僅於 Slide 結束時刻 (progress >= 1.0) 按下最後一個感應區
                                if (progress >= 1.0) {
                                    if (branchTotal - 1 >= processedCount) {
                                        const lastArea = fullQ[branchTotal - 1];
                                        if (lastArea && lastArea.areas) {
                                            for (let s = 0; s < lastArea.areas.length; s++) {
                                                this.activeSensors.add(lastArea.areas[s]);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // 若已超過結束停留窗口仍未標記完成，強制清空隊列保證 main.js 結算，並保留啟動音觸發機會
                    if (slideT >= arriveEndTime + touchHoldEnd && !note.slideFinish) {
                        let hadRemaining = false;
                        for (let b = 0; b < queues.length; b++) {
                            if (queues[b].length > 0) {
                                hadRemaining = true;
                                queues[b].length = 0;
                            }
                        }
                        if (hadRemaining) {
                            note._simplayAutoCompleted = true;
                        }
                    }
                    // 超過 slideDuration + touchHoldEnd 之後，不加入任何感應器，徹底防止結尾殘留
                }
            }
        }
    }
}

