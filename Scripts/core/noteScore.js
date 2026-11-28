/**
 * 使用各判定對應的整數基礎分數 (Tap/Touch: 500, Hold: 1000, Slide: 1500, Break: 2500 + BreakBonus: 100)
 * 先累計總整數分數後再換算達成率 (%)，避免逐音符比例累加造成浮點精度誤差。
 */

export const NOTE_SCORE_TYPE = Object.freeze({
    TAP: 0,
    HOLD: 1,
    SLIDE: 2,
    BREAK: 3,
    TOUCH: 4,
    BREAK_BONUS: 5,
});

export const NOTE_SCORE_TABLE = Object.freeze({
    [NOTE_SCORE_TYPE.TAP]: Object.freeze({
        CRITICAL_PERFECT: 500,
        PERFECT: 500,
        GREAT: 400,
        GOOD: 250,
        MISS: 0,
    }),
    [NOTE_SCORE_TYPE.HOLD]: Object.freeze({
        CRITICAL_PERFECT: 1000,
        PERFECT: 1000,
        GREAT: 800,
        GOOD: 500,
        MISS: 0,
    }),
    [NOTE_SCORE_TYPE.SLIDE]: Object.freeze({
        CRITICAL_PERFECT: 1500,
        PERFECT: 1500,
        GREAT: 1200,
        GOOD: 750,
        MISS: 0,
    }),
    [NOTE_SCORE_TYPE.BREAK]: Object.freeze({
        CRITICAL_PERFECT: 2500,
        PERFECT: 2500,
        GREAT_1: 2000,
        GREAT_2: 1500,
        GREAT_3: 1250,
        GOOD: 1000,
        MISS: 0,
    }),
    [NOTE_SCORE_TYPE.TOUCH]: Object.freeze({
        CRITICAL_PERFECT: 500,
        PERFECT: 500,
        GREAT: 400,
        GOOD: 250,
        MISS: 0,
    }),
    [NOTE_SCORE_TYPE.BREAK_BONUS]: Object.freeze({
        CRITICAL_PERFECT: 100,
        PERFECT_1: 75,
        PERFECT_2: 50,
        GREAT: 40,
        GOOD: 30,
        MISS: 0,
    }),
});

/**
 * 依據各類音符數量建立整數理論滿分摘要
 * @param {{tap?:number,hold?:number,slide?:number,touch?:number,break?:number}|null} [counts]
 * @returns {{tap:number,hold:number,slide:number,touch:number,break:number,allPerfectScore:number,breakBonusScore:number,score:number}}
 */
export function buildPlayScoreRes(counts = null) {
    const tap = counts?.tap || 0;
    const hold = counts?.hold || 0;
    const slide = counts?.slide || 0;
    const touch = counts?.touch || 0;
    const brk = counts?.break || 0;

    const allPerfectScore =
        tap * NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.TAP].CRITICAL_PERFECT +
        touch * NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.TOUCH].CRITICAL_PERFECT +
        hold * NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.HOLD].CRITICAL_PERFECT +
        slide * NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.SLIDE].CRITICAL_PERFECT +
        brk * NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.BREAK].CRITICAL_PERFECT;

    const breakBonusScore = brk * NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.BREAK_BONUS].CRITICAL_PERFECT;

    return {
        tap,
        hold,
        slide,
        touch,
        break: brk,
        allPerfectScore,
        breakBonusScore,
        score: allPerfectScore,
    };
}

/**
 * 相容僅含 { tap, hold, slide, touch, break } 的物件。
 * @param {Object|null} playScoreRes
 * @returns {{allPerfectScore:number, breakBonusScore:number}}
 */
export function resolvePlayScoreTotals(playScoreRes) {
    if (!playScoreRes) {
        return { allPerfectScore: 0, breakBonusScore: 0 };
    }
    if (Number.isFinite(playScoreRes.allPerfectScore) && Number.isFinite(playScoreRes.breakBonusScore)) {
        return {
            allPerfectScore: playScoreRes.allPerfectScore,
            breakBonusScore: playScoreRes.breakBonusScore,
        };
    }
    const built = buildPlayScoreRes(playScoreRes);
    return {
        allPerfectScore: built.allPerfectScore,
        breakBonusScore: built.breakBonusScore,
    };
}

/**
 * 取得單顆音符的理論滿分 (normalMax 與 bonusMax)。
 * @param {Object} note
 * @returns {{scoreType:number, normalMax:number, bonusMax:number}}
 */
export function getNoteBaseScores(note) {
    if (!note) {
        return { scoreType: NOTE_SCORE_TYPE.TAP, normalMax: 500, bonusMax: 0 };
    }
    if (note.isBreak) {
        return {
            scoreType: NOTE_SCORE_TYPE.BREAK,
            normalMax: NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.BREAK].CRITICAL_PERFECT,
            bonusMax: NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.BREAK_BONUS].CRITICAL_PERFECT,
        };
    }
    if (note.type === 'slide') {
        return {
            scoreType: NOTE_SCORE_TYPE.SLIDE,
            normalMax: NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.SLIDE].CRITICAL_PERFECT,
            bonusMax: 0,
        };
    }
    if (note.type === 'hold' || note.isHold || note.holdDuration !== undefined) {
        return {
            scoreType: NOTE_SCORE_TYPE.HOLD,
            normalMax: NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.HOLD].CRITICAL_PERFECT,
            bonusMax: 0,
        };
    }
    const scoreType = (note.type === 'touch') ? NOTE_SCORE_TYPE.TOUCH : NOTE_SCORE_TYPE.TAP;
    return {
        scoreType,
        normalMax: NOTE_SCORE_TABLE[scoreType].CRITICAL_PERFECT,
        bonusMax: 0,
    };
}

/**
 * 根據音符類型與判定結果，回傳對應整數分數 (normalScore 與 bonusScore)。
 * 若未傳入 judgeResult，預設為最高判定 (All Critical Perfect)。
 * @param {Object} note
 * @param {Object|null} [judgeResult=null]
 * @returns {{normalScore:number, bonusScore:number, normalMax:number, bonusMax:number}}
 */
export function getNoteJudgeScore(note, judgeResult = null) {
    const { scoreType, normalMax, bonusMax } = getNoteBaseScores(note);
    if (!judgeResult) {
        return { normalScore: normalMax, bonusScore: bonusMax, normalMax, bonusMax };
    }

    const grade = judgeResult.grade;
    if (grade === 'MISS') {
        return { normalScore: 0, bonusScore: 0, normalMax, bonusMax };
    }

    if (scoreType === NOTE_SCORE_TYPE.BREAK) {
        const breakTable = NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.BREAK];
        const bonusTable = NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.BREAK_BONUS];
        let normalScore = breakTable.CRITICAL_PERFECT;
        let bonusScore = bonusTable.CRITICAL_PERFECT;

        if (Number.isFinite(judgeResult.normalScore) && Number.isFinite(judgeResult.breakBonus)) {
            return {
                normalScore: judgeResult.normalScore,
                bonusScore: judgeResult.breakBonus,
                normalMax,
                bonusMax,
            };
        }

        if (grade === 'CRITICAL_PERFECT') {
            normalScore = breakTable.CRITICAL_PERFECT;
            bonusScore = bonusTable.CRITICAL_PERFECT;
        } else if (grade === 'PERFECT') {
            normalScore = breakTable.PERFECT;
            if (judgeResult.breakScoreValue === 2500 || judgeResult.breakMultiplier === 0.5) {
                bonusScore = bonusTable.PERFECT_2;
            } else {
                bonusScore = bonusTable.PERFECT_1;
            }
        } else if (grade === 'GREAT') {
            bonusScore = bonusTable.GREAT;
            if (judgeResult.breakScoreValue === 1250 || judgeResult.scoreMultiplier <= 0.5) {
                normalScore = breakTable.GREAT_3;
            } else if (judgeResult.breakScoreValue === 1500 || judgeResult.scoreMultiplier <= 0.6) {
                normalScore = breakTable.GREAT_2;
            } else {
                normalScore = breakTable.GREAT_1;
            }
        } else if (grade === 'GOOD') {
            normalScore = breakTable.GOOD;
            bonusScore = bonusTable.GOOD;
        }
        return { normalScore, bonusScore, normalMax, bonusMax };
    }

    if (Number.isFinite(judgeResult.normalScore)) {
        return {
            normalScore: judgeResult.normalScore,
            bonusScore: 0,
            normalMax,
            bonusMax,
        };
    }

    const tbl = NOTE_SCORE_TABLE[scoreType] || NOTE_SCORE_TABLE[NOTE_SCORE_TYPE.TAP];
    let normalScore = tbl.CRITICAL_PERFECT;
    if (grade === 'GREAT') normalScore = tbl.GREAT;
    else if (grade === 'GOOD') normalScore = tbl.GOOD;
    return { normalScore, bonusScore: 0, normalMax, bonusMax };
}

/**
 * 由已獲得整數分數除以理論滿分換算達成率 (%)。
 * @param {number} earnedNormalScore
 * @param {number} earnedBonusScore
 * @param {number} allPerfectScore
 * @param {number} breakBonusScore
 * @returns {number}
 */
export function calcAchievement(earnedNormalScore, earnedBonusScore, allPerfectScore, breakBonusScore) {
    if (!allPerfectScore || allPerfectScore <= 0) return 0;
    const baseAchv = (earnedNormalScore / allPerfectScore) * 100;
    const bonusAchv = breakBonusScore > 0 ? (earnedBonusScore / breakBonusScore) : 0;
    return baseAchv + bonusAchv;
}

/**
 * 由累計失分整數反算扣分模式達成率 (%)。
 * @param {number} lostNormalScore
 * @param {number} lostBonusScore
 * @param {number} allPerfectScore
 * @param {number} breakBonusScore
 * @returns {number}
 */
export function calcAchievementMinus(lostNormalScore, lostBonusScore, allPerfectScore, breakBonusScore) {
    const maxTotal = (allPerfectScore > 0 ? 100 : 0) + (breakBonusScore > 0 ? 1 : 0);
    if (maxTotal <= 0) return 0;
    const lostBase = allPerfectScore > 0 ? (lostNormalScore / allPerfectScore) * 100 : 0;
    const lostBonus = breakBonusScore > 0 ? (lostBonusScore / breakBonusScore) : 0;
    return Math.max(0, Math.min(maxTotal, maxTotal - (lostBase + lostBonus)));
}
