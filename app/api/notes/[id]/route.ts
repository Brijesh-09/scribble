import { createClient } from "@/utils/supabase/server";
import { COLUMNS, cleanTags } from "@/libs/notes-server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    const { data: row, error: findError } = await supabase
      .from("notes")
      .select("id, content_type")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (findError) {
      console.error("Find capture failed:", findError.message);
      return Response.json({ error: "Could not update capture" }, { status: 500 });
    }
    if (!row) {
      return Response.json({ error: "Capture not found" }, { status: 404 });
    }

    const update: Record<string, unknown> = {};

    // links and files can be retitled; a text note's title is derived from its text
    if (typeof body.title === "string" && row.content_type !== "text") {
      const title = body.title.trim().slice(0, 200);
      if (title) update.title = title;
    }

    // text notes edit their text, files and images edit their note, links keep their URL
    if (typeof body.content === "string" && row.content_type !== "url") {
      const content = body.content.trim();
      if (row.content_type === "text") {
        if (!content) return Response.json({ error: "A note can't be empty" }, { status: 400 });
        if (content.length > 100000) return Response.json({ error: "Content is too long" }, { status: 400 });
        update.content = content;
        update.title = content.slice(0, 80);
      } else {
        if (content.length > 5000) return Response.json({ error: "That note is too long" }, { status: 400 });
        update.content = content;
      }
    }

    if (body.tags !== undefined) update.tags = cleanTags(body.tags);

    if (Object.keys(update).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("notes")
      .update(update)
      .eq("id", row.id)
      .eq("user_id", user.id)
      .select(COLUMNS)
      .single();

    if (error) {
      console.error("Update capture failed:", error.message);
      return Response.json({ error: "Could not update capture" }, { status: 500 });
    }

    return Response.json({ success: true, note: data });
  } catch (error) {
    console.error("PATCH /api/notes/[id] failed:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
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

    const { data: note, error: findError } = await supabase
      .from("notes")
      .select("id, storage_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (findError) {
      console.error("Find capture failed:", findError.message);
      return Response.json({ error: "Could not delete capture" }, { status: 500 });
    }
    if (!note) {
      return Response.json({ error: "Capture not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("notes")
      .delete()
      .eq("id", note.id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Delete capture failed:", deleteError.message);
      return Response.json({ error: "Could not delete capture" }, { status: 500 });
    }

    // best effort: the row is already gone, so don't fail if the file lingers
    if (note.storage_path) {
      const { error: removeError } = await supabase.storage.from("scribble-uploads").remove([note.storage_path]);
      if (removeError) console.error("File cleanup failed:", removeError.message);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/notes/[id] failed:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}