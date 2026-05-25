-- Contact identity layer.
-- Adds a person grouping above the contacts table so the same human appearing
-- under multiple email addresses is understood as one contact rather than several.
-- This is a suggest-and-accept layer only: identity is never assigned automatically.

create table contact_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  canonical_name text,
  canonical_organisation text,
  -- The contact whose address is treated as the primary one for this person.
  -- on delete set null so removing a contact never cascades into removing the identity.
  primary_contact_id uuid references contacts(id) on delete set null,
  -- When true the canonical_name was set by the user and must never be auto-changed.
  name_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Link each contact to at most one identity.
-- on delete set null so removing an identity never removes the contact rows.
alter table contacts
  add column identity_id uuid references contact_identities(id) on delete set null;

create index on contacts(workspace_id, identity_id);

-- Stores matcher suggestions and human decisions.
-- contact_id_low < contact_id_high (UUID string order) ensures each pair is
-- stored once regardless of which contact the matcher saw first.
-- The unique constraint makes a dismissed pair a durable do-not-merge record.
create table contact_merge_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id_low uuid not null references contacts(id) on delete cascade,
  contact_id_high uuid not null references contacts(id) on delete cascade,
  score float not null,
  signals jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(workspace_id, contact_id_low, contact_id_high)
);

create index on contact_merge_candidates(workspace_id, status);

alter table contact_identities enable row level security;
alter table contact_merge_candidates enable row level security;

create policy "workspace members manage contact_identities"
  on contact_identities for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));

create policy "workspace members manage contact_merge_candidates"
  on contact_merge_candidates for all
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));
