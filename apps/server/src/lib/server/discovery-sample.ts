/** Real jobs come first; demo slots stay reserved across radius changes. */
export function discoverySample<T extends { id: string; isDemo: boolean; distanceMeters: number }>(jobs: T[]): T[] {
  const sorted = [...jobs].sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));
  const real = sorted.filter(job => !job.isDemo);
  const demos = sorted.filter(job => job.isDemo);
  const sample = [
    ...demos.filter(job => job.distanceMeters <= 1000).slice(0, 2),
    ...demos.filter(job => job.distanceMeters > 1000 && job.distanceMeters <= 5000).slice(0, 2),
    ...demos.filter(job => job.distanceMeters > 5000).slice(0, 1),
  ];
  return [...real, ...sample];
}
