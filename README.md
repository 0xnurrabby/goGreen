# goGreen

goGreen is a Node.js CLI for planning or creating Git commits with custom contribution dates.

The command is safe by default: it prints a dry run unless you pass `--execute`. It only pushes to a remote when you also pass `--push`.

## Requirements

- Node.js 20 or newer
- Git configured with the author identity you want on the commits

## Install

```bash
git clone https://github.com/fenrir2608/goGreen.git
cd goGreen
npm install
```

## Usage

Preview 200 commits without changing the repository:

```bash
npm start -- --count 200 --seed 42
```

Create 200 local commits across the default date range:

```bash
npm start -- --count 200 --execute
```

Create and push 200 commits:

```bash
npm start -- --count 200 --execute --push
```

Create commits in a specific date range:

```bash
npm start -- --count 200 --from 2025-01-01 --to 2025-12-31 --execute
```

## Options

| Option | Description |
| --- | --- |
| `-c, --count <number>` | Number of commits to plan or create. Defaults to `100`. |
| `--from <YYYY-MM-DD>` | First eligible contribution date. Defaults to one year ago. |
| `--to <YYYY-MM-DD>` | Last eligible contribution date. Defaults to today. |
| `-f, --file <path>` | JSON file updated for each commit. Defaults to `data.json`. |
| `-m, --message <template>` | Commit message template. Supports `{index}`, `{count}`, and `{date}`. |
| `--seed <number>` | Makes the generated date sequence repeatable. |
| `--execute` | Creates local commits instead of printing a dry run. |
| `--push` | Pushes after creating commits. Requires `--execute`. |
| `-h, --help` | Prints CLI help. |

## Test

```bash
npm test
```

## Notes

Backdated commits affect repository history. Run the command from a repository where you are comfortable creating those commits, and review the dry-run output before using `--execute`.
