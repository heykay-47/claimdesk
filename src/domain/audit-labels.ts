const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Signed in",
  LOGIN_FAILED: "Failed sign-in attempt",
  LOGOUT: "Signed out",
  CLAIM_CREATE: "Claim created",
  CLAIM_TRANSITION: "Claim moved to a new step",
  DOCUMENT_UPLOAD_TOKEN: "Upload started",
  DOCUMENT_UPLOAD: "Document uploaded",
  DOCUMENT_AI: "AI read a document",
  DOCUMENT_CONFIRM: "Document confirmed",
  DOCUMENT_MOVE: "Document moved to another type",
  DOCUMENT_IDENTITY_OVERRIDE: "Confirmed same patient",
  DOCUMENT_REMOVE: "Document removed from claim",
  DOCUMENT_VIEW: "Document viewed",
  DOCUMENT_DOWNLOAD: "Document downloaded",
  FIELD_REVIEW: "Pre-auth detail checked",
  PACKET_DOWNLOAD: "Packet downloaded",
  QUERY_LOG: "Query logged",
  QUERY_AI: "AI summarised a query",
  QUERY_ANSWER: "Reply recorded",
  RULE_SAVE: "Checklist rule saved",
  RULE_DELETE: "Checklist rule removed",
  DEMO_RESET: "Demo data reset",
};
const ENTITY_LABELS: Record<string, string> = {
  session: "Sign-in",
  claim: "Claim",
  document: "Document",
  query: "Query",
  checklist_rule: "Checklist rule",
  system: "System",
};
export function auditActionLabel(action: string) {
  return (
    ACTION_LABELS[action] ??
    action.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())
  );
}
export function auditEntityLabel(entityType: string) {
  return ENTITY_LABELS[entityType] ?? entityType.replaceAll("_", " ");
}
