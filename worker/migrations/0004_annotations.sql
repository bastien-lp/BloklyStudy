-- Private highlights and notes on PDF documents, linkable to a chapter.
-- Each row belongs to ONE reader (uid), even on a shared or library document.

CREATE TABLE doc_annotations (
  id          TEXT PRIMARY KEY,
  doc_id      TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  uid         TEXT NOT NULL,
  page        INTEGER NOT NULL,              -- 1-based
  rects       TEXT NOT NULL,                 -- JSON [[x, y, w, h], …] as fractions of the page
  quote       TEXT NOT NULL DEFAULT '',      -- the highlighted text
  color       TEXT NOT NULL,                 -- yellow | green | pink | blue
  note        TEXT NOT NULL DEFAULT '',
  subject_id  TEXT,                          -- chapter link (subjects[].id)
  chapter_idx INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_annotations_doc ON doc_annotations (uid, doc_id, page);
CREATE INDEX idx_annotations_chapter ON doc_annotations (uid, subject_id, chapter_idx);
