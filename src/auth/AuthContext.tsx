// Auth context. In production (Supabase configured), uses Supabase Auth's
// magic-link flow + onAuthStateChange. In local dev (no env vars), falls back
// to the mock magic-link flow.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "../types";
import { mockService } from "../data/mockService";
import { supabase, supabaseEnabled } from "../data/supabaseClient";

const STORAGE_KEY = "roadmapping-tool/auth/v4";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type MockSession = { userId: string; expiresAt: number };

const loadMockSession = (): MockSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as MockSession;
    if (s.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
};
const saveMockSession = (s: MockSession) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
const clearMockSession = () => localStorage.removeItem(STORAGE_KEY);

type Ctx = {
  currentUser: User | null;
  isAuthenticated: boolean;
  // True once the initial session check has finished. Until then we don't
  // know whether the user is signed in, so the app should show a loading
  // state instead of rendering either the sign-in screen or the app shell.
  authResolved: boolean;
  expiresAt: number | null;
  isMockAuth: boolean;
  requestMagicLink: (
    email: string
  ) => Promise<{ email: string; token: string | null }>;
  consumeMagicLink: (token: string) => Promise<User>;
  signOut: () => Promise<void>;
  // Update the cached current user — used by flows that mutate the user
  // row (e.g. accepting terms) so the gate condition recomputes without a
  // full refresh.
  setCurrentUser: (user: User) => void;
};

const AuthContext = createContext<Ctx | null>(null);
const pendingMockTokens = new Map<string, { email: string; expiresAt: number }>();

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [authResolved, setAuthResolved] = useState(false);

  useEffect(() => {
    if (supabaseEnabled && supabase) {
      const sb = supabase;
      let cancelled = false;
      // Retry budget for the brief race condition where the handle_new_user
      // trigger hasn't completed yet. If we still can't find the row after
      // ~3 attempts (~2 seconds), the session is dangling — sign out so we
      // don't loop network requests forever.
      const MAX_ATTEMPTS = 3;
      const fetchUser = async (attempt = 0) => {
        if (cancelled) return;
        const {
          data: { session },
        } = await sb.auth.getSession();
        if (!session) {
          setCurrentUser(null);
          setExpiresAt(null);
          setAuthResolved(true);
          return;
        }
        const { data: row, error } = await sb
          .from("users")
          .select()
          .eq("id", session.user.id)
          .maybeSingle();
        if (error || !row) {
          if (attempt < MAX_ATTEMPTS - 1) {
            setTimeout(() => fetchUser(attempt + 1), 600);
            return;
          }
          console.warn(
            "[auth] No public.users row for current session after retries. Signing out."
          );
          await sb.auth.signOut();
          setCurrentUser(null);
          setExpiresAt(null);
          setAuthResolved(true);
          return;
        }
        setCurrentUser({
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          termsVersionAccepted: row.terms_version_accepted ?? null,
          termsAcceptedAt: row.terms_accepted_at ?? null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          deletedAt: row.deleted_at,
        });
        setExpiresAt((session.expires_at ?? 0) * 1000);
        setAuthResolved(true);
      };
      fetchUser();
      const { data: sub } = sb.auth.onAuthStateChange(() => {
        fetchUser();
      });
      return () => {
        cancelled = true;
        sub.subscription.unsubscribe();
      };
    } else {
      const s = loadMockSession();
      if (s) {
        const u = mockService.getUser(s.userId);
        setCurrentUser(u);
        setExpiresAt(s.expiresAt);
      }
      setAuthResolved(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestMagicLink = async (email: string) => {
    if (supabaseEnabled && supabase) {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw new Error(error.message);
      return { email, token: null };
    }
    const user = mockService.createOrFindUser(email);
    const token =
      Math.random().toString(36).slice(2) + Date.now().toString(36);
    pendingMockTokens.set(token, {
      email: user.email,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });
    return { email: user.email, token };
  };

  const consumeMagicLink = async (token: string) => {
    if (supabaseEnabled) {
      throw new Error(
        "In Supabase mode, magic links are consumed automatically when the user clicks them."
      );
    }
    const p = pendingMockTokens.get(token);
    if (!p) throw new Error("That link has expired or already been used.");
    if (p.expiresAt < Date.now()) {
      pendingMockTokens.delete(token);
      throw new Error("That link has expired. Request a new one.");
    }
    pendingMockTokens.delete(token);
    const user = mockService.findUserByEmail(p.email);
    if (!user) throw new Error("User not found.");
    const s: MockSession = { userId: user.id, expiresAt: Date.now() + TTL_MS };
    saveMockSession(s);
    setCurrentUser(user);
    setExpiresAt(s.expiresAt);
    return user;
  };

  const signOut = async () => {
    if (supabaseEnabled && supabase) {
      await supabase.auth.signOut();
    } else {
      clearMockSession();
    }
    setCurrentUser(null);
    setExpiresAt(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        authResolved,
        expiresAt,
        isMockAuth: !supabaseEnabled,
        requestMagicLink,
        consumeMagicLink,
        signOut,
        setCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
