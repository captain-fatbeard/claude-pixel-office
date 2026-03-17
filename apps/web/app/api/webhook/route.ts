import { NextResponse } from "next/server";
import { updateUser } from "../../lib/store";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.username) {
      return NextResponse.json(
        { error: "username is required" },
        { status: 400 }
      );
    }

    updateUser({
      username: body.username,
      agents: body.agents || [],
      commits: body.commits || { days: [], total: 0 },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
