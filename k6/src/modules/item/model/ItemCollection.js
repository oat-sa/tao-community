class ItemCollection {
    constructor() {
        this._items = [];
        this._total = 0;
    }

    add(item) {
        this._items.push(item);
        this._total++;
    }

    getTotal() {
        return this._total;
    }

    getItems() {
        return this._items;
    }
}

export default ItemCollection;
