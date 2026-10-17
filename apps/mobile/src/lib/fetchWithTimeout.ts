/** Bound network waits on iOS too, without depending on AbortSignal.timeout/any. */
export const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const signal = init?.signal;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort);
  const timeout = setTimeout(abort, 15_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
};
