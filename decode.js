import { parseTag, parseBeats, PathRecorder } from './helper.js';

export function simaiDecode(data) {
    const raw = data.replace(/\|\|.*$/gm, "")/* remove comments */.replace(/\s+/g, '');
    if (!(raw.endsWith(',') || raw.endsWith('E') || raw.endsWith(')') || raw.endsWith('}'))) {
        throw new Error("Invalid data format\nmabye missing comma at the end?");
    }
    const splitParts = raw.split(',');
    if (raw.endsWith(',') || raw.endsWith('E')) {
        splitParts.pop();
    }
    const notes = [];
    const tempNotes = [];
    let
        endTime = 0,
        nowTime = 0,
        nowBpm = null,
        nowSplit = null,
        overrideSplitTime = null;
    for (let e of splitParts) {
        if (e.includes('(')) {
            const result = parseTag(e, '(', ')');
            if (result.error) { console.log(result.error); break; }
            if (result.value !== null) nowBpm = result.value;
            e = result.residue;
        }
        if (e.includes('{')) {
            overrideSplitTime = null; // reset overrideSplit at the start of each new tag
            const result = parseTag(e, '{', '}', true);
            if (result.error) { console.log(result.error); break; }
            if (result.value !== null && result.override) {
                overrideSplitTime = result.value;
            } else if (result.value !== null) {
                nowSplit = result.value;
            }
            e = result.residue;
        }
        if (overrideSplitTime === null && (nowBpm === null || nowSplit === null)) {
            console.log("BPM or Split not defined before notes");
            break;
        }
        if (!e || e === '') {
            nowTime += overrideSplitTime ?? (60 / nowBpm) * (4 / nowSplit);
            continue
        };

        {
            let notesToProcess = [];
            if (e.includes('`')) {
                const rawsub = e.split('`').map(s => s.trim());
                if (rawsub.some(s => s === '')) {
                    console.warn("Empty note detected in backticks, skipping:", e);
                    continue;
                }
                const subNotes = e.split('`').filter(n => n.trim() !== '');
                notesToProcess = subNotes.map((raw, i) => ({ raw, time: nowTime + i * 0.001 }));
            } else {
                notesToProcess = [{ raw: e, time: nowTime }];
            }
            notesToProcess.forEach(({ raw, time }) => {
                const splitr = (() => {
                    if (raw.includes('/')) {
                        return raw.split('/').map(s => s.trim());
                    } else {
                        return [raw.trim()];
                    }
                })();
                if (splitr.some(s => s === '')) {
                    console.warn("Empty note detected in split, skipping:", raw);
                    return;
                }
                if (splitr.length === 1 && !isNaN(splitr[0]) && splitr[0].length === 2) {
                    for (let i = 0; i < 2; i++) {
                        const pos = parseInt(splitr[0].charAt(i));
                        if (pos < 1 || pos > 8 || isNaN(pos)) {
                            console.warn("Invalid note position:", pos);
                            return;
                        }
                        const noteObj = {
                            pos: pos,
                            isDouble: true,
                            time: time,
                            type: 'tap'
                        };
                        tempNotes.push(noteObj);
                    }
                    return;
                }
                const parts = splitr.filter(p => p !== '');
                parts.forEach(noteStr => {
                    // 這裡處理音符與 Flags (例如 "1b", "2h")
                    const posMatch = noteStr.match(/^\d+/); // 抓取開頭的數字
                    const touchMatch = noteStr.match(/^([ABCDE])(\d+)|C/); // 抓取 touch 數值
                    if (!(posMatch || touchMatch)) {
                        console.warn("Invalid note format:", noteStr);
                        return;
                    };
                    const noteObj = (() => {
                        let pos, touchPos, type = 'tap';
                        if (touchMatch) {
                            if (touchMatch[0] === 'C') {
                                touchPos = 'C';
                                pos = 1;
                            } else {
                                touchPos = touchMatch[1];
                                pos = parseInt(touchMatch[2]);
                                if (pos < 1 || pos > 8) {
                                    console.warn("Invalid touch position:", pos);
                                    return;
                                }
                            }
                            type = 'touch';
                        } else {
                            pos = parseInt(posMatch[0]);
                            if (pos < 1 || pos > 8) {
                                console.warn("Invalid note position:", pos);
                                return;
                            }
                        }
                        return {
                            pos: pos,
                            touchPos: touchPos || null,
                            isDouble: parts.length > 1,
                            time: time,
                            type: type
                        };
                    })();
                    if (!noteObj) return;

                    // 檢查 Flags
                    if (noteStr.includes('b')) noteObj.isBreak = true;
                    if (noteStr.includes('h')) {
                        noteObj.isHold = true;
                        if (noteObj.type !== 'touch') noteObj.type = 'hold';
                        const match = noteStr.match(/\[([^\[\]]*)\]/);
                        const residue = noteStr.replace(/\[([^\[\]]*)\]/, '').replace(/h/, '');
                        if (residue.includes('h') || residue.includes('[') || residue.includes(']')) {
                            console.warn("Invalid format in hold note, skipping:", noteStr);
                            return;
                        }
                        noteObj.holdDuration = 0; // 預設持續時間為 0，後面會根據 Flags 計算
                        if (match) {
                            const durationStr = match[1].trim();
                            const { time: duration, _ } = parseBeats(durationStr, nowBpm);
                            if (duration < 0 || isNaN(duration)) {
                                console.warn("Invalid hold syntax in note, skipping:", noteStr);
                                return;
                            }
                            noteObj.holdDuration = duration;
                            if (duration > endTime) endTime = duration;
                        }
                    }
                    if (noteStr.includes('x')) noteObj.isEx = true;
                    const slideMatch = noteStr.match(/((?:pp)|(?:qq)|[-<>^vpqszVw])/g);
                    if (slideMatch) {
                        if (noteStr.includes('*')) {

                        } else {
                            const time = (() => {
                                const match = noteStr.match(/\[([^\[\]]*)\]/g);
                                return match ? match.map(m => m.slice(1, -1)) : null;
                            })();
                            const residue = noteStr.replace(/\[([^\[\]]*)\]/g, '');
                            if (residue.includes('[') || residue.includes(']') || !time) {
                                console.warn("Invalid time format or empty in slide note, skipping:", noteStr);
                                return;
                            }
                            noteObj.isStar = true;
                            console.log(noteObj, slideMatch, time, residue);
                            const p = residue.split(/((?:pp)|(?:qq)|[-<>^vpqszVw])/g).filter((s, i) => i % 2 === 0);
                            console.log("slide parts:", p);
                            let d = 0;
                            let dlay = 0;
                            time.forEach((t, i) => {
                                const { time: duration, delay } = parseBeats(t, nowBpm, true);
                                console.log("parsed time:", t, "=>", { duration, delay });
                                if (i === 0) dlay = delay;
                                if (duration < 0 || isNaN(duration)) {
                                    console.warn("Invalid time format in slide note, skipping:", noteStr);
                                    return;
                                }
                                d += duration;
                            });
                            console.log("total duration:", d, "initial delay:", dlay);

                            for (let i = 0; i < slideMatch.length; i++) {
                                const slideType = slideMatch[i];
                                const slideHead = i === 0 ? noteObj.pos : parseInt(p[i][p[i].length - 1]);
                                const slideEnd = parseInt(p[i + 1][0]);
                                if (isNaN(slideEnd) || slideEnd < 1 || slideEnd > 8 || isNaN(slideHead) || slideHead < 1 || slideHead > 8) {
                                    console.warn("Invalid slide start or end position in slide note:", p[i + 1]);
                                    return;
                                }
                                const path = getSlidePath(slideHead, slideEnd, slideType);
                                const slideObj = {
                                    type: 'slide',
                                    pos: slideHead,
                                    slideEnd: slideEnd,
                                    slideType: slideType,
                                    path: path,
                                    time: noteObj.time,
                                    slideDelay: dlay,
                                    slideDuration: d
                                }
                                console.log(slideObj, slideType);
                                tempNotes.push(slideObj);
                            }
                            console.log("slide:", noteStr);
                        }
                        //return;
                    }

                    tempNotes.push(noteObj);
                });
            });
        }
        nowTime += overrideSplitTime ?? (60 / nowBpm) * (4 / nowSplit);
    }
    if (nowTime > endTime) endTime = nowTime;
    for (const n of tempNotes) {
        notes.push({
            ...n,
            isBreak: n.isBreak || false,
            isHold: n.isHold || false,
            isEx: n.isEx || false
        });
    }
    console.log(tempNotes);
    return { notes, endTime };
}
const scaleBase = 100, innerCirleBase = (() => { const innerCirleScale = 0.889; return scaleBase * innerCirleScale / 2 })();
const noteRefPos = Array.from({ length: 8 }, (_, i) => {
    const a = (i - 1.5) * Math.PI / 4;
    return {
        x: Math.cos(a) * innerCirleBase,
        y: Math.sin(a) * innerCirleBase,
        rot: a + Math.PI / 2
    };
});

const touchRefPos = {
    A: Array.from({ length: 8 }, (_, i) => {
        const a = (i - 1.5) * Math.PI / 4;
        return {
            x: Math.cos(a) * innerCirleBase * 0.833,
            y: Math.sin(a) * innerCirleBase * 0.833,
            rot: a + Math.PI / 2
        };
    }),
    B: Array.from({ length: 8 }, (_, i) => {
        const a = (i - 1.5) * Math.PI / 4;
        return {
            x: Math.cos(a) * innerCirleBase * 0.458,
            y: Math.sin(a) * innerCirleBase * 0.458,
            rot: a + Math.PI / 2
        };
    }),
    C: [{ x: 0, y: 0 }],
    D: Array.from({ length: 8 }, (_, i) => {
        const a = (i - 2) * Math.PI / 4;
        return {
            x: Math.cos(a) * innerCirleBase * 0.854,
            y: Math.sin(a) * innerCirleBase * 0.854,
            rot: a + Math.PI / 2
        };
    }),
    E: Array.from({ length: 8 }, (_, i) => {
        const a = (i - 2) * Math.PI / 4;
        return {
            x: Math.cos(a) * innerCirleBase * 0.645,
            y: Math.sin(a) * innerCirleBase * 0.645,
            rot: a + Math.PI / 2
        };
    })
};
function getSlidePath(start, end, type) {
    const recorder = new PathRecorder();
    const startInfo = noteRefPos[start - 1];
    const endInfo = noteRefPos[end - 1];

    switch (type) {
        case '-':
            if ((end - start + 8) % 8 === 1 || (end - start + 8) % 8 === 7 || start === end) {
                console.warn(`Illegal slide: ${start}${type}${end}`);
            }
            recorder.moveTo(startInfo.x, startInfo.y);
            recorder.lineTo(endInfo.x, endInfo.y);
            break;
        case '^':
            if ((end - start + 8) % 8 === 4 || start === end) {
                console.warn(`Illegal slide: ${start}${type}${end}`);
            }
            recorder.arc(0, 0, innerCirleBase, startInfo.rot - Math.PI / 2, endInfo.rot - Math.PI / 2, (end - start + 8) % 8 > 4);
            break;
        case '>':
            recorder.arc(0, 0, innerCirleBase, startInfo.rot - Math.PI / 2, endInfo.rot - Math.PI / 2, (start >= 3 && start <= 6));
            break;
        case '<':
            recorder.arc(0, 0, innerCirleBase, startInfo.rot - Math.PI / 2, endInfo.rot - Math.PI / 2, !(start >= 3 && start <= 6));
            break;
        case 'v':
            if ((end - start + 8) % 8 === 4 || start === end) {
                console.warn(`Illegal slide: ${start}${type}${end}`);
            }
            recorder.moveTo(startInfo.x, startInfo.y);
            recorder.lineTo(0, 0);
            recorder.lineTo(endInfo.x, endInfo.y);
            break;
        default:
            recorder.moveTo(startInfo.x, startInfo.y);
            recorder.lineTo(endInfo.x, endInfo.y);
            console.warn("Unsupported slide type, defaulting to straight line:", type);
            break;
    }

    return recorder;
}