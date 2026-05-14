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
import { mockService, subscribe as subscribeMock } from "./mockService";
import { SupabaseService } from "./supabaseService";
import { supabase, supabaseEnabled } from "./supabaseClient";
import type { DataService } from "./service";

type Ctx = {
  service: DataService;
  version: number;
  loaded: boolean;
};

const DataContext = createContext<Ctx | null>(null);

// Singleton SupabaseService — created once at module load if configured.
const supabaseService =
  supabaseEnabled && supabase ? new SupabaseService(supabase) : null;

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
