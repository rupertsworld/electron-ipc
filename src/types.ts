export type EventMap = Record<string, unknown>;

export type AnyFunction = (...args: readonly unknown[]) => unknown;

export type AsyncifyFunction<T extends AnyFunction> = (
  ...args: Parameters<T>
) => Promise<Awaited<ReturnType<T>>>;

export type AsyncService<T extends object> = {
  [K in keyof T]: T[K] extends (...args: readonly unknown[]) => unknown
    ? K extends 'on' | 'once' | 'off' | 'emit' | 'setEmitHook'
      ? T[K]
      : AsyncifyFunction<T[K]>
    : T[K];
};
