# Beads UI

A VSCode extension that provides a user-friendly interface for working with [beads](https://github.com/steveyegge/beads) - a dependency-aware issue tracker where issues are chained together like beads.

## Features

- **Activity Bar View**: Browse all beads issues in a dedicated sidebar panel
- **Issue List**: View, search, and filter issues by status and text
- **Issue Details**: Click any issue to open a detailed view with full information
- **Dependency Visualization**: See related issues, dependencies, and dependents at a glance
- **Theme Integration**: Fully adapts to your VSCode theme (dark, light, or high contrast)
- **Real-time Filtering**: Search issues by ID, title, or description
- **Status-based Filtering**: Filter issues by status (open, closed, in_progress, blocked)

## Requirements

- **VSCode**: Version 1.106.0 or higher
- **beads CLI**: The `bd` command must be available on your PATH
  - Install beads from [github.com/steveyegge/beads](https://github.com/steveyegge/beads)
  - Ensure `bd` is accessible from your terminal
- **Workspace**: Open a workspace folder that contains a `.beads` directory with an initialized beads database

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

1. Open a workspace that has beads initialized (contains a `.beads/` directory)
2. Click the Beads icon in the Activity Bar (sidebar)
3. Browse issues in the list view
4. Use the search box to filter by text
5. Use the status dropdown to filter by status
6. Click any issue to open detailed information in a new panel
7. Click related issues in the detail view to navigate between dependencies

## Development

### Project Structure

```
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
