# The Jolly Kringle

A nautical Secret Santa for Sian & Charles, Bea & Wade, and Serena & Will.

- Partners give each other an open gift.
- Everyone also draws one secret person from another couple.
- Nobody draws their partner, and there are no direct swaps (if you have Bea, Bea doesn't have you).
- Everyone can see every wish list.
- The two people buying for you (your partner and your Santa) can mark wishes "I'll get this" so they don't double up. You never see those marks.
- The organizer page sets the date, place and budget, runs the draw and hands out links. It never shows the draw.

## Putting it on Netlify (one time, about 10 minutes)

1. **Connect the repository.** In Netlify, choose **Add new project → Import an existing project → GitHub**, then pick `chwsfo/Skeleton` and the `master` branch.
2. **Leave the build settings alone.** `netlify.toml` already sets them: no build command, publish folder `public`, functions folder `netlify/functions`. Click **Deploy**.
3. **Set the organizer key.** Go to **Project configuration → Environment variables → Add a variable**:
   - Key: `ORGANIZER_KEY`
   - Value: a long random passphrase of at least 16 characters. A password manager's generator is ideal. Keep it to yourself.
4. **Redeploy** so the functions pick up the key: **Deploys → Trigger deploy → Deploy project**.
5. Open `https://<your-site>.netlify.app/organizer` and enter the key.

Storage uses Netlify Blobs, which is built in. There's nothing to set up.

## Running the voyage

1. On the organizer page, fill in the **ship's log**: date, time, place, budget and notes.
2. Copy each person's link and text it to them. People can add wishes straight away, even before the draw.
3. Press **Draw the lots**. You can redraw as many times as you like until someone opens their page. The first time anyone sees their person, the draw locks for good.
4. The organizer page shows who has opened their orders, so you know whom to nudge.
5. **At the party**, press **Start the reveal party** on the organizer page. Everyone's page gets a banner linking to the reveal page (`/reveal`), and anyone already waiting on it sees it open by itself. Put it on a big screen and take turns: each bottle asks "Who was X's Secret Santa?", everyone guesses, then someone taps to uncork it. The finale is a ship's-wheel chart of who had whom. Until you start it, nobody can see the reveal, you included, and once it's started the draw can't be redone. **Hide it again** puts the bottles back.

**Honor system:** the organizer page lists all six links. Opening someone else's link shows their person, and doing it after the draw also locks the draw. So only open your own.

## Good to know

- **Links come from the organizer key.** Changing `ORGANIZER_KEY` gives everyone new links. The old ones stop working, but the draw, wishes and claims are kept.
- **Lost link?** Copy it again from the organizer page.
- **Link previews:** when a link is shared in Messages, WhatsApp and similar apps, they show the message-in-a-bottle card (`public/art/invite-card.jpg`). The preview tags in `public/index.html` point at `https://secretchrimbo.netlify.app`, so update them if the site is renamed. To change the card, edit `dev/invite-card.html` and run `node dev/render-invite-card.cjs`.
- **Changing the crew:** edit the names in `lib/crew.mjs`, then redraw (only possible before anyone has looked).
- **Starting over next year:** in Netlify, go to **Blobs**, open the `jolly-kringle` store and delete its entries.

## Working on it locally

```sh
npm install
npm test        # draw rules, privacy of claims, the draw lock
npm run dev     # http://localhost:8888, prints all six links and the organizer key
```

The dev server uses a local copy of Netlify Blobs, stored in `.dev-data/`. Delete that folder to start fresh.

## How it's built

- `public/`: the two pages (`index.html` for crew, `organizer.html`), styles, and the hand-drawn hero art in `public/art/hero.svg`.
- `netlify/functions/api.mjs`: one serverless function that handles everything under `/api/*`.
- `lib/core.mjs`: all the rules (draw, wish lists, claims, permissions), independent of Netlify, so it can be tested.
- `lib/crew.mjs`: the six names and three couples.
