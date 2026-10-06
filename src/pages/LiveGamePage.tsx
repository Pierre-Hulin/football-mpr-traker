import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import "../styles/live-game.css";
import { Modal } from "../components/Modal/Modal";
import { PlayerRow } from "../components/PlayerRow/PlayerRow";
import { useToast } from "../components/Toast/ToastProvider";
import { EmptyState, Loading } from "../components/ui";
import { PRESET_TYPE_LABELS, PRESET_TYPE_SHORT, quarterLabel, type GamePlayerStatus } from "../domain/enums";
import { isDomainError, isStorageError, toUserMessage } from "../domain/errors";
import { countState } from "../domain/selectors/getGameState";
import { gameTitle } from "../domain/selectors/queries";
import { recordPlay, type RecordPlayInput } from "../domain/commands/recordPlay";
import { restorePlay, undoLastPlay } from "../domain/commands/undoLastPlay";
import { endQuarter } from "../domain/commands/endQuarter";
import { abandonGame, completeGame } from "../domain/commands/completeGame";
import { updateGamePlayerStatus } from "../domain/commands/updateGamePlayerStatus";
import {
  applyLineupPreset,
  clearCurrentLineup,
  replaceCurrentLineup,
  togglePlayerInLineup,
} from "../domain/commands/setCurrentLineup";
import { buildBackupFile } from "../domain/services/backupService";
import { logGameExport } from "../domain/services/exportService";
import { useGameView } from "../hooks/useActiveGame";
import { updateAppSettings, useAppSettings } from "../hooks/useAppSettings";
import { useWakeLock } from "../hooks/useWakeLock";
import { useGameLock } from "../hooks/useGameLock";
import { shareOrDownload, safeFilename } from "../utils/fileDownload";
import { PlayerSheet } from "./live/PlayerSheet";
import { RecordMenuSheet, type RecordOptions } from "./live/RecordMenuSheet";
import { QuarterSheet } from "./live/QuarterSheet";
import { EndGameModal } from "./live/EndGameModal";

interface Optimistic {
  value: boolean;
  pending: number;
}

type RecordRequest = Omit<RecordPlayInput, "gameId" | "confirmWrongPlayerCount">;

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // unsupported: ignore
  }
}

export default function LiveGamePage() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useAppSettings();
  const { data, view } = useGameView(gameId, settings.preferredPlayerSort);

  const [optimistic, setOptimistic] = useState<Map<string, Optimistic>>(new Map());
  const [sheetPlayerId, setSheetPlayerId] = useState<string | null>(null);
  const [quarterOpen, setQuarterOpen] = useState(false);
  const [recordMenuOpen, setRecordMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [endGame, setEndGame] = useState<{ afterQuarter?: string } | null>(null);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [countConfirm, setCountConfirm] = useState<{ req: RecordRequest; selected: number; expected: number } | null>(null);
  const [saveFailure, setSaveFailure] = useState<{ req: RecordRequest; confirm: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const recordingRef = useRef(false);

  const isActive = view?.game.status === "active";
  const { conflict, takeOver } = useGameLock(gameId, !!isActive);

  useWakeLock(!!isActive && settings.keepScreenAwakeEnabled, () =>
    toast.show({ message: "Screen wake lock isn't available on this device." }),
  );

  useEffect(() => {
    document.body.classList.add("is-live");
    return () => document.body.classList.remove("is-live");
  }, []);

  // Serialize every write so Record always sees prior lineup changes.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const p = queue.current.then(fn, fn);
    queue.current = p.catch(() => undefined);
    return p;
  }, []);

  // Drop optimistic entries once persisted state catches up.
  useEffect(() => {
    if (!view || optimistic.size === 0) return;
    let changed = false;
    const next = new Map(optimistic);
    for (const [id, o] of optimistic) {
      const persisted = view.rowsById.get(id)?.inLineup ?? false;
      if (o.pending === 0 && persisted === o.value) {
        next.delete(id);
        changed = true;
      }
    }
    if (changed) setOptimistic(next);
  }, [view, optimistic]);

  const isIn = useCallback(
    (playerId: string) => {
      const o = optimistic.get(playerId);
      return o ? o.value : (view?.rowsById.get(playerId)?.inLineup ?? false);
    },
    [optimistic, view],
  );

  const selectedCount = useMemo(
    () => (view ? view.rows.filter((r) => r.fieldEligible && isIn(r.player.id)).length : 0),
    [view, isIn],
  );

  const reportError = useCallback(
    (err: unknown) => toast.show({ message: toUserMessage(err), tone: "error", duration: 6000 }),
    [toast],
  );

  const onToggle = useCallback(
    (playerId: string) => {
      if (!gameId) return;
      const next = !isIn(playerId);
      setOptimistic((m) => new Map(m).set(playerId, { value: next, pending: (m.get(playerId)?.pending ?? 0) + 1 }));
      enqueue(() => togglePlayerInLineup(gameId, playerId, next))
        .then(() =>
          setOptimistic((m) => {
            const o = m.get(playerId);
            if (!o) return m;
            return new Map(m).set(playerId, { ...o, pending: Math.max(o.pending - 1, 0) });
          }),
        )
        .catch((err) => {
          setOptimistic((m) => {
            const n = new Map(m);
            n.delete(playerId);
            return n;
          });
          reportError(err);
        });
    },
    [gameId, isIn, enqueue, reportError],
  );

  const doRecord = useCallback(
    async (req: RecordRequest, confirmWrongPlayerCount: boolean) => {
      if (!gameId || recordingRef.current) return;
      recordingRef.current = true;
      try {
        const { play } = await enqueue(() => recordPlay({ gameId, ...req, confirmWrongPlayerCount }));
        setSaveFailure(null);
        vibrate(35);
        const counts = play.countsForMpr ? "" : " · does not count";
        toast.show({
          message: `✓ Play ${play.playNumber} recorded${counts}`,
          actionLabel: "UNDO",
          duration: 7000,
          onAction: () => {
            enqueue(() => undoLastPlay(gameId))
              .then((undone) => {
                vibrate(20);
                toast.show({
                  message: `Play ${undone.playNumber} undone`,
                  actionLabel: "RESTORE",
                  duration: 6000,
                  onAction: () =>
                    enqueue(() => restorePlay(undone.id))
                      .then(() => toast.show({ message: `Play ${undone.playNumber} restored` }))
                      .catch(reportError),
                });
              })
              .catch(reportError);
          },
        });
      } catch (err) {
        if (isDomainError(err, "PLAYER_COUNT_CONFIRMATION_REQUIRED")) {
          const d = err.details as { selected: number; expected: number };
          setCountConfirm({ req, selected: d.selected, expected: d.expected });
        } else if (isStorageError(err)) {
          setSaveFailure({ req, confirm: confirmWrongPlayerCount, message: toUserMessage(err) });
        } else {
          reportError(err);
        }
      } finally {
        recordingRef.current = false;
      }
    },
    [gameId, enqueue, toast, reportError],
  );

  const onRecord = () => doRecord({ countsForMpr: true, playCategory: "scrimmage" }, false);
  const onRecordOption = (opts: RecordOptions) => doRecord(opts, false);

  const onPreset = (presetId: string) => {
    if (!gameId) return;
    enqueue(() => applyLineupPreset(gameId, presetId))
      .then((r) => {
        setOptimistic(new Map());
        toast.show({
          message: `${r.presetName} loaded · ${r.selectedCount} selected${r.skippedCount ? ` · ${r.skippedCount} unavailable` : ""}`,
        });
      })
      .catch(reportError);
  };

  const onClear = () => {
    if (!gameId || !view) return;
    const previous = view.rows.filter((r) => isIn(r.player.id)).map((r) => r.player.id);
    enqueue(() => clearCurrentLineup(gameId))
      .then(() => {
        setOptimistic(new Map());
        toast.show({
          message: "Lineup cleared",
          actionLabel: previous.length ? "UNDO" : undefined,
          onAction: previous.length
            ? () => enqueue(() => replaceCurrentLineup(gameId, previous)).catch(reportError)
            : undefined,
        });
      })
      .catch(reportError);
  };

  const onActivate = useCallback(
    (playerId: string) => {
      if (!gameId) return;
      enqueue(() => updateGamePlayerStatus({ gameId, playerId, status: "active" }))
        .then(() => {
          const p = view?.rowsById.get(playerId)?.player;
          toast.show({ message: `#${p?.jerseyNumber} ${p?.displayName} activated` });
        })
        .catch(reportError);
    },
    [gameId, enqueue, toast, reportError, view],
  );

  const onChangeStatus = async (playerId: string, status: GamePlayerStatus, reason?: string) => {
    if (!gameId) return false;
    try {
      await enqueue(() => updateGamePlayerStatus({ gameId, playerId, status, reason }));
      setOptimistic((m) => {
        const n = new Map(m);
        n.delete(playerId);
        return n;
      });
      const p = view?.rowsById.get(playerId)?.player;
      toast.show({ message: `#${p?.jerseyNumber} ${p?.displayName}: ${status === "active" ? "activated" : status}` });
      return true;
    } catch (err) {
      reportError(err);
      return false;
    }
  };

  const onEndQuarter = async () => {
    if (!gameId || !view) return;
    setBusy(true);
    try {
      const ended = view.game.currentQuarter;
      const { game } = await enqueue(() => endQuarter(gameId));
      setQuarterOpen(false);
      toast.show({ message: `${quarterLabel(ended)} ended · ${quarterLabel(game.currentQuarter)} started` });
      if (ended >= 4) setEndGame({ afterQuarter: quarterLabel(ended) });
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  const onCompleteGame = async () => {
    if (!gameId) return;
    setBusy(true);
    try {
      await enqueue(() => completeGame(gameId));
      toast.show({ message: "Game completed" });
      navigate(`/games/${gameId}/summary`, { replace: true });
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  const onAbandon = async () => {
    if (!gameId) return;
    try {
      await enqueue(() => abandonGame(gameId));
      toast.show({ message: "Game abandoned" });
      navigate("/", { replace: true });
    } catch (err) {
      reportError(err);
    }
  };

  const onExportBackup = async () => {
    if (!gameId || !data) return;
    try {
      const file = await buildBackupFile(gameId, safeFilename(`mpr-game-${data.game.opponent ?? data.game.gameDate}`));
      await shareOrDownload(file);
      await logGameExport(gameId, "json");
    } catch (err) {
      reportError(err);
    }
  };

  const scrollToRisk = () => {
    const first = view?.atRisk[0];
    if (!first) return;
    document.getElementById(`player-${first.player.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(first.player.id);
    window.setTimeout(() => setFlashId(null), 1300);
  };

  if (view === undefined) return <Loading />;
  if (view === null || !data) {
    return (
      <div className="page">
        <EmptyState title="Game not found">
          <Link className="btn btn-primary" to="/">
            Go home
          </Link>
        </EmptyState>
      </div>
    );
  }
  if (view.game.status === "draft") return <Navigate to={`/games/${view.game.id}/setup`} replace />;
  if (view.game.status !== "active") return <Navigate to={`/games/${view.game.id}/summary`} replace />;

  const { game } = view;
  const cs = countState(selectedCount, view.expected);
  const presets = [...data.presets].sort((a, b) => a.sortOrder - b.sortOrder);
  const critical = view.atRisk.filter((r) => r.risk.level === "critical");
  const sheetView = sheetPlayerId ? view.rowsById.get(sheetPlayerId) : undefined;
  const countIcon = cs === "exact" ? "✓ " : cs === "under" ? "▼ " : "▲ ";

  return (
    <div className="live">
      <header className="live-header">
        <button
          type="button"
          className="hdr-btn"
          onClick={() => setQuarterOpen(true)}
          aria-label={`${quarterLabel(game.currentQuarter)}. Open quarter actions`}
          data-testid="quarter"
        >
          <span className="hdr-quarter">{quarterLabel(game.currentQuarter)}</span>
          <span className="hdr-label">Quarter</span>
        </button>
        <div className="hdr-next" aria-label={`Next play ${game.nextPlayNumber}`}>
          <span className="hdr-label">Next play</span>
          <span className="hdr-next-num" data-testid="next-play">
            {game.nextPlayNumber}
          </span>
        </div>
        <div
          className={`hdr-count ${cs}`}
          role="status"
          aria-label={`${selectedCount} of ${view.expected} players on field${cs === "under" ? ", too few" : cs === "over" ? ", too many" : ""}`}
        >
          <span className="hdr-count-num" data-testid="selected-count">
            {countIcon}
            {selectedCount}/{view.expected}
          </span>
          <span className="hdr-label">{cs === "exact" ? "On field" : cs === "under" ? "Too few" : "Too many"}</span>
        </div>
        <button type="button" className="hdr-btn hdr-menu" aria-label="Game menu" onClick={() => setMenuOpen(true)}>
          ⋯
        </button>
      </header>

      {view.atRisk.length > 0 && (
        <button
          type="button"
          className={`risk-banner ${critical.length ? "critical" : "at_risk"}`}
          onClick={scrollToRisk}
          data-testid="risk-banner"
        >
          <span aria-hidden="true" style={{ fontSize: "1.3rem" }}>
            {critical.length ? "!" : "⚠"}
          </span>
          <span className="rb-text">
            <span>
              {critical.length
                ? `CRITICAL: ${critical
                    .slice(0, 2)
                    .map((r) => `#${r.player.jerseyNumber} NEEDS ${r.remaining}`)
                    .join(" · ")}${critical.length > 2 ? ` +${critical.length - 2}` : ""}`
                : `${view.atRisk.length} ${view.atRisk.length === 1 ? "PLAYER" : "PLAYERS"} AT RISK`}
            </span>
            <span className="rb-detail">
              {critical.length && view.atRisk.length > critical.length
                ? `+${view.atRisk.length - critical.length} at risk · `
                : ""}
              {(critical.length ? view.atRisk.filter((r) => r.risk.level === "at_risk") : view.atRisk)
                .slice(0, 4)
                .map((r) => `#${r.player.jerseyNumber} needs ${r.remaining}`)
                .join(" · ")}
            </span>
          </span>
        </button>
      )}

      <nav className="preset-bar" aria-label="Lineup presets">
        {presets.map((p) => {
          const short = PRESET_TYPE_SHORT[p.type];
          const label = p.type !== "custom" && p.name === PRESET_TYPE_LABELS[p.type] && short ? short : p.name;
          return (
            <button
              key={p.id}
              type="button"
              className="preset-btn"
              onClick={() => onPreset(p.id)}
              aria-label={`Load ${p.name} preset`}
            >
              {label.toUpperCase()}
            </button>
          );
        })}
        <button type="button" className="preset-btn clear" onClick={onClear} aria-label="Clear lineup (mark everyone out)">
          CLEAR
        </button>
      </nav>

      <main className="roster" aria-label="Players">
        <ul className="roster-list">
          {view.rows.map((row) => (
            <PlayerRow
              key={row.player.id}
              view={row}
              inLineup={row.fieldEligible && isIn(row.player.id)}
              flash={flashId === row.player.id}
              onToggle={onToggle}
              onOpen={setSheetPlayerId}
              onActivate={onActivate}
            />
          ))}
        </ul>
        {view.rows.length === 0 && <EmptyState title="No players in this game" />}
      </main>

      <footer className="record-bar">
        <button
          type="button"
          className={`record-btn ${cs !== "exact" ? "mismatch" : ""}`}
          onClick={onRecord}
          data-testid="record"
        >
          RECORD PLAY
          <span className="record-sub">
            {selectedCount} {selectedCount === 1 ? "player" : "players"} selected
            {cs !== "exact" ? ` · expected ${view.expected}` : ""}
          </span>
        </button>
        <button
          type="button"
          className="record-more"
          onClick={() => setRecordMenuOpen(true)}
          aria-label="More record options: non-counting, special teams, PAT"
          data-testid="record-more"
        >
          <span className="dots" aria-hidden="true">
            ⋯
          </span>
          MORE
        </button>
      </footer>

      {/* ---------- Sheets & modals ---------- */}

      <PlayerSheet view={sheetView} onClose={() => setSheetPlayerId(null)} onChangeStatus={onChangeStatus} />

      <QuarterSheet open={quarterOpen} view={view} onClose={() => setQuarterOpen(false)} onEndQuarter={onEndQuarter} busy={busy} />

      <RecordMenuSheet
        open={recordMenuOpen}
        game={game}
        selectedCount={selectedCount}
        onClose={() => setRecordMenuOpen(false)}
        onRecord={onRecordOption}
      />

      <Modal
        open={!!countConfirm}
        onClose={() => setCountConfirm(null)}
        title={`Record play with ${countConfirm?.selected ?? 0} ${countConfirm?.selected === 1 ? "player" : "players"}?`}
        role="alertdialog"
      >
        {countConfirm && (
          <>
            <div className="count-compare">
              <div>
                <span className="big">{countConfirm.expected}</span>Expected
              </div>
              <div style={{ color: "var(--danger)" }}>
                <span className="big">{countConfirm.selected}</span>Selected
              </div>
            </div>
            <p className="center muted">
              {countConfirm.selected < countConfirm.expected
                ? `Only ${countConfirm.selected} players are marked IN.`
                : `${countConfirm.selected} players are marked IN.`}{" "}
              This play can still be recorded.
            </p>
            <div className="modal-actions split">
              <button type="button" className="btn btn-secondary btn-lg" onClick={() => setCountConfirm(null)} data-autofocus>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                data-testid="record-anyway"
                onClick={() => {
                  const req = countConfirm.req;
                  setCountConfirm(null);
                  void doRecord(req, true);
                }}
              >
                Record anyway
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!saveFailure}
        onClose={() => setSaveFailure(null)}
        title="Play was NOT saved."
        role="alertdialog"
        dismissible={false}
      >
        <p className="alert alert-danger">Do not continue until storage is available.</p>
        <p className="muted small">{saveFailure?.message}</p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => saveFailure && void doRecord(saveFailure.req, saveFailure.confirm)}
            data-autofocus
          >
            TRY AGAIN
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setSaveFailure(null)}>
            Dismiss (play not recorded)
          </button>
        </div>
      </Modal>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title={gameTitle(game, data.team)}>
        <p className="muted small">
          Min {game.requiredPlaysDefault} plays · {game.expectedPlayersOnField} on field · deadline end of{" "}
          {quarterLabel(game.mprDeadlineQuarter ?? 4)}
        </p>
        <div className="stack">
          <Link className="sheet-option" to={`/games/${game.id}/history`}>
            Play history <span aria-hidden="true">›</span>
          </Link>
          <Link className="sheet-option" to={`/games/${game.id}/mpr`}>
            MPR summary &amp; player statuses <span aria-hidden="true">›</span>
          </Link>
          <Link className="sheet-option" to={`/games/${game.id}/quarters`}>
            Quarter breakdown <span aria-hidden="true">›</span>
          </Link>
          <button
            type="button"
            className="sheet-option"
            onClick={() => void updateAppSettings({ keepScreenAwakeEnabled: !settings.keepScreenAwakeEnabled })}
            role="switch"
            aria-checked={settings.keepScreenAwakeEnabled}
          >
            Keep screen awake <span>{settings.keepScreenAwakeEnabled ? "ON" : "OFF"}</span>
          </button>
          <button
            type="button"
            className="sheet-option"
            onClick={() => {
              setMenuOpen(false);
              void onExportBackup();
            }}
          >
            Export game backup (JSON) <span aria-hidden="true">↓</span>
          </button>
          <button
            type="button"
            className="btn btn-danger btn-lg btn-block"
            onClick={() => {
              setMenuOpen(false);
              setEndGame({});
            }}
            data-testid="end-game"
          >
            End game
          </button>
          <button
            type="button"
            className="btn btn-danger-outline btn-block"
            onClick={() => {
              setMenuOpen(false);
              setAbandonOpen(true);
            }}
          >
            Abandon game
          </button>
          <Link className="btn btn-secondary btn-block" to="/">
            Home (game stays in progress)
          </Link>
          <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={() => setMenuOpen(false)}>
            Close
          </button>
        </div>
      </Modal>

      <EndGameModal
        open={!!endGame}
        view={view}
        afterQuarter={endGame?.afterQuarter}
        onClose={() => setEndGame(null)}
        onConfirm={onCompleteGame}
        busy={busy}
      />

      <Modal open={abandonOpen} onClose={() => setAbandonOpen(false)} title="Abandon this game?">
        <p>The game will stop without a normal completion. Its recorded plays stay on this device and can still be exported.</p>
        <div className="modal-actions split">
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => setAbandonOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger btn-lg" onClick={onAbandon}>
            Abandon
          </button>
        </div>
      </Modal>

      {conflict && (
        <div className="lock-overlay" role="alertdialog" aria-modal="true" aria-labelledby="lock-title">
          <div className="card stack" style={{ maxWidth: 420 }}>
            <h2 id="lock-title">This game is already open in another tab.</h2>
            <p>Recording from two tabs can cause mistakes.</p>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={takeOver}>
              TAKE OVER HERE
            </button>
            <Link className="btn btn-secondary btn-lg btn-block" to="/">
              Go home
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
