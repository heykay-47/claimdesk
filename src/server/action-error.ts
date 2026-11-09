import { z } from "zod";
import { AuthenticationError, AuthorizationError } from "./auth";
import { InputError } from "./mutations";
export function actionError(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues
      .map((issue) => `${issue.path.join(" ") || "Input"}: ${issue.message}`)
      .join(". ");
  if (
    error instanceof InputError ||
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError
  )
    return error.message;
  return "This change could not be saved. Try again. If it keeps happening, reload the page.";
}
