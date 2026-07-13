import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'

// Рекламный слот (Google AdSense). Показывается только:
//  — если реклама включена в супер-админке и пользователь на бесплатном тарифе,
//  — на разрешённом девайсе (по умолчанию планшет/десктоп, не телефон),
//  — если задан AdSense client id (иначе ничего не рендерим).

let adsenseLoaded = false
function loadAdSense(client) {
  if (adsenseLoaded || !client) return
  adsenseLoaded = true
  const s = document.createElement('script')
  s.async = true
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`
  s.crossOrigin = 'anonymous'
  document.head.appendChild(s)
}

function deviceKind() {
  const w = window.innerWidth
  if (w <= 640) return 'mobile'
  if (w <= 1023) return 'tablet'
  return 'desktop'
}

// Конфиг тянем один раз на сессию и кэшируем
let cfgPromise = null
function getConfig() {
  if (!cfgPromise) cfgPromise = api.get('/platform/public-config').catch(() => null)
  return cfgPromise
}

export default function AdSlot({ style }) {
  const [cfg, setCfg] = useState(null)
  const insRef = useRef(null)

  useEffect(() => { getConfig().then(setCfg) }, [])

  const allowed = cfg?.ads?.showForMe && cfg.ads.client && cfg.ads[deviceKind()]

  useEffect(() => {
    if (!allowed) return
    loadAdSense(cfg.ads.client)
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}) } catch {}
  }, [allowed]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!allowed) return null

  return (
    <div style={{ textAlign: 'center', margin: '16px 0', ...style }}>
      <ins className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={cfg.ads.client}
        data-ad-slot={cfg.ads.slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
        ref={insRef} />
    </div>
  )
}
