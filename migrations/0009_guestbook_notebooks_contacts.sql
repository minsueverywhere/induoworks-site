-- Existing guestbooks retain their shared history; newly placed notes get separate threads.
ALTER TABLE studio_guestbook ADD COLUMN board_id TEXT NOT NULL DEFAULT 'main';
ALTER TABLE studio_guestbook ADD COLUMN contact_email TEXT;
ALTER TABLE studio_guestbook ADD COLUMN contact_discord TEXT;
CREATE INDEX studio_guestbook_board ON studio_guestbook(worker_id,board_id,parent_id,created,id);
