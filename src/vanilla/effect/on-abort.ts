export function onAbort(signal: AbortSignal, cb: () => void) {
  signal.addEventListener('abort', cb, {
    once: true,
  });
}
