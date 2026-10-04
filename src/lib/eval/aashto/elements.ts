// AASHTO element reference list (12 entries, ascending number).
// no/name/unit/category match the pipeline's db/aashto_reference.json exactly (copy ./reference.json,
// npm run pipeline:fixtures); reference.test.ts (parity) checks the match.
import type { ElementDef } from './types';

export const ELEMENTS: ElementDef[] = [
  { no: 12, name: 'Reinforced Concrete Deck', unit: 'sq ft', category: 'deck' },
  { no: 109, name: 'Prestressed Concrete Open Girder/Beam', unit: 'ft', category: 'super' },
  { no: 205, name: 'Reinforced Concrete Column', unit: 'each', category: 'sub' },
  { no: 210, name: 'Reinforced Concrete Pier Wall', unit: 'ft', category: 'sub' },
  { no: 215, name: 'Reinforced Concrete Abutment', unit: 'ft', category: 'sub' },
  { no: 234, name: 'Reinforced Concrete Pier Cap', unit: 'ft', category: 'sub' },
  { no: 301, name: 'Pourable Joint Seal', unit: 'ft', category: 'other' },
  { no: 305, name: 'Assembly Joint with Seal', unit: 'ft', category: 'other' },
  { no: 310, name: 'Elastomeric Bearing', unit: 'each', category: 'super' },
  { no: 321, name: 'Reinforced Concrete Approach Slab', unit: 'sq ft', category: 'other' },
  { no: 331, name: 'Reinforced Concrete Bridge Railing', unit: 'ft', category: 'other' },
  { no: 510, name: 'Wearing Surfaces', unit: 'sq ft', category: 'deck' },
];
