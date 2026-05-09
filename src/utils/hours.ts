// Format total person-hours (stored as minutes)
export const formatTotalHours = (minutes: number): string => {
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hrs}.00`;
  if (rem === 15) return `${hrs}.25`;
  if (rem === 30) return `${hrs}.50`;
  if (rem === 45) return `${hrs}.75`;
  return `${(minutes / 60).toFixed(2)}`;
};

// Calculate on-site hours per cleaner
export const formatOnSiteHours = (minutes: number, cleanerCount: number): string => {
  if (!cleanerCount || cleanerCount < 1) return formatTotalHours(minutes);
  const perCleaner = minutes / cleanerCount;
  const hrs = Math.floor(perCleaner / 60);
  const rem = Math.round(perCleaner % 60);
  if (rem === 0) return `${hrs}.00`;
  if (rem === 15) return `${hrs}.25`;
  if (rem === 30) return `${hrs}.50`;
  if (rem === 45) return `${hrs}.75`;
  return `${(perCleaner / 60).toFixed(2)}`;
};
