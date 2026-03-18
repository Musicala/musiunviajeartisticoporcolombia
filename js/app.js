// ======================================
// MUSI
// app.js
// Orquestador principal de la aplicación
// Versión mejorada y alineada al flujo actual real
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
  TITLE: "title",
  INTRO: "intro",
  LOGIN: "login",
  MAPA: "mapa",
  MENU: "menu",
  PERFIL: "perfil",
  STORY: "story"
};

const GAME_ROUTES = {
  home: "index.html",
  boot: "boot.html",
  title: "title.html",
  intro: "intro.html",
  story: "story.html",
  login: "login.html",
  mapa: "mapa.html",
  menu: "menu.html",
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
  titleSeen: "musi_title_seen",
  introSeen: "musi_intro_seen",
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

function setAvatarContent(selector, { initials = "M", photoURL = "", label = "" } = {}) {
  const el = typeof selector === "string" ? $(selector) : selector;
  if (!el) return;

  if (photoURL) {
    el.textContent = "";
    el.innerHTML = `<img src="${photoURL}" alt="${label || "Avatar"}">`;
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
  const nextLevelBase = getLevelBaseXp(level + 1);
  const progressInLevel = safeXp - currentLevelBase;
  const percent = Math.max(0, Math.min(100, Math.round((progressInLevel / 100) * 100)));

  return {
    level,
    currentLevelBase,
    nextLevelBase,
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

function isIntroPage() {
  return isPage(PAGE_NAMES.INTRO, PAGE_NAMES.STORY);
}

function isLoginPage() {
  return isPage(PAGE_NAMES.LOGIN);
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

  notifyStateChange("intro-completed");
}

async function ensureNavigationRules(user) {
  const normalizedUser = normalizeUser(user);
  const introSeen = hasSeenIntro();

  updateHasSeenIntroState(introSeen);
  appState.navigationReady = true;

  const requiresAuth =
    isMapPage() ||
    isProfilePage() ||
    isPage(PAGE_NAMES.MENU) ||
    isPage(PAGE_NAMES.STORY) ||
    isPage(PAGE_NAMES.INTRO);

  if (requiresAuth && !normalizedUser?.uid) {
    const currentFile =
      window.location.pathname.split("/").pop() || GAME_ROUTES.home;

    setPostLoginRedirect(currentFile);
    safeNavigate(GAME_ROUTES.login, { replace: true });
    return false;
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
    "page-home",
    "page-boot",
    "page-title",
    "page-login",
    "page-intro",
    "page-story",
    "page-mapa",
    "page-menu",
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
    return;
  }

  const gameName = prettifyGameId(lastGame.gameId || lastGame.name || "actividad");
  const region = getRegionLabel(lastGame.region || "-");
  const xp = toNumber(lastGame.xp, 0);

  setText("#lastGameName", gameName);
  setText("#lastGameRegion", `Región: ${region}`);
  setText("#lastGameXP", `XP ganada: ${xp}`);
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

  const nextRoute = unlockedRegions[0]
    ? getRegionLabel(unlockedRegions[0])
    : getRegionLabel(DEFAULT_REGION);

  setText("#profileCurrentRoute", `Ruta disponible: ${nextRoute}`);

  if (!completedGames.length) {
    setText("#profileJourneyStatus", "Listo para jugar");
  } else if (unlockedRegions.length >= 6) {
    setText("#profileJourneyStatus", "Mapa casi completo");
  } else {
    setText("#profileJourneyStatus", "Aventura en curso");
  }

  updateXPProgressUI(normalized);
  updateLastActivityUI(normalized.lastGame);
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

async function registerIntroCompletedEvent(user) {
  try {
    const uid = user?.uid || "anonymous";
    const key = `musi_intro_completed_${uid}`;

    if (sessionStorage.getItem(key)) return;

    await trackCustomEvent("intro_completed_musi", {
      uid,
      page: appState.pageName
    });

    sessionStorage.setItem(key, "1");
  } catch (error) {
    console.warn("[app] No se pudo registrar intro_completed_musi:", error);
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
  appState.progress = null;
  appState.authReady = true;
  appState.progressReady = false;
  appState.lastBootstrappedUid = "";

  updateGlobalUserUI(null);
  resetGlobalProgressUI();

  showGuestState();
  showAppReady();
  hideAppLoading();

  notifyStateChange("guest-session");
  notifyAppReady();
}

async function bootstrapUserSession(user) {
  const normalizedUser = normalizeUser(user);

  if (!normalizedUser?.uid) {
    applyGuestSessionState();
    return null;
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
    await ensureUserDocument(normalizedUser);
    const progress = await loadUserProgress(normalizedUser.uid);

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
    console.error("[app] Error en bootstrapUserSession:", error);
    showToast("No se pudo cargar la sesión del usuario.", "warning");
    throw error;
  } finally {
    appState.bootstrapping = false;
  }
}

/* ======================================
   INTRO / STORY HELPERS
====================================== */

function setupIntroCompletionBindings() {
  const completeSelectors = [
    "[data-complete-intro]",
    "[data-complete-story]",
    "#completeStoryBtn",
    "#startJourneyBtn",
    "#storyContinueBtn",
    "#continueJourneyBtn",
    "#skipToMapBtn"
  ];

  const elements = completeSelectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter(Boolean);

  const uniqueElements = [...new Set(elements)];

  for (const el of uniqueElements) {
    if (el.dataset.introBound === "true") continue;
    el.dataset.introBound = "true";

    el.addEventListener("click", async () => {
      try {
        await markStoryAsCompleted();
        await registerIntroCompletedEvent(appState.user);
        safeNavigate(GAME_ROUTES.mapa);
      } catch (error) {
        console.error("[app] No se pudo completar la introducción:", error);
        showToast("No se pudo continuar al mapa.", "warning");
      }
    });
  }
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
    setupIntroCompletionBindings();

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
    applyGuestSessionState();
    return null;
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
  await registerIntroCompletedEvent(appState.user);
  safeNavigate(GAME_ROUTES.mapa);
}

export async function rememberStorySeen() {
  await markStoryAsCompleted();
  await registerIntroCompletedEvent(appState.user);
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
  notifyStateChange("intro-reset");
}

export function goToMap() {
  safeNavigate(GAME_ROUTES.mapa);
}

export function goToIntro() {
  safeNavigate(GAME_ROUTES.intro);
}

export function goToStory() {
  safeNavigate(GAME_ROUTES.story);
}

export function goToLogin() {
  safeNavigate(GAME_ROUTES.login);
}

export function goToProfile() {
  safeNavigate(GAME_ROUTES.profile);
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