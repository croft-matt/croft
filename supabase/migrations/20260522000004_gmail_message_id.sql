-- Store the Gmail internal message ID so attachment bytes can be fetched later.
-- The message_id column stores the RFC 2822 Message-ID header. This is different:
-- gmail_message_id is the ID used by the Gmail API (e.g. 18f3b2c4d5e6a7b8).
alter table emails add column if not exists gmail_message_id text;

create index if not exists emails_gmail_message_id_idx
  on emails(gmail_message_id)
  where gmail_message_id is not null;
