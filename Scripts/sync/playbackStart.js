// 接收端回報音源已就緒，並在房主換算的本地時間起播。
export class PlaybackStart {
    constructor({ send, ready = () => {}, play }) {
        this.send = send;
        this.ready = ready;
        this.play = play;
        this.pending = null;
    }

    cancel() {
        clearTimeout(this.pending?.timer);
        this.pending = null;
    }

    async whenReady(request, callback) {
        try {
            await this.ready();
            if (this.pending === request) callback();
        } catch (error) {
            if (this.pending === request) {
                this.cancel();
                this.send({ action: 'pause' });
            }
            console.warn('[WebRTC] 無法準備同步播放', error);
        }
    }

    receive(message) {
        const now = performance.now();
        const pending = this.pending;
        switch (message.action) {
            case 'preparePlay': {
                this.cancel();
                const request = { id: message.id, startAt: message.startAt, speed: message.speed };
                this.pending = request;
                this.whenReady(request, () => {
                    this.send({ action: 'playReady', id: request.id, received: now, replied: performance.now() });
                });
                return true;
            }
            case 'commitPlay':
                if (pending && pending.id === message.id && Number.isFinite(message.deadline)) {
                    this.schedule(pending, message.deadline);
                }
                return true;
            default:
                return false;
        }
    }

    schedule(request, deadline) {
        request.timer = setTimeout(() => {
            if (this.pending !== request) return;
            this.pending = null;
            const lateSeconds = Math.max(0, performance.now() - deadline) / 1000;
            this.play(request.startAt + lateSeconds * request.speed, request.speed);
        }, Math.max(0, deadline - performance.now()));
    }
}
