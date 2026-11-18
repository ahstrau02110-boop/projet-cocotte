-- Co'Clicker : Échecs — duels en ligne entre joueurs (QR code ou code à 6 caractères)
-- À exécuter une fois dans Supabase → SQL Editor, après les autres scripts.
--
-- Le serveur garde la liste des coups, vérifie que chacun joue à son tour, dans l'ordre, au bon format,
-- et tient les résultats. Les deux jeux vérifient la légalité de chaque coup (un coup illégal reçu
-- stoppe la partie et signale le joueur). Aucune récompense en jeu : rien à gagner à tricher.
-- Ladder : classement Elo (départ 1200). Partie classée si au moins 4 demi-coups (ou coup illégal / absence),
-- et au plus 3 parties classées par 24 h entre les deux mêmes joueurs (contre le « farming » entre comptes).

create table if not exists public.chess_games (
  code        text primary key,                            -- 6 caractères, dans le QR
  white       text references public.players(id) on delete cascade,
  black       text references public.players(id) on delete cascade,
  creator     text not null references public.players(id) on delete cascade,
  moves       text[] not null default '{}',                -- coups au format UCI (e2e4, e7e8q…)
  status      text not null default 'wait' check (status in ('wait', 'play', 'end')),
  result      text check (result in ('w', 'b', 'd')),
  reason      text,
  draw_offer  text check (draw_offer in ('w', 'b')),       -- couleur qui propose la nulle
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists chess_games_white on public.chess_games (white);
create index if not exists chess_games_black on public.chess_games (black);

create table if not exists public.chess_stats (
  player_id text primary key references public.players(id) on delete cascade,
  wins int not null default 0, losses int not null default 0, draws int not null default 0
);
alter table public.chess_stats add column if not exists elo int not null default 1200;
alter table public.chess_stats add column if not exists rated int not null default 0;        -- parties classées jouées
alter table public.chess_stats add column if not exists best_elo int not null default 1200;
alter table public.chess_games add column if not exists rated boolean not null default false;
alter table public.chess_games add column if not exists d_white int;                          -- variation Elo des Blancs
alter table public.chess_games add column if not exists d_black int;
alter table public.chess_games enable row level security;
alter table public.chess_stats enable row level security;
revoke all on public.chess_games, public.chess_stats from anon, authenticated;

-- Vue d'une partie pour un joueur
create or replace function public._chess_json(g public.chess_games, p_id text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('ok', true, 'code', g.code, 'moves', to_json(g.moves), 'status', g.status, 'result', g.result, 'reason', g.reason,
    'draw_offer', g.draw_offer, 'updated_at', g.updated_at, 'server_time', now(), 'rated', g.rated, 'd_white', g.d_white, 'd_black', g.d_black,
    'elo_white', (select elo from chess_stats where player_id = g.white), 'elo_black', (select elo from chess_stats where player_id = g.black),
    'me', case when p_id = g.white then 'w' when p_id = g.black then 'b' else null end,
    'white', (select case when pseudo = '' then 'Anonyme' else pseudo end from players where id = g.white),
    'black', (select case when pseudo = '' then 'Anonyme' else pseudo end from players where id = g.black)) $$;

-- Fin de partie : résultat + statistiques
create or replace function public._chess_finish(p_code text, p_result text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare g chess_games; pair int; ew int; eb int; nw int; nb int; sw double precision; ex double precision; dw int; db int;
begin
  update chess_games set status = 'end', result = p_result, reason = left(p_reason, 20), draw_offer = null, updated_at = now()
    where code = p_code and status = 'play' returning * into g;
  if not found then return; end if;
  insert into chess_stats (player_id) values (g.white), (g.black) on conflict do nothing;
  if p_result = 'd' then
    update chess_stats set draws = draws + 1 where player_id in (g.white, g.black);
  else
    update chess_stats set wins = wins + 1 where player_id = case when p_result = 'w' then g.white else g.black end;
    update chess_stats set losses = losses + 1 where player_id = case when p_result = 'w' then g.black else g.white end;
  end if;
  -- Ladder (Elo)
  if coalesce(array_length(g.moves, 1), 0) >= 4 or p_reason in ('illegal', 'timeout') then
    select count(*) into pair from chess_games where rated and updated_at > now() - interval '24 hours'
      and ((white = g.white and black = g.black) or (white = g.black and black = g.white));
    if pair < 3 then
      select elo, rated into ew, nw from chess_stats where player_id = g.white;
      select elo, rated into eb, nb from chess_stats where player_id = g.black;
      sw := case p_result when 'w' then 1 when 'b' then 0 else 0.5 end;
      ex := 1 / (1 + power(10, (eb - ew) / 400.0));
      dw := round((case when nw < 10 then 40 else 24 end) * (sw - ex));
      db := round((case when nb < 10 then 40 else 24 end) * ((1 - sw) - (1 - ex)));
      update chess_stats set elo = greatest(100, elo + dw), rated = rated + 1, best_elo = greatest(best_elo, elo + dw) where player_id = g.white;
      update chess_stats set elo = greatest(100, elo + db), rated = rated + 1, best_elo = greatest(best_elo, elo + db) where player_id = g.black;
      update chess_games set rated = true, d_white = dw, d_black = db where code = g.code;
    end if;
  end if;
end $$;

-- Créer un défi (p_color : 'w', 'b' ou 'r' = au hasard)
create or replace function public.chess_create(p_id text, p_token text, p_color text default 'r')
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players; c text; col text; g chess_games;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if p.banned then return json_build_object('ok', false, 'error', 'banned'); end if;
  -- Ménage : défis jamais acceptés (2 jours), parties finies (30 jours), parties abandonnées sans coup (7 jours)
  delete from chess_games where (status = 'wait' and created_at < now() - interval '2 days')
    or (status = 'end' and updated_at < now() - interval '30 days') or (status = 'play' and updated_at < now() - interval '30 days');
  if (select count(*) from chess_games where creator = p_id and status = 'wait') >= 5 then
    delete from chess_games where code = (select code from chess_games where creator = p_id and status = 'wait' order by created_at limit 1);
  end if;
  col := case when p_color in ('w', 'b') then p_color when random() < 0.5 then 'w' else 'b' end;
  loop
    c := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from chess_games where code = c);
  end loop;
  insert into chess_games (code, creator, white, black) values (c, p_id, case when col = 'w' then p_id end, case when col = 'b' then p_id end)
    returning * into g;
  return _chess_json(g, p_id);
end $$;

-- Rejoindre un défi (ou reprendre une partie dont on fait partie)
create or replace function public.chess_join(p_id text, p_token text, p_code text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players; g chess_games;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if p.banned then return json_build_object('ok', false, 'error', 'banned'); end if;
  select * into g from chess_games where code = upper(p_code) for update;
  if not found then return json_build_object('ok', false, 'error', 'code'); end if;
  if p_id in (coalesce(g.white, ''), coalesce(g.black, '')) then return _chess_json(g, p_id); end if;
  if g.status <> 'wait' then return json_build_object('ok', false, 'error', 'full'); end if;
  update chess_games set white = coalesce(white, p_id), black = coalesce(black, p_id), status = 'play', updated_at = now()
    where code = g.code returning * into g;
  return _chess_json(g, p_id);
end $$;

-- État d'une partie (lecture, toutes les 2 s pendant le jeu)
create or replace function public.chess_state(p_id text, p_code text)
returns json language plpgsql stable security definer set search_path = public as $$
declare g chess_games;
begin
  select * into g from chess_games where code = upper(p_code);
  if not found then return json_build_object('ok', false, 'error', 'code'); end if;
  return _chess_json(g, p_id);
end $$;

-- Jouer un coup : seulement à son tour, dans l'ordre (p_ply = nombre de coups déjà joués)
create or replace function public.chess_move(p_id text, p_token text, p_code text, p_ply int, p_move text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players; g chess_games; col text;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  select * into g from chess_games where code = upper(p_code) for update;
  if not found then return json_build_object('ok', false, 'error', 'code'); end if;
  col := case when p_id = g.white then 'w' when p_id = g.black then 'b' end;
  if col is null then return json_build_object('ok', false, 'error', 'player'); end if;
  if g.status <> 'play' then return json_build_object('ok', false, 'error', 'status', 'state', _chess_json(g, p_id)); end if;
  if p_move !~ '^[a-h][1-8][a-h][1-8][qrbn]?$' then return json_build_object('ok', false, 'error', 'format'); end if;
  if p_ply <> coalesce(array_length(g.moves, 1), 0) or (p_ply % 2 = 0) <> (col = 'w') then
    return json_build_object('ok', false, 'error', 'turn', 'state', _chess_json(g, p_id));
  end if;
  if p_ply >= 1200 then return json_build_object('ok', false, 'error', 'long'); end if;
  update chess_games set moves = moves || p_move, updated_at = now(),
    draw_offer = case when draw_offer = col then draw_offer else null end   -- jouer = refuser la nulle proposée
    where code = g.code returning * into g;
  return _chess_json(g, p_id);
end $$;

-- Fin de partie : p_action 'resign' (abandon), 'draw-offer', 'draw-accept', 'draw-decline',
-- 'over' (mat, pat, nulle constatée par le jeu, avec p_result et p_reason), 'illegal' (coup illégal reçu), 'timeout'
create or replace function public.chess_end(p_id text, p_token text, p_code text, p_action text, p_result text default null, p_reason text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players; g chess_games; col text; opp text;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  select * into g from chess_games where code = upper(p_code) for update;
  if not found then return json_build_object('ok', false, 'error', 'code'); end if;
  col := case when p_id = g.white then 'w' when p_id = g.black then 'b' end;
  -- Annuler un défi pas encore accepté
  if g.status = 'wait' and p_id = g.creator and p_action = 'cancel' then delete from chess_games where code = g.code; return json_build_object('ok', true); end if;
  if col is null then return json_build_object('ok', false, 'error', 'player'); end if;
  if g.status <> 'play' then return _chess_json(g, p_id); end if;
  opp := case when col = 'w' then 'b' else 'w' end;
  if p_action = 'resign' then perform _chess_finish(g.code, opp, 'resign');
  elsif p_action = 'draw-offer' then update chess_games set draw_offer = col, updated_at = now() where code = g.code;
  elsif p_action = 'draw-accept' and g.draw_offer = opp then perform _chess_finish(g.code, 'd', 'agreement');
  elsif p_action = 'draw-decline' and g.draw_offer = opp then update chess_games set draw_offer = null where code = g.code;
  elsif p_action = 'over' and p_result in ('w', 'b', 'd') and p_reason in ('mate', 'stalemate', '50', 'material', 'repetition') then
    perform _chess_finish(g.code, p_result, p_reason);
  elsif p_action = 'illegal' then
    -- L'adversaire a envoyé un coup impossible : partie gagnée par celui qui le signale
    perform _flag(case when col = 'w' then g.black else g.white end, 'echecs', 'Coup illégal ' || coalesce(g.moves[array_length(g.moves, 1)], '?') || ' (partie ' || g.code || ')');
    perform _chess_finish(g.code, col, 'illegal');
  elsif p_action = 'timeout' and g.updated_at < now() - interval '3 days'
        and (coalesce(array_length(g.moves, 1), 0) % 2 = 0) = (opp = 'w') then
    perform _chess_finish(g.code, col, 'timeout');   -- l'adversaire n'a pas joué depuis 3 jours
  else
    return json_build_object('ok', false, 'error', 'action', 'state', _chess_json(g, p_id));
  end if;
  select * into g from chess_games where code = g.code;
  return _chess_json(g, p_id);
end $$;

-- Mes parties (en cours d'abord) + mon bilan
create or replace function public.chess_mine(p_id text, p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare p players;
begin
  p := _player(p_id, p_token);
  if p.id is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  return json_build_object('ok', true,
    'games', coalesce((select json_agg(x order by (x->>'status') = 'end', (x->>'updated_at') desc) from (
      select json_build_object('code', g.code, 'status', g.status, 'result', g.result, 'reason', g.reason, 'updated_at', g.updated_at,
        'me', case when g.white = p_id then 'w' else 'b' end, 'plies', coalesce(array_length(g.moves, 1), 0), 'draw_offer', g.draw_offer,
        'opponent', (select case when pseudo = '' then 'Anonyme' else pseudo end from players where id = case when g.white = p_id then g.black else g.white end)) as x
      from chess_games g where (g.white = p_id or g.black = p_id) and (g.status <> 'end' or g.updated_at > now() - interval '7 days')
      order by g.updated_at desc limit 20) t), '[]'),
    'stats', (select json_build_object('wins', wins, 'losses', losses, 'draws', draws, 'elo', elo, 'rated', rated, 'best_elo', best_elo) from chess_stats where player_id = p_id));
end $$;

-- Ladder : classement Elo des joueurs ayant au moins une partie classée
create or replace function public.chess_ladder(p_id text default null, p_limit int default 20)
returns json language sql stable security definer set search_path = public as $$
  with r as (
    select s.player_id, case when pl.pseudo = '' then 'Anonyme' else pl.pseudo end as pseudo, pl.listed, s.elo, s.best_elo, s.wins, s.draws, s.losses, s.rated,
           row_number() over (order by s.elo desc, s.rated desc, s.player_id) as rank
    from chess_stats s join players pl on pl.id = s.player_id where not pl.banned and s.rated > 0)
  select json_build_object(
    'players', (select count(*) from r),
    'top', coalesce((select json_agg(json_build_object('rank', rank, 'pseudo', pseudo, 'elo', elo, 'wins', wins, 'draws', draws, 'losses', losses, 'me', player_id = p_id) order by rank)
                     from (select * from r where listed or player_id = p_id order by rank limit least(greatest(coalesce(p_limit, 20), 1), 50)) t), '[]'),
    'me', (select json_build_object('rank', rank, 'elo', elo, 'best_elo', best_elo, 'rated', rated) from r where player_id = p_id)) $$;

revoke all on function public._chess_json(public.chess_games, text), public._chess_finish(text, text, text) from public, anon, authenticated;
revoke all on function public.chess_create(text, text, text), public.chess_join(text, text, text), public.chess_state(text, text),
  public.chess_move(text, text, text, int, text), public.chess_end(text, text, text, text, text, text), public.chess_mine(text, text), public.chess_ladder(text, int) from public;
grant execute on function public.chess_create(text, text, text), public.chess_join(text, text, text), public.chess_state(text, text),
  public.chess_move(text, text, text, int, text), public.chess_end(text, text, text, text, text, text), public.chess_mine(text, text), public.chess_ladder(text, int) to anon, authenticated;
