import { z } from "zod";
import { worklist } from "@/server/workspace";
import { PageTitle, EmptyState } from "@/components/workspace/primitives";
import { ActionForm } from "@/components/workspace/action-form";
export default async function NewQueryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const selected = z
    .uuid()
    .optional()
    .catch(undefined)
    .parse((await searchParams).claim);
  const claims = (await worklist()).filter((r) =>
    ["PREAUTH_SUBMITTED", "QUERY"].includes(r.claim.status),
  );
  const nowIST = new Date(new Date().getTime() + 330 * 60_000)
    .toISOString()
    .slice(0, 16);
  return (
    <>
      <PageTitle
        title="Log incoming query"
        description="Paste the payer’s email. AI will summarise the asks and identify a reply deadline."
        back={{ href: "/queries", label: "Query inbox" }}
      />
      {claims.length ? (
        <section className="panel max-w-3xl">
          <div className="panel-body">
            <ActionForm
              action="logQuery"
              label="Log query"
              success="Query recorded"
            >
              <div className="form-grid mb-6">
                <label className="field full">
                  Claim
                  <select
                    className="control"
                    name="claimId"
                    required
                    defaultValue={selected}
                  >
                    <option value="">Choose a claim</option>
                    {claims.map(({ claim }) => (
                      <option key={claim.id} value={claim.id}>
                        {claim.code} · {claim.patientName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  From email address
                  <input
                    className="control"
                    type="email"
                    name="fromAddress"
                    required
                    maxLength={254}
                  />
                </label>
                <label className="field">
                  Received at (IST)
                  <input
                    className="control"
                    type="datetime-local"
                    name="receivedAt"
                    required
                    defaultValue={nowIST}
                  />
                </label>
                <label className="field full">
                  Subject
                  <input
                    className="control"
                    name="subject"
                    required
                    maxLength={300}
                  />
                </label>
                <label className="field full">
                  Original email
                  <textarea
                    className="control"
                    name="body"
                    rows={10}
                    required
                    maxLength={50000}
                  />
                </label>
              </div>
              <p className="muted text-xs mb-5">
                If no explicit deadline is found, the payer’s configured reply
                window applies. The original email is always preserved.
              </p>
            </ActionForm>
          </div>
        </section>
      ) : (
        <EmptyState
          title="No claims are awaiting pre-auth"
          description="Submit a claim’s pre-auth packet before logging an incoming query."
        />
      )}
    </>
  );
}
