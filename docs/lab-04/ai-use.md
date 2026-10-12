# Lab 4 — AI Use and Reflection

**LLM/agent used:** Claude Code (Anthropic's coding agent in the terminal), running **Claude Opus 5.5** for the whole sprint. The same agent was used in both roles:
- **Specification agent** (Issue 1): drafted `specification.md`, `api-spec.md`, `ui-spec.md`, and `tests.md`, and revised them after peer review. Later issues wrote their own changes back into those documents.
- **Coding agent** (Issues 2–8 and the pre-release check): wrote each issue's tests first, then the implementation, and opened each PR. The agent also checked my partner's PRs, but only reported back; I posted every review and comment myself.

## Selected key prompts (8)
Quoted word for word as I typed them.

| # | Prompt | What I did with the result |
|---|--------|----------------------------|
| 1 | "Create the plan and issue md files for Lab 4" | Got the working plan and the 9-issue backlog for the sprint, in the same shape as Lab 3's. I read and approved them before anything was created on GitHub. |
| 2 | "Create lab4-staging, the Lab04 project, and the issues" | Had the agent create the staging branch, the project board, and the nine GitHub issues from the approved backlog. |
| 3 | "Create the branch for Issue 1 and start the cycle" | Started the per-issue loop set up in Lab 3 with one short prompt: board moves, a read-back of the issue, tests first, a PR in the earlier format, then a stop for my decision. Every later issue started the same way. |
| 4 | "Note that from now on, once you pushed to the feature branch, you may move the corresponding card to PR review right away without having to ask me. And if it requires fixing, just move it to fixing, and when pushed again, move it back to PR review like usual. For this issue, it's been merged by Menelaus. Just move it straight to Done this time. Now before proceeding, reflect on everything quickly" | Gave the agent a standing permission for the board moves that I had been confirming one by one, and asked for a short review of the sprint so far before the first coding issue. |
| 5 | "Continue the cycle for Issue 3, for Docker, if it's not open, just open it" | Let the agent start Docker Desktop itself when it was closed. Later it also restarted Docker when it had stopped in the middle of a run, and re-ran a mutation pass whose results could not be trusted because of that. |
| 6 | "Start issue 4 rightaway, but address and fix the issue that's requested from a follow-up PR inside issue 4 as well, and remark it in the PR desc" | Started the rule used for the rest of the sprint: my partner's non-blocking review comments are fixed inside the next issue's PR, under their own heading, with no separate follow-up PR. |
| 7 | "we don't need a reply .txt for this one? I do want it" | Corrected the agent when it pushed a fix without drafting the reply I post to my partner. It wrote the reply and checked each number in it against the final test runs. |
| 8 | "Start issue 9, fold the follow-ups in first" | Had the last review's comments fixed in one pre-release PR into `lab4-staging`, so that the release itself is exactly one PR into `main` with nothing after it. |

## My Reflection
In this lab, everything went far more smoothly than Lab 3 because I used the same Claude conversation from the previous lab to continue on Lab 4. Thus, the agent understood the task quickly without me having to re-explain everything again. I also let the agent start Docker Desktop itself when it was closed, and restart it when it had stopped in the middle of a run. This saved me a lot of time and effort.

I still have to monitor the agent closely for security and performance as there are occasionally minor bugs or mistakes that the agent unintentionally creates, but overall it was a very positive experience. I believe that with more practice in future labs, I will be able to use and direct an AI agent to achieve better results with more efficiency and less tokens consumed.

For the specification-agent, I think it's highly necessary to give it a clear instruction of what you expect and what you don't expect from it. Not to mention, a feedback from a peer is also important to make the specification more solid and secure as the agent alone might miss some edge cases.