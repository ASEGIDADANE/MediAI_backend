export function formatPaymentPrice(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function centsToMajorString(cents: number): string {
  return (cents / 100).toFixed(2);
}
