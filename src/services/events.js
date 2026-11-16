const { EventEmitter } = require('node:events');

/** Process-wide bus that pushes live course activity to open dashboard streams (SSE). */
const events = new EventEmitter();
events.setMaxListeners(0);

const channel = (courseId) => `course:${courseId}`;

module.exports = {
  /** A verified check-in. */
  emitAttendance(courseId, record) {
    events.emit(channel(courseId), 'checkin', record);
  },
  /** A check-in blocked by the location lock. */
  emitRejection(courseId, rejection) {
    events.emit(channel(courseId), 'rejection', rejection);
  },
  /** listener(type, data) for every event on one course; returns an unsubscribe function. */
  onCourseEvent(courseId, listener) {
    events.on(channel(courseId), listener);
    return () => events.off(channel(courseId), listener);
  },
};
