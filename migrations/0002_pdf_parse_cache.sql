CREATE TABLE IF NOT EXISTS pdf_parse_cache (
  cache_key TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  processing_mode TEXT NOT NULL,
  backend_key TEXT NOT NULL,
  result_object_key TEXT NOT NULL,
  parser TEXT,
  page_count INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pdf_parse_cache_content_hash
  ON pdf_parse_cache (content_hash);

CREATE INDEX IF NOT EXISTS idx_pdf_parse_cache_updated_at
  ON pdf_parse_cache (updated_at);
