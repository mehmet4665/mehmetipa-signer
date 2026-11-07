
import React, { useEffect, useState } from 'react'

const API_URL = 'https://mehmetipa-api.kaymazm4665.workers.dev'

type User = {
  id: string
  name: string
  username: string
  group_name?: string
  status?: string
}

type Device = {
  id: string
  username?: string
  udid: string
  status?: string
}

type Props = {
  token: string
  onLogout: () => void
}

export function AdminPanel({ token, onLogout }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [group, setGroup] = useState('')
  const [tab, setTab] = useState<'users' | 'devices'>('users')
  const [message, setMessage] = useState('Yükleniyor...')
  const [busy, setBusy] = useState(false)

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }

  async function loadData() {
    try {
      const [u, d] = await Promise.all([
        fetch(`${API_URL}/api/admin/users`, { headers }),
        fetch(`${API_URL}/api/admin/devices`, { headers })
      ])

      const userData = await u.json()
      const deviceData = await d.json()

      if (!u.ok || !userData.success) {
        throw new Error(userData.error || 'Üyeler alınamadı.')
      }

      setUsers(userData.users || [])
      setDevices(deviceData.devices || [])
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sunucu bağlantı hatası.')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function createUser() {
    if (!name.trim() || !username.trim() || !password) {
      setMessage('İsim, kullanıcı adı ve şifre gerekli.')
      return
    }

    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, username, password, group_name: group })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Üye oluşturulamadı.')
      }

      setName('')
      setUsername('')
      setPassword('')
      setGroup('')
      setMessage('Üye oluşturuldu.')
      await loadData()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'İşlem başarısız.')
    } finally {
      setBusy(false)
    }
  }

  async function updateUser(id: string, status: string) {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status })
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'İşlem başarısız.')
      await loadData()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'İşlem başarısız.')
    }
  }

  async function updateDevice(id: string, status: string) {
    try {
      const response = await fetch(`${API_URL}/api/admin/devices/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status })
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'İşlem başarısız.')
      await loadData()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'İşlem başarısız.')
    }
  }

  const panel: React.CSSProperties = {
    minHeight: '100vh',
    background: '#090909',
    color: '#fff',
    padding: 20,
    fontFamily: 'Arial'
  }

  const button: React.CSSProperties = {
    padding: 12,
    margin: 5,
    border: 0,
    borderRadius: 9,
    background: '#2563eb',
    color: 'white',
    fontSize: 15
  }

  const field: React.CSSProperties = {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: 13,
    margin: '9px 0',
    borderRadius: 8,
    border: '1px solid #555',
    background: '#1c1c1c',
    color: 'white',
    fontSize: 16
  }

  return (
    <main style={panel}>
      <h1>MEHMET IPA</h1>
      <h2>Yönetici Paneli</h2>

      <button style={button} onClick={() => setTab('users')}>Üyeler</button>
      <button style={button} onClick={() => setTab('devices')}>Cihazlar</button>
      <button style={{ ...button, background: '#991b1b' }} onClick={onLogout}>Çıkış</button>

      {message && <p>{message}</p>}

      {tab === 'users' && (
        <>
          <h3>Yeni Üye Oluştur</h3>
          <input style={field} placeholder="Ad soyad" value={name} onChange={e => setName(e.target.value)} />
          <input style={field} placeholder="Kullanıcı adı" value={username} onChange={e => setUsername(e.target.value)} />
          <input style={field} placeholder="Şifre" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <input style={field} placeholder="Grup (isteğe bağlı)" value={group} onChange={e => setGroup(e.target.value)} />
          <button style={button} disabled={busy} onClick={createUser}>Üye Oluştur</button>

          <h3>Üye Listesi ({users.length})</h3>
          {users.map(user => (
            <section key={user.id} style={{ background: '#1c1c1c', padding: 14, margin: '10px 0', borderRadius: 10 }}>
              <b>{user.name}</b>
              <p>@{user.username}</p>
              <p>Durum: {user.status || 'active'}</p>
              <button style={button} onClick={() => updateUser(user.id, user.status === 'blocked' ? 'active' : 'blocked')}>
                {user.status === 'blocked' ? 'Engeli Kaldır' : 'Engelle'}
              </button>
            </section>
          ))}
        </>
      )}

      {tab === 'devices' && (
        <>
          <h3>Cihaz Onayları ({devices.length})</h3>
          {devices.map(device => (
            <section key={device.id} style={{ background: '#1c1c1c', padding: 14, margin: '10px 0', borderRadius: 10 }}>
              <b>{device.username || 'Üye cihazı'}</b>
              <p>{device.udid}</p>
              <p>Durum: {device.status || 'pending'}</p>
              <button style={button} onClick={() => updateDevice(device.id, 'approved')}>Onayla</button>
              <button style={{ ...button, background: '#991b1b' }} onClick={() => updateDevice(device.id, 'rejected')}>Reddet</button>
            </section>
          ))}
        </>
      )}

      <button style={button} onClick={loadData}>Yenile</button>
    </main>
  )
}
