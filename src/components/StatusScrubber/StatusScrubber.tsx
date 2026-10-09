import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { GAME_PLAYER_STATUSES, GAME_PLAYER_STATUS_LABELS, type GamePlayerStatus } from "../../domain/enums";

/**
 * Detented horizontal status scrubber (pregame availability).
 *
 *   ACTIVE ‹—› ABSENT ‹—› LATE ‹—› INJURED ‹—› EXEMPT ‹—› INELIGIBLE   (no wrap)
 *
 * Gesture model:
 * - `touch-action: pan-y` leaves vertical scrolling to the browser. If the
 *   browser claims the gesture as a scroll it fires `pointercancel` and nothing
 *   changes.
 * - Our own direction lock: horizontal mode engages only after the finger has
 *   moved ENGAGE_PX horizontally AND the movement is at least DIRECTION_RATIO
 *   times more horizontal than vertical. If it moves ABORT_PX vertically
 *   first, the gesture is ignored for good.
 * - Once engaged, every STEP_PX of travel is one detent (finger right = later
 *   status). A detent changes only when the finger passes HYSTERESIS beyond
 *   the midpoint, so it does not flicker at a boundary. Values clamp at both
 *   ends.
 * - Release commits the previewed status; pointercancel reverts.
 * - A tap with no drag opens the full picker (the accessible path). Arrow keys
 *   step through the statuses.
 */
export const STEP_PX = 28;
export const ENGAGE_PX = 10;
export const ABORT_PX = 10;
export const DIRECTION_RATIO = 1.5;
const HYSTERESIS = 0.15;

const SHORT: Record<GamePlayerStatus, string> = {
  active: "ACT",
  absent: "ABS",
  late: "LATE",
  injured: "INJ",
  exempt: "EXM",
  ineligible: "INEL",
};

function haptic() {
  try {
    navigator.vibrate?.(8);
  } catch {
    // Unsupported (e.g. iOS Safari): visual feedback only.
  }
}

interface Props {
  status: GamePlayerStatus;
  /** Used in the accessible name, e.g. "#12 Jack Smith". */
  playerLabel: string;
  onChange: (status: GamePlayerStatus) => void;
  /** Tap (no drag): open the explicit picker. */
  onOpenPicker: () => void;
}

type Phase = "idle" | "pending" | "dragging";

export function StatusScrubber({ status, playerLabel, onChange, onOpenPicker }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const gesture = useRef({ phase: "idle" as Phase, x: 0, y: 0, pointerId: -1, startIndex: 0, current: 0 });
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [bubble, setBubble] = useState<{ left: number; top: number } | null>(null);
  const [pending, setPending] = useState<GamePlayerStatus | null>(null);

  // Hold a just-committed value until the persisted status catches up.
  useEffect(() => {
    if (pending && pending === status) setPending(null);
  }, [status, pending]);

  const shown = pending ?? status;
  const index = preview ?? GAME_PLAYER_STATUSES.indexOf(shown);
  const value = GAME_PLAYER_STATUSES[index];
  const last = GAME_PLAYER_STATUSES.length - 1;

  const reset = () => {
    gesture.current.phase = "idle";
    setPreview(null);
    setBubble(null);
  };

  const commit = (next: GamePlayerStatus) => {
    if (next === shown) return;
    setPending(next);
    onChange(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const start = GAME_PLAYER_STATUSES.indexOf(shown);
    gesture.current = { phase: "pending", x: e.clientX, y: e.clientY, pointerId: e.pointerId, startIndex: start, current: start };
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (g.phase === "idle" || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;

    if (g.phase === "pending") {
      if (Math.abs(dy) >= ABORT_PX && Math.abs(dy) * DIRECTION_RATIO > Math.abs(dx)) {
        // Mostly vertical: this is a scroll, never a status change.
        g.phase = "idle";
        return;
      }
      if (Math.abs(dx) < ENGAGE_PX || Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return;
      g.phase = "dragging";
      // Re-base so the first detent needs a full step from the engage point.
      g.x = e.clientX - Math.sign(dx) * ENGAGE_PX;
      try {
        ref.current?.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      const rect = ref.current?.getBoundingClientRect();
      if (rect) {
        const half = 150;
        const left = Math.min(Math.max(rect.left + rect.width / 2, half + 8), window.innerWidth - half - 8);
        const top = rect.top - 84 < 8 ? rect.bottom + 10 : rect.top - 84;
        setBubble({ left, top });
      }
      setPreview(g.current);
    }

    // Dragging: detented mapping with hysteresis and clamping (no wrap).
    const raw = g.startIndex + (e.clientX - g.x) / STEP_PX;
    let next = g.current;
    if (raw > g.current + 0.5 + HYSTERESIS) next = Math.round(raw - HYSTERESIS);
    else if (raw < g.current - 0.5 - HYSTERESIS) next = Math.round(raw + HYSTERESIS);
    next = Math.min(Math.max(next, 0), last);
    if (next !== g.current) {
      g.current = next;
      setPreview(next);
      haptic();
    }
    e.preventDefault();
  };

  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (e.pointerId !== g.pointerId) return;
    if (g.phase === "dragging") {
      suppressClick.current = true;
      commit(GAME_PLAYER_STATUSES[g.current]);
    }
    reset();
  };

  const onPointerCancel = () => {
    // The browser took the gesture (e.g. vertical scroll): revert any preview.
    if (gesture.current.phase === "dragging") suppressClick.current = true;
    reset();
  };

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onOpenPicker();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = GAME_PLAYER_STATUSES.indexOf(shown);
    if (e.key === "ArrowRight" && i < last) commit(GAME_PLAYER_STATUSES[i + 1]);
    else if (e.key === "ArrowLeft" && i > 0) commit(GAME_PLAYER_STATUSES[i - 1]);
    else if (e.key === "Home") commit(GAME_PLAYER_STATUSES[0]);
    else return;
    e.preventDefault();
  };

  const dragging = preview !== null;

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`scrubber status-${value} ${dragging ? "dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={`Status for ${playerLabel}: ${GAME_PLAYER_STATUS_LABELS[value]}. Tap to choose, or use left and right arrow keys.`}
        data-testid="status-scrubber"
        data-status={value}
      >
        <span className="sc-arrow" aria-hidden="true" style={{ visibility: index > 0 ? "visible" : "hidden" }}>
          ‹
        </span>
        <span className="sc-body" aria-hidden="true">
          <span className="sc-label">{GAME_PLAYER_STATUS_LABELS[value].toUpperCase()}</span>
          <span className="sc-ticks">
            {GAME_PLAYER_STATUSES.map((s, i) => (
              <span key={s} className={i === index ? "on" : ""} />
            ))}
          </span>
        </span>
        <span className="sc-arrow" aria-hidden="true" style={{ visibility: index < last ? "visible" : "hidden" }}>
          ›
        </span>
      </button>
      {bubble &&
        createPortal(
          <div className="scrub-bubble" style={{ left: bubble.left, top: bubble.top }} aria-hidden="true" data-testid="scrub-bubble">
            <div className={`sb-current status-${value}`}>{GAME_PLAYER_STATUS_LABELS[value].toUpperCase()}</div>
            <div className="sb-strip">
              {GAME_PLAYER_STATUSES.map((s, i) => (
                <span key={s} className={i === index ? "on" : ""}>
                  {SHORT[s]}
                </span>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
