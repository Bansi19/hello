import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { addRaffleName, createRoom, getProfile, joinRoom, listMembers, listRaffleNames, listRooms, openDraw, removeRaffleName, revealMyRecipient, signOut } from './lib/monitoApi'

function Gift({ color = 0 }) { return <span aria-hidden="true" className={`gift color-${color}`}><i className="bow" /><i className="lid" /><i className="ribbon" /></span> }
function Brand() { return <a className="brand" href="/"><b>m</b>monito<span>✳</span></a> }

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [rooms, setRooms] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [members, setMembers] = useState([])
  const [names, setNames] = useState([])
  const [roomName, setRoomName] = useState('')
  const [raffleName, setRaffleName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [recipient, setRecipient] = useState('')
  const [showRecipient, setShowRecipient] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const room = rooms.find(item => item.id === selectedId) || rooms[0]
  const isOwner = Boolean(room && user && room.owner_id === user.id)
  const me = members.find(member => member.user_id === user?.id)

  const refreshRooms = useCallback(async (preferredId) => {
    const nextRooms = await listRooms()
    setRooms(nextRooms)
    setSelectedId(current => preferredId || (nextRooms.some(item => item.id === current) ? current : nextRooms[0]?.id || ''))
  }, [])

  useEffect(() => {
    async function start() {
      try {
        const { data } = await supabase.auth.getUser()
        setUser(data.user)
        const nextProfile = await getProfile(data.user.id)
        setProfile(nextProfile)
        await refreshRooms()
      } catch (caught) { setError(caught.message) }
      finally { setLoading(false) }
    }
    start()
  }, [refreshRooms])

  useEffect(() => {
    if (!room) { setMembers([]); setNames([]); return }
    let active = true
    Promise.all([listMembers(room.id), user?.id === room.owner_id ? listRaffleNames(room.id) : Promise.resolve([])])
      .then(([nextMembers, nextNames]) => { if (active) { setMembers(nextMembers); setNames(nextNames) } })
      .catch(caught => { if (active) setError(caught.message) })
    setRecipient('')
    setShowRecipient(false)
    return () => { active = false }
  }, [room?.id, room?.owner_id, user?.id])

  async function act(action) {
    setBusy(true); setError('')
    try { await action() } catch (caught) { setError(caught.message || 'Something went wrong.') }
    finally { setBusy(false) }
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

  function submitName(event) {
    event.preventDefault()
    act(async () => {
      const next = await addRaffleName(room.id, raffleName.trim())
      setNames(current => [...current, next])
      setRaffleName('')
    })
  }

  async function copyCode() {
    await navigator.clipboard.writeText(room.join_code)
  }

  if (loading) return <div className="auth-loading">Loading your exchanges…</div>
  return <div>
    <header className="topbar"><Brand /><div><span className="signed-in-as">{profile?.display_name}</span><button className="text-button" onClick={() => signOut()}>Log out ↗</button></div></header>
    <div className="workspace">
      <aside className="sidebar">
        <p className="eyebrow">GOOD GIFTS START HERE</p><h2>Your little<br />circles.</h2>
        <form onSubmit={submitRoom} className="sidebar-form"><label htmlFor="new-room">Create a room</label><input id="new-room" value={roomName} onChange={event => setRoomName(event.target.value)} placeholder="Room name" maxLength="80" required /><button className="primary full" disabled={busy || !roomName.trim()}>+ Create room</button></form>
        <form onSubmit={submitJoin} className="sidebar-form join-form"><label htmlFor="join-code">Join with a code</label><input id="join-code" value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength="10" required /><button className="secondary full" disabled={busy || !joinCode.trim()}>Join room</button></form>
        <p className="eyebrow room-label">YOUR EXCHANGES <span>{rooms.length}</span></p>
        <nav aria-label="Gift exchange rooms">{rooms.map(item => <button key={item.id} className={`room-link ${room?.id === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}><span className="room-icon">♧</span><span>{item.name}<small>{item.status === 'open' ? 'Draw open' : 'Getting ready'}</small></span></button>)}</nav>
      </aside>
      <main className="content">
        {error && <p className="notice" role="alert">{error}</p>}
        {!room ? <div className="setup empty-dashboard"><Gift /><h1>Create or join a room.</h1><p>Your exchanges will appear here.</p></div> : <>
          <p className="breadcrumb">Your exchanges <span>/</span> {room.name}</p>
          <section className="room-heading"><div><p className="eyebrow">A GIFT EXCHANGE, WITHOUT THE DISTANCE</p><h1>{room.name}<span>.</span></h1><p className="muted">{members.length} joined {members.length === 1 ? 'account' : 'accounts'}</p></div><span className="status">● {room.status === 'open' ? 'The draw is open' : 'Getting ready'}</span></section>
          <section className="hero"><div><span className="tag">THE MONITO / MONITA TRADITION</span><h2>A small mystery.<br />A whole lot of joy.</h2><p>One account. One private draw. One thoughtful gift.</p></div><div className="hero-art"><span className="spark">✳</span><Gift color={2} /><Gift /><small>FROM SOMEONE, WITH LOVE ♡</small></div></section>
          {isOwner && <section className="share-code"><div><p className="eyebrow">ROOM CODE</p><strong>{room.join_code}</strong><p>Send this code to everyone in the exchange.</p></div><button className="secondary" onClick={copyCode}>Copy code</button></section>}
          <div className="draw-layout account-draw-layout">
            <section className="panel">
              <div className="section-heading"><h2>{room.status === 'open' ? 'Your private draw' : 'The draw is being prepared'}</h2><span>ONE ACCOUNT · ONE DRAW</span></div>
              {room.status !== 'open' ? <div className="setup"><Gift /><h3>{isOwner ? 'Ready when everyone has joined.' : 'Waiting for the organizer.'}</h3><p>{isOwner ? 'Add one raffle name per joined account. When the counts match, open the draw.' : 'The organizer will open the draw after all participants join.'}</p>{isOwner && <button className="primary" disabled={busy || members.length < 2 || names.length !== members.length} onClick={() => act(async () => { await openDraw(room.id); await refreshRooms(room.id) })}>Open the draw ↗</button>}</div> : <div className="private-draw"><Gift color={2} /><h3>{me?.drawn_at ? 'Your draw is saved.' : 'Your surprise is waiting.'}</h3><p>No participant selector. MONITO uses your signed-in account and only reveals your own recipient.</p>{showRecipient ? <div className="recipient-result"><p className="eyebrow">YOU’RE GIFTING TO</p><strong>{recipient}</strong><button className="text-button" onClick={() => setShowRecipient(false)}>Hide recipient</button></div> : <button className="primary" disabled={busy} onClick={() => act(async () => { const value = await revealMyRecipient(room.id); setRecipient(value); setShowRecipient(true); setMembers(await listMembers(room.id)) })}>{me?.drawn_at ? 'Reveal again' : 'Draw my name'} ↗</button>}</div>}
            </section>
            <aside className="panel friends"><div className="section-heading"><h2>The circle</h2><span className="count">{members.length}</span></div><ul>{members.map((member, index) => <li key={member.id}><span className={`avatar color-${index % 4}`}>{member.display_name.charAt(0).toUpperCase()}</span><span className="friend-name">{member.display_name}</span><span className={`friend-status ${member.drawn_at ? 'picked' : ''}`}>{member.drawn_at ? 'Drawn ✓' : 'Joined'}</span></li>)}</ul>{isOwner && room.status === 'setup' && <><form onSubmit={submitName} className="add-form"><label htmlFor="raffle-name">Add a raffle name</label><div className="input-row"><input id="raffle-name" value={raffleName} onChange={event => setRaffleName(event.target.value)} placeholder="Participant name" maxLength="60" required /><button className="primary" disabled={busy || !raffleName.trim()}>+</button></div></form><ul className="raffle-name-list">{names.map(item => <li key={item.id}><span>{item.name}</span><button aria-label={`Remove ${item.name}`} onClick={() => act(async () => { await removeRaffleName(item.id); setNames(current => current.filter(name => name.id !== item.id)) })}>×</button></li>)}</ul><p className="count-guidance">{names.length} names · {members.length} joined accounts</p></>}</aside>
          </div>
        </>}
      </main>
    </div>
  </div>
}
