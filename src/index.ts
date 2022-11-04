if(!!process.isBun) {
    require("./index.bun")
} else {
    require("./index.node")
}