import { createTRPCReact } from "@trpc/react-query";
import { mockTrpc } from "./mock/mockTrpcClient";

const mockFlag = (process.env.NEXT_PUBLIC_MOCK_MODE ?? process.env.MOCK_MODE ?? "").toString().toLowerCase();
const isMockMode = mockFlag === "true" || mockFlag === "1";

// In mock mode we want to avoid importing the backend package to keep the
// frontend build fully self-contained. Falling back to an untyped router keeps
// the runtime behaviour identical while preventing bundlers from touching the
// backend workspace package during builds.
const realTrpc = createTRPCReact<any>();

export const trpc = (isMockMode ? mockTrpc : realTrpc) as any;
