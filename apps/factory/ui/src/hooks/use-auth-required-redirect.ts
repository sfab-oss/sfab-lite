import { useEffect } from "react";
import { AuthRequiredError } from "@/api";
import { endUnusableSession } from "@/auth-client";
import { useRouter } from "@/router";

/** Send the user to sign-in when an apps query/mutation reports auth loss. */
export function useAuthRequiredRedirect(error: unknown) {
  const { navigate } = useRouter();

  useEffect(() => {
    if (!(error instanceof AuthRequiredError)) {
      return;
    }
    let cancelled = false;
    endUnusableSession().then(() => {
      if (!cancelled) {
        navigate({ name: "sign-in" }, true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [error, navigate]);
}
