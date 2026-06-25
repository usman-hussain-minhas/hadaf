import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const failures = [];

if (packageJson.private !== true) {
  failures.push("package.json must set private: true");
}

if (packageJson.license !== "UNLICENSED") {
  failures.push("package.json must set license: UNLICENSED");
}

if (typeof packageJson.name !== "string" || packageJson.name !== "hadaf") {
  failures.push("package.json name must be hadaf");
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", check: "package_metadata" }));
