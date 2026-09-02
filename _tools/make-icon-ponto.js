// Ícone do app de Ponto (192/512/180) — precisa ser VISUALMENTE DISTINTO dos
// outros apps Solar Green na tela do celular (pwa-checklist regra 4). Em vez
// do sol/folha dos outros, aqui é um mostrador de relógio nas cores da marca.
// Sem lib externa (só zlib nativo), mesmo encoder PNG do _tools/make_icons.js.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const BG = [0x00, 0x31, 0x22];      // --sidebar-bg
const ACCENT = [0x78, 0xD8, 0x00];  // --accent
const PANEL = [0xF2, 0xF7, 0xF2];   // --bg claro (mostrador)

function mix(a, b, t) { return [Math.round(a[0]+(b[0]-a[0])*t), Math.round(a[1]+(b[1]-a[1])*t), Math.round(a[2]+(b[2]-a[2])*t)]; }

function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const rFace = size * 0.34;      // mostrador
  const rRing = size * 0.40;      // aro externo
  const now = -Math.PI / 2;       // 12h
  const angH = now + Math.PI * 2 * (10 / 12);   // ponteiro das horas ~10h
  const angM = now + Math.PI * 2 * (8 / 60);    // ponteiro dos minutos ~08
  const lenH = rFace * 0.52, lenM = rFace * 0.82;
  const wH = size * 0.035, wM = size * 0.026;

  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = x1 + t * dx, qy = y1 + t * dy;
    return Math.hypot(px - qx, py - qy);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let color = BG;

      if (dist <= rRing) color = ACCENT;                 // aro verde
      if (dist <= rFace) color = PANEL;                  // mostrador claro

      if (dist <= rFace) {
        // marcas das 12/3/6/9
        for (let k = 0; k < 12; k++) {
          const a = now + k * Math.PI / 6;
          const inner = rFace * (k % 3 === 0 ? 0.74 : 0.84);
          const d = distToSeg(x, y, cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, cx + Math.cos(a) * rFace * 0.94, cy + Math.sin(a) * rFace * 0.94);
          if (d <= (k % 3 === 0 ? size * 0.016 : size * 0.009)) color = mix(BG, ACCENT, 0.15);
        }
        // ponteiros
        if (distToSeg(x, y, cx, cy, cx + Math.cos(angH) * lenH, cy + Math.sin(angH) * lenH) <= wH) color = BG;
        if (distToSeg(x, y, cx, cy, cx + Math.cos(angM) * lenM, cy + Math.sin(angM) * lenM) <= wM) color = BG;
        if (dist <= size * 0.03) color = BG;             // pino central
      }

      buf[idx] = color[0]; buf[idx + 1] = color[1]; buf[idx + 2] = color[2]; buf[idx + 3] = 255;
    }
  }
  return buf;
}

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(size, rgbaBuf) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    rgbaBuf.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
[192, 512, 180].forEach(size => {
  const png = encodePNG(size, makeIcon(size));
  fs.writeFileSync(path.join(outDir, 'icon-' + size + '-ponto.png'), png);
  console.log('wrote icon-' + size + '-ponto.png', png.length, 'bytes');
});
