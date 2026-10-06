import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Loading } from "../components/ui";
import { UpdateBanner } from "../components/UpdateBanner";
import { quarterLabel } from "../domain/enums";
import { gameTitle, listTeamsWithStats } from "../domain/selectors/queries";
import { useActiveGame } from "../hooks/useActiveGame";
import { useServiceWorkerState } from "../pwa/registerSW";

// Auto-resume only on the very first render after a cold start / reload.
let coldStartHandled = false;

export default function HomePage() {
  const active = useActiveGame();
  const teams = useLiveQuery(() => listTeamsWithStats(), []);
  const navigate = useNavigate();
  const sw = useServiceWorkerState();

  useEffect(() => {
    if (active === undefined || coldStartHandled) return;
    coldStartHandled = true;
    if (active) navigate(`/games/${active.game.id}/live`, { replace: false });
  }, [active, navigate]);

  if (active === undefined || teams === undefined) return <Loading />;

  const offlineNote = !sw.offlineReady && !import.meta.env.DEV && (
    <p className="muted small center">Open once while online before relying on offline use.</p>
  );

  return (
    <div className="page">
      <UpdateBanner />
      {active ? (
        <>
          <div className="card card-hero stack" style={{ marginBottom: "var(--space-5)" }}>
            <div className="section-title" style={{ margin: 0 }}>
              Game in progress
            </div>
            <div style={{ fontSize: "1.35rem", fontWeight: 800 }}>{gameTitle(active.game, active.team)}</div>
            <div className="muted" style={{ fontWeight: 700 }}>
              {quarterLabel(active.game.currentQuarter)} · Next Play {active.game.nextPlayNumber}
            </div>
            <Link className="btn btn-primary btn-lg btn-block" to={`/games/${active.game.id}/live`} data-testid="resume">
              RESUME GAME
            </Link>
          </div>
          <ul className="list">
            <li>
              <Link className="list-item" to="/games/new">
                <span className="grow list-item-title">New Game</span>
                <span className="chev">›</span>
              </Link>
            </li>
            <HomeLinks />
          </ul>
        </>
      ) : teams.length === 0 ? (
        <FirstRun />
      ) : (
        <>
          <h1 style={{ marginTop: "var(--space-4)" }}>Minimum Play Tracker</h1>
          <Link className="btn btn-primary btn-lg btn-block" to="/games/new" style={{ margin: "var(--space-4) 0" }}>
            START NEW GAME
          </Link>
          <ul className="list">
            <HomeLinks />
          </ul>
        </>
      )}
      {offlineNote}
    </div>
  );
}

function HomeLinks() {
  return (
    <>
      <li>
        <Link className="list-item" to="/teams">
          <span className="grow list-item-title">Teams</span>
          <span className="chev">›</span>
        </Link>
      </li>
      <li>
        <Link className="list-item" to="/games">
          <span className="grow list-item-title">Past Games</span>
          <span className="chev">›</span>
        </Link>
      </li>
      <li>
        <Link className="list-item" to="/settings">
          <span className="grow">
            <span className="list-item-title">Settings</span>
            <span className="list-item-sub" style={{ display: "block" }}>
              Import / export backup
            </span>
          </span>
          <span className="chev">›</span>
        </Link>
      </li>
    </>
  );
}

function FirstRun() {
  return (
    <div className="stack" style={{ marginTop: "var(--space-5)" }}>
      <h1>Minimum Play Tracker</h1>
      <p style={{ fontSize: "1.1rem" }}>Track minimum plays quickly and offline.</p>
      <ol className="kbd-list" style={{ fontSize: "1.05rem" }}>
        <li>Add or import your roster</li>
        <li>Start a game</li>
        <li>Mark who's on the field</li>
        <li>Record each play</li>
      </ol>
      <Link className="btn btn-primary btn-lg btn-block" to="/teams/new" data-testid="create-team">
        CREATE TEAM
      </Link>
      <Link className="btn btn-secondary btn-lg btn-block" to="/settings#import">
        IMPORT BACKUP
      </Link>
      <p className="muted small center">Works offline after first load. No account needed.</p>
    </div>
  );
}
