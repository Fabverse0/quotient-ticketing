import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchMe, type User } from "../api/auth";
import { setUnauthorizedHandler } from "../api/client";
import { readToken, writeToken } from "./token";

interface Session {
  user: User | null;
  loading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

// The role comes from GET /auth/me, never from decoding the token in the browser.
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(() => Boolean(readToken()));

  const me = useQuery({ queryKey: ["me"], queryFn: fetchMe, enabled: hasToken, retry: false, staleTime: Infinity });

  const signOut = useCallback(() => {
    writeToken(null);
    setHasToken(false);
    queryClient.clear();
  }, [queryClient]);

  const signIn = useCallback(
    (token: string, user: User) => {
      writeToken(token);
      queryClient.setQueryData(["me"], user);
      setHasToken(true);
    },
    [queryClient],
  );

  useEffect(() => {
    setUnauthorizedHandler(signOut);
  }, [signOut]);

  useEffect(() => {
    if (me.isError) signOut();
  }, [me.isError, signOut]);

  const value = useMemo<Session>(
    () => ({
      user: hasToken ? (me.data ?? null) : null,
      loading: hasToken && me.isPending,
      signIn,
      signOut,
    }),
    [hasToken, me.data, me.isPending, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside SessionProvider");
  return session;
}

export const homeFor = (user: User) => (user.role === "organizer" ? "/organizer" : "/");
