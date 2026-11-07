import { createHash } from "node:crypto";
import type { ClaimStatus } from "../src/domain/claim-status";
export function seedId(key: string) {
  const hex = createHash("sha256")
    .update(`claimdesk-demo-v1:${key}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export const DOCUMENT_CATALOGUE = [
  [
    "PREAUTH_FORM",
    "Pre-authorisation form",
    "Patient, policy and proposed treatment details",
  ],
  ["PHOTO_ID", "Photo ID", "Government-issued identity card"],
  ["POLICY_CARD", "Policy card", "Insurer member card and policy details"],
  [
    "DOCTOR_NOTES",
    "Doctor's notes",
    "Clinical history, admission notes, handwritten progress notes",
  ],
  [
    "ULTRASOUND_REPORT",
    "Ultrasound report",
    "USG abdomen findings and impression",
  ],
  ["XRAY_REPORT", "X-ray report", "Radiograph findings"],
  ["MRI_REPORT", "MRI report", "Magnetic resonance imaging findings"],
  [
    "CBC_REPORT",
    "Complete blood count",
    "Haemoglobin, white cell and platelet results",
  ],
  [
    "PLATELET_COUNT",
    "Platelet count",
    "Latest platelet count with collection date",
  ],
  [
    "IMPLANT_INVOICE",
    "Implant invoice",
    "Prosthesis brand, serial number and invoice",
  ],
  [
    "COST_ESTIMATE",
    "Cost estimate",
    "Estimated hospital treatment costs in INR",
  ],
  [
    "DISCHARGE_SUMMARY",
    "Discharge summary",
    "Final diagnosis and discharge advice",
  ],
  ["FINAL_BILL", "Final bill", "Itemised final hospital bill"],
  [
    "INVESTIGATION_BILLS",
    "Investigation bills",
    "Receipts for diagnostic investigations",
  ],
  ["OTHER", "Other document", "Does not clearly match a catalogue type"],
] as const;
export const PAYERS = [
  { name: "Company B", kind: "TPA" as const, queryReplyHours: 24 },
  { name: "Company C", kind: "INSURER" as const, queryReplyHours: 24 },
  { name: "Company D", kind: "TPA" as const, queryReplyHours: 12 },
  { name: "Company E", kind: "INSURER" as const, queryReplyHours: 24 },
  { name: "Company F", kind: "TPA" as const, queryReplyHours: 48 },
];
export const PROCEDURES = [
  {
    name: "Gall bladder removal",
    specialty: "General surgery",
    diagnosis: "Symptomatic cholelithiasis",
    icd10: "K80.20",
  },
  {
    name: "Total knee replacement",
    specialty: "Orthopaedics",
    diagnosis: "Severe osteoarthritis of knee",
    icd10: "M17.9",
  },
  {
    name: "Dengue with low platelets",
    specialty: "Internal medicine",
    diagnosis: "Dengue fever with thrombocytopenia",
    icd10: "A90",
  },
  {
    name: "Coronary angioplasty",
    specialty: "Cardiology",
    diagnosis: "Coronary artery disease",
    icd10: "I25.10",
  },
  {
    name: "Cataract surgery",
    specialty: "Ophthalmology",
    diagnosis: "Age-related cataract",
    icd10: "H25.9",
  },
];
export type SeedClaim = {
  code: string;
  name: string;
  age: number;
  gender: string;
  payer: number;
  procedure: number;
  status: ClaimStatus;
  amount: number;
  docs: string[];
};
const baseDocs = [
  "PREAUTH_FORM",
  "PHOTO_ID",
  "POLICY_CARD",
  "DOCTOR_NOTES",
  "COST_ESTIMATE",
];
export const SEED_CLAIMS: SeedClaim[] = [
  {
    code: "CLM-3381",
    name: "Rajendra Pawar",
    age: 52,
    gender: "Male",
    payer: 0,
    procedure: 0,
    status: "QUERY",
    amount: 95000,
    docs: baseDocs,
  },
  {
    code: "CLM-3382",
    name: "Sunita Deshmukh",
    age: 64,
    gender: "Female",
    payer: 1,
    procedure: 1,
    status: "PREAUTH_SUBMITTED",
    amount: 240000,
    docs: [...baseDocs, "XRAY_REPORT"],
  },
  {
    code: "CLM-3385",
    name: "Imran Shaikh",
    age: 31,
    gender: "Male",
    payer: 2,
    procedure: 2,
    status: "ENHANCEMENT",
    amount: 78000,
    docs: [...baseDocs, "CBC_REPORT", "PLATELET_COUNT"],
  },
  {
    code: "CLM-3383",
    name: "Meera Patil",
    age: 45,
    gender: "Female",
    payer: 3,
    procedure: 0,
    status: "PREAUTH_DRAFT",
    amount: 88000,
    docs: ["PHOTO_ID", "POLICY_CARD", "DOCTOR_NOTES"],
  },
  {
    code: "CLM-3384",
    name: "Vilas Jadhav",
    age: 59,
    gender: "Male",
    payer: 4,
    procedure: 3,
    status: "APPROVED",
    amount: 185000,
    docs: baseDocs,
  },
  {
    code: "CLM-3386",
    name: "Lata More",
    age: 68,
    gender: "Female",
    payer: 1,
    procedure: 4,
    status: "FINAL_BILL_SUBMITTED",
    amount: 42000,
    docs: [
      ...baseDocs,
      "DISCHARGE_SUMMARY",
      "FINAL_BILL",
      "INVESTIGATION_BILLS",
    ],
  },
  {
    code: "CLM-3387",
    name: "Sanjay Shinde",
    age: 57,
    gender: "Male",
    payer: 3,
    procedure: 1,
    status: "SETTLED",
    amount: 225000,
    docs: [
      ...baseDocs,
      "XRAY_REPORT",
      "DISCHARGE_SUMMARY",
      "FINAL_BILL",
      "INVESTIGATION_BILLS",
    ],
  },
  {
    code: "CLM-3388",
    name: "Asha Kale",
    age: 36,
    gender: "Female",
    payer: 4,
    procedure: 2,
    status: "REJECTED",
    amount: 62000,
    docs: [...baseDocs, "CBC_REPORT"],
  },
];
export function seedAdmission(claim: SeedClaim) {
  const index = SEED_CLAIMS.findIndex((entry) => entry.code === claim.code);
  return new Date(
    new Date("2026-11-07T08:00:00Z").getTime() -
      (index === 3 ? 1 : 50 + index * 4) * 3_600_000,
  );
}
export function seedFields(claim: SeedClaim, admittedAt: Date) {
  return {
    patient_name: claim.name,
    age: String(claim.age),
    gender: claim.gender,
    policy_number: `SYN-${claim.code.slice(4)}-2026`,
    provisional_diagnosis: PROCEDURES[claim.procedure].diagnosis,
    icd10_code: PROCEDURES[claim.procedure].icd10,
    proposed_procedure: PROCEDURES[claim.procedure].name,
    date_of_admission: admittedAt.toISOString().slice(0, 10),
    treating_doctor: "Dr. Kavita Bendre",
    estimated_cost: String(claim.amount),
    clinical_history_summary:
      claim.procedure === 2
        ? "Fever for 4 days, positive NS1, falling platelet count. No active bleeding."
        : "Symptoms persisted despite outpatient treatment. Planned inpatient management discussed with patient.",
  };
}
