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
    await prisma.queryHistory.create({
      data: {
        userQuestion: input.userQuestion,
        queryType: input.queryType,
        queryContent: input.queryContent,
        sourceType: input.sourceType,
        filePath: input.filePath || null,
        results: input.results ? JSON.stringify(input.results) : null,
      },
    });
  } catch (error) {
    console.error('Error saving query history:', error);
    // Don't throw - history saving shouldn't break the main flow
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
    await prisma.dashboardMetric.create({
      data: {
        metricName: input.metricName,
        queryContent: input.queryContent,
        visualizationType: input.visualizationType,
        insightSummary: input.insightSummary,
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

