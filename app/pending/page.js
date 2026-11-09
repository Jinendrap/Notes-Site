import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Card from "../components/Card";
import PendingNotifier from "../components/PendingNotifier";

export default async function PendingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();

  if (profile?.status === "approved") {
    redirect("/dashboard");
  }

  const removed = profile?.status === "removed";

  return (
    <Card signOut>
      <PendingNotifier />
      <h1>{removed ? "Access removed" : "You do not have access"}</h1>
      <p>
        {removed
          ? "Your access to this site has been removed. The owner has been notified. Please contact the owner."
          : "This is a private site and your account has not been approved. The owner has been notified of your attempt. If you are waiting for approval, you will get in automatically once it is granted."}
      </p>
      <p className="fine">Signed in as {user.email}</p>
    </Card>
  );
}
