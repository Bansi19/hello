import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  addWishlistItem,
  createRoom,
  getProfile,
  joinRoom,
  listAdminUsers,
  listMembers,
  listRooms,
  listWishlist,
  openDraw,
  removeWishlistItem,
  revealMyRecipient,
  resetUserPassword,
  signOut,
} from './lib/monitoApi'

function Gift({ color = 0 }) {
  return <span aria-hidden="true" className={`gift color-${color}`}><i className="bow" /><i className="lid" /><i className="ribbon" /></span>
}

function Brand() {
  return <a className="brand" href="/"><b>m</b>monito<span>✳</span></a>
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [rooms, setRooms] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [members, setMembers] = useState([])
  const [wishlist, setWishlist] = useState([])
  const [roomName, setRoomName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [wish, setWish] = useState('')
  const [recipient, setRecipient] = useState(null)
  const [showRecipient, setShowRecipient] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [adminUsers, setAdminUsers] = useState(null)
  const [showAdmin, setShowAdmin] = useState(false)
  const [adminBusy, setAdminBusy] = useState('')
  const [resetCredentials, setResetCredentials] = useState(null)

  const room = rooms.find(item => item.id === selectedId) || rooms[0]
  const isOwner = Boolean(room && user && room.owner_id === user.id)
  const me = members.find(member => member.user_id === user?.id)

  const refreshRooms = useCallback(async preferredId => {
    const nextRooms = await listRooms()
    setRooms(nextRooms)
    setSelectedId(current => preferredId || (nextRooms.some(item => item.id === current) ? current : nextRooms[0]?.id || ''))
  }, [])

  useEffect(() => {
    async function start() {
      try {
        const { data } = await supabase.auth.getUser()
        setUser(data.user)
        setProfile(await getProfile(data.user.id))
        await refreshRooms()
        try {
          const adminData = await listAdminUsers()
          setAdminUsers(adminData.users)
        } catch {
          setAdminUsers(null)
        }
      } catch (caught) {
        setError(caught.message)
      } finally {
        setLoading(false)
      }
    }
    start()
  }, [refreshRooms])

  useEffect(() => {
    if (!room || !user) {
      setMembers([])
      setWishlist([])
      return
    }
    let active = true
    async function loadRoom() {
      try {
        const nextMembers = await listMembers(room.id)
        const currentMember = nextMembers.find(member => member.user_id === user.id)
        const nextWishlist = currentMember ? await listWishlist(room.id, currentMember.id) : []
        if (active) {
          setMembers(nextMembers)
          setWishlist(nextWishlist)
          setRecipient(null)
          setShowRecipient(false)
        }
      } catch (caught) {
        if (active) setError(caught.message)
      }
    }
    loadRoom()
    return () => { active = false }
  }, [room?.id, room?.status, user])

  async function act(action) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (caught) {
      setError(caught.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  function submitRoom(event) {
    event.preventDefault()
    act(async () => {
      const next = await createRoom(roomName.trim(), user.id, profile.display_name)
      setRoomName('')
      await refreshRooms(next.id)
    })
  }

  function submitJoin(event) {
    event.preventDefault()
    act(async () => {
      await joinRoom(joinCode.trim(), profile.display_name)
      setJoinCode('')
      await refreshRooms()
    })
  }

  function submitWish(event) {
    event.preventDefault()
    if (!me) return
    act(async () => {
      const item = await addWishlistItem(room.id, me.id, wish.trim())
      setWishlist(current => [...current, item])
      setMembers(await listMembers(room.id))
      setWish('')
    })
  }

  async function copyCode() {
    await navigator.clipboard.writeText(room.join_code)
  }

  async function resetAccount(account) {
    if (!window.confirm(`Reset the password for ${account.email}? Their current password will stop working.`)) return
    setAdminBusy(account.id)
    setResetCredentials(null)
    setError('')
    try {
      const result = await resetUserPassword(account.id)
      setResetCredentials(result)
      setAdminUsers(current => current.map(item => item.id === account.id ? { ...item, mustChangePassword: true } : item))
    } catch (caught) {
      setError(caught.message || 'Could not reset this account.')
    } finally {
      setAdminBusy('')
    }
  }

  if (loading) return <div className="auth-loading">Loading your exchanges…</div>

  return <div>
    <header className="topbar">
      <Brand />
      <div><span className="signed-in-as">{profile?.display_name}</span>{adminUsers && <button className="text-button admin-link" onClick={() => { setShowAdmin(true); setResetCredentials(null) }}>Superadmin</button>}<button className="text-button" onClick={() => signOut()}>Log out ↗</button></div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <p className="eyebrow">GOOD GIFTS START HERE</p>
        <h2>Your little<br />circles.</h2>
        <form onSubmit={submitRoom} className="sidebar-form">
          <label htmlFor="new-room">Create a room</label>
          <input id="new-room" value={roomName} onChange={event => setRoomName(event.target.value)} placeholder="Room name" maxLength="80" required />
          <button className="primary full" disabled={busy || !roomName.trim()}>+ Create room</button>
        </form>
        <form onSubmit={submitJoin} className="sidebar-form join-form">
          <label htmlFor="join-code">Join with a code</label>
          <input id="join-code" value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength="10" required />
          <button className="secondary full" disabled={busy || !joinCode.trim()}>Join room</button>
        </form>
        <p className="eyebrow room-label">YOUR EXCHANGES <span>{rooms.length}</span></p>
        <nav aria-label="Gift exchange rooms">
          {rooms.map(item => <button key={item.id} className={`room-link ${room?.id === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}><span className="room-icon">♧</span><span>{item.name}<small>{item.status === 'open' ? 'Draw open' : 'Getting ready'}</small></span></button>)}
        </nav>
      </aside>

      <main className="content">
        {error && <p className="notice" role="alert">{error}</p>}
        {!room ? <div className="setup empty-dashboard"><Gift /><h1>Create or join a room.</h1><p>Your exchanges will appear here.</p></div> : <>
          <p className="breadcrumb">Your exchanges <span>/</span> {room.name}</p>
          <section className="room-heading">
            <div><p className="eyebrow">A GIFT EXCHANGE, WITHOUT THE DISTANCE</p><h1>{room.name}<span>.</span></h1><p className="muted">{members.length} joined {members.length === 1 ? 'person' : 'people'} · everyone joined is in the raffle</p></div>
            <span className="status">● {room.status === 'open' ? 'The draw is open' : 'Getting ready'}</span>
          </section>
          <section className="hero">
            <div><span className="tag">THE MONITO / MONITA TRADITION</span><h2>A small mystery.<br />A whole lot of joy.</h2><p>Join the room. Add your wishes. Draw one friend.</p></div>
            <div className="hero-art"><span className="spark">✳</span><Gift color={2} /><Gift /><small>FROM SOMEONE, WITH LOVE ♡</small></div>
          </section>

          {isOwner && <section className="share-code"><div><p className="eyebrow">ROOM CODE</p><strong>{room.join_code}</strong><p>Send this code to everyone in the exchange.</p></div><button className="secondary" onClick={copyCode}>Copy code</button></section>}

          <div className="draw-layout account-draw-layout">
            <section className="panel">
              <div className="section-heading"><h2>{room.status === 'open' ? 'Your private draw' : 'The draw is being prepared'}</h2><span>ONE ACCOUNT · ONE DRAW</span></div>
              {room.status !== 'open' ? <div className="setup">
                <Gift />
                <h3>{isOwner ? 'Ready when everyone has joined.' : 'Waiting for the organizer.'}</h3>
                <p>{isOwner ? 'Every joined account is automatically included. Open the draw when the whole circle is here.' : 'Add your wishlist while the organizer gathers everyone.'}</p>
                {isOwner && <button className="primary" disabled={busy || members.length < 2} onClick={() => act(async () => { await openDraw(room.id); await refreshRooms(room.id) })}>Open the draw ↗</button>}
              </div> : <div className="private-draw">
                <Gift color={2} />
                <h3>{me?.drawn_at ? 'Your draw is saved.' : 'Your surprise is waiting.'}</h3>
                <p>MONITO uses your signed-in account and reveals only your recipient and their wishlist.</p>
                {showRecipient && recipient ? <div className="recipient-result">
                  <p className="eyebrow">YOU’RE GIFTING TO</p>
                  <strong>{recipient.displayName}</strong>
                  <div className="recipient-wishlist">
                    <h4>Their wishlist</h4>
                    {recipient.wishlist.length ? <ul>{recipient.wishlist.map(item => <li key={item.id}>{item.wish}</li>)}</ul> : <p>They haven’t added any wishes yet.</p>}
                  </div>
                  <button className="text-button" onClick={() => setShowRecipient(false)}>Hide recipient</button>
                </div> : <button className="primary" disabled={busy} onClick={() => act(async () => {
                  setRecipient(await revealMyRecipient(room.id))
                  setShowRecipient(true)
                  setMembers(await listMembers(room.id))
                })}>{me?.drawn_at ? 'Reveal again' : 'Draw my name'} ↗</button>}
              </div>}
            </section>

            <aside className="panel friends">
              <div className="section-heading"><h2>The circle</h2><span className="count">{members.length}</span></div>
              <p className="muted small">Every joined person is one raffle name.</p>
              <ul>{members.map((member, index) => <li key={member.id}><span className={`avatar color-${index % 4}`}>{member.display_name.charAt(0).toUpperCase()}</span><span className="friend-name">{member.display_name}</span><span className={`friend-status ${member.drawn_at ? 'picked' : ''}`}>{member.has_wishlist && <span className="wishlist-star" aria-label="Wishlist added" title="Wishlist added">★</span>}{member.drawn_at ? 'Drawn ✓' : 'Joined'}</span></li>)}</ul>
              <section className="wishlist-editor">
                <div className="section-heading"><h2>My wishlist</h2><span className="count">{wishlist.length}</span></div>
                <p className="muted small">Only you and the person who draws you can see this.</p>
                <form onSubmit={submitWish} className="add-form">
                  <label htmlFor="wish">Add a wish</label>
                  <div className="input-row"><input id="wish" value={wish} onChange={event => setWish(event.target.value)} placeholder="e.g. A mystery novel" maxLength="280" required /><button className="primary" disabled={busy || !wish.trim()}>+</button></div>
                </form>
                <ul className="wishlist-items">{wishlist.map(item => <li key={item.id}><span>{item.wish}</span><button aria-label={`Remove ${item.wish}`} onClick={() => act(async () => { await removeWishlistItem(item.id); setWishlist(current => current.filter(wishItem => wishItem.id !== item.id)); setMembers(await listMembers(room.id)) })}>×</button></li>)}</ul>
              </section>
            </aside>
          </div>
        </>}
      </main>
    </div>
    {showAdmin && <div className="modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setShowAdmin(false) }}>
      <dialog open className="admin-dialog" aria-labelledby="admin-title">
        <button className="close" onClick={() => setShowAdmin(false)} aria-label="Close">×</button>
        <span className="tag">SUPERADMIN</span>
        <h2 id="admin-title">User accounts.</h2>
        <p className="muted">Reset a forgotten password, then privately send the temporary password to that user.</p>
        {resetCredentials && <section className="temporary-password" role="status">
          <p className="eyebrow">TEMPORARY LOGIN FOR {resetCredentials.email}</p>
          <strong>{resetCredentials.temporaryPassword}</strong>
          <button className="secondary" onClick={() => navigator.clipboard.writeText(resetCredentials.temporaryPassword)}>Copy password</button>
          <p>Shown only now. The user will be required to create a new password after logging in.</p>
        </section>}
        <div className="admin-user-list">
          {adminUsers.map(account => <article key={account.id} className="admin-user-row">
            <span className="avatar">{(account.displayName || account.email || '?').charAt(0).toUpperCase()}</span>
            <div><strong>{account.displayName || 'Unnamed user'}</strong><span>{account.email}</span>{account.mustChangePassword && <small>Waiting for a new password</small>}</div>
            <button className="secondary" disabled={Boolean(adminBusy) || account.protectedAccount} onClick={() => resetAccount(account)}>{account.protectedAccount ? 'Admin' : adminBusy === account.id ? 'Resetting…' : 'Reset'}</button>
          </article>)}
        </div>
      </dialog>
    </div>}
  </div>
}
