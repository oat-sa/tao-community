export function encodeUri(uri) {
    uri = uri.replace(/\#/g, '_3_');
    uri = uri.replace(/\:\/\//g, '_2_');
    uri = uri.replace(/\//g, '_1_');
    uri = uri.replace(/\./g, '_0_');
    uri = uri.replace(/\:/g, '_4_');

    return uri;
}
