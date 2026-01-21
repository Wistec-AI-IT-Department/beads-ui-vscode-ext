import * as vscode from 'vscode';
import { BeadsIssueService } from '../services/beadsIssueService';
import * as os from 'os';

export class TelemetryDashboardPanel {
  public static currentPanel: TelemetryDashboardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _interval: NodeJS.Timeout | undefined;

  private constructor(panel: vscode.WebviewPanel, private readonly _issueService: BeadsIssueService) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getWebviewContent();
    this._startPolling();
  }

  public static createOrShow(issueService: BeadsIssueService) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (TelemetryDashboardPanel.currentPanel) {
      TelemetryDashboardPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'beadsTelemetry',
      'Echo Telemetry',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    TelemetryDashboardPanel.currentPanel = new TelemetryDashboardPanel(panel, issueService);
  }

  public dispose() {
    TelemetryDashboardPanel.currentPanel = undefined;
    if (this._interval) clearInterval(this._interval);
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }

  private _startPolling() {
    // Immediate update
    this._update();
    // Poll every 2 seconds for real-time updates
    this._interval = setInterval(async () => {
      await this._update();
    }, 2000);
  }

  private async _update() {
    try {
      const logs = await this._issueService.getTelemetryLogs(50);
      
      // Calculate basic stats
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMemPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
      
      const stats = {
        cpu: usedMemPercent, // Using Mem as "System Load" proxy for reliability across OS without deps
        mem: usedMemPercent,
        activeAgents: new Set(logs.map((l: any) => l.agent_id)).size,
        totalBurn: logs.reduce((acc: number, l: any) => acc + (l.token_burn || 0), 0)
      };

      this._panel.webview.postMessage({
        command: 'updatedata',
        logs: logs,
        stats: stats,
        hasData: logs.length > 0
      });
    } catch (e: any) { // Type as any to access custom properties
      console.error('[Beads UI] Telemetry update error:', e);
      // Show a friendly error instead of breaking the UI
      this._panel.webview.postMessage({
        command: 'updatedata',
        logs: [],
        stats: { cpu: 0, mem: 0, activeAgents: 0, totalBurn: 0 },
        hasData: false,
        info: e.message || 'Waiting for telemetry data...'
      });
    }
  }

  private _getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Echo Telemetry</title>
    <style>
        body { background-color: #0d0d0d; color: #00ff9d; font-family: 'Segoe UI', monospace; margin: 0; padding: 20px; overflow: hidden; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #00ff9d; padding-bottom: 10px; margin-bottom: 20px; }
        .title { font-size: 1.5em; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 10px #00ff9d; }
        .stats { display: flex; gap: 20px; }
        .stat-box { border: 1px solid #333; padding: 5px 15px; border-radius: 4px; background: #111; box-shadow: 0 0 5px rgba(0, 255, 157, 0.2); }
        .label { font-size: 0.8em; color: #888; text-transform: uppercase; }
        .value { font-size: 1.2em; font-weight: bold; color: #fff; }
        
        #canvas-container { position: relative; height: 50vh; border: 1px solid #222; background: radial-gradient(circle at center, #1a1a1a 0%, #000 100%); border-radius: 8px; overflow: hidden; margin-bottom: 20px;}
        canvas { display: block; width: 100%; height: 100%; }

        /* Error Screen */
        #error-screen { display: none; position: absolute; top:0; left:0; width:100%; height:100%; background: #000; z-index: 1000; padding: 40px; box-sizing: border-box; }
        .error-title { color: #ff0055; font-size: 2em; margin-bottom: 20px; text-transform: uppercase; border-bottom: 1px solid #ff0055; padding-bottom: 10px; }
        .error-msg { color: #fff; font-size: 1.2em; margin-bottom: 20px; }
        .path-list { color: #888; font-family: monospace; background: #111; padding: 10px; border: 1px solid #333; max-height: 300px; overflow-y: auto;}
    
        .log-panel-title { font-weight: bold; margin-bottom: 5px; color: #888; text-transform: uppercase; font-size: 0.8em; }
        .log-panel { height: 30vh; overflow-y: auto; font-size: 0.9em; border: 1px solid #222; background: #111; padding: 5px; }
        .log-entry { padding: 4px 10px; border-bottom: 1px solid #222; display: grid; grid-template-columns: 100px 100px 100px 1fr 80px; gap: 10px; align-items: center; }
        .log-entry:hover { background: #1a1a1a; }
        
        .color-normal { color: #00ff9d; }
        .color-loop { color: #ff0055; text-shadow: 0 0 5px #ff0055; }
        .color-retry { color: #ffff00; }
        
        /* Scrollbar */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #444; }
    </style>
</head>
<body>
    <div id="error-screen">
        <div class="error-title">Wistec Diagnostic Screen</div>
        <div class="error-msg" id="error-message">Database not found</div>
        <div>Paths Searched:</div>
        <div class="path-list" id="path-list"></div>
    </div>

    <div class="header">
        <div class="title">Wistec Echo Telemetry</div>
        <div class="stats">
            <div class="stat-box"><div class="label">System Pulse</div><div class="value"><span id="stat-agents">0</span> Active</div></div>
            <div class="stat-box"><div class="label">Guard Dog Load</div><div class="value" id="stat-load">0%</div></div>
            <div class="stat-box"><div class="label">Token Burn</div><div class="value" id="stat-burn">0</div></div>
        </div>
    </div>

    <div id="canvas-container">
        <canvas id="flowCanvas"></canvas>
    </div>

    <div class="log-panel-title">Real-time Reasoning Logs</div>
    <div class="log-panel" id="logPanel">
        <!-- Logs go here -->
    </div>

    <script>
        const canvas = document.getElementById('flowCanvas');
        const ctx = canvas.getContext('2d');
        
        let logs = [];
        let nodes = {}; // Map agent_id -> { x, y, targetX, targetY, state }
        const STAGES = {
            'Analysis': 1,
            'Execution': 2,
            'Healing': 1.5, // Backstep visually
            'Completion': 3
        };

        function resize() {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
        }
        window.addEventListener('resize', resize);
        resize();

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updatedata') {
                updateDashboard(message.logs, message.stats);
            } else if (message.command === 'error') {
                showError(message.message, message.pathsSearched);
            }
        });

        function showError(msg, paths) {
            document.getElementById('error-screen').style.display = 'block';
            document.getElementById('error-message').innerText = msg;
            const pathList = document.getElementById('path-list');
            pathList.innerHTML = paths.map(p => \`<div>\${p}</div>\`).join('');
        }

        function updateDashboard(newLogs, stats) {
            document.getElementById('error-screen').style.display = 'none'; // Hide error if success
            logs = newLogs;
            document.getElementById('stat-agents').innerText = stats.activeAgents;
            document.getElementById('stat-load').innerText = stats.mem + '%';
            document.getElementById('stat-burn').innerText = stats.totalBurn;

            // Render Logs
            const logPanel = document.getElementById('logPanel');
            logPanel.innerHTML = '';
            logs.forEach(log => {
                const div = document.createElement('div');
                div.className = 'log-entry';
                let colorClass = 'color-normal';
                if (log.logic_branch === 'Loop') colorClass = 'color-loop';
                if (log.node_type === 'Retry') colorClass = 'color-retry';
                
                const timeStr = log.timestamp ? log.timestamp.split('T')[1].substring(0, 8) : '--:--:--';

                div.innerHTML = \`
                    <span class="\${colorClass}">\${timeStr}</span>
                    <span class="\${colorClass}">\${log.agent_id}</span>
                    <span class="\${colorClass}">\${log.bead_id}</span>
                    <span class="\${colorClass}">\${log.node_type}</span>
                    <span class="\${colorClass}">\${log.token_burn} tk</span>
                \`;
                logPanel.appendChild(div);
            });

            // Update Nodes for Animation
            const activeAgents = [...new Set(logs.map(l => l.agent_id))].sort();
            const laneHeight = Math.min(60, canvas.height / (activeAgents.length + 1));
            
            activeAgents.forEach((agentId, index) => {
               const latestLog = logs.find(l => l.agent_id === agentId);
               if (!nodes[agentId]) {
                   nodes[agentId] = { x: 50, y: (index + 1) * laneHeight + 20, targetX: 50, label: agentId, color: '#00ff9d' };
               }
               
               const step = STAGES[latestLog.node_type] || 0;
               // Map step 0-3 to screen width (mostly)
               const segment = (canvas.width - 100) / 4;
               
               nodes[agentId].targetX = 50 + (step * segment);
               nodes[agentId].y = (index + 1) * laneHeight + 20;
               nodes[agentId].state = latestLog.node_type;
               nodes[agentId].branch = latestLog.logic_branch;
               nodes[agentId].bead = latestLog.bead_id;
            });
        }


        function draw() {
            ctx.fillStyle = 'rgba(13, 13, 13, 0.2)'; // Clear with trail
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw Lanes & Labels
            const activeAgents = Object.keys(nodes).sort();
            
            // Draw Nodes
            Object.keys(nodes).forEach(agentId => {
                const node = nodes[agentId];
                // Animation Lerp
                node.x += (node.targetX - node.x) * 0.05;

                // Lane line
                ctx.strokeStyle = '#222';
                ctx.beginPath();
                ctx.moveTo(0, node.y);
                ctx.lineTo(canvas.width, node.y);
                ctx.stroke();

                // Draw Connecting Line from Start to Current
                ctx.strokeStyle = '#333';
                ctx.beginPath();
                ctx.moveTo(50, node.y);
                ctx.lineTo(node.x, node.y);
                ctx.stroke();

                // Draw Node Circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
                
                let glowColor = '#00ff9d';
                if (node.branch === 'Loop') glowColor = '#ff0055';
                else if (node.state === 'Healing') glowColor = '#ffff00';
                else if (node.state === 'Completion') glowColor = '#00aaff';

                ctx.fillStyle = glowColor;
                ctx.shadowColor = glowColor;
                ctx.shadowBlur = 15;
                ctx.fill();
                ctx.shadowBlur = 0;

                // Agent Label
                ctx.fillStyle = '#fff';
                ctx.font = '12px Segoe UI';
                ctx.fillText(\`\${agentId} [\${node.bead}]\`, 10, node.y + 4);

                // Status Label above node
                ctx.fillStyle = '#888';
                ctx.font = '10px Segoe UI';
                ctx.fillText(node.state, node.x - 10, node.y - 15);
                
                 // Logic Branch Visuals (n8n loop style)
                if (node.branch === 'Loop') {
                    ctx.strokeStyle = '#ff0055';
                    ctx.beginPath();
                    ctx.arc(node.x, node.y - 12, 8, 0, Math.PI * 2);
                    ctx.stroke();
                }
            });

            requestAnimationFrame(draw);
        }
        draw();
    </script>
</body>
</html>`;
  }
}
