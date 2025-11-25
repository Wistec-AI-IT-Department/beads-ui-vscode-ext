import * as path from "path";
import * as fs from "fs";
import initSqlJs, { Database } from "sql.js";
import { BdIssue } from "../types";

export class BeadsIssueService {
  private db?: Database;
  private sqlPromise?: Promise<void>;

  constructor(
    private readonly workspaceRoot?: string,
    private readonly extensionPath?: string
  ) {}

  private async getDatabase(): Promise<Database> {
    if (!this.workspaceRoot) {
      throw new Error("Open a workspace folder that contains a .beads database to load issues.");
    }

    if (this.db) {
      return this.db;
    }

    // Wait for any pending initialization
    if (this.sqlPromise) {
      await this.sqlPromise;
      if (this.db) {
        return this.db;
      }
    }

    // Initialize sql.js and load database
    this.sqlPromise = (async () => {
      const dbPath = path.join(this.workspaceRoot!, ".beads", "beads.db");
      if (!fs.existsSync(dbPath)) {
        throw new Error(
          `No beads database found at ${dbPath}. Run 'bd init' in your workspace to initialize beads.`
        );
      }

      const config = this.extensionPath
        ? {
            locateFile: (file: string) => {
              return path.join(this.extensionPath!, "dist", "sql-wasm", file);
            },
          }
        : {};

      const SQL = await initSqlJs(config);
      const buffer = fs.readFileSync(dbPath);
      this.db = new SQL.Database(buffer);
    })();

    await this.sqlPromise;
    return this.db!;
  }

  async fetchIssues(): Promise<BdIssue[]> {
    try {
      const db = await this.getDatabase();
      const result = db.exec("SELECT * FROM issues ORDER BY created_at DESC");

      if (!result.length || !result[0].values.length) {
        return [];
      }

      const columns = result[0].columns;
      const rows = result[0].values;

      return rows.map((row: unknown[]) => this.parseIssueRow(columns, row));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch issues from database: ${message}`);
    }
  }

  async fetchIssue(issueId: string): Promise<BdIssue | null> {
    if (!issueId) {
      return null;
    }

    try {
      const db = await this.getDatabase();
      const result = db.exec("SELECT * FROM issues WHERE id = ?", [issueId]);

      if (!result.length || !result[0].values.length) {
        return null;
      }

      const columns = result[0].columns;
      const row = result[0].values[0];

      const issue = this.parseIssueRow(columns, row);

      // Fetch subtasks for epics using hierarchical ID pattern (e.g., bd-epic.1, bd-epic.2)
      if (issue.issue_type === 'epic' || issue.type === 'epic') {
        const subtasksResult = db.exec(`
          SELECT * FROM issues
          WHERE id LIKE ? AND id != ?
          ORDER BY id ASC
        `, [issueId + '.%', issueId]);

        if (subtasksResult.length && subtasksResult[0].values.length) {
          const subtasks = subtasksResult[0].values.map((row: unknown[]) =>
            this.parseIssueRow(subtasksResult[0].columns, row)
          );
          issue.subtasks = subtasks;
        }
      }

      return issue;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch issue ${issueId} from database: ${message}`);
    }
  }

  private parseIssueRow(columns: string[], values: unknown[]): BdIssue {
    const record: Record<string, unknown> = {};

    // Convert array to object using column names
    columns.forEach((col, idx) => {
      record[col] = values[idx];
    });

    const issue: BdIssue = { ...record };

    // Parse JSON fields if they exist
    if (typeof record.dependencies === "string" && record.dependencies) {
      try {
        issue.dependencies = JSON.parse(record.dependencies);
      } catch {
        // Keep as string if parsing fails
      }
    }

    if (typeof record.dependents === "string" && record.dependents) {
      try {
        issue.dependents = JSON.parse(record.dependents);
      } catch {
        // Keep as string if parsing fails
      }
    }

    if (typeof record.related === "string" && record.related) {
      try {
        issue.related = JSON.parse(record.related);
      } catch {
        // Keep as string if parsing fails
      }
    }

    // Normalize type field
    if (record.issue_type) {
      issue.type = record.issue_type as string;
    }

    return issue;
  }

  dispose(): void {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }
}
