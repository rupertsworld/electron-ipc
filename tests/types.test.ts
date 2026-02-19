import { expectTypeOf, it } from 'vitest';

import type { AsyncService } from '../src/types.ts';
import { IPCService } from '../src/main.ts';

type MyServiceEvents = {
  greeting: { text: string };
};

interface IMyService extends IPCService<MyServiceEvents> {
  hello(name: string): string;
}

it('should compile when shared service interface extends IPCService<MyServiceEvents> and declares service methods', () => {
  type RendererService = AsyncService<IMyService>;
  expectTypeOf<RendererService>().toBeObject();
});

it('should infer event payload type from event name on myService.on(...) in renderer usage', () => {
  const myService = {
    on: () => myService,
  } as unknown as AsyncService<IMyService>;

  myService.on('greeting', (payload) => {
    expectTypeOf(payload.text).toEqualTypeOf<string>();
  });
});

it('should reject invalid event names at compile time in renderer usage', () => {
  const myService = {
    on: () => myService,
  } as unknown as AsyncService<IMyService>;

  // @ts-expect-error invalid event name
  myService.on('unknown', () => undefined);
});

it('should reject invalid event payload property access at compile time in renderer listeners', () => {
  const myService = {
    on: () => myService,
  } as unknown as AsyncService<IMyService>;

  myService.on('greeting', (payload) => {
    // @ts-expect-error property does not exist on greeting payload
    payload.missing;
  });
});
