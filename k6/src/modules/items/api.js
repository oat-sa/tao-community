import http from 'k6/http';
import { check } from 'k6';

export function createItem(params) {
    const res = http.request(
        'POST',
        params.url + '/taoItems/RestItems',
            'classUri=' + encodeURIComponent(params.item.classUri) +
            '&type=' + encodeURIComponent('http://www.tao.lu/Ontologies/TAOItem.rdf#Item') +
            '&label=' + params.item.label,
        {
            redirects: 999,
            headers: {
                ['Accept']: 'application/json',
                ['X-Requested-With']: 'XMLHttpRequest',
                ['Content-Type']: 'application/x-www-form-urlencoded'
            }
        }
    );

    check(res, {
        'Created item - status is 200': r => r.status === 200,
        'Created item - response body': r => r.body.indexOf('"success":true') !== -1
    });

    return res;
}
