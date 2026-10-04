import { SAuth } from '@/i18n/s.app';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { Center, Loader } from '@mantine/core';
import { supabase } from '@/lib/supabase';
import { LoginScreen } from './LoginScreen';

const SessionContext = createContext<Session | null>(null);

/**
 * Hook that returns the signed-in session.
 * AuthGate does not render its children without a session, so below the gate this is always non-null.
 */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error(SAuth.sessionOutsideGate);
  }
  return session;
}

/**
 * Auth gate: without a session every route shows only the login screen.
 * - Shows a loader until the initial session restore (localStorage) finishes, to avoid a flash.
 * - Subscribes to onAuthStateChange so sign-in, sign-out and token refresh apply at once.
 *
 * Note: the gate only decides whether a session exists; what data a session may read
 * is decided by the database's row-level security, not here.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Whether the initial session restore is done; while false a loader is shown so the login screen does not flash
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Initial session restore (localStorage to memory)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    // Apply sign-in and sign-out at once
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <Center h="100vh">
        <Loader size="sm" color="ink" type="bars" />
      </Center>
    );
  }
  if (!session) return <LoginScreen />;
  return (
    <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
  );
}
