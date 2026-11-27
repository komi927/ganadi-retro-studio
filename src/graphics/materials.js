import { THREE } from '../three.js';

export const globalRenderUniforms = {
  uFlatMix: { value: 1.0 },
  uSnapGrid: { value: null },
};

// PS1風では頂点ごとの照明を画面上で補間し、15bit色に落とす。
export function createCelMaterial(cLightHex, cMidHex, cDarkHex) {
  const cL = new THREE.Color(cLightHex);
  const cM = new THREE.Color(cMidHex);
  const cD = new THREE.Color(cDarkHex);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColorLight: { value: new THREE.Vector3(cL.r, cL.g, cL.b) },
      uColorMid:   { value: new THREE.Vector3(cM.r, cM.g, cM.b) },
      uColorDark:  { value: new THREE.Vector3(cD.r, cD.g, cD.b) },
      uFlatMix:    globalRenderUniforms.uFlatMix,
      uSnapGrid:   globalRenderUniforms.uSnapGrid,
    },
    vertexShader: `
      attribute vec3 aFlatNormal;
      uniform float uFlatMix;
      uniform vec2 uSnapGrid;
      uniform vec3 uColorLight;
      uniform vec3 uColorDark;
      varying vec3 vNormal;
      varying vec4 vRetroLight;
      void main() {
        bool retro = uSnapGrid.x > 0.0;
        float flatMix = uFlatMix * (retro ? 0.45 : 1.0);
        vNormal = normalize(normalMatrix * normalize(mix(normal, aFlatNormal, flatMix)));
        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        if (retro) {
          vec3 key = normalize((viewMatrix * vec4(-0.54, 0.66, 0.52, 0.0)).xyz);
          vec3 fill = normalize((viewMatrix * vec4(0.65, -0.12, 0.55, 0.0)).xyz);
          float lit = clamp(0.24 + 0.78 * max(dot(vNormal, key), 0.0)
                                 + 0.15 * max(dot(vNormal, fill), 0.0), 0.0, 1.0);
          vec3 vertexColor = mix(uColorDark * 0.81, uColorLight, lit);
          vRetroLight = vec4(vertexColor, 1.0) * clipPos.w;
          if (clipPos.w > 0.0) {
            clipPos.xy = floor(clipPos.xy / clipPos.w * uSnapGrid + 0.5) / uSnapGrid * clipPos.w;
          }
        } else {
          vRetroLight = vec4(0.0, 0.0, 0.0, 1.0);
        }
        gl_Position = clipPos;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec4 vRetroLight;
      uniform vec3 uColorLight;
      uniform vec3 uColorMid;
      uniform vec3 uColorDark;
      uniform vec2 uSnapGrid;

      // PSX-SPXに記載されている4×4の5bit量子化オフセット。
      float ditherOffset(vec2 fragment) {
        vec2 cell = mod(floor(fragment), 4.0);
        float x = mod(cell.x + 2.0 * step(2.0, cell.y), 4.0);
        float oddX = mod(x, 2.0);
        float quadrant = floor(x * 0.5);
        return mod(cell.y, 2.0) == 0.0
          ? -4.0 + 4.0 * oddX + quadrant
          : 2.0 - 4.0 * oddX + quadrant;
      }

      void main() {
        vec3 color;
        if (uSnapGrid.x > 0.0) {
          vec3 lit = vRetroLight.rgb / vRetroLight.w;
          vec3 rgb8 = clamp(lit * 255.0 + ditherOffset(gl_FragCoord.xy), 0.0, 255.0);
          color = floor(rgb8 / 8.0) / 31.0;
        } else {
          float nd = dot(normalize(vNormal), normalize(vec3(-0.20, 0.72, 0.66)));
          color = mix(uColorDark, uColorMid, smoothstep(-0.8, 0.05, nd));
          color = mix(color, uColorLight, smoothstep(-0.05, 0.9, nd));
        }
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  mat.userData.baseHex = cLightHex;
  return mat;
}

/**
 * Ensures any BufferGeometry has an 'aFlatNormal' attribute so it works
 * seamlessly with createCelMaterial in both faceted DS and smooth modes.
 */
export function ensureFlatNormalAttribute(geo, computeFaceted = false) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!computeFaceted) {
    const nArr = geo.attributes.normal.array;
    geo.setAttribute('aFlatNormal', new THREE.BufferAttribute(new Float32Array(nArr), 3));
    return geo;
  }
  const nonIdx = geo.index ? geo.toNonIndexed() : geo;
  const pos = nonIdx.attributes.position;
  const flatArr = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const fn = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    fn.crossVectors(ab, ac);
    if (fn.lengthSq() > 1e-10) fn.normalize();
    else fn.set(0, 1, 0);
    for (let k = 0; k < 3; k++) {
      const idx = (i + k) * 3;
      flatArr[idx]     = fn.x;
      flatArr[idx + 1] = fn.y;
      flatArr[idx + 2] = fn.z;
    }
  }
  nonIdx.setAttribute('aFlatNormal', new THREE.BufferAttribute(flatArr, 3));
  return nonIdx;
}
