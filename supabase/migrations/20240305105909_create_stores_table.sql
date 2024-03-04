create table
  public.stores (
    id uuid not null default gen_random_uuid (),
    state jsonb null,
    created_at timestamp with time zone not null default now(),
    constraint stores_pkey primary key (id)
  ) tablespace pg_default;

alter table "stores" enable row level security;

create policy "Allow anonymous access"
on stores for all
to anon
using (true);

alter
  publication supabase_realtime add table stores;
