/**
 * WebRTC P2P Direct DataChannel Sync Module
 * 用於 wmcx (主編輯器) ↔ _play (手機端) 之間的雙端超低延遲點對點同步
 * 透過 Cloudflare Worker 進行 4 位數短碼信號交換
 */

export const DEFAULT_WORKER_URL = "https://wmcx-signal.manda201703.workers.dev";

const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" }
];

function waitForIceGatheringComplete(pc, timeoutMs = 1200) {
    if (!pc || pc.iceGatheringState === "complete") {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        let timer = null;
        const checkState = () => {
            if (pc.iceGatheringState === "complete") {
                cleanup();
                resolve();
            }
        };
        const cleanup = () => {
            if (timer) clearTimeout(timer);
            pc.removeEventListener("icegatheringstatechange", checkState);
        };
        pc.addEventListener("icegatheringstatechange", checkState);
        timer = setTimeout(() => {
            cleanup();
            resolve();
        }, timeoutMs);
    });
}

export class WebRtcSync {
    /**
     * @param {Object} options
     * @param {string} [options.workerUrl] - Cloudflare Worker 信號交換站網址
     * @param {(status: string, detail?: string) => void} [options.onStatusChange] - 連線狀態變化回呼 ('disconnected' | 'connecting' | 'connected')
     * @param {(msg: Object) => void} [options.onMessage] - 收到對端控制信號回呼
     * @param {(err: Error) => void} [options.onError] - 錯誤回呼
     */
    constructor(options = {}) {
        this.workerUrl = (options.workerUrl || DEFAULT_WORKER_URL).replace(/\/+$/, "");
        this.onStatusChange = options.onStatusChange || (() => { });
        this.onMessage = options.onMessage || (() => { });
        this.onError = options.onError || ((err) => console.warn("[WebRTC]", err));

        this.status = "disconnected";
        this.role = null; // 'host' | 'client'
        this.roomCode = null;

        this.pc = null;
        this.dataChannel = null;
        this.pollTimer = null;
        this._isCleaningUp = false;
    }

    _setStatus(status, detail = "") {
        this.status = status;
        this.onStatusChange(status, detail);
    }

    isConnected() {
        return this.status === "connected" && this.dataChannel && this.dataChannel.readyState === "open";
    }

    setWorkerUrl(url) {
        if (url && typeof url === "string") {
            this.workerUrl = url.trim().replace(/\/+$/, "");
        }
    }

    /**
     * 發起端（電腦端）：建立房間、產生 4 位數短碼並等候手機加入
     * @returns {Promise<string>} 回傳 4 位數短碼
     */
    async createRoom() {
        this.disconnect();
        this._isCleaningUp = false;
        this.role = "host";
        this._setStatus("connecting", "正在建立房間與 SDP Offer...");

        try {
            this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            this._setupPeerConnection(this.pc);
            const hostCandidates = [];

            this.pc.onicecandidate = (event) => {
                if (event.candidate && this.roomCode) {
                    hostCandidates.push(event.candidate);
                    this._sendCandidate(this.roomCode, "host", event.candidate).catch(() => { });
                }
            };

            // Host 建立 DataChannel
            this.dataChannel = this.pc.createDataChannel("wmcx-sync", {
                ordered: true
            });
            this._setupDataChannel(this.dataChannel);

            // 建立 Offer
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            await waitForIceGatheringComplete(this.pc);

            // 向 Worker 建立房間並獲取 4 位數短碼
            const res = await fetch(`${this.workerUrl}/api/room/create`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    offer: this.pc.localDescription,
                    candidates: hostCandidates
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            this.roomCode = data.code;
            this._setStatus("connecting", `等待接收端輸入配對碼: ${this.roomCode}`);

            // 開始輪詢對端 Answer
            this._startPollingAnswer(this.roomCode);
            return this.roomCode;
        } catch (err) {
            this._setStatus("disconnected", err.message);
            this.onError(err);
            throw err;
        }
    }

    /**
     * 接收端（手機 _play）：輸入 4 位數短碼加入房間並建立連線
     * @param {string} code - 4 位數短碼
     */
    async joinRoom(code) {
        if (!code || typeof code !== "string" || code.trim().length !== 4) {
            throw new Error("配對碼必須為 4 位數字");
        }

        const cleanCode = code.trim();
        this.disconnect();
        this._isCleaningUp = false;
        this.role = "client";
        this.roomCode = cleanCode;
        this._setStatus("connecting", `正在加入房間 ${cleanCode}...`);

        try {
            // 1. 從 Worker 獲取 Host 的 Offer
            const res = await fetch(`${this.workerUrl}/api/room/offer?code=${cleanCode}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "找不到該配對碼或房間已逾期");
            }

            const roomData = await res.json();
            if (!roomData.offer) {
                throw new Error("房間尚未就緒或缺少 Offer");
            }

            this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            this._setupPeerConnection(this.pc);
            const clientCandidates = [];

            this.pc.onicecandidate = (event) => {
                if (event.candidate && this.roomCode) {
                    clientCandidates.push(event.candidate);
                    this._sendCandidate(this.roomCode, "client", event.candidate).catch(() => { });
                }
            };

            // 接收端監聽 Host 建立的 DataChannel
            this.pc.ondatachannel = (event) => {
                this.dataChannel = event.channel;
                this._setupDataChannel(this.dataChannel);
            };

            // 2. 設置 Remote Description (Host Offer)
            await this.pc.setRemoteDescription(new RTCSessionDescription(roomData.offer));

            // 添加 Host 已蒐集到的 ICE Candidates
            if (Array.isArray(roomData.hostCandidates)) {
                for (const cand of roomData.hostCandidates) {
                    try {
                        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
                    } catch (_) { }
                }
            }

            // 3. 建立 Answer
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            await waitForIceGatheringComplete(this.pc);

            // 4. 將 Answer 上傳至 Worker
            const ansRes = await fetch(`${this.workerUrl}/api/room/answer`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: cleanCode,
                    answer: this.pc.localDescription,
                    candidates: clientCandidates
                })
            });

            if (!ansRes.ok) {
                throw new Error("上傳 Answer 失敗");
            }

            this._setStatus("connecting", "已送出 Answer，正在建立 P2P 直連...");
        } catch (err) {
            this._setStatus("disconnected", err.message);
            this.onError(err);
            throw err;
        }
    }

    _setupDataChannel(channel) {
        if (!channel) return;

        channel.onopen = () => {
            if (this.dataChannel !== channel) return; // 舊通道事件，忽略
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
            this._setStatus("connected", "已成功建立 WebRTC P2P 直連！");
            // 握手完成，通知 Worker 釋放該房間
            if (this.roomCode && this.role === "host") {
                fetch(`${this.workerUrl}/api/room?code=${this.roomCode}`, { method: "DELETE" }).catch(() => { });
            }
        };

        channel.onclose = () => {
            if (this.dataChannel !== channel) return; // 舊通道事件，忽略
            if (this.status === "connected" || this.status === "connecting") {
                this._setStatus("disconnected", "P2P 連線已中斷");
                this.disconnect();
            }
        };

        channel.onerror = (err) => {
            if (this.dataChannel !== channel) return;
            console.warn("[WebRTC DataChannel Error]", err);
            this.onError(new Error("DataChannel error: " + (err.message || "連線錯誤")));
        };

        channel.onmessage = (event) => {
            if (this.dataChannel !== channel) return;
            try {
                const data = JSON.parse(event.data);
                this.onMessage(data);
            } catch (e) {
                console.warn("[WebRTC message parse error]", e, event.data);
            }
        };
    }

    _setupPeerConnection(pc) {
        if (!pc) return;
        pc.onconnectionstatechange = () => {
            if (this.pc !== pc) return; // 舊 PC 事件，忽略
            const state = pc.connectionState;
            if (state === "disconnected" || state === "failed" || state === "closed") {
                if (this.status === "connected" || this.status === "connecting") {
                    this._setStatus("disconnected", `PeerConnection ${state}`);
                    this.disconnect();
                }
            }
        };
        pc.oniceconnectionstatechange = () => {
            if (this.pc !== pc) return; // 舊 PC 事件，忽略
            const state = pc.iceConnectionState;
            if (state === "disconnected" || state === "failed" || state === "closed") {
                if (this.status === "connected" || this.status === "connecting") {
                    this._setStatus("disconnected", `ICE Connection ${state}`);
                    this.disconnect();
                }
            }
        };
    }

    _startPollingAnswer(code) {
        if (this.pollTimer) clearInterval(this.pollTimer);

        let attempts = 0;
        const maxAttempts = 600; // 最多等候 10 分鐘 (每 1000ms 輪詢一次)

        this.pollTimer = setInterval(async () => {
            if (this._isCleaningUp || this.status === "connected" || !this.pc) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
                return;
            }

            attempts++;
            if (attempts > maxAttempts) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
                this.disconnect();
                this._setStatus("disconnected", "等待配對逾時，請重新產生配對碼");
                return;
            }

            try {
                const res = await fetch(`${this.workerUrl}/api/room/answer?code=${code}`);
                if (!res.ok) return;

                const data = await res.json();
                if (data.ready && data.answer) {
                    clearInterval(this.pollTimer);
                    this.pollTimer = null;

                    this._setStatus("connecting", "接收端已加入，正在握手直連...");
                    await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));

                    if (Array.isArray(data.clientCandidates)) {
                        for (const cand of data.clientCandidates) {
                            try {
                                await this.pc.addIceCandidate(new RTCIceCandidate(cand));
                            } catch (_) { }
                        }
                    }
                }
            } catch (_) { }
        }, 1000);
    }

    async _sendCandidate(code, role, candidate) {
        try {
            await fetch(`${this.workerUrl}/api/room/candidate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code, role, candidate })
            });
        } catch (_) { }
    }

    /**
     * 傳送控制訊息給對端
     * @param {Object} messageObj
     * @returns {boolean} 是否成功發送
     */
    send(messageObj) {
        if (!this.isConnected()) return false;
        try {
            this.dataChannel.send(JSON.stringify(messageObj));
            return true;
        } catch (err) {
            console.warn("[WebRTC send error]", err);
            return false;
        }
    }

    /**
     * 廣播播放指令
     * @param {number} startAt - 播放起始秒數
     * @param {number} speed - 播放速度
     */
    sendPlay(startAt = 0, speed = 1.0) {
        return this.send({
            action: "play",
            startAt,
            speed
        });
    }

    /**
     * 廣播暫停指令
     */
    sendPause() {
        return this.send({
            action: "pause"
        });
    }

    /**
     * 廣播進度跳轉指令
     * @param {number} time - 跳轉目標秒數
     */
    sendSeek(time = 0) {
        return this.send({
            action: "seek",
            time
        });
    }

    /**
     * 廣播重新開始指令
     */
    sendRestart() {
        return this.send({
            action: "restart"
        });
    }

    /**
     * 傳送譜面字串與曲目資訊
     */
    sendChart(chartPayload) {
        return this.send({
            action: "chart",
            data: chartPayload
        });
    }

    /**
     * 中斷連線與資源釋放
     */
    disconnect() {
        this._isCleaningUp = true;
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        // 先清除引用再關閉，確保舊事件觸發時身份檢查 (this.dataChannel !== channel) 必定成立
        const oldChannel = this.dataChannel;
        const oldPc = this.pc;
        this.dataChannel = null;
        this.pc = null;

        if (oldChannel) {
            try { oldChannel.close(); } catch (_) { }
        }

        if (oldPc) {
            try { oldPc.close(); } catch (_) { }
        }

        if (this.roomCode && this.role === "host") {
            fetch(`${this.workerUrl}/api/room?code=${this.roomCode}`, { method: "DELETE" }).catch(() => { });
        }

        this.role = null;
        this.roomCode = null;
        this._setStatus("disconnected", "已中斷連線");
    }
}

