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

export function assertNotUndefined(
  value: unknown,
  message: string,
): asserts value {
  if (value === undefined) {
    throw new Error(`assertion failed: ${message}`);
  }
}
