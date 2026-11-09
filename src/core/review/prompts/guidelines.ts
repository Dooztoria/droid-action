/**
 * Repository review guidelines, injected verbatim into the Pass 1 and
 * Pass 2 prompts.
 *
 * A repository can ship its own review guidelines as a
 * `review-guidelines` skill. Leaving it to the model to notice and
 * invoke that skill proved unreliable, so the pipeline reads the file
 * itself and places its text in the prompt. The model then has the
 * guidelines before it reads the diff, every run, with no tool call
 * in between.
 *
 * Guidelines function as *operational constraints* for the review agent —
 * they define what the repository's operators have declared as allowed,
 * denied, or required. They are injected before the diff so the agent's
 * surface-mapping phase (Pass 1) already operates within those bounds,
 * and the validation phase (Pass 2) can cite them as acceptance criteria.
 * They never override the pipeline's mechanics (schema, posting rules,
 * tool restrictions) — only the content judgment within those mechanics.
 */

import type { RepoReviewGuidelines } from "./types";
import type { ReviewPass } from "../../../utils/review-session-tag";

/** Repository-relative location of the review guidelines skill. */
export const REVIEW_GUIDELINES_SKILL_PATH =
  ".factory/skills/review-guidelines/SKILL.md";

/**
 * Guidelines larger than this are not inlined; the prompt points at the
 * on-disk copy instead so one oversized file cannot crowd out the rest
 * of the prompt.
 */
export const INLINE_GUIDELINES_MAX_BYTES = 32 * 1024;

/**
 * Drop the skill's YAML frontmatter (`name`, `description`, ...), which
 * exists for skill discovery and is noise once the text is in a prompt.
 */
export function stripSkillFrontmatter(markdown: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown);
  return (match ? markdown.slice(match[0].length) : markdown).trim();
}

function guidelinesText(
  guidelines: RepoReviewGuidelines,
  pass: ReviewPass,
): string {
  if (
    Buffer.byteLength(guidelines.body, "utf8") <= INLINE_GUIDELINES_MAX_BYTES
  ) {
    const subagentNote =
      pass === "candidates"
        ? " If you spawn subagents to review the change, copy the `<review-guidelines>` block below verbatim into each subagent's prompt."
        : "";
    return `The full text is reproduced below, so do not invoke the \`review-guidelines\` skill to load it again.${subagentNote}

<review-guidelines source="${guidelines.source}">
${guidelines.body}
</review-guidelines>`;
  }
  const subagentNote =
    pass === "candidates"
      ? " If you spawn subagents to review the change, instruct each one to read that file in full before reviewing."
      : "";
  return `The full text is too long to repeat here; it is stored at \`${guidelines.path}\`. Read that file in full before you start, and do not invoke the \`review-guidelines\` skill to load it again.${subagentNote}`;
}

/**
 * Prompt section carrying the repository's review guidelines. Returns
 * undefined when the repository has none, so callers can splice it in
 * conditionally.
 */
export function buildRepoGuidelinesSection(
  guidelines: RepoReviewGuidelines | undefined,
  pass: ReviewPass,
): string | undefined {
  if (!guidelines) {
    return undefined;
  }
  const application =
    pass === "candidates"
      ? "These are **operational constraints** for your surface-mapping and investigation. Apply them before flagging anything: they define what the repository's operators have declared as in-scope, out-of-scope, required, or forbidden. Use them to bound your investigation — not to lower the evidence bar, and not to generate findings the guidelines don't support."
      : "These are **acceptance criteria** for your validation pass. Apply them when judging each candidate: whether the finding is in-scope under these guidelines, whether its severity matches the guidelines' escalation rules, and whether its wording meets the guidelines' standards. A candidate that conflicts with the guidelines must be rejected with an explicit citation.";
  return `## Repository review guidelines

This repository defines its own review guidelines in \`${guidelines.source}\`. ${application}

These guidelines do not override this run's mechanics: the output schema, tool restrictions, and posting rules in this prompt apply exactly as written. Guidelines govern content judgment within those mechanics.

${guidelinesText(guidelines, pass)}`;
}
