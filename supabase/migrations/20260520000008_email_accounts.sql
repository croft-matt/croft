-- email_accounts: stores OAuth tokens for each connected Gmail account.
-- One row per connected account per workspace.
-- Tokens are AES-256-GCM encrypted in the application layer before storage.
-- access_token_encrypted and refresh_token_encrypted are nullable so that
-- revoked accounts can be flagged (null tokens) without deleting the row.
-- The UI uses null tokens as the signal to show a reconnect prompt.

create table email_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  email_address text not null,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz not null,
  scopes text[] not null,
  forwarding_configured boolean not null default false,
  history_imported boolean not null default false,
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique(workspace_id, email_address)
);

create index on email_accounts(workspace_id);
create index on email_accounts(workspace_id, provider);

alter table email_accounts enable row level security;

-- Workspace members can read their own connected accounts.
-- All mutations are performed by the service role, which bypasses RLS.
create policy "workspace members can read own email accounts"
  on email_accounts for select
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));

-- Add the outbound sending address to workspaces.
-- Format: firstname.lastname@mail.yourcroft.com
-- Generated at workspace creation, never changes.
alter table workspaces add column croft_email_address text unique;
