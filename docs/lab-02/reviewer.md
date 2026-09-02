# Lab 2 — Peer Review Record

**Author:** Wirachat — 67070501041 — GitHub: @WirachatTH

**Peer reviewer:** 67070501035 — GitHub: @Menelaus122

**Note that verdicts, comments, and responses were summarized. Full verdicts and comments are available on each Pull-Request.**

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer verdict | My Response |
|----|--------|------------------|-------------|
| #29 | feature/1-doc-prep | Approve — all ACs pass, first pass. | "Thanks for reviewing. I will proceed on the next issue right away." |
| #30 | feature/2-data-model | Changes requested (one test defect) → Approve — schema/seed verified field-by-field against a live DB. | "Got it. I'll report back as soon as it's fixed." |
| #31 | feature/3-design-system-shell | Approve — audited tokens, components, and accessibility wiring; full suite green, first pass. | "Thank you for reviewing in full details! I will proceed with the next issue right away and report back asap." |
| #32 | feature/4-requester-selector | Changes requested (both ACs held functionally but weren't test-protected — could delete the code and the suite stayed green) → Approve — re-verified from a clean export + fresh `npm ci`. | "Got it. I'll fix the issues as soon as possible." |
| #33 | feature/5-create-ticket | Approve, with three small follow-ups noted for later. | "Thank you for taking your time to review the progress! I'll start working on the next issue right away!" |
| #34 | feature/6-attachment-lifecycle | Changes requested (three blockers) → Approve — zero drift confirmed over three consecutive runs. | "I have checked and fixed the problems found in this issue na krub." |
| #35 | feature/7-my-tickets | Changes requested (2 of 4 ACs failing; a query param 500'd) → Approve — all four ACs pass, both blockers fixed and test-protected. | "I have fixed the problems you've found. Let me know if there's still anything missing!" |
| #36 | feature/8-ticket-detail | Approve, with four follow-ups (deferred onto the Issue 9 branch by agreement). | "Thank you mak mak krub." |
| #37 | feature/9-responsive-e2e-qa | Changes requested (AC-3 blocker: E2E screenshots generated correctly but written to an unmounted path, plus a broken documented command) → Approve — verified by rebuilding the stack from scratch and confirming all 18 screenshots land on the host. | "Got it. I will fix it asap!" |
| — | lab2-staging → main (release) | Pending — release PR not yet opened. | — |

## Pull Requests I reviewed for my partner
*(Partner's repo: Menelaus122/TokTickITV2)*

| My Comment | Response |
| --- | --- |
| PR #20 (Issue 1, spec/plan docs) — Approved: docs cover the issue's requirements in full detail. | "Thx so much kub. I will hurry moving forward na kub" |
| PR #21 (Issue 2, data model & seed) — Approved: single `removedAt` timestamp prevents state drift, migration extends existing tables safely. | "Thx for your review and merging kub. I will start work on Issue3 and will let u know if it is finished." |
| PR #22 (Issue 3, UI foundation) — Approved: Zen Green tokens perfectly isolated in `:root` with zero stray hex codes, components cleanly separated. | "Thx for ur review again. I will start head toward Issue4 kub." |
| PR #23 (Issue 4, requester context) — Approved: pulled the branch and ran it myself (91/91 tests, `tsc --noEmit` clean), read `RequesterContext`/`RequesterSelection`/`AppShell` line by line. | "Thx so much for ur review, I will start on Issue5." |
| PR #24 (Issue 5, ticket creation) — Approved: ran every test documented in the PR myself, results were valid. | "Thx kub. We are half way leaw. Let's head on toward endpoint." |
| PR #25 (Issue 6, My Tickets) — Approved: `requesterId` scoping enforced natively in the Prisma `where` clause — zero cross-requester leakage risk. | "ok kub, I will start the next issue and will finished it asap" |
| PR #26 (Issue 7, Ticket Detail + attachments) — Approved: tested against a clean database, client 176/176 and server 160/160, no failures. | "Thx for ur review again kub. I will start the next issue asap." |
| PR #27 (Issue 8, app shell nav) — Approved: client 202/202 (including 26 new nav tests), server 160/160. | "Thx kub. There are only 2 issue left. I will keep going forward kub." |
| PR #28 (Issue 9, E2E + responsive suites) — Approved: pulled the branch and ran the full Docker stack myself — backend 161/161, frontend 202/202, Playwright 19/19, `tsc --noEmit` clean both sides. | "Thank you for your review kub. I will start on issue10" |
| PR #30 (Issue 10, Create Ticket completion) — Approved: ran the full stack again rather than trusting the numbers — backend 161/161 (unchanged as expected), frontend 220/220, Playwright 21/21, both sides clean. | "Thx, for ur review kub. I will start on issue11, which is about documentation." |
