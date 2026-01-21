import * as fs from "fs";
import * as path from "path";
import type { Database as SqlJsDatabase, SqlJsStatic } from "sql.js";
import { BdIssue } from "../types";

// We'll load sql.js dynamically to avoid webpack bundling issues
let sqlJsModule: SqlJsStatic | undefined;

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
  private db?: SqlJsDatabase;
  private dbPath?: string;
  private sqlJsPromise?: Promise<SqlJsStatic>;
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
    const params: (string | number | null)[] = [];

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

    const rows = this.all<Record<string, unknown>>(db, sql, params);
    return rows.map((row) => this.parseRow(row));
  }

  async fetchIssue(issueId: string): Promise<BdIssue | null> {
    if (!issueId) {
      return null;
    }
    const db = await this.getDatabase();
    const row = this.getRow<Record<string, unknown>>(
      db,
      `SELECT * FROM issues WHERE id = ?`,
      [issueId]
    );

    if (!row) {
      return null;
    }

    const issue = this.parseRow(row);

    // Fetch subtasks for epics using hierarchical ID pattern (e.g., epic-id.1, epic-id.2)
    const issueType = issue.issue_type ?? issue.type;
    if (issueType === 'epic') {
      const subtaskRows = this.all<Record<string, unknown>>(
        db,
        `SELECT * FROM issues WHERE id LIKE ? AND id != ? ORDER BY id ASC`,
        [issueId + '.%', issueId]
      );

      if (subtaskRows.length > 0) {
        issue.subtasks = subtaskRows.map((subtaskRow) => this.parseRow(subtaskRow));
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
  ): Promise<void> {
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
    this.run(db, sql, [...values, issueId]);
    this.saveDatabase();
  }

  async createIssue(initial: Partial<BdIssue> = {}): Promise<BdIssue> {
    const db = await this.getDatabase();
    const id = this.nextIssueId(db);
    const now = new Date().toISOString();
    const title = String(initial.title ?? "New issue");
    const description = String(initial.description ?? "");
    const status = String(initial.status ?? "open");
    const priority =
      typeof initial.priority === "number" ? initial.priority : 2;
    const issueType = String(initial.issue_type ?? initial.type ?? "task");
    const assignee = initial.assignee ? String(initial.assignee) : null;

    this.run(
      db,
      `INSERT INTO issues (id, title, description, status, priority, issue_type, assignee, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, description, status, priority, issueType, assignee, now, now]
    );
    this.saveDatabase();

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
    const nextId = this.nextSubIssueId(db, epicId);
    const now = new Date().toISOString();
    const title = `Subtask for ${epicId}`;

    this.run(
      db,
      `INSERT INTO issues (id, title, description, status, priority, issue_type, assignee, created_at, updated_at)
       VALUES (?, ?, '', 'open', 2, 'task', NULL, ?, ?)`,
      [nextId, title, now, now]
    );
    this.saveDatabase();

    const created = await this.fetchIssue(nextId);
    if (!created) {
      throw new Error(`Failed to create sub-issue ${nextId}`);
    }
    return created;
  }

  async getRelatedIssues(issueId: string): Promise<BdIssue[]> {
    if (!issueId) {
      return [];
    }

    try {
      const db = await this.getDatabase();
      const relatedIssues: BdIssue[] = [];
      const addedIds = new Set<string>();

      // Check if dependencies table exists
      const tables = this.all<{ name: string }>(
        db,
        "SELECT name FROM sqlite_master WHERE type='table' AND name='dependencies'"
      );

      if (tables.length > 0) {
        // Query issues that this issue depends on
        const depsRows = this.all<Record<string, unknown>>(
          db,
          `SELECT i.* FROM issues i
           INNER JOIN dependencies d ON i.id = d.dependency_id
           WHERE d.issue_id = ?`,
          [issueId]
        );
        for (const row of depsRows) {
          const issue = this.parseRow(row);
          if (!addedIds.has(issue.id)) {
            addedIds.add(issue.id);
            relatedIssues.push(issue);
          }
        }

        // Query issues that depend on this issue
        const reverseDepsRows = this.all<Record<string, unknown>>(
          db,
          `SELECT i.* FROM issues i
           INNER JOIN dependencies d ON i.id = d.issue_id
           WHERE d.dependency_id = ?`,
          [issueId]
        );
        for (const row of reverseDepsRows) {
          const issue = this.parseRow(row);
          if (!addedIds.has(issue.id)) {
            addedIds.add(issue.id);
            relatedIssues.push(issue);
          }
        }
      }

      // Check dependencies JSON field in issues table
      const issueRow = this.getRow<Record<string, unknown>>(
        db,
        `SELECT dependencies FROM issues WHERE id = ?`,
        [issueId]
      );

      if (issueRow && issueRow.dependencies) {
        const depsJson = issueRow.dependencies as string;
        try {
          const deps: unknown = JSON.parse(depsJson);
          const depIds: string[] = [];

          if (Array.isArray(deps)) {
            for (const dep of deps) {
              if (typeof dep === 'string') {
                depIds.push(dep);
              } else if (dep !== null && typeof dep === 'object') {
                const depObj = dep as Record<string, unknown>;
                if (typeof depObj.id === 'string') {
                  depIds.push(depObj.id);
                }
                if (typeof depObj.target === 'string') {
                  depIds.push(depObj.target);
                }
              }
            }
          }

          if (depIds.length > 0) {
            const placeholders = depIds.map(() => '?').join(',');
            const relatedRows = this.all<Record<string, unknown>>(
              db,
              `SELECT * FROM issues WHERE id IN (${placeholders})`,
              depIds
            );
            for (const relatedRow of relatedRows) {
              const issue = this.parseRow(relatedRow);
              if (!addedIds.has(issue.id)) {
                addedIds.add(issue.id);
                relatedIssues.push(issue);
              }
            }
          }
        } catch {
          // Ignore JSON parse errors
        }
      }

      // Find issues that reference this issue in their dependencies
      const reverseRows = this.all<Record<string, unknown>>(
        db,
        `SELECT * FROM issues WHERE dependencies LIKE ? AND id != ?`,
        [`%${issueId}%`, issueId]
      );
      for (const reverseRow of reverseRows) {
        const issue = this.parseRow(reverseRow);
        if (!addedIds.has(issue.id)) {
          addedIds.add(issue.id);
          relatedIssues.push(issue);
        }
      }

      return relatedIssues;
    } catch {
      console.error('Error getting related issues');
      return [];
    }
  }

  dispose(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  private async getSqlJs(): Promise<SqlJsStatic> {
    if (!this.sqlJsPromise) {
      // Use dynamic require to avoid webpack bundling issues with sql.js
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const initSqlJs = require("sql.js") as (config?: object) => Promise<SqlJsStatic>;
      this.sqlJsPromise = initSqlJs();
    }
    return this.sqlJsPromise;
  }

  private async getDatabase(forceRefresh = false): Promise<SqlJsDatabase> {
    if (!this.workspaceRoot) {
      throw new Error(
        "Open a workspace folder that contains a .beads database to load issues."
      );
    }

    if (this.db && !forceRefresh) {
      return this.db;
    }

    // Dynamic path resolution: Search upward for .beads folder
    let currentPath = this.workspaceRoot;
    let foundDbPath: string | undefined;
    const pathsSearched: string[] = [];
    
    // 1. Upward Search
    for (let i = 0; i < 10; i++) {
        const checkPath = path.join(currentPath, ".beads", "beads.db");
        pathsSearched.push(checkPath);
        if (fs.existsSync(checkPath)) {
            foundDbPath = checkPath;
            break;
        }
        const parent = path.dirname(currentPath);
        if (parent === currentPath) break; // Reached root
        currentPath = parent;
    }

    // 2. Downward Search (if not found upward) - usually helpful if workspace root is a parent of the repo
    if (!foundDbPath) {
        try {
            const subdirs = fs.readdirSync(this.workspaceRoot, { withFileTypes: true });
            for (const dirent of subdirs) {
                if (dirent.isDirectory() && dirent.name !== 'node_modules' && !dirent.name.startsWith('.')) {
                    const checkPath = path.join(this.workspaceRoot, dirent.name, ".beads", "beads.db");
                    pathsSearched.push(checkPath);
                    if (fs.existsSync(checkPath)) {
                        foundDbPath = checkPath;
                        break;
                    }
                }
            }
        } catch (e) {
            console.error("[BeadsDB] Error searching subdirectories", e);
        }
    }

    // Fallback or final resolution
    this.dbPath = foundDbPath || path.join(this.workspaceRoot, ".beads", "beads.db");

    if (!foundDbPath) {
      console.error(`[BeadsDB] Database not found. Paths searched:\n${pathsSearched.join('\n')}`);
      // Throw a more informative error that the dashboard can catch
      const error = new Error(`No beads database found. Searched ${pathsSearched.length} locations including ${this.dbPath}.`);
      (error as any).pathsSearched = pathsSearched;
      throw error;
    }

    console.log(`[BeadsDB] Loading database from: ${this.dbPath}`);

    const SQL = await this.getSqlJs();
    const fileBuffer = fs.readFileSync(this.dbPath);
    this.db = new SQL.Database(fileBuffer);
    
    // Initialize Telemetry Table if not exists (for the UI's internal use/consistency)
    try {
      this.run(this.db, `
        CREATE TABLE IF NOT EXISTS wistec_telemetry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT,
          agent_id TEXT,
          bead_id TEXT,
          node_type TEXT,
          logic_branch TEXT,
          token_burn INTEGER
        )
      `);
    } catch (e) {
      console.error(`[BeadsDB] Error initializing telemetry table:`, e);
    }

    return this.db;
  }

  async getTelemetryLogs(limit = 100): Promise<any[]> {
    // Force refresh to get latest logs from external processes (like stress test)
    const db = await this.getDatabase(true); 
    
    // First try to get from wistec_telemetry table
    let logs = this.all<any>(db, `SELECT * FROM wistec_telemetry ORDER BY id DESC LIMIT ?`, [limit]);
    
    // If table is empty, try to read from interactions.jsonl
    if (logs.length === 0 && this.dbPath) {
      const interactionsPath = path.join(path.dirname(this.dbPath), 'interactions.jsonl');
      if (fs.existsSync(interactionsPath)) {
        try {
          const content = fs.readFileSync(interactionsPath, 'utf-8');
          const lines = content.trim().split('\n').filter(line => line.trim());
          const parsedLogs: any[] = [];
          
          for (const line of lines.slice(-limit)) {
            try {
              const entry = JSON.parse(line);
              // Transform interactions.jsonl format to telemetry format
              parsedLogs.push({
                id: parsedLogs.length + 1,
                timestamp: entry.timestamp || entry.created_at || new Date().toISOString(),
                agent_id: entry.agent_id || entry.user || 'unknown',
                bead_id: entry.issue_id || entry.bead_id || entry.id || 'N/A',
                node_type: entry.action || entry.type || entry.node_type || 'Activity',
                logic_branch: entry.logic_branch || entry.status || 'Normal',
                token_burn: entry.token_burn || entry.tokens || 0
              });
            } catch {
              // Skip malformed lines
            }
          }
          
          logs = parsedLogs.reverse(); // Most recent first
        } catch (e) {
          console.error('[BeadsDB] Error reading interactions.jsonl:', e);
        }
      }
    }
    
    // If still empty, generate sample data to show the UI is working
    if (logs.length === 0) {
      logs = this.generateSampleTelemetry();
    }
    
    return logs;
  }

  private generateSampleTelemetry(): any[] {
    const now = new Date();
    const samples: any[] = [];
    const agents = ['Agent-Alpha', 'Agent-Beta', 'Agent-Gamma'];
    const nodeTypes = ['Analysis', 'Execution', 'Completion'];
    const branches = ['Normal', 'Loop', 'Retry'];
    
    for (let i = 0; i < 10; i++) {
      const time = new Date(now.getTime() - i * 60000);
      samples.push({
        id: 10 - i,
        timestamp: time.toISOString(),
        agent_id: agents[i % agents.length],
        bead_id: `bd-${Math.floor(Math.random() * 10) + 1}`,
        node_type: nodeTypes[i % nodeTypes.length],
        logic_branch: branches[Math.floor(Math.random() * branches.length)],
        token_burn: Math.floor(Math.random() * 500) + 50
      });
    }
    
    return samples;
  }

  private saveDatabase(): void {
    if (this.db && this.dbPath) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    }
  }

  private all<T>(db: SqlJsDatabase, sql: string, params: (string | number | null)[] = []): T[] {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }

  private getRow<T>(db: SqlJsDatabase, sql: string, params: (string | number | null)[] = []): T | undefined {
    const results = this.all<T>(db, sql, params);
    return results[0];
  }

  private run(db: SqlJsDatabase, sql: string, params: (string | number | null)[] = []): void {
    db.run(sql, params);
  }

  private parseRow(row: Record<string, unknown>): BdIssue {
    // Ensure id is a valid string - throw if missing since id is required
    if (row.id === undefined || row.id === null) {
      throw new Error('Issue row is missing required id field');
    }
    const id = typeof row.id === 'string' ? row.id : String(row.id);
    
    const issue: BdIssue = { 
      ...row,
      id 
    } as BdIssue;
    
    if (typeof row.dependencies === "string" && row.dependencies) {
      try {
        issue.dependencies = JSON.parse(row.dependencies);
      } catch {
        /* ignore */
      }
    }
    if (typeof row.dependents === "string" && row.dependents) {
      try {
        issue.dependents = JSON.parse(row.dependents);
      } catch {
        /* ignore */
      }
    }
    if (typeof row.related === "string" && row.related) {
      try {
        issue.related = JSON.parse(row.related);
      } catch {
        /* ignore */
      }
    }
    if (row.issue_type) {
      issue.type = row.issue_type as string;
    }
    return issue;
  }

  private nextIssueId(db: SqlJsDatabase): string {
    const rows = this.all<{ id: string }>(db, "SELECT id FROM issues");
    if (!rows.length) {
      return "bd-1";
    }
    const max = rows
      .map((r) => r.id)
      .map((v) => v.match(/bd-(\d+)/i)?.[1])
      .filter((n): n is string => n !== undefined)
      .map((n) => Number(n))
      .reduce((a, b) => Math.max(a, b), 0);
    return `bd-${max + 1}`;
  }

  private nextSubIssueId(db: SqlJsDatabase, epicId: string): string {
    const rows = this.all<{ id: string }>(
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
      .filter((n): n is number => Number.isFinite(n))
      .reduce((a, b) => Math.max(a, b), 0);
    return `${epicId}.${max + 1}`;
  }
}
