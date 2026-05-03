"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, emailOtp } from "../../lib/auth-client";
import { Button, Input } from "@repo/ui";

type Stage = "enter-email" | "enter-otp" | "magic-link-sent";

// Persist the pending OTP stage across PWA background-kills on Android.
const PENDING_KEY = "butta:pending-login";
const PENDING_TTL_MS = 10 * 60 * 1000; // OTP is valid for 5 min; give buffer.

type PendingState = {
  stage: "enter-otp" | "magic-link-sent";
  email: string;
  callbackUrl: string | null;
  savedAt: number;
};

function isPendingState(value: unknown): value is PendingState {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;

  return (
    (candidate.stage === "enter-otp" ||
      candidate.stage === "magic-link-sent") &&
    typeof candidate.email === "string" &&
    candidate.email.trim().length > 0 &&
    (candidate.callbackUrl === null ||
      typeof candidate.callbackUrl === "string") &&
    typeof candidate.savedAt === "number" &&
    Number.isFinite(candidate.savedAt)
  );
}

function loadPendingState(): PendingState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPendingState(parsed)) {
      window.localStorage.removeItem(PENDING_KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > PENDING_TTL_MS) {
      window.localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(PENDING_KEY);
    return null;
  }
}

function savePendingState(state: Omit<PendingState, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ ...state, savedAt: Date.now() }),
    );
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}

function clearPendingState() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

/**
 * Validate a `?callbackUrl=` value: only allow same-origin or other subdomains
 * of the same registrable domain (e.g. *.jenanos.xyz). Anything else is
 * dropped to avoid open-redirects.
 */
function sanitizeCallbackUrl(raw: string | null): string | null {
  if (!raw || typeof window === "undefined") return null;
  try {
    const target = new URL(raw, window.location.origin);
    const here = window.location.hostname;
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return null;
    }
    if (target.hostname === here) return target.toString();
    // Allow other subdomains of the same registrable domain
    // (foo.jenanos.xyz ↔ bar.jenanos.xyz) by matching the last two labels.
    const hereParts = here.split(".");
    const targetParts = target.hostname.split(".");
    if (hereParts.length >= 2 && targetParts.length >= 2) {
      const hereTail = hereParts.slice(-2).join(".");
      const targetTail = targetParts.slice(-2).join(".");
      if (hereTail === targetTail) return target.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function describeSendError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("tilgang") || lower.includes("allowlist")) {
    return "Denne e-postadressen har ikke tilgang. Kontakt administrator for å få tilgang.";
  }
  return "Kunne ikke sende akkurat nå. Prøv igjen om litt.";
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<Stage>("enter-email");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);

  useEffect(() => {
    const fromQuery = sanitizeCallbackUrl(
      searchParams?.get("callbackUrl") ?? null,
    );
    const pending = loadPendingState();
    if (pending) {
      setEmail(pending.email);
      setStage(pending.stage);
      // Prefer the just-arrived query value over the stored one so a fresh
      // sign-in flow always uses the latest target.
      setCallbackUrl(fromQuery ?? pending.callbackUrl ?? null);
    } else if (fromQuery) {
      setCallbackUrl(fromQuery);
    }
  }, [searchParams]);

  function finishSignIn() {
    clearPendingState();
    if (callbackUrl) {
      // Cross-origin (e.g. meals-mcp.jenanos.xyz) needs a full navigation –
      // the Next.js router only handles same-origin pushes.
      window.location.href = callbackUrl;
      return;
    }
    router.push("/");
    router.refresh();
  }

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
      savePendingState({
        stage: "enter-otp",
        email: email.trim(),
        callbackUrl,
      });
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
      const fallbackCallback = new URL("/", window.location.origin).toString();
      const result = await signIn.magicLink({
        email: email.trim(),
        callbackURL: callbackUrl ?? fallbackCallback,
      });
      if (result.error) {
        setError(describeSendError(result.error.message ?? ""));
        return;
      }
      savePendingState({
        stage: "magic-link-sent",
        email: email.trim(),
        callbackUrl,
      });
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
    if (code.length !== 6) return;
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
      finishSignIn();
    } catch {
      setError("Kunne ikke verifisere koden. Prøv igjen om litt.");
    } finally {
      setLoading(null);
    }
  }

  function reset() {
    clearPendingState();
    setStage("enter-email");
    setEmail("");
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
              disabled={loading !== null || otp.trim().length !== 6}
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
              onClick={reset}
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
