import { getSlideJudgeQueue } from './slidetables.js';

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
    }

    reset() {
        this.activeSensors.clear();
        this.slideQueue = [];
        this._slideAreasMap = new WeakMap();
    }

    getOrCreateSlideAreas(note, renderer) {
        if (this._slideAreasMap.has(note)) {
            return this._slideAreasMap.get(note);
        }
        const queue = getSlideJudgeQueue(note, renderer);
        this._slideAreasMap.set(note, queue);
        return queue;
    }

    update({ globalTime, notes = [], renderer, playing, timeControlSliding, onHit = null, forcePerfect = true, randomOffset = 0 }) {
        this.activeSensors.clear();
        this.slideQueue.length = 0;
        if (!playing || timeControlSliding) return;

        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            const noteT = note.time - globalTime;
            const noteType = note.type;

            // 若音符還在判定視窗未來的時間之後，後續音符都在更遠未來，提前結束檢查
            if (noteT > 0.5) break;

            const isHoldNote = (note.isHold || noteType === 'hold' || (note.holdDuration !== undefined && note.holdDuration > 0));

            // 1. Tap / Star / 普通 Touch：在擊中時刻產生感應器輸入並觸發判定
            if (!isHoldNote && (noteType === 'tap' || noteType === 'touch')) {
                const rawSensorId = noteType === 'touch' ? (note.touchPos + note.pos) : ('A' + note.pos);
                const sensorId = (rawSensorId === 'C1' || rawSensorId === 'C2') ? 'C' : rawSensorId;
                if (noteT <= 0 && -noteT <= this._simulatTouchDuration) {
                    this.activeSensors.add(sensorId);
                }
                if (!note.triggered && noteT <= 0 && -noteT <= this._simulatTouchDuration && onHit) {
                    onHit(sensorId, forcePerfect ? 0 : -noteT + randomOffset);
                }
            }

            // 2. Hold & TouchHold：在到達時刻觸發判定，並在長按期間持續產生感應器輸入
            // （短 Hold 如 1h、1h[1:0] 的 holdDuration 為 1e-4，保障至少 touchDuration / 0.15s 觸發與感應窗口）
            if (isHoldNote) {
                const rawSensorId = noteType === 'touch' ? (note.touchPos + note.pos) : ('A' + note.pos);
                const sensorId = (rawSensorId === 'C1' || rawSensorId === 'C2') ? 'C' : rawSensorId;
                const holdEnd = Math.max(note.holdDuration, this._simulatTouchDuration); // safe margin

                if (noteT <= 0 && -noteT <= holdEnd) {
                    this.activeSensors.add(sensorId);
                }
                if (!note.triggered && noteT <= 0 && -noteT <= Math.max(note.holdDuration, this._simulatTouchDuration) && onHit) {
                    onHit(sensorId, forcePerfect ? 0 : -noteT + randomOffset);
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
                if (isHeadPart && noteT <= 0 && -noteT <= this._simulatTouchDuration) {
                    this.activeSensors.add('A' + note.pos);
                    if (!note.headTriggered && !note.triggered && onHit) {
                        note.headTriggered = true;
                        note.triggered = true;
                        onHit('A' + note.pos, forcePerfect ? 0 : -noteT + randomOffset);
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
                    const tableConst = note.tableConst ?? 0.18;
                    // 終點到達時刻：對齊基準判定時間 judgeTiming = startTiming + slideDuration * (1 - tableConst)
                    const arriveEndTime = Math.max(0.01, slideDuration * (1 - tableConst));
                    // 連鎖最後一段或獨立 slide 在摸到終點後停留 0.08 秒，非最後一段在交接時只保留 0.02 秒
                    const touchHoldEnd = (note.lastSlide || !note.nextSlide) ? 0.08 : 0.02;

                    // 記錄至當前活耀的 Slide 隊列
                    if (slideT >= 0 && slideT <= slideDuration + touchHoldEnd) {
                        this.slideQueue.push(note);
                    }

                    if (slideT >= 0 && slideT <= slideDuration + touchHoldEnd) {
                        const totalCount = note._totalAreasCount || 1;
                        const progress = Math.min(1, Math.max(0, slideT / arriveEndTime));
                        // 實時依手指滑動進度更新引導箭頭消散
                        note.slideProgress = Math.min(1, Math.max(note.slideProgress || 0, progress));

                        if (totalCount <= 1) {
                            // 單一感應區 Slide
                            for (let b = 0; b < queues.length; b++) {
                                const q = queues[b];
                                if (q.length > 0) {
                                    const area = q[0];
                                    if (area && area.areas) {
                                        for (let s = 0; s < area.areas.length; s++) {
                                            this.activeSensors.add(area.areas[s]);
                                        }
                                    }
                                }
                            }
                        } else {
                            // 多步驟 Slide：以平滑手指軌跡推進各感應區
                            const floatIdx = progress * (totalCount - 1);
                            const curIdx = Math.min(totalCount - 1, Math.floor(floatIdx));

                            for (let b = 0; b < queues.length; b++) {
                                const queue = queues[b];
                                // 若分支隊列已經被處理完 (清空)，直接忽略
                                if (!queue || queue.length === 0) continue;

                                const fullQ = (note._fullJudgeQueues && note._fullJudgeQueues[b]) ? note._fullJudgeQueues[b] : (note._fullJudgeQueue || queue);
                                const branchTotal = fullQ.length;
                                const processedCount = branchTotal - queue.length;

                                // 1. 當前手指區域：若已在隊列中被處理 (curIdx < processedCount)，則忽略！
                                if (curIdx >= processedCount && curIdx < branchTotal) {
                                    const currentArea = fullQ[curIdx];
                                    if (currentArea && currentArea.areas) {
                                        for (let s = 0; s < currentArea.areas.length; s++) {
                                            this.activeSensors.add(currentArea.areas[s]);
                                        }
                                    }
                                }

                                // 2. 兩區交接：上一區若已被處理 (curIdx - 1 < processedCount)，則忽略！
                                const frac = floatIdx - curIdx;
                                if (progress < 1.0 && curIdx > 0 && frac < 0.35) {
                                    if (curIdx - 1 >= processedCount) {
                                        const prevArea = fullQ[curIdx - 1];
                                        if (prevArea && prevArea.areas) {
                                            for (let s = 0; s < prevArea.areas.length; s++) {
                                                this.activeSensors.add(prevArea.areas[s]);
                                            }
                                        }
                                    }
                                } else if (curIdx < branchTotal - 1 && frac > 0.65) {
                                    if (curIdx + 1 >= processedCount) {
                                        const nextArea = fullQ[curIdx + 1];
                                        if (nextArea && nextArea.areas) {
                                            for (let s = 0; s < nextArea.areas.length; s++) {
                                                this.activeSensors.add(nextArea.areas[s]);
                                            }
                                        }
                                    }
                                }

                                // 3. 終點停留：終點若已被處理 (branchTotal - 1 < processedCount)，則忽略！
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

                    // 若已超時仍未標記完成，強制清空隊列保證 main.js 結算
                    if (slideT >= arriveEndTime + 0.05 && !note.slideFinish) {
                        for (let b = 0; b < queues.length; b++) {
                            queues[b].length = 0;
                        }
                    }
                    // 超過 slideDuration + touchHoldEnd 之後，不加入任何感應器，徹底防止結尾殘留
                }
            }
        }
    }
}

