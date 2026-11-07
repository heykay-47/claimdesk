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
  return "Could not save this change. Please retry. If it persists, reload the page.";
}
