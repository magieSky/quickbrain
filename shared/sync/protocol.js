import { OPS } from '../types/note.js'

function fail(msg) { return msg }

function validatePull(body) {
  if (!body || typeof body !== 'object') return fail('body-required')
  if (!Number.isFinite(body.since) || body.since < 0) return fail('since-invalid')
  if (!Number.isFinite(body.limit) || body.limit < 1 || body.limit > 1000) return fail('limit-invalid')
  return null
}

function validatePushOps(ops) {
  const errs = []
  if (!Array.isArray(ops)) { errs.push('ops-must-be-array'); return errs }
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (!op || typeof op !== 'object' || !OPS.includes(op.op)) { errs.push(`op[${i}].op-invalid`); continue }
    if (op.op === 'upsert') {
      if (!op.note || typeof op.note !== 'object') { errs.push(`op[${i}].note-required`); continue }
      const n = op.note
      if (typeof n.client_id !== 'string' || !n.client_id) { errs.push(`op[${i}].client_id-required`); continue }
      if (!Number.isFinite(n.updated_at)) { errs.push(`op[${i}].updated_at-required`); continue }
      if (!Number.isFinite(n.rev)) { errs.push(`op[${i}].rev-required`); continue }
      if (typeof n.content !== 'string') { errs.push(`op[${i}].content-required`) }
    } else { // delete
      if (typeof op.client_id !== 'string' || !op.client_id) errs.push(`op[${i}].client_id-required`)
      if (!Number.isFinite(op.updated_at)) errs.push(`op[${i}].updated_at-required`)
    }
  }
  return errs
}

export { validatePull, validatePushOps }
export default { validatePull, validatePushOps }