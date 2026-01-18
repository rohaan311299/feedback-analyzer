# Cloudflare Feedback Analyzer

AI-powered multi-source feedback aggregation and analysis system built on Cloudflare's Developer Platform.

## 🎯 Overview

This application demonstrates a complete AI agent pipeline for analyzing customer feedback from multiple sources (Discord, GitHub, Support Tickets, Twitter) using Cloudflare's serverless infrastructure.

### Architecture

```
Data Sources → Workers (Ingestion) → D1 (Storage) → Workflows (Orchestration)
                                                           ↓
                                    AI Agents ← Workers AI (LLM)
                                         ↓
                              Per-Source Analysis
                                         ↓
                              Cross-Source Aggregation
                                         ↓
                              Dashboard (Visualization)
```

## 🏗️ Cloudflare Products Used

1. **Workers** - Serverless compute for API endpoints and frontend
2. **D1 Database** - SQL database for structured feedback storage
3. **Workers AI** - LLM inference for sentiment analysis and summarization
4. **Workflows** - Multi-step stateful orchestration for AI agent pipeline

### Why These Products?

- **Workers**: Fast, globally distributed API and UI hosting
- **D1**: Perfect for structured feedback with SQL queries
- **Workers AI**: On-demand AI inference without external API costs
- **Workflows**: Orchestrates complex multi-step AI pipeline with state management

## 🚀 Quick Start

### 1. Create the Project

```bash
npm create cloudflare@latest feedback-analyzer
# Choose: "Hello World" Worker
# Choose: TypeScript
# Choose: Yes to Git

cd feedback-analyzer
```

### 2. Copy Project Files

Copy all the provided files into your project:
- `src/index.ts` - Main Worker
- `src/workflow.ts` - AI agent pipeline
- `src/schema.sql` - Database schema
- `wrangler.toml` - Configuration
- `package.json` - Dependencies
- `tsconfig.json` - TypeScript config

### 3. Install Dependencies

```bash
npm install
```

### 4. Create D1 Database

```bash
# Create the database
npx wrangler d1 create feedback_db

# Copy the output database_id and update wrangler.toml
# Replace YOUR_DATABASE_ID_HERE with your actual database ID
```

### 5. Initialize Database Schema

```bash
# Local development
npx wrangler d1 execute feedback_db --local --file=./src/schema.sql

# Production (after first deploy)
npx wrangler d1 execute feedback_db --remote --file=./src/schema.sql
```

### 6. Run Locally

```bash
npm run dev
# Visit http://localhost:8787
```

### 7. Deploy to Cloudflare

```bash
npm run deploy
```

Your app will be live at: `https://feedback-analyzer.YOUR_ACCOUNT.workers.dev`

## 📊 How It Works

### Multi-Agent AI Pipeline

The system uses Cloudflare Workflows to orchestrate a sophisticated multi-step AI pipeline:

#### Step 1: Data Ingestion
- Receives feedback from multiple sources via API
- Mock data generator included for testing

#### Step 2: Data Cleaning
- Normalizes text
- Removes duplicates
- Extracts metadata

#### Step 3: Sentiment Analysis
- Uses `@cf/huggingface/distilbert-sst-2-int8` model
- Classifies each feedback item as POSITIVE/NEGATIVE/NEUTRAL
- Stores results in D1

#### Step 4: Per-Source Analysis (Agent 1)
- Uses `@cf/meta/llama-3-8b-instruct` LLM
- Generates summaries for each source
- Extracts themes and trends
- Calculates sentiment breakdowns

#### Step 5: Cross-Source Aggregation (Agent 2)
- Combines insights from all sources
- Identifies common themes
- Highlights urgent items
- Generates overall summary

#### Step 6: Dashboard Visualization
- Real-time dashboard with Charts
- Sentiment distribution
- Theme analysis
- Recent feedback timeline

## 🎮 Using the Dashboard

1. **Seed Mock Data** - Click to populate database with sample feedback
2. **Run AI Analysis** - Triggers the Workflows-based AI pipeline
3. **View Results** - See aggregated insights, per-source summaries, and sentiment trends

## 🔧 API Endpoints

### POST /api/ingest
Ingest new feedback
```json
{
  "source": "discord",
  "content": "The new feature is amazing!",
  "metadata": {}
}
```

### POST /api/seed-mock-data
Populate database with mock feedback

### POST /api/analyze
Trigger AI analysis workflow
```json
{
  "source": "discord"  // optional: analyze specific source
}
```

### GET /api/feedback
List all feedback items

### GET /api/summary
Get aggregated insights and per-source summaries

### GET /api/stats
Get system statistics

### GET /api/analysis/:source
Get analysis for specific source

## 📝 Database Schema

### Tables

- **feedback** - Raw feedback entries
- **sentiment_analysis** - Sentiment scores per feedback
- **source_summaries** - Per-source AI summaries
- **aggregated_insights** - Cross-source insights

## 🧪 Testing the System

1. Click "Seed Mock Data" to add 16 sample feedback items
2. Click "Run AI Analysis" to start the Workflow
3. Wait 10-30 seconds for AI processing
4. Click "Refresh Dashboard" to see results

## 🔍 Monitoring

```bash
# View real-time logs
npm run tail

# Check workflow status in Cloudflare Dashboard
# Navigate to: Workers & Pages → feedback-analyzer → Workflows
```

## 🎨 Customization

### Add More Data Sources

Edit `generateMockFeedback()` in `src/index.ts`:
```typescript
const sources = ['discord', 'github', 'support', 'twitter', 'slack', 'email'];
```

### Use Different AI Models

Edit `src/workflow.ts`:
```typescript
// Sentiment: Try different models
'@cf/huggingface/distilbert-sst-2-int8'
'@cf/meta/llama-3-8b-instruct'

// Summarization: Upgrade to larger models
'@cf/meta/llama-3-70b-instruct' // More capable
```

### Add Real Integrations

Replace mock data with real API calls:
- Discord Webhooks
- GitHub API
- Zendesk API
- Twitter API v2

## 📦 Optional Enhancements

### Add Vectorize for Semantic Search

Uncomment in `wrangler.toml`:
```toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "feedback-embeddings"
```

### Add Queues for Async Processing

Uncomment in `wrangler.toml`:
```toml
[[queues.producers]]
binding = "FEEDBACK_QUEUE"
queue = "feedback-ingestion"
```

### Add KV for Caching

Uncomment in `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "CACHE"
id = "YOUR_KV_ID_HERE"
```

## 🐛 Troubleshooting

### Database not found
```bash
# Make sure you created D1 database
npx wrangler d1 create feedback_db

# Update wrangler.toml with database_id
```

### Workflow not triggering
```bash
# Check Workflows are enabled in your account
# View workflow runs in dashboard: Workers & Pages → Workflows
```

### AI models not working
```bash
# Workers AI requires paid Workers plan
# Check your account has AI access enabled
```

## 📚 Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [D1 Database Docs](https://developers.cloudflare.com/d1/)
- [Workers AI Docs](https://developers.cloudflare.com/workers-ai/)
- [Workflows Docs](https://developers.cloudflare.com/workflows/)

## 🎯 Assignment Deliverables

### Architecture Screenshot
Take a screenshot of: Dashboard → Workers & Pages → feedback-analyzer → Settings → Bindings

### GitHub Repository
Push code to GitHub:
```bash
git init
git add .
git commit -m "Initial commit: Cloudflare Feedback Analyzer"
git remote add origin YOUR_REPO_URL
git push -u origin main
```

### Demo Link
Your deployed Worker URL:
```
https://feedback-analyzer.YOUR_ACCOUNT.workers.dev
```

## 💡 Key Features for Assignment

✅ **Multi-source aggregation** - Discord, GitHub, Support, Twitter
✅ **AI-powered analysis** - Sentiment + Summarization
✅ **Multi-agent pipeline** - Per-source → Cross-source agents
✅ **Clean architecture** - Workflows orchestration
✅ **4+ Cloudflare products** - Workers, D1, AI, Workflows
✅ **Production-ready** - Error handling, monitoring, scalable design
✅ **Beautiful UI** - TailwindCSS dashboard with charts

## 📄 License

MIT