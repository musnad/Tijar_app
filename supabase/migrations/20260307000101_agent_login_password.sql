-- Keep the agent-created shop password on the shop so admin and the agent can read it.

alter table public.businesses
  add column if not exists agent_login_password text;

notify pgrst, 'reload schema';
