---
layout: post.njk
title: "Typing Got Cheap. Judgement Didn't."
description: "Four coding agents in parallel sounds like a story about throughput. It isn't — it's a story about review becoming the scarce resource. The terminal loop I run instead of a chat sidebar: a git worktree per agent, prompts written in Neovim, rules enforced by machines, and every surviving diff read hunk by hunk."
date: 2026-07-31
tags: [tooling, terminal, agents, review, ownership]
poster: /assets/content/machine-city.webp
ogImage: /assets/content/machine-city.jpg
---

> **TL;DR** — Typing is cheap now, judgement isn't, and the chat-sidebar shape optimises the wrong one: one working tree, one agent, review reduced to scrolling until you hit **Accept All**. My loop instead: **[workmux](https://github.com/raine/workmux)** gives each agent its own worktree and tmux window, the prompt is written in Neovim with real path completion (**[prompt.nvim](https://github.com/monkeymonk/prompt.nvim)**, mine), tests and rule-carrying reviewer agents catch everything mechanical, and whatever survives I read hunk by hunk in **[tuicr](https://github.com/agavra/tuicr)**, where my objections export straight back as the next prompt. **A rule is judgement that scales; a review comment is judgement that evaporates.** Machines check the work before I read it, never instead of me.

Four coding agents in parallel sounds like a story about throughput. It isn't. Once an agent does the typing, the hard parts move outward: deciding what to delegate, constraining what comes back, and reviewing the result. This is the terminal setup I built around those jobs.

All three are judgement, which is the thing that didn't get cheaper. And judgement is what ownership is made of: not running every check yourself, but deciding **which checks exist, encoding the judgement that repeats into them, and staying the one who says yes.**

## The loop

Here it is end to end, one task from start to merge.

1. **`workmux add fix/webhook-retry -p "…"`** — creates the branch, the worktree, a tmux window, and starts an agent in it holding my prompt. Isolated by construction: nothing it does can touch the other three.
2. **The prompt gets written in Neovim**, with exact paths pinned rather than described.
3. **The agent builds.** I go do something else — usually read another agent's diff.
4. **Machine checks run:** types, tests, linters, plus reviewer agents carrying that project's rules. Whatever they reject gets fixed before I look.
5. **`tuicr -w`** — I read what survived, hunk by hunk, and comment on the lines that are wrong.
6. **Export the comments; they become the next prompt.** Repeat 3–6 until I have no objections left.
7. **`workmux merge --rebase`** — merge, then the window, worktree and branch disappear.

Four of those steps exist to protect step 5, because step 5 is the one that doesn't scale. The rest of this post is why.

## The bottleneck moved, and the tools moved the other way

For twenty years the editor sat at the centre of everything because typing was the constraint. Completion, snippets, refactors, LSP — all aimed at the middle of the pipeline, and fairly so. That's where the hours went.

Then the machine took the typing, the middle collapsed to roughly zero, and the industry's response was to put a chat box where the file tree used to be. Congratulations: the fastest typist in the building got faster.

The work that inflated instead wraps around the typing, and all of it is judgement:

- **Dispatch** — what to delegate at all, said precisely, against the right files, somewhere the agent can't trip over anything else.
- **Constraint** — what must stay true, and what evidence the change owes you.
- **Review** — reading a change you didn't type, closely enough to argue with it.

The sidebar is bad at all three. One working tree means every agent shares one mutable workspace, so parallel work is several windows onto the same files and a prayer. It asks for the most consequential paragraph of your day in an input box that would embarrass a 2009 comment form. And it renders review as infinite scroll with a button at the end, holding no opinion about what should happen first — which tests must pass, which assumption deserves a second look, which files nobody touches unattended. **Accept All isn't a bad review interface. It's the absence of a review system, wearing a button costume.**

| The job | The default answer | What I run |
| --- | --- | --- |
| Four tasks at once | one repo, one tree, one agent | a worktree + tmux window per agent — **workmux** |
| Writing the prompt | a shoebox with a send button | a Neovim buffer with `@` `/` `!` — **prompt.nvim** |
| Keeping the rules true | the model's good intentions | tests, checks and rule-carrying reviewers |
| Reading the result | scroll, then press Accept | hunk-level review that exports — **tuicr** |

## Isolation, so parallel means parallel

Several agents in one repo share a working tree, and two agents editing overlapping files isn't parallelism — it's a merge conflict with ambitions. `git worktree` fixed this in 2015; the friction was never the worktree but the ceremony around it. **workmux** removes the ceremony, pairing each worktree with a tmux window and an agent, and cleaning all three up on merge.

![`workmux list` in a sample repo — three branches, each with its own worktree on disk and its own unmerged work, listed next to the branch they belong to.](/assets/content/screenshots/workmux-list.webp)

Agents report **working**, **waiting** or **done** through hooks, so a stalled one puts its hand up instead of being discovered forty minutes later. Underneath, tmux keeps long-running agents alive across a closed window, a dropped connection, a restarted editor — its job description since 2007.

The effect: a branch becomes a physical place. What runs in parallel goes back to being a decision about the work rather than about tooling friction.

## Precision, because vagueness is deferred judgement

`@app/Services/Billing/InvoiceTotals.php` and "the invoice totals service" are not the same prompt. One pins the context; the other sends the model off to guess, and it will occasionally land on a neighbouring file with a similar name.

**prompt.nvim** is mine: hit the external-editor key and the prompt lands in a Neovim buffer with completion behind the characters the tools already speak — `@` for paths, `/` for commands and skills, `!` for shell. No new dialect; the syntax is theirs, not mine.

Every file you don't name is a decision handed to the model. You'll meet it again in the diff.

## Review is the scarce resource

Ask a competent agent for a plan and it doesn't hand you three bullets. It returns a detailed, confident, entirely plausible plan, and then it builds all of it. Twelve files. Thirty. The transcript scrolls past faster than anyone can evaluate, and every "looks fine, continue" is a small withdrawal from an account you forgot you were spending.

**tuicr** is where that stops — a code review TUI with vim keybindings, in the terminal, next to the agent that wrote the code.

```sh
tuicr -w                    # the working tree, uncommitted included
tuicr pr 42                 # or a GitHub PR / GitLab MR
```

![tuicr reviewing an uncommitted change — the diff on the right, a comment anchored to line 15 saying the memoisation shouldn't be added and why, and the comment count building up in the sidebar.](/assets/content/screenshots/tuicr-review.webp)

`j`/`k` through the hunks, comment on the lines that are wrong, export. Here's an actual pass over that webhook branch — four comments, straight to the clipboard:

```text
app/Services/Billing/InvoiceTotals.php:64
  $invoice->lines()->sum('amount') inside the foreach — one query per line.
  InvoiceController@show already eager-loads `lines`. Read the loaded relation.

app/Services/Billing/InvoiceTotals.php:71
  Don't add the memoisation. Totals are recomputed on purpose — lines change
  mid-request and the invalidation rules get far harder to reason about than
  this loop costs. Keep the structure; extract the rounding into TaxCalculator.

app/Jobs/ProcessStripeEvent.php:29
  Idempotency key is a payload hash. Use the Stripe event id — payloads for the
  same event are not byte-stable.

tests/Feature/StripeWebhookTest.php
  Missing the case this branch exists for: same event delivered twice, the
  second delivery must not re-apply.
```

That block is the next prompt. Four file-and-line objections with reasons — what a colleague would get from a PR review, and what a model is best at consuming. The fix comes back scoped to the objections instead of as a fresh rewrite.

The same gap shows up in how you ask. *"Are there any bugs in this?"* gets the model's general opinion: a tidy list of maybe-issues, mostly about a codebase that isn't yours. It's the question you ask when you haven't read the diff, and it returns an answer you're in no position to judge. Ask instead whether line 64 can read the already-eager-loaded relation, and whether that `round()` respects the scale `TaxCalculator` assumes downstream, and you get one right answer. **The quality of what you can ask is capped by the review you've already done yourself.**

## Rules do the checking a human shouldn't have to repeat

Look at those four comments again: three of them needed no fresh judgement from me. One is detectable behaviour; two are rules this project already knows.

The N+1 is behaviour — a query-count assertion in the feature test catches it, or a reviewer told to inspect database access inside iteration. (Not "never query in a loop", which is a heuristic with real exceptions; the check is *how many queries did this actually run*.) The idempotency key is policy: provider event ids, never payload hashes. So is the missing test — a branch that exists to fix double-delivery ships the double-delivery test.

Only the memoisation comment needed a human, and notice why: it isn't a rule at all. It's a bet about which maintenance cost we're willing to carry in two years, made with knowledge that lives nowhere in the repository.

That ratio is the design problem. **The scarce resource was never checking — it's judgement.** So the gate is layered: deterministic checks first, then agent reviewers carrying explicit project rules, then me, reading whatever survived. Machines are good at checking work against rules somebody wrote down, and bad at deciding what the rules should be — which makes writing them down the leverage. **A rule is judgement that scales. A review comment is judgement that evaporates.** Catch yourself typing the same objection twice and that's the system telling you it should have been a constraint.

In practice "rule-carrying reviewer" just means a reviewer with a mandate narrow enough to produce evidence instead of vibes:

```text
Review this change against the project rules. Report violations only —
no unrelated refactors, no style opinions.

- Idempotency keys use the provider event id, never a payload hash.
- Every retry-safe handler has a duplicate-delivery feature test.
- Writes that must succeed together happen in one transaction.
```

Whether those rules arrive as a skill, a command, a file in the repo or a generated prompt is incidental plumbing. What matters is the mandate: bounded scope, project-specific rules, findings I can check rather than an opinion I have to trust. I run a small, evolving set of these. It's WIP, and it deserves its own post rather than a confident paragraph here.

What it isn't is "let the AI review the AI and go for a walk". A model reviewing a model brings correlated blind spots and a strong instinct to agree; it will confirm the memoisation is a lovely optimisation, because it has no idea what you're prepared to maintain. Several machines agreeing isn't assurance. The second agent is an instrument whose rules I set, not an authority — a filter, not a judge. The filter is what makes the judge affordable.

## The loop runs backwards at least as often

A lot of the time the diff in `tuicr -w` is one **I** typed, and the agent is the reviewer.

What I keep: work where writing *is* the thinking; the load-bearing thirty lines every system has — ordering, concurrency, money, auth, cache invalidation — which I'd read three times regardless of who wrote them; and anything I couldn't confidently review, because *if I can't judge the result, I have no business delegating it.*

What I hand over is the complement: breadth, not depth. The fifth notification channel once the first four fixed the contract. Twenty controllers' inline `$request->validate()` lifted into FormRequest classes. Settled contract, made judgement, keystrokes remaining.

Reviewing my own work runs the same loop, and I almost never ask whether a change is *good*. I ask for one failure mode: trace authorisation through every entry point, challenge the migration path, find the behaviour the tests don't pin down. **A general reviewer produces an opinion. A bounded reviewer produces evidence.**

Which is why review lives in its own program rather than a chat pane: the gate doesn't care who typed the code. And the reason I keep the hard parts is that the two skills feed each other. You don't have to have typed something to review it — but you do need enough command of the problem to know where it could be wrong. Below that line you're pattern-matching and hoping, and the practice that keeps me above it is writing the difficult code myself.

## What it costs

The honest ledger, because a post like this without one is an advertisement:

- **The ceiling is me.** Four agents make four review queues that merge through one human. Past two or three I'm not faster, I'm accruing unread diffs — the exact failure this exists to prevent.
- **Worktrees diverge.** Four branches off one base for a day is four rebases and real conflicts.
- **"Done" is not "correct".** A status hook reports that a process exited. That's the entire claim it makes.
- **Concurrency multiplies spend.** Four agents cost roughly four agents.
- **Rules rot.** A rule you no longer believe, enforced tirelessly, is worse than none — it trains you to skim past the layer that was supposed to be thinking.
- **Young tools.** tuicr is at `0.19`, workmux moves fast, and prompt.nvim I maintain myself.

And in fairness to the sidebar: one-click install, excellent inline completion, rendered diffs without learning a keybinding. If your day is one task at a time in one repo, or the project is small enough that being wrong costs an afternoon, everything above buys you nothing.

## Where I've landed

The tools are almost incidental. Swap tuicr for `git add -p` and a notebook, swap workmux for four tabs and some discipline — the argument survives, because it was never about the terminal. The machine made one half of my job nearly free and left the other half exactly as expensive as it was, and it's now very easy to spend the savings on shipping code nobody understood.

So I optimise the expensive half, starting by not wasting it. Isolation cheap enough that I stop skipping it. Paths pinned instead of described. Rules written down and enforced by machines, so what reaches me is the residue no rule could catch. Review concrete enough to survive a busy Friday.

Four agents type faster than I ever will. A fifth can challenge their work, and a repo full of rules can reject the known mistakes before I see any of it. None of that decides whether a change belongs in the system. That part is mine: build the gates, weigh what comes through, stay the one accountable for opening them — which means still writing the hardest code myself, because that's what keeps the judging sharp.

The honest exception is proportionality. This is calibrated for code with consequences: other maintainers, real data, something that pages someone at 3am. On a disposable experiment I accept far more risk, because the blast radius is my own laptop — that isn't abandoning judgement, it's applying it. The part that matters is noticing when a toy quietly stops being one.

But when it counts: the Accept All button is right there. I'm just not going to press it.

---

*References: [workmux](https://github.com/raine/workmux) · [tuicr](https://github.com/agavra/tuicr) · [prompt.nvim](https://github.com/monkeymonk/prompt.nvim) (mine). Related: [running agents in a box](/blog/ai-agent-sandboxing/) and [the four repos behind this machine](/blog/four-things-to-run-a-machine/).*
