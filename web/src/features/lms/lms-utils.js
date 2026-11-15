export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function eventDate(event) {
  const stamp = Number(event.timestart || 0);
  return stamp > 0 ? new Date(stamp * 1000) : null;
}

export function formatDate(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return 'Not specified';
  return new Date(value * 1000).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

export function formatTime(date) {
  return date ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
}
