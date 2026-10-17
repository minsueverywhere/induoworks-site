CREATE TABLE IF NOT EXISTS studio_oauth_states (
  hash TEXT PRIMARY KEY,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS studio_sessions (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_sessions_expiry ON studio_sessions(expires);
CREATE TABLE IF NOT EXISTS studio_members (
  user_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  PRIMARY KEY (user_id, worker_id)
);
CREATE TABLE IF NOT EXISTS studio_drafts (
  user_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  base_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (user_id, worker_id)
);
CREATE TABLE IF NOT EXISTS studio_proposals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  base_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','exported','rejected','published')),
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS studio_proposals_owner ON studio_proposals(user_id,worker_id,status);
