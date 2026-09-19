import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { API_BASE_URL } from "../../platform/configuration/environment";

export interface User {
  email: string;
  employeeId: string;
  roles: string[];
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (userData: User) => void;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  login: () => {},
  logout: async () => {},
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount: call GET /authentication/me
  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch(`${API_BASE_URL}/authentication/me`, {
          credentials: "include",
          headers: { Origin: window.location.origin },
        });
        if (response.ok) {
          const data = await response.json();
          setUser({
            email: data.email,
            employeeId: data.employeeId,
            roles: data.roles,
            permissions: data.permissions,
          });
        }
      } catch {
        // No session active — user stays null
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, []);

  const login = (userData: User) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE_URL}/authentication/logout`, {
        method: "POST",
        credentials: "include",
        headers: {
          Origin: window.location.origin,
          "X-Transmetro-Request": "admin-web",
        },
      });
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
