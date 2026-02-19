import type { EventMap } from './types.ts';

type Listener<T> = (payload: T) => void;

type EmitHook<TEvents extends EventMap> = <K extends keyof TEvents>(
  eventName: K,
  payload: TEvents[K],
) => void;

export class IPCService<TEvents extends EventMap = EventMap> {
  private readonly listeners = new Map<keyof TEvents, Set<Listener<TEvents[keyof TEvents]>>>();
  private emitHook?: EmitHook<TEvents>;

  on<K extends keyof TEvents>(eventName: K, listener: Listener<TEvents[K]>): this {
    this.ensureListenerSet(eventName).add(listener as Listener<TEvents[keyof TEvents]>);
    return this;
  }

  once<K extends keyof TEvents>(eventName: K, listener: Listener<TEvents[K]>): this {
    const onceListener: Listener<TEvents[K]> = (payload) => {
      this.off(eventName, onceListener);
      listener(payload);
    };
    return this.on(eventName, onceListener);
  }

  off<K extends keyof TEvents>(eventName: K, listener: Listener<TEvents[K]>): this {
    const listeners = this.listeners.get(eventName);
    if (!listeners) {
      return this;
    }
    listeners.delete(listener as Listener<TEvents[keyof TEvents]>);
    if (listeners.size === 0) {
      this.listeners.delete(eventName);
    }
    return this;
  }

  emit<K extends keyof TEvents>(eventName: K, payload: TEvents[K]): this {
    const listeners = this.listeners.get(eventName);
    if (listeners) {
      for (const listener of [...listeners]) {
        try {
          (listener as Listener<TEvents[K]>)(payload);
        } catch {
          // Listener failures must not block remaining listeners.
        }
      }
    }
    this.emitHook?.(eventName, payload);
    return this;
  }

  setEmitHook(hook: EmitHook<TEvents> | undefined): void {
    this.emitHook = hook;
  }

  private ensureListenerSet<K extends keyof TEvents>(eventName: K): Set<Listener<TEvents[keyof TEvents]>> {
    const existing = this.listeners.get(eventName);
    if (existing) {
      return existing;
    }
    const created = new Set<Listener<TEvents[keyof TEvents]>>();
    this.listeners.set(eventName, created);
    return created;
  }
}
