-- Agent can be assigned by admin. New enum value must land before functions that use it.
alter type public.platform_role add value if not exists 'agent';
