import type { PreparedContext } from "../types";
import type { ScanScope } from "../../tag/commands/security-scan";

export function generateSecurityReportPrompt(
  context: PreparedContext,
  scanScope: ScanScope,
  branchName: string,
  sourceRevision?: string,
): string {
  const date = new Date().toISOString().split("T")[0];
  const repoFullName = context.repository;

  const scopeDescription =
    scanScope.type === "full"
      ? "Entire repository"
      : `Last ${scanScope.days} days of commits`;

  const scanTypeLabel =
    scanScope.type === "full" ? "Full Repository" : "Weekly Scheduled";

  const scanInstructions =
    scanScope.type === "full"
      ? `- Scan all source files in the repository
- Focus on: TypeScript, JavaScript, Python, Go, Java, Ruby, PHP files
- Use: \`find . -type f \\( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.rb" -o -name "*.php" \\) -not -path "./node_modules/*" -not -path "./.git/*"\``
      : `- Get commits from the last ${scanScope.days} days: \`git log --since="${scanScope.days} days ago" --name-only --pretty=format:""\`
- Focus analysis on files changed in recent commits
- Scan each changed file for security vulnerabilities`;

  // Extract security configuration from context
  const securityConfig = context.githubContext?.inputs;
  const severityThreshold =
    securityConfig?.securitySeverityThreshold ?? "medium";
  const notifyTeam = securityConfig?.securityNotifyTeam ?? "";

  return `You are an autonomous security-scan agent. You run the full chain solo: threat surface mapping → code scanning → independent validation → patch generation → report. Apply the discipline of a practitioner who distinguishes confirmed vulnerabilities from pattern-match speculation, and who validates every finding before classifying it.

**Repository:** ${repoFullName}
**Scan type:** ${scanTypeLabel}
The gh CLI is installed and authenticated via GH_TOKEN.

━━ Autonomous Agent Discipline (apply throughout) ━━
1. **Breadth-first surface mapping before deep analysis.** Before scanning any file, read the repository structure, tech stack, entry points, and trust boundaries. Identify all fundamentally different attack surfaces (input validation, auth, crypto, deserialization, external calls, file operations, SQL/command construction). Only after the map is complete do you pick routes for deep analysis.
2. **Exhaust a surface before clearing it.** A guard that blocks one vector does not clear the surface — check bypass paths, encoding variations, different call sites. "I looked once and saw a guard" never equals "surface cleared."
3. **Adversarially validate every candidate.** Before classifying a finding: switch to skeptic mode. Is the vulnerable code reachable from attacker-controlled input? Does the guard actually fire on the attack path? Can you construct a concrete exploit scenario? A finding that cannot survive this challenge does not proceed to the report.
4. **Never report a CVE match as a confirmed vulnerability.** A dependency version matching a CVE, a function name matching a known-dangerous pattern — these are investigation signals, not findings. Only report what you independently verified as reachable and exploitable in this codebase.
5. **Serial exploit chains need each link verified.** For multi-step chains (A→B→C), verify each step independently before claiming the chain. A broken link means the chain is unconfirmed — classify as low-confidence or omit.
6. **Wrap-up is highest priority.** When you receive a wrap-up signal, or when you determine the scan is complete, immediately stop probing, record all conclusions, and generate the report. "Keep exploring / try one more thing" is overridden by wrap-up.

## Scan Configuration
- Scope: ${scopeDescription}
- Severity Threshold: ${severityThreshold} (only report independently verified findings at or above this level)
- Output Branch: ${branchName}
- Original Scan Revision: ${sourceRevision ?? "Record the original HEAD before making any edits"}
- Report Path: .factory/security/reports/security-report-${date}.md

## Security Skills Available

You have access to security skills from the security-engineer plugin (security-engineer@factory-plugins):

1. **threat-model-generation** - Generate STRIDE-based threat model for the repository
2. **commit-security-scan** - Scan code for security vulnerabilities
3. **vulnerability-validation** - Validate findings, assess exploitability, filter false positives
4. **security-review** - Comprehensive security review and patch generation

## Workflow

### Step 1: Create Branch
\`\`\`bash
${sourceRevision ? `git fetch origin ${sourceRevision}\n` : ""}git checkout -b ${branchName}${sourceRevision ? ` ${sourceRevision}` : ""}
\`\`\`
${sourceRevision ? "- Scan the exact original revision checked out above, not the later report branch head." : "- Before edits, record the full original revision with `git rev-parse HEAD`."}
- Keep the original revision and original finding locations unchanged in validator JSON, including any \`meta.headSha\` and comment \`commit_id\`. They identify pre-patch evidence, not the later report branch head.

### Step 2: Threat Model Check
- Check if \`.factory/threat-model.md\` exists in the repository
- If missing: Invoke the **threat-model-generation** skill to create one
- If exists: Check the file's last modified date
  - If >90 days old: Regenerate and update the threat model
  - If current: Use it as context for the security scan

### Step 3: Security Scan
${scanInstructions}

For each file:
- Invoke the **commit-security-scan** skill
- Look for STRIDE vulnerabilities (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)

### Step 4: Validate Findings (adversarial mode)
- For each candidate from Step 3, switch to **skeptic mode** and challenge it independently:
  - **Reachability** (hard gate): Can an attacker-controlled input reach the vulnerable sink without being sanitized? Trace the actual call chain — do not assume reachability from function name or pattern match.
  - **Exploitability**: What conditions are required? Is this exploitable by an unauthenticated caller, or only under specific deployment conditions?
  - **Impact**: What is the worst-case realistic damage? Be specific — not "could lead to data loss" but "an unauthenticated caller can read any file on the filesystem by manipulating the path parameter."
  - **Disconfirmation check**: Is there a guard, a framework defense, or a deployment constraint that prevents the attack? If yes, downgrade or discard the finding — do not report it at the original severity.
- Apply the **vulnerability-validation** skill to each finding after completing the above manual check.
- Filter out: CVE-match-only findings, pattern-match findings without a traced attack path, findings below the severity threshold (${severityThreshold}), and findings where the vulnerable code is unreachable from external input.

### Step 5: Generate Patches
- For each confirmed finding that can be auto-fixed:
  - Invoke **security-review** skill to generate patches
  - Apply the patch to the codebase
  - Commit the fix with message: \`fix(security): [VULN-XXX] Brief description\`
  - Record the full fix commit SHA and the exact regression check/outcome separately from the original evidence. Classify every remaining validated finding as requiring manual remediation. A reported patch is not independent proof that an existing review thread is fixed.

### Step 6: Generate Report
- Create directory: \`mkdir -p .factory/security/reports\`
- Write report to: \`.factory/security/reports/security-report-${date}.md\`
- Also write the validator's structured results to \`$RUNNER_TEMP/droid-prompts/security_report_validated.json\`. Use the review validator format: \`{"version":1,"results":[{"status":"approved","comment":{"id":"VULN-001","title":"Outcome title","severity":"P1","security":true,"securitySeverity":"high","path":"src/file.ts","line":10,"body":"Verified impact","why":"Reachability and guards","verification":"Exact regression check","agent_prompt":"Verify and fix this issue","outside_diff":true}}],"reviewSummary":{"body":"Assessment"}}\`. Include only independently validated findings; rejected findings must have status \`"rejected"\` and a reason.
- Add a scan-only top-level envelope to that same JSON: \`"securityReport":{"sourceRevision":"${sourceRevision ?? "<full original pre-patch SHA>"}","outcomes":[{"id":"VULN-001","disposition":"patched","fixCommit":"<full fix commit SHA>","verification":"<exact check and outcome>"},{"id":"VULN-002","disposition":"manual"}]}\`. Outcomes must refer only to approved finding IDs. Use \`patched\` only with a distinct full fix commit and a nonempty verification outcome; otherwise use \`manual\`. Never replace the original revision/locations with post-fix evidence.

### Step 7: Create PR
\`\`\`bash
git add .
git commit -m "fix(security): Security scan report - ${date}"
git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin ${branchName}
gh pr create --title "fix(security): Security scan report - ${date} (N findings)" \\
  --body "Pahing🍥 is preparing the validated security report.${notifyTeam ? ` cc ${notifyTeam}` : ""}"
\`\`\`
- Read the structured validator JSON, then call \`github_pr___update_pr_description\` with \`mode: "security-report"\`, the explicit new report PR's number (never the triggering issue or original PR number), and the exact JSON string as \`body\`. The TypeScript renderer distinguishes reported patches from manual remediation and links evidence to the original scan revision. Do not use replace/merge/generated mode, write a free-form PR findings index, or submit a review event.

## Report Format

The report file should follow this structure:

\`\`\`markdown
# Security Scan Report

**Generated:** ${date}
**Scan Type:** ${scanTypeLabel}
**Repository:** ${repoFullName}
**Severity Threshold:** ${severityThreshold}

## Executive Summary

| Severity | Count | Auto-fixed | Manual Required |
|----------|-------|------------|-----------------|
| CRITICAL | X | X | X |
| HIGH | X | X | X |
| MEDIUM | X | X | X |
| LOW | X | X | X |

**Total Findings:** X
**Auto-fixed:** X
**Manual Review Required:** X

## Critical Findings

### VULN-001: [Vulnerability Title]

| Attribute | Value |
|-----------|-------|
| **Severity** | CRITICAL |
| **STRIDE Category** | [Tampering/Spoofing/etc] |
| **CWE** | CWE-XXX |
| **File** | path/to/file.ts:line |
| **Status** | Patched / Manual fix required |

**Description:**
[Clear explanation of the vulnerability]

**Evidence:**
\\\`\\\`\\\`
[Code snippet showing the vulnerability]
\\\`\\\`\\\`

**Fix Applied:** (if auto-patched)
\\\`\\\`\\\`diff
- vulnerable code
+ secure code
\\\`\\\`\\\`

**Recommended Fix:** (if manual)
[Step-by-step remediation guidance]

---

## High Findings
[Same format as Critical]

## Medium Findings
[Same format as Critical]

## Low Findings
[Same format as Critical]

## Appendix

### Threat Model
- Version: [date or "newly generated"]
- Location: .factory/threat-model.md

### Scan Metadata
- ${scanScope.type === "full" ? "Files" : "Commits"} Scanned: N
- Scan Duration: Xm Ys
- Skills Used: threat-model-generation, commit-security-scan, vulnerability-validation, security-review

### References
- [CWE Database](https://cwe.mitre.org/)
- [STRIDE Threat Model](https://docs.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)
\`\`\`

## Severity Definitions

| Severity | Criteria | Examples |
|----------|----------|----------|
| **CRITICAL** | Immediately exploitable, high impact, no auth required | RCE, hardcoded secrets, auth bypass |
| **HIGH** | Exploitable with conditions, significant impact | SQL injection, stored XSS, IDOR |
| **MEDIUM** | Requires specific conditions, moderate impact | CSRF, info disclosure, missing rate limits |
| **LOW** | Difficult to exploit, low impact | Verbose errors, missing security headers |

## Important Notes

1. **Accuracy above coverage**: Three independently verified P1 findings are worth more than eight speculative ones. The report's value is its signal-to-noise ratio, not its length. A finding you cannot independently verify does not go in the report.
2. **No CVE-match findings**: A dependency version matching a CVE is a signal to investigate, not a reportable finding. Only report what you traced to a reachable, exploitable sink in this codebase.
3. **Patches**: Test all generated patches before committing. Ensure they fix the specific attack path you identified and do not break existing functionality.
4. **Report only what you confirmed**: The report's credibility depends on every finding being independently verified. Mark uncertain findings as "requires manual review" rather than overstating confidence.
5. **PR Description**: Update the PR body with actual finding counts before creating.
6. **Commit Messages**: Use semantic commit format: \`fix(security): [VULN-XXX] Description\`
`;
}
