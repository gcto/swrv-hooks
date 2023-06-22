import { Ref, WatchSource } from "vue";
import hash from "./hash";

export type keyType = string | any[] | null | undefined;

export type IKey = keyType | WatchSource<keyType>;

export interface ICacheItem<Data> {
  data: Data;
  createdAt: number;
  expiresAt: number;
}

function serializeKeyDefault(key: IKey): string {
  if (typeof key === "function") {
    try {
      key = key();
    } catch (err) {
      // dependencies not ready
      key = "";
    }
  }

  if (Array.isArray(key)) {
    key = hash(key);
  } else {
    // convert null to ''
    key = String(key || "");
  }

  return key;
}

export class SWRVCache<CacheData> {
  protected ttl: number;
  private items: Map<string, ICacheItem<CacheData>>;

  constructor(ttl = 0) {
    this.items = new Map();
    this.ttl = ttl;
  }

  serializeKey(key: IKey): string {
    return serializeKeyDefault(key);
  }

  get(k: string): ICacheItem<CacheData> | undefined {
    const _key = this.serializeKey(k);
    return this.items.get(_key);
  }

  set(k: string, v: any, ttl: number) {
    const _key = this.serializeKey(k);
    const timeToLive = ttl || this.ttl;
    const now = Date.now();
    const item = {
      data: v,
      createdAt: now,
      expiresAt: timeToLive ? now + timeToLive : Infinity,
    };

    this.dispatchExpire(timeToLive, item, _key);
    this.items.set(_key, item);
  }

  dispatchExpire(
    ttl: number,
    item: ICacheItem<CacheData>,
    serializedKey: string
  ) {
    ttl &&
      setTimeout(() => {
        const current = Date.now();
        const hasExpired = current >= item.expiresAt;
        if (hasExpired) this.delete(serializedKey);
      }, ttl);
  }

  delete(serializedKey: string) {
    this.items.delete(serializedKey);
  }
}
