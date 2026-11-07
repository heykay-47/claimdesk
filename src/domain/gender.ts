export function normalizeGender(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "m" || normalized === "male") return "Male";
  if (normalized === "f" || normalized === "female") return "Female";
  if (normalized === "o" || normalized === "other") return "Other";
  return value.trim();
}
