export const formatTotalHours = (minutes: number): string => {
  const hrs = minutes / 60;
  if (hrs <= 0) return '0 hrs';
  const isWhole = Number.isInteger(hrs);
  const display = isWhole ? `${Math.round(hrs)}` : `${hrs.toFixed(1)}`;
  return `${display} hr${parseFloat(display) === 1 ? '' : 's'}`;
};

export const formatOnSiteHours = (totalMinutes: number, cleanerCount: number): string => {
  if (!cleanerCount || cleanerCount <= 0) return formatTotalHours(totalMinutes);
  const perPerson = totalMinutes / cleanerCount / 60;
  const isWhole = Number.isInteger(perPerson);
  const display = isWhole ? `${Math.round(perPerson)}` : `${perPerson.toFixed(1)}`;
  return `${display} hr${parseFloat(display) === 1 ? '' : 's'} each`;
};