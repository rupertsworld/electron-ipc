import type { IPCService } from '../../../dist/ipc-service.js';

export type CounterServiceEvents = {
  countUpdated: { count: number };
};

export interface ICounterService extends IPCService<CounterServiceEvents> {
  increment(step?: number): number;
}
