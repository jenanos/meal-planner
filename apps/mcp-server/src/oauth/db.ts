import { prisma } from "@repo/api";

export async function findClient(clientId: string) {
  return prisma.oAuthClient.findUnique({ where: { clientId } });
}

export async function createClient(input: {
  clientId: string;
  name: string | null;
  redirectUris: string[];
}) {
  return prisma.oAuthClient.create({
    data: {
      clientId: input.clientId,
      name: input.name,
      redirectUris: input.redirectUris,
    },
  });
}

export async function createAuthorizationCode(input: {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: Date;
}) {
  return prisma.oAuthAuthorizationCode.create({ data: input });
}

/**
 * Atomically consume an authorization code. Only succeeds if the code exists,
 * is not yet consumed, and has not expired. Returns the row if consumption
 * succeeded, otherwise null.
 */
export async function consumeAuthorizationCode(code: string) {
  const result = await prisma.oAuthAuthorizationCode.updateMany({
    where: {
      code,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });
  if (result.count === 0) return null;
  return prisma.oAuthAuthorizationCode.findUnique({ where: { code } });
}

export async function createRefreshToken(input: {
  token: string;
  clientId: string;
  userId: string;
  scope: string | null;
  expiresAt: Date;
}) {
  return prisma.oAuthRefreshToken.create({ data: input });
}

/**
 * Atomically consume a refresh token for rotation. Only succeeds if the
 * token exists, has not been revoked, and has not expired. Returns the row
 * (with its userId/clientId/scope) if revocation succeeded, otherwise null.
 *
 * Two concurrent refreshes therefore cannot both pass — only one
 * `updateMany` flips `revokedAt`, and the other returns count 0 and sees
 * null here.
 */
export async function consumeRefreshToken(token: string) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.oAuthRefreshToken.updateMany({
      where: {
        token,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) return null;
    return tx.oAuthRefreshToken.findUnique({ where: { token } });
  });
}
