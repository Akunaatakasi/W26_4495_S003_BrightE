import { createContext, useContext, useState, useEffect } from 'react';
import { parseJson, DEMO_ONLY, DEMO_STAFF_TOKEN } from '../utils/api';

const AuthContext = createContext(null);
const API = '/api';
const DEMO_USER_KEY = 'bright_demo_user';

function getDemoUser(email) {
  return {
    id: 1,
    email: (email && email.trim()) || 'demo@demo.com',
    role: 'nurse',
    full_name: 'Demo Staff',
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('bright_token'));
  const [loading, setLoading] = useState(!!token);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    if (DEMO_ONLY && token === DEMO_STAFF_TOKEN) {
      try {
        const stored = localStorage.getItem(DEMO_USER_KEY);
        setUser(stored ? JSON.parse(stored) : getDemoUser());
      } catch {
        setUser(getDemoUser());
      }
      setLoading(false);
      return;
    }
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const data = await parseJson(r);
        if (r.ok && data.id) return data;
        throw new Error(data.error || 'Session invalid');
      })
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('bright_token');
        localStorage.removeItem(DEMO_USER_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const login = async (email, password) => {
    if (DEMO_ONLY) {
      const demoUser = getDemoUser(email);
      localStorage.setItem('bright_token', DEMO_STAFF_TOKEN);
      localStorage.setItem(DEMO_USER_KEY, JSON.stringify(demoUser));
      setToken(DEMO_STAFF_TOKEN);
      setUser(demoUser);
      return { user: demoUser, token: DEMO_STAFF_TOKEN };
    }
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Login failed');
    if (!data.token) throw new Error('Server returned invalid response. Is the backend running?');
    localStorage.setItem('bright_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const register = async (email, password, role = 'patient', full_name) => {
    if (DEMO_ONLY) {
      const demoUser = getDemoUser(email);
      localStorage.setItem('bright_token', DEMO_STAFF_TOKEN);
      localStorage.setItem(DEMO_USER_KEY, JSON.stringify(demoUser));
      setToken(DEMO_STAFF_TOKEN);
      setUser(demoUser);
      return { user: demoUser, token: DEMO_STAFF_TOKEN };
    }
    let res;
    try {
      res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role, full_name }),
      });
    } catch (err) {
      throw new Error('Cannot reach server. Is the backend running? Start it with: npm run server');
    }
    const data = await parseJson(res);
    if (!res.ok) {
      const msg = data?.error || data?.message || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    if (!data.token) throw new Error('Server returned invalid response. Is the backend running?');
    localStorage.setItem('bright_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('bright_token');
    localStorage.removeItem(DEMO_USER_KEY);
    setToken(null);
    setUser(null);
  };

  const authFetch = (path, options = {}) => {
    if (DEMO_ONLY && token === DEMO_STAFF_TOKEN) {
      if (path === '/patients/queue' || path === '/patients/completed') {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (path.startsWith('/patients/') && path !== '/patients/queue' && path !== '/patients/completed') {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
      }
    }
    return fetch(`${API}${path}`, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
