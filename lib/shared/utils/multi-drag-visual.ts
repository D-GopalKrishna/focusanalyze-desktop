/**
 * Live visual feedback for a multi-event drag (Phase 5).
 *
 * FullCalendar's community edition only visually drags the single event you grab. To make the OTHER
 * selected events appear to move with it, we translate their DOM elements by the same pixel delta
 * for the duration of the drag, then restore them on drop — the subsequent refetch re-renders every
 * event at its real final position. This is purely cosmetic: the actual move is persisted separately
 * (see persistMultiDrag / buildMultiDragRecords). Kept in its own module so the DOM-transform logic
 * is isolated from the calendar component and easy to reason about.
 *
 * The delta passed to `update()` must be the grabbed event's own SNAPPED pixel movement (derived from
 * FullCalendar's reported, grid-snapped `start` time — see computeSnappedDragPixelDelta in
 * CalendarView.tsx), not the raw pointer position. FullCalendar snaps the event you actually grab to
 * the time/day grid as you drag (discrete jumps, like any calendar app); driving the other selected
 * events off the raw continuous mouse position instead made them glide smoothly while the grabbed one
 * jumped in steps — visually reading as "just following the cursor" rather than a real calendar drag.
 */

export type MultiDragVisual = {
  /** Reposition the followed elements by an already-snapped pixel delta (dx, dy). */
  update: (dx: number, dy: number) => void;
  /** Restore the followed elements' original inline styles. */
  clear: () => void;
};

/** Start following: `elements` are the OTHER selected events (not the grabbed one — FullCalendar
 *  already animates that). They translate by whatever pixel delta each `update()` call passes. */
export function createMultiDragVisual(elements: HTMLElement[]): MultiDragVisual {
  // Snapshot the inline styles we touch so clear() is an exact restore (not a blanket reset).
  const saved = elements.map((el) => ({
    el,
    transform: el.style.transform,
    zIndex: el.style.zIndex,
    opacity: el.style.opacity,
    pointerEvents: el.style.pointerEvents,
    transition: el.style.transition,
  }));

  for (const el of elements) {
    el.style.transition = 'none';
    el.style.zIndex = '1000';
    el.style.opacity = '0.75';
    el.style.pointerEvents = 'none';
  }

  return {
    update(dx: number, dy: number) {
      for (const el of elements) {
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      }
    },
    clear() {
      for (const s of saved) {
        s.el.style.transform = s.transform;
        s.el.style.zIndex = s.zIndex;
        s.el.style.opacity = s.opacity;
        s.el.style.pointerEvents = s.pointerEvents;
        s.el.style.transition = s.transition;
      }
    },
  };
}
