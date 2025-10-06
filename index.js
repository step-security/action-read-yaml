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
  const API_URL = `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/subscription`;

  try {
    await axios.get(API_URL, { timeout: 3000 });
  } catch (error) {
    if (error.response && error.response.status === 403) {
      core.error(
        "Subscription is not valid. Reach out to support@stepsecurity.io",
      );
      process.exit(1);
    } else {
      core.info("Timeout or API not reachable. Continuing to next step.");
    }
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
