import { THREE } from '../three.js';

const PRINTS = 32;
const LIFETIME = 3.1;

function pawTexture(isCat) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  const pad = (x, y, w, h, angle) => {
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, angle, 0, Math.PI * 2);
    ctx.fill();
  };
  pad(16, 22, isCat ? 7 : 8, isCat ? 5.5 : 6, 0);
  [-1, 1].forEach(side => {
    pad(16 + 8 * side, 13, 2.4, 3.4, side * .25);
    pad(16 + 2.9 * side, 8.7, 2.5, 3.7, side * .12);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function createFootprints(worldScene) {
  const group = new THREE.Group();
  group.name = 'Footprints';
  worldScene.add(group);
  const geometry = new THREE.PlaneGeometry(.36, .40).rotateX(-Math.PI / 2);
  const textures = [pawTexture(false), pawTexture(true)];
  const pool = Array.from({ length: PRINTS }, () => {
    const material = new THREE.MeshBasicMaterial({ map: textures[0], color: 0x45694f, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    group.add(mesh);
    return { mesh, age: LIFETIME };
  });
  const trails = new WeakMap();
  let next = 0;

  function step(actor, walking) {
    if (!actor) return;
    const { x, z } = actor.pos;
    if (!trails.has(actor)) trails.set(actor, { x, z, distance: 0, side: 1 });
    const trail = trails.get(actor);
    const dx = x - trail.x;
    const dz = z - trail.z;
    const distance = Math.hypot(dx, dz);
    trail.x = x;
    trail.z = z;
    if (!walking || !actor.onGround || actor.pos.y > .08 || distance > .66) {
      trail.distance = 0;
      return;
    }
    if (distance < .0001) return;
    trail.distance += distance;
    const stride = actor.quadMode ? .41 : actor.isGonyani ? .49 : .64;
    if (trail.distance < stride) return;
    trail.distance %= stride;
    const print = pool[next];
    next = (next + 1) % pool.length;
    const lateral = trail.side * (actor.isGonyani ? .12 : .17);
    trail.side *= -1;
    print.age = 0;
    print.mesh.position.set(x + dz / distance * lateral, x * x + z * z < 2.48 ** 2 ? .033 : .012, z - dx / distance * lateral);
    print.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI;
    print.mesh.scale.setScalar(actor.isGonyani ? .76 : 1);
    print.mesh.material.map = textures[Number(actor.isGonyani)];
    print.mesh.material.opacity = .42;
    print.mesh.visible = true;
  }

  function update(dt) {
    for (const print of pool) {
      if (!print.mesh.visible) continue;
      print.age += dt;
      print.mesh.visible = print.age < LIFETIME;
      print.mesh.material.opacity = .42 * (1 - THREE.MathUtils.smoothstep(print.age, .58, LIFETIME));
    }
  }

  return { step, update, setVisible(visible) { group.visible = visible; } };
}
