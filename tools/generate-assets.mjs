import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

mkdirSync('assets/audio', { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, number) => {
  let value = number;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(name, data) {
  const type = Buffer.from(name);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
}

function makePng(path, size, transparent = false) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  const center = size / 2;
  const scale = size / 1024;
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1); rows[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const index = row + 1 + x * 4;
      const distance = Math.hypot(x - center, y - center);
      const ring = Math.abs(distance - 330 * scale) < 24 * scale;
      const inner = distance < 318 * scale;
      const px = x / scale;
      const py = y / scale;
      const segments = [[220, 520, 338, 520], [338, 520, 396, 348], [396, 348, 488, 692], [488, 692, 570, 424], [570, 424, 632, 584], [632, 584, 804, 584]];
      let wave = false;
      for (const [x1, y1, x2, y2] of segments) {
        const dx = x2 - x1; const dy = y2 - y1;
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
        if (Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)) < 27) wave = true;
      }
      const dot = distance < 30 * scale;
      let color = transparent ? [0, 0, 0, 0] : [7, 21, 18, 255];
      if (inner) color = [11, 43, 35, 255];
      if (ring || wave) color = [98, 215, 176, 255];
      if (dot) color = [241, 184, 75, 255];
      rows[index] = color[0]; rows[index + 1] = color[1]; rows[index + 2] = color[2]; rows[index + 3] = color[3];
    }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

function makeWav(path, duration, sampleAt) {
  const sampleRate = 44_100;
  const length = Math.round(duration * sampleRate);
  const data = Buffer.alloc(length * 2);
  for (let index = 0; index < length; index += 1) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sampleAt(index / sampleRate, duration))) * 32767), index * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

makePng('assets/icon.png', 1024);
makePng('assets/adaptive-icon.png', 1024, true);
makePng('assets/splash-icon.png', 512, true);
makePng('assets/favicon.png', 64);
makeWav('assets/audio/click.wav', 0.055, (time) => Math.sin(2 * Math.PI * 1300 * time) * Math.exp(-time * 82) * 0.72);
makeWav('assets/audio/click-accent.wav', 0.07, (time) => (Math.sin(2 * Math.PI * 1900 * time) + 0.3 * Math.sin(2 * Math.PI * 950 * time)) * Math.exp(-time * 70) * 0.72);
makeWav('assets/audio/tone-a2.wav', 1, (time) => Math.sin(2 * Math.PI * 110 * time) * 0.45);
makeWav('assets/audio/tone-a4.wav', 1, (time) => Math.sin(2 * Math.PI * 440 * time) * 0.4);
