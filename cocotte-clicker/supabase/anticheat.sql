-- Co'Clicker : détection de triche + exclusion des tricheurs
-- À exécuter une fois dans Supabase → SQL Editor, après les autres scripts.
--
-- Principe : le jeu tourne dans le navigateur, donc une partie peut toujours être modifiée en local.
-- Le serveur ne fait donc confiance à rien : il plafonne chaque valeur envoyée selon le temps écoulé,
-- et note un « signalement » (cheat_events) quand une valeur est impossible ou quand le jeu a détecté
-- une sauvegarde modifiée. L'équipe voit la liste dans l'espace équipe (📡 En direct → 🚩 Joueurs suspects)
-- et peut exclure un joueur : il disparaît des classements, du compteur collectif, de la galerie et des équipes.

alter table public.players add column if not exists flags int not null default 0;
alter table public.players add column if not exists banned boolean not null default false;

create table if not exists public.cheat_events (
  id        bigint generated always as identity primary key,
  player_id text not null,
  at        timestamptz not null default now(),
  reason    text not null,
  detail    text not null default ''
);
create index if not exists cheat_events_player on public.cheat_events (player_id, at desc);
alter table public.cheat_events enable row level security;
revoke all on public.cheat_events from anon, authenticated;

-- Enregistre un signalement (au plus un par raison et par heure pour un joueur)
create or replace function public._flag(p_id text, p_reason text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from cheat_events where player_id = p_id and reason = p_reason and at > now() - interval '1 hour') then return; end if;
  insert into cheat_events (player_id, reason, detail) values (p_id, left(p_reason, 40), left(coalesce(p_detail, ''), 300));
  update players set flags = flags + 1 where id = p_id;
  delete from cheat_events where at < now() - interval '90 days';
end $$;
revoke all on function public._flag(text, text, text) from public, anon, authenticated;

-- Envoi du score : mêmes plafonds qu'avant + signalements ; un joueur exclu n'est plus mis à jour
drop function if exists public.submit_score(text, text, text, boolean, double precision, double precision, int, int, bigint, bigint, bigint, bigint);
create or replace function public.submit_score(
  p_id text, p_token text, p_pseudo text, p_listed boolean,
  p_lifetime double precision, p_cps double precision, p_seasons int, p_achievements int,
  p_games bigint default null, p_golden bigint default null, p_clicks bigint default null, p_missions bigint default null,
  p_tamper text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  r players%rowtype;
  v_hash text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_elapsed double precision; v_max double precision; v_life double precision; v_cpsmax double precision;
  g bigint; go bigint; c bigint; m bigint;
begin
  if p_id is null or p_id !~ '^[A-Z0-9]{6,12}$' or length(coalesce(p_token, '')) < 16 then
    return json_build_object('ok', false, 'error', 'invalid');
  end if;
  p_pseudo := left(regexp_replace(coalesce(p_pseudo, ''), '[^[:alnum:] _''-]', '', 'g'), 20);
  p_cps := least(greatest(coalesce(p_cps, 0), 0), 1e30);
  p_lifetime := greatest(coalesce(p_lifetime, 0), 0);

  select * into r from players where id = p_id;
  if not found then
    insert into players (id, token_hash, pseudo, listed, lifetime, cps, seasons, achievements, tot_games, tot_golden, tot_clicks, tot_missions)
    values (p_id, v_hash, p_pseudo, coalesce(p_listed, true), least(p_lifetime, 1e12), least(p_cps, 1e9),
            least(greatest(coalesce(p_seasons, 0), 0), 50), least(greatest(coalesce(p_achievements, 0), 0), 400),
            least(greatest(coalesce(p_games, 0), 0), 5000), least(greatest(coalesce(p_golden, 0), 0), 5000),
            least(greatest(coalesce(p_clicks, 0), 0), 1e7), least(greatest(coalesce(p_missions, 0), 0), 2000));
    -- Première inscription avec des valeurs énormes : suspect (une vraie partie commence à 0)
    if p_lifetime > 1e12 then perform _flag(p_id, 'debut', 'Première synchro avec ' || p_lifetime::text || ' Co''Coins'); end if;
    select * into r from players where id = p_id;
  else
    if r.token_hash <> v_hash then return json_build_object('ok', false, 'error', 'token'); end if;
    if r.banned then return json_build_object('ok', true); end if; -- exclu : plus rien n'est compté
    if now() - r.updated_at < interval '30 seconds' then return json_build_object('ok', false, 'error', 'rate'); end if;
    v_elapsed := extract(epoch from now() - r.updated_at);
    v_max := r.lifetime + v_elapsed * greatest(r.cps, 1) * 30 + 1e6;
    v_life := least(greatest(p_lifetime, r.lifetime), v_max);
    v_cpsmax := greatest(r.cps, 1) * 1000 + 1e6;
    -- Signalements : valeurs bien au-delà du possible (marge large pour éviter les faux positifs)
    if p_lifetime > v_max * 3 + 1e9 then perform _flag(p_id, 'production', 'Co''Coins envoyés : ' || p_lifetime::text || ' · maximum possible : ' || v_max::text); end if;
    if p_cps > v_cpsmax * 10 then perform _flag(p_id, 'vitesse', 'Production/s envoyée : ' || p_cps::text || ' · précédente : ' || r.cps::text); end if;
    if coalesce(p_achievements, 0) > 400 then perform _flag(p_id, 'succes', p_achievements::text || ' succès (impossible)'); end if;
    if coalesce(p_seasons, 0) > r.seasons + 3 then perform _flag(p_id, 'saisons', 'Saisons : ' || r.seasons || ' → ' || p_seasons); end if;
    if coalesce(p_clicks, 0) > r.tot_clicks + v_elapsed * 40 + 500 then perform _flag(p_id, 'clics', 'Clics : +' || (p_clicks - r.tot_clicks) || ' en ' || round(v_elapsed) || ' s'); end if;
    if coalesce(p_games, 0) > r.tot_games + v_elapsed / 10 + 5 then perform _flag(p_id, 'minijeux', 'Mini-jeux : +' || (p_games - r.tot_games) || ' en ' || round(v_elapsed) || ' s'); end if;
    -- Compteurs : progression plafonnée selon le temps écoulé
    g  := least(greatest(coalesce(p_games, r.tot_games), r.tot_games), r.tot_games + floor(v_elapsed / 15) + 2);
    go := least(greatest(coalesce(p_golden, r.tot_golden), r.tot_golden), r.tot_golden + floor(v_elapsed / 60) + 3);
    c  := least(greatest(coalesce(p_clicks, r.tot_clicks), r.tot_clicks), r.tot_clicks + floor(v_elapsed * 20) + 100);
    m  := least(greatest(coalesce(p_missions, r.tot_missions), r.tot_missions), r.tot_missions + floor(v_elapsed / 300) + 4);
    update players set
      pseudo = p_pseudo, listed = coalesce(p_listed, true), lifetime = v_life,
      cps = least(p_cps, v_cpsmax),
      seasons = greatest(r.seasons, least(coalesce(p_seasons, 0), r.seasons + 1)),
      achievements = least(greatest(coalesce(p_achievements, 0), 0), 400),
      tot_games = g, tot_golden = go, tot_clicks = c, tot_missions = m, updated_at = now()
    where id = p_id;
  end if;
  -- Le jeu a détecté une sauvegarde modifiée sur l'appareil
  if p_tamper is not null and p_tamper <> '' then perform _flag(p_id, 'sauvegarde', left(p_tamper, 300)); end if;
  insert into period_base values (p_id, _week(), r.tot_games, r.tot_golden, r.tot_clicks, r.tot_missions) on conflict do nothing;
  insert into period_base values (p_id, _month(), r.tot_games, r.tot_golden, r.tot_clicks, r.tot_missions) on conflict do nothing;
  return json_build_object('ok', true);
end $$;

-- Scores des mini-jeux : nouveaux jeux (Recyclerie, Découpe laser) + signalement des scores impossibles
create or replace function public.submit_game_score(p_id text, p_token text, p_game text, p_score int)
returns json language plpgsql security definer set search_path = public as $$
declare r players%rowtype; cap int; last timestamptz;
begin
  r := _player(p_id, p_token);
  if r.id is null then return json_build_object('ok', false, 'error', 'token'); end if;
  if r.banned then return json_build_object('ok', true); end if;
  cap := case p_game when 'match3' then 60000 when 'memory' then 3000 when 'bugs' then 4000 when 'simon' then 4000
    when 'puzzle' then 6000 when 'bubbles' then 400 when 'catcher' then 400 when 'recycle' then 250 when 'laser' then 120 else null end;
  if cap is null then return json_build_object('ok', false, 'error', 'game'); end if;
  if p_score > cap then perform _flag(p_id, 'score-' || p_game, 'Score ' || p_score || ' (maximum ' || cap || ')'); end if;
  select max(updated_at) into last from game_scores where player_id = p_id;
  if last is not null and now() - last < interval '10 seconds' then return json_build_object('ok', false, 'error', 'rate'); end if;
  insert into game_scores (player_id, game, week, best) values (p_id, p_game, _week(), least(greatest(p_score, 0), cap))
  on conflict (player_id, game, week) do update set best = greatest(game_scores.best, excluded.best), updated_at = now();
  return json_build_object('ok', true);
end $$;

-- Compteur collectif et classement : sans les joueurs exclus
create or replace function public.community_stats()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'total', coalesce(sum(lifetime) filter (where not banned), 0),
    'players', count(*) filter (where not banned),
    'active', count(*) filter (where not banned and updated_at > now() - interval '7 days'))
  from players;
$$;
create or replace function public.leaderboard(p_limit int default 20)
returns table (rank bigint, pseudo text, lifetime double precision, seasons int, me boolean)
language sql security definer set search_path = public as $$
  select row_number() over (order by lifetime desc), case when pseudo = '' then 'Anonyme' else pseudo end,
         lifetime, seasons, false
  from players where listed and not banned
  order by lifetime desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;
create or replace function public.my_rank(p_id text)
returns json language sql security definer set search_path = public as $$
  select json_build_object('rank', (select count(*) + 1 from players p where p.listed and not p.banned and p.lifetime > me.lifetime), 'lifetime', me.lifetime)
  from players me where me.id = p_id;
$$;

-- ---------- Espace équipe ----------
-- Liste des joueurs signalés (ou exclus), du plus suspect au moins suspect
create or replace function public.admin_suspects(p_key text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  return json_build_object('ok', true, 'players', coalesce((
    select json_agg(x order by x.banned, x.flags desc, x.last desc) from (
      select p.id, case when p.pseudo = '' then 'Anonyme' else p.pseudo end as pseudo, p.lifetime, p.cps, p.flags, p.banned,
             p.tot_clicks, p.tot_games, p.created_at,
             (select max(at) from cheat_events e where e.player_id = p.id) as last,
             (select json_agg(json_build_object('at', e.at, 'reason', e.reason, 'detail', e.detail) order by e.at desc)
                from (select * from cheat_events e2 where e2.player_id = p.id order by e2.at desc limit 8) e) as events
      from players p where p.flags > 0 or p.banned
      limit 100) x), '[]'::json));
end $$;

-- Exclure / réintégrer un joueur
create or replace function public.admin_ban(p_key text, p_id text, p_ban boolean)
returns json language plpgsql security definer set search_path = public as $$
declare v_found boolean;
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  update players set banned = coalesce(p_ban, true),
    listed = case when coalesce(p_ban, true) then false else listed end,
    team = case when coalesce(p_ban, true) then null else team end
  where id = p_id;
  v_found := found;
  if v_found and coalesce(p_ban, true) then
    delete from game_scores where player_id = p_id;
    delete from gallery where player_id = p_id;
  end if;
  return json_build_object('ok', v_found);
end $$;

-- Effacer les signalements d'un joueur (faux positif)
create or replace function public.admin_clear_flags(p_key text, p_id text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  delete from cheat_events where player_id = p_id;
  update players set flags = 0 where id = p_id;
  return json_build_object('ok', true);
end $$;

revoke all on function public.submit_score(text, text, text, boolean, double precision, double precision, int, int, bigint, bigint, bigint, bigint, text),
  public.submit_game_score(text, text, text, int), public.community_stats(), public.leaderboard(int), public.my_rank(text),
  public.admin_suspects(text), public.admin_ban(text, text, boolean), public.admin_clear_flags(text, text) from public;
grant execute on function public.submit_score(text, text, text, boolean, double precision, double precision, int, int, bigint, bigint, bigint, bigint, text),
  public.submit_game_score(text, text, text, int), public.community_stats(), public.leaderboard(int), public.my_rank(text),
  public.admin_suspects(text), public.admin_ban(text, text, boolean), public.admin_clear_flags(text, text) to anon, authenticated;
