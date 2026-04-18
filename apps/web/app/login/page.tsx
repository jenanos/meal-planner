"use client";

import { useState } from "react";
import { signIn } from "../../lib/auth-client";
import { Button, Input } from "@repo/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading("magic-link");
    setError(null);
    try {
      const result = await signIn.magicLink({
        email: email.trim(),
        callbackURL: "/",
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
          Kun inviterte brukere har tilgang.
          <br />
          Kontakt administrator for å bli lagt til.
        </p>
      </div>
    </div>
  );
}
