// Element Placeholder Bootstrap (runs before main.js)
//
// Some IDs that main.js getElementById()s are not present in this build's
// index.html (sync/report modal markup has been pruned in earlier refactors).
// To keep main.js from throwing `Cannot set properties of null` and stalling
// the entire script at first missing element, we inject hidden placeholders
// for every id main.js expects but is missing. main.js guards every binding
// with `if (els.X)`, so the original UI works once these are real elements.

(function() {
  const inputs = {
    'sync-server-url':       { type: 'text' },
    'sync-username':         { type: 'text', autocomplete: 'username' },
    'sync-password':         { type: 'password' },
    'sync-token-server-url': { type: 'text' },
    'sync-token':            { type: 'password' },
    'report-urls':           { type: 'textarea' },
    'report-prompt':         { type: 'textarea' }
  }
  const fileInputs = new Set(['report-files'])
  const checkboxes = new Set(['settings-default-private'])
  const buttons = new Set(['ai-cancel','ai-test','ai-save','sync-cancel','sync-submit-signup','sync-submit-signin','sync-disconnect','sync-open-ai-settings','sync-use-default-url','sync-tab-signup','sync-tab-signin','report-cancel','report-copy','report-save','report-generate','embedding-toggle','embedding-use-default','embedding-test','embedding-save'])
  // 33 IDs missing in this build.
  const ids = [
    'report-modal','report-meta','report-source-count','report-source-list',
    'report-note-search','report-urls','report-prompt','report-files','report-file-list',
    'report-stream','report-stats','ai-status','ai-cancel','ai-test','ai-save',
    'sync-modal','sync-status-box','sync-status-line','sync-disconnect',
    'sync-tab-signup','sync-tab-signin','sync-pane-signup','sync-pane-signin',
    'sync-server-url','sync-username','sync-password','sync-token-server-url','sync-token',
    'sync-feedback-signup','sync-feedback-signin','sync-cancel',
    'sync-submit-signup','sync-submit-signin',
    'sync-open-ai-settings','sync-use-default-url',
    'settings-default-private','privacy-block','key-link'
  ]
  for (const id of ids) {
    if (document.getElementById(id)) continue
    let el
    if (inputs[id]) {
      const cfg = inputs[id]
      if (cfg.type === 'textarea') { el = document.createElement('textarea') }
      else { el = document.createElement('input'); el.type = cfg.type }
      if (cfg.autocomplete) el.autocomplete = cfg.autocomplete
    } else if (fileInputs.has(id)) {
      el = document.createElement('input')
      el.type = 'file'
      el.multiple = true
    } else if (checkboxes.has(id)) {
      el = document.createElement('input')
      el.type = 'checkbox'
    } else if (buttons.has(id)) {
      el = document.createElement('button')
      el.type = 'button'
    } else {
      el = document.createElement('div')
    }
    el.id = id
    el.style.display = 'none'
    document.body.appendChild(el)
  }
})()