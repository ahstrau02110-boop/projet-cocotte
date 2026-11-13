-- Co'Clicker : Ligue classée — une partie calculée ENTIÈREMENT par le serveur
-- À exécuter une fois dans Supabase → SQL Editor, après les autres scripts.
--
-- Le jeu n'envoie que des actions (« j'ai cliqué 12 fois », « j'achète 10 Établis »). Le serveur vérifie
-- chacune (vitesse de clic humaine, Co'Coins suffisants) et calcule lui-même la production avec SON heure.
-- Aucune valeur envoyée par le navigateur n'est crue : il est impossible d'injecter des Co'Coins.
-- Chaque lundi, tout le monde repart de zéro ; les meilleurs de la semaine reçoivent des cristaux.

-- Bâtiments de la Ligue (copie de data/buildings.json)
create table if not exists public.ranked_buildings (
  id text primary key, ord int not null, base_cost double precision not null, base_cps double precision not null, name text not null);
insert into public.ranked_buildings (id, ord, base_cost, base_cps, name) values
  ('benevole', 0, 15, 0.1, 'Bénévole bricoleur·euse'),
  ('etabli', 1, 100, 1, 'Établi'),
  ('bricolcafe', 2, 1100, 8, 'Bricol''Café'),
  ('pc', 3, 12000, 47, 'Poste informatique'),
  ('imprimante3d', 4, 130000, 260, 'Imprimante 3D'),
  ('graveuse', 5, 1.4e+06, 1400, 'Graveuse laser'),
  ('brodeuse', 6, 2e+07, 7800, 'Brodeuse numérique'),
  ('ateliernum', 7, 3.3e+08, 44000, 'Atelier numérique'),
  ('evenements', 8, 5.1e+09, 260000, 'Soirée événement'),
  ('tournee', 9, 7.5e+10, 1.6e+06, 'Tournée itinérante'),
  ('partenaires', 10, 1e+12, 1e+07, 'Réseau de partenaires'),
  ('rayonnement', 11, 1.4e+13, 6.5e+07, 'Rayonnement du Vermandois'),
  ('festival', 12, 2e+14, 4.3e+08, 'Festival Co''Cotte'),
  ('reseau', 13, 3.3e+15, 2.9e+09, 'Réseau des tiers-lieux'),
  ('radio', 14, 5e+16, 2e+10, 'Radio Co''Cotte'),
  ('fabbus', 15, 8e+17, 1.4e+11, 'Fab''Bus'),
  ('campus', 16, 1.3e+19, 1e+12, 'Campus des makers'),
  ('constellation', 17, 2.2e+20, 7e+12, 'Constellation des tiers-lieux')
on conflict (id) do update set ord = excluded.ord, base_cost = excluded.base_cost, base_cps = excluded.base_cps, name = excluded.name;
alter table public.ranked_buildings enable row level security;
revoke all on public.ranked_buildings from anon, authenticated;

-- Partie de la semaine de chaque joueur
create table if not exists public.ranked (
  player_id text primary key,
  week      text not null,
  coins     double precision not null default 0,
  lifetime  double precision not null default 0,
  buildings jsonb not null default '{}'::jsonb,
  cps       double precision not null default 0,
  clicks    bigint not null default 0,
  last_tick timestamptz not null default now(),
  bucket    double precision not null default 30,         -- réserve de clics (anti clic automatique)
  bucket_at timestamptz not null default now()
);
create table if not exists public.ranked_history (
  player_id text not null, week text not null, lifetime double precision not null, claimed boolean not null default false,
  primary key (player_id, week));
alter table public.ranked enable row level security;
alter table public.ranked_history enable row level security;
revoke all on public.ranked, public.ranked_history from anon, authenticated;

create or replace function public._week_prev() returns text language sql stable as $$
  select 'w:' || to_char((now() at time zone 'Europe/Paris') - interval '7 days', 'IYYY-IW') $$;

-- Production/s : bâtiments × paliers (×2 à 10, 25, 50, 100, 150 et 200 exemplaires)
create or replace function public._ranked_cps(b jsonb) returns double precision language sql stable set search_path = public as $$
  select coalesce(sum(n * rb.base_cps * power(2, (n >= 10)::int + (n >= 25)::int + (n >= 50)::int + (n >= 100)::int + (n >= 150)::int + (n >= 200)::int)), 0)
  from ranked_buildings rb cross join lateral (select coalesce((b ->> rb.id)::double precision, 0) as n) x $$;

-- Charge la partie du joueur : nouvelle semaine → archive et repart de zéro ; puis production depuis la dernière visite (12 h max)
create or replace function public._ranked_load(p_id text) returns public.ranked language plpgsql security definer set search_path = public as $$
declare r ranked; dt double precision;
begin
  select * into r from ranked where player_id = p_id for update;
  if not found then
    insert into ranked (player_id, week) values (p_id, _week()) returning * into r;
  elsif r.week <> _week() then
    insert into ranked_history (player_id, week, lifetime) values (p_id, r.week, r.lifetime) on conflict do nothing;
    update ranked set week = _week(), coins = 0, lifetime = 0, buildings = '{}', cps = 0, clicks = 0, last_tick = now(), bucket = 30, bucket_at = now()
      where player_id = p_id returning * into r;
  end if;
  dt := least(extract(epoch from now() - r.last_tick), 43200);
  if dt > 0 then
    update ranked set coins = coins + cps * dt, lifetime = lifetime + cps * dt, last_tick = now() where player_id = p_id returning * into r;
  end if;
  return r;
end $$;

create or replace function public._ranked_json(r public.ranked) returns json language sql stable as $$
  select json_build_object('ok', true, 'week', r.week, 'coins', r.coins, 'lifetime', r.lifetime, 'cps', r.cps, 'buildings', r.buildings,
    'clicks', r.clicks, 'click_value', 1 + r.cps * 0.02, 'server_time', now()) $$;

-- État de la partie classée
create or replace function public.ranked_state(p_id text, p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if p.banned then return json_build_object('ok', false, 'error', 'banned'); end if;
  return _ranked_json(_ranked_load(p_id));
end $$;

-- Clics : au plus 15 par seconde (réserve de 30), chaque clic vaut 1 + 2 % de la production/s
create or replace function public.ranked_click(p_id text, p_token text, p_n int)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players; r ranked; n int; b double precision; cv double precision;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if p.banned then return json_build_object('ok', false, 'error', 'banned'); end if;
  r := _ranked_load(p_id);
  b := least(30, r.bucket + extract(epoch from now() - r.bucket_at) * 15);
  n := least(greatest(coalesce(p_n, 0), 0), floor(b)::int);
  if coalesce(p_n, 0) > 60 then perform _flag(p_id, 'clics', 'Ligue classée : ' || p_n || ' clics annoncés en un envoi'); end if;
  cv := 1 + r.cps * 0.02;
  update ranked set coins = coins + n * cv, lifetime = lifetime + n * cv, clicks = clicks + n, bucket = b - n, bucket_at = now()
    where player_id = p_id returning * into r;
  return _ranked_json(r);
end $$;

-- Achat de bâtiments (×1, ×10 ou ×100) : coût calculé par le serveur
create or replace function public.ranked_buy(p_id text, p_token text, p_building text, p_qty int)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players; r ranked; rb ranked_buildings; n double precision; q int; cost double precision; nb jsonb;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if p.banned then return json_build_object('ok', false, 'error', 'banned'); end if;
  q := case when p_qty in (1, 10, 100) then p_qty else 1 end;
  select * into rb from ranked_buildings where id = p_building;
  if not found then return json_build_object('ok', false, 'error', 'building'); end if;
  r := _ranked_load(p_id);
  n := coalesce((r.buildings ->> rb.id)::double precision, 0);
  cost := ceil(rb.base_cost * power(1.15, n) * (power(1.15, q) - 1) / 0.15);
  if r.coins < cost then return json_build_object('ok', false, 'error', 'coins', 'state', _ranked_json(r)); end if;
  nb := jsonb_set(r.buildings, array[rb.id], to_jsonb(n + q));
  update ranked set coins = coins - cost, buildings = nb, cps = _ranked_cps(nb) where player_id = p_id returning * into r;
  return _ranked_json(r);
end $$;

-- Classement de la semaine (production comptée jusqu'à maintenant) + rang du joueur
create or replace function public.ranked_board(p_id text default null, p_limit int default 20)
returns json language sql security definer set search_path = public as $$
  with live as (
    select k.player_id, case when pl.pseudo = '' then 'Anonyme' else pl.pseudo end as pseudo, pl.listed,
           k.lifetime + k.cps * least(extract(epoch from now() - k.last_tick), 43200) as score
    from ranked k join players pl on pl.id = k.player_id
    where k.week = _week() and not pl.banned),
  ranked_rows as (select *, row_number() over (order by score desc) as rank from live)
  select json_build_object(
    'week', _week(),
    'players', (select count(*) from live),
    'top', coalesce((select json_agg(json_build_object('rank', rank, 'pseudo', pseudo, 'score', score, 'me', player_id = p_id) order by rank)
                     from (select * from ranked_rows where listed or player_id = p_id order by rank limit least(greatest(coalesce(p_limit, 20), 1), 50)) t), '[]'),
    'me', (select json_build_object('rank', rank, 'score', score) from ranked_rows where player_id = p_id)) $$;

-- Résultat de la semaine dernière et récompense
create or replace function public._ranked_reward(p_rank bigint) returns int language sql immutable as $$
  select case when p_rank = 1 then 150 when p_rank = 2 then 100 when p_rank = 3 then 75 when p_rank <= 10 then 40 else 15 end $$;

create or replace function public.ranked_last(p_id text, p_token text, p_claim boolean default false)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players; wk text := _week_prev(); h record; total bigint;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  -- Archive les parties de la semaine dernière pas encore archivées
  insert into ranked_history (player_id, week, lifetime) select player_id, week, lifetime from ranked where week = wk on conflict do nothing;
  select count(*) into total from ranked_history hh join players pl on pl.id = hh.player_id where hh.week = wk and hh.lifetime > 0 and not pl.banned;
  select x.* into h from (
    select hh.player_id, hh.lifetime, hh.claimed, row_number() over (order by hh.lifetime desc) as rank
    from ranked_history hh join players pl on pl.id = hh.player_id where hh.week = wk and hh.lifetime > 0 and not pl.banned) x
  where x.player_id = p_id;
  if not found then return json_build_object('ok', true, 'played', false, 'week', wk); end if;
  if p_claim and not h.claimed and not p.banned then
    update ranked_history set claimed = true where player_id = p_id and week = wk;
    return json_build_object('ok', true, 'played', true, 'claimed_now', true, 'reward', _ranked_reward(h.rank), 'rank', h.rank, 'players', total);
  end if;
  return json_build_object('ok', true, 'played', true, 'week', wk, 'rank', h.rank, 'players', total, 'score', h.lifetime,
    'reward', _ranked_reward(h.rank), 'claimed', h.claimed);
end $$;

revoke all on function public._ranked_cps(jsonb), public._ranked_load(text), public._ranked_json(public.ranked), public._ranked_reward(bigint) from public, anon, authenticated;
revoke all on function public.ranked_state(text, text), public.ranked_click(text, text, int), public.ranked_buy(text, text, text, int),
  public.ranked_board(text, int), public.ranked_last(text, text, boolean) from public;
grant execute on function public.ranked_state(text, text), public.ranked_click(text, text, int), public.ranked_buy(text, text, text, int),
  public.ranked_board(text, int), public.ranked_last(text, text, boolean) to anon, authenticated;
