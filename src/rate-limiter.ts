export class RateLimiter {
  private tokens: number;
  private readonly refillPerMs: number;
  private lastRefill: number;
  private readonly capacity: number;
  private queue: Array<() => void> = [];

  constructor(requestsPerHour: number) {
    this.capacity = requestsPerHour;
    this.tokens = requestsPerHour;
    this.refillPerMs = requestsPerHour / (60 * 60 * 1000);
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const add = elapsed * this.refillPerMs;
    if (add > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + add);
      this.lastRefill = now;
    }
  }

  private tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  async acquire(): Promise<void> {
    if (this.tryConsume()) return;
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.scheduleDrain();
    });
  }

  private drainTimer: NodeJS.Timeout | null = null;
  private scheduleDrain(): void {
    if (this.drainTimer) return;
    const msToNext = Math.max(10, Math.ceil((1 - this.tokens) / this.refillPerMs));
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      while (this.queue.length > 0 && this.tryConsume()) {
        const next = this.queue.shift();
        next?.();
      }
      if (this.queue.length > 0) this.scheduleDrain();
    }, msToNext);
  }

  available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}
