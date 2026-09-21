const FRAME_SEC = 1 / 60;

const JUDGE_WINDOWS = {
    TAP: {
        CRITICAL_PERFECT: 1 * FRAME_SEC,
        PERFECT_2ND: 2 * FRAME_SEC,
        PERFECT_3RD: 3 * FRAME_SEC,
        GREAT_1ST: 4 * FRAME_SEC,
        GREAT_2ND: 5 * FRAME_SEC,
        GREAT_3RD: 6 * FRAME_SEC,
        GOOD: 9 * FRAME_SEC
    },
    TOUCH: {
        FAST_PERFECT: 9 * FRAME_SEC,
        CRITICAL_PERFECT: 9 * FRAME_SEC,
        PERFECT_2ND: 10.5 * FRAME_SEC,
        PERFECT_3RD: 12 * FRAME_SEC,
        GREAT_1ST: 13 * FRAME_SEC,
        GREAT_2ND: 14 * FRAME_SEC,
        GREAT_3RD: 15 * FRAME_SEC,
        GOOD: 18 * FRAME_SEC
    },
    SLIDE: {
        MAX_EXT_SEC: 22 * FRAME_SEC,
        BASE_3RD_PERFECT_SEC: 14 * FRAME_SEC,
        GREAT_1ST_SEC: 21 * FRAME_SEC,
        GREAT_2ND_SEC: 25 * FRAME_SEC,
        GREAT_3RD_SEC: 29 * FRAME_SEC,
        GOOD_AREA_SEC: 36 * FRAME_SEC
    }
};

function evaluateHitGrade(diffSec, note) {
    const isTouch = (note.type === 'touch');
    const isFast = diffSec < 0;
    const absDiff = Math.abs(diffSec);
    const diffMSec = Math.round(diffSec * 1000 * 10) / 10;

    let grade = 'MISS';
    let subGrade = '';
    let scoreMultiplier = 0;

    if (isTouch) {
        const win = JUDGE_WINDOWS.TOUCH;
        if (isFast && absDiff > win.FAST_PERFECT) {
            return null;
        }

        if (absDiff <= win.CRITICAL_PERFECT) {
            grade = 'CRITICAL_PERFECT';
            scoreMultiplier = 1.0;
        } else if (absDiff <= win.PERFECT_3RD) {
            grade = 'PERFECT';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = 1.0;
        } else if (absDiff <= win.GREAT_3RD) {
            grade = 'GREAT';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = 0.8;
        } else if (absDiff <= win.GOOD) {
            grade = 'GOOD';
            subGrade = isFast ? 'FAST' : 'LATE';
            scoreMultiplier = 0.5;
        }
    }

    return { grade, subGrade, isFast, diffMSec, scoreMultiplier };
}

function evaluateSlideGrade(diffSec, note) {
    const isFast = diffSec < 0;
    const absDiff = Math.abs(diffSec);
    const diffMSec = Math.round(diffSec * 1000 * 10) / 10;

    const stayTimeMSec = (note.lastWaitTimeSec ?? (note.slideDuration * (note.tableConst || 0.18))) * 1000;
    const extSec = Math.min(stayTimeMSec / 4000, JUDGE_WINDOWS.SLIDE.MAX_EXT_SEC);

    const PERFECT_3RD_SEC = JUDGE_WINDOWS.SLIDE.BASE_3RD_PERFECT_SEC + extSec;
    const PERFECT_1ST_SEC = PERFECT_3RD_SEC * 0.333333;
    const PERFECT_2ND_SEC = PERFECT_3RD_SEC * 0.666666;

    let grade = 'GOOD';
    let subGrade = isFast ? 'FAST' : 'LATE';
    let scoreMultiplier = 0.5;

    if (absDiff <= PERFECT_1ST_SEC) {
        grade = 'CRITICAL_PERFECT';
        subGrade = '';
        scoreMultiplier = 1.0;
    } else if (absDiff <= PERFECT_3RD_SEC) {
        grade = 'PERFECT';
        subGrade = isFast ? 'FAST' : 'LATE';
        scoreMultiplier = 1.0;
    } else if (absDiff <= JUDGE_WINDOWS.SLIDE.GREAT_3RD_SEC) {
        grade = 'GREAT';
        subGrade = isFast ? 'FAST' : 'LATE';
        scoreMultiplier = 0.8;
    } else {
        grade = 'GOOD';
        subGrade = isFast ? 'FAST' : 'LATE';
        scoreMultiplier = 0.5;
    }

    return { grade, subGrade, isFast, diffMSec, scoreMultiplier };
}

// 測試 Touch 判定
console.log('--- Testing Touch ---');
console.assert(evaluateHitGrade(-0.20, { type: 'touch' }) === null, 'Touch 早按 200ms 不觸發');
const rEarly100 = evaluateHitGrade(-0.10, { type: 'touch' });
console.assert(rEarly100.grade === 'CRITICAL_PERFECT', 'Touch 早按 100ms 應為 CP');
const rLate160 = evaluateHitGrade(0.16, { type: 'touch' });
console.assert(rLate160.grade === 'PERFECT' && rLate160.subGrade === 'LATE', 'Touch 晚按 160ms 應為 Perfect Late');
const rLate280 = evaluateHitGrade(0.28, { type: 'touch' });
console.assert(rLate280.grade === 'GOOD' && rLate280.subGrade === 'LATE', 'Touch 晚按 280ms 應為 Good Late');
const rLate350 = evaluateHitGrade(0.35, { type: 'touch' });
console.assert(rLate350.grade === 'MISS', 'Touch 晚按 350ms 應為 Miss');

// 測試 Slide 判定
console.log('--- Testing Slide ---');
const slideNote = { type: 'slide', slideDuration: 1.0, tableConst: 0.20, lastWaitTimeSec: 0.20 };
const sEarly120 = evaluateSlideGrade(-0.12, slideNote);
console.assert(sEarly120.grade === 'PERFECT' || sEarly120.grade === 'CRITICAL_PERFECT', 'Slide 提前劃完 120ms 應在 Perfect 窗口內');
const sLate400 = evaluateSlideGrade(0.40, slideNote);
console.assert(sLate400.grade === 'GREAT', 'Slide 延後 400ms 應為 Great');
const sLate800 = evaluateSlideGrade(0.80, slideNote);
console.assert(sLate800.grade === 'GOOD', 'Slide 劃完哪怕超過 800ms 仍保底 Good');

console.log('All evaluate checks PASSED!');
