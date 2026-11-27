export const isCompactViewport = () => window.innerWidth < 860 || window.innerHeight <= 500;

export function createMenus(viewport, { releaseInputs, onLayoutChange }) {
  const chrome = document.getElementById('hudChrome');
  const hudToggle = document.getElementById('btnToggleHud');
  const drawer = document.getElementById('settingsDrawer');
  const drawerToggle = document.getElementById('btnOpenSettings');
  const drawerClose = document.getElementById('btnCloseDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const plazaTools = document.getElementById('plazaTools');
  const plazaMenu = document.getElementById('worldStops');
  const plazaToggle = document.getElementById('btnPlazaMenu');
  const sceneActions = document.getElementById('sceneActions');
  const formMenu = document.getElementById('formMenu');
  const formsToggle = document.getElementById('btnForms');
  const emoteMenu = document.getElementById('mobileEmoteBar');
  const emoteToggle = document.getElementById('btnEmotes');
  let drawerOpen = false;
  let clean = false;

  function isMobileDrawerOpen() {
    return drawerOpen && !clean && isCompactViewport();
  }

  function syncLayout() {
    const visible = drawerOpen && !clean;
    const modal = isMobileDrawerOpen();
    drawer.classList.toggle('desktop-hidden', !visible || modal);
    drawer.classList.toggle('open', modal);
    drawer.inert = !visible;
    backdrop.classList.toggle('open', modal);
    viewport.inert = modal;
    drawerToggle.setAttribute('aria-expanded', String(visible));
  }

  function setFormMenu(open) {
    formMenu.hidden = !open;
    formsToggle.setAttribute('aria-expanded', String(open));
  }

  function setPlazaMenu(open) {
    plazaMenu.hidden = !open;
    plazaToggle.setAttribute('aria-expanded', String(open));
  }

  function setEmoteMenu(open) {
    emoteMenu.hidden = !open;
    emoteToggle.setAttribute('aria-expanded', String(open));
  }

  function closePopovers() {
    setFormMenu(false);
    setPlazaMenu(false);
    setEmoteMenu(false);
  }

  function setDrawer(open) {
    releaseInputs();
    drawerOpen = open;
    closePopovers();
    syncLayout();
    onLayoutChange();
    if (isMobileDrawerOpen()) drawerClose.focus({ preventScroll: true });
    if (!open) drawerToggle.focus({ preventScroll: true });
  }

  function toggleHud() {
    releaseInputs();
    clean = !clean;
    chrome.hidden = clean;
    viewport.classList.toggle('clean-view', clean);
    closePopovers();
    const label = clean ? 'UIを表示' : 'UIを隠す';
    hudToggle.querySelector('.hud-toggle-label').textContent = label;
    hudToggle.setAttribute('aria-pressed', String(clean));
    hudToggle.setAttribute('aria-label', label);
    hudToggle.title = label + '（Hキー）';
    syncLayout();
    onLayoutChange();
    (isMobileDrawerOpen() ? drawerClose : hudToggle).focus({ preventScroll: true });
  }

  function setWorld(isWorld) {
    plazaTools.hidden = !isWorld;
    closePopovers();
  }

  function handleKey(event) {
    const isEditor = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]');
    if (event.code === 'KeyH' && !isEditor) {
      if (!event.repeat) toggleHud();
      return true;
    }
    if (isMobileDrawerOpen()) {
      if (event.key === 'Escape') setDrawer(false);
      return true;
    }
    if (event.key !== 'Escape') return false;
    if (clean) toggleHud();
    else if (!formMenu.hidden) {
      setFormMenu(false);
      formsToggle.focus({ preventScroll: true });
    } else if (!plazaMenu.hidden) {
      setPlazaMenu(false);
      plazaToggle.focus({ preventScroll: true });
    } else if (!emoteMenu.hidden) {
      setEmoteMenu(false);
      emoteToggle.focus({ preventScroll: true });
    } else if (drawerOpen) setDrawer(false);
    else return false;
    return true;
  }

  hudToggle.addEventListener('click', toggleHud);
  document.getElementById('btnHideFromDrawer').addEventListener('click', toggleHud);
  drawerToggle.addEventListener('click', () => setDrawer(!drawerOpen));
  drawerClose.addEventListener('click', () => setDrawer(false));
  backdrop.addEventListener('click', () => setDrawer(false));
  plazaToggle.addEventListener('click', () => {
    setFormMenu(false);
    setEmoteMenu(false);
    setPlazaMenu(plazaMenu.hidden);
  });
  plazaMenu.addEventListener('click', (event) => {
    if (event.target.closest('button')) {
      setPlazaMenu(false);
      plazaToggle.focus({ preventScroll: true });
    }
  });
  formsToggle.addEventListener('click', () => {
    setPlazaMenu(false);
    setEmoteMenu(false);
    setFormMenu(formMenu.hidden);
  });
  emoteToggle.addEventListener('click', () => {
    setPlazaMenu(false);
    setFormMenu(false);
    setEmoteMenu(emoteMenu.hidden);
  });
  emoteMenu.addEventListener('click', (event) => {
    if (event.target.closest('button')) {
      setEmoteMenu(false);
      emoteToggle.focus({ preventScroll: true });
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!sceneActions.contains(event.target)) setFormMenu(false);
    if (!plazaTools.contains(event.target)) setPlazaMenu(false);
    if (!emoteMenu.contains(event.target) && !emoteToggle.contains(event.target)) setEmoteMenu(false);
  });

  return {
    get clean() { return clean; },
    get plazaOpen() { return !plazaMenu.hidden; },
    syncLayout, setFormMenu, setWorld, handleKey,
  };
}
