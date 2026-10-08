/**
 * 輕量幀效能監控器 (Frame Profiler)
 * 可透過 localStorage.setItem('debugProfiler', '1') 或 window.toggleProfiler() 開啟
 */
class FrameProfiler {
    constructor() {
        this.enabled = typeof window !== 'undefined' && !!window.localStorage?.getItem('debugProfiler');
        this.history = [];
        this.frameCount = 0;
        this.maxFrames = 120;
        this._currentFrame = null;
        if (typeof window !== 'undefined') {
            window.toggleProfiler = (force) => {
                this.enabled = (typeof force === 'boolean') ? force : !this.enabled;
                if (this.enabled) {
                    window.localStorage?.setItem('debugProfiler', '1');
                    console.log('[Profiler] 效能監控已開啟 (每 120 幀輸出統計至 console)');
                } else {
                    window.localStorage?.removeItem('debugProfiler');
                    console.log('[Profiler] 效能監控已關閉');
                }
                return this.enabled;
            };
        }
    }

    beginFrame() {
        if (!this.enabled) return;
        this._currentFrame = {
            start: performance.now(),
            sections: {}
        };
    }

    start(name) {
        if (!this.enabled || !this._currentFrame) return;
        this._currentFrame.sections[name] = { start: performance.now() };
    }

    end(name) {
        if (!this.enabled || !this._currentFrame) return;
        const s = this._currentFrame.sections[name];
        if (s) {
            s.duration = performance.now() - s.start;
        }
    }

    endFrame() {
        if (!this.enabled || !this._currentFrame) return;
        this._currentFrame.total = performance.now() - this._currentFrame.start;
        this.history.push(this._currentFrame);
        this._currentFrame = null;
        this.frameCount++;

        if (this.frameCount >= this.maxFrames) {
            this.report();
            this.history.length = 0;
            this.frameCount = 0;
        }
    }

    report() {
        if (!this.enabled || this.history.length === 0) return;
        const calcStats = (vals) => {
            if (!vals.length) return { 'avg (ms)': '0.00', 'p95 (ms)': '0.00', 'max (ms)': '0.00' };
            vals.sort((a, b) => a - b);
            const sum = vals.reduce((acc, v) => acc + v, 0);
            const avg = sum / vals.length;
            const p95 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))];
            const max = vals[vals.length - 1];
            return {
                'avg (ms)': avg.toFixed(3),
                'p95 (ms)': p95.toFixed(3),
                'max (ms)': max.toFixed(3)
            };
        };

        const totals = this.history.map(f => f.total);
        const sectionNames = new Set();
        this.history.forEach(f => {
            Object.keys(f.sections).forEach(k => sectionNames.add(k));
        });

        const rows = {
            '1. Total Frame': calcStats(totals)
        };
        for (const name of sectionNames) {
            const vals = this.history.map(f => f.sections[name]?.duration || 0);
            rows[`2. ${name}`] = calcStats(vals);
        }

        console.table(rows);
    }
}

export const frameProfiler = new FrameProfiler();
