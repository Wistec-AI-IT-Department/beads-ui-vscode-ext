import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import initSqlJs from "sql.js";
import { BeadsIssueService } from "../services/beadsIssueService";

suite("BeadsIssueService Test Suite", () => {
  let tempDir: string;
  let beadsDir: string;
  let dbPath: string;

  setup(async () => {
    // Create temporary directory for test database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "beads-test-"));
    beadsDir = path.join(tempDir, ".beads");
    dbPath = path.join(beadsDir, "beads.db");
    fs.mkdirSync(beadsDir, { recursive: true });

    // Create a test database with sample data
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    db.run(`
      CREATE TABLE issues (
        id TEXT PRIMARY KEY,
        title TEXT,
        status TEXT,
        priority INTEGER,
        issue_type TEXT,
        description TEXT,
        created_at TEXT,
        updated_at TEXT,
        dependencies TEXT,
        dependents TEXT,
        related TEXT
      )
    `);

    db.run(`
      INSERT INTO issues (id, title, status, priority, issue_type, description, created_at, updated_at)
      VALUES
        ('bd-1', 'Test Issue 1', 'open', 1, 'bug', 'Test description 1', '2024-01-01', '2024-01-01'),
        ('bd-2', 'Test Issue 2', 'in_progress', 2, 'feature', 'Test description 2', '2024-01-02', '2024-01-02'),
        ('bd-3', 'Test Issue 3', 'closed', 0, 'task', 'Test description 3', '2024-01-03', '2024-01-03')
    `);

    const data = db.export();
    fs.writeFileSync(dbPath, data);
    db.close();
  });

  teardown(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("fetchIssues returns all issues", async () => {
    const extensionPath = path.resolve(__dirname, "../..");
    const service = new BeadsIssueService(tempDir, extensionPath);

    const issues = await service.fetchIssues();

    assert.strictEqual(issues.length, 3);
    assert.strictEqual(issues[0].id, "bd-3"); // Ordered by created_at DESC
    assert.strictEqual(issues[1].id, "bd-2");
    assert.strictEqual(issues[2].id, "bd-1");

    service.dispose();
  });

  test("fetchIssue returns single issue by id", async () => {
    const extensionPath = path.resolve(__dirname, "../..");
    const service = new BeadsIssueService(tempDir, extensionPath);

    const issue = await service.fetchIssue("bd-2");

    assert.notStrictEqual(issue, null);
    assert.strictEqual(issue?.id, "bd-2");
    assert.strictEqual(issue?.title, "Test Issue 2");
    assert.strictEqual(issue?.status, "in_progress");
    assert.strictEqual(issue?.priority, 2);
    assert.strictEqual(issue?.type, "feature");

    service.dispose();
  });

  test("fetchIssue returns null for non-existent issue", async () => {
    const extensionPath = path.resolve(__dirname, "../..");
    const service = new BeadsIssueService(tempDir, extensionPath);

    const issue = await service.fetchIssue("bd-999");

    assert.strictEqual(issue, null);

    service.dispose();
  });

  test("throws error when workspace root is not provided", async () => {
    const service = new BeadsIssueService();

    await assert.rejects(
      async () => await service.fetchIssues(),
      /Open a workspace folder/
    );
  });

  test("throws error when .beads directory does not exist", async () => {
    const invalidDir = path.join(tempDir, "invalid");
    fs.mkdirSync(invalidDir, { recursive: true });
    const extensionPath = path.resolve(__dirname, "../..");
    const service = new BeadsIssueService(invalidDir, extensionPath);

    await assert.rejects(
      async () => await service.fetchIssues(),
      /No beads database found/
    );
  });

  test("normalizes issue_type to type field", async () => {
    const extensionPath = path.resolve(__dirname, "../..");
    const service = new BeadsIssueService(tempDir, extensionPath);

    const issue = await service.fetchIssue("bd-1");

    assert.strictEqual(issue?.issue_type, "bug");
    assert.strictEqual(issue?.type, "bug");

    service.dispose();
  });
});
