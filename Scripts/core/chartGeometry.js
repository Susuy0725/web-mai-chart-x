/**
 * chartGeometry.js
 * 幾何座標與軌跡記錄器核心模組（純 JS，零 DOM/瀏覽器 API 依賴）
 * 供主線程與 Web Worker 共享使用
 */

export const scaleBase = 100;
export const innerCirleBase = (() => {
    const innerCirleScale = 0.889;
    return scaleBase * innerCirleScale / 2;
})();

export class PathRecorder {
    constructor() {
        this.segments = [];
        this.totalLength = 0;
        this.currentPoint = { x: 0, y: 0 };
    }

    moveTo(x, y) {
        this.currentPoint = { x, y };
    }

    lineTo(x, y) {
        const x1 = this.currentPoint.x;
        const y1 = this.currentPoint.y;
        const length = Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);

        this.segments.push({
            type: 'line',
            start: { x: x1, y: y1 },
            end: { x, y },
            length: length,
            cumLength: this.totalLength
        });

        this.totalLength += length;
        this.currentPoint = { x, y };
    }

    // startAngle, endAngle 使用弧度 (Radian)
    arc(cx, cy, r, startAngle, endAngle, anticlockwise = false, laps = 0) {
        let diff = endAngle - startAngle;

        // 1. 基礎處理：確保方向與角度差在 2*PI 以內
        if (!anticlockwise && diff <= 0) diff += Math.PI * 2;
        if (anticlockwise && diff >= 0) diff -= Math.PI * 2;

        // 2. 加入額外的圈數
        const extraRotation = Math.PI * 2 * laps;
        if (anticlockwise) {
            diff -= extraRotation; // 逆時針方向，角度差為負值
        } else {
            diff += extraRotation; // 順時針方向，角度差為正值
        }

        const length = Math.abs(diff * r);

        this.segments.push({
            type: 'arc',
            cx, cy, r, startAngle, endAngle,
            diff, // 這裡的 diff 現在包含了總旋轉量
            length,
            cumLength: this.totalLength
        });

        this.totalLength += length;

        // 更新當前點位置
        this.currentPoint = {
            x: cx + r * Math.cos(endAngle),
            y: cy + r * Math.sin(endAngle)
        };
    }

    getPointAt(t) {
        if (this.segments.length === 0) return { ...this.currentPoint, rot: 0 };

        // 邊界處理
        if (t <= 0) t = 0;
        if (t >= 1) t = 1;

        const targetLen = t * this.totalLength;
        const seg = this.segments.find(s => targetLen >= s.cumLength && targetLen <= s.cumLength + s.length)
            || this.segments[this.segments.length - 1];

        const localT = seg.length === 0 ? 1 : (targetLen - seg.cumLength) / seg.length;

        if (seg.type === 'line') {
            const rot = Math.atan2(seg.end.y - seg.start.y, seg.end.x - seg.start.x);
            return {
                x: seg.start.x + (seg.end.x - seg.start.x) * localT,
                y: seg.start.y + (seg.end.y - seg.start.y) * localT,
                rot: rot
            };
        } else if (seg.type === 'arc') {
            const currentAngle = seg.startAngle + seg.diff * localT;
            const rot = currentAngle + (seg.diff > 0 ? Math.PI / 2 : -Math.PI / 2);
            return {
                x: seg.cx + seg.r * Math.cos(currentAngle),
                y: seg.cy + seg.r * Math.sin(currentAngle),
                rot: rot
            };
        }
    }

    lineToArc(cx, cy, r, startAngle) {
        const x = cx + r * Math.cos(startAngle);
        const y = cy + r * Math.sin(startAngle);
        this.lineTo(x, y);
    }

    endTangent() {
        return this.getPointAt(1).rot;
    }
}

export const touchRefPos = {
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

export const noteRefPos = Array.from({ length: 8 }, (_, i) => {
    const a = (i - 1.5) * Math.PI / 4;
    const rot = a + Math.PI / 2;
    return {
        x: Math.cos(a) * innerCirleBase,
        y: Math.sin(a) * innerCirleBase,
        rot,
        cosRot: Math.cos(rot),
        sinRot: Math.sin(rot)
    };
});

export const visualNoteRefPos = Array.from({ length: 9 }, (_, i) => {
    return {
        x: (4 - i) * innerCirleBase / 4,
    };
});

export function isObject(val) {
    return val !== null && typeof val === 'object';
}

export const CHART_ROTATION_MODES = Object.freeze(['none', 'flipV', 'flipH', 'rotate180']);

const DE_FLIP_V_MAP = Object.freeze({ 1: 5, 2: 4, 3: 3, 4: 2, 5: 1, 6: 8, 7: 7, 8: 6 });
const DE_FLIP_H_MAP = Object.freeze({ 1: 1, 2: 8, 3: 7, 4: 6, 5: 5, 6: 4, 7: 3, 8: 2 });

/**
 * 依據譜面旋轉/反轉模式轉換按鍵與外圈感應器 (Tap / Hold / Star / A / B) 位置 (1~8)。
 * @param {number|string} pos - 原始位置 (1~8)
 * @param {string} mode - 'none' | 'flipV' | 'flipH' | 'rotate180'
 * @returns {number}
 */
export function transformButtonPos(pos, mode) {
    const n = Number(pos);
    if (!Number.isInteger(n) || n < 1 || n > 8 || !mode || mode === 'none') {
        return n;
    }
    if (mode === 'flipV') {
        return ((12 - n) % 8) + 1;
    }
    if (mode === 'flipH') {
        return ((8 - n) % 8) + 1;
    }
    if (mode === 'rotate180') {
        return ((n + 3) % 8) + 1;
    }
    return n;
}

/**
 * 依據譜面旋轉/反轉模式轉換 D / E 感應器位置 (1~8，其中 D1/E1 位於正上方)。
 * @param {number|string} pos - 原始位置 (1~8)
 * @param {string} mode - 'none' | 'flipV' | 'flipH' | 'rotate180'
 * @returns {number}
 */
export function transformDEPos(pos, mode) {
    const n = Number(pos);
    if (!Number.isInteger(n) || n < 1 || n > 8 || !mode || mode === 'none') {
        return n;
    }
    if (mode === 'flipV') {
        return DE_FLIP_V_MAP[n] ?? n;
    }
    if (mode === 'flipH') {
        return DE_FLIP_H_MAP[n] ?? n;
    }
    if (mode === 'rotate180') {
        return ((n + 3) % 8) + 1;
    }
    return n;
}

/**
 * 依據觸控區域與位置轉換 Touch / Sensor 編號。
 * @param {string} touchPos - 'A' | 'B' | 'C' | 'D' | 'E'
 * @param {number|string} pos - 原始位置 (1~8，C 區固定為 1)
 * @param {string} mode - 'none' | 'flipV' | 'flipH' | 'rotate180'
 * @returns {number}
 */
export function transformTouchPos(touchPos, pos, mode) {
    if (touchPos === 'C') return 1;
    if (touchPos === 'D' || touchPos === 'E') {
        return transformDEPos(pos, mode);
    }
    return transformButtonPos(pos, mode);
}

const SLIDE_SWAP_PQ_SZ = Object.freeze({
    p: 'q',
    q: 'p',
    pp: 'qq',
    qq: 'pp',
    s: 'z',
    z: 's',
});

const SLIDE_SWAP_LR = Object.freeze({
    '<': '>',
    '>': '<',
});

/**
 * 依據譜面旋轉/反轉模式轉換 Slide 類型。
 * - flipV: p<->q, pp<->qq, s<->z（< / > 因依起點判斷順逆時針故不交換）
 * - flipH: p<->q, pp<->qq, s<->z, < <-> >
 * - rotate180: < <-> >（p/q/pp/qq/s/z 旋轉 180° 後對稱不變）
 * @param {string} slideType
 * @param {string} mode - 'none' | 'flipV' | 'flipH' | 'rotate180'
 * @returns {string}
 */
export function transformSlideType(slideType, mode) {
    if (!slideType || !mode || mode === 'none') return slideType;
    if (mode === 'flipV') {
        return SLIDE_SWAP_PQ_SZ[slideType] ?? slideType;
    }
    if (mode === 'flipH') {
        return SLIDE_SWAP_PQ_SZ[slideType] ?? SLIDE_SWAP_LR[slideType] ?? slideType;
    }
    if (mode === 'rotate180') {
        return SLIDE_SWAP_LR[slideType] ?? slideType;
    }
    return slideType;
}
