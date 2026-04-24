import Database from "better-sqlite3";

const db = new Database("data.db");

db.exec(
  [
    "CREATE TABLE IF NOT EXISTS logs (",
    "id INTEGER PRIMARY KEY AUTOINCREMENT,",
    "time TEXT,",
    "up INTEGER,",
    "down INTEGER,",
    "flat INTEGER,",
    "diff INTEGER,",
    "accel INTEGER,",
    "upRatio REAL,",
    "downRatio REAL,",
    "kospi REAL,",
    "kosdaq REAL,",
    "foreignFlow REAL,",
    "instFlow REAL,",
    "indivFlow REAL",
    ");",
  ].join("\n")
);

try {
  db.exec("ALTER TABLE logs ADD COLUMN alert TEXT DEFAULT '';");
} catch {}

try {
  db.exec("ALTER TABLE logs ADD COLUMN marketTone TEXT DEFAULT '';");
} catch {}

try {
  db.exec("ALTER TABLE logs ADD COLUMN marketScore INTEGER DEFAULT 0;");
} catch {}

export default db;