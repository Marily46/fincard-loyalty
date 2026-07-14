import type { Clock } from '../domain/ports.js';

export class SystemClock implements Clock {
  today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  now(): Date {
    return new Date();
  }
}
