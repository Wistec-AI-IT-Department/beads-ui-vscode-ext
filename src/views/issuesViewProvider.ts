import * as vscode from "vscode";
import { BdIssue, SearchFilters } from "../types";
import { BeadsIssueService } from "../services/beadsIssueService";
import { TemplateRenderer } from "../utils/templateRenderer";
import { getNonce } from "../utils/helpers";

export class IssuesViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private issues: BdIssue[] = [];
  private filters: SearchFilters = {
    search: "",
    statuses: ["open", "in_progress", "blocked", "closed"],
    types: ["bug", "feature", "task", "epic", "chore"],
    sortField: "created_at" as const,
    sortDir: "desc" as const,
  };

  constructor(
    private readonly templates: TemplateRenderer,
    private readonly issueService: BeadsIssueService,
    private readonly openIssue: (issueId: string) => Promise<void>,
    private readonly extensionUri: vscode.Uri
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    this.getHtmlForWebview(webviewView.webview)
      .then((html) => {
        webviewView.webview.html = html;
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to load Beads view: ${message}`);
      });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message?.type) {
        case "ready":
          await this.refreshIssues();
          break;
        case "refresh":
          await this.refreshIssues();
          break;
        case "newIssue":
          await this.createAndOpenIssue();
          break;
        case "filtersChanged":
          this.updateFilters(message.payload);
          this.issueService.setFilters(this.filters);
          await this.refreshIssues();
          break;
        case "openIssue":
          if (typeof message.id === "string" && message.id.length) {
            await this.openIssue(message.id);
          }
          break;
        default:
          break;
      }
    });

    void this.refreshIssues();
  }

  async refreshIssues() {
    await this.loadIssues();
  }

  async toggleSort() {
    // this.issueService.sor
    console.log("Beads UI toggle sort");
    await this.loadIssues();
  }

  async createAndOpenIssue() {
    try {
      const created = await this.issueService.createIssue();
      await this.refreshIssues();
      await this.openIssue(String(created.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(message);
    }
  }

  private async loadIssues() {
    this.updateLoading(true);
    try {
      this.issues = await this.issueService.fetchIssues();
      this.postIssues();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(message);
      this.postError(message);
    } finally {
      this.updateLoading(false);
    }
  }

  private postIssues() {
    if (!this.view) {
      return;
    }
    this.view.webview.postMessage({ type: "issues", payload: this.issues });
  }

  private postError(message: string) {
    if (!this.view) {
      return;
    }
    this.view.webview.postMessage({ type: "error", payload: message });
  }

  private updateLoading(isLoading: boolean) {
    if (!this.view) {
      return;
    }
    this.view.webview.postMessage({ type: "loading", payload: isLoading });
  }

  private updateFilters(payload: Partial<typeof this.filters>) {
    if (!payload) {
      return;
    }
    this.filters = {
      ...this.filters,
      ...payload,
      statuses:
        Array.isArray(payload.statuses) && payload.statuses.length
          ? payload.statuses
          : this.filters.statuses,
      types:
        Array.isArray(payload.types) && payload.types.length
          ? payload.types
          : this.filters.types,
      sortField: (payload as any).sortField ?? this.filters.sortField,
      sortDir: (payload as any).sortDir ?? this.filters.sortDir,
      search:
        typeof payload.search === "string"
          ? payload.search
          : this.filters.search,
    } as typeof this.filters;
  }

  private async getHtmlForWebview(webview: vscode.Webview) {
    const nonce = getNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https:`,
      `style-src 'unsafe-inline' ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    const vscodeElementsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        "node_modules",
        "@vscode-elements",
        "elements",
        "dist",
        "bundled.js"
      )
    );

    return this.templates.render("issuesView", {
      nonce,
      csp,
      vscodeElementsUri: vscodeElementsUri.toString(),
    });
  }
}
