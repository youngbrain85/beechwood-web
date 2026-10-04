// AASHTO defect reference list: no/name/appliesTo match the pipeline's db/aashto_reference.json exactly
// (copy ./reference.json, npm run pipeline:fixtures), 26 entries in ascending defect_no.
// reference.test.ts checks the match.
// The cs descriptions (condition states 2/3/4) are not taken from that JSON: they are short paraphrases
// written separately, not copied from any publication, with different wording per defect (at most 120
// characters each).
import type { DefectDef } from './types';

export const DEFECTS: DefectDef[] = [
  {
    no: 1000,
    name: 'Corrosion',
    appliesTo: ['super'],
    cs: {
      2: 'Light rust on the surface, no measurable section loss yet',
      3: 'Corrosion has progressed to visible pitting or section loss',
      4: 'Corrosion has reduced section enough to affect capacity',
    },
  },
  {
    no: 1020,
    name: 'Connection',
    appliesTo: ['super'],
    cs: {
      2: 'Minor deterioration at the connection; fasteners intact',
      3: 'Fasteners are loose, missing, or visibly deteriorated',
      4: 'Connection has lost load-carrying capability',
    },
  },
  {
    no: 1080,
    name: 'Delamination/Spall/Patched Area',
    appliesTo: ['deck', 'super', 'sub', 'other'],
    cs: {
      2: 'Minor spall or sound patch present; no exposed rebar',
      3: 'Spalling exposes rebar with light corrosion beginning',
      4: 'Delamination/spalling has caused major section loss',
    },
  },
  {
    no: 1090,
    name: 'Exposed Rebar',
    appliesTo: ['deck', 'super', 'sub', 'other'],
    cs: {
      2: 'Rebar is exposed but shows no active corrosion',
      3: 'Exposed rebar is actively corroding with section loss starting',
      4: 'Exposed rebar has lost enough section to affect capacity',
    },
  },
  {
    no: 1100,
    name: 'Exposed Prestressing',
    appliesTo: ['super'],
    cs: {
      2: 'Prestressing steel is exposed but shows no corrosion',
      3: 'Exposed prestressing steel shows corrosion or a broken wire',
      4: 'Exposed prestressing has lost enough section to reduce capacity',
    },
  },
  {
    no: 1110,
    name: 'Cracking (PSC)',
    appliesTo: ['super'],
    cs: {
      2: 'Hairline cracking only; no strands are exposed',
      3: 'Cracking is wide enough to expose or threaten strands',
      4: 'Cracking has exposed corroding strands, reducing capacity',
    },
  },
  {
    no: 1120,
    name: 'Efflorescence/Rust Staining',
    appliesTo: ['deck', 'super', 'sub', 'other'],
    cs: {
      2: 'Light efflorescence or staining with no active leak',
      3: 'Heavy staining with a damp surface or slow leak',
      4: 'Heavy staining plus active leakage and deterioration below',
    },
  },
  {
    no: 1130,
    name: 'Cracking (RC and Other)',
    appliesTo: ['deck', 'sub', 'other'],
    cs: {
      2: 'Minor hairline cracking, no map pattern or exposed rebar',
      3: 'Cracks are wide enough to see through, or rebar is exposed',
      4: 'Crack pattern shows a loss of structural integrity',
    },
  },
  {
    no: 1190,
    name: 'Abrasion/Wear (PSC/RC)',
    appliesTo: ['deck', 'super', 'sub', 'other'],
    cs: {
      2: 'Light surface wear; aggregate is not exposed',
      3: 'Wear has exposed the coarse aggregate broadly',
      4: 'Wear has removed enough section to expose reinforcement',
    },
  },
  {
    no: 1900,
    name: 'Distortion',
    appliesTo: ['super', 'other'],
    cs: {
      2: 'Slight out-of-plane distortion; function unaffected',
      3: 'Distortion is enough to alter how load is shared',
      4: 'Distortion is severe enough to threaten capacity',
    },
  },
  {
    no: 2210,
    name: 'Movement',
    appliesTo: ['super'],
    cs: {
      2: 'Bearing is near the limit of its intended movement',
      3: 'Bearing movement has exceeded its intended range',
      4: 'Bearing movement is damaging adjacent elements',
    },
  },
  {
    no: 2220,
    name: 'Alignment',
    appliesTo: ['super'],
    cs: {
      2: 'Bearing is slightly out of alignment but still seats properly',
      3: 'Misalignment is changing how load transfers through the bearing',
      4: 'Misalignment threatens loss of bearing support',
    },
  },
  {
    no: 2230,
    name: 'Bulging, Splitting or Tearing',
    appliesTo: ['super'],
    cs: {
      2: 'Minor bulge or split; elastomer otherwise intact',
      3: 'Bulging or splitting has progressed and affects load path',
      4: "Severe tearing risks loss of the bearing's function",
    },
  },
  {
    no: 2240,
    name: 'Loss of Bearing Area',
    appliesTo: ['super'],
    cs: {
      2: 'Slight reduction in effective bearing contact area',
      3: 'Loss of bearing area is affecting load transfer',
      4: 'Bearing area loss threatens loss of support',
    },
  },
  {
    no: 2310,
    name: 'Leakage',
    appliesTo: ['other'],
    cs: {
      2: 'Occasional minor leakage through the seal',
      3: 'Leakage is frequent enough to reach the bearings below',
      4: 'Continuous leakage is deteriorating elements below the joint',
    },
  },
  {
    no: 2320,
    name: 'Seal Adhesion',
    appliesTo: ['other'],
    cs: {
      2: 'Seal has lost adhesion at isolated spots',
      3: 'Seal has debonded along a significant length',
      4: 'Seal has fully debonded and no longer functions',
    },
  },
  {
    no: 2330,
    name: 'Seal Damage',
    appliesTo: ['other'],
    cs: {
      2: 'Minor tearing or wear in the seal material',
      3: 'Seal is torn enough to let debris or water through',
      4: 'Seal is missing or destroyed over a long stretch',
    },
  },
  {
    no: 2340,
    name: 'Seal Cracking',
    appliesTo: ['other'],
    cs: {
      2: 'Shallow cracks on the seal surface only',
      3: 'Cracks reach partway into the seal thickness',
      4: 'Cracks run through the seal, so it no longer keeps water out',
    },
  },
  {
    no: 2350,
    name: 'Debris Impaction',
    appliesTo: ['other'],
    cs: {
      2: 'Some debris in the joint; movement is not restricted',
      3: 'Debris is starting to restrict joint movement',
      4: 'Debris has jammed the joint, blocking movement entirely',
    },
  },
  {
    no: 2360,
    name: 'Adjacent Deck or Header',
    appliesTo: ['other'],
    cs: {
      2: 'Minor spalling of deck/header concrete near the joint',
      3: 'Moderate spalling or misalignment affects the header',
      4: 'Header deterioration is severe enough to affect the ride',
    },
  },
  {
    no: 2370,
    name: 'Metal Deterioration or Damage',
    appliesTo: ['other'],
    cs: {
      2: 'Minor surface corrosion or a dent in the metal part',
      3: 'Section loss or deformation is affecting how it performs',
      4: 'Metal deterioration is severe enough to impair function',
    },
  },
  {
    no: 3210,
    name: 'Delamination/Spall/Patched Area/Pothole (Wearing Surfaces)',
    appliesTo: ['deck'],
    cs: {
      2: 'Minor spall, patch, or pothole in the wearing surface',
      3: 'Spalling or potholes expose the deck below in several spots',
      4: 'Wearing-surface failure exposes deck reinforcement widely',
    },
  },
  {
    no: 3220,
    name: 'Crack (Wearing Surface)',
    appliesTo: ['deck'],
    cs: {
      2: 'Minor hairline cracking in the wearing surface only',
      3: 'Cracking has progressed enough to let water reach the deck',
      4: 'Cracking has caused the wearing surface to break up',
    },
  },
  {
    no: 4000,
    name: 'Settlement',
    appliesTo: ['sub', 'other'],
    cs: {
      2: 'Minor settlement, within tolerable limits',
      3: 'Settlement is enough to affect ride quality or drainage',
      4: 'Settlement is severe and ongoing, a safety concern',
    },
  },
  {
    no: 6000,
    name: 'Scour',
    appliesTo: ['sub'],
    cs: {
      2: 'Minor scour noted; foundation remains covered',
      3: 'Scour has exposed part of the foundation',
      4: 'Scour has undermined the foundation, threatening stability',
    },
  },
  {
    no: 7000,
    name: 'Damage',
    appliesTo: ['deck', 'super', 'sub', 'other'],
    cs: {
      2: 'Minor damage from an impact or incident',
      3: 'Moderate damage affecting appearance or minor function',
      4: 'Severe damage affecting capacity; needs urgent review',
    },
  },
];
