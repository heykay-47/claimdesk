import { references } from "@/server/workspace";
import { PageTitle } from "@/components/workspace/primitives";
import { ActionForm } from "@/components/workspace/action-form";
export default async function NewClaimPage() {
  const ref = await references();
  return (
    <>
      <PageTitle
        title="New claim"
        description="Enter admission details, then upload documents."
        back={{ href: "/claims", label: "Claims" }}
      />
      <section className="panel max-w-3xl">
        <div className="panel-body">
          <ActionForm
            action="createClaim"
            label="Create claim"
            success="Claim created"
          >
            <section className="form-section">
              <h2>Patient and policy</h2>
              <div className="form-grid">
                <label className="field">
                  Patient name
                  <input
                    name="patientName"
                    className="control"
                    required
                    maxLength={300}
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  UHID
                  <input
                    name="uhid"
                    className="control"
                    required
                    maxLength={300}
                  />
                </label>
                <label className="field">
                  Age
                  <input
                    name="patientAge"
                    className="control"
                    type="number"
                    min="0"
                    max="130"
                    required
                  />
                </label>
                <label className="field">
                  Gender
                  <select name="patientGender" className="control" required>
                    <option value="">Select gender</option>
                    {["Female", "Male", "Other"].map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Policy number
                  <input
                    name="policyNumber"
                    className="control"
                    required
                    maxLength={300}
                  />
                </label>
                <label className="field">
                  Insurer or TPA
                  <select name="payerId" className="control" required>
                    <option value="">Select insurer or TPA</option>
                    {ref.payers.map((payer) => (
                      <option value={payer.id} key={payer.id}>
                        {payer.name} · {payer.kind === "TPA" ? "TPA" : "Insurer"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            <section className="form-section">
              <h2>Admission details</h2>
              <div className="form-grid">
                <label className="field full">
                  Procedure
                  <select name="procedureId" className="control" required>
                    <option value="">Select procedure</option>
                    {ref.procedures.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Treating doctor
                  <input
                    name="treatingDoctor"
                    className="control"
                    required
                    maxLength={300}
                  />
                </label>
                <label className="field">
                  Admitted at
                  <input
                    name="admittedAt"
                    className="control"
                    type="datetime-local"
                    required
                  />
                  <span className="hint">Indian Standard Time (IST)</span>
                </label>
                <label className="field">
                  Estimated amount (₹)
                  <input
                    name="amount"
                    className="control mono"
                    type="number"
                    min="0"
                    max="9999999999"
                    step="0.01"
                    required
                  />
                </label>
              </div>
            </section>
            <p className="muted text-xs mb-5">
              The claim starts as a pre-auth draft. That means the approval
              request has not been sent to the insurer or TPA yet. The claim is
              assigned to you.
            </p>
          </ActionForm>
        </div>
      </section>
    </>
  );
}
