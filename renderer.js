import {
    scaleBase,
    innerCirleBase,
    noteRefPos,
    touchRefPos,
    imgNotExists,
    getTintedImage,
    generatePath,
    touchPaths,
    wSlideRatio
} from './helper.js';

export class SimaiRenderer {
    constructor(canvas, settings) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.settings = settings;
        this.images = null;
        this.globalTime = 0;

        // EX 顏色定義
        this.exColor = {
            tap: '#D8A2C9',
            star: '#00DBF4',
            double: '#DCDA6B',
            break: '#EBBA63',
        };
    }

    setImages(images) {
        this.images = images;
    }

    setContext(ctx) {
        this.ctx = ctx;
    }

    // --- 核心工具函式 ---

    drawImgAtcenter(img, size, offsetX = 0, offsetY = 0, imgWidthMul = 1, imgHeightMul = 1) {
        this.ctx.drawImage(
            img,
            -size / 2 * imgWidthMul + offsetX,
            -size / 2 * imgHeightMul + offsetY,
            size * imgWidthMul,
            size * imgHeightMul
        );
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
        const decayAlpha = 1 - Math.max(0, -t);
        const radius = 0.8 * this.settings.noteBaseSize * (1 - decayAlpha);

        this.ctx.strokeStyle = `rgba(255, 200, 0, ${0.8 * decayAlpha})`;
        this.ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();
    }

    simpleHanabi(noteT, isCenter) {
        const t = noteT / (2 * this.settings.effectDecayTime);
        if (t < -1) return;
        const ease = (x) => 1 - Math.pow(1 - x, 2);
        const decayAlpha = 1 - Math.max(0, -t);
        const radius = (2 + isCenter * 2) * this.settings.noteBaseSize * ease(1 - decayAlpha);

        this.ctx.strokeStyle = `rgba(255, 200, 0, ${0.8 * decayAlpha})`;
        this.ctx.lineWidth = 0.5 * this.settings.noteBaseSize * decayAlpha;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
        this.ctx.stroke();
    }

    // --- 渲染流程 ---

    drawFrame(state) {
        const { ctx } = this;
        const { globalTime, buckets, dt, showSensor } = state;
        this.globalTime = globalTime;

        if (!this.images) return;

        // 1. 清除畫布
        ctx.clearRect(-this.canvas.width, -this.canvas.height, this.canvas.width * 2, this.canvas.height * 2);

        // 2. 基礎 UI
        this.drawUI(dt, globalTime);
        this.drawStaticBackground();

        // 3. 傳感器
        if (showSensor) this.drawSensors();

        this.drawMiddleDisplay();

        // 4. 桶子繪製 (順序由下而上)
        buckets.slide.forEach(n => this.drawSlide(n));
        buckets.tapnhold.forEach(n => {
            if (n.type === "hold") this.drawHold(n);
            else if (n.isStar) this.drawStar(n);
            else this.drawTap(n);
        });
        buckets.touch.forEach(n => this.drawTouch(n));
    }

    drawUI(dt, globalTime) {
        const { ctx } = this;
        ctx.save();
        ctx.font = "2px Arial";
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(`FPS: ${dt === 0 ? 'N/A' : (1 / dt).toFixed(2)}`, -scaleBase / 2, -scaleBase / 2);
        ctx.fillText(`Time: ${globalTime.toFixed(2)}s`, -scaleBase / 2, -scaleBase / 2 + 4);
        ctx.restore();
    }

    drawStaticBackground() {
        const { ctx } = this;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(0, 0, scaleBase / 2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'white';
        ctx.beginPath();
        ctx.arc(0, 0, innerCirleBase, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    drawMiddleDisplay() {
        const { ctx } = this;
        ctx.save();
        function outlineText(text, x, y, fontSize, outlinePx) {
            ctx.lineWidth = outlinePx;
            ctx.font = `bold ${fontSize}px combo`;
            ctx.strokeText(text, x, y);
            ctx.fillText(text, x, y);
        }
        switch (this.settings.middleDisplay) {
            case 1:
                if (this.settings.play_combo != 0) {
                    ctx.fillStyle = "#FF569B";
                    ctx.strokeStyle = "white";
                    ctx.lineWidth = 2;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.letterSpacing = "0px";
                    outlineText("COMBO", 0, -7, 4.4, 0.5);
                    ctx.letterSpacing = "0.5px";
                    outlineText(`${this.settings.play_combo}`, 0, 0, 7.4, 0.5);
                }
                ctx.letterSpacing = "0px";
                break;
            case 2:
                const trueScore = Math.round(Math.max(this.settings.play_score, 0));
                // use gamma correction for more natural progression
                ctx.fillStyle = adjustBrightness("#498BFF", (1 - this.settings.backgroundDarkness) ** 0.45);
                if (trueScore > 800000) {
                    ctx.fillStyle = adjustBrightness("#FF6353", (1 - this.settings.backgroundDarkness) ** 0.45);
                }
                if (trueScore > 1000000) {
                    ctx.fillStyle = adjustBrightness("#FFD559", (1 - this.settings.backgroundDarkness) ** 0.45);
                }
                ctx.strokeStyle = "white";
                ctx.lineWidth = Math.floor(hbw * 0.015);
                ctx.textAlign = "left";
                ctx.letterSpacing = "0px";
                ctx.font = "bold " + Math.floor(hbw * 0.13) + "px combo"
                ctx.strokeText(`${((trueScore / 10000) % 1).toFixed(4).slice(1, 6)}`, hw - hbw * 0.085, hh + hbw * 0.06);
                ctx.fillText(`${((trueScore / 10000) % 1).toFixed(4).slice(1, 6)}`, hw - hbw * 0.085, hh + hbw * 0.06);
                const lastScoreL = ctx.measureText(`${((trueScore / 10000) % 1).toFixed(4).slice(2, 6)}`).width;
                ctx.font = "bold " + Math.floor(hbw * 0.1) + "px combo"
                ctx.strokeText(`%`, hw - hbw * 0.045 + lastScoreL, hh + hbw * 0.06);
                ctx.fillText(`%`, hw - hbw * 0.045 + lastScoreL, hh + hbw * 0.06);
                ctx.textAlign = "right";
                ctx.letterSpacing = Math.floor(hbw * 0.01) + "px";
                ctx.font = "bold " + Math.floor(hbw * 0.18) + "px combo"
                ctx.strokeText(`${Math.floor(trueScore / 10000)}`, hw - hbw * 0.075, hh + hbw * 0.06);
                ctx.fillText(`${Math.floor(trueScore / 10000)}`, hw - hbw * 0.075, hh + hbw * 0.06);
                break;
            default:
                break;
        }
        ctx.restore();
    }

    drawSensors() {
        const { ctx } = this;
        ctx.save();
        touchPaths.forEach(shape => {
            if (shape.type === 'D' || shape.type === 'C1' || shape.type === 'C2') return; // 目前不繪製 D 區域和 A 區域
            ctx.strokeStyle = '#ffffff80';
            ctx.lineWidth = 0.3;
            if (shape.type === 'A') { ctx.lineWidth = 0.4; ctx.setLineDash([0.2, 0.8]); }
            else ctx.setLineDash([]);
            ctx.stroke(shape.path);
        });
        ctx.restore();
    }

    drawTap(s) {
        const { time: noteTime, pos, isBreak, isDouble } = s;
        const noteT = (noteTime - this.globalTime);
        const progress = noteT * (this.settings.speed * 0.8833 + 0.8167);
        const t = 1 - this.timeFunction(progress);

        const img = this.images[isBreak ? "tap_break" : (isDouble ? "tap_each" : "tap")];
        if (imgNotExists(img)) return;

        const posInfo = noteRefPos[pos - 1];
        this.ctx.save();

        if (t >= 1) {
            this.ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(noteT);
        } else {
            const displayT = Math.max(this.settings.middleDistance, t);
            const currentScale = t < this.settings.middleDistance ? (t + 0.9) / (0.9 + this.settings.middleDistance) : 1;
            const size = this.settings.noteBaseSize * currentScale;

            const arcimg = this.images[isBreak ? "BreakArc" : (isDouble ? "EachArc" : "NormalArc")];
            this.ctx.save();
            this.ctx.rotate(posInfo.rot);
            this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
            this.ctx.restore();

            this.ctx.save();
            this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
            this.ctx.rotate(posInfo.rot);
            this.drawImgAtcenter(img, size);
            if (s.isEx) {
                const ex = getTintedImage(this.images["tap_ex"], 0.5, { colorCode: this.exColor[isBreak ? "break" : (isDouble ? "double" : "tap")] });
                this.drawImgAtcenter(ex, size);
            }
            this.ctx.restore();
        }
        this.ctx.restore();
    }

    drawStar(s) {
        const { time: noteTime, pos, isBreak, isDouble, isMultiple } = s;
        const noteT = (noteTime - this.globalTime);
        const t = 1 - this.timeFunction(noteT * (this.settings.speed * 0.8833 + 0.8167));

        const img = this.images[isMultiple ? (isBreak ? "star_break_double" : (isDouble ? "star_each_double" : "star_double"))
            : (isBreak ? "star_break" : (isDouble ? "star_each" : "star"))
        ];
        if (imgNotExists(img)) return;

        const posInfo = noteRefPos[pos - 1];
        this.ctx.save();

        if (t >= 1) {
            this.ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(noteT);
        } else {
            const displayT = Math.max(this.settings.middleDistance, t);
            const size = this.settings.noteBaseSize * (t < this.settings.middleDistance ? (t + 0.9) / (0.9 + this.settings.middleDistance) : 1);

            this.ctx.save();
            const arcimg = this.images[isBreak ? "BreakArc" : (isDouble ? "EachArc" : "SlideArc")];
            this.ctx.rotate(posInfo.rot);
            this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
            this.ctx.restore();

            this.ctx.save();
            this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
            this.ctx.rotate(posInfo.rot);
            this.drawImgAtcenter(img, size);
            if (s.isEx) {
                const ex = getTintedImage(this.images[isMultiple ? "star_ex_double" : "star_ex"], 0.5, { colorCode: this.exColor[isBreak ? "break" : (isDouble ? "double" : "star")] });
                this.drawImgAtcenter(ex, size * 0.95);
            }
            this.ctx.restore();
        }
        this.ctx.restore();
    }

    drawHold(s) {
        const { time: noteTime, pos, isBreak, isDouble, holdDuration } = s;
        const noteT = (noteTime - this.globalTime);
        const t = 1 - this.timeFunction(noteT * (this.settings.speed * 0.8833 + 0.8167));
        const posInfo = noteRefPos[pos - 1];

        if (-noteT >= holdDuration) {
            this.ctx.save();
            this.ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(holdDuration + noteT);
            this.ctx.restore();
        } else {
            const img = this.images[isBreak ? "hold_break" : (isDouble ? "hold_each" : "hold")];
            if (imgNotExists(img)) return;

            const t1 = 1 - this.timeFunction((noteTime - this.globalTime + holdDuration) * (this.settings.speed * 0.8833 + 0.8167));
            const displayT = Math.min(1, Math.max(this.settings.middleDistance, t));
            const size = this.settings.noteBaseSize * (t < this.settings.middleDistance ? (t + 0.9) / (0.9 + this.settings.middleDistance) : 1);
            const sizeOffset = t < this.settings.middleDistance ? 0 :
                Math.min((holdDuration + noteT) * 0.9 * (this.settings.speed * 0.8833 + 0.8167),
                    Math.min((1 - this.settings.middleDistance) * 2.45,
                        Math.min((t - this.settings.middleDistance) * 2.45,
                            holdDuration * 0.9 * (this.settings.speed * 0.8833 + 0.8167))));

            this.ctx.save();
            const arcimg = this.images[isBreak ? "BreakArc" : (isDouble ? "EachArc" : "NormalArc")];
            this.ctx.rotate(posInfo.rot);
            this.drawImgAtcenter(arcimg, displayT * innerCirleBase * 2.25);
            this.ctx.restore();

            if (t1 > this.settings.middleDistance) {
                this.ctx.save();
                const endimg = this.images[isBreak ? "Hold_Break_End" : (isDouble ? "Hold_Each_End" : "Hold_End")];
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
                const ex = getTintedImage(this.images["hold_ex"], 0.5, { colorCode: isBreak ? this.exColor.break : (isDouble ? this.exColor.double : this.exColor.tap) });
                this.ctx.drawImage(ex, 0, 0, 122, 55, -size / 2, -size * 1.64 * 0.35, size, size * 1.64 * 0.275);
                this.ctx.drawImage(ex, 0, 55, 122, 90, -size / 2, -size * 1.64 * 0.0785, size, size * 1.64 * (0.17 + sizeOffset));
                this.ctx.drawImage(ex, 0, 145, 122, 55, -size / 2, size * 1.64 * (0.09 + sizeOffset), size, size * 1.64 * 0.275);
            }
            this.ctx.restore();

            this.ctx.save();
            this.ctx.translate(posInfo.x * displayT, posInfo.y * displayT);
            this.simpleHitEffect(noteT);
            this.ctx.restore();
        }
    }

    drawTouch(s) {
        const { time: noteTime, pos, touchPos, isDouble, holdDuration } = s;
        const noteT = (noteTime - this.globalTime);
        const t = 1 - this.timeFunction(noteT * (this.settings.touchSpeed * 0.8833 + 0.8167));
        const posInfo = touchRefPos[touchPos][touchPos === "C" ? 0 : pos - 1];

        if (holdDuration) {
            const imgs = [];
            for (let i = 0; i < 4; i++) {
                const img = this.images["touchhold_" + i];
                if (imgNotExists(img)) return;
                imgs.push(img);
            }
            const touchPoint = this.images[isDouble ? "touch_point_each" : "touch_point"];
            const touchBorder = this.images.touchhold_border;

            this.ctx.save();
            if (-noteT >= holdDuration) {
                this.ctx.translate(posInfo.x, posInfo.y);
                this.simpleHitEffect(holdDuration + noteT);
                if (s.isHanabi) this.simpleHanabi(holdDuration + noteT, s.touchPos === "C");
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
                this.ctx.rotate(Math.PI * -0.75);
                this.ctx.globalAlpha = Math.max(0, 1 - (1 - Math.min(1, t)) * 0.55);
                for (let i = 0; i < 4; i++) {
                    this.ctx.drawImage(imgs[i], -size * 1.365 * 0.5, size * 0.15 * (a - 1.5), size * 1.365, size);
                    this.ctx.rotate(Math.PI / 2);
                }
                this.ctx.globalAlpha = 1;
                this.drawImgAtcenter(touchPoint, size * 0.4);
                this.simpleHitEffect(noteT);
            }
            this.ctx.restore();
            return;
        }

        const img = this.images[isDouble ? "touch_each" : "touch"];
        const touchPoint = this.images[isDouble ? "touch_point_each" : "touch_point"];
        if (imgNotExists(img)) return;

        this.ctx.save();
        if (t >= 1) {
            this.ctx.translate(posInfo.x, posInfo.y);
            this.simpleHitEffect(noteT);
            if (s.isHanabi) this.simpleHanabi(noteT, s.touchPos === "C");
        } else {
            const size = this.settings.noteBaseSize * 0.7;
            const a = this.touchTimeFunction(18 * (1 - t) / 1.5) * 1.6;

            this.ctx.translate(posInfo.x, posInfo.y);
            this.ctx.globalAlpha = Math.max(0, 1 - (1 - t) * 0.55);
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
        const prefix = s.isBreak ? "wifi_break_" : (s.isDouble ? "wifi_each_" : "wifi_");
        const standardKey = s.isBreak ? "slide_break" : (s.isDouble ? "slide_each" : "slide");

        const imgs = [];
        if (s.slideType === "w") {
            for (let i = 0; i < 11; i++) {
                const target = this.images[prefix + i];
                if (imgNotExists(target)) return;
                imgs.push(target);
            }
        } else {
            const target = this.images[standardKey];
            if (imgNotExists(target)) return;
            imgs.push(target);
        }

        const { time: noteTime, pos, slideEnd, slideDelay, slideDuration, path } = s;
        const noteT = noteTime - this.globalTime;
        const t = 1 - this.timeFunction(noteT * (this.settings.speed * 0.8833 + 0.8167));
        const p = path || generatePath(pos, slideEnd);
        if (p.totalLength < 1e-4) return;

        this.ctx.save();
        const isTaped = -noteT > 0;
        this.ctx.globalAlpha = isTaped ? 1 : 0.6 * ((t - this.settings.middleDistance) / (1 - this.settings.middleDistance));

        let slideProgress = 0;
        if (-noteT > slideDelay) {
            slideProgress = Math.min(1, (-noteT - slideDelay) / slideDuration);
        }

        this.drawPathWithArrows(p, slideProgress, imgs, s.slideType === "w");

        const sz = Math.min(1, 1 - (noteT + slideDelay) / slideDelay);
        if (noteT <= 0 && slideProgress < 1) {
            if (!s.hideHead || sz >= 1) {
                const { x, y, rot } = p.getPointAt(slideProgress);
                this.ctx.save();
                this.ctx.globalAlpha = slideDelay < 1e-4 ? 1 : sz;
                this.ctx.translate(x, y);
                this.ctx.rotate(rot + Math.PI * 0.5);
                const starImg = this.images[s.isBreak ? "star_break" : (s.isDouble ? "star_each" : "star")];
                this.drawImgAtcenter(starImg, this.settings.noteBaseSize * sz * 1.45);
                this.ctx.restore();
            }
        }
        this.ctx.restore();
    }

    drawPathWithArrows(recorder, starProgress, imgs, typew, config = { spacing: 4.36 }) {
        const arrowCount = typew ? 12 : Math.floor((recorder.totalLength - 1) / config.spacing);
        const spacing = typew ? 7 : config.spacing;

        this.ctx.save();
        for (let i = arrowCount; i > Math.floor(starProgress * arrowCount); i--) {
            const imgIndex = Math.min(i - 1, imgs.length - 1);
            const img = typew ? imgs[imgIndex] : imgs[0];
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
}