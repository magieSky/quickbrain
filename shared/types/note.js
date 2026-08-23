// QuickBrain note model - shared by client and server.
// client_id is the immutable per-device id; server uses it as the cross-device merge key.
const SYNC_COLUMNS = ['client_id', 'updated_at', 'deleted_at', 'rev']
const ATOM_FIELDS = ['parent_id', 'source_range', 'is_atom', 'extracted_at']
const OPS = ['upsert', 'delete']

function isAtomFields(field) { return ATOM_FIELDS.includes(field) }

export { SYNC_COLUMNS, ATOM_FIELDS, OPS, isAtomFields }
export default { SYNC_COLUMNS, ATOM_FIELDS, OPS, isAtomFields }