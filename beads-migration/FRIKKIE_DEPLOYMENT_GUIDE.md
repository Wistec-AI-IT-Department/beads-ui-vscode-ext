# 🚀 FRIKKIE: Beads UI Deployment Guide

## CONTEXT FOR FRIKKIE

Riaan and Claude have built and heavily customized `beads-ui`, a local-first issue tracking UI for the `bd` (beads) CLI. This system has been living on Riaan's local machine, causing sync issues and disconnection from you (Frikkie) on the VPS. 

**Mission:** Deploy this entire system to the VPS so Riaan can access it remotely via `http://76.13.36.42:[PORT]` and work in real-time sync with you.

---

## 📦 WHAT'S IN THIS PACKAGE

```
beads-migration/
├── app/                    # Frontend SPA (HTML, JS, CSS, views)
│   ├── index.html          # Main entry point
│   ├── main.js             # App shell + routing
│   ├── main.bundle.js      # Production bundle
│   ├── styles.css          # Custom styling
│   ├── views/              # UI components (list, board, epics, detail)
│   └── data/               # Client-side stores and selectors
├── server/                 # Express + WebSocket backend
│   ├── index.js            # Server entry point
│   ├── app.js              # Express app
│   ├── config.js           # Configuration (HOST, PORT)
│   ├── ws.js               # WebSocket server (real-time push)
│   ├── db.js               # SQLite database operations
│   ├── watcher.js          # Database file watcher
│   ├── bd.js               # bd CLI bridge
│   ├── list-adapters.js    # Subscription list adapters
│   ├── subscriptions.js    # Subscription registry
│   ├── vps-telemetry.js    # VPS telemetry (connects to YOU!)
│   └── github-sync.js      # GitHub issue sync
├── bin/
│   └── bdui.js             # CLI to start/stop/restart
├── .beads/                 # Sample beads data (NOT production)
├── package.json            # Node dependencies
└── package-lock.json       # Locked versions
```

---

## 🏗️ ARCHITECTURE SUMMARY

```
┌─────────────────────────────────────────────────────────────────┐
│                    BEADS UI SYSTEM                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Browser (Riaan)                                                 │
│  http://76.13.36.42:3000                                        │
│      │                                                           │
│      │ WebSocket (real-time push)                               │
│      │                                                           │
│      ▼                                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Express Server (server/index.js)                        │    │
│  │  - Static file server (app/)                             │    │
│  │  - WebSocket server (ws.js)                              │    │
│  │  - Subscription-based push updates                       │    │
│  │  - bd CLI bridge for mutations                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│      │                                                           │
│      │ Commands                                                  │
│      ▼                                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  bd CLI (beads binary)                                   │    │
│  │  - Issue CRUD operations                                 │    │
│  │  - SQLite database management                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│      │                                                           │
│      │ Read/Write                                                │
│      ▼                                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  .beads/beads.db (SQLite)                                │    │
│  │  - Per-project issue database                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Features Built:
- **Push-only protocol** - No polling, all updates via WebSocket subscriptions
- **Per-subscription stores** - Each UI view has its own data store
- **Real-time updates** - DB watcher triggers immediate UI updates
- **Board view** - Kanban-style columns (Blocked/Ready/In Progress/Closed)
- **Epics view** - Hierarchical issue management with progress tracking
- **GitHub sync** - Bi-directional sync with GitHub issues (optional)
- **VPS telemetry** - Already configured to connect to you at 76.13.36.42!

---

## 🔧 INSTALLATION STEPS

### 1. Prerequisites

```bash
# Ensure Node.js 22+ is installed
node --version  # Should be 22.x or higher

# Install bd CLI (beads) if not present
# Option A: Go binary
wget https://github.com/steveyegge/beads/releases/latest/download/beads_linux_amd64.tar.gz
tar -xzf beads_linux_amd64.tar.gz
mv bd /usr/local/bin/
chmod +x /usr/local/bin/bd

# Option B: If not available, use npm global install
# npm install -g beads

# Verify bd is working
bd --version
```

### 2. Deploy Beads UI

```bash
# Navigate to where Frikkie's projects live
cd /root/.openclaw/workspace/

# Create beads-ui directory
mkdir -p beads-ui
cd beads-ui

# Copy the migration files (Riaan will push to GitHub or SCP)
# Option A: Git clone from beads-ui-vscode-ext repo
git clone https://github.com/Wistec-AI-IT-Department/beads-ui-vscode-ext.git --depth 1
cp -r beads-ui-vscode-ext/beads-migration/* .
rm -rf beads-ui-vscode-ext

# Option B: If files are SCP'd directly
# scp -r riaan@local:~/ai-it-department/beads-migration/* .

# Install dependencies
npm install
```

### 3. Configure for Remote Access

The server is configured to bind to `127.0.0.1` by default for security. For VPS deployment:

```bash
# Edit server/config.js OR use environment variables
export HOST=0.0.0.0   # Allow external connections
export PORT=3000       # Or any available port (check firewall)
```

**CRITICAL:** Edit `server/config.js` to allow remote binding:

```javascript
// In server/config.js, change:
const host_value = host_env && host_env.length > 0 ? host_env : '0.0.0.0';
// (was '127.0.0.1')
```

### 4. Initialize Project Database

```bash
# Create a workspace for Riaan's issues
mkdir -p /root/.openclaw/workspace/riaan-issues
cd /root/.openclaw/workspace/riaan-issues

# Initialize beads database
bd init

# Verify .beads directory exists
ls -la .beads/
# Should show: beads.db, issues.jsonl, metadata.json
```

### 5. Start the Server

```bash
# Navigate to beads-ui installation
cd /root/.openclaw/workspace/beads-ui

# Start from the project directory (where .beads/ folder is)
cd /root/.openclaw/workspace/riaan-issues

# Run the server (from project dir with .beads/)
node /root/.openclaw/workspace/beads-ui/server/index.js --host 0.0.0.0 --port 3000
```

### 6. Set Up PM2 for Persistence

```bash
# Install PM2 globally
npm install -g pm2

# Start beads-ui with PM2
cd /root/.openclaw/workspace/riaan-issues
pm2 start /root/.openclaw/workspace/beads-ui/server/index.js \
  --name beads-ui \
  --cwd /root/.openclaw/workspace/riaan-issues \
  -- --host 0.0.0.0 --port 3000

# Save PM2 config for auto-restart on reboot
pm2 save
pm2 startup

# Check status
pm2 status
pm2 logs beads-ui
```

---

## 🌐 EXTERNAL ACCESS

After deployment, Riaan can access:

```
http://76.13.36.42:3000
```

### Firewall Configuration

```bash
# If using ufw
ufw allow 3000/tcp

# If using iptables
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
```

---

## 📊 HEALTH MONITORING

### Health Endpoint
```bash
curl http://76.13.36.42:3000/healthz
# Should return: {"ok":true}
```

### Metrics Endpoint
```bash
curl http://76.13.36.42:3000/metrics
# Returns subscription stats, refresh counters, etc.
```

### PM2 Monitoring
```bash
pm2 monit        # Live monitoring
pm2 logs beads-ui  # View logs
pm2 restart beads-ui  # Restart if needed
```

---

## 🗄️ DATABASE MANAGEMENT

### Working Directory
The beads-ui server uses the **current working directory** to find `.beads/beads.db`. Always start the server FROM the project directory:

```bash
# CORRECT
cd /root/.openclaw/workspace/riaan-issues
node /path/to/beads-ui/server/index.js

# WRONG (will look for .beads in wrong place)
node /path/to/beads-ui/server/index.js
```

### Multi-Project Support
To serve different projects:

```bash
# Project A
cd /root/.openclaw/workspace/project-a
pm2 start beads-ui-a ...

# Project B (different port)
cd /root/.openclaw/workspace/project-b  
pm2 start beads-ui-b ... --port 3001
```

### Database Sync with GitHub
The `github-sync.js` module can sync issues with GitHub. Configure in the project:

```bash
# Ensure gh CLI is authenticated
gh auth login

# The sync detects repo from git remote
git remote -v  # Verify origin points to GitHub
```

---

## 🐛 TROUBLESHOOTING

### Server won't start
```bash
# Check Node version
node --version  # Must be 22+

# Check port availability
lsof -i :3000

# Check bd is in PATH
which bd
```

### WebSocket connection fails
```bash
# Check firewall
ufw status
iptables -L

# Check server is listening on 0.0.0.0
netstat -tlnp | grep 3000
```

### Database not found
```bash
# Verify .beads exists in working directory
ls -la /root/.openclaw/workspace/riaan-issues/.beads/

# If missing, initialize
cd /root/.openclaw/workspace/riaan-issues
bd init
```

### Logs location
```bash
# PM2 logs
~/.pm2/logs/beads-ui-out.log
~/.pm2/logs/beads-ui-error.log

# Or via PM2
pm2 logs beads-ui --lines 100
```

---

## 🔄 VPS TELEMETRY (ALREADY CONFIGURED!)

The system includes `server/vps-telemetry.js` which is already configured to connect to you (Frikkie) at `root@76.13.36.42`. This enables:

- Session monitoring
- System vitals (CPU, memory, uptime)
- Workspace activity tracking

This creates a feedback loop where you can monitor Riaan's work in real-time!

---

## 🎯 SUCCESS CRITERIA

After deployment, verify:

- [ ] `http://76.13.36.42:3000` loads the beads UI
- [ ] WebSocket connects (check browser DevTools → Network → WS)
- [ ] Creating an issue via UI persists to `.beads/beads.db`
- [ ] Real-time updates work (open in two browser tabs, make a change)
- [ ] `pm2 status` shows beads-ui running
- [ ] Server survives reboot (`pm2 startup` + `pm2 save`)

---

## 📝 NOTES FOR FRIKKIE

1. **This is production code** - We've put 190+ issues worth of work into this UI
2. **Push-only architecture** - No polling, pure WebSocket subscriptions
3. **bd CLI is the source of truth** - All mutations go through bd
4. **VPS telemetry exists** - You're already wired in for monitoring
5. **GitHub sync available** - Can optionally sync with GitHub Issues

Questions? The codebase is well-documented:
- `app/protocol.md` - WebSocket protocol specification
- `docs/architecture.md` - System architecture
- `docs/data-exchange-subscription-plan.md` - Push data flow
- `docs/observability.md` - Metrics and logging

---

**Ready to deploy!** 🚀

*— Claude (working with Riaan)*
