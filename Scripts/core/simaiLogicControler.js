function binarySearchLowerBound(arr, val) {
    let low = 0, high = arr.length;
    while (low < high) {
        const mid = (low + high) >>> 1;
        if (arr[mid] < val) low = mid + 1;
        else high = mid;
    }
    return low;
}

function binarySearchUpperBound(arr, val) {
    let low = 0, high = arr.length;
    while (low < high) {
        const mid = (low + high) >>> 1;
        if (arr[mid] <= val) low = mid + 1;
        else high = mid;
    }
    return low;
}

export class SimaiLogicControler {
    constructor() {
        this._buckets = { slide: [], tapnhold: [], touch: [] };
        this._visualBuckets = { slide: [], tapnhold: [], touch: [], tags: [] };
        this._noteQuantity = { slide: 0, tap: 0, hold: 0, touch: 0, break: 0 };
        this._result = {
            buckets: this._buckets,
            playCombo: 0,
            playScore: 0,
            visualBuckets: this._visualBuckets,
            noteQuantity: this._noteQuantity,
            nowIndex: 0
        };

        this.useLegacyScan = false;
        this._canOptimize = false;
        this._isSorted = true;
        this._preparedNotes = null;
        this._preparedPlayScoreRes = null;
        this._lastGlobalTime = -99999;
        this._noteTimes = new Float64Array(0);
        this._nonSlideTimes = new Float64Array(0);
        this._nonSlideIndexes = new Int32Array(0);
        this._comboTimes = new Float64Array(0);
        this._prefixScores = new Float64Array(0);
        this._prefixBreak = new Int32Array(0);
        this._prefixHold = new Int32Array(0);
        this._prefixTap = new Int32Array(0);
        this._prefixTouch = new Int32Array(0);
        this._prefixSlide = new Int32Array(0);
        this._maxRetain = 10;
    }

    prepare(notes, playScoreRes) {
        this._preparedNotes = notes;
        this._preparedPlayScoreRes = playScoreRes;
        const len = notes ? notes.length : 0;
        if (len === 0) {
            this._canOptimize = false;
            return;
        }

        const noteTimes = new Float64Array(len);
        let maxRetain = 0;
        let isSorted = true;

        for (let i = 0; i < len; i++) {
            const n = notes[i];
            noteTimes[i] = n.time;
            if (i > 0 && n.time < notes[i - 1].time) isSorted = false;

            const skipT = (n.holdDuration ?? 0) + (n.slideDuration ?? 0) + (n.slideDelay ?? 0) + (n.isMine ? (n.cullSkipExtend ?? 0) : 0);
            const renderSkipT = n.type === 'slide' ? ((n.slideDelay ?? 0) + (n.slideDuration ?? 0) + (n.isMine ? (n.cullSkipExtend ?? 0) : 0)) : skipT;
            if (renderSkipT > maxRetain) maxRetain = renderSkipT;
        }

        this._isSorted = isSorted;
        this._noteTimes = noteTimes;
        this._maxRetain = maxRetain + 3.0; // 包含 decay 緩衝

        // Non-slide 音符，用於快速二分搜尋 nowIndex
        const nsTimes = [];
        const nsIndexes = [];
        for (let i = 0; i < len; i++) {
            const n = notes[i];
            if (n.type !== 'slide' && n.index !== undefined && n.index !== null) {
                nsTimes.push(n.time);
                nsIndexes.push(n.index);
            }
        }
        this._nonSlideTimes = new Float64Array(nsTimes);
        this._nonSlideIndexes = new Int32Array(nsIndexes);

        // 前綴和陣列建構 (Combo / Score / noteQuantity)
        const invScore = playScoreRes?.invScore || 0;
        const breakScore = playScoreRes?.breakScore || 0;
        const comboEvents = [];

        for (let i = 0; i < len; i++) {
            const n = notes[i];
            const noteType = n.type;
            const skipT = (n.holdDuration ?? 0) + (n.slideDuration ?? 0) + (n.slideDelay ?? 0) + (n.isMine ? (n.cullSkipExtend ?? 0) : 0);

            let counts = false;
            let finishTime = n.time;

            if (noteType === 'slide') {
                if (n.lastSlide) {
                    counts = true;
                    finishTime = n.time + skipT;
                }
            } else if (noteType === 'hold') {
                counts = true;
                finishTime = n.time + skipT;
            } else if (noteType === 'touch' && n.holdDuration !== undefined) {
                counts = true;
                finishTime = n.time + skipT;
            } else {
                counts = true;
                finishTime = n.time;
            }

            if (counts) {
                const baseWeight = n.isBreak ? 5 : (noteType === 'slide' ? 3 : (n.holdDuration !== undefined ? 2 : 1));
                const scoreInc = (baseWeight * invScore) * 100 + (n.isBreak ? breakScore : 0);
                comboEvents.push({
                    time: finishTime,
                    origIndex: i,
                    isBreak: !!n.isBreak,
                    isHold: !!n.isHold,
                    type: noteType,
                    scoreInc
                });
            }
        }

        comboEvents.sort((a, b) => a.time === b.time ? a.origIndex - b.origIndex : a.time - b.time);

        const evCount = comboEvents.length;
        this._comboTimes = new Float64Array(evCount);
        this._prefixScores = new Float64Array(evCount + 1);
        this._prefixBreak = new Int32Array(evCount + 1);
        this._prefixHold = new Int32Array(evCount + 1);
        this._prefixTap = new Int32Array(evCount + 1);
        this._prefixTouch = new Int32Array(evCount + 1);
        this._prefixSlide = new Int32Array(evCount + 1);

        let curScore = 0;
        let curBreak = 0, curHold = 0, curTap = 0, curTouch = 0, curSlide = 0;

        for (let i = 0; i < evCount; i++) {
            const ev = comboEvents[i];
            this._comboTimes[i] = ev.time;
            curScore += ev.scoreInc;
            if (ev.isBreak) curBreak++;
            else if (ev.isHold) curHold++;
            else if (ev.type === 'slide') curSlide++;
            else if (ev.type === 'touch') curTouch++;
            else curTap++;

            this._prefixScores[i + 1] = curScore;
            this._prefixBreak[i + 1] = curBreak;
            this._prefixHold[i + 1] = curHold;
            this._prefixTap[i + 1] = curTap;
            this._prefixTouch[i + 1] = curTouch;
            this._prefixSlide[i + 1] = curSlide;
        }

        this._canOptimize = isSorted;
    }

    resetAudioFlags(notes, globalTime) {
        const lookAhead = 0.1;
        for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            const skipT = (n.holdDuration ?? 0) + (n.slideDuration ?? 0) + (n.slideDelay ?? 0) + (n.isMine ? (n.cullSkipExtend ?? 0) : 0);
            const startTargetT = n.time + (n.slideDelay ?? 0);
            n._startEffectPlayed = (startTargetT - globalTime <= lookAhead);
            const endTargetT = n.time + skipT;
            n._endEffectPlayed = (endTargetT - globalTime <= lookAhead);
            if (n.time - globalTime > 0 && n._riserActive) {
                n._riserActive = false;
            }
        }
    }

    get(params) {
        if (this.useLegacyScan || !this._canOptimize) {
            return this.getLegacy(params);
        }
        if (this._preparedNotes !== params.notes || this._preparedPlayScoreRes !== params.playScoreRes) {
            this.prepare(params.notes, params.playScoreRes);
            if (!this._canOptimize) {
                return this.getLegacy(params);
            }
        }
        return this.getOptimized(params);
    }

    getOptimized(params) {
        const {
            renderer,
            globalTime,
            realTime,
            musicDelay,
            playing,
            timeControlSliding,
            readyBeat,
            clockBpm = 60,
            playedClock,
            settings = {},
            visualHeight,
            notes = [],
            decodedTags,
            nowIndex,
            skipAudioQueue = false,
            audioManager,
        } = params;

        const validVisualHeight = (typeof visualHeight === 'number' && Number.isFinite(visualHeight)) ? Math.max(0, visualHeight) : 0;
        const zoom = (settings.visualZoom && Number.isFinite(settings.visualZoom) && settings.visualZoom > 0) ? settings.visualZoom : 1;
        const V = validVisualHeight / zoom;
        const effectDecayTime = settings.effectDecayTime;
        const hanabiEffectDecayTime = settings.hanabiEffectDecayTime;
        const maxSlideCount = settings.maxSlideCount;
        const middleDistance = settings.middleDistance;
        const notesLength = notes.length;

        let curNowIndex = nowIndex;
        if (notesLength > 0 && notes[0] && realTime < notes[0].time) {
            curNowIndex = 0;
        } else if (this._nonSlideTimes.length > 0) {
            const targetT = realTime - musicDelay;
            const idx = binarySearchUpperBound(this._nonSlideTimes, targetT) - 1;
            if (idx >= 0) {
                curNowIndex = this._nonSlideIndexes[idx];
            } else {
                curNowIndex = 0;
            }
        }

        // 節拍器邏輯
        if (playing && readyBeat) {
            const effectiveBpm = (clockBpm && clockBpm > 0) ? clockBpm : 60;
            const beatDuration = 240 / effectiveBpm;
            for (let i = 0; i < 4; i++) {
                const clockT = (i / 4) * beatDuration - globalTime;
                if (clockT > 0) {
                    playedClock[i] = false;
                } else if (!playedClock[i]) {
                    audioManager.queueSoundSingle('clock', clockT);
                    playedClock[i] = true;
                }
            }
        }

        // 清空桶子
        this._buckets.slide.length = 0;
        this._buckets.tapnhold.length = 0;
        this._buckets.touch.length = 0;

        this._visualBuckets.slide.length = 0;
        this._visualBuckets.tapnhold.length = 0;
        this._visualBuckets.touch.length = 0;
        this._visualBuckets.tags = decodedTags || [];

        // 二分搜尋取得 Combo / Score / noteQuantity (O(log N))
        const k = binarySearchLowerBound(this._comboTimes, globalTime);
        const playCombo = k;
        const playScore = this._prefixScores[k];
        this._noteQuantity.break = this._prefixBreak[k];
        this._noteQuantity.hold = this._prefixHold[k];
        this._noteQuantity.tap = this._prefixTap[k];
        this._noteQuantity.touch = this._prefixTouch[k];
        this._noteQuantity.slide = this._prefixSlide[k];

        // 倒帶或跳轉時重置狀態
        const isSeekOrRewind = timeControlSliding || Math.abs(globalTime - this._lastGlobalTime) > 0.3 || globalTime < this._lastGlobalTime;
        if (isSeekOrRewind && !skipAudioQueue) {
            this.resetAudioFlags(notes, globalTime);
        }
        this._lastGlobalTime = globalTime;

        // 二分搜尋可見音符視窗區間 [lo, hi)
        const safeV = Number.isFinite(V) ? Math.max(0, V) : 0;
        const searchLo = globalTime - Math.max(this._maxRetain, safeV + this._maxRetain);
        const searchHi = globalTime + Math.max(6, safeV);
        const lo = binarySearchLowerBound(this._noteTimes, searchLo);
        const hi = binarySearchUpperBound(this._noteTimes, searchHi);

        const baseSpeed = settings.speed || 1;
        const baseTouchSpeed = settings.touchSpeed || 1;
        const calcPiecewiseSpeed = (x) => {
            if (x >= 1) return x * 0.8833 + 0.8167;
            if (x <= -1) return x * 0.8833 - 0.8167;
            return x * 1.7;
        };
        const baseSpeedCoeff = calcPiecewiseSpeed(baseSpeed);
        const baseTouchSpeedCoeff = calcPiecewiseSpeed(baseTouchSpeed);

        const buckets = this._buckets;
        const visualBuckets = this._visualBuckets;

        // 僅走訪視窗內音符 (從後往前，維持完全相同的桶子順序)
        for (let i = hi - 1; i >= lo; i--) {
            const note = notes[i];
            const noteT = note.time - globalTime;
            const noteType = note.type;
            const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0) + (note.isMine ? (note.cullSkipExtend ?? 0) : 0);

            const noteHispeed = note.hispeed ?? 1;
            const speedCoeff = noteHispeed === 1 ? baseSpeedCoeff : calcPiecewiseSpeed(baseSpeed * noteHispeed);
            const touchSpeedCoeff = noteHispeed === 1 ? baseTouchSpeedCoeff : calcPiecewiseSpeed(baseTouchSpeed * noteHispeed);

            // 音效和狀態管理
            if (!skipAudioQueue) {
                const lookAhead = 0.1;
                const startTargetT = note.time + (note.slideDelay ?? 0);
                const startNoteT = startTargetT - globalTime;
                const endTargetT = note.time + skipT;
                const endNoteT = endTargetT - globalTime;

                if (playing && !timeControlSliding) {
                    if (noteType === "touch" && note.holdDuration > 0) {
                        const isInsideHold = noteT <= 0 && -noteT < note.holdDuration;
                        const noteId = `riser_${note.pos}_${note.time}`;
                        if (isInsideHold && !note._riserActive) {
                            audioManager.startLongSound(noteId, 'touchHold_riser', -noteT);
                            note._riserActive = true;
                        } else if (!isInsideHold && note._riserActive) {
                            audioManager.stopLongSound(noteId);
                            note._riserActive = false;
                        }
                    }

                    if (startNoteT > lookAhead) {
                        note._startEffectPlayed = false;
                    } else if (startNoteT >= -0.05) {
                        if (!note._startEffectPlayed) {
                            if (!(noteType === "slide" && !note.firstSlide)) {
                                audioManager.queueSound(note, startTargetT);
                            }
                            note._startEffectPlayed = true;
                        }
                    } else {
                        note._startEffectPlayed = true;
                    }

                    if (endNoteT > lookAhead) {
                        note._endEffectPlayed = false;
                    } else if (endNoteT >= -0.05) {
                        if (!note._endEffectPlayed) {
                            const shouldPlayEndSound =
                                (noteType === "slide" && note.lastSlide && note.isBreak) ||
                                note.isHanabi ||
                                (note.holdDuration !== undefined && noteType !== "tap" && !settings.notPlayHoldEnd);
                            if (shouldPlayEndSound) {
                                audioManager.queueSound(note, endTargetT);
                            }
                            note._endEffectPlayed = true;
                        }
                    } else {
                        note._endEffectPlayed = true;
                    }
                } else {
                    if (startNoteT > lookAhead) {
                        note._startEffectPlayed = false;
                    } else {
                        note._startEffectPlayed = true;
                    }
                    if (endNoteT > lookAhead) {
                        note._endEffectPlayed = false;
                    } else {
                        note._endEffectPlayed = true;
                    }
                    if (note.time - globalTime > 0) {
                        if (note._riserActive) {
                            audioManager.stopLongSound(`riser_${note.pos}_${note.time}`);
                            note._riserActive = false;
                        }
                    }
                }
            }

            // 繪製可見性判斷
            const renderSkipT = noteType === 'slide' ? ((note.slideDelay ?? 0) + (note.slideDuration ?? 0) + (note.isMine ? (note.cullSkipExtend ?? 0) : 0)) : skipT;
            const decay = note.isHanabi ? hanabiEffectDecayTime : (noteType === 'slide' ? (note.lastSlide ? effectDecayTime : 0.05) : effectDecayTime);

            let isVisible = false;
            if (-noteT <= renderSkipT + decay && noteT < 6) {
                const t = 1 - renderer.timeFunction(noteT * Math.abs(speedCoeff));
                const touchT = 1 - renderer.timeFunction(noteT * Math.abs(touchSpeedCoeff));

                isVisible =
                    (noteType === "slide" ? t >= middleDistance :
                        noteType === "touch" ? touchT >= -1 :
                            t >= -1);
            }

            const isVisualVisible = noteT >= 0
                ? Math.abs(noteT) <= V
                : -noteT <= V + skipT;

            if (isVisible) {
                if (noteType === 'slide') {
                    buckets.slide.push(note);
                } else if (noteType === 'hold' || noteType === 'tap') {
                    buckets.tapnhold.push(note);
                } else if (noteType === 'touch') {
                    buckets.touch.push(note);
                }
            }

            if (isVisualVisible) {
                if (noteType === 'slide') {
                    visualBuckets.slide.push(note);
                } else if (noteType === 'hold' || noteType === 'tap') {
                    visualBuckets.tapnhold.push(note);
                } else if (noteType === 'touch') {
                    visualBuckets.touch.push(note);
                }
            }
        }

        if (buckets.slide.length > maxSlideCount) {
            buckets.slide.sort((a, b) => (b.time + (b.slideDelay ?? 0)) - (a.time + (a.slideDelay ?? 0)));
            buckets.slide.splice(0, buckets.slide.length - maxSlideCount);
        }

        this._visualBuckets.tags = decodedTags || [];

        this._result.playCombo = playCombo;
        this._result.playScore = playScore;
        this._result.nowIndex = curNowIndex;
        return this._result;
    }

    getLegacy({
        renderer,
        globalTime,
        realTime,
        musicDelay,
        playing,
        timeControlSliding,
        readyBeat,
        clockBpm = 60,
        playedClock,
        settings = {},
        visualHeight,
        notes = [],
        decodedTags,
        playScoreRes,
        nowIndex,
        skipAudioQueue = false,
        audioManager,
    }) {
        const V = visualHeight / settings.visualZoom;
        const effectDecayTime = settings.effectDecayTime;
        const hanabiEffectDecayTime = settings.hanabiEffectDecayTime;
        const maxSlideCount = settings.maxSlideCount;
        const middleDistance = settings.middleDistance;
        const notesLength = notes.length;

        // 初始化 index
        if (notesLength > 0 && notes[0] && realTime < notes[0].time) {
            nowIndex = 0;
        }

        // 節拍器邏輯
        if (playing && readyBeat) {
            const effectiveBpm = (clockBpm && clockBpm > 0) ? clockBpm : 60;
            const beatDuration = 240 / effectiveBpm;
            for (let i = 0; i < 4; i++) {
                const clockT = (i / 4) * beatDuration - globalTime;
                if (clockT > 0) {
                    playedClock[i] = false;
                } else if (!playedClock[i]) {
                    audioManager.queueSoundSingle('clock', clockT);
                    playedClock[i] = true;
                }
            }
        }

        // Clear existing arrays without allocating new ones
        this._buckets.slide.length = 0;
        this._buckets.tapnhold.length = 0;
        this._buckets.touch.length = 0;

        this._visualBuckets.slide.length = 0;
        this._visualBuckets.tapnhold.length = 0;
        this._visualBuckets.touch.length = 0;
        this._visualBuckets.tags.length = 0;

        this._noteQuantity.slide = 0;
        this._noteQuantity.tap = 0;
        this._noteQuantity.hold = 0;
        this._noteQuantity.touch = 0;
        this._noteQuantity.break = 0;

        const buckets = this._buckets;
        const visualBuckets = this._visualBuckets;
        const noteQuantity = this._noteQuantity;

        let playCombo = 0;
        let playScore = 0;
        let foundIndexForThisFrame = false;

        const baseSpeed = settings.speed || 1;
        const baseTouchSpeed = settings.touchSpeed || 1;
        const calcPiecewiseSpeed = (x) => {
            if (x >= 1) return x * 0.8833 + 0.8167;
            if (x <= -1) return x * 0.8833 - 0.8167;
            return x * 1.7;
        };
        const baseSpeedCoeff = calcPiecewiseSpeed(baseSpeed);
        const baseTouchSpeedCoeff = calcPiecewiseSpeed(baseTouchSpeed);

        // 核心音符迴圈
        for (let i = notesLength - 1; i >= 0; i--) {
            const note = notes[i];
            const noteT = note.time - globalTime;
            const noteType = note.type;
            const skipT = (note.holdDuration ?? 0) + (note.slideDuration ?? 0) + (note.slideDelay ?? 0) + (note.isMine ? (note.cullSkipExtend ?? 0) : 0);

            const noteHispeed = note.hispeed ?? 1;
            const speedCoeff = noteHispeed === 1 ? baseSpeedCoeff : calcPiecewiseSpeed(baseSpeed * noteHispeed);
            const touchSpeedCoeff = noteHispeed === 1 ? baseTouchSpeedCoeff : calcPiecewiseSpeed(baseTouchSpeed * noteHispeed);

            // 索引追蹤（早期完成以減少迴圈計算）
            if (!foundIndexForThisFrame && realTime >= (note.time + musicDelay) && noteType !== "slide") {
                nowIndex = note.index ?? nowIndex;
                foundIndexForThisFrame = true;
            }

            // Combo 計算：提前計算避免重複條件檢查
            if (noteT < 0) {
                const shouldCountCombo =
                    (noteType === "slide" ? (note.lastSlide && skipT + noteT < 0) :
                        noteType === "hold" ? (skipT + noteT < 0) :
                            noteType === "touch" && note.holdDuration !== undefined ? (skipT + noteT < 0) :
                                noteType !== "slide");
                if (shouldCountCombo) {
                    if (note.isBreak) {
                        noteQuantity.break++;
                    } else if (note.isHold) {
                        noteQuantity.hold++;
                    } else {
                        noteQuantity[noteType]++;
                    }
                    playCombo++;
                    playScore += ((note.isBreak ? 5 :
                        (noteType === "slide" ? 3 :
                            note.holdDuration !== undefined ? 2 : 1)
                    ) * playScoreRes.invScore) * 100 + (note.isBreak ? playScoreRes.breakScore : 0);
                }
            }

            // 音效和狀態管理
            if (!skipAudioQueue) {
                const lookAhead = 0.1; // 100ms look-ahead
                const startTargetT = note.time + (note.slideDelay ?? 0);
                const startNoteT = startTargetT - globalTime;
                const endTargetT = note.time + skipT;
                const endNoteT = endTargetT - globalTime;

                if (playing && !timeControlSliding) {
                    // Riser 邏輯
                    if (noteType === "touch" && note.holdDuration > 0) {
                        const isInsideHold = noteT <= 0 && -noteT < note.holdDuration;
                        const noteId = `riser_${note.pos}_${note.time}`;
                        if (isInsideHold && !note._riserActive) {
                            audioManager.startLongSound(noteId, 'touchHold_riser', -noteT);
                            note._riserActive = true;
                        } else if (!isInsideHold && note._riserActive) {
                            audioManager.stopLongSound(noteId);
                            note._riserActive = false;
                        }
                    }

                    // 開始音效 (含前瞻，僅在 [-0.05, lookAhead] 視窗內發聲)
                    if (startNoteT > lookAhead) {
                        note._startEffectPlayed = false;
                    } else if (startNoteT >= -0.05) {
                        if (!note._startEffectPlayed) {
                            if (!(noteType === "slide" && !note.firstSlide)) {
                                audioManager.queueSound(note, startTargetT);
                            }
                            note._startEffectPlayed = true;
                        }
                    } else {
                        note._startEffectPlayed = true;
                    }

                    // 結束音效 (含前瞻，僅在 [-0.05, lookAhead] 視窗內發聲)
                    if (endNoteT > lookAhead) {
                        note._endEffectPlayed = false;
                    } else if (endNoteT >= -0.05) {
                        if (!note._endEffectPlayed) {
                            const shouldPlayEndSound =
                                (noteType === "slide" && note.lastSlide && note.isBreak) ||
                                note.isHanabi ||
                                (note.holdDuration !== undefined && noteType !== "tap" && !settings.notPlayHoldEnd);
                            if (shouldPlayEndSound) {
                                audioManager.queueSound(note, endTargetT);
                            }
                            note._endEffectPlayed = true;
                        }
                    } else {
                        note._endEffectPlayed = true;
                    }
                } else {
                    // 倒帶、拖動或暫停時重置狀態
                    if (startNoteT > lookAhead) {
                        note._startEffectPlayed = false;
                    } else {
                        note._startEffectPlayed = true;
                    }
                    if (endNoteT > lookAhead) {
                        note._endEffectPlayed = false;
                    } else {
                        note._endEffectPlayed = true;
                    }
                    if (note.time - globalTime > 0) {
                        if (note._riserActive) {
                            audioManager.stopLongSound(`riser_${note.pos}_${note.time}`);
                            note._riserActive = false;
                        }
                    }
                }
            }

            // 繪製可見性判斷（快速提前剔除過期或太遠的音符，避免不必要的 timeFunction 三次多項式計算）
            const renderSkipT = noteType === 'slide' ? ((note.slideDelay ?? 0) + (note.slideDuration ?? 0) + (note.isMine ? (note.cullSkipExtend ?? 0) : 0)) : skipT;
            const decay = note.isHanabi ? hanabiEffectDecayTime : (noteType === 'slide' ? (note.lastSlide ? effectDecayTime : 0.05) : effectDecayTime);

            let isVisible = false;
            if (-noteT <= renderSkipT + decay && noteT < 6) {
                const t = 1 - renderer.timeFunction(noteT * Math.abs(speedCoeff));
                const touchT = 1 - renderer.timeFunction(noteT * Math.abs(touchSpeedCoeff));

                isVisible =
                    (noteType === "slide" ? t >= middleDistance :
                        noteType === "touch" ? touchT >= -1 :
                            t >= -1);
            }

            const isVisualVisible = noteT >= 0
                ? Math.abs(noteT) <= V
                : -noteT <= V + skipT;

            // 快速分類到桶子
            if (isVisible) {
                if (noteType === 'slide') {
                    buckets.slide.push(note);
                } else if (noteType === 'hold' || noteType === 'tap') {
                    buckets.tapnhold.push(note);
                } else if (noteType === 'touch') {
                    buckets.touch.push(note);
                }
            }

            if (isVisualVisible) {
                if (noteType === 'slide') {
                    visualBuckets.slide.push(note);
                } else if (noteType === 'hold' || noteType === 'tap') {
                    visualBuckets.tapnhold.push(note);
                } else if (noteType === 'touch') {
                    visualBuckets.touch.push(note);
                }
            }
        }

        if (buckets.slide.length > maxSlideCount) {
            // 依據 Slide 實際開始滑動時間 (note.time + slideDelay) 由大到小排序 (時間靠後的在前，時間靠前的在後)
            buckets.slide.sort((a, b) => (b.time + (b.slideDelay ?? 0)) - (a.time + (a.slideDelay ?? 0)));
            // 優先保留時間最靠前 (陣列末尾) 的 maxSlideCount 個 Slide，裁剪掉開頭多餘的靠後 Slide
            buckets.slide.splice(0, buckets.slide.length - maxSlideCount);
        }

        const tagsLength = decodedTags.length;
        for (let i = 0; i < tagsLength; i++) {
            const tag = decodedTags[i];
            visualBuckets.tags.push(tag);
            if (Math.abs(tag.time - globalTime) <= V) {
                // 標籤邏輯保留（如果需要額外處理）
            }
        }

        this._result.playCombo = playCombo;
        this._result.playScore = playScore;
        this._result.nowIndex = nowIndex;
        return this._result;
    }
}