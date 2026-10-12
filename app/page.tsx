import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import ScribbleApp from "@/app/components/ScribbleApp";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

    return <ScribbleApp user={{ email: user.email ?? "", createdAt: user.created_at }} />;
}