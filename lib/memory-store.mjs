// In-memory store with the same conditional-write behavior as Netlify Blobs.
// Used by the tests.
export function memoryStore() {
  const data = new Map();
  let version = 0;
  const copy = (v) => (v === undefined ? null : structuredClone(v));
  return {
    data,
    async get(key) {
      return data.has(key) ? copy(data.get(key).value) : null;
    },
    async getWithEtag(key) {
      const entry = data.get(key);
      return entry ? { value: copy(entry.value), etag: entry.etag } : null;
    },
    async set(key, value, { onlyIfMatch, onlyIfNew } = {}) {
      const current = data.get(key);
      if (onlyIfNew && current) return { modified: false };
      if (onlyIfMatch && current?.etag !== onlyIfMatch) return { modified: false };
      const etag = `v${++version}`;
      data.set(key, { value: copy(value), etag });
      return { modified: true, etag };
    },
    async delete(key) {
      data.delete(key);
    },
    async list(prefix) {
      return [...data.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}
