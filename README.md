# action-read-yaml

A lightweight GitHub Action that loads data from a YAML file and exposes each key as an output or environment variable.  
This lets you use YAML files as dynamic configuration sources inside your workflows.

The action supports:
- Variable interpolation using the `$(var)` syntax  
- Nested key flattening (dot notation output)  
- Optional key filtering via regex patterns  
- Automatic environment variable creation with a configurable prefix  

---

## 🔧 Inputs

| Name | Required | Description |
|------|-----------|-------------|
| `config` | ✅ Yes | The path to the YAML configuration file. |
| `env-var-prefix` | ❌ No | Optional prefix for environment variables derived from keys. Dots (`.`) in key names are replaced with underscores. |
| `key-path` | ❌ No | A regular expression to filter which keys are included and to strip that matching part from their names. |

---

## 🧠 How It Works

1. The YAML file is parsed into an object.  
2. Nested keys are flattened using dot notation (e.g., `database.user.name`).  
3. Any `$(variable)` patterns are replaced with their corresponding resolved values.  
4. You can limit which keys are exported using a regex filter.  
5. Optionally, environment variables are created with a prefix.

---

## ⚙️ Example 1 — Basic Configuration

**YAML file:**
```yaml
namespace: demo
region: us-east
environment: dev

resource_group: $(namespace)-$(region)-$(environment)
```

**Workflow:**
```yaml
name: Read YAML Example

on:
  push:
  workflow_dispatch:

jobs:
  read-config:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - name: Load YAML configuration
        id: read
        uses: step-security/action-read-yaml@v1
        with:
          config: ${{ github.workspace }}/examples/basic.yaml

      - name: Display loaded values
        run: |
          echo "Namespace: ${{ steps.read.outputs['namespace'] }}"
          echo "Region: ${{ steps.read.outputs['region'] }}"
          echo "Environment: ${{ steps.read.outputs['environment'] }}"
          echo "Resource Group: ${{ steps.read.outputs['resource_group'] }}"
```

**Output:**
```
Namespace: demo
Region: us-east
Environment: dev
Resource Group: demo-us-east-dev
```

---

## ⚙️ Example 2 — Nested Structure

**YAML file:**
```yaml
service:
  name: web
  replicas: 3
  containers:
    - name: api
      image: node:20
    - name: db
      image: postgres:14
deploy:
  region: europe
  version: 2.0.1
```

**Workflow:**
```yaml
- name: Read nested YAML
  id: config
  uses: step-security/action-read-yaml@v1
  with:
    config: ${{ github.workspace }}/examples/nested.yaml

- name: Print results
  run: |
    echo "Service name: ${{ steps.config.outputs['service.name'] }}"
    echo "First container: ${{ steps.config.outputs['service.containers.0.name'] }}"
    echo "Deploy region: ${{ steps.config.outputs['deploy.region'] }}"
```

**Output:**
```
Service name: web
First container: api
Deploy region: europe
```

---

## ⚙️ Example 3 — Filtering Keys and Generating Environment Variables

**YAML file:**
```yaml
application:
  config:
    host: localhost
    port: 8080
  credentials:
    username: admin
    password: secret
deployment:
  path: /opt/app
  target: production
```

**Workflow:**
```yaml
name: Filter YAML Output

on:
  workflow_dispatch:

jobs:
  read-yaml:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - name: Parse config section only
        id: filtered
        uses: step-security/action-read-yaml@v1
        with:
          config: ${{ github.workspace }}/examples/filter.yaml
          env-var-prefix: APP_CONF
          key-path: ^application\.config\.

      - name: Show filtered values
        run: |
          echo "Host: ${{ steps.filtered.outputs['host'] }}"
          echo "Port: ${{ steps.filtered.outputs['port'] }}"
          echo
          echo "Environment variables:"
          env | grep APP_CONF_
```

**Output:**
```
Host: localhost
Port: 8080

APP_CONF_host=localhost
APP_CONF_port=8080
```

---

## 💡 Notes

- Variable interpolation happens before exporting outputs or env vars.  
- Filtering both removes and trims matching patterns from key names.  
- Nested arrays are automatically expanded using numeric indexes (e.g., `permissions.0.name`).  
- The action can be reused multiple times in the same workflow for different YAML sources.  

---

## 🪪 License

This project is licensed under the **MIT License**.  
See the [LICENSE](LICENSE) file for full text.
