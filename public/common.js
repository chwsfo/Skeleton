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
