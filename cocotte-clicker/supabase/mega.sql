-- Co'Clicker : Méga-Prestige visible en ligne
-- À exécuter une fois dans Supabase → SQL Editor, après les autres scripts.
--
-- Avant : le serveur gardait toujours le meilleur total, un Méga-Prestige ne changeait donc rien au classement.
-- Maintenant : au premier envoi après un Méga-Prestige, le score du joueur repart de zéro dans le classement,
-- avec un badge 🌌 (niveau de Méga-Prestige) visible par tous. Ce qu'il avait produit reste compté
-- dans l'objectif collectif. Conditions vérifiées : 3 Nouvelles saisons et un gros total en ligne, un niveau à la fois.

alter table public.players add column if not exists mega int not null default 0;
alter table public.players add column if not exists mega_banked double precision not null default 0;

-- L'ancienne version (sans p_mega) est remplacée
drop function if exists public.submit_score(text, text, text, boolean, double precision, double precision, int, int, bigint, bigint, bigint, bigint, text, int);

create or replace function public.submit_score(
  p_id text, p_token text, p_pseudo text, p_listed boolean,
  p_lifetime double precision, p_cps double precision, p_seasons int, p_achievements int,
  p_games bigint default null, p_golden bigint default null, p_clicks bigint default null, p_missions bigint default null,
  p_tamper text default null, p_reset_gen int default null, p_mega int default null)
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

    -- Méga-Prestige : la partie recommence à zéro, le classement aussi (visible par tous avec 🌌).
    -- Ce qui a été produit reste compté dans l'objectif collectif (mega_banked).
    if coalesce(p_mega, 0) = r.mega + 1 then
      if r.seasons >= 3 and r.lifetime >= 1e15 then
        update players set mega = p_mega, mega_banked = mega_banked + lifetime,
          lifetime = least(p_lifetime, 1e9), cps = least(p_cps, 1e4), peak_cps = 0, claim_cps = p_cps, claim_life = p_lifetime,
          seasons = 0, achievements = least(greatest(coalesce(p_achievements, 0), 0), 400), pseudo = p_pseudo, listed = coalesce(p_listed, true),
          tot_games = greatest(tot_games, coalesce(p_games, 0)), updated_at = now()
        where id = p_id;
        return json_build_object('ok', true, 'reset_gen', r.reset_gen, 'mega', p_mega);
      end if;
      perform _flag(p_id, 'mega', 'Méga-Prestige ' || p_mega || ' annoncé avec ' || r.seasons || ' saisons et ' || r.lifetime::text || ' Co''Coins en ligne');
    elsif coalesce(p_mega, 0) > r.mega + 1 then
      perform _flag(p_id, 'mega', 'Méga-Prestige ' || p_mega || ' annoncé (niveau en ligne : ' || r.mega || ')');
    end if;

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

-- Objectif collectif : production actuelle + ce qui a été produit avant les Méga-Prestiges
create or replace function public.community_stats()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'total', coalesce(sum(lifetime + mega_banked) filter (where not banned), 0),
    'players', count(*) filter (where not banned),
    'active', count(*) filter (where not banned and updated_at > now() - interval '7 days'))
  from players;
$$;

-- Classement : avec le niveau de Méga-Prestige
drop function if exists public.leaderboard(int);
create or replace function public.leaderboard(p_limit int default 20)
returns table (rank bigint, pseudo text, lifetime double precision, seasons int, me boolean, mega int)
language sql security definer set search_path = public as $$
  select row_number() over (order by lifetime desc), case when pseudo = '' then 'Anonyme' else pseudo end,
         lifetime, seasons, false, mega
  from players where listed and not banned
  order by lifetime desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- Remise à zéro par l'équipe : efface aussi le Méga-Prestige en ligne
create or replace function public.admin_reset(p_key text, p_id text)
returns json language plpgsql security definer set search_path = public as $$
declare v_found boolean;
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  update players set lifetime = 0, cps = 0, peak_cps = 0, claim_cps = 0, claim_life = 0, seasons = 0, achievements = 0,
    tot_games = 0, tot_golden = 0, tot_clicks = 0, tot_missions = 0, team = null, team_changed_at = null, mega = 0, mega_banked = 0,
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

revoke all on function public.submit_score(text, text, text, boolean, double precision, double precision, int, int, bigint, bigint, bigint, bigint, text, int, int),
  public.leaderboard(int) from public;
grant execute on function public.submit_score(text, text, text, boolean, double precision, double precision, int, int, bigint, bigint, bigint, bigint, text, int, int),
  public.leaderboard(int), public.community_stats() to anon, authenticated;
