-- Backfill client_id for any pre-sync note. Generated from rowid.
UPDATE notes SET client_id = 'local-' || id WHERE client_id IS NULL OR client_id = '';