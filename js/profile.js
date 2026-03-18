// ======================================
// MUSI
// profile.js
// Lógica de la vista de perfil del jugador
// Versión mejorada estilo perfil de aventura
// ======================================

import {
  getAppUser,
  getAppProgress,
  updateAppProgress,
  showToast
} from "./app.js";

import {
  getUserProfile
} from "./auth.js";

import {
  getUserProgress
} from "./progress.js";

/* ======================================
   CONFIG
====================================== */

const REGION_ORDER = [
  "caribe",
  "andina",
  "pacifica",
  "orinoquia",
  "amazonia",
  "insular"
];

const REGION_LABELS = {
  caribe: "Caribe",
  andina: "Andina",
  pacifica: "Pacífica",
  orinoquia: "Orinoquía",
  amazonia: "Amazonía",
  insular: "Insular"
};

const REGION_EMOJIS = {
  caribe: "🌴",
  andina: "⛰️",
  pacifica: "🌊",
  orinoquia: "🐎",
  amazonia: "🌿",
  insular: "🏝️"
};

const EMPTY_MESSAGES = {
  visitedRegions: "Aún no has visitado regiones.",
  unlockedRegions: "Aún no hay regiones desbloqueadas registradas.",
  completedGames: "Todavía no has completado minijuegos."
};

/* ======================================
   ESTADO LOCAL
====================================== */

const state = {
  initialized: false,
  user: null,
  profile: null,
  progress: null
};

/* ======================================
   HELPERS DOM
====================================== */

const $ = (selector, root = document) => root.querySelector(selector);

function setText(selector, value, fallback = "-") {
  const el = typeof selector === "string" ? $(selector) : selector;
  if (!el) return;
  el.textContent = value ?? fallback;
}

function setHTML(selector, value, fallback = "") {
  const el = typeof selector === "string" ? $(selector) : selector;
  if (!el) return;
  el.innerHTML = value ?? fallback;
}

function clearElement(selector) {
  const el = typeof selector === "string" ? $(selector) : selector;
  if (!el) return;
  el.innerHTML = "";
}

function createElement(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function toggleHidden(selector, shouldHide = true) {
  const el = typeof selector === "string" ? $(selector) : selector;
  if (!el) return;
  el.classList.toggle("hidden", shouldHide);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ======================================
   HELPERS DE DATOS
====================================== */

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function uniqueArray(values = []) {
  return [...new Set(normalizeArray(values))];
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  const levelSpan = Math.max(1, nextLevelBase - currentLevelBase);
  const progressInLevel = safeXp - currentLevelBase;
  const percent = clamp(Math.round((progressInLevel / levelSpan) * 100), 0, 100);

  return {
    level,
    currentLevelBase,
    nextLevelBase,
    progressInLevel,
    percent
  };
}

function getInitial(name = "") {
  const safe = String(name).trim();
  return safe ? safe.charAt(0).toUpperCase() : "M";
}

function getDisplayName() {
  const user = state.user || {};
  const profile = state.profile || {};

  return (
    user.displayName ||
    profile.name ||
    profile.displayName ||
    "Invitado"
  );
}

function getDisplayEmail() {
  const user = state.user || {};
  const profile = state.profile || {};

  return (
    user.email ||
    profile.email ||
    "Sin correo registrado"
  );
}

function getRegionLabel(regionId = "") {
  return REGION_LABELS[regionId] || regionId || "Región";
}

function getRegionEmoji(regionId = "") {
  return REGION_EMOJIS[regionId] || "🗺️";
}

function prettifyGameId(gameId = "") {
  if (!gameId) return "Minijuego";

  return String(gameId)
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeProgress(progress = {}) {
  const xp = toNumber(progress.xp, 0);

  let unlockedRegions = uniqueArray(progress.unlockedRegions);
  if (!unlockedRegions.length) {
    unlockedRegions = [REGION_ORDER[0]];
  }

  return {
    uid: progress.uid || state.user?.uid || "",
    xp,
    level: toNumber(progress.level, calculateLevel(xp)),
    completedGames: uniqueArray(progress.completedGames),
    unlockedRegions,
    visitedRegions: uniqueArray(progress.visitedRegions),
    lastGame: progress.lastGame || null,
    updatedAt: progress.updatedAt || null
  };
}

function getSafeProgress() {
  return normalizeProgress(state.progress || getAppProgress() || {});
}

function findRelatedRegionFromGameId(gameId = "") {
  const safeGameId = String(gameId || "").toLowerCase();

  if (!safeGameId) return "";

  const directMatches = {
    "ritmo-caribe": "caribe",
    "eco-andino": "andina",
    "pulso-pacifico": "pacifica",
    "ruta-llanera": "orinoquia",
    "ecos-selva": "amazonia",
    "islas-resonancia": "insular"
  };

  if (directMatches[safeGameId]) {
    return directMatches[safeGameId];
  }

  if (safeGameId.includes("caribe")) return "caribe";
  if (safeGameId.includes("andin")) return "andina";
  if (safeGameId.includes("pacific")) return "pacifica";
  if (safeGameId.includes("llaner") || safeGameId.includes("orino")) return "orinoquia";
  if (safeGameId.includes("selva") || safeGameId.includes("amazon")) return "amazonia";
  if (safeGameId.includes("isla") || safeGameId.includes("insular")) return "insular";

  return "";
}

function getNextSuggestedRegion(progress = null) {
  const safeProgress = normalizeProgress(progress || getSafeProgress());

  for (const regionId of REGION_ORDER) {
    const isUnlocked = safeProgress.unlockedRegions.includes(regionId);
    const relatedGameDone = safeProgress.completedGames.some(
      (gameId) => findRelatedRegionFromGameId(gameId) === regionId
    );

    if (isUnlocked && !relatedGameDone) {
      return regionId;
    }
  }

  return safeProgress.unlockedRegions[0] || REGION_ORDER[0];
}

function getJourneyStatus(progress = null) {
  const safeProgress = normalizeProgress(progress || getSafeProgress());

  if (!safeProgress.completedGames.length) {
    return "Listo para jugar";
  }

  if (safeProgress.unlockedRegions.length >= REGION_ORDER.length) {
    return "Mapa casi completo";
  }

  return "Aventura en curso";
}

/* ======================================
   RENDER USUARIO
====================================== */

function renderUserInfo() {
  const displayName = getDisplayName();
  const email = getDisplayEmail();
  const avatarLetter = getInitial(displayName);

  setText("#profileName", displayName);
  setText("#profileEmail", email);

  const avatarEl = $("#profileAvatar");
  if (avatarEl) {
    avatarEl.textContent = avatarLetter;

    const photoURL = state.user?.photoURL || state.profile?.photoURL || "";
    if (photoURL) {
      avatarEl.style.backgroundImage = `url("${photoURL}")`;
      avatarEl.style.backgroundSize = "cover";
      avatarEl.style.backgroundPosition = "center";
      avatarEl.textContent = "";
      avatarEl.setAttribute("aria-label", displayName);
      avatarEl.setAttribute("title", displayName);
    } else {
      avatarEl.style.backgroundImage = "";
      avatarEl.removeAttribute("aria-label");
      avatarEl.setAttribute("title", displayName);
    }
  }
}

/* ======================================
   RENDER MÉTRICAS
====================================== */

function renderStats() {
  const progress = getSafeProgress();
  const levelProgress = getLevelProgress(progress.xp);
  const nextSuggestedRegion = getNextSuggestedRegion(progress);
  const journeyStatus = getJourneyStatus(progress);

  setText("#profileXP", progress.xp);
  setText("#profileLevel", progress.level);
  setText("#profileVisitedCount", progress.visitedRegions.length);
  setText("#profileCompletedCount", progress.completedGames.length);

  setText("#regionsBadge", progress.visitedRegions.length);
  setText("#unlockedBadge", progress.unlockedRegions.length || 1);
  setText("#gamesBadge", progress.completedGames.length);

  setText(
    "#profileLevelProgressText",
    `${levelProgress.progressInLevel} / 100 XP`
  );
  setText(
    "#profileNextLevelText",
    `Nivel ${levelProgress.level + 1}`
  );

  const progressFill = $("#profileLevelProgressFill");
  if (progressFill) {
    progressFill.style.width = `${levelProgress.percent}%`;
    progressFill.setAttribute("aria-valuenow", String(levelProgress.percent));
  }

  setText(
    "#profileCurrentRoute",
    `Siguiente destino: ${getRegionLabel(nextSuggestedRegion)}`
  );

  setText(
    "#profileUnlockedCountText",
    `${progress.unlockedRegions.length} ${progress.unlockedRegions.length === 1 ? "región" : "regiones"}`
  );

  setText("#profileJourneyStatus", journeyStatus);
}

/* ======================================
   RENDER LISTAS
====================================== */

function createRegionListItem(regionId, type = "default") {
  const li = createElement("li", "ui-list-item pop-in");

  const title = createElement("div", "ui-list-item-title");
  title.textContent = `${getRegionEmoji(regionId)} ${getRegionLabel(regionId)}`;

  const meta = createElement("div", "ui-list-item-meta");

  if (type === "visited") {
    meta.textContent = "Explorada en tu viaje.";
  } else if (type === "unlocked") {
    meta.textContent = "Disponible para jugar o seguir avanzando.";
  } else {
    meta.textContent = "Registrada en tu progreso.";
  }

  li.appendChild(title);
  li.appendChild(meta);

  return li;
}

function createGameListItem(gameId) {
  const li = createElement("li", "ui-list-item pop-in");

  const relatedRegion = findRelatedRegionFromGameId(gameId);
  const title = createElement(
    "div",
    "ui-list-item-title",
    `🎮 ${prettifyGameId(gameId)}`
  );

  const meta = createElement(
    "div",
    "ui-list-item-meta",
    relatedRegion
      ? `Región: ${getRegionEmoji(relatedRegion)} ${getRegionLabel(relatedRegion)}`
      : "Región: sin asociación detectada"
  );

  li.appendChild(title);
  li.appendChild(meta);

  return li;
}

function renderEmptyList(listSelector, message) {
  const listEl = $(listSelector);
  if (!listEl) return;

  clearElement(listEl);

  const emptyItem = createElement("li", "empty-state", message);
  listEl.appendChild(emptyItem);
}

function renderVisitedRegions() {
  const visited = getSafeProgress().visitedRegions;
  const listEl = $("#visitedRegionsList");
  if (!listEl) return;

  clearElement(listEl);

  if (!visited.length) {
    renderEmptyList("#visitedRegionsList", EMPTY_MESSAGES.visitedRegions);
    return;
  }

  visited.forEach((regionId) => {
    listEl.appendChild(createRegionListItem(regionId, "visited"));
  });
}

function renderUnlockedRegions() {
  const unlocked = getSafeProgress().unlockedRegions;
  const listEl = $("#unlockedRegionsList");
  if (!listEl) return;

  clearElement(listEl);

  if (!unlocked.length) {
    renderEmptyList("#unlockedRegionsList", EMPTY_MESSAGES.unlockedRegions);
    return;
  }

  unlocked.forEach((regionId) => {
    listEl.appendChild(createRegionListItem(regionId, "unlocked"));
  });
}

function renderCompletedGames() {
  const games = getSafeProgress().completedGames;
  const listEl = $("#completedGamesList");
  if (!listEl) return;

  clearElement(listEl);

  if (!games.length) {
    renderEmptyList("#completedGamesList", EMPTY_MESSAGES.completedGames);
    return;
  }

  games.forEach((gameId) => {
    listEl.appendChild(createGameListItem(gameId));
  });
}

/* ======================================
   RENDER ÚLTIMA ACTIVIDAD
====================================== */

function renderLastActivity() {
  const lastGame = getSafeProgress().lastGame;

  if (!lastGame) {
    setText("#lastGameName", "Sin actividad reciente");
    setText("#lastGameRegion", "Región: -");
    setText("#lastGameXP", "XP ganada: 0");
    return;
  }

  const relatedRegion = lastGame.region || findRelatedRegionFromGameId(lastGame.gameId);
  const gameName = prettifyGameId(lastGame.gameId || "actividad");
  const region = getRegionLabel(relatedRegion || "-");
  const xp = toNumber(lastGame.xp, 0);

  setText("#lastGameName", `🎮 ${gameName}`);
  setText(
    "#lastGameRegion",
    `Región: ${relatedRegion ? `${getRegionEmoji(relatedRegion)} ${region}` : region}`
  );
  setText("#lastGameXP", `XP ganada: ${xp}`);
}

/* ======================================
   RENDER GLOBAL PERFIL
====================================== */

function renderProfileView() {
  renderUserInfo();
  renderStats();
  renderVisitedRegions();
  renderUnlockedRegions();
  renderCompletedGames();
  renderLastActivity();
}

/* ======================================
   CARGA DE DATOS
====================================== */

async function loadProfileData() {
  state.user = getAppUser();

  if (!state.user?.uid) {
    showToast("Debes iniciar sesión para ver tu perfil.", "warning");
    return;
  }

  try {
    const [profileDoc, progressDoc] = await Promise.all([
      getUserProfile(state.user.uid),
      getUserProgress(state.user.uid)
    ]);

    state.profile = profileDoc || null;
    state.progress = normalizeProgress(progressDoc || getAppProgress() || {});

    updateAppProgress(state.progress);
    renderProfileView();
  } catch (error) {
    console.error("[profile] Error cargando perfil:", error);
    showToast("No se pudo cargar el perfil.", "warning");
  }
}

/* ======================================
   INIT
====================================== */

async function initProfilePage() {
  if (!document.body.classList.contains("profile-page")) return;
  if (state.initialized) return;

  state.initialized = true;

  state.user = getAppUser();
  state.progress = normalizeProgress(getAppProgress() || {});
  renderProfileView();

  await loadProfileData();
}

document.addEventListener("DOMContentLoaded", () => {
  initProfilePage();
});