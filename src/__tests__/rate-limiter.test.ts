import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../rate-limiter.js";

describe("RateLimiter", () => {
  it("starts full", () => {
    const rl = new RateLimiter(1000);
    expect(rl.available()).toBe(1000);
  });

  it("resolves immediately while tokens are available", async () => {
    const rl = new RateLimiter(1000);
    const start = Date.now();
    for (let i = 0; i < 10; i++) {
      await rl.acquire();
    }
    expect(Date.now() - start).toBeLessThan(50);
    expect(rl.available()).toBe(990);
  });

  it("queues when exhausted and refills over time", async () => {
    vi.useFakeTimers();
    try {
      const rl = new RateLimiter(3600); // 1 token per second
      for (let i = 0; i < 3600; i++) await rl.acquire();
      expect(rl.available()).toBe(0);

      const pending = rl.acquire();
      let resolved = false;
      pending.then(() => {
        resolved = true;
      });

      // 500ms isn't enough for a full token
      await vi.advanceTimersByTimeAsync(500);
      expect(resolved).toBe(false);

      // ~600ms more gets us past 1 full token
      await vi.advanceTimersByTimeAsync(600);
      await pending;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not exceed capacity on refill", async () => {
    vi.useFakeTimers();
    try {
      const rl = new RateLimiter(60); // 1 token per minute
      // Consume a few tokens to ensure refill can be observed
      await rl.acquire();
      await rl.acquire();
      const beforeAdvance = rl.available();
      expect(beforeAdvance).toBe(58);
      // Advance beyond a full refill window
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(rl.available()).toBe(60);
    } finally {
      vi.useRealTimers();
    }
  });
});
