import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { buildPacket, type PacketCover } from "../src/server/packet-pdf";
import * as renderer from "../src/server/packet-pdf";

const state = vi.hoisted(() => ({
  authenticated: true,
  audit: vi.fn(),
  readIds: [] as string[],
  pdf: new Uint8Array(),
  mismatch: false,
}));
vi.mock("@/server/auth", async (original) => {
  const actual = await original<typeof import("../src/server/auth")>();
  return {
    ...actual,
    requireUser: async () => {
      if (!state.authenticated) throw new actual.AuthenticationError();
      return { id: "desk", name: "Priya Kulkarni" };
    },
  };
});
vi.mock("@/server/audit", () => ({ audit: state.audit }));
vi.mock("@/server/storage", () => ({
  readDocument: async (id: string) => {
    state.readIds.push(id);
    return {
      bytes: state.pdf,
      mimeType: "application/pdf",
    };
  },
}));
vi.mock("@/server/workspace", () => ({
  claimFile: async () => ({
    claim: {
      id: "claim",
      code: "CLM-3381",
      patientName: "Synthetic Patient",
      patientAge: 52,
      patientGender: "Male",
      policyNumber: "SYN-001",
    },
    payer: { name: "Company B" },
    procedure: { name: "Gall bladder removal" },
    stage: "PREAUTH",
    resolved: [{ id: "rule", documentTypeId: "usg", requirement: "REQUIRED" }],
    checklist: {
      ready: false,
      blockers: [
        { kind: "DOCUMENT", documentTypeId: "usg", state: "MISSING" },
        ...(state.mismatch
          ? [
              {
                kind: "IDENTITY",
                documentId: "wrong",
                differences: [
                  {
                    field: "patient_name",
                    found: "Imran Shaikh",
                    expected: "Synthetic Patient",
                    sourceSnippet: "Patient: Imran Shaikh",
                  },
                ],
              },
            ]
          : []),
      ],
      slots: [{ rule: { id: "rule" }, state: "MISSING" }],
    },
    ref: { types: [{ id: "usg", label: "Ultrasound report" }] },
    fields: state.mismatch
      ? [
          {
            documentId: "wrong",
            fieldKey: "patient_name",
            status: "CONFIRMED",
            value: "Imran Shaikh",
          },
        ]
      : [],
    files: [
      {
        id: "confirmed",
        fileName: "confirmed.pdf",
        mimeType: "application/pdf",
        status: "CONFIRMED",
        documentTypeId: "form",
        sizeBytes: 1000,
        uploadedAt: new Date(),
      },
      {
        id: "pending",
        fileName: "pending.pdf",
        mimeType: "application/pdf",
        status: "NEEDS_REVIEW",
        documentTypeId: "usg",
        sizeBytes: 1000,
        uploadedAt: new Date(),
      },
      ...(state.mismatch
        ? [
            {
              id: "wrong",
              fileName: "wrong-patient.pdf",
              mimeType: "application/pdf",
              status: "CONFIRMED",
              documentTypeId: "notes",
              sizeBytes: 1000,
              uploadedAt: new Date(),
              identity: {
                kind: "MISMATCH",
                differences: [
                  {
                    field: "patient_name",
                    found: "Imran Shaikh",
                    expected: "Synthetic Patient",
                    sourceSnippet: "Patient: Imran Shaikh",
                  },
                ],
              },
              identityOverrideBy: null,
            },
          ]
        : []),
    ],
  }),
}));
import { GET } from "../src/app/api/claims/[code]/packet/route";

const cover: PacketCover = {
  code: "CLM-TEST",
  patient: "Fictional Patient",
  payer: "Company B",
  policy: "SYN-TEST",
  procedure: "Demo procedure",
  stage: "PREAUTH",
  preparedBy: "Priya Kulkarni",
  generatedAt: new Date("2026-11-09T10:00:00Z"),
  blockers: ["Ultrasound report missing"],
  checklist: [
    { label: "Ultrasound report", requirement: "REQUIRED", state: "MISSING" },
  ],
  fields: [{ label: "Patient name", value: "Fictional Patient" }],
};
beforeEach(async () => {
  state.authenticated = true;
  state.mismatch = false;
  state.audit.mockClear();
  state.readIds = [];
  const pdf = await PDFDocument.create();
  pdf.addPage();
  state.pdf = new Uint8Array(await pdf.save());
});
describe("claim packet PDF", () => {
  it("appends PDFs and PNG, JPEG and WebP images as pages after the cover", async () => {
    const image = sharp({
      create: { width: 20, height: 30, channels: 3, background: "white" },
    });
    const files = [
      {
        id: "pdf",
        fileName: "source.pdf",
        mimeType: "application/pdf",
        bytes: state.pdf,
      },
    ];
    for (const format of ["png", "jpeg", "webp"] as const)
      files.push({
        id: format,
        fileName: `source.${format}`,
        mimeType: `image/${format}`,
        bytes: await image.toFormat(format).toBuffer(),
      });
    const result = await buildPacket(cover, files);
    expect(result.totalPages).toBe(result.coverPages + 4);
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getTitle()).toBe("CLM-TEST PREAUTH packet");
    expect(pdf.getAuthor()).toBe("Priya Kulkarni");
  });
  it("paginates long values and never silently omits a corrupt file", async () => {
    const result = await buildPacket(
      {
        ...cover,
        fields: [{ label: "Long history", value: "history ".repeat(3000) }],
      },
      [],
    );
    expect(result.coverPages).toBeGreaterThan(1);
    await expect(
      buildPacket(cover, [
        {
          id: "bad",
          fileName: "bad.pdf",
          mimeType: "application/pdf",
          bytes: new Uint8Array([1]),
        },
      ]),
    ).rejects.toThrow("Could not merge bad.pdf");
  });
  it("denies unauthenticated downloads before reading private files", async () => {
    state.authenticated = false;
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ code: "CLM-3381" }),
    });
    expect(response.status).toBe(401);
    expect(state.readIds).toEqual([]);
    expect(state.audit).not.toHaveBeenCalled();
  });
  it("includes confirmed files only, preserves incomplete readiness and audits the download", async () => {
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ code: "CLM-3381" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(state.readIds).toEqual(["confirmed"]);
    expect(
      (await PDFDocument.load(await response.arrayBuffer())).getPageCount(),
    ).toBe(2);
    expect(state.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PACKET_DOWNLOAD",
        detail: expect.objectContaining({
          ready: false,
          blockerCount: 1,
          documentIds: ["confirmed"],
        }),
      }),
    );
  });
  it("excludes even previously confirmed wrong-patient files and their values, and lists the blocker on the cover", async () => {
    state.mismatch = true;
    const render = vi.spyOn(renderer, "buildPacket");
    try {
      const response = await GET(new Request("https://example.test"), {
        params: Promise.resolve({ code: "CLM-3381" }),
      });
      expect(response.status).toBe(200);
      expect(state.readIds).toEqual(["confirmed"]);
      expect(
        (await PDFDocument.load(await response.arrayBuffer())).getPageCount(),
      ).toBe(2);
      expect(render.mock.calls[0][0].blockers).toContainEqual(
        expect.stringContaining("Imran Shaikh"),
      );
      expect(render.mock.calls[0][0].fields).toEqual([]);
      expect(render.mock.calls[0][1].map((file) => file.id)).toEqual([
        "confirmed",
      ]);
      expect(state.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            blockerCount: 2,
            documentIds: ["confirmed"],
          }),
        }),
      );
    } finally {
      render.mockRestore();
    }
  });
});
