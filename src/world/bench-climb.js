import { THREE } from '../three.js';
import { clamp } from '../math.js';

const { lerp, smoothstep, euclideanModulo } = THREE.MathUtils;
const SEATED_YAW = .10;
export const BENCH_REACH = 3.4;
const SECOND_RIDER_DELAY = .34;

export function createBenchClimb({ bench, resident, headPerches }) {
  const seat = new THREE.Vector3();
  let climb = null;

  function distanceToResident(actor) {
    const dx = actor.pos.x - bench.position.x - resident.position.x;
    const dz = actor.pos.z - bench.position.z - resident.position.z;
    return Math.hypot(dx, dz);
  }

  function start(player, companion) {
    const actors = companion ? [player, companion] : [player];
    const riders = actors.map((actor, index) => {
      const rider = {
        actor,
        ground: actor.pos.clone(),
        groundYaw: actor.yaw,
        turn: euclideanModulo(SEATED_YAW - actor.yaw + Math.PI, 2 * Math.PI) - Math.PI,
        emote: actor.activeEmote,
        perch: headPerches[companion ? actor.character.id : 'solo'],
        delay: index * SECOND_RIDER_DELAY,
        seated: false,
      };
      actor.vel.set(0, 0, 0);
      actor.setEmote('normal');
      return rider;
    });
    climb = { riders, phase: 'up', elapsed: 0 };
  }

  function dismount() {
    if (climb?.phase !== 'seated') return;
    climb.phase = 'down';
    climb.elapsed = 0;
  }

  function cancel() {
    if (!climb) return;
    for (const { actor, ground, groundYaw, emote } of climb.riders) {
      actor.pos.copy(ground);
      actor.yaw = groundYaw;
      actor.vel.set(0, 0, 0);
      actor.onGround = true;
      actor.setEmote(emote);
    }
    climb = null;
  }

  function updateRider(rider, t, dt) {
    const { actor, ground, groundYaw, turn, perch } = rider;
    perch.getWorldPosition(seat);
    actor.vel.set(0, 0, 0);
    const oldY = actor.pos.y;
    // Rise above the snout and forehead before closing the horizontal gap.
    actor.pos.lerpVectors(ground, seat, smoothstep(t, .16, 1));
    actor.pos.y = lerp(ground.y, seat.y, smoothstep(t, 0, .64)) + .55 * Math.sin(Math.PI * t);
    actor.yaw = groundYaw + turn * smoothstep(t, 0, 1);
    rider.seated = t === 1;
    actor.onGround = t === 0 || rider.seated;
    if (!actor.onGround && dt > 0) actor.vel.y = (actor.pos.y - oldY) / dt;
  }

  function update(dt) {
    const { riders, phase } = climb;
    climb.elapsed += dt;
    if (phase === 'seated') {
      for (const rider of riders) updateRider(rider, 1, dt);
      return;
    }

    const duration = phase === 'up' ? 1.14 : .93;
    for (const rider of riders) {
      const progress = clamp((climb.elapsed - rider.delay) / duration, 0, 1);
      updateRider(rider, phase === 'up' ? progress : 1 - progress, dt);
    }
    if (climb.elapsed < duration + riders[riders.length - 1].delay) return;
    if (phase === 'down') cancel();
    else {
      climb.phase = 'seated';
      climb.elapsed = 0;
    }
  }

  const findRider = (actor) => climb?.riders.find((rider) => rider.actor === actor);
  return {
    distanceToResident, start, dismount, cancel, update,
    hasRider: (actor) => Boolean(findRider(actor)),
    isSeated: (actor) => Boolean(findRider(actor)?.seated),
    get active() { return climb !== null; },
    get seated() { return climb?.phase === 'seated'; },
    get reaction() { return climb?.phase === 'seated' ? smoothstep(climb.elapsed, .34, .78) : 0; },
  };
}
