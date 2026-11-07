export const PREAUTH_FIELDS = [
  { key: "patient_name", label: "Patient name", required: true, type: "text" },
  { key: "age", label: "Age", required: true, type: "number" },
  { key: "gender", label: "Gender", required: true, type: "text" },
  { key: "policy_number", label: "Policy number", required: true, type: "text" },
  { key: "provisional_diagnosis", label: "Provisional diagnosis", required: true, type: "text" },
  { key: "icd10_code", label: "ICD-10 code", required: false, type: "text" },
  { key: "proposed_procedure", label: "Proposed procedure", required: true, type: "text" },
  { key: "date_of_admission", label: "Date of admission", required: true, type: "date" },
  { key: "treating_doctor", label: "Treating doctor", required: true, type: "text" },
  { key: "estimated_cost", label: "Estimated cost (INR)", required: true, type: "money" },
  { key: "clinical_history_summary", label: "Clinical history", required: true, type: "textarea" },
] as const;
export type PreauthFieldKey = (typeof PREAUTH_FIELDS)[number]["key"];
export type ReviewedField = { fieldKey: string; status: "PENDING" | "CONFIRMED" | "REJECTED"; value: string };
export function pendingRequiredFields(fields: readonly ReviewedField[]) {
  return PREAUTH_FIELDS.filter((definition) => definition.required && !fields.some((field) => field.fieldKey === definition.key && field.status === "CONFIRMED" && field.value.trim() !== ""));
}
