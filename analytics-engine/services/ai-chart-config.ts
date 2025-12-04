/**
 * AI-Powered Chart Configuration Service
 * 
 * Intelligently configures Recharts visualizations based on query results
 * Schema-agnostic and multi-tenant - works with any data structure
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'composed';
  xAxisKey: string;
  yAxisKey: string | string[];
  colors: string[];
  title: string;
  description: string;
  showLegend: boolean;
  showGrid: boolean;
  gradient: boolean;
  animation: boolean;
  customizations?: {
    barRadius?: number;
    lineCurve?: 'monotone' | 'linear' | 'step';
    pieInnerRadius?: number;
    areaOpacity?: number;
  };
}

/**
 * Analyzes query results and generates optimal chart configuration using AI
 */
export async function generateChartConfig(
  data: any[],
  queryContent: string,
  userQuestion?: string
): Promise<ChartConfig | null> {
  if (!data || data.length === 0) {
    return null;
  }

  try {
    // Sample data for analysis (first 5 rows + column names)
    const sampleData = data.slice(0, 5);
    const columns = Object.keys(data[0] || {});
    
    // Detect column types
    const columnTypes: Record<string, string> = {};
    columns.forEach(col => {
      const sampleValue = data[0]?.[col];
      if (sampleValue === null || sampleValue === undefined) {
        columnTypes[col] = 'null';
      } else if (typeof sampleValue === 'number') {
        columnTypes[col] = 'number';
      } else if (typeof sampleValue === 'string') {
        // Check if it's a date
        if (/^\d{4}-\d{2}-\d{2}/.test(sampleValue) || /^\d{2}\/\d{2}\/\d{4}/.test(sampleValue)) {
          columnTypes[col] = 'date';
        } else {
          columnTypes[col] = 'string';
        }
      } else {
        columnTypes[col] = 'unknown';
      }
    });

    const prompt = `You are an expert data visualization consultant. Analyze this query result and generate the optimal chart configuration.

Query: ${queryContent.substring(0, 500)}
User Question: ${userQuestion || 'N/A'}
Data Sample (first 5 rows): ${JSON.stringify(sampleData, null, 2)}
Columns: ${columns.join(', ')}
Column Types: ${JSON.stringify(columnTypes)}

Based on this analysis, provide a JSON configuration for the best chart visualization:

1. Determine the best chart type (bar, line, pie, scatter, area, or composed)
2. Identify the X-axis key (category/dimension column)
3. Identify the Y-axis key(s) (value/metric column(s))
4. Suggest a color palette (3-5 colors in hex format)
5. Provide a descriptive title and description
6. Recommend chart customizations (animations, gradients, etc.)

Return ONLY valid JSON in this format:
{
  "chartType": "bar|line|pie|scatter|area|composed",
  "xAxisKey": "column_name",
  "yAxisKey": "column_name" or ["col1", "col2"],
  "colors": ["#0078D4", "#107C10", "#8764B8"],
  "title": "Chart Title",
  "description": "Brief description",
  "showLegend": true/false,
  "showGrid": true/false,
  "gradient": true/false,
  "animation": true/false,
  "customizations": {
    "barRadius": 6,
    "lineCurve": "monotone",
    "pieInnerRadius": 44,
    "areaOpacity": 0.3
  }
}`;

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert data visualization consultant. Return only valid JSON, no explanations.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return getDefaultConfig(data, columns);
    }

    try {
      const config = JSON.parse(content) as ChartConfig;
      // Validate and fix config
      return validateAndFixConfig(config, columns, data);
    } catch (parseError) {
      console.warn('[AI-Chart-Config] Failed to parse AI response, using defaults:', parseError);
      return getDefaultConfig(data, columns);
    }
  } catch (error) {
    console.warn('[AI-Chart-Config] AI generation failed, using defaults:', error);
    return getDefaultConfig(data, columns);
  }
}

/**
 * Validates and fixes chart configuration
 */
function validateAndFixConfig(
  config: ChartConfig,
  columns: string[],
  data: any[]
): ChartConfig {
  // Ensure xAxisKey exists in columns
  if (!columns.includes(config.xAxisKey)) {
    config.xAxisKey = columns[0] || 'category';
  }

  // Ensure yAxisKey exists
  if (typeof config.yAxisKey === 'string') {
    if (!columns.includes(config.yAxisKey)) {
      // Find first numeric column
      const numericCol = columns.find(col => {
        const val = data[0]?.[col];
        return typeof val === 'number' || !isNaN(Number(val));
      });
      config.yAxisKey = numericCol || columns[1] || 'value';
    }
  } else if (Array.isArray(config.yAxisKey)) {
    config.yAxisKey = config.yAxisKey.filter(key => columns.includes(key));
    if (config.yAxisKey.length === 0) {
      const numericCol = columns.find(col => {
        const val = data[0]?.[col];
        return typeof val === 'number' || !isNaN(Number(val));
      });
      config.yAxisKey = [numericCol || columns[1] || 'value'];
    }
  }

  // Ensure colors array is valid
  if (!Array.isArray(config.colors) || config.colors.length === 0) {
    config.colors = ['#0078D4', '#107C10', '#8764B8', '#FFB900', '#00BCF2'];
  }

  return config;
}

/**
 * Generates default chart configuration when AI is unavailable
 */
function getDefaultConfig(data: any[], columns: string[]): ChartConfig {
  const firstRow = data[0] || {};
  
  // Find numeric and string columns
  const numericCols = columns.filter(col => {
    const val = firstRow[col];
    return typeof val === 'number' || !isNaN(Number(val));
  });
  
  const stringCols = columns.filter(col => {
    const val = firstRow[col];
    return typeof val === 'string' && isNaN(Number(val));
  });

  // Determine chart type based on data structure
  let chartType: ChartConfig['chartType'] = 'bar';
  if (data.length <= 10 && stringCols.length > 0 && numericCols.length > 0) {
    chartType = 'pie';
  } else if (columns.some(col => /date|time|year|month/i.test(col))) {
    chartType = 'line';
  } else if (numericCols.length >= 2) {
    chartType = 'scatter';
  }

  return {
    chartType,
    xAxisKey: stringCols[0] || columns[0] || 'category',
    yAxisKey: numericCols[0] || columns[1] || 'value',
    colors: ['#0078D4', '#107C10', '#8764B8', '#FFB900', '#00BCF2'],
    title: 'Data Visualization',
    description: 'Automatically generated chart',
    showLegend: data.length > 1,
    showGrid: true,
    gradient: true,
    animation: true,
    customizations: {
      barRadius: 6,
      lineCurve: 'monotone',
      pieInnerRadius: 44,
      areaOpacity: 0.3,
    },
  };
}

/**
 * PowerBI-inspired professional color palettes
 */
export const COLOR_PALETTES = {
  powerbi: ['#0078D4', '#107C10', '#8764B8', '#FFB900', '#00BCF2', '#FF8C00', '#E3008C', '#00B294'],
  modern: ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#14B8A6'],
  vibrant: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'],
  pastel: ['#A8E6CF', '#FFD3B6', '#FFAAA5', '#FF8B94', '#C7CEEA', '#B5EAD7', '#FFDAC1', '#E2F0CB'],
};

