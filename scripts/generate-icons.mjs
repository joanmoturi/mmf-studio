import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

const directory = resolve("public", "icons");
await mkdir(directory, { recursive: true });

const points = [
  [28, 69],
  [28, 31],
  [37, 31],
  [50, 51],
  [63, 31],
  [72, 31],
  [72, 69],
  [63, 69],
  [63, 47],
  [50, 66],
  [37, 47],
  [37, 69],
];

function inside(x, y) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i],
      [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
  }
  return result;
}

function chunk(type, data) {
  const contents = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of contents) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, contents, checksum]);
}

function icon(size) {
  const data = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let coverage = 0;
      for (const dy of [0.25, 0.75])
        for (const dx of [0.25, 0.75])
          if (inside(((x + dx) * 100) / size, ((y + dy) * 100) / size)) coverage += 0.25;
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      for (const [channel, [background, foreground]] of [
        [49, 237],
        [89, 244],
        [67, 227],
      ].entries())
        data[offset + channel] = Math.round(background + (foreground - background) * coverage);
      data[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(data)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["maskable-512.png", 512],
  ["apple-touch-icon.png", 180],
])
  await writeFile(resolve(directory, name), icon(size));
