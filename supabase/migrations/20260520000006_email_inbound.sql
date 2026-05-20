-- Add a unique receiving address to each workspace so inbound emails
-- can be routed to the correct workspace.
-- Format: <workspace-slug>@inbound.yourcroft.com
alter table workspaces add column receiving_address text unique;

-- Store the Resend-specific email ID alongside the standard message_id.
-- Used to fetch the full email body from the Resend API after the webhook fires.
alter table emails add column resend_email_id text;
create index on emails(resend_email_id);
