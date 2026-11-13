/* Lamp — UI layer. All scheduling lives in schedule.js; this file only
 * stores ticks, asks the scheduler for a fresh plan and draws it. */
(function () {
  'use strict';

  var BD = window.BibleData;
  var S = window.Schedule;
  var D = S.dates;

  var APP_VERSION = '7';
  var STORE_KEY = 'lamp.bible-tracker.v1';
  var DEFAULTS = { dailyTarget: 50, startDate: '2026-11-10', targetEnd: '2026-11-29', hardEnd: '2026-12-05' };
  var SESSIONS = {
    morning: { label: 'Morning', time: '6:00 – 8:00 AM' },
    evening: { label: 'Evening', time: '8:30 – 10:30 PM' }
  };

  // ?today=YYYY-MM-DD lets you preview any day (handy for checking the plan).
  var params = new URLSearchParams(location.search);
  var TODAY_OVERRIDE = D.isDate(params.get('today') || '') ? params.get('today') : null;
  function todayStr() { return TODAY_OVERRIDE || D.local(); }

  /* ---------------- State & storage ---------------- */

  var storageOk = true;
  var state = load();
  var lastToday = todayStr();
  var expanded = {};          // plan rows opened by the reader
  var openBook = null;        // key of the book shown in the dialog
  var confirmingReset = false;
  var settingsError = '';
  var lastRingPct = 0;

  function seed() {
    var read = {};
    BD.preDone.forEach(function (id) { read[id] = 'pre'; });
    return { version: 1, seed: 4, read: read, settings: Object.assign({}, DEFAULTS) };
  }

  function sanitize(obj) {
    if (!obj || typeof obj !== 'object' || !obj.read || typeof obj.read !== 'object') return null;
    var valid = {};
    BD.order.forEach(function (id) { valid[id] = true; });
    var read = {};
    Object.keys(obj.read).forEach(function (k) {
      var v = obj.read[k];
      if (valid[k] && (v === 'pre' || D.isDate(v))) read[k] = v;
    });
    var s = Object.assign({}, DEFAULTS);
    var src = obj.settings || {};
    var t = Number(src.dailyTarget);
    if (isFinite(t) && t >= 1 && t <= BD.total) s.dailyTarget = Math.round(t);
    ['startDate', 'targetEnd', 'hardEnd'].forEach(function (k) { if (D.isDate(src[k])) s[k] = src[k]; });
    if (!(s.startDate <= s.targetEnd && s.targetEnd <= s.hardEnd)) {
      s.startDate = DEFAULTS.startDate; s.targetEnd = DEFAULTS.targetEnd; s.hardEnd = DEFAULTS.hardEnd;
    }
    // Older saves did not know that Deuteronomy 16–34 and Matthew–Acts were already read.
    // These were read before the plan, even if they were ticked on a plan day,
    // so they must not count toward any day's reading.
    if (!(obj.seed >= 4)) BD.addedLater.forEach(function (id) { read[id] = 'pre'; });
    return { version: 1, seed: 4, read: read, settings: s };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = sanitize(JSON.parse(raw));
        if (parsed) return parsed;
      }
    } catch (e) { storageOk = false; }
    return seed();
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); storageOk = true; }
    catch (e) { storageOk = false; }
  }

  function plan() {
    return S.buildSchedule({ order: BD.order, read: state.read, today: todayStr(), settings: state.settings });
  }

  /* ---------------- Formatting ---------------- */

  var fmtCache = {};
  function fmtDate(s, opts) {
    var k = JSON.stringify(opts);
    var f = fmtCache[k] || (fmtCache[k] = new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: 'UTC' }, opts)));
    return f.format(new Date(D.parse(s)));
  }
  var short = function (s) { return fmtDate(s, { weekday: 'short', day: 'numeric', month: 'short' }); };
  var dayMonth = function (s) { return fmtDate(s, { day: 'numeric', month: 'short' }); };
  var weekday = function (s) { return fmtDate(s, { weekday: 'short' }); };
  var long = function (s) { return fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long' }); };
  var nf = new Intl.NumberFormat('en-GB');
  function n(x) { return nf.format(x); }
  function plural(x, one, many) { return n(x) + ' ' + (x === 1 ? one : (many || one + 's')); }
  function nameOf(key) { return BD.byKey[key].name; }
  function ranges(ids) { return S.formatRanges(ids, nameOf); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var STATUS_LABEL = {
    'on-track': 'On track', behind: 'Behind', 'over-limit': 'Over the limit', complete: 'Complete'
  };
  var KIND_LABEL = {
    done: 'Done', missed: 'Missed', today: 'Today', upcoming: 'Upcoming', spillover: 'Spillover', prestart: 'Today'
  };

  /* ---------------- Icons ---------------- */
  var ICON = {
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    lamp: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C11 10.5 13 8 16 4Z" fill="currentColor"/><path d="M4 21c4-1.5 8-1.5 12 1 4-2.5 8-2.5 12-1v6c-4-1.5-8-1.5-12 1-4-2.5-8-2.5-12-1v-6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
  };

  /* ---------------- Shared pieces ---------------- */

  function chip(id, ctx) {
    var p = BD.parseId(id);
    var on = !!state.read[id];
    return '<button type="button" class="ch" role="checkbox" aria-checked="' + on + '" data-id="' + id +
      '" data-focus="' + ctx + ':' + id + '" aria-label="' + esc(nameOf(p.key) + ' ' + p.ch) + '">' + p.ch + '</button>';
  }

  // Groups of consecutive chapters from the same book. `origin` (optional)
  // maps a chapter to the earlier day it was carried over from.
  function chapterGroups(ids, ctx, origin) {
    origin = origin || {};
    var groups = [];
    ids.forEach(function (id) {
      var key = BD.parseId(id).key, from = origin[id] || '', last = groups[groups.length - 1];
      if (last && last.key === key && last.from === from) last.ids.push(id);
      else groups.push({ key: key, from: from, ids: [id] });
    });
    return groups.map(function (g) {
      var first = BD.parseId(g.ids[0]).ch, last = BD.parseId(g.ids[g.ids.length - 1]).ch;
      var label = g.ids.length === 1 ? first : first + '–' + last;
      var tag = g.from ? ' <span class="carried">Left from ' + esc(short(g.from)) + '</span>' : '';
      return '<div class="group"><p class="group-name"><b>' + esc(nameOf(g.key)) + '</b> ' + label + tag + '</p>' +
        '<div class="chips">' + g.ids.map(function (id) { return chip(id, ctx); }).join('') + '</div></div>';
    }).join('');
  }

  function readCount(ids) { return ids.filter(function (id) { return state.read[id]; }).length; }

  function noticeFor(p) {
    var s = state.settings;
    if (p.status === 'complete') return '';
    if (p.pastHardEnd) {
      return notice('bad', 'The ' + dayMonth(s.hardEnd) + ' limit has passed',
        'All ' + plural(p.unreadCount, 'remaining chapter') + ' are on today’s list.');
    }
    if (p.overLimit) {
      return notice('bad', 'Daily target raised to ' + p.rate + ' chapters',
        'At ' + p.base + ' a day the remaining ' + n(p.need) + ' chapters would run past ' + dayMonth(s.hardEnd) +
        '. Reading ' + p.rate + ' a day keeps the finish on ' + short(p.finishDate) + '.');
    }
    if (p.status === 'behind') {
      return notice('warn', plural(p.spilloverDays, 'spillover day') + ' added',
        'At ' + p.base + ' a day you finish on ' + short(p.finishDate) + ', after the ' + dayMonth(s.targetEnd) +
        ' target. The plan still ends by ' + dayMonth(s.hardEnd) + '.');
    }
    return '';
  }
  function notice(kind, title, body) {
    return '<div class="notice ' + kind + '" role="note">' + (kind === 'info' ? ICON.info : ICON.alert) +
      '<div><strong>' + esc(title) + '</strong><span>' + esc(body) + '</span></div></div>';
  }

  function badge(kind, label) { return '<span class="badge ' + kind + '">' + esc(label) + '</span>'; }

  function dayNumber(date) {
    var s = state.settings;
    var idx = D.diff(date, s.startDate) + 1;
    var len = D.diff(s.targetEnd, s.startDate) + 1;
    if (idx < 1) return 'Before the plan';
    if (idx <= len) return 'Day ' + idx + ' of ' + len;
    return 'Spillover day ' + (idx - len);
  }

  /* ---------------- Views ---------------- */

  function viewToday(p) {
    var html = '';
    var t = p.todayEntry;
    html += '<div class="page-head"><p class="eyebrow">' + esc(dayNumber(p.today)) + '</p>' +
      '<h1 class="page-title">' + esc(long(p.today)) + '</h1></div>';

    html += noticeFor(p);

    if (p.status === 'complete') {
      html += '<section class="card celebrate">' + ICON.lamp +
        '<h2 class="card-title">The whole Bible, read</h2><p class="muted">All ' + n(p.total) +
        ' chapters are ticked. Finished on ' + esc(long(p.finishDate)) + '.</p></section>';
      return html;
    }

    var done = readCount(t.chapters);
    var total = t.chapters.length;
    var pct = total ? Math.round(done / total * 100) : 0;
    var allDone = done === total;

    html += '<section class="card today-card" aria-labelledby="todayTitle">';
    html += '<div class="card-head"><div class="today-meta">' +
      '<h2 class="card-title" id="todayTitle">' + (t.kind === 'prestart' ? 'Head start' : 'Today’s reading') + '</h2>' +
      '<p class="muted small">' + esc(ranges(t.chapters)) + '</p></div>' +
      badge(allDone ? 'done' : (t.kind === 'prestart' ? 'prestart' : 'today'), allDone ? 'Done' : (t.kind === 'prestart' ? 'Before the plan' : 'Today')) + '</div>';

    html += '<div><div class="today-count"><b class="num">' + done + '</b><span class="muted">of ' + total + ' chapters read</span></div>' +
      '<div class="bar' + (allDone ? ' good' : '') + '" style="--w:' + pct + '%" role="progressbar" aria-label="Today’s progress" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + done + '"><span></span></div></div>';

    var carried = t.carried || {};
    var carriedIds = t.chapters.filter(function (id) { return carried[id]; });
    if (carriedIds.length) {
      var byDay = {};
      carriedIds.forEach(function (id) { (byDay[carried[id]] = byDay[carried[id]] || []).push(id); });
      html += '<div class="notice info" role="note">' + ICON.info + '<div><strong>' +
        plural(carriedIds.length, 'chapter') + ' carried over</strong><span>' +
        Object.keys(byDay).sort().map(function (d) {
          return esc(ranges(byDay[d])) + ' (left from ' + esc(short(d)) + ')';
        }).join('; ') + '. They come first today, in reading order.</span></div></div>';
    }

    if (t.kind === 'prestart') {
      html += '<div class="session"><p class="muted small">The plan starts ' + esc(long(state.settings.startDate)) +
        '. Anything you don’t finish today moves to the first day automatically.</p>' + chapterGroups(t.chapters, 'today') + '</div>';
    } else {
      var half = Math.ceil(total / 2);
      [['morning', t.chapters.slice(0, half), ICON.sun], ['evening', t.chapters.slice(half), ICON.moon]].forEach(function (x) {
        var info = SESSIONS[x[0]], ids = x[1];
        if (!ids.length) return;
        html += '<div class="session" aria-label="' + info.label + ' session">' +
          '<div class="session-head"><p class="session-name">' + x[2] + info.label + ' <span class="session-time">' + info.time + '</span></p>' +
          '<span class="session-progress">' + readCount(ids) + ' / ' + ids.length + '</span></div>' +
          chapterGroups(ids, 'today', carried) + '</div>';
      });
    }

    html += '<div class="today-foot">' + (allDone
      ? '<p class="done-state">' + ICON.check + 'Today’s reading is done</p>'
      : '<p class="muted small">' + plural(total - done, 'chapter') + ' left today</p>') +
      '<button type="button" class="btn primary" data-action="mark-today"' + (allDone ? ' disabled' : '') + '>' + ICON.check + 'Mark all done</button></div>';
    html += '</section>';

    html += '<div class="mini-stats" role="list">' +
      '<div role="listitem"><b>' + n(p.unreadCount) + '</b><span>chapters left</span></div>' +
      '<div role="listitem"><b>' + p.rate + '</b><span>daily target</span></div>' +
      '<div role="listitem"><b>' + esc(dayMonth(p.finishDate)) + '</b><span>projected finish</span></div></div>';

    var next = p.upcoming.slice(0, 3);
    if (next.length) {
      html += '<section class="card next-up" aria-labelledby="nextTitle"><div class="card-head"><h2 class="section-title" id="nextTitle">Coming up</h2>' +
        '<a class="btn ghost" href="#plan">Full plan</a></div>' +
        next.map(function (d) {
          return '<div class="next-row"><span class="next-date">' + esc(short(d.date)) + '</span><span class="next-range">' + esc(ranges(d.chapters)) + '</span></div>';
        }).join('') + '</section>';
    }
    return html;
  }

  function viewProgress(p) {
    var s = state.settings;
    var pct = p.totalRead / p.total * 100;
    var R = 72, C = 2 * Math.PI * R;
    var html = '<div class="page-head"><p class="eyebrow">Dashboard</p><h1 class="page-title">Progress</h1></div>';
    html += noticeFor(p);

    html += '<section class="card"><div class="hero-progress">' +
      '<div class="ring" role="img" aria-label="' + Math.floor(pct) + ' percent of the Bible read">' +
      '<svg viewBox="0 0 168 168"><circle class="track" cx="84" cy="84" r="' + R + '"/>' +
      '<circle class="value" id="ringValue" cx="84" cy="84" r="' + R + '" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + (C * (1 - lastRingPct / 100)).toFixed(2) + '" data-target="' + (C * (1 - pct / 100)).toFixed(2) + '"/></svg>' +
      '<div class="ring-label"><b class="num">' + Math.floor(pct) + '%</b><span>read</span></div></div>' +
      '<div class="hero-copy"><div class="card-head"><p class="big num">' + n(p.totalRead) + ' <span class="muted">of ' + n(p.total) + '</span></p>' +
      badge(p.status, STATUS_LABEL[p.status]) + '</div>' +
      '<div class="bar" style="--w:' + pct.toFixed(2) + '%" role="progressbar" aria-label="Chapters read" aria-valuemin="0" aria-valuemax="' + p.total + '" aria-valuenow="' + p.totalRead + '"><span></span></div>' +
      '<p class="muted small">' + (p.status === 'complete' ? 'Every chapter is read.' : 'Target finish ' + esc(short(s.targetEnd)) + ' · hard limit ' + esc(short(s.hardEnd))) + '</p></div></div></section>';
    lastRingPct = pct;

    html += '<div class="stats">' +
      stat('Chapters left', n(p.unreadCount), plural(p.readTodayCount, 'chapter') + ' read today') +
      stat('Today’s target', p.status === 'complete' ? '—' : String(p.rate), p.overLimit ? 'raised from ' + p.base : 'chapters a day') +
      stat('Projected finish', p.status === 'complete' ? dayMonth(p.finishDate) : dayMonth(p.finishDate), p.status === 'complete' ? 'finished' : weekday(p.finishDate) + (p.finishDate > s.targetEnd ? ' · spillover' : '')) +
      stat('Days to ' + dayMonth(s.hardEnd), String(p.readingDaysLeft), 'reading days, today included') +
      '</div>';

    var st = S.streaks(state.read, p.today);
    var counts = S.countsByDate(state.read);
    var week = '';
    for (var i = 6; i >= 0; i--) {
      var d = D.add(p.today, -i);
      var c = counts[d] || 0;
      var cls = c >= p.base ? 'full' : c > 0 ? 'some' : '';
      week += '<div class="week-day' + (i === 0 ? ' is-today' : '') + '"><span class="wd">' + esc(weekday(d).slice(0, 2)) + '</span>' +
        '<span class="dot ' + cls + '" aria-label="' + esc(short(d)) + ': ' + plural(c, 'chapter') + '">' + (c || '') + '</span></div>';
    }
    html += '<section class="card" aria-labelledby="streakTitle"><div class="card-head"><h2 class="section-title" id="streakTitle">Streak</h2></div>' +
      '<div class="streak-row" style="margin-top:12px"><div><div class="streak-num"><b>' + st.current + '</b><span class="muted">' + (st.current === 1 ? 'day' : 'days') + ' in a row</span></div></div>' +
      '<p class="muted small">Best: ' + plural(st.best, 'day') + '</p></div>' +
      '<div class="week" aria-label="Last seven days">' + week + '</div>' +
      '<p class="muted small" style="margin-top:14px">A filled circle means you read at least ' + p.base + ' chapters that day.</p></section>';
    return html;
  }

  function stat(label, value, note) {
    return '<div class="stat"><span class="stat-label">' + esc(label) + '</span><span class="stat-value">' + esc(value) + '</span><span class="stat-note">' + esc(note) + '</span></div>';
  }

  function viewPlan(p) {
    var s = state.settings;
    var html = '<div class="page-head"><p class="eyebrow">Full plan</p><h1 class="page-title">Every day, rebuilt live</h1>' +
      '<p class="page-sub">Unread chapters roll forward in order. Tap a day to tick its chapters.</p></div>';
    html += noticeFor(p);
    var future = p.upcoming.length + (p.todayEntry && p.todayEntry.kind === 'today' ? 1 : 0);
    html += '<div class="plan-summary"><span><b>' + plural(future, 'reading day') + '</b> left</span>' +
      '<span>Finish <b>' + esc(short(p.finishDate)) + '</b></span><span>Pace <b>' + p.rate + '</b> a day</span>' +
      '<span>Spillover window <b>' + esc(dayMonth(D.add(s.targetEnd, 1))) + '–' + esc(dayMonth(s.hardEnd)) + '</b></span></div>';

    var rows = [];
    p.history.forEach(function (d) { rows.push({ d: d, kind: d.kind }); });
    if (p.todayEntry) rows.push({ d: p.todayEntry, kind: p.todayEntry.kind === 'prestart' ? 'prestart' : 'today' });
    p.upcoming.forEach(function (d) { rows.push({ d: d, kind: d.kind }); });

    html += '<section class="card plan-list" aria-label="Plan days">';
    var lastSection = '';
    rows.forEach(function (r) {
      var d = r.d;
      if (d.planned) { pastRow(d); return; }
      var section = r.kind === 'done' || r.kind === 'missed' ? 'Past days' : r.kind === 'spillover' ? 'Spillover · by ' + dayMonth(s.hardEnd) : 'Ahead';
      if (r.kind === 'today' || r.kind === 'prestart') section = 'Ahead';
      if (section !== lastSection) { html += '<p class="plan-section-label">' + esc(section) + '</p>'; lastSection = section; }
      var isOpen = !!expanded[d.date];
      var done = readCount(d.chapters);
      var range = d.chapters.length ? ranges(d.chapters) : 'Nothing read';
      var countTxt = r.kind === 'done' ? plural(d.chapters.length, 'chapter') + ' read'
        : r.kind === 'missed' ? 'No chapters ticked'
        : (done ? done + ' / ' : '') + plural(d.chapters.length, 'chapter');
      var bodyId = 'day-' + d.date;
      var label = KIND_LABEL[r.kind];
      if (r.kind === 'today' && done === d.chapters.length && d.chapters.length) label = 'Done';
      html += '<div class="day' + (r.kind === 'today' || r.kind === 'prestart' ? ' is-today' : '') + '">' +
        '<button type="button" class="day-btn" data-action="toggle-day" data-date="' + d.date + '" aria-expanded="' + isOpen + '" aria-controls="' + bodyId + '" data-focus="day:' + d.date + '">' +
        '<span class="day-date"><b>' + esc(dayMonth(d.date)) + '</b><span>' + esc(weekday(d.date)) + '</span></span>' +
        '<span class="day-range">' + esc(range) + (r.kind === 'today' || r.kind === 'upcoming' || r.kind === 'spillover' ? '<span class="muted">Morning 6–8 AM · Evening 8:30–10:30 PM</span>' : '') + '</span>' +
        '<span class="day-side">' + badge(label === 'Done' ? 'done' : r.kind, label) + '<span class="day-count">' + esc(countTxt) + '</span></span></button>';
      if (isOpen && d.chapters.length) {
        html += '<div class="day-body" id="' + bodyId + '">' + chapterGroups(d.chapters, 'plan-' + d.date) + '</div>';
      } else if (isOpen) {
        html += '<div class="day-body" id="' + bodyId + '"><p class="muted small">Nothing was ticked on this day. Its chapters moved forward.</p></div>';
      }
      html += '</div>';
    });
    html += '</section>';
    return html;

    function pastRow(d) {
      if (lastSection !== 'Past days') { html += '<p class="plan-section-label">Past days</p>'; lastSection = 'Past days'; }
      var isOpen = !!expanded[d.date];
      var bodyId = 'day-' + d.date;
      var inPlan = {};
      d.planned.forEach(function (id) { inPlan[id] = true; });
      var extra = d.chapters.filter(function (id) { return !inPlan[id]; });
      var readOfPlan = d.planned.length - d.left.length;
      var countTxt = d.kind === 'done' ? 'All ' + d.planned.length + ' read'
        : d.kind === 'missed' ? plural(d.left.length, 'chapter') + ' moved forward'
        : readOfPlan + ' of ' + d.planned.length + ' read \u00b7 ' + d.left.length + ' moved forward';
      if (extra.length) countTxt += ' \u00b7 ' + extra.length + ' extra';
      var label = d.kind === 'partial' ? 'Partly read' : KIND_LABEL[d.kind];
      html += '<div class="day">' +
        '<button type="button" class="day-btn" data-action="toggle-day" data-date="' + d.date + '" aria-expanded="' + isOpen + '" aria-controls="' + bodyId + '" data-focus="day:' + d.date + '">' +
        '<span class="day-date"><b>' + esc(dayMonth(d.date)) + '</b><span>' + esc(weekday(d.date)) + '</span></span>' +
        '<span class="day-range">' + esc(d.planned.length ? ranges(d.planned) : ranges(d.chapters)) +
        (d.left.length ? '<span class="muted">Not read that day: ' + esc(ranges(d.left)) + '</span>' : '') + '</span>' +
        '<span class="day-side">' + badge(d.kind, label) + '<span class="day-count">' + esc(countTxt) + '</span></span></button>';
      if (isOpen) {
        html += '<div class="day-body" id="' + bodyId + '">' +
          (d.left.length ? '<p class="muted small">Chapters not read that day moved forward to the next day, in order. Tick them here when you read them.</p>' : '') +
          chapterGroups(d.planned, 'plan-' + d.date) +
          (extra.length ? '<p class="group-name">Read ahead that day</p>' + chapterGroups(extra, 'plan-x-' + d.date) : '') + '</div>';
      }
      html += '</div>';
    }
  }

  function bookStats(b) {
    var done = 0;
    for (var i = 1; i <= b.chapters; i++) if (state.read[BD.chapterId(b.key, i)]) done++;
    return { done: done, pct: Math.round(done / b.chapters * 100) };
  }

  function viewBooks() {
    var html = '<div class="page-head"><p class="eyebrow">66 books</p><h1 class="page-title">Books</h1>' +
      '<p class="page-sub">Tap a book to tick chapters. Any chapter you tick here counts as read today.</p></div>';
    [['ot', 'Old Testament'], ['nt', 'New Testament']].forEach(function (t) {
      var list = BD.books.filter(function (b) { return b.testament === t[0]; });
      var done = 0, all = 0;
      list.forEach(function (b) { done += bookStats(b).done; all += b.chapters; });
      html += '<section aria-labelledby="h-' + t[0] + '" style="display:flex;flex-direction:column;gap:12px">' +
        '<div class="card-head"><h2 class="section-title" id="h-' + t[0] + '">' + t[1] + '</h2><span class="muted small num">' + n(done) + ' / ' + n(all) + '</span></div>' +
        '<div class="books-grid">' + list.map(function (b) {
          var st = bookStats(b);
          var cls = st.done === b.chapters ? ' complete' : st.done === 0 ? ' untouched' : '';
          return '<button type="button" class="book' + cls + '" data-action="open-book" data-book="' + b.key + '" data-focus="book:' + b.key + '" aria-label="' + esc(b.name + ', ' + st.done + ' of ' + b.chapters + ' chapters read') + '">' +
            '<span class="book-top"><span class="book-name">' + esc(b.name) + '</span><span class="book-pct">' + st.pct + '%</span></span>' +
            '<span class="bar thin' + (st.done === b.chapters ? ' good' : '') + '" style="--w:' + st.pct + '%"><span></span></span></button>';
        }).join('') + '</div></section>';
    });
    return html;
  }

  function renderBookDialog() {
    var body = document.getElementById('bookDialogBody');
    if (!openBook) { body.innerHTML = ''; return; }
    var b = BD.byKey[openBook];
    var st = bookStats(b);
    var ids = [];
    for (var i = 1; i <= b.chapters; i++) ids.push(BD.chapterId(b.key, i));
    body.innerHTML = '<div class="sheet-inner"><div class="sheet-head"><div><p class="eyebrow">' + (b.testament === 'ot' ? 'Old Testament' : 'New Testament') + '</p>' +
      '<h2 class="card-title" id="bookDialogTitle">' + esc(b.name) + '</h2><p class="muted small num">' + st.done + ' of ' + b.chapters + ' chapters read · ' + st.pct + '%</p></div>' +
      '<button type="button" class="icon-btn" data-action="close-book" aria-label="Close">' + ICON.close + '</button></div>' +
      '<div class="bar' + (st.done === b.chapters ? ' good' : '') + '" style="--w:' + st.pct + '%"><span></span></div>' +
      '<div class="chips">' + ids.map(function (id) { return chip(id, 'book'); }).join('') + '</div>' +
      '<div class="btn-row"><button type="button" class="btn primary" data-action="book-all"' + (st.done === b.chapters ? ' disabled' : '') + '>' + ICON.check + 'Mark book read</button>' +
      '<button type="button" class="btn" data-action="book-none"' + (st.done === 0 ? ' disabled' : '') + '>Clear book</button></div></div>';
  }

  function viewPrefs() {
    var s = state.settings;
    var html = '<div class="page-head"><p class="eyebrow">Settings</p><h1 class="page-title">Plan settings</h1></div>';
    if (!storageOk) html += notice('bad', 'Progress can’t be saved in this browser', 'Storage is blocked (private mode or site data turned off). Use Export to keep a copy of your progress.');
    html += '<section class="card"><form class="form" id="settingsForm" novalidate>' +
      '<div class="field"><label for="dailyTarget">Daily target</label><input id="dailyTarget" name="dailyTarget" type="number" inputmode="numeric" min="1" max="' + BD.total + '" value="' + s.dailyTarget + '">' +
      '<span class="hint">Chapters per day. The app raises it automatically only when the hard limit would be missed.</span></div>' +
      '<div class="field-row">' +
      '<div class="field"><label for="startDate">Start date</label><input id="startDate" name="startDate" type="date" value="' + s.startDate + '"></div>' +
      '<div class="field"><label for="targetEnd">Target finish</label><input id="targetEnd" name="targetEnd" type="date" value="' + s.targetEnd + '"></div>' +
      '<div class="field"><label for="hardEnd">End date (hard limit)</label><input id="hardEnd" name="hardEnd" type="date" value="' + s.hardEnd + '"></div></div>' +
      (settingsError ? '<p class="form-error" role="alert">' + esc(settingsError) + '</p>' : '') +
      '<div class="btn-row"><button type="submit" class="btn primary">Save settings</button><button type="button" class="btn ghost" data-action="defaults">Restore defaults</button></div>' +
      '</form></section>';

    html += '<section class="card settings-stack" aria-labelledby="backupTitle"><h2 class="section-title" id="backupTitle">Backup</h2>' +
      '<p class="muted small">Progress lives only in this browser. Export a JSON file to keep a copy or move to another device.</p>' +
      '<div class="btn-row"><button type="button" class="btn" data-action="export">Export JSON</button>' +
      '<button type="button" class="btn" data-action="copy">Copy JSON</button>' +
      '<label class="btn" for="importFile">Import JSON</label><input class="file-input" id="importFile" type="file" accept="application/json,.json"></div></section>';

    html += '<section class="card settings-stack" aria-labelledby="resetTitle"><h2 class="section-title" id="resetTitle">Reset</h2>' +
      (confirmingReset
        ? '<div class="confirm-box" role="alertdialog" aria-labelledby="resetQ"><p id="resetQ"><strong>Erase all ticks and settings?</strong> The tracker goes back to its starting point: Genesis to Deuteronomy, Psalms 1–20 and Matthew to Acts marked as read. Export first if you want a copy.</p>' +
          '<div class="btn-row"><button type="button" class="btn danger solid" data-action="reset-confirm" data-focus="reset-confirm">Erase and reset</button><button type="button" class="btn" data-action="reset-cancel">Cancel</button></div></div>'
        : '<p class="muted small">Start over from the original starting point.</p><div><button type="button" class="btn danger" data-action="reset" data-focus="reset">Reset progress</button></div>') +
      '</section>';
    html += '<p class="foot-note">Version ' + APP_VERSION + ' \u00b7 reading order from the earlier plan. Works offline once loaded.</p>';
    return html;
  }

  /* ---------------- Render loop ---------------- */

  var ROUTES = { today: viewToday, progress: viewProgress, plan: viewPlan, books: viewBooks, prefs: viewPrefs };
  var currentRoute = null;

  function route() {
    var h = (location.hash || '').replace('#', '');
    return ROUTES[h] ? h : 'today';
  }

  function render() {
    var r = route();
    var p = plan();
    var view = document.getElementById('view');
    var active = document.activeElement;
    var focusKey = active && active.getAttribute && active.getAttribute('data-focus');
    var inDialog = active && active.closest && active.closest('dialog');
    var changedRoute = r !== currentRoute;

    view.innerHTML = ROUTES[r](p);
    view.classList.toggle('enter', changedRoute);
    currentRoute = r;

    document.querySelectorAll('.tabs a').forEach(function (a) {
      if (a.getAttribute('data-tab') === r) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.getElementById('topDate').textContent = short(p.today) + (TODAY_OVERRIDE ? ' (preview)' : '');
    renderBookDialog();

    if (focusKey) {
      var scope = inDialog ? document.getElementById('bookDialogBody') : view;
      var el = scope.querySelector('[data-focus="' + focusKey.replace(/"/g, '') + '"]');
      if (el) el.focus({ preventScroll: true });
    }

    var ring = document.getElementById('ringValue');
    if (ring) requestAnimationFrame(function () { requestAnimationFrame(function () { ring.style.strokeDashoffset = ring.getAttribute('data-target'); }); });
  }

  function commit() { save(); render(); }

  /* ---------------- Toast with undo ---------------- */
  var toastTimer = null, undoFn = null;
  function toast(msg, undo) {
    var el = document.getElementById('toast');
    undoFn = undo || null;
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button" class="btn" data-action="undo">Undo</button>' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; undoFn = null; }, 5000);
  }

  function markMany(ids, msg) {
    var before = {};
    var today = todayStr();
    var changed = 0;
    ids.forEach(function (id) { if (!state.read[id]) { before[id] = true; state.read[id] = today; changed++; } });
    if (!changed) return;
    commit();
    toast((msg || 'Marked') + ' ' + plural(changed, 'chapter') + ' as read', function () {
      Object.keys(before).forEach(function (id) { delete state.read[id]; });
      commit();
    });
  }

  function clearMany(ids) {
    var before = {};
    ids.forEach(function (id) { if (state.read[id]) { before[id] = state.read[id]; delete state.read[id]; } });
    var count = Object.keys(before).length;
    if (!count) return;
    commit();
    toast('Cleared ' + plural(count, 'chapter'), function () {
      Object.keys(before).forEach(function (id) { state.read[id] = before[id]; });
      commit();
    });
  }

  /* ---------------- Backup ---------------- */
  function backupJSON() {
    return JSON.stringify({ app: 'lamp-bible-tracker', exportedAt: new Date().toISOString(), version: 1, seed: 4, settings: state.settings, read: state.read }, null, 2);
  }

  function doExport() {
    try {
      var blob = new Blob([backupJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bible-tracker-backup-' + todayStr() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Backup file downloaded');
    } catch (e) { toast('Download blocked here. Use Copy JSON instead.'); }
  }

  function doCopy() {
    var text = backupJSON();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Backup copied to clipboard'); }, function () { toast('Copy was blocked by the browser'); });
    } else toast('Copy isn’t available in this browser');
  }

  function doImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = null;
      try { parsed = sanitize(JSON.parse(reader.result)); } catch (e) { parsed = null; }
      if (!parsed) { toast('That file isn’t a tracker backup'); return; }
      var prev = state;
      state = parsed;
      commit();
      toast('Imported ' + plural(Object.keys(parsed.read).length, 'read chapter'), function () { state = prev; commit(); });
    };
    reader.onerror = function () { toast('Couldn’t read that file'); };
    reader.readAsText(file);
  }

  /* ---------------- Events ---------------- */
  document.addEventListener('click', function (e) {
    var chipEl = e.target.closest('.ch[data-id]');
    if (chipEl) {
      var id = chipEl.getAttribute('data-id');
      if (state.read[id]) delete state.read[id];
      else state.read[id] = todayStr();
      commit();
      return;
    }
    var act = e.target.closest('[data-action]');
    if (!act) return;
    var a = act.getAttribute('data-action');
    var p;
    switch (a) {
      case 'mark-today':
        p = plan();
        if (p.todayEntry) markMany(p.todayEntry.chapters, 'Marked');
        break;
      case 'toggle-day':
        var date = act.getAttribute('data-date');
        expanded[date] = !expanded[date];
        render();
        break;
      case 'open-book':
        openBook = act.getAttribute('data-book');
        renderBookDialog();
        var dlg = document.getElementById('bookDialog');
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
        break;
      case 'close-book':
        document.getElementById('bookDialog').close();
        break;
      case 'book-all':
      case 'book-none':
        var b = BD.byKey[openBook], ids = [];
        for (var i = 1; i <= b.chapters; i++) ids.push(BD.chapterId(b.key, i));
        if (a === 'book-all') markMany(ids, 'Marked'); else clearMany(ids);
        break;
      case 'export': doExport(); break;
      case 'copy': doCopy(); break;
      case 'reset': confirmingReset = true; render(); focusSoon('reset-confirm'); break;
      case 'reset-cancel': confirmingReset = false; render(); focusSoon('reset'); break;
      case 'reset-confirm':
        var prev = state;
        state = seed(); confirmingReset = false; settingsError = '';
        commit();
        toast('Progress reset', function () { state = prev; commit(); });
        break;
      case 'defaults':
        state.settings = Object.assign({}, DEFAULTS); settingsError = '';
        commit(); toast('Default settings restored');
        break;
      case 'undo':
        var fn = undoFn; undoFn = null;
        document.getElementById('toast').hidden = true;
        if (fn) fn();
        break;
    }
  });

  function focusSoon(key) {
    var el = document.querySelector('[data-focus="' + key + '"]');
    if (el) el.focus();
  }

  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'settingsForm') return;
    e.preventDefault();
    var f = e.target;
    var t = Math.round(Number(f.dailyTarget.value));
    var next = { dailyTarget: t, startDate: f.startDate.value, targetEnd: f.targetEnd.value, hardEnd: f.hardEnd.value };
    settingsError = '';
    if (!isFinite(t) || t < 1 || t > BD.total) settingsError = 'Daily target must be a number from 1 to ' + BD.total + '.';
    else if (!D.isDate(next.startDate) || !D.isDate(next.targetEnd) || !D.isDate(next.hardEnd)) settingsError = 'Fill in all three dates.';
    else if (!(next.startDate <= next.targetEnd && next.targetEnd <= next.hardEnd)) settingsError = 'Dates must run in order: start, then target finish, then end date.';
    if (settingsError) { render(); return; }
    state.settings = next;
    commit();
    toast('Settings saved. The plan has been rebuilt.');
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'importFile' && e.target.files && e.target.files[0]) {
      doImport(e.target.files[0]);
      e.target.value = '';
    }
  });

  var dialog = document.getElementById('bookDialog');
  dialog.addEventListener('close', function () {
    var key = openBook;
    openBook = null;
    renderBookDialog();
    var el = key && document.querySelector('[data-focus="book:' + key + '"]');
    if (el) el.focus();
  });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  window.addEventListener('hashchange', function () {
    render();
    window.scrollTo(0, 0);
    document.getElementById('view').focus({ preventScroll: true });
  });

  // A new day reschedules by itself: check the date when the app returns to
  // the foreground and once a minute while it stays open.
  function checkDay() {
    var t = todayStr();
    if (t !== lastToday) { lastToday = t; expanded = {}; render(); }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkDay(); });
  setInterval(checkDay, 60000);

  // Keep tabs in sync if the app is open in two windows.
  window.addEventListener('storage', function (e) {
    if (e.key === STORE_KEY) { state = load(); render(); }
  });

  save();
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      try { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () {}); } catch (e) { /* not available here */ }
    });
    // When a new version takes over, reload once so it shows straight away.
    var hadController = !!navigator.serviceWorker.controller;
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
  }
})();
