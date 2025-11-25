import * as vscode from "vscode";
import { BdIssue } from "../types";
import { BeadsIssueService } from "../services/beadsIssueService";
import { TemplateRenderer } from "../utils/templateRenderer";
import { getNonce } from "../utils/helpers";

export class IssuesViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private issues: BdIssue[] = [];

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
          this.postIssues();
          break;
        case "refresh":
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

    this.postIssues();
    void this.refreshIssues();
  }

  async refreshIssues() {
    await this.loadIssues();
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
