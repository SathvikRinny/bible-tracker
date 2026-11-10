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

  // Reading order. Already-read chapters sit in their natural place;
  // only unread chapters matter to the scheduler.
  var orderKeys = []
    .concat(keysBetween('Gen', 'Deut'))      // Genesis–Deuteronomy (Deut 16–34 is "today")
    .concat(['Ps'])                          // Psalms (21–150 still to read)
    .concat(keysBetween('Prov', 'Song'))     // Proverbs, Ecclesiastes, Song of Songs
    .concat(keysBetween('Isa', 'Dan'))       // Major prophets
    .concat(keysBetween('Hos', 'Mal'))       // Minor prophets
    .concat(keysBetween('Josh', 'Esth'))     // History books
    .concat(['Job'])
    .concat(keysBetween('Matt', 'Rev'));     // New Testament

  var order = [];
  orderKeys.forEach(function (key) {
    range(1, byKey[key].chapters).forEach(function (ch) { order.push(chapterId(key, ch)); });
  });

  // Chapters treated as already read when the tracker is first opened.
  var preDone = [];
  keysBetween('Gen', 'Num').forEach(function (key) {
    range(1, byKey[key].chapters).forEach(function (ch) { preDone.push(chapterId(key, ch)); });
  });
  range(1, 15).forEach(function (ch) { preDone.push(chapterId('Deut', ch)); });
  range(1, 20).forEach(function (ch) { preDone.push(chapterId('Ps', ch)); });
  // Gospels and Acts were finished in the earlier plan.
  var gospelsActs = [];
  keysBetween('Matt', 'Acts').forEach(function (key) {
    range(1, byKey[key].chapters).forEach(function (ch) { gospelsActs.push(chapterId(key, ch)); });
  });
  preDone = preDone.concat(gospelsActs);

  return {
    books: books,
    byKey: byKey,
    order: order,
    preDone: preDone,
    gospelsActs: gospelsActs,
    total: order.length,
    chapterId: chapterId,
    parseId: parseId
  };
});
