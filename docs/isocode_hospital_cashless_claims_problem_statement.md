# Hospital Cashless Claims and TPA Tracking Workspace

## Client

Company A, Nashik. Multispeciality hospital with 180 beds, 520 staff, revenue ₹110–130 crore a year. 60% of inpatients are cashless insured. An insurance desk of 9 handles claims.

## Today

The desk types pre-authorisation forms, scans doctors' notes and emails them to over 20 insurers and TPAs, each with its own format. Status lives in Excel. Queries come by email and doctors are chased on WhatsApp.

## The problem

Assumptions: 650 cashless admissions a month at ₹85,000 average. 7,800 claims = ₹66.3 crore billed a year. Avoidable deductions from missing documents: 0.8% = ₹53.04 lakh. 30% of claims get a query: 2,340 × 1.5 hours × ₹300 = ₹10.53 lakh. Total ₹63.57 lakh a year, plus patients waiting 4.5 hours for discharge approval.

## Users

Insurance desk executives, the desk head, and treating doctors. The CFO signs the deal.

## The ask

We lose money because a document was missing, not because treatment was wrong. I want every claim in one place with a checklist showing what is missing before we send it. When a TPA sends a query I want to see what they want and by when.

## Must have

- Claim file per admission with a status timeline (pre-auth, query, approved, final bill, settled)
- Document checklist per insurer and procedure, set by an admin, showing gaps before submission
- AI sorting of uploads into checklist slots and pre-filling of pre-auth fields
- Query inbox where AI summarises TPA emails and starts a reply countdown
- Merged PDF packet per TPA, and a dashboard of pending approvals and deductions by reason
- Doctor approval of notes from a phone link

## Core build

Software Engineering candidates must ship this slice end to end, in about 6 to 8 screens: claim file with status timeline, admin checklist per insurer, uploads sorted into checklist slots, gap view, and query inbox with countdown. Roles: desk executive and desk head. AI: document sorting and field pre-fill. Hard part: checklist rules per insurer and procedure. Mock payments, messages and outside systems, and seed from the sample data. The rest of MUST HAVE is optional depth.

## Out of scope

- Integration with insurer portals or claims exchanges
- Changes to billing or the hospital system
- Government scheme claims

## AI or automation

AI classifies documents, extracts key fields and summarises queries. When it is wrong: each pre-filled field shows its source snippet and needs a click to confirm, misfiled documents can be dragged to the right slot, and summaries always show the original email below. Nothing is sent to a TPA automatically.

## Constraints

Patient records are sensitive personal data under the DPDP Act 2023: role-based access, audit logs, hosting in India. IRDAI expects insurers to decide cashless requests in 1 hour and discharge in 3 hours, so the hospital's own delays must be timed. Doctors' notes are often handwritten scans.

## Design

The client values good, minimal design: clean layouts, white space, a restrained palette and clear type, with nothing on screen that lacks a purpose. Design counts as much as features. The claim file must show at a glance what is missing and what is overdue, without the desk scrolling through clutter.

## Budget and time

₹8.5 lakh, 7 weeks. Success: avoidable deductions down 40% in 6 months; discharge approval wait from 4.5 to under 2.5 hours; 90% of queries answered the same day.

## Sample data

| **Claim ID** | **Patient** | **Insurer or TPA** | **Procedure** | **Status** | **Missing Documents** |
| --- | --- | --- | --- | --- | --- |
| CLM-3381 | Rajendra Pawar | Company B (TPA) | Gall bladder removal | Query | Ultrasound report |
| CLM-3382 | Sunita Deshmukh | Company C (insurer) | Total knee replacement | Pre-auth sent | None |
| CLM-3385 | Imran Shaikh | Company D (TPA) | Dengue with low platelets | Enhancement | Latest platelet count |
