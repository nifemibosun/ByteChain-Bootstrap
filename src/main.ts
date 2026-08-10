import LiteNode from "./litenode.js";

const main = () => {
    const PORT = Number(process.env.PORT ?? 1000);
    let litenode = new LiteNode();
    litenode.start(PORT);
}

main();