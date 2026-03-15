# Contributing

## Commit Messages

This project uses semantic commit messages.

Format: `<type>(<scope>): <subject>`

`<scope>` is optional

### Example

```
feat: add hat wobble
^--^  ^------------^
|     |
|     +-> Summary in present tense.
|
+-------> Type: chore, docs, feat, fix, refactor, style, or test.
```

### Types

| Type       | Description                                                |
| ---------- | ---------------------------------------------------------- |
| `feat`     | New feature for the user                                   |
| `fix`      | Bug fix for the user                                       |
| `docs`     | Documentation changes                                      |
| `style`    | Visual/UI changes, formatting (no logic change)            |
| `refactor` | Code restructuring without changing behavior               |
| `test`     | Adding or refactoring tests (no production code change)    |
| `chore`    | Maintenance tasks, config, dependencies (no product change)|

### Scope

Use scope to indicate the area of the codebase:

- `main` - Main process (`src/main/`)
- `renderer` - Renderer/UI (`src/renderer/`)
- `preload` - Preload bridge (`src/preload/`)
- Or a specific feature name (e.g., `terminal`, `worktree`, `opencode`)

Omit scope when changes span multiple areas or the type is self-explanatory.

### Examples

```
feat(terminal): add split pane support
fix(main): handle pty spawn failure on Windows
style: polish sidebar member selection
refactor: consolidate IPC handler setup
docs: update setup instructions
chore: upgrade electron to v39
test(renderer): add store unit tests
```
