"use client";

import { createClient } from "@/utils/supabase/client";

export default function SignoutButton() {
  async function signOut() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      alert("Could not sign out. Please try again.");
      return;
    }

    window.location.assign("/login");
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="rounded border px-3 py-2"
    >
      Sign out
    </button>
  );
}