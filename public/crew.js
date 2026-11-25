import {
  BOTTLE,
  api,
  el,
  formatEventDate,
  isWebLink,
  letItSnow,
  siteName,
  sleepsUntil,
  storage,
  svg,
  toast,
} from "./common.js";

const ANCHOR = `
<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="#2d5b47" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="16" cy="6" r="3"/>
  <path d="M16 9 V28 M10 14 H22 M5 19 Q6 28 16 28 Q26 28 27 19 M3 21.5 L5 18.5 L8 20.5 M29 21.5 L27 18.5 L24 20.5"/>
</svg>`;

const ROLE_ORDER = { me: 0, recipient: 1, partner: 2, crew: 3 };
const TAGS = {
  me: ["That's you", "me"],
  recipient: ["Your secret person", "recipient"],
  partner: ["Your first mate", "partner"],
};

const linkStore = storage("jolly-kringle:link");

// Whether the bottle is open, remembered only for this browser tab.
const revealStore = {
  get: () => {
    try {
      return sessionStorage.getItem("jolly-kringle:revealed") === "1";
    } catch {
      return false;
    }
  },
  set: (on) => {
    try {
      if (on) sessionStorage.setItem("jolly-kringle:revealed", "1");
      else sessionStorage.removeItem("jolly-kringle:revealed");
    } catch {
      // ignore
    }
  },
};
const app = document.getElementById("app");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const emptyDraft = () => ({ title: "", url: "", price: "", notes: "" });

let token = readToken();
let view = null;
let firstRender = true;
let revealed = revealStore.get();
let editing = null; // id of the wish being edited
let draft = emptyDraft();
let editDraft = null;

function readToken() {
  const fromHash = decodeURIComponent(location.hash.replace(/^#/, "")).trim();
  if (fromHash) {
    linkStore.set(fromHash);
    return fromHash;
  }
  const saved = linkStore.get();
  // Put it back in the address so "Add to Home Screen" keeps working.
  if (saved) history.replaceState(null, "", `#${saved}`);
  return saved;
}

const call = (path, body) =>
  api(path, { method: body ? "POST" : "GET", body, headers: { "x-crew-token": token } });

async function load({ quiet = false } = {}) {
  if (!token) return renderLanding();
  try {
    view = await call("/api/me");
    render();
  } catch (err) {
    if (err.status === 401) {
      linkStore.clear();
      return renderLanding("That link doesn't match anyone aboard. Check the link the organizer sent you.");
    }
    if (!quiet) renderProblem(err.message);
  }
}

function handleError(err) {
  if (err.status === 401) {
    linkStore.clear();
    renderLanding("That link doesn't match anyone aboard. Check the link the organizer sent you.");
    return;
  }
  toast(err.message, { error: true });
}

// ---------- Rendering ----------

function rise(node, i) {
  if (firstRender && node) {
    node.classList.add("rise");
    node.style.setProperty("--i", i);
  }
  return node;
}

// Until the bottle is opened, the secret person's list looks like everyone
// else's, so a glance at the screen gives nothing away.
function disguise(list) {
  if (list.role !== "recipient" || revealed) return list;
  return { ...list, role: "crew", canClaim: false, items: list.items.map((item) => ({ ...item, claim: null })) };
}

function render() {
  const { me, partner, recipient, drawn, event } = view;
  const lists = view.lists.map(disguise);
  document.title = `${me.name} · The Jolly Kringle`;
  const year = event.date ? event.date.slice(0, 4) : String(new Date().getFullYear());
  document.getElementById("voyage").textContent = `Christmas voyage of ${year}`;

  const ordered = [...lists].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
  app.replaceChildren(
    view.revealed
      ? rise(
          el(
            "a",
            { class: "reveal-banner", href: `/reveal#${token}` },
            el("span", { class: "reveal-banner-title", text: "The reveal party is on!" }),
            el("span", { class: "reveal-banner-sub", text: "Uncork the bottles and see who had whom →" }),
          ),
          0,
        )
      : null,
    rise(
      el(
        "section",
        { class: "greeting" },
        el("h2", { text: `Ahoy, ${me.name}!` }),
        el("p", { text: "Welcome aboard. Your orders await." }),
      ),
      0,
    ),
    el("div", { class: "top-grid" }, rise(ordersCard(recipient, partner, drawn), 1), rise(logCard(event), 2)),
    rise(
      el(
        "section",
        { class: "section-head" },
        el("h2", { text: "The cargo manifests" }),
        el("p", {
          text: "Everyone's wish lists. If you're buying for someone, mark what you're getting so nobody doubles up. They'll never see it.",
        }),
        recipient && !revealed
          ? el("p", { text: "Open your sealed orders to mark gifts for your secret person." })
          : null,
      ),
      3,
    ),
    el(
      "div",
      { class: "lists" },
      ordered.map((list, i) => rise(listCard(list), 4 + i)),
    ),
  );
  firstRender = false;
}

function ordersCard(recipient, partner, drawn) {
  const body = el("div", { class: "orders-body" });

  if (!drawn || !recipient) {
    body.append(
      el(
        "div",
        { class: "not-drawn" },
        svg(BOTTLE),
        el("p", { text: "The lots haven't been drawn yet. Check back once the organizer draws them." }),
      ),
    );
  } else if (!revealed) {
    const button = el(
      "button",
      { class: "bottle-btn", type: "button", "aria-label": "Open the bottle to see who you're buying for" },
      svg(BOTTLE),
      el("span", { text: "Tap the bottle to read your orders" }),
    );
    button.addEventListener("click", () => {
      button.classList.add("uncorking");
      button.disabled = true;
      setTimeout(
        () => {
          revealed = true;
          revealStore.set(true);
          render();
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
        { class: "scroll", tabindex: "-1", role: "region", "aria-label": "Your orders" },
        el("p", { class: "decree", text: "By order of the North Pole Admiralty, you shall secretly gift" }),
        el("p", { class: "recipient-name", text: recipient.name }),
        el("p", { class: "hush", text: "Keep it under your hat." }),
        el("button", {
          class: "link-btn",
          type: "button",
          text: "Roll it back up",
          onclick: () => {
            revealed = false;
            revealStore.set(false);
            render();
          },
        }),
      ),
    );
  }

  return el(
    "article",
    { class: "card orders" },
    el("p", { class: "eyebrow", text: "Sealed orders" }),
    el("h3", { text: "Your secret mission" }),
    el("div", { class: "rope" }),
    body,
    el(
      "p",
      { class: "partner-note" },
      svg(ANCHOR),
      el("span", {}, "Plus your open gift for ", el("strong", { text: partner.name }), ", your first mate. No secret there."),
    ),
  );
}

function logCard(event) {
  const sleeps = sleepsUntil(event);
  let countdown;
  if (sleeps === null) {
    countdown = el(
      "div",
      { class: "countdown" },
      el("span", { class: "label", text: "The date is still to be announced." }),
    );
  } else if (sleeps > 0) {
    countdown = el(
      "div",
      { class: "countdown" },
      el("span", { class: "num", text: String(sleeps) }),
      el("span", { class: "label", text: sleeps === 1 ? "sleep till we drop anchor" : "sleeps till we drop anchor" }),
    );
  } else if (sleeps === 0) {
    countdown = el(
      "div",
      { class: "countdown big-day" },
      el("span", { class: "num", text: "Land ho!" }),
      el("span", { class: "label", text: "It's today." }),
    );
  } else {
    countdown = el(
      "div",
      { class: "countdown big-day" },
      el("span", { class: "num", text: "Anchored" }),
      el("span", { class: "label", text: "That's a wrap. Merry Christmas!" }),
    );
  }

  const row = (label, value) =>
    el("div", {}, el("dt", { text: label }), el("dd", { class: value ? null : "tbd", text: value || "To be announced" }));

  return el(
    "article",
    { class: "card" },
    el("p", { class: "eyebrow", text: "Ship's log" }),
    el("h3", { text: "When we make port" }),
    el("div", { class: "rope" }),
    countdown,
    el(
      "dl",
      { class: "log" },
      row("When", formatEventDate(event)),
      row("Where", event.place),
      row("Budget", event.budget),
      event.notes ? row("Notes", event.notes) : null,
    ),
  );
}

function listCard(list) {
  const { owner, role, canClaim, items } = list;
  const tag = TAGS[role];
  const mine = role === "me";
  return el(
    "article",
    { class: `card${mine ? " mine" : ""}` },
    el(
      "div",
      { class: "list-head" },
      el("h3", { text: mine ? "Your wish list" : `${owner.name}'s list` }),
      tag ? el("span", { class: `tag ${tag[1]}`, text: tag[0] }) : null,
    ),
    el("div", { class: "rope" }),
    mine
      ? el("p", {
          class: "list-help",
          text: "Add links, sizes and anything else that helps. Your partner and your Santa can mark things they're getting. You'll never see which.",
        })
      : null,
    canClaim
      ? el("p", { class: "list-help", text: `Tap “I'll get this” so nobody doubles up. ${owner.name} won't see it.` })
      : null,
    items.length
      ? el(
          "ul",
          { class: "wishes" },
          items.map((item) => wishRow(list, item)),
        )
      : el("p", {
          class: "empty",
          text: mine ? "Your hold is empty. Add a few ideas so your Santa isn't lost at sea." : "Nothing in the hold yet.",
        }),
    mine ? wishForm() : null,
  );
}

function wishRow(list, item) {
  if (list.role === "me" && editing === item.id) {
    return el("li", { class: "wish editing" }, wishForm(item));
  }

  const site = item.url ? siteName(item.url) : "";
  const main = el(
    "div",
    { class: "wish-main" },
    isWebLink(item.url)
      ? el("a", { class: "wish-title", href: item.url, target: "_blank", rel: "noopener noreferrer", text: item.title })
      : el("span", { class: "wish-title", text: item.title }),
    site ? el("span", { class: "wish-site", text: site }) : null,
    item.notes ? el("p", { class: "wish-notes", text: item.notes }) : null,
  );

  const side = el("div", { class: "wish-side" }, item.price ? el("span", { class: "price", text: item.price }) : null);

  if (list.role === "me") {
    side.append(
      el(
        "div",
        { class: "wish-tools" },
        el("button", {
          class: "link-btn",
          type: "button",
          text: "Edit",
          "aria-label": `Edit ${item.title}`,
          onclick: () => {
            editing = item.id;
            editDraft = { title: item.title, url: item.url, price: item.price, notes: item.notes };
            render();
            document.querySelector(".wish.editing input")?.focus();
          },
        }),
        el("button", {
          class: "link-btn",
          type: "button",
          text: "Remove",
          "aria-label": `Remove ${item.title}`,
          onclick: () => removeWish(item),
        }),
      ),
    );
  } else if (list.canClaim) {
    if (item.claim === "mine") {
      side.append(
        el(
          "div",
          { class: "claim-mine" },
          el("span", { text: "✓ You're getting this" }),
          el("button", {
            class: "link-btn",
            type: "button",
            text: "Undo",
            onclick: () => setClaim(list.owner, item, false),
          }),
        ),
      );
    } else if (item.claim === "taken") {
      side.append(el("span", { class: "stamp", text: "Spoken for" }));
    } else {
      side.append(
        el("button", {
          class: "btn small green",
          type: "button",
          text: "I'll get this",
          onclick: (e) => {
            e.currentTarget.disabled = true;
            setClaim(list.owner, item, true);
          },
        }),
      );
    }
  }

  return el("li", { class: `wish${item.claim === "taken" ? " taken" : ""}` }, main, side);
}

function wishForm(item) {
  const isEdit = Boolean(item);
  const state = isEdit ? editDraft : draft;

  const field = (name, label, { required = false, max, placeholder, multiline = false, inputmode } = {}) => {
    const input = el(multiline ? "textarea" : "input", {
      name,
      type: multiline ? null : "text",
      maxlength: max,
      placeholder,
      required,
      inputmode,
      rows: multiline ? 2 : null,
      autocomplete: "off",
      autocapitalize: name === "url" ? "off" : null,
      spellcheck: name === "url" ? "false" : null,
    });
    input.value = state[name] ?? "";
    input.addEventListener("input", () => {
      state[name] = input.value;
    });
    return el(
      "label",
      {},
      el("span", {}, label, required ? null : el("span", { class: "opt", text: " (optional)" })),
      input,
    );
  };

  const form = el(
    "form",
    { class: "wish-form" },
    el("p", { class: "form-title", text: isEdit ? "Edit this wish" : "Add a wish" }),
    field("title", "What is it?", { required: true, max: 120, placeholder: "e.g. A fisherman's wool jumper" }),
    el(
      "div",
      { class: "field-row" },
      field("url", "Link", { max: 1000, placeholder: "Paste a link to the shop", inputmode: "url" }),
      field("price", "Price", { max: 40, placeholder: "e.g. 25" }),
    ),
    field("notes", "Notes", { multiline: true, max: 500, placeholder: "Size, style, anything that helps" }),
    el(
      "div",
      { class: "form-actions" },
      el("button", { class: "btn", type: "submit", text: isEdit ? "Save changes" : "Add to my list" }),
      isEdit
        ? el("button", {
            class: "link-btn",
            type: "button",
            text: "Cancel",
            onclick: () => {
              editing = null;
              editDraft = null;
              render();
            },
          })
        : null,
    ),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitWish(form, item);
  });
  return form;
}

// ---------- Actions ----------

async function submitWish(form, item) {
  const state = item ? editDraft : draft;
  if (!state.title.trim()) {
    toast("Give your wish a name first.", { error: true });
    form.querySelector("input[name=title]").focus();
    return;
  }
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    view = await call(
      "/api/wishlist",
      item ? { op: "update", itemId: item.id, item: state } : { op: "add", item: state },
    );
    if (item) {
      editing = null;
      editDraft = null;
      render();
      toast("Wish updated.");
    } else {
      draft = emptyDraft();
      render();
      document.querySelector(".card.mine .wish-form input[name=title]")?.focus();
      toast("Added to your list.");
    }
  } catch (err) {
    button.disabled = false;
    handleError(err);
  }
}

async function removeWish(item) {
  if (!confirm(`Remove “${item.title}” from your list?`)) return;
  try {
    view = await call("/api/wishlist", { op: "delete", itemId: item.id });
    render();
    toast("Removed from your list.");
  } catch (err) {
    handleError(err);
  }
}

async function setClaim(owner, item, claim) {
  try {
    view = await call("/api/claim", { ownerId: owner.id, itemId: item.id, claim });
    render();
    toast(claim ? "Noted. That one's yours to get." : "Released. Someone else can claim it now.");
  } catch (err) {
    handleError(err);
    await load({ quiet: true });
  }
}

// ---------- Other screens ----------

function renderLanding(message) {
  view = null;
  app.replaceChildren(
    el(
      "article",
      { class: "card notice" },
      el("p", { class: "eyebrow", text: "Permission to come aboard?" }),
      el("h3", { text: "This voyage is by invitation" }),
      el("div", { class: "rope" }),
      el("p", { text: message ?? "Open the private link the organizer sent you, and your page will appear here." }),
    ),
  );
}

function renderProblem(message) {
  app.replaceChildren(
    el(
      "article",
      { class: "card notice" },
      el("p", { class: "eyebrow", text: "Rough seas" }),
      el("h3", { text: "Something's amiss" }),
      el("div", { class: "rope" }),
      el("p", { text: message }),
      el("p", {}, el("button", { class: "btn", type: "button", text: "Try again", onclick: () => load() })),
    ),
  );
}

// Pick up new wishes and claims when someone comes back to the tab.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && view && !editing) load({ quiet: true });
});

window.addEventListener("hashchange", () => {
  token = readToken();
  revealed = false;
  revealStore.set(false);
  load();
});

letItSnow();
load();
