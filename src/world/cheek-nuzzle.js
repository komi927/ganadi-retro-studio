import { THREE } from '../three.js';

const { lerp, smoothstep, euclideanModulo } = THREE.MathUtils;
const REACH = 2.55;
const CONTACT_DISTANCE = 1.53;
const REPLY_AT = .94;
const RELEASE_AT = 2.30;
const END_AT = 2.88;

export function createCheekNuzzle() {
  let scene = null;

  function canStart(player, companion) {
    return player.onGround && companion?.onGround && player.pos.distanceToSquared(companion.pos) <= REACH ** 2;
  }

  function start(player, companion, viewYaw) {
    const dog = player.isGonyani ? companion : player;
    const cat = player.isGonyani ? player : companion;
    const axis = cat.pos.clone().sub(dog.pos).setY(0);
    const distance = axis.length();
    if (distance > .01) axis.divideScalar(distance);
    else axis.set(Math.cos(viewYaw), 0, -Math.sin(viewYaw));

    // Keep each actor on the same side of the screen where the pair started.
    const side = axis.x * Math.cos(viewYaw) - axis.z * Math.sin(viewYaw) < 0 ? -1 : 1;
    const yaw = Math.atan2(-axis.z * side, axis.x * side);
    const closing = distance - CONTACT_DISTANCE;
    const dogTarget = dog.pos.clone().addScaledVector(axis, closing * .78);
    const catTarget = cat.pos.clone().addScaledVector(axis, -closing * .22);
    const actors = [[dog, dogTarget], [cat, catTarget]].map(([actor, target]) => {
      const entry = {
        actor, target, from: actor.pos.clone(), emote: actor.activeEmote, yaw: actor.yaw,
        turn: euclideanModulo(yaw - actor.yaw + Math.PI, 2 * Math.PI) - Math.PI,
      };
      actor.setEmote('normal');
      actor.vel.set(0, 0, 0);
      actor.petFor = 0;
      actor.cheekLean = { side, amount: 0 };
      return entry;
    });
    scene = { actors, age: 0 };
    return { yaw, center: dogTarget.clone().lerp(catTarget, .5).addScaledVector(axis, .14) };
  }

  function cancel() {
    if (!scene) return;
    for (const { actor, emote } of scene.actors) {
      actor.cheekLean = null;
      actor.setEmote(emote);
    }
    scene = null;
  }

  function update(dt) {
    const previous = scene.age;
    scene.age = Math.min(scene.age + dt, END_AT);
    const { age, actors } = scene;
    const settle = smoothstep(age, 0, .64);
    const release = smoothstep(age, RELEASE_AT, END_AT);
    for (const { actor, target, from, yaw, turn } of actors) {
      actor.pos.lerpVectors(from, target, settle * (1 - release));
      actor.yaw = lerp(yaw, yaw + turn, settle);
      actor.vel.set(0, 0, 0);
      const leanIn = actor.isGonyani ? smoothstep(age, .69, 1.22) : smoothstep(age, .27, .82);
      actor.cheekLean.amount = leanIn * (1 - release);
    }
    if (age >= END_AT) cancel();
    return previous < REPLY_AT && age >= REPLY_AT;
  }

  return { canStart, start, cancel, update, get active() { return scene !== null; } };
}
