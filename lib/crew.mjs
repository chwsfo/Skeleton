// The six sailors, as three couples. Partners give each other an open gift,
// and everyone draws one secret person from another couple.
const COUPLES = [
  ["Sian", "Charles"],
  ["Bea", "Wade"],
  ["Serena", "Will"],
];

export const CREW = COUPLES.flatMap(([a, b], couple) => [
  { id: a.toLowerCase(), name: a, partner: b.toLowerCase(), couple },
  { id: b.toLowerCase(), name: b, partner: a.toLowerCase(), couple },
]);

export const byId = Object.fromEntries(CREW.map((p) => [p.id, p]));
