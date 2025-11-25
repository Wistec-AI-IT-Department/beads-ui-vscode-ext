import * as vscode from "vscode";
import { BeadsIssueService } from "./services/beadsIssueService";
import { IssuesViewProvider } from "./views/issuesViewProvider";
import { IssueDetailPanelManager } from "./views/issueDetailPanelManager";
import { TemplateRenderer } from "./utils/templateRenderer";

export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const issueService = new BeadsIssueService(workspaceRoot);
  const templates = new TemplateRenderer(context.extensionUri);
  const detailManager = new IssueDetailPanelManager(issueService, templates);
  const viewProvider = new IssuesViewProvider(
    templates,
    issueService,
    async (issueId) => {
      await detailManager.show(issueId);
    },
    context.extensionUri
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("beadsIssues.list", viewProvider),
    vscode.commands.registerCommand("beads-ui.refreshIssues", () =>
      viewProvider.refreshIssues()
    ),
    vscode.commands.registerCommand("beads-ui.toggleSort", () =>
      viewProvider.toggleSort()
    ),
    vscode.commands.registerCommand("beads-ui.newIssue", () =>
      viewProvider.createAndOpenIssue()
    ),

    detailManager,
    { dispose: () => issueService.dispose() }
  );

  console.log("Beads UI extension activated");
}

export function deactivate() {}
