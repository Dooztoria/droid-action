import { describe, expect, it } from "bun:test";
import { parseDroidCommand, extractCommandFromContext } from "./command-parser";
import type { GitHubContext, ParsedGitHubContext } from "../context";
import type {
  IssueCommentEvent,
  IssuesEvent,
  PullRequestEvent,
  PullRequestReviewCommentEvent,
  PullRequestReviewEvent,
} from "@octokit/webhooks-types";

const baseContext: Omit<ParsedGitHubContext, "eventName" | "payload"> = {
  runId: "run-1",
  eventAction: undefined,
  repository: {
    owner: "test-owner",
    repo: "test-repo",
    full_name: "test-owner/test-repo",
  },
  actor: "test-user",
  inputs: {
    triggerPhrase: "@pahing",
    assigneeTrigger: "",
    labelTrigger: "droid",
    useStickyComment: false,
    allowedBots: "",
    allowedNonWriteUsers: "",
    trackProgress: false,
    automaticReview: false,
    automaticSecurityReview: false,
    securityModel: "",
    securitySeverityThreshold: "medium",
    securityBlockOnCritical: true,
    securityBlockOnHigh: false,
    securityNotifyTeam: "",
    securityScanSchedule: false,
    securityScanDays: 7,
  },
  entityNumber: 1,
  isPR: true,
};

function createContext<TPayload>(
  eventName: ParsedGitHubContext["eventName"],
  payload: TPayload,
  overrides: Partial<Omit<ParsedGitHubContext, "eventName" | "payload">> = {},
): GitHubContext {
  return {
    ...baseContext,
    ...overrides,
    eventName,
    payload,
  } as GitHubContext;
}

describe("Command Parser", () => {
  describe("parseDroidCommand", () => {
    it("should detect @pahing fill", () => {
      const result = parseDroidCommand("Please @pahing fill the description");
      expect(result?.command).toBe("fill");
      expect(result?.raw).toBe("@pahing fill");
    });

    it("should detect @pahing fill with extra spaces", () => {
      const result = parseDroidCommand("@pahing    fill");
      expect(result?.command).toBe("fill");
      expect(result?.raw).toBe("@pahing    fill");
    });

    it("should be case insensitive for @pahing fill", () => {
      const result = parseDroidCommand("@pahing FILL the PR description");
      expect(result?.command).toBe("fill");
      expect(result?.raw).toBe("@pahing FILL");
    });

    it("should detect @pahing review", () => {
      const result = parseDroidCommand("Can you @pahing review this PR?");
      expect(result?.command).toBe("review");
      expect(result?.raw).toBe("@pahing review");
    });

    it("should parse @pahing review security as security", () => {
      const result = parseDroidCommand("@pahing review security");
      expect(result?.command).toBe("security");
      expect(result?.raw).toBe("@pahing review security");
    });

    it("should parse @pahing security review as security", () => {
      const result = parseDroidCommand("@pahing security review");
      expect(result?.command).toBe("security");
      expect(result?.raw).toBe("@pahing security");
    });

    it("should detect @pahing security", () => {
      const result = parseDroidCommand("Please @pahing security this PR");
      expect(result?.command).toBe("security");
      expect(result?.raw).toBe("@pahing security");
    });

    it("should detect @pahing security at end of text", () => {
      const result = parseDroidCommand("Please run @pahing security");
      expect(result?.command).toBe("security");
      expect(result?.raw).toBe("@pahing security");
    });

    it("should be case insensitive for @pahing security", () => {
      const result = parseDroidCommand("@pahing SECURITY");
      expect(result?.command).toBe("security");
    });

    it("should detect @pahing security --full", () => {
      const result = parseDroidCommand("@pahing security --full");
      expect(result?.command).toBe("security-full");
      expect(result?.raw).toBe("@pahing security --full");
    });

    it("should be case insensitive for @pahing security --full", () => {
      const result = parseDroidCommand("@pahing SECURITY --FULL");
      expect(result?.command).toBe("security-full");
    });

    it("should prioritize security-full over security", () => {
      const result = parseDroidCommand("@pahing security --full this repo");
      expect(result?.command).toBe("security-full");
    });

    it("should prioritize specific commands over default", () => {
      // If text has both @pahing fill and just @pahing, should detect fill
      const result = parseDroidCommand("@pahing please @pahing fill this");
      expect(result?.command).toBe("fill");
    });

    it("should detect unknown text as an unknown command", () => {
      const result = parseDroidCommand("@pahing please implement this feature");
      expect(result?.command).toBe("unknown");
      expect(result?.raw).toBe("@pahing");
    });

    it("should handle multiline text", () => {
      const text = [
        "## Description",
        "This is a PR description",
        "",
        "@pahing fill",
        "",
        "Some other content",
      ].join("\n");
      const result = parseDroidCommand(text);
      expect(result?.command).toBe("fill");
    });

    for (const spaces of [4, 8]) {
      it(`does not execute a command in ${spaces}-space indented Markdown code`, () => {
        const text = [
          "## Description",
          "",
          `${" ".repeat(spaces)}@pahing fill`,
          "",
          "Some other content",
        ].join("\n");
        expect(parseDroidCommand(text)).toBeNull();
      });
    }

    it("should return null for text without @pahing", () => {
      const result = parseDroidCommand("Please review this PR");
      expect(result).toBeNull();
    });

    it("should return null for empty text", () => {
      expect(parseDroidCommand("")).toBeNull();
      expect(parseDroidCommand(null as any)).toBeNull();
      expect(parseDroidCommand(undefined as any)).toBeNull();
    });

    it("should not match partial words containing droid", () => {
      const result = parseDroidCommand("android development");
      expect(result).toBeNull();
    });

    it("should match @pahing at the beginning of text", () => {
      const result = parseDroidCommand("@pahing fill");
      expect(result?.command).toBe("fill");
    });

    it("should match @pahing at the end of text", () => {
      const result = parseDroidCommand("Please run @pahing fill");
      expect(result?.command).toBe("fill");
    });
  });

  describe("extractCommandFromContext", () => {
    it("should extract from PR body", () => {
      const context = createContext("pull_request", {
        action: "opened",
        pull_request: {
          body: "PR description\n\n@pahing fill",
          number: 1,
          title: "PR",
        },
      } as unknown as PullRequestEvent);
      const result = extractCommandFromContext(context);
      expect(result?.command).toBe("fill");
      expect(result?.location).toBe("body");
    });

    it("should extract from issue body", () => {
      const context = createContext(
        "issues",
        {
          action: "opened",
          issue: {
            body: "Issue description @pahing review",
            title: "Issue",
            number: 1,
          },
        } as unknown as IssuesEvent,
        { isPR: false },
      );
      const result = extractCommandFromContext(context);
      expect(result?.command).toBe("review");
      expect(result?.location).toBe("body");
    });

    it("should extract from issue comment", () => {
      const context = createContext("issue_comment", {
        action: "created",
        comment: {
          body: "@pahing fill please",
          created_at: "2024-01-01T00:00:00Z",
        },
        issue: {
          number: 1,
          pull_request: { url: "" },
        },
      } as unknown as IssueCommentEvent);
      const result = extractCommandFromContext(context);
      expect(result?.command).toBe("fill");
      expect(result?.location).toBe("comment");
      expect(result?.timestamp).toBe("2024-01-01T00:00:00Z");
    });

    it("should extract from PR review comment", () => {
      const context = createContext("pull_request_review_comment", {
        action: "created",
        comment: {
          body: "Can you @pahing review this section?",
          created_at: "2024-01-01T00:00:00Z",
        },
        pull_request: {
          number: 1,
        },
      } as unknown as PullRequestReviewCommentEvent);
      const result = extractCommandFromContext(context);
      expect(result?.command).toBe("review");
      expect(result?.location).toBe("comment");
      expect(result?.timestamp).toBe("2024-01-01T00:00:00Z");
    });

    it("should extract from PR review body", () => {
      const context = createContext("pull_request_review", {
        action: "submitted",
        review: {
          body: "LGTM but @pahing fill the description",
          submitted_at: "2024-01-01T00:00:00Z",
        },
        pull_request: {
          number: 1,
        },
      } as unknown as PullRequestReviewEvent);
      const result = extractCommandFromContext(context);
      expect(result?.command).toBe("fill");
      expect(result?.location).toBe("comment");
      expect(result?.timestamp).toBe("2024-01-01T00:00:00Z");
    });

    it("should extract security from PR body", () => {
      const context = createContext("pull_request", {
        action: "opened",
        pull_request: {
          body: "PR description\n\n@pahing security",
          number: 1,
          title: "PR",
        },
      } as unknown as PullRequestEvent);
      const result = extractCommandFromContext(context);
      expect(result?.command).toBe("security");
      expect(result?.location).toBe("body");
    });

    it("should extract security-full from issue comment", () => {
      const context = createContext("issue_comment", {
        action: "created",
        comment: {
          body: "@pahing security --full",
          created_at: "2024-01-01T00:00:00Z",
        },
        issue: {
          number: 1,
          pull_request: { url: "" },
        },
      } as unknown as IssueCommentEvent);
      const result = extractCommandFromContext(context);
      expect(result?.command).toBe("security-full");
      expect(result?.location).toBe("comment");
    });

    it("should return null for events without commands", () => {
      const context = createContext("pull_request", {
        action: "opened",
        pull_request: {
          body: "Regular PR description",
          number: 1,
          title: "PR",
        },
      } as unknown as PullRequestEvent);
      const result = extractCommandFromContext(context);
      expect(result).toBeNull();
    });

    it("should return null for unsupported event types", () => {
      const context = {
        ...baseContext,
        eventName: "push" as ParsedGitHubContext["eventName"],
        payload: {},
      } as unknown as GitHubContext;
      const result = extractCommandFromContext(context);
      expect(result).toBeNull();
    });

    it("should handle missing body gracefully", () => {
      const context = createContext("pull_request", {
        action: "opened",
        pull_request: {
          body: null,
          number: 1,
          title: "PR",
        },
      } as unknown as PullRequestEvent);
      const result = extractCommandFromContext(context);
      expect(result).toBeNull();
    });

    it("should handle missing payload gracefully", () => {
      const context = {
        ...baseContext,
        eventName: "pull_request",
        payload: null,
      } as unknown as GitHubContext;
      const result = extractCommandFromContext(context);
      expect(result).toBeNull();
    });

    it("should extract unknown command when no specific command", () => {
      const context = createContext("issue_comment", {
        action: "created",
        comment: {
          body: "@pahing can you help with this?",
          created_at: "2024-01-01T00:00:00Z",
        },
        issue: {
          number: 1,
          pull_request: { url: "" },
        },
      } as unknown as IssueCommentEvent);
      const result = extractCommandFromContext(context);
      expect(result?.command).toBe("unknown");
      expect(result?.location).toBe("comment");
    });
  });
});
