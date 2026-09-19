-- Public synthesis library: documents their owners chose to publish for
-- everyone, described by subject / school / level so students from other
-- schools can find them. Publishing never copies the file: it only makes an
-- existing `documents` row readable by any signed-in user.

CREATE TABLE library_entries (
  doc_id        TEXT PRIMARY KEY REFERENCES documents (id) ON DELETE CASCADE,
  owner_uid     TEXT NOT NULL,
  author_pseudo TEXT NOT NULL,
  title         TEXT NOT NULL,
  subject       TEXT NOT NULL,            -- as typed, for display
  subject_key   TEXT NOT NULL,            -- normalized (lowercase, no accents) for filters
  school        TEXT NOT NULL DEFAULT '',
  school_key    TEXT NOT NULL DEFAULT '',
  level         TEXT NOT NULL DEFAULT '', -- secondary | y1 | y2 | y3 | master | phd | other | ''
  language      TEXT NOT NULL DEFAULT '', -- fr | en | es | de | other | ''
  description   TEXT NOT NULL DEFAULT '',
  published_at  INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  views         INTEGER NOT NULL DEFAULT 0,
  likes         INTEGER NOT NULL DEFAULT 0,
  reports       INTEGER NOT NULL DEFAULT 0,
  hidden        INTEGER NOT NULL DEFAULT 0   -- 1 = hidden by reports or an admin
);
CREATE INDEX idx_library_recent  ON library_entries (hidden, published_at DESC);
CREATE INDEX idx_library_popular ON library_entries (hidden, likes DESC, views DESC);
CREATE INDEX idx_library_school  ON library_entries (school_key);
CREATE INDEX idx_library_subject ON library_entries (subject_key);

CREATE TABLE library_likes (
  doc_id     TEXT NOT NULL REFERENCES library_entries (doc_id) ON DELETE CASCADE,
  uid        TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (doc_id, uid)
);

CREATE TABLE library_saves (
  doc_id     TEXT NOT NULL REFERENCES library_entries (doc_id) ON DELETE CASCADE,
  uid        TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (doc_id, uid)
);
CREATE INDEX idx_library_saves_uid ON library_saves (uid, created_at DESC);

CREATE TABLE library_reports (
  doc_id     TEXT NOT NULL REFERENCES library_entries (doc_id) ON DELETE CASCADE,
  uid        TEXT NOT NULL,
  reason     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (doc_id, uid)
);

-- Full-text search, accent-insensitive ("chimie" finds "Chimie", "CHIMIÉ").
-- Kept in sync by the worker (insert on publish, delete on unpublish/delete).
CREATE VIRTUAL TABLE library_fts USING fts5 (
  doc_id UNINDEXED, title, subject, school, description,
  tokenize = 'unicode61 remove_diacritics 2'
);
