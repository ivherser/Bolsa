-- Verifica RLS de schema.sql: cada usuario solo ve/modifica sus filas y anon no accede.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

create function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FALLO: % debía fallar', label;
exception
  when insufficient_privilege or check_violation then
    raise notice 'ok: %', label;
end
$$;

create function pg_temp.expect_count(stmt text, expected bigint, label text) returns void
language plpgsql as $$
declare
  n bigint;
begin
  execute stmt into n;
  if n is distinct from expected then
    raise exception 'FALLO: % (esperado %, obtenido %)', label, expected, n;
  end if;
  raise notice 'ok: %', label;
end
$$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- Usuario A crea datos (user_id por defecto = auth.uid()).
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.watchlist (ticker) values ('SPY'), ('AAPL');
insert into public.presets (name, filtros) values ('Mi CSP', '{"dte_min": 21}');
insert into public.notes (ticker, contenido) values ('SPY', 'Nota de A');
select pg_temp.expect_count('select count(*) from public.watchlist', 2, 'A ve su watchlist');
select pg_temp.expect_error(
  $q$insert into public.notes (user_id, contenido) values ('00000000-0000-0000-0000-00000000000b', 'x')$q$,
  'A no puede insertar a nombre de B');
select pg_temp.expect_error(
  $q$insert into public.watchlist (ticker) values ('spy; drop')$q$, 'ticker inválido rechazado');

-- Usuario B no ve ni modifica los datos de A.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_count('select count(*) from public.watchlist', 0, 'B no ve watchlist de A');
select pg_temp.expect_count('select count(*) from public.presets', 0, 'B no ve presets de A');
select pg_temp.expect_count('select count(*) from public.notes', 0, 'B no ve notas de A');
select pg_temp.expect_count(
  $q$with u as (update public.notes set contenido = 'hack' returning 1) select count(*) from u$q$,
  0, 'B no puede editar notas de A');
select pg_temp.expect_count(
  $q$with d as (delete from public.watchlist returning 1) select count(*) from d$q$,
  0, 'B no puede borrar watchlist de A');
insert into public.watchlist (ticker) values ('SPY');
select pg_temp.expect_count('select count(*) from public.watchlist', 1, 'B tiene su propio SPY');

-- A no puede reasignar sus filas a B.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect_error(
  $q$update public.presets set user_id = '00000000-0000-0000-0000-00000000000b'$q$,
  'A no puede reasignar presets a B');
select pg_temp.expect_count(
  $q$select count(*) from public.notes where contenido = 'Nota de A'$q$, 1, 'nota de A intacta');

-- anon no tiene acceso.
reset role;
set role anon;
select pg_temp.expect_error('select count(*) from public.watchlist', 'anon sin acceso a watchlist');
select pg_temp.expect_error('select count(*) from public.notes', 'anon sin acceso a notes');
reset role;
\echo 'RLS OK'
