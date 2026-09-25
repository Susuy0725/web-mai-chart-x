import { getSlideJudgeQueue } from '../_play/slidetables.js';

console.log('Running Chain Slide 8qq5pp8 Full Suite...');

function createChainSlide() {
    const seg1 = {
        type: 'slide',
        pos: 8,
        slideEnd: 5,
        slideType: 'qq',
        firstSlide: true,
        lastSlide: false,
        time: 1.0,
        slideDelay: 1.0,
        slideDuration: 1.0,
        unlocked: false,
        slideFinish: false,
        slideProgress: 0,
        prevSlide: null,
        nextSlide: null
    };

    const seg2 = {
        type: 'slide',
        pos: 5,
        slideEnd: 8,
        slideType: 'pp',
        firstSlide: false,
        lastSlide: true,
        time: 1.0,
        slideDelay: 2.0,
        slideDuration: 1.0,
        unlocked: false,
        slideFinish: false,
        slideProgress: 0,
        prevSlide: seg1,
        nextSlide: null
    };
    seg1.nextSlide = seg2;

    const q1 = getSlideJudgeQueue(seg1);
    seg1.judgeQueue = q1.map(a => a.clone());
    seg1._totalAreasCount = seg1.judgeQueue.length;

    const q2 = getSlideJudgeQueue(seg2);
    seg2.judgeQueue = q2.map(a => a.clone());
    seg2._totalAreasCount = seg2.judgeQueue.length;

    return { seg1, seg2 };
}

function forceFinishParentSlide(parent) {
    if (!parent) return;
    parent.slideFinish = true;
    parent.slideProgress = 1;
    parent.judgeQueue = [];
    if (parent.nextSlide) {
        parent.nextSlide.unlocked = true;
    }
    if (parent.prevSlide && !parent.prevSlide.slideFinish) {
        forceFinishParentSlide(parent.prevSlide);
    }
}

function stepSlideFixed(note, currentSensors, globalTime) {
    const isConnPart = !!(note.prevSlide || note.nextSlide);
    const isGroupPartHead = note.firstSlide || !note.prevSlide;
    const isNoteTimeReached = (globalTime >= note.time - 0.05);
    let isCheckable = false;

    if (isConnPart) {
        if (isGroupPartHead) {
            if (isNoteTimeReached || note.unlocked) {
                isCheckable = true;
                note.unlocked = true;
            }
        } else {
            const parentFinished = note.prevSlide ? !!note.prevSlide.slideFinish : true;
            const parentPending = note.prevSlide && note.prevSlide.judgeQueue ? (note.prevSlide.judgeQueue.length <= 1) : false;
            if (parentFinished || parentPending) {
                isCheckable = true;
                if (parentFinished) {
                    note.unlocked = true;
                }
            }
        }
    } else {
        if (isNoteTimeReached || note.unlocked) {
            isCheckable = true;
            note.unlocked = true;
        }
    }

    if (!isCheckable) return;

    if (!note.slideFinish && note.judgeQueue && note.judgeQueue.length > 0) {
        while (note.judgeQueue.length > 0) {
            const first = note.judgeQueue[0];
            const second = note.judgeQueue.length >= 2 ? note.judgeQueue[1] : null;

            first.check(currentSensors);

            let consumed = 0;
            if (second && (first.isSkippable || first.on)) {
                second.check(currentSensors);
                if (second.isFinished) {
                    consumed = 2;
                } else if (second.on) {
                    consumed = 1;
                }
            }

            if (consumed === 0) {
                if (first.isFinished) {
                    consumed = 1;
                }
            }

            if (consumed > 0) {
                note.judgeQueue.splice(0, consumed);
                if (note.prevSlide && !note.prevSlide.slideFinish) {
                    forceFinishParentSlide(note.prevSlide);
                }
                continue;
            }

            if (first.on) {
                if (note.prevSlide && !note.prevSlide.slideFinish) {
                    forceFinishParentSlide(note.prevSlide);
                }
            }
            break;
        }

        if (note._totalAreasCount > 0) {
            const finishedCount = note._totalAreasCount - note.judgeQueue.length;
            note.slideProgress = Math.min(1, Math.max(note.slideProgress || 0, finishedCount / note._totalAreasCount));
        }

        if (note.judgeQueue.length === 0) {
            note.slideFinish = true;
            note.slideProgress = 1;
            if (note.nextSlide) {
                note.nextSlide.unlocked = true;
            }
            if (note.prevSlide && !note.prevSlide.slideFinish) {
                forceFinishParentSlide(note.prevSlide);
            }
        }
    }
}

const { seg1, seg2 } = createChainSlide();
const globalTime = 1.2;

// 1. 劃過 A8 -> B8 -> C -> B5
const steps1 = [
    new Set(['A8']),
    new Set(),
    new Set(['B8']),
    new Set(),
    new Set(['C']),
    new Set(),
    new Set(['B5'])
];
for (const s of steps1) {
    stepSlideFixed(seg1, s, globalTime);
    stepSlideFixed(seg2, s, globalTime);
}

if (seg1.slideFinish) throw new Error('Assertion failed: seg1 should NOT be finished at B5!');
if (seg2.judgeQueue.length !== 10) throw new Error('Assertion failed: seg2 queue should NOT be touched during seg1 first pass!');
if (seg1.judgeQueue.length <= 1) throw new Error('Assertion failed: seg1 should have remaining queue items!');
console.log('✓ Stage 1 Passed: seg1 did not disappear when passing A8-B8-C-B5.');

// 2. 劃完 seg1 剩下的區間
const stepsSeg1End = [
    new Set(), new Set(['A6']),
    new Set(), new Set(['A7']),
    new Set(), new Set(['B8']),
    new Set(), new Set(['C']),
    new Set(), new Set(['B5']),
    new Set(), new Set(['A5'])
];
for (const s of stepsSeg1End) {
    stepSlideFixed(seg1, s, globalTime);
    stepSlideFixed(seg2, s, globalTime);
}

if (!seg1.slideFinish) throw new Error('Assertion failed: seg1 should be finished after reaching A5!');
console.log('✓ Stage 2 Passed: seg1 correctly finished at end of path.');

// 3. 劃 seg2
const stepsSeg2 = [
    new Set(['B5']), new Set(),
    new Set(['C']), new Set(),
    new Set(['B8']), new Set(),
    new Set(['A7']), new Set(),
    new Set(['A6']), new Set(),
    new Set(['B5']), new Set(),
    new Set(['C']), new Set(),
    new Set(['B8']), new Set(),
    new Set(['A8']), new Set()
];
for (const s of stepsSeg2) {
    stepSlideFixed(seg1, s, globalTime);
    stepSlideFixed(seg2, s, globalTime);
}

if (!seg2.slideFinish) throw new Error('Assertion failed: seg2 should be finished!');
console.log('✓ Stage 3 Passed: seg2 completed successfully.');
console.log('All Chain Slide tests PASSED!');
