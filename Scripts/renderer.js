import {
    scaleBase,
    innerCirleBase,
    noteRefPos,
    visualNoteRefPos,
    touchRefPos,
} from './core/chartGeometry.js';
import {
    imgNotExists,
    getTintedImage,
    generatePath,
    touchPaths,
    wSlideRatio,
    clamp,
    drawImgAtcenter,
    exColor,
    easeOutQuad,
    easeInBack,
} from './helper.js';

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

const charWidthCache = {};
const RICH_HANABI_COLOR_MAP = ['#ff009dff', '#ff4800', '#ffe100', '#ddff00', '#00bbff'];
const TOUCH_GROUP_TO_INDEX = { A: 0, B: 8, C: 16, D: 17, E: 25 };

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

const calcPiecewiseSpeed = (x) => {
    if (x >= 1) return x * 0.8833 + 0.8167;
    if (x <= -1) return x * 0.8833 - 0.8167;
    return x * 1.7;
};

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

function textMonospace(ctx, text, x, y, cellWidth, mode = 'stroke') {
    ctx.textAlign = 'left';
    const fontKey = ctx.font;
    if (!charWidthCache[fontKey]) {
        charWidthCache[fontKey] = {};
    }
    const cache = charWidthCache[fontKey];

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        let charWidth = cache[char];
        if (charWidth === undefined) {
            charWidth = ctx.measureText(char).width;
            cache[char] = charWidth;
        }

        const offsetX = (cellWidth - charWidth) / 2;

        if (mode === 'stroke') {
            ctx.strokeText(char, x + (i * cellWidth) + offsetX, y);
        } else {
            ctx.fillText(char, x + (i * cellWidth) + offsetX, y);
        }
    }
}

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
    cellWidth += letterSpacing ? fontSize * parseFloat(letterSpacing) : 0;
    cellWidth = Math.max(cellWidth, 0);
    let calX = x;
    if (textAlign === "center") {
        calX = x - ((text.length * cellWidth) / 2);
    }
    if (textAlign === "right") {
        calX = x - (text.length * cellWidth);
    }
    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = textBaseline;
    ctx.fillStyle = fillStyle;
    ctx.lineWidth = strokeWidth;
    if (strokeWidth > 0) {
        ctx.strokeStyle = "#000";
        textMonospace(ctx, text, calX, y + shadowHeight, cellWidth);
        ctx.strokeStyle = strokeStyle;
        textMonospace(ctx, text, calX, y, cellWidth);
    }
    textMonospace(ctx, text, calX, y, cellWidth, 'fill');
    ctx.restore();
}

export class SimaiRenderer {
    constructor(canvas, settings) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        if (this.ctx) {
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
        }
        this.settings = settings;
        this.images = null;
        this.globalTime = 0;
        this._outlineImage = null;

        this.scale = 0.98;

        this._tintCache = new Map();

        // EX 顏色定義 (shared)
        this.exColor = exColor;

        // 傳感器靜態快取 (pixel canvas)
        this._sensorShapeCache = null; // canvas for sensor shapes
        this._sensorTextCache = null;  // canvas for sensor labels
        this._sensorCacheParams = { w: 0, h: 0, scale: this.scale };

        // 靜態背景與中間顯示快取
        this._staticBackgroundCache = null;
        this._staticBackgroundCacheParams = { w: 0, h: 0, scale: this.scale };
        this._middleDisplayCache = null;
        this._middleDisplayCacheParams = {
            w: 0,
            h: 0,
            scale: this.scale,
            middleDisplay: null,
            play_combo: null,
            play_score: null,
            backgroundDarkness: null,
        };

        // 優化垃圾回收 (GC) 的重用物件與快取
        this._zoneCounts = new Int32Array(33);
        this.drawnBorders = new Uint8Array(33);
        this.hanabiEffect = Array.from({ length: 33 }, () => ({
            time: -99999, x: 0, y: 0, noteT: 0, isCenter: false, cleared: true
        }));
        this._tempColorConfig = { colorCode: '' };
        this._tempSize = [1, 1];
        this._auxTextList = new Array(12);

        // outlineText / middleDisplay 快取配置
        this._middleDisplayConfig1 = { fillStyle: "#A1435D", strokeStyle: "#A6ABAE" };
        this._middleDisplayConfig2 = { fillStyle: "#A1435D", strokeStyle: "#A6ABAE", letterSpacing: -0.1 };
        this._middleDisplayConfigScore = { fillStyle: "#4061A8", strokeStyle: "#A6ABAE", letterSpacing: -0.1, textAlign: "right" };
        this._middleDisplayConfigDot = { fillStyle: "#4061A8", strokeStyle: "#A6ABAE", letterSpacing: -0.12, textAlign: "left" };
        this._middleDisplayConfigFrac = { fillStyle: "#4061A8", strokeStyle: "#A6ABAE", letterSpacing: -0.12, textAlign: "left" };
        this._middleDisplayConfigPercent = { fillStyle: "#4061A8", strokeStyle: "#A6ABAE", letterSpacing: -0.12, textAlign: "left" };

        this._hitEffectCache = null;

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
     * 預算座標縮放比例，減少重複計算
     */
    /**
     * 預算座標縮放比例與速度因子，減少重複計算
     */
    updateCanvasMetrics() {
        const { width: w, height: h } = this.canvas;
        this._p = Math.min(w, h) / scaleBase * this.scale;
        this._invP = scaleBase / (Math.min(w, h) * this.scale);
        this._hw = w * this._invP * 0.5;
        this._hh = h * this._invP * 0.5;
        this._cx = w * 0.5;
        this._cy = h * 0.5;

        const speed = this.settings.speed || 1;
        const touchSpeed = this.settings.touchSpeed || 1;
        this._speedFactor = speed * 0.8833 + 0.8167;
        this._touchSpeedFactor = touchSpeed * 0.8833 + 0.8167;
    }

    resetBaseTransform() {
        this.ctx.setTransform(this._p, 0, 0, this._p, this._cx, this._cy);
    }

    setImages(images) {
        this.images = images;
        this._touchBorderCache = null;
    }

    /**
     * 優化染色圖片取得方式，採用整數化透明度快取 Key
     */
    getMemoizedTintedImage(imgKey, opacity, config) {
        if (!this.images || !this.images[imgKey]) return null;
        const snappedOpacity = Math.round(opacity * 20) / 20;
        const cacheKey = `${imgKey}_${snappedOpacity}_${config.colorCode}`;

        if (this._tintCache.has(cacheKey)) {
            return this._tintCache.get(cacheKey);
        }

        const tinted = getTintedImage(this.images[imgKey], opacity, config);
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

    // --- 圖片與皮膚樣式分離選擇器 (Image Selection Helpers) ---

    getArcImage(isMine, isBreak, isDouble, isStar = false) {
        if (isMine) return this.images["MineArc"];
        if (isBreak) return this.images["BreakArc"];
        if (isDouble) return this.images["EachArc"];
        return this.images[isStar ? "SlideArc" : "NormalArc"];
    }

    getTapImage(isMine, isBreak, isDouble) {
        if (isMine) return this.images["tap_mine"];
        if (isBreak) {
            this._tempColorConfig.colorCode = "#fff8a6";
            const br = this.getBreakTint(isBreak, isMine);
            return this.getMemoizedTintedImage("tap_break", br, this._tempColorConfig);
        }
        if (isDouble) return this.images["tap_each"];
        return this.images["tap"];
    }

    getStarImage(isMine, isBreak, isDouble, isMultiple, forceblue = false) {
        const isPink = this.settings.pinkStars && !forceblue;
        const imgKey = isMultiple ?
            (isMine ? "star_mine_double" : (isBreak ? "star_break_double" : (isDouble ? "star_each_double" : (isPink ? "star_pink_double" : "star_double")))) :
            (isMine ? "star_mine" : (isBreak ? "star_break" : (isDouble ? "star_each" : (isPink ? "star_pink" : "star"))));

        if (isBreak) {
            this._tempColorConfig.colorCode = "#fff8a6";
            const br = this.getBreakTint(isBreak, isMine);
            return this.getMemoizedTintedImage(imgKey, br, this._tempColorConfig);
        }
        return this.images[imgKey];
    }

    getHoldImage(isMine, isBreak, isDouble, isOn) {
        const holdImgKey = isOn ?
            (isMine ? "hold_mine" : (isBreak ? "hold_break_on" : (isDouble ? "hold_each_on" : "hold_on"))) :
            (isMine ? "hold_mine" : (isBreak ? "hold_break" : (isDouble ? "hold_each" : "hold")));

        if (isBreak) {
            this._tempColorConfig.colorCode = "#fff8a6";
            const br = this.getBreakTint(isBreak, isMine);
            return this.getMemoizedTintedImage(holdImgKey, br, this._tempColorConfig);
        }
        return this.images[holdImgKey];
    }

    getHoldEndImage(isMine, isBreak, isDouble) {
        if (isMine) return this.images["Hold_Mine_End"];
        if (isBreak) return this.images["Hold_Break_End"];
        if (isDouble) return this.images["Hold_Each_End"];
        return this.images["Hold_End"];
    }

    getTouchBorderImages(isMine, isDouble) {
        const key = isMine ? "mine" : (isDouble ? "each" : "normal");
        if (!this._touchBorderCache) this._touchBorderCache = {};
        if (!this._touchBorderCache[key]) {
            this._touchBorderCache[key] = {
                borderImg: this.images[isMine ? "touch_border_2_mine" : (isDouble ? "touch_border_2_each" : "touch_border_2")],
                borderImg3: this.images[isMine ? "touch_border_3_mine" : (isDouble ? "touch_border_3_each" : "touch_border_3")],
                touchPoint: this.images[isMine ? "touch_point_mine" : (isDouble ? "touch_point_each" : "touch_point")],
                touchImg: this.images[isMine ? "touch_mine" : (isDouble ? "touch_each" : "touch")]
            };
        }
        return this._touchBorderCache[key];
    }

    getEXColor(isBreak, isDouble, noteType, isPink = false) {
        if (isBreak) return this.exColor.break;
        if (isDouble) return this.exColor.double;
        return isPink ? this.exColor.tap : (this.exColor[noteType] || this.exColor.tap);
    }

    getBreakTint(isBreak, isMine) {
        return (isBreak && !isMine) ? Math.pow(Math.sin(this.globalTime * -6), 2) * 0.7 : 0;
    }

    getNoteSizeScaled(size) {
        if (typeof size === 'number') {
            this._tempSize[0] = size;
            this._tempSize[1] = size;
            return this._tempSize;
        }
        if (size instanceof Array) {
            this._tempSize[0] = size[0];
            this._tempSize[1] = size.length < 2 ? size[0] : size[1];
            return this._tempSize;
        }
        this._tempSize[0] = 1;
        this._tempSize[1] = 1;
        return this._tempSize;
    }

    setContext(ctx) {
        this.canvas = ctx.canvas;
        this.ctx = ctx;
        if (this.ctx) {
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
        }
        this.updateCanvasMetrics();
        this.invalidateCaches();
    }

    resize(width, height, dpr = 1, force = false) {
        if (!this.canvas || !this.ctx) return false;
        this.dpr = dpr;
        const w = Math.round(width * dpr);
        const h = Math.round(height * dpr);

        if (!force && this.canvas.width === w && this.canvas.height === h) {
            return false;
        }

        this.canvas.width = w;
        this.canvas.height = h;

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';

        const p = Math.min(w, h) / scaleBase * this.scale;
        this.ctx.setTransform(p, 0, 0, p, w / 2, h / 2);

        this.updateCanvasMetrics();
        this.invalidateCaches();
        return true;
    }

    invalidateCaches() {
        this._staticBackgroundCache = null;
        this._staticBackgroundCacheParams = null;
        this._sensorShapeCache = null;
        this._sensorTextCache = null;
        this._sensorCacheParams = null;
        this._hitEffectCache = null;
        this._middleDisplayCanvas = null;
        this._lastMiddleCacheKey = null;
        this._canvasWH = null;
        if (this.offscreen) {
            const wh = this.getCanvasWH();
            this.offscreen.width = wh.width;
            this.offscreen.height = wh.height;
        }
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

    // --- 視覺效果 ---

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

    ensureHitEffectCache() {
        if (this._hitEffectCache) return;
        this._hitEffectCache = new Path2D();
        this._hitEffectCache.arc(0, 0, 1, 0, Math.PI * 2);
    }

    /**
     * 佇列單次打擊光圈特效 (Hit Effect) - 具備同位置去重 (Deduplication)
     */
    queueHitEffect(pos, noteT, judge = null, x = null, y = null) {
        if (!this.settings.drawHitEffect) return;
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
        if (!this.settings.drawHitEffect) return;
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
        if (!this.settings.drawHitEffect || this._hitEffectCount === 0) {
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
    spawnJudgeEffect(note, judgeResult = null, triggerTime = null) {
        if (!this.settings || this.settings.showJudge === false) return;
        if (!note) return;
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
                rot = note.endTangent ?? (note.path?.endTangent ?? 0);
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
        // Script 沒有玩家判定機制，判定等級只保留 CRITICAL_PERFECT 與 PERFECT
        const showCP = (this.settings.showCriticalPerfect !== false);
        const grade = (judgeResult && judgeResult.grade)
            ? (judgeResult.grade === 'PERFECT' ? 'PERFECT' : 'CRITICAL_PERFECT')
            : (showCP ? 'CRITICAL_PERFECT' : 'PERFECT');

        let breakScoreValue = judgeResult ? judgeResult.breakScoreValue : null;
        if (isBreak && (breakScoreValue === undefined || breakScoreValue === null)) {
            if (grade === 'CRITICAL_PERFECT') {
                breakScoreValue = 2600;
            } else {
                breakScoreValue = (judgeResult && judgeResult.breakMultiplier === 0.5) ? 2500 : 2550;
            }
        }

        const text = isBreak ? `${breakScoreValue}` : (grade === 'CRITICAL_PERFECT' ? 'PERFECT' : grade);
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
                    existing.subGrade = judgeResult ? judgeResult.subGrade : null;
                    existing.grade = grade;
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
                        existing.subGrade = judgeResult ? judgeResult.subGrade : null;
                        existing.grade = grade;
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
                            existing.subGrade = judgeResult ? judgeResult.subGrade : null;
                            existing.grade = grade;
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
            subGrade: judgeResult ? judgeResult.subGrade : null,
            grade: grade,
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

    queueJudgeEffect(note, judgeResult = null, triggerTime = null) {
        if (!note) return;
        const targetT = (triggerTime !== null && triggerTime !== undefined) ? triggerTime : this.globalTime;
        const duration = (note.type === 'slide') ? 0.3 : 0.2;
        const elapsed = this.globalTime - targetT;
        // 若該音符尚未到達觸發時間 (容許 0.05 秒誤差)，或已超過動畫長度，則忽略
        if (elapsed < -0.05 || elapsed > duration) return;
        this.spawnJudgeEffect(note, judgeResult, targetT);
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

        // 3. 根據 Grade 選擇對應的圖片 Key (只保留 Critical Perfect 與 Perfect)
        const isCritical = (eff.grade === 'CRITICAL_PERFECT');
        const candidateKey = (isCritical && showCP) ? `just_${state}` : `just_${state}_p`;

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
                const isCritical = (eff.grade === 'CRITICAL_PERFECT');
                if (eff.isBreak) {
                    const showCP = isCritical && (this.settings.showBreakCriticalPerfect !== false) && (this.settings.showCriticalPerfect !== false);
                    if (showCP) {
                        imgKey = 'judge_text_cPerfect_break';
                        isBreakFlashing = true;
                    } else {
                        imgKey = 'judge_text_perfect_break';
                        isBreakFlashing = false;
                    }
                } else {
                    const showCP = isCritical && (this.settings.showCriticalPerfect !== false);
                    imgKey = showCP ? 'judge_text_normal' : 'judge_text_perfect';
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
        const decayAlpha = 1 - Math.max(0, -t);
        const radius = 0.5 * this.settings.noteBaseSize * (1 - decayAlpha);

        if (!isBatch) {
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'lighter';
        }

        this.ctx.strokeStyle = getJudgeRgba(judge, 0.9 * decayAlpha);
        this.ctx.lineWidth = 0.25 * this.settings.noteBaseSize * decayAlpha;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.stroke();

        if (!isBatch) {
            this.ctx.restore();
        }
    }

    simpleHanabi(noteT, isCenter) {
        const t = noteT / this.settings.hanabiEffectDecayTime;
        if (t < -1) return;
        this.ctx.save();
        const ease = (x) => 1 - Math.pow(1 - x, 2);
        const decayAlpha = 1 - Math.max(0, -t);
        const radius = (3 + isCenter * 1) * this.settings.noteBaseSize * ease(1 - decayAlpha);
        const color = this.ctx.createLinearGradient(-radius, -radius, radius, radius);
        color.addColorStop(0, "#00D5FF");
        color.addColorStop(0.4, "#FF00FF");
        color.addColorStop(0.8, "#FFD823");
        color.addColorStop(1, "#FFD823");
        const white = this.ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.3);
        white.addColorStop(0, "#ffffff00");
        white.addColorStop(0.4, "#ffffff00");
        white.addColorStop(0.8, "#ffffff8b");
        white.addColorStop(1, "#ffffff00");

        this.ctx.globalAlpha = decayAlpha;
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.fillStyle = white;
        this.ctx.globalAlpha = decayAlpha * 0.8;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.lineWidth = 1.4 * decayAlpha * this.settings.noteBaseSize * (1 - ease(Math.max(0, -t)));
        this.ctx.strokeStyle = color;
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = decayAlpha * 0.5;
        this.ctx.fill();
        this.ctx.restore();
    }

    richHanabi(noteT) {
        const t = noteT / this.settings.hanabiEffectDecayTime;
        if (t < -1) return;
        const invt = clamp(-t, 0, 1);

        this.offscreen = this.offscreen || new OffscreenCanvas(1, 1);

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
            // 限制輸出範圍在 0 ~ 1 之間
            return Math.max(0, Math.min(1, val));
        }

        const ctx = this.ctx;
        const decayAlpha = getCustomCurveClamped(-t);
        const radius = 5 * this.settings.noteBaseSize * easeOutExpo(invt * 0.25);

        this.offscreen.width = this.getCanvasWH().width;
        this.offscreen.height = this.getCanvasWH().height;

        const offctx = this.offscreen.getContext('2d');

        /*const white = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        white.addColorStop(0, "#ffffff00");
        white.addColorStop(0.4, "#ffffff00");
        white.addColorStop(0.8, "#ffffff8b");
        white.addColorStop(1, "#ffffff00");

        ctx.save();
        ctx.fillStyle = white;
        ctx.globalAlpha = decayAlpha;
        ctx.beginPath();
        ctx.arc(0, 0, scaleBase / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();*/

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = decayAlpha * 0.5;
        ctx.globalAlpha = 1;
        this.drawImgAtcenter(this.images.ColorBall, this.settings.noteBaseSize * 3.8, 0, 0);
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
                    ctx.arc(x, y, size, 0, 2 * Math.PI)
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
        const t = noteT * -2;
        const decayAlpha = 1 - Math.max(0, t % 1);
        const decayAlpha1 = 1 - Math.max(0, (t + 0.5) % 1);
        const radius = 0.6 * this.settings.noteBaseSize * (1 - decayAlpha);
        const radius1 = 0.6 * this.settings.noteBaseSize * (1 - decayAlpha1);

        if (!isBatch) {
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'lighter';
        }

        this.ctx.strokeStyle = getJudgeRgba(judge, 0.6 * decayAlpha);
        this.ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.strokeStyle = getJudgeRgba(judge, 0.6 * decayAlpha1);
        this.ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha1;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius1, 0, Math.PI * 2);
        this.ctx.stroke();

        if (!isBatch) {
            this.ctx.restore();
        }
    }

    getNoteTransform(noteT, speedMult = 1, size) {
        const sz = this.getNoteSizeScaled(size);
        const speed = (speedMult === 1) ? this._speedFactor : calcPiecewiseSpeed(this.settings.speed * speedMult);
        const progress = noteT * speed;
        const t = 1 - this.timeFunction(progress);
        const displayT = Math.max(this.settings.middleDistance, t);
        const currentScale = t < this.settings.middleDistance
            ? Math.max(0, (t + 0.9) / (0.9 + this.settings.middleDistance))
            : 1;
        if (!this._tempTransform) {
            this._tempTransform = { t: 0, displayT: 0, currentScale: 0, scaleX: 1, scaleY: 1 };
        }
        this._tempTransform.t = t;
        this._tempTransform.displayT = displayT;
        this._tempTransform.currentScale = currentScale;
        this._tempTransform.scaleX = Math.abs(sz[0]);
        this._tempTransform.scaleY = Math.abs(sz[1]);
        return this._tempTransform;
    }

    // --- 渲染流程 ---

    drawFrame(state) {
        const { ctx } = this;
        const {
            globalTime,
            buckets,
            dt,
            showSensor,
            showSensorText,
            playCombo,
            playScore,
            noteQuantity = {
                tap: 0,
                hold: 0,
                slide: 0,
                touch: 0,
                break: 0
            },
            playScoreRes = {
                tap: 0,
                hold: 0,
                slide: 0,
                touch: 0,
                break: 0,
                score: 0,
                breakScore: 0, invScore: 0
            },
            nowIndex,
            isPlaying,
            playing,
        } = state;

        this.globalTime = globalTime;
        this.playCombo = playCombo;
        this.playScore = playScore;
        this.isPlaying = (isPlaying !== undefined) ? !!isPlaying : (playing !== undefined ? !!playing : false);

        // 若非播放中 (如暫停、更新譜面或拖曳時間軸)，立即清空判定文字特效，避免靜態殘留
        if (!this.isPlaying) {
            this.clearJudgeEffects();
        }

        if (!this.images) return;

        this.currentTouchNotes = buckets.touch || [];
        // 重置 zoneCounts，避免每幀分配新物件
        this._zoneCounts.fill(0);
        for (let idx = 0; idx < this.currentTouchNotes.length; idx++) {
            const n = this.currentTouchNotes[idx];
            const t = n.time - this.globalTime;
            const isActive = n.holdDuration ? (-t <= n.holdDuration) : (t > 0);
            if (isActive) {
                const zoneKey = TOUCH_GROUP_TO_INDEX[n.touchPos] + (n.touchPos === 'C' ? 0 : n.pos - 1);
                this._zoneCounts[zoneKey]++;
            }
        }
        this.drawnBorders.fill(0);

        // 重置 hanabiEffect 狀態，避免每幀分配新物件
        for (let i = 0; i < 33; i++) {
            this.hanabiEffect[i].cleared = true;
            this.hanabiEffect[i].time = -99999;
        }

        // 1. 更新座標指標
        this.updateCanvasMetrics();
        const { _hw: hw, _hh: hh, canvas: { width: w, height: h } } = this;

        // 2. 清除畫面 (座標系已經 transform 過的話，注意清除範圍)
        if (!state.skipClear) {
            ctx.clearRect(-hw, -hh, w, h);
        }

        // 3. 繪製外框輪廓 (若未隱藏外框)
        if (!this.settings?.hideOutline) {
            this.drawOutline();
        }

        // 4. 繪製順序優化
        if (showSensor || showSensorText) this.drawSensors(showSensor, showSensorText);

        // 分數與 Combo 建議改為「動態繪製」而非「快取繪製」，因為變動頻率太高
        this.drawMiddleDisplay();

        if (this.settings.drawHanabiEffect) {
            const touchBucket = buckets.touch;
            for (let i = 0; i < touchBucket.length; i++) this.getTouchHanabi(touchBucket[i]);
            this.drawHanabiEffects();
        }
        const slideBucket = buckets.slide;
        for (let i = 0; i < slideBucket.length; i++) this.drawSlideTrack(slideBucket[i]);
        for (let i = 0; i < slideBucket.length; i++) this.drawSlideStar(slideBucket[i]);

        if (buckets.tapnhold && buckets.tapnhold.length > 0) {
            this.drawTapAndHoldList(buckets.tapnhold);
        }
        const touchBucket = buckets.touch;
        for (let i = 0; i < touchBucket.length; i++) this.drawTouch(touchBucket[i]);

        // 獨立分離的打擊特效層 (Hit Effects Pass)
        this.drawHitEffects();
        this.drawJudgeEffects();

        if (!this.settings.noBorder) this.drawStaticBackground();
        if (this.settings.renderSurroundingAuxiliaryText) this.drawAuxiliaryText(dt, globalTime, noteQuantity, playScoreRes, playCombo, playScore);
        if (this.settings.showUI) this.drawUI(dt, globalTime);
    }

    /**
     * 繪製 10 秒影片載入動畫與譜面資訊卡
     */
    drawLoadingIntro({
        t = 0,
        duration = 5,
        backgroundImage = null,
        chartInfo = {},
    } = {}) {
        const levelColors = {
            1: "#248ACA",
            2: "#43C122",
            3: "#FFBA01",
            4: "#FE5963",
            5: "#A356E9",
            6: "#E3E6E5",
            7: "#FF6EFC",
        }
        const levels = {
            1: 'EAZY',
            2: 'BASIC',
            3: 'ADVANCED',
            4: 'EXPERT',
            5: 'MASTER',
            6: 'Re:MASTER',
            7: 'U•TA•GE'
        }
        function getAnimation(t = 0, duration = 1, callback = (progress) => { }) {
            const progress = Math.min(Math.max(t / duration, 0), 1);
            callback(progress);
        }
        function outlineText(ctx, text, x, y) {
            ctx.strokeText(text, x, y);
            ctx.fillText(text, x, y);
        }
        function darkenHexColor(hex, percent) {
            // 移除可能帶有的 # 號
            let cleanHex = hex.replace(/^#/, '');

            // 如果是 3 位數的簡寫 (如 #f00)，擴充成 6 位數 (#ff0000)
            if (cleanHex.length === 3) {
                cleanHex = cleanHex.split('').map(char => char + char).join('');
            }

            // 將 R, G, B 分別轉成十進位數值
            let num = parseInt(cleanHex, 16);
            let r = (num >> 16);
            let g = (num >> 8) & 0x00FF;
            let b = num & 0x0000FF;

            // 計算調暗後的數值，並確保不會小於 0
            const factor = 1 - (percent / 100);
            r = Math.max(0, Math.floor(r * factor));
            g = Math.max(0, Math.floor(g * factor));
            b = Math.max(0, Math.floor(b * factor));

            // 轉回 16 進位字串並補足兩位數
            const toHex = (val) => val.toString(16).padStart(2, '0');

            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }

        const ctx = this.ctx;
        ctx.save();
        this.updateCanvasMetrics();
        const { _hw: hw, _hh: hh, canvas: { width: w, height: h } } = this;
        const dur = (duration - t);
        const durInv = duration - dur;

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

        const cardPath = new Path2D();
        cardPath.arc(16, 25, 2, 0, Math.PI * 0.5);
        cardPath.arc(-16, 25, 2, Math.PI * 0.5, Math.PI * 1);
        cardPath.arc(-16, -33.5, 2, Math.PI * 1, Math.PI * 1.5)
        cardPath.arc(-2, -33.5, 2, Math.PI * 1.5, Math.PI * 2);
        cardPath.arc(2, -32, 2, Math.PI * 1, Math.PI * 0.5, true);
        cardPath.arc(16, -28, 2, Math.PI * 1.5, Math.PI * 2);
        cardPath.closePath();
        const lvPath = new Path2D();
        lvPath.arc(16, -0.5, 2, 0, Math.PI * 0.5);
        lvPath.arc(7.5, 3.5, 2, Math.PI * 1.5, Math.PI * 1, true);
        lvPath.arc(3.5, 5.5, 2, 0, Math.PI * 0.5);
        lvPath.lineTo(18, 7.5);
        lvPath.closePath();
        const capsulePath = new Path2D();
        capsulePath.arc(-2.5, -33, 2, Math.PI * 1.5, Math.PI * 0.5);
        capsulePath.arc(-15.5, -33, 2, Math.PI * 0.5, Math.PI * 1.5);
        capsulePath.closePath();

        ctx.beginPath();
        ctx.arc(0, 0, scaleBase / 2, 0, Math.PI * 2);
        ctx.clip('evenodd');

        if (dur > 0.6) {

            ctx.save();
            ctx.filter = 'blur(10px) brightness(0.8)';
            this.drawImgAtcenter(img, 110);
            ctx.restore();

            ctx.save();
            getAnimation(t, 0.5, (s) => {
                const p = 1 - easeOutQuad(s);
                ctx.globalAlpha = 1 - p;
                ctx.scale(p * 0.3 + 1, p * 0.3 + 1);
            });
            const diffVal = chartInfo.difficulty ?? chartInfo.diff ?? 5;
            const levelColor = levelColors[diffVal] || "#A356E9";
            const levelColorDark = darkenHexColor(levelColor, 40);
            const rawLv = String(chartInfo.lv ?? '');
            const lvText = rawLv.replaceAll('+', '');
            const isPlus = rawLv.includes('+');
            const difficultyText = levels[diffVal] || 'MASTER';
            ctx.strokeStyle = levelColorDark;
            ctx.lineWidth = 0.25;
            ctx.stroke(cardPath);
            ctx.clip(cardPath);
            ctx.fillStyle = levelColor;
            ctx.fillRect(-20, -50, 40, 100);

            ctx.strokeStyle = "rgba(255,255,255,0.3)";
            ctx.beginPath();
            ctx.lineWidth = 1.6;
            ctx.arc(0, -12.5, 17, Math.PI * 0.25, Math.PI * 0.75, true);
            ctx.stroke();
            ctx.strokeStyle = "rgba(255,255,255,0.2)";
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
            ctx.fill(capsulePath);

            ctx.font = "1.9px title";
            ctx.textAlign = "center";
            ctx.fillText(chartInfo.title ?? '', 0, 11);
            ctx.font = '1.8px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            ctx.fillText(chartInfo.artist ?? '', 0, 14.8);
            ctx.fillStyle = "#093F80";
            ctx.textAlign = "left";
            ctx.font = "1.2px title";
            ctx.fillText("NOTES DESIGNER", -17, 23.5);
            ctx.font = '1.8px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            ctx.fillText(chartInfo.des ?? chartInfo.designer ?? '', -17, 25.5);
            ctx.font = "bold 2.5px title";
            ctx.textAlign = "center";
            ctx.fillText("CUSTOM", -9, -32);

            getAnimation(t, 0.5, (s) => {
                const p = 1 - easeOutQuad(s);
                ctx.globalAlpha = 1 - p;
                if (img && (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement || (window.ImageBitmap && img instanceof ImageBitmap))) {
                    this.drawImgAtcenter(img, 29.8 - p * 10, 0, -12.5);
                }
                ctx.scale(p * 0.3 + 1, p * 0.3 + 1);
            });
            ctx.lineWidth = 0.3;
            ctx.strokeStyle = levelColor;
            ctx.stroke(lvPath);
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.fill(lvPath);

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
            ctx.letterSpacing = "-0.5px"
            ctx.lineWidth = 0.5;
            outlineText(ctx, lvText, 12, 6.5);
            ctx.font = 'bold 3.6px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
            ctx.textAlign = "left";
            outlineText(ctx, isPlus ? "+" : "", 13.8 + (lvText.length - 1), 3.5);
            //outlineText(ctx, chartInfo.lv, 9.5, 6.8);
            ctx.restore();
        }
        function aniCurve1(t) {
            return Math.pow(1 - 2 * t, 4);
        }
        ctx.save();
        if (t < 0.2) {
            getAnimation(t, 0.2, (s) => {
                ctx.rotate(Math.PI * 0.25);
                ctx.fillStyle = "#FFF";
                ctx.fillRect(easeInBack(s) * 50, -50, 50, 100);
                ctx.fillStyle = "#84FEED";
                ctx.fillRect(easeInBack(s) * 20 + 31, -50, 50, 100);
                ctx.fillStyle = "#2DD4ED";
                ctx.fillRect(easeInBack(s) * 10 + 41, -50, 50, 100);
                ctx.rotate(Math.PI);
                ctx.fillStyle = "#FFF";
                ctx.fillRect(easeInBack(s) * 50, -50, 50, 100);
                ctx.fillStyle = "#84FEED";
                ctx.fillRect(easeInBack(s) * 20 + 31, -50, 50, 100);
                ctx.fillStyle = "#2DD4ED";
                ctx.fillRect(easeInBack(s) * 10 + 41, -50, 50, 100);
            });
        }
        ctx.restore();
        if (dur < 0.8 && t < duration) {
            ctx.save();
            getAnimation(0.8 - dur, 0.4, (s) => {
                ctx.rotate(Math.PI * 0.25);
                ctx.fillStyle = "#FFF";
                ctx.fillRect(aniCurve1(s) * 50, -50, 50, 100);
                ctx.fillStyle = "#84FEED";
                ctx.fillRect(aniCurve1(s) * 20 + 31, -50, 50, 100);
                ctx.fillStyle = "#2DD4ED";
                ctx.fillRect(aniCurve1(s) * 10 + 41, -50, 50, 100);
                ctx.rotate(Math.PI);
                ctx.fillStyle = "#FFF";
                ctx.fillRect(aniCurve1(s) * 50, -50, 50, 100);
                ctx.fillStyle = "#84FEED";
                ctx.fillRect(aniCurve1(s) * 20 + 31, -50, 50, 100);
                ctx.fillStyle = "#2DD4ED";
                ctx.fillRect(aniCurve1(s) * 10 + 41, -50, 50, 100);
            });
            ctx.restore();
        }
        ctx.restore();
    }

    drawUI(dt, globalTime) {
        const { ctx } = this;
        const { width: w, height: h } = this.getCanvasWH();

        if (!this._frameHistory) {
            this._frameHistory = new Float32Array(300);
            this._samplesBuffer = new Float32Array(300);
            this._frameIndex = 0;
            this._frameCount = 0;
            this._lastStatsCalcTime = 0;
            this._cachedAvgVal = '---';
            this._cachedLow1Val = '---';
            this._cachedLow01Val = '---';
            this._cachedFpsVal = '---';
        }

        if (dt > 0) {
            this._frameHistory[this._frameIndex] = 1 / dt;
            this._frameIndex = (this._frameIndex + 1) % this._frameHistory.length;
            if (this._frameCount < this._frameHistory.length) {
                this._frameCount++;
            }
        }

        const now = performance.now();
        // 降低統計重算頻率：每 500ms 計算一次平均與百分位數，其餘幀沿用快取，省去每幀 300 元素陣列複製與排序的昂貴負擔
        if (now - this._lastStatsCalcTime > 500 && this._frameCount > 0) {
            this._lastStatsCalcTime = now;
            let sum = 0;
            for (let i = 0; i < this._frameCount; i++) {
                sum += this._frameHistory[i];
            }
            this._cachedAvgVal = (sum / this._frameCount).toFixed(2);
            this._cachedFpsVal = dt === 0 ? 'PAUSE' : (1 / dt).toFixed(2);

            // 原地複製到已有緩衝區進行排序，不產生記憶體垃圾
            this._samplesBuffer.set(this._frameHistory.subarray(0, this._frameCount));
            const activeSamples = this._samplesBuffer.subarray(0, this._frameCount);
            activeSamples.sort(); // TypedArray 的原地排序速度極快

            const idx1 = Math.floor(this._frameCount * 0.01);
            const idx01 = Math.floor(this._frameCount * 0.001);
            this._cachedLow1Val = activeSamples[idx1].toFixed(2);
            this._cachedLow01Val = activeSamples[idx01].toFixed(2);
        } else if (dt === 0) {
            this._cachedFpsVal = 'PAUSE';
        }

        const fpsText = `FPS: ${this._cachedFpsVal}`;
        const avgFpsText = `Avg FPS: ${this._cachedAvgVal}`;
        const low1Text = `1% Low: ${this._cachedLow1Val}`;
        const low01Text = `0.1% Low: ${this._cachedLow01Val}`;
        const timeText = `Time: ${globalTime < 0 ? '-' + Math.abs(Math.ceil(globalTime / 60)) : Math.floor(globalTime / 60)}:${Math.abs(globalTime % 60).toFixed(2).padStart(5, '0')}`;

        ctx.save();
        ctx.font = "3px mono";
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        const startX = -w / 2 + 2;
        let startY = -h / 2 + 2;
        ctx.fillText(fpsText, startX, startY);
        ctx.fillText(avgFpsText, startX, startY + 4);
        ctx.fillText(low1Text, startX, startY + 8);
        ctx.fillText(low01Text, startX, startY + 12);
        ctx.fillText(timeText, startX, startY + 16);

        ctx.restore();
    }

    drawAuxiliaryText(dt, globalTime, noteQuantity, playScoreRes, playCombo, playScore) {
        const { width: w, height: h } = this.getCanvasWH();
        if (h >= w) return;
        const { ctx } = this;
        const allRes = playScoreRes.tap + playScoreRes.hold + playScoreRes.slide + playScoreRes.touch + playScoreRes.break;

        ctx.save();
        if ('textRendering' in ctx) {
            try { ctx.textRendering = 'geometricPrecision'; } catch (_) { }
        }
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.font = "9px mono";
        ctx.letterSpacing = "-1px";

        ctx.fillText(`${globalTime < 0 ? '-' + Math.abs(Math.ceil(globalTime / 60)) : Math.floor(globalTime / 60)}:${Math.abs(globalTime % 60).toFixed(2).padStart(5, '0')}`,
            scaleBase / -2 - 5, -1);

        ctx.letterSpacing = "0px";
        ctx.font = '4px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
        ctx.fillText('Powered by', scaleBase / -2 - 3, h / 2 - 5);
        ctx.font = '2.5px "Plus Jakarta Sans", "Noto Sans TC", sans-serif';
        ctx.fillText('susuy0725/web-mai-chart-x', scaleBase / -2 - 3, h / 2 - 2);

        ctx.textAlign = "left";
        this._auxTextList[0] = `${playCombo}/${allRes}`;
        this._auxTextList[1] = `ALL:`;
        this._auxTextList[2] = `${noteQuantity.break}/${playScoreRes.break}`;
        this._auxTextList[3] = `BRK:`;
        this._auxTextList[4] = `${noteQuantity.touch}/${playScoreRes.touch}`;
        this._auxTextList[5] = `TOH:`;
        this._auxTextList[6] = `${noteQuantity.slide}/${playScoreRes.slide}`;
        this._auxTextList[7] = `SLD:`;
        this._auxTextList[8] = `${noteQuantity.hold}/${playScoreRes.hold}`;
        this._auxTextList[9] = `HOD:`;
        this._auxTextList[10] = `${noteQuantity.tap}/${playScoreRes.tap}`;
        this._auxTextList[11] = `TAP:`;

        const sp = 6;
        const lil = (this._auxTextList.length * sp - Math.floor(this._auxTextList.length / 2)) / 2 + sp;
        // 分組批次繪製，減少每幀 12 次 ctx.font 切換重解析的開銷
        ctx.font = "bold 5px mono";
        for (let i = 1; i < this._auxTextList.length; i += 2) {
            ctx.fillText(this._auxTextList[i], scaleBase / 2 + 3, lil - i * sp);
        }
        ctx.font = "4px mono";
        for (let i = 0; i < this._auxTextList.length; i += 2) {
            ctx.fillText(this._auxTextList[i], scaleBase / 2 + 3, lil - i * sp - 1);
        }
        ctx.textBaseline = "top";
        ctx.textAlign = "right";

        ctx.font = "bold 5px mono";
        ctx.fillText('DELUXE Rate:', scaleBase / -2 - 3, 1);
        ctx.font = "7px mono";
        ctx.fillText(playScore.toFixed(4) + "%", scaleBase / -2 - 3, 8);

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
        if (cctx) {
            cctx.imageSmoothingEnabled = true;
            cctx.imageSmoothingQuality = 'high';
        }
        const p = Math.min(wPx, hPx) / scaleBase * scale;
        cctx.setTransform(p, 0, 0, p, wPx / 2, hPx / 2);

        cctx.save();
        cctx.beginPath();
        cctx.rect(-wPx, -hPx, wPx * 2, hPx * 2);
        cctx.arc(0, 0, scaleBase / 2, 0, Math.PI * 2);
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
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this._staticBackgroundCache, 0, 0);
        ctx.restore();
    }

    setOutlineImage(img) {
        this._outlineImage = img;
    }

    getOutlineImage() {
        if (this.images?.outline && !imgNotExists(this.images.outline)) {
            return this.images.outline;
        }
        if (this._outlineImage && !imgNotExists(this._outlineImage)) {
            return this._outlineImage;
        }
        if (typeof document !== 'undefined') {
            const domOutline = document.getElementById('canvasOutline');
            if (domOutline && domOutline.complete && domOutline.naturalWidth > 0) {
                return domOutline;
            }
        }
        return null;
    }

    drawOutline() {
        if (this.settings?.hideOutline) return;
        const img = this.getOutlineImage();
        if (!img) return;

        const { ctx } = this;
        ctx.save();
        this.resetBaseTransform();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const size = scaleBase * 0.905;
        ctx.drawImage(img, -size * 0.5, -size * 0.5, size, size);
        ctx.restore();
    }

    drawMiddleDisplay() {
        const mode = this.settings.middleDisplay;
        if (!mode) return;

        if (!this.canvas || this.canvas.width <= 0 || this.canvas.height <= 0 || !this.scale || this.scale <= 0) {
            return;
        }

        const p = Math.min(this.canvas.width, this.canvas.height) / scaleBase * this.scale;
        if (p <= 0 || !isFinite(p)) return;

        const boxWUnits = 46;
        const boxHUnits = 26;
        const pxW = Math.ceil(boxWUnits * p);
        const pxH = Math.ceil(boxHUnits * p);
        if (pxW <= 0 || pxH <= 0) return;

        const combo = this.playCombo;
        const scoreValue = (mode === 3)
            ? (this.playScoreMinus !== undefined ? this.playScoreMinus : 101)
            : (this.playScore ?? 0);
        const scoreInt = Math.round(scoreValue * 10000);

        const isDirty = !this._middleDisplayCanvas ||
            this._lastMiddleMode !== mode ||
            this._lastMiddleCombo !== combo ||
            this._lastMiddleScoreInt !== scoreInt ||
            this._lastMiddlePxW !== pxW ||
            this._lastMiddlePxH !== pxH;

        if (isDirty) {
            this._lastMiddleMode = mode;
            this._lastMiddleCombo = combo;
            this._lastMiddleScoreInt = scoreInt;
            this._lastMiddlePxW = pxW;
            this._lastMiddlePxH = pxH;

            if (!this._middleDisplayCanvas) {
                this._middleDisplayCanvas = document.createElement('canvas');
                this._middleDisplayCtx = this._middleDisplayCanvas.getContext('2d');
            }

            if (this._middleDisplayCanvas.width !== pxW || this._middleDisplayCanvas.height !== pxH) {
                this._middleDisplayCanvas.width = pxW;
                this._middleDisplayCanvas.height = pxH;
            }

            const mctx = this._middleDisplayCtx;
            if (mctx) {
                mctx.imageSmoothingEnabled = true;
                mctx.imageSmoothingQuality = 'high';
            }
            mctx.clearRect(0, 0, pxW, pxH);
            mctx.save();
            mctx.setTransform(p, 0, 0, p, pxW / 2, pxH / 2);
            this.renderMiddleDisplayToContext(mctx);
            mctx.restore();

            this._middleBoxWUnits = boxWUnits;
            this._middleBoxHUnits = boxHUnits;
        }

        if (!this._middleDisplayCanvas || this._middleDisplayCanvas.width === 0 || this._middleDisplayCanvas.height === 0) {
            return;
        }

        const hw = (this._middleBoxWUnits || boxWUnits) / 2;
        const hh = (this._middleBoxHUnits || boxHUnits) / 2;
        this.ctx.drawImage(this._middleDisplayCanvas, -hw, -hh, this._middleBoxWUnits || boxWUnits, this._middleBoxHUnits || boxHUnits);
    }

    renderMiddleDisplayToContext(ctx) {
        ctx.save();
        switch (this.settings.middleDisplay) {
            case 1:
                if (this.playCombo != 0) {
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
                if (trueScore > 80) {
                    scoreColor = "#9E3D2E";
                }
                if (trueScore > 100) {
                    scoreColor = "#99853A";
                }
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
    // 建立或確認靜態快取（在畫布尺寸或 scale 變動時會重建）
    ensureSensorCaches() {
        const wPx = this.canvas.width;
        const hPx = this.canvas.height;
        const scale = this.scale;
        if (!wPx || !hPx) return;
        const p = Math.min(wPx, hPx) / scaleBase * scale;

        const params = this._sensorCacheParams || {};
        if (this._sensorShapeCache && params.w === wPx && params.h === hPx && params.scale === scale) {
            return; // 快取仍有效
        }

        // 建立 shapes 快取
        try {
            const shapes = document.createElement('canvas');
            shapes.width = wPx;
            shapes.height = hPx;
            const sctx = shapes.getContext('2d');
            if (sctx) {
                sctx.imageSmoothingEnabled = true;
                sctx.imageSmoothingQuality = 'high';
            }
            sctx.setTransform(p, 0, 0, p, wPx / 2, hPx / 2);
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

            // 建立文字快取
            const texts = document.createElement('canvas');
            texts.width = wPx;
            texts.height = hPx;
            const tctx = texts.getContext('2d');
            if (tctx) {
                tctx.imageSmoothingEnabled = true;
                tctx.imageSmoothingQuality = 'high';
                if ('textRendering' in tctx) {
                    try { tctx.textRendering = 'geometricPrecision'; } catch (_) { }
                }
            }
            tctx.setTransform(p, 0, 0, p, wPx / 2, hPx / 2);
            tctx.save();
            tctx.fillStyle = '#ffffff30';
            tctx.textAlign = "center";
            tctx.textBaseline = "middle";
            ['A', 'B', 'D', 'E'].forEach(type => {
                const positions = touchRefPos[type];
                if (type === 'A') {
                    tctx.font = "bold 5px combo";
                } else {
                    tctx.font = "4px combo";
                }
                for (let i = 0; i < positions.length; i++) {
                    const pos = positions[i];
                    tctx.fillText(`${type}${i + 1}`, pos.x, pos.y);
                }
            });
            tctx.fillText('C', 0, 0);
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

    drawSensors(showSensor, showSensorText) {
        this.ensureSensorCaches();
        if (!this._sensorShapeCache && !this._sensorTextCache) return;

        const { ctx } = this;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        try {
            if (showSensor && this._sensorShapeCache) ctx.drawImage(this._sensorShapeCache, 0, 0);
            if (showSensorText && this._sensorTextCache) ctx.drawImage(this._sensorTextCache, 0, 0);
        } finally {
            ctx.restore();
        }
    }

    /**
     * 高性能融合渲染 (Merged High-Performance Renderer)
     * 1. 單次遍歷 (Single Pass)：零重複計算時間多項式，運算開銷降至最低
     * 2. 極速原生變換：採用 baseTransform + ctx.rotate + ctx.translate
     * 3. Hold 音符優化：徹底消除內部的 4 次 save/restore
     * 4. 特效集中批次：整幀混合模式只切換 1 次 'lighter'
     */
    drawTapAndHoldList(notes) {
        if (!notes || notes.length === 0) return;

        const ctx = this.ctx;
        const globalTime = this.globalTime;
        const md = this.settings.middleDistance;
        const baseSize = this.settings.noteBaseSize;
        const drawHitEffect = this.settings.drawHitEffect;
        const rotateStars = this.settings.rotateStars;
        const pinkStars = this.settings.pinkStars;

        const { a, b, c, d, e, f } = ctx.getTransform();

        for (let i = 0; i < notes.length; i++) {
            const s = notes[i];
            const isHold = s.type === "hold";
            const noteT = s.time - globalTime;
            const posInfo = noteRefPos[s.pos - 1];

            if (isHold) {
                // drawHold
                if (-noteT > s.holdDuration) {
                    if (drawHitEffect) {
                        this.queueHitEffect(s.pos, s.holdDuration + noteT);
                    }
                    if (this.settings.showJudge !== false) {
                        this.queueJudgeEffect(s, null, s.time + s.holdDuration);
                    }
                    continue;
                }

                const speed = (s.hispeed === 1) ? this._speedFactor : calcPiecewiseSpeed(this.settings.speed * (s.hispeed || 1));
                const t = 1 - this.timeFunction(noteT * speed);

                const t1 = 1 - this.timeFunction((noteT + s.holdDuration) * speed);
                const displayT = Math.min(1, Math.max(md, t));
                const currentScale = t < md ? Math.max(0, (t + 0.9) / (0.9 + md)) : 1;
                const size = baseSize * currentScale;
                const sizeOffset = (t < md) ? 0 :
                    Math.min(1 - md, (t - t1), (1 - t1), (t - md)) / (1 - md) * (20.35 / baseSize);
                const isOn = noteT <= -0.1 && !s.isMine;
                const img = this.getHoldImage(s.isMine, s.isBreak, s.isDouble, isOn);
                const arcimg = this.getArcImage(s.isMine, s.isBreak, s.isDouble, false);
                const endimg = this.getHoldEndImage(s.isMine, s.isBreak, s.isDouble);

                // 1. 導引弧 (Arc)
                ctx.rotate(posInfo.rot);
                if (currentScale !== 1) ctx.globalAlpha = currentScale;
                this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
                if (currentScale !== 1) ctx.globalAlpha = 1;

                // 2. Hold 尾端
                if (t1 > md && endimg) {
                    ctx.setTransform(a, b, c, d, e, f);
                    ctx.translate(posInfo.x * t1, posInfo.y * t1);
                    this.drawImgAtcenter(endimg, size * 0.65);
                }

                // 3. Hold 本體
                if (img) {
                    ctx.setTransform(a, b, c, d, e, f);
                    ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
                    ctx.rotate(posInfo.rot);

                    ctx.drawImage(img, 0, 0, 122, 55, -size * 0.5, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
                    ctx.drawImage(img, 0, 55, 122, 90, -size * 0.5, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
                    ctx.drawImage(img, 0, 145, 122, 55, -size * 0.5, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);

                    if (s.isEx) {
                        this._tempColorConfig.colorCode = this.getEXColor(s.isBreak, s.isDouble, "tap");
                        const ex = this.getMemoizedTintedImage("hold_ex", 0.6, this._tempColorConfig);
                        if (ex) {
                            ctx.drawImage(ex, 0, 0, 122, 55, -size * 0.5, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
                            ctx.drawImage(ex, 0, 55, 122, 90, -size * 0.5, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
                            ctx.drawImage(ex, 0, 145, 122, 55, -size * 0.5, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);
                        }
                    }
                    //ctx.globalAlpha = 1;
                    //ctx.fillStyle = "white";
                    //ctx.font = "3px mono";
                    //ctx.fillText(`t1:${(t1).toFixed(2)}, 1-t1:${(1 - t1).toFixed(2)}, t-md:${(t - md).toFixed(2)}`, 0, 10);
                }

                if (drawHitEffect) {
                    if (noteT <= 0 && noteT >= -0.2) {
                        this.queueHitEffect(s.pos, noteT, null, posInfo.x * displayT, posInfo.y * displayT);
                    }
                    if (isOn) {
                        this.queueHoldEffect(s.pos, noteT, null, posInfo.x * displayT, posInfo.y * displayT);
                    }
                }

                ctx.setTransform(a, b, c, d, e, f);
            } else {
                // drawtap drawstar
                // 普通 Tap / Star
                if (noteT <= 0) {
                    if (drawHitEffect) {
                        this.queueHitEffect(s.pos, noteT, null, posInfo.x, posInfo.y);
                    }
                    if (this.settings.showJudge !== false) {
                        this.queueJudgeEffect(s, null, s.time);
                    }
                    continue;
                }

                const { displayT, currentScale, scaleX, scaleY } = this.getNoteTransform(noteT, s.hispeed, s.size);
                const isStar = !!s.isStar;
                const img = isStar
                    ? this.getStarImage(s.isMine, s.isBreak, s.isDouble, s.isMultiple)
                    : this.getTapImage(s.isMine, s.isBreak, s.isDouble);
                const arcimg = this.getArcImage(s.isMine, s.isBreak, s.isDouble, isStar);
                const size = baseSize * currentScale;

                // 1. 導引弧 (Arc)
                ctx.rotate(posInfo.rot);
                if (currentScale !== 1) ctx.globalAlpha = currentScale;
                this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
                if (currentScale !== 1) ctx.globalAlpha = 1;

                // 2. 音符本體 (Tap / Star)
                ctx.setTransform(a, b, c, d, e, f);
                ctx.translate(posInfo.x * displayT, posInfo.y * displayT);

                let rot = posInfo.rot;
                if (isStar && rotateStars) {
                    let speed = 0;
                    if (s.slideDuration && s.slideDuration > 0) {
                        speed = clamp(1.5 / s.slideDuration, 0.5, 6);
                    }
                    rot += globalTime * 2 * Math.PI * speed;
                }
                ctx.rotate(rot);
                this.drawImgAtcenter(img, size, 0, 0, scaleX, scaleY);

                if (s.isEx) {
                    const exType = isStar ? "star" : "tap";
                    this._tempColorConfig.colorCode = this.getEXColor(s.isBreak, s.isDouble, exType, isStar ? pinkStars : false);
                    const exKey = isStar
                        ? (s.isMultiple ? "star_ex_double" : "star_ex")
                        : "tap_ex";
                    const exImg = this.getMemoizedTintedImage(exKey, 0.6, this._tempColorConfig);
                    if (exImg) {
                        this.drawImgAtcenter(exImg, size, 0, 0, scaleX, scaleY);
                    }
                }

                ctx.setTransform(a, b, c, d, e, f);
            }
        }
    }

    /*drawTap(s, forceStar = false) {
        const { time: noteTime, pos, isBreak, isDouble, isMultiple, isMine, hispeed } = s;
        const isStar = forceStar || !!s.isStar;
        const noteT = noteTime - this.globalTime;
        const posInfo = noteRefPos[pos - 1];
        const ctx = this.ctx;

        if (noteT <= 0) {
            if (this.settings.drawHitEffect) {
                const baseTransform = ctx.getTransform();
                ctx.translate(posInfo.x, posInfo.y);
                this.simpleHitEffect(noteT);
                ctx.setTransform(baseTransform);
            }
            return;
        }

        const { displayT, currentScale, scaleX, scaleY } = this.getNoteTransform(noteT, hispeed, s.size);
        const img = isStar
            ? this.getStarImage(isMine, isBreak, isDouble, isMultiple)
            : this.getTapImage(isMine, isBreak, isDouble);
        const arcimg = this.getArcImage(isMine, isBreak, isDouble, isStar);
        const size = this.settings.noteBaseSize * currentScale;

        const baseTransform = ctx.getTransform();

        // 1. 導引弧 (Arc)
        ctx.rotate(posInfo.rot);
        ctx.globalAlpha = currentScale;
        this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
        ctx.globalAlpha = 1;

        // 2. 音符本體 (Tap / Star)
        ctx.setTransform(baseTransform);
        ctx.translate(posInfo.x * displayT, posInfo.y * displayT);

        let rot = posInfo.rot;
        if (isStar && this.settings.rotateStars) {
            let speed = 0;
            if (s.slideDuration && s.slideDuration > 0) {
                speed = clamp(1.5 / s.slideDuration, 0.5, 6);
            }
            rot += this.globalTime * 2 * Math.PI * speed;
        }
        ctx.rotate(rot);
        this.drawImgAtcenter(img, size, 0, 0, scaleX, scaleY);

        if (s.isEx) {
            const exType = isStar ? "star" : "tap";
            this._tempColorConfig.colorCode = this.getEXColor(isBreak, isDouble, exType, isStar ? this.settings.pinkStars : false);
            const exKey = isStar
                ? (isMultiple ? "star_ex_double" : "star_ex")
                : "tap_ex";
            const exImg = this.getMemoizedTintedImage(exKey, 0.6, this._tempColorConfig);
            this.drawImgAtcenter(exImg, size, 0, 0, scaleX, scaleY);
        }

        ctx.setTransform(baseTransform);
    }

    drawHold(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine, holdDuration, hispeed } = s;
        const noteT = (noteTime - this.globalTime);
        const speedMult = this._speedFactor * (hispeed || 1);
        const t = 1 - this.timeFunction(noteT * speedMult);
        const posInfo = noteRefPos[pos - 1];

        if (-noteT > holdDuration) {
            if (this.settings.drawHitEffect) {
                this.ctx.save();
                this.ctx.translate(posInfo.x, posInfo.y);
                this.simpleHitEffect(holdDuration + noteT);
                this.ctx.restore();
            }
            return;
        }
        const md = this.settings.middleDistance;

        const isOn = (noteTime - this.globalTime) <= -0.1 && !isMine;
        const img = this.getHoldImage(isMine, isBreak, isDouble, isOn);
        const arcimg = this.getArcImage(isMine, isBreak, isDouble, false);
        const endimg = this.getHoldEndImage(isMine, isBreak, isDouble);

        const t1 = 1 - this.timeFunction((noteT + holdDuration) * speedMult);
        const displayT = Math.min(1, Math.max(md, t));
        const currentScale = t < md ? Math.max(0, (t + 0.9) / (0.9 + md)) : 1;
        const size = this.settings.noteBaseSize * currentScale;
        const sizeOffset = t < md ? 0 :
            Math.min(t - t1, Math.min(1, t, (1 - t1 + md)) * 0.98 - md) * 2.5;

        const baseTransform = this.ctx.getTransform();

        this.ctx.rotate(posInfo.rot);
        this.ctx.globalAlpha = currentScale;
        this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
        this.ctx.globalAlpha = 1;

        if (t1 > md) {
            this.ctx.setTransform(baseTransform);
            this.ctx.translate(posInfo.x * t1, posInfo.y * t1);
            this.drawImgAtcenter(endimg, size * 0.65);
        }

        function drawHoldImage(ctx, img, size, sizeOffset) {
            ctx.drawImage(img, 0, 0, 122, 55, -size * 0.5, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
            ctx.drawImage(img, 0, 55, 122, 90, -size * 0.5, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
            ctx.drawImage(img, 0, 145, 122, 55, -size * 0.5, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);
        }

        this.ctx.setTransform(baseTransform);
        this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
        this.ctx.rotate(posInfo.rot);
        drawHoldImage(this.ctx, img, size, sizeOffset);

        if (s.isEx) {
            this._tempColorConfig.colorCode = this.getEXColor(isBreak, isDouble, "tap");
            const ex = this.getMemoizedTintedImage("hold_ex", 0.6, this._tempColorConfig);
            drawHoldImage(this.ctx, ex, size, sizeOffset);
        }

        this.ctx.setTransform(baseTransform);

        if (this.settings.drawHitEffect) {
            this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
            this.simpleHitEffect(noteT);
            if (isOn) this.simpleHoldEffect(noteT);
            this.ctx.setTransform(baseTransform);
        }
    }*/

    getTouchHanabi(s) {
        const { time: noteTime, pos, touchPos, holdDuration } = s;
        const noteT = (noteTime - this.globalTime);
        if (noteT > 0) return;

        const key = TOUCH_GROUP_TO_INDEX[touchPos] + (touchPos === 'C' ? 0 : pos - 1);
        let existing = this.hanabiEffect[key];
        if (existing.cleared === false && existing.time > noteTime) {
            return;
        }

        const posInfo = touchRefPos[touchPos][touchPos === "C" ? 0 : pos - 1];
        if (holdDuration) {
            if (s.isHanabi) {
                const effT = holdDuration + noteT;
                existing.time = noteTime;
                existing.x = posInfo.x;
                existing.y = posInfo.y;
                existing.noteT = (existing.cleared === false ? Math.max(existing.noteT, effT) : effT);
                existing.isCenter = touchPos === "C";
                existing.cleared = false;
            } else {
                existing.time = noteTime;
                existing.cleared = true;
            }
            return;
        }
        if (s.isHanabi) {
            existing.time = noteTime;
            existing.x = posInfo.x;
            existing.y = posInfo.y;
            existing.noteT = (existing.cleared === false ? Math.max(existing.noteT, noteT) : noteT);
            existing.isCenter = touchPos === "C";
            existing.cleared = false;
        } else {
            existing.time = noteTime;
            existing.cleared = true;
        }
    }

    drawTouch(s) {
        const { time: noteTime, pos, touchPos, isDouble, isMine, holdDuration, hispeed } = s;
        const zoneKey = TOUCH_GROUP_TO_INDEX[touchPos] + (touchPos === 'C' ? 0 : pos - 1);

        const count = this._zoneCounts[zoneKey];

        const noteT = (noteTime - this.globalTime);
        const t = 1 - this.timeFunction(noteT * this._touchSpeedFactor * (hispeed || 1));
        const posInfo = touchRefPos[touchPos][touchPos === "C" ? 0 : pos - 1];

        const { borderImg, borderImg3, touchPoint, touchImg } = this.getTouchBorderImages(isMine, isDouble);

        if (holdDuration) {
            const isOn = (noteTime - this.globalTime) <= -0.1;
            const touchBorder = this.images["touchhold_border" + (isMine ? "_mine" : "")];

            if (-noteT > holdDuration) {
                if (this.settings.drawHitEffect) {
                    this.queueHitEffect(null, holdDuration + noteT, null, posInfo.x, posInfo.y);
                }
                if (this.settings.showJudge !== false) {
                    this.queueJudgeEffect(s, null, noteTime + holdDuration);
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

            this.ctx.globalAlpha = Math.max(0, 1 - (1 - Math.min(1, t)) * 0.5);
            this.ctx.rotate(Math.PI * -0.75);
            for (let i = 0; i < 4; i++) {
                const thImg = this.images["touchhold_" + i + (isMine ? "_mine" : "")];
                this.ctx.drawImage(thImg, -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
                this.ctx.rotate(Math.PI / 2);
            }
            this.ctx.globalAlpha = 1;
            this.drawImgAtcenter(touchPoint, size * 0.4);
            this.ctx.restore();

            if (this.settings.drawHitEffect) {
                if (noteT <= 0 && noteT >= -0.2) {
                    this.queueHitEffect(null, noteT, null, posInfo.x, posInfo.y);
                }
                if (isOn) this.queueHoldEffect(null, noteT, null, posInfo.x, posInfo.y);
            }
            return;
        }

        if (noteT <= 0) {
            if (this.settings.drawHitEffect) {
                this.queueHitEffect(null, noteT, null, posInfo.x, posInfo.y);
            }
            if (this.settings.showJudge !== false) {
                this.queueJudgeEffect(s, null, noteTime);
            }
            return;
        }

        this.ctx.save();
        const size = this.settings.noteBaseSize * 0.7;
        const a = this.touchTimeFunction(18 * Math.max(1 - t, 0) / 1.5) * 1.6;
        this.ctx.translate(posInfo.x, posInfo.y);
        this.ctx.globalAlpha = 1;

        if (count >= 2 && this.drawnBorders[zoneKey] === 0) {
            this.drawnBorders[zoneKey] = 1;
            this.drawImgAtcenter(borderImg, size * 2.65);
            if (count > 2) {
                this.drawImgAtcenter(borderImg3, size * 2.65);
            }
        }
        this.ctx.globalAlpha = Math.max(0, 1 - (1 - t) * 0.5);
        for (let i = 0; i < 4; i++) {
            this.ctx.drawImage(touchImg, -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
            this.ctx.rotate(Math.PI * 0.5);
        }
        this.ctx.globalAlpha = 1;
        this.drawImgAtcenter(touchPoint, size * 0.4);
        this.ctx.restore();
    }

    drawSlideTrack(s) {
        const { time: noteTime, pos, slideEnd, slideDelay, slideDuration, path, hispeed } = s;
        const noteT = noteTime - this.globalTime;

        let displaySlideProgress = 0;
        if (-noteT > slideDelay) {
            displaySlideProgress = (-noteT - slideDelay) / slideDuration;
        }

        const c = slideDelay + (s.cullSkipExtend ?? 0) + slideDuration;
        if ((displaySlideProgress >= 1 && (s.lastSlide || s.slideFinish)) || (s.isMine && -noteT > c)) {
            return;
        }

        const isIllegalRed = s.isIllegal && this.settings.slideIllegalRed;
        const prefix = isIllegalRed ? "wifi_" : (s.isMine ? "wifi_mine_" : (s.isBreak ? "wifi_break_" : (s.isDouble ? "wifi_each_" : "wifi_")));
        const standardKey = isIllegalRed ? "slide" : (s.isMine ? "slide_mine" : (s.isBreak ? "slide_break" : (s.isDouble ? "slide_each" : "slide")));

        const speedMult = this._speedFactor * (hispeed || 1);
        const t = 1 - this.timeFunction(noteT * speedMult);
        const p = path || generatePath(pos, slideEnd);
        if (p.totalLength < 1e-4) return;

        this.ctx.save();
        const isTaped = -noteT > 0;
        this.ctx.globalAlpha = isTaped ? 1 : 0.75 * clamp(((t - this.settings.middleDistance) / (1 - this.settings.middleDistance)) + this.settings.slideSpeed, 0, 1);

        displaySlideProgress = Math.min(1, displaySlideProgress);

        const br = (!isIllegalRed && s.isBreak && !s.isMine) ? this.getBreakTint(s.isBreak, s.isMine) : 0;
        const isWiFi = s.slideType === "w";
        const prefixOrKey = isWiFi ? prefix : standardKey;
        this.drawPathWithArrows(p, s.isMine ? 0 : displaySlideProgress, prefixOrKey, isWiFi, br, isIllegalRed);
        this.ctx.restore();
    }

    drawSlideStar(s) {
        const { time: noteTime, pos, slideEnd, slideDelay, slideDuration, path, wPaths } = s;
        const noteT = noteTime - this.globalTime;

        let displaySlideProgress = 0;
        if (-noteT > slideDelay) {
            displaySlideProgress = (-noteT - slideDelay) / slideDuration;
        }

        if (displaySlideProgress >= 1 && (s.lastSlide || s.slideFinish || !s.nextSlide)) {
            if (this.settings.showJudge !== false) {
                const p = path || generatePath(pos, slideEnd);
                if (s.endTangent === undefined && p) s.endTangent = p.endTangent;
                if (s.lastSlide) this.queueJudgeEffect(s, null, noteTime + slideDelay + slideDuration);
            }
        }

        const c = slideDelay + (s.cullSkipExtend ?? 0) + slideDuration;
        if ((displaySlideProgress >= 1 && (s.lastSlide || s.slideFinish)) || (s.isMine && -noteT > c)) {
            return;
        }

        const p = path || generatePath(pos, slideEnd);
        if (p.totalLength < 1e-4) return;

        const sz = Math.min(1, 1 - (noteT + slideDelay) / slideDelay);
        if (noteT <= 0 && (!s.hideHead || sz >= 1) && (displaySlideProgress < 1 || (s.lastSlide && !s.slideFinish))) {
            const { x, y, rot } = p.getPointAt(Math.min(1, displaySlideProgress));
            this.ctx.save();
            this.ctx.globalAlpha = slideDelay < 1e-4 ? 1 : sz;
            const starImg = this.getStarImage(s.isMine, s.isBreak, s.isDouble, false, true);
            const starSize = this.settings.noteBaseSize * sz * 1.45;
            const isWiFi = s.slideType === "w";

            if (isWiFi && wPaths) {
                const { a, b, c, d, e, f } = this.ctx.getTransform();

                const w1Point = wPaths.w1.getPointAt(Math.min(1, displaySlideProgress));
                this.ctx.translate(w1Point.x, w1Point.y);
                this.ctx.rotate(w1Point.rot + Math.PI * 0.5);
                this.drawImgAtcenter(starImg, starSize);

                this.ctx.setTransform(a, b, c, d, e, f);

                const w2Point = wPaths.w2.getPointAt(Math.min(1, displaySlideProgress));
                this.ctx.translate(w2Point.x, w2Point.y);
                this.ctx.rotate(w2Point.rot + Math.PI * 0.5);
                this.drawImgAtcenter(starImg, starSize);

                this.ctx.setTransform(a, b, c, d, e, f);
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

    getSensorIdAtPoint(x, y, ignoreD = false) {
        const roundX = (x * 10 | 0) * 0.1;
        const roundY = (y * 10 | 0) * 0.1;
        const cacheKey = ((roundX * 1000 + roundY) | 0) * (ignoreD ? -1 : 1);
        if (!this._sensorPointCache) this._sensorPointCache = new Map();
        if (this._sensorPointCache.has(cacheKey)) {
            return this._sensorPointCache.get(cacheKey);
        }

        const r = Math.hypot(x, y);

        // 1. A 區外延伸（外鍵 1~8 區域）：
        // 當半徑超出主圓盤外邊界時，依據極座標角度判定為 1~8 號外鍵
        if (r >= innerCirleBase * 1.05 && r <= innerCirleBase * 2.8) {
            let normAngle = Math.atan2(y, x) + Math.PI / 2;
            if (normAngle < 0) normAngle += Math.PI * 2;
            const keyNum = Math.floor(normAngle / (Math.PI / 4)) + 1;
            if (keyNum >= 1 && keyNum <= 8) {
                const outerKeyId = 'A' + keyNum;
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

        if (this._sensorPointCache.size > 1000) {
            this._sensorPointCache.clear();
        }
        this._sensorPointCache.set(cacheKey, resultId);
        return resultId;
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

            const sensorId = this.settings.slideArrowHideBySensor !== false ? this.getSensorIdAtPoint(pt.x, pt.y, true) : null;

            arrows.push({
                dist,
                x: pt.x,
                y: pt.y,
                rad,
                cos: Math.cos(rad),
                sin: Math.sin(rad),
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

        const { a, b, c, d, e, f } = this.ctx.getTransform();

        for (let i = 0; i < arrows.length; i++) {
            const arr = arrows[i];

            if (starProgress > 0) {
                if (arr.dist <= starDist) continue;
                if (currentStarSensorId && (arr.dist - starDist <= 35) && arr.sensorId && arr.sensorId === currentStarSensorId) {
                    continue;
                }
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
            this.ctx.setTransform(a, b, c, d, e, f);
        }
    }

    drawHanabiEffects() {
        const decay = this.settings.hanabiEffectDecayTime || 0.8;
        let maxTime = -Infinity;

        for (let i = 0; i < 33; i++) {
            const eff = this.hanabiEffect[i];
            if (eff.cleared) continue;
            const t = eff.noteT / decay;
            if (t < -1 || t > 0) continue;
            if (eff.time > maxTime) {
                maxTime = eff.time;
            }
        }

        for (let i = 0; i < 33; i++) {
            const eff = this.hanabiEffect[i];
            if (eff.cleared || eff.time < maxTime) continue;
            const t = eff.noteT / decay;
            if (t < -1 || t > 0) continue;

            this.ctx.save();
            this.ctx.translate(eff.x, eff.y);
            if (settings.fancyTouchEffect) {
                this.richHanabi(eff.noteT);
            } else {
                this.simpleHanabi(eff.noteT, eff.isCenter);
            }
            this.ctx.restore();
        }
    }
}

export class SimaiVisualEditor {
    constructor(canvas, settings) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.settings = settings;
        this.images = null;
        this.globalTime = 0;
        this.scaleBase = 114; // 視覺編輯器 9 軌基準寬度（適度保留左右 padding 避免截斷）

        this.audioWaveformWidthRatio = 0.3;
        this.zoom = 200;

        this.passOpacity = 0.7;

        this.exColor = exColor;
        // marker state: 方塊表示現在游標位置（綠色），按下時變紅
        this.markerPressed = false;
        this.markerColors = { normal: '#00FF00', pressed: '#FF0000' };
        this.mouseX = 0;
        this.mouseY = 0;

        this.snappedTime = 0;

        this.editMode = settings.visualToolMode || 'edit'; // 'edit' 或 'select'
        this.selectedNotes = new Set();
        this.selectedTag = null;
        this.isSelectingBox = false;
        this.selectionStart = { x: 0, y: 0 };
        this.selectionEnd = { x: 0, y: 0 };

        this._tintCache = new Map();
        this._tempColorConfig = { colorCode: '' };

        // Callbacks & Snapping for editing
        this.onPlaceNote = null;
        this.onDeleteNote = null;
        this.onChangeNote = null;
        this.onPlaceHold = null;
        this.onUpdateHoldDuration = null;
        this.draggingHold = null;
        this.quantizeTime = null;
        this.hoverLane = null;
        this.onScrollTime = null;
        this._autoScrollTimer = null;
        this._autoScrollSpeed = 0;
        this._lastPointerMoveEvent = null;

        // 綁定滑鼠事件以切換方塊顏色並更新位置
        if (this.canvas && this.canvas.addEventListener) {
            this._onPointerDown = this._onPointerDown.bind(this);
            this._onPointerUp = this._onPointerUp.bind(this);
            this._onPointerLeave = this._onPointerLeave.bind(this);
            this._onPointerCancel = this._onPointerCancel.bind(this);
            this._onPointerMove = this._onPointerMove.bind(this);
            this._onContextMenu = this._onContextMenu.bind(this);

            // use capture to ensure marker events are detected before other handlers
            this.canvas.addEventListener('pointerdown', this._onPointerDown, { capture: true, passive: false });
            this.canvas.addEventListener('pointerup', this._onPointerUp, { capture: true });
            this.canvas.addEventListener('pointercancel', this._onPointerCancel, { capture: true });
            this.canvas.addEventListener('pointerleave', this._onPointerLeave, { capture: true });
            this.canvas.addEventListener('pointermove', this._onPointerMove, { capture: true, passive: false });
            this.canvas.addEventListener('contextmenu', this._onContextMenu);
        }

        this.tb1 = 4;
        this.tb2 = 4;
        this.layerMode = 'note';
        this.onPlaceTag = null;
        this.onDeleteTag = null;
        this.onEditTag = null;
        this.onSelectTag = null;
    }

    setLayerMode(layerMode) {
        this.layerMode = layerMode;
        this.selectedNotes.clear();
        this.selectedTag = null;
        this._upd();
    }

    setTagEditCallbacks(onPlaceTag, onDeleteTag, onEditTag, onSelectTag) {
        this.onPlaceTag = onPlaceTag;
        this.onDeleteTag = onDeleteTag;
        this.onEditTag = onEditTag;
        this.onSelectTag = onSelectTag;
    }

    setTimeScrollCallback(onScrollTime) {
        this.onScrollTime = onScrollTime;
    }

    setTimebase(tb1, tb2) {
        this.tb1 = tb1;
        this.tb2 = tb2;
    }

    setEditMode(mode) {
        this.editMode = mode;
        if (mode === 'edit') {
            this.selectedNotes.clear();
            this.selectedTag = null;
            this.isSelectingBox = false;
        }
        if (this.canvas) {
            this.canvas.style.cursor = mode === 'select' ? 'default' : 'crosshair';
        }
        this._upd();
    }

    getSelectedNotes() {
        return Array.from(this.selectedNotes);
    }

    clearSelection() {
        this.selectedNotes.clear();
        this.selectedTag = null;
        this._upd();
    }

    setSelectedTag(tag) {
        this.selectedTag = tag;
        this._upd();
    }

    clearSelectedTag() {
        this.selectedTag = null;
        this._upd();
    }

    _updateBoxSelection() {
        if (!this._state || !this._state.visualBuckets) return;

        const minX = Math.min(this.selectionStart.x, this.selectionEnd.x);
        const maxX = Math.max(this.selectionStart.x, this.selectionEnd.x);
        const minY = Math.min(this.selectionStart.y, this.selectionEnd.y);
        const maxY = Math.max(this.selectionStart.y, this.selectionEnd.y);

        const zoom = this.zoom;
        const gt = this.globalTime;

        const checkNoteInBox = (note, noteX) => {
            const noteY = (note.time - gt) * -zoom;
            return noteX >= minX && noteX <= maxX && noteY >= minY && noteY <= maxY;
        };

        const buckets = [
            ...(this._state.visualBuckets.tapnhold || []),
            ...(this._state.visualBuckets.slide || []),
            ...(this._state.visualBuckets.touch || [])
        ];

        for (const note of buckets) {
            let noteX = visualNoteRefPos[note.pos - 1]?.x;
            if (note.touchPos && touchRefPos[note.touchPos]) {
                const posInfo = touchRefPos[note.touchPos][note.touchPos === "C" ? 0 : note.pos - 1];
                if (posInfo) noteX = posInfo.x;
            }
            if (noteX === undefined) continue;

            if (checkNoteInBox(note, noteX)) {
                this.selectedNotes.add(note);
            }
        }
    }

    setNoteEditCallbacks(onPlace, onDelete, onChange) {
        this.onPlaceNote = onPlace;
        this.onDeleteNote = onDelete;
        this.onChangeNote = onChange;
    }

    setTimeQuantizer(quantizer) {
        this.quantizeTime = quantizer;
    }

    _hitTestLane(mouseX) {
        let closestLane = null;
        let minDiff = Infinity;
        for (let i = 0; i < 8; i++) {
            const diff = Math.abs(mouseX - visualNoteRefPos[i].x);
            if (diff < minDiff) {
                minDiff = diff;
                closestLane = i + 1;
            }
        }
        if (minDiff <= this.settings.noteBaseSize * 0.5) {
            return closestLane;
        }
    }

    getMemoizedTintedImage(imgKey, opacity, config) {
        if (!this.images[imgKey]) return null;
        const cacheKey = `${imgKey}_${opacity.toFixed(2)}_${config.colorCode}`;

        if (this._tintCache.has(cacheKey)) {
            return this._tintCache.get(cacheKey);
        }

        const tinted = getTintedImage(this.images[imgKey], opacity, config);
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

    getCanvasWH() {
        const w = this.canvas.clientWidth || 0;
        const h = this.canvas.clientHeight || 0;

        if (!this._canvasWH) {
            this._canvasWH = { width: 0, height: 0 };
        }
        if (w <= 0 || h <= 0) {
            this._canvasWH.width = 0;
            this._canvasWH.height = 0;
            return this._canvasWH;
        }
        const invP = this.scaleBase / Math.min(w, h) * 0.5;
        this._canvasWH.width = w * invP;
        this._canvasWH.height = h * invP;
        return this._canvasWH;
    }

    setZoom(zoom) {
        this.zoom = zoom;
    }

    setImages(images) {
        this.images = images;
    }

    setContext(ctx) {
        this.ctx = ctx;
        if (ctx?.canvas) this.canvas = ctx.canvas;
    }

    resize(width, height, dpr = 1, force = false) {
        if (!this.canvas || !this.ctx) return false;
        this.dpr = dpr;
        const w = Math.round(width * dpr);
        const h = Math.round(height * dpr);

        if (!force && this.canvas.width === w && this.canvas.height === h) {
            return false;
        }

        this.canvas.width = w;
        this.canvas.height = h;

        const p = Math.min(w, h) / this.scaleBase;
        this.ctx.setTransform(p, 0, 0, p, w / 2, h / 2);
        this._canvasWH = null;
        return true;
    }

    drawImgAtcenter(img, size, offsetX = 0, offsetY = 0, imgWidthMul = 1, imgHeightMul = 1) {
        return drawImgAtcenter(this.ctx, img, size, offsetX, offsetY, imgWidthMul, imgHeightMul);
    }

    drawTap(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine } = s;
        const t = (noteTime - this.globalTime);

        const img = this.images[isMine ? "tap_mine" : (isBreak ? "tap_break" : (isDouble ? "tap_each" : "tap"))];
        if (imgNotExists(img)) return;
        const size = this.settings.noteBaseSize;
        const x = visualNoteRefPos[pos - 1].x;
        const y = t * -this.zoom;

        const isPassed = t <= 0;
        if (isPassed) {
            this.ctx.globalAlpha = this.passOpacity;
        }
        this.drawImgAtcenter(img, size, x, y);
        if (s.isEx && !isMine) {
            this._tempColorConfig.colorCode = this.exColor[isBreak ? "break" : (isDouble ? "double" : "tap")];
            const ex = this.getMemoizedTintedImage("tap_ex", 0.6, this._tempColorConfig);
            this.drawImgAtcenter(ex, size, x, y);
        }
        if (isPassed) {
            this.ctx.globalAlpha = 1;
        }
    }

    drawStar(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMultiple, isMine } = s;
        const t = (noteTime - this.globalTime);

        const isPink = Boolean(this.settings.pinkStars);
        const img = this.images[isMine ?
            (isMultiple ? "star_mine_double" : "star_mine")
            : (isMultiple ? (isBreak ? "star_break_double" : (isDouble ? "star_each_double" : (isPink ? "star_pink_double" : "star_double")))
                : (isBreak ? "star_break" : (isDouble ? "star_each" : (isPink ? "star_pink" : "star"))))
        ];
        if (imgNotExists(img)) return;
        const size = this.settings.noteBaseSize;
        const x = visualNoteRefPos[pos - 1].x;
        const y = t * -this.zoom;

        const isPassed = t <= 0;
        if (isPassed) {
            this.ctx.globalAlpha = this.passOpacity;
        }
        this.drawImgAtcenter(img, size, x, y);
        if (s.isEx && !isMine) {
            this._tempColorConfig.colorCode = this.exColor[isBreak ? "break" : (isDouble ? "double" : "star")];
            const ex = this.getMemoizedTintedImage(isMultiple ? "star_ex_double" : "star_ex", 0.4, this._tempColorConfig);
            this.drawImgAtcenter(ex, size * 0.95, x, y);
        }
        if (isPassed) {
            this.ctx.globalAlpha = 1;
        }
    }

    drawTouch(s) {
        const { time: noteTime, pos, touchPos, isDouble, isMine, holdDuration } = s;
        const t = (noteTime - this.globalTime);
        const touchX = visualNoteRefPos[8]?.x ?? 0;

        if (holdDuration) {
            const imgs = [];
            for (let i = 0; i < 4; i++) {
                const img = this.images[isMine ? ("touchhold_" + i + "_mine") : ("touchhold_" + i)];
                if (imgNotExists(img)) return;
                imgs.push(img);
            }
            const touchPoint = this.images[isMine ? "touch_point_mine" : (isDouble ? "touch_point_each" : "touch_point")];

            this.ctx.save();

            const size = this.settings.noteBaseSize * 0.6;

            this.ctx.translate(touchX, t * -this.zoom);
            this.ctx.lineWidth = size * 0.6;
            let hp = (holdDuration / 4) * -this.zoom;

            if (isMine) {
                this.ctx.globalAlpha = 0.6;
                this.ctx.globalCompositeOperation = "source-over";
                this.ctx.strokeStyle = "#737373";
                this.ctx.beginPath();
                this.ctx.moveTo(0, 0);
                this.ctx.lineTo(0, hp * 4);
                this.ctx.closePath();
                this.ctx.stroke();
            } else {
                this.ctx.globalAlpha = 0.4;
                this.ctx.globalCompositeOperation = "lighter";
                for (let i = 0; i < 4; i++) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(0, hp * i);
                    this.ctx.lineTo(0, hp * (i + 1));
                    this.ctx.closePath();
                    switch (i) {
                        case 0:
                            this.ctx.strokeStyle = "#EC4402";
                            break;
                        case 1:
                            this.ctx.strokeStyle = "#F6EE01";
                            break;
                        case 2:
                            this.ctx.strokeStyle = "#0CA163";
                            break;
                        case 3:
                            this.ctx.strokeStyle = "#0197F5";
                            break;
                    }
                    this.ctx.stroke();
                }
            }
            this.ctx.globalCompositeOperation = "source-over";
            this.ctx.globalAlpha = 1;
            this.ctx.rotate(Math.PI * -0.75);
            if (t <= 0) {
                this.ctx.globalAlpha = this.passOpacity;
            }
            for (let i = 0; i < 4; i++) {
                this.ctx.drawImage(imgs[i], -size * 1.365 * 0.5, 0, size * 1.365, size);
                this.ctx.rotate(Math.PI / 2);
            }
            this.drawImgAtcenter(touchPoint, size * 0.4);
            this.ctx.restore();
            return;
        }

        const img = this.images[isMine ? "touch_mine" : (isDouble ? "touch_each" : "touch")];
        const touchPoint = this.images[isMine ? "touch_point_mine" : (isDouble ? "touch_point_each" : "touch_point")];
        if (imgNotExists(img)) return;

        this.ctx.save();

        const size = this.settings.noteBaseSize * 0.6;
        const a = 1.5;

        this.ctx.translate(touchX, t * -this.zoom);
        if (t <= 0) {
            this.ctx.globalAlpha = this.passOpacity;
        }
        for (let i = 0; i < 4; i++) {
            this.ctx.drawImage(img, -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
            this.ctx.rotate(Math.PI / 2);
        }
        this.drawImgAtcenter(touchPoint, size * 0.4);

        this.ctx.restore();
    }

    drawHold(s) {
        let { time: noteTime, pos, isBreak, isDouble, isMine, holdDuration } = s;
        if (this.draggingHold && this.draggingHold.note === s) {
            holdDuration = this.draggingHold.currentDuration;
        }
        const t = (noteTime - this.globalTime);
        const posInfo = visualNoteRefPos[pos - 1];

        const img = this.images[isMine ? "hold_mine" : (isBreak ? "hold_break" : (isDouble ? "hold_each" : "hold"))];
        if (imgNotExists(img)) return;

        function drawHoldImage(ctx, img, size, sizeOffset) {
            ctx.drawImage(img, 0, 0, 122, 55, -size / 2, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
            ctx.drawImage(img, 0, 55, 122, 90, -size / 2, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
            ctx.drawImage(img, 0, 145, 122, 55, -size / 2, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);
        }

        const size = this.settings.noteBaseSize;
        const sizeOffset = holdDuration * 0.0555 * this.zoom;

        this.ctx.save();
        this.ctx.translate(posInfo.x, t * -this.zoom);
        this.ctx.rotate(Math.PI);
        if (t <= -holdDuration) {
            this.ctx.globalAlpha = this.passOpacity;
        }

        drawHoldImage(this.ctx, img, size, sizeOffset);

        if (s.isEx && !isMine) {
            this._tempColorConfig.colorCode = isBreak ? this.exColor.break : (isDouble ? this.exColor.double : this.exColor.tap);
            const ex = this.getMemoizedTintedImage("hold_ex", 0.6, this._tempColorConfig);
            drawHoldImage(this.ctx, ex, size, sizeOffset);
        }
        this.ctx.restore();
    }

    drawSlide(s) {
        const target = this.images[s.isMine ? "slide_mine" : (s.isBreak ? "slide_break" : (s.isDouble ? "slide_each" : "slide"))];
        if (imgNotExists(target)) return;

        const { time: noteTime, pos, slideDelay, slideDuration } = s;
        const t = noteTime - this.globalTime;

        this.drawPathWithArrows(target, visualNoteRefPos[pos - 1].x, t + slideDelay, slideDuration, -(t + slideDelay) / slideDuration);
    }

    drawPathWithArrows(img, x, t, len, passT, config = { spacing: 4.36 }) {
        const arrowCount = Math.floor((len * this.zoom) / config.spacing);

        this.ctx.save();
        for (let i = arrowCount; i > 0; i--) {
            this.ctx.save();
            this.ctx.translate(x, -t * this.zoom - i * config.spacing);
            this.ctx.rotate(Math.PI / 2);
            if (passT >= i / arrowCount) {
                this.ctx.globalAlpha = this.passOpacity;
            }
            this.drawImgAtcenter(img, 1, 0, 0, 7 * 0.9, 9.4 * 0.9);
            this.ctx.restore();
        }
        this.ctx.restore();
    }

    _drawRoundRect(ctx, x, y, w, h, r) {
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        }
    }

    drawTag(tag) {
        const { ctx } = this;
        const { width: w, height: h } = this.getCanvasWH();
        const zoom = this.zoom || 1;
        const bs = this.settings.noteBaseSize;
        const lineWidth = bs * 4.5; // 涵蓋 9 個軌道之總半寬 (中央 X=0，向左向右各 4.5 軌)

        ctx.save();
        ctx.lineWidth = 0.5;

        const tb1 = this.tb1 || 4;
        const gridDiv = parseInt(this.settings?.gridDivision, 10) || this.tb2 || 4;
        // period: 小節的長度 (tb1 代表一小節有幾個四分音符)
        const period = (tag.type === 'bpm') ? ((60 * tb1) / tag.value) : ((240 / tag.bpm) * (1 / tag.value));
        // beatPeriod: 格子線的間距 (gridDiv 代表幾分音符為一格)
        const beatPeriod = (tag.type === 'bpm') ? ((240 / tag.value) / gridDiv) : 0;
        const delta = tag.time - this.globalTime;

        if (period > 0) {
            // 1. 計算螢幕範圍內的索引
            let minI = Math.ceil((-h / zoom - delta) / period) - 1;
            let maxI = Math.floor((h / zoom - delta) / period);

            // 2. 邏輯約束：起點永遠從 0 開始
            minI = Math.max(0, minI);

            // 3. 【關鍵修復】：限制 BPM 的渲染終點
            if (tag.type === 'bpm') {
                if (tag.nextTime) {
                    const duration = tag.nextTime - tag.time;
                    const maxLines = Math.floor((duration - 0.001) / period);
                    maxI = Math.min(maxI, maxLines);
                }
            } else {
                maxI = Math.min(Math.floor(tag.renderTimes || 1) - 1, maxI);
            }

            for (let i = minI; i <= maxI; i++) {
                const y = (delta + i * period) * -zoom;

                if (tag.type === 'bpm') {
                    ctx.strokeStyle = '#ffe865';
                    ctx.setLineDash([]);

                    // 自動填充小節內的拍號線(以 N 分音符為一拍)
                    const parts = Math.round((tb1 * gridDiv) / 4);
                    if (parts > 1) {
                        ctx.save();
                        const midW = lineWidth / 3;
                        for (let b = 1; b < parts; b++) {
                            const subY = (delta + i * period + b * beatPeriod) * -zoom;

                            // 檢查是否超出下一個 BPM 的範圍 (防止畫出界)
                            const subTime = tag.time + i * period + b * beatPeriod;
                            if (tag.nextTime && subTime >= tag.nextTime - 0.001) continue;

                            const isMajorBeat = (gridDiv > 4 && (b % Math.round(gridDiv / 4) === 0));
                            ctx.strokeStyle = isMajorBeat ? '#ffe865' : '#ffe865cc';
                            ctx.lineWidth = isMajorBeat ? 1.0 : 0.6;

                            ctx.beginPath();
                            ctx.moveTo(-midW, subY);
                            ctx.lineTo(midW, subY);
                            ctx.stroke();
                        }
                        ctx.restore();
                    }

                    // 起點標籤繪製
                    if (i === 0) {
                        if (this.layerMode === 'bpm') {
                            // BPM 圖層下：繪製左半側藍色膠囊標籤
                            const capsuleH = Math.max(10, bs * 0.7);
                            const capsuleY = y - capsuleH / 2;
                            const capW = lineWidth - 1;
                            const capX = -lineWidth;

                            ctx.save();
                            ctx.fillStyle = '#2952d4';
                            this._drawRoundRect(ctx, capX, capsuleY, capW, capsuleH, 3);
                            ctx.fill();

                            ctx.fillStyle = '#ffffff';
                            ctx.font = 'bold 4.5px Arial';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(`BPM ${tag.value}`, capX + capW / 2, y);
                            ctx.restore();
                        } else {
                            // 音符圖層下：完全還原原版左側邊緣旋轉小字
                            ctx.save();
                            ctx.fillStyle = '#bdaa40';
                            ctx.font = "5px Arial";
                            ctx.textAlign = "left";
                            ctx.translate(bs * -4 - 1.5, y - 1);
                            ctx.rotate(-Math.PI / 2);
                            ctx.fillText(tag.value.toString(), 0, 0);
                            ctx.restore();
                        }
                    }
                } else {
                    ctx.strokeStyle = '#ffffff';
                    if (i === 0) {
                        if (this.layerMode === 'bpm') {
                            // BPM 圖層下：僅在非內部衍生標籤 (!tag.synthetic) 時繪製右半側深紅色膠囊標籤
                            if (!tag.synthetic) {
                                ctx.globalAlpha = 1;
                                const capsuleH = Math.max(10, bs * 0.7);
                                const capsuleY = y - capsuleH / 2;
                                const capW = lineWidth - 1;
                                const capX = 1;

                                ctx.save();
                                ctx.fillStyle = '#8a0014';
                                this._drawRoundRect(ctx, capX, capsuleY, capW, capsuleH, 3);
                                ctx.fill();

                                ctx.fillStyle = '#ffffff';
                                ctx.font = 'bold 4.5px Arial';
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                ctx.fillText(`{${tag.value}}`, capX + capW / 2, y);
                                ctx.restore();
                            }
                        } else {
                            // 音符圖層下：完全還原原版右側邊緣旋轉小字
                            if (!tag.nohead) {
                                ctx.globalAlpha = 1;
                                ctx.save();
                                ctx.fillStyle = '#9c9c9c';
                                ctx.font = "5px Arial";
                                ctx.textAlign = "right";
                                ctx.translate(bs * 4 + 1.5, y - 1);
                                ctx.rotate(Math.PI / 2);
                                ctx.fillText(tag.value.toString(), 0, 0);
                                ctx.restore();
                            }
                        }
                    } else {
                        ctx.globalAlpha = 0.4;
                    }
                }

                ctx.beginPath();
                ctx.moveTo(-lineWidth, y);
                ctx.lineTo(lineWidth, y);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    drawAudioWaveform(audioBuffer, offset = 0) {
        if (!audioBuffer) return;
        const ctx = this.ctx;
        const { width: w, height: h } = this.getCanvasWH();
        if (!ctx || w <= 0 || h <= 0) return;

        const channelData = audioBuffer.getChannelData ? audioBuffer.getChannelData(0) : (audioBuffer.data || audioBuffer);
        const sampleRate = audioBuffer.sampleRate || 44100;
        if (!channelData || channelData.length === 0) return;

        const zoom = this.zoom || 1;
        const gt = this.globalTime + offset;
        const waveHalfWidth = w * this.audioWaveformWidthRatio;
        const totalSamples = channelData.length;

        ctx.save();

        // 樣式
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#888';
        ctx.globalAlpha = 0.8;

        /**
         * 【關鍵修正 1】：對齊絕對時間基準
         * 計算螢幕最上方像素對應的「絕對時間」，並進行「格點化」
         */
        const timePerPixel = 1 / zoom;
        const topTime = gt - (h / zoom); // 畫布中心的 y=0 (hh) 對應 gt，回推 y=0 的時間

        // 算出第一個像素格點的偏移量（子像素位移），用來消除滑動時的抖動
        const subPixelOffset = (topTime % timePerPixel) * zoom;

        // 為了涵蓋裁剪邊緣，多畫 2 像素
        for (let y = -1; y < h * 2 + 1; y++) {
            // 【關鍵修正 2】：計算絕對的取樣區間，不受當前 gt 的浮點數微動影響
            // 使用絕對格點時間 t = (格點編號 * 時間步進) + 基準時間
            const pixelTime = Math.floor(topTime / timePerPixel) * timePerPixel + (y * timePerPixel);

            let startIdx = Math.floor(pixelTime * sampleRate);
            let endIdx = Math.floor((pixelTime + timePerPixel) * sampleRate);

            if (endIdx <= 0 || startIdx >= totalSamples) continue;
            startIdx = Math.max(0, startIdx);
            endIdx = Math.min(totalSamples, endIdx);

            // 穩定 Peak 偵測
            let peak = 0;
            if (endIdx - startIdx <= 1) {
                peak = Math.abs(channelData[startIdx] || 0);
            } else {
                for (let i = startIdx; i < endIdx; i++) {
                    const v = Math.abs(channelData[i]);
                    if (v > peak) peak = v;
                }
            }

            const amp = Math.min(1, peak * (this.audioAmp || 1));
            const pxW = amp * waveHalfWidth;

            // 繪製座標補上 subPixelOffset 修正
            const drawY = h - Math.round(y - subPixelOffset);

            ctx.beginPath();
            ctx.moveTo(-pxW, drawY);
            ctx.lineTo(pxW, drawY);
            ctx.stroke();
        }

        ctx.restore();
    }

    setNoteEditCallbacks(onPlace, onDelete, onChange, onPlaceHold, onUpdateHoldDuration) {
        this.onPlaceNote = onPlace;
        this.onDeleteNote = onDelete;
        this.onChangeNote = onChange;
        this.onPlaceHold = onPlaceHold;
        if (onUpdateHoldDuration) {
            this.onUpdateHoldDuration = onUpdateHoldDuration;
        }
    }

    setSelectionCallback(cb) {
        this.onSelectionChange = cb;
    }

    _notifySelectionChange() {
        if (typeof this.onSelectionChange === 'function') {
            this.onSelectionChange(this.selectedNotes);
        }
    }

    getNoteScreenPos(note) {
        if (!note) return null;
        let noteX = visualNoteRefPos[note.pos - 1]?.x;
        if (note.type === 'touch' || note.touchPos) {
            noteX = visualNoteRefPos[8]?.x;
        }
        if (noteX === undefined) return null;

        const gt = this.globalTime;
        let targetTime = note.time;
        if (note.hitPart === 'track') {
            targetTime = note.time + (note.slideDelay || 0) + (note.slideDuration || 0) / 2;
        }
        const noteY = (targetTime - gt) * -this.zoom;

        const rect = this.canvas.getBoundingClientRect();
        const dpr = this.settings?.lowRes ? 1 : (window.devicePixelRatio || 1);
        const w = this.canvas.width;
        const h = this.canvas.height;
        const p = Math.min(w, h) / this.scaleBase;

        const physicalX = noteX * p + w / 2;
        const physicalY = noteY * p + h / 2;
        const clientX = rect.left + physicalX / dpr;
        const clientY = rect.top + physicalY / dpr;

        return { clientX, clientY };
    }

    setTimeQuantizer(quantizer) {
        this.quantizeTime = quantizer;
    }

    _hitTestLane(mouseX) {
        let closestLane = null;
        let minDiff = Infinity;
        for (let i = 0; i < 9; i++) {
            const diff = Math.abs(mouseX - visualNoteRefPos[i].x);
            if (diff < minDiff) {
                minDiff = diff;
                closestLane = (i === 8) ? 'T' : (i + 1);
            }
        }
        if (minDiff <= this.settings.noteBaseSize * 0.5) {
            return closestLane;
        }
        return null;
    }

    _hitTestNote(mouseX, mouseY) {
        if (!this._state || !this._state.visualBuckets) return null;
        const tolerance = this.settings.noteBaseSize * 0.7;
        const zoom = this.zoom;
        const gt = this.globalTime;

        // Helper check for a candidate note head
        const checkCandidate = (note, noteX) => {
            const noteY = (note.time - gt) * -zoom;
            const dx = Math.abs(mouseX - noteX);
            const dy = Math.abs(mouseY - noteY);
            return dx <= tolerance && dy <= tolerance;
        };

        // 1. 優先檢查星星頭與普通音符頭部 (tapnhold)
        for (const note of this._state.visualBuckets.tapnhold) {
            const noteX = visualNoteRefPos[note.pos - 1]?.x;
            if (noteX !== undefined) {
                // 優先檢測 Hold 尾部膠囊狀手把 (Tail handle)
                if (note.type === 'hold' && (note.holdDuration !== undefined && note.holdDuration !== null)) {
                    const dx = Math.abs(mouseX - noteX);
                    const effectiveDur = (this.draggingHold && this.draggingHold.note === note) ? this.draggingHold.currentDuration : (note.holdDuration || 0);
                    const endY = (note.time + effectiveDur - gt) * -zoom;
                    if (dx <= tolerance * 1.2 && Math.abs(mouseY - endY) <= Math.max(tolerance * 0.7, 4)) {
                        note.hitPart = 'tail';
                        return note;
                    }
                }
                if (checkCandidate(note, noteX)) {
                    note.hitPart = note.isStar ? 'head' : 'note';
                    return note;
                }
                if (note.type === 'hold' && note.holdDuration) {
                    const dx = Math.abs(mouseX - noteX);
                    if (dx <= tolerance) {
                        const effectiveDur = (this.draggingHold && this.draggingHold.note === note) ? this.draggingHold.currentDuration : (note.holdDuration || 0);
                        const startY = (note.time - gt) * -zoom;
                        const endY = (note.time + effectiveDur - gt) * -zoom;
                        const minY = Math.min(startY, endY) - tolerance;
                        const maxY = Math.max(startY, endY) + tolerance;
                        if (mouseY >= minY && mouseY <= maxY) {
                            note.hitPart = 'body';
                            return note;
                        }
                    }
                }
            }
        }

        // 2. 檢查滑星 (slide) - 區分點擊星星頭還是軌跡
        for (const note of this._state.visualBuckets.slide) {
            const noteX = visualNoteRefPos[note.pos - 1]?.x;
            if (noteX === undefined) continue;

            const dx = Math.abs(mouseX - noteX);
            if (dx <= tolerance) {
                const headY = (note.time - gt) * -zoom;
                // A. 落在星星頭附近
                if (Math.abs(mouseY - headY) <= tolerance) {
                    note.hitPart = 'head';
                    return note;
                }

                // B. 落在滑星箭頭軌跡區間內 (僅在修飾模式下供點擊套用效果，非修飾模式不可選取)
                if (this.editMode === 'modifier') {
                    const startY = (note.time + (note.slideDelay || 0) - gt) * -zoom;
                    const endY = (note.time + (note.slideDelay || 0) + (note.slideDuration || 0) - gt) * -zoom;
                    const minY = Math.min(startY, endY) - tolerance;
                    const maxY = Math.max(startY, endY) + tolerance;

                    if (mouseY >= minY && mouseY <= maxY) {
                        note.hitPart = 'track';
                        return note;
                    }
                }
            }
        }

        // 3. 檢查 touch (位於 Touch 軌道，索引 8)
        for (const note of this._state.visualBuckets.touch) {
            const noteX = visualNoteRefPos[8]?.x;
            if (noteX !== undefined && checkCandidate(note, noteX)) {
                note.hitPart = 'note';
                return note;
            }
        }

        return null;
    }

    _hitTestTag(mouseX, mouseY) {
        if (!this._state || !this._state.visualBuckets || !this._state.visualBuckets.tags) return null;
        const zoom = this.zoom;
        const gt = this.globalTime;
        const bs = this.settings?.noteBaseSize || 11;
        const lineWidth = bs * 4.5;
        const capsuleH = Math.max(10, bs * 0.7);
        const halfH = capsuleH / 2;
        const tags = this._state.visualBuckets.tags;

        // 必須點擊在 9 個軌道的寬度範圍內 [-lineWidth, lineWidth]
        if (mouseX < -lineWidth || mouseX > lineWidth) return null;

        let bestTag = null;
        let minDy = Infinity;

        for (const tag of tags) {
            const tagY = (tag.time - gt) * -zoom;
            const dy = Math.abs(mouseY - tagY);
            if (dy <= halfH) {
                // 左側明確點中 BPM 膠囊 [-lineWidth, 0]
                if (tag.type === 'bpm' && mouseX <= 0 && mouseX >= -lineWidth) {
                    if (dy < minDy) {
                        minDy = dy;
                        bestTag = tag;
                    }
                }
                // 右側明確點中 Split 時值膠囊 (0, lineWidth] (排除內部衍生之虛擬標籤)
                else if (tag.type === 'split' && !tag.synthetic && mouseX > 0 && mouseX <= lineWidth) {
                    if (dy < minDy) {
                        minDy = dy;
                        bestTag = tag;
                    }
                }
            }
        }
        return bestTag;
    }

    drawBackground(w, h) {
        const ctx = this.ctx;
        const p = Math.min(w, h) / this.scaleBase;
        const bottomY = (h / 2) / p;

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        for (let i = 0; i < 9; i++) {
            const laneX = visualNoteRefPos[i].x;
            const laneW = this.settings.noteBaseSize;

            if (i === 8) {
                ctx.fillStyle = '#22202c';
                ctx.fillRect(laneX - laneW / 2, -h, laneW, h * 2);
                ctx.fillStyle = "#b0b0b0";
                ctx.font = "bold 3.8px Arial";
                ctx.fillText("TOH", laneX, bottomY - 3);
            } else {
                ctx.fillStyle = (i % 2 === 0) ? '#555' : '#333';
                ctx.fillRect(laneX - laneW / 2, -h, laneW, h * 2);
                ctx.fillStyle = "#b0b0b0";
                ctx.font = "bold 4.5px Arial";
                ctx.fillText(String(i + 1), laneX, bottomY - 3);
            }
        }
        ctx.restore();
    }

    render(isForced = false, timestamp = null, state = null) {
        if (state) {
            this._state = state;
        }
        if (!this._state) return;

        const w = this.canvas.width;
        const h = this.canvas.height;
        const ctx = this.ctx;

        const { globalTime, visualBuckets, audioBuffer, tags, offset } = this._state;
        this.globalTime = globalTime;
        this.tags = tags;

        ctx.clearRect(-w, -h, w * 2, h * 2);
        this.drawBackground(w, h);
        this.drawAudioWaveform(audioBuffer, offset);
        // 先繪製譜面切分線 (split tags)，再繪製 BPM 與黃節拍線 (bpm tags，疊在切分線之上)
        visualBuckets.tags.filter(t => t.type === 'split').forEach(t => this.drawTag(t));
        visualBuckets.tags.filter(t => t.type !== 'split').forEach(t => this.drawTag(t));
        ctx.strokeStyle = '#ff0000ce';
        ctx.beginPath();
        ctx.moveTo(-w, 0);
        ctx.lineTo(w, 0);
        ctx.stroke();
        // 僅在音符圖層繪製音符物件（BPM 圖層不繪製任何音符）
        if (this.layerMode === 'note') {
            visualBuckets.slide.forEach(n => this.drawSlide(n));
            visualBuckets.tapnhold.forEach(n => {
                if (n.type === "hold") this.drawHold(n);
                else if (n.isStar) this.drawStar(n);
                else this.drawTap(n);
            });
            visualBuckets.touch.forEach(n => this.drawTouch(n));
        }

        // 繪製選擇高亮與拉框
        this._drawSelection();

        // 繪製 Ghost Note 預覽 (僅在編輯模式下且未處於拖曳中)
        if (this.editMode === 'edit' && !this.draggingHold) {
            this._drawMarker();
        }

        // 若正處於拖曳 Hold 狀態，繪製拉伸藍框與尾部膠囊手把
        if (this.draggingHold) {
            this._drawHoldBoxAndHandle(this.draggingHold.note, this.draggingHold.currentDuration, true);
        }
    }

    _upd() {
        this.render(true, null, this._state);
    }

    _updMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = this.settings?.lowRes ? 1 : (window.devicePixelRatio || 1);

        // 1. 取得相對於畫布左上角的「物理像素」座標
        const physicalX = (e.clientX - rect.left) * dpr;
        const physicalY = (e.clientY - rect.top) * dpr;

        // 2. 取得畫布目前的物理寬高
        const w = this.canvas.width;
        const h = this.canvas.height;

        // 3. 計算與渲染器一致的縮放比例 p
        const p = Math.min(w, h) / this.scaleBase;

        // 4. 逆向轉換：(物理座標 - 畫布中心) / 縮放比例
        this.mouseX = (physicalX - w / 2) / p;
        this.mouseY = (physicalY - h / 2) / p;

        if (!this.zoom || isNaN(this.zoom) || this.zoom <= 0 || typeof this.quantizeTime !== 'function') {
            this.snappedTime = null;
            return;
        }

        const rawTime = (this.globalTime || 0) - this.mouseY / this.zoom;
        if (isNaN(rawTime) || !isFinite(rawTime)) {
            this.snappedTime = null;
            return;
        }

        this.snappedTime = this.quantizeTime(rawTime);
    }

    _drawSelection() {
        const ctx = this.ctx;
        const zoom = this.zoom;
        const gt = this.globalTime;

        if (this.selectedNotes.size > 0) {
            ctx.save();
            const size = this.settings.noteBaseSize * 1.2;
            const r = 6;

            for (const note of this.selectedNotes) {
                let noteX = visualNoteRefPos[note.pos - 1]?.x;
                if (note.type === 'touch' || note.touchPos) {
                    noteX = visualNoteRefPos[8]?.x;
                }
                if (noteX === undefined) continue;

                let noteY = (note.time - gt) * -zoom;
                let boxW = size;
                let boxH = size;

                if (note.type === 'hold' || (note.holdDuration && note.holdDuration > 0)) {
                    const startY = (note.time - gt) * -zoom;
                    const endY = (note.time + (note.holdDuration || 0) - gt) * -zoom;
                    noteY = (startY + endY) / 2;
                    boxH = Math.max(size, Math.abs(endY - startY) + size);
                } else if (note.hitPart === 'track') {
                    const startY = (note.time + (note.slideDelay || 0) - gt) * -zoom;
                    const endY = (note.time + (note.slideDelay || 0) + (note.slideDuration || 0) - gt) * -zoom;
                    noteY = (startY + endY) / 2;
                    boxH = Math.max(size, Math.abs(endY - startY));
                }

                ctx.save();
                ctx.translate(noteX, noteY);

                // 柔和半透明底色
                ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
                ctx.beginPath();
                if (typeof ctx.roundRect === 'function') {
                    ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, r);
                } else {
                    ctx.rect(-boxW / 2, -boxH / 2, boxW, boxH);
                }
                ctx.fill();

                // 霓虹微發光邊框
                ctx.shadowColor = 'rgba(0, 229, 255, 0.7)';
                ctx.shadowBlur = 8;
                ctx.strokeStyle = '#00E5FF';
                ctx.lineWidth = 2;
                ctx.stroke();

                // 四個角的裝飾標記 (Corner Accents)
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 2;
                const bracketLen = 6;
                const halfW = boxW / 2;
                const halfH = boxH / 2;

                // 左上角
                ctx.beginPath();
                ctx.moveTo(-halfW, -halfH + bracketLen);
                ctx.lineTo(-halfW, -halfH);
                ctx.lineTo(-halfW + bracketLen, -halfH);
                ctx.stroke();

                // 右上角
                ctx.beginPath();
                ctx.moveTo(halfW - bracketLen, -halfH);
                ctx.lineTo(halfW, -halfH);
                ctx.lineTo(halfW, -halfH + bracketLen);
                ctx.stroke();

                // 左下角
                ctx.beginPath();
                ctx.moveTo(-halfW, halfH - bracketLen);
                ctx.lineTo(-halfW, halfH);
                ctx.lineTo(-halfW + bracketLen, halfH);
                ctx.stroke();

                // 右下角
                ctx.beginPath();
                ctx.moveTo(halfW - bracketLen, halfH);
                ctx.lineTo(halfW, halfH);
                ctx.lineTo(halfW, halfH - bracketLen);
                ctx.stroke();

                ctx.restore();

                // 若為選取中的 Hold 音符，於尾端繪製膠囊狀手把
                if (note.type === 'hold' || (note.holdDuration && note.holdDuration > 0)) {
                    const effDur = (this.draggingHold && this.draggingHold.note === note) ? this.draggingHold.currentDuration : (note.holdDuration || 0);
                    const endY = (note.time + effDur - gt) * -zoom;
                    this._drawHoldCapsuleHandle(noteX, endY, false);
                }
            }
            ctx.restore();
        }

        const boxToDraw = this.isSelectingBox ? {
            minX: Math.min(this.selectionStart.x, this.selectionEnd.x),
            maxX: Math.max(this.selectionStart.x, this.selectionEnd.x),
            minY: Math.min(this.selectionStart.y, this.selectionEnd.y),
            maxY: Math.max(this.selectionStart.y, this.selectionEnd.y)
        } : this.activeBoxRect;

        if ((this.editMode === 'select' || this.editMode === 'boxSelect') && boxToDraw) {
            const { minX, maxX, minY, maxY } = boxToDraw;
            const boxW = maxX - minX;
            const boxH = maxY - minY;

            ctx.save();
            // 柔和主題填充底色
            ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
            // 發光邊框
            ctx.shadowColor = 'rgba(0, 229, 255, 0.5)';
            ctx.shadowBlur = 6;
            ctx.strokeStyle = '#00E5FF';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);

            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(minX, minY, boxW, boxH, 4);
            } else {
                ctx.rect(minX, minY, boxW, boxH);
            }
            ctx.fill();
            ctx.stroke();

            // 四個角的 Material 錨點飾角 (Corner Handles)
            ctx.shadowBlur = 0;
            ctx.setLineDash([]);
            ctx.fillStyle = '#FFFFFF';
            const hSize = 4;
            const halfH = hSize / 2;
            ctx.fillRect(minX - halfH, minY - halfH, hSize, hSize);
            ctx.fillRect(maxX - halfH, minY - halfH, hSize, hSize);
            ctx.fillRect(minX - halfH, maxY - halfH, hSize, hSize);
            ctx.fillRect(maxX - halfH, maxY - halfH, hSize, hSize);

            ctx.restore();
        }

        // BPM 圖層：繪製選取標籤 (BPM / 時值膠囊) 的發光外框與 Material 角標
        if (this.layerMode === 'bpm' && this.selectedTag && !(this.selectedTag.type === 'split' && this.selectedTag.synthetic)) {
            ctx.save();
            const tag = this.selectedTag;
            const bs = this.settings?.noteBaseSize || 11;
            const lineWidth = bs * 4.5;
            const capsuleH = Math.max(10, bs * 0.7);
            const tagY = (tag.time - gt) * -zoom;
            const r = 3;

            const capX = (tag.type === 'bpm') ? -lineWidth : 1;
            const capW = lineWidth - 1;
            const pad = 2;
            const boxX = capX - pad;
            const boxW = capW + pad * 2;
            const boxY = tagY - capsuleH / 2 - pad;
            const boxH = capsuleH + pad * 2;

            // 柔和半透明底色
            ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(boxX, boxY, boxW, boxH, r + 1);
            } else {
                ctx.rect(boxX, boxY, boxW, boxH);
            }
            ctx.fill();

            // 霓虹微發光邊框
            ctx.shadowColor = 'rgba(0, 229, 255, 0.8)';
            ctx.shadowBlur = 8;
            ctx.strokeStyle = '#00E5FF';
            ctx.lineWidth = 2;
            ctx.stroke();

            // 四個角的裝飾標記 (Corner Accents)
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            const bracketLen = 4;
            const minX = boxX;
            const maxX = boxX + boxW;
            const minY = boxY;
            const maxY = boxY + boxH;

            // 左上角
            ctx.beginPath();
            ctx.moveTo(minX, minY + bracketLen);
            ctx.lineTo(minX, minY);
            ctx.lineTo(minX + bracketLen, minY);
            ctx.stroke();

            // 右上角
            ctx.beginPath();
            ctx.moveTo(maxX - bracketLen, minY);
            ctx.lineTo(maxX, minY);
            ctx.lineTo(maxX, minY + bracketLen);
            ctx.stroke();

            // 左下角
            ctx.beginPath();
            ctx.moveTo(minX, maxY - bracketLen);
            ctx.lineTo(minX, maxY);
            ctx.lineTo(minX + bracketLen, maxY);
            ctx.stroke();

            // 右下角
            ctx.beginPath();
            ctx.moveTo(maxX - bracketLen, maxY);
            ctx.lineTo(maxX, maxY);
            ctx.lineTo(maxX, maxY - bracketLen);
            ctx.stroke();

            ctx.restore();
        }
    }

    getBoxScreenRect() {
        if (!this.activeBoxRect) return null;
        const { minX, maxX, minY, maxY } = this.activeBoxRect;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = this.settings?.lowRes ? 1 : (window.devicePixelRatio || 1);
        const w = this.canvas.width;
        const h = this.canvas.height;
        const p = Math.min(w, h) / this.scaleBase;

        const leftPhys = minX * p + w / 2;
        const rightPhys = maxX * p + w / 2;
        const topPhys = minY * p + h / 2;
        const bottomPhys = maxY * p + h / 2;

        return {
            left: rect.left + leftPhys / dpr,
            right: rect.left + rightPhys / dpr,
            top: rect.top + topPhys / dpr,
            bottom: rect.top + bottomPhys / dpr,
            width: (rightPhys - leftPhys) / dpr,
            height: (bottomPhys - topPhys) / dpr
        };
    }

    clearActiveBox() {
        this.activeBoxRect = null;
        this.selectedNotes.clear();
        this._notifySelectionChange();
        if (!this._isLoopActive()) this._upd();
    }

    _getCurrentBpmAt(time) {
        if (this._state && this._state.visualBuckets && this._state.visualBuckets.tags) {
            const bpmTag = this._state.visualBuckets.tags
                .filter(t => t.type === 'bpm' && t.time <= time + 0.001)
                .sort((a, b) => b.time - a.time)[0];
            if (bpmTag && bpmTag.value) return bpmTag.value;
        }
        return 120;
    }

    _drawHoldCapsuleHandle(noteX, endY, isHoveredTail = false) {
        const ctx = this.ctx;
        const size = this.settings?.noteBaseSize || 11;
        const boxW = size * 1.05;
        // 等比縮小膠囊，比例保持不變，且絕對不突出左右藍框 (寬度約佔藍框 62%)
        const capsuleW = Math.round(boxW * 0.62 * 10) / 10;
        const capsuleH = Math.round(capsuleW * 0.48 * 10) / 10;
        const capsuleR = capsuleH / 2;
        const capsuleX = noteX - capsuleW / 2;
        const capsuleY = endY - capsuleH / 2;

        ctx.save();
        ctx.shadowColor = isHoveredTail ? 'rgba(56, 189, 248, 0.8)' : 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = isHoveredTail ? 3 : 1;
        ctx.fillStyle = '#FFFFFF';

        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(capsuleX, capsuleY, capsuleW, capsuleH, capsuleR);
        } else {
            ctx.rect(capsuleX, capsuleY, capsuleW, capsuleH);
        }
        ctx.fill();
        ctx.restore();
    }

    _drawHoldBoxAndHandle(note, holdDuration, isHoveredTail = false) {
        const ctx = this.ctx;
        const gt = this.globalTime;
        const zoom = this.zoom;
        let noteX = visualNoteRefPos[note.pos - 1]?.x;
        if (note.type === 'touch' || note.touchPos) {
            noteX = visualNoteRefPos[8]?.x;
        }
        if (noteX === undefined) return;

        const startY = (note.time - gt) * -zoom;
        const endY = (note.time + holdDuration - gt) * -zoom;
        const size = this.settings?.noteBaseSize || 11;
        const boxW = size * 1.05;
        const topY = Math.min(startY, endY);
        const bottomY = Math.max(startY, endY) + size * 0.25;
        const boxH = bottomY - topY;

        ctx.save();
        // 1. 藍框包覆 (簡約緊湊青藍框)
        ctx.fillStyle = 'rgba(56, 189, 248, 0.04)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.rect(noteX - boxW / 2, topY, boxW, boxH);
        ctx.fill();
        ctx.stroke();

        // 2. 尾部白色極簡膠囊狀手把 (縮小且不突出藍框左右邊緣)
        this._drawHoldCapsuleHandle(noteX, endY, isHoveredTail);

        // 3. 拍數文字顯示區 (與膠囊 1:1 一模一樣大，純黑底色 + 白色文字，顯示在左邊)
        if (this.draggingHold && this.draggingHold.note === note) {
            // 橫向對齊輔助虛線
            ctx.save();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(-this.canvas.width / 2, endY);
            ctx.lineTo(this.canvas.width / 2, endY);
            ctx.stroke();
            ctx.restore();

            const bpm = this._getCurrentBpmAt(note.time);
            const gridDiv = this.settings?.gridDivision || 4;
            const tickPeriod = (240 / bpm) / gridDiv;
            const numTicks = Math.max(1, Math.round(holdDuration / tickPeriod));
            const labelText = `${gridDiv}:${numTicks}`;

            // 與膠囊手把完全 1:1 一樣大的黑底膠囊
            const capsuleW = Math.round(boxW * 0.62 * 10) / 10;
            const capsuleH = Math.round(capsuleW * 0.48 * 10) / 10;
            const capsuleR = capsuleH / 2;
            const badgeW = capsuleW;
            const badgeH = capsuleH;

            // 顯示在藍框左側 (距藍框左邊界 1.5 單位)
            const badgeX = (noteX - boxW / 2) - badgeW - 1.5;
            const badgeY = endY - badgeH / 2;

            ctx.save();
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(badgeX, badgeY, badgeW, badgeH, capsuleR);
            } else {
                ctx.rect(badgeX, badgeY, badgeW, badgeH);
            }
            ctx.fill();

            // 自適應字體大小，保證文字不溢出黑底膠囊
            let fontSize = 2.2;
            ctx.font = `bold ${fontSize}px "Plus Jakarta Sans", "Noto Sans TC", sans-serif`;
            const textMetrics = ctx.measureText(labelText);
            if (textMetrics.width > badgeW - 1.2) {
                fontSize = Math.max(1.3, fontSize * ((badgeW - 1.2) / textMetrics.width));
                ctx.font = `bold ${fontSize}px "Plus Jakarta Sans", "Noto Sans TC", sans-serif`;
            }

            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, badgeX + badgeW / 2, badgeY + badgeH / 2);
            ctx.restore();
        }

        ctx.restore();
    }

    _drawMarker() {
        const ctx = this.ctx;
        const size = this.settings.noteBaseSize;

        if (this.layerMode === 'bpm') {
            // BPM 圖層不繪製跟隨游標之影子標籤，保持畫布乾淨並在點擊處直接放置
            return;
        }

        // 先檢查是否懸停在現有音符上 (_hitTestNote)
        const hoveredNote = this._hitTestNote(this.mouseX, this.mouseY);

        if (hoveredNote !== null) {
            // 若命中 Hold 音符，改為藍框包覆與尾部膠囊狀手把
            if (hoveredNote.type === 'hold' || (hoveredNote.holdDuration && hoveredNote.holdDuration > 0)) {
                const effDur = (this.draggingHold && this.draggingHold.note === hoveredNote) ? this.draggingHold.currentDuration : (hoveredNote.holdDuration || 0);
                this._drawHoldBoxAndHandle(hoveredNote, effDur, hoveredNote.hitPart === 'tail' || this.draggingHold?.note === hoveredNote);
                return;
            }
            // 若命中現有音符，Marker 精確對齊該音符的位置與時間
            let noteX = visualNoteRefPos[hoveredNote.pos - 1]?.x;
            if (hoveredNote.type === 'touch' || hoveredNote.touchPos) {
                noteX = visualNoteRefPos[8]?.x;
            }

            ctx.save();
            ctx.strokeStyle = '#FF4444';
            ctx.lineWidth = 1.5;

            if (hoveredNote.hitPart === 'track') {
                const startY = (hoveredNote.time + (hoveredNote.slideDelay || 0) - this.globalTime) * -this.zoom;
                const endY = (hoveredNote.time + (hoveredNote.slideDelay || 0) + (hoveredNote.slideDuration || 0) - this.globalTime) * -this.zoom;
                const topY = Math.min(startY, endY);
                const height = Math.max(size, Math.abs(endY - startY));
                ctx.strokeRect(noteX - size / 2, topY, size, height);
            } else {
                const t = hoveredNote.time - this.globalTime;
                ctx.translate(noteX, t * -this.zoom);
                ctx.strokeRect(-size / 2, -size / 2, size, size);
            }
            ctx.restore();
        } else if (this.hoverLane !== null) {
            // 若為空白位置，顯示對齊網格的預覽標記
            const snappedTime = this.snappedTime;
            const t = snappedTime - this.globalTime;
            const targetX = (this.hoverLane === 'T') ? visualNoteRefPos[8]?.x : visualNoteRefPos[this.hoverLane - 1]?.x;

            if (targetX !== undefined) {
                ctx.save();
                ctx.translate(targetX, t * -this.zoom);
                ctx.strokeStyle = (this.hoverLane === 'T') ? '#ffb74d' : '#FFFFFF';
                ctx.lineWidth = 1;
                ctx.strokeRect(-size / 2, -size / 2, size, size);
                ctx.restore();
            }
        }
    }

    _onContextMenu(e) {
        e.preventDefault();
    }

    _onPointerDown(e) {
        this._updMousePos(e);

        if (this.layerMode === 'bpm') {
            const clickedTag = this._hitTestTag(this.mouseX, this.mouseY);
            const screenPos = { clientX: e.clientX, clientY: e.clientY };

            if (this.editMode === 'eraser') {
                if (e.button === 0 && clickedTag !== null) {
                    e.stopPropagation();
                    if (this.onDeleteTag) {
                        this.onDeleteTag(clickedTag);
                    }
                }
                if (!this._isLoopActive()) this._upd();
                return;
            }

            if (this.editMode === 'select') {
                if (e.button === 0) {
                    if (clickedTag !== null) {
                        e.stopPropagation();
                        this.selectedTag = clickedTag;
                        if (this.onSelectTag) {
                            this.onSelectTag(clickedTag, screenPos);
                        }
                    } else {
                        this.selectedTag = null;
                        if (this.onSelectTag) {
                            this.onSelectTag(null, null);
                        }
                    }
                }
                if (!this._isLoopActive()) this._upd();
                return;
            }

            // edit (placement) mode in BPM layer
            if (e.button === 0) {
                const bs = this.settings?.noteBaseSize || 11;
                const lineWidth = bs * 4.5;
                if (this.mouseX >= -lineWidth && this.mouseX <= lineWidth) {
                    const targetTime = (clickedTag ? clickedTag.time : null) ?? (this.globalTime - this.mouseY / this.zoom);
                    if (targetTime !== null && targetTime !== undefined) {
                        e.stopPropagation();
                        const selectedTiming = this.settings?.visualSelectedTiming;
                        const tagType = (selectedTiming === 'bpm') ? 'bpm' : 'split';
                        if (this.onPlaceTag) {
                            this.onPlaceTag(tagType, targetTime);
                        }
                    }
                }
            } else if (e.button === 2) {
                if (clickedTag !== null) {
                    e.stopPropagation();
                    if (this.onDeleteTag) {
                        this.onDeleteTag(clickedTag);
                    }
                }
            }
            if (!this._isLoopActive()) this._upd();
            return;
        }

        const clickedNote = this._hitTestNote(this.mouseX, this.mouseY);
        const lane = this._hitTestLane(this.mouseX);

        // 優先檢查是否點擊在 Hold 尾部膠囊狀手把上
        if (e.button === 0 && clickedNote && clickedNote.type === 'hold' && clickedNote.hitPart === 'tail') {
            e.stopPropagation();
            this.draggingHold = {
                note: clickedNote,
                originalDuration: clickedNote.holdDuration || 0,
                currentDuration: clickedNote.holdDuration || 0,
                pointerId: e.pointerId
            };
            this._lastPointerMoveEvent = e;
            if (this.canvas.setPointerCapture) {
                try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { }
            }
            if (!this._isLoopActive()) this._upd();
            return;
        }

        if (this.editMode === 'eraser') {
            if (e.button === 0 && clickedNote !== null) {
                e.stopPropagation();
                if (this.onDeleteNote) {
                    this.onDeleteNote(clickedNote);
                }
            }
            if (!this._isLoopActive()) this._upd();
            return;
        }

        if (this.editMode === 'select') {
            if (e.button === 0) { // 左鍵在選擇模式
                if (clickedNote !== null) {
                    if (e.ctrlKey || e.shiftKey) {
                        if (this.selectedNotes.has(clickedNote)) {
                            this.selectedNotes.delete(clickedNote);
                        } else {
                            this.selectedNotes.add(clickedNote);
                        }
                    } else {
                        if (!this.selectedNotes.has(clickedNote)) {
                            this.selectedNotes.clear();
                            this.selectedNotes.add(clickedNote);
                        }
                    }
                    e.stopPropagation(); // 點擊音符時阻斷事件，專注於選取，不拖拽軌道
                } else {
                    // 點擊空白處：若無修飾鍵則清除選取，且不呼叫 e.stopPropagation()，
                    // 讓事件冒泡到 visualScroller 啟動滑鼠/觸控拖拽軌道
                    if (!e.ctrlKey && !e.shiftKey) {
                        this.selectedNotes.clear();
                    }
                }
            } else if (e.button === 2) { // 右鍵在選擇模式：刪除選取音符
                if (clickedNote !== null && !this.selectedNotes.has(clickedNote)) {
                    this.selectedNotes.add(clickedNote);
                }
                if (this.selectedNotes.size > 0) {
                    e.stopPropagation();
                    if (this.onDeleteNote) {
                        this.onDeleteNote(Array.from(this.selectedNotes));
                    }
                    this.selectedNotes.clear();
                }
            }
            this._notifySelectionChange();
            if (!this._isLoopActive()) this._upd();
            return;
        }

        if (this.editMode === 'boxSelect') {
            if (e.button === 0) { // 左鍵在框選模式
                if (clickedNote !== null) {
                    if (e.ctrlKey || e.shiftKey) {
                        if (this.selectedNotes.has(clickedNote)) {
                            this.selectedNotes.delete(clickedNote);
                        } else {
                            this.selectedNotes.add(clickedNote);
                        }
                    } else {
                        if (!this.selectedNotes.has(clickedNote)) {
                            this.selectedNotes.clear();
                            this.selectedNotes.add(clickedNote);
                        }
                    }
                    this._notifySelectionChange();
                } else {
                    if (!e.ctrlKey && !e.shiftKey) {
                        this.selectedNotes.clear();
                        this.activeBoxRect = null;
                        this._notifySelectionChange();
                    }
                    this.isSelectingBox = true;
                    this.selectionStart = { x: this.mouseX, y: this.mouseY };
                    this.selectionEnd = { x: this.mouseX, y: this.mouseY };
                }
                e.stopPropagation();
            } else if (e.button === 2) { // 右鍵在框選模式：刪除選取音符
                if (clickedNote !== null && !this.selectedNotes.has(clickedNote)) {
                    this.selectedNotes.add(clickedNote);
                }
                if (this.selectedNotes.size > 0) {
                    e.stopPropagation();
                    if (this.onDeleteNote) {
                        this.onDeleteNote(Array.from(this.selectedNotes));
                    }
                    this.selectedNotes.clear();
                    this._notifySelectionChange();
                }
            }
            if (!this._isLoopActive()) this._upd();
            return;
        } else if (this.editMode === 'modifier') {
            if (e.button === 0) { // 左鍵套用效果
                if (clickedNote !== null) {
                    e.stopPropagation();
                    this.modifierClickedNote = clickedNote;
                }
            } else if (e.button === 2) { // 右鍵刪除音符
                if (clickedNote !== null) {
                    e.stopPropagation();
                    if (this.onDeleteNote) {
                        this.onDeleteNote(clickedNote);
                    }
                }
            }
            if (!this._isLoopActive()) this._upd();
            return;
        } else { // 編輯模式 (Edit Mode)
            if (e.button === 0) { // 左鍵
                this.markerPressed = true;
                const startT = (this.snappedTime !== null && this.snappedTime !== undefined) ? this.snappedTime : (this.globalTime - this.mouseY / this.zoom);
                const laneToUse = lane || (clickedNote ? clickedNote.pos : null);
                if (laneToUse !== null) {
                    e.stopPropagation();
                    this.pendingPlace = {
                        lane: laneToUse,
                        time: clickedNote ? clickedNote.time : startT
                    };
                }
            } else if (e.button === 2) { // 右鍵
                if (clickedNote !== null) {
                    e.stopPropagation();
                    if (this.onDeleteNote) {
                        this.onDeleteNote(clickedNote);
                    }
                } else if (lane !== null) {
                    e.stopPropagation();
                }
            }
        }

        if (!this._isLoopActive()) {
            this._upd();
        }
    }

    _onPointerUp(e) {
        if (e.button === 0) {
            this.markerPressed = false;

            if (this.draggingHold) {
                e.stopPropagation();
                this._stopAutoScroll();
                const { note, currentDuration, originalDuration, pointerId } = this.draggingHold;
                this.draggingHold = null;
                this._lastPointerMoveEvent = null;
                if (pointerId !== undefined && this.canvas.releasePointerCapture) {
                    try { this.canvas.releasePointerCapture(pointerId); } catch (_) { }
                }
                if (Math.abs(currentDuration - originalDuration) > 1e-4) {
                    if (this.onUpdateHoldDuration) {
                        this.onUpdateHoldDuration(note, currentDuration);
                    }
                }
                if (!this._isLoopActive()) this._upd();
                return;
            }

            if (this.isSelectingBox) {
                this.isSelectingBox = false;
                const minX = Math.min(this.selectionStart.x, this.selectionEnd.x);
                const maxX = Math.max(this.selectionStart.x, this.selectionEnd.x);
                const minY = Math.min(this.selectionStart.y, this.selectionEnd.y);
                const maxY = Math.max(this.selectionStart.y, this.selectionEnd.y);
                if (maxX - minX > 8 && maxY - minY > 8 && this.selectedNotes.size > 0) {
                    this.activeBoxRect = { minX, maxX, minY, maxY };
                } else {
                    this.activeBoxRect = null;
                }
                this._notifySelectionChange();
            }

            if (this.editMode === 'modifier') {
                if (this.modifierClickedNote) {
                    if (this.onChangeNote) {
                        this.onChangeNote(this.modifierClickedNote);
                    }
                    this.modifierClickedNote = null;
                }
                if (!this._isLoopActive()) {
                    this._upd();
                }
                return;
            }

            if (this.pendingPlace) {
                const { lane, time } = this.pendingPlace;
                this.pendingPlace = null;
                if (this.onPlaceNote) {
                    this.onPlaceNote(lane, time);
                }
            }
        }

        if (!this._isLoopActive()) {
            this._upd();
        }
    }

    _onPointerLeave(e) {
        this.markerPressed = false;
        if (!this.draggingHold) {
            this.hoverLane = null;
            this.isSelectingBox = false;
            this.canvas.style.cursor = (this.editMode === 'boxSelect') ? 'crosshair' : ((this.editMode === 'eraser' || this.editMode === 'modifier') ? 'default' : 'grab');
            if (!this._isLoopActive()) {
                this._upd();
            }
        }
    }

    _onPointerCancel(e) {
        this._stopAutoScroll();
        if (this.draggingHold) {
            const { pointerId } = this.draggingHold;
            this.draggingHold = null;
            this._lastPointerMoveEvent = null;
            if (pointerId !== undefined && this.canvas.releasePointerCapture) {
                try { this.canvas.releasePointerCapture(pointerId); } catch (_) { }
            }
        }
        this._onPointerLeave(e);
    }

    _updateDraggingHoldDuration(e) {
        if (!this.draggingHold) return;
        if (e) {
            this._updMousePos(e);
        }
        const note = this.draggingHold.note;
        const mouseTime = (this.snappedTime !== null && this.snappedTime !== undefined)
            ? this.snappedTime
            : (this.globalTime - this.mouseY / this.zoom);

        const currentBpm = this._getCurrentBpmAt(note.time);
        const gridDiv = this.settings?.gridDivision || 4;
        const tickPeriod = (240 / currentBpm) / gridDiv;

        // 計算離起點最近的第一個吸附點作為最小值下限
        let minEndTime = note.time + tickPeriod;
        if (typeof this.quantizeTime === 'function') {
            const candidate = this.quantizeTime(note.time + tickPeriod * 0.6);
            if (candidate !== null && candidate > note.time + 1e-4) {
                minEndTime = candidate;
            }
        }
        const safeMinEndTime = Math.max(minEndTime, note.time + 0.001);

        let targetEndTime = mouseTime;
        if (targetEndTime < safeMinEndTime) {
            targetEndTime = safeMinEndTime;
        }

        let newDuration = targetEndTime - note.time;
        if (newDuration < (safeMinEndTime - note.time)) {
            newDuration = safeMinEndTime - note.time;
        }

        this.draggingHold.currentDuration = newDuration;
        this.canvas.style.cursor = 'ns-resize';
        if (!this._isLoopActive()) this._upd();
    }

    _checkAutoScroll(e) {
        if (!this.draggingHold || !this.onScrollTime) {
            this._stopAutoScroll();
            return;
        }
        const rect = this.canvas.getBoundingClientRect();
        const topEdge = rect.top + 45;
        const bottomEdge = rect.bottom - 45;

        let speed = 0;
        if (e.clientY < topEdge) {
            // 向上拖曳超出或靠近頂端：時間往前推進 (未來方向，deltaSec > 0)
            const dist = topEdge - e.clientY;
            const pxPerSec = Math.min(800, dist * 8 + 40);
            speed = pxPerSec / (this.zoom || 100);
        } else if (e.clientY > bottomEdge) {
            // 向下拖曳超出或靠近底端：時間往回倒退 (過去方向，deltaSec < 0)
            const note = this.draggingHold.note;
            const currentBpm = this._getCurrentBpmAt(note.time);
            const gridDiv = this.settings?.gridDivision || 4;
            const tickPeriod = (240 / currentBpm) / gridDiv;
            let minEndTime = note.time + tickPeriod;
            if (typeof this.quantizeTime === 'function') {
                const candidate = this.quantizeTime(note.time + tickPeriod * 0.6);
                if (candidate !== null && candidate > note.time + 1e-4) {
                    minEndTime = candidate;
                }
            }
            const safeMinEndTime = Math.max(minEndTime, note.time + 0.001);
            const mouseTime = this.globalTime - this.mouseY / this.zoom;

            // 若長度已縮到最小吸附點且滑鼠已在該吸附點下方，停止繼續向下回溯滾動
            if (this.draggingHold.currentDuration <= (safeMinEndTime - note.time) + 1e-4 && mouseTime <= safeMinEndTime) {
                speed = 0;
            } else {
                const dist = e.clientY - bottomEdge;
                const pxPerSec = Math.min(800, dist * 8 + 40);
                speed = -pxPerSec / (this.zoom || 100);
            }
        }

        if (speed !== 0) {
            this._autoScrollSpeed = speed;
            if (!this._autoScrollTimer) {
                this._startAutoScroll();
            }
        } else {
            this._stopAutoScroll();
        }
    }

    _startAutoScroll() {
        if (this._autoScrollTimer) return;
        let lastTime = performance.now();
        const step = (now) => {
            if (!this.draggingHold || !this._autoScrollSpeed) {
                this._stopAutoScroll();
                return;
            }
            const dt = (now - lastTime) / 1000;
            lastTime = now;
            const deltaSec = this._autoScrollSpeed * Math.min(0.1, dt);
            if (this.onScrollTime) {
                this.onScrollTime(deltaSec);
            }
            if (this.draggingHold && this._lastPointerMoveEvent) {
                this._updateDraggingHoldDuration(this._lastPointerMoveEvent);
                this._checkAutoScroll(this._lastPointerMoveEvent);
            }
            this._autoScrollTimer = requestAnimationFrame(step);
        };
        this._autoScrollTimer = requestAnimationFrame(step);
    }

    _stopAutoScroll() {
        if (this._autoScrollTimer) {
            cancelAnimationFrame(this._autoScrollTimer);
            this._autoScrollTimer = null;
        }
        this._autoScrollSpeed = 0;
    }

    _onPointerMove(e) {
        this._updMousePos(e);
        this._lastPointerMoveEvent = e;

        if (this.draggingHold) {
            e.stopPropagation();
            this._updateDraggingHoldDuration(e);
            this._checkAutoScroll(e);
            return;
        }

        if ((this.editMode === 'select' || this.editMode === 'boxSelect') && this.isSelectingBox) {
            this.selectionEnd = { x: this.mouseX, y: this.mouseY };
            this._updateBoxSelection();
            if (!this._isLoopActive()) this._upd();
            return;
        }

        this.hoverLane = this._hitTestLane(this.mouseX);

        if (this.layerMode === 'bpm') {
            const hoveredTag = this._hitTestTag(this.mouseX, this.mouseY);
            if (this.editMode === 'eraser') {
                this.canvas.style.cursor = hoveredTag !== null ? 'pointer' : 'not-allowed';
            } else if (this.editMode === 'select') {
                this.canvas.style.cursor = hoveredTag !== null ? 'pointer' : 'grab';
            } else {
                this.canvas.style.cursor = 'crosshair';
            }
        } else {
            const hoveredNote = this._hitTestNote(this.mouseX, this.mouseY);
            if (hoveredNote && hoveredNote.type === 'hold' && hoveredNote.hitPart === 'tail') {
                this.canvas.style.cursor = 'ns-resize';
                if (!this._isLoopActive()) this._upd();
                return;
            }

            if (this.editMode === 'boxSelect') {
                this.canvas.style.cursor = hoveredNote !== null ? 'pointer' : 'crosshair';
            } else if (this.editMode === 'select') {
                this.canvas.style.cursor = hoveredNote !== null ? 'pointer' : 'grab';
            } else if (this.editMode === 'eraser') {
                this.canvas.style.cursor = hoveredNote !== null ? 'pointer' : 'not-allowed';
            } else if (this.editMode === 'modifier') {
                this.canvas.style.cursor = hoveredNote !== null ? 'pointer' : 'default';
            } else {
                if (this.hoverLane !== null) {
                    this.canvas.style.cursor = 'crosshair';
                } else {
                    this.canvas.style.cursor = 'grab';
                }
            }
        }

        if (!this._isLoopActive()) {
            this._upd();
        }
    }

    /**
     * 輔助方法：檢查 main_4.js 的渲染循環是否正在執行
     */
    _isLoopActive() {
        // 檢查播放按鈕狀態
        const playButton = document.querySelector('[data-buttonAction="play/pause"]');
        const isPlaying = playButton && playButton.dataset.playing === 'true';

        // 檢查是否開啟了暫停時持續渲染 (假設此變數在 window 或 settings 中)
        const isKeepRendering = window.keepRenderingWhilePause || false;

        return isPlaying || isKeepRendering;
    }
}

const STAR_GEOMETRY = [];
for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const rRatio = (i % 2 === 0) ? 1.0 : 0.4;
    STAR_GEOMETRY.push({
        cos: Math.cos(angle) * rRatio,
        sin: Math.sin(angle) * rRatio
    });
}

const HEXAGON_GEOMETRY = [];
for (let i = 0; i < 6; i++) {
    const angle = i * (Math.PI / 3);
    HEXAGON_GEOMETRY.push({
        cos: Math.cos(angle),
        sin: Math.sin(angle),
        isRightSide: !(i < 5 && i > 1)
    });
}

export class SimaiPreviewRenderer {
    constructor(canvas, settings) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.settings = settings;
        this.globalTime = 0;

        this.zoom = 200;

        this.noteBaseSize = 0.1;

        this.color = {
            tap: '#EE5393',
            star: '#00B9F7',
            double: '#FFDF00',
            break: '#FF640D',
            slide: '#00FBFC',
            mine: '#737373',
        };
        this.RENDER_LIMET = 1000;

        this.tb1 = 4;
        this.tb2 = 4;
    }

    setZoom(zoom) {
        this.zoom = zoom;
    }

    resize(width, height, dpr = 1, force = false) {
        if (!this.canvas) return false;
        this.dpr = dpr;
        const w = Math.round(width * dpr);
        const h = Math.round(height * dpr);

        if (!force && this.canvas.width === w && this.canvas.height === h) {
            return false;
        }

        this.canvas.width = w;
        this.canvas.height = h;
        this._canvasWH = null;
        return true;
    }

    getCanvasWH() {
        const w = this.canvas.width || 0;
        const h = this.canvas.height || 0;
        if (!this._canvasWH) {
            this._canvasWH = { width: 0, height: 0, halfWidth: 0, halfHeight: 0 };
        }
        this._canvasWH.width = w;
        this._canvasWH.height = h;
        this._canvasWH.halfWidth = w * 0.5;
        this._canvasWH.halfHeight = h * 0.5;
        return this._canvasWH;
    }

    setTimebase(tb1, tb2) {
        this.tb1 = tb1;
        this.tb2 = tb2;
    }

    drawLine(x1, y1, x2, y2, color = '#fff', width = 1) {
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawTag(tag) {
        const { ctx } = this;
        const { width: w, height: h, halfWidth: hw, halfHeight: hh } = this.getCanvasWH();
        const zoom = this.zoom || 1;

        const period = (tag.type === 'bpm') ? ((60 * this.tb1) / tag.value) : ((240 / tag.bpm) * (1 / tag.value));
        const beatPeriod = (tag.type === 'bpm') ? ((240 / tag.value) / this.tb2) : 0;
        const delta = tag.time - this.globalTime;

        if (period <= 0) return;

        let minI = Math.ceil((-hw / zoom - delta) / period) - 1;
        let maxI = Math.floor((hw / zoom - delta) / period);
        minI = Math.max(0, minI);

        if (tag.type === 'bpm') {
            if (tag.nextTime) {
                const duration = tag.nextTime - tag.time;
                const maxLines = Math.floor((duration - 0.001) / period);
                maxI = Math.min(maxI, maxLines);
            }
        } else {
            maxI = Math.min(Math.floor(tag.renderTimes || 1) - 1, maxI);
        }
        maxI = minI + Math.min(maxI - minI, this.RENDER_LIMET);

        if (minI > maxI) return;

        ctx.save();

        if (tag.type === 'bpm') {
            const parts = (this.tb1 * this.tb2) / 4;

            if (parts > 1) {
                ctx.strokeStyle = '#ffe865';
                ctx.lineWidth = 1;
                ctx.beginPath();
                const midY1 = h / 3;
                const midY2 = (2 * h) / 3;
                for (let i = minI; i <= maxI; i++) {
                    for (let b = 1; b < parts; b++) {
                        const subTime = tag.time + i * period + b * beatPeriod;
                        if (tag.nextTime && subTime >= tag.nextTime - 0.001) continue;
                        const subPosX = (delta + i * period + b * beatPeriod) * zoom + hw;
                        ctx.moveTo(subPosX, midY1);
                        ctx.lineTo(subPosX, midY2);
                    }
                }
                ctx.stroke();
            }

            ctx.strokeStyle = 'rgb(255, 217, 0)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = minI; i <= maxI; i++) {
                const posx = (delta + i * period) * zoom + hw;
                ctx.moveTo(posx, 0);
                ctx.lineTo(posx, h);
            }
            ctx.stroke();
        } else {
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgb(128, 128, 128)';
            ctx.beginPath();
            for (let i = minI; i <= maxI; i++) {
                if (i === 0) continue;
                const posx = (delta + i * period) * zoom + hw;
                ctx.moveTo(posx, 0);
                ctx.lineTo(posx, h);
            }
            ctx.stroke();

            if (minI <= 0 && maxI >= 0 && !tag.nohead) {
                ctx.strokeStyle = '#ffffff';
                ctx.beginPath();
                const posx = delta * zoom + hw;
                ctx.moveTo(posx, 0);
                ctx.lineTo(posx, h);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    drawTap(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine } = s;
        const t = (noteTime - this.globalTime);
        const ctx = this.ctx;

        const size = this.noteBaseSize * this.h;
        const y = (pos - 0.5) / 8 * this.h;
        const cx = this.hw + t * this.zoom;

        ctx.beginPath();
        ctx.arc(cx, y, size * 0.5, 0, Math.PI * 2);
        ctx.lineWidth = size * 0.35;
        ctx.strokeStyle = isMine ? this.color.mine : (isBreak ? this.color.break : (isDouble ? this.color.double : this.color.tap));
        ctx.stroke();
    }

    drawStar(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine } = s;
        const t = (noteTime - this.globalTime);
        const ctx = this.ctx;

        const size = this.noteBaseSize * this.h * 0.9;
        const y = (pos - 0.5) / 8 * this.h;
        const cx = this.hw + t * this.zoom;

        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const geom = STAR_GEOMETRY[i];
            const px = cx + geom.cos * size;
            const py = y + geom.sin * size;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.lineWidth = size * 0.35;
        ctx.strokeStyle = isMine ? this.color.mine : (isBreak ? this.color.break : (isDouble ? this.color.double : this.color.star));
        ctx.stroke();
    }

    drawHold(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine, holdDuration } = s;
        const ctx = this.ctx;
        const t = (noteTime - this.globalTime);

        const size = this.settings.noteBaseSize * this.h * 0.01;
        const y = (pos - 0.5) / 8 * this.h;
        const cx = this.hw + t * this.zoom;
        const r = size * 0.5;
        const holdWidth = holdDuration * this.zoom;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const geom = HEXAGON_GEOMETRY[i];
            const of = geom.isRightSide ? holdWidth : 0;
            const px = cx + geom.cos * r + of;
            const py = y + geom.sin * r;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.lineWidth = size * 0.35;
        ctx.strokeStyle = isMine ? this.color.mine : (isBreak ? this.color.break : (isDouble ? this.color.double : this.color.tap));
        ctx.stroke();
    }

    drawSlide(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine, slideDelay, slideDuration } = s;
        if (slideDuration * this.zoom < 1e-4) return;
        const t = (noteTime + slideDelay - this.globalTime);
        const ctx = this.ctx;

        const size = this.noteBaseSize * this.h;
        const y = (pos - 0.5) / 8 * this.h;

        ctx.save();
        ctx.lineWidth = size;
        ctx.strokeStyle = isMine ? this.color.mine : (isBreak ? this.color.break : (isDouble ? this.color.double : this.color.slide));
        ctx.setLineDash([size * 0.4, size * 0.3]);
        ctx.translate(this.hw + t * this.zoom, y);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(slideDuration * this.zoom, 0);
        ctx.stroke();
        ctx.restore();
    }

    drawTouch(s) {
        const { time: noteTime, pos, touchPos, isDouble, isMine, holdDuration, isHanabi } = s;
        const t = (noteTime - this.globalTime);
        const ctx = this.ctx;

        const size = this.noteBaseSize * this.h;
        const y = touchPos === "C" ? this.hh : ((pos - 0.5 * !(touchPos === "E" || touchPos === "D")) / 8 * this.h);

        ctx.save();
        ctx.translate(this.hw + t * this.zoom, y);
        ctx.beginPath();
        if (isHanabi) {
            const h = holdDuration ?? 0;
            const color = this.ctx.createLinearGradient((h * this.zoom), -y, (h * this.zoom) + size * 4, this.h - y);
            color.addColorStop(0, "#00D5FF");
            color.addColorStop(0.4, "#FF00FF");
            color.addColorStop(0.8, "#FFD823");
            color.addColorStop(1, "#FFD823");

            const width = Math.round(size * 4);
            const height = this.h + y;

            this.ctx.save();
            this.ctx.fillStyle = color;

            for (let x = 0; x < width; x += 4) {
                this.ctx.globalAlpha = 1 - (x / width);
                this.ctx.fillRect((h * this.zoom) + x, -y, 4, height);
            }

            this.ctx.restore();
        }
        if (holdDuration) {
            ctx.lineWidth = size * 0.8;
            if (isMine) {
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = "source-over";
                const hp = Math.max(4, holdDuration * this.zoom);
                this.ctx.beginPath();
                this.ctx.moveTo(0, 0);
                this.ctx.lineTo(hp, 0);
                this.ctx.closePath();
                this.ctx.stroke();
            } else {
                ctx.globalCompositeOperation = "lighter";
                ctx.globalAlpha = 0.8;
                const hp = Math.max(4, holdDuration * this.zoom) / 4;
                for (let i = 0; i < 4; i++) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(hp * i, 0);
                    this.ctx.lineTo(hp * (i + 1), 0);
                    this.ctx.closePath();
                    switch (i) {
                        case 0:
                            this.ctx.strokeStyle = "#EC4402";
                            break;
                        case 1:
                            this.ctx.strokeStyle = "#F6EE01";
                            break;
                        case 2:
                            this.ctx.strokeStyle = "#0CA163";
                            break;
                        case 3:
                            this.ctx.strokeStyle = "#0197F5";
                            break;
                    }
                    this.ctx.stroke();
                }
            }
        } else {
            ctx.lineWidth = size * 0.35;
            ctx.strokeStyle = isMine ? this.color.mine : (isDouble ? this.color.double : this.color.star);
            ctx.strokeRect(-size * 0.5, -size * 0.5, size, size);
        }
        ctx.restore();
    }

    drawAudioWaveform(audioBuffer, offset = 0) {
        if (!audioBuffer) return;
        const ctx = this.ctx;
        const { width: w, height: h, halfWidth: hw, halfHeight: hh } = this.getCanvasWH();
        if (!ctx || w <= 0 || h <= 0) return;

        const channelData = audioBuffer.getChannelData ? audioBuffer.getChannelData(0) : (audioBuffer.data || audioBuffer);
        const sampleRate = audioBuffer.sampleRate || 44100;
        if (!channelData || channelData.length === 0) return;

        const zoom = this.zoom || 200;
        const gt = this.globalTime + offset;
        const totalSamples = channelData.length;

        const waveMaxHeight = h * (this.settings.audioWaveformHeightRatio || 0.4);
        const audioAmp = this.settings.audioAmp || 1.0;

        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(136, 136, 136, 0.2)';

        const timePerPixel = 1 / zoom;
        const leftTime = gt - (hw / zoom);
        const subPixelOffset = (leftTime % timePerPixel) * zoom;

        ctx.beginPath();
        const step = Math.max(1, Math.floor((sampleRate / zoom) / 8));

        for (let x = -1; x <= w + 1; x++) {
            const pixelTime = Math.floor(leftTime / timePerPixel) * timePerPixel + (x * timePerPixel);

            let startIdx = Math.floor(pixelTime * sampleRate);
            let endIdx = Math.floor((pixelTime + timePerPixel) * sampleRate);

            if (endIdx <= 0 || startIdx >= totalSamples) continue;
            startIdx = Math.max(0, startIdx);
            endIdx = Math.min(totalSamples, endIdx);

            let peak = 0;
            if (endIdx - startIdx <= 1) {
                peak = Math.abs(channelData[startIdx] || 0);
            } else {
                for (let i = startIdx; i < endIdx; i += step) {
                    const v = Math.abs(channelData[i]);
                    if (v > peak) peak = v;
                }
            }

            const amp = Math.min(1, peak * audioAmp);
            const pxH = amp * waveMaxHeight;
            const drawX = x - subPixelOffset;

            ctx.moveTo(drawX, hh - pxH);
            ctx.lineTo(drawX, hh + pxH);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawTriangle(x0, y0, x1, y1, x2, y2, color = '#fff', width = 1) {
        const ctx = this.ctx;
        ctx.save();
        ctx.lineWidth = width;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    drawFrame(state) {
        const { width: w, height: h, halfWidth: hw, halfHeight: hh } = this.getCanvasWH();
        this.w = w;
        this.h = h;
        this.hw = hw;
        this.hh = hh;

        this.ctx.clearRect(0, 0, w, h);
        this.ctx.lineJoin = 'bevel';

        const { globalTime, visualBuckets, audioBuffer, offset, indexTime, cursorIndexTime } = state;
        this.globalTime = globalTime;
        this.indexTime = indexTime ?? 0;
        // 先繪製譜面切分線 (split tags)，再繪製 BPM 與黃節拍線 (bpm tags，疊在切分線之上)
        visualBuckets.tags.filter(t => t.type === 'split').forEach(t => this.drawTag(t));
        visualBuckets.tags.filter(t => t.type !== 'split').forEach(t => this.drawTag(t));
        visualBuckets.slide.forEach(n => this.drawSlide(n));
        visualBuckets.tapnhold.forEach(n => {
            if (n.type === "hold") this.drawHold(n);
            else if (n.isStar) this.drawStar(n);
            else this.drawTap(n);
        });
        visualBuckets.touch.forEach(n => this.drawTouch(n));
        const ct = hw + (cursorIndexTime - globalTime) * this.zoom;
        this.drawTriangle(
            ct - h * 0.1, 0,
            ct, h * 0.1,
            ct + h * 0.1, 0,
            '#ffd11b', 1);
        const t = hw + (this.indexTime - globalTime) * this.zoom;
        this.drawTriangle(
            t - h * 0.1, 0,
            t, h * 0.1,
            t + h * 0.1, 0,
            '#ff0000ce', 1);
        this.drawLine(hw, 0, hw, h, '#ff0000ce', 1);
    }
}
