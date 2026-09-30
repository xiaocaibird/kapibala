import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  loginSession,
  logoutSession,
  refreshAccessToken,
  request,
  ApiError,
} from "../api/client";
import { userSchema, type User } from "../api/schemas";
interface AuthState {
  user: User | null;
  restoring: boolean;
  restoreError: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    void refreshAccessToken()
      .then(() => request("/api/auth/me", userSchema))
      .then((value) => {
        if (active) setUser(value);
      })
      .catch((error: unknown) => {
        if (active && !(error instanceof ApiError && error.status === 401))
          setRestoreError("暂时无法恢复会话，请确认服务可用后登录。");
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  const login = async (username: string, password: string): Promise<void> => {
    await loginSession(username, password);
    setUser(await request("/api/auth/me", userSchema));
    setRestoreError(null);
  };
  const logout = async (): Promise<void> => {
    await logoutSession();
  };
  return (
    <AuthContext.Provider
      value={{ user, restoring, restoreError, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}
