export const hasIdleCallback =
  typeof window !== 'undefined' && 'requestIdleCallback' in window;
