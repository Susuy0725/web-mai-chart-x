/**
 * WebRTC P2P Direct DataChannel Sync Module
 *
 * 用於 wmcx (主編輯器) ↔ _play (手機端) 之間的雙端超低延遲點對點同步
 * 透過 Cloudflare Worker 進行 6 位數短碼信號交換
 *
 * Signaling:
 *   /api/pair/create
 *   /api/pair/join
 *   /api/pair/answer
 *   /api/pair/status/:id
 *
 * Status 使用 Long Polling，降低 Cloudflare Worker HTTP Request 數量。
 */

export const DEFAULT_WORKER_URL =
    "https://wmcx-signal.manda201703.workers.dev";

const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" }
];

/**
 * 等待 ICE Gathering 完成。
 *
 * 本模組使用 Non-Trickle ICE，因此會等待 ICE candidate
 * 收集完成後，再將完整 SDP 上傳至 Signaling Server。
 *
 * @param {RTCPeerConnection} pc
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function waitForIceGatheringComplete(pc, timeoutMs = 1200) {
    if (!pc || pc.iceGatheringState === "complete") {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        let timer = null;

        const cleanup = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }

            pc.removeEventListener(
                "icegatheringstatechange",
                checkState
            );
        };

        const checkState = () => {
            if (pc.iceGatheringState === "complete") {
                cleanup();
                resolve();
            }
        };

        pc.addEventListener(
            "icegatheringstatechange",
            checkState
        );

        timer = setTimeout(() => {
            cleanup();
            resolve();
        }, timeoutMs);
    });
}

export class WebRtcSync {
    /**
     * @param {Object} options
     * @param {string} [options.workerUrl]
     * Cloudflare Worker 信號交換站網址
     *
     * @param {(status: string, detail?: string) => void}
     * [options.onStatusChange]
     *
     * @param {(msg: Object) => void}
     * [options.onMessage]
     *
     * @param {(err: Error) => void}
     * [options.onError]
     */
    constructor(options = {}) {
        this.workerUrl = (
            options.workerUrl || DEFAULT_WORKER_URL
        )
            .replace(/\/+$/, "");

        this.onStatusChange =
            options.onStatusChange || (() => { });

        this.onMessage =
            options.onMessage || (() => { });

        this.onError =
            options.onError ||
            ((err) => console.warn("[WebRTC]", err));

        this.status = "disconnected";

        this.role = null; // 'host' | 'client'
        this.roomCode = null;

        this.pc = null;
        this.dataChannel = null;

        this.pairId = null;

        this._isCleaningUp = false;
    }

    _log(...args) {
        console.log(
            `%c[WebRtcSync:${this.role || "idle"}]`,
            "color:#00e5ff; font-weight:bold;",
            ...args
        );
    }

    _warn(...args) {
        console.warn(
            `%c[WebRtcSync:${this.role || "idle"}]`,
            "color:#ffab00; font-weight:bold;",
            ...args
        );
    }

    _err(...args) {
        console.error(
            `%c[WebRtcSync:${this.role || "idle"}]`,
            "color:#ff1744; font-weight:bold;",
            ...args
        );
    }

    _setStatus(status, detail = "") {
        this.status = status;

        this._log(
            `狀態變更 -> [${status}]`,
            detail
        );

        this.onStatusChange(status, detail);
    }

    isConnected() {
        return (
            this.status === "connected" &&
            this.dataChannel &&
            this.dataChannel.readyState === "open"
        );
    }

    setWorkerUrl(url) {
        if (url && typeof url === "string") {
            this.workerUrl = url
                .trim()
                .replace(/\/+$/, "");

            this._log(
                "更新 Worker 網址:",
                this.workerUrl
            );
        }
    }

    /**
     * 發起端（電腦端）：
     *
     * 建立 WebRTC Offer，
     * 透過 D1 產生 6 位配對碼，
     * 使用 Long Polling 等待接收端回傳 Answer。
     *
     * @returns {Promise<string>}
     * 回傳 6 位配對碼
     */
    async createRoom() {
        this.disconnect();

        this._isCleaningUp = false;
        this.role = "host";

        this._setStatus(
            "connecting",
            "正在建立房間與 SDP Offer..."
        );

        try {
            this.pc = new RTCPeerConnection({
                iceServers: ICE_SERVERS
            });

            this._setupPeerConnection(this.pc);

            this.dataChannel =
                this.pc.createDataChannel(
                    "wmcx-sync",
                    {
                        ordered: true
                    }
                );

            this._setupDataChannel(
                this.dataChannel
            );

            const offer =
                await this.pc.createOffer();

            await this.pc.setLocalDescription(
                offer
            );

            this._log(
                "本地 SDP Offer 建立完成，等待 ICE Gathering 完成 (不使用 Trickle ICE)..."
            );

            await waitForIceGatheringComplete(
                this.pc
            );

            this._log(
                "ICE Gathering 完成"
            );

            // 向 Worker 發送 /api/pair/create
            this._log(
                "正在向 Worker 發送 /api/pair/create..."
            );

            const res = await fetch(
                `${this.workerUrl}/api/pair/create`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        offer:
                            this.pc.localDescription.sdp
                    })
                }
            );

            if (!res.ok) {
                const errData =
                    await res
                        .json()
                        .catch(() => ({}));

                throw new Error(
                    errData.error ||
                    `HTTP ${res.status}`
                );
            }

            const data =
                await res.json();

            this.pairId = data.pairId;
            this.roomCode = data.code;

            this._log(
                `房間建立成功，pairId: ${this.pairId}，配對碼: ${this.roomCode} (90 秒有效)`
            );

            this._setStatus(
                "connecting",
                `已產生配對碼: ${this.roomCode}，等候加入...`
            );

            // 使用 Long Polling 等待 Answer
            this._startPollingStatus(
                this.pairId
            );

            return this.roomCode;
        } catch (err) {
            this._err(
                "建立房間失敗:",
                err
            );

            this._setStatus(
                "disconnected",
                err.message
            );

            this.onError(err);

            throw err;
        }
    }

    /**
     * 接收端（手機 / iPad）：
     *
     * 輸入 6 位數配對碼，
     * 從 D1 取得 Offer，
     * 建立 Answer 並回傳至 Worker。
     *
     * @param {string} code
     */
    async joinRoom(code) {
        if (
            !code ||
            typeof code !== "string" ||
            code.trim().length !== 6
        ) {
            throw new Error(
                "配對碼必須為 6 位數字"
            );
        }

        const cleanCode =
            code.trim();

        this.disconnect();

        this._isCleaningUp = false;
        this.role = "client";
        this.roomCode = cleanCode;

        this._setStatus(
            "connecting",
            `正在驗證配對碼 ${cleanCode}...`
        );

        try {
            this._log(
                `向 Worker 發送 /api/pair/join 驗證配對碼 ${cleanCode}...`
            );

            const res = await fetch(
                `${this.workerUrl}/api/pair/join`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        code: cleanCode
                    })
                }
            );

            if (!res.ok) {
                throw new Error(
                    "配對碼無效或已過期"
                );
            }

            const data =
                await res.json();

            this.pairId = data.pairId;

            this._log(
                `驗證成功，取得 pairId: ${this.pairId}，開始建立 Answer...`
            );

            this._setStatus(
                "connecting",
                "已取得 Offer，正在建立 Answer..."
            );

            this.pc =
                new RTCPeerConnection({
                    iceServers: ICE_SERVERS
                });

            this._setupPeerConnection(
                this.pc
            );

            this.pc.ondatachannel = (
                event
            ) => {
                this._log(
                    "收到 Host 建立的 DataChannel:",
                    event.channel.label
                );

                this.dataChannel =
                    event.channel;

                this._setupDataChannel(
                    this.dataChannel
                );
            };

            await this.pc.setRemoteDescription(
                new RTCSessionDescription({
                    type: "offer",
                    sdp: data.offer
                })
            );

            const answer =
                await this.pc.createAnswer();

            await this.pc.setLocalDescription(
                answer
            );

            this._log(
                "本地 Answer 建立完成，等待 ICE Gathering 完成 (不使用 Trickle ICE)..."
            );

            await waitForIceGatheringComplete(
                this.pc
            );

            this._log(
                "ICE Gathering 完成"
            );

            this._log(
                "正在將 Answer 上傳至 /api/pair/answer..."
            );

            const ansRes =
                await fetch(
                    `${this.workerUrl}/api/pair/answer`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify({
                            pairId:
                                this.pairId,
                            answer:
                                this.pc
                                    .localDescription
                                    .sdp
                        })
                    }
                );

            if (!ansRes.ok) {
                throw new Error(
                    "上傳 Answer 失敗或配對已過期"
                );
            }

            this._log(
                "Answer 上傳成功，正在等待 WebRTC P2P 直連握手..."
            );

            this._setStatus(
                "connecting",
                "已送出 Answer，正在建立 P2P 直連..."
            );
        } catch (err) {
            this._err(
                "加入配對失敗:",
                err
            );

            this._setStatus(
                "disconnected",
                err.message
            );

            this.onError(err);

            throw err;
        }
    }

    /**
     * 綁定 WebRTC DataChannel 事件。
     *
     * @param {RTCDataChannel} channel
     */
    _setupDataChannel(channel) {
        if (!channel) return;

        this._log(
            `綁定 DataChannel: [${channel.label}], 目前狀態: ${channel.readyState}`
        );

        channel.onopen = () => {
            if (
                this.dataChannel !== channel
            ) {
                return;
            }

            this._log(
                "DataChannel.onopen -> P2P WebRTC 直連握手成功！"
            );

            this._setStatus(
                "connected",
                "已成功建立 WebRTC P2P 直連！"
            );
        };

        channel.onclose = () => {
            if (
                this.dataChannel !== channel
            ) {
                return;
            }

            this._warn(
                "DataChannel.onclose -> P2P 連線已中斷"
            );

            if (
                this.status === "connected" ||
                this.status === "connecting"
            ) {
                this._setStatus(
                    "disconnected",
                    "P2P 連線已中斷"
                );

                this.disconnect();
            }
        };

        channel.onerror = (err) => {
            if (
                this.dataChannel !== channel
            ) {
                return;
            }

            this._err(
                "DataChannel.onerror:",
                err
            );

            this.onError(
                new Error(
                    "DataChannel error: " +
                    (err.message ||
                        "連線錯誤")
                )
            );
        };

        channel.onmessage = (event) => {
            if (
                this.dataChannel !== channel
            ) {
                return;
            }

            try {
                const data =
                    JSON.parse(
                        event.data
                    );

                this._log(
                    "收到 P2P 訊息:",
                    data.action,
                    data
                );

                this.onMessage(data);
            } catch (e) {
                console.warn(
                    "[WebRTC message parse error]",
                    e,
                    event.data
                );
            }
        };
    }

    /**
     * 綁定 RTCPeerConnection 狀態事件。
     *
     * @param {RTCPeerConnection} pc
     */
    _setupPeerConnection(pc) {
        if (!pc) return;

        pc.onconnectionstatechange = () => {
            if (this.pc !== pc) {
                return;
            }

            const state =
                pc.connectionState;

            this._log(
                "PeerConnection 狀態改變 ->",
                state
            );

            if (
                state === "disconnected" ||
                state === "failed" ||
                state === "closed"
            ) {
                if (
                    this.status === "connected" ||
                    this.status === "connecting"
                ) {
                    this._setStatus(
                        "disconnected",
                        `PeerConnection ${state}`
                    );

                    this.disconnect();
                }
            }
        };

        pc.oniceconnectionstatechange = () => {
            if (this.pc !== pc) {
                return;
            }

            const state =
                pc.iceConnectionState;

            this._log(
                "ICE Connection 狀態改變 ->",
                state
            );

            if (
                state === "disconnected" ||
                state === "failed" ||
                state === "closed"
            ) {
                if (
                    this.status === "connected" ||
                    this.status === "connecting"
                ) {
                    this._setStatus(
                        "disconnected",
                        `ICE Connection ${state}`
                    );

                    this.disconnect();
                }
            }
        };
    }

    /**
     * 使用 Long Polling 等待配對狀態。
     *
     * Worker 每次 request 最多等待 20 秒。
     * 收到 Answer 時立即返回 ready。
     * 配對過期時返回 expired。
     */
    _startPollingStatus(pairId) {
        let stopped = false;
        const TIMEOUT_MS = 90 * 1000;
        const startTime = Date.now();

        const pollStatus =
            async () => {
                if (
                    this._isCleaningUp ||
                    this.status === "connected" ||
                    !this.pc
                ) {
                    return;
                }

                if (Date.now() - startTime >= TIMEOUT_MS) {
                    stopped = true;
                    this._warn("配對碼已達 90 秒時間，自動逾時");
                    this.disconnect();
                    this._setStatus("disconnected", "配對碼已逾期 (90 秒)");
                    return;
                }

                try {
                    const res =
                        await fetch(
                            `${this.workerUrl}/api/pair/status/${pairId}`
                        );

                    if (!res.ok) {
                        if (!stopped) {
                            await new Promise(
                                (resolve) =>
                                    setTimeout(
                                        resolve,
                                        1000
                                    )
                            );

                            await pollStatus();
                        }

                        return;
                    }

                    const data =
                        await res.json();

                    /**
                     * Worker 偵測到 Answer。
                     */
                    if (
                        data.status === "ready" &&
                        data.answer
                    ) {
                        stopped = true;

                        this._log(
                            "收到 Answer，正在套用並建立 P2P 直連..."
                        );

                        this._setStatus(
                            "connecting",
                            "接收端已加入，正在建立 P2P 直連..."
                        );

                        await this.pc.setRemoteDescription(
                            new RTCSessionDescription({
                                type: "answer",
                                sdp: data.answer
                            })
                        );

                        return;
                    }

                    /**
                     * Worker 偵測到配對已過期。
                     */
                    if (
                        data.status === "expired"
                    ) {
                        stopped = true;

                        this._warn(
                            "配對已過期"
                        );

                        this.disconnect();

                        this._setStatus(
                            "disconnected",
                            "配對碼無效或已過期"
                        );

                        return;
                    }

                    /**
                     * Worker 等待 20 秒後仍沒有 Answer。
                     *
                     * 再建立下一個 Long Polling request。
                     */
                    if (!stopped) {
                        await pollStatus();
                    }
                } catch (err) {
                    if (stopped) {
                        return;
                    }

                    this._warn(
                        "輪詢狀態異常:",
                        err.message
                    );

                    /**
                     * 網路錯誤時不要立即瘋狂重試，
                     * 等待 1 秒後再建立 request。
                     */
                    await new Promise(
                        (resolve) =>
                            setTimeout(
                                resolve,
                                1000
                            )
                    );

                    if (!stopped) {
                        await pollStatus();
                    }
                }
            };

        pollStatus();
    }

    /**
     * 傳送控制訊息給對端。
     *
     * @param {Object} messageObj
     * @returns {boolean}
     */
    send(messageObj) {
        if (!this.isConnected()) {
            this._warn(
                "未連線，無法傳送訊息:",
                messageObj
            );

            return false;
        }

        try {
            this._log(
                "發送 P2P 訊息 ->",
                messageObj.action,
                messageObj
            );

            this.dataChannel.send(
                JSON.stringify(messageObj)
            );

            return true;
        } catch (err) {
            this._err(
                "DataChannel 發送失敗:",
                err
            );

            return false;
        }
    }

    /**
     * 廣播播放指令。
     *
     * @param {number} startAt
     * @param {number} speed
     */
    sendPlay(
        startAt = 0,
        speed = 1.0
    ) {
        return this.send({
            action: "play",
            startAt,
            speed
        });
    }

    /**
     * 廣播暫停指令。
     */
    sendPause() {
        return this.send({
            action: "pause"
        });
    }

    /**
     * 廣播進度跳轉指令。
     *
     * @param {number} time
     */
    sendSeek(time = 0) {
        return this.send({
            action: "seek",
            time
        });
    }

    /**
     * 廣播重新開始指令。
     */
    sendRestart() {
        return this.send({
            action: "restart"
        });
    }

    /**
     * 廣播播放速度變更。
     *
     * @param {number} speed
     */
    sendSpeed(speed = 1.0) {
        return this.send({
            action: "speed",
            speed
        });
    }

    /**
     * 傳送譜面字串與曲目資訊。
     *
     * @param {Object} chartPayload
     */
    sendChart(chartPayload) {
        return this.send({
            action: "chart",
            data: chartPayload
        });
    }

    /**
     * 中斷連線與資源釋放。
     */
    disconnect() {
        this._isCleaningUp = true;

        /**
         * 先清除引用再關閉，
         * 確保舊事件觸發時身份檢查：
         *
         * this.dataChannel !== channel
         * this.pc !== pc
         *
         * 必定成立。
         */
        const oldChannel =
            this.dataChannel;

        const oldPc =
            this.pc;

        this.dataChannel = null;
        this.pc = null;

        if (oldChannel) {
            try {
                oldChannel.close();
            } catch (_) { }
        }

        if (oldPc) {
            try {
                oldPc.close();
            } catch (_) { }
        }

        this.role = null;
        this.roomCode = null;
        this.pairId = null;

        this._setStatus(
            "disconnected",
            "已中斷連線"
        );
    }
}