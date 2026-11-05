-- Each authenticated room member gets exactly one private draw. The raffle
-- names are organizer-managed and never readable by ordinary room members.
create table if not exists public.raffle_names (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  assigned_member_id uuid references public.room_members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (room_id, name),
  unique (room_id, assigned_member_id)
);

create index if not exists raffle_names_room_id_idx on public.raffle_names(room_id);
alter table public.raffle_names enable row level security;
revoke all on public.raffle_names from anon, authenticated;
grant select, insert, delete on public.raffle_names to authenticated;

create policy "owners read raffle names" on public.raffle_names
  for select to authenticated using ((select private.is_room_owner(room_id)));
create policy "owners add raffle names during setup" on public.raffle_names
  for insert to authenticated with check (
    (select private.is_room_owner(room_id)) and
    (select status from public.rooms where id = room_id) = 'setup'
  );
create policy "owners remove raffle names during setup" on public.raffle_names
  for delete to authenticated using (
    (select private.is_room_owner(room_id)) and
    (select status from public.rooms where id = room_id) = 'setup'
  );

-- Replace the original member-to-member draw. The room is locked while the
-- function creates a complete assignment, so concurrent opens cannot race.
create or replace function public.open_draw(p_room_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid;
  v_status text;
  v_members public.room_members[];
  v_names public.raffle_names[];
  v_count integer;
  v_attempt integer := 0;
  v_valid boolean;
  i integer;
begin
  select owner_id, status into v_owner, v_status
    from public.rooms where id = p_room_id for update;
  if v_owner is null then raise exception 'Room not found'; end if;
  if v_owner is distinct from (select auth.uid()) then raise exception 'Only the room owner can open the draw'; end if;
  if v_status <> 'setup' then raise exception 'Draw already opened'; end if;

  select array_agg(m order by gen_random_uuid()) into v_members
    from public.room_members m where m.room_id = p_room_id;
  select array_agg(n order by gen_random_uuid()) into v_names
    from public.raffle_names n where n.room_id = p_room_id;
  v_count := coalesce(array_length(v_members, 1), 0);
  if v_count < 2 then raise exception 'At least two joined accounts are required'; end if;
  if coalesce(array_length(v_names, 1), 0) <> v_count then
    raise exception 'The number of names must equal the number of joined accounts';
  end if;

  loop
    v_attempt := v_attempt + 1;
    select array_agg(n order by gen_random_uuid()) into v_names
      from unnest(v_names) n;
    v_valid := true;
    for i in 1..v_count loop
      if lower(trim((v_members[i]).display_name)) = lower(trim((v_names[i]).name)) then
        v_valid := false;
        exit;
      end if;
    end loop;
    exit when v_valid;
    if v_attempt >= 250 then
      raise exception 'Could not create a draw without self-matches. Make sure each account display name matches its raffle name and all names are unique.';
    end if;
  end loop;

  for i in 1..v_count loop
    update public.raffle_names set assigned_member_id = (v_members[i]).id
      where id = (v_names[i]).id;
  end loop;
  update public.rooms set status = 'open' where id = p_room_id;
end $$;

create or replace function public.reveal_my_recipient(p_room_id uuid)
returns table(display_name text)
language plpgsql security definer set search_path = ''
as $$
declare v_member_id uuid;
begin
  select id into v_member_id from public.room_members
    where room_id = p_room_id and user_id = (select auth.uid());
  if v_member_id is null then raise exception 'You are not a member of this room'; end if;
  if (select status from public.rooms where id = p_room_id) <> 'open' then
    raise exception 'The draw is not open yet';
  end if;
  update public.room_members set drawn_at = coalesce(drawn_at, now()) where id = v_member_id;
  return query select n.name from public.raffle_names n
    where n.room_id = p_room_id and n.assigned_member_id = v_member_id;
end $$;

revoke all on function public.open_draw(uuid), public.reveal_my_recipient(uuid) from public, anon;
grant execute on function public.open_draw(uuid), public.reveal_my_recipient(uuid) to authenticated;
