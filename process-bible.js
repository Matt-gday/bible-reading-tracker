#!/usr/bin/env node

/**
 * process-bible.js
 *
 * Parses USFM zip files (e.g. eng-web_usfm.zip) into per-book JSON
 * for the Bible Reading Tracker app. Supports multiple versions.
 *
 * Usage:
 *   node process-bible.js              # processes all *_usfm.zip in project root
 *   node process-bible.js my-file.zip  # processes a specific zip
 *
 * Output:
 *   data/{versionId}/genesis.json ... revelation.json
 *   data/versions.json
 */

const fs = require('fs');
const path = require('path');
const { createReadStream } = require('fs');

let AdmZip;
try {
  AdmZip = require('adm-zip');
} catch (e) {
  console.error('Missing dependency: adm-zip');
  console.error('Run: npm install adm-zip');
  process.exit(1);
}

// Canonical 66-book Protestant Bible — maps USFM book codes to our data
const CANON = {
  GEN: { name: 'Genesis',          out: 'genesis' },
  EXO: { name: 'Exodus',           out: 'exodus' },
  LEV: { name: 'Leviticus',        out: 'leviticus' },
  NUM: { name: 'Numbers',          out: 'numbers' },
  DEU: { name: 'Deuteronomy',      out: 'deuteronomy' },
  JOS: { name: 'Joshua',           out: 'joshua' },
  JDG: { name: 'Judges',           out: 'judges' },
  RUT: { name: 'Ruth',             out: 'ruth' },
  '1SA': { name: '1 Samuel',       out: '1samuel' },
  '2SA': { name: '2 Samuel',       out: '2samuel' },
  '1KI': { name: '1 Kings',        out: '1kings' },
  '2KI': { name: '2 Kings',        out: '2kings' },
  '1CH': { name: '1 Chronicles',   out: '1chronicles' },
  '2CH': { name: '2 Chronicles',   out: '2chronicles' },
  EZR: { name: 'Ezra',             out: 'ezra' },
  NEH: { name: 'Nehemiah',         out: 'nehemiah' },
  EST: { name: 'Esther',           out: 'esther' },
  JOB: { name: 'Job',              out: 'job' },
  PSA: { name: 'Psalms',           out: 'psalms' },
  PRO: { name: 'Proverbs',         out: 'proverbs' },
  ECC: { name: 'Ecclesiastes',     out: 'ecclesiastes' },
  SNG: { name: 'Song of Solomon',  out: 'songofsolomon' },
  ISA: { name: 'Isaiah',           out: 'isaiah' },
  JER: { name: 'Jeremiah',         out: 'jeremiah' },
  LAM: { name: 'Lamentations',     out: 'lamentations' },
  EZK: { name: 'Ezekiel',          out: 'ezekiel' },
  DAN: { name: 'Daniel',           out: 'daniel' },
  HOS: { name: 'Hosea',            out: 'hosea' },
  JOL: { name: 'Joel',             out: 'joel' },
  AMO: { name: 'Amos',             out: 'amos' },
  OBA: { name: 'Obadiah',          out: 'obadiah' },
  JON: { name: 'Jonah',            out: 'jonah' },
  MIC: { name: 'Micah',            out: 'micah' },
  NAM: { name: 'Nahum',            out: 'nahum' },
  HAB: { name: 'Habakkuk',         out: 'habakkuk' },
  ZEP: { name: 'Zephaniah',        out: 'zephaniah' },
  HAG: { name: 'Haggai',           out: 'haggai' },
  ZEC: { name: 'Zechariah',        out: 'zechariah' },
  MAL: { name: 'Malachi',          out: 'malachi' },
  MAT: { name: 'Matthew',          out: 'matthew' },
  MRK: { name: 'Mark',             out: 'mark' },
  LUK: { name: 'Luke',             out: 'luke' },
  JHN: { name: 'John',             out: 'john' },
  ACT: { name: 'Acts',             out: 'acts' },
  ROM: { name: 'Romans',           out: 'romans' },
  '1CO': { name: '1 Corinthians',  out: '1corinthians' },
  '2CO': { name: '2 Corinthians',  out: '2corinthians' },
  GAL: { name: 'Galatians',        out: 'galatians' },
  EPH: { name: 'Ephesians',        out: 'ephesians' },
  PHP: { name: 'Philippians',      out: 'philippians' },
  COL: { name: 'Colossians',       out: 'colossians' },
  '1TH': { name: '1 Thessalonians', out: '1thessalonians' },
  '2TH': { name: '2 Thessalonians', out: '2thessalonians' },
  '1TI': { name: '1 Timothy',      out: '1timothy' },
  '2TI': { name: '2 Timothy',      out: '2timothy' },
  TIT: { name: 'Titus',            out: 'titus' },
  PHM: { name: 'Philemon',         out: 'philemon' },
  HEB: { name: 'Hebrews',          out: 'hebrews' },
  JAS: { name: 'James',            out: 'james' },
  '1PE': { name: '1 Peter',        out: '1peter' },
  '2PE': { name: '2 Peter',        out: '2peter' },
  '1JN': { name: '1 John',         out: '1john' },
  '2JN': { name: '2 John',         out: '2john' },
  '3JN': { name: '3 John',         out: '3john' },
  JUD: { name: 'Jude',             out: 'jude' },
  REV: { name: 'Revelation',       out: 'revelation' },
};

// ── Text cleaning ──────────────────────────────────────────────

function cleanText(raw) {
  let t = raw;
  // Remove footnotes  \f ... \f*
  t = t.replace(/\\f\s+.*?\\f\*/g, '');
  // Remove cross-references  \x ... \x*
  t = t.replace(/\\x\s+.*?\\x\*/g, '');
  // Strong's numbers:  \w word|strong="H1234"\w*  →  word
  // Also handles nested \+w ... \+w*
  t = t.replace(/\\\+?w\s+([^|]*?)\|[^\\]*?\\\+?w\*/g, '$1');
  // Standalone \w word\w* (no attributes)
  t = t.replace(/\\\+?w\s+(.*?)\\\+?w\*/g, '$1');
  // Divine name: \nd LORD\nd* → LORD
  t = t.replace(/\\nd\s+(.*?)\\nd\*/g, '$1');
  // Words of Jesus: \wj text\wj* → text
  t = t.replace(/\\wj\s+(.*?)\\wj\*/g, '$1');
  // Translator addition: \add text\add* → text
  t = t.replace(/\\add\s+(.*?)\\add\*/g, '$1');
  // Italics: \it text\it* → text
  t = t.replace(/\\it\s+(.*?)\\it\*/g, '$1');
  // Quoted book title: \bk text\bk* → text
  t = t.replace(/\\bk\s+(.*?)\\bk\*/g, '$1');
  // Small caps: \sc text\sc* → text
  t = t.replace(/\\sc\s+(.*?)\\sc\*/g, '$1');
  // Remove any remaining inline markers like \qs, \qac, \xt, etc.
  t = t.replace(/\\[a-z]+\d?\s*\*/g, '');
  t = t.replace(/\\[a-z]+\d?\s+/g, ' ');
  // Clean up whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

// ── USFM Parser ────────────────────────────────────────────────

function parseUSFM(content) {
  const lines = content.split(/\r?\n/);
  let bookId = null;
  let versionLabel = '';
  const chapters = {};
  let curCh = null;
  let curVerseNum = 0;
  let verseTextParts = [];
  let poetryLines = [];
  let isPoetryVerse = false;
  let pendingParaStart = false;
  let pendingPoetryLevel = 0;
  let pendingStanzaBreak = false;
  let chapterTitle = null;

  function flushVerse() {
    if (curVerseNum === 0 || !curCh) return;
    const ch = chapters[curCh];
    if (!ch) return;

    if (isPoetryVerse && poetryLines.length > 0) {
      const text = poetryLines.map(l => l[1]).join(' ');
      const verse = { num: curVerseNum, text };
      verse.q = poetryLines.map(l => [l[0], l[1]]);
      if (pendingStanzaBreak) { verse.s = true; pendingStanzaBreak = false; }
      ch.verses.push(verse);
    } else if (verseTextParts.length > 0) {
      const text = verseTextParts.join(' ');
      const verse = { num: curVerseNum, text };
      if (pendingParaStart) { verse.p = true; pendingParaStart = false; }
      if (pendingStanzaBreak) { verse.s = true; pendingStanzaBreak = false; }
      ch.verses.push(verse);
    }

    curVerseNum = 0;
    verseTextParts = [];
    poetryLines = [];
    isPoetryVerse = false;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    // ── Book ID ──
    if (line.startsWith('\\id ')) {
      const parts = line.substring(4).trim().split(/\s+/);
      bookId = parts[0];
      versionLabel = parts.slice(1).join(' ');
      continue;
    }

    // ── Skip metadata headers ──
    if (/^\\(ide|h|toc\d|mt\d?|cl|ms\d?|mr|rem|ip|is\d?|iot|io\d?|imt\d?)\b/.test(line)) continue;

    // ── Section headers — skip ──
    if (/^\\(s\d?|r|sr|sp)\b/.test(line)) continue;

    // ── Selah marker ──
    if (/^\\qs\b/.test(line)) continue;

    // ── Chapter ──
    const chMatch = line.match(/^\\c\s+(\d+)/);
    if (chMatch) {
      flushVerse();
      curCh = chMatch[1];
      chapters[curCh] = { verses: [] };
      pendingParaStart = false;
      pendingPoetryLevel = 0;
      chapterTitle = null;
      continue;
    }

    // ── Psalm title / descriptor ──
    if (line.startsWith('\\d ') || line.startsWith('\\d\t')) {
      const titleText = cleanText(line.substring(2).trim());
      if (titleText && curCh && chapters[curCh]) {
        chapters[curCh].title = titleText;
      }
      continue;
    }

    // ── Blank line / stanza break ──
    if (/^\\b\s*$/.test(line)) {
      if (curVerseNum > 0) {
        // Will apply to the NEXT verse after flushing
        flushVerse();
      }
      pendingStanzaBreak = true;
      continue;
    }

    // ── Paragraph start ──
    if (/^\\(p|pi\d?|m|mi|nb|pc|pm|pmo|pmc|pmr|cls)\b/.test(line)) {
      pendingParaStart = true;
      pendingPoetryLevel = 0;
      // Check for inline content after the marker
      const after = line.replace(/^\\[a-z]+\d?\s*/, '').trim();
      if (after) processContent(after);
      continue;
    }

    // ── Poetry lines ──
    const qMatch = line.match(/^\\q(\d?)\s*(.*)/);
    if (qMatch) {
      const level = qMatch[1] ? parseInt(qMatch[1]) : 1;
      pendingPoetryLevel = level;
      const after = qMatch[2].trim();
      if (after) processContent(after);
      continue;
    }

    // ── Verse ──
    if (line.startsWith('\\v ')) {
      processContent(line);
      continue;
    }

    // ── Anything else with content — treat as continuation ──
    const stripped = line.replace(/^\\[a-z]+\d?\s*/, '').trim();
    if (stripped) processContent(stripped);
  }

  flushVerse();

  function processContent(text) {
    // May contain one or more \v markers inline
    // Split on \v to handle multiple verses in one line
    const parts = text.split(/(?=\\v\s+\d+\s)/);

    for (const part of parts) {
      const vMatch = part.match(/^\\v\s+(\d+)\s+(.*)/s);
      if (vMatch) {
        flushVerse();
        curVerseNum = parseInt(vMatch[1]);
        const cleaned = cleanText(vMatch[2]);
        if (!cleaned) continue;

        if (pendingPoetryLevel > 0) {
          isPoetryVerse = true;
          poetryLines.push([pendingPoetryLevel, cleaned]);
        } else {
          verseTextParts.push(cleaned);
        }
      } else {
        // Continuation of current verse
        const cleaned = cleanText(part);
        if (!cleaned) continue;

        if (pendingPoetryLevel > 0) {
          if (!isPoetryVerse && verseTextParts.length > 0) {
            // Verse started as prose but now has poetry — convert
            const proseText = verseTextParts.join(' ');
            poetryLines.push([1, proseText]);
            verseTextParts = [];
          }
          isPoetryVerse = true;
          poetryLines.push([pendingPoetryLevel, cleaned]);
        } else if (isPoetryVerse) {
          // Still in poetry mode from a previous q marker
          poetryLines.push([1, cleaned]);
        } else {
          verseTextParts.push(cleaned);
        }
      }
    }
  }

  return { bookId, versionLabel, chapters };
}

// ── Version ID extraction ──────────────────────────────────────

function versionIdFromFilename(zipName) {
  // eng-web_usfm.zip → web
  // eng-kjv2006_usfm.zip → kjv2006
  const match = zipName.match(/^[a-z]+-([^_]+)_usfm\.zip$/i);
  if (match) return match[1].toLowerCase();
  // Fallback: strip extension and common suffixes
  return path.basename(zipName, '.zip').replace(/_usfm$/i, '').toLowerCase();
}

function versionNameFromId(raw) {
  // "World English Bible (WEB) 2024-01-15" → { name: "World English Bible", abbr: "WEB" }
  let cleaned = raw.replace(/\s+\d{4}-\d{2}-\d{2}\s*$/, '').trim();
  const abbrMatch = cleaned.match(/\(([A-Z]+)\)\s*$/);
  const abbr = abbrMatch ? abbrMatch[1] : null;
  const name = abbrMatch ? cleaned.replace(abbrMatch[0], '').trim() : cleaned;
  return { name, abbr };
}

// ── Main processing ────────────────────────────────────────────

function processZip(zipPath) {
  const zipName = path.basename(zipPath);
  const versionId = versionIdFromFilename(zipName);

  console.log(`\nProcessing: ${zipName}`);
  console.log(`  Version ID: ${versionId}`);

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  // Find all .usfm files and try to identify canonical books
  const bookEntries = [];
  let detectedVersionName = '';

  for (const entry of entries) {
    if (!entry.entryName.endsWith('.usfm')) continue;
    // Quick-read the \id line to check if canonical
    const content = entry.getData().toString('utf8');
    const idMatch = content.match(/^\\id\s+(\w+)\s*(.*)/m);
    if (!idMatch) continue;
    const code = idMatch[1];
    if (!CANON[code]) continue;
    if (!detectedVersionName) detectedVersionName = idMatch[2].trim();
    bookEntries.push({ entry, code, content });
  }

  console.log(`  Found ${bookEntries.length}/66 canonical books`);

  const { name: fullName, abbr } = versionNameFromId(detectedVersionName);
  const displayName = fullName || versionId.toUpperCase();
  const displayAbbr = abbr || versionId.toUpperCase();
  console.log(`  Version: ${displayName} (${displayAbbr})`);

  // Create output directory
  const outDir = path.join(__dirname, 'data', versionId);
  if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  let totalVerses = 0;
  let totalChapters = 0;

  for (const { code, content } of bookEntries) {
    const info = CANON[code];
    const result = parseUSFM(content);
    const chCount = Object.keys(result.chapters).length;
    const vCount = Object.values(result.chapters).reduce((s, c) => s + c.verses.length, 0);

    const outData = {
      book: info.name,
      bookId: code,
      chapters: result.chapters,
    };

    const outPath = path.join(outDir, info.out + '.json');
    fs.writeFileSync(outPath, JSON.stringify(outData));

    totalChapters += chCount;
    totalVerses += vCount;
    console.log(`    ${info.name}: ${chCount} ch, ${vCount} vv`);
  }

  console.log(`  Total: ${totalChapters} chapters, ${totalVerses} verses`);

  // Calculate size
  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.json'));
  const totalBytes = files.reduce((s, f) => s + fs.statSync(path.join(outDir, f)).size, 0);
  console.log(`  Output size: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);

  return {
    id: versionId,
    name: displayName,
    abbr: displayAbbr,
  };
}

async function main() {
  // Find zip files to process
  let zipFiles = [];

  if (process.argv.length > 2) {
    // Specific files passed as arguments
    zipFiles = process.argv.slice(2).map(f => path.resolve(f));
  } else {
    // Scan project root for *_usfm.zip
    const root = __dirname;
    const allFiles = fs.readdirSync(root);
    zipFiles = allFiles
      .filter(f => f.toLowerCase().endsWith('_usfm.zip'))
      .map(f => path.join(root, f));
  }

  if (zipFiles.length === 0) {
    console.error('No USFM zip files found.');
    console.error('Place files like eng-web_usfm.zip in the project root, or pass as arguments.');
    process.exit(1);
  }

  console.log(`Found ${zipFiles.length} USFM zip file(s)`);

  const versions = [];

  // Load existing versions.json if present (to preserve manually-added entries)
  const versionsPath = path.join(__dirname, 'data', 'versions.json');
  let existingVersions = [];
  if (fs.existsSync(versionsPath)) {
    try { existingVersions = JSON.parse(fs.readFileSync(versionsPath, 'utf8')); } catch (e) {}
  }

  for (const zipPath of zipFiles) {
    try {
      const ver = processZip(zipPath);
      versions.push(ver);
    } catch (err) {
      console.error(`  Failed to process ${path.basename(zipPath)}: ${err.message}`);
    }
  }

  // Merge with existing versions (update existing, add new)
  for (const v of versions) {
    const idx = existingVersions.findIndex(e => e.id === v.id);
    if (idx >= 0) existingVersions[idx] = v;
    else existingVersions.push(v);
  }

  // Write versions.json
  if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
  fs.writeFileSync(versionsPath, JSON.stringify(existingVersions, null, 2));
  console.log(`\nVersions manifest: data/versions.json`);
  console.log(existingVersions.map(v => `  ${v.id}: ${v.name} (${v.abbr})`).join('\n'));
  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });
