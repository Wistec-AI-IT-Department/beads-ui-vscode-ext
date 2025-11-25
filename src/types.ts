export interface BdIssue {
  [key: string]: unknown;
  id?: string;
  title?: string;
  status?: string;
  priority?: number;
  issue_type?: string;
  type?: string;
  assignee?: string;
  description?: string;
  text?: string;
  body?: string;
  notes?: string;
  related?: unknown;
  relations?: unknown;
  dependencies?: unknown;
  dependents?: unknown;
  deps?: unknown;
  subtasks?: BdIssue[];
}
