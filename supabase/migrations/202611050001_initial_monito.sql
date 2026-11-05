create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  join_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  status text not null default 'setup' check (status in ('setup', 'open', 'closed')),
  created_at timestamptz not null default now()
);

create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  joined_at timestamptz not null default now(),
  drawn_at timestamptz,
  unique (room_id, user_id)
);

-- This table is intentionally inaccessible through the Data API. Recipients are
-- returned only by reveal_my_recipient(), after it verifies the current user.
create table public.assignments (
  room_id uuid not null references public.rooms(id) on delete cascade,
  giver_member_id uuid not null references public.room_members(id) on delete cascade,
  recipient_member_id uuid not null references public.room_members(id) on delete cascade,
  primary key (room_id, giver_member_id),
  unique (room_id, recipient_member_id),
  check (giver_member_id <> recipient_member_id)
);

create index room_members_user_id_idx on public.room_members(user_id);
create index room_members_room_id_idx on public.room_members(room_id);

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.assignments enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke all on public.profiles, public.rooms, public.room_members, public.assignments from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.room_members to authenticated;

create schema if not exists private;
create or replace function private.is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.room_members
  where room_id = p_room_id and user_id = (select auth.uid())
) $$;
create or replace function private.is_room_owner(p_room_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.rooms
  where id = p_room_id and owner_id = (select auth.uid())
) $$;
revoke all on function private.is_room_member(uuid), private.is_room_owner(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_room_member(uuid), private.is_room_owner(uuid) to authenticated;

create policy "profiles are readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "users create their profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "users update their profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "members read rooms" on public.rooms
  for select to authenticated using (
    owner_id = (select auth.uid()) or (select private.is_room_member(id))
  );
create policy "users create rooms" on public.rooms
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owners update rooms" on public.rooms
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "owners delete rooms" on public.rooms
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "members read their room roster" on public.room_members
  for select to authenticated using (
    user_id = (select auth.uid()) or (select private.is_room_owner(room_id)) or (select private.is_room_member(room_id))
  );
create policy "users join themselves" on public.room_members
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users update themselves" on public.room_members
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "owners remove members" on public.room_members
  for delete to authenticated using (
    (select private.is_room_owner(room_id)) and
    (select status from public.rooms where id = room_id) = 'setup'
  );

create or replace function public.join_room(p_join_code text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_room public.rooms; v_member_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into v_room from public.rooms where join_code = upper(trim(p_join_code));
  if v_room.id is null then raise exception 'Room not found'; end if;
  if v_room.status <> 'setup' then raise exception 'This draw no longer accepts participants'; end if;
  insert into public.room_members(room_id, user_id, display_name)
  values (v_room.id, (select auth.uid()), trim(p_display_name))
  on conflict (room_id, user_id) do update set display_name = excluded.display_name
  returning id into v_member_id;
  return v_member_id;
end $$;

create or replace function public.open_draw(p_room_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid; v_count integer; v_givers uuid[]; v_recipients uuid[]; v_shift integer;
begin
  select owner_id into v_owner from public.rooms where id = p_room_id for update;
  if v_owner is distinct from (select auth.uid()) then raise exception 'Only the room owner can open the draw'; end if;
  if (select status from public.rooms where id = p_room_id) <> 'setup' then raise exception 'Draw already opened'; end if;
  select array_agg(id order by gen_random_uuid()), count(*) into v_givers, v_count
    from public.room_members where room_id = p_room_id;
  if v_count < 2 then raise exception 'At least two participants are required'; end if;
  v_shift := 1 + floor(random() * (v_count - 1))::integer;
  v_recipients := v_givers[v_shift + 1:v_count] || v_givers[1:v_shift];
  insert into public.assignments(room_id, giver_member_id, recipient_member_id)
    select p_room_id, v_givers[i], v_recipients[i] from generate_series(1, v_count) as i;
  update public.rooms set status = 'open' where id = p_room_id;
end $$;

create or replace function public.reveal_my_recipient(p_room_id uuid)
returns table(display_name text)
language plpgsql security definer set search_path = ''
as $$
begin
  update public.room_members set drawn_at = coalesce(drawn_at, now())
    where room_id = p_room_id and user_id = (select auth.uid());
  if not found then raise exception 'You are not a member of this room'; end if;
  return query
    select recipient.display_name
    from public.assignments a
    join public.room_members giver on giver.id = a.giver_member_id
    join public.room_members recipient on recipient.id = a.recipient_member_id
    where a.room_id = p_room_id and giver.user_id = (select auth.uid());
end $$;

revoke all on function public.join_room(text, text) from public, anon;
revoke all on function public.open_draw(uuid) from public, anon;
revoke all on function public.reveal_my_recipient(uuid) from public, anon;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.open_draw(uuid) to authenticated;
grant execute on function public.reveal_my_recipient(uuid) to authenticated;
