# SWRV hooks

## Usage

```typescript
useSWRV("cache key", fn: (args)=>Observable<D,E>, configObject )
```

## Config Object

```typescript
{
  refreshInterval: number;
  invalidatedCacheTTL: number;
  dedupingInterval: number;
  ttl: number;
  shouldRetryOnError: boolean;
  errorRetryInterval: number;
  errorRetryCount: number;
}
```
