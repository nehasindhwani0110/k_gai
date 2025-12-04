import { prisma } from '@/lib/prisma';

export interface QueryHistoryInput {
  userQuestion: string;
  queryType: string;
  queryContent: string;
  sourceType: string;
  filePath?: string;
  results?: any[];
}

export interface DashboardMetricInput {
  metricName: string;
  queryContent: string;
  visualizationType: string;
  insightSummary: string;
  sourceType: string;
  filePath?: string;
}

export interface FileMetadataInput {
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  tableName?: string;
  metadata: any;
}

/**
 * Save a query to history
 */
export async function saveQueryHistory(input: QueryHistoryInput): Promise<void> {
  try {
    // Limit results stored to prevent database column size issues
    // Store summary for large result sets (first 100 rows + metadata)
    let resultsToStore: string | null = null;
    if (input.results && input.results.length > 0) {
      const MAX_ROWS_TO_STORE = 100;
      const MAX_RESULT_SIZE = 45000; // ~45KB limit for JSON string (safer)
      
      if (input.results.length <= MAX_ROWS_TO_STORE) {
        // Small result set - store everything
        resultsToStore = JSON.stringify(input.results);
      } else {
        // Large result set - store summary
        const summary = {
          totalRows: input.results.length,
          sampleRows: input.results.slice(0, MAX_ROWS_TO_STORE),
          truncated: true,
        };
        resultsToStore = JSON.stringify(summary);
      }
      
      // If still too large, truncate further
      if (resultsToStore.length > MAX_RESULT_SIZE) {
        const truncatedSample = input.results.slice(0, 50);
        resultsToStore = JSON.stringify({
          totalRows: input.results.length,
          sampleRows: truncatedSample,
          truncated: true,
          note: 'Results truncated due to size limits',
        });
        
        // Final safety check - if still too large, store minimal info
        if (resultsToStore.length > MAX_RESULT_SIZE) {
          resultsToStore = JSON.stringify({
            totalRows: input.results.length,
            truncated: true,
            note: 'Results too large to store',
          });
        }
      }
    }
    
    // Truncate queryContent if too long
    // MySQL TEXT type: 65,535 bytes max, but UTF-8 encoding can make this smaller
    // Using 45KB as safe limit to account for UTF-8 multi-byte characters
    const MAX_QUERY_CONTENT_SIZE = 45000; // ~45KB limit (safer for UTF-8)
    let queryContentToStore = input.queryContent || '';
    
    // Calculate byte length for UTF-8 (more accurate than character length)
    const byteLength = Buffer.byteLength(queryContentToStore, 'utf8');
    if (byteLength > MAX_QUERY_CONTENT_SIZE) {
      console.warn(`Query content too long (${byteLength} bytes, ${queryContentToStore.length} chars), truncating`);
      // Truncate by bytes, not characters, to ensure we stay under limit
      let truncated = '';
      for (const char of queryContentToStore) {
        const testStr = truncated + char;
        if (Buffer.byteLength(testStr, 'utf8') > MAX_QUERY_CONTENT_SIZE - 50) { // Leave room for truncation message
          break;
        }
        truncated = testStr;
      }
      queryContentToStore = truncated + '\n... [truncated]';
    }
    
    // Also truncate userQuestion if too long (VARCHAR fields have limits)
    // Default VARCHAR(191) in MySQL, but safer to limit to 500 chars
    const MAX_USER_QUESTION_SIZE = 500; // Safe limit for user question
    let userQuestionToStore = input.userQuestion || '';
    if (userQuestionToStore.length > MAX_USER_QUESTION_SIZE) {
      console.warn(`User question too long (${userQuestionToStore.length} chars), truncating`);
      userQuestionToStore = userQuestionToStore.substring(0, MAX_USER_QUESTION_SIZE) + '... [truncated]';
    }
    
    await prisma.queryHistory.create({
      data: {
        userQuestion: userQuestionToStore,
        queryType: input.queryType,
        queryContent: queryContentToStore,
        sourceType: input.sourceType,
        filePath: input.filePath || null,
        results: resultsToStore,
      },
    });
  } catch (error: any) {
    // Check if it's a column size error
    if (error?.code === 'P2000' && error?.meta?.column_name === 'queryContent') {
      console.error(`Query content still too large after truncation. Original length: ${input.queryContent?.length || 0} chars`);
      // Try with even smaller limit
      const EMERGENCY_LIMIT = 30000; // 30KB emergency limit
      let emergencyContent = input.queryContent || '';
      if (emergencyContent.length > EMERGENCY_LIMIT) {
        emergencyContent = emergencyContent.substring(0, EMERGENCY_LIMIT) + '\n... [truncated - query too large]';
      }
      
      try {
        await prisma.queryHistory.create({
          data: {
            userQuestion: (input.userQuestion || '').substring(0, 500),
            queryType: input.queryType,
            queryContent: emergencyContent,
            sourceType: input.sourceType,
            filePath: input.filePath || null,
            results: null, // Skip results if query is too large
          },
        });
      } catch (retryError) {
        console.error('Failed to save query history even with emergency truncation:', retryError);
        // Don't throw - history saving shouldn't break the main flow
      }
    } else {
      console.error('Error saving query history:', error);
      // Don't throw - history saving shouldn't break the main flow
    }
  }
}

/**
 * Get query history (recent queries)
 */
export async function getQueryHistory(limit: number = 50): Promise<any[]> {
  try {
    const history = await prisma.queryHistory.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        userQuestion: true,
        queryType: true,
        queryContent: true,
        sourceType: true,
        filePath: true,
        createdAt: true,
        // Don't include results in list view (too large)
      },
    });
    return history;
  } catch (error) {
    console.error('Error fetching query history:', error);
    return [];
  }
}

/**
 * Get a specific query by ID
 */
export async function getQueryById(id: string): Promise<any | null> {
  try {
    const query = await prisma.queryHistory.findUnique({
      where: { id },
    });
    
    if (query && query.results) {
      return {
        ...query,
        results: JSON.parse(query.results),
      };
    }
    
    return query;
  } catch (error) {
    console.error('Error fetching query by ID:', error);
    return null;
  }
}

/**
 * Delete query history
 */
export async function deleteQueryHistory(id: string): Promise<boolean> {
  try {
    await prisma.queryHistory.delete({
      where: { id },
    });
    return true;
  } catch (error) {
    console.error('Error deleting query history:', error);
    return false;
  }
}

/**
 * Clear all query history
 */
export async function clearQueryHistory(): Promise<boolean> {
  try {
    await prisma.queryHistory.deleteMany({});
    return true;
  } catch (error) {
    console.error('Error clearing query history:', error);
    return false;
  }
}

/**
 * Save dashboard metric
 */
export async function saveDashboardMetric(input: DashboardMetricInput): Promise<void> {
  try {
    // Truncate long content as safety measure
    const MAX_CONTENT_SIZE = 60000; // ~60KB limit
    let queryContentToStore = input.queryContent;
    let insightSummaryToStore = input.insightSummary;
    
    if (queryContentToStore.length > MAX_CONTENT_SIZE) {
      console.warn(`Query content too long (${queryContentToStore.length} chars), truncating`);
      queryContentToStore = queryContentToStore.substring(0, MAX_CONTENT_SIZE) + '\n... [truncated]';
    }
    
    if (insightSummaryToStore.length > MAX_CONTENT_SIZE) {
      console.warn(`Insight summary too long (${insightSummaryToStore.length} chars), truncating`);
      insightSummaryToStore = insightSummaryToStore.substring(0, MAX_CONTENT_SIZE) + '\n... [truncated]';
    }
    
    await prisma.dashboardMetric.create({
      data: {
        metricName: input.metricName,
        queryContent: queryContentToStore,
        visualizationType: input.visualizationType,
        insightSummary: insightSummaryToStore,
        sourceType: input.sourceType,
        filePath: input.filePath || null,
      },
    });
  } catch (error) {
    console.error('Error saving dashboard metric:', error);
  }
}

/**
 * Get dashboard metrics for a source
 */
export async function getDashboardMetrics(
  sourceType: string,
  filePath?: string
): Promise<any[]> {
  try {
    const where: any = { sourceType };
    if (filePath) {
      where.filePath = filePath;
    }
    
    const metrics = await prisma.dashboardMetric.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: 10, // Get latest 10 metrics
    });
    
    return metrics;
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    return [];
  }
}

/**
 * Save file metadata
 */
export async function saveFileMetadata(input: FileMetadataInput): Promise<void> {
  try {
    // Stringify metadata
    let metadataString = JSON.stringify(input.metadata);
    
    // MySQL TEXT can hold up to 65,535 bytes, but we'll be safe and limit to 60KB
    // If metadata is too large, store a simplified version
    const MAX_METADATA_SIZE = 100000; // 100KB limit
    if (metadataString.length > MAX_METADATA_SIZE) {
      console.warn(`Metadata too large (${metadataString.length} bytes), storing simplified version`);
      
      // Store only essential metadata: source_type, file_path, and table names
      const simplifiedMetadata = {
        source_type: input.metadata?.source_type || 'CSV_FILE',
        file_path: input.metadata?.file_path || input.filePath,
        tables: input.metadata?.tables?.map((table: any) => ({
          name: table.name,
          description: table.description,
          columnCount: table.columns?.length || 0,
          // Store only column names, not full column metadata
          columns: table.columns?.map((col: any) => ({
            name: col.name,
            type: col.type,
          })) || [],
        })) || [],
      };
      
      metadataString = JSON.stringify(simplifiedMetadata);
      
      // If still too large, truncate column details
      if (metadataString.length > MAX_METADATA_SIZE) {
        const minimalMetadata = {
          source_type: input.metadata?.source_type || 'CSV_FILE',
          file_path: input.metadata?.file_path || input.filePath,
          tables: input.metadata?.tables?.map((table: any) => ({
            name: table.name,
            columnCount: table.columns?.length || 0,
          })) || [],
        };
        metadataString = JSON.stringify(minimalMetadata);
      }
    }
    
    await prisma.fileMetadata.upsert({
      where: { filePath: input.filePath },
      update: {
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize: input.fileSize,
        tableName: input.tableName || null,
        metadata: metadataString,
      },
      create: {
        fileName: input.fileName,
        filePath: input.filePath,
        fileType: input.fileType,
        fileSize: input.fileSize,
        tableName: input.tableName || null,
        metadata: metadataString,
      },
    });
  } catch (error) {
    console.error('Error saving file metadata:', error);
    // Re-throw to allow caller to handle
    throw error;
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(filePath: string): Promise<any | null> {
  try {
    const metadata = await prisma.fileMetadata.findUnique({
      where: { filePath },
    });
    
    if (metadata && metadata.metadata) {
      return {
        ...metadata,
        metadata: JSON.parse(metadata.metadata),
      };
    }
    
    return metadata;
  } catch (error) {
    console.error('Error fetching file metadata:', error);
    return null;
  }
}

/**
 * Get all uploaded files
 */
export async function getAllFiles(): Promise<any[]> {
  try {
    const files = await prisma.fileMetadata.findMany({
      orderBy: {
        uploadedAt: 'desc',
      },
    });
    
    return files.map(file => ({
      ...file,
      metadata: file.metadata ? JSON.parse(file.metadata) : null,
    }));
  } catch (error) {
    console.error('Error fetching all files:', error);
    return [];
  }
}

