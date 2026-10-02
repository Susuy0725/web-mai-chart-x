class BananaEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.gravity = 0.42;
        this.baseSize = 64;

        this.maxBananas = 5000;
        this.count = 0;
        this.DEG2RAD = Math.PI / 180;

        // 7 個欄位: x, y, vx, vy, rotation, size, life
        this.stride = 7;
        this.data = new Float32Array(this.maxBananas * this.stride);

        // --- 空間網格（Spatial Grid）配置 ---
        // 格子大小設為最大香蕉直徑略大一點（size 最大約 52，設 64 剛好）
        this.cellSize = 64;
        this.grid = new Map();

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
        if (this.count >= this.maxBananas) return;

        const offset = this.count * this.stride;
        const size = 20 + Math.random() * 32;

        this.data[offset + 0] = x;
        this.data[offset + 1] = y;
        this.data[offset + 2] = (Math.random() - 0.5) * 30;
        this.data[offset + 3] = Math.random() * -12;
        this.data[offset + 4] = Math.random() * 360;
        this.data[offset + 5] = size;
        this.data[offset + 6] = 100 + Math.random() * 150;

        this.count++;
    }

    // 處理香蕉與香蕉的彈性碰撞
    resolveCollisions() {
        const cellSize = this.cellSize;
        const grid = this.grid;
        grid.clear();

        // 1. 將每隻香蕉註冊進網格
        for (let i = 0; i < this.count; i++) {
            const off = i * this.stride;
            const cx = Math.floor(this.data[off + 0] / cellSize);
            const cy = Math.floor(this.data[off + 1] / cellSize);
            const key = `\({cx},\){cy}`;

            let cell = grid.get(key);
            if (!cell) {
                cell = [];
                grid.set(key, cell);
            }
            cell.push(i);
        }

        // 2. 檢測同格與相鄰格碰撞（只比對 4 個方向避免重複算兩次）
        const neighborOffsets = [
            [0, 0], [1, 0], [0, 1], [1, 1], [-1, 1]
        ];

        for (const [key, cell] of grid.entries()) {
            const [cx, cy] = key.split(",").map(Number);

            for (let n = 0; n < neighborOffsets.length; n++) {
                const nx = cx + neighborOffsets[n][0];
                const ny = cy + neighborOffsets[n][1];
                const otherCell = grid.get(`\({nx},\){ny}`);
                if (!otherCell) continue;

                const isSameCell = (n === 0);

                for (let a = 0; a < cell.length; a++) {
                    const i = cell[a];
                    const offA = i * this.stride;
                    const rA = this.data[offA + 5] * 0.42; // 用半徑做近似圓

                    // 若同一格就只跟後面的比，不同格就全比
                    const startB = isSameCell ? a + 1 : 0;
                    for (let b = startB; b < otherCell.length; b++) {
                        const j = otherCell[b];
                        const offB = j * this.stride;
                        const rB = this.data[offB + 5] * 0.42;

                        const dx = this.data[offB + 0] - this.data[offA + 0];
                        const dy = this.data[offB + 1] - this.data[offA + 1];
                        const distSq = dx * dx + dy * dy;
                        const minDist = rA + rB;

                        // 發生重疊碰撞
                        if (distSq < minDist * minDist && distSq > 0.0001) {
                            const dist = Math.sqrt(distSq);
                            const nx = dx / dist;
                            const ny = dy / dist;

                            // 分離兩者避免黏在一起（位置修正）
                            const overlap = 0.5 * (minDist - dist);
                            this.data[offA + 0] -= nx * overlap;
                            this.data[offA + 1] -= ny * overlap;
                            this.data[offB + 0] += nx * overlap;
                            this.data[offB + 1] += ny * overlap;

                            // 計算衝量（假設等質量，彈性係數 0.7）
                            const kx = this.data[offA + 2] - this.data[offB + 2];
                            const ky = this.data[offA + 3] - this.data[offB + 3];
                            const p = 2 * (nx * kx + ny * ky) / 2; // (v1 - v2) · n

                            // 只有互相靠近時才施加反作用力
                            if (p > 0) {
                                const restitution = 0.7;
                                const impulse = p * (1 + restitution) * 0.5;

                                this.data[offA + 2] -= impulse * nx;
                                this.data[offA + 3] -= impulse * ny;
                                this.data[offB + 2] += impulse * nx;
                                this.data[offB + 3] += impulse * ny;

                                // 互撞時稍微給點旋轉力矩
                                this.data[offA + 4] += impulse * 2;
                                this.data[offB + 4] -= impulse * 2;
                            }
                        }
                    }
                }
            }
        }
    }

    update() {
        const h = this.canvas.height;
        const w = this.canvas.width;
        let i = 0;

        while (i < this.count) {
            const offset = i * this.stride;

            // 物理運動計算
            this.data[offset + 0] += this.data[offset + 2];
            this.data[offset + 1] += this.data[offset + 3];
            this.data[offset + 3] += this.gravity;
            this.data[offset + 4] += this.data[offset + 2] * 2;
            this.data[offset + 6]--;

            const radius = this.data[offset + 5] * 0.4;

            // 地面碰撞
            const ground = h - radius;
            if (this.data[offset + 1] > ground) {
                this.data[offset + 1] = ground;
                this.data[offset + 3] *= -0.7;
                this.data[offset + 2] *= 0.9;
            }

            // 左右牆壁彈跳（加上去畫面更有活力）
            if (this.data[offset + 0] < radius) {
                this.data[offset + 0] = radius;
                this.data[offset + 2] *= -0.7;
            } else if (this.data[offset + 0] > w - radius) {
                this.data[offset + 0] = w - radius;
                this.data[offset + 2] *= -0.7;
            }

            // 生命週期結束處理
            if (this.data[offset + 6] <= 0) {
                if (i !== this.count - 1) {
                    const lastOffset = (this.count - 1) * this.stride;
                    this.data.set(this.data.subarray(lastOffset, lastOffset + this.stride), offset);
                }
                this.count--;
            } else {
                i++;
            }
        }

        // 執行香蕉間互相碰撞
        if (this.count > 1) {
            this.resolveCollisions();
        }
    }

    draw(ctx) {
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = 0; i < this.count; i++) {
            const offset = i * this.stride;
            const x = this.data[offset + 0];
            const y = this.data[offset + 1];
            const rot = this.data[offset + 4];
            const size = this.data[offset + 5];
            const life = this.data[offset + 6];

            ctx.globalAlpha = Math.min(1.0, life / 100);
            const r = rot * this.DEG2RAD;
            const cos = Math.cos(r);
            const sin = Math.sin(r);

            ctx.setTransform(cos, sin, -sin, cos, x, y);
            ctx.drawImage(this.spriteCanvas, -size / 2, -size / 2, size, size);
        }

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