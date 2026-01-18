// workflow.ts - Multi-step AI Agent Pipeline using Cloudflare Workflows

import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

interface Env {
  AI: Ai;
  DB: D1Database;
}

interface FeedbackItem {
  id: number;
  source: string;
  content: string;
  cleaned_content: string;
}

interface SentimentResult {
  label: string;
  score: number;
}

interface SourceAnalysis {
  source: string;
  summary: string;
  themes: string[];
  sentimentBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

export class FeedbackWorkflow extends WorkflowEntrypoint<Env, { source?: string }> {
  async run(event: WorkflowEvent<{ source?: string }>, step: WorkflowStep) {
    // Step 1: Fetch unprocessed feedback
    const feedback = await step.do('fetch-feedback', async () => {
      const query = event.payload.source
        ? 'SELECT * FROM feedback WHERE source = ? AND processed = FALSE'
        : 'SELECT * FROM feedback WHERE processed = FALSE';
      
      const params = event.payload.source ? [event.payload.source] : [];
      const result = await this.env.DB.prepare(query).bind(...params).all();
      
      return result.results as unknown as FeedbackItem[];
    });

    if (feedback.length === 0) {
      return { status: 'no_feedback', message: 'No unprocessed feedback found' };
    }

    // Step 2: Clean and normalize data
    const cleanedFeedback = await step.do('clean-data', async () => {
      return feedback.map(item => ({
        ...item,
        cleaned_content: this.cleanText(item.content)
      }));
    });

    // Step 3: Perform sentiment analysis on each item
    const sentimentResults = await step.do('sentiment-analysis', async () => {
      const results = [];
      for (const item of cleanedFeedback) {
        try {
            const sentimentResponse = await this.env.AI.run('@cf/huggingface/distilbert-sst-2-int8', {
                text: item.cleaned_content.slice(0, 512)
              }) as unknown as { label: string; score: number }[];
              
              const sentiment = sentimentResponse[0];

          results.push({
            feedbackId: item.id,
            sentiment: sentiment.label,
            score: sentiment.score
          });

          // Store sentiment in DB
          await this.env.DB.prepare(
            'INSERT INTO sentiment_analysis (feedback_id, sentiment, score) VALUES (?, ?, ?)'
          ).bind(item.id, sentiment.label, sentiment.score).run();
        } catch (error) {
          console.error(`Error analyzing sentiment for item ${item.id}:`, error);
        }
      }
      return results;
    });

    // Step 4: Agent 1 - Per-source summarization
    const sourceSummaries = await step.do('per-source-summary', async () => {
      const sources = [...new Set(cleanedFeedback.map(f => f.source))];
      const summaries: SourceAnalysis[] = [];

      for (const source of sources) {
        const sourceFeedback = cleanedFeedback.filter(f => f.source === source);
        const combinedText = sourceFeedback.map(f => f.cleaned_content).join('\n\n');

        try {
          const prompt = `Analyze the following customer feedback from ${source}:

${combinedText}

Provide:
1. A brief summary (2-3 sentences)
2. Top 3-5 themes or issues
3. Overall sentiment

Format your response as JSON:
{
  "summary": "...",
  "themes": ["theme1", "theme2", ...],
  "sentiment": "positive/negative/mixed"
}`;

          const response = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 512
          }) as { response: string };

          const analysis = this.parseAIResponse(response.response);
          
          // Calculate sentiment breakdown
          const sourcesentiments = sentimentResults.filter(s => 
            sourceFeedback.some(f => f.id === s.feedbackId)
          );
          
          const sentimentBreakdown = {
            positive: sourcesentiments.filter(s => s.sentiment === 'POSITIVE').length,
            negative: sourcesentiments.filter(s => s.sentiment === 'NEGATIVE').length,
            neutral: sourcesentiments.length - sourcesentiments.filter(s => 
              s.sentiment === 'POSITIVE' || s.sentiment === 'NEGATIVE'
            ).length
          };

          const summary: SourceAnalysis = {
            source,
            summary: analysis.summary || 'Summary not available',
            themes: analysis.themes || [],
            sentimentBreakdown
          };

          summaries.push(summary);

          // Store in DB
          await this.env.DB.prepare(
            'INSERT INTO source_summaries (source, summary, themes, sentiment_breakdown) VALUES (?, ?, ?, ?)'
          ).bind(
            source,
            summary.summary,
            JSON.stringify(summary.themes),
            JSON.stringify(summary.sentimentBreakdown)
          ).run();
        } catch (error) {
          console.error(`Error summarizing ${source}:`, error);
        }
      }

      return summaries;
    });

    // Step 5: Agent 2 - Cross-source aggregation and final insights
    const finalInsights = await step.do('aggregate-insights', async () => {
      const combinedSummaries = sourceSummaries.map(s => 
        `${s.source}: ${s.summary} (Themes: ${s.themes.join(', ')})`
      ).join('\n\n');

      try {
        const prompt = `You are analyzing customer feedback from multiple sources. Here are the per-source summaries:

${combinedSummaries}

Provide a comprehensive analysis:
1. Overall summary across all sources
2. Top 5 themes that appear across multiple sources
3. Overall sentiment trend
4. Urgent items that need immediate attention

Format as JSON:
{
  "overallSummary": "...",
  "topThemes": ["theme1", "theme2", ...],
  "overallSentiment": "positive/negative/mixed",
  "urgentItems": ["item1", "item2", ...]
}`;

        const response = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024
        }) as { response: string };

        const insights = this.parseAIResponse(response.response);

        // Store aggregated insights
        await this.env.DB.prepare(
          'INSERT INTO aggregated_insights (summary, top_themes, overall_sentiment, urgent_items) VALUES (?, ?, ?, ?)'
        ).bind(
          insights.overallSummary || 'Not available',
          JSON.stringify(insights.topThemes || []),
          insights.overallSentiment || 'mixed',
          JSON.stringify(insights.urgentItems || [])
        ).run();

        return insights;
      } catch (error) {
        console.error('Error aggregating insights:', error);
        return null;
      }
    });

    // Step 6: Mark feedback as processed
    await step.do('mark-processed', async () => {
      const ids = feedback.map(f => f.id);
      const placeholders = ids.map(() => '?').join(',');
      await this.env.DB.prepare(
        `UPDATE feedback SET processed = TRUE WHERE id IN (${placeholders})`
      ).bind(...ids).run();
    });

    return {
      status: 'success',
      processedCount: feedback.length,
      sourceSummaries,
      finalInsights
    };
  }

  // Helper: Clean text
  private cleanText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s.,!?-]/g, '');
  }

  // Helper: Parse AI JSON response
  private parseAIResponse(response: string): any {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return {};
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return {};
    }
  }
}