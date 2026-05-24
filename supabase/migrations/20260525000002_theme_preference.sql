alter table workspace_members
  add column theme_preference text not null default 'dark'
    check (theme_preference in ('light', 'dark', 'system'));
