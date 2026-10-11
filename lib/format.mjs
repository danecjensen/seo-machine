export const longDate = (d) =>
  d?.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
export const isoDate = (d) => d?.toISOString().slice(0, 10);
