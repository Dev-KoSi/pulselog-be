/**
 * In-memory mock database.
 *
 * - students:   B.Sc. Psychology roster, loaded from roster.json (read-only)
 * - courses:    lecture sessions created by admins
 * - attendance: verified check-ins
 * - rejections: check-ins blocked by the location lock (shown to the lecturer)
 * - meta:       server secret that signs rotating QR codes and check-in tickets
 *
 * Courses and attendance are optionally snapshotted to backend/data/db.json so a
 * restart mid-demo keeps state. Everything goes through these functions, so moving
 * to a real database later only means re-implementing this file.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const roster = require('./roster.json');
const { indexKey } = require('../utils/indexNumber');

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

// --- Roster ------------------------------------------------------------------

const students = roster.students.map(({ indexNumber, name, program, group }) => ({ indexNumber, name, program, group }));
const studentsByKey = new Map();
roster.students.forEach((entry, i) => {
  for (const variant of [entry.indexNumber, ...(entry.aliases || [])]) {
    const key = indexKey(variant);
    const existing = studentsByKey.get(key);
    if (existing && existing !== students[i]) {
      console.warn(`[roster] ${variant} matches both ${existing.name} and ${entry.name}`);
      continue;
    }
    studentsByKey.set(key, students[i]);
  }
});

// --- Courses + attendance ----------------------------------------------------

const newSecret = () => crypto.randomBytes(32).toString('base64url');

function load() {
  const empty = { courses: [], attendance: [], rejections: [], meta: { secret: newSecret() } };
  if (!config.persist || !fs.existsSync(DATA_FILE)) return empty;
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      courses: saved.courses || [],
      attendance: saved.attendance || [],
      rejections: saved.rejections || [],
      // Kept across restarts so QR codes and in-progress check-ins survive a server reload.
      meta: { secret: saved.meta?.secret || newSecret() },
    };
  } catch (err) {
    console.warn(`[db] Could not read ${DATA_FILE} (${err.message}); starting fresh.`);
    return empty;
  }
}

const db = load();
// An env secret wins (e.g. several server instances must agree on codes).
const signingSecret = process.env.CHECKIN_SECRET || db.meta.secret;
let saveTimer = null;

function flush() {
  if (!config.persist) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function scheduleSave() {
  if (!config.persist) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}

module.exports = {
  DATA_DIR,
  flush,
  signingSecret,

  // Students (roster)
  rosterInfo: { program: roster.program, groups: roster.groups, count: students.length },
  listStudents() {
    return students;
  },
  /** Case-insensitive, slash-insensitive lookup. */
  findStudent(indexNumber) {
    return studentsByKey.get(indexKey(indexNumber)) || null;
  },

  // Courses (lecture sessions)
  listCourses() {
    return [...db.courses].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  /** Accepts either the course id or its route token. */
  findCourse(idOrToken) {
    const value = String(idOrToken).trim();
    const token = value.toUpperCase();
    return db.courses.find((c) => c.id === value || c.routeToken === token) || null;
  },
  insertCourse(course) {
    db.courses.push(course);
    scheduleSave();
    return course;
  },
  updateCourse(id, patch) {
    const course = db.courses.find((c) => c.id === id);
    if (!course) return null;
    Object.assign(course, patch);
    scheduleSave();
    return course;
  },

  // Attendance
  listAttendance(courseId) {
    return db.attendance
      .filter((r) => r.courseId === courseId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },
  countAttendance(courseId) {
    return db.attendance.reduce((n, r) => (r.courseId === courseId ? n + 1 : n), 0);
  },
  findAttendance(courseId, indexNumber) {
    return db.attendance.find((r) => r.courseId === courseId && r.indexNumber === indexNumber) || null;
  },
  insertAttendance(record) {
    db.attendance.push(record);
    scheduleSave();
    return record;
  },

  // Blocked check-in attempts (location lock), oldest first
  listRejections(courseId) {
    return db.rejections
      .filter((r) => r.courseId === courseId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  },
  insertRejection(rejection) {
    db.rejections.push(rejection);
    scheduleSave();
    return rejection;
  },
};
