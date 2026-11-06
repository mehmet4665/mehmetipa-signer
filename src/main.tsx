import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './styles.css'
import { SylvaSigner } from '@/components/sylva-signer'
import { AccessGate } from '@/components/access-gate'

inject()

function App() {
  const [accessGranted, setAccessGranted] = useState(false)

  return (
    <>
      {accessGranted ? (
        <SylvaSigner />
      ) : (
        <AccessGate
          onGuest={() => setAccessGranted(true)}
          onLogin={(username, password) => {
            alert('Giriş sistemi henüz API bağlantısı bekliyor.')
          }}
        />
      )}
      <SpeedInsights />
    </>
  )
}

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('Missing app root')

createRoot(root).render(<App />)
