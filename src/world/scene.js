import { THREE } from '../three.js';
import { S, WORLD_HALF, clamp } from '../math.js';
import { OCT_SQUIRCLE, createLowPolyLathe } from '../characters/geometry.js';
import { playSfx } from '../audio.js';
import { createCelMaterial, ensureFlatNormalAttribute } from '../graphics/materials.js';
import { buildPlaza } from './plaza.js';

export function createWorld(worldScene, charScene, mats) {
  // ---- SKY GRADIENT DOME (World Scene) ----
  const skyUniforms = {
    uTop:    { value: new THREE.Color('#9cd7ff') },
    uBottom: { value: new THREE.Color('#e8f7ff') },
  };
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(95, 24, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        varying vec3 vWorldPos;
        void main() {
          float h = clamp(normalize(vWorldPos).y * 1.35 + 0.18, 0.0, 1.0);
          gl_FragColor = vec4(mix(uBottom, uTop, h), 1.0);
        }
      `,
    })
  );
  worldScene.add(skyDome);

  // ---- WORLD MEADOW GROUP (Hidden in Turntable Mode) ----
  const worldMeadowGroup = new THREE.Group();
  worldScene.add(worldMeadowGroup);

  // Sunny Pastel Green Checkerboard Meadow Floor (NearestFilter)
  const floorCvs = document.createElement('canvas');
  floorCvs.width = 64;
  floorCvs.height = 64;
  const fctx = floorCvs.getContext('2d');
  fctx.fillStyle = '#bdf0b5';
  fctx.fillRect(0, 0, 64, 64);
  fctx.fillStyle = '#a8e4a0';
  fctx.fillRect(0, 0, 32, 32);
  fctx.fillRect(32, 32, 32, 32);
  const floorTex = new THREE.CanvasTexture(floorCvs);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(7, 7);
  floorTex.minFilter = THREE.NearestFilter;
  floorTex.magFilter = THREE.NearestFilter;
  floorTex.generateMipmaps = false;

  const floorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD_HALF * 2, 0.7, WORLD_HALF * 2),
    new THREE.MeshBasicMaterial({ map: floorTex })
  );
  floorMesh.position.y = -0.35;
  worldMeadowGroup.add(floorMesh);

  const soilMesh = new THREE.Mesh(
    ensureFlatNormalAttribute(new THREE.BoxGeometry(WORLD_HALF * 2 + 0.02, 0.9, WORLD_HALF * 2 + 0.02), true),
    createCelMaterial('#d6ae85', '#be9369', '#9d744d')
  );
  soilMesh.position.y = -1.14;
  worldMeadowGroup.add(soilMesh);

  // Cozy center cream plaza disc
  const plazaMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.55, 0.04, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff8e6 })
  );
  plazaMesh.position.y = 0.005;
  worldMeadowGroup.add(plazaMesh);

  // Chunky DS-style Low-Poly Pastel Trees around the perimeter (in worldScene)
  const treeTrunkGeo = ensureFlatNormalAttribute(new THREE.CylinderGeometry(0.22, 0.30, 1.3, 6), true);
  const treeCanopy1 = ensureFlatNormalAttribute(new THREE.IcosahedronGeometry(0.84, 0), true);
  const treeCanopy2 = ensureFlatNormalAttribute(new THREE.IcosahedronGeometry(0.56, 0), true);
  // キャラ描画にも木の奥行きを渡す。PS1風の頂点スナップは背景の木と揃える。
  const treeOccluders = new THREE.Group();
  const treeDepthMat = createCelMaterial('#000000', '#000000', '#000000');
  treeDepthMat.colorWrite = false;
  charScene.add(treeOccluders);
  const treeCoords = [
    [-8.4, -8.2, 1.12],
    [ 8.2, -7.8, 1.04],
    [-8.6,  6.0, 0.98],
    [ 8.4,  6.4, 1.08],
    [ 0.2, -9.0, 0.96],
  ];
  const trees = [];
  treeCoords.forEach(([tx, tz, ts]) => {
    const tg = new THREE.Group();
    const tr = new THREE.Mesh(treeTrunkGeo, mats.trunk);
    tr.position.y = 0.65;
    const c1 = new THREE.Mesh(treeCanopy1, mats.leafA);
    c1.position.y = 1.65;
    const c2 = new THREE.Mesh(treeCanopy2, mats.leafB);
    c2.position.set(0.28, 2.15, 0.2);
    const sh = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 18).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x5c8e66, transparent: true, opacity: 0.22, depthWrite: false })
    );
    sh.position.y = 0.02;
    tg.add(tr, c1, c2, sh);
    tg.position.set(tx, 0, tz);
    tg.scale.setScalar(ts);
    worldMeadowGroup.add(tg);
    const occluder = tg.clone(false);
    for (const part of [tr, c1, c2]) {
      const depthMesh = part.clone(false);
      depthMesh.material = treeDepthMat;
      depthMesh.renderOrder = -1;
      occluder.add(depthMesh);
    }
    treeOccluders.add(occluder);
    trees.push({ x: tx, z: tz, r: 0.72 * ts });
  });

  // Scattered Cute Low-Poly Pastel Flowers (in worldScene)
  const flStemGeo = ensureFlatNormalAttribute(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 5), true);
  const flPetalGeo = ensureFlatNormalAttribute(new THREE.OctahedronGeometry(0.09, 0), true);
  const flCenterGeo = ensureFlatNormalAttribute(new THREE.OctahedronGeometry(0.07, 0), true);
  let seed = 4201;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const petalMats = [mats.flPink, mats.flSky, mats.flYellow];
  for (let i = 0; i < 26; i++) {
    const fx = (rand() * 2 - 1) * (WORLD_HALF - 1.3);
    const fz = (rand() * 2 - 1) * (WORLD_HALF - 1.3);
    if (Math.hypot(fx, fz) < 2.9) continue;
    if (Math.hypot(fx + 3.8, fz + 2.4) < 1.6) continue;
    if (Math.hypot(fx - 3.8, fz + 2.8) < 1.6) continue;
    const fg = new THREE.Group();
    const st = new THREE.Mesh(flStemGeo, mats.stemGreen);
    st.position.y = 0.13;
    fg.add(st);
    const pm = petalMats[i % petalMats.length];
    for (let k = 0; k < 4; k++) {
      const ang = (k * Math.PI) / 2;
      const pt = new THREE.Mesh(flPetalGeo, pm);
      pt.position.set(Math.cos(ang) * 0.10, 0.27, Math.sin(ang) * 0.10);
      fg.add(pt);
    }
    const ct = new THREE.Mesh(flCenterGeo, mats.flYellow);
    ct.position.y = 0.29;
    fg.add(ct);
    fg.position.set(fx, 0, fz);
    worldMeadowGroup.add(fg);
  }

  // ---- STUDIO PEDESTAL (Shown only in Turntable Mode, in worldScene) ----
  const studioPedestalGroup = new THREE.Group();
  studioPedestalGroup.visible = false;
  worldScene.add(studioPedestalGroup);
  const pedestalTop = new THREE.Mesh(
    ensureFlatNormalAttribute(new THREE.CylinderGeometry(2.05, 2.2, 0.22, 12), true),
    createCelMaterial('#dce8f4', '#c4d5e7', '#a7bdd5')
  );
  pedestalTop.position.y = -0.11;
  studioPedestalGroup.add(pedestalTop);

  // ---- INTERACTIVE FOREGROUND PROPS (in charScene -> crisp 1px outline!) ----
  const worldPropsGroup = new THREE.Group();
  charScene.add(worldPropsGroup);

  // 1. Low-Poly Bouncy Red-and-White Beach Ball
  const ballGroup = new THREE.Group();
  const ballRadius = 0.34;
  const ballMain = new THREE.Mesh(ensureFlatNormalAttribute(new THREE.IcosahedronGeometry(ballRadius, 1), true), mats.ballRed);
  const ballBand1 = new THREE.Mesh(ensureFlatNormalAttribute(new THREE.TorusGeometry(ballRadius * 0.96, 0.055, 6, 12), true), mats.ballWhite);
  const ballBand2 = new THREE.Mesh(ensureFlatNormalAttribute(new THREE.TorusGeometry(ballRadius * 0.96, 0.055, 6, 12), true), mats.ballWhite);
  ballBand2.rotation.y = Math.PI / 2;
  ballGroup.add(ballMain, ballBand1, ballBand2);
  worldPropsGroup.add(ballGroup);

  const ballShadowMat = new THREE.MeshBasicMaterial({
    color: 0x5c8e66, transparent: true, opacity: 0.26, depthWrite: false,
  });
  const ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(ballRadius * 1.05, 18).rotateX(-Math.PI / 2),
    ballShadowMat
  );
  ballShadow.position.y = 0.025;
  worldMeadowGroup.add(ballShadow);

  const ballState = {
    pos: new THREE.Vector3(2.8, ballRadius, 2.0),
    vel: new THREE.Vector3(0, 0, 0),
    radius: ballRadius,
  };
  ballGroup.position.copy(ballState.pos);

  // 2. Low-Poly Bouncy Pink Cushion Trampoline
  const cushionGroup = new THREE.Group();
  const cushBase = new THREE.Mesh(
    createLowPolyLathe([
      { y: -4.0, sx: 0.78, sz: 0.78 },
      { y:  0.0, sx: 1.00, sz: 1.00 },
      { y:  3.6, sx: 0.88, sz: 0.88 },
    ], OCT_SQUIRCLE, 15.5, 15.5),
    mats.cushSide
  );
  cushBase.position.y = 3.2 * S;
  const cushTop = new THREE.Mesh(
    createLowPolyLathe([
      { y: -1.6, sx: 0.96, sz: 0.96 },
      { y:  1.8, sx: 0.82, sz: 0.82 },
    ], OCT_SQUIRCLE, 13.5, 13.5),
    mats.cushTop
  );
  cushTop.position.y = 5.4 * S;
  cushionGroup.add(cushBase, cushTop);
  cushionGroup.position.set(-3.8, 0, -2.4);
  worldPropsGroup.add(cushionGroup);

  const cushShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.92, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x5c8e66, transparent: true, opacity: 0.25, depthWrite: false })
  );
  cushShadow.position.set(-3.8, 0.024, -2.4);
  worldMeadowGroup.add(cushShadow);

  const cushionState = {
    pos: cushionGroup.position.clone(),
    radius: 0.82,
    squash: 0,
  };

  // 3. Low-Poly Steaming 3D Bowl of White Rice (白いごはん / 쌀밥!)
  const riceGroup = new THREE.Group();
  const bowlFoot = new THREE.Mesh(ensureFlatNormalAttribute(new THREE.CylinderGeometry(0.26, 0.24, 0.12, 8), true), mats.bowlBlue);
  bowlFoot.position.y = 0.06;
  const bowlBody = new THREE.Mesh(ensureFlatNormalAttribute(new THREE.CylinderGeometry(0.46, 0.27, 0.34, 8), true), mats.riceWhite);
  bowlBody.position.y = 0.28;
  const bowlRim = new THREE.Mesh(ensureFlatNormalAttribute(new THREE.TorusGeometry(0.45, 0.045, 5, 8), true), mats.bowlBlue);
  bowlRim.rotation.x = Math.PI / 2;
  bowlRim.position.y = 0.42;
  const riceMound = new THREE.Mesh(
    createLowPolyLathe([
      { y: -4.2, sx: 0.95, sz: 0.95 },
      { y:  1.2, sx: 0.88, sz: 0.88 },
      { y:  5.2, sx: 0.46, sz: 0.46 },
    ], OCT_SQUIRCLE, 8.2, 8.2),
    mats.riceWhite
  );
  riceMound.position.y = 0.50;
  riceGroup.add(bowlFoot, bowlBody, bowlRim, riceMound);
  riceGroup.position.set(3.8, 0, -2.8);
  worldPropsGroup.add(riceGroup);

  const riceShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 18).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x5c8e66, transparent: true, opacity: 0.25, depthWrite: false })
  );
  riceShadow.position.set(3.8, 0.024, -2.8);
  worldMeadowGroup.add(riceShadow);

  const riceState = {
    pos: riceGroup.position.clone(),
    radius: 0.54,
    cooldown: 0,
    hop: 0,
  };
  const plaza = buildPlaza(worldPropsGroup, mats);

  // Rising steam puffs above white rice bowl
  const steamPuffs = [];
  const steamGeo = new THREE.SphereGeometry(0.085, 8, 8);
  for (let i = 0; i < 4; i++) {
    const sm = new THREE.Mesh(steamGeo, mats.steam);
    worldMeadowGroup.add(sm);
    steamPuffs.push({ mesh: sm, phase: i * 0.25 });
  }

  // Sparkle star particles (burst when Ganadi approaches white rice!)
  const sparkles = [];
  const sparkleGeo = new THREE.OctahedronGeometry(0.11, 0);
  function spawnRiceSparkles(origin) {
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(sparkleGeo, mats.sparkle);
      const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
      const spd = 1.4 + Math.random() * 2.0;
      m.position.set(origin.x, origin.y + 0.85, origin.z);
      worldPropsGroup.add(m);
      sparkles.push({
        mesh: m,
        vx: Math.cos(ang) * spd,
        vy: 2.8 + Math.random() * 2.4,
        vz: Math.sin(ang) * spd,
        life: 0.75 + Math.random() * 0.35,
        maxLife: 1.0,
      });
    }
  }

  const { x: benchX, z: benchZ } = plaza.bench.position;
  const obstacles = [...trees,
    ...[-1.32, 0, 1.32].map((offset) => ({ x: benchX + offset, z: benchZ, r: .75 })),
    { x: benchX, z: benchZ + 1.2, r: 1.1 },
    { x: plaza.snackTable.position.x, z: plaza.snackTable.position.z, r: .59 },
  ];

  function setMode(mode) {
    const isWorld = mode === 'world';
    worldMeadowGroup.visible = isWorld;
    worldPropsGroup.visible = isWorld;
    treeOccluders.visible = isWorld;
    studioPedestalGroup.visible = !isWorld;
    skyUniforms.uTop.value.set(isWorld ? '#9cd7ff' : '#98b4d3');
    skyUniforms.uBottom.value.set(isWorld ? '#e8f7ff' : '#b0c6df');
  }

  function updateProps(dt, timeSec) {
    // Beach Ball Physics
    ballState.pos.x += ballState.vel.x * dt;
    ballState.pos.z += ballState.vel.z * dt;
    if (ballState.pos.y > ballState.radius || ballState.vel.y !== 0) {
      ballState.vel.y -= 20.0 * dt;
      ballState.pos.y += ballState.vel.y * dt;
      if (ballState.pos.y <= ballState.radius) {
        ballState.pos.y = ballState.radius;
        if (Math.abs(ballState.vel.y) > 1.2) {
          ballState.vel.y = -ballState.vel.y * 0.62;
          playSfx('kick');
        } else {
          ballState.vel.y = 0;
        }
      }
    }
    const bDrag = ballState.pos.y <= ballState.radius + 0.05 ? Math.pow(0.24, dt) : Math.pow(0.84, dt);
    ballState.vel.x *= bDrag;
    ballState.vel.z *= bDrag;
    const bLim = WORLD_HALF - ballState.radius - 0.3;
    if (ballState.pos.x < -bLim) { ballState.pos.x = -bLim; ballState.vel.x = Math.abs(ballState.vel.x) * 0.78; }
    if (ballState.pos.x >  bLim) { ballState.pos.x =  bLim; ballState.vel.x = -Math.abs(ballState.vel.x) * 0.78; }
    if (ballState.pos.z < -bLim) { ballState.pos.z = -bLim; ballState.vel.z = Math.abs(ballState.vel.z) * 0.78; }
    if (ballState.pos.z >  bLim) { ballState.pos.z =  bLim; ballState.vel.z = -Math.abs(ballState.vel.z) * 0.78; }

    ballGroup.position.copy(ballState.pos);
    ballGroup.rotation.z -= ballState.vel.x * dt * 2.2;
    ballGroup.rotation.x += ballState.vel.z * dt * 2.2;
    const bH = clamp(1.0 - (ballState.pos.y - ballState.radius) * 0.16, 0.45, 1.0);
    ballShadow.position.set(ballState.pos.x, 0.025, ballState.pos.z);
    ballShadow.scale.setScalar(bH);
    ballShadowMat.opacity = 0.26 * bH;

    // Cushion squash & Rice hop + steam + sparkle particles
    cushionState.squash *= Math.pow(0.004, dt);
    const sq = cushionState.squash;
    cushionGroup.scale.set(1 + sq * 0.22, 1 - sq * 0.44, 1 + sq * 0.22);

    if (riceState.cooldown > 0) riceState.cooldown -= dt;
    riceState.hop *= Math.pow(0.004, dt);
    riceGroup.position.y = riceState.hop;

    for (let i = 0; i < steamPuffs.length; i++) {
      const sp = steamPuffs[i];
      const p = (timeSec * 0.65 + sp.phase) % 1.0;
      sp.mesh.position.set(
        riceState.pos.x + Math.sin(timeSec * 2.4 + i * 2.0) * 0.15,
        0.82 + p * 0.85,
        riceState.pos.z + Math.cos(timeSec * 2.0 + i * 2.0) * 0.15
      );
      sp.mesh.scale.setScalar((1.0 - p) * 0.9 + 0.12);
    }

    for (let i = sparkles.length - 1; i >= 0; i--) {
      const sk = sparkles[i];
      sk.life -= dt;
      if (sk.life <= 0) {
        worldPropsGroup.remove(sk.mesh);
        sparkles.splice(i, 1);
        continue;
      }
      sk.vy -= 9.5 * dt;
      sk.mesh.position.x += sk.vx * dt;
      sk.mesh.position.y += sk.vy * dt;
      sk.mesh.position.z += sk.vz * dt;
      sk.mesh.rotation.y += dt * 7;
      sk.mesh.rotation.x += dt * 5;
      sk.mesh.scale.setScalar(clamp(sk.life / sk.maxLife, 0.05, 1.0));
    }
  }

  return {
    worldPropsGroup, treeOccluders, plaza, obstacles,
    ballState, cushionState, riceState, spawnRiceSparkles, setMode, updateProps,
  };
}
