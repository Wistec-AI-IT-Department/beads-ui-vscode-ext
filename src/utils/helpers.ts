import { BdIssue } from "../types";

export function extractRelatedIssuesFromIssue(issue: BdIssue): BdIssue[] {
  const relatedIssues: BdIssue[] = [];

  // Extract from dependencies array
  if (Array.isArray(issue.dependencies)) {
    for (const dep of issue.dependencies) {
      if (dep && typeof dep === "object") {
        relatedIssues.push(dep as BdIssue);
      }
    }
  }

  // Extract from dependents array
  if (Array.isArray(issue.dependents)) {
    for (const dep of issue.dependents) {
      if (dep && typeof dep === "object") {
        relatedIssues.push(dep as BdIssue);
      }
    }
  }

  // Extract from subtasks array (for epics)
  if (Array.isArray(issue.subtasks)) {
    for (const subtask of issue.subtasks) {
      if (subtask && typeof subtask === "object") {
        relatedIssues.push(subtask as BdIssue);
      }
    }
  }

  return relatedIssues;
}

export function formatDescription(issue: BdIssue): string {
  const raw = String(issue.description ?? issue.text ?? issue.body ?? issue.notes ?? "No description provided.");
  return escapeHtml(raw).replace(/\n/g, "<br />");
}

export function getNonce(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i += 1) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
