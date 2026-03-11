# Bible Reading Tracker

A phone-first Progressive Web App for tracking Bible reading across all 66 books. Supports reading threads, verse-level position tracking, manual paper Bible entry, coverage mapping, and full offline use.

Uses the **World English Bible** (public domain).

## Setup

```bash
# 1. Clone this repo
git clone https://github.com/YOUR_USERNAME/bible-reading-tracker.git
cd bible-reading-tracker

# 2. Download and process Bible data
node process-bible.js

# 3. Serve locally for testing
npx serve .
# or
python3 -m http.server 8000
```

## Deploy to GitHub Pages

1. Push to GitHub
2. Go to Settings → Pages → Source: Deploy from branch → `main` / `root`
3. Your app will be at `https://YOUR_USERNAME.github.io/bible-reading-tracker/`

## Project Documentation

See **[PROJECT.md](PROJECT.md)** for comprehensive technical documentation including architecture, design system, data model, and outstanding work items.

## License

App code: MIT. Bible text (World English Bible): Public Domain.
