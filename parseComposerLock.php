<?php
$composerArray = json_decode(file_get_contents("./composer.json"), true);
$composerLockArray = json_decode(file_get_contents("./composer.lock"), true);
foreach ($composerArray["require"] as $name => &$version) {
    $version = getVersion($name, $composerLockArray);
}
function getVersion($name, $composerLockArray) {
    foreach ($composerLockArray["packages"] as $package) {
        if ($package["name"] === $name) {
            break;
        }
    }
    return str_replace("v", "", $package["version"]);
}



