import sqlite3
import threading
import time
import random
import os
import json
from datetime import datetime

# Configuration
DB_PATH = os.path.join(".beads", "beads.db")
NUM_AGENTS = 7
FAILURE_RATE = 0.2
WORK_CYCLE_DELAY = 1.0  # Seconds

def get_db_connection():
    return sqlite3.connect(DB_PATH, check_same_thread=False)

def init_telemetry_table():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS wistec_telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            agent_id TEXT,
            bead_id TEXT,
            node_type TEXT,
            logic_branch TEXT,
            token_burn INTEGER
        )
    ''')
    conn.commit()
    conn.close()

def log_telemetry(conn, agent_id, bead_id, node_type, logic_branch, token_burn):
    timestamp = datetime.now().isoformat()
    try:
        c = conn.cursor()
        c.execute('''
            INSERT INTO wistec_telemetry (timestamp, agent_id, bead_id, node_type, logic_branch, token_burn)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (timestamp, agent_id, bead_id, node_type, logic_branch, token_burn))
        conn.commit()
    except sqlite3.Error as e:
        print(f"Error logging telemetry: {e}")

def get_ready_beads(conn):
    try:
        c = conn.cursor()
        # Simple ready check (status is open/in_progress or just pick any for simulation)
        # In a real beads system, we'd check deps. For stress test, any open issue is fine.
        c.execute("SELECT id FROM issues WHERE status IN ('open', 'in_progress')")
        rows = c.fetchall()
        return [row[0] for row in rows]
    except sqlite3.Error:
        return []

def agent_worker(agent_id):
    conn = get_db_connection()
    print(f"[{agent_id}] Activated.")
    
    while True:
        ready_beads = get_ready_beads(conn)
        
        if not ready_beads:
            # If no beads, simulate idle or create one? 
            # Let's simple wait a bit then try again, or pretend to work on "internal" tasks.
            # For flooding the dashboard, we'll pretend to work on a "System Update" if no beads.
            current_bead = "sys-maintenance"
        else:
            current_bead = random.choice(ready_beads)
            
        # 1. Analysis
        # Log to Telemetry
        burn_analysis = random.randint(50, 150)
        log_telemetry(conn, agent_id, current_bead, "Analysis", "Normal", burn_analysis)
        time.sleep(random.uniform(0.5, 1.5))
        
        # 2. Execution (with failure chance)
        if random.random() < FAILURE_RATE:
            # FAILURE -> Healing Loop
            log_telemetry(conn, agent_id, current_bead, "Execution", "Loop", 0) # Failed exec
            time.sleep(0.5)
            
            # Healing Logic
            burn_healing = random.randint(100, 300)
            log_telemetry(conn, agent_id, current_bead, "Healing", "Loop", burn_healing)
            time.sleep(1.0)
            
            # Retry Execution
            burn_retry = random.randint(200, 500)
            log_telemetry(conn, agent_id, current_bead, "Execution", "Retry", burn_retry)
        else:
            # SUCCESS
            burn_exec = random.randint(200, 500)
            log_telemetry(conn, agent_id, current_bead, "Execution", "Normal", burn_exec)
            
        time.sleep(random.uniform(0.5, 1.5))
        
        # 3. Completion
        # We don't actually close the bead in the DB to avoid running out of beads in the test.
        # Just log the step.
        log_telemetry(conn, agent_id, current_bead, "Completion", "Normal", 0)
        
        time.sleep(WORK_CYCLE_DELAY)

def main():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}. Run 'bd init' first.")
        return

    print("Initializing Wistec Telemetry Grid...")
    init_telemetry_table()
    
    threads = []
    print(f"Deploying {NUM_AGENTS} Agents...")
    
    for i in range(1, NUM_AGENTS + 1):
        t = threading.Thread(target=agent_worker, args=(f"Agent-{i}",))
        t.daemon = True # Daemon threads exit when main exits
        threads.append(t)
        t.start()
        
    print("Stress Test Running. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping Stress Test...")

if __name__ == "__main__":
    main()
