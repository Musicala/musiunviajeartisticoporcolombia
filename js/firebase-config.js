// ======================================
// MUSI
// firebase-config.js
// Inicialización de Firebase + helpers de auth
// ======================================

/* ======================================

   IMPORTS FIREBASE

====================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getAnalytics,
  isSupported as analyticsSupported
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

/* ======================================

   CONFIGURACIÓN DEL PROYECTO

====================================== */

const firebaseConfig = {
  apiKey: "AIzaSyDSeSkL-VlMU1gTCFXCPHFxl7fDZP0Yqcw",
  authDomain: "musi-viaje-por-colombia.firebaseapp.com",
  projectId: "musi-viaje-por-colombia",
  storageBucket: "musi-viaje-por-colombia.firebasestorage.app",
  messagingSenderId: "495759047565",
  appId: "1:495759047565:web:8b9df981a5f957daca1bc4"
};

/* ======================================

   INICIALIZACIÓN

====================================== */

const app = initializeApp(firebaseConfig);

/* ======================================

   SERVICIOS

====================================== */

const auth = getAuth(app);
const db = getFirestore(app);

/* ======================================

   GOOGLE PROVIDER

====================================== */

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});

/* ======================================

   ANALYTICS (CONDICIONAL)

====================================== */

let analytics = null;

/**
 * Verifica si Firebase Analytics es soportado
 * en el navegador actual.
 */
export async function isAnalyticsSupported() {
  try {
    return await analyticsSupported();
  } catch {
    return false;
  }
}

/**
 * Inicializa Analytics si el navegador lo permite.
 */
async function initAnalytics() {
  try {
    const supported = await isAnalyticsSupported();

    if (supported) {
      analytics = getAnalytics(app);
    }
  } catch (error) {
    console.warn("[firebase] Analytics no disponible:", error);
  }
}

initAnalytics();

/* ======================================

   KEYS DE SESIÓN / REDIRECT

====================================== */

const REDIRECT_KEY = "musi_redirect_after_login";
const LAST_LOGIN_KEY = "musi_last_login_method";

/* ======================================

   HELPERS DE REDIRECT

====================================== */

/**
 * Guarda el destino al que se debe enviar al usuario
 * después de iniciar sesión.
 */
export function setRedirectAfterLogin(path = "boot.html") {
  try {
    const safePath = sanitizeRedirectPath(path);
    sessionStorage.setItem(REDIRECT_KEY, safePath);
    return safePath;
  } catch {
    return "boot.html";
  }
}

/**
 * Obtiene el destino guardado tras login.
 */
export function getRedirectAfterLogin() {
  try {
    const stored = sessionStorage.getItem(REDIRECT_KEY);
    return sanitizeRedirectPath(stored || "boot.html");
  } catch {
    return "boot.html";
  }
}

/**
 * Limpia el redirect guardado.
 */
export function clearRedirectAfterLogin() {
  try {
    sessionStorage.removeItem(REDIRECT_KEY);
  } catch {
    // Silencio diplomático.
  }
}

/**
 * Determina si una ruta es válida para el flujo interno.
 * Evita mandar al usuario a URLs raras o externas.
 */
function sanitizeRedirectPath(path) {
  const fallback = "boot.html";

  if (!path || typeof path !== "string") {
    return fallback;
  }

  const cleaned = path.trim();

  if (!cleaned) {
    return fallback;
  }

  // No permitir URLs absolutas ni esquemas raros
  if (
    cleaned.startsWith("http://") ||
    cleaned.startsWith("https://") ||
    cleaned.startsWith("//") ||
    cleaned.startsWith("javascript:")
  ) {
    return fallback;
  }

  // Quitar slash inicial para mantener rutas relativas del proyecto
  const normalized = cleaned.replace(/^\.?\//, "");

  // Lista blanca flexible de páginas internas del flujo
  const allowedPages = new Set([
    "index.html",
    "login.html",
    "boot.html",
    "story.html",
    "mapa.html",
    "map.html",
    "title.html",
    "intro.html"
  ]);

  if (allowedPages.has(normalized)) {
    return normalized;
  }

  // Aceptar también otros html internos simples
  if (/^[a-zA-Z0-9_\-/]+\.html$/.test(normalized)) {
    return normalized;
  }

  return fallback;
}

/* ======================================

   HELPERS DE AUTH

====================================== */

/**
 * Devuelve un objeto de usuario simple para UI.
 */
export function mapFirebaseUser(user) {
  if (!user) return null;

  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "Jugador",
    photoURL: user.photoURL || "",
    isAnonymous: !!user.isAnonymous
  };
}

/**
 * Indica si existe sesión activa.
 */
export function hasAuthenticatedUser() {
  return !!auth.currentUser;
}

/**
 * Devuelve el usuario actual mapeado.
 */
export function getCurrentUser() {
  return mapFirebaseUser(auth.currentUser);
}

/**
 * Inicia sesión con Google usando persistencia local.
 */
export async function loginWithGoogle() {
  try {
    await setPersistence(auth, browserLocalPersistence);

    const result = await signInWithPopup(auth, googleProvider);
    const user = result?.user || null;

    try {
      localStorage.setItem(LAST_LOGIN_KEY, "google");
    } catch {
      // Nada dramático.
    }

    return mapFirebaseUser(user);
  } catch (error) {
    console.error("[firebase] Error en loginWithGoogle:", error);
    throw normalizeAuthError(error);
  }
}

/**
 * Cierra la sesión actual.
 */
export async function logoutUser() {
  try {
    await signOut(auth);

    try {
      localStorage.removeItem(LAST_LOGIN_KEY);
    } catch {
      // Nada.
    }

    return true;
  } catch (error) {
    console.error("[firebase] Error en logoutUser:", error);
    throw normalizeAuthError(error);
  }
}

/**
 * Escucha cambios de autenticación.
 * Retorna la función unsubscribe de Firebase.
 */
export function observeAuthState(callback) {
  if (typeof callback !== "function") {
    throw new Error("observeAuthState requiere una función callback.");
  }

  return onAuthStateChanged(auth, (user) => {
    callback(mapFirebaseUser(user));
  });
}

/* ======================================

   HELPERS DE FLUJO

====================================== */

/**
 * Decide si la página actual debería saltarse
 * porque ya existe sesión.
 */
export function shouldBypassLogin() {
  return hasAuthenticatedUser();
}

/**
 * Intenta guardar un redirect basado en query param
 * o en una ruta recibida manualmente.
 */
export function captureRedirectFromURL(defaultPath = "boot.html") {
  try {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    return setRedirectAfterLogin(next || defaultPath);
  } catch {
    return setRedirectAfterLogin(defaultPath);
  }
}

/* ======================================

   MANEJO DE ERRORES

====================================== */

function normalizeAuthError(error) {
  const code = error?.code || "";
  const message = error?.message || "Ocurrió un error de autenticación.";

  switch (code) {
    case "auth/popup-closed-by-user":
      return new Error("Se cerró la ventana de acceso antes de completar el inicio de sesión.");

    case "auth/cancelled-popup-request":
      return new Error("Ya había una ventana de acceso abierta. Intenta de nuevo.");

    case "auth/popup-blocked":
      return new Error("El navegador bloqueó la ventana emergente de Google.");

    case "auth/network-request-failed":
      return new Error("No se pudo conectar con Firebase. Revisa la conexión.");

    case "auth/unauthorized-domain":
      return new Error("Este dominio no está autorizado en Firebase Authentication.");

    default:
      return new Error(message);
  }
}

/* ======================================

   EXPORTS

====================================== */

export {
  app,
  auth,
  db,
  analytics,
  googleProvider
};