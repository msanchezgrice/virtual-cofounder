/**
 * Custom React Hooks
 * 
 * Re-exports all custom hooks for convenient importing:
 * import { useApiCache, invalidateCache } from '@/lib/hooks';
 */

export { 
  useApiCache, 
  useMultiApiCache,
  invalidateCache, 
  prefetchApi,
  default as useApiCacheDefault 
} from './useApiCache';
