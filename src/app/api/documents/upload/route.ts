import { revalidatePath } from "next/cache";
import {
  requireUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth";
import { z } from "zod";
import {
  prepareDirectUpload,
  completeDirectUpload,
} from "@/server/direct-upload";
import { actionError } from "@/server/action-error";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    await requireUser();
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== request.headers.get("host"))
      return Response.json(
        { error: "Invalid request origin" },
        { status: 403 },
      );
    const input = z
      .object({ action: z.enum(["prepare", "complete"]), data: z.unknown() })
      .parse(await request.json());
    const result =
      input.action === "prepare"
        ? await prepareDirectUpload(input.data)
        : await completeDirectUpload(input.data);
    revalidatePath("/", "layout");
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: actionError(error) },
      {
        status:
          error instanceof AuthenticationError
            ? 401
            : error instanceof AuthorizationError
              ? 403
              : 400,
      },
    );
  }
}
