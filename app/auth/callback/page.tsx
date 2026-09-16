import type { Metadata } from "next";
import AuthCallbackClient from "./AuthCallbackClient";

export const metadata: Metadata = { title: "Confirmation du compte" };

export default function AuthCallbackPage() {
  return <AuthCallbackClient />;
}
