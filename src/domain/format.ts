export function rupeesToPaise(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error(
      "Enter a non-negative amount with up to two decimal places",
    );
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}
export function formatMoney(paise: bigint): string {
  const sign = paise < BigInt(0) ? "-" : "";
  const absolute = paise < BigInt(0) ? -paise : paise;
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(absolute / BigInt(100));
  return `${sign}${formatted}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}
export function formatIST(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(new Date(value));
}
