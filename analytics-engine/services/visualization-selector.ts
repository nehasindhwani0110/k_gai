import { VisualizationType } from '../types';

/**
 * Automatically selects the best visualization type based on query results
 * Completely generic - works for any multi-tenant application without hardcoding field names
 */
export function autoSelectVisualizationType(
  data: any[],
  queryContent: string,
  userQuestion?: string
): VisualizationType {
  if (!data || data.length === 0) {
    return 'table';
  }

  const rowCount = data.length;
  const firstRow = data[0];
  const keys = Object.keys(firstRow);
  
  // Detect numeric and string columns generically
  const numericKeys = keys.filter(key => {
    const value = firstRow[key];
    return value !== null && value !== undefined && 
           (typeof value === 'number' || (!isNaN(Number(value)) && value !== ''));
  });
  
  const stringKeys = keys.filter(key => {
    const value = firstRow[key];
    return value !== null && value !== undefined && 
           typeof value === 'string' && 
           isNaN(Number(value)) && 
           value !== '';
  });

  // Combine query content and user question for better context
  const fullContext = `${queryContent || ''} ${userQuestion || ''}`.toLowerCase();
  
  // Analyze query patterns generically
  const hasGroupBy = /group\s+by/i.test(queryContent);
  const hasOrderBy = /order\s+by/i.test(queryContent);
  const hasAggregate = /(count|sum|avg|max|min|average|total)\(/i.test(queryContent);
  const isDistribution = /distribution|breakdown|split|grouped|by\s+\w+|each\s+\w+/i.test(fullContext);
  const isComparison = /compare|comparison|versus|vs|by\s+\w+/i.test(fullContext);
  const isTrend = /trend|over\s+time|year|month|quarter|growth|change|historical/i.test(fullContext);
  const isRanking = /top|bottom|highest|lowest|best|worst|rank/i.test(fullContext);

  // Single value result (aggregate like AVG, COUNT, SUM without GROUP BY)
  if (rowCount === 1 && numericKeys.length === 1 && keys.length <= 2 && !hasGroupBy) {
    const value = Number(firstRow[numericKeys[0]]);
    
    // Check if query suggests it's a percentage or rate
    const isPercentage = /percentage|rate|score|ratio|percent/i.test(queryContent) || 
                        (value >= 0 && value <= 100);
    
    if (isPercentage) {
      return 'gauge';
    }
    return 'gauge'; // Default to gauge for single metrics
  }

  // Time series data (has date/time column or ordered sequence)
  // BUT: Don't use line chart for ranking queries (ORDER BY with LIMIT)
  const hasTimeColumn = keys.some(key => 
    /date|time|year|month|day|week|quarter|semester|academic_year|created|updated/i.test(key)
  );
  const isRankingQuery = /order\s+by.*limit|top\s+\d+|bottom\s+\d+|highest|lowest/i.test(queryContent);
  
  // Check if query has GROUP BY with date functions (MONTH, YEAR, etc.)
  const hasDateGroupBy = /group\s+by.*(?:year|month|day|date)\(/i.test(queryContent);
  
  // Only use line chart if it's explicitly a trend/time query AND not a ranking
  // For date GROUP BY queries, prefer line chart even with single row (data issue, not visualization issue)
  if ((hasTimeColumn || isTrend || hasDateGroupBy) && rowCount >= 1 && !isRankingQuery) {
    // Make sure it's actually time-series data (date column should be the category)
    const timeKey = keys.find(key => /date|time|year|month|day|week|quarter/i.test(key));
    if (timeKey) {
      // If we have year AND month columns, it's definitely time series
      if (keys.some(k => /year/i.test(k)) && keys.some(k => /month/i.test(k))) {
        return 'line_chart';
      }
      // If time column is first or second column, use line chart
      if (timeKey === keys[0] || timeKey === keys[1]) {
        return 'line_chart';
      }
    }
  }

  // Distribution queries with GROUP BY - prioritize bar/pie charts
  if (hasGroupBy && rowCount >= 2 && stringKeys.length >= 1 && numericKeys.length >= 1) {
    // Calculate total for percentage detection
    const total = data.reduce((sum, row) => {
      const numKey = numericKeys[0];
      const val = Number(row[numKey]) || 0;
      return sum + val;
    }, 0);
    
    // Check if values sum to 100 (percentage distribution)
    const isPercentage = total > 0 && Math.abs(total - 100) < 1;
    
    // For distribution queries, prefer charts over tables
    if (isDistribution || isComparison) {
      // Pie chart for small distributions (2-8 categories) that sum to 100
      if (isPercentage && rowCount >= 2 && rowCount <= 8) {
        return 'pie_chart';
      }
      
      // Bar chart for distributions (more readable, especially for many categories)
      if (rowCount >= 2 && rowCount <= 30) {
        return 'bar_chart';
      }
    }
    
    // Default: bar chart for GROUP BY queries with categories
    if (rowCount >= 2 && rowCount <= 30) {
      return 'bar_chart';
    }
  }

  // Distribution data (many categories with GROUP BY)
  if (hasGroupBy && rowCount > 15 && rowCount <= 50 && stringKeys.length >= 1 && numericKeys.length >= 1) {
    return 'bar_chart';
  }

  // Too many rows for chart - use table
  if (rowCount > 50) {
    return 'table';
  }

  // Scatter plot (2+ numeric columns, multiple rows, correlation analysis)
  if (rowCount > 5 && numericKeys.length >= 2 && !hasGroupBy) {
    return 'scatter_plot';
  }

  // Correlation or relationship data
  if (numericKeys.length >= 2 && rowCount > 10 && /correlation|relationship|vs/i.test(queryContent)) {
    return 'scatter_plot';
  }

  // Comparison queries with categories and values (no GROUP BY but has both string and numeric)
  if (rowCount >= 2 && rowCount <= 30 && numericKeys.length >= 1 && stringKeys.length >= 1 && !hasGroupBy) {
    // If it's a distribution/comparison question, use bar chart
    if (isDistribution || isComparison) {
      return 'bar_chart';
    }
    // Otherwise table might be better
    return 'table';
  }

  // Ranking queries (ORDER BY with LIMIT) - prefer bar chart or table
  if (isRankingQuery && rowCount >= 2 && rowCount <= 20 && numericKeys.length >= 1) {
    // If has name/category column + numeric value, use bar chart
    if (stringKeys.length >= 1) {
      return 'bar_chart';
    }
    // Otherwise table
    return 'table';
  }

  // Simple list queries (no aggregates, just data)
  if (rowCount >= 2 && rowCount <= 50 && !hasAggregate && !hasGroupBy && !isRankingQuery) {
    // If has time column as first column AND not ranking, use line chart
    const timeKey = keys.find(key => /date|time|year|month|day|week|quarter/i.test(key));
    if (timeKey && timeKey === keys[0] && !isRankingQuery) {
      return 'line_chart';
    }
    // For queries with name + value (like "SELECT name, value"), use bar chart
    if (stringKeys.length >= 1 && numericKeys.length >= 1 && rowCount <= 20) {
      return 'bar_chart';
    }
    // Otherwise table is better for lists
    return 'table';
  }

  // Default to table for complex data or unknown structure
  return 'table';
}

