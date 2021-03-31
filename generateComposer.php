<?php
$composerArray = json_decode(file_get_contents("./composer.json"), true);
foreach ($composerArray["require"] as &$repository) {
    $repository = '*';
}
file_put_contents("./composer-release.json", json_encode($composerArray, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

