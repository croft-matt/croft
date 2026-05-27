-- Grant table-level privileges that were missing from the original notifications migration.
-- "permission denied for table notifications" means the authenticated role had no SELECT grant.
grant select, update on notifications to authenticated;
grant insert, select, update, delete on notifications to service_role;
