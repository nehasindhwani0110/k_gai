import OpenAI from 'openai';
import { DataSourceMetadata } from '../types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

interface AnalyticsSuggestion {
  question: string;
  description: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
}

interface AnalyticsSuggestionsResponse {
  suggestions: AnalyticsSuggestion[];
}

const ANALYTICS_SUGGESTIONS_PROMPT = `You are an expert data analyst specializing in education analytics. 

Analyze the provided data source metadata and generate 10-15 highly relevant, actionable analytics questions that would provide valuable insights.

**DATA SOURCE METADATA:**
{DATA_SOURCE_METADATA}

**INSTRUCTIONS:**
1. Generate questions that are specific to the actual columns and data available
2. Focus on questions that would help educators, administrators, or students make data-driven decisions
3. Include a mix of:
   - Performance metrics (grades, scores, attendance)
   - Demographic insights (distribution, trends)
   - Predictive analytics (risk factors, success indicators)
   - Comparative analytics (comparisons across groups)
   - Trend analysis (over time patterns)
4. Make questions specific and actionable
5. Use the exact column names from the metadata

**OUTPUT FORMAT (JSON ONLY):**
{
  "suggestions": [
    {
      "question": "What is the average CGPA by academic stream?",
      "description": "Compare academic performance across different streams to identify strengths and areas for improvement.",
      "category": "Performance Analysis",
      "priority": "high"
    },
    {
      "question": "Which students have the highest dropout risk based on attendance and backlogs?",
      "description": "Identify at-risk students early to enable proactive intervention and support.",
      "category": "Risk Analysis",
      "priority": "high"
    }
    // ... more suggestions ...
  ]
}

Generate 10-15 diverse, high-quality analytics questions.`;

export async function generateAnalyticsSuggestions(
  metadata: DataSourceMetadata
): Promise<AnalyticsSuggestionsResponse> {
  const prompt = ANALYTICS_SUGGESTIONS_PROMPT.replace(
    '{DATA_SOURCE_METADATA}',
    JSON.stringify(metadata, null, 2)
  );

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: 'You are an expert education data analyst. Generate insightful, actionable analytics questions based on the provided data schema. Always return valid JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from LLM');
  }

  return JSON.parse(content) as AnalyticsSuggestionsResponse;
}

