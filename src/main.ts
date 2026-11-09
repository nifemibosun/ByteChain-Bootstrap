import LiteNode from './litenode.js';

const main = () => {
    const PORT = Number(process.env.PORT ?? 1000);
    const litenode = new LiteNode(PORT);
    
    litenode.start();
}

main();