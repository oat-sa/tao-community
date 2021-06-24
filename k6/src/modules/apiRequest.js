/**
 * This is a feature that can be shared within many tests.
 */

import http from 'k6/http';
import { check } from 'k6';

export function checkMyApiGetRequest(url) {
    const res = http.get(url);

    check(res, {
        'status is 200': r => r.status === 200,
        'response body': r => r.body.indexOf('Feel free to browse') !== -1
    });
}
