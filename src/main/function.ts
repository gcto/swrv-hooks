/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { isFunction, isPlainObject } from "@vue/shared";
import { SWRVCache } from "swrv";
import { markRaw, reactive, Ref, toRefs, UnwrapRef, watchEffect } from "vue";
import {
  ArgsFromKey,
  CacheItem,
  Observable,
  SWRVConfig,
  SWRVKey,
  SWRVResult,
} from "./interfaces";

export function markRawSafe<T>(obj: T): T {
  if (!obj || !isPlainObject(obj)) {
    return obj;
  }
  return markRaw(obj);
}

export const defaultCache = new SWRVCache<CacheItem<unknown, unknown>>();
export const refCounts = new Map<string, number>();

const defaultConfig: SWRVConfig<unknown, unknown> = {
  refreshInterval: 0,
  cache: defaultCache,
  dedupingInterval: Infinity,
  invalidatedCacheTTL: 5000,
  ttl: 0,
  shouldRetryOnError: true,
  errorRetryInterval: 5000,
  errorRetryCount: 5,
};

export function useSWRV<D, K extends SWRVKey, E = Error>(
  key: K,
  fn: (...args: ArgsFromKey<K>) => Observable<D, E> | Promise<D> | D,
  config?: Partial<SWRVConfig<D, E>>
) {
  const conf = { ...(defaultConfig as SWRVConfig<D, E>), ...config };

  const result = reactive({
    key: undefined as ArgsFromKey<K> | undefined,
    data: undefined as D | undefined,
    error: undefined as E | undefined,
    isValidating: true,
    mutate: (data: Promise<D> | D) => mutate(key, data),
  });

  watchEffect((onInvalidate) => {
    let isInvalidated = false;
    const args = (isFunction(key) ? key() : [key]) as ArgsFromKey<K>;
    if (!args) {
      result.key = [fn.name] as UnwrapRef<typeof args>;
      result.data = result.error = undefined;
      result.isValidating = false;
      return;
    }

    result.key = [fn.name, ...args] as UnwrapRef<typeof args>;
    const keyHash = conf.cache
      ? fn.name + conf.cache?.serializeKey([fn, ...args]).substring(3)
      : undefined;
    let cachedResult: CacheItem<D, E> | undefined;

    let unsubscribe: (() => void) | void;
    let setTimeoutHandle: any;
    onInvalidate(() => {
      const refCount = keyHash ? refCounts.get(keyHash) || 0 : 0;
      if (keyHash) {
        if (refCount > 1) {
          refCounts.set(keyHash, refCount - 1);
          return;
        } else {
          refCounts.delete(keyHash);
          if (cachedResult) {
            conf.cache?.set(keyHash, cachedResult, conf.invalidatedCacheTTL);
          }
        }
      }
      isInvalidated = true;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      clearTimeout(setTimeoutHandle);
      setTimeoutHandle = undefined;
    });

    if (keyHash) {
      const cachedItem = keyHash ? conf.cache?.get(keyHash) : undefined;
      if (cachedItem) {
        refCounts.set(keyHash, (refCounts.get(keyHash) || 0) + 1);
        // Reactively bind current result to the cached proxy
        result.data = cachedItem.data.data;
        result.error = cachedItem.data.error;
        result.isValidating = cachedItem.data.isValidating;
        if (Date.now() - cachedItem.createdAt < conf.dedupingInterval) {
          // No need to repeatedly revalidate already cached items.
          return;
        }
        // TODO: Split in 3 `watchEffect`s: key, result, observable
        // cachedResult = cachedItem.data;
      } else {
        cachedResult = reactive({
          data: undefined as D | undefined,
          error: undefined as E | undefined,
          isValidating: true,
        });

        // Add new item to the cache.
        refCounts.set(keyHash, 0);
        conf.cache?.set(keyHash, cachedResult, conf.ttl);
      }
    }

    let errorRetryCount = -1;
    const tick = async () => {
      try {
        const fnData = fn(...args);
        const observable = isFunction(fnData)
          ? fnData
          : async ({
              next,
              error,
              complete,
            }: {
              next: (data: D) => void;
              error: (error: E) => void;
              complete: () => void;
            }) => {
              try {
                next(await fnData);
              } catch (e) {
                error(e as E);
              }
              complete();
            };

        unsubscribe = await observable({
          next: (next) => {
            const rawData = markRawSafe(next) as UnwrapRef<D>;
            result.data = rawData;
            result.error = undefined;
            result.isValidating = false;
            if (keyHash && cachedResult) {
              cachedResult.data = rawData;
              cachedResult.error = undefined;
              cachedResult.isValidating = false;
              // Extend expiration time
              conf.cache?.set(keyHash, cachedResult, conf.ttl);
            }
            errorRetryCount = -1;
          },
          error: (error) => {
            const rawError = markRawSafe(error) as UnwrapRef<E>;
            result.error = rawError;
            result.isValidating = false;
            if (cachedResult) {
              cachedResult.error = rawError;
              cachedResult.isValidating = false;
            }
            errorRetryCount++;
          },
          complete: () => {
            if (isInvalidated) {
              return;
            }
            if (errorRetryCount >= 0) {
              // Last event was `error`
              const interval = conf.errorRetryInterval;
              if (
                interval &&
                conf.shouldRetryOnError &&
                errorRetryCount < conf.errorRetryCount
              ) {
                setTimeoutHandle = setTimeout(() => void tick(), interval);
              }
            } else {
              // Last event was `next`
              const interval = conf.refreshInterval;
              if (interval) {
                setTimeoutHandle = setTimeout(() => void tick(), interval);
              }
            }
          },
        });
      } catch (error) {
        const rawError = markRawSafe(error as object) as UnwrapRef<E>;
        result.error = rawError;
        result.isValidating = false;
        if (cachedResult) {
          cachedResult.error = rawError;
          cachedResult.isValidating = false;
        }
      }
    };
    void tick();
  });

  return toRefs(result) as SWRVResult<K, D, E>;
}

export async function mutate<D, K extends SWRVKey = SWRVKey, E = Error>(
  key: K,
  data: D | Promise<D>,
  cache = defaultConfig.cache,
  ttl = defaultConfig.ttl
) {
  if (!cache) {
    return;
  }
  const args = (isFunction(key) ? key() : [key]) as ArgsFromKey<K>;
  if (!args) {
    return;
  }

  const hash = cache.serializeKey(args);
  const cacheItem = hash ? cache.get(hash) : undefined;
  const cachedResult = cacheItem
    ? cacheItem.data
    : reactive({
        data: undefined as D | undefined,
        error: undefined as E | undefined,
        isValidating: true,
      });

  try {
    cachedResult.data = markRawSafe(await data);
  } catch (error) {
    cachedResult.error = markRawSafe(error);
  }
  cache.set(hash, cachedResult, ttl);
}
