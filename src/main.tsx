import React from 'react'
import { LanguageController } from '@/components/language-controller'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './styles.css'
import { AccessGate } from '@/components/access-gate'

inject()

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('Missing app root')

createRoot(root).render(
  <>
    <AccessGate />
    <LanguageController />
    <SpeedInsights />
  </>
)
