import { claimFile } from "@/server/workspace";
import { pendingRequiredFields } from "@/domain/preauth-fields";
import { PageTitle } from "@/components/workspace/primitives";
import { PreauthReview } from "@/components/workspace/preauth-review";
import { hasIdentityMismatch } from "@/domain/identity";
export default async function PreauthPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const file = await claimFile(code);
  const pending = pendingRequiredFields(
    file.fields.filter(
      (field) =>
        !file.files.some(
          (doc) => doc.id === field.documentId && hasIdentityMismatch(doc),
        ),
    ),
  ).length;
  return (
    <>
      <PageTitle
        title="Pre-auth details check"
        description={`${file.claim.code} · ${file.claim.patientName}`}
        back={{ href: `/claims/${code}`, label: "Claim file" }}
      >
        <span className={`pill ${pending ? "warning" : "success"}`}>
          {pending
            ? `${pending} required ${pending === 1 ? "detail" : "details"} to check`
            : "All required details confirmed"}
        </span>
      </PageTitle>
      <PreauthReview file={file} />
    </>
  );
}
