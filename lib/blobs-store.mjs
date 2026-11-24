// Adapts a Netlify Blobs store to the small interface core.mjs uses.
export function blobsStore(store) {
  return {
    get: (key) => store.get(key, { type: "json" }),
    async getWithEtag(key) {
      const result = await store.getWithMetadata(key, { type: "json" });
      return result ? { value: result.data, etag: result.etag } : null;
    },
    set: (key, value, options = {}) => store.setJSON(key, value, options),
    delete: (key) => store.delete(key),
    async list(prefix) {
      const { blobs } = await store.list({ prefix });
      return blobs.map((b) => b.key);
    },
  };
}
