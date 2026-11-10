# Lamp: Bible Reading Tracker

A single-page, offline-capable web app for a Bible reading plan that
reschedules itself. Ticking chapters is the only input. Every tick, untick
and new day rebuilds the plan from the chapters still unread.

Plain HTML, CSS and JavaScript. There is no backend and no build step.

## The plan

- **Already read:** Genesis to Deuteronomy 15, Psalms 1–20, and Matthew to
  Acts (finished in an earlier plan). That is 305 of 1,189 chapters.
- **Order:** Deuteronomy 16–34, then Psalms 21–150, Proverbs, Ecclesiastes,
  Song of Songs, Isaiah, Jeremiah, Lamentations, Ezekiel, Daniel, Hosea to
  Malachi, Joshua to Esther, Job, then Romans to Revelation.
- **Starts** Tue 10 Nov 2026. Each day has a morning session (6–8 AM) and an
  evening session (8:30–10:30 PM).
- **Pace:** 50 chapters a day, aiming to finish on 29 Nov. If that doesn't fit,
  spillover days are added from 30 Nov to 5 Dec.
- **Hard limit:** 5 Dec. If the chapters left won't fit by then at 50 a day, the
  daily target goes up just enough to finish on 5 Dec, and a notice says so.

## How the scheduling works (`js/schedule.js`)

1. Today's list holds the chapters you ticked today, plus the next unread
   chapters in reading order, up to the daily rate. The list doesn't change as
   you tick, and it grows if you read past the target.
2. The chapters left over fill the following days in order, at the daily rate.
3. Days after the target finish are marked as spillover days.
4. If `unread > rate × days left until the hard limit`, the rate becomes
   `ceil(unread / days left)`.
5. Missed days need no action. When the date changes, today's list starts from
   the first unread chapter. The app checks the date once a minute and whenever
   it comes back to the foreground.

Ticking a chapter on any screen (Plan, Books) marks it as read today.

## Files

```
index.html            app shell
css/styles.css        design tokens, light and dark themes, layout
js/data.js            66 books, chapter counts, reading order, chapters already read
js/schedule.js        pure scheduling logic (no DOM)
js/app.js             UI, storage, import and export
sw.js                 service worker (offline support)
manifest.webmanifest  PWA manifest
icons/                app icons
tests/                scheduling tests (Node's built-in test runner)
```

## Run locally

```bash
cd bible-tracker
python3 -m http.server 8000
# open http://localhost:8000
```

To preview any date, add `?today=YYYY-MM-DD`, for example
`http://localhost:8000/?today=2026-11-25#plan`.

## Tests

Requires Node 18 or later:

```bash
node --test tests/schedule.test.js
```

The tests cover: the starting state, finishing Deuteronomy the evening before,
skipping a day, reading 40 of 50, reading 60, falling behind past 5 Dec, being
exactly at the limit, the date passing the hard limit, unticking, changing the
daily target, finishing the plan, and streaks.

## Deploy to GitHub Pages

1. Create a new repository, for example `bible-tracker`.
2. Copy the **contents** of this folder to the root of that repository, then
   commit and push to `main`:
   ```bash
   cp -r bible-tracker/. ../bible-tracker-repo/
   cd ../bible-tracker-repo
   git init && git add . && git commit -m "Lamp Bible reading tracker"
   git branch -M main
   git remote add origin https://github.com/<you>/bible-tracker.git
   git push -u origin main
   ```
3. On GitHub, open **Settings → Pages**. Under **Build and deployment**, choose
   **Deploy from a branch**, then select `main` and the `/ (root)` folder, and save.
4. After about a minute the site is live at
   `https://<you>.github.io/bible-tracker/`.
5. On your phone, open the link and choose **Add to Home Screen** to install
   the app. After the first load it works offline.

All paths are relative, so the app works from any sub-path.

When you change a file later, update `VERSION` in `sw.js` so that installed
copies download the new version.

## Data and backup

Progress is saved in `localStorage` in the browser you use. To keep a copy or
move to another device, use **Settings → Export JSON**, then **Import JSON** on
the other device. **Reset** returns the tracker to its starting point.
