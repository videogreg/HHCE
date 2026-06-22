export const formatHrsMins = (totalMinutes: number): string => {
  if (totalMinutes <= 0) return '0 min';
  const hrs = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hrs === 0) return `${mins} min`;
  if (mins === 0) return `${hrs} hr${hrs === 1 ? '' : 's'}`;
  return `${hrs} hr${hrs === 1 ? '' : 's'} ${mins} min`;
};

export const formatHrsMinsShort = (totalMinutes: number): string => {
  if (totalMinutes <= 0) return '0m';
  const hrs = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
};

export const formatTotalHours = (minutes: number, cleanerCount: number = 1): string => {
  const totalMinutes = minutes * cleanerCount;
  return formatHrsMins(totalMinutes);
};

export const formatOnSiteHours = (totalMinutes: number, cleanerCount: number): string => {
  if (!cleanerCount || cleanerCount <= 0) return formatTotalHours(totalMinutes);
  // totalMinutes from Jobber is ALREADY per-person time (on-site time)
  // Do NOT divide by cleanerCount again
  return formatHrsMins(totalMinutes) + ' each';
};
