// Global state
let currentCategory = 'all';
let notes = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadNotes();
  setupKeyboardShortcuts();
});

// Load notes from backend
async function loadNotes() {
  try {
    notes = await window.quickbrain.getNotes({ category: currentCategory });
    renderNotes();
  } catch (error) {
    console.error('Failed to load notes:', error);
    showToast('加载失败', 'error');
  }
}

// Render notes list
function renderNotes() {
  const container = document.getElementById('notesList');
  const emptyState = document.getElementById('emptyState');
  
  if (notes.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }
  
  emptyState.style.display = 'none';
  container.innerHTML = notes.map(note => `
    <div class="note-card" onclick="viewNote(${note.id})">
      <div class="note-header">
        <div class="note-title">${escapeHtml(note.title || '无标题')}</div>
        <span class="note-category">${escapeHtml(note.category)}</span>
      </div>
      <div class="note-content">${escapeHtml(note.content)}</div>
      <div class="note-meta">
        <div class="note-tags">
          ${(note.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
        <div class="note-date">${formatDate(note.created_at)}</div>
        <div class="note-actions">
          <button class="action-btn" onclick="event.stopPropagation(); editNote(${note.id})" title="编辑">✏️</button>
          <button class="action-btn" onclick="event.stopPropagation(); deleteNote(${note.id})" title="删除">🗑️</button>
          <button class="action-btn" onclick="event.stopPropagation(); formatNote(${note.id})" title="AI格式化">✨</button>
        </div>
      </div>
    </div>
  `).join('');
}

// Search handler
function handleSearch(event) {
  const query = event.target.value.trim();
  const clearBtn = document.getElementById('clearSearch');
  clearBtn.style.display = query ? 'block' : 'none';
  
  if (query) {
    searchNotes(query);
  } else {
    loadNotes();
  }
}

async function searchNotes(query) {
  try {
    const results = await window.quickbrain.getNotes({ search: query, category: currentCategory });
    notes = results;
    renderNotes();
  } catch (error) {
    console.error('Search failed:', error);
  }
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearch').style.display = 'none';
  loadNotes();
}

// Filter by category
function filterByCategory(category) {
  currentCategory = category;
  
  // Update UI
  document.querySelectorAll('.filter-tag').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });
  
  loadNotes();
}

// Show/hide add dialog
function showAddDialog() {
  document.getElementById('addDialog').style.display = 'flex';
  document.getElementById('noteContent').focus();
}

function closeAddDialog() {
  document.getElementById('addDialog').style.display = 'none';
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteContent').value = '';
  document.getElementById('noteTags').value = '';
}

// Save note
async function saveNote() {
  const content = document.getElementById('noteContent').value.trim();
  if (!content) {
    showToast('请输入内容', 'error');
    return;
  }
  
  const noteData = {
    content,
    title: document.getElementById('noteTitle').value.trim(),
    category: document.getElementById('noteCategory').value,
    tags: document.getElementById('noteTags').value
      .split(',')
      .map(t => t.trim())
      .filter(t => t)
  };
  
  try {
    await window.quickbrain.addNote(noteData);
    closeAddDialog();
    loadNotes();
    showToast('保存成功', 'success');
  } catch (error) {
    console.error('Save failed:', error);
    showToast('保存失败', 'error');
  }
}

// Edit note
async function editNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  
  const newContent = await promptModal('编辑内容:', note.content, { multiline: true });
  if (newContent && newContent.trim() !== note.content) {
    try {
      await window.quickbrain.updateNote({ id, content: newContent.trim() });
      loadNotes();
      showToast('更新成功', 'success');
    } catch (error) {
      showToast('更新失败', 'error');
    }
  }
}

// Delete note
async function deleteNote(id) {
  if (!confirm('确定要删除这条笔记吗？')) return;
  
  try {
    await window.quickbrain.deleteNote(id);
    loadNotes();
    showToast('已删除', 'success');
  } catch (error) {
    showToast('删除失败', 'error');
  }
}

// View note
function viewNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  
  const tags = (note.tags || []).join(', ') || '无标签';
  alert(`标题: ${note.title || '无标题'}\n分类: ${note.category}\n标签: ${tags}\n\n内容:\n${note.content}`);
}

// AI Format note
async function formatNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  
  const styleMap = { '1': 'summary', '2': 'structured', '3': 'tags', '4': 'mindmap' };
  const styleInput = await promptModal('选择格式化方式:\n1-摘要整理\n2-结构化输出\n3-标签分类\n4-思维导图\n请输入数字:', '1', { multiline: false });
  
  if (!styleInput) return;
  
  const selectedStyle = styleMap[styleInput] || 'summary';
  
  try {
    showToast('正在格式化...', 'success');
    const result = await window.quickbrain.formatWithAI({ 
      content: note.content, 
      style: selectedStyle 
    });
    
    if (result.success) {
      await window.quickbrain.updateNote({ 
        id, 
        content: result.formattedContent,
        is_formatted: 1
      });
      
      loadNotes();
      showToast('格式化完成', 'success');
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Format failed:', error);
    showToast(error.message || '格式化失败', 'error');
  }
}

// Format dialog (for manual input)
function showFormatDialog() {
  document.getElementById('formatDialog').style.display = 'flex';
  
  // Populate note select
  const select = document.getElementById('formatNoteSelect');
  select.innerHTML = '<option value="">-- 请选择 --</option>' +
    notes.map(n => `<option value="${n.id}">${n.title || '无标题'} (${n.category})</option>`).join('');
}

function closeFormatDialog() {
  document.getElementById('formatDialog').style.display = 'none';
  document.getElementById('formatContent').value = '';
}

// Format with AI (manual input)
async function formatWithAI() {
  const selectValue = document.getElementById('formatNoteSelect').value;
  const manualContent = document.getElementById('formatContent').value.trim();
  const style = document.getElementById('formatStyle').value;
  
  let content = manualContent;
  let noteId = null;
  
  if (!content && selectValue) {
    const note = notes.find(n => n.id === parseInt(selectValue));
    if (note) {
      content = note.content;
      noteId = note.id;
    }
  }
  
  if (!content) {
    showToast('请先选择笔记或输入内容', 'error');
    return;
  }
  
  const formatBtn = document.getElementById('formatBtn');
  formatBtn.disabled = true;
  formatBtn.innerHTML = '<span class="loading"></span> 处理中...';
  
  try {
    const result = await window.quickbrain.formatWithAI({ content, style });
    
    if (result.success) {
      if (noteId) {
        await window.quickbrain.updateNote({ id: noteId, content: result.formattedContent });
      }
      showToast('格式化完成', 'success');
      closeFormatDialog();
      loadNotes();
      
      alert(`格式化结果 (${style}):\n\n${result.formattedContent}`);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Format failed:', error);
    showToast(error.message || '格式化失败', 'error');
  } finally {
    formatBtn.disabled = false;
    formatBtn.textContent = '开始格式化';
  }
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+Alt+N - Add new note
    if (e.ctrlKey && e.altKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      showAddDialog();
    }
    
    // Ctrl+F - Format with AI
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      showFormatDialog();
    }
    
    // Escape - Close dialogs
    if (e.key === 'Escape') {
      closeAddDialog();
      closeFormatDialog();
    }
    
    // Ctrl+K or / - Focus search
    if ((e.ctrlKey && e.key.toLowerCase() === 'k') || (e.key === '/' && !e.ctrlKey)) {
      e.preventDefault();
      document.getElementById('searchInput').focus();
    }
  });
}

// Window controls
function minimizeWindow() {
  require('electron').remote.getCurrentWindow().minimize();
}

function closeWindow() {
  require('electron').remote.getCurrentWindow().hide();
}

function openSettings() {
  require('electron').remote.getCurrentWindow().webContents.send('open-settings');
}



// AI Settings dialog
async function openAISettingsDialog() {
  document.getElementById("aiDialog").style.display = "flex";
  try {
    const r = await window.quickbrain.getAIMode();
    document.getElementById(r.mode === "server" ? "aiModeServer" : "aiModeDirect").checked = true;
    document.getElementById("aiServerStatus").textContent = r.serverConfigured
      ? "Server is configured (sync enabled). Server mode will route AI calls to /v1/ai/*."
      : "Server NOT configured. Enable sync in Sync Settings first.";
    try {
      const cfg = await window.quickbrain.getAIConfig();
      document.getElementById("aiDirectStatus").textContent = cfg && cfg.provider
        ? ("Direct: provider=" + cfg.provider + ", model=" + (cfg.model || "default"))
        : "Direct: no AI config. Set provider + apiKey via main-preload.getAIConfig/saveAIConfig.";
    } catch (e) {
      document.getElementById("aiDirectStatus").textContent = "Direct: " + e.message;
    }
  } catch (e) { showToast("Open failed: " + e.message, "error"); }
}
function closeAISettingsDialog() { document.getElementById("aiDialog").style.display = "none"; }
async function saveAIMode() {
  const mode = document.getElementById("aiModeServer").checked ? "server" : "direct";
  try {
    const r = await window.quickbrain.setAIMode(mode);
    showToast("AI mode: " + r.mode, "success");
    closeAISettingsDialog();
  } catch (e) { showToast("Save failed: " + e.message, "error"); }
}

// Sync dialog
async function openSyncDialog() {
  document.getElementById("syncDialog").style.display = "flex";
  try {
    const c = await window.quickbrain.getSyncConfig();
    document.getElementById("syncServerUrl").value = c.serverUrl || "";
  } catch (e) { console.error(e) }
  await refreshSyncStatus();
}
function closeSyncDialog() { document.getElementById("syncDialog").style.display = "none"; }
async function refreshSyncStatus() {
  const el = document.getElementById("syncStatus");
  el.textContent = "Loading...";
  try {
    const s = await window.quickbrain.syncStatus();
    el.textContent = (s.enabled ? "ENABLED" : "DISABLED") + ", pending=" + (s.pending || 0) + ", cursor=" + (s.lastPullCursor || 0);
  } catch (e) { el.textContent = "Error: " + e.message; }
}
async function saveSyncConfig() {
  const serverUrl = document.getElementById("syncServerUrl").value.trim();
  const token = document.getElementById("syncToken").value;
  const deviceName = document.getElementById("syncDeviceName").value.trim();
  if (!serverUrl) { showToast("Server URL required", "error"); return; }
  const payload = { enabled: true, serverUrl };
  if (token) payload.token = token;
  if (deviceName) payload.deviceName = deviceName;
  try {
    await window.quickbrain.setSyncConfig(payload);
    showToast("Sync enabled", "success");
    document.getElementById("syncToken").value = "";
    await refreshSyncStatus();
  } catch (e) { showToast("Save failed: " + e.message, "error"); }
}
async function disableSync() {
  if (!confirm("Disable sync? Local notes will not be pushed.")) return;
  try { await window.quickbrain.setSyncConfig({ enabled: false }); showToast("Sync disabled", "success"); await refreshSyncStatus(); }
  catch (e) { showToast("Disable failed: " + e.message, "error"); }
}
async function pullNow() {
  try { const r = await window.quickbrain.pullNow(); showToast(r.ok ? "Pull done" : ("Pull failed: " + r.error), r.ok ? "success" : "error"); await refreshSyncStatus(); }
  catch (e) { showToast("Pull error: " + e.message, "error"); }
}
async function pushLocal() {
  try { const r = await window.quickbrain.pushLocal(); showToast(r.ok ? ("Pushed " + r.accepted + " ops") : ("Push failed: " + r.error), r.ok ? "success" : "error"); await refreshSyncStatus(); }
  catch (e) { showToast("Push error: " + e.message, "error"); }
}
async function pushAll() {
  if (!confirm("Push ALL local notes to server? Existing remote notes will get LWW-merged.")) return;
  try { const r = await window.quickbrain.pushAll(); showToast(r.ok ? ("Pushed " + r.accepted + " notes (" + r.conflicts + " conflicts)") : ("Failed: " + r.error), r.ok ? "success" : "error"); await refreshSyncStatus(); }
  catch (e) { showToast("Push error: " + e.message, "error"); }
}

// Toast notification
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  
  return date.toLocaleDateString('zh-CN');
}
