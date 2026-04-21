"use client";

import { useEffect, createContext, useContext, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "../../lib/auth-client";
import { trpc } from "../../lib/trpcClient";

interface AuthContextValue {
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
    role?: "USER" | "ADMIN";
  } | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

const PUBLIC_PATHS = ["/login"];
const PENDING_KEY = "butta:pending-login";

function clearPendingLoginState() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore storage failures
  }
}

export function AuthGuard({
  children,
  shell,
}: {
  children: ReactNode;
  shell?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <AuthGuardInner pathname={pathname} router={router} shell={shell}>
      {children}
    </AuthGuardInner>
  );
}

function AuthGuardInner({
  children,
  pathname,
  router,
  shell,
}: {
  children: ReactNode;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  shell?: ReactNode;
}) {
  const { data: session, isPending } = useSession();
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Fetch user role from server once we have a session
  const roleQuery = trpc.admin.myRole.useQuery(undefined, {
    enabled: !!session?.user,
  });

  useEffect(() => {
    if (isPending) return;
    if (!session?.user && !isPublic) {
      router.replace("/login");
    }
  }, [session, isPending, isPublic, router]);

  useEffect(() => {
    if (session?.user) {
      clearPendingLoginState();
    }
  }, [session]);

  // Admin-only route protection
  const isAdminRoute = pathname.startsWith("/admin");
  useEffect(() => {
    if (isPending || roleQuery.isLoading) return;
    if (isAdminRoute && roleQuery.data?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [isAdminRoute, roleQuery.data, roleQuery.isLoading, isPending, router]);

  if (isPending) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <p className="mt-3 text-sm text-muted-foreground">Laster…</p>
        </div>
      </div>
    );
  }

  const rawRole = roleQuery.data?.role;
  const role: "USER" | "ADMIN" | undefined =
    rawRole === "ADMIN" ? "ADMIN" : rawRole === "USER" ? "USER" : undefined;

  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        role,
      }
    : null;

  // On public pages, show page content without app shell (no nav/header)
  if (isPublic) {
    return (
      <AuthContext.Provider value={{ user, isLoading: false }}>
        {children}
      </AuthContext.Provider>
    );
  }

  // On protected pages, require auth
  if (!user) {
    return null; // Will redirect in useEffect
  }

  // Block non-admin from admin routes while loading
  if (isAdminRoute && roleQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <p className="mt-3 text-sm text-muted-foreground">Laster…</p>
        </div>
      </div>
    );
  }

  if (isAdminRoute && user.role !== "ADMIN") {
    return null; // Will redirect in useEffect
  }

  return (
    <AuthContext.Provider value={{ user, isLoading: false }}>
      {shell}
      {children}
    </AuthContext.Provider>
  );
}
