// ======================================
// MUSI
// firebase-config.js
// Inicialización de Firebase
// ======================================

/* ======================================
   IMPORTS FIREBASE
====================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth
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
   EXPORTS
====================================== */

export {
  app,
  auth,
  db,
  analytics
};