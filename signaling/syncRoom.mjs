const JOIN_WINDOW_MS = 90_000;
const PAIR_WINDOW_MS = 30_000;
const MEMBER_LIMIT = 3;
const MAX_SIGNAL_LENGTH = 32_768;

function send(socket, message) {
    if (socket.readyState === 1) socket.send(JSON.stringify(message));
}

export class SyncRoom {
    constructor(ctx) {
        this.ctx = ctx;
    }

    static reject(code) {
        // Browsers do not expose the body of a failed upgrade. Send a typed error first.
        const [client, server] = Object.values(new WebSocketPair());
        server.accept();
        send(server, { type: 'error', code });
        server.close(1008, code);
        return new Response(null, { status: 101, webSocket: client });
    }

    get host() {
        return this.ctx.getWebSockets('host').find(socket => socket.readyState === 1);
    }

    accept(tag, state) {
        const [client, server] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(server, [tag]);
        server.serializeAttachment(state);
        return { server, response: new Response(null, { status: 101, webSocket: client }) };
    }

    async fetch(request) {
        const [, action, code] = new URL(request.url).pathname.split('/');
        const now = Date.now();
        const host = this.host;
        if (action === 'create') {
            if (host) return new Response(null, { status: 409 });
            const expiresAt = now + JOIN_WINDOW_MS;
            // Schedule cleanup before accepting the room. The storage input gate
            // keeps another create from claiming the same code during this write.
            await this.ctx.storage.setAlarm(expiresAt);
            const { server, response } = this.accept('host', { expiresAt, alarmAt: expiresAt, members: {} });
            send(server, { type: 'created', code, expiresAt, occupied: 1, connected: 1 });
            return response;
        }

        if (!host) return SyncRoom.reject('roomUnavailable');
        const state = host.deserializeAttachment();
        if (now >= state.expiresAt) return SyncRoom.reject('joinClosed');
        this.removeExpiredMembers(state, now);
        if (Object.keys(state.members).length >= MEMBER_LIMIT) return SyncRoom.reject('roomFull');

        const memberId = crypto.randomUUID();
        const pairUntil = now + PAIR_WINDOW_MS;
        const { server, response } = this.accept(memberId, { memberId });
        state.members[memberId] = { phase: 'joined', pairUntil };
        const scheduleEarlier = pairUntil < state.alarmAt;
        if (scheduleEarlier) state.alarmAt = pairUntil;
        this.updateHost(host, state);
        send(server, { type: 'joined', memberId, pairUntil });
        if (scheduleEarlier) await this.ctx.storage.setAlarm(pairUntil);
        return response;
    }

    updateHost(host, state) {
        host.serializeAttachment(state);
        const members = Object.values(state.members);
        send(host, {
            type: 'occupancy',
            occupied: 1 + members.length,
            connected: 1 + members.filter(member => member.phase === 'connected').length
        });
    }

    memberSocket(id) {
        return this.ctx.getWebSockets(id).find(socket => socket.readyState === 1);
    }

    removeExpiredMembers(state, now) {
        for (const [id, member] of Object.entries(state.members)) {
            if (member.phase === 'connected' || member.pairUntil > now) continue;
            delete state.members[id];
            const socket = this.memberSocket(id);
            sendErrorAndClose(socket, 'pairExpired');
        }
    }

    webSocketMessage(socket, raw) {
        const host = this.host;
        if (!host) return;
        if (typeof raw !== 'string' || raw.length > MAX_SIGNAL_LENGTH) {
            sendErrorAndClose(socket, 'invalidSignal');
            return;
        }

        let message;
        try {
            message = JSON.parse(raw);
        } catch {
            sendErrorAndClose(socket, 'invalidSignal');
            return;
        }

        const state = host.deserializeAttachment();
        const isHost = socket === host;
        const memberId = isHost ? message?.memberId : socket.deserializeAttachment()?.memberId;
        if (typeof memberId !== 'string' || !Object.hasOwn(state.members, memberId)) return;
        const member = state.members[memberId];
        if (isHost && message?.type === 'release') {
            delete state.members[memberId];
            this.updateHost(host, state);
            this.memberSocket(memberId)?.close(1000, 'slotReleased');
            this.finishIfClosed(host, state);
            return;
        }

        if (member.phase === 'connected' || Date.now() >= member.pairUntil) return;
        const type = message?.type;
        if (!isHost && type === 'offer' && member.phase === 'joined' && validSdp(message.sdp)) {
            member.phase = 'offered';
            host.serializeAttachment(state);
            send(host, { type, memberId, sdp: message.sdp });
        } else if (isHost && type === 'answer' && member.phase === 'offered' && validSdp(message.sdp)) {
            const peer = this.memberSocket(memberId);
            if (!peer) return;
            member.phase = 'answered';
            host.serializeAttachment(state);
            send(peer, { type, memberId, sdp: message.sdp });
        } else if (isHost && type === 'connected' && member.phase === 'answered') {
            member.phase = 'connected';
            this.updateHost(host, state);
            this.memberSocket(memberId)?.close(1000, 'paired');
            this.finishIfClosed(host, state);
        }
    }

    webSocketClose(socket) {
        this.removeSocket(socket);
        socket.close();
    }

    webSocketError(socket) {
        this.removeSocket(socket);
        socket.close(1011, 'socketError');
    }

    removeSocket(socket) {
        const attachment = socket.deserializeAttachment();
        if (!attachment) return;
        if ('expiresAt' in attachment) {
            for (const id of Object.keys(attachment.members)) {
                this.memberSocket(id)?.close(1000, 'hostLeft');
            }
            return;
        }

        const host = this.host;
        if (!host) return;
        const state = host.deserializeAttachment();
        const id = attachment.memberId;
        if (!state.members[id] || state.members[id].phase === 'connected') return;
        delete state.members[id];
        this.updateHost(host, state);
        this.finishIfClosed(host, state);
    }

    finishIfClosed(host, state) {
        if (Date.now() < state.expiresAt) return false;
        if (Object.values(state.members).some(member => member.phase !== 'connected')) return false;
        host.close(1000, 'signalingComplete');
        return true;
    }

    async alarm() {
        const host = this.host;
        if (!host) return;
        const state = host.deserializeAttachment();
        const now = Date.now();
        this.removeExpiredMembers(state, now);
        if (this.finishIfClosed(host, state)) return;
        const deadlines = Object.values(state.members)
            .filter(member => member.phase !== 'connected')
            .map(member => member.pairUntil);
        if (state.expiresAt > now) deadlines.push(state.expiresAt);
        state.alarmAt = Math.min(...deadlines);
        this.updateHost(host, state);
        await this.ctx.storage.setAlarm(state.alarmAt);
    }
}

function validSdp(sdp) {
    return typeof sdp === 'string' && sdp.length > 0;
}

function sendErrorAndClose(socket, code) {
    if (!socket) return;
    send(socket, { type: 'error', code });
    socket.close(1008, code);
}
