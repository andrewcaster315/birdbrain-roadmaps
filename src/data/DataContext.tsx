// Wires a DataService implementation to React.
// If Supabase env vars are present at build time, uses the SupabaseService;
// otherwise falls back to the localStorage mock for local dev.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as Sentry from "@sentry/react";
import { mockService, subscribe as subscribeMock } from "./mockService";
import { SupabaseService } from "./supabaseService";
import { supabase, supabaseEnabled } from "./supabaseClient";
import type { DataService } from "./service";
import { pushToast } from "../components/Toaster";

type Ctx = {
  service: DataService;
  version: number;
  loaded: boolean;
};

const DataContext = createContext<Ctx | null>(null);

// Singleton SupabaseService — created once at module load if configured.
const supabaseService =
  supabaseEnabled && supabase ? new SupabaseService(supabase) : null;

// Surface background save failures as a toast (instead of the default
// browser alert). The service does optimistic updates, so without this the
// user has no visible signal when a write fails server-side.
//
// Raw Postgres error messages can leak schema/RLS structure — keep the full
// message in console + Sentry for debugging, but show the user a generic
// version with hints for the common cases.
const userFacingError = (message: string): string => {
  const m = message.toLowerCase();
  if (
    m.includes("row-level security") ||
    m.includes("policy") ||
    m.includes("permission")
  ) {
    return "You don't have permission to make that change.";
  }
  if (m.includes("violates check constraint") && m.includes("len")) {
    return "That value is too long. Try shortening it.";
  }
  if (m.includes("duplicate key") || m.includes("unique constraint")) {
    return "That name is already in use. Pick a different one.";
  }
  if (m.includes("foreign key") || m.includes("violates")) {
    return "That change conflicts with related data. Refresh and try again.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Network problem — check your connection and try again.";
  }
  return "Couldn't save your change. Try again, or refresh if it persists.";
};

if (supabaseService) {
  supabaseService.onError = (message) => {
    console.error("[SupabaseService]", message);
    Sentry.captureMessage(message, "error");
    pushToast({
      kind: "error",
      message: userFacingError(message),
    });
  };
}

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(!supabaseService);

  useEffect(() => {
    if (supabaseService) {
      const unsub = supabaseService.subscribeListener(() => setVersion((v) => v + 1));
      supabaseService.ready.then(() => {
        setLoaded(true);
        setVersion((v) => v + 1);
      });
      return () => {
        unsub();
      };
    } else {
      const unsub = subscribeMock(() => setVersion((v) => v + 1));
      return () => {
        unsub();
      };
    }
  }, []);

  const service: DataService = supabaseService ?? mockService;
  return (
    <DataContext.Provider value={{ service, version, loaded }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
};
