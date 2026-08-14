/**
 * @file Bounded FIFO buffer — oldest entries evicted when capacity is exceeded.
 */
export class RingBuffer<T> {
  private readonly items: T[] = [];

  constructor(private readonly capacity: number) {}

  push(item: T): void {
    this.items.push(item);
    while (this.items.length > this.capacity) {
      this.items.shift();
    }
  }

  snapshot(): readonly T[] {
    return [...this.items];
  }

  clear(): void {
    this.items.length = 0;
  }
}
