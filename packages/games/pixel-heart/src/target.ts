const T = true, F = false;
export const TARGET: boolean[][] = [
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,T,T,T,F,F,F,F,F,F,T,T,T,F,F,F,F,F],
  [F,F,T,T,T,T,T,F,F,F,F,T,T,T,T,T,F,F,F,F],
  [F,T,T,T,T,T,T,T,F,F,T,T,T,T,T,T,T,F,F,F],
  [F,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,F,F],
  [F,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,F,F],
  [F,F,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,F,F,F],
  [F,F,F,T,T,T,T,T,T,T,T,T,T,T,T,T,F,F,F,F],
  [F,F,F,F,T,T,T,T,T,T,T,T,T,T,T,F,F,F,F,F],
  [F,F,F,F,F,T,T,T,T,T,T,T,T,T,F,F,F,F,F,F],
  [F,F,F,F,F,F,T,T,T,T,T,T,T,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,T,T,T,T,T,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,T,T,T,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,T,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
];

export const TARGET_CELL_COUNT = TARGET.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
