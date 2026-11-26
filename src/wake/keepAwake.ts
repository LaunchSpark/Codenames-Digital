import NoSleep from 'nosleep.js'

/*
 * Keeps a phone's screen on during play.
 *
 * Over plain-http LAN the page isn't a secure context, so the Screen Wake Lock
 * API is unavailable and NoSleep falls back to a looping hidden video. Playing
 * it needs a user gesture, and the browser pauses it whenever the page is
 * hidden — while NoSleep keeps reporting `isEnabled`. So after every return to
 * the page, the next tap re-enables it.
 */

let noSleep: NoSleep | null = null
let armed = false

function enable() {
  noSleep?.enable().catch(() => {
    // Autoplay refused or wake lock denied: the screen may sleep. Nothing to do.
  })
}

function onTapAfterReturn() {
  armed = false
  enable()
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible' || armed) return
  armed = true
  document.addEventListener('pointerdown', onTapAfterReturn, { once: true })
}

/** Call from inside a user gesture (e.g. the Join tap). Safe to call repeatedly. */
export function keepAwake(): void {
  if (!noSleep) {
    noSleep = new NoSleep()
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  if (!noSleep.isEnabled) enable()
}
