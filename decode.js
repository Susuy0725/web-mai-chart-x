import { parseTag, parseBeats, PathRecorder, noteRefPos, innerCirleBase } from './helper.js';

export function simaiDecode(data = "", baseOffset = true) {
    const raw = data.replace(/\|\|.*$/gm, "")/* remove comments */.replace(/\s+/g, '');
    if (raw === '') return { notes: [], endTime: 0 };
    /*if (!(raw.endsWith(',') || raw.endsWith('E') || raw.endsWith(')') || raw.endsWith('}'))) {
        throw new Error("Invalid data format\nmabye missing comma at the end?");
    }*/
    const splitParts = raw.split(',');
    //if (raw.endsWith(',') || raw.endsWith('E')) {
    splitParts.pop();
    //}
    const notes = [];
    const tempNotes = [];
    let
        firstBpm = null,
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
            if (nowTime == 0 && baseOffset) nowTime = 60 / nowBpm * 4; // 如果第一行就是 BPM 定义，则以此作为初始偏移
            if (firstBpm === null && nowBpm !== null) firstBpm = nowBpm;
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
        if (overrideSplitTime) nowBpm = 240 / overrideSplitTime;
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
                let doubleSlide = 0;
                if (parts.length > 1) parts.forEach((p, i) => {
                    if (doubleSlide === true) return;
                    const slideMatch = p.match(/((?:pp)|(?:qq)|[-<>^vpqszVw])/g);
                    if (slideMatch) {
                        doubleSlide++;
                        if (doubleSlide > 1) {
                            doubleSlide = true;
                            return;
                        }
                    }
                });
                doubleSlide = doubleSlide > 1 || doubleSlide === true;
                parts.forEach(noteStr => {
                    // 這裡處理音符與 Flags (例如 "1b", "2h")
                    const posMatch = noteStr.match(/^\d+/); // 抓取開頭的數字
                    const touchMatch = noteStr.match(/^([ABCDE])(\d+)|C/); // 抓取 touch 數值
                    if (!(posMatch || touchMatch)) {
                        console.warn("Invalid note format:", noteStr);
                        return;
                    };
                    const slideMatch = noteStr.match(/((?:pp)|(?:qq)|[-<>^vpqszVw])/g);
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
                    if (noteStr.includes('b') && !slideMatch) {
                        if (touchMatch) return console.warn("Break flag 'b' is not allowed in touch notes, skipping:", noteStr);
                        noteObj.isBreak = true
                        noteStr = noteStr.replace(/b/g, '');
                    };
                    if (noteStr.includes('x')) {
                        noteObj.isEx = true
                        noteStr = noteStr.replace(/x/g, '');
                    };
                    if (noteStr.includes('f')) {
                        if (!slideMatch && touchMatch) {
                            noteObj.isHanabi = true
                        } else {
                            console.warn("Hanabi flag 'f' is not allowed in other notes!, skipping:", noteStr);
                            return;
                        }
                    }
                    if (noteStr.includes('h')) {
                        if (slideMatch) {
                            console.warn("Hold flag 'h' is not allowed in slide notes, skipping:", noteStr);
                            return;
                        }
                        noteObj.isHold = true;
                        if (noteObj.type !== 'touch') noteObj.type = 'hold';
                        const match = noteStr.match(/\[([^\[\]]*)\]/);
                        const residue = noteStr.replace(/\[([^\[\]]*)\]/, '').replace(/h/, '');
                        if (residue.includes('h') || residue.includes('[') || residue.includes(']') || !(residue.match(/^\d$/) || touchMatch)) {
                            console.warn("Invalid format in hold note, skipping:", noteStr);
                            return;
                        }
                        noteObj.holdDuration = 1e-4;
                        if (match) {
                            const durationStr = match[1].trim();
                            const { time: duration, _ } = parseBeats(durationStr, nowBpm);
                            if (duration < 0 || isNaN(duration)) {
                                console.warn("Invalid hold syntax in note, skipping:", noteStr);
                                return;
                            }
                            noteObj.holdDuration = duration;
                            if (duration + noteObj.time > endTime) endTime = duration + noteObj.time;
                        }
                    }
                    if (slideMatch && !noteStr.includes('h')) {
                        let sameTimeSlide = false;
                        const slideParts = (() => {
                            if (noteStr.includes('*')) {
                                const p = noteStr.split('*').map(s => s.trim());
                                for (let i = 1; i < p.length; i++) {
                                    p[i] = noteObj.pos + p[i];
                                }
                                return p;
                            }
                            return [noteStr];
                        })();
                        if (slideParts.length > 1) { // Multi part slide, e.g. 1-2*3-4
                            sameTimeSlide = true;
                            noteObj.isMultiple = true;
                        }
                        for (let i = 0; i < slideParts.length; i++) {
                            const slidePartMatch = slideParts[i].match(/((?:pp)|(?:qq)|[-<>^vpqszVw])/g);
                            if (!slidePartMatch) return console.warn("Missing slide type in slide note, skipping:", noteStr);
                            const timeMatches = slideParts[i].match(/\[([^\[\]]*)\]/g);
                            if (!timeMatches) return console.warn("Missing time format:", noteStr);
                            const timeValues = timeMatches.map(m => m.slice(1, -1));
                            const residue = slideParts[i].replace(/\[([^\[\]]*)\]/g, '');
                            if (residue.includes('[') || residue.includes(']')) {
                                console.warn("Invalid time format or empty in slide note, skipping:", noteStr);
                                return;
                            }
                            noteObj.isStar = true;

                            const p = residue.split(/((?:pp)|(?:qq)|[-<>^vpqszVw])/g).filter((_, i) => i % 2 === 0);
                            /*if (p[0].includes('b')) {
                                noteObj.isBreak = true;
                                p[0] = p[0].replace(/b/g, '');
                            }*/
                            const isSlideBreak = p.some(part => part.includes('b'));
                            if (isSlideBreak) {
                                p.forEach((c, i) => {
                                    if (c.startsWith('b')) console.warn("Not recommand write break flag like this since it may cause confusion, please put break flag at the end of the slide part!! :", residue);
                                    p[i] = p[i].replace(/b/g, '');
                                });
                            }

                            let d = 0, dlay = 0;
                            {
                                let error = false;
                                timeValues.forEach((t, i) => {
                                    const { time: duration, delay } = parseBeats(t, nowBpm, true);
                                    if (duration < 0 || isNaN(duration)) {
                                        console.warn("Invalid time format in slide note, skipping:", noteStr);
                                        error = true;
                                        return;
                                    }
                                    if (i === 0) dlay = delay;
                                    d += duration;
                                });
                                if (error) return;
                            }
                            const segments = slidePartMatch.map((type, i) => {
                                const head = i === 0 ? noteObj.pos : parseInt(p[i].slice(-1));
                                const part = p[i + 1];
                                const end = parseInt(part.slice(-1));
                                const mid = part.length > 1 ? parseInt(part.slice(-2, -1)) : undefined;

                                if ([head, end].some(v => isNaN(v) || v < 1 || v > 8)) return null;
                                if ((type === 'V' && mid === undefined) || (mid !== undefined && (isNaN(mid) || mid < 1 || mid > 8))) return null;

                                const path = getSlidePath(head, end, type, mid);
                                return { head, end, mid, type, path, len: path.totalLength };
                            });

                            if (segments.includes(null)) return console.warn("Invalid slide positions:", residue);
                            if (segments.some(s => (s.mid && s.type !== 'V') || (s.type === 'V' && !s.mid))) return console.warn("Invalid slide positions:", residue);
                            const totalLen = segments.reduce((sum, s) => sum + s.len, 0);
                            let currentDelay = dlay;

                            segments.forEach((seg, index) => {
                                // 如果長度為 0 則平分時間，否則依長度比例分配
                                const segmentDuration = totalLen > 0 ? d * (seg.len / totalLen) : d / segments.length;

                                tempNotes.push({
                                    type: 'slide',
                                    pos: seg.head,
                                    firstSlide: index === 0,
                                    hideHead: index !== 0,
                                    isDouble: sameTimeSlide || doubleSlide,
                                    isBreak: isSlideBreak,
                                    slideEnd: seg.end,
                                    slideMid: seg.mid,
                                    slideType: seg.type,
                                    path: seg.path,
                                    time: noteObj.time,
                                    slideDelay: currentDelay,
                                    slideDuration: segmentDuration
                                });
                                if (noteObj.time + currentDelay + segmentDuration > endTime) endTime = noteObj.time + currentDelay + segmentDuration;
                                currentDelay += segmentDuration;
                            });
                        }

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
    console.group("Decoded Notes:");
    console.log("notes: ", notes);
    console.log("endTime: ", endTime);
    console.groupEnd();
    return { notes, endTime, bpm: firstBpm, baseOffset };
}
function getSlidePath(start, end, type, mid = null) {
    const r = new PathRecorder();
    const startInfo = noteRefPos[start - 1];
    const endInfo = noteRefPos[end - 1];

    switch (type) {
        case '-':
            if ((end - start + 8) % 8 === 1 || (end - start + 8) % 8 === 7 || start === end) {
                console.warn(`Illegal slide: ${start}${type}${end}`);
            }
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        case '^':
            if ((end - start + 8) % 8 === 4 || start === end) {
                console.warn(`Illegal slide: ${start}${type}${end}`);
            }
            r.arc(0, 0, innerCirleBase, startInfo.rot - Math.PI / 2, endInfo.rot - Math.PI / 2, (end - start + 8) % 8 > 4);
            break;
        case '>':
            r.arc(0, 0, innerCirleBase, startInfo.rot - Math.PI / 2, endInfo.rot - Math.PI / 2, (start >= 3 && start <= 6));
            break;
        case '<':
            r.arc(0, 0, innerCirleBase, startInfo.rot - Math.PI / 2, endInfo.rot - Math.PI / 2, !(start >= 3 && start <= 6));
            break;
        case 'v':
            if ((end - start + 8) % 8 === 4 || start === end) {
                console.warn(`Illegal slide: ${start}${type}${end}`);
            }
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(0, 0);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        case 'V': {
            console.log((start - mid + 8) % 8);
            if (
                (start - mid + 8) % 8 !== 2 && (start - mid + 8) % 8 !== 6 ||
                start === end || mid === end || start === mid
            ) {
                console.warn(`Illegal slide: ${start}${type}${mid}${end}`);
            }
            const midInfo = noteRefPos[mid - 1];
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(midInfo.x, midInfo.y);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        }
        case 'q': {
            const rInner = innerCirleBase * 0.38;
            const rOuter = innerCirleBase * 0.42;
            const startAngle = startInfo.rot - Math.PI * 0.12;
            const endAngle = endInfo.rot + Math.PI * 1.09;
            const exitAngle = endInfo.rot + Math.PI * 1.265;

            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(0, 0, rInner, startAngle);
            r.arc(0, 0, rInner * 1.001, startAngle, endAngle, (start < end && (end - start + 8) % 8 >= 4));
            r.lineToArc(0, 0, rOuter, exitAngle);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        }
        case 'p': {
            const rInner = innerCirleBase * 0.38;
            const rOuter = innerCirleBase * 0.42;
            const startAngle = startInfo.rot + Math.PI * 1.09;
            const endAngle = endInfo.rot - Math.PI * 0.12;
            const exitAngle = endInfo.rot - Math.PI * 0.26;

            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(0, 0, rInner, startAngle);
            r.arc(0, 0, rInner * 1.001, startAngle, endAngle, !(end < start && (end - start + 8) % 8 <= 4));
            r.lineToArc(0, 0, rOuter, exitAngle);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        }
        case 'pp': {
            const cir = {
                x: Math.cos((start - 0.972) * Math.PI / 4) * innerCirleBase * 0.456,
                y: Math.sin((start - 0.972) * Math.PI / 4) * innerCirleBase * 0.456,
            };
            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(cir.x, cir.y, innerCirleBase * 0.472, startInfo.rot - Math.PI);
            r.arc(cir.x, cir.y, innerCirleBase * 0.466, startInfo.rot - Math.PI, endInfo.rot +
                Math.PI * (
                    ((end - start + 8) % 8 == 0) * -0.3 +
                    ((end - start + 8) % 8 == 1) * -0.35 +
                    ((end - start + 8) % 8 == 2) * -0.2 +
                    ((end - start + 8) % 8 == 6) * -0.15 +
                    ((end - start + 8) % 8 == 7) * -0.2
                ), true, (end > start) && (end - start + 8) % 8 >= 3 || start > end && (end - start + 8) % 8 == 3);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        }
        case 'qq': {
            const cir = {
                x: Math.cos((start - 4.028) * Math.PI / 4) * innerCirleBase * 0.456,
                y: Math.sin((start - 4.028) * Math.PI / 4) * innerCirleBase * 0.456,
            };
            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(cir.x, cir.y, innerCirleBase * 0.472, startInfo.rot);
            r.arc(cir.x, cir.y, innerCirleBase * 0.466, startInfo.rot, endInfo.rot +
                Math.PI * (
                    -1 +
                    ((start - end + 8) % 8 == 0) * 0.3 +
                    ((start - end + 8) % 8 == 1) * 0.35 +
                    ((start - end + 8) % 8 == 2) * 0.2 +
                    ((start - end + 8) % 8 == 6) * 0.15 +
                    ((start - end + 8) % 8 == 7) * 0.2
                ), false, (start > end) && (start - end + 8) % 8 >= 3 || end > start && (start - end + 8) % 8 == 3);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        }
        case 's':
            if ((end - start + 8) % 8 !== 4 || start === end) {
                console.warn(`Illegal slide: ${start}${type}${end}`);
            }
            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(0, 0, innerCirleBase * 0.414, startInfo.rot - Math.PI * 1);
            r.lineToArc(0, 0, innerCirleBase * 0.414, startInfo.rot - Math.PI * 2);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        case 'z':
            if ((end - start + 8) % 8 !== 4 || start === end) {
                console.warn(`Illegal slide: ${start}${type}${end}`);
            }
            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(0, 0, innerCirleBase * 0.414, startInfo.rot - Math.PI * 2);
            r.lineToArc(0, 0, innerCirleBase * 0.414, startInfo.rot - Math.PI * 1);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        case 'w':
            if ((end - start + 8) % 8 !== 4 || start === end) {
                console.warn(`Illegal slide: ${start}${type}${end}`);
            }
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        default:
            if (start === end) console.warn("This slide will not be visible since start and end are the same!! :", `${start}${type}${end}`);
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(endInfo.x, endInfo.y);
            console.warn("Not implemented slide type, defaulting to straight line:", type);
            break;
    }

    return r;
}