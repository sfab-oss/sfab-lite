import { createFileRoute } from "@tanstack/react-router";
import { SignInPage } from "@/components/auth/sign-in";

export const Route = createFileRoute("/signin")({
  ssr: false,
  component: SignInPage,
});
