import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'

// WYSIWYG note editor. Loads markdown from main, renders as rich text, saves
// back as markdown so the rest of the app (search, card preview, sync) keeps
// working unchanged. Ctrl+S saves, Esc closes (with dirty-check).

const $idTag = document.getElementById('id-tag')
const $title = document.getElementById('title')
const $save = document.getElementById('save-btn')
const $cancel = document.getElementById('cancel-btn')
const $status = document.getElementById('status')
const $lock = document.getElementById('lock-toggle')
const $counter = document.getElementById('counter')
const $dirtyFlag = document.getElementById('dirty-flag')
const $content = document.getElementById('content')
const $toolbar = document.getElementById('toolbar')

let noteId = null
let originalTitle = ''
let originalIsPrivate = false
let dirty = false
let saving = false

function setStatus(text) { $status.textContent = text || '' }
function setDirty(d) {
  dirty = d
  $dirtyFlag.textContent = d ? '●未保存' : ''
  $dirtyFlag.className = d ? 'dirty' : ''
}
function updateCounter() {
  const t = $title.value.length
  let text = ''
  if (editor) text = editor.storage.markdown ? editor.storage.markdown.getMarkdown() : editor.getText()
  $counter.textContent = t + ' 字 · ' + text.length + ' 字符'
}
function markDirty() {
  if (!dirty) setDirty(true)
  updateCounter()
  refreshToolbarState()
}
function applyLockUI(on) {
  $lock.classList.toggle('on', !!on)
  $lock.textContent = on ? '🔒 仅本机' : '☁ 公开'
}

const editor = new Editor({
  element: $content,
  extensions: [
    StarterKit.configure({
      codeBlock: { HTMLAttributes: { class: 'code-block' } },
      heading: { levels: [1, 2, 3] },
      // Disable Link in StarterKit to use our own with autolink + safer attrs.
      link: false
    }),
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } }),
    Placeholder.configure({ placeholder: '开始记录你的笔记...' }),
    Markdown.configure({
      html: false,
      tightLists: true,
      breaks: false,
      linkify: false,
      transformPastedText: true,
      transformCopiedText: false
    })
  ],
  content: '',
  autofocus: false,
  onUpdate: () => markDirty(),

  editorProps: {
    attributes: {
      class: 'tt-content',
      spellcheck: 'false'
    }
  }
})

function refreshToolbarState() {
  if (!$toolbar) return
  $toolbar.querySelectorAll('[data-cmd]').forEach(btn => {
    const cmd = btn.dataset.cmd
    let active = false
    try {
      switch (cmd) {
        case 'bold': active = editor.isActive('bold'); break
        case 'italic': active = editor.isActive('italic'); break
        case 'strike': active = editor.isActive('strike'); break
        case 'code': active = editor.isActive('code'); break
        case 'h1': active = editor.isActive('heading', { level: 1 }); break
        case 'h2': active = editor.isActive('heading', { level: 2 }); break
        case 'h3': active = editor.isActive('heading', { level: 3 }); break
        case 'bulletList': active = editor.isActive('bulletList'); break
        case 'orderedList': active = editor.isActive('orderedList'); break
        case 'blockquote': active = editor.isActive('blockquote'); break
        case 'codeBlock': active = editor.isActive('codeBlock'); break
      }
    } catch (e) { active = false }
    btn.classList.toggle('active', active)
  })
}

// Toolbar interactions.
if ($toolbar) {
  $toolbar.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault()) // keep selection
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd
      const chain = editor.chain().focus()
      switch (cmd) {
        case 'bold': chain.toggleBold().run(); break
        case 'italic': chain.toggleItalic().run(); break
        case 'strike': chain.toggleStrike().run(); break
        case 'code': chain.toggleCode().run(); break
        case 'h1': chain.toggleHeading({ level: 1 }).run(); break
        case 'h2': chain.toggleHeading({ level: 2 }).run(); break
        case 'h3': chain.toggleHeading({ level: 3 }).run(); break
        case 'bulletList': chain.toggleBulletList().run(); break
        case 'orderedList': chain.toggleOrderedList().run(); break
        case 'blockquote': chain.toggleBlockquote().run(); break
        case 'codeBlock': chain.toggleCodeBlock().run(); break
        case 'link': promptLink(); break
        case 'hr': chain.setHorizontalRule().run(); break
      }
      refreshToolbarState()
    })
  })
  editor.on('selectionUpdate', refreshToolbarState)
}

function promptLink() {
  const prev = editor.getAttributes('link').href
  const url = window.prompt('输入链接 URL（留空可取消已有链接）:', prev || 'https://')
  if (url === null) return
  if (url === '') { editor.chain().focus().unsetLink().run(); return }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

function tryClose() {
  if (dirty) {
    const ok = window.confirm('有未保存的修改，确定关闭？')
    if (!ok) return
  }
  window.close()
}

async function save() {
  if (!noteId || saving) return
  saving = true
  $save.disabled = true
  setStatus('保存中...')
  try {
    const finalTitle = $title.value.trim() ||
      (editor.storage.markdown.getMarkdown().split('\n')[0] || '无标题').trim().slice(0, 50) ||
      '(无标题)'
    const content = editor.storage.markdown.getMarkdown()
    const result = await window.editorAPI.save({
      id: noteId,
      title: finalTitle,
      content: content,
      is_private: $lock.classList.contains('on')
    })
    if (result && result.ok) {
      originalTitle = $title.value
      originalIsPrivate = $lock.classList.contains('on')
      setDirty(false)
      setStatus('已保存')
      setTimeout(() => setStatus('就绪'), 1200)
    } else {
      setStatus('保存失败: ' + (result && result.error || '未知'))
    }
  } catch (e) {
    setStatus('保存失败: ' + e.message)
  } finally {
    saving = false
    $save.disabled = false
  }
}

$title.addEventListener('input', markDirty)
$save.addEventListener('click', save)
$cancel.addEventListener('click', tryClose)
$lock.addEventListener('click', () => {
  applyLockUI(!$lock.classList.contains('on'))
  markDirty()
})

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault(); save()
  } else if (e.key === 'Escape') {
    e.preventDefault(); tryClose()
  }
})

// Receive note from main.
if (window.editorAPI && window.editorAPI.onLoad) {
  window.editorAPI.onLoad(note => {
    if (!note) return
    noteId = note.id
    $idTag.textContent = '#' + note.id
    $title.value = note.title || ''
    applyLockUI(!!note.is_private)
    originalTitle = $title.value
    originalIsPrivate = !!note.is_private
    // Set markdown content - tiptap-markdown parses it.
    const md = note.content || ''
    editor.commands.setContent(md, false)
    setDirty(false)
    updateCounter()
    refreshToolbarState()
    // Focus at end of title if empty, otherwise into editor body.
    setTimeout(() => {
      if (!$title.value) $title.focus()
      else editor.commands.focus('end')
    }, 80)
  })
}
