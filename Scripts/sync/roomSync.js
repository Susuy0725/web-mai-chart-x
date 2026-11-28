import { PlaybackStart } from './playbackStart.js';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const CONTROLS = new Set(['play', 'pause', 'seek', 'speed', 'restart']);
export const DEFAULT_WORKER_URL = 'https://wmcx-signal.manda201703.workers.dev';
const SIGNAL_ERRORS = {
    roomFull: 'roomFull',
    joinClosed: 'joinClosed',
    roomUnavailable: 'roomUnavailable',
    pairExpired: 'pairExpired',
    rateLimited: 'rateLimited'
};

export function createWebRtcSync(options) {
    return new RoomSync(options);
}

async function localDescription(pc, description) {
    await pc.setLocalDescription(description);
    if (pc.iceGatheringState !== 'complete') {
        await new Promise(resolve => {
            const finish = () => {
                clearTimeout(timer);
                pc.removeEventListener('icegatheringstatechange', check);
                resolve();
            };
            const check = () => { if (pc.iceGatheringState === 'complete') finish(); };
            const timer = setTimeout(finish, 1200);
            pc.addEventListener('icegatheringstatechange', check);
        });
    }
    return pc.localDescription.sdp;
}

export class RoomSync {
    constructor(options = {}) {
        this.workerUrl = options.workerUrl || DEFAULT_WORKER_URL;
        this.onStatusChange = options.onStatusChange || (() => {});
        this.onMessage = options.onMessage || (() => {});
        this.onError = options.onError || (error => console.warn('[WebRTC]', error));
        this.waitForPlaybackReady = options.waitForPlaybackReady;
        this.getPlaybackState = options.getPlaybackState;
        this.status = 'disconnected';
        this.role = null;
        this.roomCode = null;
        this.peers = new Map();
        this.occupied = 0;
        this.expiresAt = null;
        this.sequence = 0;
        this.playbackStart = new PlaybackStart({
            send: message => this.send(message),
            ready: options.waitForPlaybackReady,
            play: (startAt, speed) => this.onMessage({ action: 'play', startAt, speed })
        });
    }

    isConnected() {
        return this.channels().length > 0;
    }

    channels() {
        return Array.from(this.peers.values(), peer => peer.channel)
            .filter(channel => channel?.readyState === 'open');
    }

    createRoom() {
        return this.openSignaling('host', 'create');
    }

    joinRoom(code) {
        if (!/^\d{6}$/.test(code.trim())) return Promise.reject(new Error('roomUnavailable'));
        return this.openSignaling('client', `join/${code.trim()}`);
    }

    openSignaling(role, path) {
        this.disconnect();
        this.role = role;
        const url = new URL(`/api/room/${path}`, this.workerUrl);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(url);
        this.socket = socket;
        this.refresh();
        return new Promise((resolve, reject) => {
            let acknowledged = false;
            const acknowledge = code => {
                acknowledged = true;
                resolve(code);
            };
            socket.onmessage = async event => {
                if (this.socket !== socket) return;
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === 'error') throw new Error(SIGNAL_ERRORS[message.code] ?? 'roomUnavailable');
                    switch (message.type) {
                        case 'created':
                            this.roomCode = message.code;
                            this.expiresAt = message.expiresAt;
                            this.occupied = message.occupied;
                            this.refresh();
                            acknowledge(message.code);
                            break;
                        case 'joined': {
                            this.roomCode = path.slice(5);
                            const peer = this.addPeer(message.memberId, true);
                            const sdp = await localDescription(peer.pc, await peer.pc.createOffer());
                            if (this.peers.get(peer.id) === peer) this.signal({ type: 'offer', sdp });
                            acknowledge(this.roomCode);
                            break;
                        }
                        case 'occupancy':
                            this.occupied = message.occupied;
                            this.refresh();
                            break;
                        case 'offer':
                            await this.answerOffer(message);
                            break;
                        case 'answer': {
                            const peer = this.peers.get(message.memberId);
                            await peer?.pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
                            break;
                        }
                    }
                } catch (error) {
                    if (this.socket !== socket) return;
                    this.disconnect();
                    if (acknowledged) this.onError(error);
                    else reject(error);
                }
            };
            socket.onclose = event => {
                if (this.socket === socket) {
                    this.socket = null;
                    const completed = event.reason === 'signalingComplete' || event.reason === 'paired';
                    if (!this.isConnected() && !completed) this.disconnect();
                    else this.refresh();
                }
                reject(new Error('roomUnavailable'));
            };
        });
    }

    signal(message) {
        if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    }

    async answerOffer({ memberId, sdp }) {
        const peer = this.addPeer(memberId, false);
        try {
            await peer.pc.setRemoteDescription({ type: 'offer', sdp });
            const answer = await localDescription(peer.pc, await peer.pc.createAnswer());
            if (this.peers.get(memberId) === peer) this.signal({ type: 'answer', memberId, sdp: answer });
        } catch {
            this.removePeer(peer);
        }
    }

    addPeer(id, initiator) {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const peer = { id, pc };
        this.peers.set(id, peer);
        peer.timer = setTimeout(() => this.removePeer(peer), 30_000);
        pc.onconnectionstatechange = () => {
            if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) this.removePeer(peer);
        };
        if (initiator) this.attachChannel(peer, pc.createDataChannel('wmcx-sync'));
        else pc.ondatachannel = event => this.attachChannel(peer, event.channel);
        return peer;
    }

    attachChannel(peer, channel) {
        if (this.peers.get(peer.id) !== peer) return channel.close();
        peer.channel = channel;
        const onOpen = () => {
            clearTimeout(peer.timer);
            if (this.role === 'host') this.signal({ type: 'connected', memberId: peer.id });
            this.refresh();
        };
        channel.onopen = onOpen;
        channel.onclose = () => this.removePeer(peer);
        channel.onmessage = event => {
            try {
                this.receive(peer, JSON.parse(event.data));
            } catch (error) {
                console.warn('[WebRTC] Unable to handle room message', error);
            }
        };
        if (channel.readyState === 'open') onOpen();
    }

    removePeer(peer) {
        if (this.peers.get(peer.id) !== peer) return;
        this.peers.delete(peer.id);
        clearTimeout(peer.timer);
        peer.channel?.close();
        peer.pc.close();
        if (this.role === 'client') {
            this.disconnect();
            return;
        }
        this.signal({ type: 'release', memberId: peer.id });
        this.occupied = Math.max(this.channels().length + 1, this.occupied - 1);
        this.groupStart?.members.delete(peer);
        if (this.groupStart) this.commitIfReady(this.groupStart);
        this.refresh();
    }

    refresh() {
        this.status = this.isConnected() ? 'connected' : this.role ? 'connecting' : 'disconnected';
        this.onStatusChange(this.status);
    }

    send(message, channel = null) {
        if (!channel && CONTROLS.has(message.action)) this.cancelStart();
        const encoded = JSON.stringify(message);
        let sent = false;
        for (const target of channel ? [channel] : this.channels()) {
            if (target.readyState !== 'open') continue;
            try {
                target.send(encoded);
                sent = true;
            } catch (error) {
                console.warn('[WebRTC] Unable to send room message', error);
            }
        }
        return sent;
    }

    async transferProject(channel, sendProject) {
        const targets = channel ? [channel] : this.channels();
        await Promise.all(targets.map(async target => {
            const peer = Array.from(this.peers.values()).find(item => item.channel === target);
            const id = crypto.randomUUID();
            if (peer) {
                peer.projectReady = false;
                peer.transferId = id;
            }
            const previous = target.projectTransfer;
            const transfer = Promise.resolve(previous).catch(() => {}).then(async () => {
                if (!this.send({ action: 'projectBegin', id }, target)) throw new Error('Project transfer disconnected');
                await sendProject(target);
                if (!this.send({ action: 'projectLoaded', id }, target)) throw new Error('Project transfer disconnected');
            });
            target.projectTransfer = transfer;
            await transfer;
        }));
    }

    sendChart(data, channel) {
        return this.send({ action: 'chart', data }, channel);
    }

    sendPlay(startAt = 0, speed = 1) {
        return this.send({ action: 'play', startAt, speed });
    }

    sendPause() {
        return this.send({ action: 'pause' });
    }

    sendSeek(time = 0) {
        return this.send({ action: 'seek', time });
    }

    sendRestart() {
        return this.send({ action: 'restart' });
    }

    sendSpeed(speed = 1) {
        return this.send({ action: 'speed', speed });
    }

    receive(peer, message) {
        if (!message?.action) return;
        if (this.role === 'client') {
            if (CONTROLS.has(message.action)) this.cancelStart();
            if (!this.playbackStart.receive(message)) this.onMessage(message);
            return;
        }
        switch (message.action) {
            case 'requestChart':
                this.onMessage(message, peer.channel);
                return;
            case 'projectReady': {
                if (!peer.transferId || message.id !== peer.transferId) return;
                peer.projectReady = true;
                if (!this.groupStart) this.sendPlaybackState(peer);
                else if (!this.groupStart.members.has(peer)) peer.needsPlaybackState = true;
                return;
            }
            case 'roomPlayRequest':
                if (!peer.projectReady || this.groupStart) return;
                this.requestPlay(message.startAt, message.speed);
                return;
            case 'playReady': {
                const start = this.groupStart;
                if (!start || message.id !== start.id || start.members.get(peer) !== null
                    || !Number.isFinite(message.received) || !Number.isFinite(message.replied)) return;
                const now = performance.now();
                start.members.set(peer, {
                    roundTrip: Math.max(0, now - start.sent - (message.replied - message.received)),
                    offset: (message.received - start.sent + message.replied - now) / 2
                });
                this.commitIfReady(start);
                return;
            }
        }
        if (CONTROLS.has(message.action) && message.action !== 'play') {
            this.send(message);
            this.onMessage(message);
        }
    }

    sendPlaybackState(peer) {
        peer.needsPlaybackState = false;
        const playback = this.getPlaybackState?.();
        if (!playback) return;
        if (playback.playing) {
            this.send({ action: 'play', startAt: playback.time, speed: playback.speed }, peer.channel);
        } else {
            this.send({ action: 'speed', speed: playback.speed }, peer.channel);
            this.send({ action: 'seek', time: playback.time }, peer.channel);
        }
    }

    requestPlay(startAt, speed) {
        if (!this.isConnected() || !Number.isFinite(startAt) || !Number.isFinite(speed) || speed <= 0) return false;
        if (this.role === 'client') return this.send({ action: 'roomPlayRequest', startAt, speed });
        if (this.groupStart) {
            this.sendPause();
            return true;
        }
        const start = {
            id: `room-${++this.sequence}`, startAt, speed,
            members: new Map(), timer: setTimeout(() => {
                this.sendPause();
                this.onError(new Error('pairExpired'));
            }, 30_000)
        };
        this.groupStart = start;
        this.prepareStart(start);
        return true;
    }

    async prepareStart(start) {
        try {
            await this.waitForPlaybackReady?.();
        } catch (error) {
            if (this.groupStart === start) {
                this.sendPause();
                this.onError(error);
            }
            return;
        }
        if (this.groupStart !== start) return;
        start.sent = performance.now();
        for (const peer of this.peers.values()) {
            if (peer.projectReady && peer.channel && this.send({
                action: 'preparePlay', id: start.id, startAt: start.startAt, speed: start.speed
            }, peer.channel)) {
                peer.needsPlaybackState = false;
                start.members.set(peer, null);
            }
        }
        this.commitIfReady(start);
    }

    commitIfReady(start) {
        if (start.sent === undefined || start.committed || Array.from(start.members.values()).includes(null)) return;
        start.committed = true;
        clearTimeout(start.timer);
        const lead = Math.max(0, ...Array.from(start.members.values(), ready => ready.roundTrip)) + 80;
        const deadline = performance.now() + lead;
        for (const [peer, ready] of start.members) {
            this.send({ action: 'commitPlay', id: start.id, deadline: deadline + ready.offset }, peer.channel);
        }
        start.timer = setTimeout(() => {
            this.groupStart = null;
            const late = Math.max(0, performance.now() - deadline) / 1000;
            this.onMessage({ action: 'play', startAt: start.startAt + late * start.speed, speed: start.speed });
            for (const peer of this.peers.values()) {
                if (peer.needsPlaybackState) this.sendPlaybackState(peer);
            }
        }, lead);
    }

    cancelStart() {
        clearTimeout(this.groupStart?.timer);
        this.groupStart = null;
        this.playbackStart.cancel();
    }

    disconnect() {
        this.cancelStart();
        const socket = this.socket;
        this.socket = null;
        socket?.close();
        const peers = Array.from(this.peers.values());
        this.peers.clear();
        for (const peer of peers) {
            clearTimeout(peer.timer);
            peer.channel?.close();
            peer.pc.close();
        }
        this.role = null;
        this.roomCode = null;
        this.expiresAt = null;
        this.occupied = 0;
        this.refresh();
    }
}
