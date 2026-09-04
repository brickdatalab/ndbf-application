// US state codes
export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DC", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

// Full state names (for friendly labels if needed)
export const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DC: "District of Columbia", DE: "Delaware",
  FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export const BUSINESS_ENTITY_TYPES = [
  "Sole Proprietorship",
  "Partnership",
  "Limited Liability Company (LLC)",
  "S-Corporation",
  "C-Corporation",
  "Non-Profit",
  "Other",
];

// Curated list for business-loan / MCA applications; "Other" triggers a conditional text field.
export const INDUSTRIES = [
  "Retail",
  "Restaurant / Food Service",
  "Construction",
  "Healthcare / Medical",
  "Professional Services",
  "Real Estate",
  "Transportation / Trucking",
  "Manufacturing",
  "Technology / Software",
  "Automotive",
  "Wholesale / Distribution",
  "Hospitality / Hotel",
  "Personal Services (Salon, Spa, etc.)",
  "Entertainment / Recreation",
  "Agriculture / Farming",
  "E-commerce / Online Retail",
  "Education / Training",
  "Other",
];

export const SALES_BUCKETS = [
  { value: "gt_5m", label: "Greater than $5M" },
  { value: "1m_5m", label: "$1M – $5M" },
  { value: "500k_1m", label: "$500K – $1M" },
  { value: "100k_500k", label: "$100K – $500K" },
  { value: "lt_100k", label: "Less than $100K" },
];

export const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export const YEARS: string[] = (() => {
  const currentYear = new Date().getFullYear();
  const out: string[] = [];
  for (let y = currentYear; y >= 1920; y--) out.push(String(y));
  return out;
})();

// Mock address suggestions for the autocomplete demo — real production uses
// Google Places / SmartyStreets. These show up as the user types in the Home Address field.
export const MOCK_ADDRESS_SUGGESTIONS: Array<{
  full: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}> = [
  {
    full: "123 Main Street, Brooklyn, NY 11201",
    street: "123 Main Street",
    city: "Brooklyn",
    state: "NY",
    zip: "11201",
  },
  {
    full: "456 Market Ave, San Francisco, CA 94103",
    street: "456 Market Ave",
    city: "San Francisco",
    state: "CA",
    zip: "94103",
  },
  {
    full: "789 Oak Lane, Austin, TX 78704",
    street: "789 Oak Lane",
    city: "Austin",
    state: "TX",
    zip: "78704",
  },
  {
    full: "1010 Lakeshore Dr, Chicago, IL 60601",
    street: "1010 Lakeshore Dr",
    city: "Chicago",
    state: "IL",
    zip: "60601",
  },
  {
    full: "222 Ocean Blvd, Miami, FL 33139",
    street: "222 Ocean Blvd",
    city: "Miami",
    state: "FL",
    zip: "33139",
  },
];
