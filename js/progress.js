// ======================================
// MUSI
// progress.js
// Sistema de progreso del jugador
// Versión mejorada y alineada al flujo actual
// ======================================

import { db } from "./firebase-config.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ======================================
   CONFIG
====================================== */

const PROGRESS_COLLECTION = "progress";

export const XP_RULES = {
  firstLogin: 10,
  visitRegion: 15,
  openMinigame: 10,
  completeMinigame: 40
};

export const REGION_ORDER = [
  "caribe",
  "andina",
  "pacifica",
  "orinoquia",
  "amazonia",
  "insular"
];

const DEFAULT_REGION = "caribe";

/* ======================================
   HELPERS
====================================== */

function progressRef(uid) {
  return doc(db, PROGRESS_COLLECTION, uid);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(value = []) {
  return [...new Set(asArray(value).filter(Boolean))];
}

function calculateLevel(xp = 0) {
  return Math.floor(Math.max(0, toNumber(xp, 0)) / 100) + 1;
}

function normalizeLastGame(lastGame = null) {
  if (!lastGame || typeof lastGame !== "object") return null;

  return {
    gameId: lastGame.gameId || "",
    region: lastGame.region || "",
    xp: toNumber(lastGame.xp, 0),
    status: lastGame.status || "",
    type: lastGame.type || "activity",
    label: lastGame.label || ""
  };
}

function normalizeCompletedRegions(progress = {}) {
  return unique(progress.completedRegions);
}

function getCompletedRegionThreshold(progress = {}) {
  return normalizeCompletedRegions(progress).length;
}

/* ======================================
   NORMALIZACIÓN
====================================== */

export function normalizeProgress(progress = {}, uid = "") {
  const xp = toNumber(progress.xp, 0);

  const normalized = {
    uid: progress.uid || uid || "",
    xp,
    level: calculateLevel(xp),

    completedGames: unique(progress.completedGames),
    completedRegions: normalizeCompletedRegions(progress),

    unlockedRegions: unique(progress.unlockedRegions),
    visitedRegions: unique(progress.visitedRegions),

    visitedRegionRewards: unique(progress.visitedRegionRewards),
    openedGamesRewards: unique(progress.openedGamesRewards),

    firstLoginXpGranted: Boolean(progress.firstLoginXpGranted),

    currentRegion: progress.currentRegion || DEFAULT_REGION,
    lastGame: normalizeLastGame(progress.lastGame),
    updatedAt: progress.updatedAt || null
  };

  if (!normalized.unlockedRegions.length) {
    normalized.unlockedRegions = [DEFAULT_REGION];
  }

  if (!normalized.unlockedRegions.includes(DEFAULT_REGION)) {
    normalized.unlockedRegions.unshift(DEFAULT_REGION);
  }

  return normalized;
}

/* ======================================
   REGIONES DESBLOQUEADAS
====================================== */

export function resolveUnlockedRegions(progress = {}) {
  const safe = normalizeProgress(progress);

  const completedRegionsCount = getCompletedRegionThreshold(safe);
  const unlocked = [DEFAULT_REGION];

  for (
    let index = 1;
    index <= completedRegionsCount && index < REGION_ORDER.length;
    index += 1
  ) {
    unlocked.push(REGION_ORDER[index]);
  }

  return unique(unlocked);
}

/* ======================================
   PROGRESO INICIAL
====================================== */

export function buildInitialProgress(uid) {
  return {
    uid,
    xp: 0,
    level: 1,
    completedGames: [],
    completedRegions: [],
    unlockedRegions: [DEFAULT_REGION],
    visitedRegions: [],
    visitedRegionRewards: [],
    openedGamesRewards: [],
    firstLoginXpGranted: false,
    currentRegion: DEFAULT_REGION,
    lastGame: null,
    updatedAt: null
  };
}

/* ======================================
   FIRESTORE
====================================== */

export async function getUserProgress(uid) {
  if (!uid) return null;

  const snap = await getDoc(progressRef(uid));

  if (!snap.exists()) return null;

  return normalizeProgress(snap.data(), uid);
}

export async function saveProgress(uid, progress = {}) {
  if (!uid) throw new Error("uid requerido");

  const normalized = normalizeProgress(progress, uid);

  const payload = {
    ...normalized,
    level: calculateLevel(normalized.xp),
    unlockedRegions: resolveUnlockedRegions(normalized),
    updatedAt: serverTimestamp()
  };

  await setDoc(progressRef(uid), payload, { merge: true });

  return normalizeProgress(payload, uid);
}

export async function createInitialProgressIfNeeded(uid) {
  const existing = await getUserProgress(uid);

  if (existing) return existing;

  const initial = buildInitialProgress(uid);
  return saveProgress(uid, initial);
}

/* ======================================
   XP
====================================== */

export function addXp(progress = {}, amount = 0) {
  const safe = normalizeProgress(progress);
  const nextXp = safe.xp + Math.max(0, toNumber(amount, 0));

  safe.xp = nextXp;
  safe.level = calculateLevel(nextXp);
  safe.unlockedRegions = resolveUnlockedRegions(safe);

  return safe;
}

/* ======================================
   REGIONES COMPLETADAS
====================================== */

/**
 * Una región se considera completada si todos sus juegos requeridos
 * quedaron en completedGames.
 *
 * @param {Object} progress
 * @param {string} region
 * @param {Array<string>} regionGameIds
 * @returns {boolean}
 */
export function isRegionCompleted(progress = {}, region = "", regionGameIds = []) {
  const safe = normalizeProgress(progress);

  if (!region || !regionGameIds.length) return false;

  return regionGameIds.every((gameId) => safe.completedGames.includes(gameId));
}

/**
 * Marca una región como completada si aplica.
 *
 * @param {Object} progress
 * @param {string} region
 * @param {Array<string>} regionGameIds
 * @returns {Object}
 */
export function markRegionCompletedIfNeeded(progress = {}, region = "", regionGameIds = []) {
  const safe = normalizeProgress(progress);

  if (!region || !regionGameIds.length) return safe;

  if (isRegionCompleted(safe, region, regionGameIds)) {
    safe.completedRegions = unique([...safe.completedRegions, region]);
    safe.unlockedRegions = resolveUnlockedRegions(safe);
  }

  return safe;
}

/* ======================================
   FIRST LOGIN
====================================== */

export async function grantFirstLoginXP(uid, current = null) {
  let progress = current
    ? normalizeProgress(current, uid)
    : await createInitialProgressIfNeeded(uid);

  if (progress.firstLoginXpGranted) {
    return progress;
  }

  progress = addXp(progress, XP_RULES.firstLogin);

  progress.firstLoginXpGranted = true;

  progress.lastGame = {
    gameId: "primer-ingreso",
    region: "",
    xp: XP_RULES.firstLogin,
    status: "granted",
    type: "first_login",
    label: "Primer ingreso"
  };

  return saveProgress(uid, progress);
}

/* ======================================
   VISIT REGION
====================================== */

export async function visitRegion(uid, region) {
  let progress = await createInitialProgressIfNeeded(uid);
  progress = normalizeProgress(progress, uid);

  const rewarded = progress.visitedRegionRewards.includes(region);

  progress.visitedRegions = unique([
    ...progress.visitedRegions,
    region
  ]);

  progress.currentRegion = region || progress.currentRegion || DEFAULT_REGION;

  if (!rewarded && region) {
    progress = addXp(progress, XP_RULES.visitRegion);
    progress.visitedRegionRewards.push(region);
  }

  progress.lastGame = {
    gameId: `visit-${region}`,
    region,
    xp: rewarded ? 0 : XP_RULES.visitRegion,
    status: "visited",
    type: "region_visit",
    label: `Visita a ${region}`
  };

  return saveProgress(uid, progress);
}

/* ======================================
   OPEN MINIGAME
====================================== */

export async function registerMinigameOpen(uid, payload = {}) {
  const { gameId, region, label = "" } = payload;

  if (!uid || !gameId || !region) {
    throw new Error("gameId y region requeridos");
  }

  let progress = await createInitialProgressIfNeeded(uid);
  progress = normalizeProgress(progress, uid);

  const rewarded = progress.openedGamesRewards.includes(gameId);

  progress.visitedRegions = unique([
    ...progress.visitedRegions,
    region
  ]);

  progress.currentRegion = region;

  if (!rewarded) {
    progress = addXp(progress, XP_RULES.openMinigame);
    progress.openedGamesRewards.push(gameId);
  }

  progress.lastGame = {
    gameId,
    region,
    xp: rewarded ? 0 : XP_RULES.openMinigame,
    status: "opened",
    type: "minigame_open",
    label
  };

  return saveProgress(uid, progress);
}

/* ======================================
   COMPLETE MINIGAME
====================================== */

/**
 * Completa un minijuego.
 *
 * payload soporta:
 * - gameId
 * - region
 * - label
 * - xp
 * - status
 * - regionGameIds -> lista completa de juegos de esa región para decidir si la región queda completada
 */
export async function completeMinigame(uid, payload = {}) {
  const {
    gameId,
    region,
    label = "",
    xp = XP_RULES.completeMinigame,
    status = "completed",
    regionGameIds = []
  } = payload;

  if (!uid || !gameId || !region) {
    throw new Error("gameId y region requeridos");
  }

  let progress = await createInitialProgressIfNeeded(uid);
  progress = normalizeProgress(progress, uid);

  const alreadyCompleted = progress.completedGames.includes(gameId);

  progress.completedGames = unique([
    ...progress.completedGames,
    gameId
  ]);

  progress.visitedRegions = unique([
    ...progress.visitedRegions,
    region
  ]);

  progress.currentRegion = region;

  if (!alreadyCompleted) {
    progress = addXp(progress, toNumber(xp, XP_RULES.completeMinigame));
  }

  progress.lastGame = {
    gameId,
    region,
    xp: alreadyCompleted ? 0 : toNumber(xp, XP_RULES.completeMinigame),
    status,
    type: "minigame_complete",
    label
  };

  if (regionGameIds.length) {
    progress = markRegionCompletedIfNeeded(progress, region, regionGameIds);
  }

  progress.unlockedRegions = resolveUnlockedRegions(progress);

  return saveProgress(uid, progress);
}

/* ======================================
   HELPERS DE LECTURA
====================================== */

export function hasCompletedGame(progress = {}, gameId = "") {
  const safe = normalizeProgress(progress);
  return safe.completedGames.includes(gameId);
}

export function hasVisitedRegion(progress = {}, region = "") {
  const safe = normalizeProgress(progress);
  return safe.visitedRegions.includes(region);
}

export function isRegionUnlocked(progress = {}, region = "") {
  const safe = normalizeProgress(progress);
  return safe.unlockedRegions.includes(region);
}

export function getCurrentRegion(progress = {}) {
  const safe = normalizeProgress(progress);
  return safe.currentRegion || DEFAULT_REGION;
}

export function getCompletedRegions(progress = {}) {
  const safe = normalizeProgress(progress);
  return unique(safe.completedRegions);
}

/* ======================================
   RECÁLCULO GENERAL
====================================== */

export async function recalculateAndSaveProgress(uid) {
  const progress = await createInitialProgressIfNeeded(uid);
  const normalized = normalizeProgress(progress, uid);

  normalized.level = calculateLevel(normalized.xp);
  normalized.unlockedRegions = resolveUnlockedRegions(normalized);

  return saveProgress(uid, normalized);
}