import path from 'path';
import { PersistentAiCache } from '../utils/groqUtils';
import { APP_ROOT_DIR, isServerlessRuntime } from './runtime';

// --- Rate Limiting & Abuse Protection ---
export interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

export const RATE_LIMIT_CAPACITY = 40;
export const REFILL_RATE_PER_MS = RATE_LIMIT_CAPACITY / 60000;
export const ipBuckets = new Map<string, RateLimitBucket>();

// A daily limit per address (package R7). AI is open to everyone, so one visitor must not use up the
// shared quota. The browser keeps its own, lower, per-device allowance (utils/aiDailyLimit.ts); this one
// is a backstop for calls that bypass the game. Serverless instances keep it in memory, so it is best effort.
export const DAILY_AI_REQUESTS_PER_IP = 2500;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const dailyIpCounts = new Map<string, { windowStart: number; count: number }>();

export function checkDailyIpLimit(ip: string, now: number = Date.now()): { allowed: boolean; retryAfter?: number } {
  let entry = dailyIpCounts.get(ip);
  if (!entry || now - entry.windowStart >= DAY_MS) {
    entry = { windowStart: now, count: 0 };
    dailyIpCounts.set(ip, entry);
  }
  if (entry.count >= DAILY_AI_REQUESTS_PER_IP) {
    return { allowed: false, retryAfter: Math.ceil((entry.windowStart + DAY_MS - now) / 1000) };
  }
  entry.count += 1;
  if (dailyIpCounts.size > 5000) {
    for (const [key, value] of dailyIpCounts) {
      if (now - value.windowStart >= DAY_MS) dailyIpCounts.delete(key);
    }
  }
  return { allowed: true };
}


export interface CacheEntry {
  data: any;
  expiresAt: number;
}
export const responseCache = new Map<string, CacheEntry>();
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h TTL to conserve Orpheus 100 RPD free-tier quota
export const cacheFilePath = isServerlessRuntime
  ? '/tmp/.ai-response-cache.json'
  : path.resolve(APP_ROOT_DIR, '.ai-response-cache.json');
export const persistentAiCache = new PersistentAiCache(cacheFilePath, 400);

export function cleanupCache() {
  const now = Date.now();
  for (const [key, entry] of responseCache.entries()) {
    if (entry.expiresAt < now) {
      responseCache.delete(key);
    }
  }
  if (responseCache.size > 300) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  let bucket = ipBuckets.get(ip);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT_CAPACITY, lastRefill: now };
    ipBuckets.set(ip, bucket);
  } else {
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(RATE_LIMIT_CAPACITY, bucket.tokens + elapsed * REFILL_RATE_PER_MS);
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true };
  }

  const waitMs = Math.ceil((1 - bucket.tokens) / REFILL_RATE_PER_MS);
  return { allowed: false, retryAfter: Math.ceil(waitMs / 1000) };
}

if (!isServerlessRuntime) {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of ipBuckets.entries()) {
      if (now - bucket.lastRefill > 120000 && bucket.tokens >= RATE_LIMIT_CAPACITY - 1) {
        ipBuckets.delete(ip);
      }
    }
  }, 60000).unref?.();
}
