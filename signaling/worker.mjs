import { SyncRoom } from './syncRoom.mjs';

export { SyncRoom };

export default {
    async fetch(request, env) {
        const path = new URL(request.url).pathname;
        if (request.method === 'GET' && (path === '/' || path === '/health')) {
            return Response.json({ service: 'wmcx-room-signaling', status: 'online', roomProtocol: 1 });
        }
        const create = path === '/api/room/create';
        const join = /^\/api\/room\/join\/(\d{6})$/.exec(path);
        if (!create && !join) return new Response('Not found', { status: 404 });
        if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
            return new Response('WebSocket upgrade required', { status: 426 });
        }

        if (env.IP_RATE_LIMIT) {
            const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
            const { success } = await env.IP_RATE_LIMIT.limit({ key: `room:${create ? 'create' : 'join'}:${ip}` });
            if (!success) return SyncRoom.reject('rateLimited');
        }
        if (join && env.JOIN_RATE_LIMIT) {
            const { success } = await env.JOIN_RATE_LIMIT.limit({ key: `room:join:${join[1]}` });
            if (!success) return SyncRoom.reject('rateLimited');
        }

        const forward = (code, action) => {
            const url = new URL(`https://room.internal/${action}/${code}`);
            return env.SYNC_ROOMS.get(env.SYNC_ROOMS.idFromName(code)).fetch(new Request(url, request));
        };
        if (join) return forward(join[1], 'join');

        for (let attempt = 0; attempt < 5; attempt++) {
            const [random] = crypto.getRandomValues(new Uint32Array(1));
            const code = String(random % 1_000_000).padStart(6, '0');
            const response = await forward(code, 'create');
            if (response.status !== 409) return response;
        }
        return SyncRoom.reject('roomUnavailable');
    }
};
