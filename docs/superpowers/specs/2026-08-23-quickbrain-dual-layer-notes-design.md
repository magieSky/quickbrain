# QuickBrain Dual-Layer Notes & Smart Search — Design Spec

**Date**: 2026-08-23
**Status**: Approved (pending)
**Owner**: QuickBrain Dev

## 1. Goal

Web pages and documents carry far more content than a user typically wants from a search hit. Today QuickBrain stores each capture as a single oversized note, so AI search returns blobs the user has to scroll through to find the one sentence that matters.

This spec introduces a **two-layer note model**: every captured source becomes one "source" note plus several AI-extracted "atom" notes that point back to it. Searches return atoms first, with one-click navigation to the source context.

Success criteria:

1. Saving a web page or document makes the source note immediately visible in the main window; atom notes appear within ~5–10 seconds without blocking the save.
2. A search returns focused atom snippets. If the user clicks the snippet, they land in the source note at the original character range.
3. The feature degrades gracefully when AI is not configured or fails: source notes still work, the user is told, and can retry.
4. The keyword the user typed is enforced as a hard filter on top of AI semantic re-ranking so that tangentially-related atoms never crowd out direct hits.

## 2. Non-goals

- Multi-document atomic cross-references (atoms belong to one source only).
- Re-extraction triggered by edits to the source content (source is immutable after creation; user must delete + re-save).
- Streaming extraction UI (we accept background latency; UX shows extracted_at state only).
- Per-source extraction prompt customization.
- Token accounting / cost dashboards.

## 3. System architecture

```
   ┌──────────────────────────────────────────────────────┐
   │ Save (extension right-click, palette, import)        │
   │   ├─ addNote(is_atom=0)       → broadcast note-added │
   │   └─ setImmediate(() => extractAtoms(sourceId))      │
   │         ├─ aiService.extractAtoms({title,content})   │
   │         │    → JSON [{title,content,source_range}]   │
   │         ├─ for each atom: addNote(is_atom=1,         │
   │         │                        parent_id,          │
   │         │                        source_range)       │
   │         │             → broadcast atoms-added        │
   │         ├─ source.extracted_at = Date.now()          │
   │         └─ on error: source.extracted_at = -1        │
   └──────────────────────────────────────────────────────┘

   Search (Alt+K palette, main window search box)
     ├─ 1. SQLite FTS recall (50 candidates)
     ├─ 2. Hard filter: keyword substring in title|content
     │      (empty after filter → fall back to step-1 set)
     ├─ 3. AI re-rank + snippet extraction
     │      semanticSearch({query, candidates})
     └─ 4. No AI → return filtered candidates with
            snippet = content.slice(0,200)
```

## 4. Data model

### 4.1 New columns on `notes`

| Column        | Type     | Notes                                                      |
|---------------|----------|------------------------------------------------------------|
| `parent_id`   | INTEGER  | FK self, `ON DELETE CASCADE`; NULL for sources            |
| `source_range`| TEXT     | JSON `{"start":N,"end":M}`; null for sources              |
| `is_atom`     | INTEGER  | 0=source, 1=atom; default 0                                |
| `extracted_at`| INTEGER  | NULL=not extracted, -1=failed, otherwise unix ms timestamp |

### 4.2 Indexes

- `idx_notes_parent_id (parent_id)`
- `idx_notes_is_atom (is_atom)`

### 4.3 Migration

On first launch with the new code:
- `ALTER TABLE notes ADD COLUMN ...` (idempotent via `PRAGMA table_info`)
- Backfill existing rows: `parent_id=NULL, is_atom=0, extracted_at=NULL`
- Old notes show up as sources with "未抽取" status; user can run palette `抽取 <keyword>` to retroactively extract

## 5. AI extraction

### 5.1 Prompt contract

```
SYSTEM: 你是笔记抽取助手。给定一篇文档，提取 3-7 个独立关键点。
        每条原子应是独立、可被单独检索的一句话或一段话。
        只返回 JSON 数组,不要其他文字。

USER:   文档标题: <title>
        文档内容:
        <content 前 8000 字符>
        ---
        返回 JSON:
        [
          {
            "title": "5-15 字概括",
            "content": "1-3 句话,完整表达观点",
            "source_range": { "start": <int>, "end": <int> }
          }
        ]
        注: source_range 的字符索引基于上面"文档内容"的原始字符串。
```

### 5.2 Implementation notes

- New method `AIService.extractAtoms({title, content})` in `main/ai/service.mjs`
- Truncates `content` to 8000 chars before sending
- Parses JSON; on parse failure returns `{atoms: [], error: 'parse-error'}`
- Tolerates model output wrapped in ```json fences

### 5.3 Failure modes

- AI not configured → `extractAtoms` is a no-op, `extracted_at = NULL`
- AI error → caught, log, `extracted_at = -1`, source UI shows "抽取失败"
- JSON parse error → same as AI error
- Empty atom array from AI → treat as success with 0 atoms

## 6. Search

### 6.1 Pipeline (in `main/ipc.js` `smartSearch`)

```js
async function smartSearch(keyword, limit = 20) {
  const db = getDB()
  const candidates = searchNotes(db, keyword, 50)
  if (!candidates.length) return []

  const kw = keyword.toLowerCase()
  let filtered = candidates.filter(n =>
    (n.title || '').toLowerCase().includes(kw) ||
    (n.content || '').toLowerCase().includes(kw))

  // 中文/拼音查询时,硬过滤可能清空,回退候选集
  if (!filtered.length) filtered = candidates

  if (aiService) {
    const r = await aiService.semanticSearch(keyword, filtered.slice(0, 20))
    return r.results
  }

  return filtered.slice(0, limit).map(n => ({
    noteId: n.id,
    snippet: (n.content || '').slice(0, 200),
    score: 1.0
  }))
}
```

### 6.2 Result shape

Each result carries enough metadata for the UI to render a "view source" jump:

```
{
  noteId: 123,
  title: "...",
  content: "...",
  is_atom: 1,
  parent_id: 12,
  source_range: '{"start":340,"end":480}',
  snippet: "...",
  score: 0.83,
  reason: "..."    // optional, from AI
}
```

The main renderer is responsible for building "📍 from <parent title>" UI and dispatching `reveal-source` IPC to navigate to the source note + char range.

## 7. UI

### 7.1 Main window

- **Source card**: as today, plus a small status icon in the corner:
  - ✓ `extracted_at` set → "已抽取 N 个原子"
  - ⏳ `extracted_at` NULL and AI configured → "抽取中..."
  - ⚠ `extracted_at = -1` → "抽取失败,点击重试"
  - 🔕 `extracted_at` NULL and AI not configured → "未配置 AI,点击配置"
- **Atom card**: prefix line `📍 from <源标题>`, click source title to jump
- **Top filter chips**: `全部 / 源笔记 / 原子笔记` (third chip is new)
- **Stats line**: `X 源 / Y 原子` (replace current `X / Y 条`)

### 7.2 Detail panel (existing edit modal)

When user clicks an atom:
1. Open edit modal with full atom content
2. Button "查看来源" below content
3. Clicking sends `reveal-source` IPC:
   ```
   ipcMain.on('reveal-source', (e, {noteId, range}) => {
     const parent = getNoteById(getDB(), noteId)
     const win = BrowserWindow.fromWebContents(e.sender)
     win.webContents.send('locate-note', { id: noteId, range })
   })
   ```
4. Renderer updates `currentSearch = parent.title` (existing flow) and re-renders; on top of that, scrolls + highlights the `range` character span (new)

### 7.3 Palette (Alt+K)

New commands:
- `抽取 <keyword>` → trigger extraction for matching source notes (any `extracted_at` state)
- `重抽 <keyword>` → force re-extraction (deletes existing atoms first, then extracts)

Existing commands (`复制`, `删除`, `分类`, etc.) gain awareness that the target is an atom (different default tag handling).

## 8. Command surface (palette)

| Trigger          | Behavior                                                        |
|------------------|-----------------------------------------------------------------|
| `抽取 <kw>`      | Find sources matching `kw`, run extractAtoms for each, notify N |
| `重抽 <kw>`      | Same, but delete existing atoms first                           |
| `抽取全部`       | Find all sources with NULL/-1 extracted_at, run extractAtoms   |

## 9. Edge cases & error UX

| Scenario                        | Behavior                                                       |
|---------------------------------|----------------------------------------------------------------|
| AI not configured               | `extractAtoms` no-op; UI shows "未配置 AI"; click → settings |
| AI returns malformed JSON       | Treat as failure; UI shows "抽取失败"; retry available       |
| AI returns 0 atoms              | Success; UI shows "已抽取 0 个原子"                            |
| Save during extraction in flight| Save proceeds normally; each save spawns independent extract |
| Delete a source note            | `ON DELETE CASCADE` removes atoms                              |
| User saves same page twice      | Two distinct source notes; both extract independently         |
| Content > 8000 chars            | Truncated for prompt; `source_range` based on truncated text  |
| Hard filter empties results     | Fall back to FTS-only set (Chinese / pinyin friendly)          |
| Search with no AI               | Skip AI step; return filtered candidates with basic snippets |

## 10. Files affected

| File                                    | Change                                              |
|-----------------------------------------|-----------------------------------------------------|
| `main/db-init.js`                       | Add columns, indexes, idempotent migration         |
| `main/db/search.js`                     | Add `addAtomNote`, `getSourceNotes`, update `searchNotes` to populate new fields |
| `main/ai/service.mjs`                   | New `extractAtoms({title, content})`               |
| `main/ipc.js`                           | Wire `extractAtoms` into save paths; new `smartSearch` handler |
| `main/http-server.js`                   | Call extract on POST /notes success (fire-and-forget) |
| `renderer/main/main.js`                 | Render atom/source badges, filters, status icons    |
| `renderer/main/main.js`                 | Subscribe to `atoms-added` event                    |
| `renderer/main/main.css`                | Styles for atom badge, status icons                |
| `renderer/main/main.js`                 | New `reveal-source` flow with range highlight       |
| `renderer/palette/commands/registry.js` | Register `抽取`, `重抽` commands                   |
| `extension/background.js`               | Optional: include atom hint in popup status        |

## 11. Acceptance tests

1. Save `https://example.com/long-page` → main window shows 1 source within 200ms; AI configured → atoms appear within 10s; total atom count between 3 and 7.
2. With `extracted_at = -1` (simulated failure), clicking "重试" on the source card triggers a fresh extractAtoms call and clears the error state.
3. Search for `keyword1 keyword2` (both must appear): returns candidates containing at least one of them; AI re-ranks with strong preference for documents containing both.
4. Search for a Chinese phrase with no exact substring in DB → returns atoms whose content includes semantically related terms; no false 0-result.
5. Delete source note → DB query confirms all linked atoms are gone (`SELECT count(*) FROM notes WHERE parent_id=?`).
6. Disable AI provider → save still completes; source shows "未配置 AI"; palette `抽取` shows graceful error.
7. Save same URL twice → two source notes; each has its own atom set; deleting one source removes only its own atoms.

## 12. Out-of-scope reminders

- No streaming extraction UX (we accept background latency).
- No manual atom editing in v1 (user can edit through the existing edit modal, which clears `source_range` → flagged as user-edited; we do not re-extract).
- No bulk re-extraction across the whole library (only via `抽取全部` command).