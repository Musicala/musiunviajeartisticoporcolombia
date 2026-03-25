// ======================================
// MUSI
// app.js
// Orquestador principal de la aplicación
// Versión saneada para el flujo real:
// index -> boot -> story -> mapa -> perfil
// Sin menu/login/title/intro fantasmas
// ======================================

import {
  onUserChange,
  getCurrentUser,
  ensureUserDocument,
  waitForAuthReady,
  renderAuthUserUI,
  renderAuthVisibility,
  hasSeenIntro,
  markIntroSeen,
  clearIntroSeen,
  syncIntroSeenToProfile,
  setPostLoginRedirect
} from "./auth.js";

import {
  getUserProgress,
  createInitialProgressIfNeeded,
  grantFirstLoginXP
} from "./progress.js";

import {
  trackLogin,
  trackCustomEvent
} from "./analytics.js";

/* ======================================
   CONFIG
====================================== */

const DEFAULT_REGION = "caribe";
const APP_EVENT_NAMESPACE = "musi";

const PAGE_NAMES = {
  INDEX: "index",
  BOOT: "boot",
  STORY: "story",
  MAPA: "mapa",
  PERFIL: "perfil"
};

const GAME_ROUTES = {
  home: "index.html",
  boot: "boot.html",
  story: "story.html",
  mapa: "mapa.html",
  profile: "perfil.html"
};

const REGION_LABELS = {
  caribe: "Caribe",
  andina: "Andina",
  pacifica: "Pacífica",
  orinoquia: "Orinoquía",
  amazonia: "Amazonía",
  insular: "Insular"
};

const STORAGE_KEYS = {
  bootSeen: "musi_boot_seen",
  storySeen: "musi_story_seen"
};

/* ======================================
   ESTADO GLOBAL
====================================== */

const appState = {
  initialized: false,
  initializing: false,
  bootstrapping: false,
  authReady: false,
  progressReady: false,
  navigationReady: false,
  user: null,
  progress: null,
  pageName: getPageName(),
  unsubscribers: [],
  lastBootstrappedUid: "",
  sessionStartedAt: Date.now(),
  currentRoute: window.location.pathname,
  hasSeenIntro: hasSeenIntro()
};

window.MUSI_APP = appState;

/* ======================================
   HELPERS DOM
====================================== */

const $ = (selector, root = document) => root.querySelector(selector);

function setText(selector, value, fallback = "-") {
  const el = typeof selector === "string" ? $(selector) : selector;
  if (!el) return;
  el.textContent = String(value ?? fallback);
}

function setHTML(selector, value, fallback = "") {
  const el = typeof selector === "string" ? $(selector) : selector;
  if (!el) return;
  el.innerHTML = String(value ?? fallback);
}

function showElement(selector) {
  const el = typeof selector === "string" ? $(selector) : selector;
  if (!el) return;
  el.classList.remove("hidden");
  el.hidden = false;
  el.setAttribute("aria-hidden", "false");
}

function hideElement(selector) {
  const el = typeof selector === "string" ? $(selector) : selector;
  if (!el) return;
  el.classList.add("hidden");
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setAvatarContent(selector, { initials = "M", photoURL = "", label = "" } = {}) {
  const el = typeof selector === "string" ? $(selector) : selector;
  if (!el) return;

  if (photoURL) {
    el.innerHTML = `<img src="${escapeHTML(photoURL)}" alt="${escapeHTML(label || "Avatar")}">`;
  } else {
    el.innerHTML = "";
    el.textContent = initials;
  }

  if (label) {
    el.setAttribute("title", label);
    el.setAttribute("aria-label", label);
  } else {
    el.removeAttribute("title");
    el.removeAttribute("aria-label");
  }
}

function getPageName() {
  const path = window.location.pathname;
  const file = path.split("/").pop() || "index.html";
  return file.replace(".html", "") || "index";
}

/* ======================================
   HELPERS DE DATOS
====================================== */

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function uniqueArray(values = []) {
  return [...new Set(normalizeArray(values))];
}

function getInitial(name = "") {
  const safeName = String(name || "").trim();
  return safeName ? safeName.charAt(0).toUpperCase() : "M";
}

function calculateLevel(xp = 0) {
  const safeXp = Math.max(0, toNumber(xp, 0));
  return Math.floor(safeXp / 100) + 1;
}

function getLevelBaseXp(level = 1) {
  const safeLevel = Math.max(1, toNumber(level, 1));
  return (safeLevel - 1) * 100;
}

function getLevelProgress(xp = 0) {
  const safeXp = Math.max(0, toNumber(xp, 0));
  const level = calculateLevel(safeXp);
  const currentLevelBase = getLevelBaseXp(level);
  const progressInLevel = safeXp - currentLevelBase;
  const percent = Math.max(0, Math.min(100, Math.round((progressInLevel / 100) * 100)));

  return {
    level,
    currentLevelBase,
    nextLevelBase: getLevelBaseXp(level + 1),
    progressInLevel,
    percent
  };
}

function normalizeProgress(progress = {}) {
  const xp = toNumber(progress?.xp, 0);
  const completedGames = uniqueArray(progress?.completedGames);
  const unlockedRegions = uniqueArray(progress?.unlockedRegions);
  const visitedRegions = uniqueArray(progress?.visitedRegions);

  return {
    uid: progress?.uid || appState.user?.uid || "",
    xp,
    level: toNumber(progress?.level, calculateLevel(xp)),
    completedGames,
    unlockedRegions: unlockedRegions.length ? unlockedRegions : [DEFAULT_REGION],
    visitedRegions,
    completedRegions: uniqueArray(progress?.completedRegions),
    currentRegion: progress?.currentRegion || DEFAULT_REGION,
    lastGame: progress?.lastGame || null,
    updatedAt: progress?.updatedAt || null
  };
}

function normalizeUser(user = null) {
  if (!user) return null;

  const displayName =
    String(user.displayName || user.name || "").trim() ||
    (user.isAnonymous ? "Invitado" : "Jugador");

  return {
    uid: user.uid || "",
    displayName,
    email: user.email || "",
    photoURL: user.photoURL || "",
    initials: user.initials || getInitial(displayName),
    provider: user.provider || (user.isAnonymous ? "anonymous" : "google"),
    isAnonymous: Boolean(user.isAnonymous),
    hasSeenIntro: Boolean(user.hasSeenIntro ?? appState.hasSeenIntro ?? false),
    raw: user.raw || user
  };
}

function getSafeProgress(progress = null) {
  return normalizeProgress(progress || {});
}

function getSafeUser(user = null) {
  return normalizeUser(user);
}

function getRegionLabel(regionId = "") {
  return REGION_LABELS[regionId] || regionId || "Región";
}

function prettifyGameId(gameId = "") {
  if (!gameId) return "Actividad reciente";

  return String(gameId)
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/* ======================================
   HELPERS DE FLUJO / RUTA
====================================== */

function isPage(...names) {
  return names.includes(appState.pageName);
}

function isHomePage() {
  return isPage(PAGE_NAMES.INDEX);
}

function isStoryPage() {
  return isPage(PAGE_NAMES.STORY);
}

function isMapPage() {
  return isPage(PAGE_NAMES.MAPA);
}

function isProfilePage() {
  return isPage(PAGE_NAMES.PERFIL);
}

function hasLocalFlag(key) {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function hasStoryBeenSeen() {
  return hasLocalFlag(STORAGE_KEYS.storySeen) || hasSeenIntro();
}

function getFlowSnapshot() {
  return {
    bootSeen: hasLocalFlag(STORAGE_KEYS.bootSeen),
    storySeen: hasStoryBeenSeen()
  };
}

function getDefaultNextGameScreen() {
  const flow = getFlowSnapshot();

  if (!flow.bootSeen) return GAME_ROUTES.boot;
  if (!flow.storySeen) return GAME_ROUTES.story;
  return GAME_ROUTES.mapa;
}

function safeNavigate(url, { replace = false } = {}) {
  if (!url || typeof url !== "string") return;

  const currentFile = window.location.pathname.split("/").pop() || "";
  if (currentFile === url) return;

  if (replace) {
    window.location.replace(url);
    return;
  }

  window.location.href = url;
}

function updateHasSeenIntroState(value = hasSeenIntro()) {
  const nextValue = Boolean(value);
  appState.hasSeenIntro = nextValue;

  if (appState.user) {
    appState.user = {
      ...appState.user,
      hasSeenIntro: nextValue
    };
  }

  document.body.classList.toggle("has-seen-intro", nextValue);
  document.body.classList.toggle("needs-intro", !nextValue);
}

async function markStoryAsCompleted() {
  markIntroSeen();

  try {
    localStorage.setItem(STORAGE_KEYS.storySeen, "true");
  } catch (error) {
    console.warn("[app] No se pudo guardar musi_story_seen:", error);
  }

  updateHasSeenIntroState(true);

  const uid = appState.user?.uid;
  if (uid) {
    await syncIntroSeenToProfile(uid);
  }

  notifyStateChange("story-completed");
}

async function ensureNavigationRules(user) {
  const normalizedUser = normalizeUser(user);
  const introSeen = hasSeenIntro();

  updateHasSeenIntroState(introSeen);
  appState.navigationReady = true;

  // El flujo actual ya no obliga login para story/mapa/perfil.
  // Se permite invitado y sesión autenticada.
  // Solo guardamos una posible redirección útil si alguien luego inicia sesión.
  const currentFile = window.location.pathname.split("/").pop() || GAME_ROUTES.home;

  if (normalizedUser?.uid) {
    setPostLoginRedirect(currentFile);
  }

  return true;
}

/* ======================================
   CLASES GLOBALES BODY
====================================== */

function resetBodyStateClasses() {
  document.body.classList.remove(
    "is-auth-ready",
    "is-guest",
    "is-user",
    "has-progress",
    "app-ready",
    "app-loading",
    "page-index",
    "page-boot",
    "page-story",
    "page-mapa",
    "page-perfil",
    "has-seen-intro",
    "needs-intro"
  );
}

function applyPageBodyClass() {
  document.body.classList.add(`page-${appState.pageName}`);
}

function showAppLoading() {
  document.body.classList.add("app-loading");
}

function hideAppLoading() {
  document.body.classList.remove("app-loading");
}

function showLoggedInState() {
  document.body.classList.remove("is-guest");
  document.body.classList.add("is-auth-ready", "is-user");
}

function showGuestState() {
  document.body.classList.remove("is-user");
  document.body.classList.add("is-auth-ready", "is-guest");
}

function showProgressReadyState() {
  document.body.classList.add("has-progress");
}

function showAppReady() {
  document.body.classList.add("app-ready");
}

/* ======================================
   TOAST SIMPLE
====================================== */

export function showToast(message = "", type = "info", duration = 2600) {
  const toast = $("#toastMessage");
  if (!toast || !message) return;

  toast.textContent = message;
  toast.classList.remove(
    "hidden",
    "is-success",
    "is-warning",
    "is-info",
    "is-error"
  );
  toast.classList.add(`is-${type}`);

  window.clearTimeout(showToast._timer);

  showToast._timer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, duration);
}

/* ======================================
   UI GLOBAL
====================================== */

function updateGlobalUserUI(user) {
  const normalizedUser = getSafeUser(user);

  if (!normalizedUser) {
    setText("#playerName", "Invitado");
    setText("#profileName", "Invitado");
    setText("#profileEmail", "Sin correo registrado");

    setAvatarContent("#playerAvatar", {
      initials: "M",
      photoURL: "",
      label: "Invitado"
    });

    setAvatarContent("#profileAvatar", {
      initials: "M",
      photoURL: "",
      label: "Invitado"
    });

    renderAuthUserUI(null);
    renderAuthVisibility(null);
    return;
  }

  const displayName = normalizedUser.displayName || "Invitado";
  const email =
    normalizedUser.email ||
    (normalizedUser.isAnonymous ? "Sesión invitado" : "Sin correo registrado");

  const avatar = normalizedUser.initials || getInitial(displayName);

  setText("#playerName", displayName);
  setText("#profileName", displayName);
  setText("#profileEmail", email);

  setAvatarContent("#playerAvatar", {
    initials: avatar,
    photoURL: normalizedUser.photoURL,
    label: displayName
  });

  setAvatarContent("#profileAvatar", {
    initials: avatar,
    photoURL: normalizedUser.photoURL,
    label: displayName
  });

  renderAuthUserUI(normalizedUser);
  renderAuthVisibility(normalizedUser);
}

function updateLastActivityUI(lastGame) {
  if (!lastGame) {
    setText("#lastGameName", "Sin actividad reciente");
    setText("#lastGameRegion", "Región: -");
    setText("#lastGameXP", "XP ganada: 0");
    setText("#lastGameTime", "Último registro: sin datos");
    return;
  }

  const gameName = prettifyGameId(lastGame.gameId || lastGame.name || "actividad");
  const region = getRegionLabel(lastGame.region || "-");
  const xp = toNumber(lastGame.xp, 0);

  setText("#lastGameName", gameName);
  setText("#lastGameRegion", `Región: ${region}`);
  setText("#lastGameXP", `XP ganada: ${xp}`);

  if (lastGame.completedAt) {
    try {
      const date = new Date(lastGame.completedAt);
      const formatted = Number.isNaN(date.getTime())
        ? "Último registro: sin fecha"
        : `Último registro: ${date.toLocaleString("es-CO")}`;
      setText("#lastGameTime", formatted);
    } catch {
      setText("#lastGameTime", "Último registro: sin fecha");
    }
  }
}

function renderRegionsList(selector, items = [], formatter = (item) => item, emptyText = "Sin datos.") {
  const list = $(selector);
  if (!list) return;

  if (!items.length) {
    list.innerHTML = `<li class="empty-state">${escapeHTML(emptyText)}</li>`;
    return;
  }

  list.innerHTML = items
    .map((item) => `<li>${formatter(item)}</li>`)
    .join("");
}

function updateXPProgressUI(progress) {
  const normalized = getSafeProgress(progress);
  const levelProgress = getLevelProgress(normalized.xp);

  const fill = $("#profileLevelProgressFill");
  if (fill) {
    fill.style.width = `${levelProgress.percent}%`;
    fill.setAttribute("aria-valuenow", String(levelProgress.percent));
  }

  setText("#profileLevelProgressText", `${levelProgress.progressInLevel} / 100 XP`);
  setText("#profileNextLevelText", `Nivel ${levelProgress.level + 1}`);
}

function updateGlobalProgressUI(progress) {
  const normalized = getSafeProgress(progress);

  const xp = toNumber(normalized.xp, 0);
  const level = toNumber(normalized.level, calculateLevel(xp));
  const visitedRegions = normalizeArray(normalized.visitedRegions);
  const completedGames = normalizeArray(normalized.completedGames);
  const unlockedRegions = normalizeArray(normalized.unlockedRegions);
  const completedRegions = normalizeArray(normalized.completedRegions);

  setText("#xpValue", xp);
  setText("#profileXP", xp);

  setText("#playerLevel", `Nivel ${level}`);
  setText("#profileLevel", level);

  setText("#visitedRegionsCount", visitedRegions.length);
  setText("#completedGamesCount", completedGames.length);
  setText("#unlockedRegionsCount", unlockedRegions.length);

  setText("#profileVisitedCount", visitedRegions.length);
  setText("#profileCompletedCount", completedGames.length);

  setText("#regionsBadge", visitedRegions.length);
  setText("#gamesBadge", completedGames.length);
  setText("#unlockedBadge", unlockedRegions.length);

  setText(
    "#profileUnlockedCountText",
    `${unlockedRegions.length} ${unlockedRegions.length === 1 ? "región" : "regiones"}`
  );

  const currentRouteRegion = normalized.currentRegion || unlockedRegions[0] || DEFAULT_REGION;
  setText("#profileCurrentRoute", getRegionLabel(currentRouteRegion));
  setText("#currentRouteLabel", getRegionLabel(currentRouteRegion));

  if (!completedGames.length) {
    setText("#profileJourneyStatus", "Listo para jugar");
  } else if (unlockedRegions.length >= 6) {
    setText("#profileJourneyStatus", "Mapa casi completo");
  } else {
    setText("#profileJourneyStatus", "Aventura en curso");
  }

  const latestReward = toNumber(normalized.lastGame?.xp, 0);
  setText("#profileLatestReward", `${latestReward} XP`);

  updateXPProgressUI(normalized);
  updateLastActivityUI(normalized.lastGame);

  renderRegionsList(
    "#visitedRegionsList",
    visitedRegions,
    (region) => `<strong>${escapeHTML(getRegionLabel(region))}</strong> · Región explorada`,
    "Aún no has visitado regiones."
  );

  renderRegionsList(
    "#unlockedRegionsList",
    unlockedRegions,
    (region) => `<strong>${escapeHTML(getRegionLabel(region))}</strong> · Disponible para jugar`,
    "Aún no hay regiones desbloqueadas registradas."
  );

  renderRegionsList(
    "#completedGamesList",
    completedGames,
    (gameId) => `<strong>${escapeHTML(prettifyGameId(gameId))}</strong> · Completado`,
    "Todavía no has completado minijuegos."
  );

  const guestPill = $("#guestStatusPill");
  if (guestPill) {
    if (appState.user?.uid && !appState.user?.isAnonymous) {
      guestPill.textContent = "Sesión guardada";
    } else if (appState.user?.isAnonymous) {
      guestPill.textContent = "Modo invitado";
    } else {
      guestPill.textContent = "Sin iniciar sesión";
    }
  }

  const currentRegionHotspots = document.querySelectorAll(".map-hotspot");
  currentRegionHotspots.forEach((hotspot) => {
    hotspot.classList.toggle("is-current", hotspot.dataset.region === currentRouteRegion);
  });

  const traveler = $("#mapTravelerIndicator");
  if (traveler) {
    const currentHotspot = $(`.map-hotspot[data-region="${currentRouteRegion}"]`);
    if (currentHotspot?.style.top && currentHotspot?.style.left) {
      traveler.style.top = currentHotspot.style.top;
      traveler.style.left = currentHotspot.style.left;
      traveler.dataset.currentRegion = currentRouteRegion;
    }
  }

  setText("#quickCardTitle", getRegionLabel(currentRouteRegion));
}

function resetGlobalProgressUI() {
  updateGlobalProgressUI({
    xp: 0,
    level: 1,
    completedGames: [],
    unlockedRegions: [DEFAULT_REGION],
    visitedRegions: [],
    completedRegions: [],
    currentRegion: DEFAULT_REGION,
    lastGame: null
  });
}

/* ======================================
   EVENTOS INTERNOS
====================================== */

function emitAppEvent(name, detail = {}) {
  document.dispatchEvent(
    new CustomEvent(name, {
      detail
    })
  );
}

function notifyStateChange(reason = "updated") {
  emitAppEvent(`${APP_EVENT_NAMESPACE}:state-change`, {
    reason,
    state: getAppState()
  });

  emitAppEvent("progress:changed", {
    reason,
    progress: getAppProgress()
  });

  emitAppEvent("user:changed", {
    reason,
    user: getAppUser()
  });
}

function notifyUserReady(user) {
  emitAppEvent(`${APP_EVENT_NAMESPACE}:user-ready`, {
    user,
    state: getAppState()
  });

  emitAppEvent("auth:changed", {
    user,
    state: getAppState()
  });
}

function notifyProgressReady(progress) {
  emitAppEvent(`${APP_EVENT_NAMESPACE}:progress-ready`, {
    progress,
    state: getAppState()
  });

  emitAppEvent("progress:updated", {
    progress,
    state: getAppState()
  });
}

function notifyAppReady() {
  emitAppEvent(`${APP_EVENT_NAMESPACE}:app-ready`, {
    state: getAppState()
  });
}

function notifyNavigationReady() {
  emitAppEvent(`${APP_EVENT_NAMESPACE}:navigation-ready`, {
    pageName: appState.pageName,
    currentRoute: appState.currentRoute,
    hasSeenIntro: appState.hasSeenIntro,
    state: getAppState()
  });
}

/* ======================================
   ANALÍTICA
====================================== */

async function registerInitialPageEvent(user) {
  try {
    const key = `musi_page_view_${appState.pageName}_${user?.uid || "guest"}`;
    if (sessionStorage.getItem(key)) return;

    await trackCustomEvent("page_view_musi", {
      uid: user?.uid || "anonymous",
      page: appState.pageName,
      path: window.location.pathname,
      hasSeenIntro: String(appState.hasSeenIntro)
    });

    sessionStorage.setItem(key, "1");
  } catch (error) {
    console.warn("[app] No se pudo registrar page_view_musi:", error);
  }
}

async function registerLoginEventIfNeeded(user) {
  try {
    if (!user?.uid) return;

    const sessionKey = `musi_login_tracked_${user.uid}`;
    if (sessionStorage.getItem(sessionKey)) return;

    const provider = user.isAnonymous ? "anonymous" : "google";
    await trackLogin(user, provider);

    sessionStorage.setItem(sessionKey, "1");
  } catch (error) {
    console.warn("[app] No se pudo registrar login:", error);
  }
}

async function registerStoryCompletedEvent(user) {
  try {
    const uid = user?.uid || "anonymous";
    const key = `musi_story_completed_${uid}`;

    if (sessionStorage.getItem(key)) return;

    await trackCustomEvent("story_completed_musi", {
      uid,
      page: appState.pageName
    });

    sessionStorage.setItem(key, "1");
  } catch (error) {
    console.warn("[app] No se pudo registrar story_completed_musi:", error);
  }
}

/* ======================================
   CARGA DE USUARIO Y PROGRESO
====================================== */

async function loadUserProgress(uid) {
  let progress = await createInitialProgressIfNeeded(uid);
  progress = await grantFirstLoginXP(uid, progress);
  progress = await getUserProgress(uid);

  return normalizeProgress(progress);
}

function applyGuestSessionState() {
  appState.user = null;
  appState.progress = normalizeProgress({
    xp: 0,
    level: 1,
    completedGames: [],
    unlockedRegions: [DEFAULT_REGION],
    visitedRegions: [],
    completedRegions: [],
    currentRegion: DEFAULT_REGION,
    lastGame: null
  });
  appState.authReady = true;
  appState.progressReady = true;
  appState.lastBootstrappedUid = "";

  updateGlobalUserUI(null);
  updateGlobalProgressUI(appState.progress);

  showGuestState();
  showProgressReadyState();
  showAppReady();
  hideAppLoading();

  notifyStateChange("guest-session");
  notifyProgressReady(appState.progress);
  notifyAppReady();

  return appState.progress;
}

async function bootstrapUserSession(user) {
  const normalizedUser = normalizeUser(user);

  if (!normalizedUser?.uid) {
    return applyGuestSessionState();
  }

  if (
    appState.bootstrapping &&
    appState.lastBootstrappedUid === normalizedUser.uid
  ) {
    return appState.progress;
  }

  appState.bootstrapping = true;
  appState.authReady = true;
  appState.progressReady = false;
  appState.user = normalizedUser;

  updateGlobalUserUI(normalizedUser);
  showLoggedInState();

  try {
    // ensureUserDocument es opcional: un fallo de permisos no debe matar la sesión
    try {
      await ensureUserDocument(normalizedUser);
    } catch (docError) {
      console.warn("[app] ensureUserDocument falló (continuando con estado local):", docError);
    }

    // loadUserProgress también puede fallar — si falla, usamos progreso vacío
    let progress;
    try {
      progress = await loadUserProgress(normalizedUser.uid);
    } catch (progressError) {
      console.warn("[app] loadUserProgress falló (usando progreso local vacío):", progressError);
      progress = normalizeProgress({});
    }

    appState.user = {
      ...normalizedUser,
      hasSeenIntro: hasSeenIntro()
    };
    appState.progress = progress;
    appState.progressReady = true;
    appState.lastBootstrappedUid = normalizedUser.uid;

    updateGlobalUserUI(appState.user);
    updateGlobalProgressUI(progress);

    showLoggedInState();
    showProgressReadyState();
    showAppReady();
    hideAppLoading();

    notifyStateChange("user-bootstrapped");
    notifyUserReady(appState.user);
    notifyProgressReady(progress);
    notifyAppReady();

    return progress;
  } catch (error) {
    // Fallo total inesperado: caer a sesión invitado en vez de lanzar
    console.error("[app] Error en bootstrapUserSession (fallback a invitado):", error);
    showToast("Hubo un problema al cargar tu sesión. Continuando como invitado.", "warning");
    return applyGuestSessionState();
  } finally {
    appState.bootstrapping = false;
  }
}

/* ======================================
   STORY HELPERS
====================================== */

function setupStoryCompletionBindings() {
  const completeSelectors = [
    "[data-complete-story]",
    "[data-complete-intro]",
    "#completeStoryBtn",
    "#startJourneyBtn",
    "#storyContinueBtn",
    "#skipToMapBtn"
  ];

  const elements = completeSelectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter(Boolean);

  const uniqueElements = [...new Set(elements)];

  for (const el of uniqueElements) {
    if (el.dataset.storyBound === "true") continue;
    el.dataset.storyBound = "true";

    el.addEventListener("click", async (event) => {
      const explicitTarget = el.dataset.nextRoute || el.getAttribute("href");

      if (explicitTarget && explicitTarget.endsWith(".html")) {
        event.preventDefault();
      }

      try {
        await markStoryAsCompleted();
        await registerStoryCompletedEvent(appState.user);
        safeNavigate(GAME_ROUTES.mapa);
      } catch (error) {
        console.error("[app] No se pudo completar la historia:", error);
        showToast("No se pudo continuar al mapa.", "warning");
      }
    });
  }
}

function setupQuickNavigationBindings() {
  const bindings = [
    { selector: '[data-go-map]', url: GAME_ROUTES.mapa },
    { selector: '[data-go-profile]', url: GAME_ROUTES.profile },
    { selector: '[data-go-story]', url: GAME_ROUTES.story },
    { selector: '[data-go-home]', url: GAME_ROUTES.home },
    { selector: "#continueJourneyBtn", url: GAME_ROUTES.mapa }
  ];

  bindings.forEach(({ selector, url }) => {
    document.querySelectorAll(selector).forEach((el) => {
      if (el.dataset.navBound === "true") return;
      el.dataset.navBound = "true";

      el.addEventListener("click", (event) => {
        const tag = el.tagName.toLowerCase();
        if (tag === "a" && el.getAttribute("href")) {
          event.preventDefault();
        }
        safeNavigate(url);
      });
    });
  });
}

/* ======================================
   INICIALIZACIÓN PRINCIPAL
====================================== */

async function initCurrentSession() {
  resetBodyStateClasses();
  applyPageBodyClass();
  updateHasSeenIntroState(hasSeenIntro());
  showAppLoading();

  const currentUser = await waitForAuthReady();

  appState.authReady = true;
  appState.user = normalizeUser(currentUser);
  appState.currentRoute = window.location.pathname;

  const canStay = await ensureNavigationRules(currentUser);
  if (!canStay) return;

  if (!currentUser?.uid) {
    applyGuestSessionState();
    await registerInitialPageEvent(null);
    notifyNavigationReady();
    return;
  }

  await bootstrapUserSession(currentUser);
  await registerLoginEventIfNeeded(currentUser);
  await registerInitialPageEvent(currentUser);
  notifyNavigationReady();
}

function setupAuthSubscription() {
  const unsubscribe = onUserChange(async (user) => {
    const normalizedUser = normalizeUser(user);
    const previousUid = appState.user?.uid || "";
    const nextUid = normalizedUser?.uid || "";

    appState.user = normalizedUser;
    updateHasSeenIntroState(hasSeenIntro());

    const canStay = await ensureNavigationRules(normalizedUser);
    if (!canStay) return;

    if (!normalizedUser?.uid) {
      applyGuestSessionState();
      await registerInitialPageEvent(null);
      notifyNavigationReady();
      return;
    }

    const shouldRebootstrap =
      !appState.progressReady ||
      previousUid !== nextUid ||
      appState.lastBootstrappedUid !== nextUid;

    if (shouldRebootstrap) {
      await bootstrapUserSession(normalizedUser);
    } else {
      updateGlobalUserUI(normalizedUser);
      notifyStateChange("auth-refresh");
    }

    await registerLoginEventIfNeeded(normalizedUser);
    await registerInitialPageEvent(normalizedUser);
    notifyNavigationReady();
  });

  appState.unsubscribers.push(unsubscribe);
}

/* ======================================
   INICIALIZACIÓN APP
====================================== */

async function initApp() {
  if (appState.initialized || appState.initializing) return;

  appState.initializing = true;

  try {
    await initCurrentSession();
    setupAuthSubscription();
    setupStoryCompletionBindings();
    setupQuickNavigationBindings();

    appState.initialized = true;
  } catch (error) {
    console.error("[app] Error al inicializar la aplicación:", error);
    hideAppLoading();
    showToast("No se pudo iniciar la aplicación.", "warning");
  } finally {
    appState.initializing = false;
  }
}

/* ======================================
   API PÚBLICA
====================================== */

export function getAppState() {
  return {
    ...appState,
    user: appState.user ? { ...appState.user } : null,
    progress: appState.progress ? { ...appState.progress } : null,
    unsubscribers: [...appState.unsubscribers]
  };
}

export function getAppUser() {
  return appState.user ? { ...appState.user } : null;
}

export function getAppProgress() {
  return appState.progress ? { ...appState.progress } : null;
}

export function isAppReady() {
  return Boolean(appState.initialized && appState.authReady);
}

export function isProgressReady() {
  return Boolean(appState.progressReady);
}

export function hasActiveUser() {
  return Boolean(appState.user?.uid);
}

export function getCurrentLevel() {
  return toNumber(appState.progress?.level, 1);
}

export function getCurrentXP() {
  return toNumber(appState.progress?.xp, 0);
}

export function getUnlockedRegions() {
  return uniqueArray(appState.progress?.unlockedRegions || [DEFAULT_REGION]);
}

export function getCompletedGames() {
  return uniqueArray(appState.progress?.completedGames || []);
}

export function getVisitedRegions() {
  return uniqueArray(appState.progress?.visitedRegions || []);
}

export function refreshGlobalUI(progressOverride = null) {
  const progress = progressOverride || appState.progress;

  if (appState.user) {
    updateGlobalUserUI(appState.user);
  } else {
    updateGlobalUserUI(null);
  }

  if (progress) {
    const normalized = normalizeProgress(progress);
    appState.progress = normalized;
    updateGlobalProgressUI(normalized);
  } else {
    resetGlobalProgressUI();
  }

  updateHasSeenIntroState(hasSeenIntro());
  notifyStateChange("refresh-ui");
}

export function updateAppProgress(nextProgress = {}) {
  const merged = normalizeProgress({
    ...(appState.progress || {}),
    ...nextProgress
  });

  appState.progress = merged;
  appState.progressReady = true;

  updateGlobalProgressUI(merged);
  showProgressReadyState();

  notifyStateChange("progress-updated");
  notifyProgressReady(merged);

  return merged;
}

export function updateAppUser(nextUser = {}) {
  const merged = normalizeUser({
    ...(appState.user || {}),
    ...nextUser
  });

  appState.user = merged;

  updateGlobalUserUI(merged);

  if (merged?.uid) {
    showLoggedInState();
  } else {
    showGuestState();
  }

  notifyStateChange("user-updated");
  notifyUserReady(merged);

  return merged;
}

export async function reloadAppSession() {
  const currentUser = getCurrentUser();

  if (!currentUser?.uid) {
    return applyGuestSessionState();
  }

  const progress = await bootstrapUserSession(currentUser);
  notifyStateChange("session-reloaded");
  return progress;
}

export function onAppEvent(eventName, callback) {
  if (!eventName || typeof callback !== "function") {
    return () => {};
  }

  const handler = (event) => callback(event.detail || {});
  document.addEventListener(eventName, handler);

  return () => {
    document.removeEventListener(eventName, handler);
  };
}

export function navigateToNextGameStep() {
  safeNavigate(getDefaultNextGameScreen());
}

export async function completeStoryAndGoToMap() {
  await markStoryAsCompleted();
  await registerStoryCompletedEvent(appState.user);
  safeNavigate(GAME_ROUTES.mapa);
}

export async function rememberStorySeen() {
  await markStoryAsCompleted();
  await registerStoryCompletedEvent(appState.user);
  return true;
}

export function resetStoryProgress() {
  clearIntroSeen();

  try {
    localStorage.removeItem(STORAGE_KEYS.storySeen);
  } catch (error) {
    console.warn("[app] No se pudo limpiar musi_story_seen:", error);
  }

  updateHasSeenIntroState(false);
  notifyStateChange("story-reset");
}

export function goToMap() {
  safeNavigate(GAME_ROUTES.mapa);
}

export function goToStory() {
  safeNavigate(GAME_ROUTES.story);
}

export function goToProfile() {
  safeNavigate(GAME_ROUTES.profile);
}

export function goToHome() {
  safeNavigate(GAME_ROUTES.home);
}

export function destroyApp() {
  for (const unsubscribe of appState.unsubscribers) {
    try {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    } catch (error) {
      console.warn("[app] Error liberando suscripción:", error);
    }
  }

  appState.unsubscribers = [];
  appState.initialized = false;
  appState.initializing = false;
}

/* ======================================
   AUTO INIT
====================================== */

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});