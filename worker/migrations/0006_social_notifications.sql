-- Social notifications (group messages, private messages, friend requests):
-- each event is announced at most once. The key names the event (group +
-- message id, conversation + message id, request); a second call for the
-- same event is ignored. Rows older than two days are purged by the cron.

CREATE TABLE notify_sent (
  key  TEXT PRIMARY KEY,
  at   INTEGER NOT NULL            -- epoch ms
);
CREATE INDEX idx_notify_sent_at ON notify_sent (at);
