import { THREE } from '../three.js';
import { S, RAD, clamp } from '../math.js';
import { HEAD_LOCAL_CY, HEAD_PIVOT_Y, HEAD_RY, FLOOR_POSES } from './design.js';
import { getFaceMaterial } from './faces.js';

export class StudioCharacter {
  constructor(character, assets, worldScene, charScene, isPlayer = false, initialStyle = 'lowpoly') {
    this.character = character;
    this.emotes = character.emotes;
    this.isGonyani = character.id === 'gonyani';
    this.assets = assets;
    this.isPlayer = isPlayer;
    this.styleMode = initialStyle;
    this.wireframeOn = false;
    this.swappableParts = [];
    this.wireOverlays = [];
    const { mats, lowGeos, smoothGeos } = assets;
    const geos = initialStyle === 'smooth' ? smoothGeos : lowGeos;

    // Root in foreground charScene (gets spotless cel shading + 1px outline)
    this.root = new THREE.Group();
    this.root.name = character.id;
    charScene.add(this.root);

    // Helper to create a named part mesh that swaps cleanly between Low-Poly & Smooth
    const makePart = (name, lowKey, smoothKey, mat) => {
      const mesh = new THREE.Mesh(
        initialStyle === 'smooth' ? smoothGeos[smoothKey] : lowGeos[lowKey],
        mat
      );
      mesh.name = name;
      this.swappableParts.push({ mesh, lowKey, smoothKey });

      if (isPlayer) {
        const wire = new THREE.Mesh(mesh.geometry, mats.wireframe);
        wire.userData.isWireframe = true;
        wire.scale.setScalar(1.008);
        wire.visible = false;
        mesh.add(wire);
        this.wireOverlays.push({ wire, parent: mesh });
      }
      return mesh;
    };

    // Soft elliptical ground shadow disc in worldScene (zero shadow acne!)
    const shGeo = new THREE.CircleGeometry(1, 20);
    shGeo.rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({
      color: 0x5d8d66,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(shGeo, this.shadowMat);
    this.shadowMesh.position.y = 0.025;
    worldScene.add(this.shadowMesh);

    // Main body container (bobs/tilts cleanly)
    this.bodyGroup = new THREE.Group();
    this.root.add(this.bodyGroup);

    // ---- BIPEDAL BODY GROUP ----
    this.bipedGroup = new THREE.Group();
    this.bodyGroup.add(this.bipedGroup);

    this.bipedTorso = makePart('Torso', 'torsoBiped', 'torsoBiped', mats.fur);
    this.bipedTorso.position.set(0, 11.4 * S, -0.7 * S);
    this.bipedGroup.add(this.bipedTorso);

    // Articulated Arms at shoulder pivots (±7.2, 16.8, 1.5)
    this.armLPivot = new THREE.Group();
    this.armLPivot.position.set(-6.8 * S, 16.8 * S, 2.2 * S);
    const armLMesh = makePart('Arm_L', 'arm', 'arm', mats.fur);
    armLMesh.position.set(-1.1 * S, -3.5 * S, 0.3 * S);
    this.armLPivot.add(armLMesh);
    this.bipedGroup.add(this.armLPivot);

    this.armRPivot = new THREE.Group();
    this.armRPivot.position.set(6.8 * S, 16.8 * S, 2.2 * S);
    const armRMesh = makePart('Arm_R', 'arm', 'arm', mats.fur);
    armRMesh.position.set(1.1 * S, -3.5 * S, 0.3 * S);
    this.armRPivot.add(armRMesh);
    this.bipedGroup.add(this.armRPivot);

    // Articulated Feet at hip pivots (±2.9, 4.4, 1.8)
    this.footLPivot = new THREE.Group();
    this.footLPivot.position.set(-2.14 * S, 4.4 * S, 1.8 * S);
    const footLMesh = makePart('Foot_L', 'foot', 'foot', mats.fur);
    footLMesh.position.set(0, -2.1 * S, 0.3 * S);
    this.footLPivot.add(footLMesh);
    this.bipedGroup.add(this.footLPivot);

    this.footRPivot = new THREE.Group();
    this.footRPivot.position.set(2.14 * S, 4.4 * S, 1.8 * S);
    const footRMesh = makePart('Foot_R', 'foot', 'foot', mats.fur);
    footRMesh.position.set(0, -2.1 * S, 0.3 * S);
    this.footRPivot.add(footRMesh);
    this.bipedGroup.add(this.footRPivot);

    if (this.isGonyani) {
      this.armLPivot.position.x = -5.65 * S;
      this.armRPivot.position.x = 5.65 * S;
      armLMesh.position.x = -.6 * S;
      armRMesh.position.x = .6 * S;
      armLMesh.scale.set(1.0, .75, .85);
      armRMesh.scale.copy(armLMesh.scale);
      this.footLPivot.position.x = -1.8 * S;
      this.footRPivot.position.x = 1.8 * S;
      footLMesh.scale.set(.88, 1.0, .85);
      footRMesh.scale.copy(footLMesh.scale);
    }

    // ---- QUADRUPED (4-LEGGED PUPPY) BODY GROUP ----
    this.quadGroup = new THREE.Group();
    this.quadGroup.visible = false;
    this.bodyGroup.add(this.quadGroup);

    this.quadTorso = makePart('QuadTorso', 'torsoQuad', 'torsoQuad', mats.fur);
    this.quadTorso.position.set(0, 10.6 * S, -1.5 * S);
    this.quadGroup.add(this.quadTorso);

    this.qLegs = [];
    const qLegNames = ['Leg_FL', 'Leg_FR', 'Leg_BL', 'Leg_BR'];
    const qLegCoords = [
      [-4.6, 6.2,  5.6],
      [ 4.6, 6.2,  5.6],
      [-4.6, 6.2, -7.2],
      [ 4.6, 6.2, -7.2],
    ];
    qLegCoords.forEach(([lx, ly, lz], idx) => {
      const pv = new THREE.Group();
      pv.position.set(lx * S, ly * S, lz * S);
      const lm = makePart(qLegNames[idx], 'legQuad', 'legQuad', mats.fur);
      lm.position.set(0, -2.6 * S, 0.4 * S);
      pv.add(lm);
      this.quadGroup.add(pv);
      this.qLegs.push(pv);
    });

    if (!this.isGonyani) {
      this.mochiMesh = makePart('Mochi_Torso', 'torsoMochi', 'torsoMochi', mats.fur);
      this.mochiMesh.visible = false;
      this.bodyGroup.add(this.mochiMesh);
      for (const side of [-1, 1]) {
        const paw = makePart(side < 0 ? 'Mochi_Paw_L' : 'Mochi_Paw_R', 'arm', 'arm', mats.fur);
        paw.scale.set(.72, .54, .64);
        paw.position.set(side * .227, .733, .384);
        paw.rotation.z = side * .87;
        this.mochiMesh.add(paw);
      }
    }

    // ---- CURLED FLUFFY TAIL (1-piece low-poly vs 3-puff smooth) ----
    this.tailPivot = new THREE.Group();
    this.tailPivot.position.set(0.3 * S, 8.0 * S, -7.9 * S);

    this.tailMesh = makePart('Tail', 'tailSingle', 'tailSingle', mats.fur);
    this.tailMesh.visible = this.isGonyani || initialStyle !== 'smooth';
    this.tailPivot.add(this.tailMesh);

    this.tailSmoothGroup = new THREE.Group();
    this.tailSmoothGroup.visible = !this.isGonyani && initialStyle === 'smooth';
    const t1 = new THREE.Mesh(smoothGeos.tail1, mats.fur);
    t1.name = 'Tail_Base'; t1.position.set(0, .55 * S, -1.1 * S);
    const t2 = new THREE.Mesh(smoothGeos.tail2, mats.fur);
    t2.name = 'Tail_Mid';  t2.position.set(.45 * S, 1.95 * S, -2.35 * S);
    const t3 = new THREE.Mesh(smoothGeos.tail3, mats.fur);
    t3.name = 'Tail_Tip';  t3.position.set(.70 * S, 3.60 * S, -2.68 * S);
    this.tailSmoothGroup.add(t1, t2, t3);
    this.tailPivot.add(this.tailSmoothGroup);
    this.bodyGroup.add(this.tailPivot);

    // ---- BACK WINGS (Angel & Devil) ----
    this.angelWingsGroup = new THREE.Group();
    this.angelWingsGroup.position.set(0, 14.0 * S, -8.6 * S);
    this.angelWingsGroup.visible = false;
    [-1, 1].forEach((side) => {
      const wPv = new THREE.Group();
      wPv.position.set(side * 2.5 * S, 0, 0);
      const tag = side < 0 ? 'L' : 'R';
      const l1 = makePart(`AngelWing1_${tag}`, 'angelWingLobe1', 'angelWingLobe1', mats.angelWing);
      l1.position.set(side * 4.4 * S, 0.8 * S, -0.5 * S);
      l1.rotation.z = side * 0.25;
      const l2 = makePart(`AngelWing2_${tag}`, 'angelWingLobe2', 'angelWingLobe2', mats.angelWing);
      l2.position.set(side * 7.2 * S, 2.6 * S, -0.8 * S);
      l2.rotation.z = side * 0.45;
      wPv.add(l1, l2);
      this.angelWingsGroup.add(wPv);
    });
    this.bodyGroup.add(this.angelWingsGroup);

    this.devilWingsGroup = new THREE.Group();
    this.devilWingsGroup.position.set(0, 14.0 * S, -8.6 * S);
    this.devilWingsGroup.visible = false;
    [-1, 1].forEach((side) => {
      const wPv = new THREE.Group();
      wPv.position.set(side * 2.4 * S, 0, 0);
      const tag = side < 0 ? 'L' : 'R';
      const bm = makePart(`DevilWing1_${tag}`, 'batWingMain', 'batWingMain', mats.batWing);
      bm.position.set(side * 4.8 * S, 1.0 * S, -0.5 * S);
      bm.rotation.z = side * 0.32;
      const bt = makePart(`DevilWing2_${tag}`, 'batWingTip', 'batWingTip', mats.batWing);
      bt.position.set(side * 8.4 * S, 3.0 * S, -0.7 * S);
      bt.rotation.z = -side * 0.9;
      wPv.add(bm, bt);
      this.devilWingsGroup.add(wPv);
    });
    this.bodyGroup.add(this.devilWingsGroup);

    // ---- ARTICULATED HEAD GROUP (Neck pivot at y = 20.5) ----
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, HEAD_PIVOT_Y * S, 0);
    this.bodyGroup.add(this.headPivot);

    // イラストの顔に合わせて、あごの高さを基準に頭の縦だけを少し詰める。
    const headShape = new THREE.Group();
    const chinY = (HEAD_LOCAL_CY - HEAD_RY) * S;
    headShape.scale.y = this.isGonyani ? 1 : .958;
    headShape.position.y = chinY * (1 - headShape.scale.y);
    this.headPivot.add(headShape);

    // 頭と、表面に沿った表情。
    this.headMesh = makePart('Head', 'head', 'head', mats.fur);
    this.headMesh.position.set(0, HEAD_LOCAL_CY * S, 0);
    headShape.add(this.headMesh);

    this.currentFace = this.emotes[0].face;
    this.faceMesh = new THREE.Mesh(geos.facePatch, getFaceMaterial(this.currentFace, initialStyle));
    this.faceMesh.name = 'Face';
    this.swappableParts.push({ mesh: this.faceMesh, lowKey: 'facePatch', smoothKey: 'facePatch' });
    headShape.add(this.faceMesh);

    // Asymmetric Floppy Puppy Ears (children of Head, drooping down & folding slightly forward!)
    this.earLPivot = new THREE.Group();
    this.earLPivot.position.set(-10.25 * S, (41.5 - HEAD_PIVOT_Y) * S, 3.55 * S);
    const earLMesh = makePart('Ear_L', 'earL', 'earL', mats.fur);
    earLMesh.position.set(-1.88 * S, -2.05 * S, 1.29 * S);
    earLMesh.rotation.set(-8 * RAD, 0, -21 * RAD);
    this.earLPivot.add(earLMesh);
    headShape.add(this.earLPivot);

    this.earRPivot = new THREE.Group();
    this.earRPivot.position.set(10.25 * S, (42.02 - HEAD_PIVOT_Y) * S, 3.4 * S);
    const earRMesh = makePart('Ear_R', 'earR', 'earR', mats.fur);
    earRMesh.position.set(1.89 * S, -1.66 * S, 1.27 * S);
    earRMesh.rotation.set(-8 * RAD, -4 * RAD, 25 * RAD);
    this.earRPivot.add(earRMesh);
    headShape.add(this.earRPivot);

    if (this.isGonyani) {
      this.earLPivot.position.set(-10.7 * S, 16.8 * S, .10 * S);
      this.earRPivot.position.set(10.7 * S, 16.8 * S, .10 * S);
      earLMesh.position.set(0, 0, 0);
      earRMesh.position.set(0, 0, 0);
      earLMesh.rotation.set(.12, 0, .76);
      earRMesh.rotation.set(.12, 0, -.76);
    }

    // ---- HEAD 3D PROPS (Halo / Horns / Rose) ----
    this.haloMesh = makePart('Halo', 'halo', 'halo', mats.halo);
    this.haloMesh.rotation.x = Math.PI / 2;
    this.haloMesh.position.set(0, (49.2 - HEAD_PIVOT_Y) * S, -0.4 * S);
    this.haloMesh.visible = false;
    this.headPivot.add(this.haloMesh);

    this.devilHornsGroup = new THREE.Group();
    this.devilHornsGroup.visible = false;
    [-1, 1].forEach((side) => {
      const h = makePart(`DevilHorn_${side < 0 ? 'L' : 'R'}`, 'devilHorn', 'devilHorn', mats.devilHorn);
      h.position.set(side * 6.5 * S, (47.0 - HEAD_PIVOT_Y) * S, 1.0 * S);
      h.rotation.z = -side * 0.34;
      h.rotation.x = 0.14;
      this.devilHornsGroup.add(h);
    });
    this.headPivot.add(this.devilHornsGroup);

    this.roseGroup = new THREE.Group();
    this.roseGroup.position.set(0.6 * S, (26.6 - HEAD_PIVOT_Y) * S, 11.4 * S);
    this.roseGroup.visible = false;
    const rStem = makePart('Rose_Stem', 'roseStem', 'roseStem', mats.stemGreen);
    rStem.position.set(3.4 * S, 0.2 * S, 3.4 * S);
    rStem.rotation.set(Math.PI / 2 - 0.14, 0, -0.78);
    const rLeaf = makePart('Rose_Leaf', 'roseLeaf', 'roseLeaf', mats.stemGreen);
    rLeaf.position.set(3.2 * S, -0.5 * S, 3.6 * S);
    rLeaf.rotation.set(0.2, 0.5, -0.4);
    const rBloom = makePart('Rose_Bloom', 'roseBloom', 'roseBloom', mats.roseRed);
    rBloom.position.set(7.0 * S, 0.8 * S, 6.8 * S);
    this.roseGroup.add(rStem, rLeaf, rBloom);
    this.headPivot.add(this.roseGroup);

    // Physics & animation state
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.onGround = true;
    this.quadMode = false;
    this.quadBlend = 0;
    this.sprinting = false;
    this.activeEmote = 'normal';
    this.emoteAge = 0;
    this.petFor = 0;
    this.cheekLean = null;
    this.floorPose = false;
    this.renderPose = 'idle';
    this.animPhase = Math.random() * 10;

    // Autonomous AI state (for spawned crowd Ganadis)
    this.aiTimer = 0.5 + Math.random() * 2.0;
    this.aiTargetYaw = Math.random() * Math.PI * 2;
    this.aiMode = 'chaseBall';
  }

  setStyle(styleMode) {
    this.styleMode = styleMode;
    this.faceMesh.material = getFaceMaterial(this.currentFace, styleMode);
    const isSmooth = (styleMode === 'smooth');
    const { lowGeos, smoothGeos } = this.assets;
    for (let i = 0; i < this.swappableParts.length; i++) {
      const item = this.swappableParts[i];
      item.mesh.geometry = isSmooth ? smoothGeos[item.smoothKey] : lowGeos[item.lowKey];
    }
    this.tailMesh.visible = this.isGonyani || !isSmooth;
    this.tailSmoothGroup.visible = !this.isGonyani && isSmooth;
    for (let i = 0; i < this.wireOverlays.length; i++) {
      const ov = this.wireOverlays[i];
      ov.wire.geometry = ov.parent.geometry;
    }
  }

  setWireframe(enabled) {
    this.wireframeOn = enabled;
    for (let i = 0; i < this.wireOverlays.length; i++) {
      this.wireOverlays[i].wire.visible = enabled;
    }
  }

  getTriangleCount() {
    const pose = this.renderPose;
    const body = pose === 'mochi' ? this.mochiMesh
      : (FLOOR_POSES.has(pose) || (this.quadMode && pose !== 'perch' && pose !== 'cheek') ? this.quadGroup : this.bipedGroup);
    let tris = 0;
    const countTree = (obj) => {
      if (obj === this.tailPivot && pose === 'mochi') return;
      if (obj !== body && (!obj.visible || obj === this.bipedGroup || obj === this.quadGroup || obj === this.mochiMesh)) return;
      if (obj.isMesh && !obj.userData.isWireframe && obj.geometry) {
        const g = obj.geometry;
        tris += g.index ? (g.index.count / 3) : (g.attributes.position.count / 3);
      }
      for (let i = 0; i < obj.children.length; i++) {
        countTree(obj.children[i]);
      }
    };
    countTree(this.root);
    return Math.round(tris);
  }

  setFace(faceId) {
    if (this.currentFace === faceId) return;
    this.currentFace = faceId;
    this.faceMesh.material = getFaceMaterial(faceId, this.styleMode);
  }

  setProp(propType) {
    this.haloMesh.visible = (propType === 'angel');
    this.angelWingsGroup.visible = (propType === 'angel');
    this.devilHornsGroup.visible = (propType === 'devil');
    this.devilWingsGroup.visible = (propType === 'devil');
    this.roseGroup.visible = (propType === 'rose');
  }

  setEmote(emoteId) {
    const em = this.emotes.find((emote) => emote.id === emoteId) || this.emotes[0];
    this.activeEmote = em.id;
    this.emoteAge = 0;
    this.setFace(em.face);
    this.setProp(em.prop);
  }

  setVisible(v) {
    this.root.visible = v;
    this.shadowMesh.visible = v;
  }

  dispose(worldScene, charScene) {
    charScene.remove(this.root);
    worldScene.remove(this.shadowMesh);
    this.shadowMesh.geometry.dispose();
    this.shadowMat.dispose();
  }

  updateAnimation(dt, speed, sprinting, isStudioMode, perched = false) {
    const paired = this.cheekLean !== null;
    const qTarget = this.quadMode && !perched && !paired ? 1 : 0;
    this.quadBlend += (qTarget - this.quadBlend) * (perched ? 1 : Math.min(1, dt * 11));
    if (Math.abs(qTarget - this.quadBlend) < .002) this.quadBlend = qTarget;
    const qb = this.quadBlend;
    this.sprinting = sprinting;

    const moving = speed > 0.25;
    const rate = moving ? (sprinting ? 14.5 : 9.8) : 3.4;
    this.animPhase += dt * rate;
    const t = this.animPhase;
    const s = Math.sin(t);
    const c = Math.cos(t);

    const em = this.emotes.find((emote) => emote.id === this.activeEmote) || this.emotes[0];
    let pose = em.pose;
    if (perched) pose = 'perch';
    else if (paired) pose = 'cheek';
    else if (moving) pose = sprinting ? 'run' : 'walk';
    else if (!this.onGround) pose = 'jump';
    const floorPose = FLOOR_POSES.has(pose);
    const mochi = pose === 'mochi';
    const changedForm = floorPose !== this.floorPose || mochi !== (this.renderPose === 'mochi')
      || (floorPose && this.isGonyani && pose !== this.renderPose)
      || perched !== (this.renderPose === 'perch') || paired !== (this.renderPose === 'cheek');
    this.renderPose = pose;
    this.floorPose = floorPose;
    this.emoteAge += dt;
    this.petFor = Math.max(0, this.petFor - dt);

    // 歩行リグの切り替えとは独立して、休んでいる姿勢では胴体を置き直す。
    this.bipedGroup.visible = !floorPose && !mochi && qb < .96;
    this.quadGroup.visible = !mochi && (floorPose || qb > .04);
    this.bipedGroup.scale.setScalar(Math.max(.001, 1 - qb));
    this.quadGroup.scale.setScalar(floorPose ? 1 : Math.max(.001, qb));
    if (this.mochiMesh) this.mochiMesh.visible = mochi;

    // Automatic expression override while sprinting/jumping (respecting active emote when idle)
    if (this.isGonyani) {
      this.setFace(pose === 'jump' || (moving && em.pose === 'sleep') ? this.emotes[0].face : em.face);
    } else if (!this.onGround) {
      this.setFace(this.vel.y >= 0 ? 'happy' : 'normal');
    } else if (moving && sprinting) {
      this.setFace('happy');
    } else if (moving) {
      this.setFace((em.face === 'sleep' || em.face === 'geso') ? 'normal' : em.face);
    } else {
      this.setFace(em.face);
    }

    // Joint targets
    let bodyY = 0;
    let bodyPitch = 0, bodyRoll = 0;
    let headPitch = 0, headRoll = 0, headYaw = 0;
    let armLP = 0, armRP = 0, armLZ = -0.18, armRZ = 0.18;
    let footLP = 0, footRP = 0;
    let earLFlap = 0, earRFlap = 0, earBack = 0;
    let tailWag = s * 0.26, tailPitch = 0;

    if (pose === 'idle') {
      bodyY = Math.sin(t) * 0.45 * S;
      earLFlap = Math.sin(t) * 0.05;
      earRFlap = Math.sin(t) * 0.05;
    } else if (pose === 'stare') {
      headYaw = .14;
      tailWag = Math.sin(t * .7) * .08;
    } else if (pose === 'cheek') {
      const { side, amount } = this.cheekLean;
      const lean = side * amount;
      bodyRoll = (this.isGonyani ? -.065 : -.13) * lean;
      headRoll = (this.isGonyani ? -.20 : -.10) * lean;
      headYaw = (this.isGonyani ? -.32 : .29) * lean;
      headPitch = -.045 * amount;
      tailWag = Math.sin(t * 1.15) * (this.isGonyani ? .07 : .29);
      if (this.isGonyani) this.setFace('gonyani-stare');
    } else if (pose === 'wary') {
      bodyY = -.65 * S;
      bodyPitch = .14;
      headPitch = -.09;
      earLFlap = -.57; earRFlap = -.57;
      tailPitch = -.19;
      tailWag = Math.sin(t * 2.4) * .18;
    } else if (pose === 'walk') {
      bodyY = Math.abs(s) * 0.9 * S;
      bodyRoll = s * 0.07;
      bodyPitch = 0.06;
      headRoll = -s * 0.04;
      armLP = s * 0.65;
      armRP = -s * 0.65;
      footLP = -s * 0.62;
      footRP = s * 0.62;
      earLFlap = Math.abs(s) * 0.14;
      earRFlap = Math.abs(c) * 0.14;
      tailWag = s * 0.48;
    } else if (pose === 'run') {
      bodyY = Math.abs(s) * 1.45 * S;
      bodyPitch = 0.19;
      bodyRoll = s * 0.10;
      headPitch = -0.10;
      armLP = s * 0.98;
      armRP = -s * 0.98;
      armLZ = -0.32; armRZ = 0.32;
      footLP = -s * 0.95;
      footRP = s * 0.95;
      earBack = -0.28;
      earLFlap = 0.22 + Math.abs(s) * 0.18;
      earRFlap = 0.22 + Math.abs(c) * 0.18;
      tailWag = s * 0.56;
    } else if (pose === 'jump') {
      const rising = this.vel.y >= 0;
      bodyPitch = rising ? -0.09 : 0.10;
      armLP = -0.5; armRP = -0.5;
      armLZ = rising ? -1.45 : -0.85;
      armRZ = rising ? 1.45 : 0.85;
      footLP = rising ? 0.25 : -0.25;
      footRP = rising ? -0.25 : 0.25;
      earLFlap = rising ? -0.10 : 0.42;
      earRFlap = rising ? -0.10 : 0.42;
    } else if (pose === 'hug') {
      bodyY = Math.sin(t) * 0.35 * S;
      headPitch = -0.08;
      headRoll = Math.sin(t) * 0.07;
      armLP = -1.25; armRP = -1.25;
      armLZ = -0.55; armRZ = 0.55;
      tailWag = Math.sin(t * 2.0) * 0.42;
    } else if (pose === 'du') {
      headPitch = 0.08;
      headRoll = -0.09 + Math.sin(t * 2.6) * 0.03;
      armLP = -0.35; armRP = -0.35;
      armLZ = -0.20; armRZ = 0.20;
      earLFlap = -0.12; earRFlap = -0.10;
      tailPitch = -0.22;
    } else if (pose === 'cry') {
      bodyY = Math.abs(s) * 0.55 * S;
      headPitch = -0.06;
      headRoll = Math.sin(t * 2.6) * 0.12;
      armLP = -0.75 + Math.sin(t * 2.6) * 0.38;
      armRP = -0.75 - Math.sin(t * 2.6) * 0.38;
      armLZ = -1.15; armRZ = 1.15;
      footLP = Math.sin(t * 2.6) * 0.28;
      footRP = -Math.sin(t * 2.6) * 0.28;
    } else if (pose === 'geso') {
      bodyY = -0.5 * S;
      bodyPitch = 0.11;
      headPitch = 0.15;
      headRoll = 0.12;
      armLZ = -0.04; armRZ = 0.04;
      earLFlap = -0.20; earRFlap = -0.18;
      tailPitch = -0.30;
      tailWag = 0;
    } else if (pose === 'dance') {
      bodyY = Math.abs(Math.sin(t * 1.8)) * 1.3 * S;
      bodyRoll = Math.sin(t * 1.8) * 0.14;
      headRoll = Math.sin(t * 1.8) * 0.12;
      headYaw = Math.sin(t * 1.8) * 0.10;
      armLZ = -0.55 - Math.max(0, Math.sin(t * 1.8)) * 1.15;
      armRZ = 0.55 + Math.max(0, -Math.sin(t * 1.8)) * 1.15;
      armLP = -0.35; armRP = -0.35;
      earLFlap = 0.18 + Math.sin(t * 1.8) * 0.16;
      earRFlap = 0.18 - Math.sin(t * 1.8) * 0.16;
      tailWag = Math.sin(t * 2.6) * 0.52;
    } else if (pose === 'fierce') {
      bodyY = Math.abs(Math.sin(t * 2.2)) * 0.65 * S;
      bodyPitch = 0.14;
      headPitch = -0.08;
      headRoll = Math.sin(t * 2.4) * 0.07;
      armLP = -1.0; armRP = -1.0;
      armLZ = -1.15; armRZ = 1.15;
      earLFlap = 0.28; earRFlap = 0.28;
    } else if (pose === 'angel') {
      bodyY = (1.8 + Math.sin(t * 1.4) * 0.9) * S;
      headRoll = Math.sin(t * 1.2) * 0.06;
      armLP = -0.45; armRP = -0.45;
      armLZ = -0.65; armRZ = 0.65;
      earLFlap = 0.12 + Math.sin(t * 1.4) * 0.08;
      earRFlap = 0.12 + Math.sin(t * 1.4) * 0.08;
    } else if (pose === 'devil') {
      bodyY = Math.sin(t * 1.6) * 0.5 * S;
      bodyPitch = 0.07;
      headPitch = -0.06;
      headRoll = Math.sin(t * 1.4) * 0.08;
      armLP = -0.7; armRP = -0.7;
      armLZ = -0.65; armRZ = 0.65;
      earLFlap = 0.16; earRFlap = 0.16;
      tailWag = Math.sin(t * 2.3) * 0.45;
    } else if (pose === 'rose') {
      bodyRoll = Math.sin(t * 0.8) * 0.04;
      headRoll = 0.11;
      headPitch = -0.05;
      armLP = -0.75; armLZ = -0.58;
      armRP = -0.15; armRZ = 0.18;
    } else if (pose === 'sit' || pose === 'perch') {
      bodyY = (perched ? -3.4 : -1.6) * S;
      headRoll = -0.05;
      armLP = armRP = perched ? -.74 : -.35;
      armLZ = perched ? .14 : -.25;
      armRZ = -armLZ;
      footLP = -1.32; footRP = -1.32;
      tailWag = Math.sin(t * 1.6) * 0.34;
    } else if (pose === 'bow') {
      const dip = Math.sin(Math.PI * clamp(this.emoteAge / .86, 0, 1));
      bodyY = -.06 * dip;
      headPitch = .36 * dip;
      armLZ = -1.05 * dip; armRZ = 1.05 * dip;
      earLFlap = .2 * dip; earRFlap = .2 * dip;
      if (this.emoteAge > .86) this.setFace('normal');
    } else if (mochi) {
      headRoll = -.11 + Math.sin(t * .78) * .04;
      tailWag = 0;
      this.mochiMesh.scale.set(1, 1 + Math.sin(t * .76) * .028, 1);
    }

    if (this.petFor > 0 && !moving && this.onGround) {
      const twitch = Math.sin(clamp((1.4 - this.petFor) / .52, 0, 1) * Math.PI);
      headRoll += (this.isGonyani ? -.16 : .16) * twitch;
      if (!floorPose) bodyY += (this.isGonyani ? .025 : .095) * twitch;
      earLFlap += (this.isGonyani ? -.34 : .15) * twitch;
      earRFlap += (this.isGonyani ? -.34 : .32) * twitch;
      tailWag += Math.sin(t * 2.75) * .24;
      this.setFace(this.isGonyani ? 'gonyani-stare' : 'happy');
    }

    // Apply Body transforms
    this.bodyGroup.position.y = bodyY;
    this.bodyGroup.rotation.set(bodyPitch * (1 - qb * 0.6), 0, bodyRoll);

    // Apply Bipedal limbs
    this.armLPivot.rotation.set(armLP, 0, armLZ);
    this.armRPivot.rotation.set(armRP, 0, armRZ);
    this.footLPivot.rotation.set(footLP, 0, 0);
    this.footRPivot.rotation.set(footRP, 0, 0);

    // Apply Quadruped 4-leg trot animation
    const qStride = moving ? s * (sprinting ? 0.75 : 0.55) : 0;
    this.qLegs[0].rotation.x =  qStride;
    this.qLegs[1].rotation.x = -qStride;
    this.qLegs[2].rotation.x = -qStride;
    this.qLegs[3].rotation.x =  qStride;
    this.qLegs.forEach((leg) => {
      leg.visible = true;
      leg.position.y = 6.2 * S;
      leg.rotation.z = 0;
    });
    this.quadGroup.rotation.z = 0;
    this.quadGroup.position.y = 0;
    this.quadTorso.position.y = 10.6 * S;
    this.quadTorso.scale.setScalar(1);

    // Smoothly position Head, Tail, and Wings between Biped & Quadruped modes
    this.headPivot.position.set(
      0,
      THREE.MathUtils.lerp(HEAD_PIVOT_Y, 13.5, qb) * S,
      THREE.MathUtils.lerp(0.0, 9.2, qb) * S
    );
    this.headPivot.rotation.set(headPitch, headYaw, headRoll);
    this.headPivot.scale.set(1, 1, 1);

    this.tailPivot.position.set(
      0.3 * S,
      THREE.MathUtils.lerp(8.0, 12.6, qb) * S,
      THREE.MathUtils.lerp(this.isGonyani ? -5.6 : -7.9, -11.4, qb) * S
    );
    this.tailPivot.rotation.set(tailPitch, tailWag, 0);
    this.tailPivot.visible = !mochi;
    if (this.isGonyani) this.tailPivot.scale.setScalar(pose === 'wary' ? 1.34 : 1);
    if (floorPose) {
      this.applyFloorPose(pose, t);
    } else if (mochi) {
      this.headPivot.position.set(-.035, .765, .061);
      this.headPivot.scale.set(.83, .77, .92);
    }

    this.angelWingsGroup.position.set(
      0,
      THREE.MathUtils.lerp(14.0, 16.5, qb) * S,
      THREE.MathUtils.lerp(-8.6, -2.5, qb) * S
    );
    this.devilWingsGroup.position.copy(this.angelWingsGroup.position);

    // Floppy Ears animation (gentle bounce & flap!)
    this.earLPivot.rotation.set(earBack, 0, -earLFlap);
    this.earRPivot.rotation.set(earBack, 0, earRFlap);

    // Wing & Halo subtle animation
    if (this.haloMesh.visible) {
      this.haloMesh.position.y = (49.2 - HEAD_PIVOT_Y + Math.sin(t * 2.0) * 0.7) * S;
      const wf = Math.sin(t * 2.6) * 0.25;
      this.angelWingsGroup.children[0].rotation.y =  wf;
      this.angelWingsGroup.children[1].rotation.y = -wf;
    }
    if (this.devilWingsGroup.visible) {
      const wf = Math.sin(t * 2.8) * 0.22;
      this.devilWingsGroup.children[0].rotation.y =  wf;
      this.devilWingsGroup.children[1].rotation.y = -wf;
    }

    // Update Root world transform
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;

    // Update Soft Elliptical Ground Shadow Disc directly under Ganadi
    const hFactor = clamp(1.0 - this.pos.y * 0.14, 0.42, 1.0);
    const rxSh = THREE.MathUtils.lerp(0.68, 0.74, qb) * hFactor;
    const rzSh = (floorPose ? 1.05 : THREE.MathUtils.lerp(.60, .96, qb)) * hFactor;
    this.shadowMesh.position.set(this.pos.x, 0.025, this.pos.z);
    this.shadowMesh.rotation.y = this.yaw;
    this.shadowMesh.scale.set(rxSh, 1, rzSh);
    this.shadowMat.color.setHex(isStudioMode ? 0x8ea4c2 : 0x5c8e66);
    this.shadowMat.opacity = (isStudioMode ? 0.22 : 0.28) * hFactor;
    return changedForm;
  }

  applyFloorPose(pose, time) {
    const sideways = pose === 'roll' || (pose === 'sleep' && !this.isGonyani);
    const tucked = pose === 'loaf' || (pose === 'sleep' && this.isGonyani);
    const stretch = pose === 'stretch';
    const breathe = Math.sin(time * .65) * .022;

    this.quadGroup.position.y = sideways ? .20 : -.17;
    this.quadGroup.rotation.z = sideways ? .96 : 0;
    this.quadTorso.position.y = sideways ? .365 : .43;
    this.quadTorso.scale.set(tucked ? 1.13 : 1.05, .72 + breathe, stretch ? 1.46 : 1.19);
    this.qLegs.forEach((leg, index) => {
      leg.visible = !tucked;
      leg.rotation.x = index < 2 ? (sideways ? -1.0 : -1.5) : (sideways ? .55 : 1.16);
      leg.rotation.z = sideways ? -.26 : (index % 2 ? .24 : -.24);
      if (sideways && index % 2 === 0) leg.position.y += index === 0 ? .073 : .168;
      if (!sideways && index >= 2) leg.position.y += .075;
    });

    const headRoll = this.headPivot.rotation.z;
    this.headPivot.position.set(sideways ? .05 : 0, (sideways ? .455 : .137) + breathe, stretch ? .82 : .56);
    this.headPivot.rotation.set(.07 + breathe, sideways ? .30 : .41, (sideways ? .99 : (tucked ? -.09 : .12)) + headRoll);
    this.tailPivot.position.set(sideways ? -.32 : .08, .24 + breathe, stretch ? -.75 : -.61);
    this.tailPivot.rotation.x -= sideways ? .30 : .18;
    if (tucked) this.tailPivot.rotation.y = 1.07 + breathe;
  }

  getHeadTopWorldPos(target) {
    if (this.floorPose || this.mochiMesh?.visible) {
      this.headMesh.getWorldPosition(target);
      target.y += .79;
      return target;
    }
    const headOffset = this.isGonyani ? 3 : 0;
    const topY = (THREE.MathUtils.lerp(50.5, 42.5, this.quadBlend) - headOffset) * S;
    target.set(this.pos.x, this.pos.y + topY, this.pos.z);
    return target;
  }
}
