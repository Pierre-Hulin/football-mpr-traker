import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Loading, PageHeader } from "../components/ui";
import { Modal } from "../components/Modal/Modal";
import { useToast } from "../components/Toast/ToastProvider";
import { correctPlay } from "../domain/commands/correctPlay";
import { restorePlay, voidPlay } from "../domain/commands/undoLastPlay";
import { GAME_PLAYER_STATUS_LABELS, NON_COUNTING_REASONS, quarterLabel } from "../domain/enums";
import { toUserMessage } from "../domain/errors";
import { useGameView } from "../hooks/useActiveGame";
import { formatTime } from "../utils/dates";
import { playLine } from "./PlayHistoryPage";

const EVENT_LABELS: Record<string, string> = {
  play_recorded: "Recorded",
  play_corrected: "Corrected",
  play_voided: "Voided",
  play_restored: "Restored",
};

export default function PlayDetailPage() {
  const { gameId = "", playId = "" } = useParams();
  const { data, view } = useGameView(gameId);
  const toast = useToast();
  const [editing, setEditing] = useState<Set<string> | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState<string>(NON_COUNTING_REASONS[0]);
  const [confirmVoid, setConfirmVoid] = useState(false);

  const pv = view?.plays.find((p) => p.play.id === playId);
  const history = useMemo(
    () => (data ? data.events.filter((e) => e.entityId === playId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []),
    [data, playId],
  );

  if (view === undefined) return <Loading />;
  if (!view || !pv)
    return (
      <div className="page">
        <PageHeader title="Play not found" back={`/games/${gameId}/history`} />
      </div>
    );

  const { play } = pv;
  const editable = view.game.status === "active";
  const participants = pv.participantIds
    .map((id) => view.rowsById.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => view.rows.indexOf(a) - view.rows.indexOf(b));

  const run = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn();
      toast.show({ message });
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error", duration: 6000 });
    }
  };

  const changedCount = editing
    ? new Set([...editing].filter((id) => !pv.participantIds.includes(id)).concat(pv.participantIds.filter((id) => !editing.has(id))))
        .size
    : 0;

  const saveCorrection = async () => {
    if (!editing) return;
    await run(() => correctPlay(play.id, { participantIds: [...editing] }), `Play ${play.playNumber} updated`);
    setConfirmSave(false);
    setEditing(null);
  };

  if (editing) {
    return (
      <div className="page" style={{ paddingBottom: 120 }}>
        <PageHeader title={`Edit Play ${play.playNumber}`} subtitle="Select everyone who was on the field" />
        <ul className="list">
          {view.rows.map((r) => {
            const on = editing.has(r.player.id);
            return (
              <li key={r.player.id}>
                <button
                  type="button"
                  className="list-item"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() =>
                    setEditing((s) => {
                      const n = new Set(s);
                      if (n.has(r.player.id)) n.delete(r.player.id);
                      else n.add(r.player.id);
                      return n;
                    })
                  }
                  style={on ? { background: "var(--row-in-bg)", boxShadow: "inset 6px 0 0 var(--row-in-bar)" } : undefined}
                >
                  <span className="jersey" style={{ fontSize: "1.3rem" }}>
                    #{r.player.jerseyNumber}
                  </span>
                  <span className="grow">
                    <span className="list-item-title">{r.player.displayName}</span>
                    {r.gamePlayer.status !== "active" && (
                      <span className="list-item-sub" style={{ display: "block" }}>
                        {GAME_PLAYER_STATUS_LABELS[r.gamePlayer.status]}
                      </span>
                    )}
                  </span>
                  <span style={{ fontWeight: 900 }}>{on ? "✓ IN" : "—"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--surface)",
            borderTop: "2px solid var(--border)",
            padding: "var(--space-2) var(--space-3) calc(var(--space-2) + var(--safe-bottom))",
          }}
        >
          <div className="row" style={{ maxWidth: "var(--max-width)", margin: "0 auto", flexWrap: "nowrap" }}>
            <span style={{ fontWeight: 800, minWidth: "6.5rem", color: editing.size !== play.expectedPlayerCount ? "var(--warn)" : undefined }}>
              {editing.size} / {play.expectedPlayerCount} selected
            </span>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary grow" disabled={changedCount === 0} onClick={() => setConfirmSave(true)}>
              SAVE CORRECTION
            </button>
          </div>
        </div>
        <Modal open={confirmSave} onClose={() => setConfirmSave(false)} title={`Update Play ${play.playNumber}?`}>
          <p>
            This changes participation {play.countsForMpr && !play.voided ? "totals" : "records"} for {changedCount}{" "}
            {changedCount === 1 ? "player" : "players"}.
          </p>
          <div className="modal-actions split">
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => setConfirmSave(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => void saveCorrection()}>
              Save
            </button>
          </div>
        </Modal>
      </div>
    );
  }

  const line = playLine(pv);
  return (
    <div className="page">
      <PageHeader title={`Play ${play.playNumber}`} subtitle={`${quarterLabel(play.quarter)} · ${formatTime(play.occurredAt)}`} back={`/games/${gameId}/history`} />
      <div className="stack">
        <div className="card">
          <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>{line.text}</div>
          {play.nonCountingReason && <div className="muted">Reason: {play.nonCountingReason}</div>}
          {play.playCategory && play.playCategory !== "scrimmage" && (
            <div className="muted">Type: {play.playCategory.replace("_", " ")}</div>
          )}
          {pv.countMismatch && !play.voided && (
            <p className="alert alert-warn" style={{ marginTop: "var(--space-2)", marginBottom: 0 }}>
              {pv.participantCount} players recorded (expected {play.expectedPlayerCount})
              {play.playerCountOverrideConfirmed ? " — recorded anyway by user." : "."}
            </p>
          )}
          {play.voided && (
            <p className="alert alert-info" style={{ marginTop: "var(--space-2)", marginBottom: 0 }}>
              Voided {play.voidedAt ? formatTime(play.voidedAt) : ""} {play.voidReason ? `· ${play.voidReason}` : ""}. Does not count.
            </p>
          )}
        </div>

        {editable && (
          <div className="stack">
            {!play.voided && (
              <>
                <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={() => setEditing(new Set(pv.participantIds))}>
                  Edit participants
                </button>
                {play.countsForMpr ? (
                  <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={() => setReasonOpen(true)}>
                    Mark non-counting
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary btn-lg btn-block"
                    onClick={() => void run(() => correctPlay(play.id, { countsForMpr: true }), `Play ${play.playNumber} now counts`)}
                  >
                    Mark as counting
                  </button>
                )}
                <button type="button" className="btn btn-danger-outline btn-block" onClick={() => setConfirmVoid(true)}>
                  Void play
                </button>
              </>
            )}
            {play.voided && (
              <button
                type="button"
                className="btn btn-primary btn-lg btn-block"
                onClick={() => void run(() => restorePlay(play.id), `Play ${play.playNumber} restored`)}
              >
                Restore play
              </button>
            )}
          </div>
        )}
        {!editable && <p className="muted small">This game is {view.game.status}. Its plays are read-only.</p>}

        <h2 className="section-title">Participants ({participants.length})</h2>
        <ul className="list">
          {participants.map((r) => (
            <li key={r.player.id} className="list-item" style={{ cursor: "default", minHeight: 48 }}>
              <span className="jersey">#{r.player.jerseyNumber}</span>
              <span className="grow">{r.player.displayName}</span>
              {r.gamePlayer.status !== "active" && (
                <span className="badge badge-neutral">{GAME_PLAYER_STATUS_LABELS[r.gamePlayer.status].toUpperCase()}</span>
              )}
            </li>
          ))}
          {participants.length === 0 && <li className="list-item muted">No players</li>}
        </ul>

        <h2 className="section-title">History</h2>
        <ul className="list">
          {history.map((e) => (
            <li key={e.id} className="list-item" style={{ cursor: "default", minHeight: 48 }}>
              <span className="grow">
                <strong>{EVENT_LABELS[e.type] ?? e.type}</strong>
                {e.message && <span className="muted"> · {e.message}</span>}
                {e.type === "play_corrected" && <CorrectionDiff before={e.before} after={e.after} names={view.rowsById} />}
              </span>
              <span className="muted small">{formatTime(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      </div>

      <Modal open={reasonOpen} onClose={() => setReasonOpen(false)} title="Why doesn't this play count?">
        <div role="radiogroup" className="stack" aria-label="Reason">
          {NON_COUNTING_REASONS.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={reason === r} className="sheet-option" onClick={() => setReason(r)}>
              <span>{r}</span>
              <span aria-hidden="true">{reason === r ? "●" : "○"}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions split">
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => setReasonOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => {
              setReasonOpen(false);
              void run(() => correctPlay(play.id, { countsForMpr: false, nonCountingReason: reason }), `Play ${play.playNumber} marked non-counting`);
            }}
          >
            Save
          </button>
        </div>
      </Modal>

      <Modal open={confirmVoid} onClose={() => setConfirmVoid(false)} title={`Void Play ${play.playNumber}?`}>
        <p>The play stays in the history but no longer counts for anyone. Play numbers are not changed. You can restore it later.</p>
        <div className="modal-actions split">
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => setConfirmVoid(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger btn-lg"
            onClick={() => {
              setConfirmVoid(false);
              void run(() => voidPlay(play.id), `Play ${play.playNumber} voided`);
            }}
          >
            Void
          </button>
        </div>
      </Modal>
    </div>
  );
}

function CorrectionDiff({
  before,
  after,
  names,
}: {
  before: unknown;
  after: unknown;
  names: Map<string, { player: { jerseyNumber: string } }>;
}) {
  const b = before as { participantIds?: string[]; countsForMpr?: boolean } | undefined;
  const a = after as { participantIds?: string[]; countsForMpr?: boolean } | undefined;
  if (!a || !b) return null;
  const label = (id: string) => `#${names.get(id)?.player.jerseyNumber ?? "?"}`;
  const added = (a.participantIds ?? []).filter((id) => !(b.participantIds ?? []).includes(id));
  const removed = (b.participantIds ?? []).filter((id) => !(a.participantIds ?? []).includes(id));
  const parts: string[] = [];
  if (added.length) parts.push(`added ${added.map(label).join(", ")}`);
  if (removed.length) parts.push(`removed ${removed.map(label).join(", ")}`);
  if (a.countsForMpr !== b.countsForMpr) parts.push(a.countsForMpr ? "now counts" : "now non-counting");
  return parts.length ? <span className="muted small" style={{ display: "block" }}>{parts.join(" · ")}</span> : null;
}
