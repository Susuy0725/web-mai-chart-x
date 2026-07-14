import {
    scaleBase,
    innerCirleBase,
    noteRefPos,
    visualNoteRefPos,
    touchRefPos,
    imgNotExists,
    getTintedImage,
    generatePath,
    touchPaths,
    wSlideRatio,
    clamp,
    drawImgAtcenter,
    exColor,
} from './helper.js';
const charWidthCache = {};

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
        this.settings = settings;
        this.images = null;
        this.globalTime = 0;

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
        this._zoneCounts = {};
        this.drawnBorders = new Set();
        this.hanabiEffect = {};
        this._tempColorConfig = { colorCode: '' };
        this._auxTextList = new Array(12);

        // outlineText / middleDisplay 快取配置
        this._middleDisplayConfig1 = { fillStyle: "#A1435D", strokeStyle: "#A6ABAE" };
        this._middleDisplayConfig2 = { fillStyle: "#A1435D", strokeStyle: "#A6ABAE", letterSpacing: -0.1 };
        this._middleDisplayConfigScore = { fillStyle: "#4061A8", strokeStyle: "#A6ABAE", letterSpacing: -0.1, textAlign: "right" };
        this._middleDisplayConfigDot = { fillStyle: "#4061A8", strokeStyle: "#A6ABAE", letterSpacing: -0.12, textAlign: "left" };
        this._middleDisplayConfigFrac = { fillStyle: "#4061A8", strokeStyle: "#A6ABAE", letterSpacing: -0.12, textAlign: "left" };
        this._middleDisplayConfigPercent = { fillStyle: "#4061A8", strokeStyle: "#A6ABAE", letterSpacing: -0.12, textAlign: "left" };
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
    updateCanvasMetrics() {
        const { width: w, height: h } = this.canvas;
        this._p = Math.min(w, h) / scaleBase * this.scale;
        this._invP = scaleBase / (Math.min(w, h) * this.scale);
        this._hw = w * this._invP * 0.5;
        this._hh = h * this._invP * 0.5;
    }

    setImages(images) {
        this.images = images;
    }

    /**
     * 優化染色圖片取得方式
     */
    getMemoizedTintedImage(imgKey, opacity, config) {
        if (!this.images[imgKey]) return null;
        const cacheKey = `${imgKey}_${opacity.toFixed(2)}_${config.colorCode}`;

        if (this._tintCache.has(cacheKey)) {
            return this._tintCache.get(cacheKey);
        }

        const tinted = getTintedImage(this.images[imgKey], opacity, config);
        // 限制快取大小，防止記憶體溢出
        if (this._tintCache.size > 200) this._tintCache.clear();
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

    // --- 視覺效果 ---

    simpleHitEffect(noteT) {
        const t = noteT / this.settings.effectDecayTime;
        if (t < -1) return;
        this.ctx.save();
        const decayAlpha = 1 - Math.max(0, -t);
        const radius = 0.8 * this.settings.noteBaseSize * (1 - decayAlpha);

        this.ctx.strokeStyle = `rgba(255, 200, 0, ${0.8 * decayAlpha})`;
        this.ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha;
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
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

    simpleHoldEffect(noteT) {
        this.ctx.save();
        const t = noteT * -2;
        const decayAlpha = 1 - Math.max(0, t % 1);
        const decayAlpha1 = 1 - Math.max(0, (t + 0.5) % 1);
        const radius = 0.6 * this.settings.noteBaseSize * (1 - decayAlpha);
        const radius1 = 0.6 * this.settings.noteBaseSize * (1 - decayAlpha1);

        this.ctx.strokeStyle = `rgba(255, 200, 0, ${0.6 * decayAlpha})`;
        this.ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha;
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.strokeStyle = `rgba(255, 200, 0, ${0.6 * decayAlpha1})`;
        this.ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha1;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius1, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
    }

    getNoteTransform(noteT, speedMult = 1) {
        const calcPiecewiseSpeed = (x) => {
            if (x >= 1) {
                return x * 0.8833 + 0.8167;
            } else if (x <= -1) {
                return x * 0.8833 - 0.8167;
            } else {
                // 當 abs(x) < 1 時
                return x * 1.7;
            }
        };
        const progress = noteT * calcPiecewiseSpeed(this.settings.speed * speedMult);
        const t = 1 - this.timeFunction(progress);
        const displayT = Math.max(this.settings.middleDistance, t);
        const currentScale = t < this.settings.middleDistance
            ? Math.max(0, (t + 0.9) / (0.9 + this.settings.middleDistance))
            : 1;
        if (!this._tempTransform) {
            this._tempTransform = { t: 0, displayT: 0, currentScale: 0 };
        }
        this._tempTransform.t = t;
        this._tempTransform.displayT = displayT;
        this._tempTransform.currentScale = currentScale;
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
        } = state;

        this.globalTime = globalTime;
        this.playCombo = playCombo;
        this.playScore = playScore;

        if (!this.images) return;

        this.currentTouchNotes = buckets.touch || [];
        // 重置 zoneCounts，避免每幀分配新物件
        for (const k in this._zoneCounts) {
            this._zoneCounts[k] = 0;
        }
        for (let idx = 0; idx < this.currentTouchNotes.length; idx++) {
            const n = this.currentTouchNotes[idx];
            const t = n.time - this.globalTime;
            const isActive = n.holdDuration ? (-t <= n.holdDuration) : (t > 0);
            if (isActive) {
                const zoneKey = n.touchPos + n.pos;
                this._zoneCounts[zoneKey] = (this._zoneCounts[zoneKey] || 0) + 1;
            }
        }
        this.drawnBorders.clear();

        // 重置 hanabiEffect 狀態，避免每幀分配新物件
        for (const k in this.hanabiEffect) {
            this.hanabiEffect[k].cleared = true;
            this.hanabiEffect[k].time = -99999;
        }

        // 1. 更新座標指標
        this.updateCanvasMetrics();
        const { _hw: hw, _hh: hh, canvas: { width: w, height: h } } = this;

        // 2. 清除畫面 (座標系已經 transform 過的話，注意清除範圍)
        if (!state.skipClear) {
            ctx.clearRect(-hw, -hh, w, h);
        }

        // 3. 繪製順序優化
        if (showSensor || showSensorText) this.drawSensors(showSensor, showSensorText);

        // 分數與 Combo 建議改為「動態繪製」而非「快取繪製」，因為變動頻率太高
        this.drawMiddleDisplay();

        for (const n of buckets.touch) this.getTouchHanabi(n);
        this.drawHanabiEffects();
        for (const n of buckets.slide) this.drawSlide(n);

        for (const n of buckets.tapnhold) {
            if (n.type === "hold") this.drawHold(n);
            else if (n.isStar) this.drawStar(n);
            else this.drawTap(n);
        }
        for (const n of buckets.touch) this.drawTouch(n);

        this.drawStaticBackground();
        if (this.settings.renderSurroundingAuxiliaryText) this.drawAuxiliaryText(dt, globalTime, noteQuantity, playScoreRes, playCombo, playScore);
        if (this.settings.showUI) this.drawUI(dt, globalTime);
    }

    drawUI(dt, globalTime) {
        const { ctx } = this;
        const { width: w, height: h } = this.getCanvasWH();

        const fpsText = `FPS: ${dt === 0 ? 'PAUSE' : (1 / dt).toFixed(2)}`;
        const timeText = `Time: ${globalTime < 0 ? '-' + Math.abs(Math.ceil(globalTime / 60)) : Math.floor(globalTime / 60)}:${Math.abs(globalTime % 60).toFixed(2).padStart(5, '0')}`;

        ctx.save();
        ctx.font = "3px Google Sans";
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(fpsText, -w / 2 + 2, -h / 2 + 2);
        ctx.fillText(timeText, -w / 2 + 2, -h / 2 + 2 + 4);
        ctx.restore();
    }

    drawAuxiliaryText(dt, globalTime, noteQuantity, playScoreRes, playCombo, playScore) {
        const { width: w, height: h } = this.getCanvasWH();
        if (h >= w) return;
        const { ctx } = this;
        const allRes = playScoreRes.tap + playScoreRes.hold + playScoreRes.slide + playScoreRes.touch + playScoreRes.break;

        ctx.save();
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.font = "9px mono";
        ctx.letterSpacing = "-1px";

        ctx.fillText(`${globalTime < 0 ? '-' + Math.abs(Math.ceil(globalTime / 60)) : Math.floor(globalTime / 60)}:${Math.abs(globalTime % 60).toFixed(2).padStart(5, '0')}`,
            scaleBase / -2 - 5, -1);

        ctx.letterSpacing = "0px";
        ctx.font = "4px Google Sans";
        ctx.fillText('Powered by', scaleBase / -2 - 3, h / 2 - 5);
        ctx.font = "2.5px Google Sans";
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
        for (let i = 0; i < this._auxTextList.length; i++) {
            const v = this._auxTextList[i];
            ctx.font = `${i % 2 == 0 ? "4" : "bold 5"}px mono`;
            ctx.fillText(v, scaleBase / 2 + 3, lil - i * sp - (i % 2 == 0));
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
                if (this.playCombo != 0) {
                    outlineText(ctx, "COMBO", 0, -7, 4.4, 0.5, this._middleDisplayConfig1);
                    outlineText(ctx, `${this.playCombo}`, 0, 0, 7.4, 0.5, this._middleDisplayConfig2);
                }
                break;
            case 2:
                const trueScore = Math.max(this.playScore, 0).toFixed(4);
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
            // 快取建立失敗時回退到原本的即時繪製
            console.error('建立傳感器靜態快取失敗:', e);
            this._sensorShapeCache = null;
            this._sensorTextCache = null;
            this._sensorCacheParams = { w: 0, h: 0, scale };
        }
    }

    // 使用靜態快取繪製傳感器（會依 flag 決定畫 shapes / text）
    drawSensors(showSensor, showSensorText) {
        this.ensureSensorCaches();
        if (!this._sensorShapeCache && !this._sensorTextCache) return;

        const { ctx } = this;
        ctx.save();
        // 快取是以 pixel canvas 儲存，因此臨時重設 transform 以直接 draw 到畫布
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        try {
            if (showSensor && this._sensorShapeCache) ctx.drawImage(this._sensorShapeCache, 0, 0);
            if (showSensorText && this._sensorTextCache) ctx.drawImage(this._sensorTextCache, 0, 0);
        } finally {
            ctx.restore();
        }
    }

    drawTap(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine, hispeed } = s;
        const noteT = noteTime - this.globalTime;
        const { t, displayT, currentScale } = this.getNoteTransform(noteT, hispeed);

        const posInfo = noteRefPos[pos - 1];
        const ctx = this.ctx;

        if (noteT <= 0) {
            ctx.save();
            ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(noteT);
            ctx.restore();
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

        // 合併繪製，減少 save/restore
        ctx.save();

        // 繪製 Arc
        const arcimg = this.images[isMine ? "MineArc" : (isBreak ? "BreakArc" : (isDouble ? "EachArc" : "NormalArc"))];
        ctx.save();
        ctx.rotate(posInfo.rot);
        ctx.globalAlpha = currentScale;
        this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
        ctx.restore();

        // 繪製 Note 本體
        ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
        ctx.rotate(posInfo.rot);
        this.drawImgAtcenter(img, size);

        if (s.isEx) {
            this._tempColorConfig.colorCode = this.exColor[isBreak ? "break" : (isDouble ? "double" : "tap")];
            const exImg = this.getMemoizedTintedImage("tap_ex", 0.6, this._tempColorConfig);
            this.drawImgAtcenter(exImg, size);
        }

        ctx.restore();
    }

    drawStar(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMultiple, isMine, hispeed } = s;
        const noteT = noteTime - this.globalTime;
        const { t, displayT, currentScale } = this.getNoteTransform(noteT, hispeed);

        const posInfo = noteRefPos[pos - 1];
        const ctx = this.ctx;

        if (noteT <= 0) {
            ctx.save();
            ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(noteT);
            ctx.restore();
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

        // 合併繪製，減少 save/restore
        ctx.save();

        // 繪製 Arc
        const arcimg = this.images[isMine ? "MineArc" : (isBreak ? "BreakArc" : (isDouble ? "EachArc" : "SlideArc"))];
        ctx.save();
        ctx.rotate(posInfo.rot);
        ctx.globalAlpha = currentScale;
        this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
        ctx.restore();

        // 繪製 Note 本體
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
        this.drawImgAtcenter(img, size);

        if (s.isEx) {
            this._tempColorConfig.colorCode = this.exColor[isBreak ? "break" : (isDouble ? "double" : "star")];
            const exImg = this.getMemoizedTintedImage(isMultiple ? "star_ex_double" : "star_ex", 0.6, this._tempColorConfig);
            this.drawImgAtcenter(exImg, size);
        }

        ctx.restore();
    }

    drawHold(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine, holdDuration, hispeed } = s;
        const noteT = (noteTime - this.globalTime);
        const t = 1 - this.timeFunction(noteT * (this.settings.speed * 0.8833 + 0.8167) * hispeed);
        const posInfo = noteRefPos[pos - 1];

        if (-noteT > holdDuration) {
            this.ctx.save();
            this.ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(holdDuration + noteT);
            this.ctx.restore();
        } else {
            const isOn = (noteTime - this.globalTime) <= -0.1 && !isMine;
            let br = (s.isBreak && !isMine) ? Math.pow(Math.sin(this.globalTime * -6), 2) * 0.5 : 0;
            const holdImgKey = isOn ?
                (isMine ? "hold_mine" : (isBreak ? "hold_break_on" : (isDouble ? "hold_each_on" : "hold_on"))) :
                (isMine ? "hold_mine" : (isBreak ? "hold_break" : (isDouble ? "hold_each" : "hold")));
            let img;
            if (isBreak) {
                this._tempColorConfig.colorCode = "#fff8a6";
                img = this.getMemoizedTintedImage(holdImgKey, br, this._tempColorConfig);
            } else {
                img = this.images[holdImgKey];
            }
            const t1 = 1 - this.timeFunction((noteTime - this.globalTime + holdDuration) * (this.settings.speed * 0.8833 + 0.8167));
            const displayT = Math.min(1, Math.max(this.settings.middleDistance, t));
            const currentScale = t < this.settings.middleDistance ? Math.max(0, (t + 0.9) / (0.9 + this.settings.middleDistance)) : 1;
            const size = this.settings.noteBaseSize * currentScale;
            const sizeOffset = t < this.settings.middleDistance ? 0 :
                Math.min((holdDuration + noteT) * 0.9 * (this.settings.speed * 0.8833 + 0.8167),
                    Math.min((1 - this.settings.middleDistance) * 2.45,
                        Math.min((t - this.settings.middleDistance) * 2.45,
                            holdDuration * 0.9 * (this.settings.speed * 0.8833 + 0.8167))));

            this.ctx.save();
            const arcimg = this.images[isMine ? "MineArc" : (isBreak ? "BreakArc" : (isDouble ? "EachArc" : "NormalArc"))];
            this.ctx.rotate(posInfo.rot);
            this.ctx.globalAlpha = currentScale;
            this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
            this.ctx.restore();

            if (t1 > this.settings.middleDistance) {
                this.ctx.save();
                const endimg = this.images[isMine ? "Hold_Mine_End" : (isBreak ? "Hold_Break_End" : (isDouble ? "Hold_Each_End" : "Hold_End"))];
                this.ctx.translate(posInfo.x * t1, posInfo.y * t1);
                this.drawImgAtcenter(endimg, size * 0.65);
                this.ctx.restore();
            }

            this.ctx.save();
            this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
            this.ctx.rotate(posInfo.rot);
            this.ctx.drawImage(img, 0, 0, 122, 55, -size / 2, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
            this.ctx.drawImage(img, 0, 55, 122, 90, -size / 2, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
            this.ctx.drawImage(img, 0, 145, 122, 55, -size / 2, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);

            if (s.isEx) {
                this._tempColorConfig.colorCode = isBreak ? this.exColor.break : (isDouble ? this.exColor.double : this.exColor.tap);
                const ex = this.getMemoizedTintedImage("hold_ex", 0.6, this._tempColorConfig);
                this.ctx.drawImage(ex, 0, 0, 122, 55, -size / 2, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
                this.ctx.drawImage(ex, 0, 55, 122, 90, -size / 2, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
                this.ctx.drawImage(ex, 0, 145, 122, 55, -size / 2, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);
            }
            this.ctx.restore();

            this.ctx.save();
            this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
            this.simpleHitEffect(noteT);
            if (isOn) this.simpleHoldEffect(noteT);
            this.ctx.restore();
        }
    }

    getTouchHanabi(s) {
        const { time: noteTime, pos, touchPos, holdDuration } = s;
        const noteT = (noteTime - this.globalTime);
        if (noteT > 0) return;

        const key = touchPos + pos;
        let existing = this.hanabiEffect[key];
        if (!existing) {
            existing = { time: -99999, x: 0, y: 0, noteT: 0, isCenter: false, cleared: true };
            this.hanabiEffect[key] = existing;
        }
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
        const zoneKey = touchPos + pos;

        const count = this._zoneCounts[zoneKey] || 0;

        const noteT = (noteTime - this.globalTime);
        const t = 1 - this.timeFunction(noteT * (this.settings.touchSpeed * 0.8833 + 0.8167) * hispeed);
        const posInfo = touchRefPos[touchPos][touchPos === "C" ? 0 : pos - 1];

        const borderImg = this.images[isMine ? "touch_border_2_mine" : (isDouble ? "touch_border_2_each" : "touch_border_2")];
        const borderImg3 = this.images[isMine ? "touch_border_3_mine" : (isDouble ? "touch_border_3_each" : "touch_border_3")];
        const touchPoint = this.images[isMine ? "touch_point_mine" : (isDouble ? "touch_point_each" : "touch_point")];

        if (holdDuration) {
            const isOn = (noteTime - this.globalTime) <= -0.1;
            const imgs = [];
            for (let i = 0; i < 4; i++) {
                const img = this.images["touchhold_" + i + (isMine ? "_mine" : "")];
                imgs.push(img);
            }
            const touchBorder = this.images["touchhold_border" + (isMine ? "_mine" : "")];

            this.ctx.save();
            if (-noteT > holdDuration) {
                this.ctx.translate(posInfo.x, posInfo.y);
                this.simpleHitEffect(holdDuration + noteT);
            } else {
                const size = this.settings.noteBaseSize * 0.7;
                const holdP = Math.max(0, Math.min(1, -noteT / holdDuration));
                const a = this.touchTimeFunction(18 * (1 - Math.min(1, t)) / 1.5) * 1.6;

                this.ctx.translate(posInfo.x, posInfo.y);
                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.moveTo(0, 0);
                this.ctx.arc(0, 0, size * 1.3, -Math.PI * 0.5, Math.PI * holdP * 2 - Math.PI * 0.5);
                this.ctx.closePath();
                this.ctx.clip();
                this.drawImgAtcenter(touchBorder, size * 2.6);
                this.ctx.restore();
                this.ctx.globalAlpha = 1;
                this.ctx.rotate(Math.PI * -0.75);
                this.ctx.globalAlpha = Math.max(0, 1 - (1 - Math.min(1, t)) * 0.5);
                for (let i = 0; i < 4; i++) {
                    this.ctx.drawImage(imgs[i], -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
                    this.ctx.rotate(Math.PI / 2);
                }
                this.ctx.globalAlpha = 1;
                this.drawImgAtcenter(touchPoint, size * 0.4);
                this.simpleHitEffect(noteT);
                if (isOn) this.simpleHoldEffect(noteT);
            }
            this.ctx.restore();
            return;
        }
        const img = this.images[isMine ? "touch_mine" : isDouble ? "touch_each" : "touch"];

        this.ctx.save();
        if (noteT <= 0) {
            this.ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(noteT);
        } else {
            const size = this.settings.noteBaseSize * 0.7;
            const a = this.touchTimeFunction(18 * (1 - t) / 1.5) * 1.6;
            this.ctx.translate(posInfo.x, posInfo.y);
            this.ctx.globalAlpha = 1;
            if (count >= 2 && !this.drawnBorders.has(zoneKey)) {
                this.drawnBorders.add(zoneKey);
                this.drawImgAtcenter(borderImg, size * 2.65);
                if (count > 2)
                    this.drawImgAtcenter(borderImg3, size * 2.65);
            }
            this.ctx.globalAlpha = Math.max(0, 1 - (1 - t) * 0.5);
            for (let i = 0; i < 4; i++) {
                this.ctx.drawImage(img, -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
                this.ctx.rotate(Math.PI / 2);
            }
            this.ctx.globalAlpha = 1;
            this.drawImgAtcenter(touchPoint, size * 0.4);
        }
        this.ctx.restore();
    }

    drawSlide(s) {
        const prefix = (s.isIllegal && this.settings.slideIllegalRed) ? "wifi_" : (s.isMine ? "wifi_mine_" : (s.isBreak ? "wifi_break_" : (s.isDouble ? "wifi_each_" : "wifi_")));
        const standardKey = (s.isIllegal && this.settings.slideIllegalRed) ? "slide" : (s.isMine ? "slide_mine" : (s.isBreak ? "slide_break" : (s.isDouble ? "slide_each" : "slide")));

        const { time: noteTime, pos, slideEnd, slideDelay, slideDuration, path, wPaths, hispeed } = s;
        const noteT = noteTime - this.globalTime;
        const t = 1 - this.timeFunction(noteT * (this.settings.speed * 0.8833 + 0.8167) * hispeed);
        const p = path || generatePath(pos, slideEnd);
        if (p.totalLength < 1e-4) return;

        this.ctx.save();
        const isTaped = -noteT > 0;
        this.ctx.globalAlpha = isTaped ? 1 : 0.75 * clamp(((t - this.settings.middleDistance) / (1 - this.settings.middleDistance)) + this.settings.slideSpeed, 0, 1);

        let slideProgress = 0;
        if (-noteT > slideDelay) {
            slideProgress = Math.min(1, (-noteT - slideDelay) / slideDuration);
        }
        let br = ((s.isBreak && !s.isMine) && !(s.isIllegal && this.settings.slideIllegalRed)) ? Math.pow(Math.sin(this.globalTime * -6), 2) * 0.5 : 0;
        const prefixOrKey = s.slideType === "w" ? prefix : standardKey;
        this.drawPathWithArrows(p, s.isMine ? 0 : slideProgress, prefixOrKey, s.slideType === "w", br, (s.isIllegal && this.settings.slideIllegalRed));

        const sz = Math.min(1, 1 - (noteT + slideDelay) / slideDelay);
        if (noteT <= 0 && slideProgress < 1 && (!s.hideHead || sz >= 1)) {
            const { x, y, rot } = p.getPointAt(slideProgress);
            this.ctx.save();
            this.ctx.globalAlpha = slideDelay < 1e-4 ? 1 : sz;
            const starImg = this.images[s.isMine ? "star_mine" : (s.isBreak ? "star_break" : (s.isDouble ? "star_each" : "star"))];
            const baseTransform = this.ctx.getTransform();
            if (s.slideType === "w") {
                const w1Point = wPaths.w1.getPointAt(slideProgress);
                this.ctx.translate(w1Point.x, w1Point.y);
                this.ctx.rotate(w1Point.rot + Math.PI * 0.5);
                this.drawImgAtcenter(starImg, this.settings.noteBaseSize * sz * 1.45);

                this.ctx.setTransform(baseTransform);

                const w2Point = wPaths.w2.getPointAt(slideProgress);
                this.ctx.translate(w2Point.x, w2Point.y);
                this.ctx.rotate(w2Point.rot + Math.PI * 0.5);
                this.drawImgAtcenter(starImg, this.settings.noteBaseSize * sz * 1.45);

                this.ctx.setTransform(baseTransform);
            }
            this.ctx.translate(x, y);
            this.ctx.rotate(rot + Math.PI * 0.5);
            this.drawImgAtcenter(starImg, this.settings.noteBaseSize * sz * 1.45);

            this.ctx.restore();
        }
        this.ctx.restore();
    }

    drawPathWithArrows(recorder, starProgress, prefixOrKey, typew, br, isIllegal, spacing = 4.36) {
        const arrowCount = typew ? 11 : Math.floor((recorder.totalLength - 2) / spacing);
        spacing = typew ? 7 : spacing;
        this.ctx.save();
        for (let i = arrowCount; i > Math.floor(starProgress * arrowCount); i--) {
            const imgIndex = Math.min(i - 1, typew ? 10 : 0);
            const imgKey = typew ? (prefixOrKey + imgIndex) : prefixOrKey;

            const opacity = isIllegal ? 1 : br;
            const colorCode = isIllegal ? "#ff3838" : "#fff8a6";

            let img;
            if (isIllegal || br > 0) {
                this._tempColorConfig.colorCode = colorCode;
                img = this.getMemoizedTintedImage(imgKey, opacity, this._tempColorConfig);
            } else {
                img = this.images[imgKey];
            }

            if (!img) continue;

            const dist = i * spacing + (typew ? wSlideRatio[imgIndex * 4 + 2] : 0);
            const { x, y, rot } = recorder.getPointAt(dist / recorder.totalLength);

            this.ctx.save();
            this.ctx.translate(x, y);
            this.ctx.rotate(rot + (typew ? (Math.PI * -0.3745) : Math.PI));
            const dw = typew ? wSlideRatio[imgIndex * 4] * (0.096 + wSlideRatio[imgIndex * 4 + 3]) : 7 * 0.9;
            const dh = typew ? wSlideRatio[imgIndex * 4 + 1] * (0.096 + wSlideRatio[imgIndex * 4 + 3]) : 9.4 * 0.9;
            this.drawImgAtcenter(img, 1, 0, 0, dw, dh);
            this.ctx.restore();
        }
        this.ctx.restore();
    }

    drawHanabiEffects() {
        for (const key in this.hanabiEffect) {
            const eff = this.hanabiEffect[key];
            if (eff.cleared) continue;
            this.ctx.save();
            this.ctx.translate(eff.x, eff.y);
            this.simpleHanabi(eff.noteT, eff.isCenter);
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

        this.audioWaveformWidthRatio = 0.3;
        this.zoom = 200;

        this.passOpacity = 0.7;

        this.exColor = exColor;
        // marker state: 方塊表示現在游標位置（綠色），按下時變紅
        this.markerPressed = false;
        this.markerColors = { normal: '#00FF00', pressed: '#FF0000' };
        this.mouseX = 0;
        this.mouseY = 0;
        this.markerX = 0;

        this._tintCache = new Map();
        this._tempColorConfig = { colorCode: '' };

        // Callbacks & Snapping for editing
        this.onPlaceNote = null;
        this.onDeleteNote = null;
        this.onChangeNote = null;
        this.quantizeTime = null;
        this.hoverLane = null;

        // 綁定滑鼠事件以切換方塊顏色並更新位置
        if (this.canvas && this.canvas.addEventListener) {
            this._onPointerDown = this._onPointerDown.bind(this);
            this._onPointerUp = this._onPointerUp.bind(this);
            this._onPointerLeave = this._onPointerLeave.bind(this);
            this._onPointerMove = this._onPointerMove.bind(this);
            this._onContextMenu = this._onContextMenu.bind(this);

            // use capture to ensure marker events are detected before other handlers
            this.canvas.addEventListener('pointerdown', this._onPointerDown, { capture: true, passive: false });
            this.canvas.addEventListener('pointerup', this._onPointerUp, { capture: true });
            this.canvas.addEventListener('pointercancel', this._onPointerLeave, { capture: true });
            this.canvas.addEventListener('pointerleave', this._onPointerLeave, { capture: true });
            this.canvas.addEventListener('pointermove', this._onPointerMove, { capture: true, passive: false });
            this.canvas.addEventListener('contextmenu', this._onContextMenu);
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
        if (minDiff <= 50) {
            return closestLane;
        }
        return null;
    }

    _hitTestNote(mouseX, mouseY) {
        if (!this._state || !this._state.visualBuckets) return null;
        const tolerance = this.settings.noteBaseSize * 1.5;
        const zoom = this.zoom;
        const gt = this.globalTime;

        // Helper check for a candidate note
        const checkCandidate = (note, noteX) => {
            const noteY = (note.time - gt) * -zoom;
            const dx = mouseX - noteX;
            const dy = mouseY - noteY;
            return dx * dx + dy * dy <= tolerance * tolerance;
        };

        // 1. Check tapnhold
        for (const note of this._state.visualBuckets.tapnhold) {
            const noteX = visualNoteRefPos[note.pos - 1].x;
            if (checkCandidate(note, noteX)) {
                return note;
            }
        }

        // 2. Check slide
        for (const note of this._state.visualBuckets.slide) {
            const noteX = visualNoteRefPos[note.pos - 1].x;
            if (checkCandidate(note, noteX)) {
                return note;
            }
        }

        // 3. Check touch
        for (const note of this._state.visualBuckets.touch) {
            const posInfo = touchRefPos[note.touchPos][note.touchPos === "C" ? 0 : note.pos - 1];
            if (checkCandidate(note, posInfo.x)) {
                return note;
            }
        }

        return null;
    }

    getMemoizedTintedImage(imgKey, opacity, config) {
        if (!this.images[imgKey]) return null;
        const cacheKey = `${imgKey}_${opacity.toFixed(2)}_${config.colorCode}`;

        if (this._tintCache.has(cacheKey)) {
            return this._tintCache.get(cacheKey);
        }

        const tinted = getTintedImage(this.images[imgKey], opacity, config);
        if (this._tintCache.size > 200) this._tintCache.clear();
        this._tintCache.set(cacheKey, tinted);
        return tinted;
    }

    getCanvasWH() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        const invP = scaleBase / Math.min(w, h) * 0.5;
        if (!this._canvasWH) {
            this._canvasWH = { width: 0, height: 0 };
        }
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
    }

    drawImgAtcenter(img, size, offsetX = 0, offsetY = 0, imgWidthMul = 1, imgHeightMul = 1) {
        return drawImgAtcenter(this.ctx, img, size, offsetX, offsetY, imgWidthMul, imgHeightMul);
    }

    drawTap(s) {
        const { time: noteTime, pos, isBreak, isDouble } = s;
        const t = (noteTime - this.globalTime);

        const img = this.images[isBreak ? "tap_break" : (isDouble ? "tap_each" : "tap")];
        if (imgNotExists(img)) return;
        const size = this.settings.noteBaseSize;

        this.ctx.save();
        this.ctx.translate(visualNoteRefPos[pos - 1].x, t * -this.zoom);
        if (t <= 0) {
            this.ctx.globalAlpha = this.passOpacity;
        }
        this.drawImgAtcenter(img, size);
        if (s.isEx) {
            this._tempColorConfig.colorCode = this.exColor[isBreak ? "break" : (isDouble ? "double" : "tap")];
            const ex = this.getMemoizedTintedImage("tap_ex", 0.6, this._tempColorConfig);
            this.drawImgAtcenter(ex, size);
        }
        this.ctx.restore();
    }

    drawStar(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMultiple } = s;
        const t = (noteTime - this.globalTime);

        const img = this.images[isMultiple ? (isBreak ? "star_break_double" : (isDouble ? "star_each_double" : "star_double"))
            : (isBreak ? "star_break" : (isDouble ? "star_each" : "star"))
        ];
        if (imgNotExists(img)) return;
        const size = this.settings.noteBaseSize;

        this.ctx.save();
        this.ctx.translate(visualNoteRefPos[pos - 1].x, t * -this.zoom);
        if (t <= 0) {
            this.ctx.globalAlpha = this.passOpacity;
        }
        this.drawImgAtcenter(img, size);
        if (s.isEx) {
            this._tempColorConfig.colorCode = this.exColor[isBreak ? "break" : (isDouble ? "double" : "star")];
            const ex = this.getMemoizedTintedImage(isMultiple ? "star_ex_double" : "star_ex", 0.4, this._tempColorConfig);
            this.drawImgAtcenter(ex, size * 0.95);
        }
        this.ctx.restore();
    }

    drawTouch(s) {
        const { time: noteTime, pos, touchPos, isDouble, holdDuration } = s;
        const t = (noteTime - this.globalTime);
        const posInfo = touchRefPos[touchPos][touchPos === "C" ? 0 : pos - 1];

        if (holdDuration) {
            const imgs = [];
            for (let i = 0; i < 4; i++) {
                const img = this.images["touchhold_" + i];
                if (imgNotExists(img)) return;
                imgs.push(img);
            }
            const touchPoint = this.images[isDouble ? "touch_point_each" : "touch_point"];

            this.ctx.save();

            const size = this.settings.noteBaseSize * 0.6;

            this.ctx.translate(posInfo.x, t * -this.zoom);
            this.ctx.globalAlpha = 0.4;
            this.ctx.lineWidth = size * 0.6;
            this.ctx.globalCompositeOperation = "lighter";
            let hp = (holdDuration / 4) * -this.zoom;
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

        const img = this.images[isDouble ? "touch_each" : "touch"];
        const touchPoint = this.images[isDouble ? "touch_point_each" : "touch_point"];
        if (imgNotExists(img)) return;

        this.ctx.save();

        const size = this.settings.noteBaseSize * 0.6;
        const a = 1.5;

        this.ctx.translate(posInfo.x, t * -this.zoom);
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
        const { time: noteTime, pos, isBreak, isDouble, holdDuration } = s;
        const t = (noteTime - this.globalTime);
        const posInfo = visualNoteRefPos[pos - 1];

        const img = this.images[isBreak ? "hold_break" : (isDouble ? "hold_each" : "hold")];
        if (imgNotExists(img)) return;

        const size = this.settings.noteBaseSize;
        const sizeOffset = holdDuration * 0.0555 * this.zoom;

        this.ctx.save();
        this.ctx.translate(posInfo.x, t * -this.zoom);
        this.ctx.rotate(Math.PI);
        if (t <= -holdDuration) {
            this.ctx.globalAlpha = this.passOpacity;
        }

        this.ctx.drawImage(img, 0, 0, 122, 55, -size / 2, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
        this.ctx.drawImage(img, 0, 55, 122, 90, -size / 2, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
        this.ctx.drawImage(img, 0, 145, 122, 55, -size / 2, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);

        if (s.isEx) {
            this._tempColorConfig.colorCode = isBreak ? this.exColor.break : (isDouble ? this.exColor.double : this.exColor.tap);
            const ex = this.getMemoizedTintedImage("hold_ex", 0.6, this._tempColorConfig);
            this.ctx.drawImage(ex, 0, 0, 122, 55, -size / 2, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
            this.ctx.drawImage(ex, 0, 55, 122, 90, -size / 2, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
            this.ctx.drawImage(ex, 0, 145, 122, 55, -size / 2, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);
        }
        this.ctx.restore();
    }

    drawSlide(s) {
        const target = this.images[s.isBreak ? "slide_break" : (s.isDouble ? "slide_each" : "slide")];
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

    drawTag(tag) {
        const { ctx } = this;
        const { width: w, height: h } = this.getCanvasWH();
        const zoom = this.zoom || 1;
        const bs = this.settings.noteBaseSize;
        const lineWidth = bs * (tag.type === 'bpm' ? 6 : 4);

        ctx.save();
        ctx.lineWidth = 0.5;

        const tb1 = this.settings.tb1 || 4;
        const tb2 = this.settings.tb2 || 4;
        // period: 小節的長度 (tb1 代表一小節有幾個四分音符)
        const period = (tag.type === 'bpm') ? ((60 * tb1) / tag.value) : ((240 / tag.bpm) * (1 / tag.value));
        // beatPeriod: 格子線的間距 (tb2 代表幾分音符為一格)
        const beatPeriod = (tag.type === 'bpm') ? ((240 / tag.value) / tb2) : 0;
        const delta = tag.time - this.globalTime;

        if (period > 0) {
            // 1. 計算螢幕範圍內的索引
            let minI = Math.ceil((-h / zoom - delta) / period) - 1;
            let maxI = Math.floor((h / zoom - delta) / period);

            // 2. 邏輯約束：起點永遠從 0 開始
            minI = Math.max(0, minI);

            // 3. 【關鍵修復】：限制 BPM 的渲染終點
            if (tag.type === 'bpm') {
                // 如果你有計算 nextTime (下一個 BPM 變化的時間)
                if (tag.nextTime) {
                    const duration = tag.nextTime - tag.time;
                    // 算出在下一個標籤前，最多能畫幾條線 (減去極小值防止壓線重疊)
                    const maxLines = Math.floor((duration - 0.001) / period);
                    maxI = Math.min(maxI, maxLines);
                }
            } else {
                // Split 等標籤本來的邏輯
                maxI = Math.min(Math.floor(tag.renderTimes || 1) - 1, maxI);
            }

            for (let i = minI; i <= maxI; i++) {
                const y = (delta + i * period) * -zoom;

                if (tag.type === 'bpm') {
                    ctx.strokeStyle = '#ffe865c0';
                    ctx.setLineDash([]); // 樣式設定移到迴圈外，效能更好

                    // 自動填充小節內的拍號線(以 N 分音符為一拍)
                    const parts = (tb1 * tb2) / 4;
                    if (parts > 1) {
                        ctx.save();
                        ctx.strokeStyle = '#ffe86540'; // 較淡的顏色
                        ctx.lineWidth = 0.5; // 較細的線條
                        for (let b = 1; b < parts; b++) {
                            const subY = (delta + i * period + b * beatPeriod) * -zoom;

                            // 檢查是否超出下一個 BPM 的範圍 (防止畫出界)
                            const subTime = tag.time + i * period + b * beatPeriod;
                            if (tag.nextTime && subTime >= tag.nextTime - 0.001) continue;

                            ctx.beginPath();
                            ctx.moveTo(-lineWidth * 0.8, subY);
                            ctx.lineTo(lineWidth * 0.8, subY);
                            ctx.stroke();
                        }
                        ctx.restore();
                    }

                    // 僅在節拍線起點繪製文字
                    if (i === 0) {
                        ctx.save(); // 保存當前狀態
                        ctx.fillStyle = '#bdaa40';
                        ctx.font = "5px Arial";
                        ctx.textAlign = "left";

                        // 移動到繪製點並旋轉
                        ctx.translate(bs * -4 - 1.5, y - 1);
                        ctx.rotate(-Math.PI / 2);

                        ctx.fillText(tag.value.toString(), 0, 0);
                        ctx.restore(); // 自動還原所有 translate 與 rotate
                    }
                } else {
                    ctx.strokeStyle = '#ffffff';
                    if (i === 0) {
                        ctx.globalAlpha = 1; // 起點的線條保持不透明
                        ctx.save(); // 保存當前狀態
                        ctx.fillStyle = '#9c9c9c';
                        ctx.font = "5px Arial";
                        ctx.textAlign = "right";

                        // 移動到繪製點並旋轉
                        ctx.translate(bs * 4 + 1.5, y - 1);
                        ctx.rotate(Math.PI / 2);

                        ctx.fillText(tag.value.toString(), 0, 0);
                        ctx.restore(); // 自動還原所有 translate 與 rotate
                    } else {
                        ctx.globalAlpha = 0.4; // 非起點的線條降低透明度
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

    drawBackground(w, h) {
        const ctx = this.ctx;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "4px Arial";
        for (let i = 0; i < 8; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#555' : '#333';
            ctx.fillRect(visualNoteRefPos[i].x - this.settings.noteBaseSize / 2, -h, this.settings.noteBaseSize, h * 2);
            ctx.fillStyle = "gray";
            ctx.fillText(i + 1, visualNoteRefPos[i].x, h - 2);
        }
        ctx.restore();
    }

    render(isVisualMode, ensureVisualEditorContext, state) {
        if (!isVisualMode || this.canvas.style.display === 'none') return;
        const ctx = this.ctx/* || (typeof ensureVisualEditorContext === 'function' ? ensureVisualEditorContext() : null)*/;
        if (!ctx) return;

        const { width: w, height: h } = this.getCanvasWH();
        if (w <= 0 || h <= 0) return;
        this._state = state;
        const { globalTime, visualBuckets, audioBuffer, tags, offset } = this._state;
        this.globalTime = globalTime;
        this.tags = tags;

        ctx.clearRect(-w, -h, w * 2, h * 2);
        this.drawBackground(w, h);
        this.drawAudioWaveform(audioBuffer, offset);
        visualBuckets.tags.forEach(t => this.drawTag(t));
        ctx.strokeStyle = '#ff0000ce';
        ctx.beginPath();
        ctx.moveTo(-w, 0);
        ctx.lineTo(w, 0);
        ctx.stroke();
        visualBuckets.slide.forEach(n => this.drawSlide(n));
        visualBuckets.tapnhold.forEach(n => {
            if (n.type === "hold") this.drawHold(n);
            else if (n.isStar) this.drawStar(n);
            else this.drawTap(n);
        });
        visualBuckets.touch.forEach(n => this.drawTouch(n));

        // 繪製 Ghost Note 預覽
        if (this.hoverLane !== null && this.quantizeTime) {
            const snappedTime = this.quantizeTime(this.globalTime - this.mouseY / this.zoom);
            if (snappedTime !== null && snappedTime !== undefined) {
                const t = snappedTime - this.globalTime;
                const img = this.images["tap"];
                if (img && !imgNotExists(img)) {
                    const size = this.settings.noteBaseSize;
                    ctx.save();
                    ctx.translate(visualNoteRefPos[this.hoverLane - 1].x, t * -this.zoom);
                    ctx.globalAlpha = 0.45;
                    this.drawImgAtcenter(img, size);
                    ctx.restore();
                }
            }
        }

        // this._drawMarker();
    }

    _upd() {
        this.render(true, null, this._state);
    }

    _updMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // 1. 取得相對於畫布左上角的「物理像素」座標
        const physicalX = (e.clientX - rect.left) * dpr;
        const physicalY = (e.clientY - rect.top) * dpr;

        // 2. 取得畫布目前的物理寬高
        const w = this.canvas.width;
        const h = this.canvas.height;

        // 3. 計算與渲染器一致的縮放比例 p[cite: 2, 3]
        // 渲染器使用的是：p = Math.min(w, h) / scaleBase
        const p = Math.min(w, h) / scaleBase;

        // 4. 逆向轉換：(物理座標 - 畫布中心) / 縮放比例
        this.mouseX = (physicalX - w / 2) / p;
        this.mouseY = (physicalY - h / 2) / p;
    }

    _drawMarker() {
        const ctx = this.ctx;
        // 使用 settings 中的 noteBaseSize 作為方塊大小[cite: 2]
        const size = this.settings.noteBaseSize;

        ctx.save();
        ctx.globalAlpha = 0.6;
        // 根據按下狀態切換顏色
        ctx.fillStyle = this.markerPressed ? this.markerColors.pressed : this.markerColors.normal;

        ctx.translate(this.mouseX, this.mouseY);
        // 繪製中心對齊的方塊
        ctx.fillRect(-size / 2, -size / 2, size, size);

        // 加入邊框增加辨識度
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        ctx.restore();
    }

    _onContextMenu(e) {
        e.preventDefault();
    }

    _onPointerDown(e) {
        this._updMousePos(e);
        const clickedNote = this._hitTestNote(this.mouseX, this.mouseY);
        const lane = this._hitTestLane(this.mouseX);

        if (e.button === 0) { // 左鍵
            this.markerPressed = true;
            if (clickedNote !== null) {
                e.stopPropagation();
                if (this.onChangeNote) {
                    this.onChangeNote(clickedNote);
                }
            } else if (lane !== null) {
                e.stopPropagation();
                const clickTime = this.globalTime - this.mouseY / this.zoom;
                if (this.onPlaceNote) {
                    this.onPlaceNote(lane, clickTime);
                }
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

        if (!this._isLoopActive()) {
            this._upd();
        }
    }

    _onPointerUp(e) {
        if (e.button === 0) {
            this.markerPressed = false;
        }

        if (!this._isLoopActive()) {
            this._upd();
        }
    }

    _onPointerLeave() {
        this.markerPressed = false;
        this.hoverLane = null;
        this.canvas.style.cursor = 'grab';
        if (!this._isLoopActive()) {
            this._upd();
        }
    }

    _onPointerMove(e) {
        this._updMousePos(e);
        this.markerX = this.mouseX;

        this.hoverLane = this._hitTestLane(this.mouseX);

        // 如果懸停在有效音軌上，顯示 crosshair 代表可以點擊編輯，否則顯示 grab 代表拖拽滾動
        if (this.hoverLane !== null) {
            this.canvas.style.cursor = 'crosshair';
        } else {
            this.canvas.style.cursor = 'grab';
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
    }

    setZoom(zoom) {
        this.zoom = zoom;
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
        const { width: w, height: h, halfWidth: hw } = this.getCanvasWH();
        const zoom = this.zoom || 1;
        const bs = this.settings.noteBaseSize;
        //const lineWidth = bs * (tag.type === 'bpm' ? 6 : 4);

        ctx.save();

        const tb1 = this.settings.tb1 || 4;
        const tb2 = this.settings.tb2 || 4;
        const period = (tag.type === 'bpm') ? ((60 * tb1) / tag.value) : ((240 / tag.bpm) * (1 / tag.value));
        const beatPeriod = (tag.type === 'bpm') ? ((240 / tag.value) / tb2) : 0;
        const delta = tag.time - this.globalTime;

        if (period > 0) {
            // 1. 計算螢幕範圍內的索引
            let minI = Math.ceil((-hw / zoom - delta) / period) - 1;
            let maxI = Math.floor((hw / zoom - delta) / period);

            // 2. 邏輯約束：起點永遠從 0 開始
            minI = Math.max(0, minI);

            // 3. 【關鍵修復】：限制 BPM 的渲染終點
            if (tag.type === 'bpm') {
                // 如果你有計算 nextTime (下一個 BPM 變化的時間)
                if (tag.nextTime) {
                    const duration = tag.nextTime - tag.time;
                    // 算出在下一個標籤前，最多能畫幾條線 (減去極小值防止壓線重疊)
                    const maxLines = Math.floor((duration - 0.001) / period);
                    maxI = Math.min(maxI, maxLines);
                }
            } else {
                // Split 等標籤本來的邏輯
                maxI = Math.min(Math.floor(tag.renderTimes || 1) - 1, maxI);
            }
            maxI = minI + Math.min(maxI - minI, this.RENDER_LIMET);

            for (let i = minI; i <= maxI; i++) {
                const posx = (delta + i * period) * zoom + hw;

                if (tag.type === 'bpm') {
                    ctx.strokeStyle = 'rgb(255, 217, 0)';
                    ctx.lineWidth = 2;

                    const parts = (tb1 * tb2) / 4;
                    if (parts > 1) {
                        ctx.save();
                        ctx.strokeStyle = 'rgba(255, 217, 0, 0.4)';
                        ctx.lineWidth = 1;
                        for (let b = 1; b < parts; b++) {
                            const subTime = tag.time + i * period + b * beatPeriod;
                            if (tag.nextTime && subTime >= tag.nextTime - 0.001) continue;
                            const subPosX = (delta + i * period + b * beatPeriod) * zoom + hw;
                            ctx.beginPath();
                            ctx.moveTo(subPosX, 0);
                            ctx.lineTo(subPosX, h);
                            ctx.stroke();
                        }
                        ctx.restore();
                    }
                } else {
                    ctx.lineWidth = 1;
                    if (i === 0) {
                        ctx.strokeStyle = '#ffffff';
                    } else {
                        ctx.strokeStyle = 'rgb(128, 128, 128)';
                    }
                }

                ctx.beginPath();
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

        ctx.save();

        ctx.translate(this.hw + t * this.zoom, y);
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
        ctx.lineWidth = size * 0.35;
        ctx.strokeStyle = isMine ? this.color.mine : (isBreak ? this.color.break : (isDouble ? this.color.double : this.color.tap));
        ctx.stroke();
        ctx.restore();
    }

    drawStar(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine } = s;
        const t = (noteTime - this.globalTime);
        const ctx = this.ctx;

        const size = this.noteBaseSize * this.h * 0.9;
        const y = (pos - 0.5) / 8 * this.h;

        ctx.save();

        ctx.translate(this.hw + t * this.zoom, y);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const angle = (i * Math.PI) / 5 - Math.PI / 2;
            // 外徑 R 與 內徑 r
            const r = (i % 2 === 0) ? size : size * 0.4;

            const px = Math.cos(angle) * r;
            const py = Math.sin(angle) * r;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.lineWidth = size * 0.35;
        ctx.strokeStyle = isMine ? this.color.mine : (isBreak ? this.color.break : (isDouble ? this.color.double : this.color.star));
        ctx.stroke();
        ctx.restore();
    }

    drawHold(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine, holdDuration } = s;
        const ctx = this.ctx;
        const t = (noteTime - this.globalTime);

        const size = this.settings.noteBaseSize * this.h * 0.01;
        const y = (pos - 0.5) / 8 * this.h;

        ctx.save();
        ctx.translate(this.hw + t * this.zoom, y);

        // 4. 繪製正六角形
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            // i * (Math.PI / 3) 產生六個頂點
            // 加上 Math.PI / 6 的偏移可以讓「平邊」朝上，視覺上更像 maimai 的 Hold 頭
            const angle = i * (Math.PI / 3);

            const of = !(i < 5 && i > 1) ? holdDuration : 0;

            const px = Math.cos(angle) * size * 0.5 + of * this.zoom;
            const py = Math.sin(angle) * size * 0.5;

            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.lineWidth = size * 0.35;
        ctx.strokeStyle = isMine ? this.color.mine : (isBreak ? this.color.break : (isDouble ? this.color.double : this.color.tap));
        ctx.stroke();

        ctx.restore();
    }

    drawSlide(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMine, slideDelay, slideDuration } = s;
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
                // 從左到右透明度由 1.0 降至 0.0
                this.ctx.globalAlpha = 1 - (x / width);
                // 繪製 1px 寬的垂直色條
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

        // 取得音訊資料
        const channelData = audioBuffer.getChannelData ? audioBuffer.getChannelData(0) : (audioBuffer.data || audioBuffer);
        const sampleRate = audioBuffer.sampleRate || 44100;
        if (!channelData || channelData.length === 0) return;

        const zoom = this.zoom || 200;
        const gt = this.globalTime + offset;
        const totalSamples = channelData.length;

        // 參數設定：波形高度佔畫布的比例與增益
        const waveMaxHeight = h * (this.settings.audioWaveformHeightRatio || 0.4);
        const audioAmp = this.settings.audioAmp || 1.0;

        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(136, 136, 136, 0.2)'; // 灰色波形

        /**
         * 【防止跳動關鍵 1】：格點化時間步進
         * 1 像素代表的時間長度
         */
        const timePerPixel = 1 / zoom;
        // 算出畫布最左側 (x=0) 對應的絕對時間
        const leftTime = gt - (hw / zoom);

        // 子像素位移：消除當 gt 變化時造成的物理位移抖動
        const subPixelOffset = (leftTime % timePerPixel) * zoom;

        /**
         * 【防止跳動關鍵 2】：以像素格點為基準循環
         * 為了覆蓋邊緣，從 -1 畫到 w + 1
         */
        for (let x = -1; x <= w + 1; x++) {
            // 計算這行像素對應的穩定絕對時間點
            const pixelTime = Math.floor(leftTime / timePerPixel) * timePerPixel + (x * timePerPixel);

            let startIdx = Math.floor(pixelTime * sampleRate);
            let endIdx = Math.floor((pixelTime + timePerPixel) * sampleRate);

            // 範圍檢查
            if (endIdx <= 0 || startIdx >= totalSamples) continue;
            startIdx = Math.max(0, startIdx);
            endIdx = Math.min(totalSamples, endIdx);

            // 穩定 Peak 偵測：取區間內最大振幅
            let peak = 0;
            if (endIdx - startIdx <= 1) {
                peak = Math.abs(channelData[startIdx] || 0);
            } else {
                for (let i = startIdx; i < endIdx; i++) {
                    const v = Math.abs(channelData[i]);
                    if (v > peak) peak = v;
                }
            }

            const amp = Math.min(1, peak * audioAmp);
            const pxH = amp * waveMaxHeight;

            // 計算最終繪製的 X 座標 (扣除子像素位移)
            const drawX = x - subPixelOffset;

            // 在中心線 hh 上下繪製垂直線
            ctx.beginPath();
            ctx.moveTo(drawX, hh - pxH);
            ctx.lineTo(drawX, hh + pxH);
            ctx.stroke();
        }

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
        this.drawAudioWaveform(audioBuffer, offset);
        visualBuckets.tags.forEach(t => this.drawTag(t));
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
