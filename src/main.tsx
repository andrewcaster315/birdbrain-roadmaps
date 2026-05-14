import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { DataProvider } from "./data/DataContext";
import "./global.css";

// Sentry — only initializes when a DSN is configured. Without one, this is
// a no-op and adds no overhead beyond the import.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    // Keep tracing modest — we just want to know when things break and how
    // often, not record every interaction.
    tracesSampleRate: 0.1,
    // Don't capture noisy console output; rely on actual exceptions.
    sendDefaultPii: false,
  });
}

// A minimal fallback when the React tree crashes. Better than a blank page.
const Fallback = () => (
  <div
    style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: 24,
      color: "#1f3864",
      textAlign: "center",
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}
  >
    <div style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 22, margin: "0 0 8px 0" }}>
        Something went wrong.
      </h1>
      <p style={{ color: "#475569", fontSize: 14, margin: "0 0 16px 0" }}>
        The app hit an unexpected error. We've been notified. Try reloading.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: "#1f3864",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "10px 16px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Reload
      </button>
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<Fallback />}>
      <BrowserRouter>
        <AuthProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </AuthProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
