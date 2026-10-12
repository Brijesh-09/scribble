import { createClient } from "@/utils/supabase/server";
import { COLUMNS, cleanTags } from "@/libs/notes-server";

// export const COLUMNS =
//   "id, title, content, content_type, storage_path, original_filename, mime_type, tags, inbox, meta, created_at";

// export function cleanTags(input: unknown): string[] {
//   const list = Array.isArray(input) ? input : [];
//   const out: string[] = [];
//   for (const t of list) {
//     if (typeof t !== "string") continue;
//     const v = t.trim().replace(/^#+/, "").replace(/\s+/g, " ").slice(0, 24);
//     if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
//     if (out.length >= 12) break;
//   }
//   return out;
// }

export async function GET() {
  try {
    const supabase = await createClient();

    // Authenticate the current user.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json(
        { error: "You must sign in to view your captures" },
        { status: 401 }
      );
    }

    // Fetch only this user's captures.
    const { data, error } = await supabase
      .from("notes")
      .select(COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Fetch captures failed:", error.message);

      return Response.json(
        { error: "Could not fetch captures" },
        { status: 500 }
      );
    }

    // Create temporary URLs for private files.
    const items = await Promise.all(
      data.map(async (note) => {
        let file_url: string | null = null;

        if (note.storage_path) {
          const { data: signed, error: signedError } =
            await supabase.storage
              .from("scribble-uploads")
              .createSignedUrl(note.storage_path, 3600);

          if (signedError) {
            console.error(
              `Could not sign file URL for note ${note.id}:`,
              signedError.message
            );
          } else {
            file_url = signed.signedUrl;
          }
        }

        return {
          ...note,
          file_url,
          // Keep image_url for compatibility with the existing UI.
          image_url:
            note.content_type === "image" ? file_url : null,
        };
      })
    );

    return Response.json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error("GET /api/notes failed:", error);

    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


export async function POST(request: Request) {
  let uploadedPath: string | null = null;
  let tags: string[] = [];

  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json(
        { error: "You must sign in to create a capture" },
        { status: 401 }
      );
    }

    const contentTypeHeader = request.headers.get("content-type") ?? "";
    const isMultipart = contentTypeHeader.includes("multipart/form-data");

    let title = "";
    let content = "";
    let contentType: "text" | "url" | "image" | "file" = "text";
    let storagePath: string | null = null;
    let originalFilename: string | null = null;
    let mimeType: string | null = null;

    if (isMultipart) {
      const formData = await request.formData();
      const file = formData.get("file");
      const textValue = formData.get("content");

      content = typeof textValue === "string" ? textValue.trim() : "";
      const rawTags = formData.get("tags");
if (typeof rawTags === "string") {
  try {
    tags = cleanTags(JSON.parse(rawTags));
  } catch {
    // ignore malformed tags
  }
}

      if (!(file instanceof File) || file.size === 0) {
        return Response.json(
          { error: "Please attach a file" },
          { status: 400 }
        );
      }

      const allowedTypes = [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];

      if (!allowedTypes.includes(file.type)) {
        return Response.json(
          { error: "Supported files: PNG, JPEG, WebP, GIF, PDF, and DOCX" },
          { status: 400 }
        );
      }

      if (file.size > 5 * 1024 * 1024) {
        return Response.json(
          { error: "Files must be 5 MB or smaller" },
          { status: 400 }
        );
      }

      const isImage = file.type.startsWith("image/");
      contentType = isImage ? "image" : "file";

      // Use a generated storage name instead of trusting the original filename.
      const extension = file.name.includes(".")
        ? file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "bin"
        : "bin";

      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;

      const { data: upload, error: uploadError } = await supabase.storage
        .from("scribble-uploads")
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("File upload failed:", uploadError.message);

        return Response.json(
          { error: "Could not upload file. Check your Storage policies." },
          { status: 500 }
        );
      }

      storagePath = upload.path;
      uploadedPath = upload.path;
      originalFilename = file.name;
      mimeType = file.type;

      const suppliedTitle = formData.get("title");
      
      title =
        typeof suppliedTitle === "string"
          ? suppliedTitle.trim().slice(0, 200)
          : "";

      if (!title) {
        title = file.name.slice(0, 200);
      }
    } else {
      const body = await request.json();

      content = typeof body.content === "string" ? body.content.trim() : "";
      title =
        typeof body.title === "string"
        
          ? body.title.trim().slice(0, 200)
          : "";
          tags = cleanTags(body.tags);

      if (!content) {
        return Response.json(
          { error: "Content is required" },
          { status: 400 }
        );
      }

      if (content.length > 100000) {
        return Response.json(
          { error: "Content is too long" },
          { status: 400 }
        );
      }

      try {
        const url = new URL(content);
        if (url.protocol === "http:" || url.protocol === "https:") {
          contentType = "url";
        }
      } catch {
        // Treat non-URLs as text.
      }

      if (!title) {
        title = contentType === "url" ? content : content.slice(0, 80);
      }
    }

    const { data, error } = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        title,
        content,
        content_type: contentType,
        storage_path: storagePath,
        original_filename: originalFilename,
        mime_type: mimeType,
      })
      .select(
        "id, title, content, content_type, storage_path, original_filename, mime_type, created_at"
      )
      .single();

    if (error) {
      console.error("Create capture failed:", error.message);

      if (uploadedPath) {
        await supabase.storage
          .from("scribble-uploads")
          .remove([uploadedPath]);
      }

      return Response.json(
        { error: "Could not save capture" },
        { status: 500 }
      );
    }

    return Response.json({ success: true, note: data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/notes failed:", error);

    return Response.json(
      { error: "Invalid request or upload failed" },
      { status: 400 }
    );
  }
}