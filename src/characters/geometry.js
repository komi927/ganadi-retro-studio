import { THREE } from '../three.js';
import { S, clamp } from '../math.js';
import { ensureFlatNormalAttribute } from '../graphics/materials.js';
import {
  HEAD_LOCAL_CY, HEAD_CENTER_Y, HEAD_RX, HEAD_RY, HEAD_RZ, HEAD_P, FACE_WIDTH, FACE_BOTTOM, FACE_TOP,
} from './design.js';

// 8-sided chamfered squircle ring (puts a crisp FLAT face directly in front for Ganadi's face!)
export const OCT_SQUIRCLE = [
  [-0.56, -0.96], // 0: back-left
  [-0.98, -0.52], // 1: left-back
  [-0.98,  0.52], // 2: left-front
  [-0.60,  0.97], // 3: front-left
  [ 0.60,  0.97], // 4: front-right
  [ 0.98,  0.52], // 5: right-front
  [ 0.98, -0.52], // 6: right-back
  [ 0.56, -0.96], // 7: back-right
];

// 6-sided chunky rounded hexagon ring (ideal for low-poly floppy ears, arms, legs, tail!)
export const HEX_RING = [
  [-0.50, -0.88],
  [-1.00,  0.00],
  [-0.50,  0.88],
  [ 0.50,  0.88],
  [ 1.00,  0.00],
  [ 0.50, -0.88],
];

// 頬の横は立て、額とあごで丸く絞る。
export const HEAD_PROFILE = [
  [-.55, -.90], [-.81, -.75], [-.96, -.42], [-1, .07],
  [-.94, .52], [-.72, .81], [-.39, .97],
  [.39, .97], [.72, .81], [.94, .52], [1, .07],
  [.96, -.42], [.81, -.75], [.55, -.90],
];
export const HEAD_RINGS = [
  { y: -13.4, sx: .50, sz: .49, zOff: -.20 },
  { y: -12.4, sx: .76, sz: .72, zOff: -.10 },
  { y: -10.5, sx: .92, sz: .87, zOff: .10 },
  { y:  -7.1, sx: .96, sz: .98, zOff: .16 },
  { y:  -1.7, sx: .99, sz: 1.02 },
  { y:   4.2, sx: .98, sz: 1.00, zOff: -.08 },
  { y:   8.4, sx: .88, sz: .89, zOff: -.14 },
  { y:  11.8, sx: .66, sz: .67, zOff: -.28 },
  { y:  13.4, sx: .30, sz: .35, zOff: -.38 },
];
export const ROUND_RING = Array.from({ length: 8 }, (_, i) => {
  const angle = -i * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)];
});

/**
 * Builds a hand-crafted DS / Blockbench style low-poly faceted BufferGeometry
 * from an arbitrary closed cross-section ring (e.g., OCT_SQUIRCLE or HEX_RING)
 * and explicit vertical profile rings, with clean flat caps and welded smooth+flat normals.
 */
export function createLowPolyLathe(ringSpecs, profileXY, rx, rz, flat = true) {
  const sides = profileXY.length;
  const numRings = ringSpecs.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  // Ring vertices (cols = sides + 1 for clean seam)
  const cols = sides + 1;
  for (let r = 0; r < numRings; r++) {
    const rs = ringSpecs[r];
    const vFrac = r / Math.max(1, numRings - 1);
    const zOff = rs.zOff || 0;
    const xOff = rs.xOff || 0;
    for (let i = 0; i <= sides; i++) {
      const pt = profileXY[i % sides];
      const px = (pt[0] * rx * rs.sx + xOff) * S;
      const py = rs.y * S;
      const pz = (pt[1] * rz * rs.sz + zOff) * S;
      positions.push(px, py, pz);
      uvs.push(i / sides, vFrac);
    }
  }

  // Side band quads
  for (let r = 0; r < numRings - 1; r++) {
    for (let i = 0; i < sides; i++) {
      const a = r * cols + i;
      const b = r * cols + (i + 1);
      const c = (r + 1) * cols + (i + 1);
      const d = (r + 1) * cols + i;
      indices.push(a, b, c, a, c, d);
    }
  }

  // Bottom cap fan (outward normal = -Y)
  const botSpec = ringSpecs[0];
  const botCenterIdx = positions.length / 3;
  positions.push((botSpec.xOff || 0) * S, botSpec.y * S, (botSpec.zOff || 0) * S);
  uvs.push(0.5, 0.0);
  for (let i = 0; i < sides; i++) {
    const v0 = i;
    const v1 = (i + 1) % sides;
    indices.push(botCenterIdx, v1, v0);
  }

  // Top cap fan (outward normal = +Y)
  const topSpec = ringSpecs[numRings - 1];
  const topCenterIdx = positions.length / 3;
  positions.push((topSpec.xOff || 0) * S, topSpec.y * S, (topSpec.zOff || 0) * S);
  uvs.push(0.5, 1.0);
  const topBase = (numRings - 1) * cols;
  for (let i = 0; i < sides; i++) {
    const v0 = topBase + i;
    const v1 = topBase + ((i + 1) % sides);
    indices.push(topCenterIdx, v0, v1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Weld seam normals before converting to non-indexed with flat normals
  const nAttr = geo.attributes.normal;
  for (let r = 0; r < numRings; r++) {
    const i0 = r * cols;
    const i1 = r * cols + sides;
    let nx = nAttr.getX(i0) + nAttr.getX(i1);
    let ny = nAttr.getY(i0) + nAttr.getY(i1);
    let nz = nAttr.getZ(i0) + nAttr.getZ(i1);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    nAttr.setXYZ(i0, nx, ny, nz);
    nAttr.setXYZ(i1, nx, ny, nz);
  }
  nAttr.needsUpdate = true;

  return ensureFlatNormalAttribute(geo, flat);
}

/**
 * 丸く折り返す短いしっぽを作る。
 */
export function createLowPolyCurvedTail() {
  const spine = [
    { x: 0,   y: 0.0, z: -.15, r: 1.85 },
    { x: .10, y:  .7, z: -1.65, r: 1.80 },
    { x: .50, y: 2.3, z: -2.85, r: 1.55 },
    { x: .85, y: 3.8, z: -3.18, r: 1.16 },
    { x: .70, y: 4.9, z: -2.70, r: .45 },
  ];
  const sides = 6;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let s = 0; s < spine.length; s++) {
    const cur = spine[s];
    const prev = spine[Math.max(0, s - 1)];
    const next = spine[Math.min(spine.length - 1, s + 1)];
    // Tangent in YZ plane
    let ty = next.y - prev.y;
    let tz = next.z - prev.z;
    const tl = Math.hypot(ty, tz) || 1;
    ty /= tl; tz /= tl;
    // Perpendicular normal in YZ plane
    const ny = -tz;
    const nz = ty;

    for (let i = 0; i <= sides; i++) {
      const ang = (i / sides) * Math.PI * 2;
      const cx = Math.cos(ang) * cur.r;
      const cyz = Math.sin(ang) * cur.r;
      positions.push(
        (cur.x + cx) * S,
        (cur.y + ny * cyz) * S,
        (cur.z + nz * cyz) * S
      );
      uvs.push(i / sides, s / (spine.length - 1));
    }
  }

  const cols = sides + 1;
  for (let s = 0; s < spine.length - 1; s++) {
    for (let i = 0; i < sides; i++) {
      const a = s * cols + i;
      const b = s * cols + (i + 1);
      const c = (s + 1) * cols + (i + 1);
      const d = (s + 1) * cols + i;
      indices.push(a, c, b, a, d, c);
    }
  }

  const base = spine[0];
  const baseCenter = positions.length / 3;
  positions.push(base.x * S, base.y * S, base.z * S);
  uvs.push(.5, 0);
  for (let i = 0; i < sides; i++) indices.push(baseCenter, i, i + 1);

  const tipCenterIdx = positions.length / 3;
  const tip = spine[spine.length - 1];
  positions.push(tip.x * S, (tip.y + .18) * S, tip.z * S);
  uvs.push(0.5, 1.0);
  const topBase = (spine.length - 1) * cols;
  for (let i = 0; i < sides; i++) {
    indices.push(tipCenterIdx, topBase + ((i + 1) % sides), topBase + i);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return ensureFlatNormalAttribute(geo, true);
}

// 頭の前面の三角形に、正面から投影した表情を重ねる。
export function createLowPolyFacePatchGeometry(head, {
  width = FACE_WIDTH, bottom = FACE_BOTTOM, top = FACE_TOP,
} = {}) {
  const triangles = head.index ? head.toNonIndexed() : head;
  const position = triangles.attributes.position;
  const positions = [];
  const uvs = [];
  const normal = new THREE.Triangle();
  const direction = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    normal.a.fromBufferAttribute(position, i);
    normal.b.fromBufferAttribute(position, i + 1);
    normal.c.fromBufferAttribute(position, i + 2);
    if (normal.getNormal(direction).z <= 0.15) continue;
    for (let j = i; j < i + 3; j++) {
      const x = position.getX(j);
      const y = position.getY(j);
      const z = position.getZ(j);
      positions.push(x, y + HEAD_LOCAL_CY * S, z + .10 * S);
      uvs.push(
        .5 + x / (width * S),
        (y / S + HEAD_CENTER_Y - bottom) / (top - bottom)
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function spow(v, e) {
  return Math.sign(v) * Math.pow(Math.abs(v), e);
}

/**
 * Builds a smooth parametric 3D Superellipsoid BufferGeometry (28x20 segments)
 * with seamless welded seam normals and optional gentle cheek bulge / ear fold.
 */
export function createSuperellipsoidGeometry(rx, ry, rz, p = 2.3, options = {}) {
  const lonSegs = options.lonSegs || 28;
  const latSegs = options.latSegs || 20;
  const cheekBulge = !!options.cheekBulge;
  const foldZ = options.foldZ || 0;
  const e = 2.0 / p;

  const cols = lonSegs + 1;
  const rows = latSegs + 1;
  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);

  let ptr = 0;
  let uvPtr = 0;

  for (let j = 0; j <= latSegs; j++) {
    const vFrac = j / latSegs; // 0 = bottom pole, 1 = top pole
    // Slight pole inset prevents zero-length tangents during computeVertexNormals
    const phi = (-0.5 + vFrac) * Math.PI * 0.996;
    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);
    const yNorm = spow(sinP, e); // -1 .. +1
    const y = ry * yNorm;

    // Gentle lower-cheek fullness for faithful Ganadi head silhouette
    let bulge = 1.0;
    if (cheekBulge) {
      const t = (yNorm + 1.0) * 0.5;
      bulge = 1.0 + 0.045 * Math.sin(Math.PI * clamp((0.78 - t) / 0.78, 0.0, 1.0));
    }
    // Optional subtle forward tip fold for floppy puppy ears
    const zFold = foldZ * clamp(-yNorm, -1.0, 1.0);

    for (let i = 0; i <= lonSegs; i++) {
      const uFrac = i / lonSegs;
      // Seam placed cleanly at the back (-Z: theta = -PI .. +PI)
      const theta = -Math.PI + uFrac * Math.PI * 2.0;
      const x = rx * bulge * spow(cosP, e) * spow(Math.sin(theta), e);
      const z = rz * bulge * spow(cosP, e) * spow(Math.cos(theta), e) + zFold;

      positions[ptr++] = x * S;
      positions[ptr++] = y * S;
      positions[ptr++] = z * S;

      uvs[uvPtr++] = uFrac;
      uvs[uvPtr++] = vFrac;
    }
  }

  const indices = [];
  for (let j = 0; j < latSegs; j++) {
    for (let i = 0; i < lonSegs; i++) {
      const a = j * cols + i;
      const b = j * cols + (i + 1);
      const c = (j + 1) * cols + (i + 1);
      const d = (j + 1) * cols + i;
      // Right-handed outward CCW winding
      indices.push(a, b, c, a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Smooth-weld seam normals (i=0 & i=lonSegs) and exact pole normals (j=0 & j=latSegs)
  const nAttr = geo.attributes.normal;
  for (let j = 0; j <= latSegs; j++) {
    if (j === 0 || j === latSegs) {
      const py = j === 0 ? -1 : 1;
      for (let i = 0; i <= lonSegs; i++) {
        nAttr.setXYZ(j * cols + i, 0, py, 0);
      }
    } else {
      const idx0 = j * cols;
      const idx1 = j * cols + lonSegs;
      let nx = nAttr.getX(idx0) + nAttr.getX(idx1);
      let ny = nAttr.getY(idx0) + nAttr.getY(idx1);
      let nz = nAttr.getZ(idx0) + nAttr.getZ(idx1);
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      nAttr.setXYZ(idx0, nx, ny, nz);
      nAttr.setXYZ(idx1, nx, ny, nz);
    }
  }
  nAttr.needsUpdate = true;
  return ensureFlatNormalAttribute(geo, false);
}

/**
 * Builds a curved front-surface patch geometry lying on the EXACT front surface
 * of the Ganadi Head superellipsoid, pushed +0.26 units outward along the normal
 * so it conforms tightly to the cheeks & forehead with zero z-fighting!
 */
export function createConformalFacePatchGeometry() {
  const segX = 24;
  const segY = 24;
  const cols = segX + 1;
  const rows = segY + 1;
  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);

  const xMin = -FACE_WIDTH / 2, xMax = FACE_WIDTH / 2;
  const yMin = FACE_BOTTOM, yMax = FACE_TOP;

  let ptr = 0;
  let uvPtr = 0;

  for (let j = 0; j <= segY; j++) {
    const v = j / segY; // 0 = bottom (yMin), 1 = top (yMax)
    const yChar = yMin + v * (yMax - yMin);
    const dy = yChar - HEAD_CENTER_Y;
    const yNorm = clamp(dy / HEAD_RY, -0.98, 0.98);
    const t = (yNorm + 1.0) * 0.5;
    const bulge = 1.0 + 0.045 * Math.sin(Math.PI * clamp((0.78 - t) / 0.78, 0.0, 1.0));
    const rxEff = HEAD_RX * bulge;
    const rzEff = HEAD_RZ * bulge;

    for (let i = 0; i <= segX; i++) {
      const u = i / segX; // 0 = left (-10.5), 1 = right (+10.5)
      let x = xMin + u * (xMax - xMin);
      let dyClamped = dy;

      // Keep outer corner vertices hugged inside the front silhouette
      const termX = Math.pow(Math.abs(x) / rxEff, HEAD_P);
      const termY = Math.pow(Math.abs(dyClamped) / HEAD_RY, HEAD_P);
      const sumXY = termX + termY;
      let z = 0;
      if (sumXY < 0.985) {
        z = rzEff * Math.pow(1.0 - sumXY, 1.0 / HEAD_P);
      } else {
        const shrink = Math.pow(0.985 / sumXY, 1.0 / HEAD_P);
        x *= shrink;
        dyClamped *= shrink;
        z = rzEff * Math.pow(0.015, 1.0 / HEAD_P);
      }

      // Approximate outward surface normal & push +0.26 design units outward
      let nx = x / (rxEff * rxEff);
      let ny = dyClamped / (HEAD_RY * HEAD_RY);
      let nz = z / (rzEff * rzEff);
      const nLen = Math.hypot(nx, ny, nz) || 1;
      nx /= nLen; ny /= nLen; nz /= nLen;

      const push = 0.26;
      const px = x + nx * push;
      const py = (HEAD_LOCAL_CY + dyClamped) + ny * push;
      const pz = z + nz * push;

      positions[ptr++] = px * S;
      positions[ptr++] = py * S;
      positions[ptr++] = pz * S;

      uvs[uvPtr++] = u;
      uvs[uvPtr++] = v;
    }
  }

  const indices = [];
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * cols + i;
      const b = j * cols + (i + 1);
      const c = (j + 1) * cols + (i + 1);
      const d = (j + 1) * cols + i;
      indices.push(a, b, c, a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
