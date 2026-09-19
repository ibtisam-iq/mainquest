// A hub's label is "Twin Cities (Islamabad and Rawalpindi)" or just "Lahore". Compact places show the
// part before the brackets, with the place named underneath where it differs.
export function hubTitle(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, '');
}
