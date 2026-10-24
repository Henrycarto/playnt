// Regulatory terms shown as tooltips. Every entry cites a primary source checked on 24 and 25 October 2026.
export const SOURCES = {
  mdr: { label: 'Regulation (EU) 2017/745 (MDR)', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32017R0745' },
  mdcg: { label: 'MDCG 2023-3 Rev.2, vigilance terms and concepts', url: 'https://health.ec.europa.eu/document/download/af1433fd-ed64-4c53-abc7-612a7f16f976_en?filename=mdcg_2023-3_en.pdf' },
  periods: { label: 'Regulation (EEC, Euratom) No 1182/71, periods and time limits', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31971R1182' },
  iso13485: { label: 'ISO 13485:2016', url: 'https://www.iso.org/standard/59752.html' },
  arg: { label: 'Arbeitsruhegesetz section 7 (Austria)', url: 'https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10008541&Paragraf=7' },
} as const;

export type SourceKey = keyof typeof SOURCES;

export interface GlossaryEntry {
  term: string;
  definition: string;
  cite: string;
  source: SourceKey;
}

export const GLOSSARY = {
  complaint: {
    term: 'Complaint',
    definition: 'A written, electronic or oral communication that alleges deficiencies related to the identity, quality, durability, reliability, usability, safety or performance of a device, or to a service that affects its performance.',
    cite: 'EN ISO 13485:2016 definition, as quoted in MDCG 2023-3 Rev.2. Handling is ISO 13485:2016 clause 8.2.2 "Complaint handling".',
    source: 'mdcg',
  },
  incident: {
    term: 'Incident',
    definition: 'Any malfunction or deterioration in the characteristics or performance of a device on the market, including use-error due to ergonomic features, any inadequacy in the information supplied by the manufacturer and any undesirable side-effect.',
    cite: 'MDR Article 2(64)',
    source: 'mdr',
  },
  seriousIncident: {
    term: 'Serious incident',
    definition: 'An incident that directly or indirectly led, might have led or might lead to death, a temporary or permanent serious deterioration of a person\'s state of health, or a serious public health threat.',
    cite: 'MDR Article 2(65)',
    source: 'mdr',
  },
  publicHealthThreat: {
    term: 'Serious public health threat',
    definition: 'An event which could result in imminent risk of death, serious deterioration in a person\'s state of health, or serious illness, that may require prompt remedial action. Reported within 2 days.',
    cite: 'MDR Article 2(66) and Article 87(4)',
    source: 'mdr',
  },
  unanticipated: {
    term: 'Unanticipated',
    definition: 'A serious deterioration is unanticipated if the condition leading to it was not considered in the manufacturer\'s risk assessment. Death or an unanticipated serious deterioration is reported within 10 days.',
    cite: 'MDCG 2023-3 Rev.2, Q12; MDR Article 87(5)',
    source: 'mdcg',
  },
  awarenessDate: {
    term: 'Awareness date',
    definition: 'The date the first employee or representative of the manufacturer receives information about the potentially serious incident. It is day 0 of the reporting period.',
    cite: 'MDCG 2023-3 Rev.2, Q14 and Q15',
    source: 'mdcg',
  },
  limit15: {
    term: '15-day limit',
    definition: 'Report a serious incident immediately once a causal relationship is established or reasonably possible, and not later than 15 days after awareness.',
    cite: 'MDR Article 87(3)',
    source: 'mdr',
  },
  limit10: {
    term: '10-day limit',
    definition: 'Death or an unanticipated serious deterioration: report immediately, and not later than 10 days after awareness.',
    cite: 'MDR Article 87(5)',
    source: 'mdr',
  },
  limit2: {
    term: '2-day limit',
    definition: 'Serious public health threat: report immediately, and not later than 2 days after awareness of the threat.',
    cite: 'MDR Article 87(4)',
    source: 'mdr',
  },
  calendarDays: {
    term: 'Calendar days',
    definition: 'Periods count every day. If the last day is a Saturday, Sunday or public holiday, the period ends on the next working day. A period of two days or more includes at least two working days.',
    cite: 'Regulation 1182/71 Article 3(4) and 3(5); MDCG 2023-3 Rev.2, Q14',
    source: 'periods',
  },
  publicHolidays: {
    term: 'Public holidays',
    definition: 'Public holidays are those of the Member State where the action is taken. Playnt uses the Austrian list for 2026 and 2027. Other Member States have other public holidays.',
    cite: 'Regulation 1182/71 Article 2(1); Arbeitsruhegesetz section 7(2)',
    source: 'arg',
  },
  uncertain: {
    term: 'Uncertain reportability',
    definition: 'If the manufacturer is uncertain whether an incident is reportable, it still reports within the time limit.',
    cite: 'MDR Article 87(7)',
    source: 'mdr',
  },
  trendReporting: {
    term: 'Trend reporting',
    definition: 'Manufacturers report any statistically significant increase in the frequency or severity of incidents that are not serious, or of expected side-effects. The method and observation period are set in the post-market surveillance plan.',
    cite: 'MDR Article 88(1)',
    source: 'mdr',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
