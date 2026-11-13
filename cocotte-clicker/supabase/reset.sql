-- Co'Clicker : remise à zéro d'un compte par l'équipe + plafonds anti-triche resserrés
-- À exécuter une fois dans Supabase → SQL Editor, après anticheat.sql.
--
-- Remise à zéro : le serveur efface les scores du joueur et augmente son « numéro de remise à zéro ».
-- Chaque appareil de ce joueur le voit à la synchronisation suivante, efface sa partie locale et repart de 0.
-- Tant qu'un appareil n'a pas effacé sa partie, rien de ce qu'il envoie n'est compté.
-- Plafonds : la production/s ne peut plus que tripler entre deux envois (avant : ×1000, ce qui permettait
-- d'atteindre des milliards de milliards en quelques minutes avec une partie modifiée).

alter table public.players add column if not exists reset_gen int not null default 0;

drop function if exists public.submit_score(text, text, text, boolean, double precision, double precision, int, int, bigint, bigint, bigint, bigint, text);
create or replace function public.submit_score(
  p_id text, p_token text, p_pseudo text, p_listed boolean,
  p_lifetime double precision, p_cps double precision, p_seasons int, p_achievements int,
  p_games bigint default null, p_golden bigint default null, p_clicks bigint default null, p_missions bigint default null,
  p_tamper text default null, p_reset_gen int default null)
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
    values (p_id, v_hash, p_pseudo, coalesce(p_listed, true), least(p_lifetime, 1e9), least(p_cps, 1e6),
            least(greatest(coalesce(p_seasons, 0), 0), 50), least(greatest(coalesce(p_achievements, 0), 0), 400),
            least(greatest(coalesce(p_games, 0), 0), 5000), least(greatest(coalesce(p_golden, 0), 0), 5000),
            least(greatest(coalesce(p_clicks, 0), 0), 1e7), least(greatest(coalesce(p_missions, 0), 0), 2000));
    -- Première inscription avec des valeurs énormes : suspect (une vraie partie commence à 0)
    if p_lifetime > 1e12 then perform _flag(p_id, 'debut', 'Première synchro avec ' || p_lifetime::text || ' Co''Coins'); end if;
    select * into r from players where id = p_id;
  else
    if r.token_hash <> v_hash then return json_build_object('ok', false, 'error', 'token'); end if;
    if r.banned then return json_build_object('ok', true); end if; -- exclu : plus rien n'est compté
    -- Partie remise à zéro par l'équipe : rien n'est compté tant que l'appareil n'a pas effacé sa partie
    if r.reset_gen > coalesce(p_reset_gen, 0) then return json_build_object('ok', true, 'reset_gen', r.reset_gen); end if;
    if now() - r.updated_at < interval '30 seconds' then return json_build_object('ok', false, 'error', 'rate'); end if;
    v_elapsed := extract(epoch from now() - r.updated_at);
    v_max := r.lifetime + v_elapsed * greatest(r.cps, 1) * 10 + 1e5;
    v_life := least(greatest(p_lifetime, r.lifetime), v_max);
    v_cpsmax := greatest(r.cps, 1) * 3 + 100;
    -- Signalements : valeurs bien au-delà du possible (marge large pour éviter les faux positifs)
    if p_lifetime > v_max * 3 + 1e9 then perform _flag(p_id, 'production', 'Co''Coins envoyés : ' || p_lifetime::text || ' · maximum possible : ' || v_max::text); end if;
    if p_cps > greatest(r.cps, 1) * 100 + 1e5 then perform _flag(p_id, 'vitesse', 'Production/s envoyée : ' || p_cps::text || ' · précédente : ' || r.cps::text); end if;
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
  return json_build_object('ok', true, 'reset_gen', r.reset_gen);
end $$;


-- Sauvegarde en ligne : refusée tant que l'appareil n'a pas appliqué la remise à zéro
drop function if exists public.cloud_put(text, text, text, double precision, bigint, text);
create or replace function public.cloud_put(p_id text, p_token text, p_data text, p_progress double precision, p_base_rev bigint, p_sid text default null, p_gen int default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare c cloud_saves; r players;
begin
  r := _player(p_id, p_token);
  if r.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if r.reset_gen > coalesce(p_gen, 0) then return json_build_object('ok', false, 'error', 'reset'); end if;
  if p_data is null or length(p_data) > 300000 or p_data not like 'COCOTTE1:%' then return json_build_object('ok', false, 'error', 'data'); end if;
  if not _session(p_id, p_sid, false) then return json_build_object('ok', false, 'error', 'taken'); end if;
  select * into c from cloud_saves where player_id = p_id for update;
  if not found then
    insert into cloud_saves (player_id, rev, data, progress) values (p_id, 1, p_data, coalesce(p_progress, 0));
    return json_build_object('ok', true, 'rev', 1);
  end if;
  if coalesce(p_base_rev, 0) = c.rev or coalesce(p_progress, 0) > c.progress then
    if coalesce(p_base_rev, 0) <> c.rev then
      insert into cloud_backups (player_id, data, progress) values (p_id, c.data, c.progress);
    end if;
    update cloud_saves set rev = c.rev + 1, data = p_data, progress = coalesce(p_progress, 0), updated_at = now() where player_id = p_id;
    delete from cloud_backups where created_at < now() - interval '7 days';
    return json_build_object('ok', true, 'rev', c.rev + 1);
  end if;
  insert into cloud_backups (player_id, data, progress) values (p_id, p_data, coalesce(p_progress, 0));
  return json_build_object('ok', false, 'error', 'newer', 'rev', c.rev, 'data', c.data);
end $$;

-- ---------- Espace équipe ----------
-- Recherche d'un joueur (code joueur ou pseudo)
create or replace function public.admin_find(p_key text, p_query text)
returns json language plpgsql security definer set search_path = public as $$
declare q text := left(trim(coalesce(p_query, '')), 20);
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  if q = '' then return json_build_object('ok', true, 'players', '[]'::json); end if;
  return json_build_object('ok', true, 'players', coalesce((select json_agg(x) from (
    select p.id, case when p.pseudo = '' then 'Anonyme' else p.pseudo end as pseudo, p.lifetime, p.cps, p.seasons, p.flags, p.banned,
           p.tot_clicks, p.tot_games, p.created_at, p.updated_at, p.reset_gen
    from players p where p.id = upper(q) or p.pseudo ilike '%' || replace(replace(q, '%', ''), '_', '') || '%'
    order by p.lifetime desc limit 20) x), '[]'::json));
end $$;

-- Remise à zéro d'un compte
create or replace function public.admin_reset(p_key text, p_id text)
returns json language plpgsql security definer set search_path = public as $$
declare v_found boolean;
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  update players set lifetime = 0, cps = 0, seasons = 0, achievements = 0,
    tot_games = 0, tot_golden = 0, tot_clicks = 0, tot_missions = 0, team = null, team_changed_at = null,
    reset_gen = reset_gen + 1, updated_at = now()
  where id = p_id;
  v_found := found;
  if v_found then
    delete from game_scores where player_id = p_id;
    delete from gallery where player_id = p_id;
    delete from period_base where player_id = p_id;
    delete from cloud_saves where player_id = p_id;
    delete from cloud_backups where player_id = p_id;
    insert into cheat_events (player_id, reason, detail) values (p_id, 'remise', 'Compte remis à zéro par l''équipe');
  end if;
  return json_build_object('ok', v_found);
end $$;

revoke all on function public.submit_score(text, text, text, boolean, double precision, double precision, int, int, bigint, bigint, bigint, bigint, text, int),
  public.cloud_put(text, text, text, double precision, bigint, text, int), public.admin_find(text, text), public.admin_reset(text, text) from public;
grant execute on function public.submit_score(text, text, text, boolean, double precision, double precision, int, int, bigint, bigint, bigint, bigint, text, int),
  public.cloud_put(text, text, text, double precision, bigint, text, int), public.admin_find(text, text), public.admin_reset(text, text) to anon, authenticated;
