import type { MyBrainContext } from "@/lib/my-brain";

type CacheEntry = {
  fingerprint: string;
  context: MyBrainContext;
};

const cache = new Map<string, CacheEntry>();

export function fingerprintMyBrainData(
  sources: { updatedAt: Date }[],
  documents: { updatedAt: Date }[]
) {
  const sourceMax = sources.reduce((m, s) => Math.max(m, s.updatedAt.getTime()), 0);
  const docMax = documents.reduce((m, d) => Math.max(m, d.updatedAt.getTime()), 0);
  return `${sources.length}:${sourceMax}:${documents.length}:${docMax}`;
}

export function getCachedMyBrainContext(userId: string, fingerprint: string) {
  const hit = cache.get(userId);
  if (hit?.fingerprint === fingerprint) return hit.context;
  return null;
}

export function setCachedMyBrainContext(userId: string, fingerprint: string, context: MyBrainContext) {
  cache.set(userId, { fingerprint, context });
}

export function invalidateMyBrainCache(userId: string) {
  cache.delete(userId);
}
