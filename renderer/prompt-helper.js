// Lightweight replacement for window.prompt() in Electron (which is unsupported).
// Usage: const value = await promptModal('Question?', 'default', { placeholder: '...', multiline: true })
//   returns string on OK, null on Cancel.
(function () {
  if (window.promptModal) return

  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;z-index:9999;font-family:system-ui,sans-serif;'
  overlay.innerHTML = `
    <div style="background:#1f2937;color:#fff;padding:18px 20px;border-radius:10px;min-width:320px;max-width:560px;box-shadow:0 12px 40px rgba(0,0,0,0.5);">
      <div id="__pm_q" style="font-size:13px;margin-bottom:10px;white-space:pre-wrap;"></div>
      <textarea id="__pm_i" rows="6" style="width:100%;box-sizing:border-box;padding:8px 10px;background:#111827;color:#fff;border:1px solid #374151;border-radius:6px;font:inherit;resize:vertical;"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
        <button id="__pm_cancel" style="padding:6px 14px;background:transparent;color:#fff;border:1px solid #4b5563;border-radius:6px;cursor:pointer;">取消</button>
        <button id="__pm_ok" style="padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;">确定</button>
      </div>
    </div>`
  document.body.appendChild(overlay)
  const $q = overlay.querySelector('#__pm_q')
  const $i = overlay.querySelector('#__pm_i')
  const $ok = overlay.querySelector('#__pm_ok')
  const $cancel = overlay.querySelector('#__pm_cancel')

  window.promptModal = function (question, defaultValue, opts) {
    opts = opts || {}
    return new Promise((resolve) => {
      $q.textContent = question || ''
      $i.value = defaultValue == null ? '' : String(defaultValue)
      $i.placeholder = opts.placeholder || ''
      $i.rows = opts.rows || (opts.multiline === false ? 1 : 6)
      overlay.style.display = 'flex'
      setTimeout(() => { $i.focus(); $i.select() }, 0)
      const cleanup = (val) => {
        overlay.style.display = 'none'
        $ok.removeEventListener('click', onOk)
        $cancel.removeEventListener('click', onCancel)
        $i.removeEventListener('keydown', onKey)
        overlay.removeEventListener('mousedown', onBackdrop)
        resolve(val)
      }
      const onOk = () => cleanup($i.value)
      const onCancel = () => cleanup(null)
      const onKey = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && opts.multiline !== true) { e.preventDefault(); onOk() }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }
      const onBackdrop = (e) => { if (e.target === overlay) onCancel() }
      $ok.addEventListener('click', onOk)
      $cancel.addEventListener('click', onCancel)
      $i.addEventListener('keydown', onKey)
      overlay.addEventListener('mousedown', onBackdrop)
    })
  }
})()
