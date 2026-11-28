import { THREE } from '../three.js';
import { S } from '../math.js';
import { createCelMaterial, ensureFlatNormalAttribute } from '../graphics/materials.js';
import { HEAD_CENTER_Y, HEAD_RX, HEAD_RY, HEAD_RZ, HEAD_P } from './design.js';
import {
  OCT_SQUIRCLE, HEX_RING, HEAD_PROFILE, HEAD_RINGS, ROUND_RING,
  createLowPolyLathe, createLowPolyCurvedTail, createLowPolyFacePatchGeometry,
  createSuperellipsoidGeometry, createConformalFacePatchGeometry,
} from './geometry.js?v=2';

function buildBunGeometry(flat) {
  // 写真の正面輪郭を、耳まで一続きの断面にする。
  const shape = new THREE.Shape();
  shape.moveTo(-11.7, .7);
  shape.bezierCurveTo(-7.7, -.25, 3.7, -.15, 9.9, 1.5);
  shape.bezierCurveTo(14.5, 2.5, 16.2, 4.5, 16.1, 8.0);
  shape.bezierCurveTo(16.1, 11.5, 15.7, 14.9, 13.3, 16.6);
  shape.bezierCurveTo(15.9, 16.5, 17.8, 18.3, 17.2, 20.2);
  shape.bezierCurveTo(16.4, 22.2, 12.0, 23.9, 8.5, 22.6);
  shape.bezierCurveTo(6.9, 22.8, 5.5, 23.7, 4.5, 25.3);
  shape.bezierCurveTo(3.2, 27.5, 2.2, 27.5, .8, 25.8);
  shape.bezierCurveTo(-.9, 26.0, -2.6, 26.8, -3.6, 24.5);
  shape.bezierCurveTo(-4.2, 23.5, -5.6, 23.4, -6.8, 22.3);
  shape.bezierCurveTo(-9.3, 24.4, -15.4, 23.2, -17.1, 20.6);
  shape.bezierCurveTo(-18.1, 18.7, -16.6, 15.7, -12.0, 16.0);
  shape.bezierCurveTo(-14.5, 14.7, -16.3, 10.7, -16.1, 6.9);
  shape.bezierCurveTo(-16.2, 3.6, -14.9, 1.4, -11.7, .7);
  // 耳の付け根で断面同士が交差しない高さを縮小の中心にする。
  const centerY = 16.5;
  const profile = shape.getPoints(flat ? 3 : 6).slice(0, -1)
    .map(({ x, y }) => [x, -(y - centerY)]);

  // 奥行きに沿って断面を小さくし、前後を丸く閉じる。
  const rings = [
    { y: -11.0, sx: .27, sz: .27 },
    { y: -10.1, sx: .62, sz: .65 },
    { y: -7.8, sx: .85, sz: .87 },
    { y: -4.1, sx: .96, sz: .98 },
    { y:   .5, sx: 1, sz: 1 },
    { y:  4.7, sx: .96, sz: .98 },
    { y:  8.0, sx: .86, sz: .89 },
    { y: 10.0, sx: .68, sz: .72 },
    { y: 11.0, sx: .42, sz: .46 },
    { y: 11.35, sx: .20, sz: .26 },
  ];
  const body = createLowPolyLathe(rings, profile, 1, 1, flat);
  const rotation = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  body.applyMatrix4(rotation);
  body.attributes.aFlatNormal.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(rotation));
  body.computeBoundingBox();
  body.translate(0, -body.boundingBox.min.y, 0);
  const face = createLowPolyFacePatchGeometry(body, {
    width: 36, bottom: 0, top: 27, centerY: 0, pivotY: 0,
  });
  return { bunBody: body, bunFace: face };
}

export function buildSharedAssets() {
  // Pure Snow-White 3-Tone Cel Shader for Ganadi's Fur (EXACT SPEC!)
  const furMat = createCelMaterial('#FFFFFF', '#E1EAF6', '#B7C7DB');

  // Prop Cel Materials
  const mats = {
    fur:        furMat,
    bun:        createCelMaterial('#FFF9ED', '#F1E6D5', '#D9C6AE'),
    halo:       createCelMaterial('#FFF199', '#FFD444', '#E5A81B'),
    angelWing:  createCelMaterial('#FFFFFF', '#EBF3FD', '#D2E2F5'),
    devilHorn:  createCelMaterial('#42424A', '#28282F', '#14151A'),
    batWing:    createCelMaterial('#5A4E78', '#3F3559', '#2A233D'),
    roseRed:    createCelMaterial('#FF6682', '#EA2C4E', '#B51535'),
    stemGreen:  createCelMaterial('#6ED182', '#3DAE58', '#257D3D'),
    ballRed:    createCelMaterial('#FF6E8E', '#EF4068', '#C62249'),
    ballWhite:  createCelMaterial('#FFFFFF', '#EDF3FA', '#D4E1F0'),
    cushTop:    createCelMaterial('#FFB4CE', '#FF82AE', '#E55B8C'),
    cushSide:   createCelMaterial('#FF7FA8', '#EB5484', '#C43564'),
    riceWhite:  createCelMaterial('#FFFFFF', '#F0F5FC', '#DAE5F2'),
    bowlBlue:   createCelMaterial('#8CC2FF', '#5896E6', '#3A6FB8'),
    trunk:      createCelMaterial('#C7976F', '#A87851', '#855A3A'),
    leafA:      createCelMaterial('#98E69A', '#6ECC76', '#4CA858'),
    leafB:      createCelMaterial('#B8F2AE', '#86DC88', '#5FB868'),
    flPink:     createCelMaterial('#FFAEC8', '#FF7CA8', '#E05585'),
    flYellow:   createCelMaterial('#FFF096', '#FFD24E', '#E3AC22'),
    flSky:      createCelMaterial('#B2E4FF', '#7BC8F6', '#52A2D8'),
    sparkle:    new THREE.MeshBasicMaterial({ color: 0xffe46b }),
    steam:      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    wireframe:  new THREE.MeshBasicMaterial({
      color: 0x1d4ed8,
      wireframe: true,
      transparent: true,
      opacity: 0.42,
      depthTest: true,
    }),
  };

  const head = createLowPolyLathe(HEAD_RINGS, HEAD_PROFILE, HEAD_RX, HEAD_RZ);
  // LINE第1弾の、おもちが重なったようなシルエット。
  const mochiRings = [
    { y: .25, sx: .64, sz: .63, xOff: -.3 },
    { y: 1.65, sx: .93, sz: .94, xOff: -.45 },
    { y: 3.60, sx: 1, sz: 1, xOff: -.55 },
    { y: 5.46, sx: .87, sz: .89, xOff: -.49 },
    { y: 6.06, sx: .77, sz: .82, xOff: -.12 },
    { y: 7.52, sx: .90, sz: .90, xOff: .42 },
    { y: 9.37, sx: .88, sz: .92, xOff: .46 },
    { y: 11, sx: .69, sz: .76, xOff: .17 },
    { y: 11.63, sx: .65, sz: .67, xOff: -.22 },
    { y: 13.15, sx: .76, sz: .76, xOff: -.46 },
    { y: 15.10, sx: .70, sz: .72, xOff: -.41 },
    { y: 18.1, sx: .47, sz: .53, xOff: -.23 },
  ];
  const lowGeos = {
    ...buildBunGeometry(true),
    head,
    facePatch: createLowPolyFacePatchGeometry(head),
    torsoMochi: createLowPolyLathe(mochiRings, ROUND_RING, 15.2, 10.4),
    // 写真の耳は横に広く、先端だけが丸く下へ折れる。
    earL: createLowPolyLathe([
      { y: -4.30, sx: .30, sz: .35, xOff: .28, zOff: 1.23 },
      { y: -3.50, sx: .72, sz: .72, xOff: .03, zOff: 1.12 },
      { y: -1.82, sx: .94, sz: .94, xOff: -.34, zOff: .86 },
      { y:   .50, sx: 1.0, sz: 1.0, xOff: -.25, zOff: .38 },
      { y:  2.82, sx: .83, sz: .83, xOff: .30, zOff: -.28 },
      { y:  4.46, sx: .34, sz: .46, xOff: .93, zOff: -.64 },
    ], ROUND_RING, 3.96, 3.50),
    earR: createLowPolyLathe([
      { y: -3.86, sx: .30, sz: .34, xOff: -.39, zOff: 1.20 },
      { y: -3.02, sx: .77, sz: .72, xOff: -.04, zOff: 1.02 },
      { y: -1.25, sx: 1.0, sz: .97, xOff: .27, zOff: .72 },
      { y:  1.00, sx: .97, sz: 1.0, xOff: .22, zOff: .14 },
      { y:  2.77, sx: .79, sz: .83, xOff: -.35, zOff: -.25 },
      { y:  3.98, sx: .35, sz: .44, xOff: -.92, zOff: -.64 },
    ], ROUND_RING, 4.27, 3.53),
    torsoBiped: createLowPolyLathe([
      { y: -9.3, sx: .37, sz: .44, zOff: .20 },
      { y: -8.3, sx: .65, sz: .69, zOff: .15 },
      { y: -6.0, sx: .87, sz: .89, zOff: .15 },
      { y: -2.0, sx: 1.0, sz: 1.0, zOff: .14 },
      { y:  3.2, sx: .97, sz: .94 },
      { y:  7.4, sx: .79, sz: .77, zOff: -.18 },
      { y: 10.2, sx: .56, sz: .58, zOff: -.23 },
    ], ROUND_RING, 8.45, 8.65),
    arm: createLowPolyLathe([
      { y: -4.55, sx: .30, sz: .41, zOff: .20 },
      { y: -3.40, sx: .77, sz: .79, zOff: .25 },
      { y:  -.65, sx: 1.0, sz: 1.0 },
      { y:  2.25, sx: .89, sz: .92, zOff: -.25 },
      { y:  4.75, sx: .49, sz: .62, zOff: -.30 },
    ], HEX_RING, 2.08, 2.85),
    foot: createLowPolyLathe([
      { y: -2.25, sx: .59, sz: .65, zOff: .40 },
      { y: -1.55, sx: .88, sz: .92, zOff: .24 },
      { y:   .20, sx: 1.0, sz: 1.0 },
      { y:  2.50, sx: .74, sz: .77, zOff: -.20 },
    ], HEX_RING, 2.28, 3.18),
    // 8-sided horizontal chubby Maltese puppy torso
    torsoQuad: createLowPolyLathe([
      { y: -6.4, sx: 0.58, sz: 0.62 },
      { y: -2.4, sx: 1.00, sz: 1.00 },
      { y:  2.8, sx: 0.98, sz: 0.98 },
      { y:  6.5, sx: 0.56, sz: 0.60 },
    ], OCT_SQUIRCLE, 7.6, 11.4),
    // 6-sided chunky quadruped leg
    legQuad: createLowPolyLathe([
      { y: -4.2, sx: 0.62, sz: 0.64 },
      { y:  0.0, sx: 1.00, sz: 1.00 },
      { y:  4.2, sx: 0.66, sz: 0.66 },
    ], HEX_RING, 2.3, 2.5),
    // 背中側で短く折り返すしっぽ。
    tailSingle: createLowPolyCurvedTail(),
    // Low-poly 3D props (chunky DS style!)
    halo: ensureFlatNormalAttribute(new THREE.TorusGeometry(6.6 * S, 1.15 * S, 5, 10), true),
    angelWingLobe1: createLowPolyLathe([
      { y: -2.4, sx: 0.5, sz: 0.6 },
      { y:  0.0, sx: 1.0, sz: 1.0 },
      { y:  2.4, sx: 0.5, sz: 0.6 },
    ], HEX_RING, 4.4, 1.3),
    angelWingLobe2: createLowPolyLathe([
      { y: -1.9, sx: 0.5, sz: 0.6 },
      { y:  0.0, sx: 1.0, sz: 1.0 },
      { y:  1.9, sx: 0.5, sz: 0.6 },
    ], HEX_RING, 3.2, 1.2),
    devilHorn: ensureFlatNormalAttribute(new THREE.ConeGeometry(2.2 * S, 6.2 * S, 5), true),
    batWingMain: createLowPolyLathe([
      { y: -2.5, sx: 0.45, sz: 0.6 },
      { y:  0.0, sx: 1.00, sz: 1.0 },
      { y:  2.5, sx: 0.45, sz: 0.6 },
    ], HEX_RING, 5.0, 0.95),
    batWingTip: ensureFlatNormalAttribute(new THREE.ConeGeometry(2.2 * S, 4.8 * S, 4), true),
    roseStem: ensureFlatNormalAttribute(new THREE.CylinderGeometry(0.55 * S, 0.55 * S, 10.2 * S, 5), true),
    roseLeaf: ensureFlatNormalAttribute(new THREE.OctahedronGeometry(1.45 * S, 0), true),
    roseBloom: ensureFlatNormalAttribute(new THREE.IcosahedronGeometry(2.45 * S, 0), true),
  };

  // ---- B. SMOOTH SUPERELLIPSOID GEOMETRIES (FOR 1-TAP COMPARISON) ----
  const smoothGeos = {
    ...buildBunGeometry(false),
    tailSingle: lowGeos.tailSingle,
    torsoMochi: createLowPolyLathe(mochiRings, HEAD_PROFILE, 15.2, 10.4, false),
    head: createSuperellipsoidGeometry(HEAD_RX, HEAD_RY, HEAD_RZ, HEAD_P, {
      lonSegs: 28, latSegs: 20, cheekBulge: true,
    }),
    facePatch: createConformalFacePatchGeometry(),
    earL: createSuperellipsoidGeometry(3.96, 4.42, 3.50, 2.25, {
      lonSegs: 24, latSegs: 16, foldZ: 1.4,
    }),
    earR: createSuperellipsoidGeometry(4.27, 3.95, 3.53, 2.25, {
      lonSegs: 24, latSegs: 16, foldZ: 1.2,
    }),
    torsoBiped: createSuperellipsoidGeometry(8.45, 9.8, 8.65, 2.25, {
      lonSegs: 28, latSegs: 20,
    }),
    arm: createSuperellipsoidGeometry(2.08, 4.65, 2.85, 2.2, {
      lonSegs: 20, latSegs: 14,
    }),
    foot: createSuperellipsoidGeometry(2.28, 2.35, 3.18, 2.25, {
      lonSegs: 20, latSegs: 14,
    }),
    torsoQuad: createSuperellipsoidGeometry(7.6, 6.6, 11.4, 2.25, {
      lonSegs: 28, latSegs: 20,
    }),
    legQuad: createSuperellipsoidGeometry(2.25, 4.3, 2.45, 2.2, {
      lonSegs: 18, latSegs: 14,
    }),
    tail1: createSuperellipsoidGeometry(1.85, 1.8, 2.3, 2.2, { lonSegs: 18, latSegs: 12 }),
    tail2: createSuperellipsoidGeometry(1.5, 1.9, 1.75, 2.2, { lonSegs: 18, latSegs: 12 }),
    tail3: createSuperellipsoidGeometry(1.2, 1.45, 1.25, 2.2, { lonSegs: 18, latSegs: 12 }),
    halo: ensureFlatNormalAttribute(new THREE.TorusGeometry(6.6 * S, 1.05 * S, 12, 28), false),
    angelWingLobe1: createSuperellipsoidGeometry(4.4, 2.4, 1.25, 2.1, { lonSegs: 18, latSegs: 12 }),
    angelWingLobe2: createSuperellipsoidGeometry(3.2, 1.9, 1.15, 2.1, { lonSegs: 18, latSegs: 12 }),
    devilHorn: ensureFlatNormalAttribute(new THREE.ConeGeometry(2.1 * S, 6.2 * S, 14), false),
    batWingMain: createSuperellipsoidGeometry(5.0, 2.6, 0.9, 2.0, { lonSegs: 18, latSegs: 12 }),
    batWingTip: ensureFlatNormalAttribute(new THREE.ConeGeometry(2.2 * S, 4.8 * S, 10), false),
    roseStem: ensureFlatNormalAttribute(new THREE.CylinderGeometry(0.52 * S, 0.52 * S, 10.2 * S, 10), false),
    roseLeaf: createSuperellipsoidGeometry(1.7, 0.75, 1.2, 2.0, { lonSegs: 12, latSegs: 10 }),
    roseBloom: createSuperellipsoidGeometry(2.5, 2.3, 2.4, 2.05, { lonSegs: 18, latSegs: 14 }),
  };

  return { mats, lowGeos, smoothGeos };
}

export function buildGonyaniAssets(assets) {
  // HNFのキャラクター資料（5・8ページ）とLINE第2弾の正面絵を参照。
  // 耳を除く輪郭は横長。頬を張らせ、あごの接続位置は保つ。
  const headRings = [
    { y: -12.1, sx: .51, sz: .37, zOff: .45 },
    { y: -11.0, sx: .77, sz: .65, zOff: .40 },
    { y: -8.7,  sx: .94, sz: .84, zOff: .12 },
    { y: -5.2,  sx: 1.0, sz: .99, zOff: -.36 },
    { y: -1.2,  sx: .96, sz: 1.0, zOff: -.55 },
    { y: 2.6,   sx: .87, sz: .91, zOff: -.53 },
    { y: 6.0,   sx: .77, sz: .72, zOff: -.34 },
    { y: 8.2,   sx: .59, sz: .48, zOff: -.10 },
    { y: 9.3,   sx: .31, sz: .19 },
  ];
  const faceArea = {
    width: 23.4,
    bottom: HEAD_CENTER_Y + headRings[0].y,
    top: HEAD_CENTER_Y + headRings[headRings.length - 1].y,
  };
  const earRings = [
    { y: -.6, sx: .57, sz: .62 },
    { y: 1.5, sx: 1.0, sz: 1.0 },
    { y: 5.2, sx: .47, sz: .53, zOff: .30 },
    { y: 8.1, sx: .045, sz: .045, zOff: .70 },
  ];
  const torsoRings = [
    { y: -9.0, sx: .49, sz: .48, zOff: .25 },
    { y: -6.9, sx: .81, sz: .77, zOff: .11 },
    { y: -2.7, sx: .98, sz: 1.0 },
    { y: 3.3, sx: 1.0, sz: .96 },
    { y: 8.3, sx: .88, sz: .80, zOff: -.30 },
    { y: 9.8, sx: .53, sz: .49, zOff: -.40 },
  ];
  const quadTorsoRings = [
    { y: -6.0, sx: .44, sz: .62 },
    { y: -3.8, sx: .83, sz: .90 },
    { y: -.5,  sx: 1.0, sz: 1.0 },
    { y: 3.2,  sx: .88, sz: .95 },
    { y: 5.5,  sx: .53, sz: .72 },
  ];
  // 重なった毛束が背面と横から見える、短く逆立ったしっぽ。
  const tailRings = [
    { y: -2.0, sx: .44, sz: .43, zOff: -.5 },
    { y: -.8,  sx: .83, sz: .85, zOff: -1.9 },
    { y: 1.15, sx: 1.0, sz: 1.0, zOff: -2.65 },
    { y: 2.30, sx: .77, sz: .80, zOff: -2.50 },
    { y: 3.85, sx: .86, sz: .88, zOff: -2.65, xOff: .3 },
    { y: 4.65, sx: .55, sz: .62, zOff: -2.50 },
    { y: 6.10, sx: .63, sz: .61, zOff: -2.35, xOff: -.3 },
    { y: 6.85, sx: .35, sz: .38, zOff: -2.23 },
    { y: 8.70, sx: .06, sz: .08, zOff: -1.65, xOff: .5 },
  ];
  const smoothRing = Array.from({ length: 24 }, (_, i) => {
    const angle = -i * Math.PI / 12;
    return [Math.cos(angle), Math.sin(angle)];
  });
  const buildGeometry = (flat) => {
    const shell = (rings, rx, rz, profile = ROUND_RING) =>
      createLowPolyLathe(rings, flat ? profile : smoothRing, rx, rz, flat);
    const head = shell(headRings, 15.8, 10.6, HEAD_PROFILE);
    const ear = shell(earRings, 4.25, 2.7, HEX_RING);
    return {
      ...(flat ? assets.lowGeos : assets.smoothGeos),
      head,
      facePatch: createLowPolyFacePatchGeometry(head, faceArea),
      earL: ear,
      earR: ear,
      torsoBiped: shell(torsoRings, 7.4, 6.9),
      torsoQuad: shell(quadTorsoRings, 7.1, 10.8),
      tailSingle: shell(tailRings, 4.0, 3.25),
    };
  };
  return {
    mats: { ...assets.mats, fur: createCelMaterial('#D6D4D1', '#AAA8A7', '#75747C') },
    lowGeos: buildGeometry(true),
    smoothGeos: buildGeometry(false),
  };
}
