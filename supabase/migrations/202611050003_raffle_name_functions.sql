-- Route organizer changes through checked database functions. This avoids
-- relying on client-side table insert/delete behavior while preserving RLS.
create or replace function public.add_raffle_name(p_room_id uuid, p_name text)
returns table(id uuid, name text)
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_name text := trim(p_name);
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not (select private.is_room_owner(p_room_id)) then
    raise exception 'Only the room owner can add raffle names';
  end if;
  if (select status from public.rooms where rooms.id = p_room_id) <> 'setup' then
    raise exception 'Names cannot be changed after the draw opens';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 60 then
    raise exception 'Name must be between 1 and 60 characters';
  end if;
  if exists (
    select 1 from public.raffle_names
    where room_id = p_room_id and lower(trim(raffle_names.name)) = lower(v_name)
  ) then raise exception 'That name is already in this raffle'; end if;

  insert into public.raffle_names(room_id, name)
    values (p_room_id, v_name)
    returning raffle_names.id into v_id;
  return query select v_id, v_name;
end $$;

create or replace function public.remove_raffle_name(p_name_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_room_id uuid;
begin
  select room_id into v_room_id from public.raffle_names where id = p_name_id;
  if v_room_id is null then raise exception 'Raffle name not found'; end if;
  if not (select private.is_room_owner(v_room_id)) then
    raise exception 'Only the room owner can remove raffle names';
  end if;
  if (select status from public.rooms where rooms.id = v_room_id) <> 'setup' then
    raise exception 'Names cannot be changed after the draw opens';
  end if;
  delete from public.raffle_names where id = p_name_id;
end $$;

revoke all on function public.add_raffle_name(uuid, text), public.remove_raffle_name(uuid) from public, anon;
grant execute on function public.add_raffle_name(uuid, text), public.remove_raffle_name(uuid) to authenticated;
