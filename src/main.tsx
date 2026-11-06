import React from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './styles.css'
import { SylvaSigner } from '@/components/sylva-signer'
import { AccessGate } from '@/components/access-gate'
inject()

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('Missing app root')

createRoot(root).render(
  <>
    <AccessGate
  onGuest={() => {}}
  onLogin={(username, password) => {
    alert('Giriş sistemi henüz bağlanmadı.')
  }}
/>
<SylvaSigner />
<SpeedInsights />
  </>
)
