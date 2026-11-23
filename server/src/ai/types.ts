import type { AllocationResult } from '../../../shared/types.js';

/** Where a piece of generated text came from. */
export type TextSource = 'ai' | 'template';

export interface PlanContext {
  result: AllocationResult;
  studentName: string;
  projectTitle: string;
  deadline: string;
  equipmentNames: string[];
}

export interface RequestSummaryContext {
  projectTitle: string;
  description: string;
  studentName: string;
  equipmentName: string;
  hoursNeeded: number;
  deadline: string;
  freeHours: number;
  risks: string[];
}

export interface PlanExplanation {
  summary: string;
  explanations: Map<string, string>;
  source: TextSource;
}
