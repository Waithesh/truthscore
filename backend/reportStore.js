// reportStore.js — durable storage for public /report/{videoId} pages.
//
// WHY THIS EXISTS SEPARATELY FROM THE analysisCache IN server.js:
// that Map is a 6-hour speed cache to save Gemini/YouTube quota on repeat
// scans — it's *designed* to expire and it's gone on every restart. A
// public, shareable, crawlable URL needs a record that doesn't evaporate
// the moment Render restarts the free-tier instance. This is that record.
//
// HONEST LIMITATION: this writes to the Node process's local disk. That
// survives restarts and sleep/wake cycles, but on most hosts (including
// Render web services without an attached persistent disk) it is NOT
// guaranteed to survive a fresh deploy — a new deploy can start from a
// clean filesystem. That's an acceptable tradeoff for now because missing
// reports regenerate automatically on next visit (see server.js), but if
// these URLs need to be truly permanent long-term, move this to a real
// database (Postgres/Supabase, or add a Render persistent disk) instead.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'reports.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
}

function readAll() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.warn('[reportStore] reports.json unreadable, starting fresh:', e.message);
    return {};
  }
}

function writeAll(obj) {
  ensureFile();
  // Write-then-rename so a crash mid-write can't leave a half-written,
  // corrupt JSON file behind.
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, DATA_FILE);
}

function get(videoId) {
  const all = readAll();
  return all[videoId] || null;
}

function save(videoId, summary) {
  const all = readAll();
  const record = { ...summary, videoId, updatedAt: new Date().toISOString() };
  if (!all[videoId]) record.createdAt = record.updatedAt;
  else record.createdAt = all[videoId].createdAt || record.updatedAt;
  all[videoId] = record;
  writeAll(all);
  return record;
}

function listSlugs() {
  return Object.keys(readAll());
}

module.exports = { get, save, listSlugs };
