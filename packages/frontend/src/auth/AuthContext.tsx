/** AuthContext — stato di sessione: token + contesto utente (da /me). */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserContext } from '@sisuite/shared';
import { apiFetch, ApiError, getToken, setToken } from '../api/client';
import { loginWithPassword } from './gotrue';

interface AuthState {
  user: UserContext | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiFetch<UserContext>('/me');
      setUser(me);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setToken(null);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string) {
    const token = await loginWithPassword(email, password);
    setToken(token);
    setLoading(true);
    await loadMe();
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  const value = useMemo<AuthState>(() => ({ user, loading, login, logout }), [user, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuori da AuthProvider');
  return v;
}
