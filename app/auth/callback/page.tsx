import type { Metadata } from "next";
import AuthCallbackClient from "./AuthCallbackClient";

export const metadata: Metadata = { title: "Connexion en cours" };

export default function AuthCallbackPage() {
  return <AuthCallbackClient />;
}
