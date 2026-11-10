-- =========================================================
-- Co'Clicker : base communautaire (Supabase, offre gratuite)
-- À coller une fois dans Supabase → SQL Editor → Run
-- Aucune donnée personnelle : code joueur anonyme + pseudo facultatif
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.players (
  id           text primary key check (id ~ '^[A-Z0-9]{6,12}$'),
  token_hash   text not null,                          -- empreinte du jeton secret de l'appareil
  pseudo       text not null default '' check (char_length(pseudo) <= 20),
  listed       boolean not null default true,          -- apparaît dans le classement
  lifetime     double precision not null default 0 check (lifetime >= 0),
  cps          double precision not null default 0 check (cps >= 0),
  seasons      int not null default 0,
  achievements int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Accès direct interdit : tout passe par les fonctions ci-dessous
alter table public.players enable row level security;
revoke all on public.players from anon, authenticated;

-- Envoi du score avec plafonds anti-triche
create or replace function public.submit_score(
  p_id text, p_token text, p_pseudo text, p_listed boolean,
  p_lifetime double precision, p_cps double precision, p_seasons int, p_achievements int)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  r players%rowtype;
  v_hash text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_elapsed double precision;
  v_max double precision;
  v_life double precision;
begin
  if p_id is null or p_id !~ '^[A-Z0-9]{6,12}$' or length(coalesce(p_token, '')) < 16 then
    return json_build_object('ok', false, 'error', 'invalid');
  end if;
  p_pseudo := left(regexp_replace(coalesce(p_pseudo, ''), '[^[:alnum:] _''-]', '', 'g'), 20);
  p_cps := least(greatest(coalesce(p_cps, 0), 0), 1e18);
  p_lifetime := greatest(coalesce(p_lifetime, 0), 0);

  select * into r from players where id = p_id;
  if not found then
    -- Première inscription : valeurs plafonnées prudemment
    insert into players (id, token_hash, pseudo, listed, lifetime, cps, seasons, achievements)
    values (p_id, v_hash, p_pseudo, coalesce(p_listed, true), least(p_lifetime, 1e12), least(p_cps, 1e9),
            least(greatest(coalesce(p_seasons, 0), 0), 50), least(greatest(coalesce(p_achievements, 0), 0), 1000));
    return json_build_object('ok', true, 'new', true);
  end if;

  if r.token_hash <> v_hash then return json_build_object('ok', false, 'error', 'token'); end if;
  if now() - r.updated_at < interval '30 seconds' then return json_build_object('ok', false, 'error', 'rate'); end if;

  -- Croissance maximale : 30× la meilleure production connue pendant le temps écoulé (bonus compris), + marge
  v_elapsed := extract(epoch from now() - r.updated_at);
  v_max := r.lifetime + v_elapsed * greatest(r.cps, 1) * 30 + 1e6;
  v_life := least(greatest(p_lifetime, r.lifetime), v_max);

  update players set
    pseudo = p_pseudo,
    listed = coalesce(p_listed, true),
    lifetime = v_life,
    cps = least(p_cps, greatest(r.cps, 1) * 1000 + 1e6),
    seasons = greatest(r.seasons, least(coalesce(p_seasons, 0), r.seasons + 1)),
    achievements = least(greatest(coalesce(p_achievements, 0), 0), 1000),
    updated_at = now()
  where id = p_id;
  return json_build_object('ok', true, 'capped', p_lifetime > v_max);
end $$;

-- Compteur communautaire
create or replace function public.community_stats()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'total', coalesce(sum(lifetime), 0),
    'players', count(*),
    'active', count(*) filter (where updated_at > now() - interval '7 days'))
  from players;
$$;

-- Classement (pseudos uniquement, joueurs qui l'acceptent)
create or replace function public.leaderboard(p_limit int default 20)
returns table (rank bigint, pseudo text, lifetime double precision, seasons int, me boolean)
language sql security definer set search_path = public as $$
  select row_number() over (order by lifetime desc), case when pseudo = '' then 'Anonyme' else pseudo end,
         lifetime, seasons, false
  from players where listed
  order by lifetime desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- Rang d'un joueur
create or replace function public.my_rank(p_id text)
returns json language sql security definer set search_path = public as $$
  select json_build_object('rank', (select count(*) + 1 from players p where p.listed and p.lifetime > me.lifetime), 'lifetime', me.lifetime)
  from players me where me.id = p_id;
$$;

revoke all on function public.submit_score, public.community_stats, public.leaderboard, public.my_rank from public;
grant execute on function public.submit_score, public.community_stats, public.leaderboard, public.my_rank to anon;
