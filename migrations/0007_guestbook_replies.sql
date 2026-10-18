ALTER TABLE studio_guestbook ADD COLUMN parent_id TEXT;
ALTER TABLE studio_guestbook ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
CREATE INDEX studio_guestbook_thread ON studio_guestbook(worker_id,parent_id,created);
