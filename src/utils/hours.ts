export const formatTotalHours = (minutes: number, cleanerCount: number = 1): string => {
  const totalMinutes = minutes * cleanerCount;
  const hrs = totalMinutes / 60;
  if (hrs <= 0) return '0 hrs';
  const isWhole = Number.isInteger(hrs);
  const display = isWhole ? `${Math.round(hrs)}` : `${hrs.toFixed(1)}`;
  return `${display} hr${parseFloat(display) === 1 ? '' : 's'}`;
};

export const formatOnSiteHours = (totalMinutes: number, cleanerCount: number): string => {
  if (!cleanerCount || cleanerCount <= 0) return formatTotalHours(totalMinutes);
  // totalMinutes from Jobber is ALREADY per-person time (on-site time)
  // Do NOT divide by cleanerCount again
  const hours = totalMinutes / 60;
  const isWhole = Number.isInteger(hours);
  const display = isWhole ? `${Math.round(hours)}` : `${hours.toFixed(1)}`;
  return `${display} hr${parseFloat(display) === 1 ? '' : 's'} each`;
};