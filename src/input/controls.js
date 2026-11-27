import { MAX_CAMERA_DISTANCE, clamp } from '../math.js?v=2';

export function bindControls(canvas, appState, actions) {
  const joyZoneEl = document.getElementById('joyZone');
  const joyBaseEl = document.getElementById('joyBase');
  const joyKnobEl = document.getElementById('joyKnob');

  function updateJoystickFromClient(clientX, clientY) {
    const rect = joyBaseEl.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = Math.max(24, rect.width * 0.42);
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxR);
    if (dist > 0.001) {
      dx = (dx / dist) * clamped;
      dy = (dy / dist) * clamped;
    }
    const nx = dx / maxR;
    const ny = dy / maxR;
    const mag = Math.min(1, dist / maxR);

    appState.joy.x = nx;
    appState.joy.y = ny;
    appState.joy.mag = mag;
    appState.joy.autoDash = mag >= 0.78;

    joyKnobEl.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    joyBaseEl.classList.toggle('auto-dash', appState.joy.autoDash);
  }

  function resetJoystick() {
    const id = appState.joy.pointerId;
    appState.joy.pointerId = null;
    if (id !== null && joyZoneEl.hasPointerCapture(id)) joyZoneEl.releasePointerCapture(id);
    appState.joy.x = 0;
    appState.joy.y = 0;
    appState.joy.mag = 0;
    appState.joy.autoDash = false;
    joyKnobEl.style.transform = 'translate3d(0px, 0px, 0)';
    joyBaseEl.classList.remove('auto-dash');
  }

  joyZoneEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (appState.joy.pointerId !== null) return;
    appState.joy.pointerId = e.pointerId;
    try { joyZoneEl.setPointerCapture(e.pointerId); } catch (_) {}
    updateJoystickFromClient(e.clientX, e.clientY);
  });
  joyZoneEl.addEventListener('pointermove', (e) => {
    if (e.pointerId !== appState.joy.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    updateJoystickFromClient(e.clientX, e.clientY);
  });
  const endJoy = (e) => {
    if (e.pointerId !== appState.joy.pointerId) return;
    e.stopPropagation();
    resetJoystick();
  };
  joyZoneEl.addEventListener('pointerup', endJoy);
  joyZoneEl.addEventListener('pointercancel', endJoy);
  joyZoneEl.addEventListener('lostpointercapture', endJoy);

  // Right-thumb Tactile Action Buttons (independent pointer events!)
  const btnPadJump = document.getElementById('btnPadJump');
  btnPadJump.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    btnPadJump.classList.add('pressed');
    actions.jump();
  });
  const releaseJumpBtn = () => btnPadJump.classList.remove('pressed');
  btnPadJump.addEventListener('pointerup', releaseJumpBtn);
  btnPadJump.addEventListener('pointercancel', releaseJumpBtn);
  btnPadJump.addEventListener('pointerleave', releaseJumpBtn);

  const btnPadQuad = document.getElementById('btnPadQuad');
  btnPadQuad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    btnPadQuad.classList.add('pressed');
    actions.toggleQuad();
  });
  const releaseQuadBtn = () => btnPadQuad.classList.remove('pressed');
  btnPadQuad.addEventListener('pointerup', releaseQuadBtn);
  btnPadQuad.addEventListener('pointercancel', releaseQuadBtn);
  btnPadQuad.addEventListener('pointerleave', releaseQuadBtn);

  const btnPadDash = document.getElementById('btnPadDash');
  btnPadDash.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    appState.dashLock = !appState.dashLock;
    btnPadDash.classList.toggle('active-dash', appState.dashLock);
    actions.notifyDash(appState.dashLock);
  });

  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (actions.handleGlobalKey(e)) return;
    const control = e.target instanceof Element ? e.target : null;
    if (control?.closest('input, textarea, select, [contenteditable]')) return;
    if (e.code === 'Space' && control?.closest('button:focus-visible, a:focus-visible')) return;
    appState.keys[e.code] = true;
    if (e.code === 'Space' && appState.mode === 'world') {
      e.preventDefault();
      if (!e.repeat) actions.jump();
      return;
    }
    if (e.repeat) return;
    actions.handleShortcut(e);
  });
  window.addEventListener('keyup', (e) => { appState.keys[e.code] = false; });

  function getTwoPointerDist() {
    const pts = Array.from(appState.canvasPointers.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const tap = e.button === 0 && appState.canvasPointers.size === 0;
    appState.canvasPointers.set(e.pointerId, {
      x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, at: e.timeStamp, tap,
    });
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    if (appState.canvasPointers.size === 2) {
      appState.canvasPointers.forEach((pointer) => { pointer.tap = false; });
      appState.pinchStartDist = getTwoPointerDist();
      appState.pinchStartZoom = appState.distance;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = appState.canvasPointers.get(e.pointerId);
    if (!prev) return;
    e.preventDefault();

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (appState.canvasPointers.size === 1) {
      if (prev.tap && Math.hypot(e.clientX - prev.startX, e.clientY - prev.startY) < 7) return;
      prev.tap = false;
      // 1-finger drag: smooth 360° yaw orbit + pitch tilt
      appState.autoRotate = false;
      actions.stopAutoRotate();
      appState.targetYawDeg = null;
      appState.targetPitchDeg = null;
      appState.yawDeg = (appState.yawDeg - dx * 0.52 + 360) % 360;
      appState.pitchDeg = clamp(appState.pitchDeg + dy * 0.34, 6, 68);
    } else if (appState.canvasPointers.size >= 2) {
      // 2-finger pinch: smooth zoom in & out
      const curDist = getTwoPointerDist();
      if (curDist > 12 && appState.pinchStartDist > 12) {
        const scale = appState.pinchStartDist / curDist;
        appState.distance = clamp(appState.pinchStartZoom * scale, 4, MAX_CAMERA_DISTANCE);
      }
    }
  });

  const endCanvasPtr = (e) => {
    const pointer = appState.canvasPointers.get(e.pointerId);
    if (!pointer) return;
    appState.canvasPointers.delete(e.pointerId);
    if (e.type === 'pointerup' && pointer.tap && e.timeStamp - pointer.at < 460
      && Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) < 7) {
      actions.tap(e.clientX, e.clientY);
    }
    if (appState.canvasPointers.size === 2) {
      appState.pinchStartDist = getTwoPointerDist();
      appState.pinchStartZoom = appState.distance;
    }
  };
  canvas.addEventListener('pointerup', endCanvasPtr);
  canvas.addEventListener('pointercancel', endCanvasPtr);
  canvas.addEventListener('lostpointercapture', endCanvasPtr);

  function releaseHeldControls() {
    appState.keys = Object.create(null);
    resetJoystick();
    const pointerIds = [...appState.canvasPointers.keys()];
    appState.canvasPointers.clear();
    for (const id of pointerIds) {
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    }
    releaseJumpBtn();
    releaseQuadBtn();
  }

  window.addEventListener('blur', releaseHeldControls);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseHeldControls();
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.65 : -0.65;
    appState.distance = clamp(appState.distance + delta, 4, MAX_CAMERA_DISTANCE);
  }, { passive: false });

  return { resetJoystick, releaseHeldControls };
}
