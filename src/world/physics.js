import { WORLD_HALF, RAD, clamp } from '../math.js';
import { playSfx } from '../audio.js';

export function createWorldInteractions(world, setBubble) {
  const { obstacles, ballState, cushionState, riceState, spawnRiceSparkles } = world;

  function interactWithWorld(ch, dt, isPlayer) {
    if (!ch.onGround || ch.vel.y !== 0) {
      ch.vel.y -= 22.0 * dt;
      ch.pos.y += ch.vel.y * dt;
      if (ch.pos.y <= 0) {
        ch.pos.y = 0;
        ch.vel.y = 0;
        ch.onGround = true;
      }
    }

    const lim = WORLD_HALF - 0.9;
    ch.pos.x = clamp(ch.pos.x, -lim, lim);
    ch.pos.z = clamp(ch.pos.z, -lim, lim);

    for (const tr of obstacles) {
      const dx = ch.pos.x - tr.x, dz = ch.pos.z - tr.z;
      const d = Math.hypot(dx, dz);
      const minD = tr.r + 0.55;
      if (d < minD && d > 0.001) {
        ch.pos.x = tr.x + (dx / d) * minD;
        ch.pos.z = tr.z + (dz / d) * minD;
      }
    }

    // Bouncy Pink Cushion Trampoline
    const dCush = Math.hypot(ch.pos.x - cushionState.pos.x, ch.pos.z - cushionState.pos.z);
    if (dCush < cushionState.radius + 0.25 && ch.pos.y < 0.55 && ch.vel.y <= 0) {
      ch.vel.y = 11.4;
      ch.onGround = false;
      cushionState.squash = 1.0;
      if (isPlayer) playSfx('boing');
    }

    // Kick Red Beach Ball
    const bdx = ballState.pos.x - ch.pos.x;
    const bdz = ballState.pos.z - ch.pos.z;
    const bd = Math.hypot(bdx, bdz);
    const kickR = ballState.radius + 0.56;
    if (bd < kickR && Math.abs(ballState.pos.y - ch.pos.y) < 1.2 && bd > 0.001) {
      const nx = bdx / bd, nz = bdz / bd;
      ballState.pos.x = ch.pos.x + nx * kickR;
      ballState.pos.z = ch.pos.z + nz * kickR;
      const pSpd = Math.hypot(ch.vel.x, ch.vel.z);
      const pwr = Math.max(4.8, pSpd * 1.45 + 2.4);
      ballState.vel.x = nx * pwr + ch.vel.x * 0.35;
      ballState.vel.z = nz * pwr + ch.vel.z * 0.35;
      ballState.vel.y = Math.max(ballState.vel.y, 4.3 + pSpd * 0.35);
      if (isPlayer) playSfx('kick');
    }

    // Steaming White Rice Bowl (白いごはん / 쌀밥!)
    const dRice = Math.hypot(ch.pos.x - riceState.pos.x, ch.pos.z - riceState.pos.z);
    if (dRice < riceState.radius + 0.72) {
      if (isPlayer && riceState.cooldown <= 0) {
        riceState.cooldown = 2.6;
        if (ch.isGonyani) {
          setBubble('…', 1.6);
        } else {
          riceState.hop = 0.44;
          ch.vel.y = Math.max(ch.vel.y, 6.4);
          ch.onGround = false;
          spawnRiceSparkles(riceState.pos);
          setBubble('もぐ もぐ', 2.2);
          playSfx('eat');
        }
      } else if (!isPlayer && ch.onGround && Math.random() < dt * 2.5) {
        ch.vel.y = 5.5;
        ch.onGround = false;
      }
    }
  }
  return interactWithWorld;
}

export function movePlayer(player, appState, dt) {
  // Combine Keyboard (WASD/Arrows) + Analog Left-Thumb Joystick (Camera-Relative 360°)
  let inX = 0, inZ = 0, moveMag = 0;
  const k = appState.keys;
  if (k['KeyW'] || k['ArrowUp'])    inZ -= 1;
  if (k['KeyS'] || k['ArrowDown'])  inZ += 1;
  if (k['KeyA'] || k['ArrowLeft'])  inX -= 1;
  if (k['KeyD'] || k['ArrowRight']) inX += 1;

  if (inX !== 0 || inZ !== 0) {
    const len = Math.hypot(inX, inZ);
    inX /= len;
    inZ /= len;
    moveMag = 1.0;
  } else if (appState.joy.mag > 0.12) {
    const jLen = Math.hypot(appState.joy.x, appState.joy.y) || 1;
    inX = appState.joy.x / jLen;
    inZ = appState.joy.y / jLen;
    moveMag = clamp((appState.joy.mag - 0.12) / (0.78 - 0.12), 0.30, 1.0);
  }

  const moving = moveMag > 0;
  const sprinting = moving && !!(k['ShiftLeft'] || k['ShiftRight'] || appState.dashLock || appState.joy.autoDash);

  if (moving) {
    const yawRad = appState.yawDeg * RAD;
    const sinY = Math.sin(yawRad), cosY = Math.cos(yawRad);
    const wx = inX * cosY + inZ * sinY;
    const wz = -inX * sinY + inZ * cosY;

    const baseSpd = player.quadMode ? 5.1 : 4.2;
    const spd = sprinting ? baseSpd * 1.68 : baseSpd * moveMag;
    player.vel.x = wx * spd;
    player.vel.z = wz * spd;

    const targetYaw = Math.atan2(wx, wz);
    let dy = targetYaw - player.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    player.yaw += dy * Math.min(1, dt * 14);
  } else {
    const damp = Math.pow(0.001, dt);
    player.vel.x *= damp;
    player.vel.z *= damp;
  }

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  return { moving, sprinting };
}

export function updateCrowd(player, companion, crowd, ballState, interactWithWorld, dt) {
  // Autonomous AI Crowd Ganadis
  const allChars = companion ? [player, companion, ...crowd] : [player, ...crowd];
  for (let i = 0; i < crowd.length; i++) {
    const npc = crowd[i];
    npc.aiTimer -= dt;
    if (npc.aiTimer <= 0) {
      npc.aiTimer = 1.2 + Math.random() * 2.4;
      const r = Math.random();
      if (r < 0.52) npc.aiMode = 'chaseBall';
      else if (r < 0.86) {
        npc.aiMode = 'wander';
        npc.aiTargetYaw = Math.random() * Math.PI * 2;
      } else {
        npc.aiMode = 'idle';
      }
      if (npc.onGround && Math.random() < 0.30) {
        npc.vel.y = 6.2;
        npc.onGround = false;
      }
    }

    let wantX = 0, wantZ = 0;
    if (npc.aiMode === 'chaseBall') {
      const dx = ballState.pos.x - npc.pos.x;
      const dz = ballState.pos.z - npc.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.7) { wantX = dx / d; wantZ = dz / d; }
    } else if (npc.aiMode === 'wander') {
      wantX = Math.sin(npc.aiTargetYaw);
      wantZ = Math.cos(npc.aiTargetYaw);
    }

    const npcSpd = npc.quadMode ? 3.5 : 2.8;
    npc.vel.x += (wantX * npcSpd - npc.vel.x) * Math.min(1, dt * 5);
    npc.vel.z += (wantZ * npcSpd - npc.vel.z) * Math.min(1, dt * 5);
    npc.pos.x += npc.vel.x * dt;
    npc.pos.z += npc.vel.z * dt;

    const curSpd = Math.hypot(npc.vel.x, npc.vel.z);
    if (curSpd > 0.3) {
      const ty = Math.atan2(npc.vel.x, npc.vel.z);
      let dy = ty - npc.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      npc.yaw += dy * Math.min(1, dt * 10);
    }

    interactWithWorld(npc, dt, false);
    npc.updateAnimation(dt, curSpd, curSpd > 3.2, false);
  }

  // Soft separation so crowd Ganadis never overlap
  for (let i = 0; i < allChars.length; i++) {
    for (let j = i + 1; j < allChars.length; j++) {
      const a = allChars[i], b = allChars[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = 1.05;
      if (d < minD && d > 0.001) {
        const push = (minD - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        if (i > 0) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
        b.pos.x += nx * push; b.pos.z += nz * push;
      }
    }
  }
}
