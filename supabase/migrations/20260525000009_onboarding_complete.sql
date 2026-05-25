-- Tracks whether the first-run onboarding pipeline has completed for this workspace.
-- Set to true by processQueuedEmails once all imported emails reach a terminal state
-- and the processing_complete Realtime event is broadcast.
-- The middleware reads this column to gate cockpit access and route users to
-- /onboarding/processing if they land on / before onboarding is done.
ALTER TABLE workspaces
  ADD COLUMN onboarding_complete boolean NOT NULL DEFAULT false;
