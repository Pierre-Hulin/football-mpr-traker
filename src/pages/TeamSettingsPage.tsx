import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Loading, NumberStepper, PageHeader } from "../components/ui";
import { useToast } from "../components/Toast/ToastProvider";
import { teamRepository } from "../db/repositories/teamRepository";
import { getTeamSettingsOrDefault, updateTeamSettings } from "../domain/commands/createTeam";
import type { TeamSettings } from "../domain/models";
import { toUserMessage } from "../domain/errors";
import { RulesFields, type RulesValue } from "./GameSetupPage";

export default function TeamSettingsPage() {
  const { teamId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [value, setValue] = useState<RulesValue | null>(null);

  const data = useLiveQuery(async () => {
    const team = await teamRepository.get(teamId);
    return team ? { team, settings: await getTeamSettingsOrDefault(teamId) } : null;
  }, [teamId]);

  useEffect(() => {
    if (data && !value) {
      const s: TeamSettings = data.settings;
      setValue({
        requiredPlays: s.defaultRequiredPlays,
        expectedPlayersOnField: s.defaultExpectedPlayersOnField,
        mprDeadlineQuarter: s.defaultMprDeadlineQuarter ?? 4,
        countsSpecialTeams: s.defaultCountsSpecialTeams,
        countsPat: s.defaultCountsPat,
        countsAcceptedPenaltyPlays: s.defaultCountsAcceptedPenaltyPlays,
      });
    }
  }, [data, value]);

  if (data === undefined || (data && !value)) return <Loading />;
  if (data === null || !value)
    return (
      <div className="page">
        <PageHeader title="Team not found" back="/teams" />
      </div>
    );

  const save = async () => {
    try {
      await updateTeamSettings(teamId, {
        defaultRequiredPlays: value.requiredPlays,
        defaultExpectedPlayersOnField: value.expectedPlayersOnField,
        defaultMprDeadlineQuarter: value.mprDeadlineQuarter,
        defaultCountsSpecialTeams: value.countsSpecialTeams,
        defaultCountsPat: value.countsPat,
        defaultCountsAcceptedPenaltyPlays: value.countsAcceptedPenaltyPlays,
      });
      toast.show({ message: "Team defaults saved" });
      navigate(`/teams/${teamId}`, { replace: true });
    } catch (err) {
      toast.show({ message: toUserMessage(err), tone: "error" });
    }
  };

  return (
    <div className="page">
      <PageHeader title="Team Defaults" subtitle={data.team.name} back={`/teams/${teamId}`} />
      <p className="muted">Used as the starting values for new games. Each game can still override them. Existing games are not changed.</p>
      <div className="stack">
        <NumberStepper
          label="Minimum required plays"
          value={value.requiredPlays}
          onChange={(n) => setValue({ ...value, requiredPlays: n })}
          max={200}
        />
        <NumberStepper
          label="Players on field"
          value={value.expectedPlayersOnField}
          onChange={(n) => setValue({ ...value, expectedPlayersOnField: n })}
          min={1}
          max={30}
        />
        <RulesFields value={value} onChange={setValue} open />
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void save()}>
          SAVE DEFAULTS
        </button>
      </div>
    </div>
  );
}
