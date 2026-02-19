export type EventMap = Record<string, unknown>;

type AnyFunction = (...args: readonly unknown[]) => unknown;

export type AsyncService<T extends object> = {
  [K in keyof T]: T[K] extends AnyFunction
    ? K extends 'on' | 'once' | 'off' | 'emit' | 'setEmitHook'
      ? T[K]
      : (...args: Parameters<T[K]>) => Promise<Awaited<ReturnType<T[K]>>>
    : T[K];
};
