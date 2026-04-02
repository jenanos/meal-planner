"use client";

import { useState, useEffect } from "react";
import { signIn } from "../../lib/auth-client";
import { Button, Input } from "@repo/ui";

const PROVIDERS = [
  { id: "google", label: "Google", icon: "🔵" },
  { id: "github", label: "GitHub", icon: "🐙" },
  { id: "microsoft", label: "Microsoft", icon: "🟦" },
  { id: "apple", label: "Apple", icon: "🍎" },
] as const;

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
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

  async function handleSocialLogin(providerId: string) {
    setLoading(providerId);
    setError(null);
    try {
      await signIn.social({
        provider: providerId as "google" | "github" | "microsoft" | "apple",
        callbackURL: "/",
      });
    } catch {
      setError("Innlogging feilet. Prøv igjen.");
      setLoading(null);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading("magic-link");
    setError(null);
    try {
      await signIn.magicLink({
        email: email.trim(),
        callbackURL: "/",
      });
      setMagicLinkSent(true);
    } catch {
      setError("Kunne ikke sende innloggingslenke. Sjekk e-postadressen.");
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

        {/* Social login buttons */}
        <div className="space-y-3">
          <h2 className="text-center text-sm font-medium text-muted-foreground">
            Logg inn med
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((provider) => (
              <Button
                key={provider.id}
                variant="outline"
                className="h-11"
                disabled={loading !== null}
                onClick={() => handleSocialLogin(provider.id)}
              >
                <span className="mr-2">{provider.icon}</span>
                {provider.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              eller
            </span>
          </div>
        </div>

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
          Ved å logge inn godtar du bruk av appen.
          <br />
          Nye brukere blir automatisk registrert.
        </p>
      </div>
    </div>
  );
}
