import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/** The join URL as a QR code (SVG, so it stays sharp at TV size). */
export function JoinQr({ url, className }: { url: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((svg) => {
        if (live) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
      })
      .catch(() => {
        if (live) setSrc(null)
      })
    return () => {
      live = false
    }
  }, [url])

  return src ? <img className={className} src={src} alt="Join QR code" /> : null
}
