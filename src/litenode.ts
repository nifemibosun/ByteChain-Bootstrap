import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { kadDHT } from '@libp2p/kad-dht';
import { gossipsub } from '@libp2p/gossipsub';
import { mdns } from '@libp2p/mdns';
import { ping } from '@libp2p/ping';
import { lpStream } from 'it-length-prefixed-stream';


const print = (s: any) => {
    console.dir(s)
}

class LiteNode {
    node: any;
    CHAIN_SYNC_PROTOCOL = '/bytechain/sync/0.0.1';
    MEMPOOL_SYNC_PROTOCOL = '/bytechain/mempool/0.0.1';

    async start(port: number) {
        this.node = await createLibp2p({
            addresses: {
                listen: [
                    `/ip6/::/tcp/${port}`,
                    `/ip6/::/tcp/${port + 1}/ws`,
                    `/ip4/0.0.0.0/tcp/${port}`,
                ]
            },
            transports: [
                tcp(),
                webSockets()
            ],
            connectionEncrypters: [noise()],
            streamMuxers: [yamux()],
            peerDiscovery: [
                mdns({ interval: 20e3 }),
            ],
            services: {
                identify: identify(),
                ping: ping(),
                dht: kadDHT({ clientMode: false }),
                pubsub: gossipsub({
                    allowPublishToZeroTopicPeers: true,
                    D: 2,
                    Dlo: 1,
                    Dhi: 3,
                })
            }
        });

        this.node.addEventListener('peer:discovery', (evt: any) => {
            const peer_id = evt.detail.id;
            this.node.dial(peer_id).catch((_: any) => {});
        });

        await this.node.handle(this.CHAIN_SYNC_PROTOCOL, async ({ stream }: any) => {
            const lp = lpStream(stream);

            try {
                while (true) {
                    const data = await lp.read();
                    if (!data) break;

                    const request = JSON.parse(new TextDecoder().decode(data.subarray()));

                    if (request.type === 'GET_HEIGHT') {
                        await lp.write(new TextEncoder().encode(JSON.stringify({ height: 0 })));
                    } else if (request.type === 'GET_BLOCKS') {
                        await lp.write(new TextEncoder().encode(JSON.stringify({ blocks: [] })));
                    }
                }
            } catch (err) {
                console.error(`Lite node chain sync error: ${err instanceof Error ? err.message : err}`);
            } finally {
                await stream.close();
            }
        });

        await this.node.handle(this.MEMPOOL_SYNC_PROTOCOL, async ({ stream }: any) => {
            const lp = lpStream(stream);
            try {
                await lp.write(new TextEncoder().encode(JSON.stringify([])));
            } catch (err) {
                console.error(`Lite node mempool sync error: ${err instanceof Error ? err.message : err}`);
            } finally {
                stream.close();
            }
        });

        this.node.addEventListener('peer:connect', (evt: any) => {
            print(`Peer connected: ${evt.detail.toString()}`);
        });

        this.node.addEventListener('peer:identify', (evt: any) => {
            const { peerId, protocols } = evt.detail;
            if (protocols.includes(this.CHAIN_SYNC_PROTOCOL)) {
                print(`ByteChain peer identified: ${peerId.toString()}`);
            }
        });

        this.node.addEventListener('peer:disconnect', (evt: any) => {
            evt.detail;
        });

        await this.node.start();
        print(`ByteChain Lite Node started with peer ID: ${this.node.peerId.toString()}`);

        for (const addr of this.node.getMultiaddrs()) {
            print(`${addr.toString()}/p2p/${this.node.peerId.toString()}`);
        }

        this.node.services.pubsub.subscribe('bytechain:transactions');
        this.node.services.pubsub.subscribe('bytechain:blocks');
    }

    async stop() {
        await this.node.stop();
        print('Lite Node stopped');
    }
}

export default LiteNode;