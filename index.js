#!/usr/bin/env node

import { execFile } from "node:child_process";
import { writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const DEFAULT_COUNT = 100;
export const DEFAULT_DATA_FILE = "data.json";
export const DEFAULT_MESSAGE = "goGreen contribution {index}/{count} on {date}";

export function defaultDateRange(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return {
    from: formatDateOnly(addDays(today, -365)),
    to: formatDateOnly(today),
  };
}

export function parseArgs(argv, { now = new Date() } = {}) {
  const range = defaultDateRange(now);
  const options = {
    count: DEFAULT_COUNT,
    execute: false,
    file: DEFAULT_DATA_FILE,
    from: range.from,
    message: DEFAULT_MESSAGE,
    push: false,
    seed: undefined,
    to: range.to,
  };

  for (let index = 0; index < argv.length; index += 1) {
    let arg = argv[index];
    let inlineValue;

    if (arg.startsWith("--") && arg.includes("=")) {
      const equalsAt = arg.indexOf("=");
      inlineValue = arg.slice(equalsAt + 1);
      arg = arg.slice(0, equalsAt);
    }

    const readValue = (name) => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }

      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${name} requires a value`);
      }

      index += 1;
      return value;
    };

    switch (arg) {
      case "--count":
      case "-c":
        options.count = parsePositiveInteger(readValue(arg), "count");
        break;
      case "--execute":
        options.execute = true;
        break;
      case "--file":
      case "-f":
        options.file = readValue(arg);
        break;
      case "--from":
        options.from = readValue(arg);
        break;
      case "--help":
      case "-h":
        return { ...options, help: true };
      case "--message":
      case "-m":
        options.message = readValue(arg);
        break;
      case "--push":
        options.push = true;
        break;
      case "--seed":
        options.seed = parsePositiveInteger(readValue(arg), "seed");
        break;
      case "--to":
        options.to = readValue(arg);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return normalizeOptions(options);
}

export function normalizeOptions(options = {}) {
  const fromDate = parseDateOnly(options.from ?? defaultDateRange().from);
  const toDate = parseDateOnly(options.to ?? defaultDateRange().to);
  const count = parsePositiveInteger(options.count ?? DEFAULT_COUNT, "count");
  const message = options.message ?? DEFAULT_MESSAGE;
  const file = options.file ?? DEFAULT_DATA_FILE;

  if (compareDates(fromDate, toDate) > 0) {
    throw new Error("--from must be on or before --to");
  }

  if (options.push && !options.execute) {
    throw new Error("--push requires --execute");
  }

  if (!message.trim()) {
    throw new Error("--message cannot be empty");
  }

  if (!file.trim()) {
    throw new Error("--file cannot be empty");
  }

  return {
    count,
    execute: Boolean(options.execute),
    file,
    from: formatDateOnly(fromDate),
    fromDate,
    message,
    push: Boolean(options.push),
    seed: options.seed === undefined ? undefined : parsePositiveInteger(options.seed, "seed"),
    to: formatDateOnly(toDate),
    toDate,
  };
}

export function generateCommitDates(options) {
  const normalized = normalizeOptions(options);
  const days = daysBetween(normalized.fromDate, normalized.toDate) + 1;
  const random = createRandom(normalized.seed);

  return Array.from({ length: normalized.count }, () => {
    const offset = Math.floor(random() * days);
    return formatGitDate(addDays(normalized.fromDate, offset));
  });
}

export async function createCommits(options, dependencies = {}) {
  const normalized = normalizeOptions(options);
  const dates = generateCommitDates(normalized);

  if (!normalized.execute) {
    return {
      commits: 0,
      dates,
      dryRun: true,
      pushed: false,
    };
  }

  const cwd = dependencies.cwd ?? process.cwd();
  const writeFile = dependencies.writeFile ?? fsWriteFile;
  const runGit = dependencies.runGit ?? runGitCommand;
  const dataFilePath = resolveDataPath(cwd, normalized.file);

  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index];
    const commitNumber = index + 1;
    const data = {
      commit: commitNumber,
      date,
    };

    await writeFile(dataFilePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await runGit(["add", "--", normalized.file], { cwd });
    await runGit(["commit", "--date", date, "-m", renderMessage(normalized.message, {
      count: dates.length,
      date,
      index: commitNumber,
    })], {
      cwd,
      env: {
        GIT_COMMITTER_DATE: date,
      },
    });
  }

  if (normalized.push) {
    await runGit(["push"], { cwd });
  }

  return {
    commits: dates.length,
    dates,
    dryRun: false,
    pushed: normalized.push,
  };
}

export function resolveDataPath(cwd, file) {
  const root = path.resolve(cwd);
  const target = path.resolve(root, file);
  const relative = path.relative(root, target);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("--file must point to a path inside the repository");
  }

  return target;
}

export function helpText() {
  return `Usage: node index.js [options]

Options:
  -c, --count <number>       Number of commits to plan or create (default: ${DEFAULT_COUNT})
      --from <YYYY-MM-DD>    First eligible contribution date (default: one year ago)
      --to <YYYY-MM-DD>      Last eligible contribution date (default: today)
  -f, --file <path>          JSON file updated for each commit (default: ${DEFAULT_DATA_FILE})
  -m, --message <template>   Commit message template
      --seed <number>        Make the generated date sequence repeatable
      --execute              Create local commits instead of printing a dry run
      --push                 Push after creating commits; requires --execute
  -h, --help                 Show this help

Template variables: {index}, {count}, {date}

Examples:
  node index.js --count 200 --seed 42
  node index.js --count 200 --from 2025-01-01 --to 2025-12-31 --execute
  node index.js --count 200 --execute --push`;
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;

  try {
    const options = parseArgs(argv);

    if (options.help) {
      stdout.write(`${helpText()}\n`);
      return 0;
    }

    const result = await createCommits(options, dependencies);

    if (result.dryRun) {
      stdout.write(`Dry run: would create ${result.dates.length} commits.\n`);
      stdout.write(`Range: ${options.from} to ${options.to}\n`);
      stdout.write(`First dates: ${previewDates(result.dates)}\n`);
      stdout.write("Add --execute to create local commits.\n");
      return 0;
    }

    stdout.write(`Created ${result.commits} commits.\n`);

    if (result.pushed) {
      stdout.write("Pushed commits to the configured remote.\n");
    }

    return 0;
  } catch (error) {
    stderr.write(`Error: ${error.message}\n\n${helpText()}\n`);
    return 1;
  }
}

function parsePositiveInteger(value, name) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return number;
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date "${value}". Use YYYY-MM-DD.`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`Invalid date "${value}". Use YYYY-MM-DD.`);
  }

  return date;
}

function formatDateOnly(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatGitDate(date) {
  return `${formatDateOnly(date)}T12:00:00`;
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

function compareDates(left, right) {
  return dateToUtcDay(left) - dateToUtcDay(right);
}

function daysBetween(fromDate, toDate) {
  return Math.round((dateToUtcDay(toDate) - dateToUtcDay(fromDate)) / MS_PER_DAY);
}

function dateToUtcDay(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function createRandom(seed) {
  if (seed === undefined) {
    return Math.random;
  }

  let state = seed >>> 0;

  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function renderMessage(template, variables) {
  return template
    .replaceAll("{index}", String(variables.index))
    .replaceAll("{count}", String(variables.count))
    .replaceAll("{date}", variables.date);
}

async function runGitCommand(args, options) {
  return execFileAsync("git", args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

function previewDates(dates) {
  const preview = dates.slice(0, 10).join(", ");
  const suffix = dates.length > 10 ? ", ..." : "";
  return `${preview}${suffix}`;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (currentFile === invokedFile) {
  process.exitCode = await main();
}
