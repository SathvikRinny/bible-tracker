/* Pure scheduling logic. No DOM, no storage: given the reading order,
 * what has been read (and when), today's date and the settings, it
 * rebuilds the whole plan. Works in the browser (window.Schedule) and Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Schedule = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 86400000;

  /* Dates are plain "YYYY-MM-DD" strings in the reader's local calendar.
   * Arithmetic runs in UTC so daylight-saving changes never shift a day. */
  var dates = {
    isDate: function (s) {
      return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(dates.parse(s));
    },
    parse: function (s) {
      var p = s.split('-').map(Number);
      return Date.UTC(p[0], p[1] - 1, p[2]);
    },
    fmt: function (t) { return new Date(t).toISOString().slice(0, 10); },
    add: function (s, n) { return dates.fmt(dates.parse(s) + n * DAY); },
    diff: function (a, b) { return Math.round((dates.parse(a) - dates.parse(b)) / DAY); },
    local: function (d) {
      d = d || new Date();
      var m = d.getMonth() + 1, day = d.getDate();
      return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
    }
  };

  function keyOf(id) { return id.slice(0, id.lastIndexOf('.')); }
  function chOf(id) { return Number(id.slice(id.lastIndexOf('.') + 1)); }

  /**
   * Rebuild the plan.
   * @param {object} o
   * @param {string[]} o.order     every chapter id in reading order
   * @param {object}   o.read      id -> "YYYY-MM-DD" (day it was ticked) or "pre" (read before the plan)
   * @param {string}   o.today     "YYYY-MM-DD"
   * @param {object}   o.settings  { dailyTarget, startDate, targetEnd, hardEnd }
   */
  function buildSchedule(o) {
    var order = o.order, read = o.read || {}, today = o.today, s = o.settings;
    var base = Math.max(1, Math.round(Number(s.dailyTarget)) || 50);

    var unread = order.filter(function (id) { return !read[id]; });
    var readToday = order.filter(function (id) { return read[id] === today; });
    var totalRead = order.length - unread.length;

    // Past days: what was actually read on each day since the plan started.
    var byDate = {};
    order.forEach(function (id) {
      var v = read[id];
      if (v && v !== 'pre') (byDate[v] = byDate[v] || []).push(id);
    });
    var history = [];
    for (var d = s.startDate; d < today; d = dates.add(d, 1)) {
      var got = byDate[d] || [];
      history.push({ date: d, chapters: got, kind: got.length ? 'done' : 'missed' });
    }

    var beforeStart = today < s.startDate;
    var planStart = beforeStart ? s.startDate : today;
    var daysToHard = dates.diff(s.hardEnd, planStart) + 1;   // reading days left, inclusive
    var usableDays = Math.max(1, daysToHard);

    // Chapters that still have to be covered from planStart onward.
    // Chapters already ticked today count toward today's quota.
    var need = unread.length + (beforeStart ? 0 : readToday.length);
    var rate = base;
    var overLimit = false;
    if (need > base * usableDays) {
      rate = Math.ceil(need / usableDays);
      overLimit = true;
    }

    var queue = unread.slice();
    var todayEntry;
    if (unread.length === 0 && !readToday.length) {
      todayEntry = null;
    } else if (beforeStart) {
      // Before the plan: show what is left of the book in progress
      // (Deuteronomy on the eve of the plan), plus anything ticked today.
      var currentKey = unread.length ? keyOf(unread[0]) : null;
      var pre = order.filter(function (id) {
        return read[id] === today || (!read[id] && keyOf(id) === currentKey);
      });
      todayEntry = { date: today, chapters: pre, kind: 'prestart', target: pre.length };
    } else {
      var fill = Math.max(0, rate - readToday.length);
      var take = queue.splice(0, fill);
      var set = {};
      readToday.concat(take).forEach(function (id) { set[id] = true; });
      todayEntry = {
        date: today,
        chapters: order.filter(function (id) { return set[id]; }),
        kind: 'today',
        target: rate
      };
    }

    // Future days, filled to the rate in reading order.
    var upcoming = [];
    var day = beforeStart ? s.startDate : dates.add(today, 1);
    while (queue.length) {
      upcoming.push({
        date: day,
        chapters: queue.splice(0, rate),
        kind: day > s.targetEnd ? 'spillover' : 'upcoming',
        target: rate
      });
      day = dates.add(day, 1);
    }

    var status, finishDate;
    if (unread.length === 0) {
      status = 'complete';
      var last = null;
      order.forEach(function (id) { var v = read[id]; if (v && v !== 'pre' && (!last || v > last)) last = v; });
      finishDate = last || today;
    } else {
      finishDate = upcoming.length ? upcoming[upcoming.length - 1].date : today;
      if (overLimit) status = 'over-limit';
      else if (finishDate > s.targetEnd) status = 'behind';
      else status = 'on-track';
    }

    var spilloverDays = upcoming.filter(function (x) { return x.kind === 'spillover'; }).length;
    if (todayEntry && todayEntry.kind === 'today' && today > s.targetEnd) spilloverDays += 1;

    return {
      today: today,
      beforeStart: beforeStart,
      history: history,
      todayEntry: todayEntry,
      upcoming: upcoming,
      base: base,
      rate: rate,
      overLimit: overLimit,
      pastHardEnd: today > s.hardEnd && unread.length > 0,
      status: status,
      finishDate: finishDate,
      unreadCount: unread.length,
      totalRead: totalRead,
      total: order.length,
      readTodayCount: readToday.length,
      need: need,
      spilloverDays: spilloverDays,
      readingDaysLeft: Math.max(0, dates.diff(s.hardEnd, today) + 1)
    };
  }

  /* Streaks: a day counts when at least one chapter was ticked on it. */
  function streaks(read, today) {
    var set = {};
    Object.keys(read).forEach(function (id) { var v = read[id]; if (v && v !== 'pre') set[v] = true; });
    var current = 0;
    var d = set[today] ? today : dates.add(today, -1);
    while (set[d]) { current++; d = dates.add(d, -1); }
    var days = Object.keys(set).sort();
    var best = 0, run = 0, prev = null;
    days.forEach(function (x) {
      run = prev && dates.diff(x, prev) === 1 ? run + 1 : 1;
      if (run > best) best = run;
      prev = x;
    });
    return { current: current, best: best };
  }

  function countsByDate(read) {
    var out = {};
    Object.keys(read).forEach(function (id) { var v = read[id]; if (v && v !== 'pre') out[v] = (out[v] || 0) + 1; });
    return out;
  }

  /* Group ids into runs of consecutive chapters of the same book. */
  function runs(ids) {
    var out = [];
    ids.forEach(function (id) {
      var key = keyOf(id), ch = chOf(id), last = out[out.length - 1];
      if (last && last.key === key && ch === last.to + 1) { last.to = ch; last.ids.push(id); }
      else out.push({ key: key, from: ch, to: ch, ids: [id] });
    });
    return out;
  }

  /* "Deuteronomy 16–34 · Psalms 21–51" */
  function formatRanges(ids, nameOf) {
    var parts = [];
    runs(ids).forEach(function (r) {
      var txt = r.from === r.to ? String(r.from) : r.from + '–' + r.to;
      var last = parts[parts.length - 1];
      if (last && last.key === r.key) last.txt.push(txt);
      else parts.push({ key: r.key, txt: [txt] });
    });
    return parts.map(function (p) { return nameOf(p.key) + ' ' + p.txt.join(', '); }).join(' · ');
  }

  /* Consecutive ids of the same book, for chapter grids. */
  function groupByBook(ids) {
    var out = [];
    ids.forEach(function (id) {
      var key = keyOf(id), last = out[out.length - 1];
      if (last && last.key === key) last.ids.push(id);
      else out.push({ key: key, ids: [id] });
    });
    return out;
  }

  return {
    dates: dates,
    buildSchedule: buildSchedule,
    streaks: streaks,
    countsByDate: countsByDate,
    formatRanges: formatRanges,
    groupByBook: groupByBook,
    runs: runs
  };
});
