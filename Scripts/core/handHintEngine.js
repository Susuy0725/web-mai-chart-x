/**
 * handHintEngine.js
 * maimai 手順推算與虛擬雙手游標軌跡引擎（純 JS，零 DOM 依賴，支援 Web Worker）
 */

import { scaleBase, innerCirleBase, noteRefPos, touchRefPos } from './chartGeometry.js';

export const HAND_COLORS = {
    L: {
        main: '#38bdf8',
        border: '#0284c7',
        badgeFill: 'rgba(14, 165, 233, 0.92)',
        glow: 'rgba(56, 189, 248, 0.45)',
    },
    R: {
        main: '#fb7185',
        border: '#e11d48',
        badgeFill: 'rgba(244, 63, 94, 0.92)',
        glow: 'rgba(251, 113, 133, 0.45)',
    },
    BOTH: {
        main: '#a855f7',
        border: '#7e22ce',
        badgeFill: 'rgba(147, 51, 234, 0.92)',
        glow: 'rgba(168, 85, 247, 0.45)',
    },
};

const REST_POS = {
    L: { x: -0.28 * scaleBase, y: 0.22 * scaleBase },
    R: { x: 0.28 * scaleBase, y: 0.22 * scaleBase },
};

const clampVal = (v, min, max) => (v < min ? min : (v > max ? max : v));

const easeInOutCubic = (t) => {
    const x = clampVal(t, 0, 1);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/**
 * 取得音符或 Slide 目標在畫布空間 (scaleBase = 100, 原點在圓心) 的座標
 * @param {Object|number|string} noteOrPos
 * @returns {{ x: number, y: number }}
 */
export function getNoteScreenPos(noteOrPos) {
    if (noteOrPos && typeof noteOrPos === 'object') {
        if (noteOrPos.touchPos) {
            const tp = noteOrPos.touchPos;
            if (tp === 'C') {
                return { x: touchRefPos.C[0].x, y: touchRefPos.C[0].y };
            }
            const group = touchRefPos[tp];
            const idx = (noteOrPos.pos || 1) - 1;
            if (group && group[idx]) {
                return { x: group[idx].x, y: group[idx].y };
            }
            return { x: 0, y: 0 };
        }
        const pos = parseInt(noteOrPos.pos, 10);
        if (pos >= 1 && pos <= 8 && noteRefPos[pos - 1]) {
            return { x: noteRefPos[pos - 1].x, y: noteRefPos[pos - 1].y };
        }
        return { x: 0, y: 0 };
    }

    if (typeof noteOrPos === 'number') {
        const idx = noteOrPos - 1;
        if (idx >= 0 && idx < 8 && noteRefPos[idx]) {
            return { x: noteRefPos[idx].x, y: noteRefPos[idx].y };
        }
        return { x: 0, y: 0 };
    }

    if (typeof noteOrPos === 'string') {
        const trimmed = noteOrPos.trim().toUpperCase();
        if (trimmed === 'C' || trimmed === 'C1' || trimmed === 'C2') {
            return { x: 0, y: 0 };
        }
        const touchMatch = trimmed.match(/^([ABCDE])([1-8])$/);
        if (touchMatch) {
            const group = touchRefPos[touchMatch[1]];
            const idx = parseInt(touchMatch[2], 10) - 1;
            if (group && group[idx]) {
                return { x: group[idx].x, y: group[idx].y };
            }
        }
        const num = parseInt(trimmed, 10);
        if (num >= 1 && num <= 8 && noteRefPos[num - 1]) {
            return { x: noteRefPos[num - 1].x, y: noteRefPos[num - 1].y };
        }
    }

    return { x: 0, y: 0 };
}

/**
 * 依據 SlideTables WiFi 分支幾何分類 wPaths 中的左右翼軌跡
 * wPaths.w1 終點為 (end - 2 + 8) % 8，wPaths.w2 終點為 end % 8
 * 比較兩翼終點的 X 座標並輔以當前雙手距離，選出左手軌跡與右手軌跡
 */
function resolveWifiWingPaths(slideNote, stateL, stateR) {
    const w1 = slideNote.wPaths?.w1 || null;
    const w2 = slideNote.wPaths?.w2 || null;
    if (!w1 || !w2) {
        return {
            wLeftPath: w1 || slideNote.path || null,
            wRightPath: w2 || slideNote.path || null,
        };
    }

    const p1 = typeof w1.getPointAt === 'function' ? w1.getPointAt(1) : null;
    const p2 = typeof w2.getPointAt === 'function' ? w2.getPointAt(1) : null;
    if (p1 && p2) {
        if (Math.abs(p1.x - p2.x) > 1.5) {
            return (p1.x < p2.x)
                ? { wLeftPath: w1, wRightPath: w2 }
                : { wLeftPath: w2, wRightPath: w1 };
        }
        // 若兩翼終點水平幾乎重疊 (如 3w7 或 7w3)，依當前雙手位置就近配對
        const dist1L2R = Math.hypot(p1.x - stateL.x, p1.y - stateL.y) + Math.hypot(p2.x - stateR.x, p2.y - stateR.y);
        const dist2L1R = Math.hypot(p2.x - stateL.x, p2.y - stateL.y) + Math.hypot(p1.x - stateR.x, p1.y - stateR.y);
        return (dist1L2R <= dist2L1R)
            ? { wLeftPath: w1, wRightPath: w2 }
            : { wLeftPath: w2, wRightPath: w1 };
    }

    return { wLeftPath: w1, wRightPath: w2 };
}

function cloneHandState(s) {
    return { x: s.x, y: s.y, time: s.time, lockUntil: s.lockUntil };
}

function getPosKey(n) {
    return n.touchPos ? `${n.touchPos}${n.touchPos === 'C' ? '' : n.pos}` : String(n.pos);
}

/**
 * 取得單一外圈 Tap/Star 音符鍵位 (1~8)；若含同時音符、Slide 或 Touch/Hold 則回傳 null
 */
function getSingleOuterButtonPos(step) {
    if (!step || step.slideItems.length > 0) return null;
    const activeHeads = step.headItems.filter(it => !it.note.isMine || it.note.manualHand);
    if (activeHeads.length !== 1) return null;
    const n = activeHeads[0].note;
    if (!n || n.touchPos || n.type === 'hold' || n.holdDuration) return null;
    const pos = parseInt(n.pos, 10);
    return (pos >= 1 && pos <= 8) ? pos : null;
}

/**
 * 預先標記單向圓周刷鍵區段（如 1,2,3,4,5,6,7,8 或 8,7,6,5,4,3,2,1）
 * 排除來回折返的交互（如 1,2,1,2 或 1,2,1,8）
 */
function markCircularSweepSteps(timelineSteps) {
    const len = timelineSteps.length;
    if (len < 3) return;

    const singlePositions = new Array(len);
    for (let i = 0; i < len; i++) {
        singlePositions[i] = getSingleOuterButtonPos(timelineSteps[i]);
    }

    const transDirs = new Int8Array(len); // 1: 順時針(+1), -1: 逆時針(-1), 0: 非單向相鄰
    for (let i = 1; i < len; i++) {
        const pPrev = singlePositions[i - 1];
        const pCur = singlePositions[i];
        if (pPrev === null || pCur === null) continue;
        const dt = timelineSteps[i].time - timelineSteps[i - 1].time;
        if (dt < 0.015 || dt > 0.22) continue;
        const diff = (pCur - pPrev + 8) % 8;
        if (diff === 1) {
            transDirs[i] = 1;
        } else if (diff === 7) {
            transDirs[i] = -1;
        }
    }

    let i = 1;
    while (i < len) {
        const dir = transDirs[i];
        if (dir === 0) {
            i++;
            continue;
        }
        const segStart = i;
        while (i + 1 < len && transDirs[i + 1] === dir) {
            i++;
        }
        const segEnd = i;
        const runLen = segEnd - segStart + 1; // 連續同向轉移次數（音符數 = runLen + 1）
        const runStart = segStart - 1;

        let isSweep = false;
        if (runLen >= 3) {
            // 連續 4 顆及以上同向相鄰外鍵 (如 1,2,3,4 或 1,2,3,4,5,6,7,8)
            isSweep = true;
        } else if (runLen === 2) {
            // 連續 3 顆高速同向相鄰外鍵，且前後未立刻出現反向折返（避免誤判 1,2,1,8,1,2,1,8）
            const avgDt = (timelineSteps[segEnd].time - timelineSteps[runStart].time) / 2;
            const prevRev = transDirs[runStart] === -dir;
            const nextRev = (segEnd + 1 < len) && transDirs[segEnd + 1] === -dir;
            if (avgDt <= 0.13 && !prevRev && !nextRev) {
                isSweep = true;
            }
        }

        if (isSweep) {
            timelineSteps[runStart].sweepStartDir = dir;
            for (let k = segStart; k <= segEnd; k++) {
                timelineSteps[k].isSweepContinuation = true;
                timelineSteps[k].sweepDir = dir;
            }
        }
        i = segEnd + 1;
    }
}

/**
 * 評估將單一擊打動作分配給指定手 ('L' | 'R') 的成本與更新後狀態
 */
function scoreAndApplyAction(dpState, hand, nx, ny, actionTime, opts) {
    const {
        endTime,
        lockUntil,
        endX = nx,
        endY = ny,
        isSingleHead = false,
        posKey = null,
        allowLock = true,
        isSlide = false,
        handAtStartPos = null,
        usedHandsOtherPos = null,
        starHeadHand = null,
        isSweepContinuation = false,
        sweepStartDir = 0,
    } = opts;

    const st = hand === 'L' ? dpState.stateL : dpState.stateR;
    const otherSt = hand === 'L' ? dpState.stateR : dpState.stateL;
    let deltaCost = 0;

    // 1. Hold / Slide 佔用鎖定懲罰
    if (allowLock && st.lockUntil > actionTime + 0.015) {
        deltaCost += 600;
    }

    // 2. 同一時間步的頭音符 / 星星頭與滑軌一致性檢查
    if (isSlide) {
        if (handAtStartPos === hand) {
            // 剛用同手擊打此位置的音符，緊接著順手滑出，幾乎無成本
            deltaCost -= 25;
        } else if (usedHandsOtherPos && usedHandsOtherPos.has(hand)) {
            // 同一步中該手在別的位置敲音符，不可分身同時滑此軌
            deltaCost += 700;
        }
        if (starHeadHand) {
            if (starHeadHand === hand && !(usedHandsOtherPos && usedHandsOtherPos.has(hand))) {
                // 保持滑軌與對應星星頭為同一隻手
                deltaCost -= 60;
            } else if (starHeadHand !== hand) {
                deltaCost += 40;
            }
        }
    }

    // 3. 移動距離與二次大幅跨動懲罰
    const dNorm = Math.hypot(nx - st.x, ny - st.y) / innerCirleBase;
    const dt = Math.max(0.025, actionTime - st.time);
    const distCost = (isSweepContinuation && dpState.lastHand === hand)
        ? (8 * dNorm)
        : (25 * dNorm + 45 * (dNorm * dNorm));
    deltaCost += distCost;

    // 4. 刷鍵延續 / 移動速度成本 / 防交互單手
    if (isSweepContinuation) {
        if (dpState.lastHand === hand) {
            // 單向圓周刷鍵 (如 1,2,3,4,5,6,7,8)：獎勵同手順刷，不施加異鍵高速連打懲罰
            deltaCost -= 140;
        } else if (dpState.lastHand && dpState.lastHand !== hand) {
            // 嚴懲在刷鍵中途換手 (防止出現 L, R, L, R, L, R)
            deltaCost += 180;
        }
    } else if (!isSlide) {
        if (sweepStartDir === 1 && hand === 'R') {
            deltaCost -= 15;
        } else if (sweepStartDir === -1 && hand === 'L') {
            deltaCost -= 15;
        }

        if (dpState.lastHand === hand && dpState.lastActionTime > -9) {
            const dtPrev = Math.max(0.025, actionTime - dpState.lastActionTime);
            if (dtPrev < 0.48) {
                if (dNorm > 0.05) {
                    // 異鍵位高速連打：嚴懲同手跳鍵（如 1,2,1,2 或 1,2,1,8）
                    const dtEff = Math.max(0.02, dtPrev - 0.06);
                    const vel = dNorm / dtEff;
                    deltaCost += (115 / Math.max(0.08, dtPrev)) + 55 * vel;
                } else {
                    // 同鍵位連打（例如 {4}1-5[4:1],1,）：中慢速保持同手不亂換手
                    if (dtPrev >= 0.11) {
                        deltaCost -= 35;
                    } else {
                        // 超高速同鍵縱連傾向交替
                        deltaCost += 40;
                    }
                }
            }
        } else if (dpState.lastHand && dpState.lastHand !== hand) {
            // 換手時只需考量該手自身的準備距離與可用時間
            deltaCost += 22 * (dNorm / Math.min(0.8, dt));
        }
    }

    // 5. 溫和半場自然偏好 & 6. 雙手交叉懲罰（單向刷鍵延續時豁免，允許單手順刷跨半場）
    if (!(isSweepContinuation && dpState.lastHand === hand)) {
        const refX = isSlide ? (0.4 * nx + 0.6 * endX) : nx;
        const deadZone = 0.05 * innerCirleBase;
        const halfWeight = isSlide ? 18 : 14;
        if (hand === 'L' && refX > deadZone) {
            deltaCost += halfWeight * (refX / innerCirleBase);
        } else if (hand === 'R' && refX < -deadZone) {
            deltaCost += halfWeight * (-refX / innerCirleBase);
        }

        if (actionTime - otherSt.time < 0.9) {
            const crossX = isSlide ? endX : nx;
            if (hand === 'L' && crossX > otherSt.x + 2) {
                deltaCost += 38 * ((crossX - otherSt.x) / innerCirleBase);
            } else if (hand === 'R' && crossX < otherSt.x - 2) {
                deltaCost += 38 * ((otherSt.x - crossX) / innerCirleBase);
            }
        }
    }

    // 更新狀態
    const nextL = cloneHandState(dpState.stateL);
    const nextR = cloneHandState(dpState.stateR);
    const targetSt = hand === 'L' ? nextL : nextR;
    targetSt.time = Math.max(targetSt.time, endTime);
    targetSt.lockUntil = Math.max(targetSt.lockUntil, lockUntil);
    targetSt.x = endX;
    targetSt.y = endY;

    return {
        stateL: nextL,
        stateR: nextR,
        lastHand: (isSingleHead || isSweepContinuation) ? hand : dpState.lastHand,
        lastActionTime: (isSingleHead || isSweepContinuation) ? actionTime : dpState.lastActionTime,
        lastPosKey: (isSingleHead || isSweepContinuation) ? posKey : dpState.lastPosKey,
        cost: dpState.cost + deltaCost,
    };
}

/**
 * 自動推算譜面中每顆音符的左右手順 ('L' | 'R' | 'BOTH')
 * 特性：
 *  - 將 Slide 拆分為「星星頭擊打 (t = note.time)」與「滑動啟動 (t = note.time + slideDelay)」兩階段
 *  - 在 slideDelay 到達前手部自由，同鍵後續音符 (如 {4}1-5[4:1],1,) 不會誤換手
 *  - 使用束搜尋動態規劃 (Beam Search DP) 與移動速度/距離成本，防止單手連打交互 (如 1,2,1,2 或 1,2,1,8) 與大幅跨動
 *  - w slide (WiFi) 自動指派為雙手同時滑動 ('BOTH')，左右手各走左右翼軌跡
 * @param {Array<Object>} notes
 * @returns {Array<Object>}
 */
export function computeHandAssignments(notes) {
    if (!Array.isArray(notes) || notes.length === 0) return notes;

    // 1. 建構依實際動作時間排序的動作事件，並建立 Slide 連鎖父子索引
    const actionItems = [];
    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (!n) continue;
        if (n.type === 'slide') {
            actionItems.push({
                kind: 'slide',
                actionTime: n.time + (n.slideDelay || 0),
                order: 1,
                note: n,
            });
        } else {
            const pt = getNoteScreenPos(n);
            actionItems.push({
                kind: 'note',
                actionTime: n.time,
                order: 0,
                note: n,
                nx: pt.x,
                ny: pt.y,
            });
        }
    }

    actionItems.sort((a, b) => (a.actionTime - b.actionTime) || (a.order - b.order));

    // 2. 分組為時間步 timelineSteps
    const timelineSteps = [];
    let idx = 0;
    while (idx < actionItems.length) {
        const stepTime = actionItems[idx].actionTime;
        const headItems = [];
        const slideItems = [];
        let endIdx = idx;
        while (endIdx < actionItems.length && Math.abs(actionItems[endIdx].actionTime - stepTime) < 0.005) {
            const item = actionItems[endIdx];
            if (item.kind === 'slide') {
                slideItems.push(item.note);
            } else {
                headItems.push(item);
            }
            endIdx++;
        }
        timelineSteps.push({ time: stepTime, headItems, slideItems });
        idx = endIdx;
    }

    // 2.5 預先標記單向圓周刷鍵區段
    markCircularSweepSteps(timelineSteps);

    // 3. 執行束搜尋動態規劃 (Beam Search DP, B = 8)
    const BEAM_WIDTH = 8;
    let beam = [{
        stateL: { x: REST_POS.L.x, y: REST_POS.L.y, time: -10, lockUntil: -10 },
        stateR: { x: REST_POS.R.x, y: REST_POS.R.y, time: -10, lockUntil: -10 },
        lastHand: null,
        lastActionTime: -10,
        lastPosKey: null,
        activeChains: [], // [{ index, baseTime, hand, endTime }]
        recentStarHeads: [], // [{ time, pos, hand }]
        cost: 0,
        prevNode: null,
        stepAssignments: null, // [{ note, hand, wLeftPath, wRightPath }]
    }];

    for (let sIdx = 0; sIdx < timelineSteps.length; sIdx++) {
        const step = timelineSteps[sIdx];
        const stepTime = step.time;
        const activeHeads = step.headItems.filter(it => !it.note.isMine || it.note.manualHand);
        const mineHeads = step.headItems.filter(it => it.note.isMine && !it.note.manualHand);

        const nextBeam = [];

        for (const baseState of beam) {
            // 先產生此步的 headItems 手順候補組合
            let headCombinations = [];
            if (activeHeads.length === 0) {
                headCombinations = [{
                    assignments: [],
                    nextState: baseState,
                }];
            } else if (activeHeads.length === 1) {
                const it = activeHeads[0];
                const n = it.note;
                const candidateHands = n.manualHand ? [n.manualHand] : ['L', 'R'];
                const isHold = n.type === 'hold' || (n.type === 'touch' && n.holdDuration);
                const endTime = isHold ? (n.time + (n.holdDuration || 0)) : n.time;
                const lockUntil = isHold ? endTime : -10;

                for (const h of candidateHands) {
                    const updated = scoreAndApplyAction(baseState, h, it.nx, it.ny, stepTime, {
                        endTime,
                        lockUntil,
                        isSingleHead: true,
                        posKey: getPosKey(n),
                        isSweepContinuation: Boolean(step.isSweepContinuation),
                        sweepStartDir: step.sweepStartDir || 0,
                    });
                    headCombinations.push({
                        assignments: [{ note: n, hand: h, nx: it.nx, ny: it.ny }],
                        nextState: {
                            ...baseState,
                            ...updated,
                        },
                    });
                }
            } else if (activeHeads.length === 2) {
                const a = activeHeads[0];
                const b = activeHeads[1];
                const pairs = [];
                if (a.note.manualHand && b.note.manualHand) {
                    pairs.push([a.note.manualHand, b.note.manualHand]);
                } else if (a.note.manualHand) {
                    pairs.push([a.note.manualHand, a.note.manualHand === 'L' ? 'R' : 'L']);
                } else if (b.note.manualHand) {
                    pairs.push([b.note.manualHand === 'L' ? 'R' : 'L', b.note.manualHand]);
                } else {
                    pairs.push(['L', 'R'], ['R', 'L']);
                }

                for (const [hA, hB] of pairs) {
                    const applyOne = (st, item, h) => {
                        const isHold = item.note.type === 'hold' || (item.note.type === 'touch' && item.note.holdDuration);
                        const endTime = isHold ? (item.note.time + (item.note.holdDuration || 0)) : item.note.time;
                        const lockUntil = isHold ? endTime : -10;
                        const u = scoreAndApplyAction(st, h, item.nx, item.ny, stepTime, {
                            endTime,
                            lockUntil,
                            isSingleHead: false,
                        });
                        return { ...st, ...u };
                    };

                    // 交叉雙押防呆成本
                    let crossChordPenalty = 0;
                    if (hA === 'L' && hB === 'R' && a.nx > b.nx + 3) {
                        crossChordPenalty = 180 * ((a.nx - b.nx) / innerCirleBase);
                    } else if (hA === 'R' && hB === 'L' && b.nx > a.nx + 3) {
                        crossChordPenalty = 180 * ((b.nx - a.nx) / innerCirleBase);
                    }

                    let st1 = applyOne(baseState, a, hA);
                    let st2 = applyOne(st1, b, hB);
                    st2.cost += crossChordPenalty;
                    st2.lastHand = null; // 雙押後重置單手交替記錄，避免影響下一拍選雙手任一側

                    headCombinations.push({
                        assignments: [
                            { note: a.note, hand: hA, nx: a.nx, ny: a.ny },
                            { note: b.note, hand: hB, nx: b.nx, ny: b.ny },
                        ],
                        nextState: st2,
                    });
                }
            } else {
                // >= 3 押：依半場指派
                let stCur = baseState;
                const assigns = [];
                for (const item of activeHeads) {
                    const h = item.note.manualHand || (item.nx < 0 ? 'L' : 'R');
                    const isHold = item.note.type === 'hold' || (item.note.type === 'touch' && item.note.holdDuration);
                    const endTime = isHold ? (item.note.time + (item.note.holdDuration || 0)) : item.note.time;
                    const lockUntil = isHold ? endTime : -10;
                    const u = scoreAndApplyAction(stCur, h, item.nx, item.ny, stepTime, {
                        endTime,
                        lockUntil,
                        isSingleHead: false,
                    });
                    stCur = { ...stCur, ...u };
                    assigns.push({ note: item.note, hand: h, nx: item.nx, ny: item.ny });
                }
                stCur.lastHand = null;
                headCombinations.push({ assignments: assigns, nextState: stCur });
            }

            // 加入地雷預設標記（不影響手部物理狀態）
            const mineAssigns = mineHeads.map(it => ({
                note: it.note,
                hand: it.nx < -1 ? 'L' : 'R',
            }));

            // 接著將同時間步的 slideItems 套用上去
            for (const combo of headCombinations) {
                const nextStarHeads = (baseState.recentStarHeads || []).filter(sh => sh.time >= stepTime - 2.5);
                for (const a of combo.assignments) {
                    if (a.note.isStar && (a.hand === 'L' || a.hand === 'R')) {
                        nextStarHeads.push({ time: a.note.time, pos: a.note.pos, hand: a.hand });
                    }
                }

                let branchPool = [{
                    state: combo.nextState,
                    chains: (baseState.activeChains || []).filter(c => c.endTime > stepTime - 0.05),
                    assigns: [...combo.assignments, ...mineAssigns],
                    slideEndHands: [],
                }];

                for (const s of step.slideItems) {
                    const nextPool = [];
                    const startPt = (s.path && typeof s.path.getPointAt === 'function')
                        ? s.path.getPointAt(0)
                        : getNoteScreenPos(s.pos);
                    const endPt = (s.path && typeof s.path.getPointAt === 'function')
                        ? s.path.getPointAt(1)
                        : getNoteScreenPos(s.slideEnd || s.pos);
                    const sx = startPt ? startPt.x : 0;
                    const sy = startPt ? startPt.y : 0;
                    const ex = endPt ? endPt.x : sx;
                    const ey = endPt ? endPt.y : sy;
                    const slideEnd = s.time + (s.slideDelay || 0) + (s.slideDuration || 0);

                    if (s.isMine && !s.manualHand) {
                        for (const p of branchPool) {
                            nextPool.push({
                                ...p,
                                assigns: [...p.assigns, { note: s, hand: sx < -1 ? 'L' : 'R' }],
                            });
                        }
                        branchPool = nextPool;
                        continue;
                    }

                    // w slide (WiFi)：預設雙手同時接取並各自沿左右兩翼滑開
                    if (s.slideType === 'w' && !s.manualHand) {
                        for (const p of branchPool) {
                            const { wLeftPath, wRightPath } = resolveWifiWingPaths(s, p.state.stateL, p.state.stateR);
                            const wLEnd = (wLeftPath && typeof wLeftPath.getPointAt === 'function') ? wLeftPath.getPointAt(1) : endPt;
                            const wREnd = (wRightPath && typeof wRightPath.getPointAt === 'function') ? wRightPath.getPointAt(1) : endPt;

                            // 檢查同時間步是否有單手頭音符已經佔用雙手之一（與起點相同則順勢滑出，不同則扣分）
                            let penalty = 0;
                            if (p.state.stateL.lockUntil > stepTime + 0.015) penalty += 350;
                            if (p.state.stateR.lockUntil > stepTime + 0.015) penalty += 350;
                            for (const a of combo.assignments) {
                                const d = Math.hypot(a.nx - sx, a.ny - sy);
                                if (d > 0.08 * innerCirleBase) {
                                    penalty += 500;
                                }
                            }

                            const nextL = {
                                x: wLEnd ? wLEnd.x : ex,
                                y: wLEnd ? wLEnd.y : ey,
                                time: Math.max(p.state.stateL.time, slideEnd),
                                lockUntil: Math.max(p.state.stateL.lockUntil, slideEnd),
                            };
                            const nextR = {
                                x: wREnd ? wREnd.x : ex,
                                y: wREnd ? wREnd.y : ey,
                                time: Math.max(p.state.stateR.time, slideEnd),
                                lockUntil: Math.max(p.state.stateR.lockUntil, slideEnd),
                            };

                            nextPool.push({
                                state: {
                                    ...p.state,
                                    stateL: nextL,
                                    stateR: nextR,
                                    lastHand: null,
                                    cost: p.state.cost + penalty,
                                },
                                chains: p.chains,
                                assigns: [...p.assigns, { note: s, hand: 'BOTH', wLeftPath, wRightPath }],
                                slideEndHands: p.slideEndHands,
                            });
                        }
                        branchPool = nextPool;
                        continue;
                    }

                    const matchingStarHead = nextStarHeads.find(sh => sh.pos === s.pos && Math.abs(sh.time - s.time) < 0.005);
                    const starHeadHand = matchingStarHead ? matchingStarHead.hand : null;

                    // 單手 Slide：檢查是否為連鎖 Slide 後續段或手動指定
                    for (const p of branchPool) {
                        const existingChain = !s.firstSlide
                            ? p.chains.find(c => c.index === s.index && Math.abs(c.baseTime - s.time) < 0.002)
                            : null;
                        const forcedHand = s.manualHand || (existingChain ? existingChain.hand : null);
                        const candHands = forcedHand ? [forcedHand] : ['L', 'R'];

                        // 若該步已有頭音符，記錄在起點同位置的手與在其他位置的手
                        let handAtStartPos = null;
                        const usedHandsOtherPos = new Set();
                        for (const a of combo.assignments) {
                            const d = Math.hypot(a.nx - sx, a.ny - sy);
                            if (d <= 0.08 * innerCirleBase) {
                                handAtStartPos = a.hand;
                            } else {
                                usedHandsOtherPos.add(a.hand);
                            }
                        }

                        for (const h of candHands) {
                            // 若剛在此步的 headItems 用同手在起點敲下去，則跳過額外鎖定/移動懲罰
                            const isContinuationFromSameStepHead = (handAtStartPos === h);
                            const u = scoreAndApplyAction(p.state, h, sx, sy, stepTime, {
                                endTime: slideEnd,
                                lockUntil: slideEnd,
                                endX: ex,
                                endY: ey,
                                isSingleHead: false,
                                allowLock: !isContinuationFromSameStepHead,
                                isSlide: true,
                                handAtStartPos,
                                usedHandsOtherPos,
                                starHeadHand,
                            });

                            const nextChains = [
                                ...p.chains.filter(c => !(c.index === s.index && Math.abs(c.baseTime - s.time) < 0.002)),
                                { index: s.index, baseTime: s.time, hand: h, endTime: slideEnd },
                            ];

                            nextPool.push({
                                state: {
                                    ...p.state,
                                    ...u,
                                },
                                chains: nextChains,
                                assigns: [...p.assigns, { note: s, hand: h }],
                                slideEndHands: [...p.slideEndHands, { hand: h, ex }],
                            });
                        }
                    }
                    branchPool = nextPool;
                }

                for (const finalBranch of branchPool) {
                    let branchCost = finalBranch.state.cost;
                    // 若同時間步有多條單手 Slide 啟動，檢查終點水平交叉 (如 1-4*-6)
                    if (finalBranch.slideEndHands.length >= 2) {
                        for (let aIdx = 0; aIdx < finalBranch.slideEndHands.length; aIdx++) {
                            for (let bIdx = aIdx + 1; bIdx < finalBranch.slideEndHands.length; bIdx++) {
                                const seA = finalBranch.slideEndHands[aIdx];
                                const seB = finalBranch.slideEndHands[bIdx];
                                if (seA.hand === 'L' && seB.hand === 'R' && seA.ex > seB.ex + 2) {
                                    branchCost += 180 * ((seA.ex - seB.ex) / innerCirleBase);
                                } else if (seA.hand === 'R' && seB.hand === 'L' && seB.ex > seA.ex + 2) {
                                    branchCost += 180 * ((seB.ex - seA.ex) / innerCirleBase);
                                }
                            }
                        }
                    }
                    nextBeam.push({
                        ...finalBranch.state,
                        cost: branchCost,
                        activeChains: finalBranch.chains,
                        recentStarHeads: nextStarHeads,
                        prevNode: baseState,
                        stepAssignments: finalBranch.assigns,
                    });
                }
            }
        }

        // 依總成本排序並截斷為 BEAM_WIDTH
        nextBeam.sort((a, b) => a.cost - b.cost);
        beam = nextBeam.slice(0, BEAM_WIDTH);
    }

    // 4. 回溯最佳路徑並寫回每顆音符的 hand (與 WiFi 兩翼路徑)
    if (beam.length > 0) {
        let cur = beam[0];
        while (cur) {
            if (cur.stepAssignments) {
                for (const item of cur.stepAssignments) {
                    item.note.hand = item.hand;
                    if (item.wLeftPath) item.note.wLeftPath = item.wLeftPath;
                    if (item.wRightPath) item.note.wRightPath = item.wRightPath;
                }
            }
            cur = cur.prevNode;
        }
    }

    return notes;
}

// 用於快取各譜面建構完畢的左右手動作時間軸，避免每幀重複掃描
const handTimelineCache = new WeakMap();

function buildHandTimelines(notes) {
    const eventsL = [];
    const eventsR = [];

    if (!Array.isArray(notes) || notes.length === 0) {
        return { L: eventsL, R: eventsR };
    }

    for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (!n || (n.isMine && !n.manualHand)) continue;
        const hand = n.manualHand || n.hand;
        if (hand !== 'L' && hand !== 'R' && hand !== 'BOTH') continue;

        if (n.type === 'slide') {
            const slideStart = n.time + (n.slideDelay || 0);
            const slideDuration = Math.max(0.001, n.slideDuration || 0);
            const slideEnd = slideStart + slideDuration;

            if (hand === 'BOTH' || (n.slideType === 'w' && !n.manualHand)) {
                const { wLeftPath, wRightPath } = (n.wLeftPath && n.wRightPath)
                    ? { wLeftPath: n.wLeftPath, wRightPath: n.wRightPath }
                    : resolveWifiWingPaths(n, REST_POS.L, REST_POS.R);

                const pushWingEvent = (targetArr, wingPath) => {
                    const usePath = wingPath || n.path || null;
                    const startPt = (usePath && typeof usePath.getPointAt === 'function')
                        ? usePath.getPointAt(0)
                        : getNoteScreenPos(n.pos);
                    const endPt = (usePath && typeof usePath.getPointAt === 'function')
                        ? usePath.getPointAt(1)
                        : getNoteScreenPos(n.slideEnd || n.pos);
                    targetArr.push({
                        type: 'slide',
                        startTime: slideStart,
                        endTime: slideEnd,
                        startX: startPt ? startPt.x : 0,
                        startY: startPt ? startPt.y : 0,
                        endX: endPt ? endPt.x : 0,
                        endY: endPt ? endPt.y : 0,
                        path: usePath,
                    });
                };

                pushWingEvent(eventsL, wLeftPath);
                pushWingEvent(eventsR, wRightPath);
                continue;
            }

            const targetArr = hand === 'L' ? eventsL : eventsR;
            const startPt = (n.path && typeof n.path.getPointAt === 'function')
                ? n.path.getPointAt(0)
                : getNoteScreenPos(n.pos);
            const endPt = (n.path && typeof n.path.getPointAt === 'function')
                ? n.path.getPointAt(1)
                : getNoteScreenPos(n.slideEnd || n.pos);

            targetArr.push({
                type: 'slide',
                startTime: slideStart,
                endTime: slideEnd,
                startX: startPt ? startPt.x : 0,
                startY: startPt ? startPt.y : 0,
                endX: endPt ? endPt.x : 0,
                endY: endPt ? endPt.y : 0,
                path: n.path || null,
            });
        } else if (n.type === 'hold' || (n.type === 'touch' && n.holdDuration)) {
            if (hand !== 'L' && hand !== 'R') continue;
            const targetArr = hand === 'L' ? eventsL : eventsR;
            const pt = getNoteScreenPos(n);
            const dur = Math.max(0.04, n.holdDuration || 0);
            targetArr.push({
                type: n.type === 'touch' ? 'touchhold' : 'hold',
                startTime: n.time,
                endTime: n.time + dur,
                startX: pt.x,
                startY: pt.y,
                endX: pt.x,
                endY: pt.y,
                path: null,
            });
        } else {
            if (hand !== 'L' && hand !== 'R') continue;
            const targetArr = hand === 'L' ? eventsL : eventsR;
            const pt = getNoteScreenPos(n);
            targetArr.push({
                type: n.type === 'touch' ? 'touch' : 'tap',
                startTime: n.time,
                endTime: n.time + 0.055,
                startX: pt.x,
                startY: pt.y,
                endX: pt.x,
                endY: pt.y,
                path: null,
            });
        }
    }

    const sortAndClean = (list) => {
        list.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
        // 避免同手兩個事件過度重疊導致插值跳動：若前事件為短促 tap 且緊接後續動作，修剪其結尾
        for (let i = 0; i < list.length - 1; i++) {
            const cur = list[i];
            const next = list[i + 1];
            if ((cur.type === 'tap' || cur.type === 'touch') && cur.endTime > next.startTime) {
                cur.endTime = next.startTime;
            }
        }
        return list;
    };

    return {
        L: sortAndClean(eventsL),
        R: sortAndClean(eventsR),
    };
}

/**
 * 二分搜尋：找尋最後一個 startTime <= t 的事件索引
 */
function findEventIndexAtTime(events, t) {
    let lo = 0;
    let hi = events.length - 1;
    let ans = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (events[mid].startTime <= t) {
            ans = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return ans;
}

function evaluateSingleHandPosition(events, hand, t, scaleFactor) {
    const restX = REST_POS[hand].x * scaleFactor;
    const restY = REST_POS[hand].y * scaleFactor;

    if (!events || events.length === 0) {
        return {
            x: restX,
            y: restY,
            state: 'idle',
            alpha: 0.3,
            holdProgress: 0,
            nextTarget: null,
        };
    }

    const idx = findEventIndexAtTime(events, t);

    // 1. 檢查是否正在執行第 idx 個事件
    if (idx >= 0) {
        const ev = events[idx];
        if (t <= ev.endTime) {
            if (ev.type === 'slide' && ev.path) {
                const dur = Math.max(0.001, ev.endTime - ev.startTime);
                const p = clampVal((t - ev.startTime) / dur, 0, 1);
                const pt = ev.path.getPointAt(p);
                return {
                    x: (pt ? pt.x : ev.startX) * scaleFactor,
                    y: (pt ? pt.y : ev.startY) * scaleFactor,
                    state: 'sliding',
                    alpha: 0.96,
                    holdProgress: p,
                    nextTarget: {
                        x: ev.endX * scaleFactor,
                        y: ev.endY * scaleFactor,
                        timeDiff: Math.max(0, ev.endTime - t),
                    },
                };
            }
            if (ev.type === 'hold' || ev.type === 'touchhold') {
                const dur = Math.max(0.001, ev.endTime - ev.startTime);
                const p = clampVal((t - ev.startTime) / dur, 0, 1);
                return {
                    x: ev.startX * scaleFactor,
                    y: ev.startY * scaleFactor,
                    state: 'holding',
                    alpha: 0.96,
                    holdProgress: p,
                    nextTarget: null,
                };
            }
            return {
                x: ev.startX * scaleFactor,
                y: ev.startY * scaleFactor,
                state: 'tapping',
                alpha: 1.0,
                holdProgress: 0,
                nextTarget: null,
            };
        }
    }

    // 2. 處於兩個事件之間 (prevEv 與 nextEv)
    const prevEv = idx >= 0 ? events[idx] : null;
    const nextEv = (idx + 1 < events.length) ? events[idx + 1] : null;

    if (!prevEv && nextEv) {
        const timeToNext = nextEv.startTime - t;
        const moveWindow = 0.6;
        if (timeToNext > moveWindow) {
            return {
                x: restX,
                y: restY,
                state: 'idle',
                alpha: 0.35,
                holdProgress: 0,
                nextTarget: timeToNext <= 0.9 ? {
                    x: nextEv.startX * scaleFactor,
                    y: nextEv.startY * scaleFactor,
                    timeDiff: timeToNext,
                } : null,
            };
        }
        const p = easeInOutCubic(1 - timeToNext / moveWindow);
        const nx = nextEv.startX * scaleFactor;
        const ny = nextEv.startY * scaleFactor;
        return {
            x: restX + (nx - restX) * p,
            y: restY + (ny - restY) * p,
            state: 'moving',
            alpha: 0.72 + 0.22 * p,
            holdProgress: 0,
            nextTarget: { x: nx, y: ny, timeDiff: timeToNext },
        };
    }

    if (prevEv && !nextEv) {
        const elapsed = t - prevEv.endTime;
        const px = prevEv.endX * scaleFactor;
        const py = prevEv.endY * scaleFactor;
        if (elapsed > 0.8) {
            const p = easeInOutCubic(Math.min(1, (elapsed - 0.8) / 0.6));
            return {
                x: px + (restX - px) * p,
                y: py + (restY - py) * p,
                state: 'idle',
                alpha: Math.max(0.3, 0.7 - 0.4 * p),
                holdProgress: 0,
                nextTarget: null,
            };
        }
        return {
            x: px,
            y: py,
            state: 'idle',
            alpha: Math.max(0.5, 0.85 - elapsed * 0.4),
            holdProgress: 0,
            nextTarget: null,
        };
    }

    if (prevEv && nextEv) {
        const px = prevEv.endX * scaleFactor;
        const py = prevEv.endY * scaleFactor;
        const nx = nextEv.startX * scaleFactor;
        const ny = nextEv.startY * scaleFactor;
        const gap = Math.max(0.001, nextEv.startTime - prevEv.endTime);
        const timeToNext = nextEv.startTime - t;

        if (gap <= 0.75) {
            const p = easeInOutCubic((t - prevEv.endTime) / gap);
            return {
                x: px + (nx - px) * p,
                y: py + (ny - py) * p,
                state: 'moving',
                alpha: 0.88,
                holdProgress: 0,
                nextTarget: { x: nx, y: ny, timeDiff: timeToNext },
            };
        }

        // 間隔較長時：先稍微放鬆停留在原位，在最後 0.6 秒移動過去
        const moveWindow = 0.6;
        if (timeToNext > moveWindow) {
            return {
                x: px,
                y: py,
                state: 'idle',
                alpha: Math.max(0.42, 0.75 - (t - prevEv.endTime) * 0.25),
                holdProgress: 0,
                nextTarget: timeToNext <= 0.9 ? { x: nx, y: ny, timeDiff: timeToNext } : null,
            };
        }

        const p = easeInOutCubic(1 - timeToNext / moveWindow);
        return {
            x: px + (nx - px) * p,
            y: py + (ny - py) * p,
            state: 'moving',
            alpha: 0.75 + 0.18 * p,
            holdProgress: 0,
            nextTarget: { x: nx, y: ny, timeDiff: timeToNext },
        };
    }

    return {
        x: restX,
        y: restY,
        state: 'idle',
        alpha: 0.3,
        holdProgress: 0,
        nextTarget: null,
    };
}

/**
 * 取得指定時間點左右手的即時虛擬游標座標、狀態、下一目標提示與移動殘影軌跡
 * @param {Array<Object>} notes
 * @param {number} globalTime
 * @param {number} targetScaleBase
 * @returns {{ L: Object, R: Object }}
 */
export function getHandCursorStates(notes, globalTime, targetScaleBase = scaleBase) {
    let timelines = notes ? handTimelineCache.get(notes) : null;
    if (!timelines && Array.isArray(notes)) {
        timelines = buildHandTimelines(notes);
        handTimelineCache.set(notes, timelines);
    }
    const eventsL = timelines ? timelines.L : [];
    const eventsR = timelines ? timelines.R : [];
    const scaleFactor = targetScaleBase / scaleBase;

    const evalWithTrail = (events, hand) => {
        const cur = evaluateSingleHandPosition(events, hand, globalTime, scaleFactor);
        const trailPoints = [{ x: cur.x, y: cur.y }];
        if (cur.state !== 'idle' || (cur.nextTarget && cur.nextTarget.timeDiff <= 0.6)) {
            for (let k = 1; k <= 7; k++) {
                const sampleT = globalTime - k * 0.018;
                const pt = evaluateSingleHandPosition(events, hand, sampleT, scaleFactor);
                trailPoints.push({ x: pt.x, y: pt.y });
            }
        }
        cur.trailPoints = trailPoints;
        return cur;
    };

    return {
        L: evalWithTrail(eventsL, 'L'),
        R: evalWithTrail(eventsR, 'R'),
    };
}
