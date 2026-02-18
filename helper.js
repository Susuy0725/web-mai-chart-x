export const
    scaleBase = 100,
    innerCirleBase = (() => { const innerCirleScale = 0.889; return scaleBase * innerCirleScale / 2 })();

export async function getImg(imageSrc) { const img = new Image(); img.src = imageSrc; await img.decode(); return img; }
export function imgNotExists(image) {
    if (!image || !image.complete || image.naturalWidth === 0) {
        return true;
    }
    return false;
}
export function getButton(action, type = "control") {
    return document.querySelector(`${type === "control" ? "#playControls .controlButton" : "#topUtilityBtns .utilityButton"}[data-buttonAction="${action}"]`);
}
/**
* @param {Function} func - 要執行的函式
* @param {number} delay - 延遲時間（毫秒）
*/
export function debounce(func, delay = 300) {
    let timer = null;

    return function (...args) {
        if (timer) clearTimeout(timer);

        timer = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}
export function parseTag(str, open, close, specialCase = false) {
    const regex = new RegExp(`\\${open}([^\\${open}\\${close}]*)\\${close}`, 'g');
    const matches = [...str.matchAll(regex)];
    const residue = str.replace(regex, '');
    if (residue.includes(open) || residue.includes(close)) {
        return { error: `Invalid format: nested or unmatched ${open}${close}` };
    }
    let lastValue = null;
    for (const match of matches) {
        const val = match[1].trim();
        if (val.startsWith('#') && specialCase) { // direct assign #duration
            const duration = parseFloat(val.substring(1));
            if (isNaN(duration) || duration < 0) {
                return { error: `Invalid duration value in direct assign ${open}${close}: must be a non-negative number` };
            }
            return { residue: residue.trim(), value: duration, override: true };
        }
        if (val === '' || isNaN(val) || parseFloat(val) <= 0) {
            return { error: `Invalid value in ${open}${close}: must be a positive number` };
        }
        lastValue = parseFloat(val);
    }
    return { residue: residue.trim(), value: lastValue };
}
export function parseBeats(str, bpm, slide = false) {
    if (slide) {
        if (str.includes("##")) {
            const parts = str.split("##");
            if (parts.length === 3) { // dt##bpm##t:b
                const delay = parseFloat(parts[0]);
                const overrideBpm = parseFloat(parts[1]);
                if (isNaN(delay) || delay < 0 || isNaN(overrideBpm) || overrideBpm <= 0) {
                    console.warn("Invalid delay or bpm value in slide note:", str);
                    return { time: -1, delay: -1 };
                }
                const [time, beat] = parts[2].split(":");
                if (isNaN(beat) || parseFloat(time) < 0 || parseFloat(beat) < 0) {
                    console.warn("Invalid time or beat value in slide note:", str);
                    return { time: -1, delay: -1 };
                }
                return { time: (240 / overrideBpm) * (parseFloat(beat) / parseFloat(time)), delay: delay };
            } else if (parts.length === 2) { // dt##t:b dt##t
                const delay = parseFloat(parts[0]);
                if (isNaN(delay) || delay < 0) {
                    console.warn("Invalid delay value in slide note:", str);
                    return { time: -1, delay: -1 };
                }
                if (parts[1].includes(":")) {
                    const [time, beat] = parts[1].split(":");
                    if (isNaN(beat) || parseFloat(time) < 0 || parseFloat(beat) < 0) {
                        console.warn("Invalid time or beat value in slide note:", str);
                        return { time: -1, delay: -1 };
                    }
                    return { time: (240 / bpm) * (parseFloat(beat) / parseFloat(time)), delay: delay };
                }
                const time = parseFloat(parts[1]);
                if (isNaN(time) || time < 0) {
                    console.warn("Invalid time value in slide note:", str);
                    return { time: -1, delay: -1 };
                }
                return { time: time, delay: delay };
            }
        } else if (str.includes("#") && !str.includes(":")) { // bpm#t
            const [bpmStr, timeStr] = str.split("#").map(s => s.trim());
            const overrideBpm = parseFloat(bpmStr);
            const time = parseFloat(timeStr);
            if (isNaN(overrideBpm) || overrideBpm <= 0 || isNaN(time) || time < 0) {
                console.warn("Invalid bpm or time value in slide note:", str);
                return { time: -1, delay: -1 };
            }
            return { time: time, delay: (60 / overrideBpm) };
        }
    } else {
        if (str.startsWith('#')) { // direct assign #duration
            const duration = parseFloat(str.substring(1));
            if (isNaN(duration) || duration < 0) {
                console.warn("Invalid duration value in direct assign note:", str);
                return { time: -1, delay: -1 };
            }
            return { time: duration, delay: 0 };
        }
    }
    if (str.includes(":")) { // bpm#t:b or t:b
        const [time, beat] = str.split(":");
        if (isNaN(beat) || parseFloat(time) < 0 || parseFloat(beat) < 0) {
            console.warn("Invalid time or beat value in hold note:", str);
            return { time: -1, delay: -1 };
        }
        if (time.includes("#")) {
            const [bpmStr, timeStr] = time.split("#");
            const overrideBpm = parseFloat(bpmStr);
            return { time: (240 / overrideBpm) * (parseFloat(beat) / parseFloat(timeStr)), delay: (60 / overrideBpm) };
        } else {
            return { time: (240 / bpm) * (parseFloat(beat) / parseFloat(time)), delay: (60 / bpm) };
        }
    }
    console.warn("Invalid hold duration format or empty:", str);
    return { time: -1, delay: -1 };
}
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
            // 直線的朝向就是起點到終點的角度
            const rot = Math.atan2(seg.end.y - seg.start.y, seg.end.x - seg.start.x);
            return {
                x: seg.start.x + (seg.end.x - seg.start.x) * localT,
                y: seg.start.y + (seg.end.y - seg.start.y) * localT,
                rot: rot
            };
        } else if (seg.type === 'arc') {
            const currentAngle = seg.startAngle + seg.diff * localT;
            // 圓弧切線角度：當前圓心角 + (順時針 90度 或 逆時針 -90度)
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
}
export function drawArrowShape(ctx) {
    const size = 2.5; // 箭頭大小
    ctx.beginPath();
    ctx.moveTo(-size, -size); // 左後
    ctx.lineTo(size, 0);      // 尖端 (朝向前方)
    ctx.lineTo(-size, size);  // 右後
    ctx.lineTo(-size * 0.6, 0); // 往內凹一點點，看起來更像箭頭
    ctx.closePath();
    ctx.fill();
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
    return {
        x: Math.cos(a) * innerCirleBase,
        y: Math.sin(a) * innerCirleBase,
        rot: a + Math.PI / 2
    };
});