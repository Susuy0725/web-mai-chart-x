export class SimulatedPlayController {
    constructor() {
        this.activeSensors = new Set();
        this._slideCheckpointMap = new WeakMap();
    }

    reset() {
        this.activeSensors.clear();
        this._slideCheckpointMap = new WeakMap();
    }

    getOrCreateSlideCheckpoints(note, renderer) {
        if (!renderer || typeof renderer.getSensorIdAtPoint !== 'function') return [];
        if (this._slideCheckpointMap.has(note)) {
            return this._slideCheckpointMap.get(note);
        }

        const path = note.path || generatePath(note.pos, note.slideEnd);
        if (!path || path.totalLength < 1e-4) {
            const empty = [];
            this._slideCheckpointMap.set(note, empty);
            return empty;
        }

        const numSamples = Math.max(8, Math.min(24, Math.ceil(path.totalLength * 0.4)));
        const checkpoints = [];
        let lastSensorId = null;

        for (let i = 0; i <= numSamples; i++) {
            const ratio = i / numSamples;
            const pt = path.getPointAt(ratio);
            const sensorId = renderer.getSensorIdAtPoint(pt.x, pt.y, true);
            if (sensorId && sensorId !== lastSensorId) {
                checkpoints.push({ ratio, sensorId });
                lastSensorId = sensorId;
            }
        }

        this._slideCheckpointMap.set(note, checkpoints);
        return checkpoints;
    }

    update({ globalTime, notes = [], renderer, playing, timeControlSliding, effectDecayTime = 0.2 }) {
        this.activeSensors.clear();
        if (!playing || timeControlSliding) return;

        const touchDuration = 0.08;

        for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            const noteT = note.time - globalTime;
            const noteType = note.type;

            // 1. Tap / Star / 普通 Touch 觸發擊中
            if (noteType === 'tap' || (noteType === 'touch' && !note.holdDuration)) {
                if (noteT <= 0 && -noteT <= touchDuration) {
                    const rawSensorId = noteType === 'touch' ? (note.touchPos + note.pos) : ('A' + note.pos);
                    const sensorId = (rawSensorId === 'C1' || rawSensorId === 'C2') ? 'C' : rawSensorId;
                    this.activeSensors.add(sensorId);
                    if (!note.triggered) {
                        note.triggered = true;
                        note.triggeredTime = note.time;
                    }
                } else if (-noteT > effectDecayTime) {
                    note.triggered = false;
                }
            }

            // 2. Hold & TouchHold 按壓狀態
            if (note.holdDuration > 0) {
                if (noteT <= 0 && -noteT <= note.holdDuration) {
                    const rawSensorId = noteType === 'touch' ? (note.touchPos + note.pos) : ('A' + note.pos);
                    const sensorId = (rawSensorId === 'C1' || rawSensorId === 'C2') ? 'C' : rawSensorId;
                    this.activeSensors.add(sensorId);
                    note.isHolding = true;
                    note.holdFinish = false;
                } else if (-noteT > note.holdDuration) {
                    note.isHolding = false;
                    if (!note.holdFinish) {
                        note.holdFinish = true;
                        note.holdFinishTime = note.time + note.holdDuration;
                    } else if (-noteT > note.holdDuration + effectDecayTime) {
                        note.holdFinish = false;
                    }
                } else {
                    note.isHolding = false;
                    note.holdFinish = false;
                }
            }

            // 3. Slide 觸發頭部 Tap 與感應器 Checkpoint 滑動推進
            if (noteType === 'slide') {
                const slideDelay = note.slideDelay ?? 0;
                const slideDuration = note.slideDuration ?? 0;

                // Slide 頭部點擊感應
                if (noteT <= 0 && -noteT <= touchDuration) {
                    this.activeSensors.add('A' + note.pos);
                    if (!note.triggered) {
                        note.triggered = true;
                        note.triggeredTime = note.time;
                    }
                } else if (-noteT > effectDecayTime) {
                    note.triggered = false;
                }

                if (!note.isMine && slideDuration > 0) {
                    const checkpoints = this.getOrCreateSlideCheckpoints(note, renderer);
                    const totalCp = checkpoints.length;

                    if (-noteT > slideDelay && totalCp > 0) {
                        const slideT = -noteT - slideDelay;
                        const progressRatio = Math.min(1, Math.max(0, slideT / slideDuration));
                        note.slideProgress = progressRatio;

                        // 模擬手劃過當前路徑 Checkpoint 之感應區
                        const currentCpIdx = Math.min(totalCp - 1, Math.floor(progressRatio * totalCp));
                        const currentCp = checkpoints[currentCpIdx];
                        if (currentCp && currentCp.sensorId) {
                            this.activeSensors.add(currentCp.sensorId);
                        }

                        if (progressRatio >= 1) {
                            note.slideFinish = true;
                        } else {
                            note.slideFinish = false;
                        }
                    } else {
                        note.slideProgress = 0;
                        note.slideFinish = false;
                    }
                } else {
                    note.slideProgress = 0;
                    note.slideFinish = false;
                }
            }
        }
    }
}