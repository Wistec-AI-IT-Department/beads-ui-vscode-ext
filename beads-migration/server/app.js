/**
 * @import { Express, Request, Response } from 'express'
 */
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { registerWorkspace } from './registry-watcher.js';
import { resolveDbPath } from './db.js';
import { getVpsTelemetry } from './vps-telemetry.js';
import { fetchGitHubIssues, createGitHubIssue, syncGitHubToBeads, checkGhAuth } from './github-sync.js';

/**
 * Create and configure the Express application.
 *
 * @param {{ host: string, port: number, app_dir: string, root_dir: string }} config - Server configuration.
 * @returns {Express} Configured Express app instance.
 */
export function createApp(config) {
  const app = express();

  // Basic hardening and config
  app.disable('x-powered-by');

  // Health endpoint
  /**
   * @param {Request} _req
   * @param {Response} res
   */
  app.get('/healthz', (_req, res) => {
    res.type('application/json');
    res.status(200).send({ ok: true });
  });

  // Enable JSON body parsing for API endpoints
  app.use(express.json());

  // Register workspace endpoint - allows CLI to register workspaces dynamically
  // when the server is already running
  /**
   * @param {Request} req
   * @param {Response} res
   */
  app.post('/api/register-workspace', (req, res) => {
    const { path: workspace_path, database } = req.body || {};
    if (!workspace_path || typeof workspace_path !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing or invalid path' });
      return;
    }
    if (!database || typeof database !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing or invalid database' });
      return;
    }
    registerWorkspace({ path: workspace_path, database });
    res.status(200).json({ ok: true, registered: workspace_path });
  });

  // Telemetry endpoint
  app.get('/api/telemetry', async (req, res) => {
    try {
      const db_info = resolveDbPath({ cwd: config.root_dir });
      if (!db_info.exists) {
        res.status(404).json({ ok: false, error: 'Database not found' });
        return;
      }

      const db = new Database(db_info.path, { readonly: true });

      const tableCheck = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='wistec_telemetry'`).get();

      let telemetryData = [];
      let tokenStats = { total: 0, avg: 0, max: 0, recent: 0, rate: 0 };
      let agentStats = [];
      let nodeTypeStats = [];

      if (tableCheck) {
        const logs = db.prepare(`SELECT id, timestamp, agent_id, bead_id, node_type, logic_branch, token_burn FROM wistec_telemetry ORDER BY id DESC LIMIT 50`).all();
        telemetryData = logs;

        const stats = db.prepare(`SELECT COUNT(*) as total_events, COALESCE(SUM(token_burn), 0) as total_tokens, COALESCE(AVG(token_burn), 0) as avg_tokens, COALESCE(MAX(token_burn), 0) as max_tokens FROM wistec_telemetry WHERE token_burn > 0`).get();

        const recentStats = db.prepare(`SELECT COALESCE(SUM(token_burn), 0) as recent_tokens FROM wistec_telemetry WHERE timestamp > datetime('now', '-5 minutes')`).get();

        tokenStats = {
          total: stats?.total_tokens || 0,
          avg: Math.round(stats?.avg_tokens || 0),
          max: stats?.max_tokens || 0,
          recent: recentStats?.recent_tokens || 0,
          rate: Math.round((recentStats?.recent_tokens || 0) / 5)
        };

        agentStats = db.prepare(`SELECT agent_id, COUNT(*) as event_count, COALESCE(SUM(token_burn), 0) as total_tokens FROM wistec_telemetry GROUP BY agent_id ORDER BY total_tokens DESC LIMIT 10`).all();

        nodeTypeStats = db.prepare(`SELECT node_type, COUNT(*) as event_count, COALESCE(SUM(token_burn), 0) as total_tokens, COALESCE(AVG(token_burn), 0) as avg_tokens FROM wistec_telemetry GROUP BY node_type ORDER BY total_tokens DESC`).all();
      }

      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const loadAvg = os.loadavg();

      let cpuUsage = 0;
      if (cpus.length > 0) {
        const avgIdle = cpus.reduce((sum, cpu) => {
          const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
          return sum + (cpu.times.idle / total);
        }, 0) / cpus.length;
        cpuUsage = Math.round((1 - avgIdle) * 100);
      }

      const vitals = {
        cpu: { cores: cpus.length, usage: cpuUsage, load: loadAvg },
        memory: { total: totalMem, free: freeMem, used: totalMem - freeMem, percent: Math.round(((totalMem - freeMem) / totalMem) * 100) },
        uptime: os.uptime(),
        platform: os.platform(),
        hostname: os.hostname()
      };

      db.close();

      // Fetch VPS telemetry (Frikkie)
      let vps = null;
      try {
        vps = await getVpsTelemetry();
      } catch (vpsErr) {
        vps = { connected: false, error: vpsErr?.message || 'VPS fetch failed' };
      }

      res.status(200).json({ ok: true, telemetry: telemetryData, tokenStats, agentStats, nodeTypeStats, vitals, vps });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Telemetry failed: ' + (err?.message || 'Unknown') });
    }
  });

  // GitHub Sync API endpoints
  /**
   * Check GitHub authentication status
   */
  app.get('/api/github/status', async (_req, res) => {
    try {
      const status = await checkGhAuth();
      res.status(200).json({ ok: true, ...status });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || 'Auth check failed' });
    }
  });

  /**
   * Fetch GitHub issues
   */
  app.get('/api/github/issues', async (_req, res) => {
    try {
      const issues = await fetchGitHubIssues();
      res.status(200).json({ ok: true, issues });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch issues' });
    }
  });

  /**
   * Create a GitHub issue
   */
  app.post('/api/github/issues', async (req, res) => {
    try {
      const { title, body, labels } = req.body || {};
      if (!title) {
        res.status(400).json({ ok: false, error: 'Title is required' });
        return;
      }
      const result = await createGitHubIssue(title, body || '', labels);
      res.status(201).json({ ok: true, issue: result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || 'Failed to create issue' });
    }
  });

  /**
   * Sync GitHub issues to Beads
   */
  app.post('/api/github/sync', async (req, res) => {
    try {
      const { workspace } = req.body || {};
      const targetWorkspace = workspace || config.root_dir;
      const result = await syncGitHubToBeads(targetWorkspace);
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err?.message || 'Sync failed' });
    }
  });

  if (
    !fs.statSync(path.resolve(config.app_dir, 'main.bundle.js'), {
      throwIfNoEntry: false
    })
  ) {
    /**
     * On-demand bundle for the browser using esbuild.
     *
     * @param {Request} _req
     * @param {Response} res
     */
    app.get('/main.bundle.js', async (_req, res) => {
      try {
        const esbuild = await import('esbuild');
        const entry = path.join(config.app_dir, 'main.js');
        const result = await esbuild.build({
          entryPoints: [entry],
          bundle: true,
          format: 'esm',
          platform: 'browser',
          target: 'es2020',
          sourcemap: 'inline',
          minify: false,
          write: false
        });
        const out = result.outputFiles && result.outputFiles[0];
        if (!out) {
          res.status(500).type('text/plain').send('Bundle failed: no output');
          return;
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(out.text);
      } catch (err) {
        res
          .status(500)
          .type('text/plain')
          .send('Bundle error: ' + (err && /** @type {any} */ (err).message));
      }
    });
  }

  // Static assets from /app
  app.use(express.static(config.app_dir));

  // Root serves index.html explicitly (even if static would catch it)
  /**
   * @param {Request} _req
   * @param {Response} res
   */
  app.get('/', (_req, res) => {
    const index_path = path.join(config.app_dir, 'index.html');
    res.sendFile(index_path);
  });

  return app;
}
