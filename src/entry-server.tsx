import { renderToString } from 'react-dom/server'

import { AccessGate } from '@/components/access-gate'
import { SylvaSigner, type SylvaRoute } from '@/components/sylva-signer'

export function render(route: SylvaRoute = 'app') {
  if (route === 'privacy' || route === 'legal') {
    return renderToString(<SylvaSigner initialRoute={route} />)
  }
  return renderToString(<AccessGate />)
}
