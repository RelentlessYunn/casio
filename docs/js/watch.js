// Procedural, real-time 3D model of the Casio MTP-1302.
// Units are millimetres. The watch face points down +Z towards the camera.

import * as THREE from '../vendor/three.min.js';

const { RoundedBoxGeometry } = THREE;

export const DIALS = {
  black: { base: '#17181c', print: '#eef0f3' },
  blue: { base: '#1f47b0', print: '#f3f6fc' },
  green: { base: '#1b6a49', print: '#f1f7f3' },
  white: { base: '#e6e7e8', print: '#1f2228' },
};

// Exploded-view layers, top to bottom.
export const LAYERS = [
  { id: 'crystal', lift: 37 },
  { id: 'hands', lift: 25 },
  { id: 'dial', lift: 12 },
  { id: 'date', lift: 12 }, // lives on the dial; separate label
  { id: 'case', lift: 0 },
  { id: 'movement', lift: -12 },
  { id: 'battery', lift: -21 },
  { id: 'caseback', lift: -31 },
];

const CASE_R = 19.25;
const DIAL_R = 15.5;
const DATE_WIN = { x: 11.55, y: 0, hw: 1.5, hh: 1.15 };
const TABLE_Z = -6.34;

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* -------------------------------------------------------------------------
   Geometry helpers
   ------------------------------------------------------------------------- */

// Lathe around the watch axis. Points are [radius, height]; trace them
// counter-clockwise (outer surfaces going up) so normals face outwards.
function lathe(points, segments = 192) {
  const g = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  g.rotateX(Math.PI / 2);
  return g;
}

function zCylinder(r, h, segs = 64, rTop = r) {
  const g = new THREE.CylinderGeometry(rTop, r, h, segs);
  g.rotateX(Math.PI / 2);
  return g;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function dataTex(c, { srgb = false, repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// Baton hand outline, inset by `bevel` so the bevelled result has the given size.
function handShape(width, length, tail, bevel = 0) {
  const w = width / 2 - bevel;
  const s = new THREE.Shape();
  s.moveTo(-w, tail + bevel);
  s.lineTo(w, tail + bevel);
  s.lineTo(w * 0.78, length - width * 1.2);
  s.lineTo(0, length - bevel * 1.6);
  s.lineTo(-w * 0.78, length - width * 1.2);
  s.closePath();
  return s;
}

/* -------------------------------------------------------------------------
   Textures
   ------------------------------------------------------------------------- */

// Subtle polish imperfections for steel roughness (G channel).
function makeSmudgeTex() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(0,200,0)';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const x = hash(i) * 256;
    const y = hash(i + 91) * 256;
    const r = 6 + hash(i + 7) * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = 150 + Math.round(hash(i + 3) * 105);
    g.addColorStop(0, `rgba(0,${v},0,0.35)`);
    g.addColorStop(1, `rgba(0,${v},0,0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return dataTex(c, { repeat: true });
}

// Linear brush lines along the texture's v axis (G channel).
function makeBrushTex() {
  const c = canvas(512, 8);
  const ctx = c.getContext('2d');
  for (let x = 0; x < 512; x++) {
    const v = 150 + Math.round(hash(x * 1.7) * 90 + hash(Math.floor(x / 7)) * 15);
    ctx.fillStyle = `rgb(0,${v},0)`;
    ctx.fillRect(x, 0, 1, 8);
  }
  return dataTex(c, { repeat: true });
}

// Dial helpers, in the dial lathe's UV space: u = angle (0 at 6 o'clock,
// counter-clockwise), v = 0 at the rim to 1 at the centre.
function dialUvToXY(u, v) {
  const r = DIAL_R * (1 - v);
  const phi = u * Math.PI * 2;
  return [r * Math.sin(phi), -r * Math.cos(phi), r];
}

// R = ambient occlusion (shade under the bezel), G = alpha (date window cut-out).
function makeDialMaskTex() {
  const W = 2048;
  const H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const u = (px + 0.5) / W;
      const v = 1 - (py + 0.5) / H;
      const [x, y, r] = dialUvToXY(u, v);
      const inWin = Math.abs(x - DATE_WIN.x) < DATE_WIN.hw && Math.abs(y - DATE_WIN.y) < DATE_WIN.hh;
      const rim = clamp01((r - 13.6) / 1.9);
      const ao = 1 - 0.5 * rim * rim - 0.08 * clamp01(1 - r / 1.6);
      const i = (py * W + px) * 4;
      img.data[i] = Math.round(ao * 255);
      img.data[i + 1] = inWin ? 0 : 255;
      img.data[i + 2] = 0;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return dataTex(c);
}

// Radial "sunburst" brush lines: variation only across the angle (G channel).
function makeSunburstTex() {
  const W = 4096;
  const c = canvas(W, 4);
  const ctx = c.getContext('2d');
  for (let x = 0; x < W; x++) {
    const v = 170 + Math.round(hash(x * 0.37) * 70 + hash(Math.floor(x / 5) * 3.1) * 15);
    ctx.fillStyle = `rgb(0,${v},0)`;
    ctx.fillRect(x, 0, 1, 4);
  }
  const t = dataTex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function makePrintTex() {
  const size = 2048;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const k = size / 2 / DIAL_R;
  ctx.translate(size / 2, size / 2);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';

  // minute track: fine ticks, heavier at the hours
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const five = i % 5 === 0;
    if (i === 15) continue; // date window side
    ctx.save();
    ctx.rotate(a);
    ctx.lineWidth = (five ? 0.2 : 0.11) * k;
    ctx.beginPath();
    ctx.moveTo(0, -14.55 * k);
    ctx.lineTo(0, -(five ? 15.25 : 15.05) * k);
    ctx.stroke();
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const family = '"Archivo", "Helvetica Neue", Arial, sans-serif';
  ctx.font = `800 ${1.95 * k}px ${family}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${0.08 * k}px`;
  ctx.fillText('CASIO', 0, -7.1 * k);
  ctx.font = `600 ${0.6 * k}px ${family}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${0.12 * k}px`;
  ctx.globalAlpha = 0.9;
  ctx.fillText('WATER RESIST', 0, 7.7 * k);
  ctx.globalAlpha = 1;
  return dataTex(c, { srgb: true });
}

function makeDateTex(day) {
  const c = canvas(256, 192);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f1ec';
  ctx.fillRect(0, 0, 256, 192);
  ctx.fillStyle = '#111215';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 118px "Archivo", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(String(day), 128, 100);
  return dataTex(c, { srgb: true });
}

// Engraving on the caseback: dark text (map) + bump.
function makeBackTex() {
  const size = 1024;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);
  const k = size / 2 / 14.5;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 0.12 * k;
  ctx.beginPath();
  ctx.arc(0, 0, 13.6 * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 9.2 * k, 0, Math.PI * 2);
  ctx.stroke();
  const ring = 'STAINLESS STEEL BACK  ·  WATER RESIST  ·  JAPAN MOVT  ·  MTP-1302  ·  ';
  ctx.font = `600 ${1.15 * k}px "JetBrains Mono", Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const step = (Math.PI * 2) / ring.length;
  [...ring].forEach((ch, i) => {
    ctx.save();
    ctx.rotate(i * step);
    ctx.fillText(ch, 0, -11.4 * k);
    ctx.restore();
  });
  ctx.font = `800 ${2.4 * k}px "Archivo", Arial, sans-serif`;
  ctx.fillText('CASIO', 0, -2.4 * k);
  ctx.font = `600 ${1.1 * k}px "JetBrains Mono", Menlo, monospace`;
  ctx.fillText('2784', 0, 1.4 * k);
  ctx.fillText('MADE IN THAILAND · CASE', 0, 3.6 * k);
  return dataTex(c);
}

function makeCellTex() {
  const size = 256;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 70px Arial, sans-serif';
  ctx.fillText('+', 128, 70);
  ctx.font = '700 34px Arial, sans-serif';
  ctx.fillText('SR626SW', 128, 150);
  return dataTex(c);
}

function makeContactTex() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return dataTex(c, { srgb: true });
}

// A per-face edge-darkening map: fake occlusion for bracelet links (R channel).
function makeLinkAoTex() {
  const s = 128;
  const c = canvas(s, s);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = Math.min(x, s - 1 - x) / (s / 2);
      const dy = Math.min(y, s - 1 - y) / (s / 2);
      const e = Math.min(dx, dy);
      const ao = 0.5 + 0.5 * Math.min(1, e / 0.22);
      const i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(ao * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return dataTex(c);
}

// A photo studio: mid-grey walls, a dark floor and big softboxes. Polished steel
// is a mirror, so this is what makes it read as silver with crisp highlights.
function makeStudio() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(260, 260, 260), new THREE.MeshBasicMaterial({ color: 0x5b616b, side: THREE.BackSide })));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshBasicMaterial({ color: 0x1d2128 }));
  floor.position.z = -70;
  s.add(floor);
  const panel = (w, h, intensity, color, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(130, 50, 4.2, 0xffffff, [-10, 95, 55]); // big overhead softbox
  panel(22, 110, 3.2, 0xeef3ff, [-105, 0, 30]); // left strip
  panel(20, 100, 2.6, 0xffffff, [105, 10, 5]); // right strip (rim)
  panel(90, 26, 1.8, 0xffffff, [0, 55, 150]); // front-top card: the bezel highlight
  panel(90, 22, 0.9, 0xd2dcff, [0, -95, 60]); // low bounce card
  return s;
}

/* -------------------------------------------------------------------------
   The watch
   ------------------------------------------------------------------------- */

export function createWatch(canvasEl, opts = {}) {
  const reduceMotion = !!opts.reduceMotion;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;

  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 10, 2000);
  camera.position.set(0, 0, 220);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(makeStudio(), 0, 0.1, 400).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 1.0;

  // Key light: soft daylight from the top left. Casts every shadow in the scene.
  const sunDir = new THREE.Vector3(-0.6, 0.7, 0.62).normalize();
  const key = new THREE.DirectionalLight(0xf4f6ff, 2.9);
  key.castShadow = true;
  const mapSize = small ? 2048 : 4096;
  key.shadow.mapSize.set(mapSize, mapSize);
  key.shadow.radius = 3;
  key.shadow.bias = -0.0003;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 700;
  const rim = new THREE.DirectionalLight(0x9db4ff, 1.2);
  rim.position.set(140, -60, -40);
  const fill = new THREE.DirectionalLight(0xe8eeff, 0.35);
  fill.position.set(120, 40, 120);
  scene.add(key, key.target, rim, fill);

  // The desk: an invisible plane that only shows shadows, plus a soft contact shadow.
  const shadowMat = new THREE.ShadowMaterial({ color: 0x02050c, opacity: 0.8, depthWrite: false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), shadowMat);
  ground.receiveShadow = true;
  ground.renderOrder = -2;
  scene.add(ground);
  const contactMat = new THREE.MeshBasicMaterial({ map: makeContactTex(), transparent: true, depthWrite: false, toneMapped: false, color: 0x02050c });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), contactMat);
  contact.renderOrder = -1;
  scene.add(contact);

  /* ----------------------------------------------------------------- materials */
  const smudge = makeSmudgeTex();
  const brush = makeBrushTex();
  const linkAo = makeLinkAoTex();
  const physical = (o) => new THREE.MeshPhysicalMaterial({ metalness: 1, ...o });

  const mat = {
    polished: physical({ color: 0xdde1e6, roughness: 0.11, roughnessMap: smudge }),
    polishedHi: physical({ color: 0xe8ebef, roughness: 0.07, roughnessMap: smudge }),
    brushed: physical({ color: 0xc3c8cf, roughness: 0.34, roughnessMap: brush, anisotropy: 0.75 }),
    linkPolished: physical({ color: 0xdde1e6, roughness: 0.1, roughnessMap: smudge, aoMap: linkAo }),
    linkBrushed: physical({ color: 0xc6cbd2, roughness: 0.36, roughnessMap: brush, anisotropy: 0.8, aoMap: linkAo }),
    backBrushed: physical({ color: 0xc3c8cf, roughness: 0.3, anisotropy: 0.8, anisotropyRotation: Math.PI / 2 }),
    hand: physical({ color: 0xeef0f3, roughness: 0.08 }),
    lume: new THREE.MeshStandardMaterial({ color: 0xe2eadc, emissive: 0x9fe6b6, emissiveIntensity: 0.06, roughness: 0.62, metalness: 0 }),
    black: new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.6, metalness: 0.2 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x16171a, metalness: 0.05, roughness: 0.5 }),
    plasticWhite: new THREE.MeshStandardMaterial({ color: 0xd9d6cc, metalness: 0, roughness: 0.55 }),
    copper: physical({ color: 0xc8804b, roughness: 0.32, roughnessMap: brush }),
    brass: physical({ color: 0xd9b45c, roughness: 0.22 }),
    pcb: new THREE.MeshStandardMaterial({ color: 0x1d3b2a, roughness: 0.45, metalness: 0.1 }),
    // Glass only adds reflected light; it never changes the canvas alpha, so it
    // stays invisible over the page except for its reflections.
    glass: new THREE.MeshStandardMaterial({
      color: 0x000000,
      metalness: 0,
      roughness: 0.02,
      envMapIntensity: 2.6,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    }),
    glassEdge: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.22, depthWrite: false }),
  };
  mat.lugHole = mat.black;
  // bracelet-only materials, so fading the bracelet never touches the case
  mat.claspPolished = mat.polished.clone();
  mat.pin = mat.black.clone();

  const dialMask = makeDialMaskTex();
  const dialMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(DIALS.blue.base),
    metalness: 0.62,
    roughness: 0.34,
    roughnessMap: makeSunburstTex(),
    anisotropy: 1,
    anisotropyRotation: 0,
    clearcoat: 0.65,
    clearcoatRoughness: 0.06,
    aoMap: dialMask,
    aoMapIntensity: 1,
    alphaMap: dialMask,
    alphaTest: 0.5,
  });
  const printMat = new THREE.MeshStandardMaterial({
    map: makePrintTex(),
    color: new THREE.Color(DIALS.blue.print),
    transparent: true,
    depthWrite: false,
    roughness: 0.45,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const dateMat = new THREE.MeshStandardMaterial({ map: makeDateTex(new Date().getDate()), roughness: 0.55, metalness: 0 });
  const braceletMats = [mat.linkPolished, mat.linkBrushed, mat.claspPolished, mat.pin];

  /* ----------------------------------------------------------------- hierarchy */
  const root = new THREE.Group();
  const spin = new THREE.Group();
  const watch = new THREE.Group();
  root.add(spin);
  spin.add(watch);
  scene.add(root);

  const layers = {};
  for (const id of ['crystal', 'second', 'minute', 'hour', 'dial', 'case', 'movement', 'battery', 'caseback', 'bracelet']) {
    layers[id] = new THREE.Group();
    watch.add(layers[id]);
  }
  const add = (layer, geo, material, pos, rot) => {
    const m = new THREE.Mesh(geo, material);
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    layers[layer].add(m);
    return m;
  };

  /* ----------------------------------------------------------------- case */
  add(
    'case',
    lathe([
      [17.4, -3.26], [18.2, -3.12], [18.8, -2.78], [19.14, -2.24], [CASE_R, -1.62],
      [CASE_R, 1.78], [19.16, 2.24], [18.88, 2.68], [18.36, 2.99], [17.64, 3.12],
      [16.94, 3.06], [16.5, 2.88], [16.28, 2.58], [16.28, 2.02], [15.86, 1.96],
      [15.86, 0.16], [15.52, 0.02], [15.52, -3.26], [17.4, -3.26],
    ]),
    mat.polished
  );

  // Lugs: side profile extruded across X with generous bevels, mirrored to the four corners.
  const lugShape = new THREE.Shape();
  lugShape.moveTo(14.2, 1.5);
  lugShape.lineTo(17.4, 1.2);
  lugShape.quadraticCurveTo(20.7, 0.55, 21.75, -0.55);
  lugShape.lineTo(21.75, -2.0);
  lugShape.quadraticCurveTo(21.1, -2.7, 19.9, -2.8);
  lugShape.lineTo(14.2, -2.8);
  lugShape.closePath();
  const lugGeo = new THREE.ExtrudeGeometry(lugShape, { depth: 2.0, bevelEnabled: true, bevelThickness: 0.42, bevelSize: 0.38, bevelSegments: 5, curveSegments: 20 });
  lugGeo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  const holeGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 20);
  holeGeo.rotateZ(Math.PI / 2);
  for (const sy of [1, -1]) {
    const g = new THREE.Group();
    for (const sx of [1, -1]) {
      const lug = new THREE.Mesh(lugGeo, mat.polished);
      lug.position.x = sx > 0 ? 10.45 : -12.45;
      g.add(lug);
      // spring-bar hole on the outer face
      const hole = new THREE.Mesh(holeGeo, mat.lugHole);
      hole.position.set(sx * 12.9, 20.55, -1.35);
      g.add(hole);
    }
    if (sy < 0) g.rotation.z = Math.PI;
    layers.case.add(g);
  }

  // Crown: knurled grip, chamfered end, tube.
  const crownGeo = new THREE.CylinderGeometry(2.1, 2.1, 2.3, 120, 1);
  {
    const p = crownGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1.6) continue;
      const a = Math.atan2(z, x);
      const ridge = 0.5 + 0.5 * Math.cos(a * 30);
      const k = (2.1 - 0.13 * (1 - Math.pow(ridge, 0.6))) / r;
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
    crownGeo.computeVertexNormals();
    crownGeo.rotateZ(-Math.PI / 2);
  }
  add('case', crownGeo, mat.polished, [CASE_R + 2.05, 0, -0.42]);
  const capGeo = lathe([[1.75, 0], [1.6, 0.18], [1.1, 0.26], [0.01, 0.28]], 64);
  capGeo.rotateY(Math.PI / 2);
  add('case', capGeo, mat.polishedHi, [CASE_R + 3.2, 0, -0.42]);
  const tubeGeo = new THREE.CylinderGeometry(1.05, 1.05, 1.4, 32);
  tubeGeo.rotateZ(Math.PI / 2);
  add('case', tubeGeo, mat.polished, [CASE_R + 0.3, 0, -0.42]);

  /* ----------------------------------------------------------------- crystal */
  const crystal = add('crystal', zCylinder(16.28, 0.62, 160), mat.glass, [0, 0, 2.55]);
  crystal.renderOrder = 10;
  const crystalEdge = add('crystal', lathe([[16.28, 2.24], [16.28, 2.86], [15.9, 2.86]], 160), mat.glassEdge);
  crystalEdge.renderOrder = 9;

  /* ----------------------------------------------------------------- dial */
  const dialPts = [];
  for (let i = 0; i <= 48; i++) dialPts.push([DIAL_R * (1 - i / 48) + 0.0001, 0]);
  const dial = add('dial', lathe(dialPts, 256), dialMat);

  const print = add('dial', new THREE.PlaneGeometry(DIAL_R * 2, DIAL_R * 2), printMat, [0, 0, 0.012]);
  print.renderOrder = 2;

  // Applied, faceted stick indices
  const bev = 0.2;
  const idxShape = new THREE.Shape();
  idxShape.moveTo(-0.5 + bev, -1.75 + bev);
  idxShape.lineTo(0.5 - bev, -1.75 + bev);
  idxShape.lineTo(0.5 - bev, 1.75 - bev);
  idxShape.lineTo(-0.5 + bev, 1.75 - bev);
  idxShape.closePath();
  const idxGeo = new THREE.ExtrudeGeometry(idxShape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.2, bevelSize: bev, bevelSegments: 1 });
  idxGeo.translate(0, 0, 0.2);
  for (let i = 0; i < 12; i++) {
    if (i === 3) continue;
    const a = (i / 12) * Math.PI * 2;
    const r = 12.2;
    for (const o of i === 0 ? [-0.75, 0.75] : [0]) {
      const m = add('dial', idxGeo, mat.polishedHi, [Math.sin(a) * r + Math.cos(a) * o, Math.cos(a) * r - Math.sin(a) * o, 0], [0, 0, -a]);
      m.userData.index = true;
    }
  }

  // Date window: wheel below, polished frame above
  add('dial', new THREE.PlaneGeometry(3.7, 2.8), dateMat, [DATE_WIN.x, DATE_WIN.y, -0.32]);
  const fo = 0.32;
  const winFrame = new THREE.Shape();
  winFrame.moveTo(-DATE_WIN.hw - fo, -DATE_WIN.hh - fo);
  winFrame.lineTo(DATE_WIN.hw + fo, -DATE_WIN.hh - fo);
  winFrame.lineTo(DATE_WIN.hw + fo, DATE_WIN.hh + fo);
  winFrame.lineTo(-DATE_WIN.hw - fo, DATE_WIN.hh + fo);
  winFrame.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-DATE_WIN.hw, -DATE_WIN.hh);
  hole.lineTo(-DATE_WIN.hw, DATE_WIN.hh);
  hole.lineTo(DATE_WIN.hw, DATE_WIN.hh);
  hole.lineTo(DATE_WIN.hw, -DATE_WIN.hh);
  hole.closePath();
  winFrame.holes.push(hole);
  const frameGeo = new THREE.ExtrudeGeometry(winFrame, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 });
  add('dial', frameGeo, mat.polishedHi, [DATE_WIN.x, DATE_WIN.y, 0.06]);

  /* ----------------------------------------------------------------- hands */
  const handExtrude = (shape, depth, bevelT, bevelS) =>
    new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevelT, bevelSize: bevelS, bevelSegments: 3, curveSegments: 12 });
  function buildHand(width, length, tail, z, layer) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(handExtrude(handShape(width, length, tail, 0.12), 0.1, 0.08, 0.12), mat.hand));
    const lume = new THREE.Mesh(new THREE.ExtrudeGeometry(handShape(width * 0.5, length - 2.6, 2.4), { depth: 0.04, bevelEnabled: false }), mat.lume);
    lume.position.z = 0.19;
    g.add(lume);
    g.position.z = z;
    layers[layer].add(g);
    return g;
  }
  const hourHand = buildHand(1.8, 9.0, -2.2, 0.66, 'hour');
  const minuteHand = buildHand(1.36, 13.6, -2.6, 1.0, 'minute');
  add('minute', zCylinder(1.15, 0.3, 48), mat.hand, [0, 0, 0.62]);
  add('minute', lathe([[1.05, 0], [1.05, 0.14], [0.85, 0.28], [0.45, 0.35], [0.01, 0.37]], 48), mat.hand, [0, 0, 1.2]);

  const secondHand = new THREE.Group();
  const sShape = new THREE.Shape();
  sShape.moveTo(-0.13, -2.6);
  sShape.lineTo(0.13, -2.6);
  sShape.lineTo(0.06, 14.4);
  sShape.lineTo(-0.06, 14.4);
  sShape.closePath();
  secondHand.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sShape, { depth: 0.1, bevelEnabled: false }), mat.hand));
  const tailShape = new THREE.Shape();
  tailShape.absarc(0, -3.7, 0.85, 0, Math.PI * 2, false);
  secondHand.add(new THREE.Mesh(handExtrude(tailShape, 0.06, 0.04, 0.04), mat.hand));
  const sCap = new THREE.Mesh(lathe([[0.62, 0], [0.62, 0.12], [0.45, 0.26], [0.01, 0.3]], 40), mat.polishedHi);
  sCap.position.z = 0.1;
  secondHand.add(sCap);
  secondHand.position.z = 1.58;
  layers.second.add(secondHand);

  /* ----------------------------------------------------------------- movement (module 2784) */
  add('movement', zCylinder(13.4, 2.2, 128), mat.plastic, [0, 0, -2.1]);
  add('movement', zCylinder(13.45, 0.3, 128), mat.plasticWhite, [0, 0, -0.95]); // date ring
  add('movement', zCylinder(11.2, 0.12, 96), mat.brushed, [0, 0, -0.75]);
  add('movement', new THREE.CylinderGeometry(1.0, 1.0, 7, 48), mat.copper, [2.5, -8.2, -1.45], [0, 0, Math.PI / 2]);
  add('movement', new THREE.CapsuleGeometry(0.7, 3.4, 8, 24), mat.polished, [8.4, 3.2, -1.2]);
  add('movement', new THREE.BoxGeometry(5.2, 3.6, 0.2), mat.pcb, [-6.6, 4.4, -0.62]);
  add('movement', new THREE.BoxGeometry(1.9, 1.9, 0.5), mat.black, [-6.8, 4.4, -0.38]);
  for (const [x, y, r] of [[0, 0, 3.4], [4.6, 3.2, 2.2], [3.6, -3.4, 1.8], [-3.2, 4.8, 2.6], [7.2, -2.2, 1.4]]) {
    add('movement', zCylinder(r, 0.16, Math.max(32, Math.round(r * 22))), mat.brass, [x, y, -0.58]);
    add('movement', zCylinder(0.3, 0.6, 16), mat.polished, [x, y, -0.48]);
  }
  for (const [x, y] of [[-9.6, -4], [9.4, 5.8], [-2, -10.4]]) {
    add('movement', zCylinder(0.75, 0.25, 24), mat.polishedHi, [x, y, -0.6]);
    add('movement', new THREE.BoxGeometry(1.2, 0.18, 0.1), mat.black, [x, y, -0.45]);
  }

  // SR626SW silver-oxide cell
  const cellTex = makeCellTex();
  const cellMat = physical({ color: 0xd2d6dc, roughness: 0.18, bumpMap: cellTex, bumpScale: 2 });
  const cell = add('battery', lathe([[0.01, -1.3], [3.3, -1.3], [3.4, -1.2], [3.4, 0.9], [3.3, 1.05], [2.9, 1.05], [2.85, 1.3], [0.01, 1.3]], 96), cellMat, [-5.4, -4.6, -1.95]);
  const cellTop = add('battery', new THREE.CircleGeometry(2.84, 64), physical({ color: 0xd9dde2, roughness: 0.2, bumpMap: cellTex, bumpScale: 3 }), [-5.4, -4.6, -0.64]);
  cellTop.rotation.z = Math.PI / 2;

  /* ----------------------------------------------------------------- caseback */
  add(
    'caseback',
    lathe([
      [0.01, -6.34], [9.5, -6.3], [13.9, -6.14], [14.05, -6.0], [15.4, -5.72],
      [16.7, -4.92], [17.26, -3.92], [17.26, -3.26],
    ]),
    mat.backBrushed
  );
  const backTex = makeBackTex();
  const backPrint = add(
    'caseback',
    new THREE.CircleGeometry(14.5, 96),
    new THREE.MeshStandardMaterial({ color: 0x3b4048, transparent: true, alphaMap: backTex, bumpMap: backTex, bumpScale: -1.2, metalness: 1, roughness: 0.45, depthWrite: false }),
    [0, 0, -6.37],
    [0, Math.PI, 0]
  );
  backPrint.castShadow = false;

  /* ----------------------------------------------------------------- bracelet */
  const pitch = 4.9;
  const rows = 15;
  const C = { y: 0, z: -27 };
  const P0 = { y: 22.7, z: -1.0 };
  const R = Math.hypot(P0.y - C.y, P0.z - C.z);
  const theta0 = Math.atan2(P0.z - C.z, P0.y - C.y);

  // narrow, domed polished centre row; wider, flatter brushed outer rows
  const centerGeo = new RoundedBoxGeometry(5.0, pitch - 0.3, 2.7, 5, 1.05);
  const outerGeo = new RoundedBoxGeometry(7.2, pitch - 0.3, 2.4, 3, 0.5);
  const OUTER_X = 6.24;
  const pinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 16);
  pinGeo.rotateZ(Math.PI / 2);
  const centerLinks = new THREE.InstancedMesh(centerGeo, mat.linkPolished, rows * 2);
  const outerLinks = new THREE.InstancedMesh(outerGeo, mat.linkBrushed, rows * 4);
  const pins = new THREE.InstancedMesh(pinGeo, mat.pin, rows * 4);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const sc = new THREE.Vector3(1, 1, 1);
  const flip = new THREE.Matrix4().makeRotationZ(Math.PI);

  // Two poses per row: lying open on the desk ("flat") and closed around a wrist ("loop").
  const flatZ = (s) => -2.35 + (TABLE_Z + 1.37 + 2.35) * smooth(clamp01(s / 15));
  const rowPose = [];
  for (let i = 0; i < rows; i++) {
    const s = pitch * (i + 0.5);
    const th = theta0 - s / R;
    const rr = R - 1.35;
    rowPose.push({
      loop: { y: C.y + Math.cos(th) * rr, z: C.z + Math.sin(th) * rr, a: th - Math.PI / 2, ny: Math.cos(th), nz: Math.sin(th) },
      flat: { y: P0.y + s, z: flatZ(s), a: Math.atan2(flatZ(s + 0.5) - flatZ(s - 0.5), 1), ny: 0, nz: 1 },
    });
  }
  let braceletT = -1;
  function layoutBracelet(t) {
    let ci = 0;
    let oi = 0;
    let pi = 0;
    for (const side of [1, -1]) {
      for (let i = 0; i < rowPose.length; i++) {
        const { loop, flat } = rowPose[i];
        // the bracelet tapers from 20 mm at the lugs to about 18 mm at the clasp
        const taper = 1 - (0.09 * i) / (rowPose.length - 1);
        const y = flat.y + (loop.y - flat.y) * t;
        const z = flat.z + (loop.z - flat.z) * t;
        const a = flat.a + (loop.a - flat.a) * t;
        const ny = flat.ny + (loop.ny - flat.ny) * t;
        const nz = flat.nz + (loop.nz - flat.nz) * t;
        e.set(a, 0, 0);
        q.setFromEuler(e);
        pos.set(0, y, z);
        sc.set(taper, 1, 1);
        m4.compose(pos, q, sc);
        if (side < 0) m4.premultiply(flip);
        centerLinks.setMatrixAt(ci++, m4);
        // outer links sit lower than the raised, polished centre link
        const sink = -0.15 + 0.1 * t;
        for (const sx of [-1, 1]) {
          const ox = sx * OUTER_X * taper;
          pos.set(ox, y + ny * sink, z + nz * sink);
          m4.compose(pos, q, sc);
          if (side < 0) m4.premultiply(flip);
          outerLinks.setMatrixAt(oi++, m4);
          pos.set(ox + sx * 3.64 * taper, y + ny * sink, z + nz * sink);
          m4.compose(pos, q, one);
          if (side < 0) m4.premultiply(flip);
          pins.setMatrixAt(pi++, m4);
        }
      }
    }
    for (const im of [centerLinks, outerLinks, pins]) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
  layoutBracelet(1);
  layers.bracelet.add(centerLinks, outerLinks, pins);

  // End links, curved to sit flush against the case
  const endShape = new THREE.Shape();
  const er = CASE_R + 0.15;
  const ex0 = 9.7;
  const ey0 = Math.sqrt(er * er - ex0 * ex0);
  endShape.moveTo(-ex0, 22.55);
  endShape.lineTo(ex0, 22.55);
  endShape.lineTo(ex0, ey0);
  endShape.absarc(0, 0, er, Math.atan2(ey0, ex0), Math.atan2(ey0, -ex0), false);
  endShape.closePath();
  const endGeo = new THREE.ExtrudeGeometry(endShape, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.35, bevelSegments: 4, curveSegments: 32 });
  endGeo.translate(0, 0, -2.85);
  for (const sy of [1, -1]) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(endGeo, mat.linkBrushed));
    if (sy < 0) g.rotation.z = Math.PI;
    layers.bracelet.add(g);
  }

  // One-touch triple-fold clasp: brushed body, polished cover
  const clasp = new THREE.Group();
  const claspBody = new THREE.Mesh(new RoundedBoxGeometry(17.8, 23, 2.5, 3, 0.9), mat.linkBrushed);
  const claspCover = new THREE.Mesh(new RoundedBoxGeometry(16.2, 21, 1.0, 3, 0.45), mat.claspPolished);
  claspCover.position.z = -1.55;
  const claspLip = new THREE.Mesh(new RoundedBoxGeometry(8, 2.2, 0.9, 2, 0.4), mat.claspPolished);
  claspLip.position.set(0, 9.6, -1.9);
  clasp.add(claspBody, claspCover, claspLip);
  const claspLoop = new THREE.Vector3(0, 0, C.z - R + 1.3);
  const claspFlat = new THREE.Vector3(0, -(P0.y + rows * pitch + 10.8), TABLE_Z + 1.25);
  clasp.position.copy(claspLoop);
  layers.bracelet.add(clasp);

  /* ----------------------------------------------------------------- shadows */
  watch.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  for (const o of [crystal, crystalEdge, print, backPrint]) {
    o.castShadow = false;
    o.receiveShadow = o === print;
  }

  /* ----------------------------------------------------------------- label anchors */
  const anchors = {
    crystal: { layer: layers.crystal, r: 16.3, z: 2.8 },
    hands: { layer: minuteHand, point: new THREE.Vector3(0, 12.2, 0.3) },
    dial: { layer: layers.dial, r: DIAL_R, z: 0 },
    date: { layer: layers.dial, point: new THREE.Vector3(DATE_WIN.x + DATE_WIN.hw + 0.3, 0, 0.2) },
    case: { layer: layers.case, r: CASE_R, z: 1.0 },
    movement: { layer: layers.movement, r: 13.4, z: -1.0 },
    battery: { layer: layers.battery, point: new THREE.Vector3(-5.4 + 3.4, -4.6, -1.9) },
    caseback: { layer: layers.caseback, r: 17.2, z: -4.5 },
  };
  const handLift = { hour: 19, minute: 25, second: 31 };

  /* ----------------------------------------------------------------- state */
  const keys = ['x', 'y', 'z', 'size', 'rx', 'ry', 'rz', 'explode', 'dim', 'bracelet', 'loop', 'shadow'];
  const target = { x: 0, y: 0, z: 0, size: 0.36, rx: 0, ry: 0, rz: 0.2, explode: 0, dim: 1, bracelet: 1, loop: 0, shadow: 1 };
  const current = { ...target };
  let activeLayer = -1;
  const layerBoost = Object.fromEntries(LAYERS.map((l) => [l.id, 0]));
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const drag = { active: false, rot: 0, vel: 0, tilt: 0, tiltVel: 0 };

  let dialFrom = { base: dialMat.color.clone(), print: printMat.color.clone() };
  let dialTo = dialFrom;
  let dialT = 1;

  let width = 1;
  let height = 1;
  let visH = 1;
  let visW = 1;
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    visW = visH * camera.aspect;
  }
  resize();

  /* ----------------------------------------------------------------- time */
  const easeOutBack = (t) => 1 + 3.2 * Math.pow(t - 1, 3) + 2.2 * Math.pow(t - 1, 2);
  function updateHands(now) {
    const d = new Date(now);
    const ms = d.getMilliseconds();
    const s = d.getSeconds();
    const m = d.getMinutes();
    const h = d.getHours() % 12;
    const tick = reduceMotion ? 1 : ms < 160 ? easeOutBack(ms / 160) : 1;
    secondHand.rotation.z = -((s - 1 + tick) / 60) * Math.PI * 2;
    minuteHand.rotation.z = -((m + s / 60) / 60) * Math.PI * 2;
    hourHand.rotation.z = -((h + m / 60 + s / 3600) / 12) * Math.PI * 2;
  }

  /* ----------------------------------------------------------------- labels */
  const tmpV = new THREE.Vector3();
  const tmpBest = new THREE.Vector3();
  function project(v) {
    tmpV.copy(v).project(camera);
    return { x: (tmpV.x * 0.5 + 0.5) * width, y: (-tmpV.y * 0.5 + 0.5) * height };
  }
  function labelPositions() {
    const out = {};
    for (const [id, a] of Object.entries(anchors)) {
      if (a.point) {
        tmpBest.copy(a.point);
        a.layer.localToWorld(tmpBest);
        out[id] = project(tmpBest);
        continue;
      }
      let best = null;
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        tmpBest.set(Math.cos(ang) * a.r, Math.sin(ang) * a.r, a.z);
        a.layer.localToWorld(tmpBest);
        const p = project(tmpBest);
        if (!best || p.x > best.x) best = p;
      }
      out[id] = best;
    }
    return out;
  }

  /* ----------------------------------------------------------------- loop */
  let last = 0;
  let elapsed = 0;
  let wasVisible = true;
  let onFrame = null;
  let shadowR = 0;

  function frame(now) {
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 20);
    last = now;
    elapsed += dt;
    const k = reduceMotion ? 30 : 4.2;
    for (const name of keys) current[name] = damp(current[name], target[name], k, dt);
    pointer.sx = damp(pointer.sx, pointer.x, 3, dt);
    pointer.sy = damp(pointer.sy, pointer.y, 3, dt);
    if (!drag.active) {
      drag.vel += (-14 * drag.rot - 4.2 * drag.vel) * dt;
      drag.rot += drag.vel * dt;
      drag.tiltVel += (-14 * drag.tilt - 4.2 * drag.tiltVel) * dt;
      drag.tilt += drag.tiltVel * dt;
    }

    const base = Math.min(visH, visW * 1.1);
    const scale = (current.size * base) / (CASE_R * 2);
    // resting on the desk = no floating or pointer sway
    const air = 1 - clamp01(current.shadow);
    const float = reduceMotion ? 0 : Math.sin(elapsed * 0.9) * 0.012 * air;
    root.position.set((current.x * visW) / 2, (current.y + float) * (visH / 2), current.z);
    root.scale.setScalar(scale);
    root.rotation.set(
      current.rx + pointer.sy * 0.14 * air,
      current.ry + pointer.sx * 0.22 * air,
      current.rz + (reduceMotion ? 0 : Math.sin(elapsed * 0.6) * 0.03 * air)
    );
    spin.rotation.set(drag.tilt, drag.rot, 0);

    // bracelet: open on the desk -> closed loop
    const loopT = smooth(clamp01(current.loop));
    if (Math.abs(loopT - braceletT) > 1e-4) {
      braceletT = loopT;
      layoutBracelet(loopT);
      clasp.position.lerpVectors(claspFlat, claspLoop, loopT);
    }

    // exploded view
    const ex = smooth(clamp01(current.explode));
    for (let i = 0; i < LAYERS.length; i++) {
      const l = LAYERS[i];
      layerBoost[l.id] = damp(layerBoost[l.id], i === activeLayer && current.explode > 0.5 ? 1 : 0, 6, dt);
    }
    layers.crystal.position.z = ex * (LAYERS[0].lift + layerBoost.crystal * 3);
    const hb = layerBoost.hands * 3;
    layers.hour.position.z = ex * (handLift.hour + hb);
    layers.minute.position.z = ex * (handLift.minute + hb);
    layers.second.position.z = ex * (handLift.second + hb);
    layers.dial.position.z = ex * (12 + (layerBoost.dial + layerBoost.date) * 3);
    layers.case.position.z = ex * layerBoost.case * 3;
    layers.movement.position.z = ex * (-12 + layerBoost.movement * 3);
    layers.battery.position.z = ex * (-21 + layerBoost.battery * 3);
    layers.caseback.position.z = ex * (-31 + layerBoost.caseback * 3);

    // bracelet fades away as the head comes apart
    const bAlpha = clamp01(current.bracelet) * (1 - Math.min(1, ex * 2.5));
    layers.bracelet.visible = bAlpha > 0.01;
    for (const m of braceletMats) {
      const transparent = bAlpha < 0.999;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = bAlpha;
    }

    // dial colour transition
    if (dialT < 1) {
      dialT = Math.min(1, dialT + dt / 0.7);
      const t = smooth(dialT);
      dialMat.color.copy(dialFrom.base).lerp(dialTo.base, t);
      printMat.color.copy(dialFrom.print).lerp(dialTo.print, t);
    }

    renderer.toneMappingExposure = 1.0 * (0.1 + 0.9 * clamp01(current.dim));
    updateHands(Date.now());

    // Shadow camera hugs the watch for crisp self-shadows (hands, indices, links).
    const sh = clamp01(current.shadow);
    const deskZ = TABLE_Z * scale - 0.05;
    const reach = scale * (40 + (1 - loopT) * 75 + ex * 30) + 6;
    if (Math.abs(reach - shadowR) / reach > 0.03) {
      shadowR = reach;
      const sc = key.shadow.camera;
      sc.left = -reach;
      sc.right = reach;
      sc.top = reach;
      sc.bottom = -reach;
      sc.updateProjectionMatrix();
      key.shadow.normalBias = ((2 * reach) / mapSize) * 1.2;
    }
    key.target.position.set(root.position.x, root.position.y, root.position.z + deskZ * (1 - air));
    key.position.copy(sunDir).multiplyScalar(300).add(key.target.position);

    // desk shadow (only while the watch is near the desk)
    ground.position.set(root.position.x, root.position.y, deskZ);
    ground.visible = sh > 0.01;
    shadowMat.opacity = 0.8 * sh;
    const lift = Math.max(0, current.z) / 40;
    contact.visible = ground.visible;
    contact.position.set(root.position.x + lift * 6, root.position.y - lift * 6, deskZ + 0.02);
    contact.scale.set(scale * 74 * (1 + lift), scale * 150 * (1 + lift), 1);
    contact.rotation.z = current.rz;
    contactMat.opacity = (sh * 0.85) / (1 + lift * 2);

    // skip drawing while the watch is parked off-screen
    const reachV = scale * 40;
    const visible = Math.abs(root.position.y) - reachV < visH / 2 && Math.abs(root.position.x) - reachV < visW / 2;
    renderer.shadowMap.autoUpdate = visible;
    if (visible || wasVisible) renderer.render(scene, camera);
    wasVisible = visible;

    if (onFrame) onFrame({ explode: current.explode, labels: current.explode > 0.02 ? labelPositions() : null });
    requestAnimationFrame(frame);
  }

  return {
    start(cb) {
      onFrame = cb;
      last = performance.now();
      renderer.compile(scene, camera);
      requestAnimationFrame(frame);
    },
    resize,
    setTarget(next) {
      for (const k of keys) if (next[k] !== undefined) target[k] = next[k];
    },
    // Snap the rendered state, e.g. to start an intro move from off-stage.
    jump(state) {
      for (const k of keys) if (state[k] !== undefined) current[k] = state[k];
    },
    setActiveLayer(i) {
      activeLayer = i;
    },
    setPointer(x, y) {
      pointer.x = x;
      pointer.y = y;
    },
    dragStart() {
      drag.active = true;
    },
    dragMove(dx, dy) {
      drag.rot += dx * 0.012;
      drag.tilt = Math.max(-0.8, Math.min(0.8, drag.tilt + dy * 0.006));
      drag.vel = dx * 0.6;
      drag.tiltVel = dy * 0.3;
    },
    dragEnd() {
      drag.active = false;
    },
    setDial(name) {
      const d = DIALS[name];
      if (!d) return;
      dialFrom = { base: dialMat.color.clone(), print: printMat.color.clone() };
      dialTo = { base: new THREE.Color(d.base), print: new THREE.Color(d.print) };
      dialT = reduceMotion ? 0.999 : 0;
    },
    // Redraw text-bearing textures once web fonts have loaded.
    refreshPrint() {
      const old = [printMat.map, dateMat.map];
      printMat.map = makePrintTex();
      dateMat.map = makeDateTex(new Date().getDate());
      printMat.needsUpdate = true;
      dateMat.needsUpdate = true;
      old.forEach((t) => t?.dispose());
    },
  };
}
