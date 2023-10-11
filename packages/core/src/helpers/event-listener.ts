export type Listener<TEvent extends { type: string; payload: any }> = (
  event: TEvent,
) => void;

export class EventListener<TEvent extends { type: string; payload: any }> {
  private listeners: Set<Listener<TEvent>> = new Set();
  subscribe(listener: Listener<TEvent>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  emit(event: TEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
