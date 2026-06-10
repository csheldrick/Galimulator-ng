import type { PRNG } from "../types/sim";

export class SeededRandom implements PRNG {
  readonly seed: number;
  private state: number;

  constructor(seed: number) {
    this.seed = seed;
    // xorshift must never start at 0 or it stays at 0 forever
    this.state = (seed >>> 0) || 0x9e3779b9;
    // warm up
    for (let i = 0; i < 10; i++) this.next();
  }

  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return (this.state >>> 0) / 0x100000000;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  range(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  clone(): PRNG {
    const c = new SeededRandom(this.seed);
    c.state = this.state;
    return c;
  }
}
