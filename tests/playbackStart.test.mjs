import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { RoomSync } from '../Scripts/sync/roomSync.js';

test('全房等候音源，再依各成員的延遲同步起播，並能取消尚未開始的播放', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    t.mock.method(performance, 'now', () => Date.now());
    let audioReady;
    const makeSync = role => {
        const starts = [];
        const sync = new RoomSync({
            waitForPlaybackReady: () => role === 'client' ? audioReady : undefined,
            onMessage: message => {
                if (message.action === 'play') starts.push({ time: Date.now(), message });
            }
        });
        sync.role = role;
        return { sync, starts };
    };
    const host = makeSync('host');
    const players = [makeSync('client'), makeSync('client'), makeSync('client')];
    players.forEach(({ sync }, i) => {
        const id = String(i);
        const hostPeer = { id, projectReady: true };
        const clientPeer = { id };
        const hostChannel = { readyState: 'connecting' };
        const clientChannel = { readyState: 'connecting' };
        host.sync.peers.set(id, hostPeer);
        sync.peers.set(id, clientPeer);
        host.sync.attachChannel(hostPeer, hostChannel);
        sync.attachChannel(clientPeer, clientChannel);
        const delay = 50 + i * 30;
        hostChannel.send = data => setTimeout(() => clientChannel.onmessage({ data }), delay);
        clientChannel.send = data => setTimeout(() => hostChannel.onmessage({ data }), delay);
        for (const channel of [hostChannel, clientChannel]) channel.readyState = 'open';
    });

    const participants = [host, ...players];
    async function advance(ms) {
        for (let elapsed = 0; elapsed < ms; elapsed += 10) {
            await setImmediate();
            t.mock.timers.tick(10);
        }
    }
    for (const leader of [host, players[0]]) {
        const decoding = Promise.withResolvers();
        audioReady = decoding.promise;
        assert.equal(leader.sync.requestPlay(12, 1.5), true);
        await advance(1200);
        assert.ok(participants.every(({ starts }) => starts.length === 0));
        decoding.resolve();
        await advance(1000);
        assert.ok(participants.every(({ starts }) => starts.length === 1));
        assert.equal(new Set(participants.map(({ starts }) => starts[0].time)).size, 1);
        for (const { starts } of participants) {
            assert.deepEqual(starts[0].message, { action: 'play', startAt: 12, speed: 1.5 });
            starts.length = 0;
        }
    }
    host.sync.requestPlay(0, 1);
    await advance(200);
    host.sync.sendPause();
    await advance(1000);
    assert.ok(participants.every(({ starts }) => starts.length === 0));
});
