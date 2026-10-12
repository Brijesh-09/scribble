import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  // Prevent redirects to external websites.
  const safeNext =
    next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/";

  if (code) {
    const supabase = await createClient();

    const { error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(
        new URL(safeNext, url.origin)
      );
    }

    console.error("Auth code exchange failed:", error.message);
  }

  return NextResponse.redirect(
    new URL("/login?error=confirmation", url.origin)
  );
}