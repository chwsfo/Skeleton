import { getStore } from "@netlify/blobs";
import { blobsStore } from "../../lib/blobs-store.mjs";
import { handleApi } from "../../lib/core.mjs";

export default async function api(request) {
  let body = null;
  if (request.method === "POST") {
    try {
      body = await request.json();
    } catch {
      return reply({ status: 400, body: { error: "Bad request." } });
    }
  }
  const result = await handleApi({
    store: blobsStore(getStore({ name: "jolly-kringle", consistency: "strong" })),
    secret: process.env.ORGANIZER_KEY,
    method: request.method,
    path: new URL(request.url).pathname,
    token: request.headers.get("x-crew-token"),
    organizerKey: request.headers.get("x-organizer-key"),
    body,
  });
  return reply(result);
}

function reply({ status, body }) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const config = { path: "/api/*" };
