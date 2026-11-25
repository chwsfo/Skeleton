# The Jolly Kringle

A nautical Secret Santa for Sian & Charles, Bea & Wade, and Serena & Will.
Santa sails a red-sailed ship towed by a whale, two walruses in Santa hats
and two seals in scarves.

Live at **https://secretchrimbo.netlify.app**

## How the exchange works

- Partners give each other an open gift.
- Everyone also draws one secret person from another couple. Nobody draws
  their partner, and there are no direct swaps.
- You only ever learn who you're buying for, until the reveal party.

## What's in it

- **Each person's private page**, opened from a link the organizer sends:
  - a message in a bottle to uncork, revealing who you're buying for;
  - a ship's log with the date, place, budget and a countdown;
  - everyone's wish lists, with links, prices and notes;
  - a way for the two people buying for you (your partner and your Santa) to
    mark a wish "I'll get this", which you never see.
- **The organizer page** (`/organizer`) sets the details, draws the lots and
  hands out the links. It never shows the draw.
- **The reveal party** (`/reveal`), started by the organizer after the
  exchange: guess each Santa, uncork their bottle, then see the whole chart.
  `/reveal?practice` tries it with a made-up crew.
- **A message-in-a-bottle preview card** when a link is shared in a chat app.

## Setting it up and running the voyage

See [SETUP.md](SETUP.md) for putting it on Netlify, the organizer key, running
the draw and the reveal party, and working on it locally.

Quick start for development:

```sh
npm install
npm test        # the rules: draw, claims, privacy, the reveal
npm run dev     # http://localhost:8888, prints all six links
```

## How it's built

- **`public/`:** plain HTML, CSS and JavaScript, with no build step.
  - Three pages: the crew page, the organizer page and the reveal page.
  - Hand-drawn SVG art in `public/art/`.
- **`netlify/functions/api.mjs`:** one Netlify Function serving `/api/*`.
- **`lib/core.mjs`:** all the rules, independent of Netlify and covered by
  `test/`.
- **`lib/crew.mjs`:** the six names and three couples.
- **Storage:** Netlify Blobs.
- **Private links:** derived from the `ORGANIZER_KEY` environment variable, so
  nothing secret is stored.

This repository began as a copy of [Skeleton](http://getskeleton.com), Dave
Gamache's CSS boilerplate. None of Skeleton's files are used any more, and its
history is still in the git log.
