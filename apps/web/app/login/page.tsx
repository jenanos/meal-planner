"use client";

import { useState } from "react";
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
          <h1 className="text-4xl font-bold tracking-tight">🍽️ Butta</h1>
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
              ✉️ Sjekk e-posten din!
            </p>
            <p className="mt-1 text-xs text-green-600">
              Vi har sendt en innloggingslenke til {email}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => {
                setMagicLinkSent(false);
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
