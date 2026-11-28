import { THREE } from '../three.js';
import { clamp } from '../math.js';

const { smoothstep, euclideanModulo } = THREE.MathUtils;

export function createIdleExchange() {
  let pair = null;
  let time = 0;

  function reset() {
    if (pair) {
      pair.dog.idleGlance = 0;
      pair.cat.idleGlance = 0;
    }
    pair = null;
    time = 0;
  }

  function update(player, companion, dt, settled) {
    if (!settled || !companion || player.activeEmote !== 'normal' || companion.activeEmote !== 'normal'
      || !player.onGround || !companion.onGround || player.petFor || companion.petFor
      || player.pos.distanceToSquared(companion.pos) > 2.65 ** 2) {
      reset();
      return;
    }
    if (!pair) pair = player.isGonyani ? { dog: companion, cat: player } : { dog: player, cat: companion };
    time = Math.min(time + dt, 4.5);
    const { dog, cat } = pair;
    const bearing = Math.atan2(cat.pos.x - dog.pos.x, cat.pos.z - dog.pos.z);
    const dogTurn = euclideanModulo(bearing - dog.yaw + Math.PI, 2 * Math.PI) - Math.PI;
    const catTurn = Math.sin(bearing + Math.PI - cat.yaw);
    dog.idleGlance = clamp(dogTurn, -.55, .55) * smoothstep(time, 2.4, 2.72) * (1 - smoothstep(time, 3.72, 4.13));
    cat.idleGlance = time >= 3.12 && time < 4.33 ? Math.sign(catTurn) : 0;
  }

  return { reset, update };
}

const SNACK_END = 4.95;

export function createSnackTime(plaza) {
  let diners = null;
  let time = 0;
  const target = new THREE.Vector3();

  function start(player, companion) {
    time = 0;
    const dog = player.isGonyani ? companion : player;
    const cat = player.isGonyani ? player : companion;
    diners = [
      { role: 'ganadi', actor: dog, side: dog === player ? -1 : 1, pickup: .28, bite: .84 },
      { role: 'gonyani', actor: cat, side: cat === player ? -1 : 1, pickup: 1.65, bite: 2.28 },
      { role: 'resident', pickup: 2.67, bite: 3.35 },
    ];
    for (const diner of diners) {
      const { actor, side } = diner;
      diner.food = plaza.snackFood[!actor ? 'resident' : actor === player ? 'right' : 'left'];
      if (actor) {
        actor.snackGesture = { side, look: 0, reach: 0, chew: 0 };
        actor.setProp(null);
      }
    }
  }

  function stop() {
    if (!diners) return;
    for (const { actor, food, bite } of diners) {
      if (actor) {
        actor.snackGesture = null;
        actor.setProp(actor.emotes.find(emote => emote.id === actor.activeEmote)?.prop);
      }
      food.position.set(0, 0, 0);
      food.scale.setScalar(1);
      food.visible = time < bite;
    }
    diners = null;
    plaza.poseResidentSnack(0, 0);
  }

  function update(dt, onBite) {
    if (!diners) return;
    const previous = time;
    time += dt;
    for (const { role, actor, side, food, pickup, bite } of diners) {
      const reach = smoothstep(time, pickup - .27, pickup + .13) * (1 - smoothstep(time, bite, bite + .52));
      const chew = time >= bite && time < bite + .56 ? Math.sin((time - bite) * 25) : 0;
      if (actor) {
        const look = smoothstep(time, .04, .38) * (1 - smoothstep(time, pickup, bite));
        actor.snackGesture = { side, look, reach, chew };
      } else {
        plaza.poseResidentSnack(phonePlacement(), reach);
      }

      if (previous < bite && time >= bite) onBite(role, actor);
      if (time < pickup || !food.visible) continue;
      const lift = smoothstep(time, pickup, bite);
      const head = actor ? actor.headPivot : plaza.head;
      target.set(actor ? side * .13 : .28, actor ? .28 : -.38, actor ? .52 : .91);
      head.localToWorld(target);
      target.y -= .21 * food.scale.y;
      food.parent.worldToLocal(target);
      food.position.copy(target).multiplyScalar(lift);
      food.position.y += .18 * Math.sin(Math.PI * lift);
      const remaining = 1 - smoothstep(time, bite, bite + .18);
      food.scale.setScalar(Math.max(.02, remaining));
      food.visible = remaining > 0;
    }
    if (time >= SNACK_END) stop();
  }

  function phonePlacement() {
    return diners ? smoothstep(time, .96, 1.63) * (1 - smoothstep(time, 4.14, SNACK_END)) : 0;
  }

  return {
    start, stop, update,
    get active() { return diners !== null; },
    get phoneDown() { return phonePlacement(); },
  };
}
