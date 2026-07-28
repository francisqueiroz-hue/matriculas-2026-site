import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { handleApiError } from "@/lib/http";
import { createClassSchema } from "@/lib/validators";

export async function GET() {
  try {
    const session = await requireRole("ADMIN", "STAFF");
    const classes = await prisma.class.findMany({
      where: { schoolId: session.schoolId },
      include: { _count: { select: { students: true } } },
      orderBy: [{ year: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ classes });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole("ADMIN");
    const body = createClassSchema.parse(await request.json());

    const created = await prisma.class.create({
      data: { ...body, schoolId: session.schoolId },
    });
    return NextResponse.json({ class: created }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
