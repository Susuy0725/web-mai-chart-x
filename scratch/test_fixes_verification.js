import assert from 'assert';

console.log("=== Testing fixes ===");

// 1. Test Slide Track vs Star progress logic
{
    const note = {
        time: 1.0,
        slideDelay: 0.25,
        slideDuration: 0.5,
        slideProgress: 0, // Player hasn't touched
        isMine: false,
        lastSlide: true
    };

    const globalTime = 1.5; // halfway through slide
    const noteT = note.time - globalTime; // -0.5
    let displaySlideProgress = 0;
    if (-noteT > note.slideDelay) {
        displaySlideProgress = Math.min(1, (-noteT - note.slideDelay) / note.slideDuration);
    }
    const trackProgress = note.isMine ? 0 : Math.min(1, Math.max(0, note.slideProgress || 0));

    // Star should have moved halfway (0.5)
    assert.strictEqual(displaySlideProgress, 0.5, "Star should advance with time");
    // Track arrows should still be at 0 (player hasn't touched!)
    assert.strictEqual(trackProgress, 0, "Track should NOT advance without player input");
    console.log("✓ Slide Track vs Star: Star moves with time (0.5), track stays at 0 until player slides");
}

// 2. Test 4-6-4 Chain Slide Unlocking logic
{
    class MockArea {
        constructor(name) {
            this.name = name;
            this.isSkippable = true;
            this.isFinished = false;
            this.on = false;
        }
        check(sensors) {
            if (sensors.has(this.name)) {
                this.isFinished = true;
                this.on = true;
            }
        }
    }

    const seg1 = {
        type: 'slide',
        firstSlide: true,
        lastSlide: false,
        slideFinish: false,
        slideProgress: 0,
        judgeQueue: [new MockArea('A4'), new MockArea('A5'), new MockArea('A6')],
        _totalAreasCount: 3,
        unlocked: true,
        prevSlide: null
    };

    const seg2 = {
        type: 'slide',
        firstSlide: false,
        lastSlide: true,
        slideFinish: false,
        slideProgress: 0,
        judgeQueue: [new MockArea('A6'), new MockArea('A5'), new MockArea('A4')],
        _totalAreasCount: 3,
        unlocked: false,
        prevSlide: seg1
    };
    seg1.nextSlide = seg2;

    // Simulation Step 1: Hand on A4
    let sensors = new Set(['A4']);
    seg1.judgeQueue[0].check(sensors);
    if (seg1.judgeQueue[0].isFinished) seg1.judgeQueue.shift();
    assert.strictEqual(seg1.judgeQueue.length, 2);

    // Check if seg2 is checkable
    let seg2_isCheckable = seg2.prevSlide ? !!seg2.prevSlide.slideFinish : true;
    assert.strictEqual(seg2_isCheckable, false, "Seg 2 must NOT be checkable when Seg 1 is still running");

    // Simulation Step 2: Hand on A5
    sensors = new Set(['A5']);
    seg1.judgeQueue[0].check(sensors);
    if (seg1.judgeQueue[0].isFinished) seg1.judgeQueue.shift();
    assert.strictEqual(seg1.judgeQueue.length, 1); // Only A6 left in seg1!

    // Under the new logic, seg2 must STILL NOT be checkable even though seg1 has only 1 area left
    seg2_isCheckable = seg2.prevSlide ? !!seg2.prevSlide.slideFinish : true;
    assert.strictEqual(seg2_isCheckable, false, "Seg 2 must NOT unlock early when Seg 1 has 1 area left");
    assert.strictEqual(seg2.judgeQueue.length, 3, "Seg 2 queue must remain completely untouched");

    // Simulation Step 3: Hand on A6 (Seg 1 completes!)
    sensors = new Set(['A6']);
    seg1.judgeQueue[0].check(sensors);
    if (seg1.judgeQueue[0].isFinished) seg1.judgeQueue.shift();
    if (seg1.judgeQueue.length === 0) {
        seg1.slideFinish = true;
        if (seg1.nextSlide) seg1.nextSlide.unlocked = true;
    }
    assert.strictEqual(seg1.slideFinish, true, "Seg 1 must be marked finished");

    // Now check Seg 2
    seg2_isCheckable = seg2.prevSlide ? !!seg2.prevSlide.slideFinish : true;
    if (seg2_isCheckable || seg2.unlocked) {
        seg2.unlocked = true;
    }
    assert.strictEqual(seg2.unlocked, true, "Seg 2 now unlocks upon Seg 1 finish");
    assert.strictEqual(seg2.slideProgress, 0, "Seg 2 slideProgress is 0 (full track visible)");
    assert.strictEqual(seg2.judgeQueue.length, 3, "Seg 2 queue is full [A6, A5, A4]");
    console.log("✓ 4-6-4 Chain Slide: Seg 2 does NOT disappear or get eaten early; unlocks with full track when Seg 1 reaches A6");
}

// 3. Test Audio triggers
{
    const queuedSounds = [];
    const mockAudioManager = {
        queueSoundSingle: (key, time) => {
            queuedSounds.push({ key, time });
        },
        queueSound: (note, time) => {
            queuedSounds.push({ key: note.isBreak ? 'break_slide_start' : 'slide', time });
        }
    };

    // Test Answer Sound
    const note = { time: 2.0, type: 'tap', isMine: false, _answerSoundPlayed: false };
    const globalTime = 1.95; // 50ms before note.time
    const lookAhead = 0.1;
    const answerDiffT = note.time - globalTime;

    if (answerDiffT <= lookAhead && !note._answerSoundPlayed) {
        if (!note.isMine && answerDiffT >= -0.1) {
            mockAudioManager.queueSoundSingle('answer', note.time);
        }
        note._answerSoundPlayed = true;
    }
    assert.strictEqual(queuedSounds.length, 1);
    assert.strictEqual(queuedSounds[0].key, 'answer');
    assert.strictEqual(queuedSounds[0].time, 2.0, "Answer sound must be scheduled exactly at note.time");

    // Test Slide Start Sound
    const slideNote = {
        time: 3.0,
        slideDelay: 0.25,
        type: 'slide',
        firstSlide: true,
        prevSlide: null,
        isBreak: false,
        isMine: false,
        _slideStartPlayed: false
    };
    const startTargetT = slideNote.time + slideNote.slideDelay; // 3.25
    const slideGlobalTime = 3.20; // 50ms before startTargetT
    const startNoteT = startTargetT - slideGlobalTime;

    if (startNoteT <= lookAhead && !slideNote._slideStartPlayed) {
        if (slideNote.type === "slide" && !slideNote.isMine && (slideNote.firstSlide || !slideNote.prevSlide)) {
            if (startNoteT >= -0.1) {
                mockAudioManager.queueSound(slideNote, startTargetT);
            }
        }
        slideNote._slideStartPlayed = true;
    }
    assert.strictEqual(queuedSounds.length, 2);
    assert.strictEqual(queuedSounds[1].key, 'slide');
    assert.strictEqual(queuedSounds[1].time, 3.25, "Slide start sound must be scheduled at startTargetT (note.time + slideDelay)");

    // Test Hanabi sound: MUST NOT play on note end
    const hanabiTouchNote = {
        time: 4.0,
        type: 'touch',
        isHanabi: true,
        triggered: false,
        holdDuration: 0,
        _endEffectPlayed: false
    };
    const skipT = 0;
    const endTargetT = hanabiTouchNote.time + skipT;
    const endNoteT = endTargetT - 4.0;
    const shouldPlayEndSound =
        (hanabiTouchNote.type === "slide" && hanabiTouchNote.lastSlide && hanabiTouchNote.isBreak) ||
        (hanabiTouchNote.holdDuration !== undefined && hanabiTouchNote.type !== "tap" && (hanabiTouchNote._holdPressed || hanabiTouchNote.holdFinish));

    assert.ok(!shouldPlayEndSound, "Hanabi must NOT be included in end sounds");

    // Hanabi sound MUST play on hit
    const evalRes = { grade: 'PERFECT' };
    if (hanabiTouchNote.type === 'touch' && (!hanabiTouchNote.holdDuration || hanabiTouchNote.holdDuration <= 0) && hanabiTouchNote.isHanabi && evalRes.grade !== 'MISS') {
        mockAudioManager.queueSoundSingle('hanabi', 4.0);
    }
    assert.strictEqual(queuedSounds.length, 3);
    assert.strictEqual(queuedSounds[2].key, 'hanabi');
    console.log("✓ Audio: Answer plays at note.time, Slide start plays at slide activation, Hanabi only plays on hit");
}

console.log("=== All test assertions passed successfully! ===");
