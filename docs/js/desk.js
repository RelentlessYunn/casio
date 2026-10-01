// Procedural top-down "photo" of a concrete desk with a blueprint of the
// MTP-1302 on it. The window-blind shadows are a separate CSS layer.

function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function valueNoise(seed) {
  const rand = rng(seed);
  const perm = new Uint16Array(512);
  const vals = new Float32Array(256);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) vals[i] = rand();
  const fade = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const a = vals[perm[perm[X] + Y]];
    const b = vals[perm[perm[X + 1] + Y]];
    const c = vals[perm[perm[X] + Y + 1]];
    const d = vals[perm[perm[X + 1] + Y + 1]];
    const u = fade(xf);
    const v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y, oct = 4) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    let norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * noise(x * f, y * f);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  };
}

const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function pixelLayer(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b, a] = fn(x / w, y / h);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const INK = 'rgba(214, 228, 255, ';
const FONT = '"JetBrains Mono", ui-monospace, Menlo, monospace';

function arrow(ctx, x, y, ang) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-11, -3.5);
  ctx.lineTo(-11, 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function dimLine(ctx, x1, y1, x2, y2, label, offset = 0) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const ang = Math.atan2(y2 - y1, x2 - x1);
  arrow(ctx, x2, y2, ang);
  arrow(ctx, x1, y1, ang + Math.PI);
  ctx.save();
  ctx.translate((x1 + x2) / 2, (y1 + y2) / 2);
  ctx.rotate(Math.abs(ang) > Math.PI / 2 - 0.01 && Math.abs(ang) < Math.PI / 2 + 0.01 ? -Math.PI / 2 : 0);
  ctx.fillText(label, 0, -12 + offset);
  ctx.restore();
}

function centerLine(ctx, x1, y1, x2, y2) {
  ctx.save();
  ctx.setLineDash([26, 6, 4, 6]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// The technical drawing, in mm at `k` px per mm, centred on (cx, cy)
function drawWatch(ctx, cx, cy, k) {
  ctx.strokeStyle = INK + '0.72)';
  ctx.fillStyle = INK + '0.78)';
  ctx.lineWidth = 2;

  // --- front view
  const circle = (r, w = 2) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
    ctx.stroke();
  };
  circle(19.25, 2.4);
  circle(17.4, 1.4);
  circle(16.3, 1.4);
  circle(15.5, 1);
  // lugs
  ctx.lineWidth = 2;
  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const x0 = cx + sx * 10.1 * k;
      const x1 = cx + sx * 12.7 * k;
      const y0 = cy + sy * 15.4 * k;
      const y1 = cy + sy * 22.1 * k;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y1);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1, cy + sy * 14.4 * k);
      ctx.stroke();
    }
  }
  // crown
  ctx.strokeRect(cx + 19.25 * k, cy - 2.1 * k, 2.6 * k, 4.2 * k);
  // indices
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 12; i++) {
    if (i === 3) continue;
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * 10.5 * k, cy - Math.cos(a) * 10.5 * k);
    ctx.lineTo(cx + Math.sin(a) * 13.8 * k, cy - Math.cos(a) * 13.8 * k);
    ctx.stroke();
  }
  ctx.strokeRect(cx + 10 * k, cy - 1.2 * k, 3.1 * k, 2.4 * k);
  ctx.lineWidth = 1;
  centerLine(ctx, cx - 27 * k, cy, cx + 27 * k, cy);
  centerLine(ctx, cx, cy - 27 * k, cx, cy + 27 * k);

  ctx.font = `500 22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1.2;
  // Ø38.5 above
  const ty = cy - 27 * k;
  ctx.beginPath();
  ctx.moveTo(cx - 19.25 * k, cy - 3 * k);
  ctx.lineTo(cx - 19.25 * k, ty - 8);
  ctx.moveTo(cx + 19.25 * k, cy - 3 * k);
  ctx.lineTo(cx + 19.25 * k, ty - 8);
  ctx.stroke();
  dimLine(ctx, cx - 19.25 * k, ty, cx + 19.25 * k, ty, 'Ø38.5');
  // 44.2 to the left
  const lx = cx - 28 * k;
  ctx.beginPath();
  ctx.moveTo(cx - 13 * k, cy - 22.1 * k);
  ctx.lineTo(lx - 8, cy - 22.1 * k);
  ctx.moveTo(cx - 13 * k, cy + 22.1 * k);
  ctx.lineTo(lx - 8, cy + 22.1 * k);
  ctx.stroke();
  dimLine(ctx, lx, cy + 22.1 * k, lx, cy - 22.1 * k, '44.2');

  // --- side view
  const sx = cx + 40 * k;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - 3.1 * k, cy - 17.4 * k);
  ctx.lineTo(sx - 3.1 * k, cy + 17.4 * k);
  ctx.moveTo(sx - 1.6 * k, cy - 19.25 * k);
  ctx.lineTo(sx + 3.2 * k, cy - 19.25 * k);
  ctx.lineTo(sx + 3.2 * k, cy + 19.25 * k);
  ctx.lineTo(sx - 1.6 * k, cy + 19.25 * k);
  ctx.stroke();
  ctx.strokeRect(sx - 3.1 * k, cy - 16.3 * k, 6.3 * k, 32.6 * k);
  ctx.beginPath();
  ctx.moveTo(sx + 3.2 * k, cy - 17.3 * k);
  ctx.quadraticCurveTo(sx + 5.4 * k, cy - 15.5 * k, sx + 6.3 * k, cy - 14.5 * k);
  ctx.lineTo(sx + 6.3 * k, cy + 14.5 * k);
  ctx.quadraticCurveTo(sx + 5.4 * k, cy + 15.5 * k, sx + 3.2 * k, cy + 17.3 * k);
  ctx.stroke();
  // lugs in profile
  for (const sy of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx - 1.5 * k, cy + sy * 19 * k);
    ctx.quadraticCurveTo(sx - 0.4 * k, cy + sy * 21.6 * k, sx + 0.9 * k, cy + sy * 22.1 * k);
    ctx.lineTo(sx + 3.1 * k, cy + sy * 22.1 * k);
    ctx.lineTo(sx + 3.2 * k, cy + sy * 19 * k);
    ctx.stroke();
  }
  ctx.lineWidth = 1.2;
  const by = cy + 27 * k;
  ctx.beginPath();
  ctx.moveTo(sx - 3.1 * k, cy + 18 * k);
  ctx.lineTo(sx - 3.1 * k, by + 8);
  ctx.moveTo(sx + 6.3 * k, cy + 15 * k);
  ctx.lineTo(sx + 6.3 * k, by + 8);
  ctx.stroke();
  dimLine(ctx, sx - 3.1 * k, by, sx + 6.3 * k, by, '9.4', 34);

  ctx.textAlign = 'left';
  ctx.font = `500 17px ${FONT}`;
  ctx.fillText('FRONT VIEW', cx - 19.25 * k, cy + 31 * k);
  ctx.fillText('SIDE ELEVATION', sx - 8 * k, cy + 34.5 * k);
}

function titleBlock(ctx, x, y, w, h) {
  ctx.strokeStyle = INK + '0.7)';
  ctx.fillStyle = INK + '0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = 1;
  const rows = [
    [['TITLE', 'MTP-1302 · GENERAL ARRANGEMENT', 1]],
    [['DRG NO.', '1302-001', 0.5], ['REV', 'A', 0.5]],
    [['SCALE', '1 : 1', 0.34], ['UNITS', 'MM', 0.33], ['SHEET', '1 OF 1', 0.33]],
    [['MATERIAL', 'STAINLESS STEEL', 0.6], ['DRAWN', 'THE MTP TEAM', 0.4]],
  ];
  const rh = h / rows.length;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  rows.forEach((row, ri) => {
    const ry = y + ri * rh;
    if (ri > 0) {
      ctx.beginPath();
      ctx.moveTo(x, ry);
      ctx.lineTo(x + w, ry);
      ctx.stroke();
    }
    let cx = x;
    row.forEach(([k, v, f], ci) => {
      const cw = w * f;
      if (ci > 0) {
        ctx.beginPath();
        ctx.moveTo(cx, ry);
        ctx.lineTo(cx, ry + rh);
        ctx.stroke();
      }
      ctx.font = `500 13px ${FONT}`;
      ctx.globalAlpha = 0.65;
      ctx.fillText(k, cx + 12, ry + 22);
      ctx.globalAlpha = 1;
      ctx.font = `500 ${ri === 0 ? 22 : 19}px ${FONT}`;
      ctx.fillText(v, cx + 12, ry + rh - 14);
      cx += cw;
    });
  });
}

export function paintDesk(canvas) {
  const W = (canvas.width = 2400);
  const H = (canvas.height = 1350);
  const ctx = canvas.getContext('2d');
  const n = valueNoise(5);
  const n2 = valueNoise(23);

  // --- concrete
  const c1 = hex('#4a4f57');
  const c2 = hex('#30343a');
  const concrete = pixelLayer(600, 338, (u, v) => {
    const t = n(u * 4, v * 4, 5) * 0.75 + n2(u * 22, v * 22, 2) * 0.25;
    const k = Math.min(1, Math.max(0, (t - 0.25) * 1.7));
    return [mix(c1[0], c2[0], k), mix(c1[1], c2[1], k), mix(c1[2], c2[2], k), 255];
  });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(concrete, 0, 0, W, H);
  const rand = rng(77);
  for (let i = 0; i < 9000; i++) {
    const light = rand() < 0.45;
    ctx.fillStyle = light ? `rgba(220,226,235,${0.05 + rand() * 0.12})` : `rgba(12,14,18,${0.08 + rand() * 0.2})`;
    const r = 0.6 + rand() * 1.8;
    ctx.beginPath();
    ctx.arc(rand() * W, rand() * H, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- blueprint sheet
  const sx = W * 0.07;
  const sy = H * 0.07;
  const sw = W * 0.9;
  const sh = H * 1.05;
  const ang = 0.035;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(ang);
  ctx.save();
  ctx.shadowColor = 'rgba(2, 4, 10, 0.6)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetX = 14;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = '#1d3a6e';
  ctx.fillRect(0, 0, sw, sh);
  ctx.restore();
  ctx.beginPath();
  ctx.rect(0, 0, sw, sh);
  ctx.clip();
  const b1 = hex('#21427c');
  const b2 = hex('#17305c');
  const paper = pixelLayer(400, 240, (u, v) => {
    const t = n2(u * 6, v * 6, 5);
    const fold = Math.exp(-Math.pow((u - 0.5) / 0.004, 2)) * 0.25 + Math.exp(-Math.pow((v - 0.5) / 0.006, 2)) * 0.2;
    const k = Math.min(1, Math.max(0, t * 1.3 - 0.15 + fold));
    return [mix(b1[0], b2[0], k), mix(b1[1], b2[1], k), mix(b1[2], b2[2], k), 255];
  });
  ctx.drawImage(paper, 0, 0, sw, sh);

  // grid: 5 mm minor, 25 mm major (at ~9 px/mm)
  const mm = 9;
  for (let i = 0; i * mm * 5 < sw; i++) {
    const x = i * mm * 5;
    ctx.strokeStyle = INK + (i % 5 === 0 ? '0.2)' : '0.09)');
    ctx.lineWidth = i % 5 === 0 ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, sh);
    ctx.stroke();
  }
  for (let j = 0; j * mm * 5 < sh; j++) {
    const y = j * mm * 5;
    ctx.strokeStyle = INK + (j % 5 === 0 ? '0.2)' : '0.09)');
    ctx.lineWidth = j % 5 === 0 ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(sw, y);
    ctx.stroke();
  }
  // border frame
  ctx.strokeStyle = INK + '0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, sw - 72, sh - 72);
  ctx.lineWidth = 1;
  ctx.strokeRect(48, 48, sw - 96, sh - 96);

  // the drawing, title block and notes (sheet-local coordinates)
  drawWatch(ctx, sw * 0.19, sh * 0.5, 7.6);
  titleBlock(ctx, sw * 0.66, 70, sw * 0.3, 220);
  ctx.fillStyle = INK + '0.6)';
  ctx.font = `500 17px ${FONT}`;
  ctx.textAlign = 'left';
  const notes = ['NOTES:', '1. ALL DIMENSIONS IN MM.', '2. DO NOT SCALE.', '3. TIME IS APPROXIMATE (±20 S / MONTH).', '4. NO AI WAS USED IN THIS PRODUCT.'];
  notes.forEach((t, i) => ctx.fillText(t, sw * 0.04, sh * 0.82 + i * 26));
  ctx.restore();

  // --- cool morning grade + vignette
  ctx.globalCompositeOperation = 'multiply';
  const vig = ctx.createRadialGradient(W * 0.5, H * 0.45, H * 0.3, W * 0.5, H * 0.5, W * 0.72);
  vig.addColorStop(0, 'rgb(236, 240, 248)');
  vig.addColorStop(1, 'rgb(96, 104, 124)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}
