const CHUNK_SIZE = 32 * 1024;

export class AudioTransfer {
    pending = new Map();

    async ready() {
        await Promise.allSettled(this.pending.values());
    }

    async send(file, channels) {
        if (!file || !channels.length) return;
        const buffer = readAudio(file);
        await Promise.all(channels.map(channel =>
            this.enqueue(channel, async () => sendAudio(channel, file, await buffer), buffer)));
    }

    async clear(channels) {
        await Promise.all(channels.map(channel =>
            this.enqueue(channel, () => channel.send(JSON.stringify({ action: 'audio_clear' })))));
    }

    enqueue(channel, send, buffer) {
        const previous = this.pending.get(channel);
        const transfer = Promise.all([previous?.catch(() => {}), buffer]).then(() => {
            if (channel.readyState === 'open') return send();
        });
        this.pending.set(channel, transfer);
        return transfer.finally(() => {
            if (this.pending.get(channel) === transfer) this.pending.delete(channel);
        });
    }
}

async function readAudio(file) {
    if (file instanceof Blob) return file.arrayBuffer();
    if (file instanceof ArrayBuffer) return file;
    const response = await fetch(file);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
}

async function sendAudio(channel, file, buffer) {
    if (!buffer.byteLength) return;
    const totalSize = buffer.byteLength;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    const fileName = file.name || 'track.mp3';
    const mimeType = file.type || 'audio/mp3';
    const send = message => channel.send(JSON.stringify(message));
    if (channel.readyState !== 'open') return;
    send({ action: 'audio_start', fileName, mimeType, totalSize, totalChunks });
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        while (channel.readyState === 'open' && channel.bufferedAmount > 65536) {
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        if (channel.readyState !== 'open') return;
        const bytes = new Uint8Array(buffer, chunkIndex * CHUNK_SIZE, Math.min(CHUNK_SIZE, totalSize - chunkIndex * CHUNK_SIZE));
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        send({ action: 'audio_chunk', chunkIndex, totalChunks, data: btoa(binary) });
    }
    if (channel.readyState === 'open') send({ action: 'audio_end', fileName, totalSize, totalChunks });
}
