import type { IPCService } from '../../../dist/index.js';

export type CounterServiceEvents = {
  countUpdated: { count: number };
};

export interface ICounterService extends IPCService<CounterServiceEvents> {
  increment(step?: number): number;
}
