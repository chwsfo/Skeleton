// Everything the app does, independent of Netlify. `store` is a small
// key-value interface (see blobs-store.mjs and memory-store.mjs).
//
// Stored keys:
//   event              { date, time, place, budget, notes }
//   draw               { id, drawnAt, assignments: { giverId: recipientId } }
//   seen/<id>          { at, drawId }  written the first time someone sees their person
//   wishlist/<id>      [ { id, title, url, notes, price, added } ]
//   claims/<ownerId>   { itemId: { by, at } }  never shown to the owner
//   reveal             { at }  present once the organizer starts the reveal party

import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { CREW, byId } from "./crew.mjs";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const LIMITS = { title: 120, url: 1000, notes: 500, price: 40, place: 200, budget: 80, eventNotes: 800 };
const MAX_ITEMS = 40;
const MIN_SECRET_LENGTH = 16;

// ---------- Private links ----------
// Each person's link token is derived from the organizer key, so nothing
// needs storing and nobody can guess another person's link.

export function tokenFor(secret, id) {
  return createHmac("sha256", secret).update(`crew:${id}`).digest("base64url").slice(0, 24);
}

function sameString(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function crewForToken(secret, token) {
  if (!token) return null;
  return CREW.find((p) => sameString(tokenFor(secret, p.id), token)) ?? null;
}

// ---------- The draw ----------

export function isValidDraw(assignments) {
  if (!assignments || Object.keys(assignments).length !== CREW.length) return false;
  if (new Set(Object.values(assignments)).size !== CREW.length) return false;
  return CREW.every((p) => {
    const to = assignments[p.id];
    return Boolean(byId[to]) && to !== p.id && to !== p.partner && assignments[to] !== p.id;
  });
}

// Shuffle until the rules hold. Rejection sampling keeps every valid draw
// equally likely.
export function drawLots(rand = randomInt) {
  const ids = CREW.map((p) => p.id);
  for (let attempt = 0; attempt < 10000; attempt++) {
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const assignments = Object.fromEntries(ids.map((id, i) => [id, shuffled[i]]));
    if (isValidDraw(assignments)) return assignments;
  }
  throw new Error("Couldn't find a valid draw");
}

// ---------- Storage helpers ----------

// Read-modify-write with a conditional write, retrying if someone else wrote
// in between. `change` returns the new value, or undefined for "no change".
async function update(store, key, change, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    const current = await store.getWithEtag(key);
    const next = change(current ? current.value : null);
    if (next === undefined) return current ? current.value : null;
    const options = current ? { onlyIfMatch: current.etag } : { onlyIfNew: true };
    const { modified } = await store.set(key, next, options);
    if (modified) return next;
  }
  throw new HttpError(503, "Lots of people are editing at once. Try again in a moment.");
}

async function seenIds(store) {
  const keys = await store.list("seen/");
  return keys.map((k) => k.slice("seen/".length)).filter((id) => byId[id]);
}

// ---------- Input cleaning ----------

function line(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function paragraph(value, max) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function cleanUrl(value) {
  let raw = String(value ?? "").trim();
  if (!raw) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "That link doesn't look like a web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new HttpError(400, "Links need to start with https://");
  }
  if (!url.hostname.includes(".")) throw new HttpError(400, "That link doesn't look like a web address.");
  if (url.href.length > LIMITS.url) throw new HttpError(400, "That link is too long.");
  return url.href;
}

function cleanItem(input) {
  const item = {
    title: line(input?.title, LIMITS.title),
    url: cleanUrl(input?.url),
    notes: paragraph(input?.notes, LIMITS.notes),
    price: line(input?.price, LIMITS.price),
  };
  if (!item.title) throw new HttpError(400, "Give your wish a name.");
  return item;
}

const emptyEvent = () => ({ date: "", time: "", place: "", budget: "", notes: "" });

function cleanEvent(input) {
  const date = line(input?.date, 10);
  const time = line(input?.time, 5);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Dates look like 2026-12-25.");
  if (time && !/^\d{2}:\d{2}$/.test(time)) throw new HttpError(400, "Times look like 18:30.");
  return {
    date,
    time,
    place: line(input?.place, LIMITS.place),
    budget: line(input?.budget, LIMITS.budget),
    notes: paragraph(input?.notes, LIMITS.eventNotes),
  };
}

// ---------- A crew member's page ----------

const person = (p) => ({ id: p.id, name: p.name });

function claimState(claim, myId) {
  if (!claim) return null;
  return claim.by === myId ? "mine" : "taken";
}

// The people whose lists `me` may claim from: their partner, and their
// secret person once the lots are drawn.
function claimableOwners(me, draw) {
  return [me.partner, draw?.assignments?.[me.id]].filter(Boolean);
}

async function crewView(store, me) {
  const [event, draw, reveal, ...lists] = await Promise.all([
    store.get("event"),
    store.get("draw"),
    store.get("reveal"),
    ...CREW.map((p) => store.get(`wishlist/${p.id}`)),
  ]);
  const recipientId = draw?.assignments?.[me.id] ?? null;
  const claimMaps = Object.fromEntries(
    await Promise.all(
      claimableOwners(me, draw).map(async (id) => [id, (await store.get(`claims/${id}`)) ?? {}]),
    ),
  );

  // Seeing your person for the first time locks the draw.
  if (recipientId) await store.set(`seen/${me.id}`, { at: Date.now(), drawId: draw.id }, { onlyIfNew: true });

  return {
    me: person(me),
    partner: person(byId[me.partner]),
    recipient: recipientId ? person(byId[recipientId]) : null,
    drawn: Boolean(draw),
    revealed: Boolean(reveal && draw),
    event: event ?? emptyEvent(),
    lists: CREW.map((p, i) => {
      const claims = claimMaps[p.id];
      return {
        owner: person(p),
        role:
          p.id === me.id ? "me" : p.id === recipientId ? "recipient" : p.id === me.partner ? "partner" : "crew",
        canClaim: Boolean(claims),
        items: (lists[i] ?? []).map(({ id, title, url, notes, price }) => ({
          id,
          title,
          url,
          notes,
          price,
          claim: claims ? claimState(claims[id], me.id) : null,
        })),
      };
    }),
  };
}

async function editWishlist(store, me, body) {
  const key = `wishlist/${me.id}`;
  const itemId = line(body?.itemId, 80);

  if (body?.op === "add") {
    const item = { id: randomUUID(), ...cleanItem(body.item), added: Date.now() };
    await update(store, key, (items) => {
      const list = items ?? [];
      if (list.length >= MAX_ITEMS) throw new HttpError(400, `That's a full hold: ${MAX_ITEMS} wishes is the limit.`);
      return [...list, item];
    });
    return;
  }

  if (body?.op === "update") {
    const fields = cleanItem(body.item);
    await update(store, key, (items) => {
      const list = items ?? [];
      const index = list.findIndex((x) => x.id === itemId);
      if (index < 0) throw new HttpError(404, "That wish isn't on your list any more.");
      return list.map((x, i) => (i === index ? { ...x, ...fields } : x));
    });
    return;
  }

  if (body?.op === "delete") {
    await update(store, key, (items) => {
      const list = items ?? [];
      return list.some((x) => x.id === itemId) ? list.filter((x) => x.id !== itemId) : undefined;
    });
    await update(store, `claims/${me.id}`, (claims) => {
      if (!claims?.[itemId]) return undefined;
      const { [itemId]: _removed, ...rest } = claims;
      return rest;
    });
    return;
  }

  throw new HttpError(400, "Unknown wishlist change.");
}

async function setClaim(store, me, body) {
  const ownerId = line(body?.ownerId, 40);
  const itemId = line(body?.itemId, 80);
  if (!byId[ownerId]) throw new HttpError(404, "No such sailor.");

  const draw = await store.get("draw");
  if (!claimableOwners(me, draw).includes(ownerId)) {
    throw new HttpError(403, "You can only claim gifts for your partner and your secret person.");
  }
  const items = (await store.get(`wishlist/${ownerId}`)) ?? [];
  if (!items.some((x) => x.id === itemId)) throw new HttpError(404, "That wish isn't on the list any more.");

  await update(store, `claims/${ownerId}`, (claims) => {
    const current = claims ?? {};
    const existing = current[itemId];
    if (body.claim) {
      if (existing?.by === me.id) return undefined;
      if (existing) throw new HttpError(409, "Someone else is already getting that one.");
      return { ...current, [itemId]: { by: me.id, at: Date.now() } };
    }
    if (!existing || existing.by !== me.id) return undefined;
    const { [itemId]: _removed, ...rest } = current;
    return rest;
  });
}

// ---------- The organizer ----------
// The organizer page never sees the draw itself, only whether it happened
// and who has looked.

async function organizerView(store, secret) {
  const [event, draw, reveal, seen] = await Promise.all([
    store.get("event"),
    store.get("draw"),
    store.get("reveal"),
    seenIds(store),
  ]);
  return {
    event: event ?? emptyEvent(),
    draw: {
      done: Boolean(draw),
      drawnAt: draw?.drawnAt ?? null,
      locked: seen.length > 0 || Boolean(reveal),
      revealed: Boolean(reveal && draw),
      revealedAt: reveal?.at ?? null,
    },
    crew: CREW.map((p) => ({
      id: p.id,
      name: p.name,
      partner: byId[p.partner].name,
      token: tokenFor(secret, p.id),
      seen: seen.includes(p.id),
    })),
  };
}

async function organizerAction(store, body) {
  if (body?.op === "event") {
    await store.set("event", cleanEvent(body.event));
    return;
  }
  if (body?.op === "draw") {
    if (await store.get("reveal")) {
      throw new HttpError(409, "The reveal party has started, so the draw is locked.");
    }
    if ((await seenIds(store)).length > 0) {
      throw new HttpError(409, "Someone has already seen their person, so the draw is locked.");
    }
    await store.set("draw", { id: randomUUID(), drawnAt: Date.now(), assignments: drawLots() });
    return;
  }
  if (body?.op === "reveal") {
    if (body.on) {
      if (!(await store.get("draw"))) throw new HttpError(400, "Draw the lots first.");
      await store.set("reveal", { at: Date.now() });
    } else {
      await store.delete("reveal");
    }
    return;
  }
  throw new HttpError(400, "Unknown organizer action.");
}

// ---------- The reveal party ----------
// Only once the organizer starts it does anyone, organizer included, see
// who had whom.

// Follow each chain of gifts round until it loops back. With these rules
// that's either one loop of six or two loops of three.
export function giftLoops(assignments) {
  const visited = new Set();
  const loops = [];
  for (const p of CREW) {
    if (visited.has(p.id)) continue;
    const loop = [];
    for (let id = p.id; !visited.has(id); id = assignments[id]) {
      visited.add(id);
      loop.push(id);
    }
    loops.push(loop);
  }
  return loops;
}

async function revealView(store) {
  const [reveal, draw] = await Promise.all([store.get("reveal"), store.get("draw")]);
  if (!reveal || !draw) throw new HttpError(403, "Not yet! The reveal party hasn't started.");
  return {
    revealedAt: reveal.at,
    people: CREW.map(person),
    gifts: CREW.map((p) => ({ from: p.id, to: draw.assignments[p.id] })),
    loops: giftLoops(draw.assignments),
  };
}

// ---------- Routing ----------

function requireCrew(secret, token) {
  const me = crewForToken(secret, token);
  if (!me) throw new HttpError(401, "That link doesn't match anyone aboard.");
  return me;
}

function requireOrganizer(secret, key) {
  if (!key || !sameString(key, secret)) throw new HttpError(401, "That's not the organizer key.");
}

export async function handleApi({ store, secret, method, path, token, organizerKey, body }) {
  try {
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new HttpError(
        503,
        `The organizer key isn't set up on Netlify yet (it needs to be at least ${MIN_SECRET_LENGTH} characters).`,
      );
    }
    const route = `${method} ${path.replace(/\/+$/, "")}`;
    switch (route) {
      case "GET /api/me":
        return ok(await crewView(store, requireCrew(secret, token)));
      case "POST /api/wishlist": {
        const me = requireCrew(secret, token);
        await editWishlist(store, me, body);
        return ok(await crewView(store, me));
      }
      case "POST /api/claim": {
        const me = requireCrew(secret, token);
        await setClaim(store, me, body);
        return ok(await crewView(store, me));
      }
      case "GET /api/reveal":
        // Anyone aboard, or the organizer.
        if (!crewForToken(secret, token)) requireOrganizer(secret, organizerKey);
        return ok(await revealView(store));
      case "GET /api/organizer":
        requireOrganizer(secret, organizerKey);
        return ok(await organizerView(store, secret));
      case "POST /api/organizer":
        requireOrganizer(secret, organizerKey);
        await organizerAction(store, body);
        return ok(await organizerView(store, secret));
      default:
        throw new HttpError(404, "Not found.");
    }
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
    console.error(err);
    return { status: 500, body: { error: "Something went wrong below deck. Try again." } };
  }
}

const ok = (body) => ({ status: 200, body });
