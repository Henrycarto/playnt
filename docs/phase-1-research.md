# Playnt: Phase 1 research and plan

Status: draft for review, 24 October 2026. No code yet.

Playnt is a portfolio simulation with synthetic data only. It is not a validated quality management system.

## 1. Regulatory basis (verified)

Every statement below was read from the source on 24 October 2026. Quotes are from the Official Journal text of Regulation (EU) 2017/745 (MDR) unless noted.

| ID | Statement used by the app | Source |
| --- | --- | --- |
| R1 | "Incident" covers malfunction or deterioration, use-error due to ergonomic features, inadequate manufacturer information and any undesirable side-effect. | MDR Art. 2(64) [S1] |
| R2 | "Serious incident": an incident that directly or indirectly led, might have led or might lead to (a) death, (b) temporary or permanent serious deterioration of health, or (c) a serious public health threat. | MDR Art. 2(65) [S1] |
| R3 | "Serious public health threat": imminent risk of death, serious deterioration or serious illness, that may require prompt remedial action. | MDR Art. 2(66) [S1] |
| R4 | Manufacturers report serious incidents, except expected side-effects that are documented, quantified and subject to trend reporting under Art. 88. | MDR Art. 87(1)(a) [S1] |
| R5 | General limit: immediately once causality is established or reasonably possible, and **not later than 15 days** after awareness. | MDR Art. 87(3) [S1] |
| R6 | Serious public health threat: immediately, **not later than 2 days** after awareness. | MDR Art. 87(4) [S1] |
| R7 | Death or unanticipated serious deterioration: immediately, **not later than 10 days** after awareness. | MDR Art. 87(5) [S1] |
| R8 | An incomplete initial report may be followed by a complete report. | MDR Art. 87(6) [S1] |
| R9 | If uncertain whether reportable, report within the time limit anyway. | MDR Art. 87(7) [S1] |
| R10 | Trend reporting: statistically significant increase in frequency or severity of non-serious incidents or expected side-effects; the method and observation period are defined by the manufacturer in the PMS plan. | MDR Art. 88(1) [S1] |
| R11 | PMS system per device, part of the QMS, used among other things "to detect and report trends in accordance with Article 88". | MDR Art. 83(1), 83(3)(h) [S1] |
| R12 | PMS plan per Annex III Section 1.1 (Art. 84); PMS report for class I (Art. 85); PSUR for IIa (at least every two years), IIb and III (at least annually) (Art. 86). | MDR Art. 84 to 86 [S1] |
| R13 | Basic reporting criteria A (incident occurred), B (led, might have led or might lead to a serious outcome, judged as "if it happened again"), C (causal link established, reasonably possible or suspected). | MDCG 2023-3 Rev.2, Q2 [S2] |
| R14 | Serious deterioration can include life-threatening illness or injury, impairment of a body structure or function, hospitalisation or its prolongation, medical or surgical intervention to prevent these. | MDCG 2023-3 Rev.2, Q2 [S2] |
| R15 | "Unanticipated" means the condition was not considered in the manufacturer's risk assessment. | MDCG 2023-3 Rev.2, Q12 [S2] |
| R16 | Time limits are calendar days. Day 0 is the awareness date; the period starts the next day at 00:00:01 and ends on day 2, 10 or 15 at 23:59:59. If that day is a Saturday, Sunday or public holiday, it moves to the next working day. | MDCG 2023-3 Rev.2, Q14 [S2], Regulation 1182/71 Art. 3(1), 3(2)(b), 3(4) [S3] |
| R17 | Any period of two days or more includes at least two working days. | Regulation 1182/71 Art. 3(5) [S3] |
| R18 | Public holidays are those of the Member State (or EU institution) where the action is to be taken. | Regulation 1182/71 Art. 2(1) [S3] |
| R19 | Awareness date: when the first employee or representative of the manufacturer (or its outsourced complaint handler) receives the information. If new information later makes an incident reportable, the period runs from that date. When the consequence escalates, the earliest resulting deadline applies. | MDCG 2023-3 Rev.2, Q14 and Q15 [S2] |
| R20 | "Complaint" (EN ISO 13485:2016, as quoted by MDCG): written, electronic or oral communication alleging deficiencies related to identity, quality, durability, reliability, usability, safety or performance of a device, or a service affecting its performance. | MDCG 2023-3 Rev.2, footnote to Q1 [S2], citing ISO 13485:2016 [S4] |

Notes on sources:

- MDCG documents are explicitly not legally binding (cover page of [S2]). The app labels them "guidance".
- MDCG 2023-3 Rev.2 footnote 25 labels the two-working-day rule as Art. 3(4) of 1182/71; the regulation itself numbers it Art. 3(5). The app cites the regulation.

### ISO 13485 complaint handling

- ISO 13485:2016 is current: edition 3, "last reviewed and confirmed in 2025" [S4].
- The text of the standard is paywalled. The only content I use is the complaint definition, and I take it from the public MDCG quote (R20).
- Clause 8.2.2 "Complaint handling": number and title confirmed by Henry from a licensed copy on 25 October 2026. The app cites the number and title only, nothing else from the standard.

### IMDRF adverse event terminology

- What it is: a coded terminology for adverse event reports, in annexes A to G. Annex A is Medical Device Problem; B to D are cause investigation (type, findings, conclusion); E and F are health effects (clinical signs, health impact); G is device components [S5].
- Code format `X|nn[nn][nn]`: annex letter, then two digits per level, up to three levels. Code at the most detailed level known; several codes may be combined [S5].
- Licence, two different notices:
  - The N43 document itself (2020, Edition 4): "There are no restrictions on the reproduction or use of this document", with no endorsement implied [S5].
  - The imdrf.org website terms: reproduction allowed for personal, research, educational or internal use, "only if you or your organisation do not use the reproduction for any commercial purpose", with a required acknowledgement text; anything else needs written authorisation [S6].
- The code tables (Annex A release files) are distributed separately from N43. Their own terms are **unverified**: imdrf.org did not respond to requests from this machine (only archived copies loaded), so I could not open the current Annex A release.

Decision (25 October 2026): no IMDRF codes in the MVP. MIT grants commercial reuse and the website terms do not, and the code file terms are unverified. The model and the quality engineer record a free-text problem description instead. IMDRF Annex A coding is listed in the README as a next step.

### Sources

- [S1] Regulation (EU) 2017/745, Official Journal L 117, 5.5.2017. https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32017R0745 (read via the Publications Office copy of the same act, https://publications.europa.eu/resource/celex/32017R0745)
- [S2] MDCG 2023-3 Rev.2, Questions and Answers on vigilance terms and concepts, January 2025. https://health.ec.europa.eu/document/download/af1433fd-ed64-4c53-abc7-612a7f16f976_en?filename=mdcg_2023-3_en.pdf
- [S3] Regulation (EEC, Euratom) No 1182/71 determining the rules applicable to periods, dates and time limits. https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31971R1182
- [S4] ISO 13485:2016, catalogue page. https://www.iso.org/standard/59752.html
- [S5] IMDRF/AE WG/N43 FINAL:2020 (Edition 4), IMDRF terminologies for categorized Adverse Event Reporting. https://www.imdrf.org/docs/imdrf/final/technical/imdrf-tech-200318-ae-terminologies-n43.pdf
- [S6] IMDRF website terms and conditions. https://www.imdrf.org/terms-and-conditions
- IMDRF AE terminology working group page (for the annex release files): https://www.imdrf.org/working-groups/adverse-event-terminology
- [S7] Austria, Arbeitsruhegesetz section 7, Rechtsinformationssystem des Bundes. https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10008541&Paragraf=7

## 2. The triage the model suggests

Input to the model: complaint text, plus the referenced device's name, intended use, anticipated harms and expected side-effects (from the fictional risk file). No reporter details are sent.

Output, strict JSON, validated with Zod. Anything that fails parsing or validation is stored raw with status `needs_manual_triage`, never repaired:

```json
{
  "isComplaint": true,
  "possibleSeriousIncident": true,
  "seriousOutcome": "death | serious_deterioration_unanticipated | serious_deterioration_anticipated | public_health_threat | might_have_led | none",
  "timeLimitDays": 10,
  "problemDescription": "short free text, e.g. display froze, delivery stopped without alarm",
  "evidenceQuote": "exact substring of the complaint text",
  "rationale": "one line"
}
```

- `timeLimitDays` is derived, not trusted: the server maps `seriousOutcome` to 2, 10 or 15 days (R5 to R7) and stores a mismatch as `needs_manual_triage`. One source of truth for the regulatory rule.
- `evidenceQuote` must be an exact substring of the complaint (checked server side), so the UI can highlight it.
- The human always decides: the suggestion never changes the deadline shown as "confirmed" until a quality engineer confirms or corrects it. Until then the queue shows the suggested deadline, labelled "suggested".

Deadline clock (only R16 to R19):

- Due = awareness date + N calendar days, 23:59:59 Europe/Vienna (seat of the fictional manufacturer), moved forward past Saturdays, Sundays and Austrian public holidays, with the two-working-day rule for the 2-day limit.
- Austrian public holidays 2026 and 2027 from Arbeitsruhegesetz section 7(2) [S7]: 1 and 6 January, Easter Monday, 1 May, Ascension Day, Whit Monday, Corpus Christi, 15 August, 26 October, 1 November, 8 December, 25 and 26 December. Movable dates are computed from Easter and checked by test against a fixed table. Outside 2026 and 2027 the app refuses to compute a holiday-aware deadline rather than guess.
- R18 makes holidays Member-State specific, and a serious incident is reported to the authority where it occurred, so the UI notes next to each deadline that the Austrian calendar is used and other Member States differ.
- Optional "reportability awareness date" (R19) for the exceptional case. If time is short, this is the first thing cut.
- The UI states "report immediately; this is the latest date", because the legal duty is "immediately" (R5 to R7).

## 3. MongoDB modelling

- `devices`: referenced from complaints by id. Read rarely, changed independently, shared by many complaints.
- `complaints`: the complaint with its triage history **embedded** (each model suggestion and human decision as an array element). The complaint screen reads them together in one query.
- `auditEvents`: a separate append-only collection. One event per suggestion, decision, intake and status change, with a sequence number per complaint and a hash of the previous event, so edits are detectable. The API has no update or delete path; the Docker setup creates a database user with only `find` and `insert` on this collection.
- Compound indexes: `{ status: 1, "deadline.dueAt": 1 }` for the queue sort; `{ deviceId: 1, awarenessAt: -1 }` for trends; `{ complaintId: 1, seq: 1 }` unique for the audit trail.
- JSON Schema validators on all three collections, Zod at the API boundary.
- Trends: one aggregation pipeline, `$match` (confirmed or corrected triage, date range) then `$group` by device, confirmed problem code and `$dateTrunc` month, then `$lookup` device names. It shows counts only. Art. 88 significance needs a manufacturer-defined method (R10), which a simulation cannot honestly provide, so the page says "counts, not a trend report".

## 4. Labelled evaluation set

Files: `eval/labelled-complaints.json` (40 items), `eval/devices.json` (5 fictional devices of the fictional Orrowell Medical GmbH).

| | Count |
| --- | --- |
| Clear serious incidents | 14 |
| Clear non-incidents (6 not complaints at all, 8 complaints) | 14 |
| Ambiguous | 12 |
| Labelled possible serious incident | 21 (2-day: 2, 10-day: 9, 15-day: 10) |
| Labelled not a complaint | 7 |

How labels were set:

1. Written and labelled in one pass, before any prompt exists, by applying R1 to R7, R13 to R15 and R20 to each text and to the device's risk file entries. Each item carries a one-line `basis`.
2. "Unanticipated" is decided only against the device's `anticipatedHarms` list (R15), so the model has the same information as the labeller.
3. Ambiguous items take the conservative label where R9 and MDCG Q2 criterion C point that way ("cannot reasonably be excluded"), and are flagged `difficulty: "ambiguous"`. Results are reported for all 40 and for the 28 clear items separately.
4. Limitation, stated in the README: one labeller, not a qualified regulatory affairs person. I suggest you review the 12 ambiguous labels (10 minutes) and change any you disagree with before the first model run. After that the labels are frozen.
5. No tuning on this set: the prompt is developed against a separate set of 8 development complaints written in Phase 3. The evaluation script runs once per prompt version and writes model name, prompt version, date and per-item outputs to `eval/results/`.

## 5. Name check (report only)

- GitHub: no repository named exactly `playnt` in search; nearest are `playntell`, `playnts`, `Playntric`. No user or organisation `playnt`. `Henrycarto/playnt` is free.
- npm: unscoped package `playnt` does not exist (registry 404). The `@playnt` org page could not be checked automatically (npmjs.com blocks scripted requests).
- Fictional manufacturer name "Orrowell Medical": no company found in a web search.

## 6. Weekend MVP plan

Repo: npm workspaces. `apps/api` (Express, TypeScript), `apps/web` (React, Vite, TypeScript), `packages/shared` (Zod schemas and the deadline function, used by both), `eval/`.

| When | Phase | Output |
| --- | --- | --- |
| Sat night / Sun morning | 2 | Palettes and two high-fidelity screens, then wait for your pick |
| Sun | 3 | Data model, intake, triage provider (Gemini plus demo replay), confirm or correct, audit trail, deadline clock, queue |
| Mon | 3, 4 | Complaint screen, trends, tooltips; API tests, evaluation run (needs your key), Playwright with axe |
| Tue | 4 | CI, no-network test, README draft. Core pushed Tuesday night after your OK on diff and screenshots |
| After Wed | 5, 6 | Icon, deploy, portfolio |

Demo mode: responses are recorded once from Gemini by a script (with your key) and replayed by complaint text hash. Text without a recording in demo mode goes to `needs_manual_triage`, it is not invented. Until your key is in `.env`, no recordings exist, so the demo seeds would all show "needs manual triage". The key is needed by Monday morning at the latest.

Deliberately left out:

- Authentication and roles (one simulated quality engineer; decisions record a role, not a person)
- Manufacturer Incident Report (MIR) forms, EUDAMED submission, follow-up and final reports
- Field safety corrective actions, PSUR or PMS report generation
- Statistical trend significance under Art. 88 (counts only, see section 3)
- Public holidays of Member States other than Austria (stated in the UI)
- IMDRF adverse event coding (free-text problem description instead)
- IVDR, attachments, email intake, multiple languages, multiple manufacturers

Cut order if time runs short: reportability awareness date, trends filters, laptop-width polish of the trends page. Tests are not cut.

## 7. Decisions (25 October 2026)

1. No IMDRF codes in the MVP; free-text problem description; IMDRF coding as a README next step.
2. ISO 13485:2016 clause 8.2.2 "Complaint handling" may be cited by number and title only.
3. Henry reviews the 12 ambiguous labels in `docs/label-review.md` before they are frozen.
4. Deadlines in Europe/Vienna, with Austrian public holidays 2026 and 2027.
5. Model: `gemini-3.8-flash` (same as medrag-eval), key in `.env`.
