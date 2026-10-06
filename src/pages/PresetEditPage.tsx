import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Loading, PageHeader } from "../components/ui";
import { Modal } from "../components/Modal/Modal";
import { useToast } from "../components/Toast/ToastProvider";
import { teamRepository } from "../db/repositories/teamRepository";
import { presetRepository } from "../db/repositories/presetRepository";
import { createPreset, deletePreset, updatePreset } from "../domain/commands/presets";
import { getTeamSettingsOrDefault } from "../domain/commands/createTeam";
import { getTeamRoster } from "../domain/selectors/queries";
import { PRESET_TYPE_LABELS, PRESET_TYPES, type PresetType } from "../domain/enums";
import { toUserMessage } from "../domain/errors";

export default function PresetEditPage() {
  const { teamId = "", presetId = "new" } = useParams();
  const isNew = presetId === "new";
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState<PresetType>("offense");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const data = useLiveQuery(async () => {
    const team = await teamRepository.get(teamId);
    if (!team) return null;
    const [roster, settings] = await Promise.all([getTeamRoster(teamId), getTeamSettingsOrDefault(teamId)]);
    const preset = isNew ? undefined : await presetRepository.get(presetId);
    const members = preset ? await presetRepository.listMembers(preset.id) : [];
    return { team, roster, settings, preset, members };
  }, [teamId, presetId]);

  useEffect(() => {
    if (!data || loaded) return;
    if (data.preset) {
      setName(data.preset.name);
      setType(data.preset.type);
      setSelected(new Set(data.members.map((m) => m.playerId)));
    } else {
      setName(PRESET_TYPE_LABELS.offense);
    }
    setLoaded(true);
  }, [data, loaded]);

  if (data === undefined || !loaded) return <Loading />;
  if (data === null || (!isNew && !data.preset))
    return (
      <div className="page">
        <PageHeader title="Preset not found" back={`/teams/${teamId}/presets`} />
      </div>
    );

  const expected = data.settings.defaultExpectedPlayersOnField;
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const onTypeChange = (t: PresetType) => {
    // Keep the name in sync while it is still a default label.
    if (!name.trim() || name === PRESET_TYPE_LABELS[type]) setName(t === "custom" ? "" : PRESET_TYPE_LABELS[t]);
    setType(t);
  };

  const save = async () => {
    setBusy(true);
    try {
      const input = { name, type, playerIds: [...selected] };
      if (isNew) await createPreset(teamId, input);
      else await updatePreset(presetId, input);
      toast.show({ message: `${name.trim()} saved · ${selected.size} players` });
      navigate(`/teams/${teamId}/presets`, { replace: true });
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error" });
      setBusy(false);
    }
  };

  const remove = async () => {
    await deletePreset(presetId);
    toast.show({ message: "Preset deleted" });
    navigate(`/teams/${teamId}/presets`, { replace: true });
  };

  return (
    <div className="page" style={{ paddingBottom: 120 }}>
      <PageHeader title={isNew ? "New Preset" : `Edit ${data.preset?.name}`} back={`/teams/${teamId}/presets`} />
      <div className="stack">
        <div className="field">
          <label htmlFor="preset-type">Type</label>
          <select id="preset-type" className="select" value={type} onChange={(e) => onTypeChange(e.target.value as PresetType)}>
            {PRESET_TYPES.map((t) => (
              <option key={t} value={t}>
                {PRESET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="preset-name">Name</label>
          <input id="preset-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="row-between">
          <h2 className="section-title" style={{ margin: 0 }}>
            Players
          </h2>
          <div className="row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        </div>
        <ul className="list">
          {data.roster.map((p) => {
            const on = selected.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="list-item"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(p.id)}
                  style={on ? { background: "var(--row-in-bg)", boxShadow: "inset 6px 0 0 var(--row-in-bar)" } : undefined}
                >
                  <span className="jersey" style={{ fontSize: "1.3rem" }}>
                    #{p.jerseyNumber}
                  </span>
                  <span className="grow list-item-title">{p.displayName}</span>
                  <span style={{ fontWeight: 900, minWidth: "3rem", textAlign: "right" }}>{on ? "✓ IN" : "—"}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {!isNew && (
          <button type="button" className="btn btn-danger-outline btn-block" onClick={() => setConfirmDelete(true)}>
            Delete preset
          </button>
        )}
      </div>

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
          <span style={{ fontWeight: 800, minWidth: "7rem" }} aria-live="polite">
            {selected.size} selected
            {selected.size !== expected && <span className="muted small"> (field: {expected})</span>}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-lg grow"
            disabled={busy || !name.trim()}
            onClick={() => void save()}
            data-testid="save-preset"
          >
            SAVE PRESET
          </button>
        </div>
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${data.preset?.name}?`}>
        <p>Games already recorded are not affected.</p>
        <div className="modal-actions split">
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger btn-lg" onClick={() => void remove()}>
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
