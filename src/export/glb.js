import { THREE } from '../three.js';

export function buildCharacterGlb(player, flatShading) {
  const modelName = player.isGonyani ? 'Gonyani' : 'Ganadi';
  player.root.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(player.root.matrixWorld).invert();

  // Collect all visible non-wireframe meshes inside player.root
  const partMeshes = [];
  const collect = (obj) => {
    if (!obj.visible) return;
    if (obj.isMesh && !obj.userData.isWireframe && obj.geometry) {
      partMeshes.push(obj);
    }
    for (let i = 0; i < obj.children.length; i++) collect(obj.children[i]);
  };
  collect(player.root);

  if (partMeshes.length === 0) {
    return null;
  }

  const binChunks = [];
  let binByteLen = 0;
  const bufferViews = [];
  const accessors = [];
  const materials = [];
  const meshesJson = [];
  const nodesJson = [];
  const imagesJson = [];
  const texturesJson = [];
  const samplersJson = [];

  const pushBin = (typedArray, target) => {
    const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const pad = (4 - (binByteLen % 4)) % 4;
    if (pad > 0) {
      binChunks.push(new Uint8Array(pad));
      binByteLen += pad;
    }
    const offset = binByteLen;
    binChunks.push(bytes);
    binByteLen += bytes.byteLength;
    const bv = { buffer: 0, byteOffset: offset, byteLength: bytes.byteLength };
    if (target) bv.target = target;
    bufferViews.push(bv);
    return bufferViews.length - 1;
  };

  // Material cache by color hex or face texture
  const matIndexMap = new Map();
  const getOrCreateGltfMat = (threeMat) => {
    if (threeMat.userData && threeMat.userData.faceCanvas) {
      const key = 'face_' + threeMat.userData.faceId;
      if (matIndexMap.has(key)) return matIndexMap.get(key);

      // 表情のPNGをGLBに埋め込む
      const dataUrl = threeMat.userData.faceCanvas.toDataURL('image/png');
      const b64 = dataUrl.split(',')[1];
      const rawStr = atob(b64);
      const pngBytes = new Uint8Array(rawStr.length);
      for (let i = 0; i < rawStr.length; i++) pngBytes[i] = rawStr.charCodeAt(i);
      const imgBv = pushBin(pngBytes, null);

      const imgIdx = imagesJson.length;
      imagesJson.push({ bufferView: imgBv, mimeType: 'image/png' });
      if (samplersJson.length === 0) {
        const nearest = threeMat.uniforms.tFace.value.magFilter === THREE.NearestFilter;
        samplersJson.push({
          magFilter: nearest ? 9728 : 9729,
          minFilter: nearest ? 9728 : 9987,
          wrapS: 33071,
          wrapT: 33071,
        });
      }
      const texIdx = texturesJson.length;
      texturesJson.push({ sampler: 0, source: imgIdx });

      const mIdx = materials.length;
      materials.push({
        name: modelName + 'Face_' + threeMat.userData.faceId,
        pbrMetallicRoughness: {
          baseColorTexture: { index: texIdx },
          metallicFactor: 0.0,
          roughnessFactor: 1.0,
        },
        alphaMode: 'MASK',
        alphaCutoff: 0.5,
        doubleSided: false,
      });
      matIndexMap.set(key, mIdx);
      return mIdx;
    }

    const hex = (threeMat.userData && threeMat.userData.baseHex) || '#FFFFFF';
    if (matIndexMap.has(hex)) return matIndexMap.get(hex);
    const col = new THREE.Color(hex);
    const mIdx = materials.length;
    materials.push({
      name: 'Mat_' + hex.replace('#', ''),
      pbrMetallicRoughness: {
        baseColorFactor: [
          Math.pow(col.r, 2.2),
          Math.pow(col.g, 2.2),
          Math.pow(col.b, 2.2),
          1.0,
        ],
        metallicFactor: 0.0,
        roughnessFactor: 0.92,
      },
    });
    matIndexMap.set(hex, mIdx);
    return mIdx;
  };

  const relMat = new THREE.Matrix4();
  const normMat = new THREE.Matrix3();
  const vPos = new THREE.Vector3();
  const vNrm = new THREE.Vector3();

  partMeshes.forEach((mesh, pIdx) => {
    relMat.multiplyMatrices(invRoot, mesh.matrixWorld);
    normMat.getNormalMatrix(relMat);

    const srcGeo = mesh.geometry;
    const geo = srcGeo.index ? srcGeo.toNonIndexed() : srcGeo;
    const posAttr = geo.attributes.position;
    const nrmAttr = (flatShading && geo.attributes.aFlatNormal)
      ? geo.attributes.aFlatNormal
      : geo.attributes.normal;
    const uvAttr = geo.attributes.uv;
    const count = posAttr.count;

    const outPos = new Float32Array(count * 3);
    const outNrm = new Float32Array(count * 3);
    const outUv  = new Float32Array(count * 2);

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < count; i++) {
      vPos.fromBufferAttribute(posAttr, i).applyMatrix4(relMat);
      outPos[i * 3]     = vPos.x;
      outPos[i * 3 + 1] = vPos.y;
      outPos[i * 3 + 2] = vPos.z;
      if (vPos.x < minX) minX = vPos.x;
      if (vPos.y < minY) minY = vPos.y;
      if (vPos.z < minZ) minZ = vPos.z;
      if (vPos.x > maxX) maxX = vPos.x;
      if (vPos.y > maxY) maxY = vPos.y;
      if (vPos.z > maxZ) maxZ = vPos.z;

      if (nrmAttr) {
        vNrm.fromBufferAttribute(nrmAttr, i).applyMatrix3(normMat).normalize();
        outNrm[i * 3]     = vNrm.x;
        outNrm[i * 3 + 1] = vNrm.y;
        outNrm[i * 3 + 2] = vNrm.z;
      } else {
        outNrm[i * 3 + 1] = 1.0;
      }

      if (uvAttr) {
        outUv[i * 2]     = uvAttr.getX(i);
        outUv[i * 2 + 1] = 1.0 - uvAttr.getY(i); // glTF V=0 is top of image
      }
    }

    const posBv = pushBin(outPos, 34962);
    const nrmBv = pushBin(outNrm, 34962);
    const uvBv  = pushBin(outUv,  34962);

    const posAcc = accessors.length;
    accessors.push({
      bufferView: posBv, componentType: 5126, count: count, type: 'VEC3',
      min: [minX, minY, minZ], max: [maxX, maxY, maxZ],
    });
    const nrmAcc = accessors.length;
    accessors.push({ bufferView: nrmBv, componentType: 5126, count: count, type: 'VEC3' });
    const uvAcc = accessors.length;
    accessors.push({ bufferView: uvBv, componentType: 5126, count: count, type: 'VEC2' });

    const matIdx = getOrCreateGltfMat(mesh.material);
    const meshIdx = meshesJson.length;
    meshesJson.push({
      name: mesh.name || `Part_${pIdx}`,
      primitives: [{
        attributes: { POSITION: posAcc, NORMAL: nrmAcc, TEXCOORD_0: uvAcc },
        material: matIdx,
      }],
    });
    nodesJson.push({ name: mesh.name || `Part_${pIdx}`, mesh: meshIdx });

    if (geo !== srcGeo) geo.dispose();
  });

  // Pad BIN chunk to 4-byte boundary
  const binPad = (4 - (binByteLen % 4)) % 4;
  if (binPad > 0) {
    binChunks.push(new Uint8Array(binPad));
    binByteLen += binPad;
  }

  const gltf = {
    asset: { version: '2.0', generator: 'Ganadi 3D Low-Poly Studio' },
    scene: 0,
    scenes: [{ name: modelName, nodes: nodesJson.map((_, idx) => idx) }],
    nodes: nodesJson,
    meshes: meshesJson,
    materials: materials,
    accessors: accessors,
    bufferViews: bufferViews,
    buffers: [{ byteLength: binByteLen }],
  };
  if (imagesJson.length > 0) {
    gltf.images = imagesJson;
    gltf.textures = texturesJson;
    gltf.samplers = samplersJson;
  }

  const jsonStr = JSON.stringify(gltf);
  const enc = new TextEncoder();
  const jsonRaw = enc.encode(jsonStr);
  const jsonPad = (4 - (jsonRaw.byteLength % 4)) % 4;
  const jsonLen = jsonRaw.byteLength + jsonPad;

  const totalLen = 12 + 8 + jsonLen + 8 + binByteLen;
  const outBuf = new ArrayBuffer(totalLen);
  const dv = new DataView(outBuf);
  const outU8 = new Uint8Array(outBuf);

  // GLB Header
  dv.setUint32(0, 0x46546C67, true); // 'glTF'
  dv.setUint32(4, 2, true);          // version 2
  dv.setUint32(8, totalLen, true);

  // JSON Chunk
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4E4F534A, true); // 'JSON'
  outU8.set(jsonRaw, 20);
  for (let i = 0; i < jsonPad; i++) outU8[20 + jsonRaw.byteLength + i] = 0x20;

  // BIN Chunk
  const binHeaderOff = 20 + jsonLen;
  dv.setUint32(binHeaderOff, binByteLen, true);
  dv.setUint32(binHeaderOff + 4, 0x004E4942, true); // 'BIN\0'
  let cursor = binHeaderOff + 8;
  for (let i = 0; i < binChunks.length; i++) {
    outU8.set(binChunks[i], cursor);
    cursor += binChunks[i].byteLength;
  }
  return new Blob([outBuf], { type: 'model/gltf-binary' });
}
