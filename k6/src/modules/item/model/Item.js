class Item {
    constructor() {
        this._uri = undefined;
        this._label = undefined;
        this._classUri = undefined;
    }

    get classUri() {
        return this._classUri;
    }

    set classUri(value) {
        this._classUri = value;
    }

    get uri() {
        return this._uri;
    }

    set uri(value) {
        this._uri = value;
    }

    get label() {
        return this._label;
    }

    set label(value) {
        this._label = value;
    }
}

export default Item;
