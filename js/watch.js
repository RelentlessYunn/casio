// Procedural, real-time 3D model of the MTP-1302.
// Units are millimetres. The watch face points down +Z towards the camera.

import * as THREE from '../vendor/three.min.js';

const { RoomEnvironment, RoundedBoxGeometry } = THREE;

export const DIALS = {
  black: { base: '#0b0c0f', sheen: '#7d8592', print: '#e8eaee', accent: '#c9ced6' },
  blue: { base: '#0c2366', sheen: '#5d8cff', print: '#eef2fb', accent: '#7aa2ff' },
  green: { base: '#0b3527', sheen: '#46c491', print: '#eef6f1', accent: '#5fd3a4' },
  white: { base: '#c9ccce', sheen: '#ffffff', print: '#1b1e22', accent: '#e9e6dc' },
};

// Exploded-view layers, top to bottom. `lift` is the local-Z offset when fully exploded.
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

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (t) => t * t * (3 - 2 * t);

function lathe(points, segments = 160) {
  const g = new THREE.LatheGeometry(points.map(([r, z]) => new THREE.Vector2(r, z)), segments);
  g.rotateX(Math.PI / 2);
  return g;
}

function zCylinder(r, h, segs = 64, rTop = r) {
  const g = new THREE.CylinderGeometry(rTop, r, h, segs);
  g.rotateX(Math.PI / 2);
  return g;
}

function handShape(width, length, tail) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, tail);
  s.lineTo(width / 2, tail);
  s.lineTo(width * 0.4, length - width * 1.4);
  s.lineTo(0, length);
  s.lineTo(-width * 0.4, length - width * 1.4);
  s.closePath();
  return s;
}

function makePrintTexture(color) {
  const size = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const k = size / 2 / DIAL_R; // px per mm
  ctx.translate(size / 2, size / 2);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  // Minute track
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const five = i % 5 === 0;
    const r1 = 14.55 * k;
    const r2 = (five ? 15.15 : 15.0) * k;
    ctx.save();
    ctx.rotate(a);
    ctx.lineWidth = (five ? 0.16 : 0.1) * k;
    ctx.globalAlpha = five ? 0.9 : 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -r1);
    ctx.lineTo(0, -r2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 0.06 * k;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(0, 0, 14.5 * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const family = '"Inter Tight", "Helvetica Neue", Arial, sans-serif';
  ctx.font = `600 ${1.55 * k}px ${family}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${0.12 * k}px`;
  ctx.fillText('MTP-1302', 0, -7.3 * k);
  ctx.font = `500 ${0.62 * k}px ${family}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${0.14 * k}px`;
  ctx.globalAlpha = 0.85;
  ctx.fillText('MULTI-TICK PREDICTION', 0, -5.45 * k);
  ctx.fillText('WATER RESIST', 0, 7.6 * k);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeDateTexture(day) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f3ef';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#111215';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 120px "Inter Tight", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(String(day), 128, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const dialVertex = /* glsl */ `
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Radially brushed ("sunburst") dial. Each groove runs radially, so a highlight
// appears wherever the half-vector is perpendicular to the groove direction.
const dialFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSheen;
  uniform vec3 uCam;
  uniform vec3 uKey;
  uniform vec3 uFill;
  uniform vec4 uWin;
  uniform float uRadius;
  varying vec3 vLocal;

  float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

  float groove(vec3 L, vec3 V, vec2 t, float sigma) {
    vec3 H = normalize(L + V);
    float d = dot(H.xy, t);
    float hz = max(H.z, 0.04);
    return exp(-(d * d) / (sigma * sigma * hz * hz)) * clamp(L.z * 1.5, 0.0, 1.0);
  }

  void main() {
    vec2 p = vLocal.xy;
    if (abs(p.x - uWin.x) < uWin.z && abs(p.y - uWin.y) < uWin.w) discard;
    float r = length(p) / uRadius;
    float a = atan(p.y, p.x);
    vec2 t = vec2(cos(a), sin(a));
    vec3 V = normalize(uCam - vLocal);

    float id = floor((a + 3.14159265) * 520.0);
    float g = hash(id);
    float sigma = 0.17 + 0.06 * g;
    float s = groove(normalize(uKey), V, t, sigma) + 0.55 * groove(normalize(uFill), V, t, sigma * 1.3);
    float grain = mix(0.82, 1.1, g) * mix(0.95, 1.03, hash(id * 3.1 + floor(r * 40.0)));

    vec3 col = uColor * (0.75 + 0.25 * V.z);
    col += uSheen * s * grain * 0.85;
    col += uSheen * 0.05 * grain;
    col *= mix(1.0, 0.55, smoothstep(0.9, 1.0, r));
    col *= mix(0.85, 1.0, smoothstep(0.0, 0.08, r));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createWatch(canvas, opts = {}) {
  const reduceMotion = !!opts.reduceMotion;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 10, 2000);
  camera.position.set(0, 0, 220);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.035).texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.62;

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-80, 110, 140);
  const rim = new THREE.DirectionalLight(0xbcd0ff, 1.6);
  rim.position.set(140, -60, -40);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(120, 40, 120);
  scene.add(key, rim, fill);

  // ------------------------------------------------------------------ materials
  const mat = {
    polished: new THREE.MeshStandardMaterial({ color: 0xd2d5da, metalness: 1, roughness: 0.12, side: THREE.DoubleSide }),
    brushed: new THREE.MeshStandardMaterial({ color: 0xb9bdc4, metalness: 1, roughness: 0.36, side: THREE.DoubleSide }),
    hand: new THREE.MeshStandardMaterial({ color: 0xeef0f3, metalness: 1, roughness: 0.12 }),
    lume: new THREE.MeshStandardMaterial({ color: 0xeef3e6, emissive: 0x9fe6b6, emissiveIntensity: 0.12, roughness: 0.55, metalness: 0 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x17181b, metalness: 0.1, roughness: 0.55 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xc27a45, metalness: 1, roughness: 0.28 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 1, roughness: 0.25 }),
    cell: new THREE.MeshStandardMaterial({ color: 0xcfd3da, metalness: 1, roughness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x000000,
      metalness: 0,
      roughness: 0.03,
      envMapIntensity: 3.2,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    print: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
    date: new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 }),
  };
  const braceletMats = [];

  const dialUniforms = {
    uColor: { value: new THREE.Color(DIALS.blue.base) },
    uSheen: { value: new THREE.Color(DIALS.blue.sheen) },
    uCam: { value: new THREE.Vector3(0, 0, 200) },
    uKey: { value: new THREE.Vector3() },
    uFill: { value: new THREE.Vector3() },
    uWin: { value: new THREE.Vector4(DATE_WIN.x, DATE_WIN.y, DATE_WIN.hw, DATE_WIN.hh) },
    uRadius: { value: DIAL_R },
  };
  const dialMat = new THREE.ShaderMaterial({
    uniforms: dialUniforms,
    vertexShader: dialVertex,
    fragmentShader: dialFragment,
  });

  // ------------------------------------------------------------------ hierarchy
  const root = new THREE.Group(); // positioned by scroll state
  const spin = new THREE.Group(); // user drag inertia
  const watch = new THREE.Group();
  root.add(spin);
  spin.add(watch);
  scene.add(root);

  const layers = {};
  for (const id of ['crystal', 'second', 'minute', 'hour', 'dial', 'case', 'movement', 'battery', 'caseback', 'bracelet']) {
    layers[id] = new THREE.Group();
    watch.add(layers[id]);
  }

  // ------------------------------------------------------------------ case
  const caseProfile = [
    [15.4, -3.2], [17.3, -3.2], [18.5, -3.0], [19.05, -2.45], [CASE_R, -1.6],
    [CASE_R, 1.15], [19.12, 1.85], [18.75, 2.45], [18.15, 2.92], [17.4, 3.1],
    [16.85, 3.08], [16.5, 2.96], [16.32, 2.72], [16.32, 2.12], [15.75, 2.02],
    [15.75, 0.25], [15.4, 0.02], [15.4, -3.2],
  ];
  layers.case.add(new THREE.Mesh(lathe(caseProfile), mat.polished));

  // Lugs: side profile extruded across X, then mirrored to all four corners.
  const lugShape = new THREE.Shape();
  lugShape.moveTo(14.5, 1.7);
  lugShape.lineTo(17.6, 1.35);
  lugShape.quadraticCurveTo(21.0, 0.6, 22.1, -0.5);
  lugShape.lineTo(22.1, -2.1);
  lugShape.quadraticCurveTo(21.4, -2.9, 20.2, -3.0);
  lugShape.lineTo(14.5, -3.0);
  lugShape.closePath();
  const lugGeo = new THREE.ExtrudeGeometry(lugShape, {
    depth: 2.6,
    bevelEnabled: true,
    bevelThickness: 0.35,
    bevelSize: 0.3,
    bevelSegments: 4,
    curveSegments: 16,
  });
  // (shapeX, shapeY, extrudeZ) -> (x = extrudeZ, y = shapeX, z = shapeY)
  lugGeo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  for (const sy of [1, -1]) {
    for (const sx of [1, -1]) {
      const lug = new THREE.Mesh(lugGeo, mat.polished);
      // place inner face at |x| = 10.1
      lug.position.x = sx > 0 ? 10.1 : -12.7;
      const g = new THREE.Group();
      g.add(lug);
      if (sy < 0) g.rotation.z = Math.PI;
      layers.case.add(g);
    }
  }

  // Crown with knurled (faceted) grip
  const crownGeo = new THREE.CylinderGeometry(2.05, 2.05, 2.5, 28, 1);
  crownGeo.rotateZ(Math.PI / 2);
  const crownMat = mat.polished.clone();
  crownMat.flatShading = true;
  const crown = new THREE.Mesh(crownGeo, crownMat);
  crown.position.set(CASE_R + 1.7, 0, -0.35);
  const stemGeo = new THREE.CylinderGeometry(1.05, 1.05, 1.4, 24);
  stemGeo.rotateZ(Math.PI / 2);
  const stem = new THREE.Mesh(stemGeo, mat.polished);
  stem.position.set(CASE_R + 0.2, 0, -0.35);
  layers.case.add(crown, stem);

  // ------------------------------------------------------------------ crystal
  const crystal = new THREE.Mesh(zCylinder(16.3, 0.6, 128), mat.glass);
  crystal.position.z = 2.55;
  crystal.renderOrder = 10;
  layers.crystal.add(crystal);

  // ------------------------------------------------------------------ dial
  const dial = new THREE.Mesh(new THREE.CircleGeometry(DIAL_R, 160), dialMat);
  layers.dial.add(dial);

  mat.print.map = makePrintTexture('#ffffff');
  mat.print.color.set(DIALS.blue.print);
  const print = new THREE.Mesh(new THREE.PlaneGeometry(DIAL_R * 2, DIAL_R * 2), mat.print);
  print.position.z = 0.02;
  print.renderOrder = 2;
  layers.dial.add(print);

  // Applied stick indices (3 o'clock is the date window)
  const idxGeo = new RoundedBoxGeometry(0.95, 3.5, 0.5, 2, 0.16);
  for (let i = 0; i < 12; i++) {
    if (i === 3) continue;
    const a = (i / 12) * Math.PI * 2;
    const r = 12.15;
    const offs = i === 0 ? [-0.72, 0.72] : [0];
    for (const o of offs) {
      const m = new THREE.Mesh(idxGeo, mat.polished);
      m.position.set(Math.sin(a) * r + Math.cos(a) * o, Math.cos(a) * r - Math.sin(a) * o, 0.25);
      m.rotation.z = -a;
      layers.dial.add(m);
    }
  }

  // Date window: wheel below the dial, framed opening
  mat.date.map = makeDateTexture(new Date().getDate());
  const dateWheel = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.7), mat.date);
  dateWheel.position.set(DATE_WIN.x, DATE_WIN.y, -0.3);
  layers.dial.add(dateWheel);
  const frameT = 0.3;
  const fw = DATE_WIN.hw * 2 + frameT * 2;
  const fh = DATE_WIN.hh * 2 + frameT * 2;
  const frameParts = [
    [fw, frameT, 0, DATE_WIN.hh + frameT / 2],
    [fw, frameT, 0, -DATE_WIN.hh - frameT / 2],
    [frameT, fh, DATE_WIN.hw + frameT / 2, 0],
    [frameT, fh, -DATE_WIN.hw - frameT / 2, 0],
  ];
  for (const [w, h, x, y] of frameParts) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.35), mat.polished);
    b.position.set(DATE_WIN.x + x, DATE_WIN.y + y, 0.12);
    layers.dial.add(b);
  }

  // ------------------------------------------------------------------ hands
  const extrude = { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 };
  function buildHand(width, length, tail, z, layer) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(handShape(width, length, tail), extrude), mat.hand);
    g.add(body);
    const lume = new THREE.Mesh(
      new THREE.ExtrudeGeometry(handShape(width * 0.46, length - 2.4, 2.2), { depth: 0.05, bevelEnabled: false }),
      mat.lume
    );
    lume.position.z = 0.27;
    g.add(lume);
    g.position.z = z;
    layer.add(g);
    return g;
  }
  const hourHand = buildHand(1.75, 8.9, -2.2, 0.62, layers.hour);
  const minuteHand = buildHand(1.35, 13.4, -2.6, 0.98, layers.minute);
  const hub = new THREE.Mesh(zCylinder(1.05, 0.5, 40), mat.hand);
  hub.position.z = 1.15;
  layers.minute.add(hub);

  const secondHand = new THREE.Group();
  const sShape = new THREE.Shape();
  sShape.moveTo(-0.11, -2.4);
  sShape.lineTo(0.11, -2.4);
  sShape.lineTo(0.07, 14.3);
  sShape.lineTo(-0.07, 14.3);
  sShape.closePath();
  secondHand.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sShape, { depth: 0.12, bevelEnabled: false }), mat.hand));
  const tailShape = new THREE.Shape();
  tailShape.absarc(0, -3.6, 0.85, 0, Math.PI * 2, false);
  const tailMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(tailShape, { depth: 0.12, bevelEnabled: false }), mat.hand);
  secondHand.add(tailMesh);
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.6, 0.12), mat.hand);
  tailBar.position.set(0, -3.0, 0.06);
  secondHand.add(tailBar);
  const sCap = new THREE.Mesh(zCylinder(0.62, 0.42, 32), mat.hand);
  sCap.position.z = 0.2;
  secondHand.add(sCap);
  secondHand.position.z = 1.42;
  layers.second.add(secondHand);

  // ------------------------------------------------------------------ movement (module 2784-ish)
  // Everything here sits below the date wheel (z = -0.3) so nothing pokes through the dial.
  const moduleBase = new THREE.Mesh(zCylinder(13.4, 2.2, 96), mat.plastic);
  moduleBase.position.z = -2.1;
  layers.movement.add(moduleBase);
  const plate = new THREE.Mesh(zCylinder(11.2, 0.12, 80), mat.brushed);
  plate.position.z = -0.95;
  layers.movement.add(plate);
  const coil = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 7, 32), mat.copper);
  coil.rotation.z = Math.PI / 2;
  coil.position.set(2.5, -8.2, -1.5);
  layers.movement.add(coil);
  const xtal = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 3.4, 8, 24), mat.polished);
  xtal.position.set(8.4, 3.2, -1.2);
  layers.movement.add(xtal);
  const gears = [
    [0, 0, 3.4], [4.6, 3.2, 2.2], [3.6, -3.4, 1.8], [-3.2, 4.8, 2.6], [7.2, -2.2, 1.4],
  ];
  for (const [x, y, r] of gears) {
    const gear = new THREE.Mesh(zCylinder(r, 0.18, Math.max(24, Math.round(r * 18))), mat.brass);
    gear.position.set(x, y, -0.8);
    layers.movement.add(gear);
    const pin = new THREE.Mesh(zCylinder(0.32, 0.5, 16), mat.polished);
    pin.position.set(x, y, -0.7);
    layers.movement.add(pin);
  }
  const ic = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 0.5), mat.plastic);
  ic.position.set(-6.8, 4.2, -0.85);
  layers.movement.add(ic);

  const cell = new THREE.Group();
  const cellBody = new THREE.Mesh(zCylinder(3.4, 2.1, 64), mat.cell);
  const cellTop = new THREE.Mesh(zCylinder(2.9, 0.5, 64), mat.cell);
  cellTop.position.z = 1.2;
  cell.add(cellBody, cellTop);
  cell.position.set(-5.4, -4.6, -1.9);
  layers.battery.add(cell);

  // ------------------------------------------------------------------ caseback
  const backProfile = [
    [17.25, -3.2], [17.25, -3.9], [16.7, -4.9], [15.4, -5.7], [14.1, -5.98],
    [14.0, -6.12], [9.5, -6.28], [0.01, -6.32],
  ];
  layers.caseback.add(new THREE.Mesh(lathe(backProfile), mat.brushed));

  // ------------------------------------------------------------------ bracelet
  // Rows of three links wrapped around an imaginary wrist behind the head.
  const pitch = 4.9;
  const rows = 15;
  const C = { y: 0, z: -27 };
  const P0 = { y: 22.7, z: -1.0 };
  const R = Math.hypot(P0.y - C.y, P0.z - C.z);
  const theta0 = Math.atan2(P0.z - C.z, P0.y - C.y);

  const braceletPolished = mat.polished.clone();
  const braceletBrushed = mat.brushed.clone();
  braceletMats.push(braceletPolished, braceletBrushed);
  const centerGeo = new RoundedBoxGeometry(7.2, pitch - 0.35, 2.8, 3, 0.75);
  const outerGeo = new RoundedBoxGeometry(5.8, pitch - 0.35, 2.5, 3, 0.9);
  const centerLinks = new THREE.InstancedMesh(centerGeo, braceletPolished, rows * 2);
  const outerLinks = new THREE.InstancedMesh(outerGeo, braceletBrushed, rows * 4);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const flip = new THREE.Matrix4().makeRotationZ(Math.PI);
  let ci = 0;
  let oi = 0;
  for (const side of [1, -1]) {
    for (let i = 0; i < rows; i++) {
      const s = pitch * (i + 0.5);
      const th = theta0 - s / R;
      const rr = R - 1.45;
      e.set(th - Math.PI / 2, 0, 0);
      q.setFromEuler(e);
      pos.set(0, C.y + Math.cos(th) * rr, C.z + Math.sin(th) * rr);
      m4.compose(pos, q, one);
      if (side < 0) m4.premultiply(flip);
      centerLinks.setMatrixAt(ci++, m4);
      for (const ox of [-6.75, 6.75]) {
        pos.set(ox, C.y + Math.cos(th) * (rr + 0.15), C.z + Math.sin(th) * (rr + 0.15));
        m4.compose(pos, q, one);
        if (side < 0) m4.premultiply(flip);
        outerLinks.setMatrixAt(oi++, m4);
      }
    }
  }
  layers.bracelet.add(centerLinks, outerLinks);

  // End links filling the lug gap, plus the fold-over clasp at the bottom of the loop
  const endGeo = new RoundedBoxGeometry(19.8, 4.2, 2.9, 2, 0.7);
  for (const sy of [1, -1]) {
    const end = new THREE.Mesh(endGeo, braceletBrushed);
    end.position.set(0, sy * 20.6, -1.55);
    end.rotation.x = sy * -0.18;
    layers.bracelet.add(end);
  }
  const clasp = new THREE.Mesh(new RoundedBoxGeometry(19.4, 22, 3.4, 3, 1.2), braceletBrushed);
  clasp.position.set(0, 0, C.z - R + 1.2);
  layers.bracelet.add(clasp);

  // ------------------------------------------------------------------ label anchors
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

  // ------------------------------------------------------------------ state
  const keys = ['x', 'y', 'size', 'rx', 'ry', 'rz', 'explode', 'dim', 'bracelet'];
  const target = { x: 0.4, y: 0, size: 0.44, rx: 0.3, ry: -0.4, rz: 0.1, explode: 0, dim: 1, bracelet: 1 };
  const current = { ...target, y: -1.6, rx: 1.2, rz: -0.6 };
  let activeLayer = -1;
  const layerBoost = Object.fromEntries(LAYERS.map((l) => [l.id, 0]));

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const drag = { active: false, rot: 0, vel: 0, tilt: 0, tiltVel: 0 };

  let dialFrom = { base: new THREE.Color(DIALS.blue.base), sheen: new THREE.Color(DIALS.blue.sheen), print: new THREE.Color(DIALS.blue.print) };
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

  // ------------------------------------------------------------------ time
  function easeOutBack(t) {
    const c1 = 2.2;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function updateHands(now) {
    const d = new Date(now);
    const ms = d.getMilliseconds();
    const s = d.getSeconds();
    const m = d.getMinutes();
    const h = d.getHours() % 12;
    const tick = reduceMotion ? 1 : ms < 160 ? easeOutBack(ms / 160) : 1;
    const sec = s - 1 + tick;
    secondHand.rotation.z = -(sec / 60) * Math.PI * 2;
    minuteHand.rotation.z = -((m + s / 60) / 60) * Math.PI * 2;
    hourHand.rotation.z = -((h + m / 60 + s / 3600) / 12) * Math.PI * 2;
  }

  // ------------------------------------------------------------------ labels
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

  // ------------------------------------------------------------------ loop
  let last = 0;
  let elapsed = 0;
  let wasVisible = true;
  let onFrame = null;
  const tmpCam = new THREE.Vector3();
  const tmpL = new THREE.Vector3();
  const tmpM3 = new THREE.Matrix3();

  function frame(now) {
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 20);
    last = now;
    elapsed += dt;
    const k = reduceMotion ? 30 : 4.2;

    for (const name of keys) current[name] = damp(current[name], target[name], k, dt);

    pointer.sx = damp(pointer.sx, pointer.x, 3, dt);
    pointer.sy = damp(pointer.sy, pointer.y, 3, dt);

    // spring the user's drag back to rest, with a little weight
    if (!drag.active) {
      const stiff = 14;
      const fric = 4.2;
      drag.vel += (-stiff * drag.rot - fric * drag.vel) * dt;
      drag.rot += drag.vel * dt;
      drag.tiltVel += (-stiff * drag.tilt - fric * drag.tiltVel) * dt;
      drag.tilt += drag.tiltVel * dt;
    }

    const base = Math.min(visH, visW * 1.1);
    const scale = (current.size * base) / (CASE_R * 2);
    const float = reduceMotion ? 0 : Math.sin(elapsed * 0.9) * 0.012;
    root.position.set((current.x * visW) / 2, (current.y + float) * (visH / 2), 0);
    root.scale.setScalar(scale);
    root.rotation.set(
      current.rx + pointer.sy * 0.14,
      current.ry + pointer.sx * 0.22,
      current.rz + (reduceMotion ? 0 : Math.sin(elapsed * 0.6) * 0.03)
    );
    spin.rotation.set(drag.tilt, drag.rot, 0);

    // exploded view
    const ex = smooth(Math.min(Math.max(current.explode, 0), 1));
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
    const bAlpha = Math.max(0, Math.min(1, current.bracelet)) * (1 - Math.min(1, ex * 2.5));
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
      dialUniforms.uColor.value.copy(dialFrom.base).lerp(dialTo.base, t);
      dialUniforms.uSheen.value.copy(dialFrom.sheen).lerp(dialTo.sheen, t);
      mat.print.color.copy(dialFrom.print).lerp(dialTo.print, t);
    }

    renderer.toneMappingExposure = 1.05 * (0.1 + 0.9 * Math.max(0, Math.min(1, current.dim)));

    updateHands(Date.now());

    // sunburst lighting in dial-local space
    root.updateMatrixWorld(true);
    tmpCam.copy(camera.position);
    dial.worldToLocal(tmpCam);
    dialUniforms.uCam.value.copy(tmpCam);
    const inv = tmpM3.setFromMatrix4(dial.matrixWorld).invert();
    tmpL.copy(key.position).normalize().applyMatrix3(inv).normalize();
    dialUniforms.uKey.value.copy(tmpL);
    tmpL.copy(fill.position).normalize().applyMatrix3(inv).normalize();
    dialUniforms.uFill.value.copy(tmpL);

    // skip drawing while the watch is parked off-screen
    const halfH = visH / 2;
    const reach = scale * 40;
    const visible = Math.abs(root.position.y) - reach < halfH && Math.abs(root.position.x) - reach < visW / 2;
    if (visible || wasVisible) renderer.render(scene, camera);
    wasVisible = visible;

    if (onFrame) onFrame({ explode: current.explode, labels: current.explode > 0.02 ? labelPositions() : null });
    requestAnimationFrame(frame);
  }

  return {
    start(cb) {
      onFrame = cb;
      last = performance.now();
      // compile shaders before the first visible frame
      renderer.compile(scene, camera);
      requestAnimationFrame(frame);
    },
    resize,
    setTarget(next) {
      for (const k of keys) if (next[k] !== undefined) target[k] = next[k];
    },
    // Snap the current (rendered) state, e.g. to start an intro move from off-stage.
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
      dialFrom = {
        base: dialUniforms.uColor.value.clone(),
        sheen: dialUniforms.uSheen.value.clone(),
        print: mat.print.color.clone(),
      };
      dialTo = { base: new THREE.Color(d.base), sheen: new THREE.Color(d.sheen), print: new THREE.Color(d.print) };
      dialT = reduceMotion ? 0.999 : 0;
    },
    refreshPrint() {
      const old = mat.print.map;
      mat.print.map = makePrintTexture('#ffffff');
      mat.date.map = makeDateTexture(new Date().getDate());
      mat.print.needsUpdate = true;
      mat.date.needsUpdate = true;
      old?.dispose();
    },
  };
}
