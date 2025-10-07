import { observable } from "@trpc/client/observable";
import type { TRPCLink } from "@trpc/client";
import type { AppRouter } from "@repo/api";
import { handleMockMutation, handleMockQuery } from "./store";

export const mockLink: TRPCLink<AppRouter> = () => ({ op }) => {
  return observable((observer) => {
    const exec = op.type === "query" ? handleMockQuery : op.type === "mutation" ? handleMockMutation : null;
    if (!exec) {
      observer.error(new Error(`Mock-link støtter ikke operasjonstype: ${op.type}`));
      return () => undefined;
    }

    let cancelled = false;

    Promise.resolve()
      .then(() => exec(op.path, op.input))
      .then((data) => {
        if (cancelled) return;
        observer.next({ result: { type: "data", data } });
        observer.complete();
      })
      .catch((err) => {
        if (cancelled) return;
        observer.error(err);
      });

    return () => {
      cancelled = true;
    };
  });
};
