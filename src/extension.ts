import * as vscode from "vscode";
import { BeadsIssueService } from "./services/beadsIssueService";
import { IssuesViewProvider } from "./views/issuesViewProvider";
import { IssueDetailPanelManager } from "./views/issueDetailPanelManager";
import { TelemetryDashboardPanel } from "./views/telemetryDashboard";
import { TemplateRenderer } from "./utils/templateRenderer";

export function activate(context: vscode.ExtensionContext) {
  console.log("[Beads UI] Activation started...");
  console.log(`[Beads UI] Extension path: ${context.extensionPath}`);
  console.log(`[Beads UI] Extension URI: ${context.extensionUri.toString()}`);

  try {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    console.log(`[Beads UI] Workspace root: ${workspaceRoot ?? "(no workspace)"}`);

    const issueService = new BeadsIssueService(workspaceRoot);
    console.log("[Beads UI] BeadsIssueService created");

    const templates = new TemplateRenderer(context.extensionUri);
    console.log("[Beads UI] TemplateRenderer created");

    const detailManager = new IssueDetailPanelManager(issueService, templates, context.extensionPath);
    console.log("[Beads UI] IssueDetailPanelManager created");

    const viewProvider = new IssuesViewProvider(
      templates,
      issueService,
      async (issueId) => {
        await detailManager.show(issueId);
      },
      context.extensionUri
    );
    console.log("[Beads UI] IssuesViewProvider created");

    // Register webview view provider
    const viewProviderDisposable = vscode.window.registerWebviewViewProvider(
      "beadsIssues.list",
      viewProvider
    );
    console.log("[Beads UI] WebviewViewProvider registered for beadsIssues.list");

    // Register commands
    const refreshCommand = vscode.commands.registerCommand(
      "beads-ui.refreshIssues",
      () => {
        console.log("[Beads UI] Command: beads-ui.refreshIssues executed");
        return viewProvider.refreshIssues();
      }
    );
    console.log("[Beads UI] Command registered: beads-ui.refreshIssues");

    const toggleSortCommand = vscode.commands.registerCommand(
      "beads-ui.toggleSort",
      () => {
        console.log("[Beads UI] Command: beads-ui.toggleSort executed");
        return viewProvider.toggleSort();
      }
    );
    console.log("[Beads UI] Command registered: beads-ui.toggleSort");

    const newIssueCommand = vscode.commands.registerCommand(
      "beads-ui.newIssue",
      () => {
        console.log("[Beads UI] Command: beads-ui.newIssue executed");
        return viewProvider.createAndOpenIssue();
      }
    );
    console.log("[Beads UI] Command registered: beads-ui.newIssue");

    const openTelemetryCommand = vscode.commands.registerCommand(
      "beads-ui.openTelemetry",
      () => {
        // Telemetry is now embedded in the main UI as a tab
        // This command is kept for backwards compatibility
        TelemetryDashboardPanel.createOrShow(issueService);
      }
    );
    console.log("[Beads UI] Command registered: beads-ui.openTelemetry");

    // Add all disposables to subscriptions
    context.subscriptions.push(
      viewProviderDisposable,
      refreshCommand,
      toggleSortCommand,
      newIssueCommand,
      openTelemetryCommand,
      detailManager,
      { dispose: () => issueService.dispose() }
    );

    // Note: Telemetry is now embedded as a tab in the main Beads UI
    // No need for separate auto-open

    console.log("[Beads UI] Extension activated successfully!");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Beads UI] Activation FAILED: ${message}`);
    vscode.window.showErrorMessage(`Beads UI failed to activate: ${message}`);
    throw error; // Re-throw to mark activation as failed
  }
}

export function deactivate() {
  console.log("[Beads UI] Extension deactivated");
}
