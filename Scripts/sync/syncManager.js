/**
 * Web mai Chart X - 統一 WebRTC 同步管理器 (SyncManager)
 * 統一支援 Editor (電腦端) 與 Play (播放器/行動端) 之雙向與對等同步
 */

import { WebRtcSync, DEFAULT_WORKER_URL } from './webrtcSync.js';
import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export class SyncManager {
    constructor(options = {}) {
        this.options = options;
        this.role = localStorage.getItem('wmcx_webrtc_role') || options.defaultRole || 'client';
        this.workerUrl = localStorage.getItem('wmcx_worker_url') || DEFAULT_WORKER_URL;

        // 回呼事件
        this.callbacks = {
            onChart: options.onChart || null,
            onAudio: options.onAudio || null,
            onAudioClear: options.onAudioClear || null,
            onPlay: options.onPlay || null,
            onPause: options.onPause || null,
            onSeek: options.onSeek || null,
            onRestart: options.onRestart || null,
            onSpeed: options.onSpeed || null,
            getProjectData: options.getProjectData || null,
            onStatusChange: options.onStatusChange || null
        };

        // 內部傳輸與接收狀態
        this._isSendingAudio = false;
        this._isRemoteTriggered = false;
        this._incomingAudioChunks = null;
        this._incomingAudioMeta = null;
        this._incomingAudioCount = 0;
        this._transferPopupCtx = null;
        this._modalUpdater = null;

        // 初始化底層 WebRTC
        this.sync = new WebRtcSync({
            workerUrl: this.workerUrl,
            onStatusChange: (status, detail) => {
                this._handleStatusChange(status, detail);
            },
            onMessage: (msg) => {
                this._handleIncomingMessage(msg);
            },
            onError: (err) => {
                simpleToast({ content: `WebRTC 錯誤: ${err.message}`, type: 'error', timeout: 3500 });
                if (this._modalUpdater) this._modalUpdater();
            }
        });
    }

    isConnected() {
        return this.sync.isConnected();
    }

    get status() {
        return this.sync.status;
    }

    get roomCode() {
        return this.sync.roomCode;
    }

    // =========================================================
    // 傳輸指令發送 API
    // =========================================================

    sendPlay(startAt, speed = 1) {
        if (!this.sync.isConnected() || this._isRemoteTriggered) return;
        this.sync.sendPlay(startAt, speed);
    }

    sendPause() {
        if (!this.sync.isConnected() || this._isRemoteTriggered) return;
        this.sync.sendPause();
    }

    sendSeek(time) {
        if (!this.sync.isConnected() || this._isRemoteTriggered) return;
        this.sync.sendSeek(time);
    }

    sendRestart() {
        if (!this.sync.isConnected() || this._isRemoteTriggered) return;
        this.sync.sendRestart();
    }

    sendSpeed(speed) {
        if (!this.sync.isConnected() || this._isRemoteTriggered) return;
        this.sync.sendSpeed(speed);
    }

    requestChart() {
        if (!this.sync.isConnected()) return;
        this.sync.send({ action: 'requestChart' });
    }

    sendClearAudio() {
        if (!this.sync.isConnected()) return;
        this.sync.send({ action: 'audio_clear' });
    }

    /**
     * 發送譜面資料
     */
    sendChart({ fumen = '', fullMaidata = '', title = '', artist = '', musicDelay = 0, selectedDifficulty = '3' }) {
        if (!this.sync.isConnected()) return;
        this.sync.sendChart({
            fumen,
            fullMaidata,
            title,
            artist,
            musicDelay,
            selectedDifficulty
        });
    }

    /**
     * 分塊傳輸音源檔案 (32KB Chunks)
     */
    async sendAudioFile(fileOrBlob) {
        if (!fileOrBlob || !this.sync.isConnected()) return;
        if (this._isSendingAudio) return;
        this._isSendingAudio = true;

        try {
            let arrayBuffer;
            if (fileOrBlob instanceof Blob) {
                arrayBuffer = await fileOrBlob.arrayBuffer();
            } else if (fileOrBlob instanceof ArrayBuffer) {
                arrayBuffer = fileOrBlob;
            } else if (typeof fileOrBlob === 'string') {
                const res = await fetch(fileOrBlob);
                arrayBuffer = await res.arrayBuffer();
            }
            if (!arrayBuffer || arrayBuffer.byteLength === 0) return;

            const CHUNK_SIZE = 32 * 1024; // 32KB
            const totalSize = arrayBuffer.byteLength;
            const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
            const fileName = fileOrBlob.name || 'track.mp3';
            const mimeType = fileOrBlob.type || 'audio/mp3';

            simpleToast({ content: t('settings.connection.audioSending') || '正在同步音源檔案至對端...', type: 'info', timeout: 2000 });

            this.sync.send({
                action: 'audio_start',
                fileName,
                totalSize,
                totalChunks,
                mimeType
            });

            for (let i = 0; i < totalChunks; i++) {
                if (!this.sync.isConnected()) break;
                if (this.sync.dataChannel && this.sync.dataChannel.bufferedAmount > 65536) {
                    await new Promise(r => setTimeout(r, 25));
                }

                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, totalSize);
                const chunkBuffer = arrayBuffer.slice(start, end);
                const base64Data = arrayBufferToBase64(chunkBuffer);

                this.sync.send({
                    action: 'audio_chunk',
                    chunkIndex: i,
                    totalChunks,
                    data: base64Data
                });
            }

            this.sync.send({
                action: 'audio_end',
                fileName,
                totalSize,
                totalChunks
            });

            simpleToast({ content: t('settings.connection.audioSendSuccess') || '音源已成功同步至對端！', type: 'success', timeout: 2500 });
        } catch (err) {
            console.error('[SyncManager sendAudioFile error]', err);
            simpleToast({ content: `音源傳輸失敗: ${err.message}`, type: 'error', timeout: 3000 });
        } finally {
            this._isSendingAudio = false;
        }
    }

    /**
     * 完整推播當前專案 (譜面 + 音源)
     */
    async pushProject(customData = null) {
        if (!this.sync.isConnected()) return;

        let proj = customData;
        if (!proj && typeof this.callbacks.getProjectData === 'function') {
            proj = await this.callbacks.getProjectData();
        }
        if (!proj) return;

        if (proj.chart) {
            this.sendChart(proj.chart);
        }
        if (proj.audio) {
            await this.sendAudioFile(proj.audio);
        } else {
            this.sendClearAudio();
        }
    }

    // =========================================================
    // 內部訊息處理與分塊拼裝
    // =========================================================

    _handleStatusChange(status, detail) {
        if (status === 'disconnected') {
            this._incomingAudioChunks = null;
            this._incomingAudioMeta = null;
            this._incomingAudioCount = 0;
            this._isSendingAudio = false;
            this._isRemoteTriggered = false;
            if (this._transferCardEl) {
                this._transferCardEl.style.opacity = '0';
                setTimeout(() => {
                    if (this._transferCardEl) this._transferCardEl.style.display = 'none';
                }, 300);
            }
        } else if (status === 'connected') {
            if (this.role === 'client') {
                this.requestChart();
            } else if (this.role === 'host') {
                setTimeout(() => {
                    if (this.sync.isConnected()) {
                        this.pushProject();
                    }
                }, 300);
            }
        }

        if (this._modalUpdater) this._modalUpdater();
        if (typeof this.callbacks.onStatusChange === 'function') {
            this.callbacks.onStatusChange(status, detail);
        }
    }

    async _handleIncomingMessage(msg) {
        if (!msg || !msg.action) return;

        if (msg.action === 'requestChart') {
            this.pushProject();
            return;
        }

        this._isRemoteTriggered = true;
        try {
            if (msg.action === 'play') {
                const speed = msg.speed || 1;
                const startAt = typeof msg.startAt === 'number' ? msg.startAt : 0;
                if (typeof this.callbacks.onPlay === 'function') {
                    await this.callbacks.onPlay(startAt, speed);
                }
            } else if (msg.action === 'pause') {
                if (typeof this.callbacks.onPause === 'function') {
                    this.callbacks.onPause();
                }
            } else if (msg.action === 'seek') {
                if (typeof this.callbacks.onSeek === 'function') {
                    this.callbacks.onSeek(msg.time || 0);
                }
            } else if (msg.action === 'restart') {
                if (typeof this.callbacks.onRestart === 'function') {
                    this.callbacks.onRestart();
                }
            } else if (msg.action === 'speed') {
                if (typeof this.callbacks.onSpeed === 'function') {
                    this.callbacks.onSpeed(msg.speed || 1);
                }
            } else if (msg.action === 'chart') {
                if (msg.data && typeof this.callbacks.onChart === 'function') {
                    // 譜面即時同步：靜默套用，不彈出任何視窗
                    await this.callbacks.onChart(msg.data);
                }
            } else if (msg.action === 'audio_clear') {
                if (typeof this.callbacks.onAudioClear === 'function') {
                    await this.callbacks.onAudioClear();
                }
                this._incomingAudioChunks = null;
                this._incomingAudioMeta = null;
                this._incomingAudioCount = 0;
                this.showTransferProgress({
                    text: t('settings.connection.transferComplete') || '同步完成',
                    percent: 100,
                    completed: true
                });
            } else if (msg.action === 'audio_start') {
                this._incomingAudioMeta = msg;
                this._incomingAudioChunks = new Array(msg.totalChunks || 0);
                this._incomingAudioCount = 0;
                const songName = msg.fileName || 'track';
                this.showTransferProgress({
                    text: `${t('settings.connection.transferAudio') || '正在同步音源'} (${songName})...`,
                    percent: 50,
                    completed: false
                });
            } else if (msg.action === 'audio_chunk') {
                if (this._incomingAudioChunks && typeof msg.chunkIndex === 'number' && msg.data) {
                    const u8 = base64ToUint8Array(msg.data);
                    this._incomingAudioChunks[msg.chunkIndex] = u8;
                    this._incomingAudioCount++;
                    const total = msg.totalChunks || 1;
                    const pct = Math.min(95, Math.floor(50 + (this._incomingAudioCount / total) * 45));
                    this.showTransferProgress({
                        text: `${t('settings.connection.transferAudio') || '正在同步音源'} (${pct}%)...`,
                        percent: pct,
                        completed: false
                    });
                }
            } else if (msg.action === 'audio_end') {
                if (this._incomingAudioChunks && this._incomingAudioChunks.length > 0) {
                    try {
                        this.showTransferProgress({
                            text: t('settings.connection.audioSyncing') || '正在配置音源...',
                            percent: 98,
                            completed: false
                        });
                        const mimeType = this._incomingAudioMeta?.mimeType || 'audio/mp3';
                        const audioBlob = new Blob(this._incomingAudioChunks, { type: mimeType });
                        if (typeof this.callbacks.onAudio === 'function') {
                            await this.callbacks.onAudio(audioBlob, this._incomingAudioMeta);
                        }
                        this._incomingAudioChunks = null;
                        this._incomingAudioMeta = null;
                        this._incomingAudioCount = 0;
                        this.showTransferProgress({
                            text: t('settings.connection.transferComplete') || '同步完成',
                            percent: 100,
                            completed: true
                        });
                    } catch (err) {
                        console.error('[SyncManager Error assembling audio]', err);
                        this.showTransferProgress({
                            text: `音源載入失敗: ${err.message}`,
                            percent: 100,
                            completed: true
                        });
                    }
                }
            }
        } finally {
            this._isRemoteTriggered = false;
        }
    }

    // =========================================================
    // UI 視窗與彈窗 (右下角非侵入式懸浮傳輸進度卡片)
    // =========================================================

    showTransferProgress({ title = '同步媒體資源...', text = '', percent = 0, completed = false, onDone = null }) {
        if (!this._transferCardEl) {
            this._transferCardEl = document.createElement('div');
            this._transferCardEl.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 10000;
                background: #1e1e1e;
                color: #fff;
                padding: 14px 18px;
                border-radius: 8px;
                box-shadow: 0 4px 24px rgba(0, 0, 0, 0.65);
                border: 1px solid #383838;
                min-width: 280px;
                max-width: 380px;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                gap: 10px;
                font-family: inherit;
                pointer-events: auto;
                transition: opacity 0.3s ease, transform 0.3s ease;
            `;
            document.body.appendChild(this._transferCardEl);
        }

        const pct = Math.max(0, Math.min(100, Math.round(percent)));
        const iconName = completed ? 'check_circle' : 'audiotrack';
        const iconColor = completed ? '#4caf50' : '#4a90e2';

        this._transferCardEl.style.display = 'flex';
        this._transferCardEl.style.opacity = '1';
        this._transferCardEl.style.transform = 'translateY(0)';

        this._transferCardEl.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:13px; color:#fff;">
                    <span class="material-symbols-outlined" style="font-size:20px; color:${iconColor};" translate="no">${iconName}</span>
                    <span>${title}</span>
                </div>
                <span style="font-size:11px; color:#888;">${pct}%</span>
            </div>
            <div style="font-size:12px; color:#aaa; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${text || '傳輸中...'}
            </div>
            <div style="width:100%; height:6px; background:#2a2a2a; border-radius:3px; overflow:hidden;">
                <div style="height:100%; width:${pct}%; background:${iconColor}; transition:width 0.25s ease;"></div>
            </div>
        `;

        if (completed) {
            if (this._transferHideTimer) clearTimeout(this._transferHideTimer);
            this._transferHideTimer = setTimeout(() => {
                if (this._transferCardEl) {
                    this._transferCardEl.style.opacity = '0';
                    this._transferCardEl.style.transform = 'translateY(10px)';
                    setTimeout(() => {
                        if (this._transferCardEl) this._transferCardEl.style.display = 'none';
                        if (typeof onDone === 'function') onDone();
                    }, 350);
                }
            }, 1200);
        }
    }

    /**
     * 開啟統一的 WebRTC P2P 連線同步彈窗
     */
    openSyncModal(options = {}) {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '12px';
        container.style.width = '100%';
        container.style.boxSizing = 'border-box';

        const createRow = (labelText, element) => {
            const row = document.createElement('div');
            row.className = 'popup-setting-row';
            const label = document.createElement('span');
            label.className = 'popup-setting-label';
            label.textContent = labelText;
            row.appendChild(label);
            row.appendChild(element);
            return row;
        };

        // 1. 連線狀態列
        const statusRow = document.createElement('div');
        statusRow.className = 'popup-setting-row';
        const statusLabel = document.createElement('span');
        statusLabel.className = 'popup-setting-label';
        statusLabel.textContent = '連線狀態';

        const statusValue = document.createElement('span');
        statusValue.style.fontSize = '14px';
        statusValue.style.fontWeight = '500';
        statusValue.style.color = '#888';
        statusValue.textContent = t('settings.connection.statusDisconnected') || '狀態：未連線';

        statusRow.appendChild(statusLabel);
        statusRow.appendChild(statusValue);
        container.appendChild(statusRow);

        // 2. 同步角色選擇 (接收端 / 發起端)
        const roleSelect = document.createElement('select');
        roleSelect.className = 'popup-setting-select';
        roleSelect.style.padding = '6px 10px';
        roleSelect.style.borderRadius = '4px';

        const optClient = document.createElement('option');
        optClient.value = 'client';
        optClient.textContent = t('settings.connection.roleReceiver') || '接收端';
        const optHost = document.createElement('option');
        optHost.value = 'host';
        optHost.textContent = t('settings.connection.roleSender') || '發起端';
        roleSelect.appendChild(optClient);
        roleSelect.appendChild(optHost);
        roleSelect.value = this.role;

        container.appendChild(createRow(t('settings.connection.syncRole') || '同步角色', roleSelect));

        // 3. Client (接收端) 面板
        const clientBox = document.createElement('div');
        clientBox.style.display = this.role === 'client' ? 'flex' : 'none';
        clientBox.style.flexDirection = 'column';
        clientBox.style.gap = '10px';

        const codeInput = document.createElement('input');
        codeInput.type = 'text';
        codeInput.className = 'popup-setting-input';
        codeInput.maxLength = 6;
        codeInput.placeholder = '000000';
        codeInput.style.letterSpacing = '6px';
        codeInput.style.fontWeight = 'bold';
        codeInput.style.textAlign = 'center';
        codeInput.style.fontSize = '18px';
        codeInput.style.width = '140px';

        clientBox.appendChild(createRow(t('settings.connection.pairCode') || '配對碼', codeInput));

        const joinBtn = document.createElement('button');
        joinBtn.className = 'popup-button';
        joinBtn.textContent = t('settings.connection.joinBtn') || '手動加入連線';
        joinBtn.style.padding = '8px 16px';
        joinBtn.style.width = '100%';
        clientBox.appendChild(joinBtn);

        container.appendChild(clientBox);

        // 4. Host (發起端) 面板
        const hostBox = document.createElement('div');
        hostBox.style.display = this.role === 'host' ? 'flex' : 'none';
        hostBox.style.flexDirection = 'column';
        hostBox.style.gap = '10px';

        const hostCodeDisplay = document.createElement('span');
        hostCodeDisplay.style.fontSize = '20px';
        hostCodeDisplay.style.fontWeight = 'bold';
        hostCodeDisplay.style.letterSpacing = '6px';
        hostCodeDisplay.style.color = '#00e5ff';
        hostCodeDisplay.textContent = this.sync.roomCode || '------';

        const createCodeBtn = document.createElement('button');
        createCodeBtn.className = 'popup-button';
        createCodeBtn.textContent = t('settings.connection.createBtn') || '產生配對碼';
        createCodeBtn.style.padding = '6px 14px';

        const hostRow = document.createElement('div');
        hostRow.className = 'popup-setting-row';
        hostRow.appendChild(hostCodeDisplay);
        hostRow.appendChild(createCodeBtn);
        hostBox.appendChild(createRow(t('settings.connection.hostStart') || '發起連線', hostRow));

        container.appendChild(hostBox);

        // 5. 手動同步專案按鈕
        const pushProjectBtn = document.createElement('button');
        pushProjectBtn.className = 'popup-button';
        pushProjectBtn.textContent = t('settings.connection.btnManualPush') || '手動同步專案';
        pushProjectBtn.style.padding = '8px 16px';
        pushProjectBtn.style.width = '100%';
        pushProjectBtn.style.backgroundColor = '#333';
        pushProjectBtn.style.border = '1px solid #555';
        pushProjectBtn.style.display = this.sync.isConnected() ? 'block' : 'none';
        pushProjectBtn.addEventListener('click', async () => {
            pushProjectBtn.disabled = true;
            try {
                await this.pushProject();
                simpleToast({ content: t('settings.connection.manualPushed') || '已發送專案至對端', type: 'success', timeout: 1500 });
            } catch (err) {
                simpleToast({ content: `同步失敗: ${err.message}`, type: 'error', timeout: 3000 });
            } finally {
                pushProjectBtn.disabled = false;
            }
        });
        container.appendChild(pushProjectBtn);

        // 6. 中斷連線按鈕
        const disconnectBtn = document.createElement('button');
        disconnectBtn.className = 'popup-button';
        disconnectBtn.textContent = t('settings.connection.disconnect') || '中斷連線';
        disconnectBtn.style.padding = '8px 16px';
        disconnectBtn.style.width = '100%';
        disconnectBtn.style.backgroundColor = '#d32f2f';
        disconnectBtn.style.display = this.sync.isConnected() ? 'block' : 'none';
        container.appendChild(disconnectBtn);

        const renderSyncUI = () => {
            const isWrtc = this.sync.isConnected();
            const isConnecting = this.sync.status === 'connecting';

            if (isWrtc) {
                const codeStr = this.sync.roomCode ? ` #${this.sync.roomCode}` : '';
                statusValue.textContent = t('settings.connection.webrtcConnected', { code: codeStr }) || `狀態：已連線 (P2P 房間${codeStr})`;
                statusValue.style.color = '#00e676';
                disconnectBtn.style.display = 'block';
                pushProjectBtn.style.display = 'block';
            } else if (isConnecting) {
                statusValue.textContent = t('settings.connection.statusConnecting') || '狀態：正在連線...';
                statusValue.style.color = '#ffab00';
                disconnectBtn.style.display = 'block';
                pushProjectBtn.style.display = 'none';
            } else {
                statusValue.textContent = t('settings.connection.statusDisconnected') || '狀態：未連線';
                statusValue.style.color = '#888';
                disconnectBtn.style.display = 'none';
                pushProjectBtn.style.display = 'none';
            }

            if (this.sync.roomCode) {
                hostCodeDisplay.textContent = this.sync.roomCode;
            }
        };

        this._modalUpdater = renderSyncUI;
        renderSyncUI();

        roleSelect.addEventListener('change', (e) => {
            this.role = e.target.value;
            localStorage.setItem('wmcx_webrtc_role', this.role);
            clientBox.style.display = this.role === 'client' ? 'flex' : 'none';
            hostBox.style.display = this.role === 'host' ? 'flex' : 'none';
        });

        joinBtn.addEventListener('click', async () => {
            if (options.onBeforeConnect) {
                try { await options.onBeforeConnect(); } catch (_) { }
            }
            const code = codeInput.value.trim();
            if (code.length !== 6) {
                simpleToast({ content: t('settings.connection.pairCodePlaceholder') || '請輸入完整的 6 位數配對碼', type: 'warning', timeout: 2000 });
                return;
            }
            joinBtn.disabled = true;
            joinBtn.textContent = t('settings.connection.joining') || '加入中...';
            try {
                await this.sync.joinRoom(code);
                simpleToast({ content: `${t('settings.connection.statusConnecting') || '正在連線...'} (${code})`, type: 'info', timeout: 2000 });
            } catch (e) {
                simpleToast({ content: `連線失敗: ${e.message}`, type: 'error', timeout: 3000 });
            } finally {
                joinBtn.disabled = false;
                joinBtn.textContent = t('settings.connection.joinBtn') || '手動加入連線';
                renderSyncUI();
            }
        });

        createCodeBtn.addEventListener('click', async () => {
            createCodeBtn.disabled = true;
            createCodeBtn.textContent = t('settings.connection.creating') || '產生中...';
            try {
                const code = await this.sync.createRoom();
                hostCodeDisplay.textContent = code;
                simpleToast({ content: t('settings.connection.toastPairCodeReady', { code }) || `配對碼 ${code} 已就緒，請在另一端輸入`, type: 'success', timeout: 3000 });
            } catch (e) {
                simpleToast({ content: `建立失敗: ${e.message}`, type: 'error', timeout: 3000 });
            } finally {
                createCodeBtn.disabled = false;
                createCodeBtn.textContent = t('settings.connection.regenerateBtn') || '重新產生';
                renderSyncUI();
            }
        });

        disconnectBtn.addEventListener('click', () => {
            this.sync.disconnect();
            renderSyncUI();
            simpleToast({ content: t('settings.connection.webrtcDisconnectedToast') || '已中斷 WebRTC 連線', type: 'info', timeout: 1500 });
        });

        return popupWindow({
            title: options.title || t('settings.connection.syncView') || '設定同步檢視',
            customContent: container,
            width: '90%',
            maxWidth: '440px',
            buttons: [
                {
                    text: t('popup.close') || '關閉',
                    onClick: () => {
                        this._modalUpdater = null;
                    },
                    hideOnClick: true
                }
            ]
        });
    }

    updateButtonUI(connectionBtn) {
        if (!connectionBtn) return;
        const isWrtc = this.sync.isConnected();
        const isConnecting = this.sync.status === 'connecting';

        connectionBtn.classList.remove('connected', 'connecting');
        if (isWrtc) {
            connectionBtn.classList.add('connected');
            connectionBtn.title = t('settings.connection.clientP2P') || 'WebRTC P2P 已連線';
        } else if (isConnecting) {
            connectionBtn.classList.add('connecting');
            connectionBtn.title = t('settings.connection.statusConnecting') || '正在連線...';
        } else {
            connectionBtn.title = t('settings.connection.syncRole') || '連線同步設定';
        }
    }
}
