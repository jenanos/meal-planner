"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, emailOtp } from "../../lib/auth-client";
import { Button, Input } from "@repo/ui";

type Stage = "enter-email" | "enter-otp" | "magic-link-sent";

function describeSendError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("tilgang") || lower.includes("allowlist")) {
    return "Denne e-postadressen har ikke tilgang. Kontakt administrator for å få tilgang.";
  }
  return "Kunne ikke sende akkurat nå. Prøv igjen om litt.";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<Stage>("enter-email");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading("otp");
    setError(null);
    try {
      const result = await emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: "sign-in",
      });
      if (result.error) {
        setError(describeSendError(result.error.message ?? ""));
        return;
      }
      setStage("enter-otp");
    } catch {
      setError("Kunne ikke sende kode akkurat nå. Prøv igjen om litt.");
    } finally {
      setLoading(null);
    }
  }

  async function handleSendMagicLink() {
    if (!email.trim()) return;
    setLoading("magic-link");
    setError(null);
    try {
      const callbackURL = new URL("/", window.location.origin).toString();
      const result = await signIn.magicLink({
        email: email.trim(),
        callbackURL,
      });
      if (result.error) {
        setError(describeSendError(result.error.message ?? ""));
        return;
      }
      setStage("magic-link-sent");
    } catch {
      setError("Kunne ikke sende innloggingslenke akkurat nå. Prøv igjen om litt.");
    } finally {
      setLoading(null);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const code = otp.trim();
    if (!code) return;
    setLoading("verify");
    setError(null);
    try {
      const result = await signIn.emailOtp({
        email: email.trim(),
        otp: code,
      });
      if (result.error) {
        const message = (result.error.message ?? "").toLowerCase();
        if (message.includes("expired")) {
          setError("Koden er utløpt. Be om en ny kode.");
        } else if (message.includes("too many")) {
          setError("For mange forsøk. Be om en ny kode.");
        } else {
          setError("Ugyldig kode. Sjekk at du har skrevet den riktig.");
        }
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Kunne ikke verifisere koden. Prøv igjen om litt.");
    } finally {
      setLoading(null);
    }
  }

  function reset() {
    setStage("enter-email");
    setOtp("");
    setError(null);
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
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

        {stage === "enter-email" && (
          <form onSubmit={handleSendOtp} className="space-y-3">
            <div>
              <label htmlFor="email" className="text-sm font-medium">
                E-postadresse
              </label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
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
              {loading === "otp" ? "Sender…" : "Send engangskode"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={loading !== null || !email.trim()}
              onClick={handleSendMagicLink}
            >
              {loading === "magic-link"
                ? "Sender…"
                : "Send innloggingslenke i stedet"}
            </Button>
          </form>
        )}

        {stage === "enter-otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">
              Vi sendte en 6-sifret kode til <strong>{email}</strong>.
            </p>
            <div>
              <label htmlFor="otp" className="text-sm font-medium">
                Engangskode
              </label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                required
                className="mt-1 text-center tracking-[0.5em] text-lg"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading !== null || otp.trim().length < 4}
            >
              {loading === "verify" ? "Logger inn…" : "Logg inn"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={reset}
            >
              Bruk en annen e-post
            </Button>
          </form>
        )}

        {stage === "magic-link-sent" && (
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
                setStage("enter-email");
                setEmail("");
              }}
            >
              Prøv igjen
            </Button>
          </div>
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
