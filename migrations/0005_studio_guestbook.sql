CREATE TABLE studio_guestbook (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 300),
  created INTEGER NOT NULL
);
CREATE INDEX studio_guestbook_room ON studio_guestbook(worker_id, created DESC);
CREATE INDEX studio_guestbook_author ON studio_guestbook(user_id, created DESC);
