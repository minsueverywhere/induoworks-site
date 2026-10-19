CREATE TABLE studio_worker_profiles (
  worker_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 100),
  updated INTEGER NOT NULL
);
