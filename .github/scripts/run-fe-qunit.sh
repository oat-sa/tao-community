#!/usr/bin/env bash
# grunt-contrib-qunit 3.x uses Puppeteer ~1.20 (Chromium ~76), which is flaky on CI;
# retry a few times before failing the step.
set -euo pipefail

suite="${1:?Grunt test suite name required (e.g. pcisamplestest)}"
workspace="${GITHUB_WORKSPACE:-}"
if [[ -z "$workspace" ]]; then
  echo "GITHUB_WORKSPACE is not set" >&2
  exit 1
fi

cd "$workspace/tao/views/build"

max_attempts="${FE_QUNIT_MAX_ATTEMPTS:-3}"
delay_sec="${FE_QUNIT_RETRY_DELAY_SEC:-8}"

chrome_flags=()
if [[ -n "${GRUNT_CHROME_FLAGS:-}" ]]; then
  chrome_flags=( --chrome-flags="$GRUNT_CHROME_FLAGS" )
fi

for ((attempt = 1; attempt <= max_attempts; attempt++)); do
  if npx grunt connect:test qunit_junit "$suite" --force --reports=../../../junit-reports "${chrome_flags[@]}"; then
    exit 0
  fi
  echo "Grunt suite '${suite}' failed (attempt ${attempt}/${max_attempts})." >&2
  if ((attempt < max_attempts)); then
    echo "Retrying in ${delay_sec}s..." >&2
    sleep "$delay_sec"
  fi
done
exit 1
