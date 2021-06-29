import http from 'k6/http';
import { check } from 'k6';
import Item from './model/Item.js';
import ItemCollection from './model/ItemCollection.js';

/**
 * @param params
 *
 * @returns Item
 */
export function createItem(params) {
    const res = http.request(
        'POST',
        params.url + '/taoItems/RestItems',
        'type=' + encodeURIComponent(params.item.classUri) + '&label=' + params.item.label,
        {
            redirects: 999,
            headers: {
                ['Accept']: 'application/json',
                ['X-Requested-With']: 'XMLHttpRequest',
                ['Content-Type']: 'application/x-www-form-urlencoded'
            },
            cookies: params.user._cookie
        }
    );

    const responseObject = JSON.parse(res.body);

    check(res, {
        'Created item - status is 200': r => r.status === 200,
        'Created item - response body': r => r.body.indexOf('"success":true') !== -1
    });

    let item = new Item();
    item.label = responseObject.data.label;
    item.uri = responseObject.data.uriResource;
    item.classUri = params.item.classUri;

    return item;
}

/**
 * @param params
 *
 * @returns ItemCollection
 */
export function createMultipleItems(params) {
    let items = new ItemCollection();

    for (let i = 1; i <= params.quantity; i++) {
        let newParams = Object.assign({}, params);

        newParams.item.label = params.item.label + ' ' + i;

        const item = createItem(newParams);

        items.add(item);
    }

    return items;
}

/**
 * @param params
 *
 * @returns Item
 */
export function deleteItems(params) {
    let items = params.items;

    for (let i in items) {
        const item = items[i];

        const res = http.request(
            'POST',
            params.url + '/taoItems/Items/deleteItem',
            'uri=' + item._uri + '&id=' + item._uri + '&classUri=' + item._classUri,
            {
                redirects: 999,
                headers: {
                    ['Accept']: 'application/json',
                    ['X-Requested-With']: 'XMLHttpRequest',
                    ['Content-Type']: 'application/x-www-form-urlencoded'
                },
                cookies: params.user._cookie
            }
        );

        check(res, {
            'Deleted item - status is 200': r => r.status === 200,
            'Deleted item - response body': r => r.body.indexOf('"success":true') !== -1
        });
    }
}
