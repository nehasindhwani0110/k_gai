/**
 * LangSmith Tracing Utility
 * 
 * Provides comprehensive tracing for all LLM calls including:
 * - Token usage tracking
 * - Execution time tracking
 * - Request/response logging
 * - Error tracking
 * - Full execution flow visibility
 */

import OpenAI from 'openai';

// Dynamic imports for LangSmith (already included in LangChain packages)
let traceable: any;
let wrapOpenAI: any;

try {
  // Try ESM import first
  const langsmithTraceable = require('langsmith/traceable');
  traceable = langsmithTraceable.traceable;
} catch (error) {
  try {
    // Fallback to main package
    const langsmith = require('langsmith');
    traceable = langsmith.traceable;
  } catch (e) {
    // LangSmith not available - will use base OpenAI client
  }
}

try {
  const langsmithWrappers = require('langsmith/wrappers');
  wrapOpenAI = langsmithWrappers.wrapOpenAI;
} catch (error) {
  // wrapOpenAI not available - will use base OpenAI client
}

// Check if LangSmith is enabled
const isLangSmithEnabled = () => {
  return process.env.LANGCHAIN_TRACING_V2 === 'true' && 
         !!process.env.LANGCHAIN_API_KEY;
};

/**
 * Creates a LangSmith-wrapped OpenAI client
 * This automatically traces all OpenAI API calls
 */
export function createTracedOpenAI(): OpenAI {
  if (!isLangSmithEnabled()) {
    console.log('[LangSmith] Tracing disabled - set LANGCHAIN_TRACING_V2=true and LANGCHAIN_API_KEY');
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  const project = process.env.LANGCHAIN_PROJECT || 'analytics-engine';
  console.log(`[LangSmith] Tracing enabled for project: ${project}`);
  console.log('[LangSmith] Note: Project will be created automatically when first trace is sent');
  
  const baseClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
  });

  // Wrap OpenAI client with LangSmith tracing
  if (wrapOpenAI) {
    try {
      const wrappedClient = wrapOpenAI(baseClient);
      return wrappedClient as unknown as OpenAI;
    } catch (error) {
      console.warn('[LangSmith] Failed to wrap OpenAI client, using base client:', error);
      console.warn('[LangSmith] Error details:', error instanceof Error ? error.message : String(error));
      return baseClient;
    }
  } else {
    console.warn('[LangSmith] wrapOpenAI not available - LangSmith tracing may not work');
    console.warn('[LangSmith] Try: npm install langsmith');
    return baseClient;
  }
}

/**
 * Traceable wrapper for async functions
 * Use this to trace custom functions and operations
 */
export function traceFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  name: string
): T {
  if (!isLangSmithEnabled() || !traceable) {
    return fn;
  }

  try {
    return traceable(fn, {
      name,
      run_type: 'chain',
    }) as T;
  } catch (error) {
    console.warn('[LangSmith] Failed to trace function:', error);
    return fn;
  }
}

/**
 * Trace a synchronous operation
 */
export function traceSync<T>(
  name: string,
  operation: () => T,
  metadata?: Record<string, any>
): T {
  if (!isLangSmithEnabled() || !traceable) {
    return operation();
  }

  try {
    return traceable(operation, {
      name,
      run_type: 'tool',
      metadata,
    })();
  } catch (error) {
    console.warn('[LangSmith] Failed to trace sync operation:', error);
    return operation();
  }
}

/**
 * Get LangSmith configuration status
 */
export function getLangSmithStatus() {
  const enabled = isLangSmithEnabled();
  const project = process.env.LANGCHAIN_PROJECT || 'analytics-engine';
  const apiKey = process.env.LANGCHAIN_API_KEY ? '***' + process.env.LANGCHAIN_API_KEY.slice(-4) : 'not set';
  
  // LangSmith projects are created automatically when traces are sent
  // The dashboard URL format may vary, so provide a general link
  const baseUrl = 'https://smith.langchain.com';
  const tenantId = process.env.LANGCHAIN_TENANT_ID || 'default';
  
  return {
    enabled,
    project,
    apiKey: enabled ? apiKey : 'not set',
    tracingUrl: enabled 
      ? `${baseUrl}/o/${tenantId}/projects/${project}`
      : null,
    dashboardUrl: enabled ? baseUrl : null,
  };
}

/**
 * Log LangSmith status on startup
 */
export function logLangSmithStatus() {
  const status = getLangSmithStatus();
  
  if (status.enabled) {
    console.log('\n📊 LangSmith Tracing Enabled');
    console.log(`   Project: ${status.project}`);
    console.log(`   API Key: ${status.apiKey}`);
    if (status.dashboardUrl) {
      console.log(`   Dashboard: ${status.dashboardUrl}`);
      console.log(`   Note: Projects are created automatically when traces are sent.`);
      console.log(`   After making your first LLM call, visit: ${status.dashboardUrl}`);
      console.log(`   Then navigate to Projects → ${status.project}`);
    }
    console.log('   All LLM calls will be traced with token usage, timing, and execution flow\n');
  } else {
    console.log('\n⚠️  LangSmith Tracing Disabled');
    console.log('   To enable, set in .env.local:');
    console.log('   LANGCHAIN_TRACING_V2=true');
    console.log('   LANGCHAIN_API_KEY=your-langsmith-api-key');
    console.log('   LANGCHAIN_PROJECT=analytics-engine\n');
  }
}

