import { createFileRoute } from "@tanstack/react-router";
import { SignInScreen } from "@/screens/sign-in";

export const Route = createFileRoute("/signin")({
  ssr: false,
  component: SignInScreen,
});
