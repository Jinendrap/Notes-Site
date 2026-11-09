import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Card from "./components/Card";
import LoginButton from "./components/LoginButton";

export default async function Home({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <Card>
      <h1>Notes Site</h1>
      <p>Private access only. Please sign in.</p>
      {searchParams?.signedout && !searchParams?.kicked ? (
        <p className="notice">You have been signed out. See you soon.</p>
      ) : null}
      {searchParams?.kicked ? (
        <p className="notice">
          You were signed out because your account was used on another device.
          Only one device can be signed in at a time.
        </p>
      ) : null}
      {searchParams?.error ? (
        <p className="notice" style={{ color: "#911510" }}>
          Login failed. Please try again.
        </p>
      ) : null}
      <LoginButton />
    </Card>
  );
}
