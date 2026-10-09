import { createBrowserRouter, Outlet, ScrollRestoration } from "react-router-dom";
import HomePage from "../pages/HomePage";
import TeamsPage from "../pages/TeamsPage";
import NewTeamPage from "../pages/NewTeamPage";
import TeamDetailPage from "../pages/TeamDetailPage";
import RosterPage from "../pages/RosterPage";
import RosterImportPage from "../pages/RosterImportPage";
import PresetsPage from "../pages/PresetsPage";
import PresetEditPage from "../pages/PresetEditPage";
import TeamSettingsPage from "../pages/TeamSettingsPage";
import NewGamePage from "../pages/NewGamePage";
import GameSetupPage from "../pages/GameSetupPage";
import LiveGamePage from "../pages/LiveGamePage";
import ManagePlayersPage from "../pages/ManagePlayersPage";
import PlayHistoryPage from "../pages/PlayHistoryPage";
import PlayDetailPage from "../pages/PlayDetailPage";
import MprSummaryPage from "../pages/MprSummaryPage";
import QuarterBreakdownPage from "../pages/QuarterBreakdownPage";
import GameSummaryPage from "../pages/GameSummaryPage";
import ReportPage from "../pages/ReportPage";
import PastGamesPage from "../pages/PastGamesPage";
import SettingsPage from "../pages/SettingsPage";
import NotFoundPage from "../pages/NotFoundPage";

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/teams", element: <TeamsPage /> },
      { path: "/teams/new", element: <NewTeamPage /> },
      { path: "/teams/:teamId", element: <TeamDetailPage /> },
      { path: "/teams/:teamId/roster", element: <RosterPage /> },
      { path: "/teams/:teamId/import", element: <RosterImportPage /> },
      { path: "/teams/:teamId/presets", element: <PresetsPage /> },
      { path: "/teams/:teamId/presets/:presetId", element: <PresetEditPage /> },
      { path: "/teams/:teamId/settings", element: <TeamSettingsPage /> },
      { path: "/games", element: <PastGamesPage /> },
      { path: "/games/new", element: <NewGamePage /> },
      { path: "/games/:gameId/setup", element: <GameSetupPage /> },
      { path: "/games/:gameId/live", element: <LiveGamePage /> },
      { path: "/games/:gameId/players", element: <ManagePlayersPage /> },
      { path: "/games/:gameId/history", element: <PlayHistoryPage /> },
      { path: "/games/:gameId/history/:playId", element: <PlayDetailPage /> },
      { path: "/games/:gameId/mpr", element: <MprSummaryPage /> },
      { path: "/games/:gameId/quarters", element: <QuarterBreakdownPage /> },
      { path: "/games/:gameId/summary", element: <GameSummaryPage /> },
      { path: "/games/:gameId/report", element: <ReportPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
