import { DashboardMetric, DataSourceMetadata } from '../types';

/**
 * Post-processes generated queries to ensure they use correct table names
 * and are compatible with the data source
 */
export function postProcessDashboardMetrics(
  metrics: DashboardMetric[],
  metadata: DataSourceMetadata
): DashboardMetric[] {
  return metrics.map(metric => {
    let processedQuery = metric.query_content;

    // For all file-based sources (CSV, Excel, JSON, Text), ensure queries use correct table name
    const fileBasedSources = ['CSV_FILE', 'EXCEL_FILE', 'JSON_FILE', 'TXT_FILE', 'GOOGLE_DRIVE'];
    if (fileBasedSources.includes(metadata.source_type) && metadata.tables && metadata.tables.length > 0) {
      const tableName = metadata.tables[0].name;
      
      // Replace any table name in FROM clause with the actual table name
      // Or if no FROM clause, add one
      if (!processedQuery.match(/FROM\s+\w+/i)) {
        // No FROM clause found, add it after SELECT
        processedQuery = processedQuery.replace(
          /SELECT\s+(.+?)(\s+WHERE|\s+ORDER|\s+GROUP|\s+LIMIT|$)/i,
          `SELECT $1 FROM ${tableName}$2`
        );
      } else {
        // Replace any table name with the correct one
        processedQuery = processedQuery.replace(
          /FROM\s+\w+/i,
          `FROM ${tableName}`
        );
      }

      // Ensure query_type is SQL_QUERY for file-based sources
      if (metric.query_type !== 'SQL_QUERY') {
        return {
          ...metric,
          query_type: 'SQL_QUERY' as const,
          query_content: processedQuery,
        };
      }
    }

    return {
      ...metric,
      query_content: processedQuery,
    };
  });
}

