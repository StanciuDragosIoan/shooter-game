# Concepts: Prompts, Commands, and Skills

## Prompt

A prompt is just text you send to an AI. It's the raw input — a question, an instruction, a request. Every time you type something in Claude Code, that's a prompt.

Prompts are one-off and ephemeral. You write them fresh each time. They live only in the conversation.

**Example:**
```
Explain how the game loop in renderer.html works
```

---

## Command

A command is a reusable, saved prompt stored as a markdown file. Instead of typing the same detailed instructions every time, you write them once in a `.md` file and invoke them with a slash prefix.

**Where they live:**
- `~/.claude/commands/` — global, available in every project
- `.claude/commands/` — project-level, only available in that repo

**How they work:**
- The filename becomes the command name (`orient.md` → `/orient`)
- `$ARGUMENTS` is a placeholder that gets replaced by whatever you type after the command name
- When you type `/orient renderer.html`, Claude reads the file and substitutes `$ARGUMENTS` with `renderer.html`

**Example — invoking a command:**
```
/orient renderer.html canvas game
/teach the game loop
/howto renderer.html
```

Commands are just prompts with memory. Nothing magic happens — Claude reads the file contents and treats them as your message.

---

## Skill

A skill is a more capable, code-backed command. Unlike plain commands (which are just markdown), skills are defined by Claude Code itself or its plugins, and they can trigger internal tool calls, run multi-step agents, or have logic attached.

Skills show up in the system context Claude gets at the start of each conversation. You invoke them the same way (`/skill-name`), but internally Claude calls a `Skill` tool rather than just reading a file.

**Examples of built-in skills:**
- `/review` — reviews a pull request (runs agents, reads diffs, posts structured feedback)
- `/simplify` — audits changed code for quality and rewrites it
- `/security-review` — full security audit of pending branch changes

**Key difference from commands:**
- A command is passive: it's a text file that becomes your prompt
- A skill is active: it has behavior, can run tools, coordinate agents, and produce structured outputs

You can't write new skills yourself the same way you write commands. Skills are part of the Claude Code system.

---

## Summary

| | Prompt | Command | Skill |
|---|---|---|---|
| What it is | Raw text input | Saved, reusable prompt | Code-backed capability |
| Where it lives | In the chat | `~/.claude/commands/*.md` | Claude Code system/plugins |
| How to invoke | Just type it | `/command-name args` | `/skill-name args` |
| Reusable | No | Yes | Yes |
| Has logic/tools | No | No | Yes |
| You can create | Yes | Yes | No (system-defined) |

---

## The commands in this directory

- **orient.md** → `/orient` — get oriented in a codebase before touching anything
- **teach.md** → `/teach` — learn a concept through explanation, demo, and practice
- **howto.md** → `/howto` — generate a full `howToImplement.md` guide for a project
