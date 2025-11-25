# Beads UI

[![Release](https://img.shields.io/github/v/release/DEVtheOPS/beads-ui-vscode-ext)](https://github.com/DEVtheOPS/beads-ui-vscode-ext/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/DEVtheOPS/beads-ui-vscode-ext/tests.yml?branch=main&label=tests)](https://github.com/DEVtheOPS/beads-ui-vscode-ext/actions/workflows/tests.yml)
![Visual Studio Marketplace Last Updated](https://img.shields.io/visual-studio-marketplace/last-updated/DEVtheOPS.beads-ui)

[![License](https://img.shields.io/github/license/DEVtheOPS/beads-ui-vscode-ext)](LICENSE)

A VSCode extension that provides a rich, native UI for working with [beads](https://github.com/steveyegge/beads) - a dependency-aware issue tracker where issues are chained together like beads, perfect for AI-supervised workflows.

## Features

- **Activity Bar View**: Browse all beads issues in a dedicated sidebar panel with blazing-fast performance
- **Advanced Filtering**: Multi-select filters for status (open, in_progress, blocked, closed) and type (bug, feature, task, epic, chore)
- **Smart Search**: Search issues by ID, title, or description in real-time
- **Issue Details**: Click any issue to open a detailed view with full information
- **Epic Subtasks**: Automatically displays subtasks for epic issues in the related issues section
- **Dependency Visualization**: See related issues, dependencies, dependents, and epic subtasks at a glance
- **Theme Integration**: Fully adapts to your VSCode theme using native VSCode UI components
- **Responsive Design**: Toolbar adapts to panel width with intelligent wrapping
- **Fast Performance**: Direct SQLite database access for instant issue loading

## Requirements

- **VSCode**: Version 1.106.0 or higher
- **beads**: A beads-initialized workspace
  - Install beads from [github.com/steveyegge/beads](https://github.com/steveyegge/beads)
  - Initialize beads in your project: `bd init`
- **Workspace**: Open a workspace folder that contains a `.beads` directory with a beads database

## Installation

### From Source

1. Clone this repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the extension:

   ```bash
   npm run compile
   ```

4. Press `F5` in VSCode to launch the Extension Development Host

## Usage

1. **Open a beads workspace**: Open a folder that has beads initialized (contains a `.beads/` directory)
2. **Access the Beads view**: Click the Beads icon in the Activity Bar (left sidebar)
3. **Browse issues**: View all issues in the searchable list
4. **Filter issues**:
   - Use the search box to filter by ID, title, or description
   - Use the status multi-select to filter by status (open, in_progress, blocked, closed)
   - Use the type multi-select to filter by type (bug, feature, task, epic, chore)
5. **Refresh**: Click the Refresh button to reload issues from the database
6. **View details**: Click any issue to open a detailed panel with:
   - Full description and metadata
   - Related issues (dependencies, dependents)
   - Epic subtasks (for epic issues)
   - Raw JSON data
7. **Navigate**: Click related issues in the detail view to navigate between dependencies and subtasks

## Development

### Project Structure

```plain
src/
├── extension.ts                    # Extension entry point
├── types.ts                        # TypeScript interfaces
├── services/
│   └── beadsIssueService.ts       # Beads CLI interaction
├── views/
│   ├── issuesViewProvider.ts      # Sidebar issues list
│   └── issueDetailPanelManager.ts # Detail panel manager
└── utils/
    ├── templateRenderer.ts        # Template engine wrapper
    └── helpers.ts                 # Utility functions

media/
├── issuesView.edge                # Issues list template
└── issueDetail.edge               # Issue detail template
```

### Building

```bash
# Install dependencies
npm install

# Compile TypeScript and bundle with webpack
npm run compile

# Watch mode for development
npm run watch

# Run tests
npm test

# Lint code
npm run lint

# Create production build
npm run package
```

### Testing the Extension

1. Open this project in VSCode
2. Press `F5` to launch the Extension Development Host
3. Open a workspace that has a beads database initialized
4. The extension will activate automatically

### Debugging

1. Set breakpoints in the TypeScript source files
2. Press `F5` to start debugging
3. The debugger will attach to the Extension Development Host
4. Check the Debug Console for logs and errors

## Extension Settings

This extension does not currently add any VSCode settings.

## Known Issues

- The extension requires the `bd` CLI to be installed and available on PATH
- Currently read-only - creating and updating issues must be done via the `bd` CLI
- Large issue lists may take a moment to load

## Release Notes

### 0.0.1

Initial release:

- Activity bar view for browsing beads issues
- Search and filter functionality
- Detailed issue view with dependencies
- Full theme integration

## Contributing

This extension uses:

- TypeScript for type safety
- Webpack for bundling
- Edge.js for templating
- VSCode's Webview API for custom UI

## License

See LICENSE file for details.
