import { html, render } from 'lit-html';
import { debug } from '../utils/logging.js';

/**
 * Enhanced Telemetry dashboard with n8n-style Drawflow workflow visualization.
 * Now with real-time WebSocket updates.
 */
export function createTelemetryView(mount_element, store, wsClient) {
  const log = debug('views:telemetry');
  let unsubscribe = null;
  let pollInterval = null;
  let drawflowEditor = null;
  let unsubscribeWs = null;

  // Real telemetry data from API
  let telemetryLogs = [];
  let tokenStats = { total: 0, avg: 0, max: 0, recent: 0, rate: 0 };
  let agentStats = [];
  let nodeTypeStats = [];
  let vitals = { cpu: { cores: 0, usage: 0, load: [0, 0, 0] }, memory: { total: 0, free: 0, used: 0, percent: 0 }, uptime: 0, platform: '', hostname: '' };
  let vps = { connected: false, agent: null, vitals: null, activity: { count: 0, files: [] }, skills: [], commandLog: [] };
  let loading = true;
  let error = null;

  // Agent definitions with colors and icons
  const agents = {
    'TRIGGER': { icon: '⚡', color: '#10b981', label: 'Trigger', desc: 'Issue Detection' },
    'RESEARCHER': { icon: '🔍', color: '#6366f1', label: 'Researcher', desc: 'Context Gathering' },
    'CODE_WRITER': { icon: '💻', color: '#3b82f6', label: 'Code Writer', desc: 'Implementation' },
    'DEBUGGER': { icon: '🐛', color: '#f59e0b', label: 'Debugger', desc: 'Error Analysis' },
    'QA': { icon: '✅', color: '#8b5cf6', label: 'QA Agent', desc: 'Quality Assurance' },
    'SECURITY': { icon: '🛡️', color: '#ef4444', label: 'Security', desc: 'Vuln Scanning' },
    'DOCUMENTATION': { icon: '📝', color: '#14b8a6', label: 'Documentation', desc: 'Doc Generation' },
    'TEST_GENERATOR': { icon: '🧪', color: '#ec4899', label: 'Test Generator', desc: 'Test Creation' },
    'OUTPUT': { icon: '📤', color: '#22c55e', label: 'Output', desc: 'Final Delivery' }
  };

  function formatTimestamp(ts) {
    return new Date(ts).toLocaleTimeString();
  }

  function formatBytes(bytes) {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(1) + ' GB';
  }

  function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function formatTokens(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  function getAgentTokens(agentId) {
    const stat = agentStats.find(a => a.agent_id === agentId);
    return stat ? stat.total_tokens : 0;
  }

  function getAgentEvents(agentId) {
    const stat = agentStats.find(a => a.agent_id === agentId);
    return stat ? stat.event_count : 0;
  }

  function createAgentNodeHtml(id, agent) {
    const tokens = getAgentTokens(id);
    const events = getAgentEvents(id);
    return `
      <div class="drawflow-agent-node" style="border-left: 4px solid ${agent.color};">
        <div class="node-header" style="background: ${agent.color}20;">
          <span class="node-icon">${agent.icon}</span>
          <span class="node-title">${agent.label}</span>
        </div>
        <div class="node-body">
          <div class="node-desc">${agent.desc}</div>
          <div class="node-stats">
            <span class="node-stat">🔥 ${formatTokens(tokens)}</span>
            <span class="node-stat">📊 ${events} ops</span>
          </div>
        </div>
        <div class="node-status ${events > 0 ? 'active' : 'idle'}"></div>
      </div>
    `;
  }

  function initDrawflow() {
    const container = mount_element.querySelector('#drawflow-container');
    if (!container || drawflowEditor) return;
    if (typeof Drawflow === 'undefined') {
      log('Drawflow not loaded yet');
      return;
    }

    // Initialize Drawflow
    drawflowEditor = new Drawflow(container);
    drawflowEditor.reroute = true;
    drawflowEditor.reroute_fix_curvature = true;
    drawflowEditor.force_first_input = false;
    drawflowEditor.start();

    // Add nodes in a flow pattern
    // Row 1: Trigger
    drawflowEditor.addNode('trigger', 0, 1, 50, 180, 'trigger', {}, createAgentNodeHtml('TRIGGER', agents.TRIGGER));

    // Row 2: Researcher (after trigger)
    drawflowEditor.addNode('researcher', 1, 2, 280, 180, 'researcher', {}, createAgentNodeHtml('RESEARCHER', agents.RESEARCHER));

    // Row 3: Code Writer & Debugger (parallel)
    drawflowEditor.addNode('code_writer', 1, 2, 520, 80, 'code_writer', {}, createAgentNodeHtml('CODE_WRITER', agents.CODE_WRITER));
    drawflowEditor.addNode('debugger', 1, 2, 520, 280, 'debugger', {}, createAgentNodeHtml('DEBUGGER', agents.DEBUGGER));

    // Row 4: QA, Security, Test Generator (parallel validation)
    drawflowEditor.addNode('qa', 1, 1, 780, 30, 'qa', {}, createAgentNodeHtml('QA', agents.QA));
    drawflowEditor.addNode('security', 1, 1, 780, 180, 'security', {}, createAgentNodeHtml('SECURITY', agents.SECURITY));
    drawflowEditor.addNode('test_gen', 1, 1, 780, 330, 'test_gen', {}, createAgentNodeHtml('TEST_GENERATOR', agents.TEST_GENERATOR));

    // Row 5: Documentation
    drawflowEditor.addNode('documentation', 1, 1, 1040, 130, 'documentation', {}, createAgentNodeHtml('DOCUMENTATION', agents.DOCUMENTATION));

    // Row 6: Output
    drawflowEditor.addNode('output', 1, 0, 1280, 180, 'output', {}, createAgentNodeHtml('OUTPUT', agents.OUTPUT));

    // Create connections (the workflow flow)
    // Trigger -> Researcher
    drawflowEditor.addConnection(1, 2, 'output_1', 'input_1');

    // Researcher -> Code Writer & Debugger
    drawflowEditor.addConnection(2, 3, 'output_1', 'input_1');
    drawflowEditor.addConnection(2, 4, 'output_2', 'input_1');

    // Code Writer -> QA, Security
    drawflowEditor.addConnection(3, 5, 'output_1', 'input_1');
    drawflowEditor.addConnection(3, 6, 'output_2', 'input_1');

    // Debugger -> Test Generator
    drawflowEditor.addConnection(4, 7, 'output_1', 'input_1');

    // Code Writer -> Documentation
    drawflowEditor.addConnection(3, 8, 'output_1', 'input_1');

    // QA, Security, Test Gen, Documentation -> Output (via Documentation)
    drawflowEditor.addConnection(5, 8, 'output_1', 'input_1');
    drawflowEditor.addConnection(6, 8, 'output_1', 'input_1');
    drawflowEditor.addConnection(7, 8, 'output_1', 'input_1');
    drawflowEditor.addConnection(8, 9, 'output_1', 'input_1');

    // Fit to view
    drawflowEditor.zoom_out();
    drawflowEditor.zoom_out();

    log('Drawflow initialized with agent workflow');
  }

  function updateDrawflowNodes() {
    if (!drawflowEditor) return;

    // Update node content with latest stats
    const nodeMap = {
      1: 'TRIGGER', 2: 'RESEARCHER', 3: 'CODE_WRITER', 4: 'DEBUGGER',
      5: 'QA', 6: 'SECURITY', 7: 'TEST_GENERATOR', 8: 'DOCUMENTATION', 9: 'OUTPUT'
    };

    for (const [nodeId, agentId] of Object.entries(nodeMap)) {
      try {
        const nodeEl = mount_element.querySelector(`#node-${nodeId} .drawflow_content_node`);
        if (nodeEl && agents[agentId]) {
          nodeEl.innerHTML = createAgentNodeHtml(agentId, agents[agentId]);
        }
      } catch (e) {
        // Node might not exist yet
      }
    }
  }

  function template() {
    return html`
      <div class="telemetry-root enhanced">
        <div class="telemetry-header">
          <h2>⚡ AI Agent Workflow Pipeline</h2>
          <p class="telemetry-subtitle">Real-time agent orchestration • n8n-style visualization</p>
        </div>

        ${loading ? html`<div class="loading">Loading telemetry data...</div>` : ''}
        ${error ? html`<div class="error">${error}</div>` : ''}

        <!-- n8n-style Drawflow Workflow -->
        <div class="telemetry-section workflow-section">
          <h3>🔄 Live Agent Pipeline</h3>
          <div id="drawflow-container" class="drawflow-container"></div>
          <div class="workflow-legend">
            ${Object.entries(agents).slice(0, 8).map(([id, agent]) => html`
              <span class="legend-item">
                <span class="legend-color" style="background: ${agent.color}"></span>
                ${agent.icon} ${agent.label}
              </span>
            `)}
          </div>
        </div>

        <!-- Token Burn Stats -->
        <div class="telemetry-section">
          <h3>🔥 Token Burn Statistics</h3>
          <div class="telemetry-stats">
            <div class="stat-card stat-total">
              <div class="stat-value">${formatTokens(tokenStats.total)}</div>
              <div class="stat-label">Total Burned</div>
            </div>
            <div class="stat-card stat-success">
              <div class="stat-value">${formatTokens(tokenStats.rate)}/min</div>
              <div class="stat-label">Burn Rate</div>
            </div>
            <div class="stat-card stat-pending">
              <div class="stat-value">${Math.round(tokenStats.avg)}</div>
              <div class="stat-label">Avg per Op</div>
            </div>
            <div class="stat-card stat-errors">
              <div class="stat-value">${formatTokens(tokenStats.max)}</div>
              <div class="stat-label">Max Single</div>
            </div>
          </div>
        </div>

        <!-- Frikkie VPS Agent -->
        <div class="telemetry-section frikkie-section">
          <h3>🤖 Frikkie - VPS Agent ${vps.connected ? html`<span class="status-badge connected">● Connected</span>` : html`<span class="status-badge disconnected">○ Offline</span>`}</h3>
          ${vps.connected && vps.agent ? html`
            <div class="frikkie-grid">
              <div class="frikkie-card">
                <div class="frikkie-header">
                  <span class="frikkie-icon">🧠</span>
                  <span class="frikkie-title">Model</span>
                </div>
                <div class="frikkie-body">
                  <div class="frikkie-value">${vps.agent.model || 'N/A'}</div>
                  <div class="frikkie-label">${vps.agent.modelProvider || 'unknown'}</div>
                </div>
              </div>
              <div class="frikkie-card">
                <div class="frikkie-header">
                  <span class="frikkie-icon">🔥</span>
                  <span class="frikkie-title">Session Tokens</span>
                </div>
                <div class="frikkie-body">
                  <div class="frikkie-value">${formatTokens(vps.agent.totalTokens || 0)}</div>
                  <div class="frikkie-label">${formatTokens(vps.agent.contextTokens || 0)} context</div>
                </div>
              </div>
              <div class="frikkie-card">
                <div class="frikkie-header">
                  <span class="frikkie-icon">📡</span>
                  <span class="frikkie-title">Channel</span>
                </div>
                <div class="frikkie-body">
                  <div class="frikkie-value">${vps.agent.lastChannel || 'N/A'}</div>
                  <div class="frikkie-label">${vps.agent.chatType || ''}</div>
                </div>
              </div>
              <div class="frikkie-card">
                <div class="frikkie-header">
                  <span class="frikkie-icon">📂</span>
                  <span class="frikkie-title">Active Files</span>
                </div>
                <div class="frikkie-body">
                  <div class="frikkie-value">${vps.activity?.count || 0}</div>
                  <div class="frikkie-label">modified (1hr)</div>
                </div>
              </div>
            </div>
            ${vps.activity?.files?.length > 0 ? html`
              <div class="frikkie-activity">
                <h4>📝 Recent Workspace Activity</h4>
                <ul class="activity-list">
                  ${vps.activity.files.slice(0, 8).map(f => html`<li class="activity-file">${f}</li>`)}
                </ul>
              </div>
            ` : ''}
            ${vps.skills?.length > 0 ? html`
              <div class="frikkie-skills">
                <h4>🛠️ Loaded Skills</h4>
                <div class="skill-tags">
                  ${vps.skills.map(s => html`<span class="skill-tag">${s}</span>`)}
                </div>
              </div>
            ` : ''}
            ${vps.vitals ? html`
              <div class="frikkie-vitals">
                <h4>📊 VPS Resource Usage</h4>
                <div class="vitals-mini">
                  <div class="vital-mini">
                    <span>CPU:</span>
                    <div class="mini-gauge"><div class="mini-bar" style="width: ${vps.vitals.cpu?.usage || 0}%"></div></div>
                    <span>${vps.vitals.cpu?.usage || 0}%</span>
                  </div>
                  <div class="vital-mini">
                    <span>RAM:</span>
                    <div class="mini-gauge"><div class="mini-bar" style="width: ${vps.vitals.memory?.percent || 0}%"></div></div>
                    <span>${vps.vitals.memory?.percent || 0}%</span>
                  </div>
                  <div class="vital-mini">
                    <span>Uptime:</span>
                    <span>${formatUptime(vps.vitals.uptime || 0)}</span>
                  </div>
                </div>
              </div>
            ` : ''}
          ` : html`
            <div class="frikkie-offline">
              <p>🔌 VPS agent not connected. ${vps.error ? html`<br><small>${vps.error}</small>` : ''}</p>
              <p><small>Ensure SSH key is configured for passwordless access to 76.13.36.42</small></p>
            </div>
          `}
        </div>

        <!-- VPS Vitals (Guard Dog) - Hostinger VPS Health -->
        <div class="telemetry-section vitals-section">
          <h3>🐕 Guard Dog - VPS Health ${vps.connected ? html`<span class="status-badge connected">● Live</span>` : html`<span class="status-badge disconnected">○ Offline</span>`}</h3>
          ${vps.connected && vps.vitals ? html`
          <div class="vitals-grid">
            <div class="vital-card">
              <div class="vital-header">
                <span class="vital-icon">💻</span>
                <span class="vital-title">CPU</span>
              </div>
              <div class="vital-gauge">
                <div class="gauge-bar" style="width: ${vps.vitals.cpu?.usage || 0}%; background: ${(vps.vitals.cpu?.usage || 0) > 80 ? '#ef4444' : (vps.vitals.cpu?.usage || 0) > 50 ? '#f59e0b' : '#10b981'}"></div>
              </div>
              <div class="vital-details">
                <span>${vps.vitals.cpu?.usage || 0}% used</span>
                <span>Hostinger VPS</span>
              </div>
            </div>
            <div class="vital-card">
              <div class="vital-header">
                <span class="vital-icon">🧠</span>
                <span class="vital-title">Memory</span>
              </div>
              <div class="vital-gauge">
                <div class="gauge-bar" style="width: ${vps.vitals.memory?.percent || 0}%; background: ${(vps.vitals.memory?.percent || 0) > 80 ? '#ef4444' : (vps.vitals.memory?.percent || 0) > 50 ? '#f59e0b' : '#10b981'}"></div>
              </div>
              <div class="vital-details">
                <span>${vps.vitals.memory?.percent || 0}% used</span>
                <span>Hostinger VPS</span>
              </div>
            </div>
            <div class="vital-card vital-info">
              <div class="vital-header">
                <span class="vital-icon">🖥️</span>
                <span class="vital-title">System</span>
              </div>
              <div class="vital-meta">
                <div><strong>Host:</strong> ${vps.vitals.hostname || '76.13.36.42'}</div>
                <div><strong>Platform:</strong> ${vps.vitals.platform || 'Linux'}</div>
                <div><strong>Uptime:</strong> ${formatUptime(vps.vitals.uptime || 0)}</div>
              </div>
            </div>
          </div>
          ` : html`
          <div class="vitals-offline">
            <p>🔌 VPS connection unavailable for health monitoring</p>
          </div>
          `}
        </div>

        <!-- Agent Performance Grid -->
        <div class="telemetry-section">
          <h3>🤖 Agent Performance</h3>
          <div class="agent-grid enhanced">
            ${agentStats.map(agent => html`
              <div class="agent-card enhanced" style="border-color: ${(agents[agent.agent_id] || {}).color || '#666'}">
                <div class="agent-header" style="background: ${(agents[agent.agent_id] || {}).color || '#666'}20">
                  <span class="agent-icon">${(agents[agent.agent_id] || {}).icon || '🤖'}</span>
                  <span class="agent-name">${agent.agent_id}</span>
                </div>
                <div class="agent-body">
                  <div class="agent-stat-row">
                    <span>📊 Events</span>
                    <span class="agent-value">${agent.event_count}</span>
                  </div>
                  <div class="agent-stat-row">
                    <span>🔥 Tokens</span>
                    <span class="agent-value">${formatTokens(agent.total_tokens)}</span>
                  </div>
                </div>
                <div class="agent-bar">
                  <div class="agent-bar-fill" style="width: ${Math.min((agent.total_tokens / (tokenStats.total || 1)) * 100 * 5, 100)}%; background: ${(agents[agent.agent_id] || {}).color || '#666'}"></div>
                </div>
              </div>
            `)}
          </div>
        </div>

        <!-- Recent Activity Log -->
        <div class="telemetry-section">
          <h3>📜 Recent Activity</h3>
          <div class="logs-container enhanced">
            <table class="logs-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Agent</th>
                  <th>Operation</th>
                  <th>Bead ID</th>
                  <th>Tokens</th>
                </tr>
              </thead>
              <tbody>
                ${telemetryLogs.slice(0, 15).map(log => html`
                  <tr class="log-row">
                    <td class="log-time">${formatTimestamp(log.timestamp)}</td>
                    <td class="log-agent">
                      <span class="agent-badge" style="background: ${(agents[log.agent_id] || {}).color || '#666'}20; color: ${(agents[log.agent_id] || {}).color || '#666'}">
                        ${(agents[log.agent_id] || {}).icon || '🤖'} ${log.agent_id}
                      </span>
                    </td>
                    <td class="log-action">${log.node_type}</td>
                    <td class="log-bead">${log.bead_id || '-'}</td>
                    <td class="log-tokens">${log.token_burn > 0 ? html`<span class="token-badge">🔥 ${log.token_burn}</span>` : '-'}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function doRender() {
    render(template(), mount_element);

    // Initialize Drawflow after render
    setTimeout(() => {
      if (!drawflowEditor) {
        initDrawflow();
      } else {
        updateDrawflowNodes();
      }
    }, 100);
  }

  async function fetchTelemetry() {
    try {
      const response = await fetch('/api/telemetry');
      const data = await response.json();
      if (data.ok) {
        telemetryLogs = data.telemetry || [];
        tokenStats = data.tokenStats || tokenStats;
        agentStats = data.agentStats || [];
        nodeTypeStats = data.nodeTypeStats || [];
        vitals = data.vitals || vitals;
        vps = data.vps || vps;
        error = null;
      } else {
        error = data.error || 'Failed to load telemetry';
      }
    } catch (err) {
      error = 'Connection error: ' + (err.message || 'Unknown');
    }
    loading = false;
    doRender();
  }

  async function load() {
    log('loading telemetry data');
    loading = true;
    doRender();
    await fetchTelemetry();

    // Subscribe to real-time WebSocket updates
    if (wsClient && !unsubscribeWs) {
      unsubscribeWs = wsClient.on('telemetry-update', (payload) => {
        log('received telemetry-update via WebSocket');
        if (payload) {
          if (payload.tokenStats) tokenStats = payload.tokenStats;
          if (payload.agentStats) agentStats = payload.agentStats;
          if (payload.vps) vps = payload.vps;
          if (payload.telemetry) telemetryLogs = payload.telemetry;
          doRender();
        }
      });
      log('subscribed to telemetry-update WebSocket events');
    }

    // Keep polling as fallback (reduced frequency with WebSocket)
    if (!pollInterval) {
      pollInterval = window.setInterval(fetchTelemetry, 10000); // Slower fallback poll
    }
  }

  unsubscribe = store.subscribe((s) => {
    if (s.view === 'telemetry') {
      if (telemetryLogs.length === 0) void load();
    } else {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }
  });

  return {
    load,
    destroy() {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      if (unsubscribeWs) { unsubscribeWs(); unsubscribeWs = null; }
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      if (drawflowEditor) { drawflowEditor = null; }
      render(html``, mount_element);
    }
  };
}
