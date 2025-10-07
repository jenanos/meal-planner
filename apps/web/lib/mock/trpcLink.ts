import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@repo/api";
import { handleMockMutation, handleMockQuery } from "./store";

export const mockLink: TRPCLink<AppRouter> = () => ({ op }) => {
  return observable((observer) => {
    const exec = op.type === "query" ? handleMockQuery : op.type === "mutation" ? handleMockMutation : null;
    if (!exec) {
      observer.error(TRPCClientError.from<AppRouter>(new Error(`Mock-link støtter ikke operasjonstype: ${op.type}`)));
      return () => undefined;
    }

    let cancelled = false;

    Promise.resolve(exec(op.path, op.input))
      .then((data) => {
        if (cancelled) return;
        observer.next({ result: { type: "data", data } });
        observer.complete();
      })
      .catch((err) => {
        if (cancelled) return;
        observer.error(TRPCClientError.from<AppRouter>(err instanceof Error ? err : new Error("Mock-link feilet")));
      });

    return () => {
      cancelled = true;
    };
  });
};
