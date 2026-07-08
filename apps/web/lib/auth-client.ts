import { createAuthClient } from "better-auth/react";
import {
  magicLinkClient,
  emailOTPClient,
} from "better-auth/client/plugins";
import { demoUser, isDemoMode } from "./demo";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [magicLinkClient(), emailOTPClient()],
});

type UseSession = typeof authClient.useSession;
type SignOut = typeof authClient.signOut;

// In demo mode there is no auth server: every visitor is "logged in" as the
// shared demo user, and signing out is a no-op (the login page redirects
// back to the dashboard).
const demoSessionState = {
  data: {
    user: demoUser,
    session: {
      id: "demo-session",
      token: "demo-session-token",
      userId: demoUser.id,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  },
  isPending: false,
  isRefetching: false,
  error: null,
  refetch: () => {},
};

const useDemoSession = (() => demoSessionState) as unknown as UseSession;
const demoSignOut = (async () => ({
  data: { success: true },
  error: null,
})) as unknown as SignOut;

export const useSession: UseSession = isDemoMode
  ? useDemoSession
  : authClient.useSession;
export const signOut: SignOut = isDemoMode ? demoSignOut : authClient.signOut;
export const { signIn, signUp, emailOtp } = authClient;
