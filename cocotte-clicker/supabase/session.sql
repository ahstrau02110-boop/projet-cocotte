-- Co'Clicker : une seule session active par joueur (évite les conflits quand le jeu est ouvert sur deux appareils)
-- À exécuter une fois dans Supabase → SQL Editor, après cloud.sql.
--
-- Chaque onglet de jeu a un identifiant de session (p_sid). À l'ouverture, il « prend la main » (p_claim).
-- Les autres sessions de ce joueur sont alors refusées (« taken ») tant que la session active a donné
-- signe de vie depuis moins de 3 minutes : elles se mettent en pause et proposent « Reprendre ici ».

create table if not exists public.cloud_sessions (
  player_id text primary key,
  sid       text not null,
  seen_at   timestamptz not null default now()
);
alter table public.cloud_sessions enable row level security;
revoke all on public.cloud_sessions from anon, authenticated;

-- true si p_sid peut agir (et l'enregistre comme session active)
create or replace function public._session(p_id text, p_sid text, p_claim boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare s cloud_sessions;
begin
  if p_sid is null or p_sid = '' then return true; end if; -- ancienne version du jeu : pas de contrôle
  if not coalesce(p_claim, false) then
    select * into s from cloud_sessions where player_id = p_id;
    if found and s.sid <> p_sid and s.seen_at > now() - interval '3 minutes' then return false; end if;
  end if;
  insert into cloud_sessions (player_id, sid, seen_at) values (p_id, left(p_sid, 64), now())
    on conflict (player_id) do update set sid = excluded.sid, seen_at = now();
  return true;
end $$;
revoke all on function public._session(text, text, boolean) from public, anon, authenticated;

-- Nouvelles versions de cloud_get / cloud_put avec la session
drop function if exists public.cloud_get(text, text, bigint);
drop function if exists public.cloud_put(text, text, text, double precision, bigint);

create or replace function public.cloud_get(p_id text, p_token text, p_rev bigint, p_sid text default null, p_claim boolean default false)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare c cloud_saves;
begin
  if (select _player(p_id, p_token)) is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  if not _session(p_id, p_sid, p_claim) then return json_build_object('ok', false, 'error', 'taken'); end if;
  select * into c from cloud_saves where player_id = p_id;
  if not found or c.rev <= coalesce(p_rev, 0) then return json_build_object('ok', true, 'newer', false, 'rev', coalesce(c.rev, 0)); end if;
  return json_build_object('ok', true, 'newer', true, 'rev', c.rev, 'data', c.data);
end $$;

create or replace function public.cloud_put(p_id text, p_token text, p_data text, p_progress double precision, p_base_rev bigint, p_sid text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare c cloud_saves;
begin
  if (select _player(p_id, p_token)) is null then return json_build_object('ok', false, 'error', 'auth'); end if;
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

revoke all on function public.cloud_get(text, text, bigint, text, boolean), public.cloud_put(text, text, text, double precision, bigint, text) from public;
grant execute on function public.cloud_get(text, text, bigint, text, boolean), public.cloud_put(text, text, text, double precision, bigint, text) to anon, authenticated;
