import { createAuthClient } from "better-auth/react";
import {
  magicLinkClient,
  emailOTPClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [magicLinkClient(), emailOTPClient()],
});

export const { useSession, signIn, signOut, signUp, emailOtp } = authClient;
