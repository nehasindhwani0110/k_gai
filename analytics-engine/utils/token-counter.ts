/**
 * Token Counter Utility
 * 
 * Accurately counts tokens using tiktoken library for precise token estimation.
 * This ensures we stay within OpenAI context limits without unexpected overflows.
 */

// Try to import tiktoken, fallback to approximation if not available
let tiktoken: any = null;
try {
  tiktoken = require('tiktoken');
} catch (error) {
  console.warn('[TOKEN-COUNTER] tiktoken not available, using approximation fallback');
}

// Cache encodings for performance
const encodingCache = new Map<string, any>();

/**
 * Gets encoding for a model (cached for performance)
 */
function getEncoding(model: string): any {
  if (!tiktoken) {
    return null; // Fallback to approximation
  }
  
  if (!encodingCache.has(model)) {
    try {
      // Map model names to tiktoken model names
      const modelMap: Record<string, string> = {
        'gpt-4-turbo-preview': 'gpt-4-turbo-preview',
        'gpt-4-turbo': 'gpt-4-turbo-preview',
        'gpt-4': 'gpt-4',
        'gpt-3.5-turbo': 'gpt-3.5-turbo',
        'gpt-4o': 'gpt-4o',
        'gpt-4o-mini': 'gpt-4o',
      };
      
      const tiktokenModel = modelMap[model] || 'gpt-4-turbo-preview';
      const encoding = tiktoken.encoding_for_model(tiktokenModel as any);
      encodingCache.set(model, encoding);
      return encoding;
    } catch (error) {
      console.warn(`[TOKEN-COUNTER] Failed to get encoding for model ${model}, using fallback:`, error);
      // Fallback to approximation if tiktoken fails
      return null;
    }
  }
  return encodingCache.get(model);
}

/**
 * Estimates token count for a given text using tiktoken
 * Falls back to approximation if tiktoken is unavailable
 */
export function estimateTokenCount(text: string, model: string = 'gpt-4-turbo-preview'): number {
  if (!text) return 0;
  
  try {
    const encoding = getEncoding(model);
    if (encoding) {
      return encoding.encode(text).length;
    }
  } catch (error) {
    console.warn('[TOKEN-COUNTER] Error using tiktoken, falling back to approximation:', error);
  }
  
  // Fallback: Conservative approximation (4 chars per token)
  return Math.ceil(text.length / 4);
}

/**
 * Estimates token count for metadata JSON
 */
export function estimateMetadataTokens(metadata: any, model: string = 'gpt-4-turbo-preview'): number {
  const jsonString = JSON.stringify(metadata);
  return estimateTokenCount(jsonString, model);
}

/**
 * Gets the context limit for the current model
 */
export function getContextLimit(model: string = 'gpt-4-turbo-preview'): number {
  // Context limits for different models
  const limits: Record<string, number> = {
    'gpt-4-turbo-preview': 128000,
    'gpt-4-turbo': 128000,
    'gpt-4': 8192,
    'gpt-3.5-turbo': 16385,
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
  };
  
  return limits[model] || 128000; // Default to 128k
}

/**
 * Calculates safe prompt size
 * Reserves space for:
 * - System message (~500 tokens)
 * - User question (~200 tokens)
 * - Response (~2000 tokens)
 * - Buffer (~2000 tokens)
 */
export function getSafePromptSize(model: string = 'gpt-4-turbo-preview'): number {
  const contextLimit = getContextLimit(model);
  const reservedTokens = 500 + 200 + 2000 + 2000; // System + Question + Response + Buffer
  return contextLimit - reservedTokens;
}

/**
 * Checks if metadata size is safe for the model
 */
export function isMetadataSizeSafe(
  metadata: any,
  model: string = 'gpt-4-turbo-preview'
): boolean {
  const metadataTokens = estimateMetadataTokens(metadata, model);
  const safeSize = getSafePromptSize(model);
  
  return metadataTokens <= safeSize;
}

/**
 * Gets the reduction ratio needed to fit within token limits
 */
export function getRequiredReductionRatio(
  metadata: any,
  model: string = 'gpt-4-turbo-preview'
): number {
  const metadataTokens = estimateMetadataTokens(metadata, model);
  const safeSize = getSafePromptSize(model);
  
  if (metadataTokens <= safeSize) {
    return 1.0; // No reduction needed
  }
  
  // Return ratio (e.g., 0.5 means we need to reduce to 50% of current size)
  return safeSize / metadataTokens;
}

