import { SWRVCache } from "swrv";
import { Ref, UnwrapRef } from "vue";

export type AnyTuple =
  | [any]
  | [any, any]
  | [any, any, any]
  | [any, any, any, any]
  | [any, any, any, any, any]
  | [any, any, any, any, any, any]
  | [any, any, any, any, any, any, any];

export type ArgsFromKey<K> = K extends () => undefined | infer A
  ? A extends AnyTuple
    ? A
    : never
  : [string];

export type CacheItem<D, E> = {
  data?: UnwrapRef<D>;
  error?: UnwrapRef<E>;
  isValidating: UnwrapRef<boolean>;
};

export type SWRVResult<K, D, E> = {
  key: Ref<ArgsFromKey<K>>;
  data: Ref<D>;
  error: Ref<E>;
  isValidating: Ref<boolean>;
};

export interface Observer<D, E = Error> {
  next: (data: D) => void;
  error: (error: E) => void;
  complete: () => void;
}

export type Observable<D, E = Error> = (
  subscriber: Observer<D, E>
) => void | /* unsubscribe */ (() => void | Promise<void>);

export interface SWRVConfig<D, E = Error> {
  refreshInterval: number;
  cache?: SWRVCache<CacheItem<D, E>>;
  invalidatedCacheTTL: number;
  dedupingInterval: number;
  ttl: number;
  // serverTTL?: number
  // revalidateOnFocus?: boolean
  // revalidateDebounce?: number
  shouldRetryOnError: boolean;
  errorRetryInterval: number;
  errorRetryCount: number;
  // isOnline?: () => boolean
  // isDocumentVisible?: () => boolean
}

export type SWRVKey = string | (() => undefined | AnyTuple);
