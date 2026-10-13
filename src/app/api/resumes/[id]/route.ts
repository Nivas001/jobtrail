import { NextResponse } from "next/server";
import { DB_ID, RESUME_BUCKET, TABLES, createSessionClient } from "@/lib/appwrite";

// Streams a resume PDF using the visitor's own session, so Appwrite's file
// permissions decide whether they may see it.
export async function GET(_request: Request, ctx: RouteContext<"/api/resumes/[id]">) {
  const { id } = await ctx.params;
  const session = await createSessionClient();
  if (!session) return new NextResponse("Not signed in", { status: 401 });
  try {
    const row = await session.tables.getRow({ databaseId: DB_ID, tableId: TABLES.resumes, rowId: id });
    const bytes = await session.storage.getFileView({ bucketId: RESUME_BUCKET, fileId: row.file_id });
    const name = String(row.name).replace(/[^\w .-]+/g, "") || "resume";
    return new NextResponse(bytes, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${name}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
