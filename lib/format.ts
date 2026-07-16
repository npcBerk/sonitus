const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2
});

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2
});

const signedPercent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
  signDisplay: "always"
});

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2
});

export function formatCurrency(value: number) {
  return currency.format(value);
}

export function formatCompactCurrency(value: number) {
  return compactCurrency.format(value);
}

export function formatPrice(value: number) {
  if (value >= 1000) {
    return compactCurrency.format(value);
  }

  if (value >= 1) {
    return currency.format(value);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  }).format(value);
}

export function formatCompactNumber(value: number) {
  return compactNumber.format(value);
}

export function formatPercent(value: number) {
  return percent.format(value / 100);
}

export function formatSignedPercent(value: number) {
  return signedPercent.format(value / 100);
}

export function formatClock(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Istanbul"
  }).format(new Date(value));
}
