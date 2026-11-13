-- Co'Clicker : anti-triche renforcé
-- À exécuter une fois dans Supabase → SQL Editor, après reset.sql.
--
-- 1. Production/s comptée en ligne : au plus doublée toutes les 15 minutes de temps réel (sauf pour revenir
--    au record déjà atteint, après une Nouvelle saison). Une partie modifiée ne peut plus remonter en haut
--    du classement en quelques minutes ; un joueur honnête rattrape sa vraie production en quelques envois.
--    Signalement seulement si le jeu annonce un bond impossible par rapport à son envoi précédent
--    (production ×50 en moins de 30 min, ou des gains sans rapport avec la production) : pas de faux positif
--    pour un joueur qui progresse vite.
-- 2. Exclusion automatique : 2 signalements graves en 24 h → le joueur est exclu (réversible dans l'espace équipe).
-- 3. Clic automatique : signalé au-delà de 25 clics par seconde en moyenne sur une minute.

-- Signalement + exclusion automatique des récidivistes
create or replace function public._flag(p_id text, p_reason text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if exists (select 1 from cheat_events where player_id = p_id and reason = p_reason and at > now() - interval '1 hour') then return; end if;
  insert into cheat_events (player_id, reason, detail) values (p_id, left(p_reason, 40), left(coalesce(p_detail, ''), 300));
  update players set flags = flags + 1 where id = p_id;
  delete from cheat_events where at < now() - interval '90 days';
  -- Signalements graves (valeurs impossibles ou partie modifiée) sur 24 h
  select count(*) into n from cheat_events where player_id = p_id and at > now() - interval '24 hours'
    and (reason in ('production', 'vitesse', 'sauvegarde', 'succes', 'saisons', 'debut') or reason like 'score-%');
  if n >= 2 and exists (select 1 from players where id = p_id and not banned) then
    update players set banned = true, listed = false, team = null where id = p_id;
    delete from game_scores where player_id = p_id;
    delete from gallery where player_id = p_id;
    insert into cheat_events (player_id, reason, detail) values (p_id, 'auto-exclu', 'Exclu automatiquement : ' || n || ' signalements graves en 24 h');
  end if;
end $$;
revoke all on function public._flag(text, text, text) from public, anon, authenticated;

alter table public.players add column if not exists peak_cps double precision not null default 0;   -- record de production/s accepté
alter table public.players add column if not exists claim_cps double precision not null default 0;  -- dernière production/s annoncée par le jeu
alter table public.players add column if not exists claim_life double precision not null default 0; -- dernier total annoncé par le jeu

create or replace function public.submit_score(
  p_id text, p_token text, p_pseudo text, p_listed boolean,
  p_lifetime double precision, p_cps double precision, p_seasons int, p_achievements int,
  p_games bigint default null, p_golden bigint default null, p_clicks bigint default null, p_missions bigint default null,
  p_tamper text default null, p_reset_gen int default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  r players%rowtype;
  v_hash text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_elapsed double precision; v_max double precision; v_life double precision; v_cpsmax double precision; v_ref double precision;
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
    insert into players (id, token_hash, pseudo, listed, lifetime, cps, seasons, achievements, tot_games, tot_golden, tot_clicks, tot_missions, claim_cps, claim_life)
    values (p_id, v_hash, p_pseudo, coalesce(p_listed, true), least(p_lifetime, 1e9), least(p_cps, 1e6),
            least(greatest(coalesce(p_seasons, 0), 0), 50), least(greatest(coalesce(p_achievements, 0), 0), 400),
            least(greatest(coalesce(p_games, 0), 0), 5000), least(greatest(coalesce(p_golden, 0), 0), 5000),
            least(greatest(coalesce(p_clicks, 0), 0), 1e7), least(greatest(coalesce(p_missions, 0), 0), 2000), p_cps, p_lifetime);
    if p_lifetime > 1e12 then perform _flag(p_id, 'debut', 'Première synchro avec ' || p_lifetime::text || ' Co''Coins'); end if;
    select * into r from players where id = p_id;
  else
    if r.token_hash <> v_hash then return json_build_object('ok', false, 'error', 'token'); end if;
    if r.banned then return json_build_object('ok', true); end if;
    if r.reset_gen > coalesce(p_reset_gen, 0) then return json_build_object('ok', true, 'reset_gen', r.reset_gen); end if;
    if now() - r.updated_at < interval '30 seconds' then return json_build_object('ok', false, 'error', 'rate'); end if;
    v_elapsed := extract(epoch from now() - r.updated_at);

    -- Signalements : bonds impossibles par rapport à l'envoi précédent du même jeu
    v_ref := greatest(r.claim_cps, r.peak_cps, 1);
    if r.claim_cps > 0 and v_elapsed < 1800 and p_cps > v_ref * 50 + 1e6 then
      perform _flag(p_id, 'vitesse', 'Production/s annoncée : ' || p_cps::text || ' · envoi précédent : ' || r.claim_cps::text || ' (' || round(v_elapsed) || ' s avant)');
    end if;
    if r.claim_life > 0 and p_lifetime - r.claim_life > greatest(v_ref * v_elapsed * 50, v_ref * 7200) + 1e9 then
      perform _flag(p_id, 'production', 'Gain annoncé : ' || (p_lifetime - r.claim_life)::text || ' Co''Coins en ' || round(v_elapsed) || ' s pour ' || v_ref::text || '/s');
    end if;
    if coalesce(p_achievements, 0) > 400 then perform _flag(p_id, 'succes', p_achievements::text || ' succès (impossible)'); end if;
    if coalesce(p_seasons, 0) > r.seasons + 3 then perform _flag(p_id, 'saisons', 'Saisons : ' || r.seasons || ' → ' || p_seasons); end if;
    if v_elapsed >= 60 and coalesce(p_clicks, 0) > r.tot_clicks + v_elapsed * 25 + 300 then perform _flag(p_id, 'clics', 'Clics : +' || (p_clicks - r.tot_clicks) || ' en ' || round(v_elapsed) || ' s'); end if;
    if coalesce(p_games, 0) > r.tot_games + v_elapsed / 10 + 5 then perform _flag(p_id, 'minijeux', 'Mini-jeux : +' || (p_games - r.tot_games) || ' en ' || round(v_elapsed) || ' s'); end if;
    if p_tamper is not null and p_tamper <> '' then perform _flag(p_id, 'sauvegarde', left(p_tamper, 300)); end if;
    -- Exclu automatiquement pendant cet envoi : on s'arrête là
    if (select banned from players where id = p_id) then return json_build_object('ok', true); end if;

    -- Valeurs comptées en ligne : plafonnées selon le temps réel
    v_cpsmax := greatest(greatest(r.cps, 1) * least(power(2, v_elapsed / 900.0), 16), r.peak_cps) + 1e4;
    v_max := r.lifetime + v_elapsed * greatest(r.cps, 1) * 10 + 1e5;
    v_life := least(greatest(p_lifetime, r.lifetime), v_max);
    g  := least(greatest(coalesce(p_games, r.tot_games), r.tot_games), r.tot_games + floor(v_elapsed / 15) + 2);
    go := least(greatest(coalesce(p_golden, r.tot_golden), r.tot_golden), r.tot_golden + floor(v_elapsed / 60) + 3);
    c  := least(greatest(coalesce(p_clicks, r.tot_clicks), r.tot_clicks), r.tot_clicks + floor(v_elapsed * 20) + 100);
    m  := least(greatest(coalesce(p_missions, r.tot_missions), r.tot_missions), r.tot_missions + floor(v_elapsed / 300) + 4);
    update players set
      pseudo = p_pseudo, listed = coalesce(p_listed, true), lifetime = v_life,
      cps = least(p_cps, v_cpsmax), peak_cps = greatest(peak_cps, least(p_cps, v_cpsmax)),
      claim_cps = p_cps, claim_life = p_lifetime,
      seasons = greatest(r.seasons, least(coalesce(p_seasons, 0), r.seasons + 1)),
      achievements = least(greatest(coalesce(p_achievements, 0), 0), 400),
      tot_games = g, tot_golden = go, tot_clicks = c, tot_missions = m, updated_at = now()
    where id = p_id;
  end if;
  insert into period_base values (p_id, _week(), r.tot_games, r.tot_golden, r.tot_clicks, r.tot_missions) on conflict do nothing;
  insert into period_base values (p_id, _month(), r.tot_games, r.tot_golden, r.tot_clicks, r.tot_missions) on conflict do nothing;
  return json_build_object('ok', true, 'reset_gen', r.reset_gen);
end $$;

-- La remise à zéro efface aussi les repères de l'anti-triche
create or replace function public.admin_reset(p_key text, p_id text)
returns json language plpgsql security definer set search_path = public as $$
declare v_found boolean;
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  update players set lifetime = 0, cps = 0, peak_cps = 0, claim_cps = 0, claim_life = 0, seasons = 0, achievements = 0,
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
