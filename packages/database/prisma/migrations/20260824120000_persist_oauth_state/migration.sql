-- Refresh-token rotation grace: remember which token replaced this one so a
-- client that never received the rotation response can retry briefly.
ALTER TABLE "OAuthRefreshToken" ADD COLUMN "replacedByToken" TEXT;

CREATE INDEX "OAuthRefreshToken_clientId_idx" ON "OAuthRefreshToken"("clientId");

-- CreateTable
CREATE TABLE "OAuthPendingApproval" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scope" TEXT,
    "state" TEXT,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthPendingApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthPendingApproval_token_key" ON "OAuthPendingApproval"("token");
CREATE INDEX "OAuthPendingApproval_userId_idx" ON "OAuthPendingApproval"("userId");
CREATE INDEX "OAuthPendingApproval_clientId_idx" ON "OAuthPendingApproval"("clientId");

-- AddForeignKey
ALTER TABLE "OAuthPendingApproval" ADD CONSTRAINT "OAuthPendingApproval_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthPendingApproval" ADD CONSTRAINT "OAuthPendingApproval_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "OAuthClientApproval" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthClientApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClientApproval_userId_clientId_key" ON "OAuthClientApproval"("userId", "clientId");
CREATE INDEX "OAuthClientApproval_clientId_idx" ON "OAuthClientApproval"("clientId");

-- AddForeignKey
ALTER TABLE "OAuthClientApproval" ADD CONSTRAINT "OAuthClientApproval_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthClientApproval" ADD CONSTRAINT "OAuthClientApproval_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
