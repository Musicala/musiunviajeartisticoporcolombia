// ======================================
// MUSI
// ui.js
// Utilidades visuales reutilizables
// ======================================

/* ======================================
   HELPERS DOM
====================================== */

export const $ = (selector, root = document) => root.querySelector(selector);

export const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

/**
 * Retorna true si el elemento existe.
 * @param {Element|null} el
 * @returns {boolean}
 */
export function exists(el) {
  return Boolean(el);
}

/* ======================================
   TEXTO / HTML
====================================== */

/**
 * Asigna textContent de forma segura.
 * @param {string|Element} target
 * @param {string|number} value
 * @param {string} [fallback]
 */
export function setText(target, value, fallback = "-") {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.textContent = value ?? fallback;
}

/**
 * Asigna innerHTML.
 * Usar solo con contenido controlado.
 * @param {string|Element} target
 * @param {string} value
 * @param {string} [fallback]
 */
export function setHTML(target, value, fallback = "") {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.innerHTML = value ?? fallback;
}

/**
 * Limpia el contenido HTML interno.
 * @param {string|Element} target
 */
export function clearElement(target) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.innerHTML = "";
}

/* ======================================
   CLASES / VISIBILIDAD
====================================== */

/**
 * Muestra un elemento quitando hidden.
 * @param {string|Element} target
 */
export function show(target) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.classList.remove("hidden");
  if (el.hasAttribute("aria-hidden")) {
    el.setAttribute("aria-hidden", "false");
  }
}

/**
 * Oculta un elemento agregando hidden.
 * @param {string|Element} target
 */
export function hide(target) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.classList.add("hidden");
  if (el.hasAttribute("aria-hidden")) {
    el.setAttribute("aria-hidden", "true");
  }
}

/**
 * Alterna visibilidad con hidden.
 * @param {string|Element} target
 * @param {boolean} force
 */
export function toggle(target, force) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;

  if (typeof force === "boolean") {
    el.classList.toggle("hidden", !force);
  } else {
    el.classList.toggle("hidden");
  }

  if (el.hasAttribute("aria-hidden")) {
    el.setAttribute(
      "aria-hidden",
      el.classList.contains("hidden") ? "true" : "false"
    );
  }
}

/**
 * Agrega una clase si el elemento existe.
 * @param {string|Element} target
 * @param {string} className
 */
export function addClass(target, className) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el || !className) return;
  el.classList.add(className);
}

/**
 * Elimina una clase si el elemento existe.
 * @param {string|Element} target
 * @param {string} className
 */
export function removeClass(target, className) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el || !className) return;
  el.classList.remove(className);
}

/**
 * Alterna una clase.
 * @param {string|Element} target
 * @param {string} className
 * @param {boolean} [force]
 */
export function toggleClass(target, className, force) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el || !className) return;
  el.classList.toggle(className, force);
}

/* ======================================
   ATRIBUTOS / ESTADOS
====================================== */

/**
 * Activa o desactiva un botón/elemento interactivo.
 * @param {string|Element} target
 * @param {boolean} disabled
 */
export function setDisabled(target, disabled = true) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;

  if ("disabled" in el) {
    el.disabled = disabled;
  }

  el.classList.toggle("is-disabled", Boolean(disabled));
  el.setAttribute("aria-disabled", String(Boolean(disabled)));
}

/**
 * Cambia un atributo.
 * @param {string|Element} target
 * @param {string} attr
 * @param {string} value
 */
export function setAttr(target, attr, value) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el || !attr) return;
  el.setAttribute(attr, value);
}

/**
 * Remueve un atributo.
 * @param {string|Element} target
 * @param {string} attr
 */
export function removeAttr(target, attr) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el || !attr) return;
  el.removeAttribute(attr);
}

/* ======================================
   FORMATOS
====================================== */

/**
 * Devuelve la inicial del nombre.
 * @param {string} name
 * @param {string} [fallback]
 * @returns {string}
 */
export function getInitial(name = "", fallback = "M") {
  const safe = String(name).trim();
  return safe ? safe.charAt(0).toUpperCase() : fallback;
}

/**
 * Convierte un id como "ritmo-caribe" en texto bonito.
 * @param {string} value
 * @returns {string}
 */
export function prettifyLabel(value = "") {
  if (!value) return "";

  return String(value)
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Convierte un valor a número seguro.
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/* ======================================
   TOASTS
====================================== */

let toastTimer = null;

/**
 * Muestra un toast en #toastMessage si existe.
 * Tipos esperados: info, success, warning
 *
 * @param {string} message
 * @param {"info"|"success"|"warning"} [type]
 * @param {number} [duration]
 */
export function showToast(message = "", type = "info", duration = 2600) {
  const toast = $("#toastMessage");
  if (!toast || !message) return;

  toast.textContent = message;
  toast.classList.remove("hidden", "is-info", "is-success", "is-warning");
  toast.classList.add(`is-${type}`);

  clearTimeout(toastTimer);

  toastTimer = window.setTimeout(() => {
    hide(toast);
  }, duration);
}

/**
 * Oculta el toast si existe.
 */
export function hideToast() {
  const toast = $("#toastMessage");
  if (!toast) return;
  clearTimeout(toastTimer);
  hide(toast);
}

/* ======================================
   MODALES
====================================== */

/**
 * Abre un modal simple.
 * @param {string|Element} target
 */
export function openModal(target) {
  const modal = typeof target === "string" ? $(target) : target;
  if (!modal) return;

  show(modal);
  document.body.classList.add("modal-open");
}

/**
 * Cierra un modal simple.
 * @param {string|Element} target
 */
export function closeModal(target) {
  const modal = typeof target === "string" ? $(target) : target;
  if (!modal) return;

  hide(modal);
  document.body.classList.remove("modal-open");
}

/**
 * Vincula cierre por fondo, botón y Escape.
 *
 * @param {Object} options
 * @param {string|Element} options.modal
 * @param {string|Element} [options.closeBtn]
 */
export function bindModal(options = {}) {
  const modal =
    typeof options.modal === "string" ? $(options.modal) : options.modal;

  const closeBtn =
    typeof options.closeBtn === "string"
      ? $(options.closeBtn)
      : options.closeBtn;

  if (!modal) return;

  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeModal(modal));
  }

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal(modal);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      closeModal(modal);
    }
  });
}

/* ======================================
   LISTAS
====================================== */

/**
 * Crea un elemento con clase y texto.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
export function createElement(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

/**
 * Renderiza una lista simple.
 *
 * @param {string|Element} target
 * @param {Array} items
 * @param {Object} [options]
 * @param {(item:any)=>string} [options.formatter]
 * @param {string} [options.emptyText]
 * @param {string} [options.itemClass]
 */
export function renderSimpleList(target, items = [], options = {}) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;

  const {
    formatter = (item) => String(item),
    emptyText = "No hay datos disponibles.",
    itemClass = "ui-list-item"
  } = options;

  clearElement(el);

  if (!Array.isArray(items) || !items.length) {
    const emptyItem = createElement("li", "empty-state", emptyText);
    el.appendChild(emptyItem);
    return;
  }

  items.forEach((item) => {
    const li = createElement("li", itemClass);
    const title = createElement("div", "ui-list-item-title", formatter(item));
    li.appendChild(title);
    el.appendChild(li);
  });
}

/* ======================================
   AVATARES
====================================== */

/**
 * Actualiza un avatar textual con la inicial.
 * @param {string|Element} target
 * @param {string} name
 * @param {string} [fallback]
 */
export function setAvatarInitial(target, name = "", fallback = "M") {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.textContent = getInitial(name, fallback);
}

/* ======================================
   PROGRESO VISUAL
====================================== */

/**
 * Actualiza una barra de progreso usando porcentaje.
 * Espera un hijo .progress-bar-fill dentro del contenedor
 * o recibir directamente el fill.
 *
 * @param {string|Element} target
 * @param {number} percent
 */
export function setProgressBar(target, percent = 0) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;

  const fill = el.classList.contains("progress-bar-fill")
    ? el
    : $(".progress-bar-fill", el);

  if (!fill) return;

  const safe = Math.max(0, Math.min(100, toNumber(percent, 0)));
  fill.style.width = `${safe}%`;
  fill.setAttribute("aria-valuenow", String(safe));
}

/**
 * Convierte XP a porcentaje dentro de un tramo de nivel.
 * Por defecto, cada nivel son 100 XP.
 *
 * @param {number} xp
 * @param {number} [chunk]
 * @returns {number}
 */
export function getLevelProgressPercent(xp = 0, chunk = 100) {
  const safeXp = Math.max(0, toNumber(xp, 0));
  const safeChunk = Math.max(1, toNumber(chunk, 100));
  return ((safeXp % safeChunk) / safeChunk) * 100;
}

/* ======================================
   BINDERS ÚTILES
====================================== */

/**
 * Vincula navegación básica por click.
 * @param {string|Element} target
 * @param {string} href
 */
export function bindNavigate(target, href = "") {
  const el = typeof target === "string" ? $(target) : target;
  if (!el || !href) return;

  el.addEventListener("click", () => {
    window.location.href = href;
  });
}

/**
 * Hace bind de múltiples elementos con callback.
 * @param {string} selector
 * @param {(el:Element, event:Event)=>void} callback
 * @param {ParentNode} [root]
 */
export function bindAll(selector, callback, root = document) {
  $$(selector, root).forEach((el) => {
    el.addEventListener("click", (event) => callback(el, event));
  });
}