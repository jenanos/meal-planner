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

// Mock mode is only safe in development. Even if the NEXT_PUBLIC_MOCK_MODE env
// var accidentally leaks to a production build, NODE_ENV will be "production"
// and the mock user will NOT be injected.
const mockFlag = (
  process.env.NEXT_PUBLIC_MOCK_MODE ??
  process.env.MOCK_MODE ??
  ""
)
  .toString()
  .toLowerCase();
const isMockMode =
  process.env.NODE_ENV === "development" &&
  (mockFlag === "true" || mockFlag === "1");

const MOCK_USER: AuthContextValue["user"] = {
  id: "mock-user-id",
  email: "mock@example.com",
  name: "Mock User",
  image: null,
  role: "ADMIN",
};

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // In mock mode (dev only), skip auth and provide a mock user so
  // frontend-only development works without a running backend.
  if (isMockMode) {
    return (
      <AuthContext.Provider value={{ user: MOCK_USER, isLoading: false }}>
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <AuthGuardInner pathname={pathname} router={router}>
      {children}
    </AuthGuardInner>
  );
}

function AuthGuardInner({
  children,
  pathname,
  router,
}: {
  children: ReactNode;
  pathname: string;
  router: ReturnType<typeof useRouter>;
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

  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image,
        role: roleQuery.data?.role as "USER" | "ADMIN" | undefined,
      }
    : null;

  // On public pages, show content regardless of auth state
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
      {children}
    </AuthContext.Provider>
  );
}
