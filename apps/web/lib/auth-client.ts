import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

function getAuthBaseURL() {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  }
  return process.env.API_URL ?? "http://localhost:4000";
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  basePath: "/auth",
  plugins: [magicLinkClient()],
});

export const { useSession, signIn, signOut, signUp } = authClient;
