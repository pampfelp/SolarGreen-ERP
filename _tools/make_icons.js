// Gera ícones PNG (192, 512, 180) com um mark simples "sol/folha" nas cores
// da marca, sem depender de nenhuma lib externa (só zlib nativo do Node) —
// usado pra dar aos manifests PWA um ícone de verdade em vez de um vazio.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const BG = [0x00, 0x31, 0x22];      // --sidebar-bg
const ACCENT = [0x78, 0xD8, 0x00];  // --accent
const ACCENT_DEEP = [0x5a, 0xaa, 0x00];

function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const rSun = size * 0.30;
  // "mordida" de sombra que corta o canto superior direito do sol, criando
  // uma silhueta tipo folha/lua-crescente — remete a sol + folha (energia solar + verde)
  const biteCx = cx + rSun * 0.80, biteCy = cy - rSun * 0.80, rBite = rSun * 0.62;
  const rayOuter = size * 0.42, rayInner = size * 0.335;
  const nRays = 8;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let color = BG;

      // raios do sol (linhas grossas irradiando, só entre rayInner e rayOuter)
      if (dist >= rayInner && dist <= rayOuter) {
        let ang = Math.atan2(dy, dx);
        if (ang < 0) ang += Math.PI * 2;
        const seg = (Math.PI * 2) / nRays;
        const within = ang % seg;
        const halfWidth = seg * 0.18;
        if (within < halfWidth || within > seg - halfWidth) color = ACCENT_DEEP;
      }

      // disco do sol
      if (dist <= rSun) {
        color = ACCENT;
        const bdx = x - biteCx, bdy = y - biteCy;
        if (Math.sqrt(bdx * bdx + bdy * bdy) <= rBite) color = BG;
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
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
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
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA, no interlace

  // cada linha precisa de um filter-byte (0 = none) na frente
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
  fs.writeFileSync(path.join(outDir, 'icon-' + size + '.png'), png);
  console.log('wrote icon-' + size + '.png', png.length, 'bytes');
});
