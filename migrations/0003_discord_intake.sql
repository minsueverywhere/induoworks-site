CREATE TABLE IF NOT EXISTS studio_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size>0 AND size<=8388608),
  kind TEXT NOT NULL CHECK(kind IN ('image','music')),
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'receiving' CHECK(status IN ('receiving','pending','publishing','published','rejected','failed','expired')),
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_uploads_status ON studio_uploads(status,expires);
CREATE TABLE IF NOT EXISTS studio_upload_chunks (
  upload_id TEXT NOT NULL REFERENCES studio_uploads(id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  PRIMARY KEY(upload_id,part)
);
