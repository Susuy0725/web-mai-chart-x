import { parseTag } from './helper.js';

export function simaiDecode(data) {
    const raw = data.replace(/\|\|.*$/gm, "")/* remove comments */.replace(/\s+/g, '');
    if (!(raw.endsWith(',') || raw.endsWith('E') || raw.endsWith(')') || raw.endsWith('}'))) {
        throw new Error("Invalid data format\nmabye missing comma at the end?");
    }
    const sp = raw.split(',');
    if (raw.endsWith(',')) {
        sp.pop();
    }
    console.log(sp);
    const notes = [];
    const tempNotes = [];
    let
        nowTime = 0,
        nowBpm = null,
        nowSplit = null;
    // 主程式迴圈
    for (let e of sp) {
        if (e.includes('(')) {
            const result = parseTag(e, '(', ')');
            if (result.error) { console.log(result.error); break; }
            if (result.value !== null) nowBpm = result.value;
            e = result.residue;
        }
        if (e.includes('{')) {
            const result = parseTag(e, '{', '}');
            if (result.error) { console.log(result.error); break; }
            if (result.value !== null) nowSplit = result.value;
            e = result.residue;
        }
        if (nowBpm === null || nowSplit === null) {
            console.log("BPM or Split not defined before notes");
            break;
        }
        if (!e) continue;

        let notesToProcess = [];
        if (e.includes('`')) {
            const subNotes = e.split('`').filter(n => n.trim() !== '');
            notesToProcess = subNotes.map((raw, i) => ({ raw, time: nowTime + i * 0.001 }));
        } else {
            notesToProcess = [{ raw: e, time: nowTime }];
        }

        notesToProcess.forEach(({ raw, time }) => {
            const parts = raw.split('/').filter(p => p !== '');
            tempNotes.push(...parts.map(note => ({ note, time })));
        });

        //now just dump temp to notes
        nowTime += (60 / nowBpm) * (4 / nowSplit);
    }
    for (const n of tempNotes) {
        if (n.note[0] > 8 || n.note[0] < 1) {
            console.warn("Invalid note position:", n.note[0]);
            continue;
        }
        notes.push({
            pos: parseInt(n.note[0]),
            type: 'tap',
            time: n.time
        });
    }
    console.log(notes);
    return notes;
}