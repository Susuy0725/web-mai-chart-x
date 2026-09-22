import { generatePath } from '../Scripts/helper.js';
import { getSlideJudgeQueue } from './slidetables.js';

export class SimulatedPlayController {
    constructor() {
        this.activeSensors = new Set();
        this._slideAreasMap = new WeakMap();
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

        const touchDuration = 0.12;

        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            const noteT = note.time - globalTime;
            const noteType = note.type;

            // 1. Tap / Star / 普通 Touch：在擊中時刻產生感應器輸入並觸發判定
            if (noteType === 'tap' || (noteType === 'touch' && !note.holdDuration)) {
                const rawSensorId = noteType === 'touch' ? (note.touchPos + note.pos) : ('A' + note.pos);
                const sensorId = (rawSensorId === 'C1' || rawSensorId === 'C2') ? 'C' : rawSensorId;
                if (noteT <= 0 && -noteT <= touchDuration) {
                    this.activeSensors.add(sensorId);
                }
                if (!note.triggered && noteT <= 0 && -noteT <= 0.15 && onHit) {
                    onHit(sensorId, 0);
                }
            }

            // 2. Hold & TouchHold：在到達時刻觸發判定，並在長按期間持續產生感應器輸入
            // （短 Hold 如 1h 的 holdDuration 為 1e-4，需保障至少 touchDuration 觸發與感應窗口）
            if (note.holdDuration > 0) {
                const rawSensorId = noteType === 'touch' ? (note.touchPos + note.pos) : ('A' + note.pos);
                const sensorId = (rawSensorId === 'C1' || rawSensorId === 'C2') ? 'C' : rawSensorId;
                const holdEnd = Math.max(note.holdDuration, touchDuration);

                if (noteT <= 0 && -noteT <= holdEnd) {
                    this.activeSensors.add(sensorId);
                }
                if (!note.triggered && noteT <= 0 && -noteT <= Math.max(note.holdDuration, 0.15) && onHit) {
                    onHit(sensorId, 0);
                }
            }

            // 3. Slide：產生頭部點擊與劃軌 SlideArea 的感應器輸入
            if (noteType === 'slide') {
                const slideDelay = note.slideDelay ?? 0;
                const slideDuration = note.slideDuration ?? 0;

                // 頭部點擊感應：僅在單一 Slide 或連鎖 Slide 的第一段時產生
                const isHeadPart = note.firstSlide || !note.prevSlide;
                if (isHeadPart && noteT <= 0 && -noteT <= touchDuration) {
                    this.activeSensors.add('A' + note.pos);
                    if (!note.triggered && onHit) {
                        onHit('A' + note.pos, 0);
                    }
                }

                // 劃軌感應模擬
                if (!note.isMine && slideDuration > 0) {
                    const slideT = -noteT - slideDelay;
                    // 連鎖最後一段或獨立 slide 在摸到終點後停留 0.08 秒，非最後一段在交接時只保留 0.02 秒
                    const touchHoldEnd = (note.lastSlide || !note.nextSlide) ? 0.08 : 0.02;

                    if (slideT >= 0 && slideT <= slideDuration + touchHoldEnd) {
                        const areas = this.getOrCreateSlideAreas(note, renderer);
                        const totalAreas = areas.length;

                        if (totalAreas > 0) {
                            const progressRatio = Math.min(1, Math.max(0, slideT / slideDuration));
                            const curIdx = Math.min(totalAreas - 1, Math.floor(progressRatio * totalAreas));

                            const currentArea = areas[curIdx];
                            if (currentArea && currentArea.areas) {
                                for (let s = 0; s < currentArea.areas.length; s++) {
                                    this.activeSensors.add(currentArea.areas[s]);
                                }
                            }

                            // 兩區交接模擬：剛跨入下一區時保留上一區少許時間，保證劃過離開判定觸發
                            const frac = (progressRatio * totalAreas) - curIdx;
                            if (frac < 0.25 && curIdx > 0) {
                                const prevArea = areas[curIdx - 1];
                                if (prevArea && prevArea.areas) {
                                    for (let s = 0; s < prevArea.areas.length; s++) {
                                        this.activeSensors.add(prevArea.areas[s]);
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