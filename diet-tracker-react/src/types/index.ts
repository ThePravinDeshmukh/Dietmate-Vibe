import type { Document } from 'mongodb';

export interface NutrientEntry {
  category: string;
  amount: number;
  unit: string;
  required: number;
}

export interface MongoNutrientEntry extends Document {
  date: string;
  category: string;
  amount: number;
  unit: string;
  required: number;
}

export interface DailyProgress {
  date: string;
  entries: NutrientEntry[];
  overallCompletion: number;
}

export interface DailyRequirement {
  amount: number;
  unit: string;
}

export interface DailyRequirements {
  [key: string]: DailyRequirement;
}
