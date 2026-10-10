import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import "../styles/home.css";
import { Loading } from "../components/ui";
import { UpdateBanner } from "../components/UpdateBanner";
import { InstallPrompt } from "../components/InstallPrompt/InstallPrompt";
import { quarterLabel } from "../domain/enums";
import { gameTitle, listTeamsWithStats } from "../domain/selectors/queries";
import { useActiveGame } from "../hooks/useActiveGame";
import { BUILD_LABEL, useServiceWorkerState } from "../pwa/registerSW";

// Auto-resume only on the very first render after a cold start / reload.
let coldStartHandled = false;

export default function HomePage() {
  const active = useActiveGame();
  const teams = useLiveQuery(() => listTeamsWithStats(), []);
  const navigate = useNavigate();
  const sw = useServiceWorkerState();
  const [installBarHeight, setInstallBarHeight] = useState(0);
  const onInstallHeight = useCallback((px: number) => setInstallBarHeight(px), []);

  useEffect(() => {
    if (active === undefined || coldStartHandled) return;
    coldStartHandled = true;
    if (active) navigate(`/games/${active.game.id}/live`, { replace: false });
  }, [active, navigate]);

  if (active === undefined || teams === undefined) return <Loading />;

  return (
    <div
      className={`home ${installBarHeight ? "has-install-bar" : ""}`}
      style={installBarHeight ? ({ "--install-bar-h": `${installBarHeight}px` } as React.CSSProperties) : undefined}
    >
      <header className="home-hero">
        <div className="home-hero-inner">
          <img src="/icons/icon-192.png" alt="" width={56} height={56} />
          <div>
            <h1>Minimum Play Tracker</h1>
            <p>Every player gets their plays. Fast, offline tracking from the sideline.</p>
          </div>
        </div>
      </header>

      <main className="home-body">
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
            <Link className="btn btn-primary btn-lg btn-block" to="/games/new" style={{ marginBottom: "var(--space-4)" }}>
              START NEW GAME
            </Link>
            <ul className="list">
              <HomeLinks />
            </ul>
          </>
        )}
        {!sw.offlineReady && !import.meta.env.DEV && (
          <p className="muted small center" style={{ marginTop: "var(--space-4)" }}>
            Open once while online before relying on offline use.
          </p>
        )}
        <p className="home-version" data-testid="app-version">
          {BUILD_LABEL}
        </p>
      </main>

      {/* Never nag during a game. */}
      {!active && <InstallPrompt onHeightChange={onInstallHeight} />}
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
    <div className="stack">
      <div className="card stack">
        <h2 style={{ margin: 0 }}>Get ready in a minute</h2>
        <ol className="home-steps">
          <li>Add or import your roster</li>
          <li>Start a game</li>
          <li>Mark who's on the field</li>
          <li>Record each play</li>
        </ol>
      </div>
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
