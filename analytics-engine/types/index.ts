export type UseCaseMode = 'ADHOC_QUERY' | 'DASHBOARD_METRICS';
export type SourceType = 'SQL_DB' | 'CANONICAL_DB' | 'CSV_FILE';
export type QueryType = 'SQL_QUERY' | 'QUERY_LOGIC';
export type VisualizationType = 
  | 'bar_chart' 
  | 'line_chart' 
  | 'pie_chart' 
  | 'table' 
  | 'scatter_plot' 
  | 'gauge' 
  | 'map_view'
  | 'auto'; // Auto-select based on data structure

export interface ColumnMetadata {
  name: string;
  description: string;
  type: string;
}

export interface TableMetadata {
  name: string;
  description: string;
  columns: ColumnMetadata[];
}

export interface DataSourceMetadata {
  source_type: SourceType;
  tables: TableMetadata[];
  file_path?: string; // For CSV_FILE source type
}

export interface AdhocQueryResponse {
  query_type: QueryType;
  query_content: string;
  visualization_type: VisualizationType | 'auto';
  insight_summary: string;
}

export interface DashboardMetric {
  metric_name: string;
  query_type: QueryType;
  query_content: string;
  visualization_type: VisualizationType | 'auto';
  insight_summary: string;
}

export interface DashboardMetricsResponse {
  dashboard_metrics: DashboardMetric[];
}

export interface AnalyticsRequest {
  mode: UseCaseMode;
  metadata: DataSourceMetadata;
  user_question?: string;
  school_id?: string;
  use_agent?: boolean; // Use agent-based query generation
  connection_string?: string; // Required for agent-based SQL queries
}

