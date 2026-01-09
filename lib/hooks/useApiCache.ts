/**
 * API Caching Hook with Session/Day TTL
 * 
 * Features:
 * - Session storage for fast cache access
 * - Configurable TTL (default 5 minutes, option for day-long)
 * - Automatic cache invalidation
 * - Deduplication of in-flight requests
 * - Background refresh option
 * - Visibility-based refresh (refresh when tab becomes active)
 * - Cross-tab cache invalidation via BroadcastChannel
 */

import { useState, useEffect, useCallback, useRef } from 'react';

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  expiresAt: number;
};

type CacheOptions = {
  /** Time-to-live in milliseconds. Default: 5 minutes */
  ttl?: number;
  /** Use day-based cache key (resets at midnight) */
  dailyCache?: boolean;
  /** Refresh in background when stale */
  backgroundRefresh?: boolean;
  /** Skip cache and force fresh fetch */
  skipCache?: boolean;
  /** Refresh when tab becomes visible (default: true) */
  refreshOnFocus?: boolean;
  /** Polling interval in ms (0 = disabled) */
  pollingInterval?: number;
};

// In-flight request deduplication
const pendingRequests = new Map<string, Promise<unknown>>();

// In-memory cache fallback (for SSR or when sessionStorage unavailable)
const memoryCache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const DAY_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(url: string, dailyCache?: boolean): string {
  if (dailyCache) {
    const today = new Date().toISOString().split('T')[0];
    return `api_cache_${today}_${url}`;
  }
  return `api_cache_${url}`;
}

function getFromCache<T>(key: string): CacheEntry<T> | null {
  try {
    // Try sessionStorage first
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const cached = sessionStorage.getItem(key);
      if (cached) {
        const entry = JSON.parse(cached) as CacheEntry<T>;
        if (entry.expiresAt > Date.now()) {
          return entry;
        }
        // Expired, remove it
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // sessionStorage not available or quota exceeded
  }

  // Fallback to memory cache
  const memEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memEntry && memEntry.expiresAt > Date.now()) {
    return memEntry;
  }
  memoryCache.delete(key);
  return null;
}

function setInCache<T>(key: string, data: T, ttl: number): void {
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttl,
  };

  // Store in memory cache
  memoryCache.set(key, entry as CacheEntry<unknown>);

  // Try to store in sessionStorage
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem(key, JSON.stringify(entry));
    }
  } catch {
    // Quota exceeded or not available - memory cache is the fallback
  }
}

// BroadcastChannel for cross-tab cache invalidation
let cacheInvalidationChannel: BroadcastChannel | null = null;
const cacheListeners = new Set<(pattern?: string) => void>();

function getCacheChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (!cacheInvalidationChannel && typeof BroadcastChannel !== 'undefined') {
    try {
      cacheInvalidationChannel = new BroadcastChannel('api_cache_invalidation');
      cacheInvalidationChannel.onmessage = (event) => {
        const pattern = event.data?.pattern;
        // Notify all listeners about the invalidation
        cacheListeners.forEach(listener => listener(pattern));
      };
    } catch {
      // BroadcastChannel not supported
    }
  }
  return cacheInvalidationChannel;
}

export function invalidateCache(urlPattern?: string, broadcast = true): void {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('api_cache_')) {
        if (!urlPattern || key.includes(urlPattern)) {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
  }

  // Also clear memory cache
  if (urlPattern) {
    Array.from(memoryCache.keys()).forEach(key => {
      if (key.includes(urlPattern)) {
        memoryCache.delete(key);
      }
    });
  } else {
    memoryCache.clear();
  }

  // Broadcast invalidation to other tabs
  if (broadcast) {
    const channel = getCacheChannel();
    channel?.postMessage({ pattern: urlPattern });
  }
}

/**
 * Subscribe to cache invalidation events (used internally by hooks)
 */
function subscribeToCacheInvalidation(callback: (pattern?: string) => void): () => void {
  cacheListeners.add(callback);
  getCacheChannel(); // Ensure channel is initialized
  return () => {
    cacheListeners.delete(callback);
  };
}

export function useApiCache<T>(
  url: string | null,
  options: CacheOptions = {}
): {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  invalidate: () => void;
  lastUpdated: number | null;
} {
  const {
    ttl = DEFAULT_TTL,
    dailyCache = false,
    backgroundRefresh = false,
    skipCache = false,
    refreshOnFocus = true,
    pollingInterval = 0,
  } = options;

  const effectiveTtl = dailyCache ? DAY_TTL : ttl;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const mountedRef = useRef(true);
  const lastFocusRefreshRef = useRef<number>(0);

  const fetchData = useCallback(async (isBackground = false) => {
    if (!url) {
      setData(null);
      setLoading(false);
      return;
    }

    const cacheKey = getCacheKey(url, dailyCache);

    // Check cache first (unless skipCache)
    if (!skipCache && !isBackground) {
      const cached = getFromCache<T>(cacheKey);
      if (cached) {
        setData(cached.data);
        setLoading(false);
        setLastUpdated(cached.timestamp);

        // If backgroundRefresh and cache is > 50% stale, refresh in background
        if (backgroundRefresh) {
          const staleness = (Date.now() - cached.timestamp) / effectiveTtl;
          if (staleness > 0.5) {
            // Trigger background refresh
            fetchData(true);
          }
        }
        return;
      }
    }

    // Deduplicate in-flight requests
    const existingRequest = pendingRequests.get(url);
    if (existingRequest && !isBackground) {
      try {
        const result = await existingRequest as T;
        if (mountedRef.current) {
          setData(result);
          setLoading(false);
          setLastUpdated(Date.now());
        }
      } catch (e) {
        if (mountedRef.current) {
          setError(e instanceof Error ? e : new Error('Fetch failed'));
          setLoading(false);
        }
      }
      return;
    }

    if (!isBackground) {
      setLoading(true);
    }

    const request = fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((result: T) => {
        // Cache the result
        setInCache(cacheKey, result, effectiveTtl);
        if (mountedRef.current) {
          setData(result);
          setError(null);
          setLastUpdated(Date.now());
        }
        return result;
      })
      .catch((e) => {
        if (mountedRef.current && !isBackground) {
          setError(e instanceof Error ? e : new Error('Fetch failed'));
        }
        throw e;
      })
      .finally(() => {
        pendingRequests.delete(url);
        if (mountedRef.current && !isBackground) {
          setLoading(false);
        }
      });

    pendingRequests.set(url, request);

    try {
      await request;
    } catch {
      // Error already handled above
    }
  }, [url, dailyCache, skipCache, backgroundRefresh, effectiveTtl]);

  const refresh = useCallback(async () => {
    if (url) {
      const cacheKey = getCacheKey(url, dailyCache);
      memoryCache.delete(cacheKey);
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.removeItem(cacheKey);
        }
      } catch {
        // Ignore
      }
      await fetchData();
    }
  }, [url, dailyCache, fetchData]);

  const invalidate = useCallback(() => {
    if (url) {
      invalidateCache(url);
    }
  }, [url]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  // Visibility change handler - refresh when tab becomes visible
  useEffect(() => {
    if (!refreshOnFocus || typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        const now = Date.now();
        // Throttle: don't refresh if last refresh was < 2 seconds ago
        if (now - lastFocusRefreshRef.current > 2000) {
          lastFocusRefreshRef.current = now;
          // Do a background refresh to avoid loading spinner
          fetchData(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshOnFocus, fetchData]);

  // Polling interval
  useEffect(() => {
    if (pollingInterval <= 0 || !url) return;

    const interval = setInterval(() => {
      if (mountedRef.current && document.visibilityState === 'visible') {
        fetchData(true); // Background refresh for polling
      }
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [pollingInterval, url, fetchData]);

  // Cross-tab cache invalidation listener
  useEffect(() => {
    if (!url) return;

    const unsubscribe = subscribeToCacheInvalidation((pattern?: string) => {
      if (!pattern || url.includes(pattern)) {
        // Cache was invalidated in another tab, refresh
        fetchData(true);
      }
    });

    return unsubscribe;
  }, [url, fetchData]);

  return { data, loading, error, refresh, invalidate, lastUpdated };
}

/**
 * Prefetch data into cache (useful for anticipated navigation)
 */
export async function prefetchApi<T>(url: string, options: CacheOptions = {}): Promise<T | null> {
  const { ttl = DEFAULT_TTL, dailyCache = false } = options;
  const effectiveTtl = dailyCache ? DAY_TTL : ttl;
  const cacheKey = getCacheKey(url, dailyCache);

  // Check if already cached
  const cached = getFromCache<T>(cacheKey);
  if (cached) {
    return cached.data;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    setInCache(cacheKey, data, effectiveTtl);
    return data;
  } catch {
    return null;
  }
}

/**
 * Hook for fetching multiple URLs in parallel with caching
 */
export function useMultiApiCache<T extends Record<string, unknown>>(
  urls: Record<keyof T, string | null>,
  options: CacheOptions = {}
): {
  data: Partial<T>;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<Partial<T>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const results: Partial<T> = {};
    const entries = Object.entries(urls) as [keyof T, string | null][];
    
    try {
      await Promise.all(
        entries.map(async ([key, url]) => {
          if (!url) return;
          
          const cacheKey = getCacheKey(url, options.dailyCache);
          const cached = getFromCache<T[typeof key]>(cacheKey);
          
          if (cached && !options.skipCache) {
            results[key] = cached.data;
            return;
          }

          try {
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              setInCache(cacheKey, data, options.ttl || DEFAULT_TTL);
              results[key] = data;
            }
          } catch {
            // Individual fetch failed, continue with others
          }
        })
      );

      if (mountedRef.current) {
        setData(results);
        setError(null);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e : new Error('Multi-fetch failed'));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [urls, options.dailyCache, options.skipCache, options.ttl]);

  const refresh = useCallback(async () => {
    Object.values(urls).forEach(url => {
      if (url) {
        invalidateCache(url);
      }
    });
    await fetchAll();
  }, [urls, fetchAll]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchAll]);

  return { data, loading, error, refresh };
}

export default useApiCache;
