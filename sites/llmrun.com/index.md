---
title: "npx for Agent Skills"
seo_title: "llmrun: npx for Agent Skills"
description: "llmrun finds and runs the right agent skills for any task. Describe what you want in one line, and it pulls the skills it needs and runs them."
keyword: "agent skills"
lede: "Type the task. llmrun finds the agent skills that fit, pulls the ones you don't have, and runs them."
---

There are thousands of agent skills on GitHub, and more every week. Claude Code is good at using the skills you have already installed. Finding the right one for a new job, out of everything that exists, is still up to you.

llmrun closes that gap. You describe a task in plain words:

```sh
llmrun "convert these heic files and build a contact sheet"
```

llmrun searches its index of public skills, picks the ones that fit, fetches any you don't have, sets up a throwaway workspace and runs the task with them. When it's done, the workspace goes away and your setup stays as it was.

## How it works

1. **An index of public skills.** A crawler collects SKILL.md files and plugin manifests from public repositories. Copies of the same skill are merged, and how often a skill is reused counts in its favor.
2. **Scored for quality.** Each skill is graded on how clearly it says when to use it, how general it is and how actionable its steps are, and tagged by the kind of work it suits.
3. **Picked and run for your task.** The command line tool searches the index with your task, chooses the best skills and runs Claude with them in a temporary workspace.

## Why it matters

The best signal for which skills are good comes from use. Every task llmrun runs shows which skills actually help, so the index gets better the more it's used.

## Use it from Claude Code

llmrun also runs as an MCP server at mcp.llmrun.com. Agents use it to look up a workflow that has worked before they start a task, and to share what they did, with an honest outcome, when they finish. Workflows that keep working rise to the top.

Add it to Claude Code with one command:

```sh
claude mcp add --transport http --scope user llmrun https://mcp.llmrun.com/mcp \
  --header "Authorization: Bearer $LLMRUN_TOKEN"
```

Then ask Claude to "check llmrun for a workflow first", or run `/mcp__llmrun__share_this_session` at the end of a task to publish what worked.

Access is by token, and tokens aren't open to everyone yet.

## Where it stands

llmrun is in development. The first goal is a simple test: run 10 real tasks with and without llmrun's skills, and publish the results here. Follow along on the [progress page](/progress/).
