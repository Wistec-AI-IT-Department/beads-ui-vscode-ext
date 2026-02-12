/**
 * GitHub Issue Sync for Beads
 * Syncs issues between GitHub and the local beads database
 * Now workspace-aware: detects repo from git remote
 */
import { spawn, execSync } from 'node:child_process';
import { debug } from './logging.js';

const log = debug('github-sync');

// Default config (fallback if no git remote detected)
const DEFAULT_GITHUB_CONFIG = {
  owner: 'Wistec-AI-IT-Department',
  repo: 'ai-it-department',
  pollInterval: 60000, // 60 seconds
  cacheTTL: 30000 // 30 second cache
};

// Workspace-specific repo cache
const workspaceRepos = new Map();

/**
 * Detect GitHub repo from git remote in a workspace directory
 */
function detectGitHubRepo(workspacePath) {
  if (workspaceRepos.has(workspacePath)) {
    return workspaceRepos.get(workspacePath);
  }

  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: workspacePath,
      encoding: 'utf-8',
      timeout: 5000
    }).trim();

    // Parse GitHub URL: https://github.com/owner/repo.git or git@github.com:owner/repo.git
    let match = remoteUrl.match(/github\.com[/:]([\w-]+)\/([\w-]+?)(\.git)?$/i);
    if (match) {
      const result = { owner: match[1], repo: match[2] };
      workspaceRepos.set(workspacePath, result);
      log('Detected GitHub repo for %s: %s/%s', workspacePath, result.owner, result.repo);
      return result;
    }
  } catch (err) {
    log('Failed to detect git remote for %s: %s', workspacePath, err.message);
  }

  return null;
}

/**
 * Get GitHub config for a workspace
 */
export function getGitHubConfigForWorkspace(workspacePath) {
  const detected = detectGitHubRepo(workspacePath);
  if (detected) {
    return {
      ...DEFAULT_GITHUB_CONFIG,
      owner: detected.owner,
      repo: detected.repo
    };
  }
  return DEFAULT_GITHUB_CONFIG;
}

// Current active GitHub config (mutable - set per workspace)
let GITHUB_CONFIG = { ...DEFAULT_GITHUB_CONFIG };
let ACTIVE_WORKSPACE_PATH = null;

/**
 * Set the active workspace for GitHub sync
 */
export function setActiveWorkspace(workspacePath) {
  GITHUB_CONFIG = getGitHubConfigForWorkspace(workspacePath);
  ACTIVE_WORKSPACE_PATH = workspacePath;
  // Clear cache when workspace changes
  cachedIssues = null;
  lastFetch = 0;
  log('Set active workspace: %s -> %s/%s', workspacePath, GITHUB_CONFIG.owner, GITHUB_CONFIG.repo);
  return GITHUB_CONFIG;
}

// Use full path to gh CLI since it may not be in PATH during server startup
const GH_CLI_PATH = process.platform === 'win32' ? 'C:\\Program Files\\GitHub CLI\\gh.exe' : 'gh';

let cachedIssues = null;
let lastFetch = 0;

/**
 * Execute gh CLI command and return JSON output
 */
function ghExec(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    // When using shell:true with paths containing spaces, wrap in quotes
    const quotedPath = process.platform === 'win32' ? `"${GH_CLI_PATH}"` : GH_CLI_PATH;
    const cmd = [quotedPath, ...args].join(' ');
    const proc = spawn(cmd, [], {
      shell: true,
      timeout,
      env: { ...process.env, NO_COLOR: '1' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve(stdout.trim());
        }
      } else {
        reject(new Error(`gh failed (${code}): ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`gh spawn error: ${err.message}`));
    });
  });
}

/**
 * Execute bd CLI command
 */
function bdExec(args, timeout = 15000) {
  return new Promise((resolve, reject) => {
    // Use the active workspace path if set, otherwise fall back to process.cwd()
    const workingDir = ACTIVE_WORKSPACE_PATH || process.cwd();
    // Use shell: false for proper argument handling (avoiding quote/escape issues)
    const proc = spawn('bd', args, {
      shell: false,
      timeout,
      cwd: workingDir,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      const combined = stdout + stderr;
      // bd exits with 1 for "test" prefix warning but still creates the issue
      if (code === 0 || combined.includes('Created issue')) {
        resolve(combined.trim());
      } else {
        reject(new Error(`bd failed (${code}): ${stderr || stdout}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`bd spawn error: ${err.message}`));
    });
  });
}

/**
 * Check if gh CLI is authenticated
 */
export async function checkGhAuth() {
  try {
    await ghExec(['auth', 'status']);
    return { authenticated: true };
  } catch (err) {
    return { authenticated: false, error: err.message };
  }
}

/**
 * Fetch issues from GitHub
 */
export async function fetchGitHubIssues(state = 'all', limit = 50) {
  const now = Date.now();

  // Return cached if fresh
  if (cachedIssues && (now - lastFetch) < GITHUB_CONFIG.cacheTTL) {
    return { ...cachedIssues, cached: true };
  }

  try {
    log('Fetching GitHub issues...');

    const issues = await ghExec([
      'issue', 'list',
      '--repo', `${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`,
      '--state', state,
      '--limit', String(limit),
      '--json', 'number,title,body,state,labels,assignees,createdAt,updatedAt,closedAt,author'
    ]);

    cachedIssues = {
      ok: true,
      issues: Array.isArray(issues) ? issues : [],
      fetchedAt: new Date().toISOString(),
      repo: `${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`
    };

    lastFetch = now;
    log(`Fetched ${cachedIssues.issues.length} issues from GitHub`);

    return { ...cachedIssues, cached: false };

  } catch (err) {
    log('GitHub fetch failed: %s', err.message);

    // Return stale cache if available
    if (cachedIssues) {
      return { ...cachedIssues, cached: true, stale: true, error: err.message };
    }

    return {
      ok: false,
      issues: [],
      error: err.message,
      fetchedAt: new Date().toISOString()
    };
  }
}

/**
 * Create an issue in GitHub
 */
export async function createGitHubIssue(title, body = '', labels = []) {
  try {
    const args = [
      'issue', 'create',
      '--repo', `${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`,
      '--title', title,
      '--body', body || 'Created from Beads Dashboard'
    ];

    if (labels.length > 0) {
      args.push('--label', labels.join(','));
    }

    args.push('--json', 'number,url,title');

    const result = await ghExec(args);
    log('Created GitHub issue: %s', result.number);

    return { ok: true, issue: result };

  } catch (err) {
    log('GitHub create failed: %s', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Close an issue in GitHub
 */
export async function closeGitHubIssue(number, reason = '') {
  try {
    const args = [
      'issue', 'close',
      '--repo', `${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`,
      String(number)
    ];

    if (reason) {
      args.push('--comment', reason);
    }

    await ghExec(args);
    log('Closed GitHub issue: %d', number);

    return { ok: true };

  } catch (err) {
    log('GitHub close failed: %s', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Sync a single GitHub issue to beads
 */
export async function syncIssueToBeads(ghIssue) {
  try {
    const externalRef = `gh-${ghIssue.number}`;
    const searchTerm = `GH#${ghIssue.number}`;
    const titlePrefix = `[GH#${ghIssue.number}]`;

    // Check if issue already exists in beads by searching for GH#N in title
    const existingJson = await bdExec(['search', '--json', searchTerm]).catch(() => '[]');

    // Parse the search results
    let existingIssues = [];
    try {
      existingIssues = Array.isArray(existingJson) ? existingJson : JSON.parse(existingJson);
    } catch {
      existingIssues = [];
    }

    // Find the matching issue
    const matchingIssue = existingIssues.find(i => i.title && i.title.includes(titlePrefix));

    if (matchingIssue) {
      // Check if we need to sync status (GitHub closed → beads closed)
      const ghClosed = ghIssue.state === 'CLOSED' || ghIssue.state === 'closed';
      const beadsClosed = matchingIssue.status === 'closed';

      if (ghClosed && !beadsClosed) {
        // Close the issue in beads
        try {
          await bdExec(['update', matchingIssue.id, '--status', 'closed']);
          log('Issue %d status synced: closed in beads', ghIssue.number);
          return { ok: true, action: 'status-synced', beadsId: matchingIssue.id };
        } catch (closeErr) {
          log('Failed to close issue %d in beads: %s', ghIssue.number, closeErr.message);
        }
      }

      log('Issue %d already synced to beads', ghIssue.number);
      return { ok: true, action: 'exists' };
    }

    // Create in beads
    const title = `[GH#${ghIssue.number}] ${ghIssue.title}`;
    const description = ghIssue.body || '';

    // Map labels to bd labels
    const labels = (ghIssue.labels || []).map(l => l.name).join(',');

    // Build create args
    const createArgs = [
      'create',
      '--title', title,
      '--external-ref', externalRef,
      '--silent'
    ];

    if (description) {
      createArgs.push('--description', description.substring(0, 1000));
    }

    if (labels) {
      createArgs.push('--labels', labels);
    }

    const createResult = await bdExec(createArgs);

    log('Synced GitHub issue %d to beads: %s', ghIssue.number, createResult);

    return { ok: true, action: 'created', beadsId: createResult };

  } catch (err) {
    log('Sync to beads failed for issue %d: %s', ghIssue.number, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Full sync: GitHub → Beads
 * @param {string} [workspacePath] - Optional workspace path to detect repo from
 */
export async function syncGitHubToBeads(workspacePath) {
  try {
    // Set workspace-specific GitHub config if provided
    if (workspacePath) {
      setActiveWorkspace(workspacePath);
    }

    const auth = await checkGhAuth();
    if (!auth.authenticated) {
      return { ok: false, error: 'GitHub CLI not authenticated. Run: gh auth login' };
    }

    // Fetch all issues (including closed) to catch Frikkie's completed tasks
    const ghData = await fetchGitHubIssues('all', 50);
    if (!ghData.ok) {
      return { ok: false, error: ghData.error };
    }

    const results = {
      total: ghData.issues.length,
      repo: `${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`,
      created: 0,
      statusSynced: 0,
      existing: 0,
      errors: 0
    };

    for (const issue of ghData.issues) {
      const syncResult = await syncIssueToBeads(issue);
      if (syncResult.ok) {
        if (syncResult.action === 'created') results.created++;
        else if (syncResult.action === 'status-synced') results.statusSynced++;
        else results.existing++;
      } else {
        results.errors++;
      }
    }

    log('Sync complete: %d created, %d status-synced, %d existing, %d errors', results.created, results.statusSynced, results.existing, results.errors);

    return { ok: true, results };

  } catch (err) {
    log('Full sync failed: %s', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Get sync status
 */
export function getGitHubConfig() {
  return {
    owner: GITHUB_CONFIG.owner,
    repo: GITHUB_CONFIG.repo,
    pollInterval: GITHUB_CONFIG.pollInterval
  };
}
