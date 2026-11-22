import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function collectTerraformFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTerraformFiles(fullPath));
    } else if (entry.name.endsWith(".tf")) {
      files.push(readFileSync(fullPath, "utf8"));
    }
  }
  return files;
}

const rootMain = read("main.tf");
const variables = read("variables.tf");
const regionMain = read("modules/region/main.tf");
const sentinelTemplate = read("modules/region/templates/sentinel.sh.tpl");
const terraformFiles = collectTerraformFiles(root).join("\n");

assert.match(rootMain, /module "primary"/, "primary region module missing");
assert.match(rootMain, /module "secondary"/, "secondary region module missing");
assert.match(rootMain, /aws = aws\.primary/, "primary provider alias missing");
assert.match(
  rootMain,
  /aws = aws\.secondary/,
  "secondary provider alias missing",
);
assert.match(
  rootMain,
  /replicate_source_db\s+= module\.primary\.database_identifier/,
  "cross region database replica is not configured",
);

assert.match(
  terraformFiles,
  /multi_az\s+= true/,
  "primary database has no availability zone failover",
);
assert.match(
  terraformFiles,
  /resource "aws_db_instance" "replica"/,
  "replica database resource missing",
);

assert.match(
  rootMain,
  /failover\s+= "PRIMARY"/,
  "primary DNS failover missing",
);
assert.match(
  rootMain,
  /failover\s+= "SECONDARY"/,
  "secondary DNS failover missing",
);
assert.equal(
  (rootMain.match(/resource "aws_route53_health_check"/g) || []).length,
  2,
  "both regions need a Route53 health check",
);
assert.match(
  rootMain,
  /resource_path\s+= var\.health_check_path/,
  "health checks do not use the shared health path",
);

assert.match(
  terraformFiles,
  /resource "aws_instance" "redis_primary"/,
  "Redis primary instance missing",
);
assert.match(
  terraformFiles,
  /resource "aws_instance" "redis_replica"/,
  "Redis replica instance missing",
);
assert.match(
  terraformFiles,
  /resource "aws_instance" "sentinel"/,
  "Sentinel instances missing",
);
assert.match(
  variables,
  /redis_sentinel_count[\s\S]*?default\s+= 3/,
  "Sentinel count must default to three",
);
assert.match(
  variables,
  /redis_instance_count[\s\S]*?default\s+= 2/,
  "Redis node count must default to two",
);

for (const setting of [
  "REDIS_MODE",
  "REDIS_SENTINELS",
  "REDIS_SENTINEL_MASTER_NAME",
]) {
  assert.match(
    regionMain,
    new RegExp(setting),
    `${setting} is not passed to the API tasks`,
  );
}

assert.match(
  sentinelTemplate,
  /sentinel monitor \$\{master_name\} \$\{master_ip\} 6379 2/,
  "Sentinel quorum of two is required",
);
assert.match(
  sentinelTemplate,
  /sentinel down-after-milliseconds \$\{master_name\} 5000/,
  "Sentinel detection time must stay within the failover target",
);
assert.match(
  sentinelTemplate,
  /sentinel failover-timeout \$\{master_name\} 30000/,
  "Sentinel failover timeout must be 30 seconds",
);

if (existsSync(join(root, ".terraform"))) {
  execFileSync("terraform", ["fmt", "-check", "-recursive"], {
    cwd: root,
    stdio: "inherit",
  });
  execFileSync("terraform", ["validate"], { cwd: root, stdio: "inherit" });
  console.log("Terraform formatting and validation passed");
} else {
  console.log(
    "Terraform binary state not initialised, skipped native validation",
  );
}

console.log("Multi-region deployment contract checks passed");
