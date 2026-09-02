# Lab 2 — AI Use and Reflection

**LLM/agent used:** Claude (Claude Code CLI), Sonnet 5

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Approved with follow-ups on PR #36 (Issue 8) — branch and publish Issue 9, move it to Started, then address the follow-ups and wait for my order. | Because issue-8 was approved but still had some problems worth fixing, I made the agent successfully fix them before actually proceeding with the next issue. |
| 2 | Implement Issue 9 (Playwright E2E suite, Alpine/Chromium Docker setup, Responsive & Visual Checklist) per plan, then wait for my order. | The agent achieved a better result than prompting "Complete issue 9". The agent was also told NOT to proceed anything after finishing the current issue to prevent accidental commits and pushes. |
| 3 | Run all listed tests; if they passed, run deeper tests like the last issue, and don't overclaim unless it's truly verified. | Each issue contained a list of tests which needed to be verified. However, I wasn't satisfied with the number of tests run, so I tasked the agent to come up with deeper, more specific tests to ensure as minimum rare-case failures as possible. |
| 4 | Are you certain that there'd be no surprising or hidden failures? | In previous issues, the agent encountered a number of failures along the way during PR-review. To prevent similar mistakes in the future, I forced the agent to review everything again thoroughly, which worked far better than I anticipated since it was able to catch hidden bugs before committing & pushing. |
| 5 | Read a peer review's message.txt again and confirm whether its claims hold true. Do not fix anything yet. | Before I started fixing the problems found by my peer, I let the agent run tests by itself to confirm the validity of the claims first. This prevented unnecessary fixes. |
| 6 | Branch the next issue (10) off lab2-staging and publish it, then wait for my order. | It read the instruction in specification.md, and realized that there was a major conflict in the instruction's wording (it said Issue 10 will be a release checkpoint with no feature branch, but I accidentally tasked it to branch it off lab2-staging). The agent caught the inconsistency quickly and notified me before proceeding any further. |
| 7 | Run the full regression suite on lab2-staging and verify it's all green. Then, do the manual smoke test. | Full regression came back clean. During the manual smoke test it hit a stale "localStorage" value from what was likely another browser tab, and rather than forcing the same shaky repro, switched to a direct API-level check to prove the same isolation behavior unambiguously. |

## My Reflection
The most important thing I realized after completing 9 issues so far is that, you can never fully trust the agent's reassurance. Many times, was I assured by the agent that all test cases have been verified and the progress was ready to be committed and pushed. However, my peer still found a handful amount of bugs and hidden failures which needed to be addressed.

Not to mention, reminding the agent explicitly to wait for my order was very crucial. There were a few occasions where the agent almost committed and pushed the progress without my confirmation. By explicitly reminding it at every issue, the risk of wrongful commit can be greatly reduced.