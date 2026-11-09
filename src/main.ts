import http from 'http';
import LiteNode from './litenode.js';

const main = () => {
    const PORT = Number(process.env.PORT ?? 1000);
    const litenode = new LiteNode(PORT);
    const server = http.createServer(litenode.app);
    
    litenode.start_api(server);
    litenode.start();
}

main();