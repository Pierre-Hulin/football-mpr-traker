import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, TextField } from "../components/ui";
import { createTeam } from "../domain/commands/createTeam";
import { toUserMessage } from "../domain/errors";
import { useAppSettings } from "../hooks/useAppSettings";

export default function NewTeamPage() {
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const settings = useAppSettings();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Team name is required");
      return;
    }
    setBusy(true);
    try {
      const team = await createTeam({
        name,
        seasonLabel: season,
        settings: { defaultExpectedPlayersOnField: settings.defaultExpectedPlayersOnField },
      });
      navigate(`/teams/${team.id}/roster`, { replace: true });
    } catch (err) {
      setError(toUserMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="New Team" back />
      <form className="stack" onSubmit={submit} noValidate>
        <TextField
          label="Team name"
          value={name}
          onChange={(v) => {
            setName(v);
            setError(undefined);
          }}
          error={error}
          autoFocus
          autoComplete="off"
          placeholder="e.g. Trojans 10U"
          required
        />
        <TextField label="Season (optional)" value={season} onChange={setSeason} placeholder="e.g. Fall 2026" autoComplete="off" />
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          CREATE TEAM
        </button>
      </form>
    </div>
  );
}
