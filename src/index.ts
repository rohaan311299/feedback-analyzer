// index.ts - Main Cloudflare Worker

import { FeedbackWorkflow } from './workflow';

export { FeedbackWorkflow };

interface Env {
  DB: D1Database;
  AI: Ai;
  FEEDBACK_WORKFLOW: Workflow;
}

// Mock data generator
function generateMockFeedback() {
  const sources = ['discord', 'github', 'support', 'twitter'];
  const feedbackTemplates = {
    discord: [
      'The new dashboard is confusing, can\'t find where to configure DNS settings',
      'Love the speed improvements! Workers are blazing fast now',
      'Getting 524 timeout errors when deploying large workers',
      'Documentation for D1 migrations is outdated'
    ],
    github: [
      'Feature request: Add support for WebSockets in Workers',
      'Bug: wrangler dev crashes on Windows with latest version',
      'The new AI models are amazing, but rate limits are too strict',
      'Can we get better TypeScript types for bindings?'
    ],
    support: [
      'Customer complaining about slow response times in Asia region',
      'Billing issue - charged twice for same resource',
      'How do I set up custom domains for Workers? Docs unclear',
      'Need help debugging KV performance issues'
    ],
    twitter: [
      '@cloudflare your new pricing is too expensive for small projects',
      'Just deployed my first Worker, this is incredible! 🚀',
      'Why does the dashboard take so long to load?',
      'Cloudflare Pages + Workers = best combo ever'
    ]
  };

  const mockData = [];
  for (const source of sources) {
    const templates = feedbackTemplates[source as keyof typeof feedbackTemplates];
    for (const content of templates) {
      mockData.push({ source, content });
    }
  }
  return mockData;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // API Routes
      if (url.pathname === '/api/ingest' && request.method === 'POST') {
        const { source, content, metadata } = await request.json() as any;
        
        const result = await env.DB.prepare(
          'INSERT INTO feedback (source, content, metadata) VALUES (?, ?, ?)'
        ).bind(source, content, JSON.stringify(metadata || {})).run();

        return Response.json({ success: true, id: result.meta.last_row_id }, { headers: corsHeaders });
      }

      if (url.pathname === '/api/seed-mock-data' && request.method === 'POST') {
        const mockData = generateMockFeedback();
        
        for (const item of mockData) {
          await env.DB.prepare(
            'INSERT INTO feedback (source, content, metadata) VALUES (?, ?, ?)'
          ).bind(item.source, item.content, '{}').run();
        }

        return Response.json({ success: true, count: mockData.length }, { headers: corsHeaders });
      }

      if (url.pathname === '/api/feedback') {
        const result = await env.DB.prepare(
          'SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50'
        ).all();

        return Response.json(result.results, { headers: corsHeaders });
      }

      if (url.pathname === '/api/analyze' && request.method === 'POST') {
        const { source } = await request.json() as any;
        
        // Trigger the workflow
        const instance = await env.FEEDBACK_WORKFLOW.create({ params: { source } });
        
        return Response.json({ 
          success: true, 
          workflowId: instance.id,
          message: 'Analysis started. Check /api/summary for results in a few moments.'
        }, { headers: corsHeaders });
      }

      if (url.pathname === '/api/summary') {
        const insights = await env.DB.prepare(
          'SELECT * FROM aggregated_insights ORDER BY created_at DESC LIMIT 1'
        ).first();

        const sourceSummaries = await env.DB.prepare(
          'SELECT * FROM source_summaries ORDER BY created_at DESC LIMIT 10'
        ).all();

        return Response.json({
          insights: insights || null,
          sourceSummaries: sourceSummaries.results || []
        }, { headers: corsHeaders });
      }

      if (url.pathname.startsWith('/api/analysis/')) {
        const source = url.pathname.split('/').pop();
        const summary = await env.DB.prepare(
          'SELECT * FROM source_summaries WHERE source = ? ORDER BY created_at DESC LIMIT 1'
        ).bind(source).first();

        return Response.json(summary || { error: 'Not found' }, { headers: corsHeaders });
      }

      if (url.pathname === '/api/stats') {
        const totalFeedback = await env.DB.prepare('SELECT COUNT(*) as count FROM feedback').first();
        const processedFeedback = await env.DB.prepare('SELECT COUNT(*) as count FROM feedback WHERE processed = TRUE').first();
        const sentimentStats = await env.DB.prepare(`
          SELECT sentiment, COUNT(*) as count 
          FROM sentiment_analysis 
          GROUP BY sentiment
        `).all();

        return Response.json({
          total: totalFeedback?.count || 0,
          processed: processedFeedback?.count || 0,
          sentimentBreakdown: sentimentStats.results || []
        }, { headers: corsHeaders });
      }

      // Dashboard UI
      if (url.pathname === '/' || url.pathname === '') {
        return new Response(getDashboardHTML(), {
          headers: { 'Content-Type': 'text/html' }
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Error:', error);
      return Response.json({ error: String(error) }, { status: 500, headers: corsHeaders });
    }
  }
};

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare Feedback Analyzer</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-gray-50">
    <div class="min-h-screen p-8">
        <div class="max-w-7xl mx-auto">
            <!-- Header -->
            <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
                <h1 class="text-3xl font-bold text-gray-900 mb-2">Cloudflare Feedback Analyzer</h1>
                <p class="text-gray-600">AI-powered multi-source feedback aggregation and analysis</p>
            </div>

            <!-- Actions -->
            <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
                <h2 class="text-xl font-semibold mb-4">Quick Actions</h2>
                <div class="flex gap-4">
                    <button onclick="seedMockData()" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                        Seed Mock Data
                    </button>
                    <button onclick="runAnalysis()" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                        Run AI Analysis
                    </button>
                    <button onclick="loadDashboard()" class="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
                        Refresh Dashboard
                    </button>
                </div>
                <div id="status" class="mt-4 p-3 rounded hidden"></div>
            </div>

            <!-- Stats -->
            <div id="stats" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <!-- Stats will be loaded here -->
            </div>

            <!-- Insights -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div class="bg-white rounded-lg shadow-sm p-6">
                    <h2 class="text-xl font-semibold mb-4">Overall Insights</h2>
                    <div id="insights" class="text-gray-600">
                        Loading...
                    </div>
                </div>

                <div class="bg-white rounded-lg shadow-sm p-6">
                    <h2 class="text-xl font-semibold mb-4">Sentiment Distribution</h2>
                    <canvas id="sentimentChart"></canvas>
                </div>
            </div>

            <!-- Source Summaries -->
            <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
                <h2 class="text-xl font-semibold mb-4">Per-Source Analysis</h2>
                <div id="sourceSummaries" class="space-y-4">
                    Loading...
                </div>
            </div>

            <!-- Recent Feedback -->
            <div class="bg-white rounded-lg shadow-sm p-6">
                <h2 class="text-xl font-semibold mb-4">Recent Feedback</h2>
                <div id="feedback" class="space-y-2">
                    Loading...
                </div>
            </div>
        </div>
    </div>

    <script>
        let sentimentChart = null;

        async function seedMockData() {
            showStatus('Seeding mock data...', 'info');
            try {
                const response = await fetch('/api/seed-mock-data', { method: 'POST' });
                const data = await response.json();
                showStatus(\`Successfully seeded \${data.count} feedback items!\`, 'success');
                loadDashboard();
            } catch (error) {
                showStatus('Error seeding data: ' + error.message, 'error');
            }
        }

        async function runAnalysis() {
            showStatus('Starting AI analysis workflow... This may take 30-60 seconds.', 'info');
            try {
                const response = await fetch('/api/analyze', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                const data = await response.json();
                showStatus(data.message + ' Workflow ID: ' + data.workflowId, 'success');
                
                setTimeout(() => {
                    loadDashboard();
                    showStatus('Analysis complete! Dashboard updated.', 'success');
                }, 10000);
            } catch (error) {
                showStatus('Error running analysis: ' + error.message, 'error');
            }
        }

        async function loadDashboard() {
            loadStats();
            loadInsights();
            loadFeedback();
        }

        async function loadStats() {
            try {
                const response = await fetch('/api/stats');
                const data = await response.json();
                
                const statsHTML = \`
                    <div class="bg-white rounded-lg shadow-sm p-6">
                        <div class="text-sm text-gray-600">Total Feedback</div>
                        <div class="text-3xl font-bold text-gray-900">\${data.total}</div>
                    </div>
                    <div class="bg-white rounded-lg shadow-sm p-6">
                        <div class="text-sm text-gray-600">Processed</div>
                        <div class="text-3xl font-bold text-green-600">\${data.processed}</div>
                    </div>
                    <div class="bg-white rounded-lg shadow-sm p-6">
                        <div class="text-sm text-gray-600">Pending Analysis</div>
                        <div class="text-3xl font-bold text-orange-600">\${data.total - data.processed}</div>
                    </div>
                \`;
                
                document.getElementById('stats').innerHTML = statsHTML;
                
                // Update sentiment chart
                updateSentimentChart(data.sentimentBreakdown);
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        }

        async function loadInsights() {
            try {
                const response = await fetch('/api/summary');
                const data = await response.json();
                
                if (data.insights) {
                    const themes = JSON.parse(data.insights.top_themes || '[]');
                    const urgent = JSON.parse(data.insights.urgent_items || '[]');
                    
                    const insightsHTML = \`
                        <div class="space-y-4">
                            <div>
                                <h3 class="font-semibold text-gray-900 mb-2">Summary</h3>
                                <p class="text-gray-700">\${data.insights.summary}</p>
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900 mb-2">Top Themes</h3>
                                <div class="flex flex-wrap gap-2">
                                    \${themes.map(theme => \`<span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">\${theme}</span>\`).join('')}
                                </div>
                            </div>
                            <div>
                                <h3 class="font-semibold text-gray-900 mb-2">Urgent Items</h3>
                                <ul class="list-disc list-inside text-gray-700">
                                    \${urgent.map(item => \`<li>\${item}</li>\`).join('')}
                                </ul>
                            </div>
                        </div>
                    \`;
                    document.getElementById('insights').innerHTML = insightsHTML;
                } else {
                    document.getElementById('insights').innerHTML = '<p class="text-gray-500">No insights yet. Run analysis first.</p>';
                }
                
                if (data.sourceSummaries.length > 0) {
                    const summariesHTML = data.sourceSummaries.map(s => {
                        const themes = JSON.parse(s.themes || '[]');
                        const sentiment = JSON.parse(s.sentiment_breakdown || '{}');
                        
                        return \`
                            <div class="border rounded-lg p-4">
                                <div class="flex items-center justify-between mb-2">
                                    <h3 class="font-semibold text-lg capitalize">\${s.source}</h3>
                                    <span class="text-sm text-gray-500">\${new Date(s.created_at).toLocaleString()}</span>
                                </div>
                                <p class="text-gray-700 mb-3">\${s.summary}</p>
                                <div class="flex flex-wrap gap-2 mb-2">
                                    \${themes.map(theme => \`<span class="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">\${theme}</span>\`).join('')}
                                </div>
                                <div class="text-sm text-gray-600">
                                    Sentiment: 
                                    <span class="text-green-600">✓ \${sentiment.positive || 0}</span>
                                    <span class="text-red-600 ml-2">✗ \${sentiment.negative || 0}</span>
                                    <span class="text-gray-500 ml-2">○ \${sentiment.neutral || 0}</span>
                                </div>
                            </div>
                        \`;
                    }).join('');
                    document.getElementById('sourceSummaries').innerHTML = summariesHTML;
                } else {
                    document.getElementById('sourceSummaries').innerHTML = '<p class="text-gray-500">No source summaries yet.</p>';
                }
            } catch (error) {
                console.error('Error loading insights:', error);
            }
        }

        async function loadFeedback() {
            try {
                const response = await fetch('/api/feedback');
                const feedback = await response.json();
                
                const feedbackHTML = feedback.map(f => \`
                    <div class="border-l-4 \${f.processed ? 'border-green-500' : 'border-orange-500'} pl-4 py-2">
                        <div class="flex items-center justify-between">
                            <span class="font-semibold capitalize">\${f.source}</span>
                            <span class="text-xs text-gray-500">\${new Date(f.created_at).toLocaleString()}</span>
                        </div>
                        <p class="text-gray-700 text-sm mt-1">\${f.content}</p>
                    </div>
                \`).join('');
                
                document.getElementById('feedback').innerHTML = feedbackHTML || '<p class="text-gray-500">No feedback yet.</p>';
            } catch (error) {
                console.error('Error loading feedback:', error);
            }
        }

        function updateSentimentChart(data) {
            const ctx = document.getElementById('sentimentChart');
            
            const positive = data.find(d => d.sentiment === 'POSITIVE')?.count || 0;
            const negative = data.find(d => d.sentiment === 'NEGATIVE')?.count || 0;
            const neutral = data.find(d => d.sentiment === 'NEUTRAL')?.count || 0;
            
            if (sentimentChart) {
                sentimentChart.destroy();
            }
            
            sentimentChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Positive', 'Negative', 'Neutral'],
                    datasets: [{
                        data: [positive, negative, neutral],
                        backgroundColor: ['#10b981', '#ef4444', '#6b7280']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true
                }
            });
        }

        function showStatus(message, type) {
            const statusDiv = document.getElementById('status');
            statusDiv.className = \`mt-4 p-3 rounded \${
                type === 'success' ? 'bg-green-100 text-green-800' :
                type === 'error' ? 'bg-red-100 text-red-800' :
                'bg-blue-100 text-blue-800'
            }\`;
            statusDiv.textContent = message;
            statusDiv.classList.remove('hidden');
            
            if (type === 'success') {
                setTimeout(() => statusDiv.classList.add('hidden'), 5000);
            }
        }

        // Load dashboard on page load
        loadDashboard();
    </script>
</body>
</html>`;
}