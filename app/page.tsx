import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import ScribbleApp from "@/app/components/ScribbleApp";

// reads the user's session cookie, so it must render per request inside <Suspense>
async function AuthedApp() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <ScribbleApp user={{ email: user.email ?? "", createdAt: user.created_at }} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[var(--bg)]" />}>
      <AuthedApp />
    </Suspense>
  );
}