#!/usr/bin/env bash

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
DEFAULT_TEST_DIR=test/unit

usage_error() {
  echo >&2 "$(basename $0):  $1"
  exit 2
}

if [ "$#" != 0 ]; then
  EOL=$(printf '\1\3\3\7')
  set -- "$@" "$EOL"
  while [ "$1" != "$EOL" ]; do
    opt="$1"
    shift
    case "$opt" in
    -c | --coverage) coverage='-dxdebug.mode=coverage' ;;
    -*) usage_error "unknown option: '$opt'" ;;
    esac
  done
  shift
fi

for d in */; do
  d=${d%?}

  if [[ "$d" == 'vendor' || "$d" == 'coverage' ]]; then
    continue
  fi

  testDir=$(grep test-suites-path "$DIR/$d/.github/workflows" -R | awk '{print $NF}')

  if [[ -z "$testDir" ]]; then
    testDir="$DEFAULT_TEST_DIR"
  fi

  if [ ! -d "$DIR/$d/$testDir" ]; then
    continue
  fi

  cp "$DIR/phpunit.xml.dist" "$DIR/phpunit.xml"
  sed -ie "s/\*/$d/g" "$DIR/phpunit.xml"

  php $coverage "$DIR/vendor/bin/phpunit" --coverage-php "coverage/$d.php"
done
