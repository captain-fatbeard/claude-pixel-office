import { NextResponse } from "next/server";
import { updateMachine } from "../../lib/store";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.machineId || !body.machineName) {
      return NextResponse.json(
        { error: "machineId and machineName are required" },
        { status: 400 }
      );
    }

    updateMachine({
      machineId: body.machineId,
      machineName: body.machineName,
      agents: body.agents || [],
      commits: body.commits || { days: [], total: 0 },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
