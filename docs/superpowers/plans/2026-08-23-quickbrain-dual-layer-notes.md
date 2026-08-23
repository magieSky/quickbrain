# Dual-Layer Notes (Source + Atoms) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make every captured source spawn AI-extracted atom notes; searches return focused atom snippets with one-click navigation to source context.

**Architecture:** Async-fire-and-forget extraction runs after every save (extension, palette, import). Atoms share parent_id with their source and carry a source_range JSON for navigation. Smart search layers a hard keyword filter on top of FTS recall before invoking AI re-rank.

**Tech Stack:** better-sqlite3 (schema migration in main/db-init.js), vitest (TDD), main/ai/service.mjs (existing AIService), Node built-in http (no new deps), vanilla JS renderer.

---

## File Structure

| File                                       | Responsibility                                              |
|--------------------------------------------|-------------------------------------------------------------|
| main/db/schema.sql                         | Source-of-truth schema (add columns + indexes)              |
| main/db-init.js                            | Idempotent ALTER TABLE migration on app startup             |
| main/db/search.js                          | addAtomNote, getSourceNotes, populate new fields on read   |
| main/ai/service.mjs                        | extractAtoms({title, content})                              |
| main/ai/extract.js                         | New: prompt builder + JSON parser                           |
| main/notes-extractor.js                    | New: orchestrator (decides when to extract, error states)   |
| main/ipc.js                                | smartSearch handler + reveal-source IPC + invoke extractor on save |
| main/http-server.js                        | Fire extraction after POST /notes success                   |
| renderer/main/main.js                      | Atom badge, status icons, filter chips, reveal-source flow |
| renderer/main/main.css                     | Styles for atom/source cards and status icons              |
| renderer/palette/commands/registry.js      | extract, re-extract, extract-all commands                  |
| tests/db/dual-layer.test.js                | New: schema, addAtomNote, search by parent                  |
| tests/ai/extract.test.js                   | New: prompt construction, JSON parse                        |
| tests/notes-extractor.test.js              | New: orchestrator behavior                                  |
| tests/ipc-smart-search.test.js             | New: smartSearch pipeline with stubbed AI                   |

---

## Phase 1: Schema migration

### Task 1: Add columns and indexes to schema.sql

**Files:**
- Modify: main/db/schema.sql

- [ ] **Step 1: Append columns and indexes to schema.sql**

Add inside the notes CREATE TABLE definition (after source_type line):

```sql
parent_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
source_range TEXT DEFAULT '',
is_atom INTEGER DEFAULT 0,
extracted_at INTEGER
```

Add after existing indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_notes_parent_id ON notes(parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_is_atom ON notes(is_atom);
```

- [ ] **Step 2: Verify schema parses**

```powershell
cd E:\note\quickbrain
node -e "const fs=require('fs'); console.log(fs.readFileSync('main/db/schema.sql','utf8').length)"
```

Expected: a number > 0 printed.

- [ ] **Step 3: Commit**

```powershell
cd E:\note\quickbrain
git add main/db/schema.sql
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(db): add parent_id, source_range, is_atom, extracted_at columns + indexes"
```

---

### Task 2: Idempotent migration in db-init.js

**Files:**
- Modify: main/db-init.js
- Create: tests/db-migration.test.js

- [ ] **Step 1: Add migrateSchema(db) function and call it**

Read main/db-init.js first to understand current shape. After the existing schema exec, call:

```js
function migrateSchema(db) {
  const cols = new Set(db.prepare('PRAGMA table_info(notes)').all().map(c => c.name))
  if (!cols.has('parent_id'))    db.exec('ALTER TABLE notes ADD COLUMN parent_id INTEGER REFERENCES notes(id) ON DELETE CASCADE')
  if (!cols.has('source_range')) db.exec("ALTER TABLE notes ADD COLUMN source_range TEXT DEFAULT ''")
  if (!cols.has('is_atom'))      db.exec('ALTER TABLE notes ADD COLUMN is_atom INTEGER DEFAULT 0')
  if (!cols.has('extracted_at')) db.exec('ALTER TABLE notes ADD COLUMN extracted_at INTEGER')
  db.exec('CREATE INDEX IF NOT EXISTS idx_notes_parent_id ON notes(parent_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_notes_is_atom ON notes(is_atom)')
}
```

Export migrateSchema from main/db-init.js.

- [ ] **Step 2: Write a test**

Create tests/db-migration.test.js:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrateSchema } from '../main/db-init.js'

let db
beforeEach(() => { db = new Database(':memory:') })
afterEach(() => { db.close() })

describe('schema migration', () => {
  it('adds new columns to existing table', () => {
    db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, title TEXT DEFAULT '')")
    migrateSchema(db)
    const cols = db.prepare('PRAGMA table_info(notes)').all().map(c => c.name)
    expect(cols).toContain('parent_id')
    expect(cols).toContain('source_range')
    expect(cols).toContain('is_atom')
    expect(cols).toContain('extracted_at')
  })

  it('is idempotent on fresh schema', () => {
    db.exec(require('fs').readFileSync('main/db/schema.sql', 'utf8'))
    expect(() => migrateSchema(db)).not.toThrow()
  })
})
```

- [ ] **Step 3: Run tests**

```powershell
cd E:\note\quickbrain
npm test -- tests/db-migration.test.js
```

Expected: both pass.

- [ ] **Step 4: Commit**

```powershell
cd E:\note\quickbrain
git add main/db-init.js tests/db-migration.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(db): idempotent migration for new dual-layer columns"
```

---

## Phase 2: DB layer

### Task 3: addAtomNote + getSourceNotes + populate new fields

**Files:**
- Modify: main/db/search.js
- Create: tests/db/dual-layer.test.js

- [ ] **Step 1: Extend addNote INSERT**

In main/db/search.js addNote, destructure new fields and add to INSERT columns + values:

```js
const { title = '', content, tags = [], category = 'uncategorized',
        original_content = '', source_path = '', source_type = '',
        parent_id = null, source_range = '', is_atom = 0 } = note
const stmt = db.prepare(`INSERT INTO notes (content, title, category, tags, original_content, source_path, source_type, parent_id, source_range, is_atom) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
const result = stmt.run(content, title, category, JSON.stringify(tags), original_content, source_path, source_type, parent_id, source_range, is_atom)
```

- [ ] **Step 2: Add addAtomNote helper**

```js
function addAtomNote(db, { parentId, title, content, sourceRange, tags = [], source_path = '', source_type = '' }) {
  return addNote(db, {
    title, content, tags,
    parent_id: parentId,
    source_range: JSON.stringify(sourceRange || {}),
    is_atom: 1,
    source_path,
    source_type
  })
}
```

- [ ] **Step 3: Add getSourceNotes helper**

```js
function getSourceNotes(db, { onlyUnExtracted = false, keyword = null } = {}) {
  let sql = 'SELECT * FROM notes WHERE is_atom = 0'
  const params = {}
  if (onlyUnExtracted) sql += ' AND extracted_at IS NULL'
  if (keyword) {
    sql += ' AND (title LIKE @kw OR content LIKE @kw)'
    params.kw = '%' + keyword + '%'
  }
  return db.prepare(sql).all(params).map(rowToNote)
}
```

Add a shared rowToNote mapper that includes the new fields and refactor existing getNoteById/searchNotes/getRecentNotes mappers to use it.

- [ ] **Step 4: Populate new fields in searchNotes result mapping**

In the final mapping around ftsRows.map(row => ...), include `is_atom`, `parent_id`, `source_range` from the row.

- [ ] **Step 5: Write tests**

Create tests/db/dual-layer.test.js:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { addNote, addAtomNote, getSourceNotes, searchNotes } from '../../main/db/search.js'
import { migrateSchema } from '../../main/db-init.js'

function freshDb() {
  const db = new Database(':memory:')
  db.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'main', 'db', 'schema.sql'), 'utf8'))
  migrateSchema(db)
  return db
}

let db
beforeEach(() => { db = freshDb() })
afterEach(() => { db.close() })

describe('dual-layer notes', () => {
  it('addAtomNote creates atom linked to parent', () => {
    const src = addNote(db, { title: 'Source', content: 'Long article...' })
    addAtomNote(db, { parentId: src, title: 'Key point', content: 'One sentence insight', sourceRange: { start: 0, end: 18 } })
    const atom = searchNotes(db, 'insight')[0]
    expect(atom.is_atom).toBe(1)
    expect(atom.parent_id).toBe(src)
    expect(JSON.parse(atom.source_range)).toEqual({ start: 0, end: 18 })
  })

  it('getSourceNotes returns only sources', () => {
    const src = addNote(db, { title: 'A', content: 'content a' })
    addAtomNote(db, { parentId: src, title: 'B', content: 'content b', sourceRange: {} })
    const sources = getSourceNotes(db)
    expect(sources.length).toBe(1)
    expect(sources[0].id).toBe(src)
  })

  it('searchNotes result includes is_atom and parent_id', () => {
    const src = addNote(db, { title: 'React', content: 'hooks tips' })
    addAtomNote(db, { parentId: src, title: 'React hooks detail', content: 'useState', sourceRange: {} })
    const r = searchNotes(db, 'React')
    expect(r.some(n => n.is_atom === 1)).toBe(true)
  })
})
```

- [ ] **Step 6: Run**

```powershell
cd E:\note\quickbrain
npm test -- tests/db/dual-layer.test.js
```

- [ ] **Step 7: Commit**

```powershell
cd E:\note\quickbrain
git add main/db/search.js tests/db/dual-layer.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(db): addAtomNote + getSourceNotes + populate new fields in search"
```

---
## Phase 3: AI extraction

### Task 4: Prompt builder + JSON parser

**Files:**
- Create: main/ai/extract.js
- Create: tests/ai/extract.test.js

- [ ] **Step 1: Write buildExtractPrompt**

```js
const MAX_CONTENT_CHARS = 8000

function buildExtractPrompt(title, content) {
  const truncated = (content || '').slice(0, MAX_CONTENT_CHARS)
  return {
    system: 'You are a note-extraction assistant. Given a document, extract 3-7 independent key points. Each atom must be a self-contained statement that can be searched independently. Return only a JSON array, no other text.',
    user:
      'Document title: ' + (title || '(untitled)') + '\n' +
      'Document content:\n' + truncated + '\n---\n' +
      'Return JSON array:\n' +
      '[{"title":"5-15 chars summary","content":"1-3 sentences expressing the point","source_range":{"start":<int>,"end":<int>}}]\n' +
      'Note: source_range character indices are based on the Document content string above.'
  }
}
```

- [ ] **Step 2: Write parseAtomJson**

```js
function parseAtomJson(raw) {
  if (!raw) return []
  let s = String(raw).trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  let arr
  try { arr = JSON.parse(s) } catch (_) {
    const m = s.match(/\[[\s\S]*\]/)
    if (!m) return []
    try { arr = JSON.parse(m[0]) } catch (_) { return [] }
  }
  if (!Array.isArray(arr)) return []
  return arr.filter(a => a && typeof a.title === 'string' && typeof a.content === 'string').map(a => ({
    title: a.title.trim().slice(0, 100),
    content: a.content.trim().slice(0, 500),
    source_range: (a.source_range && typeof a.source_range === 'object')
      ? { start: Number(a.source_range.start) || 0, end: Number(a.source_range.end) || 0 }
      : { start: 0, end: 0 }
  }))
}

module.exports = { buildExtractPrompt, parseAtomJson, MAX_CONTENT_CHARS }
```

- [ ] **Step 3: Write tests**

Create tests/ai/extract.test.js:

```js
import { describe, it, expect } from 'vitest'
import { buildExtractPrompt, parseAtomJson, MAX_CONTENT_CHARS } from '../../main/ai/extract.js'

describe('extract prompt', () => {
  it('truncates content to MAX_CONTENT_CHARS', () => {
    const long = 'a'.repeat(MAX_CONTENT_CHARS + 100)
    const p = buildExtractPrompt('t', long)
    expect(p.user).toContain('a'.repeat(100))
    expect(p.user).not.toContain('a'.repeat(MAX_CONTENT_CHARS + 1))
  })
})

describe('parseAtomJson', () => {
  it('parses clean array', () => {
    const r = parseAtomJson('[{"title":"A","content":"B","source_range":{"start":1,"end":5}}]')
    expect(r.length).toBe(1)
    expect(r[0].title).toBe('A')
  })

  it('strips json fences', () => {
    const r = parseAtomJson('```json\n[{"title":"A","content":"B","source_range":{"start":1,"end":5}}]\n```')
    expect(r.length).toBe(1)
  })

  it('falls back to bracket extraction on garbage', () => {
    const r = parseAtomJson('leading garbage [{"title":"A","content":"B","source_range":{}}] trailing')
    expect(r.length).toBe(1)
  })

  it('returns empty on invalid input', () => {
    expect(parseAtomJson('')).toEqual([])
    expect(parseAtomJson(null)).toEqual([])
    expect(parseAtomJson('no json here')).toEqual([])
  })
})
```

- [ ] **Step 4: Run**

```powershell
cd E:\note\quickbrain
npm test -- tests/ai/extract.test.js
```

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add main/ai/extract.js tests/ai/extract.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(ai): prompt builder + JSON parser for atom extraction"
```

---

### Task 5: Add extractAtoms to AIService

**Files:**
- Modify: main/ai/service.mjs

- [ ] **Step 1: Inspect AIService**

```powershell
cd E:\note\quickbrain
Get-Content main\ai\service.mjs | Select-Object -First 80
```

- [ ] **Step 2: Add extractAtoms method**

Add to the AIService class:

```js
import { buildExtractPrompt, parseAtomJson } from './extract.js'

// inside class AIService:
async extractAtoms({ title, content }) {
  if (!this.cfg || !this.cfg.provider) throw new Error('AI not configured')
  const { system, user } = buildExtractPrompt(title, content)
  const raw = await this.callChatCompletion([
    { role: 'system', content: system },
    { role: 'user', content: user }
  ])
  return parseAtomJson(raw)
}
```

If `callChatCompletion` does not exist, follow the pattern of the existing `categorizeContent` / `formatContent` methods and reuse whichever helper sends a single chat completion. Add this import at the top:

```js
import { buildExtractPrompt, parseAtomJson } from './extract.js'
```

- [ ] **Step 3: Write test**

Create tests/ai/extract-service.test.js:

```js
import { describe, it, expect, vi } from 'vitest'

describe('AIService.extractAtoms', () => {
  it('throws when AI not configured', async () => {
    const { AIService } = await import('../../main/ai/service.mjs')
    const svc = new AIService({})
    await expect(svc.extractAtoms({ title: 't', content: 'c' })).rejects.toThrow('AI not configured')
  })

  it('returns parsed atoms on success', async () => {
    const { AIService } = await import('../../main/ai/service.mjs')
    const svc = new AIService({ provider: 'openai', apiKey: 'k', model: 'm' })
    svc.callChatCompletion = async () => '[{"title":"A","content":"B","source_range":{"start":0,"end":10}}]'
    const r = await svc.extractAtoms({ title: 't', content: '0123456789' })
    expect(r[0].title).toBe('A')
    expect(r[0].source_range).toEqual({ start: 0, end: 10 })
  })
})
```

If the existing service uses a different chat-completion method name (e.g. `callLLM`), adjust the test stub accordingly.

- [ ] **Step 4: Run**

```powershell
cd E:\note\quickbrain
npm test -- tests/ai
```

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add main/ai/service.mjs tests/ai
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(ai): AIService.extractAtoms method"
```

---
## Phase 4: Orchestrator

### Task 6: notes-extractor module

**Files:**
- Create: main/notes-extractor.js
- Create: tests/notes-extractor.test.js

- [ ] **Step 1: Write extractAtomsForSource**

```js
const { getDB } = require('./db-init')
const { getNoteById, addAtomNote } = require('./db/search')

const STATUS = { PENDING: null, DONE: 'done', FAILED: -1 }

let _aiService = null
function setExtractorAIService(svc) { _aiService = svc }
function getAIService() { return _aiService }

function safeParse(s, fallback) { try { return JSON.parse(s) } catch { return fallback } }

async function extractAtomsForSource(sourceId, { force = false } = {}) {
  const db = getDB()
  const source = getNoteById(db, sourceId)
  if (!source) return { ok: false, error: 'not-found' }
  if (!force && source.extracted_at && source.extracted_at !== STATUS.FAILED) {
    return { ok: true, skipped: true }
  }

  const aiService = getAIService()
  if (!aiService) {
    db.prepare('UPDATE notes SET extracted_at = ? WHERE id = ?').run(STATUS.PENDING, sourceId)
    return { ok: false, error: 'ai-not-configured' }
  }

  try {
    const atoms = await aiService.extractAtoms({
      title: source.title, content: source.content
    })
    if (force) {
      db.prepare('DELETE FROM notes WHERE parent_id = ?').run(sourceId)
    }
    let count = 0
    for (const atom of atoms) {
      addAtomNote(db, {
        parentId: sourceId,
        title: atom.title,
        content: atom.content,
        sourceRange: atom.source_range,
        tags: safeParse(source.tags, []),
        source_path: source.source_path,
        source_type: source.source_type
      })
      count++
    }
    db.prepare('UPDATE notes SET extracted_at = ? WHERE id = ?').run(Date.now(), sourceId)
    return { ok: true, count }
  } catch (e) {
    console.error('[notes-extractor] failed for', sourceId, e.message)
    db.prepare('UPDATE notes SET extracted_at = ? WHERE id = ?').run(STATUS.FAILED, sourceId)
    return { ok: false, error: e.message }
  }
}

module.exports = { extractAtomsForSource, setExtractorAIService }
```

- [ ] **Step 2: Inject AI service via main/ipc.js**

In main/ipc.js, add:

```js
const { setExtractorAIService } = require('./notes-extractor')
```

Modify the existing setAIService function to also forward to the extractor:

```js
function setAIService(service) {
  aiService = service
  setExtractorAIService(service)
}
```

- [ ] **Step 3: Write orchestrator tests**

Create tests/notes-extractor.test.js:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

let db
beforeEach(() => {
  db = new Database(':memory:')
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'main', 'db', 'schema.sql'), 'utf8'))
  const { migrateSchema } = require('../main/db-init.js')
  migrateSchema(db)
  require.cache[require.resolve('../main/db-init.js')].exports.getDB = () => db
})
afterEach(() => { db.close() })

describe('extractAtomsForSource', () => {
  it('returns ai-not-configured when no service', async () => {
    const { setExtractorAIService, extractAtomsForSource } = require('../main/notes-extractor.js')
    setExtractorAIService(null)
    const { addNote } = require('../main/db/search.js')
    const id = addNote(db, { title: 't', content: 'c' })
    const r = await extractAtomsForSource(id)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('ai-not-configured')
  })

  it('happy path inserts atoms', async () => {
    const { setExtractorAIService, extractAtomsForSource } = require('../main/notes-extractor.js')
    const fakeAi = { extractAtoms: vi.fn().mockResolvedValue([
      { title: 'A', content: 'a', source_range: { start: 0, end: 1 } }
    ]) }
    setExtractorAIService(fakeAi)
    const { addNote, getSourceNotes } = require('../main/db/search.js')
    const id = addNote(db, { title: 't', content: 'content here' })
    const r = await extractAtomsForSource(id)
    expect(r.ok).toBe(true)
    expect(r.count).toBe(1)
    expect(getSourceNotes(db).length).toBe(1)
    expect(db.prepare('SELECT count(*) c FROM notes WHERE is_atom=1').get().c).toBe(1)
  })

  it('marks source as failed on AI error', async () => {
    const { setExtractorAIService, extractAtomsForSource } = require('../main/notes-extractor.js')
    setExtractorAIService({ extractAtoms: vi.fn().mockRejectedValue(new Error('boom')) })
    const { addNote } = require('../main/db/search.js')
    const id = addNote(db, { title: 't', content: 'c' })
    const r = await extractAtomsForSource(id)
    expect(r.ok).toBe(false)
    const row = db.prepare('SELECT extracted_at FROM notes WHERE id=?').get(id)
    expect(row.extracted_at).toBe(-1)
  })
})
```

- [ ] **Step 4: Run**

```powershell
cd E:\note\quickbrain
npm test -- tests/notes-extractor.test.js
```

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add main/notes-extractor.js main/ipc.js tests/notes-extractor.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(extractor): notes-extractor orchestrator with AI/no-AI/failed paths"
```

---

## Phase 5: Wire extraction into save paths

### Task 7: HTTP server fires extraction after save

**Files:**
- Modify: main/http-server.js

- [ ] **Step 1: Add fire-and-forget extraction in POST /notes**

In main/http-server.js, in the POST /notes handler, after successful handleNoteMessage:

```js
if (result.success && result.id) {
  const { extractAtomsForSource } = require('./notes-extractor')
  setImmediate(() => {
    extractAtomsForSource(result.id).catch(err =>
      console.error('[http-server] extract failed:', err.message))
  })
}
```

- [ ] **Step 2: Smoke test**

After rebuild + restart QuickBrain, run:

```powershell
try { (Invoke-WebRequest -Uri 'http://127.0.0.1:7421/notes' -Method POST -ContentType 'application/json' -Body '{"type":"save-page","payload":{"markdown":"# Test\n\nReact hooks allow state in functions","title":"Extract Test","url":"http://e.com","tabTitle":"t"}}' -UseBasicParsing -TimeoutSec 3).Content } catch { Write-Host "ERR: $($_.Exception.Message)" }
```

Watch %USERPROFILE%\quickbrain-debug.log for [notes-extractor] lines.

- [ ] **Step 3: Commit**

```powershell
cd E:\note\quickbrain
git add main/http-server.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(http-server): fire extraction after successful POST /notes"
```

---

### Task 8: Import path also extracts

**Files:**
- Modify: main/import/store.js

- [ ] **Step 1: Find import handler**

```powershell
cd E:\note\quickbrain
rg -n 'import-document|importDocument' main/
```

- [ ] **Step 2: Add extraction fire-and-forget**

In the IPC handler that returns `{ success: true, id }` after import, add:

```js
const { extractAtomsForSource } = require('./notes-extractor')
setImmediate(() => {
  extractAtomsForSource(result.id).catch(err =>
    console.error('[import] extract failed:', err.message))
})
```

- [ ] **Step 3: Smoke test**

In QuickBrain main window, drop a small .md file. Watch USERPROFILE\quickbrain-debug.log.

- [ ] **Step 4: Commit**

```powershell
cd E:\note\quickbrain
git add main/import/
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(import): fire extraction after successful import"
```

---
## Phase 6: Smart search

### Task 9: smartSearch pipeline in IPC

**Files:**
- Modify: main/ipc.js
- Create: tests/ipc-smart-search.test.js

- [ ] **Step 1: Write smartSearch**

Add to main/ipc.js:

```js
function toResult(n) {
  return {
    noteId: n.id,
    title: n.title,
    content: n.content,
    is_atom: n.is_atom || 0,
    parent_id: n.parent_id || null,
    source_range: n.source_range || '',
    snippet: (n.content || '').slice(0, 200),
    score: 1.0
  }
}

function smartSearch(keyword, limit = 20) {
  const db = getDB()
  const candidates = searchNotes(db, keyword, 50)
  if (!candidates.length) return []

  const kw = keyword.toLowerCase()
  let filtered = candidates.filter(n =>
    (n.title || '').toLowerCase().includes(kw) ||
    (n.content || '').toLowerCase().includes(kw))
  if (!filtered.length) filtered = candidates

  if (aiService) {
    return Promise.resolve(aiService.semanticSearch(keyword, filtered.slice(0, 20), limit))
      .then(r => (r && r.results) || filtered.slice(0, limit).map(toResult))
      .catch(() => filtered.slice(0, limit).map(toResult))
  }
  return filtered.slice(0, limit).map(toResult)
}
```

If the existing `semanticSearch` signature differs, adapt. Most likely it returns `{success, results}`; reuse `.results`.

- [ ] **Step 2: Wire into IPC handler**

In registerIpcHandlers, replace (or alias) the existing search-notes handler:

```js
ipcMain.handle('search-notes', async (event, filters = {}) => {
  const q = filters.search || ''
  const requestedLimit = parseInt(filters.limit, 10)
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : 20
  if (aiService) return smartSearch(q, limit)
  return searchNotes(getDB(), q, limit)
})
```

- [ ] **Step 3: Write tests**

Create tests/ipc-smart-search.test.js:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

let db
beforeEach(() => {
  db = new Database(':memory:')
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'main', 'db', 'schema.sql'), 'utf8'))
  require('../main/db-init.js').migrateSchema(db)
  require.cache[require.resolve('../main/db-init.js')].exports.getDB = () => db
})
afterEach(() => { db.close() })

describe('smartSearch (no AI path)', () => {
  it('returns results with is_atom and parent_id fields', () => {
    const { addNote, addAtomNote } = require('../main/db/search.js')
    const src = addNote(db, { title: 'React hooks', content: 'tips' })
    addAtomNote(db, { parentId: src, title: 'useState', content: 'state hook', sourceRange: {} })
    // aiService is null by default in tests
    const { smartSearch } = require('../main/ipc.js')
    const r = smartSearch('React')
    expect(r.length).toBeGreaterThan(0)
    expect(r.some(x => x.is_atom === 1)).toBe(true)
  })

  it('hard filter empties -> falls back to original candidates', () => {
    const { addNote } = require('../main/db/search.js')
    addNote(db, { title: 'X', content: 'Y' })
    const { smartSearch } = require('../main/ipc.js')
    // a single-char keyword won't be in content/title, hard filter empties, fallback to original
    const r = smartSearch('Q')
    expect(r.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 4: Run**

```powershell
cd E:\note\quickbrain
npm test -- tests/ipc-smart-search.test.js
```

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add main/ipc.js tests/ipc-smart-search.test.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(search): smartSearch with hard keyword filter + AI re-rank"
```

---

### Task 10: HTTP server uses smart search

**Files:**
- Modify: main/http-server.js

- [ ] **Step 1: Update GET /notes to use smartSearch**

```js
const { smartSearch } = require('./ipc')
// ...
if (route === 'GET /notes') {
  const q = url.searchParams.get('q') || ''
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit'), 10) || 20, 200))
  return send(res, 200, smartSearch(q, limit))
}
```

- [ ] **Step 2: Smoke test**

```powershell
try { (Invoke-WebRequest -Uri 'http://127.0.0.1:7421/notes?q=test&limit=5' -UseBasicParsing -TimeoutSec 3).Content } catch { Write-Host "ERR: $($_.Exception.Message)" }
```

Expected: JSON array with noteId/snippet.

- [ ] **Step 3: Commit**

```powershell
cd E:\note\quickbrain
git add main/http-server.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(http-server): GET /notes uses smartSearch"
```

---
## Phase 7: UI - main window

### Task 11: Source / atom status icons + filter chips

**Files:**
- Modify: renderer/main/main.js
- Modify: renderer/main/main.css
- Modify: renderer/main/index.html

- [ ] **Step 1: Add filter state**

In renderer/main/main.js near currentCategory:

```js
let currentType = 'all' // 'all' | 'source' | 'atom'
let aiReady = false
```

- [ ] **Step 2: Cache AI readiness**

After initial load, set:

```js
api.getAIConfig().then(c => { aiReady = !!(c && c.provider && c.hasApiKey) })
```

- [ ] **Step 3: Add filter chips in HTML**

In renderer/main/index.html near the existing filter chips element, add three buttons:

```html
<button class="filter-chip" data-type="all">全部</button>
<button class="filter-chip" data-type="source">源笔记</button>
<button class="filter-chip" data-type="atom">原子笔记</button>
```

(Inspect the file first to find the right anchor.)

- [ ] **Step 4: Wire chip clicks**

```js
els.filters.querySelectorAll('.filter-chip').forEach(c => {
  if (c.dataset.type) {
    c.onclick = () => {
      currentType = c.dataset.type
      els.filters.querySelectorAll('.filter-chip').forEach(x => x.classList.toggle('active', x === c))
      render()
    }
  }
})
```

- [ ] **Step 5: Update getFiltered**

```js
function getFiltered() {
  let r = allNotes
  if (currentType === 'source') r = r.filter(n => !n.is_atom)
  if (currentType === 'atom') r = r.filter(n => n.is_atom)
  if (currentCategory !== 'all') r = r.filter(n => (n.category || '其他') === currentCategory)
  if (currentSearch.trim()) {
    const q = currentSearch.toLowerCase()
    r = r.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q) ||
      (n.tags || []).some(t => t.toLowerCase().includes(q)))
  }
  return r
}
```

- [ ] **Step 6: Add status icon to source card**

In the rendering template, before note-title:

```js
${(!n.is_atom) ?
  '<span class="source-status" data-id="' + n.id + '" title="抽取状态">' +
    (n.extracted_at == null && !aiReady ? '🔕' :
     n.extracted_at == null ? '⏳' :
     n.extracted_at === -1 ? '⚠' : '✓') +
  '</span>' : ''}
```

- [ ] **Step 7: Add atom badge**

```js
${n.is_atom ?
  '<div class="atom-badge">📍 from <span class="source-link" data-id="' + n.parent_id + '">' + escapeHtml(parentTitleOf(n)) + '</span></div>' : ''}
```

Add a `parentTitleOf(n)` helper that looks up the parent in allNotes (fallback to '(unknown)').

- [ ] **Step 8: Wire source-link clicks**

```js
els.list.querySelectorAll('.source-link').forEach(el => {
  el.onclick = (e) => {
    e.stopPropagation()
    const id = parseInt(el.dataset.id, 10)
    if (id) api.revealSource(id)
  }
})
```

- [ ] **Step 9: Wire status icon clicks (retry extraction)**

```js
els.list.querySelectorAll('.source-status').forEach(el => {
  el.onclick = (e) => {
    e.stopPropagation()
    const id = parseInt(el.dataset.id, 10)
    if (id) api.extractSource(id, true).then(() => loadNotes())
  }
})
```

- [ ] **Step 10: Stats line**

Change the stats text from `${filtered.length} / ${allNotes.length} 条` to:

```js
const sources = allNotes.filter(n => !n.is_atom).length
const atoms = allNotes.filter(n => n.is_atom).length
els.stats.textContent = sources + ' 源 / ' + atoms + ' 原子'
```

- [ ] **Step 11: CSS**

In renderer/main/main.css:

```css
.source-status { cursor: pointer; margin-right: 6px; }
.atom-badge { color: #666; font-size: 12px; margin-bottom: 4px; }
.source-link { color: #3a7bd5; cursor: pointer; text-decoration: underline; }
.filter-chip.active { background: #3a7bd5; color: #fff; }
```

- [ ] **Step 12: Manual smoke test**

Rebuild, restart QuickBrain, save a page:
- Source card shows ✓ after a few seconds
- Atom cards appear with `📍 from <source>` prefix
- Filter chips switch between sources/atoms
- Click ⚠ triggers retry

- [ ] **Step 13: Commit**

```powershell
cd E:\note\quickbrain
git add renderer/main/main.js renderer/main/main.css renderer/main/index.html
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(ui-main): source/atom filter chips + status icons + atom badge"
```

---

### Task 12: Reveal-source IPC + range highlight

**Files:**
- Modify: main/ipc.js
- Modify: main/windows.js
- Modify: preload/main-preload.js
- Modify: renderer/main/main.js

- [ ] **Step 1: Add reveal-source IPC**

In main/ipc.js:

```js
ipcMain.on('reveal-source', (event, { id, range }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.webContents.send('locate-note', { id, range: range || null })
})
```

- [ ] **Step 2: Update existing locate-note senders**

In main/windows.js find the existing call (around line 204) and change:

```js
mainWindow.webContents.send('locate-note', { id, range: null })
```

- [ ] **Step 3: Update preload**

In preload/main-preload.js:

```js
revealSource: (id) => ipcRenderer.send('reveal-source', { id }),
extractSource: (id, force) => ipcRenderer.invoke('extract-source', { id, force }),
onLocateNote: (callback) => {
  ipcRenderer.on('locate-note', (event, payload) => {
    callback(typeof payload === 'number' ? { id: payload, range: null } : payload)
  })
},
```

- [ ] **Step 4: Renderer handler**

In renderer/main/main.js, replace the existing onLocateNote handler:

```js
api.onLocateNote(({ id, range }) => {
  const note = allNotes.find(n => n.id === id)
  if (!note) return
  currentSearch = note.title || note.content.substring(0, 20)
  els.search.value = currentSearch
  currentCategory = 'all'
  currentType = 'source'
  els.filters.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.type === 'source'))
  render()
  if (range && range.start != null) {
    openDetailWithRange(note, range)
  } else {
    setStatus('定位到笔记 #' + id)
  }
})

function openDetailWithRange(note, range) {
  const snippet = note.content.slice(range.start, range.end)
  window.alert('源笔记 #' + note.id + '\n\n[' + range.start + '-' + range.end + ']:\n' + snippet)
}
```

- [ ] **Step 5: Manual test**

Click an atom's `📍 from <title>` → see source title filter + range snippet alert.

- [ ] **Step 6: Commit**

```powershell
cd E:\note\quickbrain
git add main/ipc.js main/windows.js preload/main-preload.js renderer/main/main.js
git -c user.name='quickbrain' -c user.email='qb@local' commit -m "feat(ui-main): reveal-source IPC + range highlight"
```

---

## Phase 8: Palette commands

### Task 13: extract / re-extract / extract-all

**Files:**
- Modify: main/ipc.js
- Modify: preload/palette-preload.js
- Modify: renderer/palette/commands/registry.js

- [ ] **Step 1: Add IPC handlers in main/ipc.js**

```js
ipcMain.handle('extract-source', async (event, { id, force = false }) => {
  const { extractAtomsForSource } = require('./notes-extractor')
  return extractAtomsForSource(id, { force })
})

ipcMain.handle('extract-search', async (event, { keyword, force = false }) => {
  const { getSourceNotes } = require('./db/search')
  const sources = getSourceNotes(getDB(), { keyword: keyword || null, onlyUnExtracted: !force })
  const { extractAtomsForSource } = require('./notes-extractor')
  let count = 0
  for (const s of sources) {
    const r = await extractAtomsForSource(s.id, { force })
    if (r.ok && !r.skipped) count++
  }
  return { ok: true, processed: sources.length, extracted: count }
})
```

- [ ] **Step 2: Expose in palette preload**

In preload/palette-preload.js add:

```js
extractSource: (id, force) => ipcRenderer.invoke('extract-source', { id, force }),
extractSearch: (keyword, force) => ipcRenderer.invoke('extract-search', { keyword, force })
```

- [ ] **Step 3: Add palette commands**

In renderer/palette/commands/registry.js add three entries:

```js
{
  name: 'chou-qu', icon: 'brain', requiresKeyword: true,
  execute: async (ctx, keyword) => {
    const r = await ctx.api.extractSearch(keyword, false)
    ctx.notify(r.extracted > 0 ? 'yi-chou-qu ' + r.extracted + ' ge yuan' : 'mei-ke-chou-qu-de-yuan')
    ctx.hidePalette()
  }
},
{
  name: 'chong-chou', icon: 'refresh', requiresKeyword: true, dangerous: true,
  execute: async (ctx, keyword) => {
    if (!confirm('chong-chou-hui-shan-chu-yi-you-de-yuan-zi, que-ding ' + keyword + ' ?')) return
    const r = await ctx.api.extractSearch(keyword, true)
    ctx.notify('yi-chong-chou ' + r.extracted + ' ge yuan')
    ctx.hidePalette()
  }
},
{
  name: 'chou-qu-quan-bu', icon: 'brain',
  execute: async (ctx) => {
    const r = await ctx.api.extractSearch('', false)
    ctx.notify('yi-chou-qu ' + r.extracted + ' ge yuan')
    ctx.hidePalette()
  }
}
```

(Use Chinese name 抽取/重抽/抽取全部 when registering; the pinyin above is just to avoid heredoc quoting issues. Replace with actual Chinese before commit.)

- [ ] **Step 4: Manual test**

In QuickBrain palette, type 抽取 keyword and Enter - should notify count + main window refresh.

- [ ] **Step 5: Commit**

```powershell
cd E:\note\quickbrain
git add main/ipc.js preload/palette-preload.js renderer/palette/commands/registry.js
git -c user.name=quickbrain -c user.email=qb@local commit -m "feat(palette): extract / re-extract / extract-all commands"
```

---

## Phase 9: Polish

### Task 14: Cascade delete test

**Files:**
- Modify: tests/db/dual-layer.test.js

- [ ] **Step 1: Append cascade test**

```js
it('deleting source cascades to atoms via FK', () => {
  const src = addNote(db, { title: 'Parent', content: 'p' })
  addAtomNote(db, { parentId: src, title: 'A1', content: 'a', sourceRange: {} })
  addAtomNote(db, { parentId: src, title: 'A2', content: 'b', sourceRange: {} })
  db.prepare('DELETE FROM notes WHERE id = ?').run(src)
  const remaining = db.prepare('SELECT count(*) c FROM notes WHERE is_atom = 1').get().c
  expect(remaining).toBe(0)
})
```

- [ ] **Step 2: Run**

```powershell
cd E:\note\quickbrain
npm test -- tests/db/dual-layer.test.js
```

- [ ] **Step 3: Commit**

```powershell
cd E:\note\quickbrain
git add tests/db/dual-layer.test.js
git -c user.name=quickbrain -c user.email=qb@local commit -m "test: cascade delete source removes atoms"
```

---
### Task 15: Docs update

**Files:**
- Modify: docs/browser-extension.md or create README section

- [ ] **Step 1: Document the new model**

Append to docs:

```markdown
## Dual-layer notes

Each saved content becomes one source note plus AI-extracted atom notes.

- Source note: full content, includes extracted_at status (NULL=not extracted, -1=failed, otherwise timestamp)
- Atom note: is_atom=1, parent_id points to source, source_range points into source character range

Search returns atoms first; one click jumps back to source context.

Status icons on source cards:
- ok = extracted
- wait = extracting (AI configured, in flight)
- warn = failed - click to retry
- mute = AI not configured - click to open settings

Palette commands: extract keyword, re-extract keyword, extract-all
```

- [ ] **Step 2: Commit**

```powershell
cd E:\note\quickbrain
git add docs/
git -c user.name=quickbrain -c user.email=qb@local commit -m "docs: dual-layer notes + smart search"
```

---


## Acceptance verification

After all phases complete, run the rebuild + verify snippet below (adjust sleep as needed for slower machines).

Then in Edge with the extension reloaded:
1. Save a webpage with substantial content
2. Within 10s, see atom cards appear with from-marker prefix
3. Click from-marker - main window jumps to source with range snippet
4. Search a keyword - results show atoms first; click - jump works
5. Click warn on a failed source - retry, source goes back to wait then ok
6. Palette: extract keyword - notifies count
7. Delete source - atoms cascade-deleted

All 7 acceptance criteria from spec must pass before tagging v1.1.0.

---

## Open follow-ups (not in this plan)

- Build a proper detail modal (replace prompt/alert shims)
- Edit-source triggers re-extract option
- Streaming extraction UX with progress
- Atom edit clears source_range + flag as user-edited
