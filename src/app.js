import { THREE } from './three.js';
import { MAX_CAMERA_DISTANCE, RAD, WORLD_HALF, clamp } from './math.js';
import { playSfx, toggleAudio } from './audio.js';
import { CHARACTERS, FLOOR_POSES } from './characters/design.js';
import { buildSharedAssets, buildGonyaniAssets } from './characters/assets.js';
import { StudioCharacter } from './characters/character.js';
import { globalRenderUniforms } from './graphics/materials.js';
import { createRenderPipeline } from './graphics/renderer.js';
import { createWorld } from './world/scene.js';
import { BENCH_REACH, createBenchClimb } from './world/bench-climb.js';
import { createWorldInteractions, movePlayer, updateCrowd } from './world/physics.js';
import { createTransparentPng } from './export/png.js';
import { buildCharacterGlb } from './export/glb.js';
import { downloadFile } from './export/download.js';
import { bindControls } from './input/controls.js';
import { createMenus, isCompactViewport } from './ui/menus.js';

function initApp() {
  const viewportWrap = document.getElementById('viewportWrap');
  const canvas = document.getElementById('webglCanvas');

  const graphics = createRenderPipeline(viewportWrap, canvas);
  const { camera, worldScene, charScene, resize: rebuildRenderTargets, render: renderPipeline } = graphics;
  const assets = buildSharedAssets();
  const world = createWorld(worldScene, charScene, assets.mats);
  const { worldPropsGroup, treeOccluders, plaza, ballState, spawnRiceSparkles } = world;
  const benchClimb = createBenchClimb(plaza);

  // ---- PLAYABLE CHARACTERS & AUTONOMOUS CROWD ----
  const characterAssets = { ganadi: assets, gonyani: buildGonyaniAssets(assets) };
  const players = Object.fromEntries(Object.values(CHARACTERS).map((character) => [
    character.id, new StudioCharacter(character, characterAssets[character.id], worldScene, charScene, true),
  ]));
  let player = players.ganadi;
  players.gonyani.setVisible(false);
  player.pos.set(0, 0, 0.6);
  const crowd = [];
  let companion = null;
  let companionBeat = null;
  let plazaReply = null;
  const plazaState = { snack: 0, servingFor: 0, attention: 0, focus: null };
  const snackActions = ['🍓 いちごをのせる', '🍰 おやつを分ける', '↺ もう一度つくる'];
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  const appState = {
    mode: 'world', // 'world' | 'studio'
    styleMode: 'lowpoly', // 'lowpoly' | 'ps1' | 'smooth'
    flatShading: true,
    wireframeOn: false,
    yawDeg: 35,
    targetYawDeg: null,
    pitchDeg: 22,
    targetPitchDeg: null,
    distance: window.innerWidth < 640 ? 11.2 : 10.0,
    studioFormZoom: null,
    autoRotate: false,
    outlineOn: false,
    showVirtualPad: null, // null uses the automatic device/layout setting
    dashLock: false,
    bubbleTimer: 0,
    keys: Object.create(null),
    // Analog joystick state (left thumb)
    joy: { x: 0, y: 0, mag: 0, autoDash: false, pointerId: null },
    // Multi-touch canvas pointers (1-finger orbit + 2-finger pinch zoom)
    canvasPointers: new Map(),
    pinchStartDist: 0,
    pinchStartZoom: 10.0,
    lastSliderZoom: '',
    lastSliderPitch: '',
  };

  const speechBubbleEl = document.getElementById('speechBubble');
  const plazaBubbleEl = document.getElementById('plazaBubble');
  const companionButton = document.getElementById('btnCompanion');
  const plazaActionButton = document.getElementById('btnPlazaAction');
  const formsButton = document.getElementById('btnForms');
  const formMenuEl = document.getElementById('formMenu');
  const menus = createMenus(viewportWrap, {
    releaseInputs: () => releaseHeldControls(),
    onLayoutChange: () => {
      rebuildRenderTargets();
      if (appState.studioFormZoom !== null) fitStudioFormZoom();
      syncVirtualPadVisibility();
    },
  });
  const { setFormMenu } = menus;

  const virtualPadEl = document.getElementById('virtualPad');
  const mobileEmoteBarEl = document.getElementById('mobileEmoteBar');
  const sliderZoomEl = document.getElementById('sliderZoom');
  sliderZoomEl.max = String(MAX_CAMERA_DISTANCE);
  const sliderPitchEl = document.getElementById('sliderPitch');
  const zoomValLabelEl = document.getElementById('zoomValLabel');
  const pitchValLabelEl = document.getElementById('pitchValLabel');
  const chkVirtualPadEl = document.getElementById('chkVirtualPad');

  function showToast(msg) {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast-anim glass-panel pixel-card rounded-2xl px-4 py-2 text-xs sm:text-sm font-extrabold text-[#222532]';
    el.textContent = msg;
    container.innerHTML = '';
    container.appendChild(el);
  }

  function setBubble(text, duration = 3.6) {
    appState.bubbleTimer = text ? duration : 0;
    speechBubbleEl.textContent = text || '';
    speechBubbleEl.classList.toggle('hidden', !text);
  }

  function setPlazaReply(speaker, text, duration = 2.6) {
    plazaReply = speaker ? { speaker, remaining: duration } : null;
    plazaBubbleEl.textContent = text || '';
    plazaBubbleEl.classList.toggle('hidden', !speaker);
  }

  function syncCameraSliders(force = false) {
    const zStr = appState.distance.toFixed(1);
    if (force || zStr !== appState.lastSliderZoom) {
      appState.lastSliderZoom = zStr;
      sliderZoomEl.value = zStr;
      zoomValLabelEl.textContent = zStr;
    }
    const pStr = `${Math.round(appState.pitchDeg)}°`;
    if (force || pStr !== appState.lastSliderPitch) {
      appState.lastSliderPitch = pStr;
      sliderPitchEl.value = String(Math.round(appState.pitchDeg));
      pitchValLabelEl.textContent = pStr;
    }
  }

  function syncVirtualPadVisibility() {
    const padEnabled = appState.showVirtualPad ?? (isTouchDevice || isCompactViewport());
    const shouldShow = appState.mode === 'world' && padEnabled && !menus.clean;
    virtualPadEl.classList.toggle('hidden', !shouldShow);
    viewportWrap.classList.toggle('with-pad', shouldShow);
    chkVirtualPadEl.checked = padEnabled;
    if (!shouldShow) resetJoystick();
  }

  function updateStatus() {
    const count = 1 + crowd.length + Number(Boolean(companion));
    const tris = player.getTriangleCount();
    document.getElementById('polyCountBadge').textContent = `${tris.toLocaleString()} tris`;
    document.getElementById('crowdCountBadge').textContent = `${count}体`;
  }

  function setModelStyle(styleMode, notify = true) {
    appState.styleMode = styleMode;
    const isSmooth = (styleMode === 'smooth');
    const isPS1 = (styleMode === 'ps1');
    graphics.setRetro(isPS1);
    document.getElementById('retroResolution').hidden = !isPS1;

    // Update geometry across player & all crowd Ganadis
    player.setStyle(styleMode);
    companion?.setStyle(styleMode);
    crowd.forEach((npc) => npc.setStyle(styleMode));

    appState.flatShading = !isSmooth;
    globalRenderUniforms.uFlatMix.value = isSmooth ? 0.0 : 1.0;
    document.getElementById('chkFlatShade').checked = appState.flatShading;

    document.querySelectorAll('.style-btn').forEach((btn) => {
      const act = btn.dataset.style === styleMode;
      btn.classList.toggle('active', act);
      btn.classList.toggle('bg-white', !act);
    });

    updateStatus();
    if (notify) {
      const label = styleMode === 'lowpoly'
        ? `ローポリ (${player.getTriangleCount()} tris)`
        : (styleMode === 'ps1'
          ? `🎮 PS1レトロ＋頂点スナップ (${player.getTriangleCount()} tris)`
          : `🫧 なめらか3D (${player.getTriangleCount().toLocaleString()} tris)`);
      showToast(label);
    }
  }

  function triggerEmote(emoteId) {
    const em = player.emotes.find((emote) => emote.id === emoteId);
    if (!em) return;
    cancelBenchClimb();
    player.setEmote(em.id);
    refreshPlayerPose();
    frameStudioForm(em.pose);
    setBubble(em.bubble, 4.2);
    if (appState.mode === 'world' && companion) queueCompanionReply(em.id);
    playSfx('emote');
    updateEmoteUI();
    updateStatus();
  }

  function fitStudioFormZoom() {
    const horizontalSpan = 2 * Math.tan(camera.fov * RAD / 2) * camera.aspect;
    appState.distance = clamp(Math.max(appState.studioFormZoom, 3.18 / horizontalSpan + .35), 4, MAX_CAMERA_DISTANCE);
  }

  function frameStudioForm(pose) {
    if (appState.mode !== 'studio') return;
    const wide = FLOOR_POSES.has(pose);
    if (wide) {
      appState.studioFormZoom ??= appState.distance;
      fitStudioFormZoom();
    } else if (appState.studioFormZoom !== null) {
      appState.distance = appState.studioFormZoom;
      appState.studioFormZoom = null;
    }
    if (wide || pose === 'mochi') {
      appState.autoRotate = false;
      document.getElementById('chkAutoRot').checked = false;
      appState.targetYawDeg = wide ? 62 : 26;
      appState.targetPitchDeg = wide ? 19 : 13;
    }
  }

  function petActor(actor) {
    actor.petFor = 1.4;
    const reaction = actor.isGonyani ? '…' : '♪';
    if (actor === player) {
      setBubble(reaction, 1.4);
      refreshPlayerPose();
    } else {
      setPlazaReply('companion', reaction, 1.4);
    }
    playSfx('emote');
  }

  function takeScenePhoto() {
    if (graphics.isContextLost()) {
      showToast('写真を保存できませんでした');
      return;
    }
    renderPipeline();
    const now = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadFile('ganadi-photo_' + now + '.png', canvas.toDataURL('image/png'));
    showToast('📷 写真を保存しました');
  }

  function setQuadMode(enabled, notify = true) {
    player.quadMode = enabled;
    document.getElementById('btnStyleBiped').classList.toggle('active', !enabled);
    document.getElementById('btnStyleBiped').classList.toggle('bg-white', enabled);
    document.getElementById('btnStyleQuad').classList.toggle('active', enabled);
    document.getElementById('btnStyleQuad').classList.toggle('bg-white', !enabled);

    const padQuadBtn = document.getElementById('btnPadQuad');
    padQuadBtn.classList.toggle('active-quad', enabled);
    document.getElementById('padQuadIcon').textContent = enabled ? '🐾' : '🚶';
    document.getElementById('padQuadText').textContent = enabled ? '4足' : '2足';

    updateStatus();
    if (notify) {
      playSfx('emote');
      showToast(enabled ? '🐾 4足歩き' : '🚶 2足立ち');
    }
  }

  function selectCharacter(id) {
    const next = players[id];
    if (!next || next === player) return;
    cancelBenchClimb();
    next.pos.copy(player.pos);
    next.vel.copy(player.vel);
    next.yaw = player.yaw;
    next.onGround = player.onGround;
    player.setVisible(false);
    player = next;
    player.setStyle(appState.styleMode);
    player.setWireframe(appState.wireframeOn);
    player.updateAnimation(0, Math.hypot(player.vel.x, player.vel.z), false, appState.mode === 'studio');
    frameStudioForm(player.renderPose);
    player.setVisible(true);
    setBubble(null);
    if (companion) createCompanion(companion.pos.clone());
    characterButtons.forEach((btn) => {
      const active = btn.dataset.character === id;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    setQuadMode(player.quadMode, false);
    buildEmoteControls();
    syncPlazaAction();
  }

  function triggerJump() {
    if (appState.mode !== 'world') return;
    if (benchClimb.active) {
      benchClimb.dismount();
      return;
    }
    if (player.onGround) {
      player.vel.y = 7.8;
      player.onGround = false;
      playSfx('jump');
    }
  }

  function createCompanion(position) {
    dismissCompanion();
    const character = player.isGonyani ? CHARACTERS.ganadi : CHARACTERS.gonyani;
    companion = new StudioCharacter(character, characterAssets[character.id], worldScene, charScene, false, appState.styleMode);
    companion.pos.copy(position);
    companion.yaw = appState.yawDeg * RAD;
    companion.setVisible(appState.mode === 'world');
    companion.updateAnimation(0, 0, false, false);
    companionButton.textContent = '🐾 相方を帰す';
    companionButton.setAttribute('aria-pressed', 'true');
    updateStatus();
  }

  function dismissCompanion() {
    if (!companion) return;
    if (benchClimb.hasRider(companion)) cancelBenchClimb();
    companion.dispose(worldScene, charScene);
    companion = null;
    companionBeat = null;
    if (plazaReply?.speaker === 'companion') setPlazaReply(null);
    companionButton.textContent = '🐾 相方を呼ぶ';
    companionButton.setAttribute('aria-pressed', 'false');
    updateStatus();
  }

  function queueCompanionReply(emoteId) {
    if (companionBeat) companion.setEmote('normal');
    companionBeat = null;
    if (plazaReply?.speaker === 'companion') setPlazaReply(null);
    const reply = player.isGonyani
      ? ({ stare: 'du', wary: 'hug' })[emoteId]
      : ({ happy: 'stare', hug: 'stare' })[emoteId];
    if (reply) companionBeat = { emote: reply, wait: .65, remaining: 2.8 };
  }

  function companionSpot(target) {
    if (plazaState.focus) return target.copy(plazaState.focus.companion);
    const angle = appState.yawDeg * RAD;
    const edge = WORLD_HALF - 1.25;
    const dx = -Math.cos(angle) * 1.58;
    const dz = Math.sin(angle) * 1.58;
    const side = Math.abs(player.pos.x + dx) > edge || Math.abs(player.pos.z + dz) > edge ? -1 : 1;
    return target.set(
      clamp(player.pos.x + dx * side, -edge, edge),
      0,
      clamp(player.pos.z + dz * side, -edge, edge)
    );
  }

  function visitPlazaSpot(spot) {
    if (appState.mode !== 'world') return;
    cancelBenchClimb();
    releaseHeldControls();
    const bench = spot === 'bench';
    const place = bench ? plaza.bench.position : plaza.snackTable.position;
    const benchPosition = plaza.bench.position;
    const playerSide = player.isGonyani ? 1 : -1;
    player.pos.set(place.x + (bench ? playerSide * 1.7 : 1.42), 0, place.z + (bench ? 2.52 : .88));
    player.vel.set(0, 0, 0);
    player.onGround = true;
    player.yaw = bench ? -.18 : .28;
    appState.yawDeg = bench ? 10 : 0;
    appState.pitchDeg = bench ? 12 : 16;
    appState.targetYawDeg = appState.targetPitchDeg = null;
    appState.autoRotate = false;
    document.getElementById('chkAutoRot').checked = false;
    plazaState.focus = bench ? {
      point: new THREE.Vector3(place.x + playerSide * .25, 0, place.z + 1.4),
      companion: new THREE.Vector3(place.x - playerSide * 1.72, 0, place.z + 2.25),
      width: 5.9, height: 5.4, centerY: 2.95,
    } : {
      point: new THREE.Vector3((benchPosition.x + place.x) / 2 + .43, 0, (benchPosition.z + place.z) / 2 + .65),
      companion: new THREE.Vector3(place.x - 1.21, 0, place.z + .80),
      width: 8.5, height: 5.5, centerY: 2.85,
    };
    framePlazaFocus();
    if (companion) {
      companionSpot(companion.pos);
      companion.vel.set(0, 0, 0);
      companion.onGround = true;
    }
    syncPlazaAction();
  }

  function startBenchClimb(withCompanion) {
    releaseHeldControls();
    setBubble(null);
    setPlazaReply(null);
    if (withCompanion) {
      if (companionBeat || plazaState.servingFor > 0) companion.setEmote('normal');
      companionBeat = null;
    }
    benchClimb.start(player, withCompanion ? companion : null);
    const { x, z } = plaza.bench.position;
    plazaState.focus = {
      point: new THREE.Vector3(x + .10, 0, z + .5),
      companion: new THREE.Vector3(x + 1.94, 0, z + 2.5),
      width: 3.9, height: 6.04, centerY: 5.22,
    };
    appState.yawDeg = 12;
    appState.pitchDeg = 10;
    framePlazaFocus();
    appState.targetYawDeg = appState.targetPitchDeg = null;
    appState.autoRotate = false;
    document.getElementById('chkAutoRot').checked = false;
    updateEmoteUI();
    playSfx('jump');
  }

  function framePlazaFocus() {
    const focus = plazaState.focus;
    // Leave room above and below the framed area for the plaza controls.
    const height = graphics.height;
    const top = Math.min(108, height * .25);
    const bottom = Math.min(viewportWrap.classList.contains('with-pad') ? 231 : 105, height * .42);
    const visibleHeight = height - top - bottom;
    const viewHeight = Math.max(focus.height * height / visibleHeight, focus.width / camera.aspect);
    const verticalSpan = 2 * Math.tan(camera.fov * RAD / 2);
    appState.distance = clamp(viewHeight / verticalSpan, 4, MAX_CAMERA_DISTANCE);
    focus.point.y = focus.centerY + (top - bottom) / (2 * height) * appState.distance * verticalSpan;
  }

  function cancelBenchClimb() {
    if (!benchClimb.active) return;
    benchClimb.cancel();
    plazaState.focus = null;
    updateEmoteUI();
  }

  function setSnackStage(stage) {
    plazaState.snack = stage;
    plaza.center.topping.visible = stage >= 1;
    plaza.left.visible = plaza.right.visible = plaza.residentSnack.visible = stage === 2;
    syncPlazaAction();
  }

  function getPlazaAction() {
    if (appState.mode !== 'world') return null;
    if (benchClimb.active) return benchClimb.seated ? 'dismount' : null;
    const table = plaza.snackTable.position;
    const snackDistance = Math.hypot(player.pos.x - table.x, player.pos.z - table.z);
    const benchDistance = benchClimb.distanceToResident(player);
    const withCompanion = companion?.onGround && benchClimb.distanceToResident(companion) <= BENCH_REACH + 1.2;
    if ((!player.isGonyani || withCompanion) && player.onGround && benchDistance <= BENCH_REACH
      && (snackDistance > 1.95 || benchDistance < snackDistance)) return withCompanion ? 'climbTogether' : 'climb';
    return snackDistance <= 1.95 ? 'snack' : null;
  }

  function syncPlazaAction() {
    const action = getPlazaAction();
    const labels = { climb: 'のぼる', climbTogether: 'ふたりでのぼる', dismount: 'おりる', snack: snackActions[plazaState.snack] };
    const label = labels[action] || '';
    plazaActionButton.classList.toggle('hidden', !action);
    if (plazaActionButton.textContent !== label) plazaActionButton.textContent = label;
  }

  function usePlazaAction() {
    const action = getPlazaAction();
    if (action === 'climb' || action === 'climbTogether') startBenchClimb(action === 'climbTogether');
    else if (action === 'dismount') benchClimb.dismount();
    else if (action === 'snack') serveSnack();
    syncPlazaAction();
  }

  function serveSnack() {
    const stage = (plazaState.snack + 1) % 3;
    setSnackStage(stage);
    if (stage === 0) {
      plazaState.servingFor = 0;
      if (companion?.activeEmote === 'sit') companion.setEmote('normal');
      if (plazaReply?.speaker === 'resident') setPlazaReply(null);
      return;
    }
    const table = plaza.snackTable.position;
    spawnRiceSparkles(table);
    playSfx('eat');
    if (stage === 1) return;

    visitPlazaSpot('snack');
    plazaState.servingFor = 4.8;
    if (!companion) createCompanion(plazaState.focus.companion);
    companionBeat = null;
    companion.setEmote('sit');
    player.setEmote('sit');
    setBubble(player.isGonyani ? '…' : 'もぐ もぐ', 3.2);
    setPlazaReply('resident', '…ありがとう', 3.3);
    updateEmoteUI();
    updateStatus();
  }

  function spawnCrowd(num = 5) {
    const { character } = player;
    const funEmotes = player.isGonyani
      ? ['normal', 'stare', 'wary']
      : ['normal', 'happy', 'hug', 'du', 'fierce', 'angel', 'devil', 'rose'];
    for (let i = 0; i < num; i++) {
      const npc = new StudioCharacter(character, characterAssets[character.id], worldScene, charScene, false, appState.styleMode);
      const ang = Math.random() * Math.PI * 2;
      const dist = 2.0 + Math.random() * 5.2;
      npc.pos.set(
        clamp(player.pos.x + Math.cos(ang) * dist, -WORLD_HALF + 1.5, WORLD_HALF - 1.5),
        0.5 + Math.random() * 0.9,
        clamp(player.pos.z + Math.sin(ang) * dist, -WORLD_HALF + 1.5, WORLD_HALF - 1.5)
      );
      npc.onGround = false;
      npc.yaw = Math.random() * Math.PI * 2;
      npc.quadMode = Math.random() < 0.35;
      npc.quadBlend = npc.quadMode ? 1 : 0;
      npc.setEmote(funEmotes[Math.floor(Math.random() * funEmotes.length)]);
      npc.aiMode = Math.random() < 0.58 ? 'chaseBall' : 'wander';
      npc.setVisible(appState.mode === 'world');
      crowd.push(npc);
    }
    playSfx('spawn');
    updateStatus();
    showToast(`✨ ${character.label}が ${num}体 追加されました`);
  }

  function clearCrowd() {
    if (crowd.length === 0) return;
    crowd.forEach((npc) => npc.dispose(worldScene, charScene));
    crowd.length = 0;
    updateStatus();
    showToast('🧹 追加したキャラクターをクリアしました');
  }

  // Build BOTH Desktop/Drawer Emote Grid & Mobile Horizontal Emote Pill Strip
  const emoteGrid = document.getElementById('emoteGrid');
  const mobileEmoteStrip = document.getElementById('mobileEmoteStrip');
  const characterButtons = document.querySelectorAll('#characterPicker [data-character]');
  characterButtons.forEach((btn) => btn.addEventListener('click', () => selectCharacter(btn.dataset.character)));

  function buildEmoteControls() {
    emoteGrid.replaceChildren();
    mobileEmoteStrip.replaceChildren();
    formMenuEl.replaceChildren();
    setFormMenu(false);
    mobileEmoteBarEl.scrollLeft = 0;
    document.getElementById('emoteKeyHint').textContent = player.isGonyani ? '1–5' : '1–0';
    player.emotes.forEach((em) => {
      if (em.form || em.id === 'normal' || em.id === 'sleep') {
        const option = document.createElement('button');
        option.type = 'button';
        option.dataset.emote = em.id;
        option.className = 'form-option character-btn rounded-xl px-2.5 py-1 text-xs font-extrabold';
        option.textContent = `${em.icon} ${em.label}`;
        option.addEventListener('click', () => {
          triggerEmote(em.id);
          setFormMenu(false);
          formsButton.focus({ preventScroll: true });
        });
        formMenuEl.appendChild(option);
      }
      if (em.form) return;
      const btn = document.createElement('button');
      btn.dataset.emote = em.id;
      btn.className = 'emote-btn pixel-btn bg-white hover:bg-pink-50 rounded-xl px-2 py-1.5 text-[11px] font-extrabold flex items-center justify-between gap-1 text-left';
      const keyHtml = em.key ? `<span class="mono text-[9px] opacity-55">[${em.key}]</span>` : '';
      btn.innerHTML = `<span class="truncate flex items-center gap-1"><span>${em.icon}</span><span class="truncate">${em.label}</span></span>${keyHtml}`;
      btn.addEventListener('click', () => triggerEmote(em.id));
      emoteGrid.appendChild(btn);

      const pill = document.createElement('button');
      pill.dataset.emote = em.id;
      pill.className = 'emote-pill';
      pill.innerHTML = `<span>${em.icon}</span><span>${em.label}</span>`;
      pill.addEventListener('click', () => {
        triggerEmote(em.id);
      });
      mobileEmoteStrip.appendChild(pill);
    });
    updateEmoteUI();
  }

  function updateEmoteUI() {
    document.querySelectorAll('.emote-btn').forEach((btn) => {
      const act = btn.dataset.emote === player.activeEmote;
      btn.classList.toggle('active', act);
      btn.classList.toggle('bg-white', !act);
    });
    document.querySelectorAll('.emote-pill').forEach((pill) => {
      pill.classList.toggle('active', pill.dataset.emote === player.activeEmote);
    });
    formMenuEl.querySelectorAll('button').forEach((option) => {
      const active = option.dataset.emote === player.activeEmote;
      option.classList.toggle('active', active);
      option.setAttribute('aria-pressed', String(active));
    });
  }

  buildEmoteControls();

  function switchMode(mode) {
    cancelBenchClimb();
    appState.mode = mode;
    appState.targetYawDeg = null;
    appState.targetPitchDeg = null;
    appState.studioFormZoom = null;
    releaseHeldControls();
    plazaState.focus = null;
    plazaState.attention = 0;
    plazaState.servingFor = 0;
    companionBeat = null;
    companion?.setEmote('normal');
    setBubble(null);
    setPlazaReply(null);
    setFormMenu(false);
    const isWorld = mode === 'world';
    viewportWrap.classList.toggle('world-mode', isWorld);
    world.setMode(mode);
    crowd.forEach((npc) => npc.setVisible(isWorld));
    companion?.setVisible(isWorld);

    const isPortrait = graphics.width < graphics.height;
    if (!isWorld) {
      player.pos.set(0, 0, 0);
      player.vel.set(0, 0, 0);
      player.yaw = 0;
      player.onGround = true;
      appState.distance = isPortrait ? 7.6 : 6.2;
      appState.pitchDeg = 12;
      appState.yawDeg = 28;
      refreshPlayerPose();
      frameStudioForm(player.renderPose);
    } else {
      appState.distance = isPortrait ? 11.2 : 10.0;
      appState.pitchDeg = 22;
    }

    document.getElementById('crowdPanel').classList.toggle('hidden', !isWorld);
    menus.setWorld(isWorld);
    syncPlazaAction();
    document.getElementById('worldKeyHints').classList.toggle('hidden', !isWorld);
    document.getElementById('studioHintText').classList.toggle('hidden', isWorld);

    const bW = document.getElementById('btnModeWorld');
    const bS = document.getElementById('btnModeStudio');
    bW.className = `px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition-colors ${isWorld ? 'bg-[#222532] text-white' : 'text-[#222532] hover:bg-slate-200/70'}`;
    bS.className = `px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold transition-colors ${!isWorld ? 'bg-[#222532] text-white' : 'text-[#222532] hover:bg-slate-200/70'}`;

    syncVirtualPadVisibility();
    syncCameraSliders(true);
    updateStatus();
  }

  // Top HUD & Drawer Wiring
  document.getElementById('btnModeWorld').addEventListener('click', () => switchMode('world'));
  document.getElementById('btnModeStudio').addEventListener('click', () => switchMode('studio'));

  document.querySelectorAll('.style-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      playSfx('emote');
      setModelStyle(btn.dataset.style, true);
    });
  });
  document.getElementById('chkFlatShade').addEventListener('change', (e) => {
    appState.flatShading = e.target.checked;
    globalRenderUniforms.uFlatMix.value = appState.flatShading ? 1.0 : 0.0;
  });
  document.getElementById('chkWireframe').addEventListener('change', (e) => {
    appState.wireframeOn = e.target.checked;
    player.setWireframe(appState.wireframeOn);
  });

  document.getElementById('btnQuickSpawn').addEventListener('click', () => spawnCrowd(5));
  document.getElementById('btnSpawn5').addEventListener('click', () => spawnCrowd(5));
  document.getElementById('btnClearCrowd').addEventListener('click', clearCrowd);
  companionButton.addEventListener('click', () => {
    if (appState.mode !== 'world') return;
    if (companion) {
      dismissCompanion();
    } else {
      createCompanion(companionSpot(new THREE.Vector3()));
    }
    syncPlazaAction();
  });
  document.getElementById('btnVisitBench').addEventListener('click', () => visitPlazaSpot('bench'));
  document.getElementById('btnVisitSnack').addEventListener('click', () => visitPlazaSpot('snack'));
  plazaActionButton.addEventListener('click', usePlazaAction);
  document.getElementById('btnPet').addEventListener('click', () => petActor(player));
  document.getElementById('btnScenePhoto').addEventListener('click', takeScenePhoto);
  document.getElementById('btnStyleBiped').addEventListener('click', () => setQuadMode(false));
  document.getElementById('btnStyleQuad').addEventListener('click', () => setQuadMode(true));

  function toggleSound() {
    const soundEnabled = toggleAudio();
    const icon = soundEnabled ? '🔊' : '🔇';
    document.getElementById('btnSoundDrawer').textContent = icon;
    showToast(soundEnabled ? '🔊 効果音 ON' : '🔇 効果音 OFF');
  }
  document.getElementById('btnSoundDrawer').addEventListener('click', toggleSound);

  document.getElementById('btnReset').addEventListener('click', () => {
    cancelBenchClimb();
    const isPortrait = graphics.width < graphics.height;
    appState.yawDeg = 35;
    appState.pitchDeg = appState.mode === 'world' ? 22 : 16;
    appState.distance = appState.mode === 'world' ? (isPortrait ? 11.2 : 10.0) : (isPortrait ? 7.6 : 6.2);
    appState.studioFormZoom = null;
    appState.targetYawDeg = null;
    appState.targetPitchDeg = null;
    plazaState.focus = null;
    player.pos.set(0, 0, appState.mode === 'world' ? 0.6 : 0);
    player.vel.set(0, 0, 0);
    player.yaw = 0;
    player.onGround = true;
    if (appState.mode === 'studio') {
      refreshPlayerPose();
      frameStudioForm(player.renderPose);
    }
    ballState.pos.set(2.8, ballState.radius, 2.0);
    ballState.vel.set(0, 0, 0);
    syncCameraSliders(true);
    showToast('↺ カメラと配置をリセットしました');
  });

  // Camera Sliders
  sliderZoomEl.addEventListener('input', (e) => {
    appState.distance = clamp(parseFloat(e.target.value), 4, MAX_CAMERA_DISTANCE);
    syncCameraSliders(true);
  });
  sliderPitchEl.addEventListener('input', (e) => {
    appState.targetPitchDeg = null;
    appState.pitchDeg = clamp(parseFloat(e.target.value), 6, 68);
    syncCameraSliders(true);
  });

  // 画面の縦横比を保ちながら、短辺の描画解像度を選ぶ。
  document.querySelectorAll('.px-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pixelSize = Number(btn.dataset.px);
      graphics.setPixelSize(pixelSize);
      document.getElementById('pixelSizeLabel').textContent = pixelSize + ' px';
      document.querySelectorAll('.px-btn').forEach((b) => {
        const act = b === btn;
        b.classList.toggle('active', act);
        b.classList.toggle('bg-white', !act);
      });
      updateStatus();
    });
  });

  document.getElementById('chkOutline').addEventListener('change', (e) => {
    appState.outlineOn = e.target.checked;
    graphics.setOutline(appState.outlineOn);
  });
  document.getElementById('chkAutoRot').addEventListener('change', (e) => {
    appState.autoRotate = e.target.checked;
  });
  chkVirtualPadEl.addEventListener('change', (e) => {
    appState.showVirtualPad = e.target.checked;
    syncVirtualPadVisibility();
  });

  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.autoRotate = false;
      document.getElementById('chkAutoRot').checked = false;
      appState.targetYawDeg = parseFloat(btn.dataset.yaw);
      appState.targetPitchDeg = parseFloat(btn.dataset.pitch);
    });
  });

  function refreshPlayerPose() {
    const studio = appState.mode === 'studio';
    const speed = studio ? 0 : Math.hypot(player.vel.x, player.vel.z);
    player.updateAnimation(0, speed, player.sprinting, studio, benchClimb.isSeated(player));
  }

  function finishPlayerWalkTransition() {
    player.quadBlend = Number(player.quadMode && !benchClimb.isSeated(player));
    refreshPlayerPose();
  }

  document.getElementById('btnExportPng').addEventListener('click', () => {
    finishPlayerWalkTransition();
    const excluded = [worldPropsGroup, treeOccluders, companion?.root, ...crowd.map((c) => c.root)];
    let image;
    try {
      const { raw, width, height } = graphics.readCharacterPixels(excluded);
      image = createTransparentPng(raw, width, height, appState.outlineOn);
    } catch {
      showToast('⚠️ 透過PNGを保存できませんでした');
      return;
    }
    if (!image) {
      showToast('⚠️ キャラクターが画面内に見つかりませんでした');
      return;
    }
    const yaw = Math.round(appState.yawDeg);
    const filename = player.character.id + '_' + player.activeEmote + '_' + yaw + 'deg_transparent.png';
    downloadFile(filename, image);
    showToast('📷 透過PNGを保存しました');
  });

  document.getElementById('btnExportGlb').addEventListener('click', () => {
    finishPlayerWalkTransition();
    const model = buildCharacterGlb(player, appState.flatShading);
    if (!model) {
      showToast('⚠️ 書き出し対象のメッシュが見つかりませんでした');
      return;
    }
    const filename = player.character.id + '_' + appState.styleMode + '_' + player.activeEmote + '.glb';
    downloadFile(filename, model);
    showToast('📦 GLBを書き出しました');
  });

  const tapRaycaster = new THREE.Raycaster();
  const tapNdc = new THREE.Vector2();
  function petAtPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    tapNdc.set(x * 2 - 1, 1 - y * 2);
    tapRaycaster.setFromCamera(tapNdc, camera);

    const actors = companion?.root.visible ? [player, companion] : [player];
    const owners = new Map();
    actors.forEach((actor) => {
      actor.root.traverseVisible((node) => {
        if (node.isMesh && !node.userData.isWireframe) owners.set(node, actor);
      });
    });
    const [hit] = tapRaycaster.intersectObjects([...owners.keys()]);
    if (!hit) return;
    if (appState.mode === 'world') {
      const scenery = [];
      [treeOccluders, worldPropsGroup].forEach((group) => group.traverseVisible((node) => {
        if (node.isMesh) scenery.push(node);
      }));
      const [obstruction] = tapRaycaster.intersectObjects(scenery);
      if (obstruction && obstruction.distance < hit.distance - .02) return;
    }
    petActor(owners.get(hit.object));
  }

  const { resetJoystick, releaseHeldControls } = bindControls(canvas, appState, {
    jump: triggerJump,
    toggleQuad: () => setQuadMode(!player.quadMode),
    notifyDash: (enabled) => {
      playSfx('emote');
      showToast(enabled ? '💨 ダッシュON' : '🚶 通常スピード');
    },
    stopAutoRotate: () => { document.getElementById('chkAutoRot').checked = false; },
    tap: petAtPoint,
    handleGlobalKey: menus.handleKey,
    handleShortcut: (event) => {
      if (event.code === 'KeyF') { petActor(player); return; }
      if (event.code === 'KeyP') { takeScenePhoto(); return; }
      if (event.code === 'KeyE' && appState.mode === 'world') { usePlazaAction(); return; }
      if (event.code === 'KeyQ') { setQuadMode(!player.quadMode); return; }
      const emote = player.emotes.find((option) => option.key && option.key === event.key);
      if (emote) triggerEmote(emote.id);
    },
  });

  // Orientation & mobile browser dynamic toolbar resize handling
  let orientTimer = null;
  function handleViewportChange() {
    rebuildRenderTargets();
    if (orientTimer) clearTimeout(orientTimer);
    orientTimer = setTimeout(() => {
      rebuildRenderTargets();
      if (appState.studioFormZoom !== null) fitStudioFormZoom();
      menus.syncLayout();
      syncVirtualPadVisibility();
      if (plazaState.focus) framePlazaFocus();
    }, 140);
  }
  window.addEventListener('orientationchange', handleViewportChange);
  window.addEventListener('resize', handleViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportChange);
  }

  const camTarget = new THREE.Vector3(0, 1.1, 0);
  const _projVec = new THREE.Vector3();
  const companionGoal = new THREE.Vector3();

  const interactWithWorld = createWorldInteractions(world, setBubble);

  function updatePlaza(dt, timeSec) {
    const bench = plaza.bench.position;
    const dx = player.pos.x - bench.x - plaza.resident.position.x;
    const dz = player.pos.z - bench.z;
    const oldAttention = plazaState.attention;
    const near = Math.hypot(dx, dz) < BENCH_REACH + (oldAttention > 0 ? .3 : 0);
    plazaState.attention = near ? oldAttention + dt : 0;
    const lookingUp = benchClimb.active || plazaState.attention > .24 || plazaState.servingFor > 0;
    const turn = lookingUp && !benchClimb.active ? clamp(Math.atan2(dx, dz), -.58, .58) : 0;
    const nod = plazaState.servingFor > 0 ? .055 * Math.sin(timeSec * 9) : 0;
    const follow = Math.min(1, dt * 6);
    const reaction = benchClimb.reaction;
    plaza.head.rotation.y += (turn - plaza.head.rotation.y) * follow;
    plaza.head.rotation.x += ((lookingUp ? -.045 + nod - .12 * reaction : .22) - plaza.head.rotation.x) * follow;
    plaza.head.rotation.z += (-.07 * reaction - plaza.head.rotation.z) * follow;
    plaza.phone.rotation.x += ((lookingUp ? -1.36 - .15 * reaction : -1.1) - plaza.phone.rotation.x) * follow;
    if (!benchClimb.active && oldAttention < .65 && plazaState.attention >= .65 && !plazaReply) {
      setPlazaReply('resident', '…', 1.7);
    }
    if (plazaState.servingFor > 0) {
      plazaState.servingFor = Math.max(0, plazaState.servingFor - dt);
      if (plazaState.servingFor === 0 && companion?.activeEmote === 'sit') companion.setEmote('normal');
    }
    syncPlazaAction();
  }

  function updateCompanion(dt) {
    if (!companion) return;
    if (benchClimb.hasRider(companion)) {
      companion.updateAnimation(dt, 0, false, false, benchClimb.isSeated(companion));
      return;
    }
    const dx = player.pos.x - companion.pos.x;
    const dz = player.pos.z - companion.pos.z;
    const near = Math.hypot(dx, dz) < 2.65;
    const beat = companionBeat;
    if (beat) {
      if (beat.wait > 0) {
        beat.wait -= dt;
        if (beat.wait <= 0) {
          companion.setEmote(beat.emote);
          setPlazaReply('companion', companion.emotes.find((emote) => emote.id === beat.emote).bubble);
        }
      } else {
        beat.remaining -= dt;
        if (beat.remaining <= 0) {
          companion.setEmote('normal');
          companionBeat = null;
        }
      }
    }

    const atTable = plazaState.servingFor > 0 && near;
    let speed = 0;
    const viewYaw = appState.yawDeg * RAD;
    let aim = viewYaw;
    if ((companionBeat && near) || atTable) {
      const sideLook = THREE.MathUtils.euclideanModulo(Math.atan2(dx, dz) - viewYaw + Math.PI, 2 * Math.PI) - Math.PI;
      aim += clamp(sideLook, -.68, .68);
    } else {
      companionSpot(companionGoal);
      const sx = companionGoal.x - companion.pos.x;
      const sz = companionGoal.z - companion.pos.z;
      const distance = Math.hypot(sx, sz);
      if (distance > .14) {
        speed = Math.min(6, (distance - .14) * 3.6);
        const step = Math.min(distance, dt * speed) / distance;
        companion.pos.x += sx * step;
        companion.pos.z += sz * step;
        aim = Math.atan2(sx, sz);
      }
    }
    const turn = THREE.MathUtils.euclideanModulo(aim - companion.yaw + Math.PI, 2 * Math.PI) - Math.PI;
    companion.yaw += turn * Math.min(1, dt * 9);
    if (!plazaState.focus) interactWithWorld(companion, dt, false);
    companion.updateAnimation(dt, speed, speed > 3.8, false);
  }

  function projectBubble(element, worldPos, hideOutside = false) {
    worldPos.project(camera);
    const rawX = (worldPos.x * .5 + .5) * graphics.width;
    const rawY = (-worldPos.y * .5 + .5) * graphics.height - 14;
    const halfW = (element.offsetWidth || 110) * .5 + 12;
    const topClearance = 103;
    const minY = topClearance + (element.offsetHeight || 34);
    const outside = rawX < 0 || rawX > graphics.width || rawY < 0 || rawY > graphics.height || Math.abs(worldPos.z) > 1;
    element.style.visibility = hideOutside && outside ? 'hidden' : '';
    element.style.left = `${Math.round(clamp(rawX, halfW, Math.max(halfW, graphics.width - halfW)))}px`;
    element.style.top = `${Math.round(clamp(rawY, minY, Math.max(minY, graphics.height - 165)))}px`;
  }

  function updateSimulation(dt, timeSec) {
    const isDraggingCanvas = appState.canvasPointers.size > 0;
    if (appState.autoRotate && !isDraggingCanvas) {
      appState.yawDeg = (appState.yawDeg + dt * 36) % 360;
    } else {
      if (appState.targetYawDeg !== null) {
        let diff = appState.targetYawDeg - appState.yawDeg;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        if (Math.abs(diff) < 0.4) {
          appState.yawDeg = appState.targetYawDeg;
          appState.targetYawDeg = null;
        } else {
          appState.yawDeg = (appState.yawDeg + diff * Math.min(1, dt * 9) + 360) % 360;
        }
      }
      if (appState.targetPitchDeg !== null) {
        const diff = appState.targetPitchDeg - appState.pitchDeg;
        if (Math.abs(diff) < 0.4) {
          appState.pitchDeg = appState.targetPitchDeg;
          appState.targetPitchDeg = null;
        } else {
          appState.pitchDeg += diff * Math.min(1, dt * 9);
        }
      }
    }

    syncCameraSliders(false);

    const isStudio = appState.mode === 'studio';

    if (!isStudio) {
      const climbing = benchClimb.active;
      const { moving, sprinting } = movePlayer(player, appState, climbing ? 0 : dt);
      if (climbing) {
        if (moving) benchClimb.dismount();
        benchClimb.update(dt);
        if (!benchClimb.active) {
          plazaState.focus = null;
          updateEmoteUI();
        }
      } else {
        if (moving) plazaState.focus = null;
        interactWithWorld(player, dt, true);
      }
      const speed = Math.hypot(player.vel.x, player.vel.z);
      if (player.updateAnimation(dt, speed, !climbing && sprinting, false, benchClimb.isSeated(player))) updateStatus();
      updatePlaza(dt, timeSec);
      updateCompanion(dt);

      updateCrowd(player, companion, crowd, ballState, interactWithWorld, dt);
      world.updateProps(dt, timeSec);
    } else {
      player.updateAnimation(dt, 0, false, true);
    }

    // Orbit Camera Update
    const studioHeight = player.floorPose ? .72 : (player.renderPose === 'mochi' ? .99 : 1.15);
    let focus = isStudio
      ? _projVec.set(0, studioHeight, 0)
      : (plazaState.focus?.point || _projVec.set(player.pos.x, player.pos.y + 1.15, player.pos.z));
    if (benchClimb.active && graphics.width <= 360 && menus.plazaOpen) {
      focus = _projVec.copy(focus);
      focus.x += 1.12;
    }
    if (!isStudio && !plazaState.focus && companion && companion.pos.distanceTo(player.pos) < 2.7) {
      focus.x += (companion.pos.x - player.pos.x) * .34;
      focus.z += (companion.pos.z - player.pos.z) * .34;
    }
    camTarget.lerp(focus, Math.min(1, dt * 8));

    const yawRad = appState.yawDeg * RAD;
    const pitchRad = appState.pitchDeg * RAD;
    const horiz = appState.distance * Math.cos(pitchRad);
    camera.position.set(
      camTarget.x + Math.sin(yawRad) * horiz,
      camTarget.y + Math.sin(pitchRad) * appState.distance,
      camTarget.z + Math.cos(yawRad) * horiz
    );
    camera.lookAt(camTarget);
    camera.updateMatrixWorld();

    // Project & Clamp Floating Speech Bubble inside Screen Edges (Never Overflows on Narrow Phones!)
    if (appState.bubbleTimer > 0) {
      appState.bubbleTimer -= dt;
      if (appState.bubbleTimer <= 0) {
        setBubble(null, 0);
      } else {
        projectBubble(speechBubbleEl, player.getHeadTopWorldPos(_projVec));
      }
    }
    if (plazaReply) {
      plazaReply.remaining -= dt;
      if (plazaReply.remaining <= 0) {
        setPlazaReply(null);
      } else {
        if (plazaReply.speaker === 'resident') {
          plaza.head.getWorldPosition(_projVec);
          _projVec.y += .82 * plaza.resident.scale.y;
        } else {
          companion.getHeadTopWorldPos(_projVec);
        }
        projectBubble(plazaBubbleEl, _projVec, true);
      }
    }
  }

  let lastNow = 0;
  function animate(now) {
    if (!lastNow) lastNow = now;
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    updateSimulation(dt, now * 0.001);
    renderPipeline();
    requestAnimationFrame(animate);
  }

  setModelStyle('ps1', false);
  menus.syncLayout();
  switchMode('studio');
  setSnackStage(0);
  requestAnimationFrame(animate);
}

try {
  initApp();
} catch (error) {
  const banner = document.getElementById('errorBanner');
  const text = document.getElementById('errorText');
  text.textContent = error instanceof Error ? error.message : String(error);
  banner.classList.remove('hidden');
}
