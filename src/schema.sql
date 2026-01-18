-- D1 Database Schema for Feedback Analyzer

-- Raw feedback table
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    cleaned_content TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE
);

-- Sentiment analysis results
CREATE TABLE IF NOT EXISTS sentiment_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    sentiment TEXT,
    score REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (feedback_id) REFERENCES feedback(id)
);

-- Per-source summaries
CREATE TABLE IF NOT EXISTS source_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    summary TEXT NOT NULL,
    themes TEXT,
    sentiment_breakdown TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Aggregated insights
CREATE TABLE IF NOT EXISTS aggregated_insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary TEXT NOT NULL,
    top_themes TEXT,
    overall_sentiment TEXT,
    urgent_items TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_feedback_source ON feedback(source);
CREATE INDEX IF NOT EXISTS idx_feedback_processed ON feedback(processed);
CREATE INDEX IF NOT EXISTS idx_sentiment_feedback ON sentiment_analysis(feedback_id);