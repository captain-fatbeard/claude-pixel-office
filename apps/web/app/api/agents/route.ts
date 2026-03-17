import { NextResponse } from "next/server";
import { getAll } from "../../lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = getAll();
  return NextResponse.json(data);
}
