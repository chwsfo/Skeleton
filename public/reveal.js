// The reveal party: one bottle per Santa, then the whole chart.
import { BOTTLE, api, el, letItSnow, storage, svg } from "./common.js";

const linkStore = storage("jolly-kringle:link");
const keyStore = storage("jolly-kringle:organizer");
const app = document.getElementById("app");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SVG_NS = "http://www.w3.org/2000/svg";

const auth = credentials();
let chart = null; // { people, gifts, loops }
let names = {};
let order = []; // the gifts, shuffled so one answer doesn't give away the next
let step = 0;
const opened = new Set();
let waitTimer = null;

// A crew link (from the address or this browser), else the organizer key.
function credentials() {
  const fromHash = decodeURIComponent(location.hash.replace(/^#/, "")).trim();
  if (fromHash) {
    linkStore.set(fromHash);
    return { kind: "crew", headers: { "x-crew-token": fromHash }, token: fromHash };
  }
  const link = linkStore.get();
  if (link) return { kind: "crew", headers: { "x-crew-token": link }, token: link };
  const key = keyStore.get();
  if (key) return { kind: "organizer", headers: { "x-organizer-key": key } };
  return null;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function load() {
  clearTimeout(waitTimer);
  if (!auth) {
    return notice(
      "Permission to come aboard?",
      "Open this from your own link",
      "Use the private link the organizer sent you, then tap the reveal banner on your page.",
    );
  }
  try {
    chart = await api("/api/reveal", { headers: auth.headers });
    names = Object.fromEntries(chart.people.map((p) => [p.id, p.name]));
    order = shuffle(chart.gifts);
    opened.clear();
    step = 0;
    render();
  } catch (err) {
    if (err.status === 403) {
      waiting();
      // Open by itself the moment the organizer starts the party.
      waitTimer = setTimeout(load, 15000);
      return;
    }
    if (err.status === 401) {
      return notice("Permission to come aboard?", "That link doesn't match anyone aboard", "Check the link the organizer sent you.");
    }
    notice("Rough seas", "Something's amiss", err.message, true);
  }
}

// ---------- Screens ----------

function backLink() {
  const [href, text] =
    auth?.kind === "crew" ? [`/#${auth.token}`, "Back to your page"] : ["/organizer", "Back to captain's quarters"];
  return el("p", { class: "skip" }, el("a", { class: "link-btn light", href, text }));
}

function greeting(title, subtitle) {
  return el("section", { class: "greeting" }, el("h2", { text: title }), el("p", { text: subtitle }));
}

function notice(eyebrow, title, message, retry = false) {
  app.replaceChildren(
    el(
      "article",
      { class: "card notice" },
      el("p", { class: "eyebrow", text: eyebrow }),
      el("h3", { text: title }),
      el("div", { class: "rope" }),
      el("p", { text: message }),
      retry ? el("p", {}, el("button", { class: "btn", type: "button", text: "Try again", onclick: load })) : null,
    ),
  );
}

function waiting() {
  app.replaceChildren(
    el(
      "article",
      { class: "card notice" },
      el("p", { class: "eyebrow", text: "Hold fast" }),
      el("h3", { text: "Not yet!" }),
      el("div", { class: "rope" }),
      el("div", { class: "not-drawn" }, svg(BOTTLE)),
      el("p", {
        text: "The reveal party hasn't started. Keep this page open: the bottles will wash up by themselves the moment the organizer starts it.",
      }),
    ),
    backLink(),
  );
}

function go(next) {
  step = next;
  render();
  window.scrollTo({ top: app.offsetTop - 16, behavior: reducedMotion ? "auto" : "smooth" });
}

function render() {
  if (step >= order.length) return finale();
  const gift = order[step];
  const to = names[gift.to];
  const from = names[gift.from];
  const isOpen = opened.has(step);
  const last = step === order.length - 1;

  const body = el("div", { class: "orders-body" });
  if (!isOpen) {
    const button = el(
      "button",
      { class: "bottle-btn", type: "button", "aria-label": `Uncork the bottle to see who was ${to}'s Secret Santa` },
      svg(BOTTLE),
      el("span", { text: "Everyone guess, then tap to uncork" }),
    );
    button.addEventListener("click", () => {
      button.classList.add("uncorking");
      button.disabled = true;
      setTimeout(
        () => {
          opened.add(step);
          render();
          confetti();
          document.querySelector(".scroll")?.focus();
        },
        reducedMotion ? 0 : 520,
      );
    });
    body.append(button);
  } else {
    body.append(
      el(
        "div",
        { class: "scroll", tabindex: "-1", role: "region", "aria-label": "The answer" },
        el("p", { class: "decree", text: `${to}'s Secret Santa was` }),
        el("p", { class: "recipient-name", text: from }),
        el("p", { class: "hush", text: "Three cheers for the Santa!" }),
      ),
    );
  }

  app.replaceChildren(
    greeting("Uncork the bottles", "One Santa at a time. Guess first, then uncork."),
    el(
      "article",
      { class: "card orders reveal-stage" },
      el("p", { class: "eyebrow", text: `Bottle ${step + 1} of ${order.length}` }),
      el("h3", { text: `Who was ${to}'s Secret Santa?` }),
      el("div", { class: "rope" }),
      body,
      el(
        "div",
        { class: "stage-nav" },
        step > 0 ? el("button", { class: "link-btn", type: "button", text: "← Previous", onclick: () => go(step - 1) }) : el("span"),
        isOpen
          ? el("button", {
              class: "btn",
              type: "button",
              text: last ? "See the whole voyage" : "Next bottle →",
              onclick: () => go(step + 1),
            })
          : null,
      ),
    ),
    el(
      "p",
      { class: "skip" },
      el("button", { class: "link-btn light", type: "button", text: "Skip to the whole chart", onclick: () => go(order.length) }),
    ),
    backLink(),
  );
}

function finale() {
  const list = el(
    "ol",
    { class: "gift-list" },
    chart.loops.flatMap((loop) =>
      loop.map((id, i) =>
        el("li", {}, el("strong", { text: names[id] }), " gave to ", el("strong", { text: names[loop[(i + 1) % loop.length]] })),
      ),
    ),
  );
  app.replaceChildren(
    greeting("The whole voyage", "Every gift, and the Santa who sent it."),
    el(
      "article",
      { class: "card reveal-finale" },
      el("p", { class: "eyebrow", text: "Ship's chart" }),
      el("h3", { text: "Who had whom" }),
      el("div", { class: "rope" }),
      wheel(),
      list,
      el(
        "div",
        { class: "form-actions" },
        el("button", {
          class: "btn ghost",
          type: "button",
          text: "Uncork them all again",
          onclick: () => {
            order = shuffle(chart.gifts);
            opened.clear();
            go(0);
          },
        }),
      ),
    ),
    backLink(),
  );
  confetti();
}

// ---------- The ship's-wheel chart ----------

function s(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

const polar = (r, deg) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];

function wheel() {
  const loops = chart.loops;
  // Seat everyone on a spoke so each arrow is easy to follow: one loop of six
  // goes round the rim; two loops of three make two triangles.
  const seats =
    loops.length === 2 && loops.every((l) => l.length === 3)
      ? [loops[0][0], loops[1][0], loops[0][1], loops[1][1], loops[0][2], loops[1][2]]
      : loops.flat();
  const angleOf = Object.fromEntries(seats.map((id, i) => [id, -90 + i * 60]));
  const loopOf = Object.fromEntries(loops.flatMap((l, i) => l.map((id) => [id, i])));
  const colours = ["#a8231c", "#2d5b47"];

  const root = s("svg", {
    class: "wheel",
    viewBox: "-235 -230 470 460",
    role: "img",
    "aria-label": "A ship's wheel with an arrow from each Santa to the person they gave to",
  });
  const defs = s("defs");
  colours.forEach((c, i) =>
    defs.append(
      s(
        "marker",
        { id: `head${i}`, viewBox: "0 0 10 10", refX: "7", refY: "5", markerWidth: "5", markerHeight: "5", orient: "auto" },
        s("path", { d: "M0 0 L10 5 L0 10 Z", fill: c }),
      ),
    ),
  );
  root.append(defs);

  // The wheel itself, faint, behind the arrows.
  const wood = s("g", { stroke: "#7a4d2b", "stroke-linecap": "round", fill: "none", opacity: "0.45" });
  seats.forEach((_, i) => {
    const [x1, y1] = polar(28, -90 + i * 60);
    const [x2, y2] = polar(166, -90 + i * 60);
    wood.append(s("line", { x1, y1, x2, y2, "stroke-width": "8" }));
  });
  wood.append(s("circle", { r: "128", "stroke-width": "11" }), s("circle", { r: "114", "stroke-width": "2" }));
  root.append(wood);
  root.append(s("circle", { r: "26", fill: "#ecca7c", stroke: "#8a6420", "stroke-width": "2" }));
  root.append(
    s("path", {
      d: "M0 -14 V12 M-9 -7 H9 M-12 4 Q0 16 12 4",
      stroke: "#7d1712",
      "stroke-width": "3",
      fill: "none",
      "stroke-linecap": "round",
    }),
  );

  // An arrow from each Santa to their person.
  for (const { from, to } of chart.gifts) {
    const a1 = angleOf[from];
    const gap = ((angleOf[to] - a1 + 540) % 360) - 180;
    const adjacent = Math.abs(gap) === 60;
    const nudge = adjacent ? 11 : 9;
    const start = a1 + Math.sign(gap) * nudge;
    const end = a1 + gap - Math.sign(gap) * nudge;
    const [x1, y1] = polar(98, start);
    const [x2, y2] = polar(98, end);
    const [cx, cy] = polar(adjacent ? 112 : 46, a1 + gap / 2);
    const colour = loopOf[from] ?? 0;
    root.append(
      s("path", {
        d: `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
        stroke: colours[colour % 2],
        "stroke-width": "4.5",
        fill: "none",
        "stroke-linecap": "round",
        "marker-end": `url(#head${colour % 2})`,
      }),
    );
  }

  // Brass nameplates on the spoke handles.
  for (const id of seats) {
    const [x, y] = polar(186, angleOf[id]);
    const name = names[id];
    const w = Math.max(64, name.length * 10 + 26);
    root.append(
      s(
        "g",
        { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
        s("rect", { x: -w / 2, y: "-16", width: w, height: "32", rx: "7", fill: "#ecca7c", stroke: "#8a6420", "stroke-width": "2" }),
        s("text", {
          "text-anchor": "middle",
          y: "6",
          "font-family": "Alegreya, Georgia, serif",
          "font-weight": "700",
          "font-size": "17",
          fill: "#3a2710",
          text: name,
        }),
      ),
    );
  }
  return root;
}

// ---------- Confetti ----------

function confetti() {
  if (reducedMotion) return;
  const colours = ["#c0302a", "#2d5b47", "#ecca7c", "#f4e8cc", "#7fbfab"];
  const rand = (min, max) => min + Math.random() * (max - min);
  const layer = el("div", { class: "confetti", "aria-hidden": "true" });
  for (let i = 0; i < 90; i++) {
    layer.append(
      el("span", {
        style: {
          "--c": colours[i % colours.length],
          "--w": `${rand(6, 11)}px`,
          "--h": `${rand(10, 18)}px`,
          "--dx": `${rand(-48, 48)}vw`,
          "--dy": `${rand(-10, 70)}vh`,
          "--r": `${rand(-720, 720)}deg`,
          "--d": `${rand(1.4, 2.6)}s`,
        },
      }),
    );
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2800);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !chart) load();
});

letItSnow(24);
load();
