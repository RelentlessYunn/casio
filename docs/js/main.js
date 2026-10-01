import { paintDesk } from './desk.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const TAU = Math.PI * 2;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const isMobile = () => window.innerWidth < 860;

document.body.classList.add('is-loading');

/* ------------------------------------------------------------------------
   Copy & data
   ------------------------------------------------------------------------ */

const LAYER_COPY = [
  { id: 'crystal', name: 'Mineral glass', label: 'Prompt shield', desc: 'A hardened prompt shield. Deflects scratches, coffee and prompt injection.' },
  { id: 'hands', name: 'Three-head attention', label: 'Attention ×3', desc: 'Hour, minute and second heads. Luminous, so inference continues in the dark.' },
  { id: 'dial', name: 'Sunburst dial', label: 'Latent space', desc: 'A radially brushed latent space with twelve dimensions. You already know all of them.' },
  { id: 'date', name: 'Date window', label: 'Long-term memory', desc: 'Remembers what day it is. Needs manual fine-tuning after any month shorter than 31 days.' },
  { id: 'case', name: 'Stainless steel case', label: 'Compute cluster', desc: 'A single-node cluster, 38.5 mm across. Air-cooled by whatever room you are in.' },
  { id: 'movement', name: 'Quartz module 2784', label: 'Inference engine', desc: 'A quartz crystal vibrating 32,768 times a second, divided down to one perfect tick. Fully deterministic.' },
  { id: 'battery', name: 'SR626SW cell', label: 'Power', desc: 'About three years per cell. Replaceable at almost any watch kiosk. No data centre required.' },
  { id: 'caseback', name: 'Stainless caseback', label: 'Closed source', desc: 'The only closed-source part of the release. Please do not open in production.' },
];

const BENCH = [
  { name: 'TimeBench', q: '“What time is it?”', mtp: 99.9992, bot: 0, note: 'Frontier chatbot declined to answer and recommended checking a clock.', star: true },
  { name: 'OfflineQA', q: 'Answers with no internet connection', mtp: 100, bot: 0 },
  { name: 'GlanceLatency', q: 'Responds in under one second', mtp: 100, bot: 9 },
  { name: 'SycophancyEval', q: 'Never opens with “Great question!”', mtp: 100, bot: 4 },
  { name: 'DunkBench', q: 'Still works after a 50 m dive', mtp: 100, bot: 0, note: 'Frontier chatbot did not attend the dive.' },
];

/* ------------------------------------------------------------------------
   Scroll-driven scene states for the 3D watch.
   x / y: fractions of the half-viewport. size: case diameter as a fraction of
   min(viewport height, 1.1 × width). z: world units towards the camera.
   ------------------------------------------------------------------------ */

const BASE = { x: 0, y: 0, z: 0, size: 0.36, rx: 0, ry: 0, rz: 0, explode: 0, dim: 1, bracelet: 1, loop: 1, shadow: 0 };

// Fit the watch into a DOM box, so the 3D object becomes part of the flat layout.
function dock(el, fill, cy = 0.5) {
  const r = el.getBoundingClientRect();
  const W = window.innerWidth;
  const H = window.innerHeight;
  const casePx = Math.min(r.width * 0.5, r.height * 0.32) * fill;
  return {
    x: ((r.left + r.width / 2) / W) * 2 - 1,
    y: -(((r.top + r.height * cy) / H) * 2 - 1),
    size: casePx / Math.min(H, W * 1.1),
  };
}

function sceneState(name, p, m) {
  switch (name) {
    case 'hero': {
      const a = ease(clamp01((p - 0.02) / 0.24)); // lift off the desk
      const b = ease(clamp01((p - 0.28) / 0.38)); // spin
      const c = ease(clamp01((p - 0.7) / 0.28)); // settle
      const rest = m ? { x: 0, y: 0.2, size: 0.52 } : { x: 0.04, y: -0.02, size: 0.31 };
      return {
        ...BASE,
        x: lerp(rest.x, 0, a),
        y: lerp(rest.y, m ? -0.02 : 0, a),
        z: (m ? 20 : 30) * a * (1 - c),
        size: m ? lerp(lerp(rest.size, 0.36, a), 0.5, c) : lerp(lerp(rest.size, 0.235, a), 0.34, c),
        rx: 0.42 * a * (1 - c) + 0.08 * c,
        ry: -0.4 * a * (1 - c) + TAU * b,
        rz: lerp(-0.42, 0.12, a) * (1 - c),
        loop: a,
        shadow: 1 - clamp01(a * 1.6),
      };
    }
    case 'features':
      return { ...BASE, ...dock($('#featStage'), 1, 0.42), rx: 0.12, ry: TAU - 0.35, rz: 0.05 };
    case 'explode': {
      const ex = clamp01(p / 0.12);
      const pose = m ? { x: 0, y: 0.42, size: 0.36 } : { x: 0.14, y: -0.07, size: 0.35 };
      return { ...BASE, ...pose, rx: -1.02, ry: TAU, rz: -0.55, explode: ex, bracelet: 1 - ex };
    }
    case 'product':
      return { ...BASE, ...dock($('#slot'), 0.95, 0.5), rx: 0.14, ry: TAU - 0.38, rz: 0.1 };
    case 'reveal': {
      const t = ease(clamp01((p - 0.12) / 0.3));
      return m
        ? { ...BASE, y: lerp(0.08, 0.57, t), size: lerp(0.66, 0.34, t), ry: TAU }
        : { ...BASE, y: lerp(0, 0.45, t), size: lerp(0.42, 0.22, t), ry: TAU };
    }
    case 'off':
    default:
      return { ...BASE, x: 0.3, y: 2.4, size: 0.32, rx: 1.4, ry: TAU + 0.8, rz: -1.4 };
  }
}

function mix(a, b, t) {
  const o = {};
  for (const k in a) o[k] = lerp(a[k], b[k], t);
  return o;
}

/* ------------------------------------------------------------------------
   3D boot
   ------------------------------------------------------------------------ */

let watch = null;
let stops = [];
const sceneEls = $$('[data-scene]');

async function boot3D() {
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    const { createWatch } = await import('./watch.js');
    // `?snap` settles the 3D state instantly (handy for screenshots on slow software renderers)
    const snap = new URLSearchParams(location.search).has('snap');
    watch = createWatch($('#stage'), { reduceMotion: reduceMotion || snap });
    return true;
  } catch (err) {
    console.warn('3D disabled:', err);
    document.documentElement.classList.add('no-webgl');
    $('#stage').style.display = 'none';
    initFallbackClock();
    return false;
  }
}

function computeStops() {
  const vh = window.innerHeight;
  stops = sceneEls.map((el) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    const h = el.offsetHeight;
    let a;
    let b;
    if (h > vh * 1.05) {
      a = top;
      b = top + h - vh;
    } else {
      a = b = top + h / 2 - vh / 2;
    }
    return { name: el.dataset.scene, a, b };
  });
}

function stateAt(y) {
  const m = isMobile();
  if (!stops.length) return sceneState('hero', 0, m);
  if (y <= stops[0].b) return sceneState(stops[0].name, clamp01((y - stops[0].a) / Math.max(1, stops[0].b - stops[0].a)), m);
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (y >= s.a && y <= s.b) return sceneState(s.name, s.b > s.a ? (y - s.a) / (s.b - s.a) : 1, m);
    const n = stops[i + 1];
    if (n && y > s.b && y < n.a) {
      const t = ease(clamp01((y - s.b) / (n.a - s.b)));
      return mix(sceneState(s.name, 1, m), sceneState(n.name, 0, m), t);
    }
  }
  return sceneState(stops[stops.length - 1].name, 1, m);
}

/* ------------------------------------------------------------------------
   Text splitting
   ------------------------------------------------------------------------ */

function splitLines(el) {
  if (!el.dataset.text) el.dataset.text = el.textContent.trim().replace(/\s+/g, ' ');
  const text = el.dataset.text;
  el.setAttribute('aria-label', text);
  el.innerHTML = text
    .split(' ')
    .map((w) => `<span class="w">${w}</span>`)
    .join(' ');
  const lines = [];
  let top = null;
  for (const w of $$('.w', el)) {
    if (w.offsetTop !== top) {
      lines.push([]);
      top = w.offsetTop;
    }
    lines[lines.length - 1].push(w.textContent);
  }
  el.innerHTML = lines.map((l) => `<span class="line-mask" aria-hidden="true"><span>${l.join(' ')}</span></span>`).join('');
  return $$('.line-mask > span', el);
}

function splitChars(el) {
  const text = el.textContent;
  el.setAttribute('aria-label', text.replace(/ /g, ' '));
  el.innerHTML = [...text]
    .map((c) => (c === ' ' ? ' ' : `<span class="ch" aria-hidden="true">${c === ' ' ? '&nbsp;' : c}</span>`))
    .join('');
  return $$('.ch', el);
}

/* ------------------------------------------------------------------------
   Header: wordmark docks into the bar
   ------------------------------------------------------------------------ */

const topbar = $('#topbar');
const brandMark = $('#brandMark');
const brandDot = $('#brandDot');
const brandHand = $('#brandHand');
const tagWords = $$('#brandTag > span > span');
let brandMetrics = null;

function measureBrand() {
  brandMark.style.transform = 'none';
  const r = brandMark.getBoundingClientRect();
  const smallW = isMobile() ? 96 : 124;
  const s = smallW / r.width;
  const barCenter = 32;
  brandMetrics = { s, ty: barCenter - (r.top + (r.height * s) / 2) };
}

function updateBrand(y) {
  if (!brandMetrics) measureBrand();
  const k = clamp01(y / 360);
  tagWords.forEach((w, i) => {
    const t = clamp01((k - i * 0.035) / 0.22);
    w.style.transform = `translateY(${-110 * t}%)`;
  });
  const e = ease(clamp01((k - 0.18) / 0.82));
  const s = lerp(1, brandMetrics.s, e);
  brandMark.style.transform = `translate3d(0, ${brandMetrics.ty * e}px, 0) scale(${s})`;
  brandDot.style.opacity = String(1 - e);
  brandDot.style.transform = `scale(${1 - e})`;
  topbar.style.setProperty('--bar-o', String(e));
}

/* ------------------------------------------------------------------------
   Intro timeline
   ------------------------------------------------------------------------ */

const intro = $('#intro');
const desk = $('#desk');
const deskDim = $('#deskDim');
const glow = $('#glow');
const introCard = $('#introCard');
const introDash = $('#introDash');
const introNote = $('#introNote');
const scrollCue = $('#scrollCue');
const hype = $('#hype');
const hypeTitle = $('#hypeTitle');
const hypeDesc = $('#hypeDesc');
let copyLines = [];
let tagLines = [];
const titleChars = splitChars(hypeTitle);
const descChars = splitChars(hypeDesc);

function splitIntro() {
  copyLines = splitLines($('#introCopy'));
  tagLines = $$('[data-lines]', introCard).flatMap((el) => splitLines(el));
}

let lastDeskBlur = -1;
function updateIntro() {
  const r = intro.getBoundingClientRect();
  const vh = window.innerHeight;
  const p = clamp01(-r.top / (r.height - vh));
  const past = -r.top - (r.height - vh); // px scrolled beyond the pinned intro

  copyLines.forEach((l, i) => {
    const t = clamp01((p - 0.012 - i * 0.012) / 0.06);
    l.style.opacity = String(1 - t);
    l.style.transform = `translate3d(${40 * t}px, 0, 0)`;
    l.style.filter = t > 0 ? `blur(${8 * t}px)` : '';
  });
  const nTag = tagLines.length;
  tagLines.forEach((l, i) => {
    const t = clamp01((p - 0.025 - (nTag - 1 - i) * 0.008) / 0.05);
    l.style.transform = `translate3d(0, ${105 * ease(t)}%, 0)`;
  });
  introDash.style.transform = `scaleX(${1 - ease(clamp01((p - 0.03) / 0.05))})`;
  introDash.style.transformOrigin = 'right';
  const cardOut = clamp01((p - 0.08) / 0.03);
  introCard.style.opacity = String(1 - cardOut);
  introCard.style.visibility = cardOut >= 1 ? 'hidden' : '';
  const cue = clamp01(p / 0.04);
  introNote.style.opacity = String(1 - cue);
  scrollCue.style.opacity = String(1 - cue);

  // the desk dims and blurs away
  const d = ease(clamp01((p - 0.03) / 0.18));
  deskDim.style.opacity = String(d * 0.94);
  const blur = Math.round(d * 12) / 2;
  if (blur !== lastDeskBlur) {
    desk.style.filter = blur > 0 ? `blur(${blur}px)` : '';
    lastDeskBlur = blur;
  }
  desk.style.visibility = past > 0 ? 'hidden' : '';

  // the statement
  hype.classList.toggle('is-on', p > 0.24 && p < 0.8);
  const N = titleChars.length;
  titleChars.forEach((c, j) => {
    c.style.opacity = String(clamp01((p - 0.3 - ((N - 1 - j) / N) * 0.1) / 0.04));
  });
  const M = descChars.length;
  descChars.forEach((c, j) => {
    c.style.opacity = String(clamp01((p - 0.32 - (j / M) * 0.13) / 0.04));
  });
  const enter = ease(clamp01((p - 0.29) / 0.16));
  const out = ease(clamp01((p - 0.64) / 0.08));
  hypeTitle.style.transform = `translate3d(0, ${lerp(-50, 0, enter) + 40 * out}%, 0)`;
  hypeTitle.style.opacity = String(1 - out);
  hypeDesc.style.transform = `translate3d(0, ${lerp(50, 0, enter) - 40 * out}%, 0)`;
  hypeDesc.style.opacity = String(1 - out);

  // a cool glow takes over as the intro ends, then fades into the page
  const g = ease(clamp01((p - 0.7) / 0.25)) * (1 - clamp01(past / (vh * 0.9)));
  glow.style.opacity = String(g);
}

/* ------------------------------------------------------------------------
   Architecture: layer steps + leader-line labels
   ------------------------------------------------------------------------ */

const arch = $('#architecture');
const layerIdx = $('#layerIdx');
const layerName = $('#layerName');
const layerDesc = $('#layerDesc');
const layerBox = $('.arch__layer');
const stepsEl = $('#layerSteps');
const xlabels = $('#xlabels');
let currentLayer = -1;
let archOn = false;

stepsEl.innerHTML = LAYER_COPY.map((l) => `<li title="${l.name}"><i></i></li>`).join('');
const stepFills = $$('#layerSteps i');

const svgNS = 'http://www.w3.org/2000/svg';
const xsvg = document.createElementNS(svgNS, 'svg');
xsvg.setAttribute('width', '100%');
xsvg.setAttribute('height', '100%');
xsvg.style.position = 'absolute';
xsvg.style.inset = '0';
xlabels.appendChild(xsvg);
const labelEls = LAYER_COPY.map((l, i) => {
  const line = document.createElementNS(svgNS, 'polyline');
  line.setAttribute('class', 'xline');
  const dot = document.createElementNS(svgNS, 'circle');
  dot.setAttribute('class', 'xdot');
  dot.setAttribute('r', '3.5');
  xsvg.append(line, dot);
  const txt = document.createElement('div');
  txt.className = 'xlabel';
  txt.innerHTML = `<span class="xlabel__txt"><b>${String(i + 1).padStart(2, '0')}</b>&nbsp;&nbsp;${l.label}</span>`;
  xlabels.appendChild(txt);
  return { line, dot, txt };
});

function setLayer(i) {
  if (i === currentLayer) return;
  currentLayer = i;
  const l = LAYER_COPY[i];
  layerIdx.textContent = String(i + 1).padStart(2, '0');
  layerName.textContent = l.name;
  layerDesc.textContent = l.desc;
  layerBox.classList.remove('swap');
  void layerBox.offsetWidth;
  layerBox.classList.add('swap');
  labelEls.forEach((el, j) => {
    const on = j === i;
    el.txt.classList.toggle('is-active', on);
    el.line.classList.toggle('is-active', on);
    el.dot.classList.toggle('is-active', on);
  });
  watch?.setActiveLayer(i);
}

function updateArch() {
  const r = arch.getBoundingClientRect();
  const span = r.height - window.innerHeight;
  const p = clamp01(-r.top / span);
  const inView = r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.5;
  const steps = LAYER_COPY.length;
  const q = clamp01((p - 0.1) / 0.86) * steps;
  setLayer(Math.min(steps - 1, Math.floor(q)));
  stepFills.forEach((f, j) => {
    f.style.transform = `scaleX(${clamp01(q - j)})`;
  });
  archOn = inView && p > 0.06 && p < 0.995;
  xlabels.classList.toggle('is-on', archOn && !isMobile());
}

function drawLabels(info) {
  if (!info.labels || !archOn || isMobile()) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const pts = LAYER_COPY.map((l, i) => ({ i, ...info.labels[l.id] }));
  const maxX = Math.max(...pts.map((p) => p.x));
  const colX = Math.min(maxX + 70, W - 230);
  const sorted = [...pts].sort((a, b) => a.y - b.y);
  const gap = 30;
  for (let k = 0; k < sorted.length; k++) {
    sorted[k].ty = k === 0 ? Math.max(sorted[k].y, 90) : Math.max(sorted[k].y, sorted[k - 1].ty + gap);
  }
  for (let k = sorted.length - 1; k >= 0; k--) {
    const limit = k === sorted.length - 1 ? H - 40 : sorted[k + 1].ty - gap;
    sorted[k].ty = Math.min(sorted[k].ty, limit);
  }
  for (const p of pts) {
    const el = labelEls[p.i];
    el.line.setAttribute('points', `${p.x},${p.y} ${colX - 24},${p.ty} ${colX},${p.ty}`);
    el.dot.setAttribute('cx', p.x);
    el.dot.setAttribute('cy', p.y);
    el.txt.style.transform = `translate(${colX + 4}px, ${p.ty}px) translateY(-50%)`;
  }
}

/* ------------------------------------------------------------------------
   Ending
   ------------------------------------------------------------------------ */

const endEl = $('#end');
function updateEnd() {
  const r = endEl.getBoundingClientRect();
  const p = clamp01(-r.top / (r.height - window.innerHeight));
  endEl.classList.toggle('is-text', p > 0.3);
}

/* ------------------------------------------------------------------------
   Scroll handler
   ------------------------------------------------------------------------ */

const stage = $('#stage');
let ticking = false;

function update() {
  const y = window.scrollY;
  updateBrand(y);
  updateIntro();
  updateArch();
  updateEnd();
  if (watch) {
    watch.setTarget(stateAt(y));
    // once the last scene is done, let the canvas scroll away with the page
    const last = stops[stops.length - 1];
    stage.style.transform = last && y > last.b ? `translate3d(0, ${-(y - last.b)}px, 0)` : '';
  }
}

function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    update();
  });
}

/* ------------------------------------------------------------------------
   Live time
   ------------------------------------------------------------------------ */

const fmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const timeEls = $$('[data-time]');
const tickCount = $('#tickCount');
let ticks = 0;
function updateClock() {
  const now = new Date();
  const t = fmt.format(now);
  timeEls.forEach((el) => (el.textContent = t));
  tickCount.textContent = ticks.toLocaleString();
  brandHand.style.transform = `rotate(${now.getSeconds() * 6}deg)`;
  ticks++;
  setTimeout(updateClock, 1000 - (Date.now() % 1000) + 5);
}
updateClock();

function initFallbackClock() {
  const g = $('#fbIdx');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const l = document.createElementNS(svgNS, 'line');
    l.setAttribute('x1', 100 + Math.sin(a) * 64);
    l.setAttribute('y1', 100 - Math.cos(a) * 64);
    l.setAttribute('x2', 100 + Math.sin(a) * 74);
    l.setAttribute('y2', 100 - Math.cos(a) * 74);
    g.appendChild(l);
  }
  const set = () => {
    const d = new Date();
    const s = d.getSeconds();
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    $('#fbS').setAttribute('transform', `rotate(${s * 6} 100 100)`);
    $('#fbM').setAttribute('transform', `rotate(${m * 6} 100 100)`);
    $('#fbH').setAttribute('transform', `rotate(${h * 30} 100 100)`);
  };
  set();
  setInterval(set, 1000);
}

/* ------------------------------------------------------------------------
   Benchmarks chart
   ------------------------------------------------------------------------ */

const fmtPct = (v) => `${v % 1 === 0 ? v : v.toFixed(4)}%`;
$('#chartRows').innerHTML =
  BENCH.map(
    (b, i) => `
  <div class="crow" tabindex="0" data-i="${i}" aria-label="${b.name}: MTP-1302 ${fmtPct(b.mtp)}, Frontier chatbot ${fmtPct(b.bot)}">
    <div class="crow__label"><p class="crow__name">${b.name}</p><p class="crow__q">${b.q}</p></div>
    <div class="crow__bars">
      <div class="cbar cbar--mtp" style="--w:${b.mtp}%"><div class="cbar__fill" style="--d:${i * 0.08}s"></div><span class="cbar__val">${fmtPct(b.mtp)}</span></div>
      <div class="cbar cbar--bot" style="--w:${b.bot}%"><div class="cbar__fill" style="--d:${i * 0.08 + 0.1}s"></div><span class="cbar__val">${fmtPct(b.bot)}${b.star ? '*' : ''}</span></div>
    </div>
  </div>`
  ).join('') +
  `<div class="crow crow--axis" aria-hidden="true"><div class="crow__label"></div><div class="crow__bars"><div class="axis-ticks">${[0, 25, 50, 75, 100]
    .map((t) => `<span style="left:${t}%">${t}${t === 100 ? '%' : ''}</span>`)
    .join('')}</div></div></div>`;

$('#chartTable').innerHTML =
  '<thead><tr><th>Benchmark</th><th>MTP-1302</th><th>Frontier chatbot</th></tr></thead><tbody>' +
  BENCH.map((b) => `<tr><td>${b.name} — ${b.q}</td><td>${fmtPct(b.mtp)}</td><td>${fmtPct(b.bot)}${b.star ? '*' : ''}</td></tr>`).join('') +
  '</tbody>';

const chart = $('#chart');
const tip = $('#chartTip');
function showTip(row, clientX) {
  const b = BENCH[+row.dataset.i];
  tip.innerHTML = `
    <div class="tip-title">${b.name}</div>
    <div class="tip-row"><span><i class="sw sw--mtp"></i>MTP-1302</span><b>${fmtPct(b.mtp)}</b></div>
    <div class="tip-row"><span><i class="sw sw--bot"></i>Frontier chatbot</span><b>${fmtPct(b.bot)}</b></div>
    ${b.note ? `<div class="tip-note">${b.note}</div>` : ''}`;
  const cr = chart.getBoundingClientRect();
  const rr = row.getBoundingClientRect();
  tip.classList.add('is-on');
  const tw = tip.offsetWidth;
  const x = clientX != null ? clientX - cr.left + 16 : rr.left - cr.left + 24;
  tip.style.left = `${Math.min(Math.max(8, x), cr.width - tw - 8)}px`;
  tip.style.top = `${rr.bottom - cr.top + 6}px`;
}
$$('.crow[data-i]').forEach((row) => {
  row.addEventListener('pointermove', (e) => showTip(row, e.clientX));
  row.addEventListener('pointerleave', () => tip.classList.remove('is-on'));
  row.addEventListener('focus', () => showTip(row));
  row.addEventListener('blur', () => tip.classList.remove('is-on'));
});

/* ------------------------------------------------------------------------
   Reveal-on-scroll, marquees, active nav link
   ------------------------------------------------------------------------ */

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  },
  { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
);
$$('.reveal').forEach((el) => io.observe(el));

$$('[data-marquee] .marquee__track').forEach((track) => {
  [...track.children].forEach((n) => {
    const c = n.cloneNode(true);
    c.setAttribute('aria-hidden', 'true');
    track.appendChild(c);
  });
});

$$('.flip').forEach((a) => {
  const label = a.dataset.label;
  const chars = (cls) => `<span class="${cls}" aria-hidden="true">${[...label].map((c, i) => `<span class="ch" style="--i:${i}">${c}</span>`).join('')}</span>`;
  a.setAttribute('aria-label', label);
  a.innerHTML = chars('orig') + chars('clone');
});
const navLinks = $$('.links .flip');
const navIo = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${e.target.id}`));
    }
  },
  { rootMargin: '-45% 0px -50% 0px' }
);
$$('main section[id]').forEach((s) => navIo.observe(s));

/* ------------------------------------------------------------------------
   Mobile menu
   ------------------------------------------------------------------------ */

const menuBtn = $('#menuBtn');
const drawer = $('#drawer');
function setMenu(open) {
  drawer.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.querySelector('span').textContent = open ? 'Close' : 'Menu';
}
menuBtn.addEventListener('click', () => setMenu(drawer.hidden));
$$('[data-close]', drawer).forEach((el) => el.addEventListener('click', () => setMenu(false)));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !drawer.hidden) setMenu(false);
});

/* ------------------------------------------------------------------------
   Checkpoints (dial colour)
   ------------------------------------------------------------------------ */

const ckpts = $$('.ckpt');
function selectDial(btn, focus = false) {
  ckpts.forEach((b) => {
    const on = b === btn;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  if (focus) btn.focus();
  $('#ckptCode').textContent = btn.dataset.code;
  watch?.setDial(btn.dataset.dial);
}
ckpts.forEach((btn, i) => {
  btn.tabIndex = btn.getAttribute('aria-checked') === 'true' ? 0 : -1;
  btn.addEventListener('click', () => selectDial(btn));
  btn.addEventListener('keydown', (e) => {
    const dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    selectDial(ckpts[(i + dir + ckpts.length) % ckpts.length], true);
  });
});

/* ------------------------------------------------------------------------
   Toasts
   ------------------------------------------------------------------------ */

const toast = $('#toast');
let toastTimer;
$$('[data-toast]').forEach((b) =>
  b.addEventListener('click', () => {
    toast.textContent = b.dataset.toast;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 2800);
  })
);

/* ------------------------------------------------------------------------
   Preloader → start
   ------------------------------------------------------------------------ */

function runLoader() {
  const countEl = $('#loaderCount');
  const bar = $('#loaderBar');
  const dur = reduceMotion ? 200 : 1500;
  const t0 = performance.now();
  return new Promise((resolve) => {
    const step = (t) => {
      const k = clamp01((t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      countEl.textContent = Math.round(e * 105);
      bar.style.transform = `scaleX(${e})`;
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

async function start() {
  const fontsReady = Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]);
  const loader = runLoader();
  await fontsReady;
  paintDesk($('#deskCanvas'));
  splitIntro();
  const [has3D] = await Promise.all([boot3D(), loader]);

  measureBrand();
  computeStops();
  if (has3D) {
    watch.refreshPrint();
    const s = stateAt(window.scrollY);
    watch.setTarget(s);
    // drop the watch onto the desk as the loader fades
    if (window.scrollY < 10) watch.jump({ ...s, z: 80, rx: -0.35, rz: s.rz - 0.6, loop: 0.6, shadow: 0 });
    else watch.jump(s);
    watch.start(drawLabels);
    if (finePointer) {
      window.addEventListener('pointermove', (e) => {
        watch.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      });
    }
  }
  update();

  $('#loader').classList.add('is-done');
  document.body.classList.remove('is-loading');
}

window.addEventListener('scroll', onScroll, { passive: true });
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    watch?.resize();
    splitIntro();
    measureBrand();
    computeStops();
    update();
  }, 120);
});
if ('ResizeObserver' in window) {
  new ResizeObserver(() => {
    computeStops();
    onScroll();
  }).observe(document.body);
}

start();
