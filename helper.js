export async function getImg(imageSrc) { const img = new Image(); img.src = imageSrc; await img.decode(); return img; }
export function imgNotExists(image) {
    if (!image || !image.complete || image.naturalWidth === 0) {
        return true;
    }
    return false;
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
    arc(cx, cy, r, startAngle, endAngle, anticlockwise = false) {
        let diff = endAngle - startAngle;

        // 處理逆時針與跨越 2*PI 的情況
        if (!anticlockwise && diff < 0) diff += Math.PI * 2;
        if (anticlockwise && diff > 0) diff -= Math.PI * 2;

        const length = Math.abs(diff * r);
        const startPos = {
            x: cx + r * Math.cos(startAngle),
            y: cy + r * Math.sin(startAngle)
        };

        this.segments.push({
            type: 'arc',
            cx, cy, r, startAngle, endAngle,
            diff, // 旋轉的總角度
            length,
            cumLength: this.totalLength
        });

        this.totalLength += length;
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
}