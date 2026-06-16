const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const input = path.join(__dirname, '..', 'build', 'A_modern__minimalistic_app_ico_2026-06-16T08-11-45.png');
const outputPng = path.join(__dirname, '..', 'build', 'icon.png');
const outputIco = path.join(__dirname, '..', 'build', 'icon.ico');

async function main() {
  // 256x256 PNG (直接缩放，不修改颜色)
  await sharp(input)
    .resize(256, 256)
    .png()
    .toFile(outputPng);
  console.log('icon.png generated (256x256)');

  // 多尺寸 ICO
  const sizes = [16, 32, 48, 256];
  const buffers = [];
  for (const size of sizes) {
    const buf = await sharp(input)
      .resize(size, size)
      .png()
      .toBuffer();
    buffers.push({ size, buf });
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  const entries = [];
  let offset = 6 + sizes.length * 16;
  for (const { size, buf } of buffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += buf.length;
  }

  const icoBuf = Buffer.concat([header, ...entries, ...buffers.map(b => b.buf)]);
  fs.writeFileSync(outputIco, icoBuf);
  console.log('icon.ico generated (multi-size)');
}

main().catch(console.error);
