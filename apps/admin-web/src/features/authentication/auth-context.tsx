import { createContext, useContext, useState, type ReactNode } from "react";

export interface User {
  email: string;
  employeeId: string;
  roles: string[];
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (sessionHash: string, email: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = (sessionHash: string, email: string) => {
    const cookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith("__Host-transmetro_admin_session="));
    if (cookie) {
      const match = cookie.match(/=([a-f0-9]{64})/);
      if (match) {
        setUser({
          email,
          employeeId: "emp-1",
          roles: ["ADMIN"],
          permissions: ["administration.read", "administration.write"],
        });
      }
    }
  };

  const logout = () => {
    document.cookie =
      "__Host-transmetro_admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None";
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
