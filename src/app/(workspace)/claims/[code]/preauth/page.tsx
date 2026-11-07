import { claimFile } from "@/server/workspace";
import { pendingRequiredFields } from "@/domain/preauth-fields";
import { PageTitle } from "@/components/workspace/primitives";
import { PreauthReview } from "@/components/workspace/preauth-review";
export default async function PreauthPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const file = await claimFile(code);
  const pending = pendingRequiredFields(file.fields).length;
  return (
    <>
      <PageTitle
        title="Pre-auth review"
        description={`${file.claim.code} · ${file.claim.patientName}`}
        back={{ href: `/claims/${code}`, label: "Claim file" }}
      >
        <span className={`pill ${pending ? "warning" : "success"}`}>
          {pending} required fields pending
        </span>
      </PageTitle>
      <PreauthReview file={file} />
    </>
  );
}
