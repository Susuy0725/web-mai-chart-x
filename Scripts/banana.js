class BananaEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.gravity = 0.42;
        this.baseSize = 64;

        // 預先配置固定記憶體，最多允許 5000 隻香蕉同時在線
        this.maxBananas = 5000;
        this.count = 0;
        this.DEG2RAD = Math.PI / 180;

        // 每個香蕉佔用 7 個欄位: x, y, vx, vy, rotation, size, life
        this.stride = 7;
        this.data = new Float32Array(this.maxBananas * this.stride);

        // 建立離屏快取
        this.spriteCanvas = document.createElement("canvas");
        this.spriteCanvas.width = this.baseSize;
        this.spriteCanvas.height = this.baseSize;
        this.initSprite();
    }

    initSprite() {
        const sCtx = this.spriteCanvas.getContext("2d");
        sCtx.font = `${this.baseSize * 0.8}px serif`;
        sCtx.textAlign = "center";
        sCtx.textBaseline = "middle";
        sCtx.fillText("🍌", this.baseSize / 2, this.baseSize / 2);
    }

    spawn(x, y) {
        // 如果超過最大上限，就不再產生，保護記憶體不越界
        if (this.count >= this.maxBananas) return;

        const offset = this.count * this.stride;
        const size = 20 + Math.random() * 32;

        this.data[offset + 0] = x;                                // x
        this.data[offset + 1] = y;                                // y
        this.data[offset + 2] = (Math.random() - 0.5) * 30;       // vx
        this.data[offset + 3] = Math.random() * -12;               // vy
        this.data[offset + 4] = Math.random() * 360;              // rotation
        this.data[offset + 5] = size;                             // size
        this.data[offset + 6] = 100 + Math.random() * 150;                              // life

        this.count++;
    }

    update() {
        const h = this.canvas.height;
        let i = 0;

        // 使用單個指標進行 In-place 覆寫，免去 filter 產生的陣列重組
        while (i < this.count) {
            const offset = i * this.stride;

            // 物理運動計算
            this.data[offset + 0] += this.data[offset + 2]; // x += vx
            this.data[offset + 1] += this.data[offset + 3]; // y += vy
            this.data[offset + 3] += this.gravity;          // vy += gravity
            this.data[offset + 4] += this.data[offset + 2] * 2; // rotation += vx * 2
            this.data[offset + 6]--;                        // life--

            // 邊界彈跳
            const ground = h - this.data[offset + 5] / 2;
            if (this.data[offset + 1] > ground) {
                this.data[offset + 1] = ground;
                this.data[offset + 3] *= -0.7; // vy
                this.data[offset + 2] *= 0.9;  // vx
            }

            // 如果生命結束，將最尾端的香蕉資料覆蓋到目前位置，並縮減總數
            if (this.data[offset + 6] <= 0) {
                if (i !== this.count - 1) {
                    const lastOffset = (this.count - 1) * this.stride;
                    this.data.set(this.data.subarray(lastOffset, lastOffset + this.stride), offset);
                }
                this.count--;
                // 注意：這裡不需要 i++，因為當前位置已經換成了新的未處理資料
            } else {
                i++;
            }
        }
    }

    draw(ctx) {
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. 渲染香蕉（移除 save/restore，改用直接矩陣覆寫）
        for (let i = 0; i < this.count; i++) {
            const offset = i * this.stride;
            const x = this.data[offset + 0];
            const y = this.data[offset + 1];
            const rot = this.data[offset + 4];
            const size = this.data[offset + 5];
            const life = this.data[offset + 6];

            // 修正：確保透明度不會大於 1.0 (當生命值 > 100 時)
            ctx.globalAlpha = Math.min(1.0, life / 100);
            const r = rot * this.DEG2RAD;
            const cos = Math.cos(r);
            const sin = Math.sin(r);

            ctx.setTransform(
                cos,
                sin,
                -sin,
                cos,
                x,
                y
            );

            ctx.drawImage(this.spriteCanvas, -size / 2, -size / 2, size, size);
        }

        // 2. 還原全域矩陣並渲染 UI 計數器
        ctx.resetTransform();
        ctx.globalAlpha = 1.0;

        ctx.save();
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 8;
        ctx.strokeText(`Bananas: ${this.count}`, this.canvas.width / 2, 50);
        ctx.fillText(`Bananas: ${this.count}`, this.canvas.width / 2, 50);
        ctx.restore();
    }
}

// 建立畫布與初始化
const canvas = document.createElement("canvas");
Object.assign(canvas.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '99999999',
    userSelect: 'none',
    pointerEvents: 'none'
});
document.body.appendChild(canvas);

const ctx = canvas.getContext("2d");
const engine = new BananaEngine(canvas);

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

window.addEventListener("mousemove", (e) => {
    if (Math.random() > 0.7) {
        engine.spawn(e.clientX, e.clientY);
    }
});

window.addEventListener("click", (e) => {
    let superSpawn = Math.random() > 0.75;
    let t = superSpawn ? 1000 : 20 + Math.random() * 30;
    for (let i = 0; i < t; i++) {
        engine.spawn(e.clientX, e.clientY);
    }
});

function loop() {
    engine.update();
    engine.draw(ctx);
    requestAnimationFrame(loop);
}

loop();