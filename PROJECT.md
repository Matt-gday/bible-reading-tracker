# Bible Reading Tracker — Project Handoff

## Overview

A phone-first PWA that serves as a Bible reader and personal reading journal. It tracks reading threads across all 66 books, maintains verse-level position tracking, handles paper Bible reading via manual entry, and builds a visual coverage map of the entire Bible.

Built for **Matt** — a 52-year-old teacher aide, church graphic designer, and serious Bible reader based in Queensland, Australia. He reads multiple books simultaneously, reads Psalms backwards, does most dedicated reading in a paper Bible, and sometimes reads aloud in church from his phone. Every design decision reflects real reading behaviour.

---

## Tech Stack

- **Single HTML file PWA** with inline CSS and JS
- **Service worker** (`sw.js`) for full offline support
- **Local JSON Bible data** — World English Bible (public domain), one file per book
- **IndexedDB** for reading state (threads, sessions, coverage)
- **localStorage** for app settings
- **Cache Storage** (via service worker) for app files + Bible data
- **Hosted on GitHub Pages**

---

## Bible Data Source

The Bible text comes from the [TehShrike/world-english-bible](https://github.com/TehShrike/world-english-bible) repository. This is the World English Bible in JSON format with **full formatting metadata** including:

- `"type": "paragraph start"` / `"type": "paragraph end"` — prose paragraph breaks
- `"type": "stanza start"` / `"type": "stanza end"` — poetry stanza breaks  
- `"type": "line text"` — poetry lines (Psalms, Proverbs, prophetic poetry)
- `"type": "line break"` — line breaks within stanzas
- `"type": "break"` — section breaks
- `chapterNumber`, `verseNumber`, `sectionNumber`, `value` on each text node

### Data Processing

The raw JSON files from TehShrike need processing into a simpler format for our reader. The `process-bible.js` script (in project root) does this:

1. Downloads all 66 book JSON files from the TehShrike repo
2. Groups content by chapter
3. Preserves paragraph breaks, poetry line breaks, and stanza breaks as metadata
4. Outputs one JSON file per book in `/data/` with structure:

```json
{
  "book": "Psalms",
  "chapters": {
    "1": {
      "verses": [
        {"num": 1, "text": "Blessed is the man...", "poetry": true, "stanzaStart": true},
        {"num": 2, "text": "but his delight...", "poetry": true, "indent": true}
      ]
    }
  }
}
```

**IMPORTANT:** The current v12 app uses bible-api.com for fetching. The migration to local JSON files requires:
1. Running `process-bible.js` to generate the `/data/` folder
2. Updating the `fCh()` function to fetch from `./data/bookname.json` instead of the API
3. Updating the service worker to pre-cache all JSON files
4. Updating the renderer to use the richer formatting metadata (poetry, paragraphs)

---

## Design System — "Dark & Refined"

### Colour Scheme

**Dark mode (default):**
| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#1A1A1A` | Page background — neutral dark grey, no colour cast |
| `--sf` | `#242424` | Surface (cards, nav bars) |
| `--sa` | `#2E2E2E` | Surface alt (hover states) |
| `--tx` | `#E8E2D8` | Primary text — warm off-white |
| `--tm` | `#908880` | Muted text |
| `--ac` | `#C9A45C` | Accent — warm gold |
| `--rt` | `#D5D0C5` | Reader body text |
| `--vn` | `#C9A45C` | Verse numbers — accent gold |

**Light mode:**
| Token | Value |
|-------|-------|
| `--bg` | `#FFFFFF` |
| `--sf` | `#F5F3F0` |
| `--tx` | `#1C1A18` |
| `--ac` | `#B08840` |
| `--rt` | `#2A2825` |

**Section colours** (for coverage chart, book selector):
- Law: `#C0784E` / `#985A3C`
- History: `#82A660` / `#5E7A42`
- Poetry: `#D4A84E` / `#B08730`
- Prophets: `#6E90B0` / `#4A6880`
- Gospels: `#A86A88` / `#7A4460`
- Acts: `#6EA894` / `#4E7A6A`
- Epistles: `#9A8A74` / `#6A5E4E`
- Revelation: `#B87060` / `#8A5040`

### Typography

- **Body text:** Georgia, serif
- **UI labels:** `ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace`
- **Drop cap chapter numbers:** Cormorant Garamond 700 (Google Font) — lining figures, sized to exactly 2 text lines
- **No coloured emoji anywhere** — all icons are mono SVG

### Key Design Rules

- **No scrollbars visible** — `scrollbar-width: none` everywhere
- **Paragraph style:** Professional Bible typesetting — `text-indent: 1.5em`, no paragraph spacing. First paragraph after drop cap has no indent.
- **Poetry rendering:** Each verse as its own line with hanging indent. Continuation lines get extra indent. Stanza breaks between thought groups.
- **Drop caps:** Cormorant Garamond, `font-size: calc(var(--fz) * var(--lh) * 2 + 6px)`, `margin: -3px 8px 0 0`, `font-variant-numeric: lining-nums`, colour matches body text exactly.

---

## App Architecture

### Screen Structure

The app is a single-page app with screens shown/hidden via CSS. Screens are flex columns inside a flex container. Each screen has:
- A fixed header (where applicable)
- A scrollable content area
- The global tab bar at bottom

### Navigation

- **Tab bar (5 tabs):** Home | Coverage | Search | Log | Settings
- **Screen stack** for push/pop navigation within tabs
- **Search** is a slide-up panel overlay, not a separate screen

### Home Screen

- No top header bar — starts directly with two hero buttons: "Open Bible" and "Log Reading"
- Active threads section — grouped by book, compact single-line rows showing verse ranges
- Collapsible Bible coverage mini-map with stats summary
- Thread overflow: after 4 book cards, "Show X more" link

### Reader

The reader is the core of the app. Key architecture decisions:

**Continuous scroll:** Chapters load seamlessly as you scroll. After initial chapter renders, `fillVP()` loads more chapters until the viewport is full. On scroll, next chapters load when within 500px of bottom.

**Scroll container:** The `.rbody` div is the scroll container (not the main content area). This isolates reader scrolling from app navigation scrolling.

**Sticky nav bar:** `← back | ‹ prev ch | Book Name ch | next ch › | bookmark icon` — always visible at top.

**Thread bar:** Shows below nav when a thread is active. Displays position range. For Psalms, includes direction toggle button ("→ Switch to forwards" / "← Switch to backwards").

**Verse-level tracking:** As user scrolls, the thread's current verse continuously updates to whatever verse is at the top of the viewport. This means reopening a thread scrolls to the exact verse, not just the chapter start.

### Thread Prompt

A bottom sheet that slides up (z-index 90, below tab bar's 100) with:
- **No thread active:** "Start a thread from [Book] [Ch]:[Verse]?" + "Start thread" / "New forwards" / "New backwards" (Psalms) / "Not now"
- **Thread active (via bookmark icon):** Shows current position + "Stop tracking" / "Continue"
- No suggested/existing threads shown — user goes to home screen for that
- Appears after 10 seconds of reading (not scanning)
- Gentle slide animation, no dark overlay, no text jumping
- Dismissed threads can be re-triggered via bookmark icon in nav bar

### Reading Intelligence

**Fast navigation detection (10-second threshold):**
- If chapter nav buttons pressed within 10 seconds of each other → scanning, not reading
- Scanned chapters NOT marked as read for threads
- Thread prompt resets and waits for settling

**End-of-chapter validation:**
- Thread only advances to next chapter if last ~3 verses were visible on screen
- If user skips partway through, thread stays at actual position

**Direction-aware Psalms:**
- Backwards thread only updates when moving to lower-numbered Psalms
- If wrong-direction movement detected, gentle prompt to switch direction
- Direction toggle in thread bar for manual switching
- Switching direction with existing progress triggers confirmation modal with reset

### Coverage System

**Book List view:** Every book shown with 22×22px chapter cells, numbered, coloured by section. Read chapters get section colour, unread get neutral grey.

**Heatmap view:** Compact 12×12px cells, one per book, opacity indicates completion ratio.

**Mini-map on home:** 5×5px cells, all 1189 chapters visible in a compact grid with section spacers.

### Search

- Activated via tab bar, slides up as an 85% height panel
- Auto-focuses search input, keyboard opens immediately
- Searches all cached chapters (shows count: "47 of 1189 chapters")
- Tapping result closes panel and navigates to passage
- After full Bible download, search is comprehensive

### Bible Download

- Settings → "Download Bible" with progress bar
- **2.5 second delay** between API requests (bible-api.com rate limits at 15 req/30s)
- Retry with exponential backoff on 429 errors
- Shows "Rate limited, waiting..." status
- Skips already-cached chapters
- **This feature becomes unnecessary once migrated to local JSON files**

---

## Data Model

### State (localStorage key: `bts`)

```javascript
{
  threads: [{
    id: "t_1234567890",
    bookId: "ROM",           // Book ID from BK array
    startChapter: 3,
    startVerse: 1,
    currentChapter: 6,
    currentVerse: 20,        // Exact verse — updates on scroll
    direction: "forward",    // "forward" or "backward" (Psalms only)
    sessions: ["s_123"],     // Session IDs
    created: "2025-03-08T..."
  }],
  sessions: [{
    id: "s_123",
    date: "2025-03-08",
    startBookId: "ROM", startChapter: 3, startVerse: 1,
    endBookId: "ROM", endChapter: 6, endVerse: 20,
    source: "manual",        // "manual" or "app"
    threadId: "t_123"
  }],
  theme: "dark",
  covOpen: true,
  showAll: false,
  fontSize: 16               // 14, 16, 18, or 20
}
```

### Read Chapters (localStorage key: `brc`)

```javascript
{
  "ROM": { "1": 2, "2": 1, "3": 3 },  // chapter: times read
  "PSA": { "1": 1, "23": 5 }
}
```

### Bible Text Cache (IndexedDB: `BT`, store: `ch`)

Key: `"ROM_8"`, Value: `[{num: 1, text: "There is therefore..."}, ...]`

**After migration to local JSON:** This IndexedDB cache can be removed. The service worker's Cache Storage handles caching the JSON files.

---

## What's Working Well

- [x] Continuous scroll reader with chapter loading
- [x] Drop cap chapter numbers (Cormorant Garamond, 2-line height, lining figures)
- [x] Professional paragraph indenting (prose) and poetry line rendering
- [x] Thread creation, tracking, and verse-level position updates
- [x] Psalms forward/backward direction with toggle and detection
- [x] Thread editing and deletion with in-app modals
- [x] Coverage map (book list + heatmap + home mini-map)
- [x] Manual paper reading entry
- [x] Search with cached chapter count display
- [x] Font size selector with scroll position preservation
- [x] Dark/light theme
- [x] Export/import data
- [x] 5-tab navigation
- [x] Search slide-up panel with auto-focus

---

## Known Issues & Outstanding Work

### Critical — Must Fix

1. **Migrate to local JSON Bible data** — Replace bible-api.com dependency with local files from TehShrike/world-english-bible. This eliminates rate limiting, CORS issues, and enables proper paragraph/poetry formatting from source markup.

2. **Poetry formatting from source** — Current heuristic approach works but isn't accurate. The TehShrike data has explicit `stanza start`, `line text`, `line break` markers. Use these for proper rendering.

3. **Thread prompt positioning** — The prompt sits at `bottom: calc(var(--sb) + 44px)` which may not perfectly align with the tab bar on all devices. Test on physical iPhone and Android devices and adjust.

4. **Thread auto-merge logic** — The `tryM()` function merges overlapping threads in the same book. Needs testing with edge cases (backwards Psalms threads shouldn't merge with forward ones).

### Important — Should Do

5. **Book Detail Page** — Specified in original design doc but not yet built. Should show: chapter coverage bar, all active threads in the book, full reading session history, stats (total chapters read, sessions, time), calendar heatmap of engagement.

6. **Reading Plans** — Chronological, M'Cheyne, Gospels focused, NT in a year, Bible in a year, custom import. Plans generate daily reading that integrates with coverage map.

7. **Whole Bible Heatmap** — The compact 66-cell heatmap exists but could be richer. The original spec calls for chapter-level cells grouped by section with subtle dividers.

8. **Recent Lookups** — Track passages viewed outside of threads, show on home screen as collapsible list.

### Nice to Have

9. **ESV API Integration** — Add as Phase 2 Bible version. Free for non-commercial use via api.esv.org. Build a version selector dropdown that swaps the text source.

10. **Scroll speed detection** — Distinguish slow reading scroll from fast navigation scroll. Currently uses time-based detection (10s threshold) which works but scroll velocity would be more natural.

11. **Dark mode auto-detect** — Use `prefers-color-scheme` media query to default to system theme.

12. **iPad two-column layout** — For wider screens, consider side-by-side reader + coverage or reader + thread list.

13. **Service worker update notification** — When a new version is deployed, show a subtle "Update available" prompt.

---

## File Structure for Cursor

```
bible-reading-tracker/
├── index.html              # The complete PWA app
├── sw.js                   # Service worker for offline caching
├── manifest.json           # PWA manifest
├── process-bible.js        # Node script to download & process WEB data
├── PROJECT.md              # This file
├── data/                   # Generated Bible JSON (one per book)
│   ├── genesis.json
│   ├── exodus.json
│   ├── ... (66 files)
│   └── revelation.json
└── icons/                  # PWA icons (create as needed)
    ├── icon-192.png
    └── icon-512.png
```

---

## Important Design Principles (from Matt)

1. **No coloured emoji ever.** Always prefer mono icon sets (SVG).
2. **No nested scrolling.** One scroll context per screen.
3. **Professional typography.** This is a Bible — treat it with the same care as a printed edition.
4. **Paper Bible reading is first-class.** Manual entries are identical to app-recorded reading in every view and statistic.
5. **The thread prompt must never disrupt live reading.** No dark overlays, no text jumping, gentle slide animation. Matt sometimes reads aloud to the whole church.
6. **Backgrounds are neutral.** White or near-white in light mode, dark grey in dark mode. Colour accents, not colour casting.
7. **The app should feel like something a graphic designer is proud to look at.** Matt has 15+ years of Adobe Creative Cloud experience.

---

## API Reference

### bible-api.com (current, being replaced)

```
GET https://bible-api.com/{BookName}+{chapter}?translation=web
```

Returns: `{ verses: [{ verse: 1, text: "..." }] }`

Rate limit: 15 requests per 30 seconds. Returns 429 when exceeded.

### Local JSON (after migration)

```
fetch('./data/genesis.json')
```

Returns the processed book JSON with full formatting metadata.

---

## Development Notes

- The app is a single HTML file. All CSS is in a `<style>` block, all JS in a `<script>` block. This was intentional for Matt's workflow (building in Claude chat, deploying as a single file).
- In Cursor, you may want to split CSS and JS into separate files for maintainability. The service worker would need to cache all three.
- Variable names are heavily abbreviated in the JS (to keep the single-file version compact). Consider renaming for readability when refactoring.
- The `BK` array contains all 66 books with `id`, `n` (name), `a` (abbreviation), `ch` (chapter count), `s` (section). This is the single source of truth for book metadata.
- The `AN` object maps book IDs to API-friendly names. After migration to local JSON, this maps to filenames instead.

---

*Last updated: March 2026. Built across an extended collaborative session between Matt and Claude (Anthropic).*
