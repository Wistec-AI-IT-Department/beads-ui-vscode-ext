import * as vscode from "vscode";
import { BdIssue } from "../types";
import { BeadsIssueService } from "../services/beadsIssueService";
import { TemplateRenderer } from "../utils/templateRenderer";
import { getNonce, formatDescription, extractRelatedIssuesFromIssue } from "../utils/helpers";

export class IssueDetailPanelManager implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(private readonly issueService: BeadsIssueService, private readonly templates: TemplateRenderer) {}

  async show(issueId: string) {
    if (!issueId) {
      vscode.window.showErrorMessage("No issue id provided.");
      return;
    }

    const existing = this.panels.get(issueId);
    if (existing) {
      existing.reveal(existing.viewColumn ?? vscode.ViewColumn.Active);
      await this.updatePanel(existing, issueId);
      return;
    }

    const panel = vscode.window.createWebviewPanel("beadsIssueDetails", `Beads ${issueId}`, vscode.ViewColumn.Active, {
      enableScripts: true,
    });
    this.panels.set(issueId, panel);

    panel.onDidDispose(() => {
      this.panels.delete(issueId);
    });

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message?.type) {
        case "openIssue":
          if (typeof message.id === "string" && message.id.length) {
            await this.show(message.id);
          }
          break;
        case "saveIssue":
          if (typeof message.id === "string" && message.id.length) {
            try {
              await this.issueService.updateIssue(message.id, {
                title: message.updates?.title,
                status: message.updates?.status,
                priority: message.updates?.priority,
                assignee: message.updates?.assignee,
                description: message.updates?.description,
              });

              vscode.window.showInformationMessage(`Saved ${message.id}`);
              await vscode.commands.executeCommand("beads-ui.refreshIssues");
              await this.updatePanel(panel, message.id);
            } catch (error) {
              const messageText = error instanceof Error ? error.message : String(error);
              vscode.window.showErrorMessage(messageText);
              panel.webview.postMessage({ type: "saveError", payload: messageText });
            }
          }
          break;
        case "addSubIssue":
          if (typeof message.parentId === "string" && message.parentId.length) {
            try {
              const created = await this.issueService.createSubIssue(message.parentId);
              vscode.window.showInformationMessage(`Created ${created.id}`);
              await vscode.commands.executeCommand("beads-ui.refreshIssues");
              await this.updatePanel(panel, message.parentId);
              await this.show(String(created.id));
            } catch (error) {
              const messageText = error instanceof Error ? error.message : String(error);
              vscode.window.showErrorMessage(messageText);
              panel.webview.postMessage({ type: "addSubIssueError", payload: messageText });
            }
          }
          break;
        default:
          break;
      }
    });

    await this.updatePanel(panel, issueId);
  }

  dispose() {
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();
  }

  private async updatePanel(panel: vscode.WebviewPanel, issueId: string) {
    panel.webview.html = await this.renderHtml(panel.webview, { state: "loading", issueId });
    try {
      const issue = await this.issueService.fetchIssue(issueId);
      console.log("Fetched issue:", issueId, issue);
      if (!issue) {
        console.log("Issue is null, showing empty state");
        panel.webview.html = await this.renderHtml(panel.webview, { state: "empty", issueId });
        return;
      }

      // Extract related issues from dependencies and dependents
      const relatedIssues = extractRelatedIssuesFromIssue(issue);

      panel.title = `${issueId}: ${issue.title ?? ""}`.trim();
      console.log("Rendering ready state with issue");
      panel.webview.html = await this.renderHtml(panel.webview, {
        state: "ready",
        issueId,
        issue,
        relatedIssues,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Error fetching issue:", message);
      panel.webview.html = await this.renderHtml(panel.webview, { state: "error", issueId, error: message });
    }
  }

  private async renderHtml(
    webview: vscode.Webview,
    model:
      | { state: "loading"; issueId: string }
      | { state: "empty"; issueId: string }
      | { state: "error"; issueId: string; error: string }
      | { state: "ready"; issueId: string; issue: BdIssue; relatedIssues: BdIssue[] }
  ) {
    const nonce = getNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https:`,
      `style-src 'unsafe-inline' ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    const payload: Record<string, unknown> = {
      nonce,
      csp,
      viewState: model.state,
      issueId: model.issueId,
    };

    if (model.state === "error") {
      payload.errorMessage = model.error;
    }

    if (model.state === "ready") {
      console.log("model:", model);
      payload.detail = this.buildIssueViewModel(model.issueId, model.issue, model.relatedIssues);
    }

    console.log(
      "Rendering template with payload:",
      JSON.stringify({ viewState: payload.viewState, hasDetail: !!payload.detail })
    );
    return this.templates.render("issueDetail", payload);
  }

  private buildIssueViewModel(issueId: string, issue: BdIssue, relatedIssues: BdIssue[]) {
    const title = String(issue.title ?? "Untitled issue");
    const status = String(issue.status ?? "unknown");
    const priority = issue.priority !== undefined ? `P${issue.priority}` : "—";
    const issueType = String(issue.issue_type ?? issue.type ?? "—");
    const assignee = String(issue.assignee ?? "Unassigned");
    const descriptionHtml = formatDescription(issue);
    const rawJson = JSON.stringify(issue, null, 2);
    const isEpic = issue.issue_type === "epic" || issue.type === "epic";

    const relatedIssuesViewModel = relatedIssues.map((related) => ({
      id: String(related.id ?? ""),
      title: String(related.title ?? "Untitled"),
      status: String(related.status ?? "unknown"),
      type: String(related.issue_type ?? related.type ?? "—"),
    }));

    const meta = [
      { label: "Status", value: status },
      { label: "Priority", value: priority },
      { label: "Type", value: issueType },
      { label: "Assignee", value: assignee },
    ];

    return {
      id: issueId,
      title,
      meta,
      descriptionHtml,
      relatedIssues: relatedIssuesViewModel,
      rawJson,
      issue,
      isEpic,
    };
  }
}
