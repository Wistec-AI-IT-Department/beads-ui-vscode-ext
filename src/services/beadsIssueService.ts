import * as fs from "fs";
import * as path from "path";
import sqlite3, { Database } from "@vscode/sqlite3";
import { BdIssue } from "../types";

type SortField = "created_at" | "updated_at" | "closed_at" | "title" | "id";
type SortDir = "asc" | "desc";

type SearchFilters = {
  search: string;
  statuses: string[];
  types: string[];
  sortField: SortField;
  sortDir: SortDir;
};

export class BeadsIssueService {
  private db?: Database;
  private dbPath?: string;
  private filters: SearchFilters = {
    search: "",
    statuses: ["open", "in_progress", "blocked", "closed"],
    types: ["bug", "feature", "task", "epic", "chore"],
    sortField: "created_at",
    sortDir: "desc",
  };

  constructor(private readonly workspaceRoot?: string) {}

  setFilters(filters: Partial<SearchFilters>) {
    this.filters = { ...this.filters, ...filters };
  }

  getFilters(): SearchFilters {
    return { ...this.filters };
  }

  async fetchIssues(): Promise<BdIssue[]> {
    const db = await this.getDatabase();
    const { search, statuses, types, sortField, sortDir } = this.filters;

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (search) {
      clauses.push(`(
        lower(id) LIKE ? OR
        lower(title) LIKE ? OR
        lower(description) LIKE ? OR
        lower(notes) LIKE ?
      )`);
      const term = `%${search.toLowerCase()}%`;
      params.push(term, term, term, term);
    }

    if (statuses?.length) {
      clauses.push(`status IN (${statuses.map(() => "?").join(",")})`);
      params.push(...statuses);
    }

    if (types?.length) {
      clauses.push(`issue_type IN (${types.map(() => "?").join(",")})`);
      params.push(...types);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const orderSql = `ORDER BY ${sortField} ${sortDir.toUpperCase()}`;
    const sql = `SELECT * FROM issues ${whereSql} ${orderSql}`;

    const rows = await this.all<Record<string, unknown>>(db, sql, params);
    return rows.map((row) => this.parseRow(row));
  }

  async fetchIssue(issueId: string): Promise<BdIssue | null> {
    if (!issueId) {
      return null;
    }
    const db = await this.getDatabase();
    const row = await this.getRow<Record<string, unknown>>(
      db,
      `SELECT * FROM issues WHERE id = ?`,
      [issueId]
    );

    if (!row) {
      return null;
    }

    const issue = this.parseRow(row);

    // Fetch subtasks for epics using hierarchical ID pattern (e.g., epic-id.1, epic-id.2)
    if (issue.issue_type === 'epic' || issue.type === 'epic') {
      const subtaskRows = await this.all<Record<string, unknown>>(
        db,
        `SELECT * FROM issues WHERE id LIKE ? AND id != ? ORDER BY id ASC`,
        [issueId + '.%', issueId]
      );

      if (subtaskRows.length > 0) {
        issue.subtasks = subtaskRows.map(row => this.parseRow(row));
      }
    }

    return issue;
  }

  async updateIssue(
    issueId: string,
    updates: Partial<
      Pick<
        BdIssue,
        "status" | "priority" | "assignee" | "description" | "title"
      >
    >
  ) {
    if (!issueId) {
      throw new Error("No issue id provided for update.");
    }
    const db = await this.getDatabase();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    const statusUpdate =
      typeof updates.status === "string" ? updates.status : undefined;
    if (statusUpdate) {
      fields.push("status = ?");
      values.push(statusUpdate);
      fields.push(
        statusUpdate === "closed"
          ? "closed_at = CURRENT_TIMESTAMP"
          : "closed_at = NULL"
      );
    }

    if (typeof updates.priority === "number") {
      fields.push("priority = ?");
      values.push(updates.priority);
    }

    if (typeof updates.assignee === "string") {
      fields.push("assignee = ?");
      values.push(updates.assignee || null);
    }

    if (typeof updates.description === "string") {
      fields.push("description = ?");
      values.push(updates.description);
    }

    if (typeof updates.title === "string") {
      fields.push("title = ?");
      values.push(updates.title);
    }

    if (!fields.length) {
      return;
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    const sql = `UPDATE issues SET ${fields.join(", ")} WHERE id = ?`;
    await this.run(db, sql, [...values, issueId]);
  }

  async createIssue(initial: Partial<BdIssue> = {}): Promise<BdIssue> {
    const db = await this.getDatabase();
    const id = await this.nextIssueId(db);
    const now = new Date().toISOString();
    const title = String(initial.title ?? "New issue");
    const description = String(initial.description ?? "");
    const status = String(initial.status ?? "open");
    const priority =
      typeof initial.priority === "number" ? initial.priority : 2;
    const issueType = String(initial.issue_type ?? initial.type ?? "task");
    const assignee = initial.assignee ? String(initial.assignee) : null;

    await this.run(
      db,
      `INSERT INTO issues (id, title, description, status, priority, issue_type, assignee, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, description, status, priority, issueType, assignee, now, now]
    );

    const created = await this.fetchIssue(id);
    if (!created) {
      throw new Error(`Failed to create issue ${id}`);
    }
    return created;
  }

  async createSubIssue(epicId: string): Promise<BdIssue> {
    if (!epicId) {
      throw new Error("Parent epic id is required to create a sub-issue.");
    }
    const db = await this.getDatabase();
    const nextId = await this.nextSubIssueId(db, epicId);
    const now = new Date().toISOString();
    const title = `Subtask for ${epicId}`;

    await this.run(
      db,
      `INSERT INTO issues (id, title, description, status, priority, issue_type, assignee, created_at, updated_at)
       VALUES (?, ?, '', 'open', 2, 'task', NULL, ?, ?)`,
      [nextId, title, now, now]
    );

    const created = await this.fetchIssue(nextId);
    if (!created) {
      throw new Error(`Failed to create sub-issue ${nextId}`);
    }
    return created;
  }

  dispose(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  private async getDatabase(): Promise<Database> {
    if (!this.workspaceRoot) {
      throw new Error(
        "Open a workspace folder that contains a .beads database to load issues."
      );
    }

    if (this.db) {
      return this.db;
    }

    this.dbPath = path.join(this.workspaceRoot, ".beads", "beads.db");
    if (!fs.existsSync(this.dbPath)) {
      throw new Error(
        `No beads database found at ${this.dbPath}. Run 'bd init' in your workspace to initialize beads.`
      );
    }

    this.db = await this.openNativeDatabase(this.dbPath);
    return this.db;
  }

  private openNativeDatabase(dbPath: string): Promise<Database> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(
        dbPath,
        sqlite3.OPEN_READWRITE,
        (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve(db);
          }
        }
      );
    });
  }

  private all<T>(db: Database, sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve((rows as T[]) ?? []);
        }
      });
    });
  }

  private getRow<T>(db: Database, sql: string, params: unknown[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T | undefined);
        }
      });
    });
  }

  private run(db: Database, sql: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(sql, params, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private parseRow(row: Record<string, unknown>): BdIssue {
    const issue: BdIssue = { ...row } as BdIssue;
    if (typeof row.dependencies === "string" && row.dependencies) {
      try {
        issue.dependencies = JSON.parse(row.dependencies as string);
      } catch {
        /* ignore */
      }
    }
    if (typeof row.dependents === "string" && row.dependents) {
      try {
        issue.dependents = JSON.parse(row.dependents as string);
      } catch {
        /* ignore */
      }
    }
    if (typeof row.related === "string" && row.related) {
      try {
        issue.related = JSON.parse(row.related as string);
      } catch {
        /* ignore */
      }
    }
    if (row.issue_type) {
      issue.type = row.issue_type as string;
    }
    return issue;
  }

  private async nextIssueId(db: Database): Promise<string> {
    const rows = await this.all<{ id: string }>(db, "SELECT id FROM issues");
    if (!rows.length) {
      return "bd-1";
    }
    const max = rows
      .map((r) => r.id)
      .map((v) => v.match(/bd-(\d+)/i)?.[1])
      .filter(Boolean)
      .map((n) => Number(n))
      .reduce((a, b) => Math.max(a, b), 0);
    return `bd-${max + 1}`;
  }

  private async nextSubIssueId(db: Database, epicId: string): Promise<string> {
    const rows = await this.all<{ id: string }>(
      db,
      "SELECT id FROM issues WHERE id LIKE ?",
      [`${epicId}.%`]
    );
    if (!rows.length) {
      return `${epicId}.1`;
    }
    const max = rows
      .map((r) => r.id)
      .map((id) => Number(id.split(".").pop()))
      .filter((n) => Number.isFinite(n))
      .reduce((a, b) => Math.max(a, b), 0);
    return `${epicId}.${max + 1}`;
  }
}
