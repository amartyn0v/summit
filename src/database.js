const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config/env');

const ensureDirectory = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

ensureDirectory(config.databasePath);

const db = new sqlite3.Database(config.databasePath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      source_url TEXT,
      file_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
});

const createSummary = ({ title, summary, sourceUrl, filePath }) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO summaries (title, summary, source_url, file_path)
      VALUES (?, ?, ?, ?)
    `;
    db.run(query, [title, summary, sourceUrl || null, filePath || null], function (err) {
      if (err) {
        reject(err);
      } else {
        getSummaryById(this.lastID)
          .then((row) => resolve(row))
          .catch(reject);
      }
    });
  });
};

const getSummaryById = (id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM summaries WHERE id = ?', [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row || null);
      }
    });
  });
};

const listSummaries = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM summaries ORDER BY created_at DESC', [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

module.exports = {
  db,
  createSummary,
  getSummaryById,
  listSummaries,
};
