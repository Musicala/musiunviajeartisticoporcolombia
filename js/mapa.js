// ======================================
// MUSI
// mapa.js
// Control principal del mapa del juego
// versión mejorada y alineada al nuevo flujo
// ======================================

import {
  getAppUser,
  getAppProgress,
  updateAppProgress,
  updateAppUser,
  showToast,
  onAppEvent
} from "./app.js";

import {
  getUserProgress,
  visitRegion,
  registerMinigameOpen,
  completeMinigame,
  resolveUnlockedRegions
} from "./progress.js";

import {
  trackOpenRegion,
  trackOpenMinigame,
  trackCompleteMinigame,
  trackReturnToMap
} from "./analytics.js";

/* ======================================
   CONFIG BASE
====================================== */

const MAP_CONFIG = window.MUSI_MAP_CONFIG || {};
const REGION_ORDER = Array.isArray(MAP_CONFIG.regionsOrder)
  ? MAP_CONFIG.regionsOrder
  : ["caribe", "andina", "pacifica", "orinoquia", "amazonia", "insular"];

const DEFAULT_REGION = MAP_CONFIG.startingRegion || REGION_ORDER[0] || "caribe";

const STATUS_WIN_VALUES = new Set([
  "win",
  "won",
  "success",
  "completed",
  "complete",
  "ok"
]);

const ENTRY_ANIMATION_STAGGER_MS = 80;

/* ======================================
   STATE
====================================== */

const state = {
  initialized: false,
  user: null,
  progress: null,
  activeRegionId: DEFAULT_REGION,
  syncingProgress: false,
  processedReturnKey: null,
  visitedRegionThisSession: new Set(),
  unsubscribers: []
};

/* ======================================
   DOM HELPERS
====================================== */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function setText(target, value, fallback = "-") {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.textContent = String(value ?? fallback);
}

function setHTML(target, html = "") {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.innerHTML = html;
}

function show(target) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.classList.remove("hidden");
}

function hide(target) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.classList.add("hidden");
}

function setDisabled(target, disabled = true) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.disabled = !!disabled;

  if (disabled) {
    el.setAttribute("aria-disabled", "true");
  } else {
    el.removeAttribute("aria-disabled");
  }
}

function bodyHasMapPage() {
  return document.body.classList.contains("map-page");
}

/* ======================================
   BASIC UTILS
====================================== */

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(value = []) {
  return [...new Set(normalizeArray(value).filter(Boolean))];
}

function calculateLevel(xp = 0) {
  return Math.floor(toNumber(xp, 0) / 100) + 1;
}

function safeCall(fn, ...args) {
  try {
    if (typeof fn === "function") return fn(...args);
  } catch (error) {
    console.warn("safeCall error:", error);
  }
  return null;
}

function getRegionConfig(regionId) {
  return MAP_CONFIG?.regions?.[regionId] || null;
}

function getAllRegionConfigs() {
  return REGION_ORDER
    .map((id) => getRegionConfig(id))
    .filter(Boolean);
}

function getRegionName(regionId) {
  return getRegionConfig(regionId)?.name || regionId || "Región";
}

function getRegionWorldLabel(regionId) {
  return getRegionConfig(regionId)?.worldLabel || "Mundo";
}

function getRegionCard(regionId) {
  return document.getElementById(`region-${regionId}`);
}

function getRegionHotspot(regionId) {
  return document.getElementById(`hotspot-${regionId}`);
}

function getRegionGames(regionId) {
  return normalizeArray(getRegionConfig(regionId)?.games);
}

function getGameConfig(regionId, gameId) {
  return getRegionGames(regionId).find((game) => game.id === gameId) || null;
}

function getCurrentRegionConfig() {
  return getRegionConfig(state.activeRegionId);
}

function regionIndex(regionId) {
  const index = REGION_ORDER.indexOf(regionId);
  return index >= 0 ? index : 0;
}

function getUnlockHint(regionId, progress) {
  const index = regionIndex(regionId);
  if (index === 0) {
    return "🧭 Lista para explorar";
  }

  const previousRegion = REGION_ORDER[index - 1];
  const previousName = getRegionName(previousRegion);

  if (progress.unlockedRegions.includes(regionId)) {
    return "🧭 Ya puedes entrar";
  }

  return `🔒 Se abre al avanzar desde ${previousName}`;
}

/* ======================================
   USER / PROGRESS NORMALIZATION
====================================== */

function normalizeUser(user = null) {
  if (!user) return null;

  const displayName =
    user.displayName ||
    user.name ||
    (user.isAnonymous ? "Invitado" : "Jugador");

  return {
    uid: user.uid || "",
    displayName,
    photoURL: user.photoURL || "",
    email: user.email || "",
    isAnonymous: !!user.isAnonymous,
    initials: String(displayName).trim().charAt(0).toUpperCase() || "M"
  };
}

function buildCompletedRegionList(progress) {
  return REGION_ORDER.filter((regionId) => {
    const games = getRegionGames(regionId);
    if (!games.length) return false;

    const allGameIds = games.map((game) => game.id).filter(Boolean);
    if (!allGameIds.length) return false;

    return allGameIds.every((gameId) => progress.completedGames.includes(gameId));
  });
}

function normalizeProgress(progress = {}) {
  const xp = toNumber(progress.xp, 0);
  const completedGames = unique(progress.completedGames);
  const visitedRegions = unique(progress.visitedRegions);
  const lastGame = progress.lastGame || null;

  const resolvedUnlocked =
    safeCall(resolveUnlockedRegions, {
      ...progress,
      xp,
      completedGames,
      visitedRegions
    }) ||
    progress.unlockedRegions ||
    [DEFAULT_REGION];

  const unlockedRegions = unique(resolvedUnlocked).length
    ? unique(resolvedUnlocked)
    : [DEFAULT_REGION];

  if (!unlockedRegions.includes(DEFAULT_REGION)) {
    unlockedRegions.unshift(DEFAULT_REGION);
  }

  const completedRegions = unique(progress.completedRegions).length
    ? unique(progress.completedRegions)
    : buildCompletedRegionList({
        xp,
        completedGames,
        unlockedRegions,
        visitedRegions
      });

  return {
    xp,
    level: calculateLevel(xp),
    completedGames,
    completedRegions,
    unlockedRegions,
    visitedRegions,
    currentRegion:
      progress.currentRegion ||
      progress.region ||
      progress.activeRegion ||
      DEFAULT_REGION,
    lastGame
  };
}

function getCurrentUser() {
  return normalizeUser(getAppUser());
}

function getCurrentProgress() {
  return normalizeProgress(getAppProgress() || {});
}

function isLoggedInUser(user = state.user) {
  return !!user?.uid;
}

/* ======================================
   PROGRESS / REGION LOGIC
====================================== */

function isRegionUnlocked(regionId, progress = state.progress) {
  return progress.unlockedRegions.includes(regionId);
}

function isRegionCompleted(regionId, progress = state.progress) {
  return progress.completedRegions.includes(regionId);
}

function getCompletedGamesForRegion(regionId, progress = state.progress) {
  const games = getRegionGames(regionId);
  return games.filter((game) => progress.completedGames.includes(game.id));
}

function getRegionProgressSummary(regionId, progress = state.progress) {
  const games = getRegionGames(regionId);
  const completedGames = getCompletedGamesForRegion(regionId, progress);

  return {
    total: games.length,
    completed: completedGames.length,
    unlocked: isRegionUnlocked(regionId, progress),
    completedRegion: isRegionCompleted(regionId, progress)
  };
}

function getSuggestedRegion(progress = state.progress) {
  const currentRegion = progress?.currentRegion;
  if (currentRegion && progress.unlockedRegions.includes(currentRegion)) {
    return currentRegion;
  }

  for (const regionId of REGION_ORDER) {
    if (
      progress.unlockedRegions.includes(regionId) &&
      !isRegionCompleted(regionId, progress)
    ) {
      return regionId;
    }
  }

  return progress.unlockedRegions[0] || DEFAULT_REGION;
}

function setActiveRegion(regionId, options = {}) {
  const region = getRegionConfig(regionId);
  if (!region) return;

  state.activeRegionId = regionId;

  renderCurrentRoute();
  renderTraveler(regionId);
  renderQuickCard(regionId);
  renderRegions(state.progress);

  if (!options.silent) {
    const srStatus = $("#srMapStatus");
    if (srStatus) {
      srStatus.textContent = `Región seleccionada: ${region.name}`;
    }
  }
}

/* ======================================
   PLAYER / SESSION UI
====================================== */

function renderPlayerCard(progress = state.progress) {
  const user = state.user;
  const avatarEl = $("#playerAvatar");

  setText("#playerName", user?.displayName || "Invitado");
  setText("#playerLevel", `Nivel ${progress.level}`);

  if (avatarEl) {
    if (user?.photoURL) {
      avatarEl.innerHTML = `<img src="${user.photoURL}" alt="Avatar de ${user.displayName || "usuario"}">`;
    } else {
      avatarEl.textContent = user?.initials || "M";
    }
  }
}

function renderXP(progress = state.progress) {
  setText("#xpValue", progress.xp, 0);
}

function renderSessionPanel() {
  const guestHintText = $("#guestHintText");

  if (isLoggedInUser()) {
    setText(
      guestHintText,
      "Tu sesión está activa. El progreso del mapa y de los minijuegos puede sincronizarse con tu cuenta."
    );
    hide("#loginGoogleBtn");
    hide("#loginGuestBtn");
    show("#logoutBtn");
  } else {
    setText(
      guestHintText,
      "Puedes explorar como invitado o iniciar sesión para conservar tu progreso, regiones abiertas y experiencia."
    );
    show("#loginGoogleBtn");
    show("#loginGuestBtn");
    hide("#logoutBtn");
  }
}

function renderProfileLinkState() {
  const link = $("#profileLink");
  if (!link) return;

  if (isLoggedInUser()) {
    link.removeAttribute("aria-disabled");
    link.title = "Abrir perfil";
  } else {
    link.title = "Puedes abrir el perfil e iniciar sesión desde allí si hace falta";
  }
}

/* ======================================
   HUD / SUMMARY UI
====================================== */

function renderProgressSummary(progress = state.progress) {
  setText("#visitedRegionsCount", progress.visitedRegions.length, 0);
  setText("#completedGamesCount", progress.completedGames.length, 0);
  setText("#unlockedRegionsCount", progress.unlockedRegions.length, 1);
  renderXP(progress);
}

function renderRecentActivity(progress = state.progress) {
  const lastGame = progress.lastGame;

  if (!lastGame) {
    setText("#lastGameName", "Sin actividad reciente");
    setText("#lastGameRegion", "Región: -");
    setText("#lastGameXP", "XP ganada: 0");
    return;
  }

  const regionName = getRegionName(lastGame.region);
  const gameLabel =
    lastGame.label ||
    getGameConfig(lastGame.region, lastGame.gameId)?.label ||
    lastGame.gameId ||
    "Minijuego";

  setText("#lastGameName", gameLabel);
  setText("#lastGameRegion", `Región: ${regionName}`);
  setText("#lastGameXP", `XP ganada: ${toNumber(lastGame.xp, 0)}`);
}

function renderCurrentRoute() {
  const region = getCurrentRegionConfig();
  const label = region
    ? `${region.worldLabel} · ${region.name}`
    : "Exploración regional";

  setText("#currentRouteLabel", label);
}

/* ======================================
   QUICK CARD / TRAVELER
====================================== */

function renderQuickCard(regionId = state.activeRegionId) {
  const region = getRegionConfig(regionId);
  if (!region) return;

  setText("#quickCardTitle", region.name);
  setText("#quickCardText", region.shortDescription || region.description || "");
  const button = $("#quickCardOpenBtn");
  if (button) {
    button.dataset.region = regionId;
  }
}

function renderTraveler(regionId = state.activeRegionId) {
  const traveler = $("#mapTravelerIndicator");
  const region = getRegionConfig(regionId);
  if (!traveler || !region?.position) return;

  traveler.dataset.currentRegion = regionId;
  traveler.style.top = region.position.top;
  traveler.style.left = region.position.left;
}

/* ======================================
   REGION CARDS / HOTSPOTS
====================================== */

function renderRegionHotspot(regionId, progress = state.progress) {
  const hotspot = getRegionHotspot(regionId);
  const region = getRegionConfig(regionId);
  if (!hotspot || !region) return;

  const unlocked = isRegionUnlocked(regionId, progress);
  const completed = isRegionCompleted(regionId, progress);
  const current = state.activeRegionId === regionId;

  hotspot.classList.remove("is-unlocked", "is-locked", "is-current", "is-completed");

  if (unlocked) {
    hotspot.classList.add("is-unlocked");
    hotspot.dataset.status = completed ? "completed" : "available";
  } else {
    hotspot.classList.add("is-locked");
    hotspot.dataset.status = "locked";
  }

  if (current) {
    hotspot.classList.add("is-current");
  }

  if (completed) {
    hotspot.classList.add("is-completed");
  }

  hotspot.setAttribute(
    "aria-label",
    unlocked
      ? `Abrir ${region.name}`
      : `${region.name} bloqueada`
  );
}

function renderRegionCard(card, regionId, progress = state.progress) {
  if (!card) return;

  const region = getRegionConfig(regionId);
  if (!region) return;

  const unlocked = isRegionUnlocked(regionId, progress);
  const completed = isRegionCompleted(regionId, progress);
  const current = state.activeRegionId === regionId;
  const summary = getRegionProgressSummary(regionId, progress);

  card.classList.remove("locked", "unlocked", "completed", "is-active");

  if (!unlocked) card.classList.add("locked");
  if (unlocked) card.classList.add("unlocked");
  if (completed) card.classList.add("completed");
  if (current) card.classList.add("is-active");

  const status = $(".region-status", card);
  if (status) {
    status.textContent = completed
      ? "Completada"
      : unlocked
      ? "Disponible"
      : "Bloqueada";
  }

  const metaItems = $$(".region-meta span", card);
  if (metaItems[0]) {
    metaItems[0].textContent = unlocked
      ? `⭐ Recompensa: +${toNumber(region.xpReward, 0)} XP`
      : getUnlockHint(regionId, progress);
  }

  if (metaItems[1]) {
    metaItems[1].textContent = `🎮 ${summary.completed}/${summary.total} minijuegos completados`;
  }

  const playBtn = $(".region-play-btn", card);
  if (playBtn) {
    playBtn.dataset.region = regionId;
    setDisabled(playBtn, !unlocked);
  }

  const infoBtn = $(".region-info-btn", card);
  if (infoBtn) {
    infoBtn.dataset.region = regionId;
  }
}

function renderRegions(progress = state.progress) {
  REGION_ORDER.forEach((regionId) => {
    renderRegionCard(getRegionCard(regionId), regionId, progress);
    renderRegionHotspot(regionId, progress);
  });

  renderProgressSummary(progress);
}

/* ======================================
   REGION MODAL
====================================== */

function buildGameCard(game, regionId, regionUnlocked, regionCompleted) {
  const template = $("#regionGameCardTemplate");
  const fragment = template?.content?.cloneNode(true);

  const gameCompleted = state.progress.completedGames.includes(game.id);
  const canPlay = regionUnlocked && !!game.available;

  if (!fragment) {
    const article = document.createElement("article");
    article.className = "region-game-card";
    article.innerHTML = `
      <div class="region-game-card-top">
        <span class="region-game-art">${game.art || "Juego"}</span>
        <span class="region-game-xp">+${toNumber(game.xpReward, 0)} XP</span>
      </div>
      <div class="region-game-card-body">
        <h5 class="region-game-title">${game.label || "Minijuego"}</h5>
        <p class="region-game-description">${game.description || ""}</p>
      </div>
      <div class="region-game-card-actions">
        <a class="primary-btn region-game-link" href="${game.href || "#"}">Jugar</a>
      </div>
    `;
    const link = $(".region-game-link", article);
    if (link) {
      link.dataset.region = regionId;
      link.dataset.gameId = game.id || "";
      if (!canPlay) {
        link.setAttribute("aria-disabled", "true");
        link.addEventListener("click", (event) => event.preventDefault());
        link.textContent = regionUnlocked ? "Próximamente" : "Bloqueado";
      } else if (gameCompleted) {
        link.textContent = "Jugar de nuevo";
      }
    }
    return article;
  }

  const article = fragment.firstElementChild;
  const artEl = $(".region-game-art", article);
  const xpEl = $(".region-game-xp", article);
  const titleEl = $(".region-game-title", article);
  const descEl = $(".region-game-description", article);
  const linkEl = $(".region-game-link", article);

  setText(artEl, game.art || "Juego");
  setText(xpEl, `+${toNumber(game.xpReward, 0)} XP`);
  setText(titleEl, game.label || "Minijuego");
  setText(descEl, game.description || "");

  if (gameCompleted) {
    article.classList.add("is-completed");
  }

  if (linkEl) {
    linkEl.href = game.href || "#";
    linkEl.dataset.region = regionId;
    linkEl.dataset.gameId = game.id || "";

    if (!canPlay) {
      linkEl.setAttribute("aria-disabled", "true");
      linkEl.setAttribute("tabindex", "-1");
      linkEl.textContent = regionUnlocked ? "Próximamente" : "Bloqueado";
    } else {
      linkEl.removeAttribute("aria-disabled");
      linkEl.removeAttribute("tabindex");
      linkEl.textContent = gameCompleted ? "Jugar de nuevo" : "Jugar";
    }
  }

  return article;
}

function populateRegionModal(regionId) {
  const region = getRegionConfig(regionId);
  if (!region) return;

  const unlocked = isRegionUnlocked(regionId, state.progress);
  const completed = isRegionCompleted(regionId, state.progress);
  const games = getRegionGames(regionId);

  setText("#modalRegionKicker", region.worldLabel || "Región");
  setText("#modalRegionTitle", region.name);
  setText("#modalRegionText", region.description || "");
  setText("#modalRegionLongText", region.longDescription || region.description || "");
  setText("#modalRegionXP", `⭐ +${toNumber(region.xpReward, 0)} XP`);
  setText("#modalRegionUnlockHint", getUnlockHint(regionId, state.progress));
  setText("#modalGamesCount", `${games.length} experiencias artísticas`);

  const status = $("#modalRegionStatus");
  if (status) {
    status.textContent = completed
      ? "Completada"
      : unlocked
      ? "Disponible"
      : "Bloqueada";
  }

  const gamesWrap = $("#modalRegionGames");
  if (gamesWrap) {
    gamesWrap.innerHTML = "";

    games.forEach((game) => {
      const node = buildGameCard(game, regionId, unlocked, completed);
      gamesWrap.appendChild(node);
    });
  }

  const modal = $("#regionModal");
  if (modal) {
    modal.dataset.region = regionId;
  }
}

function openRegionModal(regionId, options = {}) {
  const modal = $("#regionModal");
  if (!modal) return;

  const region = getRegionConfig(regionId);
  if (!region) return;

  setActiveRegion(regionId, { silent: !!options.silent });
  populateRegionModal(regionId);

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  if (!options.skipTracking) {
    safeCall(trackOpenRegion, {
      regionId,
      regionName: region.name
    });
  }
}

function closeRegionModal() {
  const modal = $("#regionModal");
  if (!modal) return;

  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

/* ======================================
   NAVIGATION / ROUTE OVERLAY
====================================== */

function showRouteOverlay(message = "Abriendo el siguiente punto del viaje.") {
  const overlay = $("#routeOverlay");
  const routeText = $("#routeText");
  const sr = $("#srMapStatus");

  if (!overlay) return;

  overlay.classList.add("show");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-routing");

  if (routeText) routeText.textContent = message;
  if (sr) sr.textContent = message;
}

function hideRouteOverlay() {
  const overlay = $("#routeOverlay");
  if (!overlay) return;

  overlay.classList.remove("show");
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-routing");
}

function navigateTo(url, message = "Abriendo el siguiente punto del viaje.") {
  showRouteOverlay(message);

  window.setTimeout(() => {
    window.location.href = url;
  }, 320);
}

/* ======================================
   MINIGAME OPEN
====================================== */

async function openMinigame(gameLinkOrConfig) {
  const regionId =
    gameLinkOrConfig?.dataset?.region ||
    gameLinkOrConfig?.region ||
    state.activeRegionId;

  const gameId =
    gameLinkOrConfig?.dataset?.gameId ||
    gameLinkOrConfig?.gameId ||
    "";

  const game = getGameConfig(regionId, gameId);
  const region = getRegionConfig(regionId);

  if (!region || !game) {
    showToast("No se encontró la configuración del minijuego.", "warning");
    return;
  }

  if (!isRegionUnlocked(regionId, state.progress)) {
    showToast("Esa región todavía está bloqueada.", "warning");
    return;
  }

  if (!game.available) {
    showToast("Este minijuego todavía no está disponible.", "warning");
    return;
  }

  if (!isLoggedInUser()) {
    showToast("Puedes entrar con una cuenta para guardar mejor el progreso del viaje.", "warning");
  }

  const finalUrl = new URL(game.href, window.location.origin);
  finalUrl.searchParams.set("return", "mapa.html");
  finalUrl.searchParams.set("region", regionId);
  finalUrl.searchParams.set("game", game.id);

  if (state.user?.uid) {
    finalUrl.searchParams.set("uid", state.user.uid);
  }

  if (state.user?.isAnonymous) {
    finalUrl.searchParams.set("guest", "1");
  }

  // ── PASO 1: Registro en Firebase (opcional, nunca bloquea la navegación) ──
  if (state.user?.uid) {
    try {
      const next = await registerMinigameOpen(state.user.uid, {
        gameId: game.id,
        region: regionId,
        label: game.label,
        xp: toNumber(game.xpReward, 0)
      });

      if (next) {
        state.progress = normalizeProgress(next);
        updateAppProgress(state.progress);
      }
    } catch (firebaseError) {
      // El guardado de progreso falló (permisos, red, etc.)
      // Se registra como advertencia pero NO se bloquea la navegación
      console.warn("[mapa] registerMinigameOpen falló (el juego abrirá de todas formas):", firebaseError);
    }
  }

  // ── PASO 2: Analytics (opcional, falla silenciosamente) ──
  safeCall(trackOpenMinigame, {
    regionId,
    regionName: region.name,
    gameId: game.id,
    gameLabel: game.label
  });

  // ── PASO 3: Navegación — SIEMPRE se ejecuta ──
  navigateTo(finalUrl.toString(), `Entrando a ${game.label}.`);
}

/* ======================================
   REGION VISIT
====================================== */

async function registerVisit(regionId, options = {}) {
  if (!regionId) return;
  if (state.visitedRegionThisSession.has(regionId) && !options.force) return;

  state.visitedRegionThisSession.add(regionId);

  const user = state.user;
  if (!user?.uid) {
    const nextVisited = unique([...state.progress.visitedRegions, regionId]);
    state.progress = normalizeProgress({
      ...state.progress,
      visitedRegions: nextVisited,
      currentRegion: regionId
    });
    updateAppProgress(state.progress);
    renderAll();
    return;
  }

  try {
    const next = await visitRegion(user.uid, regionId);

    if (next) {
      state.progress = normalizeProgress(next);
    } else {
      state.progress = normalizeProgress({
        ...state.progress,
        visitedRegions: unique([...state.progress.visitedRegions, regionId]),
        currentRegion: regionId
      });
    }

    updateAppProgress(state.progress);
    renderAll();
  } catch (error) {
    console.warn("visitRegion error:", error);
  }
}

/* ======================================
   RETURN FROM MINIGAMES
====================================== */

function getReturnPayloadFromURL() {
  const url = new URL(window.location.href);
  const gameId = url.searchParams.get("game");
  const region = url.searchParams.get("region");
  const status = url.searchParams.get("status");
  const xp = toNumber(url.searchParams.get("xp"), NaN);

  if (!gameId || !region || !status) return null;

  return {
    gameId,
    region,
    status,
    xp: Number.isFinite(xp) ? xp : null,
    key: `${gameId}::${region}::${status}::${xp}`
  };
}

function clearReturnPayloadFromURL() {
  const url = new URL(window.location.href);
  ["game", "region", "status", "xp"].forEach((key) => {
    url.searchParams.delete(key);
  });
  window.history.replaceState({}, "", url.toString());
}

async function processReturnFromMinigame() {
  const payload = getReturnPayloadFromURL();
  if (!payload) return;
  if (state.processedReturnKey === payload.key) return;

  state.processedReturnKey = payload.key;

  safeCall(trackReturnToMap, payload);

  if (!STATUS_WIN_VALUES.has(String(payload.status).toLowerCase())) {
    clearReturnPayloadFromURL();
    renderAll();
    return;
  }

  if (!state.user?.uid) {
    const fallbackXP =
      payload.xp ??
      toNumber(getGameConfig(payload.region, payload.gameId)?.xpReward, 0);

    const completedGames = unique([...state.progress.completedGames, payload.gameId]);
    const visitedRegions = unique([...state.progress.visitedRegions, payload.region]);

    state.progress = normalizeProgress({
      ...state.progress,
      xp: toNumber(state.progress.xp, 0) + fallbackXP,
      completedGames,
      visitedRegions,
      currentRegion: payload.region,
      lastGame: {
        gameId: payload.gameId,
        region: payload.region,
        xp: fallbackXP,
        label: getGameConfig(payload.region, payload.gameId)?.label || payload.gameId
      }
    });

    updateAppProgress(state.progress);
    renderAll();

    safeCall(trackCompleteMinigame, payload);
    showToast("Minijuego completado. Tu avance local fue actualizado.", "success");
    clearReturnPayloadFromURL();
    return;
  }

  try {
    const game = getGameConfig(payload.region, payload.gameId);
    const fallbackXP = payload.xp ?? toNumber(game?.xpReward, 0);

    const next = await completeMinigame(state.user.uid, {
      gameId: payload.gameId,
      region: payload.region,
      xp: fallbackXP,
      status: payload.status,
      label: game?.label || payload.gameId
    });

    if (next) {
      state.progress = normalizeProgress(next);
      updateAppProgress(state.progress);
    }

    safeCall(trackCompleteMinigame, {
      ...payload,
      xp: fallbackXP
    });

    renderAll();
    showToast("Minijuego completado. El mapa fue actualizado.", "success");
  } catch (error) {
    console.warn("completeMinigame error:", error);
  } finally {
    clearReturnPayloadFromURL();
  }
}

/* ======================================
   RENDER ALL
====================================== */

function renderAll() {
  const progress = state.progress || normalizeProgress({});
  const nextRegion = getSuggestedRegion(progress);

  if (!getRegionConfig(state.activeRegionId)) {
    state.activeRegionId = nextRegion;
  }

  renderPlayerCard(progress);
  renderSessionPanel();
  renderProfileLinkState();
  renderProgressSummary(progress);
  renderRecentActivity(progress);
  renderRegions(progress);
  renderQuickCard(state.activeRegionId);
  renderTraveler(state.activeRegionId);
  renderCurrentRoute();

  const currentModal = $("#regionModal");
  if (currentModal && !currentModal.classList.contains("hidden")) {
    populateRegionModal(state.activeRegionId);
  }
}

/* ======================================
   UI EVENTS
====================================== */

function bindRegionCards() {
  $$(".region-card").forEach((card) => {
    const regionId = card.dataset.region;
    if (!regionId) return;

    card.addEventListener("mouseenter", () => {
      setActiveRegion(regionId);
    });

    card.addEventListener("focusin", () => {
      setActiveRegion(regionId, { silent: true });
    });

    card.addEventListener("click", (event) => {
      const clickedButton = event.target.closest("button, a");
      if (clickedButton) return;

      setActiveRegion(regionId);
      registerVisit(regionId);
      openRegionModal(regionId);
    });
  });
}

function bindHotspots() {
  $$(".map-hotspot").forEach((hotspot) => {
    const regionId = hotspot.dataset.region;
    if (!regionId) return;

    hotspot.addEventListener("mouseenter", () => {
      setActiveRegion(regionId);
    });

    hotspot.addEventListener("focus", () => {
      setActiveRegion(regionId, { silent: true });
    });

    hotspot.addEventListener("click", () => {
      setActiveRegion(regionId);
      registerVisit(regionId);
      openRegionModal(regionId);
    });
  });
}

function bindRegionButtons() {
  $$("[data-open-region]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const regionId = button.dataset.openRegion;
      if (!regionId) return;

      if (!isRegionUnlocked(regionId, state.progress)) {
        showToast("Esa región está bloqueada por ahora.", "warning");
        return;
      }

      setActiveRegion(regionId);
      registerVisit(regionId);
      openRegionModal(regionId);
    });
  });

  $$("[data-region-info]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const regionId = button.dataset.regionInfo;
      if (!regionId) return;

      setActiveRegion(regionId);
      openRegionModal(regionId);
    });
  });
}

function bindQuickActions() {
  $("#focusCurrentRegionBtn")?.addEventListener("click", () => {
    const regionId = state.activeRegionId || getSuggestedRegion(state.progress);
    setActiveRegion(regionId);
    const hotspot = getRegionHotspot(regionId);
    hotspot?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "center" });
  });

  $("#openCurrentRegionBtn")?.addEventListener("click", () => {
    openRegionModal(state.activeRegionId);
  });

  $("#quickCardOpenBtn")?.addEventListener("click", () => {
    openRegionModal(state.activeRegionId);
  });
}

function bindModal() {
  $("#closeRegionModal")?.addEventListener("click", closeRegionModal);
  $("#regionModalBackdrop")?.addEventListener("click", closeRegionModal);

  $("#modalRegionGames")?.addEventListener("click", async (event) => {
    const link = event.target.closest(".region-game-link");
    if (!link) return;

    event.preventDefault();

    if (link.getAttribute("aria-disabled") === "true") {
      showToast("Ese minijuego aún no está disponible.", "warning");
      return;
    }

    await openMinigame(link);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeRegionModal();
    }
  });
}

function bindProfileGuard() {
  $("#profileLink")?.addEventListener("click", () => {
    if (!isLoggedInUser()) {
      showToast("Puedes iniciar sesión para sincronizar tu perfil y progreso.", "warning");
    }
  });
}

function bindAppStateEvents() {
  const possibleSubscriptions = [
    ["auth:changed", handleExternalUserRefresh],
    ["user:changed", handleExternalUserRefresh],
    ["progress:changed", handleExternalProgressRefresh],
    ["progress:updated", handleExternalProgressRefresh]
  ];

  possibleSubscriptions.forEach(([eventName, handler]) => {
    try {
      const unsubscribe = onAppEvent?.(eventName, handler);
      if (typeof unsubscribe === "function") {
        state.unsubscribers.push(unsubscribe);
      }
    } catch (error) {
      // no-op defensivo
    }
  });
}

function handleExternalUserRefresh() {
  state.user = getCurrentUser();
  renderAll();
}

function handleExternalProgressRefresh() {
  state.progress = getCurrentProgress();
  const preferred = getSuggestedRegion(state.progress);
  if (!state.activeRegionId || !getRegionConfig(state.activeRegionId)) {
    state.activeRegionId = preferred;
  }
  renderAll();
}

/* ======================================
   ANIMATIONS
====================================== */

function applyEntryAnimations() {
  const cards = $$(".region-card");

  cards.forEach((card, index) => {
    card.style.animationDelay = `${index * ENTRY_ANIMATION_STAGGER_MS}ms`;
    card.classList.add("fade-in");
  });
}

/* ======================================
   INITIAL DATA LOAD
====================================== */

async function syncFreshProgress() {
  if (!state.user?.uid) return;
  if (state.syncingProgress) return;

  state.syncingProgress = true;

  try {
    const fresh = await getUserProgress(state.user.uid);

    if (fresh) {
      state.progress = normalizeProgress(fresh);
      updateAppProgress(state.progress);
      const nextRegion = getSuggestedRegion(state.progress);
      if (!state.activeRegionId || !getRegionConfig(state.activeRegionId)) {
        state.activeRegionId = nextRegion;
      }
      renderAll();
    }
  } catch (error) {
    console.warn("progress load error", error);
  } finally {
    state.syncingProgress = false;
  }
}

/* ======================================
   INIT
====================================== */

async function init() {
  if (!bodyHasMapPage()) return;
  if (state.initialized) return;

  state.initialized = true;

  state.user = getCurrentUser();
  state.progress = getCurrentProgress();
  state.activeRegionId = getSuggestedRegion(state.progress);

  renderAll();

  bindRegionCards();
  bindHotspots();
  bindRegionButtons();
  bindQuickActions();
  bindModal();
  bindProfileGuard();
  bindAppStateEvents();

  applyEntryAnimations();
  hideRouteOverlay();

  await processReturnFromMinigame();
  await syncFreshProgress();

  if (!isLoggedInUser()) {
    showToast("Puedes iniciar sesión para guardar y sincronizar mejor tu progreso.", "warning");
  }
}

document.addEventListener("DOMContentLoaded", init);