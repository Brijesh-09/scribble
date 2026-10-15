import { createClient } from "@/utils/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "You must sign in" }, { status: 401 });
    }

    const { error } = await supabase.from("shares").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      console.error("Delete share failed:", error.message);
      return Response.json({ error: "Could not stop sharing" }, { status: 500 });
    }
    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/shares/[id] failed:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
