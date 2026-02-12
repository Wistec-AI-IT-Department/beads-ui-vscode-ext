/**
 * VPS Telemetry Collector
 * Polls Frikkie's OpenClaw VPS for session stats and activity
 */
import { spawn } from 'node:child_process';
import { debug } from './logging.js';

const log = debug('vps-telemetry');

const VPS_CONFIG = {
    host: 'root@76.13.36.42',
    sshOptions: ['-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=5', '-o', 'BatchMode=yes'],
    cacheTTL: 10000, // 10 second cache
};

let cachedData = null;
let lastFetch = 0;

/**
 * Execute SSH command and return stdout
 */
function sshExec(command, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const args = [...VPS_CONFIG.sshOptions, VPS_CONFIG.host, command];
        const proc = spawn('ssh', args, { timeout });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve(stdout.trim());
            } else {
                reject(new Error(`SSH failed (${code}): ${stderr}`));
            }
        });

        proc.on('error', reject);

        // Force kill after timeout
        setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new Error('SSH timeout'));
        }, timeout);
    });
}

/**
 * Fetch OpenClaw session data from VPS
 */
async function fetchSessionData() {
    const command = `cat ~/.openclaw/agents/main/sessions/sessions.json 2>/dev/null || echo '{}'`;
    const raw = await sshExec(command);
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

/**
 * Fetch VPS system vitals
 */
async function fetchVpsVitals() {
    const command = `echo '{'
    echo '"cpu_percent":'$(top -bn1 | grep "Cpu(s)" | awk '{print int($2)}')','
    echo '"mem_total":'$(free -b | awk '/Mem:/{print $2}')','
    echo '"mem_used":'$(free -b | awk '/Mem:/{print $3}')','
    echo '"mem_free":'$(free -b | awk '/Mem:/{print $4}')','
    echo '"uptime":'$(cat /proc/uptime | awk '{print int($1)}')','
    echo '"load":'$(cat /proc/loadavg | awk '{print "["$1","$2","$3"]"}')','
    echo '"hostname":"'$(hostname)'",'
    echo '"platform":"linux"'
    echo '}'`;

    const raw = await sshExec(command);
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Fetch recent workspace activity
 */
async function fetchWorkspaceActivity() {
    const command = `find ~/.openclaw/workspace -type f \\( -name '*.py' -o -name '*.html' -o -name '*.js' -o -name '*.css' \\) -mmin -60 2>/dev/null | wc -l; 
    find ~/.openclaw/workspace -type f \\( -name '*.py' -o -name '*.html' -o -name '*.js' -o -name '*.css' \\) -mmin -60 -printf '%T@ %p\\n' 2>/dev/null | sort -rn | head -10 | cut -d' ' -f2-`;

    const raw = await sshExec(command);
    const lines = raw.split('\n').filter(l => l.trim());
    const count = parseInt(lines[0]) || 0;
    const files = lines.slice(1).map(f => f.replace('/root/.openclaw/workspace/', ''));

    return { count, files };
}

/**
 * Fetch OpenClaw command log
 */
async function fetchCommandLog() {
    const command = `tail -20 ~/.openclaw/logs/commands.log 2>/dev/null || echo '[]'`;
    const raw = await sshExec(command);

    try {
        const lines = raw.split('\n').filter(l => l.trim());
        return lines.map(line => {
            try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean).reverse();
    } catch {
        return [];
    }
}

/**
 * Get full VPS telemetry data (with caching)
 */
export async function getVpsTelemetry() {
    const now = Date.now();

    // Return cached data if fresh
    if (cachedData && (now - lastFetch) < VPS_CONFIG.cacheTTL) {
        return { ...cachedData, cached: true };
    }

    try {
        log('Fetching VPS telemetry...');

        const [sessionData, vitals, activity, commandLog] = await Promise.all([
            fetchSessionData().catch(() => ({})),
            fetchVpsVitals().catch(() => null),
            fetchWorkspaceActivity().catch(() => ({ count: 0, files: [] })),
            fetchCommandLog().catch(() => [])
        ]);

        // Extract agent session info
        const mainSession = sessionData['agent:main:main'] || {};

        const agentInfo = {
            modelProvider: mainSession.modelProvider || 'unknown',
            model: mainSession.model || 'unknown',
            contextTokens: mainSession.contextTokens || 0,
            inputTokens: mainSession.inputTokens || 0,
            outputTokens: mainSession.outputTokens || 0,
            totalTokens: mainSession.totalTokens || 0,
            lastChannel: mainSession.lastChannel || 'unknown',
            chatType: mainSession.chatType || 'unknown',
            sessionId: mainSession.sessionId || null,
            updatedAt: mainSession.updatedAt ? new Date(mainSession.updatedAt).toISOString() : null
        };

        // Extract skills
        const skills = (mainSession.skillsSnapshot?.skills || []).map(s => s.name);

        cachedData = {
            connected: true,
            error: null,
            agent: agentInfo,
            skills,
            vitals: vitals ? {
                cpu: { usage: vitals.cpu_percent, load: vitals.load },
                memory: {
                    total: vitals.mem_total,
                    used: vitals.mem_used,
                    free: vitals.mem_free,
                    percent: Math.round((vitals.mem_used / vitals.mem_total) * 100)
                },
                uptime: vitals.uptime,
                platform: vitals.platform,
                hostname: vitals.hostname
            } : null,
            activity,
            commandLog,
            fetchedAt: new Date().toISOString()
        };

        lastFetch = now;
        log('VPS telemetry fetched successfully');

        return { ...cachedData, cached: false };

    } catch (err) {
        log('VPS telemetry failed: %s', err.message);

        // Return stale cache if available
        if (cachedData) {
            return { ...cachedData, cached: true, stale: true, error: err.message };
        }

        return {
            connected: false,
            error: err.message,
            agent: null,
            skills: [],
            vitals: null,
            activity: { count: 0, files: [] },
            commandLog: [],
            fetchedAt: new Date().toISOString()
        };
    }
}

/**
 * Check if VPS is reachable
 */
export async function checkVpsConnection() {
    try {
        await sshExec('echo ok', 5000);
        return { connected: true };
    } catch (err) {
        return { connected: false, error: err.message };
    }
}
