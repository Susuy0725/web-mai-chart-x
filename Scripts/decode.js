import { parseTag, parseBeats, PathRecorder, noteRefPos, innerCirleBase, isObject } from './helper.js';
export let warns = [], warnpos = [];
const pushWarn = (...args) => {
    warns.push(args.map(formatWarnArg).join(' '));
};
const formatWarnArg = (arg) => {
    if (typeof arg === 'string') return arg;
    try {
        if (isObject(arg)) {
            if (arg.errpos !== undefined) {
                warnpos.push(arg.errpos);
                return `${_sp[arg.errpos]}, at comma position: ${arg.errpos}`;
            }
            return JSON.stringify(arg);
        }
    } catch {
        return String(arg);
    }
};
let _sp = []
export function simaiDecode(data = "", baseOffset = true) {
    warns = [];
    warnpos = [];
    const raw = data.replace(/\|\|.*$/gm, "")/* remove comments */.replace(/\s+/g, '');
    if (raw === '') return { notes: [], endTime: 0 };
    /*if (!(raw.endsWith(',') || raw.endsWith('E') || raw.endsWith(')') || raw.endsWith('}'))) {
        throw new Error("Invalid data format\nmabye missing comma at the end?");
    }*/
    const splitParts = raw.split(',');
    if (raw.endsWith(',') || raw.endsWith('E')) {
        splitParts.pop();
    }
    _sp = splitParts;
    const notes = [];
    const tags = [];
    const tempNotes = [];
    let
        firstBpm = null,
        endTime = 0,
        nowTime = 0,
        nowBpm = 60,
        nowSplit = 4,
        hispeed = 1,
        overrideSplitTime = null,
        noteCommaIndex = 0,
        indexToTime = [];
    let tapCounts = 0, holdCounts = 0, slideCounts = 0, touchCounts = 0, breakCounts = 0;
    let decodeFailed = false;
    let lastBpmTag = -1, lastSplitTag = -1, lastSplitTagCommIndex = -1;
    //pushWarn = (...args) => Array.prototype.push.call(warns, args.map(formatWarnArg).join(' '));
    for (let e of splitParts) {
        if (e.includes('(')) {
            const result = parseTag(e, '(', ')');
            if (result.error) { pushWarn(result.error); decodeFailed = true; break; }
            if (result.value !== null) nowBpm = result.value;
            if (nowTime == 0 && baseOffset) nowTime = 60 / nowBpm * 4; // 如果第一行就是 BPM 定义，则以此作为初始偏移
            if (firstBpm === null && nowBpm !== null) firstBpm = nowBpm;
            e = result.residue;
            tags.push({ type: 'bpm', value: nowBpm, time: nowTime });
            if (lastBpmTag !== -1) {
                let tg = tags[lastBpmTag];
                tg.nextTime = nowTime;
            }
            lastBpmTag = tags.length - 1;
        }
        if (e.includes('{')) {
            overrideSplitTime = null; // reset overrideSplit at the start of each new tag
            const result = parseTag(e, '{', '}', true);
            if (result.error) { pushWarn(result.error); decodeFailed = true; break; }
            if (result.value !== null && result.override) {
                overrideSplitTime = result.value;
            } else if (result.value !== null) {
                nowSplit = result.value;
            }
            e = result.residue;
            tags.push({ type: 'split', value: nowSplit, bpm: nowBpm, time: nowTime });
            lastSplitTag = tags.length - 1;
            lastSplitTagCommIndex = noteCommaIndex;
        }
        if (lastSplitTag !== -1) {
            tags[lastSplitTag].renderTimes = noteCommaIndex - lastSplitTagCommIndex + 1;
        }
        /*if (overrideSplitTime === null && (nowBpm === null || nowSplit === null)) {
            console.log("BPM or Split not defined before notes\n",(nowBpm === null || nowSplit === null));
            break;
        }*/
        if (overrideSplitTime) nowBpm = 240 / overrideSplitTime;
        let prop;
        const propMatches = e.match(/^<([^>]*)>$/);
        if (propMatches) {
            prop = propMatches[1].trim();
            // 清除 noteStr 中的標籤，避免影響後續解析 (例如 1<PROP:"RED">b -> 1b)
            e = e.replace(/^<([^>]*)>$/, '');
            if (prop.startsWith("HS*")) {
                const hispeedValue = parseFloat(prop.slice(3));
                if (!isNaN(hispeedValue)) {
                    hispeed = hispeedValue;
                    //tags.push({ type: 'hispeed', value: hispeed, time: nowTime });
                } else {
                    pushWarn("Invalid hispeed value in property:", { errpos: noteCommaIndex });
                }
            }
        }
        indexToTime[noteCommaIndex] = nowTime;
        if (!e || e === '') {
            noteCommaIndex++;
            nowTime += overrideSplitTime ?? (60 / nowBpm) * (4 / nowSplit);
            continue
        };
        {
            let notesToProcess = [];
            if (e.includes('`')) {
                const rawsub = e.split('`').map(s => s.trim());
                if (rawsub.some(s => s === '')) {
                    pushWarn("Empty note detected in backticks, ", { errpos: noteCommaIndex });
                }
                const subNotes = e.split('`').filter(n => n.trim() !== '');
                notesToProcess = subNotes.map((raw, i) => ({ raw, time: nowTime + i * 0.001 }));
            } else {
                notesToProcess = [{ raw: e, time: nowTime }];
            }
            notesToProcess.forEach(({ raw, time }) => {
                let props = [];

                // 1. 從開頭剝皮
                while (raw.startsWith('<')) {
                    // 檢查是否有成對標籤
                    const match = raw.match(/^<([^<>]*)>/);
                    if (!match) break; // 如果開頭雖然有 < 但沒對應的 >，就跳出

                    // 這裡要判斷這是不是 Simai 的滑星符號 (例如 <5)
                    // 通常滑星符號後面一定緊接數字，且長度較短
                    if (match[1].length === 1 && !isNaN(match[1])) {
                        // 如果 < 裡面只有一個數字，這通常是 Simai 滑星，不剝它
                        break;
                    }

                    props.push(match[1].trim());
                    raw = raw.slice(match[0].length); // 剝掉這層標籤
                }

                // 2. 從結尾剝皮
                while (raw.endsWith('>')) {
                    const match = raw.match(/<([^<>]*)>$/);
                    if (!match) break;

                    // 結尾標籤通常不會是滑星符號，所以可以直接剝
                    props.push(match[1].trim());
                    raw = raw.slice(0, -match[0].length); // 剝掉這層標籤
                }
                if (props.length === 0) props = null;
                if (props) {
                    const prop = props[props.length - 1]; // 以最後一個標籤為準
                    if (prop.startsWith("HS*")) {
                        const hispeedValue = parseFloat(prop.slice(3));
                        if (!isNaN(hispeedValue)) {
                            hispeed = hispeedValue;
                            //tags.push({ type: 'hispeed', value: hispeed, time: nowTime });
                        } else {
                            pushWarn("Invalid hispeed value in property:", { errpos: noteCommaIndex });
                        }
                    }
                }
                const splitr = (() => {
                    if (raw.includes('/')) {
                        return raw.split('/').map(s => s.trim());
                    } else {
                        return [raw.trim()];
                    }
                })();
                if (splitr.some(s => s === '')) {
                    pushWarn("Empty note detected in split, ", { errpos: noteCommaIndex });
                }
                if (splitr.length === 1 && !isNaN(splitr[0]) && splitr[0].length === 2) {
                    if (splitr[0].charAt(0) === splitr[0].charAt(1)) {
                        pushWarn("Overlapping note position:", { errpos: noteCommaIndex });
                        return;
                    }
                    for (let i = 0; i < 2; i++) {
                        const pos = splitr[0].charAt(i);
                        if (pos < 1 || pos > 8) {
                            pushWarn("Invalid note position:", { errpos: noteCommaIndex });
                            return;
                        }
                        const noteObj = {
                            pos: pos,
                            props: props || null,
                            isDouble: true,
                            time: time,
                            type: 'tap',
                            hispeed: hispeed,
                            index: noteCommaIndex
                        };
                        tempNotes.push(noteObj);
                    }
                    tapCounts += 2;
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
                    let tempCheck = noteStr; // 用來檢查殘餘字元的複本
                    // 這裡處理音符與 Flags (例如 "1b", "2h")
                    const posMatch = noteStr.match(/^\d+/); // 抓取開頭的數字
                    const touchMatch = noteStr.match(/^([ABCDE])(\d+)|C/); // 抓取 touch 數值
                    if (!(posMatch || touchMatch)) {
                        pushWarn("Invalid note format:", { errpos: noteCommaIndex });
                        return;
                    };
                    const slideMatch = noteStr.match(/((?:pp)|(?:qq)|[-<>^vpqszVw])/g);
                    // 從檢查字串中扣除位置部份
                    tempCheck = tempCheck.replace(/^([ABCDE]\d+|C|\d+)/, '');

                    const slidePattern = /((?:pp)|(?:qq)|[-<>^vpqszVw\*])\d*/g;
                    tempCheck = tempCheck.replace(slidePattern, '');

                    // 3. 處理時間括號 [...]
                    // 移除所有中括號內容
                    tempCheck = tempCheck.replace(/\[[^\]]*\]/g, '');

                    // 4. 處理單一字元的 Flags
                    // b(break), $(star), x(EX), f(煙火), h(hold), @(無星滑), ?(無頭), !(隱頭), m(地雷)
                    const validFlags = /[bx\$fh@?!m]/g;
                    tempCheck = tempCheck.replace(validFlags, '');

                    // 🔥 關鍵檢查：如果現在 tempCheck 還剩下任何字元，代表有非法輸入！
                    if (tempCheck.length > 0) {
                        pushWarn(`Invalid character(s) "${tempCheck}" detected in note "${noteStr}", `, { errpos: noteCommaIndex });
                        return; // 跳過這個音符，不進入後續邏輯
                    }

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
                                    pushWarn("Invalid touch position:", { errpos: noteCommaIndex });
                                    return;
                                }
                            }
                            type = 'touch';

                            touchCounts++;
                        } else {
                            pos = parseInt(posMatch[0]);
                            if (pos < 1 || pos > 8) {
                                pushWarn("Invalid note position:", { errpos: noteCommaIndex });
                                return;
                            }
                            tapCounts++;
                        }
                        return {
                            pos: pos,
                            props: props || null,
                            touchPos: touchPos || null,
                            isDouble: parts.length > 1,
                            time: time,
                            type: type,
                            hispeed: hispeed,
                            index: noteCommaIndex
                        };
                    })();
                    if (!noteObj) return;

                    // 檢查 Flags
                    if (noteStr.includes('b') && !slideMatch) {
                        if (touchMatch) return pushWarn("Break flag 'b' is not allowed in touch notes, ", { errpos: noteCommaIndex });
                        noteObj.isBreak = true
                        breakCounts++;
                        tapCounts--;
                        noteStr = noteStr.replace(/b/g, '');
                    };
                    if (noteStr.includes('m') && !slideMatch) {
                        noteObj.isMine = true
                        noteStr = noteStr.replace(/m/g, '');
                    };
                    if (noteStr.includes('$')) {
                        if (slideMatch) pushWarn("Slide already have a star! This is unnecessary,", { errpos: noteCommaIndex });
                        if (touchMatch) return pushWarn("Star flag '$' is not allowed in touch notes, ", { errpos: noteCommaIndex });
                        if (noteStr.includes('h')) return pushWarn("Star flag '$' is not allowed in hold notes, ", { errpos: noteCommaIndex });
                        noteObj.isStar = true
                        noteStr = noteStr.replace(/\$/g, '');
                    };
                    if (noteStr.includes('x')) {
                        noteObj.isEx = true
                        noteStr = noteStr.replace(/x/g, '');
                    };
                    if (noteStr.includes('f')) {
                        if (!slideMatch && touchMatch) {
                            noteObj.isHanabi = true;
                            if (noteStr.replace(/f/, '').includes('f')) {
                                pushWarn("Multiple Hanabi flags 'f' detected, ", { errpos: noteCommaIndex });
                                return;
                            }
                        } else {
                            pushWarn("Hanabi flag 'f' is not allowed in other notes!, ", { errpos: noteCommaIndex });
                            return;
                        }
                    }
                    if (noteStr.includes('h')) {
                        if (slideMatch) {
                            pushWarn("Hold flag 'h' is not allowed in slide notes, ", { errpos: noteCommaIndex });
                            return;
                        }
                        noteObj.isHold = true;
                        if (noteObj.type !== 'touch') noteObj.type = 'hold';
                        const match = noteStr.match(/\[([^\[\]]*)\]/);
                        const residue = noteStr.replace(/\[([^\[\]]*)\]/, '').replace(/h/, '');
                        if (residue.includes('h') || residue.includes('[') || residue.includes(']') || !(residue.match(/^\d$/) || touchMatch)) {
                            pushWarn("Invalid format in hold note, ", { errpos: noteCommaIndex });
                            return;
                        }
                        //noteObj.holdDuration = parseBeats("1280:1", nowBpm).time;
                        noteObj.holdDuration = 1e-4;
                        if (match) {
                            const durationStr = match[1].trim();
                            const { time: duration, _ } = parseBeats(durationStr, nowBpm);
                            if (duration < 0 || isNaN(duration) || duration === Infinity) {
                                pushWarn("Invalid hold syntax in note, ", { errpos: noteCommaIndex });
                                return;
                            }
                            noteObj.holdDuration = duration;
                            if (duration + noteObj.time > endTime) endTime = duration + noteObj.time;
                        }
                        if (noteObj.isBreak) {

                        } else {
                            holdCounts++;
                            if (noteObj.type === 'touch') {
                                touchCounts--;
                            } else {
                                tapCounts--;
                            }
                        }

                    }
                    if (noteStr.includes('@') && !slideMatch) {
                        return pushWarn("Star flag '@' is not allowed in other notes, ", { errpos: noteCommaIndex });
                    }
                    if (noteStr.includes('!') && !slideMatch) {
                        return pushWarn("Star flag '!' is not allowed in other notes, ", { errpos: noteCommaIndex });
                    }
                    if (noteStr.includes('?') && !slideMatch) {
                        return pushWarn("Star flag '?' is not allowed in other notes, ", { errpos: noteCommaIndex });
                    }
                    let noHeadSlide = false, hideHeadSlide = false;
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
                            if (!slidePartMatch) return pushWarn("Missing slide type in slide note, ", { errpos: noteCommaIndex });
                            const timeMatches = slideParts[i].match(/\[([^\[\]]*)\]/g);
                            if (!timeMatches) return pushWarn("Missing time format:", { errpos: noteCommaIndex });
                            const timeValues = timeMatches.map(m => m.slice(1, -1));
                            const residue = slideParts[i].replace(/\[([^\[\]]*)\]/g, '');
                            if (residue.includes('[') || residue.includes(']')) {
                                pushWarn("Invalid time format or empty in slide note, ", { errpos: noteCommaIndex });
                                return;
                            }
                            noteObj.isStar = true;

                            const p = residue.split(/((?:pp)|(?:qq)|[-<>^vpqszVw])/g).filter((_, i) => i % 2 === 0);
                            if (p[0].includes('b')) {
                                noteObj.isBreak = true;
                                p[0] = p[0].replace(/b/g, '');
                                breakCounts++;
                                tapCounts--;
                            }
                            if (p[0].includes('m')) {
                                noteObj.isMine = true;
                                p[0] = p[0].replace(/m/g, '');
                            }
                            if (p[0].includes('@')) {
                                noteObj.isStar = false;
                                p[0] = p[0].replace(/@/g, '');
                            }
                            if (p[0].includes('?')) {
                                if (!noteObj.isStar) {
                                    return pushWarn("Star flag '@' at here is not allowed, ", { errpos: noteCommaIndex });
                                }
                                noHeadSlide = true;
                                p[0] = p[0].replace(/\?/g, '');
                                tapCounts--;
                            }
                            if (p[0].includes('!')) {
                                if (!noteObj.isStar) {
                                    return pushWarn("Star flag '@' at here is not allowed, ", { errpos: noteCommaIndex });
                                }
                                if (noHeadSlide) {
                                    pushWarn("Using '!' and '?' at the same time is contradictory, ", { errpos: noteCommaIndex });
                                }
                                hideHeadSlide = true;
                                p[0] = p[0].replace(/!/g, '');
                            }
                            const isSlideBreak = p.some(part => part.includes('b'));
                            const isSlideMine = p.some(part => part.includes('m'));
                            if (isSlideBreak) {
                                p.forEach((c, i) => {
                                    if (c.startsWith('b')) pushWarn("Not recommand write break flag like this since it may cause confusion, please put break flag at the end of the slide part!! :", { errpos: noteCommaIndex });
                                    p[i] = p[i].replace(/b/g, '');
                                });
                            }
                            if (isSlideMine) {
                                p.forEach((c, i) => {
                                    if (c.startsWith('m')) pushWarn("Not recommand write mine flag like this since it may cause confusion, please put mine flag at the end of the slide part!! :", { errpos: noteCommaIndex });
                                    p[i] = p[i].replace(/m/g, '');
                                });
                            }

                            let d = 0, dlay = 0;
                            {
                                let error = false;
                                timeValues.forEach((t, i) => {
                                    const { time: duration, delay } = parseBeats(t, nowBpm, true);
                                    if (duration < 0 || isNaN(duration)) {
                                        pushWarn("Invalid time format in slide note, ", { errpos: noteCommaIndex });
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

                                const res = getSlidePath(head, end, type, mid);
                                const path = res.path;
                                if (res.illegal) {
                                    pushWarn(`Illegal slide ${head}${type}${mid ?? ''}${end}, `, { errpos: noteCommaIndex });
                                };
                                return { head, end, mid, type, path, len: path.totalLength, illegal: res.illegal, additional: res.additional, };
                            });

                            if (segments.includes(null)) return pushWarn("Invalid slide positions:", { errpos: noteCommaIndex });
                            if (segments.some(s => (s.mid && s.type !== 'V') || (s.type === 'V' && !s.mid))) return pushWarn("Invalid slide positions:", { errpos: noteCommaIndex });
                            const totalLen = segments.reduce((sum, s) => sum + s.len, 0);
                            let currentDelay = dlay;
                            let cullSkipSum = 0;

                            segments.forEach((seg, index) => {
                                // 如果長度為 0 則平分時間，否則依長度比例分配
                                const segmentDuration = totalLen > 0 ? d * (seg.len / totalLen) : d / segments.length;
                                if (index === 0) {
                                    noteObj.slideDuration = segmentDuration;
                                }
                                cullSkipSum += segmentDuration;

                                tempNotes.push({
                                    type: 'slide',
                                    props: props,
                                    pos: seg.head,
                                    firstSlide: index === 0,
                                    lastSlide: index === segments.length - 1,
                                    hideHead: (hideHeadSlide ? true : index !== 0),
                                    isDouble: sameTimeSlide || doubleSlide,
                                    isBreak: isSlideBreak,
                                    isMine: isSlideMine,
                                    slideEnd: seg.end,
                                    slideMid: seg.mid,
                                    slideType: seg.type,
                                    path: seg.path,
                                    wPaths: seg.additional,
                                    time: noteObj.time,
                                    slideDelay: currentDelay,
                                    slideDuration: segmentDuration,
                                    isIllegal: seg.illegal,
                                    hispeed: hispeed,
                                    cullSkipExtend: d - cullSkipSum
                                });
                                if (index === segments.length - 1) {
                                    if (isSlideBreak) { breakCounts++ } else { slideCounts++ }
                                };
                                if (noteObj.time + currentDelay + segmentDuration > endTime) endTime = noteObj.time + currentDelay + segmentDuration;
                                currentDelay += segmentDuration;
                            });
                        }

                    }
                    if (!(noHeadSlide || hideHeadSlide)) tempNotes.push(noteObj);
                });
            });
        }
        noteCommaIndex++;
        nowTime += overrideSplitTime ?? (60 / nowBpm) * (4 / nowSplit);
    }
    indexToTime[noteCommaIndex] = nowTime;
    if (nowTime > endTime) endTime = nowTime;
    for (const n of tempNotes) {
        notes.push({
            ...n,
            isBreak: n.isBreak || false,
            isHold: n.isHold || false,
            isMine: n.isMine || false,
            isEx: n.isEx || false,
        });
    }
    if (warns.length > 0) {
        console.warn("Decoding finished with warnings:", warns);
    }
    console.group("Decoded Notes:");
    console.log("notes: ", notes);
    console.log("endTime: ", endTime);
    console.log(
        `tap: ${tapCounts},
hold: ${holdCounts},
slide: ${slideCounts},
touch: ${touchCounts},
break: ${breakCounts}`
    )
    console.log(warnpos);
    console.groupEnd();
    return {
        notes,
        endTime,
        tags,
        bpm: firstBpm,
        baseOffset,
        notesConts: {
            tap: tapCounts,
            hold: holdCounts,
            slide: slideCounts,
            touch: touchCounts,
            break: breakCounts,
        },
        score: (tapCounts + touchCounts + holdCounts * 2 + slideCounts * 3 + breakCounts * 5) || 0,
        failed: decodeFailed,
        warnings: warns,
        errpositions: warnpos,
        indexToTime,
    };
}
function getSlidePath(start, end, type, mid = null) {
    const r = new PathRecorder();
    const startInfo = noteRefPos[start - 1];
    const endInfo = noteRefPos[end - 1];
    let illegal = false;
    const c = (end - start + 8) % 8;
    const e = start === end;
    const additional = {};

    switch (type) {
        case '-':
            if (c === 1 || c === 7 || e) {
                illegal = true;
            }
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        case '^':
            if (c === 4 || e) {
                illegal = true;
            }
            if (e) {
                r.moveTo(startInfo.x, startInfo.y);
                break;
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
            if (c === 4 || e) {
                illegal = true;
            }
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(0, 0);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        case 'V': {
            const s = (start - mid + 8) % 8;
            const m = (mid - end + 8) % 8;
            if (
                s !== 2 && s !== 6 || e
                || mid === end || start === mid || (mid === start) ||
                s === 2 && !(m >= 2 && m <= 5) ||
                s === 6 && !(m >= 3 && m <= 6)
            ) {
                illegal = true;
            }
            const midInfo = noteRefPos[mid - 1];
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(midInfo.x, midInfo.y);
            r.lineToArc(0, 0, innerCirleBase * 0.974, midInfo.rot - Math.PI * 0.5);
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
                x: Math.cos((start - 0.971) * Math.PI / 4) * innerCirleBase * 0.456,
                y: Math.sin((start - 0.971) * Math.PI / 4) * innerCirleBase * 0.456,
            };
            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(cir.x, cir.y, innerCirleBase * 0.472, startInfo.rot - Math.PI);
            r.arc(cir.x, cir.y, innerCirleBase * 0.466, startInfo.rot - Math.PI, endInfo.rot +
                Math.PI * (
                    (c == 0) * -0.3 +
                    (c == 1) * -0.35 +
                    (c == 2) * -0.2 +
                    (c == 4) * 0.02 +
                    (c == 6) * -0.15 +
                    (c == 7) * -0.2
                ), true, (end > start) && (end - start + 8) % 8 >= 3 || start > end && (end - start + 8) % 8 == 3);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        }
        case 'qq': {
            const c = (start - end + 8) % 8;
            const cir = {
                x: Math.cos((start - 4.028) * Math.PI / 4) * innerCirleBase * 0.456,
                y: Math.sin((start - 4.028) * Math.PI / 4) * innerCirleBase * 0.456,
            };
            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(cir.x, cir.y, innerCirleBase * 0.472, startInfo.rot);
            r.arc(cir.x, cir.y, innerCirleBase * 0.466, startInfo.rot, endInfo.rot +
                Math.PI * (
                    -1 +
                    (c == 0) * 0.3 +
                    (c == 1) * 0.35 +
                    (c == 2) * 0.2 +
                    (c == 4) * -0.02 +
                    (c == 6) * 0.15 +
                    (c == 7) * 0.2
                ), false, (start > end) && (start - end + 8) % 8 >= 3 || end > start && (start - end + 8) % 8 == 3);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        }
        case 's':
            if (c !== 4 || e) {
                illegal = true;
            }
            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(0, 0, innerCirleBase * 0.414, startInfo.rot - Math.PI * 1);
            r.lineToArc(0, 0, innerCirleBase * 0.414, startInfo.rot - Math.PI * 2);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        case 'z':
            if (c !== 4 || e) {
                illegal = true;
            }
            r.moveTo(startInfo.x, startInfo.y);
            r.lineToArc(0, 0, innerCirleBase * 0.414, startInfo.rot - Math.PI * 2);
            r.lineToArc(0, 0, innerCirleBase * 0.414, startInfo.rot - Math.PI * 1);
            r.lineTo(endInfo.x, endInfo.y);
            break;
        case 'w': {
            if (c !== 4 || e) {
                illegal = true;
            }
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(endInfo.x, endInfo.y);

            const a = noteRefPos[(end - 2 + 8) % 8];
            const b = noteRefPos[end % 8];
            additional.w1 = new PathRecorder();
            additional.w2 = new PathRecorder();

            additional.w1.moveTo(startInfo.x, startInfo.y);
            additional.w1.lineTo(a.x, a.y);

            additional.w2.moveTo(startInfo.x, startInfo.y);
            additional.w2.lineTo(b.x, b.y);
            break;
        }
        default:
            if (e) {
                illegal = true;
            }
            r.moveTo(startInfo.x, startInfo.y);
            r.lineTo(endInfo.x, endInfo.y);
            pushWarn("Not implemented slide type, defaulting to straight line:", type);
            illegal = true;
            break;
    }

    return { path: r, additional, illegal };
}