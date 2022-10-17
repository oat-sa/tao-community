<?php

$pattern = '/testFailed\s+name=\'(?<name>[^\']+)\'\s+message=\'(?<message>.*)\'\s+details=\'.*tao-community\/(?<details>.*)\|n/m';

preg_match_all($pattern, file_get_contents('/tmp/failures.txt'), $matches, PREG_SET_ORDER);

$i = 0;
foreach ($matches as $match) {
    $i++;
    echo preg_replace(
        '/#(\d)/',
        '#&#8203;$1',
        "$i. **{$match['details']}**\n{$match['name']} {$match['message']}\n"
    );
}
