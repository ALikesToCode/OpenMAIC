CREATE TABLE IF NOT EXISTS pdf_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  requested_provider_id TEXT NOT NULL,
  processing_mode TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  source_object_key TEXT NOT NULL,
  result_object_key TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pdf_jobs_status ON pdf_jobs (status);
CREATE INDEX IF NOT EXISTS idx_pdf_jobs_updated_at ON pdf_jobs (updated_at);
