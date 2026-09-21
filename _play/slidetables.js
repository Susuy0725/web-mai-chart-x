/**
 * MajdataPlay SlideTables & SlideArea Queue System
 * Reference: TeamMajdata/MajdataPlay (Assets/Scripts/Scenes/Game/Misc/Notes/Slide/SlideTables.cs, SlideArea.cs)
 */

export class SlideArea {
    constructor(areas, isLast = false, isSkippable = true) {
        this.areas = Array.isArray(areas) ? areas : [areas];
        this.isLast = isLast;
        this.isSkippable = isSkippable;
        this._wasOn = false;
        this._wasOff = false;
    }

    get on() {
        return this._wasOn;
    }

    get isFinished() {
        if (this.isLast) {
            return this._wasOn; // 終點區只要觸摸到即完成
        }
        return this._wasOn && this._wasOff; // 中間路徑區需摸到且劃過離開
    }

    check(currentSensors) {
        if (!currentSensors) return;
        let pressed = false;
        for (let i = 0; i < this.areas.length; i++) {
            if (currentSensors.has(this.areas[i])) {
                pressed = true;
                break;
            }
        }
        if (pressed) {
            this._wasOn = true;
        } else {
            if (this._wasOn) {
                this._wasOff = true;
            }
        }
    }

    clone() {
        const area = new SlideArea([...this.areas], this.isLast, this.isSkippable);
        area._wasOn = this._wasOn;
        area._wasOff = this._wasOff;
        return area;
    }
}

/**
 * 將感應區代號依照起始位置偏差 diff 進行模 8 旋轉
 * 例如: rotateSensor('A1', 2) -> 'A3', rotateSensor('C', 2) -> 'C'
 */
export function rotateSensor(sensor, diff) {
    if (!sensor || sensor === 'C') return 'C';
    diff = ((diff % 8) + 8) % 8;
    if (diff === 0) return sensor;

    const group = sensor[0];
    const index = parseInt(sensor.slice(1), 10);
    if (isNaN(index)) return sensor;

    const newIndex = ((index - 1 + diff) % 8) + 1;
    return `${group}${newIndex}`;
}

/**
 * 水平鏡像感應區 (以 1-5 軸線為基準鏡像: 1<->1, 2<->8, 3<->7, 4<->6, 5<->5)
 */
export function mirrorSensor(sensor) {
    if (!sensor || sensor === 'C') return 'C';
    const group = sensor[0];
    const index = parseInt(sensor.slice(1), 10);
    if (isNaN(index)) return sensor;

    // 鏡像對應: 1->1, 2->8, 3->7, 4->6, 5->5, 6->4, 7->3, 8->2
    const mirrorMap = { 1: 1, 2: 8, 3: 7, 4: 6, 5: 5, 6: 4, 7: 3, 8: 2 };
    return `${group}${mirrorMap[index] || index}`;
}

function createArea(areas, isLast = false, isSkippable = true) {
    return { areas: Array.isArray(areas) ? areas : [areas], isLast, isSkippable };
}

// MajdataPlay 標準預定義 SlideTables (皆以起點 head = 1 為基準)
export const PREDEFINED_SLIDE_TABLES = {
    // 圓弧 (順時針: circle2 ~ circle8, circle1)
    circle2: [
        createArea('A1', false, false),
        createArea('A2', true, true)
    ],
    circle3: [
        createArea('A1', false, true),
        createArea('A2', false, false),
        createArea('A3', true, true)
    ],
    circle4: [
        createArea('A1', false, true),
        createArea('A2', false, true),
        createArea('A3', false, true),
        createArea('A4', true, true)
    ],
    circle5: [
        createArea('A1', false, true),
        createArea('A2', false, true),
        createArea('A3', false, true),
        createArea('A4', false, true),
        createArea('A5', true, true)
    ],
    circle6: [
        createArea('A1', false, true),
        createArea('A2', false, true),
        createArea('A3', false, true),
        createArea('A4', false, true),
        createArea('A5', false, true),
        createArea('A6', true, true)
    ],
    circle7: [
        createArea('A1', false, true),
        createArea('A2', false, true),
        createArea('A3', false, true),
        createArea('A4', false, true),
        createArea('A5', false, true),
        createArea('A6', false, true),
        createArea('A7', true, true)
    ],
    circle8: [
        createArea('A1', false, true),
        createArea('A2', false, true),
        createArea('A3', false, true),
        createArea('A4', false, true),
        createArea('A5', false, true),
        createArea('A6', false, true),
        createArea('A7', false, true),
        createArea('A8', true, true)
    ],
    circle1: [
        createArea('A1', false, true),
        createArea('A2', false, true),
        createArea('A3', false, true),
        createArea('A4', false, true),
        createArea('A5', false, true),
        createArea('A6', false, true),
        createArea('A7', false, true),
        createArea('A8', false, true),
        createArea('A1', true, true)
    ],

    // 直線 (line3 ~ line7)
    line3: [
        createArea('A1', false, true),
        createArea(['A2', 'B2'], false, false),
        createArea('A3', true, true)
    ],
    line4: [
        createArea('A1', false, true),
        createArea('B2', false, true),
        createArea('B3', false, true),
        createArea('A4', true, true)
    ],
    line5: [
        createArea('A1', false, true),
        createArea('B1', false, true),
        createArea('C', false, true),
        createArea('B5', false, true),
        createArea('A5', true, true)
    ],
    line6: [
        createArea('A1', false, true),
        createArea('B8', false, true),
        createArea('B7', false, true),
        createArea('A6', true, true)
    ],
    line7: [
        createArea('A1', false, true),
        createArea(['A8', 'B8'], false, false),
        createArea('A7', true, true)
    ],

    // V 字折線 (v1 ~ v8, 經由圓心 C)
    v1: [
        createArea('A1', false, true),
        createArea('B1', false, true),
        createArea('C', false, true),
        createArea('B1', false, true),
        createArea('A1', true, true)
    ],
    v2: [
        createArea('A1', false, true),
        createArea('B1', false, true),
        createArea('C', false, true),
        createArea('B2', false, true),
        createArea('A2', true, true)
    ],
    v3: [
        createArea('A1', false, true),
        createArea('B1', false, true),
        createArea('C', false, true),
        createArea('B3', false, true),
        createArea('A3', true, true)
    ],
    v4: [
        createArea('A1', false, true),
        createArea('B1', false, true),
        createArea('C', false, true),
        createArea('B4', false, true),
        createArea('A4', true, true)
    ],
    v6: [
        createArea('A1', false, true),
        createArea('B1', false, true),
        createArea('C', false, true),
        createArea('B6', false, true),
        createArea('A6', true, true)
    ],
    v7: [
        createArea('A1', false, true),
        createArea('B1', false, true),
        createArea('C', false, true),
        createArea('B7', false, true),
        createArea('A7', true, true)
    ],
    v8: [
        createArea('A1', false, true),
        createArea('B1', false, true),
        createArea('C', false, true),
        createArea('B8', false, true),
        createArea('A8', true, true)
    ],

    // S 字彎線 (1 -> 5)
    s: [
        createArea('A1', false, true),
        createArea('B8', false, true),
        createArea('B7', false, true),
        createArea('C', false, true),
        createArea('B3', false, true),
        createArea('B4', false, true),
        createArea('A5', true, true)
    ],

    // L 字轉角 (L2 ~ L5, 經由 7 轉折)
    L2: [
        createArea('A1', false, true),
        createArea(['B8', 'A8'], false, false),
        createArea('A7', false, true),
        createArea('B8', false, true),
        createArea('B1', false, true),
        createArea('A2', true, true)
    ],
    L3: [
        createArea('A1', false, true),
        createArea(['B8', 'A8'], false, false),
        createArea('A7', false, true),
        createArea('B7', false, true),
        createArea('C', false, true),
        createArea('B3', false, true),
        createArea('A3', true, true)
    ],
    L4: [
        createArea('A1', false, true),
        createArea(['B8', 'A8'], false, false),
        createArea('A7', false, true),
        createArea('B6', false, true),
        createArea('B5', false, true),
        createArea('A4', true, true)
    ],
    L5: [
        createArea('A1', false, true),
        createArea(['B8', 'A8'], false, false),
        createArea('A7', false, true),
        createArea(['B6', 'A6'], false, false),
        createArea('A5', true, true)
    ],

    // P/Q 迴旋 (pq1 ~ pq8)
    pq1: [
        createArea('A1', false, true), createArea('B8', false, true), createArea('B7', false, true),
        createArea('B6', false, true), createArea('B5', false, true), createArea('B4', false, true),
        createArea('B3', false, true), createArea('B2', false, true), createArea('A1', true, true)
    ],
    pq2: [
        createArea('A1', false, true), createArea('B8', false, true), createArea('B7', false, true),
        createArea('B6', false, true), createArea('B5', false, true), createArea('B4', false, true),
        createArea('B3', false, true), createArea('A2', true, true)
    ],
    pq3: [
        createArea('A1', false, true), createArea('B8', false, true), createArea('B7', false, true),
        createArea('B6', false, true), createArea('B5', false, true), createArea('B4', false, true),
        createArea('A3', true, true)
    ],
    pq4: [
        createArea('A1', false, true), createArea('B8', false, true), createArea('B7', false, true),
        createArea('B6', false, true), createArea('B5', false, true), createArea('A4', true, true)
    ],
    pq5: [
        createArea('A1', false, true), createArea('B8', false, true), createArea('B7', false, true),
        createArea('B6', false, true), createArea('A5', true, true)
    ],
    pq6: [
        createArea('A1', false, true), createArea('B8', false, true), createArea('B7', false, true),
        createArea('B6', false, true), createArea('B5', false, true), createArea('B4', false, true),
        createArea('B3', false, true), createArea('B2', false, true), createArea('B1', false, true),
        createArea('B8', false, true), createArea('B7', false, true), createArea('A6', true, true)
    ],
    pq7: [
        createArea('A1', false, true), createArea('B8', false, true), createArea('B7', false, true),
        createArea('B6', false, true), createArea('B5', false, true), createArea('B4', false, true),
        createArea('B3', false, true), createArea('B2', false, true), createArea('B1', false, true),
        createArea('B8', false, true), createArea('A7', true, true)
    ],
    pq8: [
        createArea('A1', false, true), createArea('B8', false, true), createArea('B7', false, true),
        createArea('B6', false, true), createArea('B5', false, true), createArea('B4', false, true),
        createArea('B3', false, true), createArea('B2', false, true), createArea('B1', false, true),
        createArea('A8', true, true)
    ],

    // 雙迴旋 (ppqq1 ~ ppqq8)
    ppqq1: [
        createArea('A1', false, true), createArea('B1', false, true), createArea('C', false, true),
        createArea('B4', false, true), createArea('A3', false, true), createArea('A2', false, true),
        createArea('A1', true, true)
    ],
    ppqq2: [
        createArea('A1', false, true), createArea('B1', false, true), createArea('C', false, true),
        createArea('B4', false, true), createArea('A3', false, true), createArea('A2', true, true)
    ],
    ppqq3: [
        createArea('A1', false, true), createArea('B1', false, true), createArea('C', false, true),
        createArea('B4', false, true), createArea('A3', true, true)
    ],
    ppqq4: [
        createArea('A1', false, true), createArea('B1', false, true), createArea('C', false, true),
        createArea('B4', false, true), createArea('A3', false, true), createArea('A2', false, true),
        createArea('B1', false, true), createArea('C', false, true), createArea('B4', false, true),
        createArea('A4', true, true)
    ],
    ppqq5: [
        createArea('A1', false, true), createArea('B1', false, true), createArea('C', false, true),
        createArea('B4', false, true), createArea('A3', false, true), createArea('A2', false, true),
        createArea('B1', false, true), createArea('C', false, true), createArea('B5', false, true),
        createArea('A5', true, true)
    ],
    ppqq6: [
        createArea('A1', false, true), createArea('B1', false, true), createArea('C', false, true),
        createArea('B4', false, true), createArea('A3', false, true), createArea('A2', false, true),
        createArea('B1', false, true), createArea(['C', 'B8'], false, true),
        createArea(['B7', 'B6'], false, true), createArea('A6', true, true)
    ],
    ppqq7: [
        createArea('A1', false, true), createArea('B1', false, true), createArea('C', false, true),
        createArea('B4', false, true), createArea('A3', false, true), createArea('A2', false, true),
        createArea('B1', false, true), createArea('B8', false, true), createArea('A7', true, true)
    ],
    ppqq8: [
        createArea('A1', false, true), createArea('B1', false, true), createArea('C', false, true),
        createArea('B4', false, true), createArea('A3', false, true), createArea('A2', false, true),
        createArea(['B1', 'A1'], false, true), createArea('A8', true, true)
    ],

    // 扇形滑條 (wifi - 合併三分支所有判定點)
    wifi: [
        createArea('A1', false, true),
        createArea(['B1', 'B8', 'B2'], false, true),
        createArea(['C', 'B7', 'B3'], false, true),
        createArea(['A4', 'A5', 'A6', 'B5', 'D5', 'D6'], true, true)
    ]
};

// MajdataPlay SlideTables.cs 官方 Const 停留比例對照表 (Table.Const)
export const PREDEFINED_SLIDE_CONSTANTS = {
    circle2: 0.465,
    circle3: 0.233,
    circle4: 0.155,
    circle5: 0.116,
    circle6: 0.093,
    circle7: 0.078,
    circle8: 0.066,
    circle1: 0.058,
    line3: 0.182,
    line4: 0.19,
    line5: 0.152,
    line6: 0.19,
    line7: 0.182,
    v1: 0.185,
    v2: 0.15,
    v3: 0.158,
    v4: 0.158,
    v6: 0.158,
    v7: 0.158,
    v8: 0.154,
    ppqq1: 0.065,
    ppqq2: 0.086,
    ppqq3: 0.157,
    ppqq4: 0.065,
    ppqq5: 0.065,
    ppqq6: 0.067,
    ppqq7: 0.079,
    ppqq8: 0.0626,
    L2: 0.1,
    L3: 0.104,
    L4: 0.098,
    L5: 0.105,
    s: 0.13,
    pq1: 0.095,
    pq2: 0.112,
    pq3: 0.125,
    pq4: 0.139,
    pq5: 0.16,
    pq6: 0.08,
    pq7: 0.084,
    pq8: 0.0895,
    wifi: 0.16287
};

/**
 * 依據 simai slide 參數與幾何路徑，建構對應的 SlideArea 判定隊列
 * @param {Object} note Slide 音符物件 (包含 pos, slideEnd, slideType, slideMid, path)
 * @param {Object} renderer 繪製器 (供幾何採樣 fallback)
 * @returns {Array<SlideArea>} 判定感應區隊列
 */
export function getSlideJudgeQueue(note, renderer = null) {
    const head = note.pos;
    const end = note.slideEnd;
    const type = note.slideType || '-';
    const mid = note.slideMid;
    const diff = head - 1;

    let baseKey = null;
    let needMirror = false;

    const relEnd = ((end - head + 8) % 8) + 1; // 相對終點 (以 head 為 1)

    switch (type) {
        case '-': // 直線
            if (relEnd >= 3 && relEnd <= 7) {
                baseKey = `line${relEnd}`;
            }
            break;
        case '^': { // 較近弧線
            const c = (end - head + 8) % 8;
            if (c <= 4) {
                baseKey = `circle${relEnd}`;
            } else {
                // 逆時針走，鏡像對稱
                const mirrorEnd = ((head - end + 8) % 8) + 1;
                baseKey = `circle${mirrorEnd}`;
                needMirror = true;
            }
            break;
        }
        case '>': {  // 順時針弧線
            const isReversed = head >= 3 && head <= 6;
            const mirrorEnd = isReversed ? ((head - end + 8) % 8) + 1 : relEnd;
            baseKey = `circle${mirrorEnd}`;
            needMirror = isReversed;
            break;
        }
        case '<': { // 逆時針弧線
            const isReversed = head >= 3 && head <= 6;
            const mirrorEnd = !isReversed ? ((head - end + 8) % 8) + 1 : relEnd;
            baseKey = `circle${mirrorEnd}`;
            needMirror = !isReversed;
            break;
        }
        case 'v': // 經中心 C 的 V 字折線
            if (relEnd >= 1 && relEnd <= 8) {
                baseKey = `v${relEnd}`;
            }
            break;
        case 'V': // 經 mid 點的折線 (L 系列)
            if (mid !== undefined && mid !== null) {
                const relMid = ((mid - head + 8) % 8) + 1;
                if (relMid === 7 && relEnd >= 2 && relEnd <= 5) {
                    baseKey = `L${relEnd}`;
                } else if (relMid === 3) {
                    // 鏡像 L
                    const mirrorRelEnd = ((head - end + 8) % 8) + 1;
                    if (mirrorRelEnd >= 2 && mirrorRelEnd <= 5) {
                        baseKey = `L${mirrorRelEnd}`;
                        needMirror = true;
                    }
                }
            }
            break;
        case 's': // S 形
            baseKey = 's';
            break;
        case 'z': // Z 形 (S 鏡像)
            baseKey = 's';
            needMirror = true;
            break;
        case 'p':
            baseKey = `pq${relEnd}`;
            break;
        case 'q': {
            const mirrorEnd = ((head - end + 8) % 8) + 1;
            baseKey = `pq${mirrorEnd}`;
            needMirror = true;
            break;
        }
        case 'pp': {
            baseKey = `ppqq${relEnd}`;
            break;
        }
        case 'qq': {
            const mirrorEnd = ((head - end + 8) % 8) + 1;
            baseKey = `ppqq${mirrorEnd}`;
            needMirror = true;
            break;
        }
        case 'w':
            baseKey = 'wifi';
            break;
    }

    // 1. 若找到 MajdataPlay 標準預定義表格，使用標準表格並做旋轉與鏡像
    if (baseKey && PREDEFINED_SLIDE_TABLES[baseKey]) {
        const template = PREDEFINED_SLIDE_TABLES[baseKey];
        const queue = [];
        for (let i = 0; i < template.length; i++) {
            const item = template[i];
            const mappedAreas = item.areas.map(sensor => {
                let s = sensor;
                if (needMirror) s = mirrorSensor(s);
                if (diff !== 0) s = rotateSensor(s, diff);
                return s;
            });
            queue.push(new SlideArea(mappedAreas, item.isLast, item.isSkippable));
        }
        const tableConst = PREDEFINED_SLIDE_CONSTANTS[baseKey] ?? 0.18;
        queue.tableConst = tableConst;
        const meta = { baseKey, relEnd, diff, needMirror, type, head, end, isPredefined: true, tableConst };
        queue._debugMeta = meta;
        if (note) note._debugMeta = meta;
        return queue;
    }

    // 2. Fallback: 對於自訂形狀或未收錄複合路徑，採用幾何路徑感應器採樣
    const fQueue = fallbackGeometricQueue(note, renderer);
    const tableConst = 0.18;
    fQueue.tableConst = tableConst;
    const meta = { baseKey: null, relEnd, diff, needMirror, type, head, end, isPredefined: false, isFallback: true, tableConst };
    fQueue._debugMeta = meta;
    if (note) note._debugMeta = meta;
    return fQueue;
}

function fallbackGeometricQueue(note, renderer) {
    if (!renderer || typeof renderer.getSensorIdAtPoint !== 'function') {
        return [
            new SlideArea(`A${note.pos}`, false, true),
            new SlideArea(`A${note.slideEnd}`, true, true)
        ];
    }

    const path = note.path;
    if (!path || path.totalLength < 1e-4) {
        return [
            new SlideArea(`A${note.pos}`, false, true),
            new SlideArea(`A${note.slideEnd}`, true, true)
        ];
    }

    const samples = typeof renderer.ensurePathSensorMap === 'function'
        ? renderer.ensurePathSensorMap(path)
        : null;

    const sensorList = [];
    let lastSensor = null;

    if (samples && samples.length > 0) {
        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            if (s && s.sensorId && s.sensorId !== lastSensor) {
                sensorList.push(s.sensorId);
                lastSensor = s.sensorId;
            }
        }
    } else {
        const numSamples = Math.max(8, Math.min(24, Math.ceil(path.totalLength * 0.4)));
        for (let i = 0; i <= numSamples; i++) {
            const pt = path.getPointAt(i / numSamples);
            const sid = renderer.getSensorIdAtPoint(pt.x, pt.y, true);
            if (sid && sid !== lastSensor) {
                sensorList.push(sid);
                lastSensor = sid;
            }
        }
    }

    if (sensorList.length === 0) {
        sensorList.push(`A${note.pos}`, `A${note.slideEnd}`);
    }

    const queue = [];
    for (let i = 0; i < sensorList.length; i++) {
        const isLast = (i === sensorList.length - 1);
        queue.push(new SlideArea(sensorList[i], isLast, true));
    }
    return queue;
}
