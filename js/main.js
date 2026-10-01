const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const isMobile = () => window.innerWidth < 860;

document.body.classList.add('is-loading');

/* ------------------------------------------------------------------------
   Copy for the exploded architecture view
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

// Page accent colour that follows the selected dial
const DIAL_ACCENTS = { black: '#c9ced6', blue: '#7aa2ff', green: '#5fd3a4', white: '#e9e6dc' };

const BENCH = [
  { name: 'TimeBench-1302', q: '“What time is it?”', mtp: 99.9992, bot: 0, note: 'Frontier Chatbot declined to answer and recommended checking a clock.', star: true },
  { name: 'OfflineQA', q: 'Answers with no internet connection', mtp: 100, bot: 0 },
  { name: 'GlanceLatency', q: 'Responds in under one second', mtp: 100, bot: 9 },
  { name: 'SycophancyEval', q: 'Never opens with “Great question!”', mtp: 100, bot: 4 },
  { name: 'DunkBench', q: 'Still works after a 50 m dive', mtp: 100, bot: 0, note: 'Frontier Chatbot did not attend the dive.' },
];

/* ------------------------------------------------------------------------
   Scroll-driven scene states for the 3D watch.
   x / y are fractions of the half-viewport; size is the case diameter as a
   fraction of the smaller viewport dimension.
   ------------------------------------------------------------------------ */

function sceneState(name, p, m) {
  switch (name) {
    case 'hero':
      return m
        ? { x: 0, y: 0.4, size: 0.5, rx: 0.32, ry: -0.32, rz: 0.12, explode: 0, dim: 1, bracelet: 1 }
        : { x: 0.44, y: -0.02, size: 0.42, rx: 0.2, ry: -0.46, rz: 0.14, explode: 0, dim: 1, bracelet: 1 };
    case 'statement':
      return { x: m ? 0 : 0.08, y: 0, size: m ? 0.5 : 0.36, rx: 0.08, ry: -1.42, rz: 0, explode: 0, dim: 0.15, bracelet: 1 };
    case 'mtp':
      return m
        ? { x: 0, y: 0.44, size: 0.6, rx: 0.05, ry: 0.12, rz: 0, explode: 0, dim: 1, bracelet: 1 }
        : { x: -0.46, y: 0, size: 0.6, rx: 0.04, ry: 0.22, rz: 0, explode: 0, dim: 1, bracelet: 1 };
    case 'stats':
      return { x: m ? 0.2 : 0.74, y: m ? 0.95 : 0.7, size: 0.3, rx: 1.0, ry: 0.5, rz: -0.6, explode: 0, dim: 0.4, bracelet: 1 };
    case 'explode': {
      const ex = clamp01(p / 0.12);
      return m
        ? { x: 0, y: 0.42, size: 0.36, rx: -1.0, ry: 0, rz: -0.55, explode: ex, dim: 1, bracelet: 1 - ex }
        : { x: 0.14, y: -0.07, size: 0.35, rx: -1.02, ry: 0, rz: -0.55, explode: ex, dim: 1, bracelet: 1 - ex };
    }
    case 'config':
      return m
        ? { x: 0, y: 0.42, size: 0.5, rx: 0.18, ry: -0.3, rz: 0.1, explode: 0, dim: 1, bracelet: 1 }
        : { x: -0.5, y: -0.02, size: 0.36, rx: 0.16, ry: -0.36, rz: 0.12, explode: 0, dim: 1, bracelet: 1 };
    case 'reveal': {
      // starts big and centred, then rises to make room for the closing lines
      const t = ease(clamp01((p - 0.12) / 0.3));
      return m
        ? { x: 0, y: lerp(0.08, 0.57, t), size: lerp(0.66, 0.34, t), rx: 0, ry: 0, rz: 0, explode: 0, dim: 1, bracelet: 1 }
        : { x: 0, y: lerp(0, 0.45, t), size: lerp(0.42, 0.22, t), rx: 0, ry: 0, rz: 0, explode: 0, dim: 1, bracelet: 1 };
    }
    case 'off':
    default:
      return { x: 0.3, y: 2.3, size: 0.32, rx: 1.4, ry: 0.8, rz: -1.4, explode: 0, dim: 1, bracelet: 1 };
  }
}

function mix(a, b, t) {
  const o = {};
  for (const k in a) o[k] = lerp(a[k], b[k], t);
  return o;
}

/* ------------------------------------------------------------------------
   3D watch boot
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
  if (y <= stops[0].b) return sceneState(stops[0].name, 0, m);
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (y >= s.a && y <= s.b) return sceneState(s.name, s.b > s.a ? (y - s.a) / (s.b - s.a) : 1, m);
    const n = stops[i + 1];
    if (n && y > s.b && y < n.a) {
      const t = ease(clamp01((y - s.b) / (n.a - s.b)));
      return mix(sceneState(s.name, 1, m), sceneState(n.name, 0, m), t);
    }
  }
  const last = stops[stops.length - 1];
  return sceneState(last.name, 1, m);
}

/* ------------------------------------------------------------------------
   Architecture section: layer steps + leader-line labels
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
  const idx = Math.min(steps - 1, Math.floor(q));
  setLayer(idx);
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
  // de-collide label rows
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
   Scroll handler
   ------------------------------------------------------------------------ */

const nav = $('#nav');
const stage = $('#stage');
const endEl = $('#end');

function updateEnd() {
  const r = endEl.getBoundingClientRect();
  const p = clamp01(-r.top / (r.height - window.innerHeight));
  endEl.classList.toggle('is-text', p > 0.3);
}
let ticking = false;

function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 30);
    if (watch) {
      watch.setTarget(stateAt(y));
      // once the last scene is done, let the canvas scroll away with the page
      const last = stops[stops.length - 1];
      stage.style.transform = last && y > last.b ? `translate3d(0, ${-(y - last.b)}px, 0)` : '';
    }
    updateArch();
    updateEnd();
    updateWords();
  });
}

/* ------------------------------------------------------------------------
   Statement: word-by-word reveal
   ------------------------------------------------------------------------ */

const wordsEl = $('[data-words]');
let words = [];
(function splitWords() {
  const wrap = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(' '));
          else {
            const s = document.createElement('span');
            s.className = 'w';
            s.textContent = part;
            frag.appendChild(s);
          }
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        wrap(child);
      }
    }
  };
  wrap(wordsEl);
  words = $$('.w', wordsEl);
})();

function updateWords() {
  if (reduceMotion) return;
  const r = wordsEl.getBoundingClientRect();
  const vh = window.innerHeight;
  const p = clamp01((vh * 0.85 - r.top) / (r.height + vh * 0.35));
  const n = Math.round(p * words.length);
  words.forEach((w, i) => w.classList.toggle('on', i < n));
}

/* ------------------------------------------------------------------------
   Live time
   ------------------------------------------------------------------------ */

const fmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const liveTime = $('#liveTime');
const endTime = $('#endTime');
const tickCount = $('#tickCount');
let ticks = 0;
function updateClock() {
  const now = new Date();
  const t = fmt.format(now);
  liveTime.textContent = t;
  endTime.textContent = t;
  tickCount.textContent = ticks.toLocaleString();
  ticks++;
  setTimeout(updateClock, 1000 - (Date.now() % 1000) + 5);
}
updateClock();

function initFallbackClock() {
  const g = $('#fbIdx');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
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
const rowsEl = $('#chartRows');
rowsEl.innerHTML =
  BENCH.map(
    (b, i) => `
  <div class="crow" tabindex="0" data-i="${i}" aria-label="${b.name}: MTP-1302 ${fmtPct(b.mtp)}, Frontier Chatbot ${fmtPct(b.bot)}">
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
  '<thead><tr><th>Benchmark</th><th>MTP-1302</th><th>Frontier Chatbot</th></tr></thead><tbody>' +
  BENCH.map((b) => `<tr><td>${b.name} — ${b.q}</td><td>${fmtPct(b.mtp)}</td><td>${fmtPct(b.bot)}${b.star ? '*' : ''}</td></tr>`).join('') +
  '</tbody>';

const chart = $('#chart');
const tip = $('#chartTip');
function showTip(row, clientX) {
  const b = BENCH[+row.dataset.i];
  tip.innerHTML = `
    <div class="tip-title">${b.name}</div>
    <div class="tip-row"><span><i class="sw sw--mtp"></i>MTP-1302</span><b>${fmtPct(b.mtp)}</b></div>
    <div class="tip-row"><span><i class="sw sw--bot"></i>Frontier Chatbot</span><b>${fmtPct(b.bot)}</b></div>
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
   Reveal-on-scroll + stat counters
   ------------------------------------------------------------------------ */

const countUp = (el) => {
  const target = +el.dataset.count;
  const comma = el.dataset.format === 'comma';
  const out = (v) => (comma ? Math.round(v).toLocaleString('en-US') : String(Math.round(v)));
  if (reduceMotion || target === 0) {
    el.textContent = out(target);
    return;
  }
  const t0 = performance.now();
  const dur = 1600;
  const step = (t) => {
    const k = clamp01((t - t0) / dur);
    el.textContent = out(target * (1 - Math.pow(1 - k, 4)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      $$('[data-count]', e.target).forEach(countUp);
      io.unobserve(e.target);
    }
  },
  { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
);
$$('.reveal').forEach((el) => io.observe(el));

/* ------------------------------------------------------------------------
   Marquees: duplicate content for a seamless loop
   ------------------------------------------------------------------------ */

$$('[data-marquee] .marquee__track').forEach((track) => {
  const items = [...track.children];
  items.forEach((n) => {
    const c = n.cloneNode(true);
    c.setAttribute('aria-hidden', 'true');
    track.appendChild(c);
  });
});

/* ------------------------------------------------------------------------
   Checkpoints (dial colour)
   ------------------------------------------------------------------------ */

const hexToRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};
const ckpts = $$('.ckpt');
function selectDial(btn, focus = false) {
  ckpts.forEach((b) => {
    const on = b === btn;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  if (focus) btn.focus();
  const accent = DIAL_ACCENTS[btn.dataset.dial];
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-rgb', hexToRgb(accent));
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
   Pointer: subtle tilt everywhere, drag-to-inspect in the hero
   ------------------------------------------------------------------------ */

function initPointer() {
  if (!watch) return;
  if (finePointer) {
    window.addEventListener('pointermove', (e) => {
      watch.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    });
  }
  const hero = $('.hero');
  let last = null;
  hero.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.target.closest('a, button')) return;
    last = { x: e.clientX, y: e.clientY };
    hero.setPointerCapture(e.pointerId);
    hero.classList.add('is-dragging');
    watch.dragStart();
  });
  hero.addEventListener('pointermove', (e) => {
    if (!last) return;
    watch.dragMove(e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
  });
  const end = () => {
    if (!last) return;
    last = null;
    hero.classList.remove('is-dragging');
    watch.dragEnd();
  };
  hero.addEventListener('pointerup', end);
  hero.addEventListener('pointercancel', end);
}

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
  const [has3D] = await Promise.all([boot3D(), runLoader(), fontsReady]);

  computeStops();
  if (has3D) {
    watch.refreshPrint();
    const s = stateAt(window.scrollY);
    watch.setTarget(s);
    watch.jump({ ...s, y: s.y - 1.4, rx: s.rx + 1.1, rz: s.rz - 0.9, size: s.size * 0.6 });
    watch.start(drawLabels);
    initPointer();
  }
  onScroll();

  $('#loader').classList.add('is-done');
  document.body.classList.remove('is-loading');
}

window.addEventListener('scroll', onScroll, { passive: true });
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    watch?.resize();
    computeStops();
    onScroll();
  }, 120);
});
window.addEventListener('load', () => {
  computeStops();
  onScroll();
});
// fonts, images and reveals can shift section offsets after boot
if ('ResizeObserver' in window) {
  new ResizeObserver(() => {
    computeStops();
    onScroll();
  }).observe(document.body);
}

start();
