// Shared helpers for both pages. Everything from the server is set with
// textContent, never as HTML.

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key === "style") for (const [prop, v] of Object.entries(value)) node.style.setProperty(prop, v);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// A corked message in a bottle (static markup).
export const BOTTLE = `
<svg viewBox="0 0 120 200" aria-hidden="true">
  <rect x="46" y="6" width="28" height="24" rx="5" fill="#a87a4a"/>
  <path d="M50 13 h20 M50 20 h20" stroke="#7f5530" stroke-width="1.6"/>
  <path d="M48 28 h24 v24 q0 10 14 20 q16 11 16 33 v68 q0 17 -17 17 h-50 q-17 0 -17 -17 v-68 q0 -22 16 -33 q14 -10 14 -20 z"
        fill="#a6d6ca" fill-opacity="0.38" stroke="#4f8579" stroke-width="3"/>
  <path d="M21 150 q39 -12 78 0 v18 q0 15 -15 15 h-48 q-15 0 -15 -15 z" fill="#7fb8ad" fill-opacity="0.35"/>
  <g transform="rotate(-9 60 132)">
    <rect x="38" y="90" width="44" height="82" rx="9" fill="#f4e8cc" stroke="#c9ad7a" stroke-width="1.5"/>
    <path d="M38 101 q22 6 44 0 M38 161 q22 6 44 0" stroke="#c9ad7a" stroke-width="1.5" fill="none"/>
    <path d="M37 124 h46" stroke="#b3261e" stroke-width="6"/>
    <circle cx="60" cy="124" r="7.5" fill="#8f1e17"/>
    <path d="M57 121 l6 6 M63 121 l-6 6" stroke="#e2b44f" stroke-width="1.6"/>
  </g>
  <path d="M31 104 q-3 32 0 62" stroke="#fff" stroke-opacity="0.75" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M57 36 v14" stroke="#fff" stroke-opacity="0.6" stroke-width="3" stroke-linecap="round"/>
</svg>`;

// Static, trusted SVG markup only.
export function svg(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = "GET", body, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Can't reach the ship. Check your connection and try again.");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // fall through
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "Something went wrong. Try again.");
  return data;
}

let toastTimer;
export function toast(message, { error = false } = {}) {
  let node = document.querySelector(".toast");
  if (!node) {
    node = el("div", { class: "toast", role: "status", "aria-live": "polite" });
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.toggle("error", error);
  requestAnimationFrame(() => node.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), error ? 5000 : 2600);
}

export function storage(key) {
  return {
    get() {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        // private mode etc.
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}

export function letItSnow(count = 36) {
  const layer = document.querySelector(".snow");
  if (!layer || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rand = (min, max) => min + Math.random() * (max - min);
  for (let i = 0; i < count; i++) {
    layer.append(
      el("span", {
        class: "flake",
        style: {
          "--x": `${rand(0, 100)}vw`,
          "--size": `${rand(2, 5.5)}px`,
          "--alpha": rand(0.35, 0.85).toFixed(2),
          "--dur": `${rand(11, 24)}s`,
          "--delay": `${rand(-24, 0)}s`,
          "--sway": `${rand(-40, 40)}px`,
        },
      }),
    );
  }
}

// "2026-12-20" + "18:00" -> a local Date
export function eventDate(event) {
  if (!event?.date) return null;
  const [y, m, d] = event.date.split("-").map(Number);
  const [hh, mm] = (event.time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export function formatEventDate(event) {
  const when = eventDate(event);
  if (!when) return "";
  const day = when.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  if (!event.time) return day;
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

// Whole days between today and the event date, by the calendar.
export function sleepsUntil(event) {
  const when = eventDate(event);
  if (!when) return null;
  const today = new Date();
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(when.getFullYear(), when.getMonth(), when.getDate());
  return Math.round((b - a) / 86400000);
}

export function siteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export const isWebLink = (url) => /^https?:\/\//i.test(url ?? "");
