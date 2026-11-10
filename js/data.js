/* Bible book data and the custom reading order for the plan.
 * Works in the browser (window.BibleData) and in Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BibleData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // [key, name, chapters] in canonical order.
  var BOOKS = [
    ['Gen', 'Genesis', 50], ['Exod', 'Exodus', 40], ['Lev', 'Leviticus', 27],
    ['Num', 'Numbers', 36], ['Deut', 'Deuteronomy', 34], ['Josh', 'Joshua', 24],
    ['Judg', 'Judges', 21], ['Ruth', 'Ruth', 4], ['1Sam', '1 Samuel', 31],
    ['2Sam', '2 Samuel', 24], ['1Kgs', '1 Kings', 22], ['2Kgs', '2 Kings', 25],
    ['1Chr', '1 Chronicles', 29], ['2Chr', '2 Chronicles', 36], ['Ezra', 'Ezra', 10],
    ['Neh', 'Nehemiah', 13], ['Esth', 'Esther', 10], ['Job', 'Job', 42],
    ['Ps', 'Psalms', 150], ['Prov', 'Proverbs', 31], ['Eccl', 'Ecclesiastes', 12],
    ['Song', 'Song of Songs', 8], ['Isa', 'Isaiah', 66], ['Jer', 'Jeremiah', 52],
    ['Lam', 'Lamentations', 5], ['Ezek', 'Ezekiel', 48], ['Dan', 'Daniel', 12],
    ['Hos', 'Hosea', 14], ['Joel', 'Joel', 3], ['Amos', 'Amos', 9],
    ['Obad', 'Obadiah', 1], ['Jonah', 'Jonah', 4], ['Mic', 'Micah', 7],
    ['Nah', 'Nahum', 3], ['Hab', 'Habakkuk', 3], ['Zeph', 'Zephaniah', 3],
    ['Hag', 'Haggai', 2], ['Zech', 'Zechariah', 14], ['Mal', 'Malachi', 4],
    ['Matt', 'Matthew', 28], ['Mark', 'Mark', 16], ['Luke', 'Luke', 24],
    ['John', 'John', 21], ['Acts', 'Acts', 28], ['Rom', 'Romans', 16],
    ['1Cor', '1 Corinthians', 16], ['2Cor', '2 Corinthians', 13], ['Gal', 'Galatians', 6],
    ['Eph', 'Ephesians', 6], ['Phil', 'Philippians', 4], ['Col', 'Colossians', 4],
    ['1Thess', '1 Thessalonians', 5], ['2Thess', '2 Thessalonians', 3], ['1Tim', '1 Timothy', 6],
    ['2Tim', '2 Timothy', 4], ['Titus', 'Titus', 3], ['Phlm', 'Philemon', 1],
    ['Heb', 'Hebrews', 13], ['Jas', 'James', 5], ['1Pet', '1 Peter', 5],
    ['2Pet', '2 Peter', 3], ['1John', '1 John', 5], ['2John', '2 John', 1],
    ['3John', '3 John', 1], ['Jude', 'Jude', 1], ['Rev', 'Revelation', 22]
  ];

  var books = BOOKS.map(function (b, i) {
    return { key: b[0], name: b[1], chapters: b[2], index: i, testament: i < 39 ? 'ot' : 'nt' };
  });
  var byKey = {};
  books.forEach(function (b) { byKey[b.key] = b; });

  function chapterId(key, ch) { return key + '.' + ch; }
  function parseId(id) {
    var i = id.lastIndexOf('.');
    return { key: id.slice(0, i), ch: Number(id.slice(i + 1)) };
  }
  function range(from, to) {
    var out = [];
    for (var i = from; i <= to; i++) out.push(i);
    return out;
  }
  function keysBetween(a, b) {
    return books.slice(byKey[a].index, byKey[b].index + 1).map(function (x) { return x.key; });
  }

  // Reading order, taken from the earlier "What's left" plan: the books run
  // in Bible order with blocks of Psalms placed between them.
  // Each entry is [book] for the whole book or [book, from, to].
  var ORDER = [
    ['Gen'], ['Ps', 1, 17], ['Exod'], ['Lev'], ['Num'], ['Ps', 18, 34], ['Deut'],
    ['Josh'], ['Judg'], ['Ruth'], ['Ps', 35, 51],
    ['1Sam'], ['2Sam'], ['Ps', 52, 68],
    ['1Kgs'], ['2Kgs'], ['Ps', 69, 85],
    ['1Chr'], ['2Chr'], ['Ezra'], ['Neh'], ['Esth'], ['Ps', 86, 102],
    ['Job'], ['Prov'], ['Eccl'], ['Song'], ['Ps', 103, 119],
    ['Isa'], ['Jer'], ['Lam'], ['Ps', 120, 136],
    ['Ezek'], ['Dan'], ['Hos'], ['Joel'], ['Amos'], ['Obad'], ['Jonah'], ['Mic'],
    ['Nah'], ['Hab'], ['Zeph'], ['Hag'], ['Zech'], ['Mal'], ['Ps', 137, 150]
  ]
    .concat(keysBetween('Matt', 'Rev').map(function (k) { return [k]; }));  // Matthew–Acts already read

  var order = [];
  ORDER.forEach(function (seg) {
    var key = seg[0], from = seg[1] || 1, to = seg[2] || byKey[key].chapters;
    range(from, to).forEach(function (ch) { order.push(chapterId(key, ch)); });
  });

  // Chapters treated as already read when the tracker is first opened.
  var preDone = [];
  keysBetween('Gen', 'Num').forEach(function (key) {
    range(1, byKey[key].chapters).forEach(function (ch) { preDone.push(chapterId(key, ch)); });
  });
  range(1, 15).forEach(function (ch) { preDone.push(chapterId('Deut', ch)); });
  // Deuteronomy 16–34 was finished on 9 Nov, the evening before the plan.
  var deutRest = range(16, 34).map(function (ch) { return chapterId('Deut', ch); });
  range(1, 20).forEach(function (ch) { preDone.push(chapterId('Ps', ch)); });
  // Gospels and Acts were finished in the earlier plan.
  var gospelsActs = [];
  keysBetween('Matt', 'Acts').forEach(function (key) {
    range(1, byKey[key].chapters).forEach(function (ch) { gospelsActs.push(chapterId(key, ch)); });
  });
  preDone = preDone.concat(deutRest, gospelsActs);
  // Chapters added to the starting point after the first release.
  var addedLater = deutRest.concat(gospelsActs);

  return {
    books: books,
    byKey: byKey,
    order: order,
    preDone: preDone,
    addedLater: addedLater,
    total: order.length,
    chapterId: chapterId,
    parseId: parseId
  };
});
