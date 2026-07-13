export type Plan = {
  name: string;
  price: number;
  features: string[];
  priceLabel?: string;
  contactSales?: boolean;
};

export type Plans = {
  [key: string]: Plan;
};
