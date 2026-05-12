import { NextResponse } from "next/server";
import { getApiSession } from "@/server/auth-guards";
import { createImportBatch, ImportError, listImportBatches } from "@/server/imports";
import { toJsonSafe } from "@/lib/json";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function GET() {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;
  const batches = await listImportBatches();
  return NextResponse.json({ batches: toJsonSafe(batches) });
}

export async function POST(request: Request) {
  const session = await getApiSession();
  if (session instanceof NextResponse) return session;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Expected multipart/form-data." },
      { status: 400 },
    );
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "Bad form data." },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "INVALID_INPUT", message: "Missing file." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "INVALID_INPUT", message: "File is larger than 5 MB." },
      { status: 413 },
    );
  }
  const content = await file.text();
  const meta = {
    accountId: form.get("accountId"),
    fileName: file.name,
    format: form.get("format"),
    profileId: form.get("profileId") || undefined,
    columnMap: form.get("columnMap") ? JSON.parse(String(form.get("columnMap"))) : undefined,
    dateFormat: form.get("dateFormat") || undefined,
    decimalSeparator: form.get("decimalSeparator") || undefined,
  };

  try {
    const batch = await createImportBatch(session.user.id, meta, content);
    return NextResponse.json({ batch: toJsonSafe(batch) }, { status: 201 });
  } catch (err) {
    if (err instanceof ImportError) {
      const status =
        err.code === "ACCOUNT_NOT_FOUND" || err.code === "PROFILE_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    throw err;
  }
}
