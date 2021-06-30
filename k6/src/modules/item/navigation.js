import http from 'k6/http';
import { check } from 'k6';
import { encodeUri } from '../../components/uri/encoder.js';

export function accessItemsMenu(params) {
    const res = http.request('GET', params.url + '/tao/Main/index?structure=items&ext=taoItems', '', {
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        cookies: params.user._cookie
    });

    check(res, {
        'status is 200': r => r.status === 200,
        'response body': r => r.body.indexOf('Create and design items and exercises') !== -1,
        'response time ok': r => r.timings.duration < 2000
    });

    return res;
}

export function getItemTree(params) {
    const res = http.request(
        'GET',
        params.url +
            '/taoItems/Items/getOntologyData?extension=taoItems&perspective=items&section=manage_items&classUri=http%3A%2F%2Fwww.tao.lu%2FOntologies%2FTAOItem.rdf%23Item&hideInstances=0&filter=*&offset=0&limit=30&selected=undefined',
        '',
        {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            cookies: params.user._cookie
        }
    );

    check(res, { 'status is 200': r => r.status === 200 });

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
        'uri=' + item._uri +
        '&id=' + item._uri +
        '&classUri=' + item._classUri,
        '&signature=' + params.tokens.signature,
        {
            redirects: 999,
            headers: {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-CSRF-Token': params.tokens.csrfToken,
            },
            cookies: params.user._cookie
        }
    );

    //FIXME
    //FIXME
    //FIXME
    console.error(res.status);
    console.error(JSON.stringify(res.body));
    console.error(JSON.stringify(item));
    console.error(JSON.stringify(params.user._cookie));
    //FIXME
    //FIXME
    //FIXME

    check(res, {
        'Deleted item - status is 200': r => r.status === 200,
        'Deleted item - response body': r => r.body.indexOf('"success":true') !== -1
    });
}

export function selectItemOfTree(params) {
    const response = http.request(
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
            cookies: params.user._cookie
        }
    );

    check(response, { 'Select Item - status is 200': r => r.status === 200 });

    return response;
}

export function editItemAndSave(params) {
    const res = http.request(
        'POST',
        params.url + '/taoItems/Items/editItem',
        'form_1_sent=1&tao.forms.instance=1' +
            '&http_2_www_0_w3_0_org_1_2000_1_01_1_rdf-schema_3_label=' +
            params.item.label +
            '&id=' +
            encodeURIComponent(params.item.uri) +
            '&http_2_www_0_tao_0_lu_1_Ontologies_1_TAOItem_0_rdf_3_ItemModel=http_2_www_0_tao_0_lu_1_Ontologies_1_TAOItem_0_rdf_3_QTI' +
            '&classUri=' +
            encodeUri(params.item.classUri) +
            '&uri=' +
            params.item.id +
            '&signature=' +
            params.item.signature +
            '&X-CSRF-Token=' +
            params.item.csrfToken + // @TODO Check if this is really required and used/validated
            '&Save=Save',
        {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            cookies: params.user._cookie
        }
    );

    check(res, { 'status is 200': r => r.status === 200 });

    return res;
}

export function goToItemAuthoring(params) {
    const res = http.request(
        'GET',
        params.url + '/taoItems/Items/authoring?id=' + encodeURIComponent(params.item.uri),
        '',
        {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            cookies: params.user._cookie
        }
    );

    check(res, { 'status is 200': r => r.status === 200 });

    return res;
}

export function saveOnItemAuthoring(params) {
    const res = http.request(
        'GET',
        params.url + '/taoQtiItem/QtiCreator/saveItem?uri=' + encodeURIComponent(params.item.uri),
        params.item.qtiXml,
        {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            cookies: params.user._cookie
        }
    );

    check(res, { 'status is 200': r => r.status === 200 });

    return res;
}

export function goToPreviewFromItemAuthoring(params) {
    const res = http.request(
        'GET',
        params.url +
            '/taoQtiTestPreviewer/Previewer/getItem?serviceCallId=previewer&itemUri=' +
            encodeURIComponent(params.item.uri),
        '',
        {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            cookies: params.user._cookie
        }
    );

    check(res, { 'status is 200': r => r.status === 200 });

    return res;
}
