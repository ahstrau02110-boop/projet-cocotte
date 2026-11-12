-- Co'Clicker : sauvegarde en ligne automatique + code de secours
-- À exécuter une fois dans Supabase → SQL Editor, après setup.sql, online.sql et transfer.sql.
--
-- Chaque appareil envoie sa partie (avec un numéro de version « rev »). Si deux appareils ont joué
-- chacun de leur côté, le serveur garde la partie la plus avancée (total de Co'Coins produits)
-- et met l'autre de côté pendant 7 jours (cloud_backups).

create table if not exists public.cloud_saves (
  player_id  text primary key,
  rev        bigint not null default 1,
  data       text not null,
  progress   double precision not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.cloud_backups (
  id         bigint generated always as identity primary key,
  player_id  text not null,
  data       text not null,
  progress   double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists cloud_backups_player on public.cloud_backups (player_id, created_at desc);
alter table public.cloud_saves enable row level security;
alter table public.cloud_backups enable row level security;
revoke all on public.cloud_saves, public.cloud_backups from anon, authenticated;
alter table public.players add column if not exists recovery_hash text;
create unique index if not exists players_recovery on public.players (recovery_hash) where recovery_hash is not null;

-- Envoie la partie. p_base_rev = dernière version connue de l'appareil.
create or replace function public.cloud_put(p_id text, p_token text, p_data text, p_progress double precision, p_base_rev bigint)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare c cloud_saves;
begin
  if (select _player(p_id, p_token)) is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if p_data is null or length(p_data) > 300000 or p_data not like 'COCOTTE1:%' then return json_build_object('ok', false, 'error', 'data'); end if;
  select * into c from cloud_saves where player_id = p_id for update;
  if not found then
    insert into cloud_saves (player_id, rev, data, progress) values (p_id, 1, p_data, coalesce(p_progress, 0));
    return json_build_object('ok', true, 'rev', 1);
  end if;
  -- Cas normal : l'appareil part de la dernière version du serveur
  if coalesce(p_base_rev, 0) = c.rev or coalesce(p_progress, 0) > c.progress then
    if coalesce(p_base_rev, 0) <> c.rev then -- conflit gagné : on met de côté la version du serveur
      insert into cloud_backups (player_id, data, progress) values (p_id, c.data, c.progress);
    end if;
    update cloud_saves set rev = c.rev + 1, data = p_data, progress = coalesce(p_progress, 0), updated_at = now() where player_id = p_id;
    delete from cloud_backups where created_at < now() - interval '7 days';
    return json_build_object('ok', true, 'rev', c.rev + 1);
  end if;
  -- Conflit perdu : la partie du serveur est plus avancée, l'appareil doit la reprendre
  insert into cloud_backups (player_id, data, progress) values (p_id, p_data, coalesce(p_progress, 0));
  return json_build_object('ok', false, 'error', 'newer', 'rev', c.rev, 'data', c.data);
end $$;

-- Récupère la partie si le serveur a une version plus récente que p_rev
create or replace function public.cloud_get(p_id text, p_token text, p_rev bigint)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare c cloud_saves;
begin
  if (select _player(p_id, p_token)) is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  select * into c from cloud_saves where player_id = p_id;
  if not found or c.rev <= coalesce(p_rev, 0) then return json_build_object('ok', true, 'newer', false, 'rev', coalesce(c.rev, 0)); end if;
  return json_build_object('ok', true, 'newer', true, 'rev', c.rev, 'data', c.data);
end $$;

-- Crée (ou remplace) le code de secours. Il n'est affiché qu'une fois : le serveur n'en garde que l'empreinte.
create or replace function public.cloud_new_recovery(p_id text, p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_abc constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_b bytea; v_code text; i int;
begin
  if (select _player(p_id, p_token)) is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  loop
    v_b := gen_random_bytes(12); v_code := '';
    for i in 0..11 loop v_code := v_code || substr(v_abc, 1 + get_byte(v_b, i) % length(v_abc), 1); end loop;
    exit when not exists (select 1 from players where recovery_hash = encode(digest(v_code, 'sha256'), 'hex'));
  end loop;
  update players set recovery_hash = encode(digest(v_code, 'sha256'), 'hex') where id = p_id;
  return json_build_object('ok', true, 'code', v_code);
end $$;

-- Récupère une partie avec le code de secours (téléphone perdu…).
-- Un nouveau jeton est créé : les autres appareils de ce joueur sont déconnectés de la sauvegarde en ligne.
create or replace function public.cloud_recover(p_code text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_id text; v_token text; c cloud_saves;
begin
  if length(v_code) <> 12 then return json_build_object('ok', false); end if;
  select id into v_id from players where recovery_hash = encode(digest(v_code, 'sha256'), 'hex');
  if v_id is null then return json_build_object('ok', false); end if;
  select * into c from cloud_saves where player_id = v_id;
  if not found then return json_build_object('ok', false, 'error', 'nosave'); end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  update players set token_hash = encode(digest(v_token, 'sha256'), 'hex') where id = v_id;
  return json_build_object('ok', true, 'id', v_id, 'token', v_token, 'rev', c.rev, 'data', c.data);
end $$;

revoke all on function public.cloud_put(text, text, text, double precision, bigint), public.cloud_get(text, text, bigint),
  public.cloud_new_recovery(text, text), public.cloud_recover(text) from public;
grant execute on function public.cloud_put(text, text, text, double precision, bigint), public.cloud_get(text, text, bigint),
  public.cloud_new_recovery(text, text), public.cloud_recover(text) to anon, authenticated;
