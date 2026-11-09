-- Let the Tijar Android app hear new inbox rows immediately (sale sound / OS popup).
do $$
begin
  alter publication supabase_realtime add table public.activity_notifications;
exception
  when duplicate_object then null;
end
$$;
