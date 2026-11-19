-- Co'Clicker : titres dans les classements, date du serveur (calendrier de l'Avent), Atelier pixel (galerie modérée)
-- À exécuter une fois dans Supabase → SQL Editor, après tous les autres scripts (dont chess.sql, survivor.sql et mega.sql).
-- Supabase peut afficher « Potential issue detected » (remplacement de la fonction leaderboard) : cliquer « Run this query ».

-- ---------- Titres ----------
alter table public.players add column if not exists title text not null default '';

-- Choisir son titre. Les titres vérifiables le sont ici (Méga-Prestige, échecs, Co'Survivor) ; les autres suivent le jeu.
create or replace function public.set_title(p_id text, p_token text, p_title text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players; t text := coalesce(p_title, '');
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if t <> '' and t !~ '^[a-z0-9-]{2,20}$' then return json_build_object('ok', false, 'error', 'title'); end if;
  if (t = 'legende' and p.mega < 1) or (t = 'mythe' and p.mega < 3)
     or (t = 'diamant' and coalesce((select best_elo from chess_stats where player_id = p_id), 0) < 1600)
     or (t = 'survivant' and coalesce((select heat_won from surv_best where player_id = p_id), -1) < 0)
     or (t = 'surchauffe' and coalesce((select heat_won from surv_best where player_id = p_id), -1) < 5) then
    return json_build_object('ok', false, 'error', 'locked');
  end if;
  update players set title = t where id = p_id;
  return json_build_object('ok', true);
end $$;

-- Classement principal : avec Méga-Prestige et titre
drop function if exists public.leaderboard(int);
create or replace function public.leaderboard(p_limit int default 20)
returns table (rank bigint, pseudo text, lifetime double precision, seasons int, me boolean, mega int, title text)
language sql security definer set search_path = public as $$
  select row_number() over (order by lifetime desc), case when pseudo = '' then 'Anonyme' else pseudo end,
         lifetime, seasons, false, mega, title
  from players where listed and not banned
  order by lifetime desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- Ladder des échecs : avec titre
create or replace function public.chess_ladder(p_id text default null, p_limit int default 20)
returns json language sql stable security definer set search_path = public as $$
  with r as (
    select s.player_id, case when pl.pseudo = '' then 'Anonyme' else pl.pseudo end as pseudo, pl.listed, pl.title, s.elo, s.best_elo, s.wins, s.draws, s.losses, s.rated,
           row_number() over (order by s.elo desc, s.rated desc, s.player_id) as rank
    from chess_stats s join players pl on pl.id = s.player_id where not pl.banned and s.rated > 0)
  select json_build_object(
    'players', (select count(*) from r),
    'top', coalesce((select json_agg(json_build_object('rank', rank, 'pseudo', pseudo, 'title', title, 'elo', elo, 'wins', wins, 'draws', draws, 'losses', losses, 'me', player_id = p_id) order by rank)
                     from (select * from r where listed or player_id = p_id order by rank limit least(greatest(coalesce(p_limit, 20), 1), 50)) t), '[]'),
    'me', (select json_build_object('rank', rank, 'elo', elo, 'best_elo', best_elo, 'rated', rated) from r where player_id = p_id)) $$;

-- Co'Survivor : avec titre
create or replace function public.surv_board(p_id text default null, p_limit int default 10)
returns json language sql security definer set search_path = public as $$
  with rows as (
    select b.player_id, case when pl.pseudo = '' then 'Anonyme' else pl.pseudo end as pseudo, pl.listed, pl.title, b.time_s, b.kills, b.level, b.heat,
           row_number() over (order by b.heat desc, b.time_s desc, b.kills desc, b.at) as rank
    from surv_best b join players pl on pl.id = b.player_id
    where not pl.banned and b.time_s > 0)
  select json_build_object(
    'players', (select count(*) from rows),
    'top', coalesce((select json_agg(json_build_object('rank', rank, 'pseudo', pseudo, 'title', title, 'heat', heat, 'time', time_s, 'kills', kills, 'me', player_id = p_id) order by rank)
                     from (select * from rows where listed or player_id = p_id order by rank limit least(greatest(coalesce(p_limit, 10), 1), 50)) t), '[]'),
    'me', (select json_build_object('rank', rank, 'heat', heat, 'time', time_s, 'kills', kills) from rows where player_id = p_id)) $$;

-- ---------- Date du serveur (calendrier de l'Avent : impossible d'avancer l'horloge de l'appareil) ----------
create or replace function public.server_now() returns timestamptz language sql stable as $$ select now() $$;

-- ---------- Atelier pixel ----------
create table if not exists public.pixel_art (
  player_id   text primary key references public.players(id) on delete cascade,
  art         text not null check (length(art) = 256 and art ~ '^[0-9a-f.]+$'),
  status      text not null default 'pending' check (status in ('pending', 'ok', 'no')),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.pixel_art enable row level security;
revoke all on public.pixel_art from anon, authenticated;

-- Proposer sa création (une par joueur, remplace la précédente ; 10 minutes entre deux envois)
create or replace function public.pixel_submit(p_id text, p_token text, p_art text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if p.banned then return json_build_object('ok', false, 'error', 'banned'); end if;
  if length(coalesce(p_art, '')) <> 256 or p_art !~ '^[0-9a-f.]+$' then return json_build_object('ok', false, 'error', 'art'); end if;
  if exists (select 1 from pixel_art where player_id = p_id and created_at > now() - interval '10 minutes') then
    return json_build_object('ok', false, 'error', 'rate');
  end if;
  insert into pixel_art (player_id, art) values (p_id, p_art)
    on conflict (player_id) do update set art = excluded.art, status = 'pending', created_at = now(), reviewed_at = null;
  return json_build_object('ok', true);
end $$;

-- Statut de ma création
create or replace function public.pixel_mine(p_id text, p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  return json_build_object('ok', true, 'status', (select status from pixel_art where player_id = p_id));
end $$;

-- Galerie : créations validées uniquement
create or replace function public.pixel_list(p_limit int default 40)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x), '[]') from (
    select a.art, case when pl.pseudo = '' then 'Anonyme' else pl.pseudo end as pseudo
    from pixel_art a join players pl on pl.id = a.player_id
    where a.status = 'ok' and not pl.banned
    order by a.reviewed_at desc limit least(greatest(coalesce(p_limit, 40), 1), 100)) x $$;

-- Espace équipe : créations à valider, puis valider / refuser
create or replace function public.admin_pixel_pending(p_key text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  return json_build_object('ok', true, 'items', coalesce((select json_agg(x order by x.created_at) from (
    select a.player_id, a.art, a.status, a.created_at, case when pl.pseudo = '' then 'Anonyme' else pl.pseudo end as pseudo
    from pixel_art a join players pl on pl.id = a.player_id where a.status = 'pending' or (a.status = 'ok' and a.reviewed_at > now() - interval '30 days')
    order by a.status <> 'pending', a.created_at limit 60) x), '[]'));
end $$;
create or replace function public.admin_pixel_review(p_key text, p_player text, p_ok boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  update pixel_art set status = case when p_ok then 'ok' else 'no' end, reviewed_at = now() where player_id = p_player;
  return json_build_object('ok', found);
end $$;

-- Remise à zéro par l'équipe : efface aussi titre et création pixel
create or replace function public.admin_reset(p_key text, p_id text)
returns json language plpgsql security definer set search_path = public as $$
declare v_found boolean;
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  update players set lifetime = 0, cps = 0, peak_cps = 0, claim_cps = 0, claim_life = 0, seasons = 0, achievements = 0,
    tot_games = 0, tot_golden = 0, tot_clicks = 0, tot_missions = 0, team = null, team_changed_at = null, mega = 0, mega_banked = 0, title = '',
    reset_gen = reset_gen + 1, updated_at = now()
  where id = p_id;
  v_found := found;
  if v_found then
    delete from game_scores where player_id = p_id;
    delete from gallery where player_id = p_id;
    delete from period_base where player_id = p_id;
    delete from cloud_saves where player_id = p_id;
    delete from cloud_backups where player_id = p_id;
    delete from pixel_art where player_id = p_id;
    insert into cheat_events (player_id, reason, detail) values (p_id, 'remise', 'Compte remis à zéro par l''équipe');
  end if;
  return json_build_object('ok', v_found);
end $$;

revoke all on function public.set_title(text, text, text), public.leaderboard(int), public.chess_ladder(text, int), public.surv_board(text, int), public.server_now(),
  public.pixel_submit(text, text, text), public.pixel_mine(text, text), public.pixel_list(int), public.admin_pixel_pending(text), public.admin_pixel_review(text, text, boolean) from public;
grant execute on function public.set_title(text, text, text), public.leaderboard(int), public.chess_ladder(text, int), public.surv_board(text, int), public.server_now(),
  public.pixel_submit(text, text, text), public.pixel_mine(text, text), public.pixel_list(int), public.admin_pixel_pending(text), public.admin_pixel_review(text, text, boolean) to anon, authenticated;
