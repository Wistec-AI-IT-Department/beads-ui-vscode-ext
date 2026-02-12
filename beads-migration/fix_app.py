import re

# Read the file
with open('C:/ai-it-department/beads-ui-fork/server/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add imports
old_imports = """import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { registerWorkspace } from './registry-watcher.js';"""

new_imports = """import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { registerWorkspace } from './registry-watcher.js';
import { resolveDbPath } from './db.js';"""

content = content.replace(old_imports, new_imports)

# Find the marker to insert telemetry endpoint
marker = "res.status(200).json({ ok: true, registered: workspace_path });\n  });"

telemetry_code = """res.status(200).json({ ok: true, registered: workspace_path });
  });

  // Telemetry endpoint
  app.get('/api/telemetry', (req, res) => {
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
      res.status(200).json({ ok: true, telemetry: telemetryData, tokenStats, agentStats, nodeTypeStats, vitals });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Telemetry failed: ' + (err?.message || 'Unknown') });
    }
  });"""

content = content.replace(marker, telemetry_code)

with open('C:/ai-it-department/beads-ui-fork/server/app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated app.js successfully')
