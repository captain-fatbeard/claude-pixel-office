import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { getAll } from "../../lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = getAll();
  return NextResponse.json(data);
}
