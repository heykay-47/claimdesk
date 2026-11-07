"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as mutations from "@/server/mutations";
import { actionError } from "@/server/action-error";
import { resetDemoAsHead } from "@/server/demo-reset";
const handlers = {
  createClaim: mutations.createClaim,
  transitionClaim: mutations.transitionClaim,
  reviewDocument: mutations.reviewDocument,
  retryDocument: mutations.retryDocument,
  reviewField: mutations.reviewField,
  logQuery: mutations.logQuery,
  answerQuery: mutations.answerQuery,
  retryQuerySummary: mutations.retryQuerySummary,
  saveRule: mutations.saveRule,
  deleteRule: mutations.deleteRule,
  resetDemo: resetDemoAsHead,
};
export type ActionName = keyof typeof handlers;
export type ActionResult =
  | {
      ok: true;
      data?: {
        code?: string;
        id?: string;
        aiError?: string | null;
        error?: string | null;
      };
    }
  | { ok: false; error: string };
export async function runAction(
  name: ActionName,
  input: unknown,
): Promise<ActionResult> {
  try {
    const key = z
      .enum(Object.keys(handlers) as [ActionName, ...ActionName[]])
      .parse(name);
    const data = await handlers[key](input);
    revalidatePath("/", "layout");
    return { ok: true, data: data || undefined };
  } catch (error) {
    return { ok: false, error: actionError(error) };
  }
}
