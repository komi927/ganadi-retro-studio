import { THREE } from '../three.js';

const { euclideanModulo, smoothstep } = THREE.MathUtils;

export function createSharedNap() {
  let sleeper = null;
  let wait = 0;

  function reset() {
    if (sleeper) sleeper.sharedNap = false;
    sleeper = null;
    wait = 0;
  }

  function update(player, companion, dt, quiet) {
    if (!quiet || !companion || !player.onGround || !companion.onGround
      || player.activeEmote !== 'sleep' || companion.activeEmote !== 'normal'
      || player.pos.distanceToSquared(companion.pos) > 2.65 ** 2) {
      reset();
      return;
    }
    sleeper = companion;
    wait += dt;
    sleeper.sharedNap = wait >= 1.25;
  }

  return { reset, update };
}

export function createWaryStep() {
  const away = new THREE.Vector3();
  let cat = null;
  let time = 0;
  let cooldown = 0;

  function reset() {
    if (cat) cat.waryStep = 0;
    cat = null;
    time = 0;
    cooldown = 0;
  }

  function update(player, companion, dt, moving, available) {
    if (!available || player.isGonyani || !companion || !player.onGround || !companion.onGround) {
      reset();
      return;
    }
    cooldown = Math.max(0, cooldown - dt);
    away.subVectors(companion.pos, player.pos).setY(0);
    const distance = away.length();
    const approaching = player.vel.dot(away) > .2;
    if (!cat && cooldown === 0 && moving && approaching && distance < 1.46) {
      cat = companion;
      time = 0;
    }
    if (!cat) return;

    time += dt;
    cat.waryStep = time < .42 ? 1 : .3;
    if (time < .42 && distance > .01) {
      const retreat = distance < 1.12 ? 4.7 : 2.45;
      cat.pos.addScaledVector(away, retreat * dt / distance);
    }
    if ((time >= .79 && distance > 1.7) || time >= 1.65) {
      cat.waryStep = 0;
      cat = null;
      cooldown = 1.2;
    }
  }

  return { reset, update };
}

const SHUTTER = 1.58;
const PHOTO_END = 2.35;

export function createBenchPhoto(plaza) {
  const camera = new THREE.PerspectiveCamera(45, 1, .15, 160);
  const target = new THREE.Vector3();
  let actors = [];
  let time = 0;

  function start(player, companion) {
    time = 0;
    actors = [player, companion].map(actor => {
      const { x, z } = plaza.bench.position;
      const side = actor.isGonyani ? 1 : -1;
      actor.pos.set(x + side * 1.02, 0, z + 5.2);
      actor.vel.set(0, 0, 0);
      actor.onGround = true;
      const yaw = actor.yaw;
      const targetYaw = Math.atan2(x - actor.pos.x, z + 2.4 - actor.pos.z);
      const turn = euclideanModulo(targetYaw - yaw + Math.PI, 2 * Math.PI) - Math.PI;
      const prop = actor.emotes.find(emote => emote.id === actor.activeEmote)?.prop;
      actor.setProp(null);
      actor.photoLook = 0;
      return { actor, yaw, turn, prop };
    });
  }

  function stop() {
    for (const { actor, yaw, prop } of actors) {
      actor.yaw = yaw;
      actor.photoLook = null;
      actor.setProp(prop);
    }
    actors = [];
    plaza.poseResidentPhoto(0);
  }

  function update(dt) {
    const previous = time;
    time += dt;
    const lower = 1 - smoothstep(time, 1.84, PHOTO_END);
    plaza.poseResidentPhoto(smoothstep(time, .1, .74) * lower);
    for (const { actor, yaw, turn } of actors) {
      const delay = actor.isGonyani ? .95 : .62;
      actor.photoLook = smoothstep(time, delay, delay + .42) * lower;
      actor.yaw = yaw + turn * actor.photoLook;
    }
    if (time >= PHOTO_END) stop();
    return previous < SHUTTER && time >= SHUTTER;
  }

  function view(aspect) {
    plaza.phone.getWorldPosition(camera.position);
    camera.position.z += .22;
    target.lerpVectors(actors[0].actor.pos, actors[1].actor.pos, .5).setY(1.10);
    const span = camera.position.distanceTo(target) * aspect;
    camera.aspect = aspect;
    // Leave space for both characters' heads, which are closer to the lens than their feet.
    camera.fov = Math.min(150, Math.max(43, 2 * Math.atan(2.66 / span) * 180 / Math.PI));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    return camera;
  }

  return { start, stop, update, view, get active() { return actors.length > 0; } };
}
