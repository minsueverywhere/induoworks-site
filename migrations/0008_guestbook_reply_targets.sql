ALTER TABLE studio_guestbook ADD COLUMN reply_to_id TEXT;
CREATE TABLE studio_guestbook_cooldowns (user_id TEXT PRIMARY KEY,last_created INTEGER NOT NULL);
INSERT INTO studio_guestbook_cooldowns(user_id,last_created) SELECT user_id,MAX(created) FROM studio_guestbook GROUP BY user_id;
CREATE TRIGGER studio_guestbook_cooldown_insert AFTER INSERT ON studio_guestbook BEGIN
  INSERT INTO studio_guestbook_cooldowns(user_id,last_created) VALUES(NEW.user_id,NEW.created)
  ON CONFLICT(user_id) DO UPDATE SET last_created=MAX(last_created,excluded.last_created);
END;
