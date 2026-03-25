// ======================================
// MUSI
// auth.js
// Control de autenticación del proyecto
// Versión mejorada y alineada al flujo actual
// ======================================

import { auth, db } from "./firebase-config.js";

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ======================================
   CONFIG
====================================== */

const USERS_COLLECTION = "users";

const STORAGE_KEYS = {
  introSeen: "musi_intro_seen",
  authRedirectAfterLogin: "musi_auth_redirect_after_login",
  lastAuthProvider: "musi_last_auth_provider"
};

const DEFAULT_UNLOCKED_REGIONS = ["caribe"];

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: "select_account"
});

/* ======================================
   ESTADO INTERNO
====================================== */

let authResolved = false;
let authResolvedUser = null;
let authReadyPromise = null;

/* ======================================
   HELPERS GENERALES
====================================== */

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeString(value) {
  return hasText(value) ? String(value).trim() : "";
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readStorage(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch (error) {
    console.warn("[auth] No se pudo leer localStorage:", key, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (error) {
    console.warn("[auth] No se pudo escribir localStorage:", key, error);
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn("[auth] No se pudo eliminar localStorage:", key, error);
  }
}

function toBoolean(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function uniqueArray(values = []) {
  return [...new Set(Array.isArray(values) ? values.filter(Boolean) : [])];
}

/* ======================================
   HELPERS DE USUARIO
====================================== */

function getSafeDisplayName(user) {
  if (!user) return "Invitado";
  if (user.isAnonymous) return "Invitado";

  const displayName = safeString(user.displayName);
  if (displayName) return displayName;

  const email = safeString(user.email);
  if (email.includes("@")) return email.split("@")[0];

  return "Jugador";
}

function getUserInitials(user) {
  const name = getSafeDisplayName(user);
  const parts = name.split(/\s+/).filter(Boolean);

  if (!parts.length) return "M";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getProviderName(user) {
  if (!user) return "unknown";
  if (user.isAnonymous) return "anonymous";

  const providerId =
    user.providerData?.[0]?.providerId ||
    user.providerId ||
    "";

  if (providerId === "google.com") return "google";
  if (providerId) return providerId;

  return "unknown";
}

function normalizeAuthError(error) {
  const code = String(error?.code || "auth/unknown");
  let message = "No se pudo completar la autenticación.";

  switch (code) {
    case "auth/popup-closed-by-user":
      message = "Se cerró la ventana de inicio de sesión antes de completar el acceso.";
      break;
    case "auth/cancelled-popup-request":
      message = "Ya hay una ventana de acceso abierta. Termina esa primero.";
      break;
    case "auth/popup-blocked":
      message = "El navegador bloqueó la ventana emergente de acceso.";
      break;
    case "auth/network-request-failed":
      message = "Hubo un problema de red al intentar iniciar sesión.";
      break;
    case "auth/operation-not-allowed":
      message = "Este método de autenticación no está habilitado en Firebase.";
      break;
    case "auth/admin-restricted-operation":
      message = "Esta operación está restringida por la configuración del proyecto.";
      break;
    case "auth/too-many-requests":
      message = "Se realizaron demasiados intentos. Espera un momento e inténtalo otra vez.";
      break;
    default:
      message = error?.message || message;
      break;
  }

  return {
    code,
    message,
    raw: error
  };
}

function normalizeAuthUser(user) {
  if (!user) return null;

  const displayName = getSafeDisplayName(user);
  const email = safeString(user.email);
  const photoURL = safeString(user.photoURL);
  const providerName = getProviderName(user);

  return {
    uid: user.uid,
    displayName,
    email,
    photoURL,
    initials: getUserInitials(user),
    isAnonymous: Boolean(user.isAnonymous),
    provider: providerName,
    hasSeenIntro: hasSeenIntro(),
    raw: user
  };
}

function getUserDocRef(uid) {
  return doc(db, USERS_COLLECTION, uid);
}

function buildUserPayload(normalized) {
  return {
    uid: normalized.uid,
    name: normalized.displayName,
    email: normalized.email,
    photoURL: normalized.photoURL,
    initials: normalized.initials,
    provider: normalized.provider,
    isAnonymous: normalized.isAnonymous
  };
}

/* ======================================
   HELPERS DE NAVEGACIÓN DEL JUEGO
====================================== */

export function markIntroSeen() {
  writeStorage(STORAGE_KEYS.introSeen, "true");

  if (authResolvedUser) {
    authResolvedUser = {
      ...authResolvedUser,
      hasSeenIntro: true
    };
  }
}

export function clearIntroSeen() {
  removeStorage(STORAGE_KEYS.introSeen);

  if (authResolvedUser) {
    authResolvedUser = {
      ...authResolvedUser,
      hasSeenIntro: false
    };
  }
}

export function hasSeenIntro() {
  return toBoolean(readStorage(STORAGE_KEYS.introSeen, "false"));
}

export function setPostLoginRedirect(url) {
  if (!hasText(url)) return;
  writeStorage(STORAGE_KEYS.authRedirectAfterLogin, url);
}

export function getPostLoginRedirect() {
  return safeString(readStorage(STORAGE_KEYS.authRedirectAfterLogin, ""));
}

export function clearPostLoginRedirect() {
  removeStorage(STORAGE_KEYS.authRedirectAfterLogin);
}

export function getDefaultNextGameScreen() {
  return hasSeenIntro() ? "mapa.html" : "intro.html";
}

export function resolvePostLoginRedirect(explicitUrl = "") {
  const direct = safeString(explicitUrl);
  if (direct) return direct;

  const stored = getPostLoginRedirect();
  if (stored) return stored;

  return getDefaultNextGameScreen();
}

function rememberLastProvider(providerName) {
  if (!hasText(providerName)) return;
  writeStorage(STORAGE_KEYS.lastAuthProvider, providerName);
}

export function getLastAuthProvider() {
  return safeString(readStorage(STORAGE_KEYS.lastAuthProvider, ""));
}

/* ======================================
   DOCUMENTO DE USUARIO
====================================== */

export async function ensureUserDocument(user) {
  if (!user?.uid) return null;

  const authUser = user.raw ? user.raw : user;
  const normalized = normalizeAuthUser(authUser);

  if (!normalized?.uid) return null;

  const userRef = getUserDocRef(normalized.uid);
  const basePayload = buildUserPayload(normalized);

  try {
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      const payload = {
        ...basePayload,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        xp: 0,
        level: 1,
        completedGames: [],
        completedRegions: [],
        visitedRegions: [],
        unlockedRegions: DEFAULT_UNLOCKED_REGIONS,
        currentRegion: DEFAULT_UNLOCKED_REGIONS[0],
        introSeen: hasSeenIntro()
      };

      await setDoc(userRef, payload);
      return payload;
    }

    const updatePayload = {
      ...basePayload,
      lastLoginAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      introSeen: hasSeenIntro()
    };

    await updateDoc(userRef, updatePayload);

    return {
      ...snap.data(),
      ...basePayload,
      introSeen: hasSeenIntro()
    };
  } catch (error) {
    // No re-lanzar: un fallo de permisos en Firestore no debe bloquear la app
    console.warn("[auth] Error asegurando documento de usuario (no bloqueante):", error);
    return null;
  }
}

export async function getUserProfile(uid) {
  if (!uid) return null;

  try {
    const snap = await getDoc(getUserDocRef(uid));
    if (!snap.exists()) return null;

    return {
      id: snap.id,
      ...snap.data()
    };
  } catch (error) {
    console.error("[auth] Error obteniendo perfil de usuario:", error);
    return null;
  }
}

export async function touchUserSession(uid) {
  if (!uid) return;

  try {
    await updateDoc(getUserDocRef(uid), {
      lastSeenAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("[auth] No se pudo actualizar lastSeenAt:", error);
  }
}

export async function syncIntroSeenToProfile(uid) {
  if (!uid) return;

  try {
    await updateDoc(getUserDocRef(uid), {
      introSeen: hasSeenIntro(),
      lastSeenAt: serverTimestamp()
    });
  } catch (error) {
    console.warn("[auth] No se pudo sincronizar introSeen:", error);
  }
}

/* ======================================
   LOGIN / LOGOUT
====================================== */

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider);
    const normalized = normalizeAuthUser(result.user);

    rememberLastProvider(normalized?.provider || "google");
    await ensureUserDocument(result.user);

    return normalizeAuthUser(result.user);
  } catch (error) {
    const parsed = normalizeAuthError(error);
    console.error("[auth] Error en login con Google:", parsed);
    throw parsed;
  }
}

export async function loginAnonymouslyUser() {
  try {
    const result = await signInAnonymously(auth);
    const normalized = normalizeAuthUser(result.user);

    rememberLastProvider(normalized?.provider || "anonymous");
    await ensureUserDocument(result.user);

    return normalizeAuthUser(result.user);
  } catch (error) {
    const parsed = normalizeAuthError(error);
    console.error("[auth] Error en login anónimo:", parsed);
    throw parsed;
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    const parsed = normalizeAuthError(error);
    console.error("[auth] Error cerrando sesión:", parsed);
    throw parsed;
  }
}

/* ======================================
   ESTADO ACTUAL
====================================== */

export function getCurrentUser() {
  return normalizeAuthUser(auth.currentUser);
}

export function isAuthenticated() {
  return Boolean(auth.currentUser);
}

export function isAnonymousUser() {
  return Boolean(auth.currentUser?.isAnonymous);
}

export function waitForAuthReady() {
  if (authResolved) {
    return Promise.resolve(authResolvedUser);
  }

  if (authReadyPromise) {
    return authReadyPromise;
  }

  authReadyPromise = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      authResolved = true;
      authResolvedUser = normalizeAuthUser(user);
      unsubscribe();
      resolve(authResolvedUser);
    });
  });

  return authReadyPromise;
}

/* ======================================
   OBSERVADOR DE SESIÓN
====================================== */

export function onUserChange(callback) {
  return onAuthStateChanged(auth, async (user) => {
    const normalized = normalizeAuthUser(user);

    authResolved = true;
    authResolvedUser = normalized;

    try {
      if (normalized?.uid) {
        await ensureUserDocument(user);
      }

      await callback(normalized);
    } catch (error) {
      console.error("[auth] Error en onUserChange:", error);
    }
  });
}

/* ======================================
   HELPERS DE UI
====================================== */

function setButtonLoading(el, isLoading, loadingText = "Cargando...") {
  if (!el) return;

  if (!el.dataset.originalText) {
    el.dataset.originalText = el.textContent || "";
  }

  if ("disabled" in el) {
    el.disabled = isLoading;
  }

  el.setAttribute("aria-busy", String(isLoading));

  if (isLoading) {
    el.textContent = loadingText;
    el.classList.add("is-loading");
  } else {
    el.textContent = el.dataset.originalText || el.textContent || "";
    el.classList.remove("is-loading");
  }
}

function redirectIfNeeded(url) {
  const safeUrl = safeString(url);
  if (!safeUrl) return;
  window.location.href = safeUrl;
}

/**
 * Vincula botones de login/logout si existen en la página.
 *
 * IDs esperados:
 * - #loginGoogleBtn
 * - #loginGuestBtn
 * - #logoutBtn
 */
export function bindAuthUI(options = {}) {
  const {
    onLogin,
    onLogout,
    onError,
    redirectAfterLogin = "",
    redirectAfterLogout = "",
    disableIfAuthenticated = false,
    rememberCurrentAsRedirect = false
  } = options;

  const googleBtn = document.getElementById("loginGoogleBtn");
  const guestBtn = document.getElementById("loginGuestBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  async function handleError(error) {
    if (onError) {
      await onError(error);
      return;
    }

    console.error("[auth]", error);
    window.alert(error?.message || "Ocurrió un error de autenticación.");
  }

  async function handleLogin(action, buttonEl, loadingText) {
    try {
      if (rememberCurrentAsRedirect) {
        const currentFile =
          window.location.pathname.split("/").pop() || "index.html";
        setPostLoginRedirect(currentFile);
      }

      setButtonLoading(buttonEl, true, loadingText);

      const user = await action();

      if (onLogin) {
        await onLogin(user);
      }

      const finalRedirect = resolvePostLoginRedirect(redirectAfterLogin);
      clearPostLoginRedirect();
      redirectIfNeeded(finalRedirect);
    } catch (error) {
      await handleError(error);
    } finally {
      setButtonLoading(buttonEl, false);
    }
  }

  async function handleLogout() {
    try {
      setButtonLoading(logoutBtn, true, "Cerrando...");

      await logoutUser();

      if (onLogout) {
        await onLogout();
      }

      redirectIfNeeded(redirectAfterLogout);
    } catch (error) {
      await handleError(error);
    } finally {
      setButtonLoading(logoutBtn, false);
    }
  }

  if (googleBtn && googleBtn.dataset.authBound !== "true") {
    googleBtn.dataset.authBound = "true";
    googleBtn.addEventListener("click", async () => {
      await handleLogin(loginWithGoogle, googleBtn, "Entrando...");
    });
  }

  if (guestBtn && guestBtn.dataset.authBound !== "true") {
    guestBtn.dataset.authBound = "true";
    guestBtn.addEventListener("click", async () => {
      await handleLogin(loginAnonymouslyUser, guestBtn, "Ingresando...");
    });
  }

  if (logoutBtn && logoutBtn.dataset.authBound !== "true") {
    logoutBtn.dataset.authBound = "true";
    logoutBtn.addEventListener("click", handleLogout);
  }

  if (disableIfAuthenticated) {
    waitForAuthReady().then((user) => {
      if (!user) return;

      if (googleBtn) googleBtn.disabled = true;
      if (guestBtn) guestBtn.disabled = true;
    });
  }
}

/* ======================================
   HELPERS DE DOM OPCIONALES
====================================== */

export function renderAuthUserUI(user) {
  const nameEl = document.getElementById("userName");
  const emailEl = document.getElementById("userEmail");
  const avatarEl = document.getElementById("userAvatar");
  const providerEl = document.getElementById("userProvider");

  if (nameEl) {
    nameEl.textContent = user?.displayName || "Invitado";
  }

  if (emailEl) {
    emailEl.textContent = user?.email || (user?.isAnonymous ? "Sesión invitado" : "");
  }

  if (avatarEl) {
    if (user?.photoURL) {
      const safeSrc = escapeHTML(user.photoURL);
      const safeAlt = escapeHTML(`Avatar de ${user.displayName || "usuario"}`);
      avatarEl.innerHTML = `<img src="${safeSrc}" alt="${safeAlt}">`;
    } else {
      avatarEl.innerHTML = "";
      avatarEl.textContent = user?.initials || "M";
    }
  }

  if (providerEl) {
    providerEl.textContent = user?.provider || "unknown";
  }
}

export function renderAuthVisibility(user) {
  const authOnly = document.getElementById("authOnly");
  const guestOnly = document.getElementById("guestOnly");

  if (authOnly) {
    authOnly.hidden = !user;
  }

  if (guestOnly) {
    guestOnly.hidden = Boolean(user);
  }
}