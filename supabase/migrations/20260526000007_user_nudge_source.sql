-- Adds 'user_nudge' to the emails.source check constraint.
-- Nudge emails are sent by Croft on behalf of the user and stored with
-- processing_state = 'ignored' so the AI pipeline never picks them up.
alter table emails
  drop constraint emails_source_check;

alter table emails
  add constraint emails_source_check
  check (source in ('inbound', 'user_cc', 'user_direct', 'user_nudge'));
