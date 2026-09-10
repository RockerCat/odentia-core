-- Odentia Core — base table privileges for service_role on the RIPS
-- catalog tables
--
-- Same class of gap as the three previous grant-only migrations
-- (20260826153000, 20260827130000, 20260828100000): the RIPS catalog
-- infrastructure migration (20260910090000) correctly gave
-- import_rips_{cups,diagnosis,reference_values}_catalog EXECUTE to
-- `service_role` (added in the RIPS 02A review, since a newly created
-- function's EXECUTE privilege is revoked from PUBLIC and must be
-- re-granted explicitly per role), but never granted `service_role` the
-- base table privileges (SELECT/INSERT/UPDATE) those SECURITY INVOKER
-- functions need on the 4 tables they write to. `SECURITY INVOKER` means
-- the function runs with the CALLING role's privileges — service_role's
-- own privileges — and Postgres checks table-level GRANT before it ever
-- gets anywhere near a query plan, exactly the same failure mode as the
-- three migrations above (SQLSTATE 42501, "permission denied for table
-- ..."), just for `service_role` instead of `authenticated`. Confirmed
-- live during the RIPS 02B smoke test: `import_rips_cups_catalog`
-- authenticated correctly with the service_role API key and executed
-- (EXECUTE grant working), then failed with "permission denied for table
-- rips_catalog_imports" the moment its body tried to actually touch the
-- table — proof this was a real, live-reproduced gap, not a theoretical
-- one.
--
-- No DELETE: nothing in any import_rips_*_catalog function ever deletes
-- a row (superseding a version is an UPDATE of status/valid_to, never a
-- DELETE — see 20260910090000's own design note on preserving history).
-- No grant to `authenticated`/`anon` here — this migration only restores
-- the write path that was always meant to exist for `service_role`; the
-- read-only `authenticated` policy from 20260910090000 is unaffected and
-- unchanged.
grant select, insert, update on public.rips_catalog_imports to service_role;
grant select, insert, update on public.cups_catalog to service_role;
grant select, insert, update on public.diagnosis_catalog to service_role;
grant select, insert, update on public.rips_reference_values to service_role;
