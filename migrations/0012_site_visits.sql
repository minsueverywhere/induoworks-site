-- Visit counts per Korean calendar day and the hashed device IDs seen so far.
-- The site Worker also runs these idempotent statements on first use.
CREATE TABLE IF NOT EXISTS site_visit_days (
  day TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0,
  devices INTEGER NOT NULL DEFAULT 0,
  new_devices INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS site_devices (
  hash TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL
);
