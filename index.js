const core = require("@actions/core");
const axios = require('axios');
const fs = require("fs");
const yaml = require("js-yaml");

function resolveVariables(input, lookup) {
  // Handle objects (including nested ones)
  if (typeof input === "object" && input !== null) {
    const result = {};
    for (const key of Object.keys(input)) {
      result[key] = resolveVariables(input[key], lookup);
    }
    return result;
  }

  // Handle string values containing $(var) tokens
  if (typeof input === "string") {
    const pattern = /\$\(([^\)]+)\)/; // one match at a time
    let current = input;
    let found = current.match(pattern);

    while (found) {
      const ref = found[1];
      if (!lookup[ref]) {
        throw new Error(`Variable "${ref}" is not defined`);
      }
      current = current.replace(found[0], lookup[ref]);
      found = current.match(pattern);
    }
    return current;
  }

  // Return primitives untouched
  return input;
}


async function validateSubscription() {
  let repoPrivate;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const payload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    repoPrivate = payload?.repository?.private;
  }

  const upstream = "pietrobolcato/action-read-yaml";
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl =
    "https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions";

  core.info("");
  core.info("\u001b[1;36mStepSecurity Maintained Action\u001b[0m");
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false)
    core.info("\u001b[32m\u2713 Free for public repositories\u001b[0m");
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info("");

  if (repoPrivate === false) return;
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const body = { action: action || "" };

  if (serverUrl !== "https://github.com") body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      { timeout: 3000 },
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`,
      );
      core.error(
        `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`,
      );
      process.exit(1);
    }
    core.info("Timeout or API not reachable. Continuing to next step.");
  }
}

async function run() {
  try {
    await validateSubscription();
    const yamlPath = core.getInput("config");
    const filterPattern = core.getInput("key-path-pattern");
    const envPrefix = core.getInput("env-var-prefix");

    // Read YAML file contents
    fs.readFile(yamlPath, "utf8", (error, raw) => {
      if (error) {
        core.error(`Failed to read YAML: ${error.message}`);
        return;
      }

      if (filterPattern) {
        core.info(`Filter pattern detected: ${filterPattern}`);
      }

      core.info("YAML file content loaded successfully.");

      const parsed = yaml.load(raw, { schema: yaml.FAILSAFE_SCHEMA });
      const resolvedValues = {};

      // Recursively traverse nested YAML structure
      const traverse = (node, path = "") => {
        for (const [key, val] of Object.entries(node)) {
          const fullKey = path ? `${path}.${key}` : key;

          if (val && typeof val === "object") {
            if (Array.isArray(val)) {
              core.setOutput(`${fullKey}.array`, val);
            }
            traverse(val, fullKey);
          } else {
            resolvedValues[fullKey] = resolveVariables(val, resolvedValues);
          }
        }
      };

      traverse(parsed);

      const patternRegex = filterPattern ? new RegExp(filterPattern, "g") : null;
      const envNameCleaner = /[.\-]/g;
      

      for (const [fullKey, rawValue] of Object.entries(resolvedValues)) {
        let include = true;
        let outputKey = fullKey;

        if (patternRegex) {
          if (patternRegex.test(fullKey)) {
            outputKey = fullKey.replace(patternRegex, "");
            patternRegex.lastIndex = 0; // reset for next iteration
          } else {
            include = false;
          }
        }

        if (!include) continue;

        core.info(`${outputKey} : ${rawValue}`);
        core.setOutput(outputKey, rawValue);

        if (envPrefix) {
          const envName = `${envPrefix}_${outputKey.replace(envNameCleaner, "_")}`;
          core.info(`${envName}=${rawValue}`);
          core.exportVariable(envName, rawValue);
        }
      }
    });
  } catch (err) {
    core.setFailed(err.message);
  }
}

run();
