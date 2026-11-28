import { useLayoutEffect, type RefObject } from 'react'

/** Never shrink a word below this; past it, the word may break at a hyphen. */
const MIN_FONT_PX = 7
/** Headroom, as text doesn't scale perfectly linearly with font size. */
const SAFETY = 0.97

/**
 * Shrinks each `.word__text` in `grid` just enough that its longest word fits
 * the card on one line. Words only ever break between words (CSS forbids
 * mid-word breaks), so a word too long for its card overflows; we measure that
 * overflow and scale the font by `--fit`. Measured, not estimated from letter
 * counts, so wide letters (M, W, O) and any font or screen are handled.
 */
export function fitWords(grid: HTMLElement) {
  const texts = [...grid.querySelectorAll<HTMLElement>('.word__text')]
  // Write: back to full size. Read: measure all. Write: apply. (No layout thrash.)
  for (const t of texts) {
    t.style.removeProperty('--fit')
    t.classList.remove('word__text--wrap')
  }
  const measured = texts.map((t) => {
    const room = t.getBoundingClientRect().width
    const range = document.createRange()
    range.selectNodeContents(t)
    const longest = Math.max(0, ...[...range.getClientRects()].map((r) => r.width))
    return { room, longest, base: parseFloat(getComputedStyle(t).fontSize) }
  })
  texts.forEach((t, i) => {
    const { room, longest, base } = measured[i]
    if (longest <= room || longest === 0) return
    const fit = (room / longest) * SAFETY
    const floor = MIN_FONT_PX / base
    t.style.setProperty('--fit', String(Math.max(fit, floor)))
    if (fit < floor) t.classList.add('word__text--wrap')
  })
}

/** Refits when the words change, the board changes width, or web fonts load. */
export function useFitWords(ref: RefObject<HTMLElement | null>, words: string) {
  useLayoutEffect(() => {
    const grid = ref.current
    // No layout to measure without ResizeObserver (e.g. jsdom in unit tests).
    if (!grid || typeof ResizeObserver === 'undefined') return
    fitWords(grid)

    let width = grid.getBoundingClientRect().width
    // Width only: fitting changes card heights, which must not retrigger a fit.
    const observer = new ResizeObserver(() => {
      const w = grid.getBoundingClientRect().width
      if (w === width) return
      width = w
      fitWords(grid)
    })
    observer.observe(grid)
    let live = true
    document.fonts?.ready.then(() => live && fitWords(grid))
    return () => {
      live = false
      observer.disconnect()
    }
  }, [ref, words])
}
