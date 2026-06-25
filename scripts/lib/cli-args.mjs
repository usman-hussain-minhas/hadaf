export function normalizeCliArgs(argv = process.argv) {
  const args = argv.slice(2);
  return args[0] === "--" ? args.slice(1) : args;
}

export function readRequiredSinglePathArg({
  argv = process.argv,
  check,
  usage,
  exitCode = 1,
  missingKind = "missing_config_path",
  excessKind = "excess_positional_arguments"
}) {
  const args = normalizeCliArgs(argv);
  if (args.length === 0) {
    fail({ status: "failed", check, error: usage, findings: [{ kind: missingKind }] }, exitCode);
  }
  if (args.length > 1) {
    fail({
      status: "failed",
      check,
      error: usage,
      findings: [{ kind: excessKind, actual: String(args.length) }]
    }, exitCode);
  }
  return args[0];
}

export function readOptionalSinglePathArg({
  argv = process.argv,
  check,
  usage,
  exitCode = 1,
  excessKind = "excess_positional_arguments"
}) {
  const args = normalizeCliArgs(argv);
  if (args.length > 1) {
    fail({
      status: "failed",
      check,
      error: usage,
      findings: [{ kind: excessKind, actual: String(args.length) }]
    }, exitCode);
  }
  return args[0] ?? null;
}

export function readRequiredPathArgs({
  argv = process.argv,
  check,
  usage,
  exitCode = 1,
  missingKind = "missing_positional_arguments"
}) {
  const args = normalizeCliArgs(argv);
  if (args.length === 0) {
    fail({ status: "failed", check, error: usage, findings: [{ kind: missingKind }] }, exitCode);
  }
  return args;
}

function fail(payload, exitCode) {
  console.error(JSON.stringify(payload));
  process.exit(exitCode);
}
