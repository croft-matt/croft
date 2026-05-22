-- Thread linkage columns for emails.
-- thread_id groups emails in the same conversation, workspace-scoped.
-- Two emails with the same workspace_id and thread_id are the same conversation.
-- in_reply_to stores the RFC 822 In-Reply-To header (single Message-ID reference).
-- email_references stores the RFC 822 References header (space-separated Message-IDs).
-- Named email_references to avoid collision with the SQL reserved word "references".

alter table emails add column thread_id text;
alter table emails add column in_reply_to text;
alter table emails add column email_references text;

create index on emails(workspace_id, thread_id);
