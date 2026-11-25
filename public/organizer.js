import { api, el, letItSnow, storage, toast } from "./common.js";

const keyStore = storage("jolly-kringle:organizer");
const app = document.getElementById("app");
const footer = document.getElementById("footer");

let key = keyStore.get();
let state = null;
let firstRender = true;

const call = (body) =>
  api("/api/organizer", { method: body ? "POST" : "GET", body, headers: { "x-organizer-key": key } });

async function load() {
  if (!key) return renderLogin();
  try {
    state = await call();
    keyStore.set(key);
    render();
  } catch (err) {
    if (err.status === 401) {
      keyStore.clear();
      key = null;
      return renderLogin("That key didn't work. Check it matches ORGANIZER_KEY in Netlify.");
    }
    renderProblem(err.message);
  }
}

function card(eyebrow, title, ...children) {
  return el(
    "article",
    { class: "card" },
    el("p", { class: "eyebrow", text: eyebrow }),
    el("h3", { text: title }),
    el("div", { class: "rope" }),
    ...children,
  );
}

function rise(node, i) {
  if (firstRender) {
    node.classList.add("rise");
    node.style.setProperty("--i", i);
  }
  return node;
}

// ---------- Screens ----------

function renderLogin(message) {
  footer.replaceChildren();
  const input = el("input", { type: "password", name: "key", autocomplete: "current-password", required: true });
  const form = el(
    "form",
    { class: "form" },
    el("label", {}, "Organizer key", input),
    el("div", { class: "form-actions" }, el("button", { class: "btn", type: "submit", text: "Come aboard" })),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    key = input.value.trim();
    if (key) load();
  });
  app.replaceChildren(
    el(
      "article",
      { class: "card notice" },
      el("p", { class: "eyebrow", text: "Captain's quarters" }),
      el("h3", { text: "The organizer's key, please" }),
      el("div", { class: "rope" }),
      message ? el("p", { class: "warning", text: message }) : null,
      el("p", { class: "fine", text: "This is the ORGANIZER_KEY you set in Netlify. This browser will remember it." }),
      form,
    ),
  );
  input.focus();
}

function renderProblem(message) {
  app.replaceChildren(
    card(
      "Rough seas",
      "Something's amiss",
      el("p", { text: message }),
      el("p", {}, el("button", { class: "btn", type: "button", text: "Try again", onclick: () => load() })),
    ),
  );
}

function render() {
  app.replaceChildren(
    rise(
      el(
        "section",
        { class: "greeting" },
        el("h2", { text: "Welcome, Captain" }),
        el("p", { text: "Set the course, draw the lots, and hand out the links." }),
      ),
      0,
    ),
    el("div", { class: "org-grid" }, rise(drawCard(), 1), rise(linksCard(), 2), rise(eventCard(), 3)),
  );
  footer.replaceChildren(
    el("p", {}, "Done for now? "),
    el("button", {
      class: "link-btn",
      type: "button",
      text: "Forget the key on this device",
      onclick: () => {
        keyStore.clear();
        key = null;
        renderLogin();
      },
    }),
  );
  firstRender = false;
}

function drawCard() {
  const { done, drawnAt, locked } = state.draw;
  const when = drawnAt
    ? new Date(drawnAt).toLocaleString(undefined, { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })
    : "";

  let dot = "";
  let text;
  let label = null;
  if (!done) {
    text = "The lots haven't been drawn yet. People can add wishes before and after you draw.";
    label = "Draw the lots";
  } else if (!locked) {
    dot = "ok";
    text = `Drawn ${when}. Nobody has looked yet, so you can still redraw.`;
    label = "Redraw";
  } else {
    dot = "locked";
    text = `Drawn ${when}. Locked, because at least one person has seen who they're buying for.`;
  }

  const button = label
    ? el("button", {
        class: done ? "btn ghost" : "btn",
        type: "button",
        text: label,
        onclick: async (e) => {
          if (done && !confirm("Redraw the lots? Everyone will get a new person.")) return;
          e.currentTarget.disabled = true;
          try {
            state = await call({ op: "draw" });
            render();
            toast(done ? "Redrawn. Fresh orders for everyone." : "The lots are drawn! Time to send the links.");
          } catch (err) {
            toast(err.message, { error: true });
            await load();
          }
        },
      })
    : null;

  return card(
    "Drawing lots",
    "The secret draw",
    el("div", { class: "status-line" }, el("span", { class: `dot ${dot}` }), el("p", { text })),
    button ? el("div", { class: "form-actions" }, button) : null,
    el("p", {
      class: "fine",
      text: "Nobody draws their partner, and nobody gets a direct swap. The draw stays secret: this page never shows it.",
    }),
  );
}

function linksCard() {
  const canShare = typeof navigator.share === "function";
  const rows = state.crew.map((person) => {
    const url = `${location.origin}/#${person.token}`;
    const status = state.draw.done
      ? el("span", {
          class: person.seen ? "seen" : null,
          text: person.seen ? " · has seen their orders" : " · hasn't looked yet",
        })
      : null;
    return el(
      "li",
      { class: "crew-row" },
      el(
        "div",
        {},
        el("span", { class: "crew-name", text: person.name }),
        el("span", { class: "crew-meta" }, `Sails with ${person.partner}`, status),
      ),
      el(
        "div",
        { class: "crew-actions" },
        el("button", {
          class: "btn small brass",
          type: "button",
          text: "Copy link",
          "aria-label": `Copy ${person.name}'s link`,
          onclick: () => copyLink(person.name, url),
        }),
        canShare
          ? el("button", {
              class: "btn small ghost",
              type: "button",
              text: "Share",
              "aria-label": `Share ${person.name}'s link`,
              onclick: () => shareLink(person.name, url),
            })
          : null,
      ),
    );
  });

  return card(
    "Crew links",
    "Hand out the links",
    el("p", {
      class: "warning",
      text: "Send each person only their own link, and please don't open anyone else's. It would show you who they're buying for, and opening it locks the draw.",
    }),
    el("ul", { class: "crew-list" }, rows),
  );
}

function eventCard() {
  const e = state.event;
  const input = (name, label, props = {}) =>
    el("label", {}, label, el("input", { name, value: e[name] ?? "", autocomplete: "off", ...props }));
  const notes = el("textarea", { name: "notes", rows: 3, maxlength: 800 });
  notes.value = e.notes ?? "";

  const form = el(
    "form",
    { class: "form" },
    el(
      "div",
      { class: "field-row" },
      input("date", "Date", { type: "date" }),
      input("time", "Time", { type: "time" }),
    ),
    input("place", "Where", { type: "text", maxlength: 200, placeholder: "e.g. Sian & Charles's house" }),
    input("budget", "Budget", { type: "text", maxlength: 80, placeholder: "e.g. About 40 each" }),
    el("label", {}, "Notes for the crew", notes),
    el("div", { class: "form-actions" }, el("button", { class: "btn", type: "submit", text: "Save the log" })),
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    try {
      state = await call({ op: "event", event: data });
      render();
      toast("Ship's log updated. Everyone will see it.");
    } catch (err) {
      button.disabled = false;
      toast(err.message, { error: true });
    }
  });

  return card("Ship's log", "Date, place and budget", form);
}

// ---------- Handing out links ----------

const message = (name) =>
  `Ahoy ${name}! Here's your private link for our Secret Santa on the high seas. It's just for you, so keep it to yourself:`;

async function copyLink(name, url) {
  try {
    await navigator.clipboard.writeText(url);
    toast(`${name}'s link copied.`);
  } catch {
    window.prompt(`Copy ${name}'s link:`, url);
  }
}

async function shareLink(name, url) {
  try {
    await navigator.share({ title: "The Jolly Kringle", text: message(name), url });
  } catch (err) {
    if (err?.name !== "AbortError") copyLink(name, url);
  }
}

letItSnow(24);
load();
