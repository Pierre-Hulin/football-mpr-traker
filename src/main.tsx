import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/globals.css";
import "./styles/print.css";
import App from "./app/App";
import { initializeDatabase } from "./db/migrations";
import { registerServiceWorker } from "./pwa/registerSW";
import { toUserMessage } from "./domain/errors";

function StorageUnavailable({ message }: { message: string }) {
  return (
    <div className="page">
      <div className="card stack" role="alert">
        <h1>Local storage is unavailable.</h1>
        <p>This app requires browser storage to safely record a game.</p>
        <p>Try leaving Private Browsing or enabling site storage, then reload.</p>
        <p className="muted small">{message}</p>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    </div>
  );
}

async function boot() {
  const root = createRoot(document.getElementById("root")!);
  try {
    await initializeDatabase();
    // Ask the browser not to evict our data under storage pressure.
    void navigator.storage?.persist?.().catch(() => undefined);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (err) {
    root.render(<StorageUnavailable message={toUserMessage(err)} />);
  }
  void registerServiceWorker();
}

void boot();
