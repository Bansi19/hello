import { supabase } from './supabase'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured. Add the project URL and publishable key to .env.local.')
  return supabase
}

export async function signUp(email, password, displayName) {
  const response = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result.error || 'Could not create your account.')
  }
  return signIn(email, password)
}

export async function signIn(email, password) {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await requireClient().auth.signOut()
  if (error) throw error
}

export async function listRooms() {
  const { data, error } = await requireClient().from('rooms').select('id,name,join_code,status,owner_id,created_at').order('created_at')
  if (error) throw error
  return data
}

export async function listMembers(roomId) {
  const { data, error } = await requireClient().from('room_members').select('id,user_id,display_name,joined_at,drawn_at,has_wishlist').eq('room_id', roomId).order('joined_at')
  if (error) throw error
  return data
}

export async function getProfile(userId) {
  const { data, error } = await requireClient().from('profiles').select('id,display_name').eq('id', userId).single()
  if (error) throw error
  return data
}

export async function createRoom(name, ownerId, displayName) {
  const client = requireClient()
  const { data: room, error } = await client.from('rooms').insert({ name, owner_id: ownerId }).select().single()
  if (error) throw error
  const { error: memberError } = await client.from('room_members').insert({ room_id: room.id, user_id: ownerId, display_name: displayName })
  if (memberError) throw memberError
  return room
}

export async function joinRoom(joinCode, displayName) {
  const { data, error } = await requireClient().rpc('join_room', { p_join_code: joinCode, p_display_name: displayName })
  if (error) throw error
  return data
}

export async function listWishlist(roomId, memberId) {
  const { data, error } = await requireClient().from('wishlist_items').select('id,wish,created_at').eq('room_id', roomId).eq('member_id', memberId).order('created_at')
  if (error) throw error
  return data
}

export async function addWishlistItem(roomId, memberId, wish) {
  const { data, error } = await requireClient().from('wishlist_items').insert({ room_id: roomId, member_id: memberId, wish }).select('id,wish,created_at').single()
  if (error) throw error
  return data
}

export async function removeWishlistItem(id) {
  const { error } = await requireClient().from('wishlist_items').delete().eq('id', id)
  if (error) throw error
}

export async function openDraw(roomId) {
  const { error } = await requireClient().rpc('open_draw', { p_room_id: roomId })
  if (error) throw error
}

export async function revealMyRecipient(roomId) {
  const { data, error } = await requireClient().rpc('reveal_my_recipient', { p_room_id: roomId })
  if (error) throw error
  const result = data?.[0]
  return result ? { displayName: result.display_name, wishlist: result.wishlist || [] } : null
}
