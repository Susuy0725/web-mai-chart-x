import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { SyncRoom } from '../signaling/worker.mjs';

class MockSocket {
    readyState = 1;
    messages = [];
    send(data) { this.peer.messages.push(JSON.parse(data)); }
    close(code, reason) {
        this.readyState = this.peer.readyState = 3;
        this.peer.closeReason = reason;
    }
    serializeAttachment(data) { this.attachment = structuredClone(data); }
    deserializeAttachment() { return structuredClone(this.attachment); }
}

function setup(t) {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    globalThis.WebSocketPair = class {
        constructor() {
            const client = new MockSocket();
            const server = new MockSocket();
            client.peer = server;
            server.peer = client;
            server.accept = () => {};
            return [client, server];
        }
    };
    t.after(() => { delete globalThis.WebSocketPair; });
    const OriginalResponse = globalThis.Response;
    t.mock.property(globalThis, 'Response', class extends OriginalResponse {
        constructor(body, options) {
            super(body, options?.status === 101 ? {} : options);
            if (options?.status === 101) {
                Object.defineProperty(this, 'status', { value: 101 });
                this.webSocket = options.webSocket;
            }
        }
    });

    const objects = new Map();
    let calls = 0;
    const env = {
        get DB() { throw new Error('Room signaling used the legacy database'); },
        SYNC_ROOMS: {
            idFromName: code => code,
            get(code) {
                if (!objects.has(code)) {
                    const sockets = new Map();
                    const ctx = {
                        getWebSockets: tag => sockets.get(tag) || [],
                        acceptWebSocket: (socket, [tag]) => sockets.set(tag, [socket]),
                        storage: {
                            async setAlarm(at) { ctx.alarmAt = at; },
                            async deleteAlarm() { ctx.alarmAt = null; }
                        }
                    };
                    objects.set(code, ctx);
                }
                // A new instance for each event simulates eviction of in-memory state.
                return { fetch: request => new SyncRoom(objects.get(code)).fetch(request) };
            }
        }
    };
    const request = async path => {
        calls++;
        const response = await worker.fetch(new Request(`https://test.invalid/api/room/${path}`, {
            headers: { Upgrade: 'websocket' }
        }), env);
        return response.webSocket;
    };
    const room = code => new SyncRoom(objects.get(code));
    const message = (code, socket, data) => room(code).webSocketMessage(socket.peer, JSON.stringify(data));
    return {
        request,
        room,
        message,
        setNow: value => { now = value; },
        calls: () => calls,
        alarmAt: code => objects.get(code)?.alarmAt
    };
}

test('同時加入只保留三席，各成員只收到自己的 answer', async t => {
    const app = setup(t);
    const host = await app.request('create');
    const [{ code, expiresAt }] = host.messages;
    assert.match(code, /^\d{6}$/);
    assert.equal(expiresAt, 91_000);
    const members = await Promise.all(Array.from({ length: 4 }, () => app.request(`join/${code}`)));
    const extra = members.pop();
    assert.equal(app.calls(), 5);
    assert.deepEqual(extra.messages, [{ type: 'error', code: 'roomFull' }]);

    const ids = members.map(peer => peer.messages[0].memberId);
    assert.equal(new Set(ids).size, 3);
    await Promise.all(members.map((peer, i) => app.message(code, peer, { type: 'offer', memberId: ids[0], sdp: `offer ${i}` })));
    assert.deepEqual(host.messages.filter(msg => msg.type === 'offer').map(msg => msg.memberId), ids);
    await Promise.all(ids.map((memberId, i) => app.message(code, host, { type: 'answer', memberId, sdp: `answer ${i}` })));
    members.forEach((peer, i) => {
        assert.deepEqual(peer.messages.filter(msg => msg.type === 'answer'), [
            { type: 'answer', memberId: ids[i], sdp: `answer ${i}` }
        ]);
    });

    await app.message(code, host, { type: 'connected', memberId: ids[0] });
    assert.equal(members[0].closeReason, 'paired');
    await app.room(code).webSocketClose(members[0].peer);
    assert.equal((await app.request(`join/${code}`)).messages[0].code, 'roomFull');
    await app.message(code, host, { type: 'release', memberId: ids[0] });
    assert.equal((await app.request(`join/${code}`)).messages[0].type, 'joined');
});

test('只開放 WebSocket 房間端點並提供健康檢查', async () => {
    const env = { get DB() { throw new Error('Signaling accessed D1'); } };
    const health = await worker.fetch(new Request('https://test.invalid/health'), env);
    assert.equal((await health.json()).roomProtocol, 1);
    const retired = await worker.fetch(new Request('https://test.invalid/api/pair/create', { method: 'POST' }), env);
    assert.equal(retired.status, 404);
});

test('空房不輪詢，90 秒截止後仍可完成已保留的配對', async t => {
    const app = setup(t);
    const empty = await app.request('create');
    const [emptyRoom] = empty.messages;
    app.setNow(emptyRoom.expiresAt);
    await app.room(emptyRoom.code).alarm();
    assert.equal(empty.closeReason, 'signalingComplete');
    assert.equal(app.alarmAt(emptyRoom.code), null);
    assert.equal(app.calls(), 1);

    const host = await app.request('create');
    const [{ code, expiresAt }] = host.messages;
    app.setNow(expiresAt - 1000);
    const member = await app.request(`join/${code}`);
    const [{ memberId }] = member.messages;
    app.setNow(expiresAt);
    await app.room(code).alarm();
    assert.equal(host.readyState, 1);
    assert.equal((await app.request(`join/${code}`)).messages[0].code, 'joinClosed');
    await app.message(code, member, { type: 'offer', sdp: 'offer' });
    await app.message(code, host, { type: 'answer', memberId, sdp: 'answer' });
    assert.equal(member.messages.at(-1).sdp, 'answer');
    await app.message(code, host, { type: 'connected', memberId });
    assert.equal(host.closeReason, 'signalingComplete');
    assert.equal(app.alarmAt(code), null);
});

test('加入、配對完成與成員斷線均沿用房間 alarm', async t => {
    const app = setup(t);
    const host = await app.request('create');
    const [{ code, expiresAt }] = host.messages;
    assert.equal(app.alarmAt(code), expiresAt);

    app.setNow(2000);
    const first = await app.request(`join/${code}`);
    const [{ memberId: firstId }] = first.messages;
    assert.equal(app.alarmAt(code), expiresAt);

    app.setNow(5000);
    const second = await app.request(`join/${code}`);
    const [{ memberId: secondId }] = second.messages;
    assert.equal(app.alarmAt(code), expiresAt);

    await app.message(code, first, { type: 'offer', sdp: 'offer-1' });
    await app.message(code, host, { type: 'answer', memberId: firstId, sdp: 'answer-1' });
    await app.message(code, host, { type: 'connected', memberId: firstId });
    assert.equal(app.alarmAt(code), expiresAt);

    await app.room(code).webSocketClose(second.peer);
    assert.equal(app.alarmAt(code), expiresAt);

    await app.room(code).webSocketClose(host.peer);
    assert.equal(app.alarmAt(code), null);
    assert.equal(secondId !== firstId, true);
});

test('30 秒截止時拒絕晚到的訊號並釋放席位', async t => {
    const app = setup(t);
    const host = await app.request('create');
    const [{ code, expiresAt }] = host.messages;
    const member = await app.request(`join/${code}`);
    app.setNow(member.messages[0].pairUntil);
    await app.message(code, member, { type: 'offer', sdp: 'late' });
    assert.equal(member.closeReason, 'pairExpired');
    assert.equal(host.messages.at(-1).occupied, 1);
    assert.equal(app.alarmAt(code), expiresAt);
});
