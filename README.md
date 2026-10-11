# THINKLOPEDIA · Topic Swipe

A tiny static web app for picking THINKLOPEDIA video topics like Tinder:
**swipe right = approve, left = reject, up = later.** Tap a card for full facts and sources.

Live: https://cyberromeo.github.io/thinklopedia-topics/
(On iPhone: Share → Add to Home Screen for the app icon.)

No server, no accounts, no secrets. Decisions are saved on the device (localStorage) and sent to
Rika with the **Send to Rika** button, which opens Messages with a ready-made text like:

```
THINKLOPEDIA picks — ✅ 3,5 ❌ 2 ⏭ 4

✅ 3 A Nobel Prize for a Telescope Buried in Ice
...
```

## Data: `topics.json`

```json
{
  "version": 1,
  "updated": "2026-10-11",
  "topics": [
    {
      "id": 23,                         // unique number, never reuse
      "title": "Hooky title (≤60 chars)",
      "hook": "First 2 seconds line",
      "format": "Short",                // "Short" or "Long"
      "category": "Space · Mystery",
      "facts": ["fact 1", "fact 2"],    // 2–4 short facts; mark unchecked ones "unverified"
      "sources": [{ "label": "NASA", "url": "https://..." }],
      "why_now": "News Oct 10, 2026 / Evergreen",
      "risk": "Short risk note",
      "added": "2026-10-11",
      "status": "pending",              // pending | approved | rejected | done
      "note": "optional, shown as a small tag"
    }
  ]
}
```

(Comments above are for reading only; the real file is plain JSON.)

## Rika's workflow

**Add topics:** append objects to `topics.json` → `topics` with the next unused `id`,
`status: "pending"`, and today's `added` date. Commit to `main`. Pages redeploys in ~1 min;
the app fetches `topics.json` fresh every time it opens or comes back to the foreground.

**Sync Sri's picks:** when the "THINKLOPEDIA picks — ✅ … ❌ … ⏭ …" text arrives, set each
listed topic's `status` to `approved` / `rejected` (leave ⏭ later ones `pending`) and commit.
Once a topic is made, set `status: "done"` (shows as "made ✓" under Approved).

How the app merges: a choice made on the phone wins until the repo's status for that topic
changes; once the repo changes (Rika synced), the repo wins and the "not sent / awaiting sync"
tag disappears.

## Files

`index.html`, `style.css`, `app.js` (all logic), `sw.js` (offline, network-first),
`manifest.webmanifest` + `icons/` (home-screen icon), `fonts/` (Montserrat + Inter, subset).
