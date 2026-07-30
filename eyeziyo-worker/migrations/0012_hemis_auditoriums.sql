-- University rooms (auditoriums) imported from HEMIS (/v1/data/auditorium-list).
-- HEMIS `code` is the stable unique id; building/type come embedded per room.

CREATE TABLE IF NOT EXISTS auditoriums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution_id INTEGER NOT NULL,
  hemis_code INTEGER,
  name TEXT NOT NULL,
  type_name TEXT DEFAULT '',
  building_name TEXT DEFAULT '',
  volume INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auditoriums_hemis
  ON auditoriums(institution_id, hemis_code)
  WHERE hemis_code IS NOT NULL;
