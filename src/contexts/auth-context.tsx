"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { UserRole } from "@/generated/prisma/enums";

export type { UserRole };

export interface OfficerProfile {
  id: string;
  employeeCode: string;
  department: string;
  branchCode: string | null;
  designation: string;
  approvalLimitAmount: number;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isEmailVerified: boolean;
  phone: string | null;
  applicantId: string | null;
  officerProfile: OfficerProfile | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  message?: string;
}

export interface LogoutResult {
  success: boolean;
  revoked?: boolean;
  error?: string;
}

export interface FetchUserResult {
  success: boolean;
  user: AuthUser | null;
  error?: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  logout: () => Promise<LogoutResult>;
  refreshUser: () => Promise<FetchUserResult>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children?: ReactNode;
  initialUser?: AuthUser | null;
  onUserChange?: (user: AuthUser | null) => void;
}

export const SYNC_COOLDOWN_MS = 15000; // 15 seconds throttle for focus/visibility re-validation
export const LOGIN_WAIT_TIMEOUT_MS = 8000; // 8 seconds maximum bounded wait for in-flight login settling before logout
const VALID_ROLES = new Set<string>(["LOAN_APPLICANT", "BANK_OFFICER", "BANK_ADMIN"]);

/**
 * Determines whether a focus or visibility event is permitted to trigger a background session refresh.
 */
export function shouldTriggerSync(
  lastFetchTime: number,
  now: number,
  isInFlight: boolean,
  visibilityState: string = "visible",
  cooldownMs: number = SYNC_COOLDOWN_MS
): boolean {
  if (visibilityState !== "visible") return false;
  if (now - lastFetchTime < cooldownMs) return false;
  if (isInFlight) return false;
  return true;
}

/**
 * Sets up throttled window focus and document visibility event listeners.
 * Returns an unmount cleanup function that deregisters the listeners.
 */
export function setupSessionSync({
  sync,
  cooldownMs = SYNC_COOLDOWN_MS,
  lastFetchTimeRef,
  isFetching,
}: {
  sync: () => void;
  cooldownMs?: number;
  lastFetchTimeRef: { current: number };
  isFetching: () => boolean;
}): () => void {
  const handleSync = () => {
    const docState = typeof document !== "undefined" ? document.visibilityState : "visible";
    const now = Date.now();
    if (!shouldTriggerSync(lastFetchTimeRef.current, now, isFetching(), docState, cooldownMs)) {
      return;
    }
    lastFetchTimeRef.current = now;
    sync();
  };

  const handleFocus = () => {
    const now = Date.now();
    if (!shouldTriggerSync(lastFetchTimeRef.current, now, isFetching(), "visible", cooldownMs)) {
      return;
    }
    lastFetchTimeRef.current = now;
    sync();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("focus", handleFocus);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleSync);
  }

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", handleFocus);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleSync);
    }
  };
}

/**
 * Validates the runtime structure of an OfficerProfile object.
 */
export function isValidOfficerProfile(profile: unknown): profile is OfficerProfile {
  if (profile === null) return true;
  if (!profile || typeof profile !== "object") return false;
  const p = profile as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    p.id.length > 0 &&
    typeof p.employeeCode === "string" &&
    p.employeeCode.length > 0 &&
    typeof p.department === "string" &&
    p.department.length > 0 &&
    (p.branchCode === null || typeof p.branchCode === "string") &&
    typeof p.designation === "string" &&
    p.designation.length > 0 &&
    typeof p.approvalLimitAmount === "number" &&
    !isNaN(p.approvalLimitAmount)
  );
}

/**
 * Validates the runtime structure of an AuthUser profile received from the server.
 * Rejects malformed objects, unexpected roles, and secret leakage.
 */
export function isValidAuthUser(user: unknown): user is AuthUser {
  if (!user || typeof user !== "object") return false;
  const u = user as Record<string, unknown>;
  return (
    typeof u.id === "string" &&
    u.id.length > 0 &&
    typeof u.email === "string" &&
    u.email.includes("@") &&
    typeof u.firstName === "string" &&
    typeof u.lastName === "string" &&
    typeof u.role === "string" &&
    VALID_ROLES.has(u.role) &&
    typeof u.isEmailVerified === "boolean" &&
    (u.phone === null || typeof u.phone === "string") &&
    (u.applicantId === null || typeof u.applicantId === "string") &&
    (u.officerProfile === null || isValidOfficerProfile(u.officerProfile))
  );
}

export function AuthProvider({
  children,
  initialUser = null,
  onUserChange,
}: AuthProviderProps) {
  const [user, setUserState] = useState<AuthUser | null>(initialUser);
  const [isLoading, setIsLoading] = useState<boolean>(initialUser === null);
  const [error, setError] = useState<string | null>(null);

  const setUser = useCallback(
    (nextUser: AuthUser | null) => {
      setUserState(nextUser);
      onUserChange?.(nextUser);
    },
    [onUserChange]
  );

  // Monotonically increasing sequence ID to discard stale, out-of-order network responses
  const sequenceIdRef = useRef<number>(0);
  // Controller to abort active in-flight background request when a new action occurs
  const inFlightControllerRef = useRef<AbortController | null>(null);
  // Timestamp to throttle window focus / visibility revalidation
  const lastFetchTimeRef = useRef<number>(0);
  // Active in-flight login operation to serialize overlapping logout requests
  const loginPromiseRef = useRef<Promise<void> | null>(null);
  // Flag indicating whether an active logout operation is currently awaiting in-flight login settlement
  const isLogoutAwaitingLoginRef = useRef<boolean>(false);

  /**
   * Fetches and validates the current authoritative user session from GET /api/auth/me.
   * State updates are executed only after structural validation.
   */
  const fetchCurrentUser = useCallback(async (): Promise<FetchUserResult> => {
    sequenceIdRef.current += 1;
    const currentSeq = sequenceIdRef.current;

    // Abort any prior in-flight fetch
    if (inFlightControllerRef.current) {
      inFlightControllerRef.current.abort();
    }
    const controller = new AbortController();
    inFlightControllerRef.current = controller;

    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "include",
        signal: controller.signal,
      });

      // Discard response if a newer request was dispatched
      if (sequenceIdRef.current !== currentSeq) {
        return {
          success: false,
          user: null,
          error: "Request superseded by a newer operation.",
        };
      }

      if (response.status === 200) {
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          setUser(null);
          setError("Invalid JSON response received from session service.");
          return {
            success: false,
            user: null,
            error: "Invalid JSON response received from session service.",
          };
        }

        const resObj = data as Record<string, unknown> | null;
        if (resObj?.success === true && isValidAuthUser(resObj?.user)) {
          setUser(resObj.user);
          setError(null);
          return {
            success: true,
            user: resObj.user,
          };
        } else {
          setUser(null);
          const errorMsg =
            resObj?.success === false && typeof resObj?.message === "string"
              ? resObj.message
              : "Malformed user profile received from session service.";
          setError(errorMsg);
          return {
            success: false,
            user: null,
            error: errorMsg,
          };
        }
      } else if (response.status === 401) {
        // Expected status for unauthenticated guest sessions
        setUser(null);
        setError(null);
        return {
          success: false,
          user: null,
          error: "Unauthenticated",
        };
      } else {
        const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        setUser(null);
        const errorMsg =
          typeof data?.message === "string"
            ? data.message
            : `Failed to verify session (${response.status})`;
        setError(errorMsg);
        return {
          success: false,
          user: null,
          error: errorMsg,
        };
      }
    } catch (err: unknown) {
      // Ignore aborted requests
      if (err instanceof Error && err.name === "AbortError") {
        return {
          success: false,
          user: null,
          error: "Request aborted.",
        };
      }
      if (sequenceIdRef.current === currentSeq) {
        setUser(null);
        setError("Network error while communicating with authentication service.");
      }
      return {
        success: false,
        user: null,
        error: "Network error while communicating with authentication service.",
      };
    } finally {
      if (sequenceIdRef.current === currentSeq) {
        setIsLoading(false);
        lastFetchTimeRef.current = Date.now();
        inFlightControllerRef.current = null;
      }
    }
  }, [setUser]);

  /**
   * Public manual refresh action.
   * Explicitly sets isLoading = true during caller-initiated refresh.
   */
  const refreshUser = useCallback(async (): Promise<FetchUserResult> => {
    setIsLoading(true);
    return await fetchCurrentUser();
  }, [fetchCurrentUser]);

  /**
   * Authenticates user against POST /api/auth/login.
   * On HTTP 200, requires a successful, structurally validated /api/auth/me profile
   * before returning success to the caller.
   */
  const login = useCallback(
    async (credentials: LoginCredentials): Promise<LoginResult> => {
      setError(null);
      setIsLoading(true);

      // Invalidate any in-flight background queries
      sequenceIdRef.current += 1;
      const loginSeq = sequenceIdRef.current;

      if (inFlightControllerRef.current) {
        inFlightControllerRef.current.abort();
        inFlightControllerRef.current = null;
      }

      // Strict Serialization: Login B must never dispatch its network request while Login A's
      // complete operation (including network request, response handling, and any late-session cleanup)
      // remains pending. The 8-second logout timeout must NOT release this queue.
      while (loginPromiseRef.current) {
        await loginPromiseRef.current;
      }

      // Check if this login was superseded while waiting for the prior operation
      if (sequenceIdRef.current !== loginSeq) {
        setIsLoading(false);
        return {
          success: false,
          error: "Authentication operation superseded by newer action.",
        };
      }

      // Track the login network operation via settlement promise for logout serialization
      let resolveLoginSettled!: () => void;
      const loginSettledPromise = new Promise<void>((resolve) => {
        resolveLoginSettled = resolve;
      });
      loginPromiseRef.current = loginSettledPromise;

      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "include",
          body: JSON.stringify(credentials),
        });

        // Guard against concurrency: if another operation (e.g. logout) occurred while login was on the wire
        if (sequenceIdRef.current !== loginSeq) {
          // If the server accepted this login and sent Set-Cookie, but logout has ALREADY finished
          // waiting (e.g. timed out) or this login was superseded by another operation,
          // we must immediately clean up this newly arrived orphan session on the server.
          if (response.ok && !isLogoutAwaitingLoginRef.current) {
            try {
              const cleanupRes = await fetch("/api/auth/logout", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                credentials: "include",
                body: JSON.stringify({}),
              });
              const cleanupData = (await cleanupRes.json().catch(() => null)) as Record<string, unknown> | null;
              if (cleanupRes.ok && cleanupData?.success === true && cleanupData?.revoked === true) {
                console.warn("[AuthProvider] Cleaned up orphaned session from superseded login.");
              } else {
                console.warn("[AuthProvider] Orphaned session cleanup was unconfirmed by server:", cleanupData);
              }
            } catch (cleanupErr) {
              console.warn("[AuthProvider] Network error during orphaned session cleanup:", cleanupErr);
            }
          }

          setIsLoading(false);
          return {
            success: false,
            error: "Authentication operation superseded by newer action.",
          };
        }

        let data: unknown;
        try {
          data = await response.json();
        } catch {
          setIsLoading(false);
          const errorMsg = "Invalid JSON response received from login service.";
          setError(errorMsg);
          return {
            success: false,
            error: errorMsg,
          };
        }

        const resObj = data as Record<string, unknown> | null;

        if (!response.ok || !resObj?.success) {
          const errorMessage =
            typeof resObj?.message === "string"
              ? resObj.message
              : typeof resObj?.error === "string"
              ? resObj.error
              : `Authentication failed (${response.status})`;
          setError(errorMessage);
          setIsLoading(false);
          return {
            success: false,
            error: errorMessage,
          };
        }

        // Mandatory verified retrieval of user profile via /api/auth/me
        const fetchResult = await fetchCurrentUser();

        // Check if superseded during profile retrieval
        if (sequenceIdRef.current !== loginSeq && sequenceIdRef.current !== loginSeq + 1) {
          return {
            success: false,
            error: "Authentication operation superseded by newer action.",
          };
        }

        if (!fetchResult.success || !fetchResult.user) {
          setUser(null);
          const failureMessage =
            fetchResult.error && fetchResult.error !== "Unauthenticated"
              ? fetchResult.error
              : "Authentication credentials accepted, but failed to establish verified session profile.";
          setError(failureMessage);
          setIsLoading(false);
          return {
            success: false,
            error: failureMessage,
          };
        }

        return {
          success: true,
          message: typeof resObj.message === "string" ? resObj.message : "Authentication successful.",
        };
      } catch (err: unknown) {
        if (sequenceIdRef.current === loginSeq) {
          const message =
            err instanceof Error
              ? err.message
              : "Network error occurred while attempting to log in.";
          setError(message);
          setIsLoading(false);
          return {
            success: false,
            error: message,
          };
        }
        return {
          success: false,
          error: "Authentication operation superseded by newer action.",
        };
      } finally {
        resolveLoginSettled();
        if (loginPromiseRef.current === loginSettledPromise) {
          loginPromiseRef.current = null;
        }
      }
    },
    [fetchCurrentUser, setUser]
  );

  /**
   * Terminates active session against POST /api/auth/logout.
   * When called while a login request is in-flight, it immediately clears frontend state,
   * invalidates the login sequence, and awaits settlement of the login response (with a bounded timeout)
   * so the browser can process the Set-Cookie header before dispatching the logout request.
   */
  const logout = useCallback(async (): Promise<LogoutResult> => {
    // 1. Invalidate ongoing operations immediately
    sequenceIdRef.current += 1;
    const logoutSeq = sequenceIdRef.current;

    // 2. Abort background in-flight /me queries
    if (inFlightControllerRef.current) {
      inFlightControllerRef.current.abort();
      inFlightControllerRef.current = null;
    }

    // 3. Immediate optimistic local client wipe
    setUser(null);
    setError(null);
    setIsLoading(false);

    // 4. If a login operation is currently on the wire, await its settlement with bounded timeout.
    // Do NOT abort the login network request: allowing the browser to receive the login response
    // ensures the session cookie is saved in the cookie jar before the subsequent logout request is sent.
    if (loginPromiseRef.current) {
      isLogoutAwaitingLoginRef.current = true;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          loginPromiseRef.current,
          new Promise<void>((resolve) => {
            timeoutId = setTimeout(resolve, LOGIN_WAIT_TIMEOUT_MS);
          }),
        ]);
      } finally {
        isLogoutAwaitingLoginRef.current = false;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    // 5. Server-side session revocation & cookie expiration
    try {
      const controller = new AbortController();
      inFlightControllerRef.current = controller;

      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({}),
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;

      if (sequenceIdRef.current !== logoutSeq) {
        return {
          success: false,
          revoked: false,
          error: "Logout operation superseded by newer action.",
        };
      }

      if (!response.ok || !data?.success) {
        const errorMessage =
          typeof data?.message === "string"
            ? data.message
            : typeof data?.error === "string"
            ? data.error
            : `Server logout failed (${response.status})`;
        console.warn("[AuthProvider] Server logout failed:", errorMessage);
        return {
          success: false,
          revoked: false,
          error: errorMessage,
        };
      }

      // Fix C: Only report confirmed success if backend confirms database session revocation
      if (data.revoked !== true) {
        const unconfirmedMessage =
          "Session logout completed, but active server-side session revocation could not be confirmed.";
        console.warn("[AuthProvider] Server logout unconfirmed:", unconfirmedMessage);
        return {
          success: false,
          revoked: false,
          error: unconfirmedMessage,
        };
      }

      return {
        success: true,
        revoked: true,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return {
          success: false,
          revoked: false,
          error: "Logout request was aborted.",
        };
      }
      const message =
        err instanceof Error
          ? err.message
          : "Network error occurred during logout.";
      console.warn("[AuthProvider] Network error during server logout:", message);
      return {
        success: false,
        revoked: false,
        error: message,
      };
    } finally {
      if (sequenceIdRef.current === logoutSeq) {
        inFlightControllerRef.current = null;
      }
    }
  }, [setUser]);

  // Initial load and focus/visibility synchronization
  useEffect(() => {
    async function initializeSession() {
      if (initialUser === null) {
        await fetchCurrentUser();
      } else {
        lastFetchTimeRef.current = Date.now();
      }
    }

    void initializeSession();

    const cleanupSync = setupSessionSync({
      sync: () => void fetchCurrentUser(),
      cooldownMs: SYNC_COOLDOWN_MS,
      lastFetchTimeRef,
      isFetching: () => inFlightControllerRef.current !== null,
    });

    return () => {
      cleanupSync();
      if (inFlightControllerRef.current) {
        inFlightControllerRef.current.abort();
        inFlightControllerRef.current = null;
      }
    };
  }, [fetchCurrentUser, initialUser]);

  const value: AuthContextType = {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    error,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access centralized authentication context.
 * Throws a descriptive error if called outside AuthProvider.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
