"use client";

import { useEffect } from "react";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "../lib/trpcClient";

/**
 * The admin app has no login of its own. It uses the better-auth session
 * cookie that meals-web issues on the parent domain (BETTER_AUTH_COOKIE_DOMAIN).
 * Without a session, send the user to meals-web's login, which bounces back
 * here via `?callbackUrl=`.
 */
function getLoginUrl(): string {
  const configured = process.env.NEXT_PUBLIC_LOGIN_URL?.trim();
  if (configured) return configured;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    // Keep the loopback host: the login page only accepts a callback on its
    // own hostname (or the allowlisted production hosts).
    return `http://${host}:3000/login`;
  }
  return "https://meals.jenanos.xyz/login";
}

function redirectToLogin() {
  const login = new URL(getLoginUrl());
  login.searchParams.set("callbackUrl", window.location.href);
  window.location.href = login.toString();
}

function isUnauthorized(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    (error.data as { code?: string } | undefined)?.code === "UNAUTHORIZED"
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const me = trpc.admin.myRole.useQuery(undefined, { retry: false });
  const unauthorized = me.isError && isUnauthorized(me.error);

  useEffect(() => {
    if (unauthorized) redirectToLogin();
  }, [unauthorized]);

  if (!me.data && !me.isError) {
    return <p className="text-sm text-muted-foreground">Sjekker innlogging…</p>;
  }

  if (unauthorized) {
    return (
      <p className="text-sm text-muted-foreground">
        Sender deg til innlogging…
      </p>
    );
  }

  if (me.isError) {
    return (
      <p className="text-sm text-destructive">
        Klarte ikke å sjekke innloggingen: {me.error.message}
      </p>
    );
  }

  if (me.data?.role !== "ADMIN") {
    return (
      <p className="text-sm text-foreground">
        Du er logget inn, men kontoen din har ikke admin-tilgang.
      </p>
    );
  }

  return <>{children}</>;
}
