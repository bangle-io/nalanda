export function abortableSetTimeout(
  callback: () => void,
  signal: AbortSignal,
  ms: number,
): void {
  const timer = setTimeout(callback, ms);
  signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);
    },
    { once: true },
  );
}
