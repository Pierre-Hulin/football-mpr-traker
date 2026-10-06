import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { EmptyState, Loading, PageHeader } from "../components/ui";
import { useToast } from "../components/Toast/ToastProvider";
import { listTeamsWithStats, type TeamListItem } from "../domain/selectors/queries";
import { importTeamFile, parseTeamFile } from "../domain/services/backupService";
import { toUserMessage } from "../domain/errors";
import { formatGameDate } from "../utils/dates";
import { readFileAsText } from "../utils/fileDownload";

function TeamRow({ item }: { item: TeamListItem }) {
  return (
    <li>
      <Link className="list-item" to={`/teams/${item.team.id}`}>
        <span className="grow">
          <span className="list-item-title" style={{ display: "block" }}>
            {item.team.name}
          </span>
          <span className="list-item-sub">
            {[
              item.team.seasonLabel,
              `${item.rosterCount} players`,
              item.lastGameDate ? `Last game ${formatGameDate(item.lastGameDate)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="chev">›</span>
      </Link>
    </li>
  );
}

export default function TeamsPage() {
  const teams = useLiveQuery(() => listTeamsWithStats(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const navigate = useNavigate();

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const team = await importTeamFile(parseTeamFile(await readFileAsText(file)));
      toast.show({ message: `Imported ${team.name}` });
      navigate(`/teams/${team.id}`);
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error", duration: 6000 });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!teams) return <Loading />;
  const active = teams.filter((t) => !t.team.archivedAt);
  const archived = teams.filter((t) => t.team.archivedAt);

  return (
    <div className="page">
      <PageHeader title="Teams" back="/" />
      <div className="stack">
        <Link className="btn btn-primary btn-lg btn-block" to="/teams/new">
          + New Team
        </Link>
        {active.length === 0 ? (
          <EmptyState title="No teams yet">Create a team to begin tracking minimum plays.</EmptyState>
        ) : (
          <ul className="list">
            {active.map((t) => (
              <TeamRow key={t.team.id} item={t} />
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-secondary btn-block" onClick={() => fileRef.current?.click()}>
          Import team file (.json)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => void onImportFile(e.target.files?.[0])}
        />
        {archived.length > 0 && (
          <details className="disclosure">
            <summary>Archived teams ({archived.length})</summary>
            <ul className="list">
              {archived.map((t) => (
                <TeamRow key={t.team.id} item={t} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
