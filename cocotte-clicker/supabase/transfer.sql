-- Co'Clicker : transfert de partie d'un appareil à l'autre (QR code ou code court)
-- À exécuter une fois dans Supabase → SQL Editor, après setup.sql et online.sql.
-- Principe : l'ancien appareil dépose sa sauvegarde sous un code de 8 caractères valable 10 minutes,
-- le nouvel appareil la récupère (une seule fois) en scannant le QR ou en tapant le code.

create table if not exists public.save_transfers (
  code       text primary key,
  player_id  text not null unique,
  data       text not null,
  created_at timestamptz not null default now()
);
alter table public.save_transfers enable row level security;
revoke all on public.save_transfers from anon, authenticated;

-- Dépose une sauvegarde. Si le joueur est déjà inscrit au serveur, son jeton doit être valide.
create or replace function public.create_transfer(p_id text, p_token text, p_data text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text := '';
  v_abc  constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sans 0/O, 1/I/L
  v_b    bytea;
  i      int;
begin
  if p_id is null or p_id !~ '^[A-Z0-9]{6,12}$' then return json_build_object('ok', false, 'error', 'id'); end if;
  if p_data is null or length(p_data) > 300000 or p_data not like 'COCOTTE1:%' then return json_build_object('ok', false, 'error', 'data'); end if;
  if exists (select 1 from players where id = p_id)
     and not exists (select 1 from players where id = p_id and token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')) then
    return json_build_object('ok', false, 'error', 'auth');
  end if;
  -- Ménage : transferts expirés et ancien transfert de ce joueur
  delete from save_transfers where created_at < now() - interval '10 minutes' or player_id = p_id;
  if (select count(*) from save_transfers) >= 500 then return json_build_object('ok', false, 'error', 'busy'); end if;
  loop
    v_b := gen_random_bytes(8); v_code := '';
    for i in 0..7 loop v_code := v_code || substr(v_abc, 1 + get_byte(v_b, i) % length(v_abc), 1); end loop;
    exit when not exists (select 1 from save_transfers where code = v_code);
  end loop;
  insert into save_transfers (code, player_id, data) values (v_code, p_id, p_data);
  return json_build_object('ok', true, 'code', v_code, 'expires_at', now() + interval '10 minutes');
end $$;

-- Récupère une sauvegarde (usage unique : elle est effacée du serveur)
create or replace function public.take_transfer(p_code text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare v_data text;
begin
  delete from save_transfers
   where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
     and created_at >= now() - interval '10 minutes'
  returning data into v_data;
  if v_data is null then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'data', v_data);
end $$;

revoke all on function public.create_transfer(text, text, text), public.take_transfer(text) from public;
grant execute on function public.create_transfer(text, text, text), public.take_transfer(text) to anon, authenticated;
