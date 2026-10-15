import { createClient } from "@/utils/supabase/server";

const COLUMNS = "id, token, scope, tag, note_id, title, created_at";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "You must sign in" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("shares")
      .select(COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Fetch shares failed:", error.message);
      return Response.json({ error: "Could not load your share links" }, { status: 500 });
    }
    return Response.json({ success: true, shares: data });
  } catch (error) {
    console.error("GET /api/shares failed:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "You must sign in" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const scope = body?.scope;
    if (scope !== "all" && scope !== "tag" && scope !== "item") {
      return Response.json({ error: "Invalid share type" }, { status: 400 });
    }

    const tag = typeof body.tag === "string" ? body.tag.trim().slice(0, 24) : "";
    const noteId = typeof body.noteId === "string" || typeof body.noteId === "number" ? String(body.noteId) : "";
    let title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";

    if (scope === "tag" && !tag) {
      return Response.json({ error: "Choose a tag to share" }, { status: 400 });
    }

    if (scope === "item") {
      if (!noteId) return Response.json({ error: "Choose an item to share" }, { status: 400 });
      // you can only share your own items
      const { data: note } = await supabase
        .from("notes")
        .select("id, title")
        .eq("id", noteId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!note) return Response.json({ error: "Item not found" }, { status: 404 });
      if (!title) title = note.title;
    }
    if (!title) title = scope === "all" ? "Everything" : tag;

    // reuse the existing link for the same thing instead of minting a new one each time
    let existing = supabase.from("shares").select(COLUMNS).eq("user_id", user.id).eq("scope", scope);
    if (scope === "tag") existing = existing.eq("tag", tag);
    if (scope === "item") existing = existing.eq("note_id", noteId);
    const { data: found } = await existing.limit(1).maybeSingle();
    if (found) return Response.json({ success: true, share: found });

    const { data, error } = await supabase
      .from("shares")
      .insert({
        user_id: user.id,
        scope,
        tag: scope === "tag" ? tag : null,
        note_id: scope === "item" ? noteId : null,
        title,
      })
      .select(COLUMNS)
      .single();

    if (error) {
      console.error("Create share failed:", error.message);
      return Response.json({ error: "Could not create the link" }, { status: 500 });
    }
    return Response.json({ success: true, share: data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/shares failed:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}