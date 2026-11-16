/**
 * MajdataViewX WebSocket Client Manager
 * Handles WebSocket connection and synchronization with MajdataView / MajdataViewX (Unity simulator)
 *
 * Supported server protocols (auto-detected on connect):
 * - 'majprotocol-v2': Binary OpCode framing (MajdataViewX master / MajProtocol 2.0)
 * - 'memorypack':     MemoryPack binary framing (MajdataViewX v6.2.0)
 * - 'flat-json':      UTF-8 binary JSON with numeric `type` field (MajdataViewX pre-MajProtocol)
 * - 'majprotocol-v1': UTF-8 binary JSON with `protocolVersion` envelope (MajProtocol 1.2)
 * - 'legacy-json':    Text/binary JSON with `{ requestType, requestData }` (MajdataView <= v6.1.1)
 */

import { t } from './i18n.js';
import { appContext } from './core/appContext.js';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8');
const utf16Decoder = new TextDecoder('utf-16le');

const OP_CODE = Object.freeze({
    HANDSHAKE: 0,
    FILES: 1,
    SIMAI: 2,
    PLAY: 3,
    PAUSE: 4,
    OPTIONS: 5,
    STATE: 6,
    UNLOAD: 7
});

const MEMORYPACK_TAG = Object.freeze({
    SETTING: 0,
    LOAD: 1,
    UPDATE: 2,
    PLAY: 3,
    PAUSE: 4,
    STOP: 5,
    STATE: 6
});

const FLAT_JSON_TYPE = Object.freeze({
    SETTING: 0,
    LOAD: 1,
    UPDATE: 2,
    PLAY: 3,
    PAUSE: 4,
    STOP: 5,
    STATE: 6
});

const VALID_MEMORYPACK_RESPONSE_TYPES = new Set([200, 201, 202, 203, 204, 205, 206, 400]);

class BinaryPacketWriter {
    constructor(initialCapacity = 256) {
        this.buffer = new Uint8Array(initialCapacity);
        this.view = new DataView(this.buffer.buffer);
        this.offset = 0;
    }

    _ensure(extra) {
        const needed = this.offset + extra;
        if (needed <= this.buffer.length) return;
        let nextSize = this.buffer.length * 2;
        while (nextSize < needed) nextSize *= 2;
        const next = new Uint8Array(nextSize);
        next.set(this.buffer.subarray(0, this.offset));
        this.buffer = next;
        this.view = new DataView(this.buffer.buffer);
    }

    writeUint8(value) {
        this._ensure(1);
        this.buffer[this.offset++] = value & 0xff;
    }

    writeBool(value) {
        this.writeUint8(value ? 1 : 0);
    }

    writeInt32(value) {
        this._ensure(4);
        this.view.setInt32(this.offset, value | 0, true);
        this.offset += 4;
    }

    writeFloat32(value) {
        this._ensure(4);
        this.view.setFloat32(this.offset, Number(value) || 0, true);
        this.offset += 4;
    }

    writeFloat64(value) {
        this._ensure(8);
        this.view.setFloat64(this.offset, Number(value) || 0, true);
        this.offset += 8;
    }

    writeBytes(bytes) {
        if (!bytes || bytes.length === 0) return;
        this._ensure(bytes.length);
        this.buffer.set(bytes, this.offset);
        this.offset += bytes.length;
    }

    /** MajProtocol 2.0 string format: int32LE(utf8ByteLen) + UTF-8 bytes */
    writeMajString(str) {
        const encoded = utf8Encoder.encode(str == null ? '' : String(str));
        this.writeInt32(encoded.length);
        this.writeBytes(encoded);
    }

    /** MemoryPack string format: -1=null, 0=empty, ~utf8Len + utf16Len + UTF-8 bytes */
    writeMemoryPackString(str) {
        if (str === null || str === undefined) {
            this.writeInt32(-1);
            return;
        }
        const s = String(str);
        if (s.length === 0) {
            this.writeInt32(0);
            return;
        }
        const encoded = utf8Encoder.encode(s);
        this.writeInt32(~encoded.length);
        this.writeInt32(s.length);
        this.writeBytes(encoded);
    }

    toUint8Array() {
        return this.buffer.slice(0, this.offset);
    }
}

function readMemoryPackString(bytes, view, offset) {
    if (offset + 4 > bytes.byteLength) {
        return { value: null, offset: bytes.byteLength };
    }
    const header = view.getInt32(offset, true);
    offset += 4;
    if (header === -1) {
        return { value: null, offset };
    }
    if (header === 0) {
        return { value: '', offset };
    }
    if (header > 0) {
        const byteLen = header * 2;
        if (offset + byteLen > bytes.byteLength) {
            return { value: null, offset: bytes.byteLength };
        }
        const slice = bytes.subarray(offset, offset + byteLen);
        return { value: utf16Decoder.decode(slice), offset: offset + byteLen };
    }
    const utf8ByteCount = ~header;
    if (offset + 4 + utf8ByteCount > bytes.byteLength) {
        return { value: null, offset: bytes.byteLength };
    }
    offset += 4; // skip utf16Length
    const slice = bytes.subarray(offset, offset + utf8ByteCount);
    return { value: utf8Decoder.decode(slice), offset: offset + utf8ByteCount };
}

export function decodeMemoryPackResponse(bytes) {
    if (!bytes || bytes.byteLength < 6) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    const memberCount = bytes[offset++];
    if (memberCount === 255 || memberCount < 1) return null;

    const responseType = view.getInt32(offset, true);
    if (!VALID_MEMORYPACK_RESPONSE_TYPES.has(responseType)) return null;
    offset += 4;

    let summary = null;
    if (memberCount >= 2 && offset < bytes.byteLength) {
        const summaryMembers = bytes[offset++];
        if (summaryMembers !== 255 && summaryMembers >= 1 && offset + 4 <= bytes.byteLength) {
            const state = view.getInt32(offset, true);
            offset += 4;
            let errMsg = '';
            if (summaryMembers >= 2) {
                const res = readMemoryPackString(bytes, view, offset);
                errMsg = res.value ?? '';
                offset = res.offset;
            }
            summary = { state, errMsg };
        }
    }

    let error = null;
    if (memberCount >= 3 && offset < bytes.byteLength) {
        const res = readMemoryPackString(bytes, view, offset);
        error = res.value;
    }

    return { responseType, summary, error };
}

export function decodeMajProtocolV2Response(bytes) {
    if (!bytes || bytes.byteLength < 2) return null;
    const opCode = bytes[0];
    if (bytes.byteLength === 10 && opCode === OP_CODE.STATE) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return {
            opCode,
            position: view.getFloat64(1, true),
            isPlaying: bytes[9] !== 0
        };
    }
    if (bytes.byteLength === 2 && opCode <= OP_CODE.UNLOAD) {
        return {
            opCode,
            accepted: bytes[1] !== 0
        };
    }
    return null;
}

function detectJsonProtocol(msg) {
    if (!msg || typeof msg !== 'object') return 'legacy-json';
    if (
        Object.prototype.hasOwnProperty.call(msg, 'protocolVersion') ||
        msg.responseType === 'Ok' ||
        msg.responseType === 'Error' ||
        msg.responseType === 'Event'
    ) {
        return 'majprotocol-v1';
    }
    if (
        Object.prototype.hasOwnProperty.call(msg, 'summary') ||
        (Object.prototype.hasOwnProperty.call(msg, 'error') && !Object.prototype.hasOwnProperty.call(msg, 'responseData'))
    ) {
        return 'flat-json';
    }
    return 'legacy-json';
}

export class MajdataWsClient {
    constructor() {
        this.url = 'ws://127.0.0.1:8083/majdata';
        this.ws = null;
        this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
        this.protocol = null; // 'majprotocol-v2' | 'memorypack' | 'flat-json' | 'majprotocol-v1' | 'legacy-json'
        this.lastHeartbeat = null;
        this.lastState = null;
        this.listeners = [];
        this.onToast = null; // Toast callback function
        this._probing = false;
        this._protocolConfirmed = false;
        this._binaryProbeTimer = null;
        this._probeTimer = null;
        this._expectProbeError = false;
        this._probeErrorTimer = null;
        this._memoryPackWarned = false;
        this._pendingOps = [];
        this._lastPlayParams = null;
        this._activeSocket = null;
    }

    setToastHandler(handler) {
        this.onToast = handler;
    }

    toast(msg, type = 'info', timeout = 2500) {
        if (typeof this.onToast === 'function') {
            this.onToast({ content: msg, type, timeout });
        } else {
            console.log(`[MajdataView WS ${type}] ${msg}`);
        }
    }

    onStatusChange(callback) {
        this.listeners.push(callback);
    }

    _setStatus(status) {
        this.status = status;
        this.listeners.forEach(cb => cb(status));
    }

    _getCurrentSettings() {
        if (appContext?.settings && Object.keys(appContext.settings).length > 0) {
            return appContext.settings;
        }
        if (typeof window !== 'undefined' && window.settings) {
            return window.settings;
        }
        return null;
    }

    _clearProbeTimers() {
        if (this._binaryProbeTimer) {
            clearTimeout(this._binaryProbeTimer);
            this._binaryProbeTimer = null;
        }
        if (this._probeTimer) {
            clearTimeout(this._probeTimer);
            this._probeTimer = null;
        }
        if (this._probeErrorTimer) {
            clearTimeout(this._probeErrorTimer);
            this._probeErrorTimer = null;
        }
    }

    _resetProtocolState() {
        this._clearProbeTimers();
        this.protocol = null;
        this._probing = false;
        this._protocolConfirmed = false;
        this._expectProbeError = false;
        this._memoryPackWarned = false;
        this._pendingOps = [];
    }

    isConnected() {
        return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
    }

    connect(targetUrl) {
        if (targetUrl) {
            this.url = targetUrl;
        }

        if (this.isConnected()) {
            this.toast(t('toast.majdataAlreadyConnected', { url: this.url }) || `已連接至 MajdataView (${this.url})`, 'warning');
            return;
        }

        if (this.ws) {
            try { this.ws.close(); } catch (_) { }
            this.ws = null;
        }

        this._resetProtocolState();
        this._setStatus('connecting');
        this.toast(t('toast.majdataConnecting', { url: this.url }) || `正在連接至 MajdataView (${this.url})...`, 'info', 2000);

        try {
            const socket = new WebSocket(this.url);
            this._activeSocket = socket;
            socket.binaryType = 'arraybuffer';

            socket.onopen = () => {
                if (this._activeSocket !== socket) return;
                this.ws = socket;
                this._setStatus('connected');
                this.toast(t('toast.majdataConnected', { url: this.url }) || `已成功連接至 MajdataView (${this.url})`, 'success', 3000);
                this._startProbe();
            };

            socket.onmessage = async (event) => {
                if (this._activeSocket !== socket) return;
                try {
                    const data = event?.data;
                    if (typeof data === 'string') {
                        this._handleJsonMessage(data);
                        return;
                    }
                    if (data instanceof ArrayBuffer) {
                        this._handleBinaryMessage(new Uint8Array(data));
                        return;
                    }
                    if (typeof Blob !== 'undefined' && data instanceof Blob) {
                        const buffer = await data.arrayBuffer();
                        this._handleBinaryMessage(new Uint8Array(buffer));
                        return;
                    }
                    if (ArrayBuffer.isView(data)) {
                        this._handleBinaryMessage(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
                        return;
                    }
                    console.warn('MajdataWS unsupported message payload type:', typeof data);
                } catch (e) {
                    console.error('MajdataWS msg parse error:', e);
                }
            };

            socket.onerror = (err) => {
                if (this._activeSocket !== socket) return;
                console.warn('MajdataWS error:', err);
                if (this.status === 'connecting') {
                    this.toast(t('toast.majdataConnectError', { url: this.url }) || `無法連接至 MajdataView (${this.url})，請確認 MajdataView 已啟動`, 'error', 4000);
                }
                this._resetProtocolState();
                this._setStatus('disconnected');
            };

            socket.onclose = () => {
                if (this._activeSocket !== socket) return;
                if (this.status === 'connected') {
                    this.toast(t('toast.majdataDisconnected') || '已中斷 MajdataView 連接', 'warning', 3000);
                }
                this._activeSocket = null;
                this.ws = null;
                this._lastPlayParams = null;
                this._resetProtocolState();
                this._setStatus('disconnected');
            };
        } catch (e) {
            console.error('MajdataWS connect Exception:', e);
            this.toast(t('toast.majdataConnectError', { url: this.url }) || `無法連接至 MajdataView (${this.url})`, 'error', 4000);
            this._activeSocket = null;
            this._resetProtocolState();
            this._setStatus('disconnected');
        }
    }

    disconnect() {
        this._activeSocket = null;
        if (this.ws) {
            if (!this._probing && this.isConnected()) {
                try { this.sendStop(); } catch (_) { }
            }
            const ws = this.ws;
            this.ws = null;
            this._lastPlayParams = null;
            this._resetProtocolState();
            this._setStatus('disconnected');
            try { ws.close(); } catch (_) { }
        } else {
            this._lastPlayParams = null;
            this._resetProtocolState();
            this._setStatus('disconnected');
        }
        this.toast(t('toast.majdataDisconnected') || '已中斷 MajdataView 連接', 'info', 2000);
    }

    toggleConnection(targetUrl) {
        if (this.isConnected()) {
            this.disconnect();
        } else {
            this.connect(targetUrl);
        }
    }

    _startProbe() {
        this._clearProbeTimers();
        this.protocol = null;
        this._protocolConfirmed = false;
        this._probing = true;
        this._expectProbeError = true;

        // Phase 1: send universal JSON State probe first so v6.1.1 (which re-throws in HandleMessageAsync) never crashes its ProcessQueue.
        // MajProtocol 2.0 treats '{' (0x7B = 123) as an unknown OpCode and silently ignores it.
        this._sendRaw(JSON.stringify({
            protocolVersion: 3,
            requestType: 'State',
            requestData: {},
            type: FLAT_JSON_TYPE.STATE
        }), 'StateProbe');

        this._probeErrorTimer = setTimeout(() => {
            this._expectProbeError = false;
            this._probeErrorTimer = null;
        }, 2000);

        // Phase 2: if no JSON / MemoryPack response within 150ms, probe MajProtocol 2.0 with binary StateRequest [6, 0].
        this._binaryProbeTimer = setTimeout(() => {
            this._binaryProbeTimer = null;
            if (!this._probing || !this.isConnected()) return;
            this._sendRaw(new Uint8Array([OP_CODE.STATE, 0]), 'StateProbe(v2)');
        }, 150);

        this._probeTimer = setTimeout(() => {
            this._probeTimer = null;
            if (!this._probing || !this.isConnected()) return;
            this._probing = false;
            this.protocol = 'legacy-json';
            this.send('State', {});
            const currentSettings = this._getCurrentSettings();
            if (currentSettings) {
                this.sendSetting(currentSettings);
            }
            this.sendLoad({ trackPath: '', imagePath: '', videoPath: '' });
            this._flushPendingOps();
        }, 600);
    }

    _completeProbe(detectedProtocol) {
        if (this._binaryProbeTimer) {
            clearTimeout(this._binaryProbeTimer);
            this._binaryProbeTimer = null;
        }
        if (this._probeTimer) {
            clearTimeout(this._probeTimer);
            this._probeTimer = null;
        }

        const needsSync = this._probing || !this._protocolConfirmed || this.protocol !== detectedProtocol;
        this._probing = false;
        this._protocolConfirmed = true;
        this.protocol = detectedProtocol;

        if (detectedProtocol === 'majprotocol-v2') {
            this._expectProbeError = false;
            if (this._probeErrorTimer) {
                clearTimeout(this._probeErrorTimer);
                this._probeErrorTimer = null;
            }
        }

        if (detectedProtocol === 'memorypack' && !this._memoryPackWarned) {
            this._memoryPackWarned = true;
            this.toast(
                'MajdataViewX v6.2.0 使用本地共享記憶體傳輸譜面，瀏覽器無法直接傳送音符，建議使用 v6.1.1 或支援 MajProtocol 2.0 的版本',
                'warning',
                6000
            );
        }

        if (needsSync && this.isConnected()) {
            const currentSettings = this._getCurrentSettings();
            if (currentSettings) {
                this.sendSetting(currentSettings);
            }
            this.sendLoad({ trackPath: '', imagePath: '', videoPath: '' });
        }

        this._flushPendingOps();
    }

    _flushPendingOps() {
        if (!this._pendingOps.length) return;
        const ops = this._pendingOps.splice(0);
        for (const fn of ops) {
            try { fn(); } catch (e) { console.error('MajdataWS queued op error:', e); }
        }
    }

    _consumeProbeError() {
        if (!this._expectProbeError) return false;
        this._expectProbeError = false;
        if (this._probeErrorTimer) {
            clearTimeout(this._probeErrorTimer);
            this._probeErrorTimer = null;
        }
        return true;
    }

    _handleBinaryMessage(bytes) {
        if (!bytes || bytes.byteLength === 0) return;

        // UTF-8 JSON sent as binary WebSocket frame (flat-json, majprotocol-v1, or some legacy servers)
        if (bytes[0] === 0x7b) {
            this._handleJsonMessage(utf8Decoder.decode(bytes));
            return;
        }

        const v2Rsp = decodeMajProtocolV2Response(bytes);
        if (v2Rsp) {
            this._completeProbe('majprotocol-v2');
            this._handleMajProtocolV2Response(v2Rsp);
            return;
        }

        const mpRsp = decodeMemoryPackResponse(bytes);
        if (mpRsp) {
            this._completeProbe('memorypack');
            this._handleMemoryPackResponse(mpRsp);
            return;
        }

        console.warn('MajdataWS unknown binary frame:', bytes);
    }

    _handleJsonMessage(text) {
        const msg = JSON.parse(text);
        const detected = detectJsonProtocol(msg);
        if (this._probing || !this._protocolConfirmed) {
            this._completeProbe(detected);
        }

        if (detected === 'majprotocol-v1') {
            const rType = msg.responseType;
            if (rType === 'Error' || rType === 0) {
                if (this._consumeProbeError()) return;
                const errText = msg.responseData?.errMsg || (typeof msg.responseData === 'string' ? msg.responseData : '') || '播放失敗';
                console.error('MajdataViewX Error:', msg.responseData);
                this.toast(`MajdataView 錯誤: ${errText}`, 'error', 4000);
            } else if (rType === 'Event' || rType === 2) {
                const evt = msg.responseData;
                if (evt?.eventType === 'Heartbeat' || evt?.eventType === 5) {
                    this.lastHeartbeat = evt.summary ?? evt;
                } else {
                    if (evt?.summary) this.lastState = evt.summary;
                    console.log('MajdataWS event:', evt);
                }
            } else {
                this._expectProbeError = false;
                if (msg.responseData) this.lastState = msg.responseData;
                console.log('MajdataWS response:', msg);
            }
            return;
        }

        if (detected === 'flat-json') {
            const rType = msg.responseType;
            if (rType === 203 || rType === 'Heartbeat') {
                this.lastHeartbeat = msg.summary ?? null;
            } else if (rType === 400 || rType === 'Error') {
                if (this._consumeProbeError()) return;
                const errText = msg.error || msg.summary?.errMsg || '播放失敗';
                console.error('MajdataViewX Error:', errText);
                this.toast(`MajdataView 錯誤: ${errText}`, 'error', 4000);
            } else {
                this._expectProbeError = false;
                if (msg.summary) this.lastState = msg.summary;
                console.log('MajdataWS response:', msg);
            }
            return;
        }

        // legacy-json
        if (msg.responseType === 203 || msg.responseType === 'Heartbeat') {
            this.lastHeartbeat = msg.responseData;
        } else if (msg.responseType === 400 || msg.responseType === 'Error') {
            if (this._consumeProbeError()) return;
            console.error('MajdataViewX Error:', msg.responseData);
            this.toast(`MajdataView 錯誤: ${msg.responseData || '播放失敗'}`, 'error', 4000);
        } else {
            this._expectProbeError = false;
            console.log('MajdataWS response:', msg);
        }
    }

    _handleMajProtocolV2Response(rsp) {
        if (rsp.opCode === OP_CODE.STATE) {
            this.lastState = { position: rsp.position, isPlaying: rsp.isPlaying };
            return;
        }
        if (!rsp.accepted) {
            if (rsp.opCode === OP_CODE.HANDSHAKE) {
                console.error('MajdataViewX handshake rejected (protocol version mismatch)');
                this.toast('MajdataView 錯誤: 協議版本不相符', 'error', 4000);
            } else if (rsp.opCode === OP_CODE.PLAY) {
                console.error('MajdataViewX Play rejected');
                this.toast('MajdataView 錯誤: 播放失敗', 'error', 4000);
            } else {
                console.warn(`MajdataWS opCode [${rsp.opCode}] rejected (accepted=false)`);
            }
        }
    }

    _handleMemoryPackResponse(rsp) {
        if (rsp.responseType === 203) {
            this.lastHeartbeat = rsp.summary;
        } else if (rsp.responseType === 400) {
            if (this._consumeProbeError()) return;
            const errText = rsp.error || rsp.summary?.errMsg || '播放失敗';
            console.error('MajdataViewX Error:', errText);
            this.toast(`MajdataView 錯誤: ${errText}`, 'error', 4000);
        } else {
            this._expectProbeError = false;
            if (rsp.summary) this.lastState = rsp.summary;
            console.log('MajdataWS response:', rsp);
        }
    }

    _sendRaw(data, label = 'raw') {
        if (!this.isConnected()) return false;
        try {
            this.ws.send(data);
            return true;
        } catch (e) {
            console.error(`MajdataWS send [${label}] error:`, e);
            return false;
        }
    }

    _dispatchOrQueue(fn) {
        if (!this.isConnected()) return false;
        if (this._probing && !this.protocol) {
            this._pendingOps.push(fn);
            return true;
        }
        return fn();
    }

    send(requestType, requestData = {}) {
        if (!this.isConnected()) return false;
        try {
            const payload = JSON.stringify({
                requestType,
                requestData
            });
            this.ws.send(payload);
            return true;
        } catch (e) {
            console.error(`MajdataWS send [${requestType}] error:`, e);
            return false;
        }
    }

    _sendProtocolEnvelope(requestType, requestData = {}) {
        if (!this.isConnected()) return false;
        try {
            const payload = JSON.stringify({
                protocolVersion: 3,
                requestType,
                requestData
            });
            this.ws.send(payload);
            return true;
        } catch (e) {
            console.error(`MajdataWS send [${requestType}] error:`, e);
            return false;
        }
    }

    _sendFlatJson(payloadObj, label) {
        if (!this.isConnected()) return false;
        try {
            this.ws.send(JSON.stringify(payloadObj));
            return true;
        } catch (e) {
            console.error(`MajdataWS send [${label}] error:`, e);
            return false;
        }
    }

    _extractSettingsValues(settings = {}) {
        const bgDim = settings.moviebrightness !== undefined
            ? Math.min(1, Math.max(0, 1 + 0.1875 * settings.moviebrightness))
            : 0.7;

        const sfx = settings.sfxVolumes || {};
        const globalVol = settings.globalVolume ?? 1;
        const sfxVol = settings.SfxVolume ?? 1;

        return {
            tapSpeed: settings.speed ?? 7.5,
            touchSpeed: settings.touchSpeed ?? 7.5,
            smoothSlideAnime: false,
            backgroundDim: bgDim,
            backgroundOutsideDim: 0.3,
            comboStatusType: settings.middleDisplay ?? 1,
            autoMode: 0, // AutoPlayMode.Enable = 0
            showHand: false,
            outputFps: 60,
            exportQuality: 2,
            resizeBg: false,
            uiType: 0,
            globalAudioOffset: 0,
            legacySlideLayer: false,
            mineAutoSlide: true,
            trackVolume: (settings.musicVolume ?? 0.8) * globalVol,
            answerVolume: (sfx['answer'] ?? 1.0) * sfxVol * globalVol,
            tapVolume: (sfx['touch'] ?? 0.4) * sfxVol * globalVol,
            slideVolume: (sfx['slide'] ?? 0.4) * sfxVol * globalVol,
            breakVolume: (sfx['break'] ?? 0.4) * sfxVol * globalVol,
            breakSlideVolume: (sfx['judge_break_slide'] ?? 0.4) * sfxVol * globalVol,
            exVolume: (sfx['judge_ex'] ?? 0.4) * sfxVol * globalVol,
            touchVolume: (sfx['touch'] ?? 0.4) * sfxVol * globalVol,
            hanabiVolume: (sfx['hanabi'] ?? 0.6) * sfxVol * globalVol
        };
    }

    play(playParams = {}) {
        return this._dispatchOrQueue(() => this._sendPlay(playParams));
    }

    _sendPlay(playParams = {}) {
        const {
            mode = 0,
            startAt = 0,
            speed = 1.0,
            title = '',
            artist = '',
            offset = 0,
            designer = '',
            level = '',
            fumen = '',
            commands = [],
            difficulty = 3,
            maidataPath = null
        } = playParams;

        this._lastPlayParams = {
            mode,
            startAt,
            speed,
            title,
            artist,
            offset,
            designer,
            level,
            fumen,
            commands,
            difficulty,
            maidataPath
        };

        const safeStartAt = Math.max(0, startAt || 0);
        const safeSpeed = speed || 1.0;

        switch (this.protocol) {
            case 'majprotocol-v2': {
                const simai = new BinaryPacketWriter();
                simai.writeUint8(OP_CODE.SIMAI);
                simai.writeFloat64(offset);
                simai.writeMajString(title);
                simai.writeMajString(artist);
                simai.writeMajString(designer);
                simai.writeMajString(level);
                simai.writeInt32(difficulty);
                simai.writeMajString(fumen);
                if (!this._sendRaw(simai.toUint8Array(), 'Simai')) return false;

                const play = new BinaryPacketWriter(32);
                play.writeUint8(OP_CODE.PLAY);
                play.writeFloat64(safeStartAt);
                play.writeFloat32(safeSpeed);
                play.writeBool(mode === 1 || mode === 2); // showIntroAnimation
                play.writeBool(mode === 2); // record
                return this._sendRaw(play.toUint8Array(), 'Play');
            }
            case 'memorypack': {
                const w = new BinaryPacketWriter(64);
                w.writeUint8(MEMORYPACK_TAG.PLAY);
                w.writeUint8(4); // MajWsPlayRequest members
                w.writeInt32(mode);
                w.writeFloat64(safeStartAt);
                w.writeFloat32(safeSpeed);
                w.writeMemoryPackString(maidataPath || null);
                return this._sendRaw(w.toUint8Array(), 'Play(MemoryPack)');
            }
            case 'flat-json': {
                const okUpdate = this._sendFlatJson({
                    type: FLAT_JSON_TYPE.UPDATE,
                    chartText: fumen,
                    selectedDifficulty: difficulty,
                    title,
                    artist,
                    level,
                    designer,
                    offset: Number(offset) || 0,
                    clockCount: 4
                }, 'Update');
                if (!okUpdate) return false;

                return this._sendFlatJson({
                    type: FLAT_JSON_TYPE.PLAY,
                    playMode: mode,
                    startAt: safeStartAt,
                    speed: safeSpeed,
                    maidataPath: maidataPath || null
                }, 'Play');
            }
            case 'majprotocol-v1': {
                const okParse = this._sendProtocolEnvelope('Parse', {
                    simaiFumen: fumen,
                    clockCount: 4,
                    offset: Number(offset) || 0,
                    title,
                    artist,
                    level,
                    designer,
                    difficulty
                });
                if (!okParse) return false;

                return this._sendProtocolEnvelope('Play', {
                    playMode: mode,
                    startAt: safeStartAt,
                    speed: safeSpeed,
                    maidataPath: maidataPath || null
                });
            }
            case 'legacy-json':
            default:
                return this.send('Play', {
                    Mode: mode,
                    StartAt: safeStartAt,
                    Speed: safeSpeed,
                    Title: title,
                    Artist: artist,
                    Offset: offset,
                    Designer: designer,
                    Level: level,
                    Fumen: fumen,
                    Commands: Array.isArray(commands) ? commands : [],
                    Difficulty: difficulty,
                    MaidataPath: maidataPath || null
                });
        }
    }

    pause() {
        return this._dispatchOrQueue(() => {
            switch (this.protocol) {
                case 'majprotocol-v2':
                    return this._sendRaw(new Uint8Array([OP_CODE.PAUSE]), 'Pause');
                case 'memorypack':
                    return this._sendRaw(new Uint8Array([MEMORYPACK_TAG.PAUSE, 0]), 'Pause(MemoryPack)');
                case 'flat-json':
                    return this._sendFlatJson({ type: FLAT_JSON_TYPE.PAUSE }, 'Pause');
                case 'majprotocol-v1':
                    return this._sendProtocolEnvelope('Pause', {});
                case 'legacy-json':
                default:
                    return this.send('Pause', {});
            }
        });
    }

    resume() {
        return this._dispatchOrQueue(() => {
            switch (this.protocol) {
                case 'majprotocol-v2':
                    if (this._lastPlayParams) {
                        const play = new BinaryPacketWriter(32);
                        play.writeUint8(OP_CODE.PLAY);
                        play.writeFloat64(Math.max(0, this._lastPlayParams.startAt || 0));
                        play.writeFloat32(this._lastPlayParams.speed || 1.0);
                        play.writeBool(this._lastPlayParams.mode === 1 || this._lastPlayParams.mode === 2);
                        play.writeBool(this._lastPlayParams.mode === 2);
                        return this._sendRaw(play.toUint8Array(), 'Resume(Play)');
                    }
                    return false;
                case 'memorypack':
                    if (this._lastPlayParams) {
                        return this._sendPlay(this._lastPlayParams);
                    }
                    return false;
                case 'flat-json':
                    if (this._lastPlayParams) {
                        return this._sendFlatJson({
                            type: FLAT_JSON_TYPE.PLAY,
                            playMode: this._lastPlayParams.mode ?? 0,
                            startAt: Math.max(0, this._lastPlayParams.startAt || 0),
                            speed: this._lastPlayParams.speed || 1.0,
                            maidataPath: this._lastPlayParams.maidataPath || null
                        }, 'Resume(Play)');
                    }
                    return false;
                case 'majprotocol-v1':
                    return this._sendProtocolEnvelope('Resume', {});
                case 'legacy-json':
                default:
                    return this.send('Resume', {});
            }
        });
    }

    stop() {
        return this._dispatchOrQueue(() => {
            switch (this.protocol) {
                case 'majprotocol-v2':
                    // MajProtocol 2.0 merges Stop into Pause
                    return this._sendRaw(new Uint8Array([OP_CODE.PAUSE]), 'Stop(Pause)');
                case 'memorypack':
                    return this._sendRaw(new Uint8Array([MEMORYPACK_TAG.STOP, 0]), 'Stop(MemoryPack)');
                case 'flat-json':
                    return this._sendFlatJson({ type: FLAT_JSON_TYPE.STOP }, 'Stop');
                case 'majprotocol-v1':
                    return this._sendProtocolEnvelope('Stop', {});
                case 'legacy-json':
                default:
                    return this.send('Stop', {});
            }
        });
    }

    sendStop() {
        return this.stop();
    }

    unload() {
        return this._dispatchOrQueue(() => {
            if (this.protocol === 'majprotocol-v2') {
                return this._sendRaw(new Uint8Array([OP_CODE.UNLOAD]), 'Unload');
            }
            return this.stop();
        });
    }

    sendState() {
        return this._dispatchOrQueue(() => {
            switch (this.protocol) {
                case 'majprotocol-v2':
                    return this._sendRaw(new Uint8Array([OP_CODE.STATE]), 'State');
                case 'memorypack':
                    return this._sendRaw(new Uint8Array([MEMORYPACK_TAG.STATE, 0]), 'State(MemoryPack)');
                case 'flat-json':
                    return this._sendFlatJson({ type: FLAT_JSON_TYPE.STATE }, 'State');
                case 'majprotocol-v1':
                    return this._sendProtocolEnvelope('State', {});
                case 'legacy-json':
                default:
                    return this.send('State', {});
            }
        });
    }

    sendLoad(loadParams = {}) {
        return this._dispatchOrQueue(() => {
            const {
                trackPath = '',
                imagePath = '',
                videoPath = ''
            } = loadParams;

            switch (this.protocol) {
                case 'majprotocol-v2': {
                    const w = new BinaryPacketWriter(64);
                    w.writeUint8(OP_CODE.FILES);
                    w.writeMajString(trackPath || '');
                    w.writeMajString(imagePath || '');
                    w.writeMajString(videoPath || '');
                    return this._sendRaw(w.toUint8Array(), 'Files');
                }
                case 'memorypack': {
                    const w = new BinaryPacketWriter(64);
                    w.writeUint8(MEMORYPACK_TAG.LOAD);
                    w.writeUint8(3); // MajWsLoadRequest members
                    w.writeMemoryPackString(trackPath || '');
                    w.writeMemoryPackString(imagePath || '');
                    w.writeMemoryPackString(videoPath || '');
                    return this._sendRaw(w.toUint8Array(), 'Load(MemoryPack)');
                }
                case 'flat-json':
                    return this._sendFlatJson({
                        type: FLAT_JSON_TYPE.LOAD,
                        trackPath: trackPath || '',
                        imagePath: imagePath || '',
                        videoPath: videoPath || ''
                    }, 'Load');
                case 'majprotocol-v1':
                    return this._sendProtocolEnvelope('Load', {
                        trackPath: trackPath || '',
                        imagePath: imagePath || '',
                        videoPath: videoPath || ''
                    });
                case 'legacy-json':
                default:
                    return this.send('Load', {
                        TrackPath: trackPath || '',
                        ImagePath: imagePath || '',
                        VideoPath: videoPath || ''
                    });
            }
        });
    }

    sendSetting(settings = {}) {
        return this._dispatchOrQueue(() => {
            const v = this._extractSettingsValues(settings);

            switch (this.protocol) {
                case 'majprotocol-v2': {
                    const extraJson = JSON.stringify({
                        smoothSlideAnime: v.smoothSlideAnime,
                        backgroundDim: v.backgroundDim,
                        backgroundOutsideDim: v.backgroundOutsideDim,
                        comboStatusType: v.comboStatusType,
                        autoMode: v.autoMode,
                        showHand: v.showHand,
                        outputFps: v.outputFps,
                        exportQuality: v.exportQuality,
                        resizeBg: v.resizeBg,
                        uiType: v.uiType,
                        globalAudioOffset: v.globalAudioOffset,
                        legacySlideLayer: v.legacySlideLayer,
                        mineAutoSlide: v.mineAutoSlide
                    });

                    const w = new BinaryPacketWriter(256);
                    w.writeUint8(OP_CODE.OPTIONS);
                    w.writeFloat32(v.tapSpeed);
                    w.writeFloat32(v.touchSpeed);
                    w.writeFloat32(v.trackVolume);
                    w.writeFloat32(v.answerVolume);
                    w.writeFloat32(v.tapVolume);
                    w.writeFloat32(v.slideVolume);
                    w.writeFloat32(v.breakVolume);
                    w.writeFloat32(v.breakSlideVolume);
                    w.writeFloat32(v.exVolume);
                    w.writeFloat32(v.touchVolume);
                    w.writeFloat32(v.hanabiVolume);
                    w.writeMajString(extraJson);
                    return this._sendRaw(w.toUint8Array(), 'Options');
                }
                case 'memorypack': {
                    const w = new BinaryPacketWriter(128);
                    w.writeUint8(MEMORYPACK_TAG.SETTING);
                    w.writeUint8(2); // MajWsSettingRequest members
                    // MajViewSetting (15 members)
                    w.writeUint8(15);
                    w.writeFloat32(v.tapSpeed);
                    w.writeFloat32(v.touchSpeed);
                    w.writeBool(v.smoothSlideAnime);
                    w.writeFloat32(v.backgroundDim);
                    w.writeFloat32(v.backgroundOutsideDim);
                    w.writeInt32(v.comboStatusType);
                    w.writeInt32(v.autoMode);
                    w.writeBool(v.showHand);
                    w.writeInt32(v.outputFps);
                    w.writeInt32(v.exportQuality);
                    w.writeBool(v.resizeBg);
                    w.writeInt32(v.uiType);
                    w.writeFloat64(v.globalAudioOffset);
                    w.writeBool(v.legacySlideLayer);
                    w.writeBool(v.mineAutoSlide);
                    // MajVolumeSetting (9 members)
                    w.writeUint8(9);
                    w.writeFloat32(v.trackVolume);
                    w.writeFloat32(v.answerVolume);
                    w.writeFloat32(v.tapVolume);
                    w.writeFloat32(v.slideVolume);
                    w.writeFloat32(v.breakVolume);
                    w.writeFloat32(v.breakSlideVolume);
                    w.writeFloat32(v.exVolume);
                    w.writeFloat32(v.touchVolume);
                    w.writeFloat32(v.hanabiVolume);
                    return this._sendRaw(w.toUint8Array(), 'Setting(MemoryPack)');
                }
                case 'flat-json':
                case 'majprotocol-v1': {
                    const viewSetting = {
                        tapSpeed: v.tapSpeed,
                        touchSpeed: v.touchSpeed,
                        smoothSlideAnime: v.smoothSlideAnime,
                        backgroundDim: v.backgroundDim,
                        backgroundOutsideDim: v.backgroundOutsideDim,
                        comboStatusType: v.comboStatusType,
                        autoMode: v.autoMode,
                        showHand: v.showHand,
                        outputFps: v.outputFps,
                        exportQuality: v.exportQuality,
                        resizeBg: v.resizeBg,
                        uiType: v.uiType,
                        globalAudioOffset: v.globalAudioOffset,
                        legacySlideLayer: v.legacySlideLayer,
                        mineAutoSlide: v.mineAutoSlide
                    };
                    const volumeSetting = {
                        track: v.trackVolume,
                        answer: v.answerVolume,
                        tap: v.tapVolume,
                        slide: v.slideVolume,
                        break: v.breakVolume,
                        breakSlide: v.breakSlideVolume,
                        ex: v.exVolume,
                        touch: v.touchVolume,
                        hanabi: v.hanabiVolume
                    };
                    if (this.protocol === 'flat-json') {
                        return this._sendFlatJson({
                            type: FLAT_JSON_TYPE.SETTING,
                            viewSetting,
                            volumeSetting
                        }, 'Setting');
                    }
                    return this._sendProtocolEnvelope('Setting', {
                        viewSetting,
                        volumeSetting
                    });
                }
                case 'legacy-json':
                default: {
                    const viewSetting = {
                        TapSpeed: v.tapSpeed,
                        TouchSpeed: v.touchSpeed,
                        SmoothSlideAnime: v.smoothSlideAnime,
                        BackgroundDim: v.backgroundDim,
                        BackgroundOutsideDim: v.backgroundOutsideDim,
                        ComboStatusType: v.comboStatusType,
                        AutoMode: 1,
                        ShowHand: v.showHand,
                        OutputFps: v.outputFps,
                        ExportQuality: v.exportQuality,
                        ResizeBg: v.resizeBg,
                        UIType: v.uiType,
                        GlobalAudioOffset: v.globalAudioOffset,
                        LegacySlideLayer: v.legacySlideLayer,
                        MineAutoSlide: v.mineAutoSlide
                    };
                    const volumeSetting = {
                        Track: v.trackVolume,
                        Answer: v.answerVolume,
                        Tap: v.tapVolume,
                        Slide: v.slideVolume,
                        Break: v.breakVolume,
                        BreakSlide: v.breakSlideVolume,
                        Ex: v.exVolume,
                        Touch: v.touchVolume,
                        Hanabi: v.hanabiVolume
                    };
                    return this.send('Setting', {
                        ViewSetting: viewSetting,
                        VolumeSetting: volumeSetting
                    });
                }
            }
        });
    }
}

export const majdataWs = new MajdataWsClient();
