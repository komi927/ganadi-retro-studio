import { THREE } from '../three.js';
import { globalRenderUniforms } from './materials.js';

export function createRenderPipeline(viewportWrap, canvas) {
  globalRenderUniforms.uSnapGrid.value = new THREE.Vector2();
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.autoClear = false;
  // Standard linear pass-through keeps our exact #FFFFFF / #E8F0FA / #CDDCEC RGB values spotless!
  renderer.outputEncoding = THREE.LinearEncoding;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 160);

  // Separate Scenes for the Clean 2-Pass Pipeline:
  // Pass 1 -> worldScene (sky, meadow, plaza, trees, flowers, soft ground shadow discs)
  // Pass 2 -> charScene  (Ganadi characters, 3D props, red ball, pink cushion, white rice bowl)
  const worldScene = new THREE.Scene();
  const charScene = new THREE.Scene();

  let retroSize = 320;
  let retro = false;
  let viewW, viewH, targetW, targetH;
  let worldRT, charRT;
  let targetRetro;

  function makeRenderTarget(w, h, samples) {
    const useMSAA = !retro && renderer.capabilities.isWebGL2;
    const Target = useMSAA ? THREE.WebGLMultisampleRenderTarget : THREE.WebGLRenderTarget;
    const target = new Target(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    if (useMSAA) target.samples = samples;
    return target;
  }

  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const compositeMat = new THREE.ShaderMaterial({
    uniforms: {
      tWorld:        { value: null },
      tChar:         { value: null },
      uTexelSize:    { value: new THREE.Vector2() },
      uOutlineOn:    { value: 0.0 },
      uOutlineColor: { value: new THREE.Vector3(0.133, 0.145, 0.196) }, // #222532
      uEvening:      { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tWorld;
      uniform sampler2D tChar;
      uniform vec2 uTexelSize;
      uniform float uOutlineOn;
      uniform vec3 uOutlineColor;
      uniform float uEvening;
      varying vec2 vUv;

      void main() {
        vec4 charCol = texture2D(tChar, vUv);
        vec3 background = texture2D(tWorld, vUv).rgb;
        if (uOutlineOn > 0.5 && charCol.a < 1.0) {
          float aL = texture2D(tChar, vUv - vec2(uTexelSize.x, 0.0)).a;
          float aR = texture2D(tChar, vUv + vec2(uTexelSize.x, 0.0)).a;
          float aU = texture2D(tChar, vUv + vec2(0.0, uTexelSize.y)).a;
          float aD = texture2D(tChar, vUv - vec2(0.0, uTexelSize.y)).a;
          background = mix(background, uOutlineColor, max(max(aL, aR), max(aU, aD)));
        }
        // MSAAで解決した手前側のRGBには、画素を占める割合がすでに掛かっている。
        vec3 color = charCol.rgb + background * (1.0 - charCol.a);
        vec3 evening = color * vec3(1.01, 0.92, 0.89) + vec3(0.032, 0.012, 0.027);
        gl_FragColor = vec4(mix(color, evening, uEvening), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMat));

  function rebuildRenderTargets() {
    viewW = Math.max(1, viewportWrap.clientWidth);
    viewH = Math.max(1, viewportWrap.clientHeight);
    const displayRatio = retro ? 1 : Math.max(1, Math.min(
      window.devicePixelRatio || 1, 2, Math.sqrt(2400000 / (viewW * viewH))
    ));
    if (renderer.getPixelRatio() !== displayRatio) renderer.setPixelRatio(displayRatio);
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();

    const renderRatio = retro ? Math.min(1, retroSize / Math.min(viewW, viewH)) : displayRatio;
    const width = Math.max(1, Math.round(viewW * renderRatio));
    const height = Math.max(1, Math.round(viewH * renderRatio));
    globalRenderUniforms.uSnapGrid.value.set(retro ? width / 2 : 0, retro ? height / 2 : 0);
    if (targetW === width && targetH === height && targetRetro === retro) return;
    targetW = width;
    targetH = height;
    targetRetro = retro;

    worldRT?.dispose();
    charRT?.dispose();
    worldRT = makeRenderTarget(targetW, targetH, 2);
    charRT = makeRenderTarget(targetW, targetH, 4);
    compositeMat.uniforms.tWorld.value = worldRT.texture;
    compositeMat.uniforms.tChar.value = charRT.texture;
    compositeMat.uniforms.uTexelSize.value.set(1 / targetW, 1 / targetH);
  }

  if (window.ResizeObserver) {
    new window.ResizeObserver(rebuildRenderTargets).observe(viewportWrap);
  }
  rebuildRenderTargets();

  function renderPipeline(view = camera) {
    renderer.setRenderTarget(worldRT);
    renderer.setClearColor(0xd9f0ff, 1);
    renderer.clear();
    renderer.render(worldScene, view);

    renderer.setRenderTarget(charRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(charScene, view);

    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(postScene, postCam);
  }

  function readCharacterPixels(excluded) {
    const hidden = excluded.filter((object) => object?.visible);
    const previousTarget = renderer.getRenderTarget();
    const raw = new Uint8Array(targetW * targetH * 4);
    try {
      hidden.forEach((object) => { object.visible = false; });
      renderer.setRenderTarget(charRT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(charScene, camera);
      renderer.readRenderTargetPixels(charRT, 0, 0, targetW, targetH, raw);
      return { raw, width: targetW, height: targetH };
    } finally {
      hidden.forEach((object) => { object.visible = true; });
      renderer.setRenderTarget(previousTarget);
    }
  }

  return {
    camera,
    worldScene,
    charScene,
    get width() { return viewW; },
    get height() { return viewH; },
    resize: rebuildRenderTargets,
    render: renderPipeline,
    setRetro(enabled) {
      if (retro === enabled) return;
      retro = enabled;
      rebuildRenderTargets();
    },
    setPixelSize(size) {
      retroSize = size;
      rebuildRenderTargets();
    },
    setOutline(enabled) {
      compositeMat.uniforms.uOutlineOn.value = enabled ? 1 : 0;
    },
    setEvening(enabled) {
      compositeMat.uniforms.uEvening.value = enabled ? 1 : 0;
    },
    isContextLost() {
      return renderer.getContext().isContextLost();
    },
    readCharacterPixels,
  };
}
