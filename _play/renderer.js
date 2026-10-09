import {
    scaleBase,
    innerCirleBase,
    noteRefPos,
    touchRefPos,
} from '../Scripts/core/chartGeometry.js';
import {
    getTintedImage,
    generatePath,
    touchPaths,
    wSlideRatio,
    clamp,
    drawImgAtcenter,
    exColor,
    easeOutQuad,
    easeInBack,
    imgNotExists,
} from '../Scripts/helper.js';

// Safari / WebKit 專屬優化與 Polyfill: ctx.setAlpha()
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.setAlpha) {
    CanvasRenderingContext2D.prototype.setAlpha = function (alpha) {
        this.globalAlpha = alpha;
    };
}
if (typeof OffscreenCanvasRenderingContext2D !== 'undefined' && !OffscreenCanvasRenderingContext2D.prototype.setAlpha) {
    OffscreenCanvasRenderingContext2D.prototype.setAlpha = function (alpha) {
        this.globalAlpha = alpha;
    };
}

// --- 靜態繪畫常數與路徑 (避免每幀重複建立) ---

const LEVEL_COLORS = {
    1: "#248ACA",
    2: "#43C122",
    3: "#FFBA01",
    4: "#FE5963",
    5: "#A356E9",
    6: "#E3E6E5",
    7: "#FF6EFC",
};

const RICH_HANABI_COLOR_MAP = ['#ff009dff', '#ff4800', '#ffe100', '#ddff00', '#00bbff'];
const TOUCH_GROUP_TO_INDEX = { A: 0, B: 8, C: 16, D: 17, E: 25 };

const LEVEL_NAMES = {
    1: 'EAZY',
    2: 'BASIC',
    3: 'ADVANCED',
    4: 'EXPERT',
    5: 'MASTER',
    6: 'Re:MASTER',
    7: 'U•TA•GE'
};

const JUDGE_COLORS = {
    PERFECT: "#FFFE02",
    GREAT: "#FE5454",
    GOOD: "#45FD43",
};

function hexToRgb(hex) {
    if (!hex) return { r: 255, g: 254, b: 2 };
    let c = hex.replace('#', '');
    if (c.length === 3) {
        c = c.split('').map(x => x + x).join('');
    }
    const num = parseInt(c, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

function getJudgeRgba(judge, alpha = 1) {
    let colorHex = JUDGE_COLORS.PERFECT;
    if (judge) {
        if (typeof judge === 'object' && judge.grade) {
            judge = judge.grade;
        }
        if (typeof judge === 'string') {
            const upper = judge.toUpperCase();
            if (upper.includes('PERFECT')) colorHex = JUDGE_COLORS.PERFECT;
            else if (upper.includes('GREAT')) colorHex = JUDGE_COLORS.GREAT;
            else if (upper.includes('GOOD')) colorHex = JUDGE_COLORS.GOOD;
            else if (JUDGE_COLORS[upper]) colorHex = JUDGE_COLORS[upper];
            else if (judge.startsWith('#')) colorHex = judge;
        }
    }
    const rgb = hexToRgb(colorHex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

const CARD_PATH = new Path2D();
CARD_PATH.arc(16, 25, 2, 0, Math.PI * 0.5);
CARD_PATH.arc(-16, 25, 2, Math.PI * 0.5, Math.PI * 1);
CARD_PATH.arc(-16, -33.5, 2, Math.PI * 1, Math.PI * 1.5);
CARD_PATH.arc(-2, -33.5, 2, Math.PI * 1.5, Math.PI * 2);
CARD_PATH.arc(2, -32, 2, Math.PI * 1, Math.PI * 0.5, true);
CARD_PATH.arc(16, -28, 2, Math.PI * 1.5, Math.PI * 2);
CARD_PATH.closePath();

const LV_PATH = new Path2D();
LV_PATH.arc(16, -0.5, 2, 0, Math.PI * 0.5);
LV_PATH.arc(7.5, 3.5, 2, Math.PI * 1.5, Math.PI * 1, true);
LV_PATH.arc(3.5, 5.5, 2, 0, Math.PI * 0.5);
LV_PATH.lineTo(18, 7.5);
LV_PATH.closePath();

const CAPSULE_PATH = new Path2D();
CAPSULE_PATH.arc(-2.5, -33, 2, Math.PI * 1.5, Math.PI * 0.5);
CAPSULE_PATH.arc(-15.5, -33, 2, Math.PI * 0.5, Math.PI * 1.5);
CAPSULE_PATH.closePath();

// 頂層字型寬度快取
const charWidthCache = {};

/**
 * 等寬文字繪製輔助函式
 */
function textMonospace(ctx, text, x, y, cellWidth, mode = 'stroke') {
    ctx.textAlign = 'left';
    const fontKey = ctx.font;
    let cache = charWidthCache[fontKey];
    if (!cache) {
        cache = charWidthCache[fontKey] = {};
    }

    const isStroke = (mode === 'stroke');
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        let charWidth = cache[char];
        if (charWidth === undefined) {
            charWidth = ctx.measureText(char).width;
            cache[char] = charWidth;
        }

        const charX = x + (i * cellWidth) + ((cellWidth - charWidth) * 0.5);
        if (isStroke) {
            ctx.strokeText(char, charX, y);
        } else {
            ctx.fillText(char, charX, y);
        }
    }
}

/**
 * 繪製帶外框的外描邊文字
 */
function outlineText(ctx, text, x, y, fontSize, outlinePx = 2, {
    fillStyle = "#FFFFFF",
    strokeStyle = "#000000",
    strokeWidth = outlinePx,
    fontWeight = "bold",
    fontFamily = "combo",
    textAlign = "center",
    textBaseline = "middle",
    letterSpacing = "0px",
    shadowHeight = 0.3,
    cellWidth = fontSize * 0.8,
} = {}) {
    if (!text) return;
    const addedSpacing = letterSpacing ? fontSize * parseFloat(letterSpacing) : 0;
    const finalCellWidth = Math.max(cellWidth + addedSpacing, 0);

    let calX = x;
    if (textAlign === "center") {
        calX = x - ((text.length * finalCellWidth) * 0.5);
    } else if (textAlign === "right") {
        calX = x - (text.length * finalCellWidth);
    }

    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = textBaseline;
    ctx.fillStyle = fillStyle;
    ctx.lineWidth = strokeWidth;

    if (strokeWidth > 0) {
        ctx.strokeStyle = "#000";
        textMonospace(ctx, text, calX, y + shadowHeight, finalCellWidth, 'stroke');
        ctx.strokeStyle = strokeStyle;
        textMonospace(ctx, text, calX, y, finalCellWidth, 'stroke');
    }
    textMonospace(ctx, text, calX, y, finalCellWidth, 'fill');
    ctx.restore();
}

/**
 * 將 16 進位顏色調暗指定百分比
 */
function darkenHexColor(hex, percent) {
    let cleanHex = hex.replace(/^#/, '');
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(char => char + char).join('');
    }
    const num = parseInt(cleanHex, 16);
    const factor = 1 - (percent / 100);

    const r = Math.max(0, Math.floor((num >> 16) * factor));
    const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * factor));
    const b = Math.max(0, Math.floor((num & 0x0000FF) * factor));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * 簡易進度求值器
 */
function getAnimationProgress(t = 0, duration = 1) {
    return Math.min(Math.max(t / duration, 0), 1);
}

function aniCurve1(t) {
    return Math.pow(1 - 2 * t, 4);
}

/**
 * Simai 繪圖核心類別 (SimaiRenderer)
 * 負責渲染 maiMai 遊戲畫面、傳感器背景、Notes、Hold/Slide 與各項動畫效果
 */
export class SimaiRenderer {
    /**
     * @param {HTMLCanvasElement} canvas 繪圖畫布
     * @param {Object} settings 繪圖與遊戲設定
     */
    constructor(canvas, settings) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.settings = settings;
        this.images = null;
        this.globalTime = 0;

        this.scale = 0.98;

        // Tint 圖片動態快取
        this._tintCache = new Map();

        // EX note 顏色定義 (shared)
        this.exColor = exColor;

        // 傳感器與靜態背景快取
        this._sensorShapeCache = null;
        this._sensorTextCache = null;
        this._sensorCacheParams = { w: 0, h: 0, scale: this.scale };

        this._staticBackgroundCache = null;
        this._staticBackgroundCacheParams = { w: 0, h: 0, scale: this.scale };

        // 幾何 Sensor 判斷座標與內存測試 context
        this._dummyCtx = null;
        this._sensorPointCache = new Map();

        // 重用物件與狀態標記
        this._zoneCounts = new Int32Array(33);
        this.drawnBorders = new Uint8Array(33);
        this.hanabiEffect = Array.from({ length: 33 }, () => ({
            time: -99999, x: 0, y: 0, noteT: 0, isCenter: false, cleared: true
        }));
        this._tempColorConfig = { colorCode: '' };
        this._tempTransform = { t: 0, displayT: 0, currentScale: 0, scaleX: 1, scaleY: 1 };
        this._auxTextList = new Array(12);
        this.offscreen = null;

        // 中間顯示 Config 樣式
        this._middleDisplayConfig1 = { fillStyle: "#A1435D", strokeStyle: "#A6ABAE" };
        this._middleDisplayConfig2 = { fillStyle: "#A1435D", strokeStyle: "#A6ABAE", letterSpacing: -0.1 };
        this._middleDisplayConfigScore = { fillStyle: "#4061A8", strokeStyle: "#A6ABAE", letterSpacing: -0.1, textAlign: "right" };
        this._middleDisplayConfigDot = { fillStyle: "#4061A8", strokeStyle: "#A6ABAE", letterSpacing: -0.12, textAlign: "left" };
        this._middleDisplayConfigFrac = { fillStyle: "#4061A8", strokeStyle: "#A6ABAE", letterSpacing: -0.12, textAlign: "left" };
        this._middleDisplayConfigPercent = { fillStyle: "#4061A8", strokeStyle: "#A6ABAE", letterSpacing: -0.12, textAlign: "left" };

        // 打擊與持續判定特效池 (Hit / Hold Effect Pool)
        this._hitEffectQueue = [];
        this._hitEffectCount = 0;
        this._hitPosMap = new Int16Array(9).fill(-1);
        this._holdPosMap = new Int16Array(9).fill(-1);

        // 打擊判定文字特效佇列 (Judge Text / Break Effect Queue)
        this.judgeEffects = [];
    }

    getCanvasWH() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const invP = scaleBase / (Math.min(w, h) * this.scale);
        if (!this._canvasWH) {
            this._canvasWH = { width: 0, height: 0, halfWidth: 0, halfHeight: 0 };
        }
        this._canvasWH.width = w * invP;
        this._canvasWH.height = h * invP;
        this._canvasWH.halfWidth = w * invP * 0.5;
        this._canvasWH.halfHeight = h * invP * 0.5;
        return this._canvasWH;
    }

    /**
     * 預算座標縮放比例與中心偏移量，減少每幀重複計算
     */
    updateCanvasMetrics() {
        const { width: w, height: h } = this.canvas;
        const minDim = Math.min(w, h);
        this._p = minDim / scaleBase * this.scale;
        this._invP = scaleBase / (minDim * this.scale);
        this._hw = w * this._invP * 0.5;
        this._hh = h * this._invP * 0.5;
    }

    setImages(images) {
        this.images = images;
    }

    /**
     * 取得已強化的染色圖片（帶有 FIFO 清除機制的 LRU 快取）
     */
    getMemoizedTintedImage(imgKey, opacity, config) {
        if (!this.images || !this.images[imgKey]) return null;
        const cacheKey = `${imgKey}_${opacity.toFixed(2)}_${config.colorCode}`;

        let tinted = this._tintCache.get(cacheKey);
        if (tinted !== undefined) {
            return tinted;
        }

        tinted = getTintedImage(this.images[imgKey], opacity, config);

        // 避免一滿 200 個就清空全部導致 Frame Stutter，採用 FIFO 釋放前 50 個條目
        if (this._tintCache.size >= 250) {
            const iter = this._tintCache.keys();
            for (let i = 0; i < 50; i++) {
                const next = iter.next();
                if (next.done) break;
                this._tintCache.delete(next.value);
            }
        }
        this._tintCache.set(cacheKey, tinted);
        return tinted;
    }

    setContext(ctx) {
        this.canvas = ctx.canvas;
        this.ctx = ctx;
    }

    // --- 核心工具函式 ---

    drawImgAtcenter(img, size, offsetX = 0, offsetY = 0, imgWidthMul = 1, imgHeightMul = 1) {
        return drawImgAtcenter(this.ctx, img, size, offsetX, offsetY, imgWidthMul, imgHeightMul);
    }

    timeFunction(x) {
        return 0.02160482279616 * x * x * x - 0.07553691072 * x * x + 0.43509924 * x + 0.000250029;
    }

    touchTimeFunction(x) {
        if (x > 10.24938) return 1.62102;
        return 0.000753454 * x * x * x - 0.0298793 * x * x + 0.375038 * x + 0.104685;
    }

    // --- 視覺特效 (Effects) ---

    /**
     * 支援 Safari 原生 ctx.setAlpha 與標準 ctx.globalAlpha 回退
     * @param {number} alpha
     */
    setAlpha(alpha) {
        if (this.ctx.setAlpha) {
            this.ctx.setAlpha(alpha);
        } else {
            this.ctx.globalAlpha = alpha;
        }
    }

    /**
     * 佇列單次打擊光圈特效 (Hit Effect) - 具備同位置去重 (Deduplication)
     */
    queueHitEffect(pos, noteT, judge = null, x = null, y = null) {
        if (this.settings.drawHitEffect === false) return;
        if (judge && (judge.grade === 'MISS' || judge === 'MISS')) return;
        const decayTime = this.settings.effectDecayTime || 0.4;
        if (noteT / decayTime < -1 || noteT > 0.05) return;

        let px = x;
        let py = y;
        if (px === null || py === null) {
            if (pos && noteRefPos[pos - 1]) {
                const posInfo = noteRefPos[pos - 1];
                px = posInfo.x;
                py = posInfo.y;
            } else {
                px = 0;
                py = 0;
            }
        }

        // --- 同位置去重：防止同一位置重疊繪製多個光圈 ---
        if (pos && pos >= 1 && pos <= 8) {
            const existingIdx = this._hitPosMap[pos];
            if (existingIdx !== -1 && existingIdx < this._hitEffectCount) {
                const existing = this._hitEffectQueue[existingIdx];
                // 保留最新觸發（noteT 更接近 0）的特效
                if (noteT > existing.noteT) {
                    existing.x = px;
                    existing.y = py;
                    existing.noteT = noteT;
                    existing.judge = judge || existing.judge;
                }
                return;
            }
        } else {
            const thresholdSq = Math.pow(this.settings.noteBaseSize * 0.5, 2);
            for (let i = 0; i < this._hitEffectCount; i++) {
                const eff = this._hitEffectQueue[i];
                if (eff.type === 'hit') {
                    const dx = eff.x - px;
                    const dy = eff.y - py;
                    if (dx * dx + dy * dy < thresholdSq) {
                        if (noteT > eff.noteT) {
                            eff.x = px;
                            eff.y = py;
                            eff.noteT = noteT;
                            eff.judge = judge || eff.judge;
                        }
                        return;
                    }
                }
            }
        }

        let eff = this._hitEffectQueue[this._hitEffectCount];
        if (!eff) {
            eff = { type: 'hit', x: 0, y: 0, noteT: 0, judge: null, pos: 0 };
            this._hitEffectQueue[this._hitEffectCount] = eff;
        }
        eff.type = 'hit';
        eff.x = px;
        eff.y = py;
        eff.noteT = noteT;
        eff.judge = judge;
        eff.pos = pos || 0;

        if (pos && pos >= 1 && pos <= 8) {
            this._hitPosMap[pos] = this._hitEffectCount;
        }
        this._hitEffectCount++;
    }

    /**
     * 佇列持續按壓波紋特效 (Hold Effect) - 具備同位置去重 (Deduplication)
     */
    queueHoldEffect(pos, noteT, judge = null, x = null, y = null) {
        if (this.settings.drawHitEffect === false) return;
        if (judge && (judge.grade === 'MISS' || judge === 'MISS')) return;

        let px = x;
        let py = y;
        if (px === null || py === null) {
            if (pos && noteRefPos[pos - 1]) {
                const posInfo = noteRefPos[pos - 1];
                px = posInfo.x;
                py = posInfo.y;
            } else {
                px = 0;
                py = 0;
            }
        }

        // --- 同位置去重：防止同一位置重疊繪製多個波紋 ---
        if (pos && pos >= 1 && pos <= 8) {
            const existingIdx = this._holdPosMap[pos];
            if (existingIdx !== -1 && existingIdx < this._hitEffectCount) {
                const existing = this._hitEffectQueue[existingIdx];
                existing.x = px;
                existing.y = py;
                existing.noteT = noteT;
                existing.judge = judge || existing.judge;
                return;
            }
        } else {
            const thresholdSq = Math.pow(this.settings.noteBaseSize * 0.5, 2);
            for (let i = 0; i < this._hitEffectCount; i++) {
                const eff = this._hitEffectQueue[i];
                if (eff.type === 'hold') {
                    const dx = eff.x - px;
                    const dy = eff.y - py;
                    if (dx * dx + dy * dy < thresholdSq) {
                        eff.x = px;
                        eff.y = py;
                        eff.noteT = noteT;
                        eff.judge = judge || eff.judge;
                        return;
                    }
                }
            }
        }

        let eff = this._hitEffectQueue[this._hitEffectCount];
        if (!eff) {
            eff = { type: 'hold', x: 0, y: 0, noteT: 0, judge: null, pos: 0 };
            this._hitEffectQueue[this._hitEffectCount] = eff;
        }
        eff.type = 'hold';
        eff.x = px;
        eff.y = py;
        eff.noteT = noteT;
        eff.judge = judge;
        eff.pos = pos || 0;

        if (pos && pos >= 1 && pos <= 8) {
            this._holdPosMap[pos] = this._hitEffectCount;
        }
        this._hitEffectCount++;
    }

    /**
     * 清空打擊特效佇列與位置去重映射表
     */
    clearHitEffects() {
        this._hitEffectCount = 0;
        this._hitPosMap.fill(-1);
        this._holdPosMap.fill(-1);
    }

    /**
     * 獨立分離的打擊特效渲染通道 (Batch Hit Effects Pass)
     * 在所有音符繪製完成後統一執行，整幀只切換一次 lighter 混合模式
     */
    drawHitEffects() {
        if (this.settings.drawHitEffect === false || this._hitEffectCount === 0) {
            this.clearHitEffects();
            return;
        }

        const { ctx } = this;
        const count = this._hitEffectCount;
        const queue = this._hitEffectQueue;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < count; i++) {
            const eff = queue[i];
            if (eff.type === 'hit') {
                this.simpleHitEffect(eff.noteT, eff.judge, eff.x, eff.y, true);
            } else if (eff.type === 'hold') {
                this.simpleHoldEffect(eff.noteT, eff.judge, eff.x, eff.y, true);
            }
        }

        ctx.restore();
        this.clearHitEffects();
    }

    /**
     * 觸發單次打擊判定文字與圖片特效 (globalTime driven)
     * @param {Object} note 擊中的音符
     * @param {Object} judgeResult 判定結果物件 (grade, subGrade, isBreak, breakScoreValue 等)
     * @param {number|null} triggerTime 觸發時的譜面時間 (秒)，若為空則使用 this.globalTime
     */
    spawnJudgeEffect(note, judgeResult, triggerTime = null) {
        if (!this.isPlaying) return;
        if (!this.settings || this.settings.showJudge === false) return;
        if (!judgeResult) return;
        let x = 0, y = 0, rot = 0;
        let posKey = null;

        const noteType = note.type;
        const slideType = note.slideType || '';
        const isWifi = !!(note.isWifi || note.slideType === 'w');
        const startPos = note.pos;
        const endPos = note.slideEnd || note.pos;
        const rawContent = note.rawContent || note.slidePath || '';
        const wPaths = note.wPaths;

        if (note.type === 'slide') {
            if (noteRefPos[endPos - 1]) {
                x = noteRefPos[endPos - 1].x;
                y = noteRefPos[endPos - 1].y;
                rot = note.endTangent ?? 0;
                posKey = endPos;
            }
        } else if (note.type === 'touch') {
            const ref = touchRefPos[note.touchPos] ? touchRefPos[note.touchPos][note.pos - 1] : { x: 0, y: 0 };
            x = ref ? ref.x : 0;
            y = ref ? ref.y : 0;
            rot = ref ? ref.rot : 0;
            posKey = null; // Touch 音符走坐標距離去重
        } else if (noteRefPos[note.pos - 1]) {
            x = noteRefPos[note.pos - 1].x;
            y = noteRefPos[note.pos - 1].y;
            rot = noteRefPos[note.pos - 1].rot;
            posKey = note.pos;
        }

        const isBreak = !!note.isBreak;
        let breakScoreValue = judgeResult.breakScoreValue;
        if (isBreak && (breakScoreValue === undefined || breakScoreValue === null)) {
            if (judgeResult.grade === 'CRITICAL_PERFECT') {
                breakScoreValue = 2600;
            } else if (judgeResult.grade === 'PERFECT') {
                breakScoreValue = (judgeResult.breakMultiplier === 0.5) ? 2500 : 2550;
            } else if (judgeResult.grade === 'GREAT') {
                breakScoreValue = (judgeResult.scoreMultiplier <= 0.5) ? 1250 : ((judgeResult.scoreMultiplier <= 0.6) ? 1500 : 2000);
            } else if (judgeResult.grade === 'GOOD') {
                breakScoreValue = 1000;
            } else {
                breakScoreValue = 0;
            }
        }

        const text = isBreak ? `${breakScoreValue}` : (judgeResult.grade === 'CRITICAL_PERFECT' ? 'PERFECT' : judgeResult.grade);
        const startTime = (triggerTime !== null && triggerTime !== undefined) ? triggerTime : this.globalTime;
        const duration = noteType === 'slide' ? 0.3 : 0.2; // 300, 200 ms

        const isSlide = (noteType === 'slide');

        // --- 同位置去重 (Deduplication) 機制：確保 Slide 與 Tap 互不干擾，且不同 Slide 各自獨立繪製 ---
        if (isSlide) {
            // Slide 特效去重：同一個 Slide note 實例重複觸發時覆蓋更新；
            // 不同的 Slide 音符（即使相同 endPos，例如 2-5[4:1]/8-5[4:1]）各自獨立保留並繪製，絕不覆蓋彼此，亦不與 Tap 判定文字互相覆蓋
            for (let i = 0; i < this.judgeEffects.length; i++) {
                const existing = this.judgeEffects[i];
                if (existing.isSlide && existing.note === note) {
                    existing.text = text;
                    existing.isBreak = isBreak;
                    existing.breakScoreValue = breakScoreValue;
                    existing.subGrade = judgeResult.subGrade;
                    existing.grade = judgeResult.grade;
                    existing.startTime = startTime;
                    existing.duration = duration;
                    existing.x = x;
                    existing.y = y;
                    existing.rot = rot;
                    existing.posKey = posKey;
                    existing.noteType = noteType;
                    existing.slideType = slideType;
                    existing.isWifi = isWifi;
                    existing.startPos = startPos;
                    existing.endPos = endPos;
                    existing.rawContent = rawContent;
                    existing.wPaths = wPaths;
                    return;
                }
            }
        } else {
            // 非 Slide 音符 (Tap / Hold / Touch 等)：防止連打時同一位置重疊繪製多個判定文字 (絕不覆蓋 Slide 特效)
            if (posKey && posKey >= 1 && posKey <= 8) {
                for (let i = 0; i < this.judgeEffects.length; i++) {
                    const existing = this.judgeEffects[i];
                    if (!existing.isSlide && existing.posKey === posKey) {
                        existing.text = text;
                        existing.isBreak = isBreak;
                        existing.breakScoreValue = breakScoreValue;
                        existing.subGrade = judgeResult.subGrade;
                        existing.grade = judgeResult.grade;
                        existing.startTime = startTime;
                        existing.duration = duration;
                        existing.x = x;
                        existing.y = y;
                        existing.rot = rot;
                        existing.posKey = posKey;
                        existing.noteType = noteType;
                        existing.slideType = slideType;
                        existing.isWifi = isWifi;
                        existing.startPos = startPos;
                        existing.endPos = endPos;
                        existing.rawContent = rawContent;
                        existing.wPaths = wPaths;
                        return;
                    }
                }
            } else {
                // Touch 音符或任意坐標：採用距離平方比對 (阈值設為 noteBaseSize 半徑範圍)
                const thresholdSq = Math.pow((this.settings.noteBaseSize || 11) * 0.75, 2);
                for (let i = 0; i < this.judgeEffects.length; i++) {
                    const existing = this.judgeEffects[i];
                    if (!existing.isSlide) {
                        const dx = existing.x - x;
                        const dy = existing.y - y;
                        if (dx * dx + dy * dy < thresholdSq) {
                            existing.text = text;
                            existing.isBreak = isBreak;
                            existing.breakScoreValue = breakScoreValue;
                            existing.subGrade = judgeResult.subGrade;
                            existing.grade = judgeResult.grade;
                            existing.startTime = startTime;
                            existing.duration = duration;
                            existing.x = x;
                            existing.y = y;
                            existing.rot = rot;
                            existing.posKey = posKey;
                            existing.noteType = noteType;
                            existing.slideType = slideType;
                            existing.isWifi = isWifi;
                            existing.startPos = startPos;
                            existing.endPos = endPos;
                            existing.rawContent = rawContent;
                            existing.wPaths = wPaths;
                            return;
                        }
                    }
                }
            }
        }

        this.judgeEffects.push({
            note,
            isSlide,
            posKey,
            text,
            isBreak,
            breakScoreValue,
            subGrade: judgeResult.subGrade,
            grade: judgeResult.grade,
            startTime,
            duration,
            x,
            y,
            rot,
            noteType,
            slideType,
            isWifi,
            startPos,
            endPos,
            rawContent,
            wPaths
        });

        if (this.judgeEffects.length > 25) {
            this.judgeEffects.shift();
        }
    }

    queueJudgeEffect(note, judgeResult, triggerTime = null) {
        if (!this.isPlaying) return;
        this.spawnJudgeEffect(note, judgeResult, triggerTime);
    }

    clearJudgeEffects() {
        if (this.judgeEffects) {
            this.judgeEffects.length = 0;
        }
    }

    /**
     * 依據 MajdataPlay 規範，根據 Slide 類型、起終點與判定等級取得 Slide 專屬 JUST / MISS 圖片 Key
     * 參考來源: MajdataPlay SlideOK.cs, CustomSkin.cs, NoteHelper.cs, NoteLoader.cs
     * @param {Object} eff 特效物件
     * @param {Object} images 圖片資源表
     * @returns {string|null}
     */
    getSlideJustImageKey(eff, images) {
        if (!eff || eff.noteType !== 'slide') return null;

        const startPos = Number(eff.startPos || 1);
        const endPos = Number(eff.endPos || eff.startPos || 1);
        const slideType = String(eff.slideType || '');
        const raw = String(eff.rawContent || slideType);
        const showCP = (this.settings.showBreakCriticalPerfect !== false) && (this.settings.showCriticalPerfect !== false);

        // 1. 判斷 Shape: 'curv', 'str', 'wifi'
        // 參照 MajdataPlay: NoteHelper.GetSlideOKShapeFromSlideType
        let shape = 'str';
        const isWifi = !!(eff.isWifi || slideType === 'w');
        const isCurv = !isWifi && (
            slideType === '^' || slideType === '<' || slideType === '>' ||
            slideType.includes('circle') ||
            raw.includes('^') || raw.includes('<') || raw.includes('>')
        );

        if (isWifi) {
            shape = 'wifi';
        } else if (isCurv) {
            shape = 'curv';
        } else {
            shape = 'str';
        }

        // 2. 判斷 Direction: R vs L (Wifi 為 U vs D)
        // 參照 MajdataPlay: NoteCreateHelper.DetectJustType(content, out endPos)
        // IsUpperHalf: 7, 8, 1, 2
        // IsRightHalf: 1, 2, 3, 4
        const isUpperHalf = (pos) => (pos === 7 || pos === 8 || pos === 1 || pos === 2);
        const isRightHalf = (pos) => (pos >= 1 && pos <= 4);

        let isJustR = false;
        if (isWifi) {
            isJustR = isUpperHalf(endPos);
        } else if (slideType === '>' || raw.includes('>')) {
            isJustR = isUpperHalf(startPos);
        } else if (slideType === '<' || raw.includes('<')) {
            isJustR = !isUpperHalf(startPos);
        } else if (slideType === '^' || raw.includes('^')) {
            const diff = (endPos - startPos + 8) % 8;
            isJustR = (diff < 4);
        } else {
            // 直線與折線 (-, v, V, s, z, p, q, pp, qq 等)
            isJustR = isRightHalf(endPos);
        }

        const dir = (shape === 'wifi') ? (isJustR ? 'u' : 'd') : (isJustR ? 'r' : 'l');
        const state = `${shape}_${dir}`;

        // 3. 根據 Grade 與 SubGrade 選擇對應的圖片 Key
        // 參照 MajdataPlay: SlideOK.cs 與 CustomSkin.cs
        if (eff.grade === 'MISS') {
            const missKey = `miss_${state}`;
            if (images && images[missKey] && !imgNotExists(images[missKey])) {
                return missKey;
            }
            return null; // fallback 到一般 judge_text_miss
        }

        let candidateKey = null;
        if (eff.grade === 'CRITICAL_PERFECT' || eff.grade === 'PERFECT') {
            candidateKey = showCP ? `just_${state}` : `just_${state}_p`;
        } else if (eff.grade === 'GREAT') {
            candidateKey = (eff.subGrade === 'FAST') ? `just_${state}_fast_gr` : `just_${state}_late_gr`;
        } else if (eff.grade === 'GOOD') {
            candidateKey = (eff.subGrade === 'FAST') ? `just_${state}_fast_gd` : `just_${state}_late_gd`;
        }

        if (candidateKey && images && images[candidateKey] && !imgNotExists(images[candidateKey])) {
            return candidateKey;
        }

        const fallbackKey = `just_${state}`;
        if (images && images[fallbackKey] && !imgNotExists(images[fallbackKey])) {
            return fallbackKey;
        }

        return null;
    }

    /**
     * 獨立的打擊判定文字/圖片與閃爍特效渲染通道 (Judge Effects Pass - globalTime driven)
     * @param {number|null} currentTime 當前譜面時間 (秒)，若為空則使用 this.globalTime
     */
    drawJudgeEffects(currentTime = null) {
        if (!this.isPlaying) return;
        if (!this.settings || this.settings.showJudge === false) return;
        if (!this.judgeEffects || this.judgeEffects.length === 0) return;
        const now = (currentTime !== null && currentTime !== undefined) ? currentTime : this.globalTime;
        const ctx = this.ctx;
        const images = this.images;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = this.judgeEffects.length - 1; i >= 0; i--) {
            const eff = this.judgeEffects[i];
            const elapsed = now - eff.startTime;
            const isSlide = eff.noteType === 'slide';
            const isWifiEff = eff.isWifi;
            // 若時間已超過持續時間，或使用者大幅快退 (超過 0.2 秒)，移除該特效
            if (elapsed > eff.duration || elapsed < -0.2) {
                this.judgeEffects.splice(i, 1);
                continue;
            }
            if (elapsed < 0) {
                continue; // 尚未到達觸發時間
            }

            const progress = elapsed / eff.duration;
            const alpha = Math.max(0,
                ((progress < 0.375 && isSlide) ?
                    ((progress / 0.375)) :
                    ((1 - progress) < 0.375 ?
                        1 - (progress - 0.625) / 0.375 : 1.0)));
            const distOffset = isSlide ? 0 : -8;
            const angle = Math.atan2(eff.y, eff.x);
            const curX = eff.x + (eff.x === 0 && eff.y === 0 ? 0 : Math.cos(angle) * distOffset);
            const curY = eff.y + (eff.x === 0 && eff.y === 0 ? -distOffset : Math.sin(angle) * distOffset);
            const rot = eff.rot;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(curX, curY);
            ctx.rotate(rot);

            // 擊中彈出縮放效果 (前 0.07 秒內從 1.25 縮至 1.0)
            const popScale = (progress < 0.375 && !isSlide) ? (1.25 - 0.25 * (progress / 0.375)) : 1.0;
            ctx.scale(popScale, popScale);

            // 嘗試取得 Slide 專屬 JUST / MISS 圖片 (參照 MajdataPlay)
            const slideJustKey = this.getSlideJustImageKey(eff, images);
            let imgKey = null;
            let isBreakFlashing = false;
            let isSlideJust = false;

            if (slideJustKey && images && images[slideJustKey] && !imgNotExists(images[slideJustKey])) {
                imgKey = slideJustKey;
                isSlideJust = true;
                if (eff.isBreak && eff.grade === 'CRITICAL_PERFECT') {
                    isBreakFlashing = false;
                }
            } else {
                if (eff.isBreak) {
                    if (eff.grade === 'CRITICAL_PERFECT') {
                        const showCP = (this.settings.showBreakCriticalPerfect !== false) && (this.settings.showCriticalPerfect !== false);
                        if (showCP) {
                            imgKey = 'judge_text_cPerfect_break';
                        } else {
                            imgKey = 'judge_text_perfect_break';
                        }
                        isBreakFlashing = true;
                    } else if (eff.grade === 'PERFECT') {
                        imgKey = 'judge_text_perfect_break';
                        isBreakFlashing = false;
                    } else if (eff.grade === 'GREAT') {
                        imgKey = 'judge_text_great';
                    } else if (eff.grade === 'GOOD') {
                        imgKey = 'judge_text_good';
                    } else {
                        imgKey = 'judge_text_miss';
                    }
                } else {
                    if (eff.grade === 'CRITICAL_PERFECT') {
                        if (this.settings.showCriticalPerfect !== false) {
                            imgKey = 'judge_text_normal'; // normal 是 CRITICAL PERFECT
                        } else {
                            imgKey = 'judge_text_perfect';
                        }
                    } else if (eff.grade === 'PERFECT') {
                        imgKey = 'judge_text_perfect';
                    } else if (eff.grade === 'GREAT') {
                        imgKey = 'judge_text_great';
                    } else if (eff.grade === 'GOOD') {
                        imgKey = 'judge_text_good';
                    } else {
                        imgKey = 'judge_text_miss';
                    }
                }
            }

            const img = (images && imgKey) ? images[imgKey] : null;
            const hasValidImg = img && !imgNotExists(img);

            let judgeWidth = 20.0;
            let judgeHeight = judgeWidth * (82 / 223); // 約 7.35

            if (isSlideJust && hasValidImg) {
                // Slide 專屬素材尺寸依 MajdataPlay 規範：WiFi 寬度約 32，Curv / Str 寬度約 24
                judgeWidth = (isWifiEff ? 37.0 : 24.0) * 1.65;
                judgeHeight = judgeWidth * (img.naturalHeight / img.naturalWidth);
            }

            if (hasValidImg) {
                if (isBreakFlashing && !isSlide) {
                    // Break 文字/JUST 閃爍動畫：以 globalTime 驅動高頻閃爍 (約每 0.034 秒切換一次)
                    const normalImg = images ? images[this.settings.showCriticalPerfect !== false ? 'judge_text_normal' : 'judge_text_perfect'] : null;
                    const isFlash = Math.floor(elapsed / 0.03) % 3 === 0;

                    ctx.save();
                    if (isFlash) {
                        ctx.drawImage(img, -judgeWidth / 2, -judgeHeight / 2, judgeWidth, judgeHeight);
                    } else {
                        const altImg = (!isSlideJust && normalImg && !imgNotExists(normalImg)) ? normalImg : img;
                        ctx.drawImage(altImg, -judgeWidth / 2, -judgeHeight / 2, judgeWidth, judgeHeight);
                    }
                    ctx.restore();
                } else {
                    const slideFlip = (imgKey && (imgKey.includes('_l') || imgKey.includes('_d')));
                    const isCruvSlide = (imgKey && (imgKey.includes('curv')));
                    const strSlideOffset = this.getSlideOffset(eff, slideFlip, isCruvSlide);
                    ctx.save();
                    ctx.rotate(isSlide ? Math.PI * (isWifiEff * 0.5 + slideFlip + isCruvSlide * (slideFlip ? 0.15 : -0.165)) : 0);
                    ctx.drawImage(img,
                        (isSlide ? (!slideFlip * -judgeWidth + (slideFlip - 0.5) * strSlideOffset.x) : -judgeWidth / 2),
                        -judgeHeight / 2 + isSlide * ((isCruvSlide ? -2.7 : 2) + strSlideOffset.y),

                        judgeWidth, judgeHeight);
                    ctx.restore();
                }
            }

            // 渲染 FAST / LATE 副標籤
            // 注意：Slide 專屬 JUST 圖片 (如 just_curv_l_fast_gr) 本身已印有 FAST/LATE 字樣，若為 Slide JUST 則跳過副標籤繪製
            const showFastLate = !isSlideJust && (this.settings.showFastLate !== false) && !!eff.subGrade;
            if (showFastLate) {
                const subKey = eff.subGrade === 'FAST' ? 'fast' : 'late';
                const subImg = (images && images[subKey]) ? images[subKey] : null;
                if (subImg && !imgNotExists(subImg)) {
                    const subWidth = 4.8 * 4;
                    const subHeight = subWidth * (82 / 223); // 約 1.76
                    const subY = (judgeHeight / 2) + 0.6;
                    ctx.drawImage(subImg, -subWidth / 2, subY - subHeight / 2, subWidth, subHeight);
                }
            }

            // Break 額外數值 (2600, 2550 等)
            // no ai slop
            /*if (eff.isBreak && eff.breakScoreValue !== undefined && eff.breakScoreValue !== null) {
                ctx.save();
                const scoreY = showFastLate ? ((judgeHeight / 2) + 2.1) : ((judgeHeight / 2) + 1.2);
                ctx.font = 'bold 1.6px combo';
                ctx.fillStyle = '#fff4a3';
                ctx.shadowColor = '#ffbb00';
                ctx.shadowBlur = 3;
                ctx.fillText(`${eff.breakScoreValue}`, 0, scoreY);
                ctx.restore();
            }*/

            ctx.restore();
        }
        ctx.restore();
    }

    getSlideOffset(eff, flip, cruv) {
        const slideType = eff.slideType;
        const ps = (eff.startPos - eff.endPos + 8) % 8;
        switch (slideType) {
            case 'w': {
                if (flip) return { x: -60, y: -7 };
                return { x: -61, y: 3 };
            }
            case '-': {
                if (ps == 3 || ps == 5) return { x: -1, y: -0.5 };
                return { x: 3, y: -0.5 };
            }
            case 'pp':
            case 'qq':
                return { x: 3, y: -0.5 };
            default:
                return { x: 0, y: 0, rot: 0 };
        }
    }

    simpleHitEffect(noteT, judge = null, x = 0, y = 0, isBatch = false) {
        const t = noteT / this.settings.effectDecayTime;
        if (t < -1) return;
        const { ctx } = this;
        if (!isBatch) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
        }
        const decayAlpha = 1 - Math.max(0, -t);
        const radius = 0.8 * this.settings.noteBaseSize * (1 - decayAlpha);

        ctx.strokeStyle = getJudgeRgba(judge, 0.8 * decayAlpha);
        ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();

        if (!isBatch) {
            ctx.restore();
        }
    }

    simpleHanabi(noteT, isCenter) {
        const t = noteT / this.settings.hanabiEffectDecayTime;
        if (t < -1) return;
        const { ctx } = this;
        ctx.save();
        const ease = (x) => 1 - Math.pow(1 - x, 2);
        const decayAlpha = 1 - Math.max(0, -t);
        const radius = (3 + isCenter * 1) * this.settings.noteBaseSize * ease(1 - decayAlpha);

        const color = ctx.createLinearGradient(-radius, -radius, radius, radius);
        color.addColorStop(0, "#00D5FF");
        color.addColorStop(0.4, "#FF00FF");
        color.addColorStop(0.8, "#FFD823");
        color.addColorStop(1, "#FFD823");

        const white = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.3);
        white.addColorStop(0, "#ffffff00");
        white.addColorStop(0.4, "#ffffff00");
        white.addColorStop(0.8, "#ffffff8b");
        white.addColorStop(1, "#ffffff00");

        ctx.globalAlpha = decayAlpha;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = white;
        ctx.globalAlpha = decayAlpha * 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.lineWidth = 1.4 * decayAlpha * this.settings.noteBaseSize * (1 - ease(Math.max(0, -t)));
        ctx.strokeStyle = color;
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.globalAlpha = decayAlpha * 0.5;
        ctx.fill();
        ctx.restore();
    }

    richHanabi(noteT) {
        const t = noteT / this.settings.hanabiEffectDecayTime;
        if (t < -1) return;
        const invt = clamp(-t, 0, 1);

        this.offscreen = this.offscreen || (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas'));

        function easeOutExpo(x) {
            return x === 1 ? 1 : 1 - Math.pow(2, -40 * x);
        }

        function getCustomCurveClamped(x) {
            let val;
            if (x <= 0.3) {
                val = 1 - Math.pow(2, -10 * x) + Math.pow(2, -3);
            } else {
                const diff = 0.3 - x;
                val = 1 - (diff * diff) / 0.49;
            }
            return Math.max(0, Math.min(1, val));
        }

        const ctx = this.ctx;
        const decayAlpha = getCustomCurveClamped(-t);

        const canvasWH = this.getCanvasWH();
        this.offscreen.width = canvasWH.width;
        this.offscreen.height = canvasWH.height;

        const offctx = this.offscreen.getContext('2d');
        if (!offctx) return;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        if (this.images && this.images.ColorBall) {
            this.drawImgAtcenter(this.images.ColorBall, this.settings.noteBaseSize * 3.8, 0, 0);
        }
        const slices = 30;
        const slicePath = new Path2D();
        const tOffset = t * 0.1;
        const tFive = t * 5 + 5;

        for (let slice = 1; slice < slices; slice += 2) {
            const angle = ((slice - 0.5) / slices + tOffset) * Math.PI * 2;
            const angle1 = ((slice + 0.5) / slices + tOffset) * Math.PI * 2;

            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const cosA1 = Math.cos(angle1);
            const sinA1 = Math.sin(angle1);

            offctx.beginPath();
            offctx.lineWidth = 1.5;
            offctx.fillStyle = RICH_HANABI_COLOR_MAP[Math.floor((slice + tFive) % 5)];
            offctx.moveTo(0, 0);
            offctx.lineTo(cosA * 50, sinA * 50);
            offctx.lineTo(cosA1 * 50, sinA1 * 50);
            offctx.closePath();
            offctx.fill();

            slicePath.moveTo(0, 0);
            slicePath.lineTo(cosA * 50, sinA * 50);
            slicePath.lineTo(cosA1 * 50, sinA1 * 50);
            slicePath.closePath();
        }

        ctx.restore();
        ctx.save();
        ctx.clip(slicePath);
        ctx.fillStyle = "white";

        const tPhase = t * Math.PI * 2.2;
        const distFactor = Math.PI * 0.08;

        ctx.beginPath();
        ctx.globalAlpha = 0.3;
        for (let y = -50; y < 50; y += 1.5) {
            const y2 = y * y;
            ctx.lineTo(-50, y - 1.5);
            for (let x = -50; x < 50; x += 1.5) {
                const distSq = x * x + y2;
                if (distSq > 2500) continue;
                const dist = Math.sqrt(distSq);
                const size = (Math.sin(dist * distFactor + tPhase) + 1.2) / 2.5;
                if (size > 0) {
                    ctx.arc(x, y, size, 0, 2 * Math.PI);
                }
            }
            ctx.lineTo(50, y + 1.5);
            ctx.lineTo(50, y);
            ctx.lineTo(-50, y);
        }
        ctx.fill();
        ctx.restore();
    }

    simpleHoldEffect(noteT, judge = null, x = 0, y = 0, isBatch = false) {
        const { ctx } = this;
        if (!isBatch) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
        }
        const t = noteT * -2;
        const decayAlpha = 1 - Math.max(0, t % 1);
        const decayAlpha1 = 1 - Math.max(0, (t + 0.5) % 1);
        const radius = 0.6 * this.settings.noteBaseSize * (1 - decayAlpha);
        const radius1 = 0.6 * this.settings.noteBaseSize * (1 - decayAlpha1);

        ctx.strokeStyle = getJudgeRgba(judge, 0.6 * decayAlpha);
        ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = getJudgeRgba(judge, 0.6 * decayAlpha1);
        ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha1;
        ctx.beginPath();
        ctx.arc(x, y, radius1, 0, Math.PI * 2);
        ctx.stroke();

        if (!isBatch) {
            ctx.restore();
        }
    }

    getNoteTransform(noteT, speedMult = 1, size = null) {
        const speed = this.settings.speed * speedMult;
        let piecewiseSpeed;
        if (speed >= 1) {
            piecewiseSpeed = speed * 0.8833 + 0.8167;
        } else if (speed <= -1) {
            piecewiseSpeed = speed * 0.8833 - 0.8167;
        } else {
            piecewiseSpeed = speed * 1.7;
        }

        const progress = noteT * piecewiseSpeed;
        const t = 1 - this.timeFunction(progress);
        const displayT = Math.max(this.settings.middleDistance, t);
        const currentScale = t < this.settings.middleDistance
            ? Math.max(0, (t + 0.9) / (0.9 + this.settings.middleDistance))
            : 1;

        let scaleX = 1;
        let scaleY = 1;
        if (typeof size === 'number') {
            scaleX = size;
            scaleY = size;
        } else if (Array.isArray(size)) {
            scaleX = size[0] ?? 1;
            scaleY = size[1] ?? size[0] ?? 1;
        }

        this._tempTransform.t = t;
        this._tempTransform.displayT = displayT;
        this._tempTransform.currentScale = currentScale;
        this._tempTransform.scaleX = scaleX;
        this._tempTransform.scaleY = scaleY;
        return this._tempTransform;
    }

    // --- 主渲染流程 (Main Render Frame) ---

    drawFrame(state) {
        const { ctx } = this;
        const {
            globalTime,
            buckets,
            dt,
            showSensor,
            showSensorText,
            activeSensors,
            playCombo,
            playScore,
            playScoreRes,
            playScoreMinus,
            noteQuantity = { tap: 0, hold: 0, slide: 0, touch: 0, break: 0 },
            isPlaying,
            playing,
        } = state;

        this.globalTime = globalTime;
        this.playCombo = playCombo;
        this.playScore = playScore;
        this.playScoreMinus = (playScoreMinus !== undefined) ? playScoreMinus : 101;
        this.isPlaying = (isPlaying !== undefined) ? !!isPlaying : (playing !== undefined ? !!playing : false);

        if (!this.isPlaying) {
            this.clearJudgeEffects();
        }

        if (!this.images) return;

        // 計算當前觸控感應區數量
        const currentTouchNotes = buckets.touch || [];
        const zoneCounts = this._zoneCounts;
        zoneCounts.fill(0);

        for (let idx = 0; idx < currentTouchNotes.length; idx++) {
            const n = currentTouchNotes[idx];
            const t = n.time - globalTime;
            const isActive = n.holdDuration ? (-t <= n.holdDuration) : (t > 0);
            if (isActive) {
                const zoneKey = TOUCH_GROUP_TO_INDEX[n.touchPos] + (n.touchPos === 'C' ? 0 : n.pos - 1);
                zoneCounts[zoneKey]++;
            }
        }
        this.drawnBorders.fill(0);

        // 清理 Hanabi 特效標記
        const hanabiEffect = this.hanabiEffect;
        for (let i = 0; i < 33; i++) {
            hanabiEffect[i].cleared = true;
            hanabiEffect[i].time = -99999;
        }

        // 1. 更新座標指標與視口
        this.updateCanvasMetrics();
        const { _hw: hw, _hh: hh, canvas: { width: w, height: h } } = this;

        // 2. 清除畫面
        if (!state.skipClear) {
            ctx.clearRect(-hw, -hh, w, h);
        }

        // 3. 按視覺分層繪製
        const shouldDrawHighlight = (this.settings.sensorHighlight !== false) && activeSensors && activeSensors.size > 0;
        if (showSensor || showSensorText || shouldDrawHighlight) {
            this.drawSensors(showSensor, showSensorText, shouldDrawHighlight ? activeSensors : null);
        }

        this.drawMiddleDisplay();

        for (let i = 0; i < currentTouchNotes.length; i++) {
            this.getTouchHanabi(currentTouchNotes[i]);
        }
        this.drawHanabiEffects();

        const slideNotes = buckets.slide || [];
        // 1. 先繪製所有 Slide 的軌跡 (底層)
        for (let i = 0; i < slideNotes.length; i++) {
            this.drawSlideTrack(slideNotes[i]);
        }
        // 2. 再繪製所有 Slide 的星星 (頂層，確保星星不被任何軌跡覆蓋)
        for (let i = 0; i < slideNotes.length; i++) {
            this.drawSlideStar(slideNotes[i]);
        }

        const tapnHoldNotes = buckets.tapnhold || [];
        for (let i = 0; i < tapnHoldNotes.length; i++) {
            const n = tapnHoldNotes[i];
            if (n.type === "hold") this.drawHold(n);
            else if (n.isStar) this.drawStar(n);
            else this.drawTap(n);
        }

        for (let i = 0; i < currentTouchNotes.length; i++) {
            this.drawTouch(currentTouchNotes[i]);
        }

        // --- 獨立分離的打擊特效層 (Hit & Judge Effects Pass) ---
        this.drawHitEffects();
        this.drawJudgeEffects();

        this.drawStaticBackground();

        if (this.settings.renderSurroundingAuxiliaryText) {
            this.drawAuxiliaryText(dt, globalTime, noteQuantity, playScoreRes, playCombo, playScore, this.playScoreMinus);
        }
        if (this.settings.showUI) {
            this.drawUI(dt, globalTime);
        }
    }

    /**
     * 繪製載入與譜面資訊卡動畫
     */
    drawLoadingIntro({
        t = 0,
        duration = 5,
        backgroundImage = null,
        chartInfo = {},
    } = {}) {
        const ctx = this.ctx;
        ctx.save();
        this.updateCanvasMetrics();
        const dur = (duration - t);

        let img = null;
        if (backgroundImage) {
            if (backgroundImage instanceof HTMLImageElement || backgroundImage instanceof HTMLCanvasElement || (window.ImageBitmap && backgroundImage instanceof ImageBitmap)) {
                img = backgroundImage;
            } else if (backgroundImage instanceof Blob || backgroundImage instanceof File) {
                if (!this._introBlobImgCache || this._introBlobImgCache._blob !== backgroundImage) {
                    if (this._introBlobImgCache && this._introBlobImgCache._url) {
                        URL.revokeObjectURL(this._introBlobImgCache._url);
                    }
                    const url = URL.createObjectURL(backgroundImage);
                    const imgEl = new Image();
                    imgEl._blob = backgroundImage;
                    imgEl._url = url;
                    imgEl.src = url;
                    this._introBlobImgCache = imgEl;
                }
                if (this._introBlobImgCache.complete && this._introBlobImgCache.naturalWidth > 0) {
                    img = this._introBlobImgCache;
                }
            } else if (typeof backgroundImage === 'string') {
                if (!this._introStrImgCache || this._introStrImgCache.src !== backgroundImage) {
                    const imgEl = new Image();
                    imgEl.src = backgroundImage;
                    this._introStrImgCache = imgEl;
                }
                if (this._introStrImgCache.complete && this._introStrImgCache.naturalWidth > 0) {
                    img = this._introStrImgCache;
                }
            }
        }

        if (!img && this.images && this.images['no_image']) {
            img = this.images['no_image'];
        }

        ctx.beginPath();
        ctx.arc(0, 0, scaleBase * 0.5, 0, Math.PI * 2);
        ctx.clip('evenodd');

        if (dur > 0.6) {
            ctx.save();
            ctx.filter = 'blur(10px) brightness(0.8)';
            this.drawImgAtcenter(img, 110);
            ctx.restore();

            ctx.save();
            const introProgress = getAnimationProgress(t, 0.5);
            const scaleP = 1 - easeOutQuad(introProgress);
            ctx.globalAlpha = 1 - scaleP;
            ctx.scale(scaleP * 0.3 + 1, scaleP * 0.3 + 1);

            const levelColor = LEVEL_COLORS[chartInfo.difficulty ?? 5] || "#A356E9";
            const levelColorDark = darkenHexColor(levelColor, 40);
            const lvText = (chartInfo.lv || '').replaceAll('+', '');
            const isPlus = (chartInfo.lv || '').includes('+');
            const difficultyText = LEVEL_NAMES[chartInfo.difficulty] || '';

            ctx.strokeStyle = levelColorDark;
            ctx.lineWidth = 0.25;
            ctx.stroke(CARD_PATH);
            ctx.clip(CARD_PATH);

            ctx.fillStyle = levelColor;
            ctx.fillRect(-20, -50, 40, 100);

            ctx.strokeStyle = "rgba(255,255,255,0.3)";
            ctx.beginPath();
            ctx.lineWidth = 1.6;
            ctx.arc(0, -12.5, 17, Math.PI * 0.25, Math.PI * 0.75, true);
            ctx.stroke();

            ctx.strokeStyle = "rgba(255,255,255,0.2)";
            ctx.beginPath();
            ctx.arc(0, -12.5, 16, Math.PI * 0.25, Math.PI * 0.75, true);
            ctx.stroke();

            ctx.fillStyle = "black";
            ctx.fillRect(-15, -27.5, 30, 30);
            ctx.fillStyle = "#093F80";
            ctx.fillRect(-20, 7.5, 40, 5);
            ctx.fillStyle = "#052E5B";
            ctx.fillRect(-20, 12.5, 40, 3.5);
            ctx.fillStyle = "white";
            ctx.fillRect(-20, 16, 40, 15);
            ctx.fill(CAPSULE_PATH);

            ctx.font = "1.9px title";
            ctx.textAlign = "center";
            ctx.fillText(chartInfo.title || '', 0, 11);
            ctx.font = '1.8px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            ctx.fillText(chartInfo.artist || '', 0, 14.8);

            ctx.fillStyle = "#093F80";
            ctx.textAlign = "left";
            ctx.font = "1.2px title";
            ctx.fillText("NOTES DESIGNER", -17, 23.5);
            ctx.font = '1.8px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            ctx.fillText(chartInfo.des || '', -17, 25.5);

            ctx.font = "bold 2.5px title";
            ctx.textAlign = "center";
            ctx.fillText("CUSTOM", -9, -32);

            if (img) {
                this.drawImgAtcenter(img, 29.8 - scaleP * 10, 0, -12.5);
            }

            ctx.lineWidth = 0.3;
            ctx.strokeStyle = levelColor;
            ctx.stroke(LV_PATH);
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.fill(LV_PATH);

            ctx.fillStyle = "white";
            ctx.shadowColor = "#000000a0";
            ctx.shadowBlur = 4;
            ctx.textAlign = "center";
            ctx.lineWidth = 0.75;
            ctx.font = 'bold 3.5px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            outlineText(ctx, difficultyText, -6.4, 6);

            ctx.shadowColor = "";
            ctx.shadowBlur = 0;
            ctx.strokeStyle = levelColorDark;
            ctx.textAlign = "left";
            ctx.lineWidth = 0.4;
            ctx.font = 'bold 2.5px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            outlineText(ctx, "LV", 6.4, 6);

            ctx.textAlign = "center";
            ctx.font = 'bold 5.5px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            ctx.letterSpacing = "-0.5px";
            ctx.lineWidth = 0.5;
            outlineText(ctx, lvText, 12, 6.5);

            ctx.font = 'bold 3.6px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            ctx.textAlign = "left";
            outlineText(ctx, isPlus ? "+" : "", 13.8 + (lvText.length - 1), 3.5);
            ctx.restore();
        }

        // 入場閃光動畫
        ctx.save();
        if (t < 0.2) {
            const s = getAnimationProgress(t, 0.2);
            const offset = easeInBack(s);
            ctx.rotate(Math.PI * 0.25);

            ctx.fillStyle = "#FFF";
            ctx.fillRect(offset * 50, -50, 50, 100);
            ctx.fillStyle = "#84FEED";
            ctx.fillRect(offset * 20 + 31, -50, 50, 100);
            ctx.fillStyle = "#2DD4ED";
            ctx.fillRect(offset * 10 + 41, -50, 50, 100);

            ctx.rotate(Math.PI);
            ctx.fillStyle = "#FFF";
            ctx.fillRect(offset * 50, -50, 50, 100);
            ctx.fillStyle = "#84FEED";
            ctx.fillRect(offset * 20 + 31, -50, 50, 100);
            ctx.fillStyle = "#2DD4ED";
            ctx.fillRect(offset * 10 + 41, -50, 50, 100);
        }
        ctx.restore();

        // 退場轉場動畫
        if (dur < 0.8 && t < duration) {
            ctx.save();
            const s = getAnimationProgress(0.8 - dur, 0.4);
            const offset = aniCurve1(s);
            ctx.rotate(Math.PI * 0.25);

            ctx.fillStyle = "#FFF";
            ctx.fillRect(offset * 50, -50, 50, 100);
            ctx.fillStyle = "#84FEED";
            ctx.fillRect(offset * 20 + 31, -50, 50, 100);
            ctx.fillStyle = "#2DD4ED";
            ctx.fillRect(offset * 10 + 41, -50, 50, 100);

            ctx.rotate(Math.PI);
            ctx.fillStyle = "#FFF";
            ctx.fillRect(offset * 50, -50, 50, 100);
            ctx.fillStyle = "#84FEED";
            ctx.fillRect(offset * 20 + 31, -50, 50, 100);
            ctx.fillStyle = "#2DD4ED";
            ctx.fillRect(offset * 10 + 41, -50, 50, 100);
            ctx.restore();
        }

        ctx.restore();
    }

    drawUI(dt, globalTime) {
        const { ctx } = this;
        const { width: w, height: h } = this.getCanvasWH();

        if (!this._frameHistory) {
            this._frameHistory = new Float32Array(300);
            this._frameIndex = 0;
            this._frameCount = 0;
        }

        if (dt > 0) {
            this._frameHistory[this._frameIndex] = 1 / dt;
            this._frameIndex = (this._frameIndex + 1) % this._frameHistory.length;
            if (this._frameCount < this._frameHistory.length) {
                this._frameCount++;
            }
        }

        let avgFps = 0;
        let low1 = 0;
        let low01 = 0;
        if (this._frameCount > 0) {
            let sum = 0;
            for (let i = 0; i < this._frameCount; i++) {
                sum += this._frameHistory[i];
            }
            avgFps = sum / this._frameCount;

            const samples = Array.from(this._frameHistory.subarray(0, this._frameCount));
            samples.sort((a, b) => a - b);
            const idx1 = Math.floor(samples.length * 0.01);
            const idx01 = Math.floor(samples.length * 0.001);
            low1 = samples[idx1];
            low01 = samples[idx01];
        }

        const fpsVal = dt === 0 ? 'PAUSE' : (1 / dt).toFixed(2);
        const avgVal = this._frameCount === 0 ? '---' : avgFps.toFixed(2);
        const low1Val = this._frameCount === 0 ? '---' : low1.toFixed(2);
        const low01Val = this._frameCount === 0 ? '---' : low01.toFixed(2);

        const fpsText = `FPS: ${fpsVal}`;
        const avgFpsText = `Avg FPS: ${avgVal}`;
        const low1Text = `1% Low: ${low1Val}`;
        const low01Text = `0.1% Low: ${low01Val}`;
        const absTime = Math.abs(globalTime % 60).toFixed(2).padStart(5, '0');
        const minTime = globalTime < 0 ? '-' + Math.abs(Math.ceil(globalTime / 60)) : Math.floor(globalTime / 60);
        const timeText = `Time: ${minTime}:${absTime}`;

        ctx.save();
        ctx.font = '3px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        const startX = -w * 0.5 + 2;
        let startY = -h * 0.5 + 2;
        ctx.fillText(fpsText, startX, startY);
        ctx.fillText(avgFpsText, startX, startY + 4);
        ctx.fillText(low1Text, startX, startY + 8);
        ctx.fillText(low01Text, startX, startY + 12);
        ctx.fillText(timeText, startX, startY + 16);

        ctx.restore();
    }

    drawAuxiliaryText(dt, globalTime, noteQuantity, playScoreRes, playCombo, playScore, playScoreMinus) {
        const { width: w, height: h } = this.getCanvasWH();
        if (h >= w) return;
        const { ctx } = this;
        const allRes = playScoreRes.tap + playScoreRes.hold + playScoreRes.slide + playScoreRes.touch + playScoreRes.break;

        const absTime = Math.abs(globalTime % 60).toFixed(2).padStart(5, '0');
        const minTime = globalTime < 0 ? '-' + Math.abs(Math.ceil(globalTime / 60)) : Math.floor(globalTime / 60);

        ctx.save();
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.font = "9px mono";
        ctx.letterSpacing = "-1px";
        ctx.fillText(`${minTime}:${absTime}`, scaleBase / -2 - 5, -1);

        ctx.letterSpacing = "0px";
        ctx.font = '4px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
        ctx.fillText('Powered by', scaleBase / -2 - 3, h * 0.5 - 5);
        ctx.font = '2.5px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
        ctx.fillText('susuy0725/web-mai-chart-x', scaleBase / -2 - 3, h * 0.5 - 2);

        const allPassed = noteQuantity.break + noteQuantity.touch + noteQuantity.slide + noteQuantity.hold + noteQuantity.tap;

        ctx.textAlign = "left";
        const aux = this._auxTextList;
        aux[0] = `${allPassed}/${allRes}`;
        aux[1] = `ALL:`;
        aux[2] = `${noteQuantity.break}/${playScoreRes.break}`;
        aux[3] = `BRK:`;
        aux[4] = `${noteQuantity.touch}/${playScoreRes.touch}`;
        aux[5] = `TOH:`;
        aux[6] = `${noteQuantity.slide}/${playScoreRes.slide}`;
        aux[7] = `SLD:`;
        aux[8] = `${noteQuantity.hold}/${playScoreRes.hold}`;
        aux[9] = `HOD:`;
        aux[10] = `${noteQuantity.tap}/${playScoreRes.tap}`;
        aux[11] = `TAP:`;

        const sp = 6;
        const lil = (aux.length * sp - Math.floor(aux.length / 2)) * 0.5 + sp;
        for (let i = 0; i < aux.length; i++) {
            const isLabel = (i % 2 !== 0);
            ctx.font = `${isLabel ? "bold 5" : "4"}px mono`;
            ctx.fillText(aux[i], scaleBase * 0.5 + 3, lil - i * sp - (isLabel ? 0 : 1));
        }

        ctx.textBaseline = "top";
        ctx.textAlign = "right";
        ctx.font = "bold 5px mono";
        const isMinus = (this.settings.middleDisplay === 3);
        ctx.fillText(isMinus ? 'DELUXE Rate (101%-):' : 'DELUXE Rate:', scaleBase / -2 - 3, 1);
        ctx.font = "7px mono";
        const displayScore = isMinus ? (playScoreMinus ?? 101) : playScore;
        ctx.fillText(displayScore.toFixed(4) + "%", scaleBase / -2 - 3, 8);

        ctx.restore();
    }

    ensureStaticBackgroundCache() {
        const wPx = this.canvas.width;
        const hPx = this.canvas.height;
        const scale = this.scale;
        if (!wPx || !hPx) return;

        const params = this._staticBackgroundCacheParams;
        if (this._staticBackgroundCache && params.w === wPx && params.h === hPx && params.scale === scale) {
            return;
        }

        const cache = document.createElement('canvas');
        cache.width = wPx;
        cache.height = hPx;
        const cctx = cache.getContext('2d');
        const p = Math.min(wPx, hPx) / scaleBase * scale;
        cctx.setTransform(p, 0, 0, p, wPx * 0.5, hPx * 0.5);

        cctx.save();
        cctx.beginPath();
        cctx.rect(-wPx, -hPx, wPx * 2, hPx * 2);
        cctx.arc(0, 0, scaleBase * 0.5, 0, Math.PI * 2);
        cctx.fill('evenodd');
        cctx.restore();

        this._staticBackgroundCache = cache;
        this._staticBackgroundCacheParams = { w: wPx, h: hPx, scale };
    }

    drawStaticBackground() {
        this.ensureStaticBackgroundCache();
        if (!this._staticBackgroundCache) return;

        const { ctx } = this;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this._staticBackgroundCache, 0, 0);
        ctx.restore();
    }

    drawMiddleDisplay() {
        this.renderMiddleDisplayToContext(this.ctx);
    }

    renderMiddleDisplayToContext(ctx) {
        ctx.save();
        switch (this.settings.middleDisplay) {
            case 1:
                if (this.playCombo !== 0) {
                    outlineText(ctx, "COMBO", 0, -7, 4.4, 0.5, this._middleDisplayConfig1);
                    outlineText(ctx, `${this.playCombo}`, 0, 0, 7.4, 0.5, this._middleDisplayConfig2);
                }
                break;
            case 2: // 分數 (101%+)
            case 3: // 分數 (101%-)
                const scoreValue = (this.settings.middleDisplay === 3)
                    ? (this.playScoreMinus !== undefined ? this.playScoreMinus : 101)
                    : (this.playScore ?? 0);
                const trueScore = Math.max(scoreValue, 0).toFixed(4);
                const dotIdx = trueScore.indexOf(".");
                const part0 = dotIdx === -1 ? trueScore : trueScore.substring(0, dotIdx);
                const part1 = dotIdx === -1 ? "" : trueScore.substring(dotIdx + 1);

                let scoreColor = "#4061A8";
                if (trueScore > 80) scoreColor = "#9E3D2E";
                if (trueScore > 100) scoreColor = "#99853A";

                this._middleDisplayConfigScore.fillStyle = scoreColor;
                this._middleDisplayConfigDot.fillStyle = scoreColor;
                this._middleDisplayConfigFrac.fillStyle = scoreColor;
                this._middleDisplayConfigPercent.fillStyle = scoreColor;

                outlineText(ctx, part0, -1.8, 0, 7.4, 0.5, this._middleDisplayConfigScore);
                outlineText(ctx, ".", -2.3, 0.6, 5, 0.5, this._middleDisplayConfigDot);
                outlineText(ctx, part1, 0, 0.5, 5, 0.5, this._middleDisplayConfigFrac);
                outlineText(ctx, "%", 14.4, 1.2, 3, 0.5, this._middleDisplayConfigPercent);
                break;
            default:
                break;
        }
        ctx.restore();
    }

    ensureSensorCaches() {
        const wPx = this.canvas.width;
        const hPx = this.canvas.height;
        const scale = this.scale;
        if (!wPx || !hPx) return;
        const p = Math.min(wPx, hPx) / scaleBase * scale;

        const params = this._sensorCacheParams;
        if (this._sensorShapeCache && params.w === wPx && params.h === hPx && params.scale === scale) {
            return;
        }

        try {
            const shapes = document.createElement('canvas');
            shapes.width = wPx;
            shapes.height = hPx;
            const sctx = shapes.getContext('2d');
            sctx.setTransform(p, 0, 0, p, wPx * 0.5, hPx * 0.5);

            sctx.save();
            sctx.beginPath();
            sctx.arc(0, 0, innerCirleBase, 0, Math.PI * 2);
            sctx.closePath();
            sctx.clip();
            sctx.fillStyle = '#80808025';
            sctx.strokeStyle = '#ffffff80';

            touchPaths.forEach(shape => {
                if (shape.type === 'D' || shape.type === 'C1' || shape.type === 'C2') return;
                sctx.lineWidth = 0.3;
                if (shape.type === 'A') {
                    sctx.lineWidth = 0.3;
                    sctx.setLineDash([0.2, 0.6]);
                    sctx.stroke(shape.path);
                } else {
                    sctx.setLineDash([]);
                    sctx.fill(shape.path);
                    sctx.stroke(shape.path);
                }
            });

            sctx.restore();

            const texts = document.createElement('canvas');
            texts.width = wPx;
            texts.height = hPx;
            const tctx = texts.getContext('2d');
            tctx.setTransform(p, 0, 0, p, wPx * 0.5, hPx * 0.5);

            tctx.save();
            tctx.fillStyle = '#ffffff30';
            tctx.textAlign = "center";
            tctx.textBaseline = "middle";
            ['A', 'B', 'D', 'E'].forEach(type => {
                const positions = touchRefPos[type];
                tctx.font = (type === 'A') ? "bold 5px combo" : "4px combo";
                for (let i = 0; i < positions.length; i++) {
                    const pos = positions[i];
                    tctx.fillText(`${type}${i + 1}`, pos.x, pos.y);
                }
            });
            tctx.fillText('C', 0, 0);

            // 繪製外鍵文字標籤 (1~8)
            tctx.fillStyle = '#ff6b6b60';
            tctx.font = "bold 3.8px combo";
            for (let i = 1; i <= 8; i++) {
                const midAng = -Math.PI / 2 + (i - 0.5) * (Math.PI / 4);
                const textR = innerCirleBase * 1.165;
                tctx.fillText(`${i}`, Math.cos(midAng) * textR, Math.sin(midAng) * textR);
            }
            tctx.restore();

            this._sensorShapeCache = shapes;
            this._sensorTextCache = texts;
            this._sensorCacheParams = { w: wPx, h: hPx, scale };
        } catch (e) {
            console.error('建立傳感器靜態快取失敗:', e);
            this._sensorShapeCache = null;
            this._sensorTextCache = null;
            this._sensorCacheParams = { w: 0, h: 0, scale };
        }
    }

    drawSensors(showSensor, showSensorText, activeSensors = null) {
        this.ensureSensorCaches();
        if (!this._sensorShapeCache && !this._sensorTextCache) return;

        const { ctx } = this;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        try {
            if (showSensor && this._sensorShapeCache) ctx.drawImage(this._sensorShapeCache, 0, 0);
            if (showSensorText && this._sensorTextCache) ctx.drawImage(this._sensorTextCache, 0, 0);

            if (activeSensors && activeSensors.size > 0) {
                const wPx = this.canvas.width;
                const hPx = this.canvas.height;
                const p = Math.min(wPx, hPx) / scaleBase * this.scale;
                ctx.setTransform(p, 0, 0, p, wPx * 0.5, hPx * 0.5);

                // 1. 內圈感應區高亮 (藍色柔光發光)
                ctx.save();
                ctx.beginPath();
                ctx.arc(0, 0, innerCirleBase, 0, Math.PI * 2);
                ctx.clip();

                ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
                ctx.strokeStyle = '#ffffffff';
                ctx.lineWidth = 0.6;

                for (let j = 0; j < touchPaths.length; j++) {
                    const shape = touchPaths[j];
                    const normId = (shape.id === 'C1' || shape.id === 'C2') ? 'C' : shape.id;
                    if (activeSensors.has(normId)) {
                        ctx.fill(shape.path);
                        ctx.stroke(shape.path);
                    }
                }
                ctx.restore();

                // 2. 外鍵延伸區域高亮 (外圈發光區域 1~8)
                const outerR1 = innerCirleBase * 1.05;
                const outerR2 = innerCirleBase * 1.28;
                for (let i = 1; i <= 8; i++) {
                    if (activeSensors.has('K' + i) || activeSensors.has('A' + i)) {
                        const startAng = -Math.PI / 2 + (i - 1) * (Math.PI / 4);
                        const endAng = -Math.PI / 2 + i * (Math.PI / 4);
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(0, 0, outerR2, startAng, endAng);
                        ctx.arc(0, 0, outerR1, endAng, startAng, true);
                        ctx.closePath();
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                        ctx.fill();
                        ctx.restore();
                    }
                }
            }
        } finally {
            ctx.restore();
        }
    }

    // --- Notes 繪製 logic ---

    drawTap(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine, hispeed, triggered, triggeredTime } = s;
        const noteT = noteTime - this.globalTime;
        const { t, displayT, currentScale, scaleX, scaleY } = this.getNoteTransform(noteT, hispeed, s.size);

        const posInfo = noteRefPos[pos - 1];
        const ctx = this.ctx;

        if (triggered) {
            if (!s.judgeResult || s.judgeResult.grade !== 'MISS') {
                this.queueHitEffect(pos, triggeredTime - this.globalTime, s.judgeResult, posInfo.x, posInfo.y);
            }
            return;
        }

        const br = (isBreak && !isMine) ? Math.pow(Math.sin(this.globalTime * -6), 2) * 0.5 : 0;
        const imgKey = isMine ? "tap_mine" : (isBreak ? "tap_break" : (isDouble ? "tap_each" : "tap"));
        let img;
        if (isBreak) {
            this._tempColorConfig.colorCode = "#fff8a6";
            img = this.getMemoizedTintedImage(imgKey, br, this._tempColorConfig);
        } else {
            img = this.images[imgKey];
        }

        const size = this.settings.noteBaseSize * currentScale;

        ctx.save();

        // 繪製 Outer Arc
        const arcimg = this.images[isMine ? "MineArc" : (isBreak ? "BreakArc" : (isDouble ? "EachArc" : "NormalArc"))];
        ctx.save();
        ctx.rotate(posInfo.rot);
        ctx.setAlpha(currentScale);
        this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
        ctx.restore();

        // 繪製 Note 本體
        ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
        ctx.rotate(posInfo.rot);
        this.drawImgAtcenter(img, size, 0, 0, scaleX, scaleY);

        if (s.isEx) {
            this._tempColorConfig.colorCode = this.exColor[isBreak ? "break" : (isDouble ? "double" : "tap")];
            const exImg = this.getMemoizedTintedImage("tap_ex", 0.6, this._tempColorConfig);
            this.drawImgAtcenter(exImg, size, 0, 0, scaleX, scaleY);
        }

        ctx.restore();
    }

    drawStar(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMultiple, isMine, hispeed, triggered, triggeredTime } = s;
        const noteT = noteTime - this.globalTime;
        const { t, displayT, currentScale, scaleX, scaleY } = this.getNoteTransform(noteT, hispeed, s.size);

        const posInfo = noteRefPos[pos - 1];
        const ctx = this.ctx;

        if (triggered) {
            if (!s.judgeResult || s.judgeResult.grade !== 'MISS') {
                this.queueHitEffect(pos, triggeredTime - this.globalTime, s.judgeResult, posInfo.x, posInfo.y);
            }
            return;
        }

        const br = (isBreak && !isMine) ? Math.pow(Math.sin(this.globalTime * -6), 2) * 0.5 : 0;
        const imgKey = isMultiple ?
            (isMine ? "star_mine_double" : (isBreak ? "star_break_double" : (isDouble ? "star_each_double" : (this.settings.pinkStars ? "star_pink_double" : "star_double")))) :
            (isMine ? "star_mine" : (isBreak ? "star_break" : (isDouble ? "star_each" : (this.settings.pinkStars ? "star_pink" : "star"))));

        let img;
        if (isBreak) {
            this._tempColorConfig.colorCode = "#fff8a6";
            img = this.getMemoizedTintedImage(imgKey, br, this._tempColorConfig);
        } else {
            img = this.images[imgKey];
        }

        const size = this.settings.noteBaseSize * currentScale;

        ctx.save();

        // 繪製 Arc
        const arcimg = this.images[isMine ? "MineArc" : (isBreak ? "BreakArc" : (isDouble ? "EachArc" : "SlideArc"))];
        ctx.save();
        ctx.rotate(posInfo.rot);
        ctx.setAlpha(currentScale);
        this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
        ctx.restore();

        // 繪製 Note 本體與自轉
        ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
        let rot = posInfo.rot;
        if (this.settings.rotateStars) {
            let speed = 0;
            if (s.slideDuration && s.slideDuration > 0) {
                speed = clamp(1.5 / s.slideDuration, 0.5, 6);
            }
            rot += this.globalTime * 2 * Math.PI * speed;
        }
        ctx.rotate(rot);
        this.drawImgAtcenter(img, size, 0, 0, scaleX, scaleY);

        if (s.isEx) {
            this._tempColorConfig.colorCode = this.exColor[isBreak ? "break" : (isDouble ? "double" : "star")];
            const exImg = this.getMemoizedTintedImage(isMultiple ? "star_ex_double" : "star_ex", 0.6, this._tempColorConfig);
            this.drawImgAtcenter(exImg, size, 0, 0, scaleX, scaleY);
        }

        ctx.restore();
    }

    drawHold(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine, holdDuration, hispeed, triggered, triggeredTime, isHolding, holdFinish, judgeResult } = s;
        const noteT = (noteTime - this.globalTime);
        const speedFactor = (this.settings.speed * 0.8833 + 0.8167) * hispeed;
        const t = 1 - this.timeFunction(noteT * speedFactor);
        const posInfo = noteRefPos[pos - 1];

        if (holdFinish) {
            // hold 要有判定才在結束時顯示 simpleHitEffect (非 MISS 且有有效判定)
            if (judgeResult && judgeResult.grade !== 'MISS') {
                this.queueHitEffect(pos, holdDuration + noteT, judgeResult, posInfo.x, posInfo.y);
            }
            return;
        }

        const md = this.settings.middleDistance;

        const isOn = isHolding && !isMine;
        const br = (s.isBreak && !isMine) ? Math.pow(Math.sin(this.globalTime * -6), 2) * 0.5 : 0;
        const holdImgKey = (
            (noteTime - this.globalTime) > -0.1) ?
            (isMine ? "hold_mine" : (isBreak ? "hold_break" : (isDouble ? "hold_each" : "hold"))) :
            (isOn ? (isMine ? "hold_mine" : (isBreak ? "hold_break_on" : (isDouble ? "hold_each_on" : "hold_on")))
                : (isMine ? "hold_mine" : "hold_off")
            );

        let img;
        if (isBreak) {
            this._tempColorConfig.colorCode = "#fff8a6";
            img = this.getMemoizedTintedImage(holdImgKey, br, this._tempColorConfig);
        } else {
            img = this.images[holdImgKey];
        }

        function drawHoldImage(ctx, img, size, sizeOffset) {
            ctx.drawImage(img, 0, 0, 122, 55, -size * 0.5, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
            ctx.drawImage(img, 0, 55, 122, 90, -size * 0.5, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
            ctx.drawImage(img, 0, 145, 122, 55, -size * 0.5, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);
        }

        const t1 = 1 - this.timeFunction(Math.max(noteTime - this.globalTime + holdDuration, 0) * (this.settings.speed * 0.8833 + 0.8167));
        const displayT = Math.min(1, Math.max(md, t));
        const currentScale = t < md ? Math.max(0, (t + 0.9) / (0.9 + md)) : 1;
        const size = this.settings.noteBaseSize * currentScale;
        const sizeOffset = (t < md || s.holdDuration < 0.1) ? 0 :
            Math.min(1 - md, (t - t1), (1 - t1), (t - md)) / (1 - md) * (20.35 / this.settings.noteBaseSize);

        this.ctx.save();
        const arcimg = this.images[isMine ? "MineArc" : (isBreak ? "BreakArc" : (isDouble ? "EachArc" : "NormalArc"))];
        this.ctx.rotate(posInfo.rot);
        this.ctx.setAlpha(currentScale);
        this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
        this.ctx.restore();

        if (t1 > md) {
            this.ctx.save();
            const endimg = this.images[isMine ? "Hold_Mine_End" : (isBreak ? "Hold_Break_End" : (isDouble ? "Hold_Each_End" : "Hold_End"))];
            this.ctx.translate(posInfo.x * t1, posInfo.y * t1);
            this.drawImgAtcenter(endimg, size * 0.65);
            this.ctx.restore();
        }

        this.ctx.save();
        this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
        this.ctx.rotate(posInfo.rot);
        drawHoldImage(this.ctx, img, size, sizeOffset);

        if (s.isEx) {
            this._tempColorConfig.colorCode = isBreak ? this.exColor.break : (isDouble ? this.exColor.double : this.exColor.tap);
            const ex = this.getMemoizedTintedImage("hold_ex", 0.6, this._tempColorConfig);
            drawHoldImage(this.ctx, ex, size, sizeOffset);
        }
        this.ctx.restore();

        if (isOn) {
            this.queueHoldEffect(pos, noteT, s._headJudge || s.judgeResult, posInfo.x * displayT, posInfo.y * displayT);
        }
    }

    getTouchHanabi(s) {
        if (!s.isHanabi) return;

        const { time: noteTime, pos, touchPos, holdDuration, triggered, triggeredTime, isHolding, holdFinish } = s;

        // 無打擊觸發且非長音按壓/完成狀態時，不觸發煙火特效
        if (holdDuration) {
            if (!holdFinish || !s.judgeResult || s.judgeResult.grade === 'MISS') return;
        } else {
            if (!triggered || (s.judgeResult && s.judgeResult.grade === 'MISS')) return;
        }

        const noteT = (triggered && triggeredTime !== undefined)
            ? (triggeredTime - this.globalTime)
            : (noteTime - this.globalTime);

        const key = TOUCH_GROUP_TO_INDEX[touchPos] + (touchPos === 'C' ? 0 : pos - 1);
        let existing = this.hanabiEffect[key];

        const posInfo = touchRefPos[touchPos][touchPos === "C" ? 0 : pos - 1];
        const effT = holdDuration ? (holdDuration + noteT) : noteT;

        existing.time = noteTime;
        existing.x = posInfo.x;
        existing.y = posInfo.y;
        existing.noteT = (existing.cleared === false ? Math.max(existing.noteT, effT) : effT);
        existing.isCenter = touchPos === "C";
        existing.cleared = false;
    }

    drawTouch(s) {
        const { time: noteTime, pos, touchPos, isDouble, isMine, holdDuration, hispeed, triggered, triggeredTime, isHolding, holdFinish } = s;
        const zoneKey = TOUCH_GROUP_TO_INDEX[touchPos] + (touchPos === 'C' ? 0 : pos - 1);
        const count = this._zoneCounts[zoneKey];

        const noteT = (noteTime - this.globalTime);
        const t = 1 - this.timeFunction(noteT * (this.settings.touchSpeed * 0.8833 + 0.8167) * hispeed);
        const posInfo = touchRefPos[touchPos][touchPos === "C" ? 0 : pos - 1];

        const borderImg = this.images[isMine ? "touch_border_2_mine" : (isDouble ? "touch_border_2_each" : "touch_border_2")];
        const borderImg3 = this.images[isMine ? "touch_border_3_mine" : (isDouble ? "touch_border_3_each" : "touch_border_3")];
        const touchPoint = this.images[isMine ? "touch_point_mine" : (isDouble ? "touch_point_each" : "touch_point")];

        if (holdDuration) {
            const isOn = (noteTime - this.globalTime) > -0.1 || isHolding;
            const imgs = [];
            for (let i = 0; i < 4; i++) {
                imgs.push(this.images["touchhold_" + i + (isMine ? "_mine" : "")]);
            }
            const touchBorder = this.images[(isOn ? "touchhold_border" : "touchhold_off") + (isMine ? "_mine" : "")];

            if (holdFinish) {
                // touchHold 要有判定才在結束時顯示 simpleHitEffect
                if (s.judgeResult && s.judgeResult.grade !== 'MISS') {
                    this.queueHitEffect(null, holdDuration + noteT, s.judgeResult, posInfo.x, posInfo.y);
                }
                return;
            }

            const size = this.settings.noteBaseSize * 0.7;
            const holdP = Math.max(0, Math.min(1, -noteT / holdDuration));
            const a = this.touchTimeFunction(18 * (1 - Math.min(1, t)) / 1.5) * 1.6;

            this.ctx.save();
            this.ctx.translate(posInfo.x, posInfo.y);
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.arc(0, 0, size * 1.3, -Math.PI * 0.5, Math.PI * holdP * 2 - Math.PI * 0.5);
            this.ctx.closePath();
            this.ctx.clip();
            this.drawImgAtcenter(touchBorder, size * 2.6);
            this.ctx.restore();

            this.ctx.setAlpha(1);
            this.ctx.rotate(Math.PI * -0.75);
            this.ctx.setAlpha(Math.max(0, 1 - (1 - Math.min(1, t)) * 0.5));

            for (let i = 0; i < 4; i++) {
                this.ctx.drawImage(imgs[i], -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
                this.ctx.rotate(Math.PI * 0.5);
            }

            this.ctx.setAlpha(1);
            this.drawImgAtcenter(touchPoint, size * 0.4);
            this.ctx.restore();

            if (isOn && (noteTime - this.globalTime) <= -0.1) {
                this.queueHoldEffect(null, noteT, s._headJudge || s.judgeResult, posInfo.x, posInfo.y);
            }
            return;
        }

        if (triggered) {
            if (!s.judgeResult || s.judgeResult.grade !== 'MISS') {
                this.queueHitEffect(null, triggeredTime - this.globalTime, s.judgeResult, posInfo.x, posInfo.y);
            }
            return;
        }

        const img = this.images[isMine ? "touch_mine" : isDouble ? "touch_each" : "touch"];
        const justImg = this.images.touch_just;

        this.ctx.save();
        const size = this.settings.noteBaseSize * 0.7;
        const a = this.touchTimeFunction(18 * Math.max(1 - t, 0) / 1.5) * 1.6;
        this.ctx.translate(posInfo.x, posInfo.y);
        this.ctx.setAlpha(1);

        if (count >= 2 && this.drawnBorders[zoneKey] === 0) {
            this.drawnBorders[zoneKey] = 1;
            this.drawImgAtcenter(borderImg, size * 2.65);
            if (count > 2) {
                this.drawImgAtcenter(borderImg3, size * 2.65);
            }
        }
        this.ctx.setAlpha(Math.max(0, 1 - (1 - t) * 0.5));
        for (let i = 0; i < 4; i++) {
            this.ctx.drawImage(img, -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
            this.ctx.rotate(Math.PI * 0.5);
        }
        this.ctx.setAlpha(1);
        this.drawImgAtcenter(touchPoint, size * 0.4);
        if (noteT < 0) { this.drawImgAtcenter(justImg, size * 1.8); }
        this.ctx.restore();
    }

    drawSlideTrack(s) {
        const { time: noteTime, pos, slideEnd, path, hispeed } = s;
        const noteT = noteTime - this.globalTime;

        // 若整條鏈尾段已完成 (slideFinish) 或標記完成，整條 chain slide 消失
        const tail = s.chainTail || s;
        if (tail.slideFinish || s.chainFinished) {
            return;
        }

        const p = path || generatePath(pos, slideEnd);
        if (p.totalLength < 1e-4) return;

        const isIllegalRed = (s.isIllegal && this.settings.slideIllegalRed);
        const prefix = isIllegalRed ? "wifi_" : (s.isMine ? "wifi_mine_" : (s.isBreak ? "wifi_break_" : (s.isDouble ? "wifi_each_" : "wifi_")));
        const standardKey = isIllegalRed ? "slide" : (s.isMine ? "slide_mine" : (s.isBreak ? "slide_break" : (s.isDouble ? "slide_each" : "slide")));

        const speedFactor = (this.settings.speed * 0.8833 + 0.8167) * (hispeed || 1);
        const t = 1 - this.timeFunction(noteT * speedFactor);

        this.ctx.save();
        const isTaped = -noteT > 0;
        this.ctx.globalAlpha = isTaped ? 1 : 0.75 * clamp(((t - this.settings.middleDistance) / (1 - this.settings.middleDistance)) + this.settings.slideSpeed, 0, 1);

        const br = ((s.isBreak && !s.isMine) && !isIllegalRed) ? Math.pow(Math.sin(this.globalTime * -6), 2) * 0.5 : 0;
        const prefixOrKey = s.slideType === "w" ? prefix : standardKey;

        // 音符到達時 (-noteT >= 0) 即可滑動判定，軌跡箭頭進度直接由玩家實際滑動判定進度 s.slideProgress 實時推進消除
        // 若玩家完全沒碰螢幕 (s.slideProgress === 0)，在整條連鎖未結束前保留全部軌跡箭頭
        const isNoteReached = -noteT >= 0;
        const trackProgress = (s.isMine || !isNoteReached) ? 0 : (tail.slideFinish ? 1 : Math.min(1, Math.max(0, s.slideProgress || 0)));
        this.drawPathWithArrows(p, trackProgress, prefixOrKey, s.slideType === "w", br, isIllegalRed);

        this.ctx.restore();
    }

    drawSlideStar(s) {
        const { time: noteTime, pos, slideEnd, slideDelay, slideDuration, path, wPaths } = s;
        const noteT = noteTime - this.globalTime;

        // 1. 若標記隱藏星星 (例如末段已提早處理或整條連鎖結束)，或本段已完成，直接返回
        if (s.hideStar) {
            return;
        }
        const tail = s.chainTail || s;
        if (tail.slideFinish || s.chainFinished) {
            return;
        }

        const p = path || generatePath(pos, slideEnd);
        if (p.totalLength < 1e-4) return;

        let displaySlideProgress = 0;
        if (-noteT > slideDelay) {
            displaySlideProgress = Math.min(1, (-noteT - slideDelay) / slideDuration);
        }

        let sz = Math.min(1, 1 - (noteT + slideDelay) / slideDelay);

        const showStar = noteT <= 0
            && (!s.hideHead || sz >= 1)
            && (displaySlideProgress < 1 || (s.lastSlide && !s.slideFinish));

        if (showStar) {
            const { x, y, rot } = p.getPointAt(displaySlideProgress);
            this.ctx.save();
            this.ctx.globalAlpha = (slideDelay < 1e-4) ? 1 : sz;
            const starImg = this.images[s.isMine ? "star_mine" : (s.isBreak ? "star_break" : (s.isDouble ? "star_each" : "star"))];
            const starSize = this.settings.noteBaseSize * sz * 1.45;
            const isWiFi = s.slideType === "w";

            if (isWiFi && wPaths) {
                const baseTransform = this.ctx.getTransform();

                const w1Point = wPaths.w1.getPointAt(displaySlideProgress);
                this.ctx.translate(w1Point.x, w1Point.y);
                this.ctx.rotate(w1Point.rot + Math.PI * 0.5);
                this.drawImgAtcenter(starImg, starSize);

                this.ctx.setTransform(baseTransform);

                const w2Point = wPaths.w2.getPointAt(displaySlideProgress);
                this.ctx.translate(w2Point.x, w2Point.y);
                this.ctx.rotate(w2Point.rot + Math.PI * 0.5);
                this.drawImgAtcenter(starImg, starSize);

                this.ctx.setTransform(baseTransform);
            }
            this.ctx.translate(x, y);
            this.ctx.rotate(rot + Math.PI * 0.5);
            this.drawImgAtcenter(starImg, starSize);

            this.ctx.restore();
        }
    }

    drawSlide(s) {
        this.drawSlideTrack(s);
        this.drawSlideStar(s);
    }

    /**
     * 高效感應區域點測試：先透過極座標與邊界矩形測試，再 fallback 到 canvas isPointInPath
     */
    getSensorIdAtPoint(x, y, ignoreD = false) {
        // 使用坐標四捨五入做小範圍快取（點精度 0.1 像素級）
        const roundX = (x * 10 | 0) * 0.1;
        const roundY = (y * 10 | 0) * 0.1;
        const cacheKey = ((roundX * 1000 + roundY) | 0) * (ignoreD ? -1 : 1);
        if (!this._sensorPointCache) this._sensorPointCache = new Map();
        if (this._sensorPointCache.has(cacheKey)) {
            return this._sensorPointCache.get(cacheKey);
        }

        const r = Math.hypot(x, y);

        // 1. A 區外延伸（外鍵 1~8 區域，對應使用者附圖紅色斜線區域）：
        // 當半徑超出主圓盤外邊界 (innerCirleBase * 1.05 約為外圈白線外側，延伸至外鍵區域)
        // 依據極座標角度判定為 1~8 號外鍵 (順時針，正上方為起點每 45度 一個鍵位)
        if (r >= innerCirleBase * 1.05 && r <= innerCirleBase * 2.8) {
            let normAngle = Math.atan2(y, x) + Math.PI / 2;
            if (normAngle < 0) normAngle += Math.PI * 2;
            const keyNum = Math.floor(normAngle / (Math.PI / 4)) + 1;
            if (keyNum >= 1 && keyNum <= 8) {
                const outerKeyId = 'K' + keyNum;
                if (this._sensorPointCache.size > 1000) this._sensorPointCache.clear();
                this._sensorPointCache.set(cacheKey, outerKeyId);
                return outerKeyId;
            }
        }

        if (!this._dummyCtx) {
            const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : (typeof document !== 'undefined' ? document.createElement('canvas') : null);
            this._dummyCtx = c ? c.getContext('2d') : null;
        }
        if (!this._dummyCtx) return null;
        this._dummyCtx.setTransform(1, 0, 0, 1, 0, 0);

        let insideId = null;
        let strokeId = null;

        for (let j = 0; j < touchPaths.length; j++) {
            const shape = touchPaths[j];
            if (ignoreD && shape.id.startsWith('D')) continue;

            const isA = shape.id.startsWith('A');
            this._dummyCtx.lineWidth = isA ? 15 : 3;

            const isInside = this._dummyCtx.isPointInPath(shape.path, x, y);
            if (isInside && !insideId) {
                insideId = (shape.id === 'C1' || shape.id === 'C2') ? 'C' : shape.id;
                break;
            }

            if (!strokeId) {
                const isNearEdge = this._dummyCtx.isPointInStroke(shape.path, x, y);
                if (isNearEdge) {
                    strokeId = (shape.id === 'C1' || shape.id === 'C2') ? 'C' : shape.id;
                }
            }
        }

        let resultId = insideId || strokeId;

        // 2. 若未落在內圈多邊形內，但半徑已靠近外圈（r >= innerCirleBase * 0.95），回退判定為外鍵
        if (!resultId && r >= innerCirleBase * 0.95 && r <= innerCirleBase * 2.8) {
            let normAngle = Math.atan2(y, x) + Math.PI / 2;
            if (normAngle < 0) normAngle += Math.PI * 2;
            const keyNum = Math.floor(normAngle / (Math.PI / 4)) + 1;
            if (keyNum >= 1 && keyNum <= 8) {
                resultId = (r >= innerCirleBase * 1.05) ? ('K' + keyNum) : ('A' + keyNum);
            }
        }

        if (this._sensorPointCache.size > 1000) {
            this._sensorPointCache.clear();
        }
        this._sensorPointCache.set(cacheKey, resultId);
        return resultId;
    }

    /**
     * 肥手指 (Fat Finger) 區域擴張採樣：
     * 以 (x, y) 為中心，在半徑 radius 範圍內進行多點圓形取樣，返回接觸面覆蓋的所有感應器 ID 集合
     */
    getSensorsAtPointWithRadius(x, y, radius = 4.2, ignoreD = false) {
        const sensors = new Set();
        const centerId = this.getSensorIdAtPoint(x, y, ignoreD);
        if (centerId) sensors.add(centerId);

        if (radius <= 0) return sensors;

        // 採樣外層 8 個方位角及內層 4 個採樣點，模擬真實手指接觸面的橢圓/圓形覆蓋
        const outerR = radius;
        const innerR = radius * 0.55;

        // 8 個外圈採樣點 (每 45 度)
        const angles8 = [0, 0.785398, 1.570796, 2.356194, 3.141593, 3.926991, 4.712389, 5.497787];
        for (let i = 0; i < 8; i++) {
            const a = angles8[i];
            const px = x + Math.cos(a) * outerR;
            const py = y + Math.sin(a) * outerR;
            const sid = this.getSensorIdAtPoint(px, py, ignoreD);
            if (sid) sensors.add(sid);
        }

        // 4 個內圈採樣點
        const angles4 = [0.392699, 1.963495, 3.534292, 5.105088];
        for (let i = 0; i < 4; i++) {
            const a = angles4[i];
            const px = x + Math.cos(a) * innerR;
            const py = y + Math.sin(a) * innerR;
            const sid = this.getSensorIdAtPoint(px, py, ignoreD);
            if (sid) sensors.add(sid);
        }

        return sensors;
    }

    ensurePathSensorMap(recorder) {
        if (recorder._sensorMap) return recorder._sensorMap;

        const totalLen = recorder.totalLength;
        const numSamples = Math.max(20, Math.ceil(totalLen * 0.5));
        const samples = new Array(numSamples + 1);

        for (let i = 0; i <= numSamples; i++) {
            const ratio = i / numSamples;
            const pt = recorder.getPointAt(ratio);
            const dist = ratio * totalLen;
            const sensorId = this.getSensorIdAtPoint(pt.x, pt.y, true);
            samples[i] = { dist, sensorId };
        }
        recorder._sensorMap = samples;
        return samples;
    }

    /**
     * 預先計算並快取 Slide 路徑所有箭頭的幾何座標與尺寸，避免每幀重複求解三次貝茲曲線
     */
    ensureArrowCache(recorder, typew, spacing = 4.36) {
        const key = typew ? '_wArrowCache' : '_stdArrowCache';
        if (recorder[key]) return recorder[key];

        const totalLen = recorder.totalLength;
        const arrowCount = typew ? 11 : Math.floor((totalLen - 2) / spacing);
        const actualSpacing = typew ? 7 : spacing;
        const arrows = [];

        for (let i = arrowCount; i > 0; i--) {
            const imgIndex = Math.min(i - 1, typew ? 10 : 0);
            const wOffset = typew ? imgIndex * 4 : 0;
            const dist = i * actualSpacing + (typew ? wSlideRatio[wOffset + 2] : 0);
            const pt = recorder.getPointAt(dist / totalLen);

            let rad, dw, dh;
            if (typew) {
                rad = pt.rot - 1.176522; // Math.PI * -0.3745
                const scaleFactor = 0.096 + wSlideRatio[wOffset + 3];
                dw = wSlideRatio[wOffset] * scaleFactor;
                dh = wSlideRatio[wOffset + 1] * scaleFactor;
            } else {
                rad = pt.rot + Math.PI;
                dw = 6.3;
                dh = 8.46;
            }

            const sensorId = (this.settings.slideArrowHideBySensor !== false)
                ? this.getSensorIdAtPoint(pt.x, pt.y, true)
                : null;

            arrows.push({
                dist,
                x: pt.x,
                y: pt.y,
                rad,
                dw,
                dh,
                imgIndex,
                sensorId
            });
        }

        recorder[key] = arrows;
        return arrows;
    }

    drawPathWithArrows(recorder, starProgress, prefixOrKey, typew, br, isIllegal, spacing = 4.36) {
        if (starProgress >= 1) return;

        const arrows = this.ensureArrowCache(recorder, typew, spacing);
        if (!arrows || arrows.length === 0) return;

        const totalLen = recorder.totalLength;
        const starDist = starProgress * totalLen;
        let currentStarSensorId = null;

        if (starProgress > 0 && this.settings.slideArrowHideBySensor !== false) {
            const pt = recorder.getPointAt(starProgress);
            currentStarSensorId = this.getSensorIdAtPoint(pt.x, pt.y, true);
        }

        const opacity = isIllegal ? 1 : br;
        const colorCode = isIllegal ? "#ff3838" : "#fff8a6";
        const isTinted = isIllegal || br > 0;

        let singleImg = null;
        if (!typew) {
            if (isTinted) {
                this._tempColorConfig.colorCode = colorCode;
                singleImg = this.getMemoizedTintedImage(prefixOrKey, opacity, this._tempColorConfig);
            } else {
                singleImg = this.images[prefixOrKey];
            }
            if (!singleImg) return;
        }

        const baseTransform = this.ctx.getTransform();

        for (let i = 0; i < arrows.length; i++) {
            const arr = arrows[i];

            if (starProgress > 0) {
                if (arr.dist <= starDist) continue;
            }

            let img;
            if (typew) {
                const imgKey = prefixOrKey + arr.imgIndex;
                if (isTinted) {
                    this._tempColorConfig.colorCode = colorCode;
                    img = this.getMemoizedTintedImage(imgKey, opacity, this._tempColorConfig);
                } else {
                    img = this.images[imgKey];
                }
            } else {
                img = singleImg;
            }

            if (!img) continue;

            this.ctx.translate(arr.x, arr.y);
            this.ctx.rotate(arr.rad);
            this.drawImgAtcenter(img, 1, 0, 0, arr.dw, arr.dh);
            this.ctx.setTransform(baseTransform);
        }
    }

    drawHanabiEffects() {
        const hanabiEffect = this.hanabiEffect;
        for (let i = 0; i < 33; i++) {
            const eff = hanabiEffect[i];
            if (eff.cleared) continue;
            this.ctx.save();
            this.ctx.translate(eff.x, eff.y);
            if (this.settings.drawHanabiEffect === 'rich') {
                this.richHanabi(eff.noteT);
            } else {
                this.simpleHanabi(eff.noteT, eff.isCenter);
            }
            this.ctx.restore();
        }
    }
}