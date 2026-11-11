-- =========================================================
-- Co'Clicker : fonctions en ligne (à exécuter APRÈS setup.sql)
-- Supabase → SQL Editor → coller tout ce fichier → Run
-- Défi de la semaine, annonces, classements de mini-jeux, équipes,
-- cadeaux, galerie, chasse au trésor, boss collectif.
-- =========================================================

-- ---------- Réglages : clé serveur de l'équipe (empreinte SHA-256 uniquement) ----------
create table if not exists public.settings (key text primary key, value text not null);
alter table public.settings enable row level security;
revoke all on public.settings from anon, authenticated;
insert into public.settings (key, value)
values ('admin_hash', 'fa7841187c0e75546d49415ea06c75058cd79de97b6a9aab911a278d7389fb96')
on conflict (key) do nothing;

-- ---------- Colonnes en plus pour les joueurs ----------
alter table public.players add column if not exists tot_games bigint not null default 0;
alter table public.players add column if not exists tot_golden bigint not null default 0;
alter table public.players add column if not exists tot_clicks bigint not null default 0;
alter table public.players add column if not exists tot_missions bigint not null default 0;
alter table public.players add column if not exists team text check (team in ('atelier', 'fablab', 'tierslieu'));
alter table public.players add column if not exists team_changed_at timestamptz;

-- Point de départ des compteurs pour chaque semaine (w:2026-46) et chaque mois (m:2026-11)
create table if not exists public.period_base (
  player_id text references public.players(id) on delete cascade,
  period text not null,
  b_games bigint not null, b_golden bigint not null, b_clicks bigint not null, b_missions bigint not null,
  primary key (player_id, period)
);
create table if not exists public.game_scores (
  player_id text references public.players(id) on delete cascade,
  game text not null, week text not null, best int not null, updated_at timestamptz not null default now(),
  primary key (player_id, game, week)
);
create table if not exists public.gifts (
  id bigserial primary key, from_id text not null, to_id text not null, amount int not null,
  created_at timestamptz not null default now(), claimed boolean not null default false
);
create table if not exists public.gallery (
  player_id text primary key references public.players(id) on delete cascade,
  skin text not null, bg text not null, likes int not null default 0, updated_at timestamptz not null default now()
);
create table if not exists public.gallery_likes (
  liker_id text not null, owner_id text not null references public.gallery(player_id) on delete cascade,
  primary key (liker_id, owner_id)
);
create table if not exists public.announcements (
  id bigserial primary key, text text not null, created_at timestamptz not null default now(), until timestamptz not null
);
create table if not exists public.bosses (
  id bigserial primary key, name text not null, hp_max bigint not null, hp bigint not null, reward int not null,
  starts_at timestamptz not null default now(), ends_at timestamptz not null, defeated_at timestamptz
);
create table if not exists public.boss_hits (
  boss_id bigint references public.bosses(id) on delete cascade, player_id text not null,
  hits bigint not null default 0, last_at timestamptz not null default now(), primary key (boss_id, player_id)
);
create table if not exists public.hunts (
  id bigserial primary key, name text not null, reward int not null, bonus int not null,
  created_at timestamptz not null default now(), until timestamptz not null, active boolean not null default true
);
create table if not exists public.hunt_spots (
  code text primary key, hunt_id bigint references public.hunts(id) on delete cascade, num int not null, clue text not null
);
create table if not exists public.hunt_finds (
  code text references public.hunt_spots(code) on delete cascade, player_id text not null,
  found_at timestamptz not null default now(), primary key (code, player_id)
);

do $$ declare t text; begin
  foreach t in array array['period_base','game_scores','gifts','gallery','gallery_likes','announcements','bosses','boss_hits','hunts','hunt_spots','hunt_finds'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------- Outils internes (non accessibles depuis le jeu) ----------
create or replace function public._player(p_id text, p_token text) returns public.players
language sql security definer set search_path = public, extensions as $$
  select * from players where id = p_id and token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;
create or replace function public._admin(p_key text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select exists (select 1 from settings where key = 'admin_hash' and value = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex'));
$$;
create or replace function public._week() returns text language sql stable as $$ select 'w:' || to_char(now() at time zone 'Europe/Paris', 'IYYY-IW') $$;
create or replace function public._month(p_offset int default 0) returns text language sql stable as $$
  select 'm:' || to_char((now() at time zone 'Europe/Paris') + make_interval(months => p_offset), 'YYYY-MM') $$;
revoke all on function public._player, public._admin from public, anon, authenticated;

-- ---------- Envoi du score (remplace la version de setup.sql, compatible avec l'ancienne) ----------
drop function if exists public.submit_score(text, text, text, boolean, double precision, double precision, int, int);
create or replace function public.submit_score(
  p_id text, p_token text, p_pseudo text, p_listed boolean,
  p_lifetime double precision, p_cps double precision, p_seasons int, p_achievements int,
  p_games bigint default null, p_golden bigint default null, p_clicks bigint default null, p_missions bigint default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  r players%rowtype;
  v_hash text := encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_elapsed double precision; v_max double precision; v_life double precision;
  g bigint; go bigint; c bigint; m bigint;
begin
  if p_id is null or p_id !~ '^[A-Z0-9]{6,12}$' or length(coalesce(p_token, '')) < 16 then
    return json_build_object('ok', false, 'error', 'invalid');
  end if;
  p_pseudo := left(regexp_replace(coalesce(p_pseudo, ''), '[^[:alnum:] _''-]', '', 'g'), 20);
  p_cps := least(greatest(coalesce(p_cps, 0), 0), 1e18);
  p_lifetime := greatest(coalesce(p_lifetime, 0), 0);

  select * into r from players where id = p_id;
  if not found then
    insert into players (id, token_hash, pseudo, listed, lifetime, cps, seasons, achievements, tot_games, tot_golden, tot_clicks, tot_missions)
    values (p_id, v_hash, p_pseudo, coalesce(p_listed, true), least(p_lifetime, 1e12), least(p_cps, 1e9),
            least(greatest(coalesce(p_seasons, 0), 0), 50), least(greatest(coalesce(p_achievements, 0), 0), 1000),
            least(greatest(coalesce(p_games, 0), 0), 5000), least(greatest(coalesce(p_golden, 0), 0), 5000),
            least(greatest(coalesce(p_clicks, 0), 0), 1e7), least(greatest(coalesce(p_missions, 0), 0), 2000));
    select * into r from players where id = p_id;
  else
    if r.token_hash <> v_hash then return json_build_object('ok', false, 'error', 'token'); end if;
    if now() - r.updated_at < interval '30 seconds' then return json_build_object('ok', false, 'error', 'rate'); end if;
    v_elapsed := extract(epoch from now() - r.updated_at);
    v_max := r.lifetime + v_elapsed * greatest(r.cps, 1) * 30 + 1e6;
    v_life := least(greatest(p_lifetime, r.lifetime), v_max);
    -- Compteurs : progression plafonnée selon le temps écoulé
    g  := least(greatest(coalesce(p_games, r.tot_games), r.tot_games), r.tot_games + floor(v_elapsed / 15) + 2);
    go := least(greatest(coalesce(p_golden, r.tot_golden), r.tot_golden), r.tot_golden + floor(v_elapsed / 60) + 3);
    c  := least(greatest(coalesce(p_clicks, r.tot_clicks), r.tot_clicks), r.tot_clicks + floor(v_elapsed * 20) + 100);
    m  := least(greatest(coalesce(p_missions, r.tot_missions), r.tot_missions), r.tot_missions + floor(v_elapsed / 300) + 4);
    update players set
      pseudo = p_pseudo, listed = coalesce(p_listed, true), lifetime = v_life,
      cps = least(p_cps, greatest(r.cps, 1) * 1000 + 1e6),
      seasons = greatest(r.seasons, least(coalesce(p_seasons, 0), r.seasons + 1)),
      achievements = least(greatest(coalesce(p_achievements, 0), 0), 1000),
      tot_games = g, tot_golden = go, tot_clicks = c, tot_missions = m, updated_at = now()
    where id = p_id;
  end if;
  -- Point de départ de la semaine et du mois (valeurs connues avant cette mise à jour)
  insert into period_base values (p_id, _week(), r.tot_games, r.tot_golden, r.tot_clicks, r.tot_missions) on conflict do nothing;
  insert into period_base values (p_id, _month(), r.tot_games, r.tot_golden, r.tot_clicks, r.tot_missions) on conflict do nothing;
  return json_build_object('ok', true);
end $$;

-- ---------- 1. Défi collectif de la semaine ----------
create or replace function public.weekly_challenge()
returns json language plpgsql security definer set search_path = public as $$
declare
  wk text := _week();
  idx int := (extract(week from now() at time zone 'Europe/Paris')::int) % 4;
  metric text := (array['games', 'golden', 'missions', 'clicks'])[idx + 1];
  per int := (array[5, 3, 4, 1500])[idx + 1];
  mini int := (array[50, 30, 30, 15000])[idx + 1];
  active int; total bigint; target bigint;
begin
  select count(*) into active from players where updated_at > now() - interval '14 days';
  target := greatest(mini, active * per);
  select coalesce(sum(case metric
      when 'games' then p.tot_games - b.b_games when 'golden' then p.tot_golden - b.b_golden
      when 'missions' then p.tot_missions - b.b_missions else p.tot_clicks - b.b_clicks end), 0)
    into total from period_base b join players p on p.id = b.player_id where b.period = wk;
  return json_build_object('week', wk, 'metric', metric, 'target', target, 'total', total, 'done', total >= target,
    'ends_at', date_trunc('week', now() at time zone 'Europe/Paris') + interval '7 days');
end $$;

-- ---------- 4. Classements de la semaine par mini-jeu ----------
create or replace function public.submit_game_score(p_id text, p_token text, p_game text, p_score int)
returns json language plpgsql security definer set search_path = public as $$
declare r players%rowtype; cap int; last timestamptz;
begin
  r := _player(p_id, p_token);
  if r.id is null then return json_build_object('ok', false, 'error', 'token'); end if;
  cap := case p_game when 'match3' then 60000 when 'memory' then 3000 when 'bugs' then 4000 when 'simon' then 4000
    when 'puzzle' then 6000 when 'bubbles' then 400 when 'catcher' then 400 else null end;
  if cap is null then return json_build_object('ok', false, 'error', 'game'); end if;
  select max(updated_at) into last from game_scores where player_id = p_id;
  if last is not null and now() - last < interval '10 seconds' then return json_build_object('ok', false, 'error', 'rate'); end if;
  insert into game_scores (player_id, game, week, best) values (p_id, p_game, _week(), least(greatest(p_score, 0), cap))
  on conflict (player_id, game, week) do update set best = greatest(game_scores.best, excluded.best), updated_at = now();
  return json_build_object('ok', true);
end $$;

create or replace function public.game_leaderboard(p_game text, p_id text default null)
returns table (rank bigint, pseudo text, best int, me boolean)
language sql security definer set search_path = public as $$
  select row_number() over (order by s.best desc, s.updated_at), case when p.pseudo = '' then 'Anonyme' else p.pseudo end,
         s.best, s.player_id = p_id
  from game_scores s join players p on p.id = s.player_id
  where s.game = p_game and s.week = _week() and p.listed
  order by s.best desc, s.updated_at limit 10;
$$;

-- ---------- 5. Équipes (points du mois) ----------
create or replace function public.set_team(p_id text, p_token text, p_team text)
returns json language plpgsql security definer set search_path = public as $$
declare r players%rowtype;
begin
  r := _player(p_id, p_token);
  if r.id is null then return json_build_object('ok', false, 'error', 'token'); end if;
  if p_team not in ('atelier', 'fablab', 'tierslieu') then return json_build_object('ok', false, 'error', 'team'); end if;
  if r.team is not null and r.team_changed_at > now() - interval '30 days' then
    return json_build_object('ok', false, 'error', 'locked', 'until', r.team_changed_at + interval '30 days');
  end if;
  update players set team = p_team, team_changed_at = now() where id = p_id;
  return json_build_object('ok', true);
end $$;

create or replace function public.team_standings(p_id text default null)
returns json language sql security definer set search_path = public as $$
  with pts as (
    select p.team, b.period,
      sum((p.tot_games - b.b_games) * 10 + (p.tot_missions - b.b_missions) * 20 + (p.tot_golden - b.b_golden) * 5) as points,
      count(*) as members
    from players p join period_base b on b.player_id = p.id
    where p.team is not null and b.period in (_month(), _month(-1))
    group by p.team, b.period)
  select json_build_object(
    'month', _month(),
    'teams', coalesce((select json_agg(json_build_object('team', team, 'points', points, 'members', members) order by points desc) from pts where period = _month()), '[]'),
    'last_winner', (select team from pts where period = _month(-1) order by points desc limit 1),
    'my_team', (select team from players where id = p_id),
    'locked_until', (select team_changed_at + interval '30 days' from players where id = p_id and team_changed_at > now() - interval '30 days'));
$$;

-- ---------- 6. Cadeaux entre joueurs ----------
create or replace function public.send_gift(p_id text, p_token text, p_to text)
returns json language plpgsql security definer set search_path = public as $$
declare r players%rowtype; dest text;
begin
  r := _player(p_id, p_token);
  if r.id is null then return json_build_object('ok', false, 'error', 'token'); end if;
  p_to := upper(regexp_replace(coalesce(p_to, ''), '[^A-Za-z0-9]', '', 'g'));
  if p_to = p_id then return json_build_object('ok', false, 'error', 'self'); end if;
  select id into dest from players where id = p_to;
  if dest is null then return json_build_object('ok', false, 'error', 'unknown'); end if;
  if exists (select 1 from gifts where from_id = p_id and created_at > now() - interval '20 hours') then
    return json_build_object('ok', false, 'error', 'daily');
  end if;
  insert into gifts (from_id, to_id, amount) values (p_id, p_to, 10);
  return json_build_object('ok', true);
end $$;

create or replace function public.claim_gifts(p_id text, p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare r players%rowtype; res json;
begin
  r := _player(p_id, p_token);
  if r.id is null then return '[]'::json; end if;
  with c as (update gifts set claimed = true where to_id = p_id and not claimed returning from_id, amount)
  select coalesce(json_agg(json_build_object('from', coalesce(nullif(p.pseudo, ''), 'Un·e joueur·euse'), 'amount', c.amount)), '[]')
    into res from c left join players p on p.id = c.from_id;
  return res;
end $$;

-- ---------- 7. Galerie des Cocottes ----------
create or replace function public.share_gallery(p_id text, p_token text, p_skin text, p_bg text)
returns json language plpgsql security definer set search_path = public as $$
declare r players%rowtype;
begin
  r := _player(p_id, p_token);
  if r.id is null then return json_build_object('ok', false, 'error', 'token'); end if;
  if p_skin !~ '^[a-z0-9-]{1,32}$' or p_bg !~ '^[a-z0-9-]{1,32}$' then return json_build_object('ok', false, 'error', 'invalid'); end if;
  insert into gallery (player_id, skin, bg) values (p_id, p_skin, p_bg)
  on conflict (player_id) do update set skin = excluded.skin, bg = excluded.bg, updated_at = now();
  return json_build_object('ok', true);
end $$;

create or replace function public.gallery_list(p_id text default null, p_limit int default 30)
returns table (owner text, pseudo text, skin text, bg text, likes int, liked boolean, mine boolean)
language sql security definer set search_path = public as $$
  select g.player_id, case when p.pseudo = '' then 'Anonyme' else p.pseudo end, g.skin, g.bg, g.likes,
         exists (select 1 from gallery_likes l where l.owner_id = g.player_id and l.liker_id = p_id), g.player_id = p_id
  from gallery g join players p on p.id = g.player_id
  order by g.likes desc, g.updated_at desc limit least(greatest(coalesce(p_limit, 30), 1), 60);
$$;

create or replace function public.like_gallery(p_id text, p_token text, p_owner text)
returns json language plpgsql security definer set search_path = public as $$
declare r players%rowtype;
begin
  r := _player(p_id, p_token);
  if r.id is null or p_owner = p_id then return json_build_object('ok', false); end if;
  if exists (select 1 from gallery_likes where liker_id = p_id and owner_id = p_owner) then
    delete from gallery_likes where liker_id = p_id and owner_id = p_owner;
    update gallery set likes = greatest(likes - 1, 0) where player_id = p_owner;
    return json_build_object('ok', true, 'liked', false);
  end if;
  insert into gallery_likes values (p_id, p_owner);
  update gallery set likes = likes + 1 where player_id = p_owner;
  return json_build_object('ok', true, 'liked', true);
end $$;

-- ---------- 3. Annonces, 9. boss, 8. chasse : état en direct ----------
create or replace function public.get_live(p_id text default null)
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'announcement', (select json_build_object('id', id, 'text', text) from announcements where until > now() order by created_at desc limit 1),
    'boss', (select json_build_object('id', b.id, 'name', b.name, 'hp', b.hp, 'hp_max', b.hp_max, 'reward', b.reward,
               'ends_at', b.ends_at, 'defeated', b.defeated_at is not null,
               'my_hits', coalesce((select hits from boss_hits h where h.boss_id = b.id and h.player_id = p_id), 0),
               'players', (select count(*) from boss_hits h where h.boss_id = b.id))
             from bosses b where b.ends_at > now() - interval '1 day' order by b.starts_at desc limit 1),
    'hunt', (select json_build_object('id', h.id, 'name', h.name, 'until', h.until, 'total', (select count(*) from hunt_spots s where s.hunt_id = h.id),
               'found', (select count(*) from hunt_finds f join hunt_spots s on s.code = f.code where s.hunt_id = h.id and f.player_id = p_id))
             from hunts h where h.active and h.until > now() order by h.created_at desc limit 1));
$$;

create or replace function public.hit_boss(p_id text, p_token text, p_boss bigint, p_hits int)
returns json language plpgsql security definer set search_path = public as $$
declare r players%rowtype; b bosses%rowtype; prev boss_hits%rowtype; n bigint;
begin
  r := _player(p_id, p_token);
  if r.id is null then return json_build_object('ok', false, 'error', 'token'); end if;
  select * into b from bosses where id = p_boss for update;
  if b.id is null or b.defeated_at is not null or b.ends_at < now() or b.starts_at > now() then return json_build_object('ok', false, 'error', 'closed'); end if;
  select * into prev from boss_hits where boss_id = p_boss and player_id = p_id;
  -- 15 coups par seconde au maximum depuis le dernier envoi
  n := least(greatest(coalesce(p_hits, 0), 0), floor(extract(epoch from now() - coalesce(prev.last_at, now() - interval '20 seconds')) * 15) + 30);
  insert into boss_hits (boss_id, player_id, hits, last_at) values (p_boss, p_id, n, now())
  on conflict (boss_id, player_id) do update set hits = boss_hits.hits + n, last_at = now();
  update bosses set hp = greatest(hp - n, 0), defeated_at = case when hp - n <= 0 then now() else defeated_at end where id = p_boss;
  return json_build_object('ok', true, 'counted', n);
end $$;

create or replace function public.hunt_find(p_id text, p_token text, p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare r players%rowtype; s hunt_spots%rowtype; h hunts%rowtype; v_total int; v_found int; v_rows int;
begin
  r := _player(p_id, p_token);
  if r.id is null then return json_build_object('ok', false, 'error', 'token'); end if;
  select * into s from hunt_spots where code = p_code;
  if s.code is null then return json_build_object('ok', false, 'error', 'unknown'); end if;
  select * into h from hunts where id = s.hunt_id;
  if not h.active or h.until < now() then return json_build_object('ok', false, 'error', 'closed'); end if;
  insert into hunt_finds (code, player_id) values (p_code, p_id) on conflict do nothing;
  get diagnostics v_rows = row_count;
  select count(*) into v_total from hunt_spots where hunt_id = h.id;
  select count(*) into v_found from hunt_finds f join hunt_spots x on x.code = f.code where x.hunt_id = h.id and f.player_id = p_id;
  return json_build_object('ok', true, 'new', v_rows > 0, 'hunt', h.name, 'num', s.num, 'clue', s.clue, 'reward', h.reward,
    'bonus', h.bonus, 'found', v_found, 'total', v_total, 'complete', v_found = v_total, 'hunt_id', h.id);
end $$;

-- ---------- Fonctions de l'équipe (clé serveur obligatoire) ----------
create or replace function public.admin_check(p_key text) returns boolean
language sql security definer set search_path = public as $$ select _admin(p_key) $$;

create or replace function public.admin_announce(p_key text, p_text text, p_hours int)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  update announcements set until = now() where until > now();
  if coalesce(trim(p_text), '') <> '' then
    insert into announcements (text, until) values (left(trim(p_text), 200), now() + make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 31)));
  end if;
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_start_boss(p_key text, p_name text, p_hp bigint, p_hours int, p_reward int)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  update bosses set ends_at = now() where ends_at > now() and defeated_at is null;
  insert into bosses (name, hp_max, hp, reward, ends_at)
  values (left(coalesce(nullif(trim(p_name), ''), 'Méga-bug'), 40), least(greatest(p_hp, 100), 1e9), least(greatest(p_hp, 100), 1e9),
          least(greatest(coalesce(p_reward, 50), 0), 1000), now() + make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 14)));
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_stop_boss(p_key text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  update bosses set ends_at = now() where ends_at > now();
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_create_hunt(p_key text, p_name text, p_hours int, p_reward int, p_bonus int, p_clues text[])
returns json language plpgsql security definer set search_path = public, extensions as $$
declare hid bigint; codes json; i int;
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  if coalesce(array_length(p_clues, 1), 0) < 1 or array_length(p_clues, 1) > 30 then return json_build_object('ok', false, 'error', 'clues'); end if;
  update hunts set active = false where active;
  insert into hunts (name, reward, bonus, until)
  values (left(coalesce(nullif(trim(p_name), ''), 'Chasse au trésor'), 60), least(greatest(coalesce(p_reward, 10), 0), 500),
          least(greatest(coalesce(p_bonus, 50), 0), 2000), now() + make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 31)))
  returning id into hid;
  for i in 1 .. array_length(p_clues, 1) loop
    insert into hunt_spots (code, hunt_id, num, clue) values (encode(gen_random_bytes(9), 'hex'), hid, i, left(p_clues[i], 200));
  end loop;
  select json_agg(json_build_object('num', num, 'code', code, 'clue', clue) order by num) into codes from hunt_spots where hunt_id = hid;
  return json_build_object('ok', true, 'id', hid, 'spots', codes);
end $$;

create or replace function public.admin_hunt_spots(p_key text)
returns json language sql security definer set search_path = public as $$
  select case when not _admin(p_key) then null else (
    select json_build_object('name', h.name, 'until', h.until,
      'spots', (select json_agg(json_build_object('num', s.num, 'code', s.code, 'clue', s.clue,
                'finds', (select count(*) from hunt_finds f where f.code = s.code)) order by s.num) from hunt_spots s where s.hunt_id = h.id))
    from hunts h where h.active and h.until > now() order by h.created_at desc limit 1) end;
$$;

create or replace function public.admin_stop_hunt(p_key text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  update hunts set active = false where active;
  return json_build_object('ok', true);
end $$;

create or replace function public.admin_gallery_remove(p_key text, p_owner text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not _admin(p_key) then return json_build_object('ok', false, 'error', 'key'); end if;
  delete from gallery where player_id = p_owner;
  return json_build_object('ok', true);
end $$;

-- ---------- Droits : le jeu n'appelle que ces fonctions ----------
grant execute on function
  public.submit_score, public.weekly_challenge, public.submit_game_score, public.game_leaderboard,
  public.set_team, public.team_standings, public.send_gift, public.claim_gifts,
  public.share_gallery, public.gallery_list, public.like_gallery,
  public.get_live, public.hit_boss, public.hunt_find,
  public.admin_check, public.admin_announce, public.admin_start_boss, public.admin_stop_boss,
  public.admin_create_hunt, public.admin_hunt_spots, public.admin_stop_hunt, public.admin_gallery_remove
to anon;
