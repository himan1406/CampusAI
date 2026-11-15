export function normalizeIndianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const localNumber = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(localNumber) ? `+91${localNumber}` : '';
}
