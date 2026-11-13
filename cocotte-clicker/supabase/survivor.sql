-- Co'Clicker : Co'Survivor — classement de la meilleure survie, vérifié par l'horloge du serveur
-- À exécuter une fois dans Supabase → SQL Editor, après les autres scripts.
--
-- Le serveur ouvre chaque partie (surv_start) et la ferme (surv_end) avec SA propre heure :
-- impossible d'annoncer plus de temps de survie que le temps réellement écoulé, ni de réutiliser une partie.
-- Ennemis éliminés plafonnés selon la durée. Une annonce impossible est signalée (sans exclusion automatique).

create table if not exists public.surv_runs (
  id         uuid primary key default gen_random_uuid(),
  player_id  text not null references public.players(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended      boolean not null default false
);
create index if not exists surv_runs_player on public.surv_runs (player_id, started_at desc);

create table if not exists public.surv_best (
  player_id text primary key references public.players(id) on delete cascade,
  time_s    int not null default 0,     -- secondes survécues (900 = victoire)
  kills     int not null default 0,
  level     int not null default 0,
  runs      int not null default 0,
  at        timestamptz not null default now()
);
alter table public.surv_runs enable row level security;
alter table public.surv_best enable row level security;
revoke all on public.surv_runs, public.surv_best from anon, authenticated;

-- Début de partie : renvoie le numéro de partie
create or replace function public.surv_start(p_id text, p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players; rid uuid;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if p.banned then return json_build_object('ok', false, 'error', 'banned'); end if;
  delete from surv_runs where player_id = p_id and started_at < now() - interval '1 day';
  if (select count(*) from surv_runs where player_id = p_id and not ended and started_at > now() - interval '1 hour') >= 20 then
    return json_build_object('ok', false, 'error', 'busy');
  end if;
  insert into surv_runs (player_id) values (p_id) returning id into rid;
  return json_build_object('ok', true, 'run', rid);
end $$;

-- Fin de partie : temps plafonné au temps réel écoulé (+5 s de marge réseau) et à 15 min
create or replace function public.surv_end(p_id text, p_token text, p_run uuid, p_time int, p_kills int, p_level int)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players; r surv_runs; real_s double precision; t int; k int; lv int; b surv_best; rec boolean := false;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if p.banned then return json_build_object('ok', false, 'error', 'banned'); end if;
  select * into r from surv_runs where id = p_run and player_id = p_id for update;
  if not found or r.ended then return json_build_object('ok', false, 'error', 'run'); end if;
  update surv_runs set ended = true where id = p_run;
  real_s := extract(epoch from now() - r.started_at);
  t := least(greatest(coalesce(p_time, 0), 0), floor(real_s + 5)::int, 900);
  k := least(greatest(coalesce(p_kills, 0), 0), 20 * t + 50);
  lv := least(greatest(coalesce(p_level, 1), 1), 1 + t / 4);
  if coalesce(p_time, 0) > real_s + 30 or coalesce(p_kills, 0) > 20 * coalesce(p_time, 0) + 200 or coalesce(p_time, 0) > 960 then
    perform _flag(p_id, 'survivor', 'Co''Survivor : ' || p_time || ' s et ' || p_kills || ' éliminés annoncés pour ' || round(real_s) || ' s réelles');
  end if;
  insert into surv_best (player_id) values (p_id) on conflict do nothing;
  select * into b from surv_best where player_id = p_id for update;
  if t > b.time_s or (t = b.time_s and k > b.kills) then
    rec := b.runs > 0 or t > 0;
    update surv_best set time_s = t, kills = k, level = lv, at = now(), runs = runs + 1 where player_id = p_id;
  else
    update surv_best set runs = runs + 1 where player_id = p_id;
  end if;
  return json_build_object('ok', true, 'time', t, 'kills', k, 'record', rec);
end $$;

-- Classement : meilleure survie, puis le plus d'éliminations
create or replace function public.surv_board(p_id text default null, p_limit int default 10)
returns json language sql security definer set search_path = public as $$
  with rows as (
    select b.player_id, case when pl.pseudo = '' then 'Anonyme' else pl.pseudo end as pseudo, pl.listed, b.time_s, b.kills, b.level,
           row_number() over (order by b.time_s desc, b.kills desc, b.at) as rank
    from surv_best b join players pl on pl.id = b.player_id
    where not pl.banned and b.time_s > 0)
  select json_build_object(
    'players', (select count(*) from rows),
    'top', coalesce((select json_agg(json_build_object('rank', rank, 'pseudo', pseudo, 'time', time_s, 'kills', kills, 'me', player_id = p_id) order by rank)
                     from (select * from rows where listed or player_id = p_id order by rank limit least(greatest(coalesce(p_limit, 10), 1), 50)) t), '[]'),
    'me', (select json_build_object('rank', rank, 'time', time_s, 'kills', kills) from rows where player_id = p_id)) $$;

revoke all on function public.surv_start(text, text), public.surv_end(text, text, uuid, int, int, int), public.surv_board(text, int) from public;
grant execute on function public.surv_start(text, text), public.surv_end(text, text, uuid, int, int, int), public.surv_board(text, int) to anon, authenticated;
