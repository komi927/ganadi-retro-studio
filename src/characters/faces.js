import { THREE } from '../three.js';
import { globalRenderUniforms } from '../graphics/materials.js';

const faceMaterialCache = {};

/**
 * 64×64の表情座標で描き、PS1風のときは128×128のテクスチャにする。
 * 顔の描画範囲は幅 FACE_WIDTH、高さ FACE_BOTTOM〜FACE_TOP。
 */
export function getFaceMaterial(faceId, style) {
  const retroFace = style === 'ps1';
  const pixelFace = retroFace || style === 'dot';
  const key = faceId + (retroFace ? '_ps1' : (style === 'dot' ? '_dot' : ''));
  if (faceMaterialCache[key]) return faceMaterialCache[key];

  const cvs = document.createElement('canvas');
  const size = style === 'dot' ? 64 : (retroFace ? 128 : 512);
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext('2d');
  ctx.scale(size / 64, size / 64);
  ctx.lineCap = ctx.lineJoin = 'round';

  const INK = '#222532';
  const WHITE = '#fffdf9';
  const TEAR_BLUE = '#a0c6e0';
  const CHEEK_PINK = '#efb5c3';

  if (style === 'dot' && PIXEL_FACE_IDS.has(faceId)) {
    drawPixelFace(ctx, faceId);
  } else {

  function oval(x, y, rx, ry, rotation, color = INK) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function filled(path, color) {
    ctx.fillStyle = color;
    ctx.fill(new Path2D(path));
  }

  function stroke(path, width, color = INK) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke(new Path2D(path));
  }

  function dotEyes() {
    oval(15.1, 22.9, 2.98, 3.00, -.10);
    oval(48.6, 22.65, 2.96, 2.96, .10);
  }

  function drawNose(y = 51.05) {
    oval(31.7, y, 2.23, 1.49, -.14);
  }

  function drawOmegaMouth() {
    ctx.beginPath();
    ctx.moveTo(31.85, 54.95);
    ctx.lineTo(31.85, 56.3);
    ctx.quadraticCurveTo(29.4, 60.3, 25.6, 57.9);
    ctx.moveTo(31.85, 56.3);
    ctx.quadraticCurveTo(34.0, 59.9, 38.1, 58.05);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.1;
    ctx.stroke();
  }

  function wetEye(angle) {
    oval(0, 0, 3.65, 4.0, angle);
    oval(-.9, -.9, 1.29, .94, -.28, WHITE);
    stroke('M-1.65 1.45 Q.0 2.22 1.45 1.18', .83, WHITE);
  }

  function wetEyes(y) {
    ctx.save();
    ctx.translate(15.15, y + .26);
    wetEye(-.30);
    ctx.restore();
    ctx.save();
    ctx.translate(48.4, y);
    wetEye(.16);
    ctx.restore();
  }

  // 原作の表情は作者のKakaoとHNFのLINEスタンプを見ながら描いた。
  // https://e.kakao.com/t/dyu-ganadi
  // https://store.line.me/stickershop/product/36939/ja
  // https://store.line.me/stickershop/product/37436/ja
  if (faceId.startsWith('gonyani-')) {
    const wary = faceId === 'gonyani-wary';
    const staring = faceId === 'gonyani-stare';
    const glance = faceId === 'gonyani-glance-left' ? -1 : faceId === 'gonyani-glance-right' ? 1 : 0;
    if (faceId === 'gonyani-sleep') {
      stroke('M6.5 33 Q13.5 40 21 33 M43 33 Q50.5 40 57.5 33', 2.8);
    } else {
      const eye = new Path2D('M-10.5 0 C-10.5 -5 -6.5 -8.6 0 -8.5 C6 -8.5 10.7 -5.2 10.7 .2 C10.7 5.9 6.6 8.3 0 8.3 C-6.8 8.3 -10.5 5.4 -10.5 0Z');
      [-1, 1].forEach((side) => {
        ctx.save();
        ctx.translate(32 + side * 17.5, 33);
        ctx.rotate(side * (wary ? -.25 : -.055));
        ctx.scale(side, wary ? .68 : 1);
        ctx.fillStyle = INK;
        ctx.fill(eye);
        ctx.clip(eye);
        ctx.translate(side * (staring ? 1.7 : glance * 4.25), 0);
        filled('M-5.9 -6.4 C-9 -4.9 -9.9 -1.2 -8.9 2.2 Q-8.2 5.7 -5.2 6.5 Q-7.6 .6 -5.9 -6.4Z', WHITE);
        filled('M4.8 -6.5 C8 -5.0 9.7 -1.9 9.2 1.8 Q8.8 5.2 5.6 6.6 Q6.9 .9 4.8 -6.5Z', WHITE);
        ctx.restore();
      });
      if (staring) stroke('M29.2 22 L29.5 27 M32 20 L32.2 28 M35 22 L35 26', .75, '#68666d');
    }
    stroke('M28.7 55.6 L32 51.9 L35.2 55.6', 2.55);
  } else if (faceId === 'bun') {
    filled('M29.3 15.1 C29.5 12.5 31.1 9.2 32.0 9.0 C33.0 8.9 32.0 13.3 30.7 15.0 Q29.5 16.1 29.3 15.1Z', INK);
    oval(35.4, 12.2, .88, 3.4, -.08);
    oval(21.1, 27.1, 1.92, 2.48, -.07);
    oval(41.8, 26.85, 1.92, 2.48, .08);
    oval(31.5, 44.6, 1.44, 1.54, -.15);
    stroke('M29.0 50.7 C28.5 59.5 34.9 59.7 34.0 50.7 M27.4 50.1 Q30.0 52.2 32.2 47.9 M31.5 49.4 Q33.1 51.7 36.0 50.3', 1.43);
  } else if (faceId === 'normal') {
    // ユーザーの写真。バラと悪魔も原画の点目と小さな口を使う。
    dotEyes();
    drawNose();
    drawOmegaMouth();
  } else if (faceId === 'hug') {
    // 「나 안아…」。光が入った点目と、いつもの小さな口。
    wetEyes(23.2);
    drawNose();
    drawOmegaMouth();
  } else if (faceId === 'du') {
    // 「듀…」。濡れた目に、あごの近くで震えた波形の口。
    wetEyes(25.15);
    stroke('M12.0 19.9 Q14.6 19.3 16.0 20.8 M46.2 20.6 Q48.8 18.9 51.1 20.25', 1.03);
    drawNose(51.7);
    stroke('M24.9 58.5 Q26.7 55.8 29.15 58.6 Q31.5 61.2 34.05 58.9 Q36.0 56.6 38.55 58.1', 2.02);
  } else if (faceId === 'cry') {
    // 「デュァァァ」。頬へ流れる青い涙と、白い内側を残した大きな口。
    filled('M12.6 26.1 Q12.2 34.8 7.7 45.3 Q6.5 47.7 8.4 48.4 Q10.4 48.9 12.2 45.4 Q16.7 37.0 17.2 27.3 Z', TEAR_BLUE);
    filled('M46.4 27.45 Q47.5 36.2 51.7 45.4 Q53.3 48.6 55.3 48.1 Q57.3 47.6 56.15 45.0 Q51.55 35.7 50.8 26.0 Z', TEAR_BLUE);
    oval(7.8, 53.7, 1.43, 2.3, .16, TEAR_BLUE);
    oval(55.3, 53.15, 1.5, 2.1, -.15, TEAR_BLUE);
    wetEyes(22.1);
    stroke('M11.6 15.65 Q14.05 13.5 16.8 15.4 M45.9 15.6 Q48.6 13.5 51.4 15.2', 1.2);
    drawNose(38.0);
    oval(26.5, 44.4, 1.4, 1.2, -.23);
    oval(37.5, 44.8, 1.2, 1.2, .2);
    const mouth = 'M22.6 48.3 Q26.3 48.8 28.2 46.35 Q31 49.0 34.8 48.05 Q37.8 46.7 40.3 48.85 Q38.6 52.6 40.3 58.75 L23.3 59.8 Q25.45 54.15 22.6 48.3 Z';
    filled(mouth, WHITE);
    stroke(mouth, 1.95);
  } else if (faceId === 'geso') {
    // 力の抜けた短い線の目。額と頬は普段と同じ白い余白。
    stroke('M12.3 23.5 Q14.6 24.6 17.65 23.04 M46.15 22.85 Q48.5 23.45 51.18 22.05', 1.9);
    drawNose();
    drawOmegaMouth();
  } else if (faceId === 'happy') {
    // 音符のダンス絵。点目、淡い渦巻きの頬と少し出した舌。
    dotEyes();
    stroke('M13.5 39.2 C10.1 37.5 8.1 41.3 10.4 43.05 C13.1 44.5 16.6 41.2 13.65 39.95 M50.1 39.1 C53.2 37.1 55.9 40.6 53.4 42.45 C50.9 44.2 47.7 41.0 50.3 39.8', 1.45, CHEEK_PINK);
    drawNose(49.9);
    const tongue = 'M29.6 56.5 Q32.2 57.6 34.45 56.15 L34 60.4 Q33.25 62.1 31.05 61.25 Q29.8 60.3 29.6 56.5 Z';
    filled(tongue, WHITE);
    stroke(tongue, 1.45);
    stroke('M26.5 55.7 Q28.6 58.4 31.85 55.15 Q34.55 58.2 37.45 55.8', 1.98);
  } else if (faceId === 'fierce') {
    // 原作の劇画調。黒い鼻、荒い毛の線、むき出しの細かい歯。
    oval(15.4, 23.25, 4.17, 3.2, .23);
    oval(48.05, 22.55, 4.04, 3.15, -.15);
    stroke('M10.5 18.2 Q15 16.2 19.15 19.5 M44 19.4 Q48.1 16.1 52.8 17.65', 1.45);
    stroke('M24.8 22.6 L27 27.6 M29.2 20.55 L30.12 24.17 M35.3 21.2 L34.4 26.1 M40.75 22.4 L37.85 28.45 M22.3 28.25 L24.7 32.3 M42.5 28.0 L39.35 32.5', .88, '#777985');
    filled('M26.5 35.4 Q31.6 32.75 37.9 35.45 Q37.1 39.65 32.25 41.25 Q27.55 39.65 26.5 35.4 Z', INK);
    stroke('M29.8 39.95 Q23.2 39.8 21.35 45.65 M34.1 39.45 Q41.5 39.85 43.0 44.8 M22 38.0 Q19.0 40.6 19.5 44.6 M42.3 37.85 Q45.7 40.8 44.6 44.7', 1.27);
    filled('M21.2 46.3 Q24.5 44.1 29.5 46.6 L33 44.65 Q39.1 45.2 43.4 47.35 L40.7 56.05 Q38.5 60.05 32.0 59.3 Q25.65 59.8 22 54.0 Z', INK);
    filled('M23.2 47.25 L26.5 46.95 L27.5 49.2 L30.5 47.75 L32.4 49.3 L34.4 46.9 L36.1 49.5 L38.3 47.45 L40.65 48.1 L37.75 52 L35.25 50.6 L33 53.0 L29.85 51.25 L28.0 52.0 Z', WHITE);
    filled('M25.2 55.6 L27.2 54.0 L29.4 56.1 L32.1 54.55 L34.05 56.2 L36.6 54.45 L39.2 55.0 Q36.0 58.0 32.2 57.65 Q27.8 58.1 25.2 55.6 Z', WHITE);
    stroke('M18.5 48.0 L17.5 51.9 M19.25 52.0 L19.0 55.3 M45.65 48.2 L46.55 52.2 M45.1 52.3 L45.15 55.7', .9, '#777985');
  } else if (faceId === 'angel') {
    // 公式フィギュアの、点目と口を少し開けた顔。
    // https://linefriends.co.jp/news/lESFIqDv
    dotEyes();
    drawNose();
    stroke('M25.9 56.75 Q28.3 58.8 31.9 55.4 Q34.7 58.6 37.9 56.8 M29.05 57.9 Q29.2 61.55 31.8 61.5 Q34.35 61.5 34.95 57.7', 1.8);
  } else if (faceId === 'sleep') {
    // 横たわりの原画。短い閉じ目と小さな鼻・口。
    stroke('M12.65 22.9 Q14.65 23.5 17.0 23.0 M46.8 22.25 Q49.1 23.05 51.0 22.6', 2.0);
    drawNose();
    drawOmegaMouth();
  }

  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.minFilter = pixelFace ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
  tex.magFilter = pixelFace ? THREE.NearestFilter : THREE.LinearFilter;
  tex.generateMipmaps = !pixelFace;
  tex.needsUpdate = true;

  // 曲線の縁の透明度を保ち、PS1表示ではカットアウトにする。
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tFace:    { value: tex },
      uSnapGrid: globalRenderUniforms.uSnapGrid,
    },
    vertexShader: `
      uniform vec2 uSnapGrid;
      varying vec3 vFaceUV;
      void main() {
        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        bool retro = uSnapGrid.x > 0.0;
        vFaceUV = vec3(uv, 1.0) * (retro ? clipPos.w : 1.0);
        if (retro && clipPos.w > 0.0) {
          clipPos.xy = floor(clipPos.xy / clipPos.w * uSnapGrid + 0.5) / uSnapGrid * clipPos.w;
        }
        gl_Position = clipPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D tFace;
      uniform vec2 uSnapGrid;
      varying vec3 vFaceUV;
      void main() {
        vec4 c = texture2D(tFace, vFaceUV.xy / vFaceUV.z);
        if (c.a <= 0.001) discard;
        if (uSnapGrid.x > 0.0) {
          if (c.a < 0.5) discard;
          c.a = 1.0;
        }
        gl_FragColor = c;
      }
    `,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  mat.userData.faceCanvas = cvs;
  mat.userData.faceId = faceId;
  faceMaterialCache[key] = mat;
  return mat;
}

/**
 * 旧「3Dドット・プレイグラウンド」の64×64ピクセルアート顔をそのまま移植。
 * ドット絵スタイルのときだけ使う（対象外の顔は従来の描画を64pxで使う）。
 */
const PIXEL_FACE_IDS = new Set(['normal', 'hug', 'du', 'cry', 'geso', 'happy', 'fierce', 'devil', 'rose', 'sleep']);

function drawPixelFace(ctx, faceId) {
ctx.clearRect(0, 0, 64, 64);

const INK       = '#222532';
const WHITE     = '#ffffff';
const BLUSH     = '#ffa6be';
const TEAR_DARK = '#4eb3ff';
const TEAR_LITE = '#a8e2ff';
const MOUTH_PNK = '#f26a88';
const GLOOM_GRY = '#8092b0';

function pRect(x, y, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function pDisk(cx, cy, r, col) {
  ctx.fillStyle = col;
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r + 0.25) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

function pLine(x0, y0, x1, y1, r, col) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    pDisk(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, col);
  }
}

function drawNose(ny = 43) {
  pRect(30, ny - 1, 4, 3, INK);
}

function drawOmegaMouth() {
  pRect(31, 44, 2, 4, INK);
  pLine(32, 48, 28, 51, 1.15, INK);
  pLine(28, 51, 24, 49, 1.10, INK);
  pLine(32, 48, 36, 51, 1.15, INK);
  pLine(36, 51, 40, 49, 1.10, INK);
}

function drawBlush(y = 31) {
  pDisk(10, y, 3.6, BLUSH);
  pDisk(12, y, 3.2, BLUSH);
  pDisk(54, y, 3.6, BLUSH);
  pDisk(52, y, 3.2, BLUSH);
}

if (faceId === 'normal') {
  pDisk(15, 21, 2.7, INK);
  pDisk(49, 21, 2.7, INK);
  drawNose(43);
  drawOmegaMouth();
} else if (faceId === 'hug') {
  pDisk(15, 21, 3.8, INK);
  pDisk(49, 21, 3.8, INK);
  pDisk(13.5, 19.5, 1.45, WHITE);
  pDisk(47.5, 19.5, 1.45, WHITE);
  pDisk(16.5, 22.8, 1.0, TEAR_LITE);
  pDisk(50.5, 22.8, 1.0, TEAR_LITE);
  drawBlush(31);
  drawNose(43);
  pRect(31, 44, 2, 4, INK);
  pLine(27, 50, 32, 48, 1.15, INK);
  pLine(32, 48, 37, 50, 1.15, INK);
} else if (faceId === 'du') {
  pLine(10, 14, 19, 11, 1.2, INK);
  pLine(54, 14, 45, 11, 1.2, INK);
  pDisk(15, 21, 4.0, INK);
  pDisk(49, 21, 4.0, INK);
  pRect(12, 23, 7, 3, TEAR_DARK);
  pRect(45, 23, 7, 3, TEAR_DARK);
  pRect(13, 22, 5, 2, TEAR_LITE);
  pRect(46, 22, 5, 2, TEAR_LITE);
  pDisk(13.5, 19.5, 1.5, WHITE);
  pDisk(47.5, 19.5, 1.5, WHITE);
  pDisk(14, 29, 1.6, TEAR_DARK);
  pDisk(50, 29, 1.6, TEAR_DARK);
  drawNose(43);
  pLine(26, 51, 32, 47, 1.2, INK);
  pLine(32, 47, 38, 51, 1.2, INK);
} else if (faceId === 'cry') {
  pRect(12, 23, 6, 33, TEAR_DARK);
  pRect(46, 23, 6, 33, TEAR_DARK);
  pRect(14, 24, 2, 31, TEAR_LITE);
  pRect(48, 24, 2, 31, TEAR_LITE);
  pLine(10, 17, 19, 21, 1.4, INK);
  pLine(19, 21, 10, 25, 1.4, INK);
  pLine(54, 17, 45, 21, 1.4, INK);
  pLine(45, 21, 54, 25, 1.4, INK);
  drawNose(42);
  pDisk(32, 51, 5.2, INK);
  pDisk(32, 51.5, 3.6, MOUTH_PNK);
} else if (faceId === 'geso') {
  const gxList = [12, 18, 24, 40, 46, 52];
  gxList.forEach((gx, idx) => {
    pRect(gx, 4 + (idx % 2) * 2, 2, 10, GLOOM_GRY);
  });
  pRect(10, 20, 10, 3, INK);
  pRect(44, 20, 10, 3, INK);
  pRect(11, 24, 8, 2, GLOOM_GRY);
  pRect(45, 24, 8, 2, GLOOM_GRY);
  drawNose(43);
  pRect(27, 49, 10, 3, INK);
} else if (faceId === 'happy') {
  pLine(10, 23, 15, 17, 1.4, INK);
  pLine(15, 17, 20, 23, 1.4, INK);
  pLine(44, 23, 49, 17, 1.4, INK);
  pLine(49, 17, 54, 23, 1.4, INK);
  drawBlush(31);
  drawNose(42);
  pLine(25, 48, 32, 50, 1.3, INK);
  pLine(32, 50, 39, 48, 1.3, INK);
  pDisk(32, 52.5, 3.4, INK);
  pDisk(32, 53, 2.2, MOUTH_PNK);
} else if (faceId === 'fierce') {
  pLine(9, 12, 21, 18, 1.6, INK);
  pLine(55, 12, 43, 18, 1.6, INK);
  pDisk(15, 22, 2.9, INK);
  pDisk(49, 22, 2.9, INK);
  drawNose(38);
  pRect(22, 43, 20, 13, INK);
  pRect(24, 45, 16, 9, MOUTH_PNK);
  pRect(25, 45, 3, 4, WHITE);
  pRect(36, 45, 3, 4, WHITE);
} else if (faceId === 'devil') {
  pLine(10, 14, 20, 18, 1.4, INK);
  pLine(54, 14, 44, 18, 1.4, INK);
  pDisk(15, 22, 2.9, INK);
  pDisk(49, 22, 2.9, INK);
  drawNose(42);
  pLine(25, 50, 33, 51, 1.3, INK);
  pLine(33, 51, 41, 46, 1.3, INK);
} else if (faceId === 'rose') {
  pLine(10, 15, 20, 16, 1.25, INK);
  pLine(44, 16, 54, 15, 1.25, INK);
  pDisk(15, 21, 2.8, INK);
  pDisk(49, 21, 2.8, INK);
  drawNose(43);
  pLine(27, 50, 33, 50, 1.2, INK);
  pLine(33, 50, 39, 47, 1.2, INK);
} else if (faceId === 'sleep') {
  pLine(10, 20, 15, 24, 1.35, INK);
  pLine(15, 24, 20, 20, 1.35, INK);
  pLine(44, 20, 49, 24, 1.35, INK);
  pLine(49, 24, 54, 20, 1.35, INK);
  drawBlush(31);
  drawNose(42);
  pDisk(32, 50, 2.6, INK);
  pDisk(32, 50, 1.2, MOUTH_PNK);
}
}
