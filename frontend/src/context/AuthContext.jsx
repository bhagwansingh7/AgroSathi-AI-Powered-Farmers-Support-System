import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { get, post } from '../api/client.js';
import { closeSocket } from '../api/socket.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const d = await post('/auth/login', { email, password });
    setUser(d.user);
    return d.user;
  }, []);

  const register = useCallback(async (payload) => {
    const d = await post('/auth/register', payload);
    setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    try { await post('/auth/logout'); } finally { closeSocket(); setUser(null); }
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}
