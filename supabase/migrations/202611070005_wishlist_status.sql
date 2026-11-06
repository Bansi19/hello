-- Room members may see whether someone has prepared a wishlist, but not its
-- contents. A trigger keeps this public status in sync with private items.
alter table public.room_members
  add column has_wishlist boolean not null default false;

update public.room_members member
set has_wishlist = exists (
  select 1 from public.wishlist_items wish where wish.member_id = member.id
);

create or replace function public.sync_wishlist_status()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_member_id uuid;
begin
  if tg_op = 'DELETE' then
    v_member_id := old.member_id;
  else
    v_member_id := new.member_id;
  end if;
  update public.room_members
  set has_wishlist = exists (
    select 1 from public.wishlist_items where member_id = v_member_id
  )
  where id = v_member_id;
  return null;
end $$;

create trigger on_wishlist_item_changed
after insert or delete on public.wishlist_items
for each row execute function public.sync_wishlist_status();

revoke all on function public.sync_wishlist_status() from public, anon, authenticated;
