import { getSlideJudgeQueue } from './slidetables.js';

export class SimulatedPlayController {
    constructor() {
        this.activeSensors = new Set();
        this._slideAreasMap = new WeakMap();
        this._simulatTouchDuration = 0.06;
    }

    reset() {
        this.activeSensors.clear();
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

    update({ globalTime, notes = [], renderer, playing, timeControlSliding, onHit = null }) {
        this.activeSensors.clear();
        if (!playing || timeControlSliding) return;

        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            const noteT = note.time - globalTime;
            const noteType = note.type;

            const isHoldNote = (note.isHold || noteType === 'hold' || (note.holdDuration !== undefined && note.holdDuration > 0));

            // 1. Tap / Star / 普通 Touch：在擊中時刻產生感應器輸入並觸發判定
            if (!isHoldNote && (noteType === 'tap' || noteType === 'touch')) {
                const rawSensorId = noteType === 'touch' ? (note.touchPos + note.pos) : ('A' + note.pos);
                const sensorId = (rawSensorId === 'C1' || rawSensorId === 'C2') ? 'C' : rawSensorId;
                if (noteT <= 0 && -noteT <= this._simulatTouchDuration) {
                    this.activeSensors.add(sensorId);
                }
                if (!note.triggered && noteT <= 0 && -noteT <= this._simulatTouchDuration && onHit) {
                    onHit(sensorId, 0);
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
                    onHit(sensorId, 0);
                }
            }

            // 3. Slide：產生頭部點擊與劃軌 SlideArea 的感應器輸入
            if (noteType === 'slide') {
                const slideDelay = note.slideDelay ?? 0;
                const slideDuration = note.slideDuration ?? 0;

                // 頭部點擊感應：僅在單一 Slide 或連鎖 Slide 的第一段時產生
                // 在 noteT <= 0 且星星尚未開始滑動 (slideT < 0) 期間，手指按在起點感應區上
                const isHeadPart = note.firstSlide || !note.prevSlide;
                const slideT = -noteT - slideDelay;
                if (isHeadPart && noteT <= 0 && (slideT < 0 || -noteT <= this._simulatTouchDuration)) {
                    this.activeSensors.add('A' + note.pos);
                    if (!note.triggered && -noteT <= this._simulatTouchDuration && onHit) {
                        onHit('A' + note.pos, 0);
                    }
                }

                // 劃軌感應模擬
                if (!note.isMine && slideDuration > 0) {
                    const queueData = this.getOrCreateSlideAreas(note, renderer);
                    const tableConst = queueData.tableConst ?? note.tableConst ?? 0.18;
                    // 終點到達時刻：對齊基準判定時間 judgeTiming = startTiming + slideDuration * (1 - tableConst)
                    const arriveEndTime = Math.max(0.01, slideDuration * (1 - tableConst));
                    // 連鎖最後一段或獨立 slide 在摸到終點後停留 0.08 秒，非最後一段在交接時只保留 0.02 秒
                    const touchHoldEnd = (note.lastSlide || !note.nextSlide) ? 0.08 : 0.02;

                    if (slideT >= 0 && slideT <= slideDuration + touchHoldEnd) {
                        if (queueData.isWifi && queueData.queues) {
                            const progressRatio = Math.min(1, Math.max(0, slideT / arriveEndTime));
                            for (let b = 0; b < queueData.queues.length; b++) {
                                const branchQueue = queueData.queues[b];
                                const totalAreas = branchQueue.length;
                                if (totalAreas > 0) {
                                    let curIdx = 0;
                                    let floatIdx = 0;
                                    if (totalAreas > 1) {
                                        if (progressRatio >= 1.0 - 1e-5) {
                                            curIdx = totalAreas - 1;
                                            floatIdx = totalAreas - 1;
                                        } else {
                                            floatIdx = progressRatio * (totalAreas - 1) + 1e-6;
                                            curIdx = Math.min(totalAreas - 2, Math.floor(floatIdx));
                                        }
                                    }
                                    const currentArea = branchQueue[curIdx];
                                    if (currentArea && currentArea.areas) {
                                        for (let s = 0; s < currentArea.areas.length; s++) {
                                            this.activeSensors.add(currentArea.areas[s]);
                                        }
                                    }
                                    // 中間區域交接模擬：剛跨入下一區時保留上一區少許時間，保證劃過離開判定觸發
                                    if (curIdx < totalAreas - 1 && curIdx > 0) {
                                        const frac = floatIdx - curIdx;
                                        if (frac < 0.25) {
                                            const prevArea = branchQueue[curIdx - 1];
                                            if (prevArea && prevArea.areas) {
                                                for (let s = 0; s < prevArea.areas.length; s++) {
                                                    this.activeSensors.add(prevArea.areas[s]);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            const areas = queueData;
                            const totalAreas = areas.length;

                            if (totalAreas > 0) {
                                const progressRatio = Math.min(1, Math.max(0, slideT / arriveEndTime));
                                let curIdx = 0;
                                let floatIdx = 0;
                                if (totalAreas > 1) {
                                    if (progressRatio >= 1.0 - 1e-5) {
                                        curIdx = totalAreas - 1;
                                        floatIdx = totalAreas - 1;
                                    } else {
                                        floatIdx = progressRatio * (totalAreas - 1) + 1e-6;
                                        curIdx = Math.min(totalAreas - 2, Math.floor(floatIdx));
                                    }
                                }

                                const currentArea = areas[curIdx];
                                if (currentArea && currentArea.areas) {
                                    for (let s = 0; s < currentArea.areas.length; s++) {
                                        this.activeSensors.add(currentArea.areas[s]);
                                    }
                                }

                                // 中間區域交接模擬：剛跨入下一區時保留上一區少許時間，保證劃過離開判定觸發
                                if (curIdx < totalAreas - 1 && curIdx > 0) {
                                    const frac = floatIdx - curIdx;
                                    if (frac < 0.25) {
                                        const prevArea = areas[curIdx - 1];
                                        if (prevArea && prevArea.areas) {
                                            for (let s = 0; s < prevArea.areas.length; s++) {
                                                this.activeSensors.add(prevArea.areas[s]);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // 超過 slideDuration + touchHoldEnd 之後，不加入任何感應器，徹底防止結尾殘留
                }
            }
        }
    }
}
