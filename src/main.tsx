import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './styles.css'

import { SylvaSigner } from '@/components/sylva-signer'
import { AccessGate } from '@/components/access-gate'

inject()

const API_URL = 'https://mehmetipa-api.kaymazm4665.workers.dev'

type User = {
  id: string
  name: string
  username: string
  role?: string
  group_name?: string
  status?: string
}

function App() {
  const [screen, setScreen] = useState<'login' | 'guest' | 'member' | 'admin'>('login')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedToken = sessionStorage.getItem('mehmetipa_token')
    const savedRole = sessionStorage.getItem('mehmetipa_role')

    if (savedToken && savedRole) {
      setToken(savedToken)
      setScreen(savedRole === 'admin' ? 'admin' : 'member')
    }

    setLoading(false)
  }, [])

  async function handleLogin(username: string, password: string) {
    try {
      if (!username.trim() || !password) {
        alert('Kullanıcı adı ve şifre gerekli.')
        return
      }

      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()

      if (!response.ok || !data.success || !data.token) {
        alert(data.error || 'Giriş başarısız. Bilgilerini kontrol et.')
        return
      }

      const role = data.user?.role === 'admin' ? 'admin' : 'member'

      sessionStorage.setItem('mehmetipa_token', data.token)
      sessionStorage.setItem('mehmetipa_role', role)

      setToken(data.token)
      setScreen(role)
    } catch {
      alert('Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.')
    }
  }

  function logout() {
    sessionStorage.removeItem('mehmetipa_token')
    sessionStorage.removeItem('mehmetipa_role')
    setToken('')
    setScreen('login')
  }

  if (loading) {
    return <div style={pageStyle}>MEHMET IPA yükleniyor...</div>
  }

  if (screen === 'guest') {
    return (
      <main style={pageStyle}>
        <h1>MEHMET IPA</h1>
        <p>Misafir erişimi</p>
        <p>Misafir hesapları IPA imzalayamaz.</p>
        <button style={buttonStyle} onClick={logout}>
          Geri Dön
        </button>
      </main>
    )
  }

  if (screen === 'admin') {
    return <AdminPanel token={token} onLogout={logout} />
  }

  if (screen === 'member') {
    return (
      <>
        <SylvaSigner />
        <button style={logoutStyle} onClick={logout}>
          Çıkış Yap
        </button>
      </>
    )
  }

  return (
    <>
      <AccessGate
        onGuest={() => setScreen('guest')}
        onLogin={handleLogin}
      />
      <SpeedInsights />
    </>
  )
}

function AdminPanel({
  token,
  onLogout
}: {
  token: string
  onLogout: () => void
}) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadUsers() {
      try {
        const response = await fetch(`${API_URL}/api/admin/users`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        const data = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Üye listesi alınamadı.')
        }

        setUsers(data.users || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bir hata oluştu.')
      } finally {
        setLoading(false)
      }
    }

    loadUsers()
  }, [token])

  return (
    <main style={pageStyle}>
      <h1>MEHMET IPA</h1>
      <h2>Yönetici Paneli</h2>

      <button style={buttonStyle} onClick={onLogout}>
        Çıkış Yap
      </button>

      <h3>Üye Listesi</h3>

      {loading && <p>Üyeler yükleniyor...</p>}
      {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}

      {!loading && !error && users.length === 0 && (
        <p>Henüz kayıtlı üye yok.</p>
      )}

      {users.map(user => (
        <div key={user.id} style={userStyle}>
          <strong>{user.name}</strong>
          <p>Kullanıcı adı: {user.username}</p>
          <p>Grup: {user.group_name || '-'}</p>
          <p>Durum: {user.status || '-'}</p>
        </div>
      ))}
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#090909',
  color: '#fff',
  padding: 24,
  fontFamily: 'Arial, sans-serif',
  textAlign: 'center'
}

const buttonStyle: React.CSSProperties = {
  padding: 14,
  margin: 10,
  border: 0,
  borderRadius: 10,
  background: '#2563eb',
  color: '#fff',
  fontSize: 16
}

const userStyle: React.CSSProperties = {
  maxWidth: 420,
  margin: '12px auto',
  padding: 16,
  borderRadius: 12,
  background: '#1c1c1e',
  textAlign: 'left'
}

const logoutStyle: React.CSSProperties = {
  position: 'fixed',
  top: 10,
  right: 10,
  zIndex: 9999,
  padding: 10,
  border: 0,
  borderRadius: 8,
  background: '#b91c1c',
  color: 'white'
}

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('Missing app root')

createRoot(root).render(<App />)
