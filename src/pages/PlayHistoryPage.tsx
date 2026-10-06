import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EmptyState, Loading, PageHeader } from "../components/ui";
import { quarterLabel } from "../domain/enums";
import type { PlayView } from "../domain/selectors/getGameState";
import type { QuarterSnapshot } from "../domain/models";
import { useGameView } from "../hooks/useActiveGame";
import { formatTime } from "../utils/dates";

type Entry = { kind: "play"; key: number; pv: PlayView } | { kind: "quarter"; key: number; snap: QuarterSnapshot };

export function playLine(pv: PlayView): { text: string; warn: boolean } {
  if (pv.play.voided) return { text: "VOIDED", warn: false };
  const players = `${pv.participantCount} ${pv.participantCount === 1 ? "player" : "players"}`;
  const counts = pv.play.countsForMpr ? "Counts" : "Does not count";
  return { text: `${players} · ${counts}${pv.countMismatch ? " ⚠" : ""}`, warn: pv.countMismatch };
}

export default function PlayHistoryPage() {
  const { gameId = "" } = useParams();
  const { data, view } = useGameView(gameId);
  const [newestFirst, setNewestFirst] = useState(true);

  if (view === undefined) return <Loading />;
  if (!view || !data)
    return (
      <div className="page">
        <PageHeader title="Game not found" back="/" />
      </div>
    );

  const entries: Entry[] = [
    ...view.plays.map((pv, i): Entry => ({ kind: "play", key: pv.play.playNumber + i / 10000, pv })),
    ...view.quarterSnapshots.map((snap): Entry => ({ kind: "quarter", key: snap.lastPlayNumber + 0.9999, snap })),
  ].sort((a, b) => a.key - b.key);
  if (newestFirst) entries.reverse();

  const back = view.game.status === "active" ? `/games/${gameId}/live` : `/games/${gameId}/summary`;

  return (
    <div className="page">
      <PageHeader
        title="Play History"
        subtitle={`${view.plays.filter((p) => !p.play.voided).length} plays recorded`}
        back={back}
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewestFirst((v) => !v)}>
            {newestFirst ? "Newest first" : "Oldest first"}
          </button>
        }
      />
      {entries.length === 0 ? (
        <EmptyState title="No plays recorded yet." />
      ) : (
        <ul className="list" data-testid="history-list">
          {entries.map((e) =>
            e.kind === "quarter" ? (
              <li key={`q${e.snap.endedQuarter}`} className="list-item" style={{ background: "var(--surface-2)", cursor: "default" }}>
                <span className="grow" style={{ fontWeight: 800 }}>
                  End {quarterLabel(e.snap.endedQuarter)}
                  <span className="list-item-sub" style={{ display: "block", fontWeight: 500 }}>
                    after Play {e.snap.lastPlayNumber} · {formatTime(e.snap.endedAt)}
                  </span>
                </span>
              </li>
            ) : (
              <li key={e.pv.play.id}>
                <Link className="list-item" to={`/games/${gameId}/history/${e.pv.play.id}`} data-testid="history-row">
                  <span className="grow" style={e.pv.play.voided ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
                    <span className="list-item-title" style={{ display: "block" }}>
                      Play {e.pv.play.playNumber} · {quarterLabel(e.pv.play.quarter)}
                    </span>
                    <span
                      className="list-item-sub"
                      style={{ display: "block", color: playLine(e.pv).warn ? "var(--warn)" : undefined, fontWeight: playLine(e.pv).warn ? 700 : undefined }}
                    >
                      {playLine(e.pv).text}
                    </span>
                    {!e.pv.play.voided && e.pv.play.nonCountingReason && (
                      <span className="list-item-sub" style={{ display: "block" }}>
                        {e.pv.play.nonCountingReason}
                      </span>
                    )}
                  </span>
                  {e.pv.play.voided ? (
                    <span className="badge badge-neutral">VOIDED</span>
                  ) : e.pv.play.revision > 1 ? (
                    <span className="badge badge-neutral">EDITED</span>
                  ) : null}
                  <span className="chev">›</span>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
