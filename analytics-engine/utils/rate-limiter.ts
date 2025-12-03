/**
 * Simple Rate Limiter
 * 
 * Limits concurrent execution of async functions without using Node.js built-ins.
 * Compatible with Next.js webpack bundling.
 * 
 * This is a replacement for p-limit that doesn't use #async_hooks,
 * making it compatible with Next.js webpack bundling.
 */

export class RateLimiter {
  private running = 0;
  private queue: Array<() => void> = [];
  
  constructor(private limit: number) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        this.running++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          if (this.queue.length > 0) {
            const next = this.queue.shift()!;
            next();
          }
        }
      };
      
      if (this.running < this.limit) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }
}

/**
 * Creates a rate limiter function compatible with p-limit API
 * @param limit Maximum number of concurrent executions
 * @returns A function that wraps async functions to limit concurrency
 */
export function createRateLimiter(limit: number) {
  const limiter = new RateLimiter(limit);
  return <T>(fn: () => Promise<T>): Promise<T> => {
    return limiter.execute(fn);
  };
}

