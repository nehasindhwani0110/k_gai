import { NextRequest, NextResponse } from 'next/server';
import { generateDashboardMetrics } from '@/analytics-engine/services/llm-service';
import { executeSQLOnCSV } from '@/analytics-engine/services/query-executor';
import { executeFileQuery } from '@/analytics-engine/services/file-query-executor';
import { saveDashboardMetric } from '@/analytics-engine/services/query-history-service';
import { DataSourceMetadata, DashboardMetric } from '@/analytics-engine/types';
import * as path from 'path';

/**
 * POST /api/analytics/refresh - Refresh dashboard metrics
 * This endpoint can be called to refresh dashboard metrics on a schedule
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { metadata } = body;

    if (!metadata) {
      return NextResponse.json(
        { error: 'Missing required field: metadata' },
        { status: 400 }
      );
    }

    // Generate new dashboard metrics
    const dashboardResponse = await generateDashboardMetrics(metadata as DataSourceMetadata);
    const metrics = dashboardResponse.dashboard_metrics;

    // Execute all queries and cache results
    const refreshedMetrics: any[] = [];

    for (const metric of metrics) {
      try {
        let results: any[] = [];

        // Execute the query
        if (metadata.source_type === 'CSV_FILE' || metadata.file_path) {
          // Detect file type
          let fileType: 'CSV' | 'JSON' | 'EXCEL' | 'TXT' = 'CSV';
          const ext = path.extname(metadata.file_path || '').toLowerCase();
          if (ext === '.json') fileType = 'JSON';
          else if (ext === '.xlsx' || ext === '.xls') fileType = 'EXCEL';
          else if (ext === '.txt') fileType = 'TXT';

          if (fileType === 'CSV') {
            results = await executeSQLOnCSV(metadata.file_path, metric.query_content);
          } else {
            results = await executeFileQuery(metadata.file_path, fileType, metric.query_content);
          }
        } else {
          // SQL database - would need connection string
          return NextResponse.json(
            { error: 'SQL database refresh not yet implemented' },
            { status: 400 }
          );
        }

        // Save to cache
        await saveDashboardMetric({
          metricName: metric.metric_name,
          queryContent: metric.query_content,
          visualizationType: metric.visualization_type || 'auto',
          insightSummary: metric.insight_summary,
          sourceType: metadata.source_type,
          filePath: metadata.file_path,
        });

        refreshedMetrics.push({
          ...metric,
          results,
          rowCount: results.length,
        });
      } catch (error) {
        console.error(`Error refreshing metric ${metric.metric_name}:`, error);
        // Continue with other metrics even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      metrics: refreshedMetrics,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error refreshing dashboard:', error);
    return NextResponse.json(
      {
        error: 'Failed to refresh dashboard',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

