-- Joined room members are the raffle pool. Each member owns a private wishlist;
-- only that member and the member assigned to gift them can read it.
create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id uuid not null references public.room_members(id) on delete cascade,
  wish text not null check (char_length(trim(wish)) between 1 and 280),
  created_at timestamptz not null default now()
);

create index wishlist_items_member_id_idx on public.wishlist_items(member_id);
create index wishlist_items_room_id_idx on public.wishlist_items(room_id);
alter table public.wishlist_items enable row level security;
revoke all on public.wishlist_items from anon, authenticated;
grant select, insert, delete on public.wishlist_items to authenticated;

create or replace function private.can_read_wishlist(p_member_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.room_members member
    where member.id = p_member_id and member.user_id = (select auth.uid())
  ) or exists (
    select 1
    from public.assignments assignment
    join public.room_members giver on giver.id = assignment.giver_member_id
    where assignment.recipient_member_id = p_member_id
      and giver.user_id = (select auth.uid())
      and giver.drawn_at is not null
  )
$$;

revoke all on function private.can_read_wishlist(uuid) from public;
grant execute on function private.can_read_wishlist(uuid) to authenticated;

create policy "members and assigned gifters read wishlists" on public.wishlist_items
  for select to authenticated using ((select private.can_read_wishlist(member_id)));
create policy "members add their own wishes" on public.wishlist_items
  for insert to authenticated with check (exists (
    select 1 from public.room_members member
    where member.id = wishlist_items.member_id
      and member.room_id = wishlist_items.room_id
      and member.user_id = (select auth.uid())
  ));
create policy "members delete their own wishes" on public.wishlist_items
  for delete to authenticated using (exists (
    select 1 from public.room_members member
    where member.id = wishlist_items.member_id and member.user_id = (select auth.uid())
  ));

-- Preserve assignments from already-open rooms created by the previous raffle-
-- name model whenever a raffle name matches a joined member's display name.
insert into public.assignments(room_id, giver_member_id, recipient_member_id)
select raffle.room_id, raffle.assigned_member_id, recipient.id
from public.raffle_names raffle
join public.room_members recipient
  on recipient.room_id = raffle.room_id
 and lower(trim(recipient.display_name)) = lower(trim(raffle.name))
where raffle.assigned_member_id is not null
  and raffle.assigned_member_id <> recipient.id
on conflict do nothing;

create or replace function public.open_draw(p_room_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid;
  v_status text;
  v_count integer;
  v_givers uuid[];
  v_recipients uuid[];
  v_shift integer;
begin
  select owner_id, status into v_owner, v_status
    from public.rooms where id = p_room_id for update;
  if v_owner is null then raise exception 'Room not found'; end if;
  if v_owner is distinct from (select auth.uid()) then
    raise exception 'Only the room owner can open the draw';
  end if;
  if v_status <> 'setup' then raise exception 'Draw already opened'; end if;

  select array_agg(id order by gen_random_uuid()), count(*)
    into v_givers, v_count
    from public.room_members where room_id = p_room_id;
  if v_count < 2 then raise exception 'At least two joined members are required'; end if;

  v_shift := 1 + floor(random() * (v_count - 1))::integer;
  v_recipients := v_givers[v_shift + 1:v_count] || v_givers[1:v_shift];
  delete from public.assignments where room_id = p_room_id;
  insert into public.assignments(room_id, giver_member_id, recipient_member_id)
    select p_room_id, v_givers[i], v_recipients[i]
    from generate_series(1, v_count) as i;
  update public.rooms set status = 'open' where id = p_room_id;
end $$;

drop function public.reveal_my_recipient(uuid);
create function public.reveal_my_recipient(p_room_id uuid)
returns table(display_name text, wishlist jsonb)
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
  return query
    select recipient.display_name,
      coalesce(
        jsonb_agg(jsonb_build_object('id', wish.id, 'wish', wish.wish) order by wish.created_at)
          filter (where wish.id is not null),
        '[]'::jsonb
      )
    from public.assignments assignment
    join public.room_members giver on giver.id = assignment.giver_member_id
    join public.room_members recipient on recipient.id = assignment.recipient_member_id
    left join public.wishlist_items wish on wish.member_id = recipient.id
    where assignment.room_id = p_room_id and giver.user_id = (select auth.uid())
    group by recipient.id, recipient.display_name;
end $$;

revoke all on function public.open_draw(uuid), public.reveal_my_recipient(uuid) from public, anon;
grant execute on function public.open_draw(uuid), public.reveal_my_recipient(uuid) to authenticated;
