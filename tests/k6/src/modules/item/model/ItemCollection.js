class ItemCollection {
    constructor() {
        this.items = [];
        this.total = 0;
    }

    add(item) {
        this.items.push(item);
        this.total++;
    }
}

export default ItemCollection;
