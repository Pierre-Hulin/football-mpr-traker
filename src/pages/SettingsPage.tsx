import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NumberStepper, PageHeader, Switch } from "../components/ui";
import { Modal } from "../components/Modal/Modal";
import { UpdateBanner } from "../components/UpdateBanner";
import { useToast } from "../components/Toast/ToastProvider";
import { updateAppSettings, useAppSettings } from "../hooks/useAppSettings";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { useServiceWorkerState } from "../pwa/registerSW";
import { APP_VERSION, buildBackupFile, clearAllData, previewBackup, replaceAllData, type BackupPreview } from "../domain/services/backupService";
import { isWakeLockSupported } from "../domain/services/wakeLockService";
import { LIVE_ROSTER_VIEWS, PLAYER_SORTS, type PlayerSort } from "../domain/enums";
import { toUserMessage } from "../domain/errors";
import { downloadFile, readFileAsText, shareOrDownload } from "../utils/fileDownload";

const SORT_LABELS: Record<PlayerSort, string> = { jersey: "Jersey #", name: "Name", risk: "Risk" };

export default function SettingsPage() {
  const settings = useAppSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const sw = useServiceWorkerState();
  const install = useInstallPrompt();
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLElement>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.location.hash === "#import") importRef.current?.scrollIntoView();
  }, []);

  const exportAll = async (share: boolean) => {
    try {
      const file = await buildBackupFile();
      if (share) await shareOrDownload(file);
      else downloadFile(file);
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error" });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPreview(await previewBackup(await readFileAsText(file)));
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error", duration: 7000 });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doReplace = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await replaceAllData(preview.backup);
      setPreview(null);
      toast.show({ message: "Backup imported" });
      navigate("/", { replace: true });
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error", duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const doClear = async () => {
    setBusy(true);
    try {
      await clearAllData();
      setClearOpen(false);
      toast.show({ message: "All local data deleted" });
      navigate("/", { replace: true });
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <UpdateBanner />
      <PageHeader title="Settings" back="/" />
      <div className="stack">
        <div className="card stack">
          <Switch
            label="Keep screen awake during games"
            description={isWakeLockSupported() ? undefined : "Not supported on this browser"}
            checked={settings.keepScreenAwakeEnabled}
            onChange={(v) => void updateAppSettings({ keepScreenAwakeEnabled: v })}
          />
          <div className="field">
            <span className="label" id="sort-label">
              Player order during games
            </span>
            <div className="segmented" role="group" aria-labelledby="sort-label">
              {PLAYER_SORTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={settings.preferredPlayerSort === s}
                  onClick={() => void updateAppSettings({ preferredPlayerSort: s })}
                >
                  {SORT_LABELS[s]}
                </button>
              ))}
            </div>
            <span className="hint">Jersey order is recommended — rows never move during play.</span>
          </div>
          <div className="field">
            <span className="label" id="view-label">
              Live game player layout
            </span>
            <div className="segmented" role="group" aria-labelledby="view-label">
              {LIVE_ROSTER_VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={settings.liveRosterView === v}
                  onClick={() => void updateAppSettings({ liveRosterView: v })}
                >
                  {v === "grid" ? "Grid (numbers)" : "List (names)"}
                </button>
              ))}
            </div>
            <span className="hint">You can also switch with the GRID / LIST button during a game.</span>
          </div>
          <NumberStepper
            label="Default players on field (new teams)"
            value={settings.defaultExpectedPlayersOnField}
            onChange={(n) => void updateAppSettings({ defaultExpectedPlayersOnField: n })}
            min={1}
            max={30}
          />
        </div>

        <h2 className="section-title">Data on this device</h2>
        <div className="card stack">
          <p className="muted small" style={{ margin: 0 }}>
            Everything is stored only on this device. Export a backup to move it to another device or keep a copy.
          </p>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <button type="button" className="btn btn-primary grow" onClick={() => void exportAll(false)}>
              ↓ Export all data
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void exportAll(true)}>
              Share
            </button>
          </div>
          <span ref={importRef} id="import" />
          <button type="button" className="btn btn-secondary btn-block" onClick={() => fileRef.current?.click()} data-testid="import-backup">
            Import backup…
          </button>
          <input ref={fileRef} type="file" hidden accept=".json,application/json" onChange={(e) => void onFile(e.target.files?.[0])} />
          <button type="button" className="btn btn-danger-outline btn-block" onClick={() => setClearOpen(true)}>
            Clear all local data
          </button>
        </div>

        <h2 className="section-title">App</h2>
        <div className="card stack">
          <div className="row-between">
            <span>Offline</span>
            <strong>{sw.offlineReady ? "✓ Offline ready" : import.meta.env.DEV ? "Dev mode" : "Preparing…"}</strong>
          </div>
          <div className="row-between">
            <span>Version</span>
            <strong>{APP_VERSION}</strong>
          </div>
          {install.canInstall && (
            <button type="button" className="btn btn-primary btn-block" onClick={() => void install.install()}>
              Install app
            </button>
          )}
          {install.showIosHint && (
            <p className="muted small" style={{ margin: 0 }}>
              To install on iPhone/iPad: tap Share, then “Add to Home Screen”.
            </p>
          )}
        </div>
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Import backup?">
        {preview && (
          <>
            <p>
              Exported {new Date(preview.backup.exportedAt).toLocaleString()} (app {preview.backup.appVersion})
            </p>
            <ul className="kbd-list">
              <li>{preview.counts.teams} teams</li>
              <li>{preview.counts.players} players</li>
              <li>{preview.counts.games} games</li>
              <li>{preview.counts.plays} plays</li>
            </ul>
            {preview.integrityIssues.length > 0 && (
              <p className="alert alert-danger">This backup has problems and cannot be imported: {preview.integrityIssues[0]}</p>
            )}
            <p className="alert alert-warn">
              Importing <strong>replaces all data on this device</strong>
              {preview.conflictingIds > 0 ? ` (${preview.conflictingIds} records overlap with existing data)` : ""}. Export your
              current data first if you might need it.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => void exportAll(false)}>
                ↓ Export current data first
              </button>
              <button
                type="button"
                className="btn btn-danger btn-lg"
                disabled={busy || preview.integrityIssues.length > 0}
                onClick={() => void doReplace()}
              >
                Replace local data
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={clearOpen} onClose={() => setClearOpen(false)} title="Delete all local data?">
        <p>This removes all teams, rosters, and games from this device.</p>
        <p className="alert alert-warn">Export a backup first.</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void exportAll(false)}>
            ↓ Export backup
          </button>
          <button type="button" className="btn btn-danger btn-lg" onClick={() => void doClear()} disabled={busy}>
            DELETE EVERYTHING
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setClearOpen(false)}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
