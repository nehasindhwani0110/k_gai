import { VisualizationType } from '../types';

/**
 * Automatically selects the best visualization type based on query results
 * This makes the AI decide visualization type based on actual data, not prompts
 */
export function autoSelectVisualizationType(
  data: any[],
  queryContent: string
): VisualizationType {
  if (!data || data.length === 0) {
    return 'table';
  }

  const rowCount = data.length;
  const firstRow = data[0];
  const keys = Object.keys(firstRow);
  const numericKeys = keys.filter(key => {
    const value = firstRow[key];
    return typeof value === 'number' || !isNaN(Number(value));
  });
  const stringKeys = keys.filter(key => {
    const value = firstRow[key];
    return typeof value === 'string' && isNaN(Number(value));
  });

  // Analyze query content for hints
  const queryLower = queryContent.toLowerCase();
  const hasGroupBy = /group\s+by/i.test(queryContent);
  const hasOrderBy = /order\s+by/i.test(queryContent);
  const hasAggregate = /(count|sum|avg|max|min|average)\(/i.test(queryContent);
  const isDistribution = /distribution|breakdown|split|by\s+\w+/i.test(queryContent);
  const isComparison = /compare|comparison|versus|vs|by\s+\w+/i.test(queryContent);
  const isTrend = /trend|over\s+time|year|month|quarter|growth|change/i.test(queryContent);

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
  
  // Only use line chart if it's explicitly a trend/time query AND not a ranking
  if ((hasTimeColumn || isTrend) && rowCount > 1 && !isRankingQuery) {
    // Make sure it's actually time-series data (date column should be the category)
    const timeKey = keys.find(key => /date|time|year|month|day|week|quarter/i.test(key));
    if (timeKey && timeKey === keys[0]) {
      return 'line_chart';
    }
  }

  // Distribution/Comparison data with GROUP BY (2-15 categories)
  if (hasGroupBy && rowCount >= 2 && rowCount <= 15 && stringKeys.length >= 1 && numericKeys.length >= 1) {
    // Check if it's a percentage distribution (values sum to exactly 100)
    const total = data.reduce((sum, row) => {
      const numKey = numericKeys[0];
      return sum + (Number(row[numKey]) || 0);
    }, 0);
    
    // Only use pie chart if:
    // 1. Values explicitly sum to 100 (percentage distribution)
    // 2. Query explicitly mentions "distribution" AND values sum close to 100
    // 3. Small number of categories (2-8) for readability
    const isExactPercentage = Math.abs(total - 100) < 0.1;
    const isCloseToPercentage = Math.abs(total - 100) < 2 && isDistribution;
    
    if ((isExactPercentage || isCloseToPercentage) && rowCount >= 2 && rowCount <= 8) {
      return 'pie_chart';
    }
    
    // For rankings and comparisons, prefer bar chart (more readable)
    if (hasOrderBy && rowCount <= 15) {
      return 'bar_chart';
    }
    
    // Default to bar chart for most comparisons (better than pie for readability)
    return 'bar_chart';
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

  // Comparison queries with multiple numeric values (no GROUP BY but has categories)
  if (rowCount >= 2 && rowCount <= 20 && numericKeys.length >= 1 && stringKeys.length >= 1) {
    // Prefer bar chart for comparisons
    return 'bar_chart';
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

