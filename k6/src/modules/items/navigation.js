import http from 'k6/http';
import { check } from 'k6';
import { encodeUri } from '../../components/uri/encoder';

export function accessItemsMenu(params) {
    const res = http.request('GET', params.url + '/tao/Main/index?structure=items&ext=taoItems', '', params.options);

    check(res, {
        'status is 200': r => r.status === 200,
        'response body': r => r.body.indexOf('Create and design items and exercises') !== -1,
        'response time ok': r => r.timings.duration < 2000
    });
}

export function getItemTree(params) {
    const res = http.request(
        'GET',
        params.url +
            '/taoItems/Items/getOntologyData?extension=taoItems&perspective=items&section=manage_items&classUri=http%3A%2F%2Fwww.tao.lu%2FOntologies%2FTAOItem.rdf%23Item&hideInstances=0&filter=*&offset=0&limit=30&selected=undefined',
        '',
        params.options
    );

    check(res, { 'status is 200': r => r.status === 200 });

    return res;
}

export function selectItemOfTree(params) {
    const res = http.request(
        'POST',
        params.url + '/taoItems/Items/editItem',
        'uri=' +
            params.item.id +
            '&classUri=' +
            encodeUri(params.item.classUri) +
            '&id=' +
            encodeURIComponent(params.item.uri),
        params.options
    );

    check(res, { 'status is 200': r => r.status === 200 });

    return res;
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
        params.options
    );

    check(res, { 'status is 200': r => r.status === 200 });

    return res;
}

export function goToItemAuthoring(params) {
    const res = http.request(
        'GET',
        params.url + '/taoItems/Items/authoring?id=' + encodeURIComponent(params.item.uri),
        '',
        params.options
    );

    check(res, { 'status is 200': r => r.status === 200 });

    return res;
}

export function saveOnItemAuthoring(params) {
    const res = http.request(
        'GET',
        params.url + '/taoQtiItem/QtiCreator/saveItem?uri=' + encodeURIComponent(params.item.uri),
        params.item.qtiXml,
        params.options
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
        params.options
    );

    check(res, { 'status is 200': r => r.status === 200 });

    return res;
}
