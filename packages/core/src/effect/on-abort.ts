export function onAbortOnce(signal: AbortSignal, cb: () => void) {
  signal.addEventListener('abort', cb, {
    once: true,
  });
}
