// ======================================
// MUSI
// analytics.js
// Registro de eventos en Firebase Analytics
// y respaldo en Firestore
// ======================================

import { analytics, db, isAnalyticsSupported } from "./firebase-config.js";

import { logEvent } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ======================================
   CONSTANTES
====================================== */

const EVENTS_COLLECTION = "events";

/* ======================================
   HELPERS INTERNOS
====================================== */

/**
 * Limpia un objeto removiendo valores undefined, null o string vacíos.
 * @param {Object} data
 * @returns {Object}
 */
function sanitizePayload(data = {}) {
  return Object.fromEntries(
    Object.entries(data).filter(([_, value]) => {
      if (value === undefined || value === null) return false;
      if (typeof value === "string" && value.trim() === "") return false;
      return true;
    })
  );
}

/**
 * Convierte valores complejos a formatos simples y seguros.
 * Firebase Analytics prefiere valores planos.
 * @param {Object} data
 * @returns {Object}
 */
function normalizeAnalyticsParams(data = {}) {
  const normalized = {};

  for (const [key, value] of Object.entries(data)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      normalized[key] = value;
    } else if (Array.isArray(value)) {
      normalized[key] = value.join(", ");
    } else if (value && typeof value === "object") {
      normalized[key] = JSON.stringify(value);
    }
  }

  return normalized;
}

/* ======================================
   CORE
====================================== */

/**
 * Registra un evento en Firebase Analytics si está disponible.
 * @param {string} eventName
 * @param {Object} params
 * @returns {Promise<void>}
 */
async function logToFirebaseAnalytics(eventName, params = {}) {
  try {
    const supported = await isAnalyticsSupported();

    if (!supported || !analytics) return;

    const cleanParams = normalizeAnalyticsParams(sanitizePayload(params));
    logEvent(analytics, eventName, cleanParams);
  } catch (error) {
    console.warn("[analytics] No se pudo registrar en Firebase Analytics:", error);
  }
}

/**
 * Guarda un evento en Firestore.
 * Esto sirve como respaldo y también para reportes internos.
 * @param {string} type
 * @param {Object} payload
 * @returns {Promise<void>}
 */
async function logToFirestore(type, payload = {}) {
  try {
    const cleanPayload = sanitizePayload(payload);

    await addDoc(collection(db, EVENTS_COLLECTION), {
      type,
      ...cleanPayload,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.warn("[analytics] No se pudo guardar evento en Firestore:", error);
  }
}

/**
 * Función principal para registrar eventos del sistema.
 * Guarda en Analytics y en Firestore.
 *
 * @param {string} type
 * @param {Object} payload
 * @returns {Promise<void>}
 */
export async function trackEvent(type, payload = {}) {
  const cleanPayload = sanitizePayload(payload);

  await Promise.allSettled([
    logToFirebaseAnalytics(type, cleanPayload),
    logToFirestore(type, cleanPayload)
  ]);
}

/* ======================================
   EVENTOS ESPECÍFICOS DEL MVP
====================================== */

/**
 * Registra inicio de sesión del usuario.
 * @param {Object} user
 * @param {string} method
 */
export async function trackLogin(user, method = "unknown") {
  if (!user?.uid) return;

  await trackEvent("login", {
    uid: user.uid,
    user_name: user.displayName || "Invitado",
    email: user.email || "",
    provider: method
  });
}

/**
 * Registra cuando el usuario abre una región.
 * @param {Object} data
 * @param {string} data.uid
 * @param {string} data.region
 * @param {string} [data.regionName]
 */
export async function trackOpenRegion({ uid, region, regionName = "" }) {
  if (!uid || !region) return;

  await trackEvent("open_region", {
    uid,
    region,
    region_name: regionName
  });
}

/**
 * Registra cuando el usuario abre un minijuego.
 * @param {Object} data
 * @param {string} data.uid
 * @param {string} data.gameId
 * @param {string} data.region
 * @param {number} [data.xp]
 */
export async function trackOpenMinigame({ uid, gameId, region, xp = 10 }) {
  if (!uid || !gameId || !region) return;

  await trackEvent("open_minigame", {
    uid,
    gameId,
    region,
    xp
  });
}

/**
 * Registra cuando el usuario completa un minijuego.
 * @param {Object} data
 * @param {string} data.uid
 * @param {string} data.gameId
 * @param {string} data.region
 * @param {number} [data.xp]
 * @param {string} [data.status]
 */
export async function trackCompleteMinigame({
  uid,
  gameId,
  region,
  xp = 40,
  status = "win"
}) {
  if (!uid || !gameId || !region) return;

  await trackEvent("complete_minigame", {
    uid,
    gameId,
    region,
    xp,
    status
  });
}

/**
 * Registra cuando el usuario regresa al mapa desde un minijuego.
 * @param {Object} data
 * @param {string} data.uid
 * @param {string} data.gameId
 * @param {string} data.region
 * @param {string} [data.status]
 * @param {number} [data.xp]
 */
export async function trackReturnToMap({
  uid,
  gameId,
  region,
  status = "unknown",
  xp = 0
}) {
  if (!uid) return;

  await trackEvent("return_to_map", {
    uid,
    gameId: gameId || "",
    region: region || "",
    status,
    xp
  });
}

/* ======================================
   EVENTO GENÉRICO DE APOYO
====================================== */

/**
 * Registra cualquier evento personalizado del proyecto.
 * Útil para futuras métricas del MVP.
 * @param {string} type
 * @param {Object} payload
 */
export async function trackCustomEvent(type, payload = {}) {
  if (!type) return;
  await trackEvent(type, payload);
}