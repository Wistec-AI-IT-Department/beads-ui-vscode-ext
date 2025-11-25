# Beads VSCode Extension

## Project Overview

This is a VSCode extension that provides a rich UI for working with [beads](https://github.com/steveyegge/beads) inside VSCode. Beads (bd) is a dependency-aware issue tracker where issues are chained together like beads, perfect for AI-supervised workflows.

### What This Extension Does

- **Activity Bar View**: Browse all issues in a searchable, filterable list
- **Issue Detail Panels**: View complete issue details including description, metadata, and related issues
- **Epic Subtasks**: Automatically displays subtasks for epic issues in the related issues section
- **Multi-Select Filters**: Filter by status (open, in_progress, blocked, closed) and type (bug, feature, task, epic, chore)
- **Fast Performance**: Direct SQLite database access for blazing-fast issue loading
- **Native VSCode UI**: Uses VSCode's native UI components for consistent theming

### Technologies Used

- **TypeScript**: Primary development language
- **VSCode Extension API**: Core extension framework
- **sql.js**: WebAssembly-based SQLite for reading beads database
- **Edge.js**: Templating engine for webview HTML
- **@vscode-elements/elements**: VSCode native UI components (multi-select, buttons, etc.)
- **Webpack**: Bundling and build system
- **Mocha**: Testing framework

### Architecture

```
src/
├── extension.ts              # Extension entry point
├── services/
│   └── beadsIssueService.ts  # SQLite database access layer
├── views/
│   ├── issuesViewProvider.ts       # Activity bar issues list view
│   └── issueDetailPanelManager.ts  # Issue detail panel manager
├── utils/
│   ├── helpers.ts            # Utility functions
│   └── templateRenderer.ts   # Edge.js template rendering
└── types.ts                  # TypeScript type definitions

media/
├── issuesView.edge           # Issues list webview template
└── issueDetail.edge          # Issue detail webview template
```

### Key Implementation Details

- **Database Access**: Uses sql.js (pure JavaScript/WebAssembly) instead of native modules to avoid Node.js version compatibility issues
- **Epic Subtasks**: Queries database for hierarchical IDs (e.g., `epic-id.1`, `epic-id.2`) to find subtasks
- **Webview Communication**: Bidirectional messaging between extension and webviews for issue navigation
- **CSP-Compliant**: All webviews use Content Security Policy with nonces for script execution

## Before You Start

Review the beads workflow below before making changes so every task stays aligned with the canonical tracker.

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**
```bash
bd ready --json
```

**Create new issues:**
```bash
bd create "Issue title" -t bug|feature|task -p 0-4 --json
bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**
```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**
```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`
6. **Commit together**: Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### Auto-Sync

bd automatically syncs with git:
- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### MCP Server (Recommended)

If using Claude or MCP-compatible clients, install the beads MCP server:

```bash
pip install beads-mcp
```

Add to MCP config (e.g., `~/.config/claude/config.json`):
```json
{
  "beads": {
    "command": "beads-mcp",
    "args": []
  }
}
```

Then use `mcp__beads__*` functions instead of CLI commands.

### Managing AI-Generated Planning Documents

AI assistants often create planning and design documents during development:
- PLAN.md, IMPLEMENTATION.md, ARCHITECTURE.md
- DESIGN.md, CODEBASE_SUMMARY.md, INTEGRATION_PLAN.md
- TESTING_GUIDE.md, TECHNICAL_DESIGN.md, and similar files

**Best Practice: Use a dedicated directory for these ephemeral files**

**Recommended approach:**
- Create a `history/` directory in the project root
- Store ALL AI-generated planning/design docs in `history/`
- Keep the repository root clean and focused on permanent project files
- Only access `history/` when explicitly asked to review past planning

**Example .gitignore entry (optional):**
```
# AI planning documents (ephemeral)
history/
```

**Benefits:**
- ✅ Clean repository root
- ✅ Clear separation between ephemeral and permanent documentation
- ✅ Easy to exclude from version control if desired
- ✅ Preserves planning history for archeological research
- ✅ Reduces noise when browsing the project

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ✅ Store AI planning docs in `history/` directory
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems
- ❌ Do NOT clutter repo root with planning documents

For more details, see README.md and QUICKSTART.md.

## Building the Extension

### Prerequisites

- Node.js and npm installed
- VSCode installed

### Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes during development
npm run watch

# Run tests
npm test

# Lint code
npm run lint
```

### Testing the Extension

1. Open this project in VSCode
2. Press F5 to open a new VSCode window with the extension loaded
3. The extension will be active in the new window

### Packaging for Distribution

```bash
# Create production build
npm run package
```

## Using Beads

### Quick Start

```bash
# Initialize beads in your project (already done for this project)
bd init

# Create a new issue
bd create "My task title"
bd create "Add feature" -p 0 -t feature --assignee alice

# List issues
bd list
bd list --status open
bd ready  # Show issues ready to work on

# Show issue details
bd show bd-1

# Update an issue
bd update bd-1 --status in_progress
bd update bd-1 --assignee bob

# Add dependencies
bd dep add bd-1 bd-2  # bd-2 blocks bd-1

# Close an issue
bd close bd-1
```

### Key Concepts

- **Dependencies**: Issues can block other issues (blocks, related, parent-child, discovered-from)
- **Ready Work**: `bd ready` shows unblocked issues ready to be worked on
- **Git Sync**: Beads automatically syncs with git (JSONL format)
- **Agent-Friendly**: Designed for AI agents to discover, track, and claim work

### Database Location

The beads database is at `.beads/beads.db` in this project
