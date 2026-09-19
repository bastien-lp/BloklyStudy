-- Library community: comments, star ratings, followed schools.

-- Comments on a published document.
CREATE TABLE library_comments (
  id          TEXT PRIMARY KEY,               -- random id
  doc_id      TEXT NOT NULL REFERENCES library_entries (doc_id) ON DELETE CASCADE,
  uid         TEXT NOT NULL,
  pseudo      TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  reports     INTEGER NOT NULL DEFAULT 0,
  hidden      INTEGER NOT NULL DEFAULT 0      -- 1 = hidden by reports or an admin
);
CREATE INDEX idx_library_comments_doc ON library_comments (doc_id, created_at);

CREATE TABLE library_comment_reports (
  comment_id  TEXT NOT NULL REFERENCES library_comments (id) ON DELETE CASCADE,
  uid         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (comment_id, uid)
);

-- One 1–5 star rating per user and document.
CREATE TABLE library_ratings (
  doc_id      TEXT NOT NULL REFERENCES library_entries (doc_id) ON DELETE CASCADE,
  uid         TEXT NOT NULL,
  stars       INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (doc_id, uid)
);

-- Denormalised counters on the entry (recomputed from the rows on each change).
ALTER TABLE library_entries ADD COLUMN rating_sum    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE library_entries ADD COLUMN rating_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE library_entries ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0;

-- Schools a user follows (normalized key, as in library_entries.school_key).
CREATE TABLE school_follows (
  uid          TEXT NOT NULL,
  school_key   TEXT NOT NULL,
  school_label TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (uid, school_key)
);
