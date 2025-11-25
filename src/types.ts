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

export type IssueStatus = "open" | "in_progress" | "blocked" | "closed";
export type IssueType = "bug" | "feature" | "task" | "epic" | "chore";
export type SortDir = "asc" | "desc";
export type SortField =
  | "created_at"
  | "updated_at"
  | "closed_at"
  | "title"
  | "id";
export interface SearchFilters {
  search?: string;
  statuses?: IssueStatus[];
  types?: IssueType[];
  sortDir?: SortDir;
  sortField?: SortField;
}
