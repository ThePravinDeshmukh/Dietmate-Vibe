export interface FoodItem {
  name: string;
  gramsPerExchange: number;
  unit?: string;
}

export declare const FOOD_EXCHANGES: Record<string, FoodItem[]>;
