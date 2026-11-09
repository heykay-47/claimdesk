import { revalidatePath } from "next/cache";
import {
  requireUser,
  AuthenticationError,
  AuthorizationError,
} from "@/server/auth";
import { uploadDocument } from "@/server/upload";
import { InputError } from "@/server/mutations";
import { actionError } from "@/server/action-error";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    await requireUser();
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== request.headers.get("host"))
      return Response.json(
        { error: "This request did not come from ClaimDesk. Reload the page and try again." },
        { status: 403 },
      );
    const input = await request.formData();
    const file = input.get("file");
    if (!(file instanceof File)) throw new InputError("Choose a file to upload.");
    const result = await uploadDocument(input.get("claimId"), file);
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
