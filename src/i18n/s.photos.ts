// ------------------------------------------------------------------
//  UI strings: damage photos (the shared photo block and the enlarged view). Rules as in the header of s.app.ts.
//  Round labels are stored values and are shown as stored.
// ------------------------------------------------------------------
export const SPhotos = {
  title: 'Photos',
  count: (n: number): string => `${n} ${n === 1 ? 'photo' : 'photos'}`,
  none: 'No photos',
  loading: 'Loading photos…',
  loadError: 'Could not load the photo list — showing what is available.',
  broken: 'Photo unavailable',
  open: (round: string): string => `Enlarge photo${round ? ` (${round})` : ''}`,
  round: 'Round',
  takenAt: 'Taken',
  file: 'Tablet file',
  prev: 'Previous photo',
  next: 'Next photo',
  position: (i: number, n: number): string => `${i} / ${n}`,
  close: 'Close',
} as const;
