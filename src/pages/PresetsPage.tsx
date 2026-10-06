import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { EmptyState, Loading, PageHeader } from "../components/ui";
import { useToast } from "../components/Toast/ToastProvider";
import { teamRepository } from "../db/repositories/teamRepository";
import { getTeamPresets } from "../domain/selectors/queries";
import { movePreset } from "../domain/commands/presets";
import { PRESET_TYPE_LABELS } from "../domain/enums";
import { toUserMessage } from "../domain/errors";

export default function PresetsPage() {
  const { teamId = "" } = useParams();
  const toast = useToast();
  const data = useLiveQuery(async () => {
    const team = await teamRepository.get(teamId);
    return team ? { team, presets: await getTeamPresets(teamId) } : null;
  }, [teamId]);

  if (data === undefined) return <Loading />;
  if (data === null)
    return (
      <div className="page">
        <PageHeader title="Team not found" back="/teams" />
      </div>
    );

  const move = (id: string, dir: -1 | 1) =>
    movePreset(id, dir).catch((e) => toast.show({ message: toUserMessage(e), tone: "error" }));

  return (
    <div className="page">
      <PageHeader title="Lineup Presets" subtitle={data.team.name} back={`/teams/${teamId}`} />
      <p className="muted">
        Presets load a group like Offense or Kickoff with one tap during the game. Absent or injured players are skipped
        automatically.
      </p>
      <div className="stack">
        <Link className="btn btn-primary btn-lg btn-block" to={`/teams/${teamId}/presets/new`} data-testid="new-preset">
          + New Preset
        </Link>
        {data.presets.length === 0 ? (
          <EmptyState title="No lineup presets yet">Presets are optional — you can still pick players one by one.</EmptyState>
        ) : (
          <ul className="list">
            {data.presets.map(({ preset, members }, i) => (
              <li key={preset.id} className="row" style={{ flexWrap: "nowrap" }}>
                <Link className="list-item grow" to={`/teams/${teamId}/presets/${preset.id}`}>
                  <span className="grow">
                    <span className="list-item-title" style={{ display: "block" }}>
                      {preset.name}
                    </span>
                    <span className="list-item-sub">
                      {members.length} players
                      {preset.type !== "custom" && preset.name !== PRESET_TYPE_LABELS[preset.type]
                        ? ` · ${PRESET_TYPE_LABELS[preset.type]}`
                        : ""}
                    </span>
                  </span>
                  <span className="chev">›</span>
                </Link>
                <div className="row" style={{ flexWrap: "nowrap", paddingRight: "var(--space-2)" }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Move ${preset.name} up`}
                    disabled={i === 0}
                    onClick={() => void move(preset.id, -1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label={`Move ${preset.name} down`}
                    disabled={i === data.presets.length - 1}
                    onClick={() => void move(preset.id, 1)}
                  >
                    ▼
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
