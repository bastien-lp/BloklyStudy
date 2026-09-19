-- Shared synthesis documents: metadata + storage accounting.
-- The files themselves live in R2 (binding DOCS); this database is the single
-- source of truth for how many bytes are stored, which is what keeps the
-- bucket under its caps (see src/docs.js).

CREATE TABLE documents (
  id          TEXT PRIMARY KEY,          -- random 128-bit id (base64url)
  owner_uid   TEXT NOT NULL,             -- Firebase uid of the uploader
  name        TEXT NOT NULL,             -- display name, editable
  kind        TEXT NOT NULL,             -- pdf | image | office | text
  mime        TEXT NOT NULL,             -- decided by the worker, never the client
  file_size   INTEGER NOT NULL,          -- bytes of the file
  size        INTEGER NOT NULL,          -- bytes counted toward quotas (file + thumbnail)
  has_thumb   INTEGER NOT NULL DEFAULT 0,
  subject_id  TEXT,                      -- subjects[].id from users/{uid}/data/main
  chapter_idx INTEGER,                   -- index in subjects[].chapters
  created_at  INTEGER NOT NULL           -- epoch ms
);
CREATE INDEX idx_documents_owner ON documents (owner_uid, created_at DESC);

CREATE TABLE group_shares (
  group_id          TEXT NOT NULL,       -- Firestore groups/{id}
  doc_id            TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  shared_by         TEXT NOT NULL,
  shared_by_pseudo  TEXT NOT NULL,
  shared_at         INTEGER NOT NULL,
  PRIMARY KEY (group_id, doc_id)
);
CREATE INDEX idx_group_shares_doc ON group_shares (doc_id);
