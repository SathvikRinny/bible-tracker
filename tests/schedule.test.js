// Run with: node --test bible-tracker/tests
const test = require('node:test');
const assert = require('node:assert/strict');
const { order, preDone, total } = require('../js/data.js');
const { buildSchedule, streaks, formatRanges, dates } = require('../js/schedule.js');

const SETTINGS = { dailyTarget: 50, startDate: '2026-11-10', targetEnd: '2026-11-29', hardEnd: '2026-12-05' };
const names = { Deut: 'Deuteronomy', Ps: 'Psalms' };
const nameOf = (k) => names[k] || k;

function startingRead() {
  const read = {};
  preDone.forEach((id) => { read[id] = 'pre'; });
  return read;
}
function markRead(read, ids, date) { ids.forEach((id) => { read[id] = date; }); return read; }
function deutToday(read) {
  return markRead(read, order.filter((id) => /^Deut\.(1[6-9]|2\d|3[0-4])$/.test(id)), '2026-11-09');
}
const plan = (read, today, settings = SETTINGS) => buildSchedule({ order, read, today, settings });

test('data: 66 books, 1,189 chapters, each chapter once', () => {
  assert.equal(total, 1189);
  assert.equal(new Set(order).size, 1189);
  assert.equal(preDone.length, 50 + 40 + 27 + 36 + 15 + 20 + 28 + 16 + 24 + 21 + 28);
});

test('reading order follows the requested sequence', () => {
  const unread = order.filter((id) => !startingRead()[id]);
  assert.equal(unread[0], 'Deut.16');
  assert.equal(unread[19], 'Ps.21');
  const keys = [...new Set(unread.map((id) => id.split('.')[0]))];
  assert.deepEqual(keys.slice(0, 6), ['Deut', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa']);
  assert.equal(keys[keys.indexOf('Mal') + 1], 'Josh');
  assert.equal(keys[keys.indexOf('Esth') + 1], 'Job');
  assert.equal(keys[keys.indexOf('Job') + 1], 'Rom');       // Matthew–Acts already read
  assert.ok(!keys.includes('Matt') && !keys.includes('Acts'));
  assert.equal(keys[keys.length - 1], 'Rev');
});

test('eve of the plan: today shows Deuteronomy 16–34, plan starts tomorrow', () => {
  const s = plan(startingRead(), '2026-11-09');
  assert.equal(s.beforeStart, true);
  assert.equal(formatRanges(s.todayEntry.chapters, nameOf), 'Deuteronomy 16–34');
  assert.equal(s.upcoming[0].date, '2026-11-10');
  assert.equal(s.upcoming[0].chapters[0], 'Deut.16');
});

test('Deut 16–34 finished today: 865 left, finishes on 27 Nov, on track', () => {
  const s = plan(deutToday(startingRead()), '2026-11-10');
  assert.equal(s.unreadCount, 865);
  assert.equal(s.rate, 50);
  assert.equal(s.todayEntry.chapters.length, 50);
  assert.equal(s.todayEntry.chapters[0], 'Ps.21');
  assert.equal(s.finishDate, '2026-11-27');
  assert.equal(s.status, 'on-track');
  assert.equal(s.upcoming.length, 17);
  assert.equal(s.upcoming.at(-1).chapters.length, 15);
});

test('Deut 16–34 not finished: rolls into day 1, still finishes 27 Nov', () => {
  const s = plan(startingRead(), '2026-11-10');
  assert.equal(s.unreadCount, 884);
  assert.equal(s.todayEntry.chapters[0], 'Deut.16');
  assert.equal(s.finishDate, '2026-11-27');
  assert.equal(s.status, 'on-track');
  assert.equal(s.upcoming.at(-1).chapters.length, 34);
});

test('skipping a day: missed chapters roll forward with no input', () => {
  const s = plan(deutToday(startingRead()), '2026-11-11');
  assert.equal(s.history.length, 1);
  assert.equal(s.history[0].kind, 'missed');
  assert.equal(s.todayEntry.chapters[0], 'Ps.21');      // yesterday's first chapter is today's
  assert.equal(s.unreadCount, 865);
  assert.equal(s.finishDate, '2026-11-28');              // one day later, still before 29 Nov
  assert.equal(s.status, 'on-track');
  assert.ok(s.upcoming.every((d) => d.chapters.length <= 50));
});

test('skipping four days: spillover days are added after 29 Nov', () => {
  const s = plan(deutToday(startingRead()), '2026-11-14');
  assert.equal(s.history.filter((d) => d.kind === 'missed').length, 4);
  assert.equal(s.finishDate, '2026-12-01');              // 865 > 16 × 50
  assert.equal(s.status, 'behind');
  assert.equal(s.spilloverDays, 2);
});

test('reading 40 of 50: today keeps its list, the 10 left roll into tomorrow', () => {
  const read = deutToday(startingRead());
  const day1 = plan(read, '2026-11-10').todayEntry.chapters;
  markRead(read, day1.slice(0, 40), '2026-11-10');
  const same = plan(read, '2026-11-10');
  assert.deepEqual(same.todayEntry.chapters, day1, 'today’s card is stable while ticking');
  const next = plan(read, '2026-11-11');
  assert.deepEqual(next.todayEntry.chapters.slice(0, 10), day1.slice(40));
  assert.equal(next.todayEntry.chapters.length, 50);
  assert.equal(next.finishDate, '2026-11-27');           // 825 chapters fit in 17 days
  assert.equal(next.status, 'on-track');
});

test('reading 60: today shows all 60, future days rebuild from 61st chapter', () => {
  const read = deutToday(startingRead());
  const ahead = order.filter((id) => !read[id]).slice(0, 60);
  markRead(read, ahead, '2026-11-10');
  const s = plan(read, '2026-11-10');
  assert.equal(s.todayEntry.chapters.length, 60);
  assert.equal(s.upcoming[0].chapters[0], order.filter((id) => !read[id])[0]);
  assert.equal(s.unreadCount, 805);
  assert.equal(s.finishDate, '2026-11-27');
});

test('falling behind past 5 Dec: target rises just enough, end date stays 5 Dec', () => {
  const read = deutToday(startingRead());
  // Read nothing until 25 Nov: 865 chapters, 11 reading days left.
  const s = plan(read, '2026-11-25');
  assert.equal(s.overLimit, true);
  assert.equal(s.status, 'over-limit');
  assert.equal(s.rate, Math.ceil(865 / 11));             // 79
  assert.equal(s.finishDate, '2026-12-05');
  assert.ok(s.upcoming.every((d) => d.date <= '2026-12-05'));
  assert.ok(s.upcoming.some((d) => d.kind === 'spillover'));
});

test('exactly at the limit: 50 a day through 5 Dec is still allowed', () => {
  const read = deutToday(startingRead());
  const unread = order.filter((id) => !read[id]);
  markRead(read, unread.slice(0, 865 - 550), '2026-11-20'); // leave 550 for 25 Nov–5 Dec (11 days)
  const s = plan(read, '2026-11-25');
  assert.equal(s.overLimit, false);
  assert.equal(s.rate, 50);
  assert.equal(s.finishDate, '2026-12-05');
  assert.equal(s.status, 'behind');
});

test('past the hard limit: everything left is due today', () => {
  const s = plan(deutToday(startingRead()), '2026-12-07');
  assert.equal(s.pastHardEnd, true);
  assert.equal(s.todayEntry.chapters.length, 865);
  assert.equal(s.upcoming.length, 0);
});

test('unticking puts a chapter back in its place in the order', () => {
  const read = deutToday(startingRead());
  delete read['Deut.20'];
  const s = plan(read, '2026-11-10');
  assert.equal(s.todayEntry.chapters[0], 'Deut.20');
  assert.equal(s.todayEntry.chapters[1], 'Ps.21');
});

test('changing the daily target reshapes the plan', () => {
  const s = plan(deutToday(startingRead()), '2026-11-10', { ...SETTINGS, dailyTarget: 60 });
  assert.equal(s.rate, 60);
  assert.equal(s.finishDate, dates.add('2026-11-10', Math.ceil(865 / 60) - 1));
});

test('finishing everything marks the plan complete', () => {
  const read = {};
  order.forEach((id) => { read[id] = '2026-11-20'; });
  const s = plan(read, '2026-11-21');
  assert.equal(s.status, 'complete');
  assert.equal(s.todayEntry, null);
});

test('streaks count consecutive reading days', () => {
  const read = { 'Ps.21': '2026-11-10', 'Ps.22': '2026-11-11', 'Ps.23': '2026-11-12', 'Ps.24': '2026-11-14' };
  assert.deepEqual(streaks(read, '2026-11-14'), { current: 1, best: 3 });
  assert.deepEqual(streaks(read, '2026-11-13'), { current: 3, best: 3 });
  assert.deepEqual(streaks(read, '2026-11-16'), { current: 0, best: 3 });
});
