import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createCommits,
  DEFAULT_COUNT,
  generateCommitDates,
  parseArgs,
  resolveDataPath,
} from "./index.js";

test("parseArgs keeps the CLI safe by default", () => {
  const options = parseArgs(["--count", "200", "--seed", "42"], {
    now: new Date(2026, 5, 12),
  });

  assert.equal(options.count, 200);
  assert.equal(options.execute, false);
  assert.equal(options.push, false);
  assert.equal(options.from, "2025-06-12");
  assert.equal(options.to, "2026-06-12");
});

test("parseArgs accepts inline values and defaults", () => {
  const options = parseArgs(["--from=2025-01-01", "--to=2025-01-31"], {
    now: new Date(2026, 5, 12),
  });

  assert.equal(options.count, DEFAULT_COUNT);
  assert.equal(options.from, "2025-01-01");
  assert.equal(options.to, "2025-01-31");
});

test("parseArgs rejects unsafe or invalid option combinations", () => {
  assert.throws(() => parseArgs(["--count", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["--push"]), /requires --execute/);
  assert.throws(() => parseArgs(["--from", "2025-02-01", "--to", "2025-01-01"]), /on or before/);
  assert.throws(() => parseArgs(["--unknown"]), /Unknown option/);
});

test("generateCommitDates returns repeatable dates inside the requested range", () => {
  const first = generateCommitDates({
    count: 5,
    from: "2025-01-01",
    seed: 7,
    to: "2025-01-05",
  });
  const second = generateCommitDates({
    count: 5,
    from: "2025-01-01",
    seed: 7,
    to: "2025-01-05",
  });

  assert.deepEqual(first, second);
  assert.equal(first.length, 5);
  assert.ok(first.every((date) => date >= "2025-01-01T12:00:00" && date <= "2025-01-05T12:00:00"));
});

test("createCommits only previews commits unless execute is set", async () => {
  const gitCalls = [];
  const writes = [];

  const result = await createCommits(
    {
      count: 3,
      from: "2025-01-01",
      seed: 2,
      to: "2025-01-03",
    },
    {
      runGit: async (...args) => gitCalls.push(args),
      writeFile: async (...args) => writes.push(args),
    },
  );

  assert.equal(result.dryRun, true);
  assert.equal(result.commits, 0);
  assert.equal(result.dates.length, 3);
  assert.deepEqual(gitCalls, []);
  assert.deepEqual(writes, []);
});

test("createCommits writes data and creates dated commits when execute is set", async () => {
  const gitCalls = [];
  const writes = [];

  const result = await createCommits(
    {
      count: 2,
      execute: true,
      file: "data.json",
      from: "2025-01-01",
      message: "commit {index}/{count} {date}",
      seed: 3,
      to: "2025-01-02",
    },
    {
      cwd: "C:\\repo",
      runGit: async (args, options) => gitCalls.push({ args, options }),
      writeFile: async (...args) => writes.push(args),
    },
  );

  assert.equal(result.dryRun, false);
  assert.equal(result.commits, 2);
  assert.equal(writes.length, 2);
  assert.equal(gitCalls.length, 4);
  assert.deepEqual(gitCalls[0].args, ["add", "--", "data.json"]);
  assert.equal(gitCalls[1].args[0], "commit");
  assert.match(gitCalls[1].args.at(-1), /^commit 1\/2 2025-01-0[12]T12:00:00$/);
  assert.match(gitCalls[1].options.env.GIT_COMMITTER_DATE, /^2025-01-0[12]T12:00:00$/);
});

test("createCommits pushes only when requested", async () => {
  const gitCalls = [];

  const result = await createCommits(
    {
      count: 1,
      execute: true,
      from: "2025-01-01",
      push: true,
      seed: 4,
      to: "2025-01-01",
    },
    {
      cwd: "C:\\repo",
      runGit: async (args) => gitCalls.push(args),
      writeFile: async () => {},
    },
  );

  assert.equal(result.pushed, true);
  assert.deepEqual(gitCalls.at(-1), ["push"]);
});

test("resolveDataPath keeps output inside the repository", () => {
  assert.equal(resolveDataPath("C:\\repo", "data.json"), "C:\\repo\\data.json");
  assert.throws(() => resolveDataPath("C:\\repo", "..\\data.json"), /inside the repository/);
});
