// Local stand-in for Netlify: serves public/ and runs the API against a
// local Netlify Blobs server. Data lives in .dev-data/.
//
//   npm run dev                      -> http://localhost:8888
//   ORGANIZER_KEY=... npm run dev    -> use your own key

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { getStore } from "@netlify/blobs";
import { BlobsServer } from "@netlify/blobs/server";
import { blobsStore } from "../lib/blobs-store.mjs";
import { handleApi, tokenFor } from "../lib/core.mjs";
import { CREW } from "../lib/crew.mjs";

const PORT = Number(process.env.PORT ?? 8888);
const SECRET = process.env.ORGANIZER_KEY ?? "local-dev-organizer-key";
const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const DATA = fileURLToPath(new URL("../.dev-data/", import.meta.url));

const blobsPort = PORT + 1;
const blobs = new BlobsServer({ directory: DATA, port: blobsPort, token: "local" });
await blobs.start();
const edge = `http://localhost:${blobsPort}`;
const store = blobsStore(
  getStore({ name: "jolly-kringle", siteID: "local", token: "local", edgeURL: edge, uncachedEdgeURL: edge, consistency: "strong" }),
);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};
const ROUTES = { "/": "index.html", "/organizer": "organizer.html", "/reveal": "reveal.html" };

// Send the same headers Netlify will, read from netlify.toml.
const toml = await readFile(fileURLToPath(new URL("../netlify.toml", import.meta.url)), "utf8");
const HEADERS = Object.fromEntries(
  [...toml.matchAll(/^\s*([A-Z][\w-]+) = "([^"]+)"/gm)].map(([, name, value]) => [name, value]),
);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    let body = null;
    if (req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      try {
        body = JSON.parse(Buffer.concat(chunks).toString() || "null");
      } catch {
        body = null;
      }
    }
    const result = await handleApi({
      store,
      secret: SECRET,
      method: req.method,
      path: url.pathname,
      token: req.headers["x-crew-token"],
      organizerKey: req.headers["x-organizer-key"],
      body,
    });
    res.writeHead(result.status, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(result.body));
    return;
  }

  const file = normalize(join(PUBLIC, ROUTES[url.pathname] ?? url.pathname));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const content = await readFile(file);
    res.writeHead(200, { ...HEADERS, "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}).listen(PORT, () => {
  const base = `http://localhost:${PORT}`;
  console.log(`Jolly Kringle running at ${base}`);
  console.log(`Organizer page: ${base}/organizer  (key: ${SECRET})`);
  for (const p of CREW) console.log(`  ${p.name.padEnd(8)} ${base}/#${tokenFor(SECRET, p.id)}`);
});
