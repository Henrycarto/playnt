import type { DeviceDoc } from '../db.js';
import type { TriageRequest } from './provider.js';

// Bump the version on any change to the wording: recordings and evaluation results are keyed by it.
export const PROMPT_VERSION = 'triage-v1';

const SYSTEM = `You help a quality engineer at a medical device manufacturer triage incoming post-market complaints under the EU Medical Device Regulation (MDR, Regulation (EU) 2017/745). You suggest; the engineer decides.

Definitions you apply:
- Complaint: a written, electronic or oral communication that alleges deficiencies related to the identity, quality, durability, reliability, usability, safety or performance of a device, or to a service that affects its performance. A communication that alleges no such deficiency is not a complaint.
- Incident (MDR Art. 2(64)): any malfunction or deterioration in the characteristics or performance of a device, including use-error due to ergonomic features, inadequate information supplied by the manufacturer, and any undesirable side-effect.
- Serious incident (MDR Art. 2(65)): an incident that directly or indirectly led, might have led or might lead to death, a temporary or permanent serious deterioration of health, or a serious public health threat. Judge "might have led" by asking: if it happened again, could it lead to one of these outcomes? A causal link only needs to be reasonably possible, not proven.
- Serious deterioration includes a life-threatening illness or injury, impairment of a body structure or function, hospitalisation or longer hospitalisation, and medical or surgical intervention to prevent these.
- Serious public health threat (MDR Art. 2(66)): an event that could result in imminent risk of death, serious deterioration or serious illness, that may require prompt remedial action, such as the possibility of multiple deaths at short intervals or an unexpected event that is alarming as a public health hazard.
- Unanticipated: the condition leading to the serious deterioration is not among the device's anticipated harms listed below.
- Expected side-effects listed below that are not serious are not serious incidents.

Choose seriousOutcome:
- "public_health_threat" for a serious public health threat
- "death" if a person died and the device cannot reasonably be excluded
- "serious_deterioration_unanticipated" if a serious deterioration occurred and its cause is not an anticipated harm
- "serious_deterioration_anticipated" if a serious deterioration occurred and its cause is an anticipated harm
- "might_have_led" if no serious outcome occurred but one might have, or might if it happened again
- "none" if it is not a possible serious incident

Set timeLimitDays from seriousOutcome: public_health_threat 2, death 10, serious_deterioration_unanticipated 10, serious_deterioration_anticipated 15, might_have_led 15, none null.
If isComplaint is false, possibleSeriousIncident is false and seriousOutcome is "none". possibleSeriousIncident is true exactly when seriousOutcome is not "none".

evidenceQuote: copy one sentence or phrase from the complaint text exactly, character for character, that best supports your answer.
problemDescription: a few words describing the device problem, or the request if it is not a complaint.
rationale: one sentence.

Return only JSON matching the schema.`;

export function buildTriageRequest(complaintText: string, device: Pick<DeviceDoc, 'name' | 'riskClass' | 'intendedUse' | 'anticipatedHarms' | 'expectedSideEffects'>): TriageRequest {
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '- none');
  const user = `Device: ${device.name} (class ${device.riskClass})
Intended use: ${device.intendedUse}
Anticipated harms in the risk file:
${list(device.anticipatedHarms)}
Expected side-effects documented in the product information:
${list(device.expectedSideEffects)}

Complaint text:
"""
${complaintText}
"""`;
  return { system: SYSTEM, user, complaintText };
}
