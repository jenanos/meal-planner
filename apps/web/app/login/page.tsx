"use client";

import { useState, useEffect } from "react";
import { signIn } from "../../lib/auth-client";
import { Button, Input } from "@repo/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devMagicLinkUrl, setDevMagicLinkUrl] = useState<string | null>(null);

  // In dev mode, fetch the magic link URL after sending it so
  // developers can log in with one click instead of checking email/console.
  useEffect(() => {
    if (!magicLinkSent || process.env.NODE_ENV === "production") return;

    let cancelled = false;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

    async function fetchDevLink() {
      try {
        const res = await fetch(`${baseUrl}/auth/dev/magic-link`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.url) {
          setDevMagicLinkUrl(data.url);
        }
      } catch {
        // Expected to fail in prod or if endpoint doesn't exist
      }
    }

    fetchDevLink();
    return () => { cancelled = true; };
  }, [magicLinkSent]);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading("magic-link");
    setError(null);
    try {
      const callbackURL =
        typeof window !== "undefined"
          ? new URL("/", window.location.origin).toString()
          : "/";
      const result = await signIn.magicLink({
        email: email.trim(),
        callbackURL,
      });
      if (result.error) {
        const message =
          typeof result.error.message === "string"
            ? result.error.message
            : "";
        if (
          message.toLowerCase().includes("tilgang") ||
          message.toLowerCase().includes("allowlist")
        ) {
          setError(
            "Denne e-postadressen har ikke tilgang. Kontakt administrator for å få tilgang.",
          );
        } else {
          setError(
            "Kunne ikke sende innloggingslenke akkurat nå. Sjekk at serveren kjører på localhost:4000 og prøv igjen.",
          );
        }
        return;
      }
      setMagicLinkSent(true);
    } catch {
      setError(
        "Kunne ikke sende innloggingslenke akkurat nå. Sjekk at serveren kjører på localhost:4000 og prøv igjen.",
      );
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / App name */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">Butta</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Måltidsplanlegger for hele familien
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Magic link */}
        {magicLinkSent ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
            <p className="text-sm font-medium text-green-800">
              Sjekk e-posten din!
            </p>
            <p className="mt-1 text-xs text-green-600">
              Vi har sendt en innloggingslenke til {email}
            </p>

            {/* Dev-only: one-click magic link button */}
            {devMagicLinkUrl && (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-800">
                  Utviklingsmodus
                </p>
                <Button
                  className="mt-2 w-full"
                  size="sm"
                  onClick={() => { window.location.href = devMagicLinkUrl; }}
                >
                  Fortsett til innlogging
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => {
                setMagicLinkSent(false);
                setDevMagicLinkUrl(null);
                setEmail("");
              }}
            >
              Prøv igjen
            </Button>
          </div>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-3">
            <div>
              <label htmlFor="email" className="text-sm font-medium">
                E-postadresse
              </label>
              <Input
                id="email"
                type="email"
                placeholder="din@epost.no"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading !== null || !email.trim()}
            >
              {loading === "magic-link"
                ? "Sender…"
                : "Send innloggingslenke"}
            </Button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Kun inviterte brukere har tilgang.
          <br />
          Kontakt administrator for å bli lagt til.
        </p>
      </div>
    </div>
  );
}
