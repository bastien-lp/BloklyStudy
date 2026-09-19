-- Push notifications: device subscriptions, preferences, and the schedule the
-- app computes (the worker never reads study data itself).

CREATE TABLE push_subscriptions (
  endpoint    TEXT PRIMARY KEY,             -- push service URL (unique per device/browser)
  uid         TEXT NOT NULL,
  p256dh      TEXT NOT NULL,                -- device public key (base64url)
  auth        TEXT NOT NULL,                -- device auth secret (base64url)
  lang        TEXT NOT NULL DEFAULT 'fr',
  created_at  INTEGER NOT NULL,
  last_ok_at  INTEGER
);
CREATE INDEX idx_push_subscriptions_uid ON push_subscriptions (uid);

-- One JSON blob of preferences per user, shared by all their devices.
CREATE TABLE notification_prefs (
  uid         TEXT PRIMARY KEY,
  prefs       TEXT NOT NULL,
  lang        TEXT NOT NULL DEFAULT 'fr',
  updated_at  INTEGER NOT NULL
);

-- Reminders computed by the app (already translated), sent by the cron trigger.
CREATE TABLE scheduled_notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uid         TEXT NOT NULL,
  send_at     INTEGER NOT NULL,             -- epoch ms (UTC)
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  url         TEXT NOT NULL DEFAULT '',
  tag         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_scheduled_due ON scheduled_notifications (send_at);
CREATE INDEX idx_scheduled_uid ON scheduled_notifications (uid);
