import { createServer } from 'node:http';
import os from 'node:os';
import Database from 'better-sqlite3';
import { createApp } from './app.js';
import { printServerUrl } from './cli/daemon.js';
import { getConfig } from './config.js';
import { resolveDbPath } from './db.js';
import { debug, enableAllDebug } from './logging.js';
import { registerWorkspace, watchRegistry } from './registry-watcher.js';
import { watchDb } from './watcher.js';
import { attachWsServer } from './ws.js';
import { getVpsTelemetry } from './vps-telemetry.js';
import { syncGitHubToBeads, checkGhAuth, setActiveWorkspace } from './github-sync.js';

if (process.argv.includes('--debug') || process.argv.includes('-d')) {
  enableAllDebug();
}

// Parse --host and --port from argv and set env vars before getConfig()
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--host' && process.argv[i + 1]) {
    process.env.HOST = process.argv[++i];
  }
  if (process.argv[i] === '--port' && process.argv[i + 1]) {
    process.env.PORT = process.argv[++i];
  }
}

const config = getConfig();
const app = createApp(config);
const server = createServer(app);
const log = debug('server');

// Register the initial workspace (from cwd) so it appears in the workspace picker
// even without the beads daemon running
const db_info = resolveDbPath({ cwd: config.root_dir });
if (db_info.exists) {
  registerWorkspace({ path: config.root_dir, database: db_info.path });
}

// Watch the active beads DB and schedule subscription refresh for active lists
const db_watcher = watchDb(config.root_dir, () => {
  // Schedule subscription list refresh run for active subscriptions
  log('db change detected → schedule refresh');
  scheduleListRefresh();
  // v2: all updates flow via subscription push envelopes only
});

const { scheduleListRefresh, broadcast } = attachWsServer(server, {
  path: '/ws',
  heartbeat_ms: 30000,
  // Coalesce DB change bursts into one refresh run
  refresh_debounce_ms: 75,
  root_dir: config.root_dir,
  watcher: db_watcher
});

// Real-time telemetry broadcasting
let lastTelemetryHash = '';
async function broadcastTelemetry() {
  try {
    const db_info = resolveDbPath({ cwd: config.root_dir });
    if (!db_info.exists) return;

    const db = new Database(db_info.path, { readonly: true });
    const tableCheck = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='wistec_telemetry'`).get();

    let tokenStats = { total: 0, avg: 0, max: 0, recent: 0, rate: 0 };
    let agentStats = [];
    let telemetryLogs = [];

    if (tableCheck) {
      const stats = db.prepare(`SELECT COALESCE(SUM(token_burn), 0) as total_tokens, COALESCE(AVG(token_burn), 0) as avg_tokens, COALESCE(MAX(token_burn), 0) as max_tokens FROM wistec_telemetry WHERE token_burn > 0`).get();
      const recentStats = db.prepare(`SELECT COALESCE(SUM(token_burn), 0) as recent_tokens FROM wistec_telemetry WHERE timestamp > datetime('now', '-5 minutes')`).get();

      tokenStats = {
        total: stats?.total_tokens || 0,
        avg: Math.round(stats?.avg_tokens || 0),
        max: stats?.max_tokens || 0,
        recent: recentStats?.recent_tokens || 0,
        rate: Math.round((recentStats?.recent_tokens || 0) / 5)
      };

      agentStats = db.prepare(`SELECT agent_id, COUNT(*) as event_count, COALESCE(SUM(token_burn), 0) as total_tokens FROM wistec_telemetry GROUP BY agent_id ORDER BY total_tokens DESC LIMIT 10`).all();
      telemetryLogs = db.prepare(`SELECT id, timestamp, agent_id, bead_id, node_type, logic_branch, token_burn FROM wistec_telemetry ORDER BY id DESC LIMIT 15`).all();
    }
    db.close();

    // Collect VPS telemetry
    let vps = null;
    try {
      vps = await getVpsTelemetry();
    } catch {
      vps = { connected: false };
    }

    // Only broadcast if data changed (simple hash check)
    const hash = JSON.stringify({ tokenStats, agentStats: agentStats.length, vps: vps?.connected });
    if (hash !== lastTelemetryHash) {
      lastTelemetryHash = hash;
      broadcast('telemetry-update', { tokenStats, agentStats, vps, telemetry: telemetryLogs });
      log('telemetry broadcast sent');
    }
  } catch (err) {
    log('telemetry broadcast error: %o', err);
  }
}

// Broadcast telemetry every 3 seconds
setInterval(broadcastTelemetry, 3000);

// GitHub sync auto-polling - sync issues from GitHub every 60 seconds
async function autoSyncGitHub() {
  try {
    const authResult = await checkGhAuth();
    if (authResult.authenticated) {
      const result = await syncGitHubToBeads(config.root_dir);
      if (result.ok && (result.results?.created > 0 || result.results?.statusSynced > 0)) {
        log('github auto-sync [%s]: %d created, %d status-synced',
          result.results?.repo || 'unknown',
          result.results?.created || 0,
          result.results?.statusSynced || 0);
        scheduleListRefresh(); // Refresh UI subscriptions
      }
    }
  } catch (err) {
    log('github auto-sync error: %o', err);
  }
}

// Run initial sync after 5 seconds, then every 60 seconds
setTimeout(autoSyncGitHub, 5000);
setInterval(autoSyncGitHub, 60000);

// Watch the global registry for workspace changes (e.g., when user starts
// bd daemon in a different project). This enables automatic workspace switching.
watchRegistry(
  (entries) => {
    log('registry changed: %d entries', entries.length);
    // Find if there's a newer workspace that matches our initial root
    // For now, we just log the change - users can switch via set-workspace
    // Future: could auto-switch if a workspace was started in a parent/child dir
  },
  { debounce_ms: 500 }
);

server.listen(config.port, config.host, () => {
  printServerUrl();
});

server.on('error', (err) => {
  log('server error %o', err);
  process.exitCode = 1;
});
