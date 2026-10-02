-- Bolsa — esquema de persistencia por usuario (watchlist, presets, notas).
-- Pegar completo en Supabase > SQL Editor y ejecutar. Es idempotente.

create table if not exists public.watchlist (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker text not null check (ticker ~ '^\^?[A-Z0-9][A-Z0-9.-]{0,9}$'),
  created_at timestamptz not null default now(),
  unique (user_id, ticker)
);

create table if not exists public.presets (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  filtros jsonb not null check (jsonb_typeof(filtros) = 'object' and pg_column_size(filtros) <= 8192),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.notes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker text check (ticker is null or ticker ~ '^\^?[A-Z0-9][A-Z0-9.-]{0,9}$'),
  contenido text not null check (char_length(contenido) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists notes_user_created_idx on public.notes (user_id, created_at desc);

alter table public.watchlist enable row level security;
alter table public.presets enable row level security;
alter table public.notes enable row level security;

revoke all on public.watchlist, public.presets, public.notes from anon;
grant select, insert, update, delete on public.watchlist, public.presets, public.notes to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['watchlist', 'presets', 'notes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end
$$;
