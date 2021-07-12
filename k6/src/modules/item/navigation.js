import http from 'k6/http';
import { check } from 'k6';
import { encodeUri } from '../../components/uri/encoder.js';

export function accessItemsMenu(params) {
    const res = http.request('GET', params.url + '/tao/Main/index?structure=items&ext=taoItems', '', {
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        cookies: params.user.cookie
    });

    check(res, {
        'status is 200': r => r.status === 200,
        'response body': r => r.body.indexOf('Create and design items and exercises') !== -1,
        'response time ok': r => r.timings.duration < 2000
    });

    return res;
}

/**
 * @param params
 *
 * @returns Item
 */
export function deleteItem(params) {
    const res = http.request(
        'POST',
        params.url + '/taoItems/Items/deleteItem',
        'uri=' +
            params.item.uri +
            '&id=' +
            params.item.uri +
            '&classUri=' +
            params.item.classUri +
            '&signature=' +
            params.tokens.signature,
        {
            redirects: 0,
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-CSRF-Token': params.tokens.csrfToken
            },
            cookies: params.user.cookie
        }
    );

    check(res, {
        'Deleted item - status is 200': r => r.status === 200,
        'Deleted item - response body': r => r.body.indexOf('"success":true') !== -1
    });
}

export function selectItemOfTree(params) {
    const res = http.request(
        'POST',
        params.url + '/taoItems/Items/editItem',
        'uri=' +
            encodeUri(params.item.uri) +
            '&classUri=' +
            encodeUri(params.item.classUri) +
            '&id=' +
            encodeURIComponent(params.item.uri),
        {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            cookies: params.user.cookie
        }
    );

    check(res, { 'Select Item - status is 200': r => r.status === 200 });

    return res;
}
