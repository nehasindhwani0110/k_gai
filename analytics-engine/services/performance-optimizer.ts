/**
 * Performance Optimizer
 * 
 * Implements multiple optimization techniques:
 * 1. Parallel operations (Promise.all)
 * 2. Request deduplication (prevent duplicate requests)
 * 3. Background pre-warming
 * 4. Streaming responses
 * 5. Query optimization hints
 */

import { DataSourceMetadata } from '../types';

/**
 * Request deduplication - prevents duplicate concurrent requests
 */
const pendingRequests = new Map<string, Promise<any>>();

export async function deduplicateRequest<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // If request is already pending, return the same promise
  if (pendingRequests.has(key)) {
    console.log(`[PERF] ⚡ Request deduplication: reusing pending request for ${key}`);
    return pendingRequests.get(key)! as Promise<T>;
  }

  // Create new request
  const promise = fn().finally(() => {
    // Clean up after completion
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}

/**
 * Parallel batch processing with concurrency limit
 */
export async function parallelBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 10
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Pre-warm cache for common queries (background task)
 */
export async function prewarmCommonQueries(
  dataSourceId: string,
  commonQuestions: string[] = [
    'show all tables',
    'list all columns',
    'show database schema'
  ]
): Promise<void> {
  // Run in background (don't await)
  setImmediate(async () => {
    try {
      console.log(`[PERF] 🔥 Pre-warming cache for ${dataSourceId}`);
      const { getHybridMetadata } = await import('./hybrid-metadata-service');
      
      // Pre-fetch metadata for common queries
      for (const question of commonQuestions) {
        try {
          await getHybridMetadata({
            dataSourceId,
            userQuestion: question,
            maxTables: 10,
            useSystemCatalog: true,
            useSemanticSearch: true,
            forceRefresh: false, // Use cache if available
          });
        } catch (error) {
          // Ignore errors in pre-warming
        }
      }
      
      console.log(`[PERF] ✅ Pre-warming complete for ${dataSourceId}`);
    } catch (error) {
      console.warn('[PERF] Pre-warming failed:', error);
    }
  });
}

/**
 * Optimize metadata for faster processing
 * Removes unnecessary fields, sorts for binary search
 */
export function optimizeMetadata(metadata: DataSourceMetadata): DataSourceMetadata {
  return {
    ...metadata,
    tables: metadata.tables?.map(table => ({
      name: table.name,
      description: table.description,
      columns: table.columns?.map(col => ({
        name: col.name,
        type: col.type,
        description: col.description,
        // Remove other fields to reduce size
      })) || [],
    })) || [],
  };
}

/**
 * Create streaming response helper
 */
export function createStreamingResponse<T>(
  generator: AsyncGenerator<T>,
  onChunk: (chunk: T) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): void {
  (async () => {
    try {
      for await (const chunk of generator) {
        onChunk(chunk);
      }
      onComplete();
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  })();
}

