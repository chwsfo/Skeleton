import assert from "node:assert/strict";
import { test } from "node:test";
import { crewForToken, drawLots, handleApi, isValidDraw, tokenFor } from "../lib/core.mjs";
import { CREW, byId } from "../lib/crew.mjs";
import { memoryStore } from "../lib/memory-store.mjs";

const SECRET = "test-organizer-key-1234567890";

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest]));
}

function setup() {
  const store = memoryStore();
  const call = (method, path, { as, organizer, body } = {}) =>
    handleApi({
      store,
      secret: SECRET,
      method,
      path,
      token: as ? tokenFor(SECRET, as) : null,
      organizerKey: organizer ? SECRET : null,
      body,
    });
  return { store, call };
}

const listOf = (view, ownerId) => view.lists.find((l) => l.owner.id === ownerId);

test("every draw follows the rules: no self, no partner, no direct swaps", () => {
  for (let i = 0; i < 2000; i++) {
    const a = drawLots();
    assert.ok(isValidDraw(a));
    for (const p of CREW) {
      assert.notEqual(a[p.id], p.id);
      assert.notEqual(a[p.id], p.partner);
      assert.notEqual(a[a[p.id]], p.id);
      assert.notEqual(byId[a[p.id]].couple, p.couple);
    }
  }
});

test("there are enough valid draws that the result isn't predictable, and all of them come up", () => {
  const ids = CREW.map((p) => p.id);
  const valid = permutations(ids)
    .map((perm) => Object.fromEntries(ids.map((id, i) => [id, perm[i]])))
    .filter(isValidDraw)
    .map((a) => JSON.stringify(a));
  assert.ok(valid.length >= 20, `only ${valid.length} valid draws`);
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(JSON.stringify(drawLots()));
  assert.equal(seen.size, valid.length);
});

test("links are unique per person and only the right link opens a page", () => {
  const tokens = CREW.map((p) => tokenFor(SECRET, p.id));
  assert.equal(new Set(tokens).size, CREW.length);
  for (const p of CREW) assert.equal(crewForToken(SECRET, tokenFor(SECRET, p.id)).id, p.id);
  assert.equal(crewForToken(SECRET, "nope"), null);
  assert.equal(crewForToken("another-organizer-key-123", tokens[0]), null);
});

test("refuses to run without a long enough organizer key", async () => {
  const res = await handleApi({ store: memoryStore(), secret: "short", method: "GET", path: "/api/me" });
  assert.equal(res.status, 503);
});

test("bad links and bad organizer keys are rejected", async () => {
  const { store } = setup();
  const res = await handleApi({ store, secret: SECRET, method: "GET", path: "/api/me", token: "wrong" });
  assert.equal(res.status, 401);
  const org = await handleApi({ store, secret: SECRET, method: "GET", path: "/api/organizer", organizerKey: "wrong" });
  assert.equal(org.status, 401);
});

test("wishlist links are cleaned and unsafe ones refused", async () => {
  const { call } = setup();
  let res = await call("POST", "/api/wishlist", {
    as: "bea",
    body: { op: "add", item: { title: "  Wool   socks ", url: "example.com/socks", price: "£15" } },
  });
  assert.equal(res.status, 200);
  const item = listOf(res.body, "bea").items[0];
  assert.equal(item.title, "Wool socks");
  assert.equal(item.url, "https://example.com/socks");

  res = await call("POST", "/api/wishlist", { as: "bea", body: { op: "add", item: { title: "x", url: "javascript:alert(1)" } } });
  assert.equal(res.status, 400);
  res = await call("POST", "/api/wishlist", { as: "bea", body: { op: "add", item: { title: "   " } } });
  assert.equal(res.status, 400);
});

test("the full voyage: claims, secrecy and the draw lock", async () => {
  const { call } = setup();

  await call("POST", "/api/organizer", {
    organizer: true,
    body: { op: "event", event: { date: "2026-12-20", time: "18:00", place: "The Anchor", budget: "£40" } },
  });

  // Everyone adds a wish before the draw.
  for (const p of CREW) {
    const res = await call("POST", "/api/wishlist", { as: p.id, body: { op: "add", item: { title: `${p.name}'s wish` } } });
    assert.equal(res.status, 200);
  }

  // Before the draw: nobody has a person, partners can claim, nobody else can.
  let sian = (await call("GET", "/api/me", { as: "sian" })).body;
  assert.equal(sian.recipient, null);
  assert.equal(sian.drawn, false);
  assert.equal(sian.event.place, "The Anchor");
  assert.equal(sian.lists.length, 6);
  assert.deepEqual(
    sian.lists.filter((l) => l.canClaim).map((l) => l.owner.id),
    ["charles"],
  );
  const beaItem = listOf(sian, "bea").items[0].id;
  let res = await call("POST", "/api/claim", { as: "sian", body: { ownerId: "bea", itemId: beaItem, claim: true } });
  assert.equal(res.status, 403);

  const charlesItem = listOf(sian, "charles").items[0].id;
  res = await call("POST", "/api/claim", { as: "sian", body: { ownerId: "charles", itemId: charlesItem, claim: true } });
  assert.equal(res.status, 200);
  assert.equal(listOf(res.body, "charles").items[0].claim, "mine");

  // Charles never sees claims on his own list.
  const charles = (await call("GET", "/api/me", { as: "charles" })).body;
  assert.equal(listOf(charles, "charles").canClaim, false);
  assert.equal(listOf(charles, "charles").items[0].claim, null);

  // Draw the lots.
  res = await call("POST", "/api/organizer", { organizer: true, body: { op: "draw" } });
  assert.equal(res.status, 200);
  assert.equal(res.body.draw.done, true);
  assert.equal(res.body.draw.locked, false);
  assert.ok(!JSON.stringify(res.body).includes("assignments"), "organizer view must not include the draw");

  // Redraw is allowed while nobody has looked.
  res = await call("POST", "/api/organizer", { organizer: true, body: { op: "draw" } });
  assert.equal(res.status, 200);

  // Charles's Santa looks, which locks the draw.
  const views = {};
  for (const p of CREW) views[p.id] = (await call("GET", "/api/me", { as: p.id })).body;
  const santaOfCharles = CREW.find((p) => views[p.id].recipient?.id === "charles");
  assert.ok(santaOfCharles);
  assert.notEqual(santaOfCharles.couple, byId.charles.couple);

  res = await call("POST", "/api/organizer", { organizer: true, body: { op: "draw" } });
  assert.equal(res.status, 409);
  const org = (await call("GET", "/api/organizer", { organizer: true })).body;
  assert.equal(org.draw.locked, true);
  assert.ok(org.crew.every((c) => c.seen));

  // Each person's view only names their own person.
  for (const p of CREW) {
    const body = JSON.stringify(views[p.id]);
    assert.ok(!body.includes("assignments"));
    assert.equal(views[p.id].lists.filter((l) => l.role === "recipient").length, 1);
  }

  // The Santa sees Sian's claim as "taken" and can't take it over.
  const santaView = views[santaOfCharles.id];
  assert.equal(listOf(santaView, "charles").canClaim, true);
  assert.equal(listOf(santaView, "charles").items[0].claim, "taken");
  res = await call("POST", "/api/claim", {
    as: santaOfCharles.id,
    body: { ownerId: "charles", itemId: charlesItem, claim: true },
  });
  assert.equal(res.status, 409);

  // Someone who isn't buying for Charles sees no claim info at all.
  const bystander = CREW.find((p) => p.id !== "charles" && p.id !== "sian" && p.id !== santaOfCharles.id);
  assert.equal(listOf(views[bystander.id], "charles").canClaim, false);
  assert.equal(listOf(views[bystander.id], "charles").items[0].claim, null);

  // Only the claimer can release a claim.
  res = await call("POST", "/api/claim", {
    as: santaOfCharles.id,
    body: { ownerId: "charles", itemId: charlesItem, claim: false },
  });
  assert.equal(res.status, 200);
  assert.equal(listOf((await call("GET", "/api/me", { as: "sian" })).body, "charles").items[0].claim, "mine");

  res = await call("POST", "/api/claim", { as: "sian", body: { ownerId: "charles", itemId: charlesItem, claim: false } });
  assert.equal(listOf(res.body, "charles").items[0].claim, null);
});

test("deleting a wish clears its claim", async () => {
  const { call, store } = setup();
  const added = await call("POST", "/api/wishlist", { as: "wade", body: { op: "add", item: { title: "Compass" } } });
  const itemId = listOf(added.body, "wade").items[0].id;
  await call("POST", "/api/claim", { as: "bea", body: { ownerId: "wade", itemId, claim: true } });
  assert.ok((await store.get("claims/wade"))[itemId]);

  const res = await call("POST", "/api/wishlist", { as: "wade", body: { op: "delete", itemId } });
  assert.equal(listOf(res.body, "wade").items.length, 0);
  assert.equal((await store.get("claims/wade"))[itemId], undefined);
});

test("editing a wish keeps its place and its claim", async () => {
  const { call } = setup();
  await call("POST", "/api/wishlist", { as: "will", body: { op: "add", item: { title: "Hat" } } });
  const added = await call("POST", "/api/wishlist", { as: "will", body: { op: "add", item: { title: "Scarf" } } });
  const [hat] = listOf(added.body, "will").items;
  await call("POST", "/api/claim", { as: "serena", body: { ownerId: "will", itemId: hat.id, claim: true } });
  const res = await call("POST", "/api/wishlist", {
    as: "will",
    body: { op: "update", itemId: hat.id, item: { title: "Red hat", notes: "Size M" } },
  });
  assert.deepEqual(listOf(res.body, "will").items.map((i) => i.title), ["Red hat", "Scarf"]);
  const serena = (await call("GET", "/api/me", { as: "serena" })).body;
  assert.equal(listOf(serena, "will").items[0].claim, "mine");
});

test("two people claiming the same wish at once: exactly one wins", async () => {
  const { call } = setup();
  await call("POST", "/api/organizer", { organizer: true, body: { op: "draw" } });
  // Find Bea's Santa without looking first (looking is fine in a test).
  const views = Object.fromEntries(
    await Promise.all(CREW.map(async (p) => [p.id, (await call("GET", "/api/me", { as: p.id })).body])),
  );
  const santa = CREW.find((p) => views[p.id].recipient?.id === "bea");
  const added = await call("POST", "/api/wishlist", { as: "bea", body: { op: "add", item: { title: "Telescope" } } });
  const itemId = listOf(added.body, "bea").items[0].id;

  const results = await Promise.all([
    call("POST", "/api/claim", { as: "wade", body: { ownerId: "bea", itemId, claim: true } }),
    call("POST", "/api/claim", { as: santa.id, body: { ownerId: "bea", itemId, claim: true } }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});

test("event details are validated", async () => {
  const { call } = setup();
  const res = await call("POST", "/api/organizer", { organizer: true, body: { op: "event", event: { date: "next tuesday" } } });
  assert.equal(res.status, 400);
});

test("the reveal party: hidden until the organizer starts it, then open to everyone aboard", async () => {
  const { call } = setup();

  // Can't reveal before the draw.
  let res = await call("POST", "/api/organizer", { organizer: true, body: { op: "reveal", on: true } });
  assert.equal(res.status, 400);

  await call("POST", "/api/organizer", { organizer: true, body: { op: "draw" } });

  // Before the reveal, nobody can see it: not crew, not the organizer.
  res = await call("GET", "/api/reveal", { as: "bea" });
  assert.equal(res.status, 403);
  res = await call("GET", "/api/reveal", { organizer: true });
  assert.equal(res.status, 403);
  assert.equal((await call("GET", "/api/me", { as: "bea" })).body.revealed, false);

  // Strangers can't see it even after.
  res = await call("POST", "/api/organizer", { organizer: true, body: { op: "reveal", on: true } });
  assert.equal(res.status, 200);
  assert.equal(res.body.draw.revealed, true);
  assert.equal(res.body.draw.locked, true);
  res = await call("GET", "/api/reveal");
  assert.equal(res.status, 401);

  // Everyone aboard sees the same, complete chart.
  const views = await Promise.all(CREW.map((p) => call("GET", "/api/reveal", { as: p.id })));
  for (const v of views) assert.equal(v.status, 200);
  const chart = views[0].body;
  assert.equal(chart.gifts.length, 6);
  const assignments = Object.fromEntries(chart.gifts.map((g) => [g.from, g.to]));
  assert.ok(isValidDraw(assignments));
  for (const p of CREW) {
    const me = (await call("GET", "/api/me", { as: p.id })).body;
    assert.equal(me.revealed, true);
    assert.equal(me.recipient.id, assignments[p.id]);
  }

  // The loops cover everyone once, and each person gives to the next in their loop.
  const loops = chart.loops;
  assert.deepEqual(loops.flat().sort(), CREW.map((p) => p.id).sort());
  assert.ok(loops.every((l) => l.length === 6 || l.length === 3));
  for (const loop of loops) loop.forEach((id, i) => assert.equal(assignments[id], loop[(i + 1) % loop.length]));

  // The organizer page reveals now too, and the draw can't be redone.
  assert.equal((await call("GET", "/api/reveal", { organizer: true })).status, 200);
  res = await call("POST", "/api/organizer", { organizer: true, body: { op: "draw" } });
  assert.equal(res.status, 409);

  // Hiding it again works.
  await call("POST", "/api/organizer", { organizer: true, body: { op: "reveal", on: false } });
  assert.equal((await call("GET", "/api/reveal", { as: "bea" })).status, 403);
  assert.equal((await call("GET", "/api/me", { as: "bea" })).body.revealed, false);
});
