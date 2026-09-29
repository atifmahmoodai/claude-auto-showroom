import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { api, errorText, setUnauthorizedHandler } from "./api/client";
import { App } from "./App";
import { applySite } from "./config";
import type { SiteSettings } from "../../shared/schemas";
import type { Branch } from "./types";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: (n, e) => n < 2 && !(e as { status?: number }).status },
  },
});
// A revoked or expired session sends the user back to the login screen.
setUnauthorizedHandler(() => queryClient.setQueryData(["me"], null));

const root = createRoot(document.getElementById("root")!);

async function start() {
  try {
    // Business name, currency and branches are needed by nearly every page, so they load first.
    const { site, branches } = await api<{ site: SiteSettings; branches: Branch[] }>("/public/site");
    applySite(site, branches);
  } catch (e) {
    root.render(
      <div className="container section">
        <div className="card empty">
          <h1>We'll be right back</h1>
          <p className="muted">{errorText(e)}</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </div>,
    );
    return;
  }
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void start();
