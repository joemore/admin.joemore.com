/** Bound connectivity failures and never cache authentication or RLS responses. */
export const supabaseFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(10_000);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  return fetch(input, { ...init, signal, cache: "no-store" });
};
