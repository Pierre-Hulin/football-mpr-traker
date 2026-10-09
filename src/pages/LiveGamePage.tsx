import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import "../styles/live-game.css";
import { Modal } from "../components/Modal/Modal";
import { PlayerRow } from "../components/PlayerRow/PlayerRow";
import { PlayerTile } from "../components/PlayerTile/PlayerTile";
import { useToast } from "../components/Toast/ToastProvider";
import { EmptyState, Loading } from "../components/ui";
import { PRESET_TYPE_LABELS, PRESET_TYPE_SHORT, quarterLabel, type GamePlayerStatus } from "../domain/enums";
import { isDomainError, isStorageError, toUserMessage } from "../domain/errors";
import {
  countState,
  isFocusRelevant,
  summarizeRoster,
  type RosterFilter,
} from "../domain/selectors/getGameState";
import { gameTitle } from "../domain/selectors/queries";
import { recordPlay, type RecordPlayInput } from "../domain/commands/recordPlay";
import { restorePlay, undoLastPlay } from "../domain/commands/undoLastPlay";
import { endQuarter } from "../domain/commands/endQuarter";
import { abandonGame, completeGame } from "../domain/commands/completeGame";
import { updateGamePlayerStatus } from "../domain/commands/updateGamePlayerStatus";
import {
  applyLineupPreset,
  clearCurrentLineup,
  restoreClearedLineup,
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

/** Taps within this window after a successful record are treated as accidental double taps. */
const DOUBLE_TAP_GUARD_MS = 400;
const SUCCESS_FLASH_MS = 1000;
const ERROR_FLASH_MS = 2000;

const filterKey = (gameId?: string) => `mpr-live-filter:${gameId ?? ""}`;
function readFilter(gameId?: string): RosterFilter {
  try {
    return sessionStorage.getItem(filterKey(gameId)) === "focus" ? "focus" : "all";
  } catch {
    return "all";
  }
}
function writeFilter(gameId: string | undefined, filter: RosterFilter) {
  try {
    sessionStorage.setItem(filterKey(gameId), filter);
  } catch {
    // Storage unavailable: the choice just won't survive navigation.
  }
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
  /** Ignore record taps for a moment after a success: absorbs accidental double taps. */
  const lastRecordedAt = useRef(0);
  const [recordState, setRecordState] = useState<
    { kind: "idle" } | { kind: "processing" } | { kind: "success"; playNumber: number } | { kind: "error" }
  >({ kind: "idle" });
  const [guarded, setGuarded] = useState(false);
  const [filter, setFilterState] = useState<RosterFilter>(() => readFilter(gameId));
  /**
   * Players taken OUT while in Focus mode stay visible until the next recorded
   * play (or a mode change), so tiles never shift under the user's finger and a
   * mis-tap can be undone in place.
   */
  const [sticky, setSticky] = useState<Set<string>>(new Set());
  const footerRef = useRef<HTMLElement>(null);

  const isActive = view?.game.status === "active";
  const { conflict, takeOver } = useGameLock(gameId, !!isActive);

  useWakeLock(!!isActive && settings.keepScreenAwakeEnabled, () =>
    toast.show({ message: "Screen wake lock isn't available on this device." }),
  );

  useEffect(() => {
    document.body.classList.add("is-live");
    return () => {
      document.body.classList.remove("is-live");
      document.body.style.removeProperty("--toast-offset");
    };
  }, []);

  // Keep toasts above the (variable-height) record controls.
  useEffect(() => {
    const el = footerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => document.body.style.setProperty("--toast-offset", `${el.offsetHeight + 8}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view?.game.id]);

  const setFilter = useCallback(
    (next: RosterFilter) => {
      setFilterState(next);
      setSticky(new Set());
      writeFilter(gameId, next);
    },
    [gameId],
  );

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
      if (!next && filter === "focus") setSticky((st) => new Set(st).add(playerId));
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
    [gameId, isIn, enqueue, reportError, filter],
  );

  const onUndo = useCallback(() => {
    if (!gameId) return;
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
  }, [gameId, enqueue, toast, reportError]);

  const doRecord = useCallback(
    async (req: RecordRequest, confirmWrongPlayerCount: boolean) => {
      if (!gameId || recordingRef.current) return;
      if (Date.now() - lastRecordedAt.current < DOUBLE_TAP_GUARD_MS) return;
      recordingRef.current = true;
      setRecordState({ kind: "processing" });
      try {
        const { play } = await enqueue(() => recordPlay({ gameId, ...req, confirmWrongPlayerCount }));
        lastRecordedAt.current = Date.now();
        setSaveFailure(null);
        setSticky(new Set());
        vibrate(35);
        setRecordState({ kind: "success", playNumber: play.playNumber });
        setGuarded(true);
        window.setTimeout(() => setGuarded(false), DOUBLE_TAP_GUARD_MS);
        window.setTimeout(
          () => setRecordState((st) => (st.kind === "success" && st.playNumber === play.playNumber ? { kind: "idle" } : st)),
          SUCCESS_FLASH_MS,
        );
        toast.announce(`Play ${play.playNumber} recorded${play.countsForMpr ? "" : ", does not count"}`);
      } catch (err) {
        if (isDomainError(err, "PLAYER_COUNT_CONFIRMATION_REQUIRED")) {
          setRecordState({ kind: "idle" });
          const d = err.details as { selected: number; expected: number };
          setCountConfirm({ req, selected: d.selected, expected: d.expected });
        } else {
          setRecordState({ kind: "error" });
          window.setTimeout(() => setRecordState((st) => (st.kind === "error" ? { kind: "idle" } : st)), ERROR_FLASH_MS);
          if (isStorageError(err)) setSaveFailure({ req, confirm: confirmWrongPlayerCount, message: toUserMessage(err) });
          else reportError(err);
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

  const onRestoreLineup = useCallback(() => {
    if (!gameId) return;
    enqueue(() => restoreClearedLineup(gameId))
      .then((r) => {
        setOptimistic(new Map());
        toast.show({
          message: `Lineup restored · ${r.selectedCount} selected${r.skippedCount ? ` · ${r.skippedCount} unavailable` : ""}`,
        });
      })
      .catch(reportError);
  }, [gameId, enqueue, toast, reportError]);

  const onClear = () => {
    if (!gameId) return;
    enqueue(() => clearCurrentLineup(gameId))
      .then(({ clearedCount }) => {
        setOptimistic(new Map());
        toast.show({
          message: clearedCount ? `Lineup cleared (${clearedCount})` : "Lineup is already empty",
          actionLabel: clearedCount ? "UNDO" : undefined,
          onAction: clearedCount ? onRestoreLineup : undefined,
        });
      })
      .catch(reportError);
  };

  const toggleView = () =>
    void updateAppSettings({ liveRosterView: settings.liveRosterView === "grid" ? "list" : "grid" }).catch(reportError);

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
  const isGrid = settings.liveRosterView === "grid";
  const inOf = (r: (typeof view.rows)[number]) => r.fieldEligible && isIn(r.player.id);
  const focusRows = view.rows.filter((r) => isFocusRelevant(r, inOf(r)) || (sticky.has(r.player.id) && r.fieldEligible));
  const visibleRows = filter === "focus" ? focusRows : view.rows;
  const summary = summarizeRoster(view.rows, isIn);
  const processing = recordState.kind === "processing";
  const restoreCount = game.clearedLineup?.playerIds.length ?? 0;

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

      <nav className="preset-bar" aria-label="Lineup actions">
        <div className="preset-scroll">
          {restoreCount > 0 && (
            <button
              type="button"
              className="preset-btn restore"
              onClick={onRestoreLineup}
              aria-label={`Restore the ${restoreCount}-player lineup from before Clear`}
              data-testid="restore-lineup"
            >
              ↺ RESTORE {restoreCount}
            </button>
          )}
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
        </div>
        <div className="preset-fixed">
          <button type="button" className="preset-btn clear" onClick={onClear} aria-label="Clear lineup (mark everyone out)">
            CLEAR
          </button>
          <button
            type="button"
            className="view-toggle"
            onClick={toggleView}
            aria-label={isGrid ? "Switch to list view (names and details)" : "Switch to grid view (jersey numbers only)"}
            data-testid="view-toggle"
            data-view={settings.liveRosterView}
          >
            {isGrid ? <ListIcon /> : <GridIcon />}
            <span>{isGrid ? "LIST" : "GRID"}</span>
          </button>
        </div>
      </nav>

      <div className="roster-filter" role="radiogroup" aria-label="Show players">
        <button
          type="button"
          role="radio"
          aria-checked={filter === "all"}
          onClick={() => setFilter("all")}
          data-testid="filter-all"
          aria-label={`All: ${view.rows.length} players`}
        >
          All <span className="rf-count">({view.rows.length})</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={filter === "focus"}
          onClick={() => setFilter("focus")}
          data-testid="filter-focus"
          aria-label={`Focus: ${focusRows.length} players on the field or still needing plays`}
        >
          Focus <span className="rf-count">({focusRows.length})</span>
        </button>
      </div>

      <main className={`roster ${isGrid ? "is-grid" : ""}`} aria-label="Players">
        {isGrid ? (
          <ul className="roster-grid" data-testid="roster-grid">
            {visibleRows.map((row) => (
              <PlayerTile
                key={row.player.id}
                view={row}
                inLineup={row.fieldEligible && isIn(row.player.id)}
                flash={flashId === row.player.id}
                onToggle={onToggle}
                onOpen={setSheetPlayerId}
              />
            ))}
          </ul>
        ) : (
          <ul className="roster-list" data-testid="roster-list">
            {visibleRows.map((row) => (
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
        )}
        {view.rows.length === 0 && <EmptyState title="No players in this game" />}
        {view.rows.length > 0 && visibleRows.length === 0 && (
          <div className="empty" data-testid="focus-empty">
            <div className="empty-title">No players need attention</div>
            <p>Nobody is on the field and every available player has met their minimum.</p>
            <button type="button" className="btn btn-secondary" onClick={() => setFilter("all")}>
              Show all players
            </button>
          </div>
        )}
        {isGrid && view.rows.length > 0 && (
          <p className="grid-hint">
            Tap a number for IN/OUT. Names, injuries and late arrivals: <Link to={`/games/${game.id}/players`}>Manage players</Link>
          </p>
        )}
      </main>

      <footer className="record-bar" ref={footerRef}>
        <div className="record-status">
          <p
            className="game-summary"
            data-testid="game-summary"
            aria-label={
              `${summary.onField} on the field for the next play. Roster of ${summary.total}: ` +
              `${summary.needPlays} still need plays, ${summary.met} met the minimum, ${summary.unavailable} unavailable.`
            }
          >
            <span className="gs-field">
              <b>{summary.onField}</b> on field
            </span>
            <span className="gs-roster">
              <span>
                <b>{summary.needPlays}</b> need plays
              </span>
              <span aria-hidden="true"> · </span>
              <span>
                <b>{summary.met}</b> met
              </span>
              <span aria-hidden="true"> · </span>
              <span>
                <b>{summary.unavailable}</b> unavailable
              </span>
            </span>
          </p>
          {view.lastPlay && (
            <button
              type="button"
              className="undo-chip"
              onClick={onUndo}
              aria-label={`Undo play ${view.lastPlay.play.playNumber}`}
              data-testid="undo-last"
            >
              ↶ UNDO {view.lastPlay.play.playNumber}
            </button>
          )}
        </div>
        {cs !== "exact" && (
          <p className="lineup-warning" role="status" data-testid="lineup-warning">
            <span aria-hidden="true">{cs === "under" ? "⚠" : "▲"}</span> {selectedCount} of {view.expected} players selected
            {cs === "over" ? " (too many)" : ""}
          </p>
        )}
        <div className="record-actions">
          <button
            type="button"
            className={`record-btn state-${recordState.kind}`}
            onClick={onRecord}
            aria-disabled={processing || guarded}
            aria-busy={processing}
            data-testid="record"
          >
            {recordState.kind === "processing"
              ? "RECORDING…"
              : recordState.kind === "success"
                ? `✓ PLAY ${recordState.playNumber} RECORDED`
                : recordState.kind === "error"
                  ? "✕ NOT SAVED"
                  : "RECORD PLAY"}
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
        </div>
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
          <Link className="sheet-option" to={`/games/${game.id}/players`} data-testid="manage-players">
            <span>
              Manage players
              <span className="sub">Injured, absent, late arrivals, exempt</span>
            </span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link className="sheet-option" to={`/games/${game.id}/history`}>
            Play history <span aria-hidden="true">›</span>
          </Link>
          <Link className="sheet-option" to={`/games/${game.id}/mpr`}>
            MPR summary <span aria-hidden="true">›</span>
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

function GridIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      {[1, 8, 15].flatMap((y) =>
        [1, 8, 15].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" rx="1.2" fill="currentColor" />),
      )}
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      {[3, 10, 17].map((y) => (
        <g key={y}>
          <rect x="1" y={y - 2} width="4" height="4" rx="1" fill="currentColor" />
          <rect x="7" y={y - 1.5} width="14" height="3" rx="1.5" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}
