import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { kadDHT } from '@libp2p/kad-dht';
import { gossipsub } from '@libp2p/gossipsub';
import { mdns } from '@libp2p/mdns';
import { ping } from '@libp2p/ping';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import { fromString } from 'uint8arrays/from-string';
import express from 'express';
import cors from 'cors';
import type { Request, Response } from 'express';


const print = (s: any) => {
    console.dir(s)
}

class LiteNode {
    node: any;
    private api_port: number;
    public app: express.Application;
    CHAIN_SYNC_PROTOCOL = '/bytechain/sync/0.0.1';
    MEMPOOL_SYNC_PROTOCOL = '/bytechain/mempool/0.0.1';

    constructor(api_port: number) {
        this.api_port = api_port;
        this.app = express();
        this.setup_api();
    }

    private setup_api() {
        this.app.use(cors({ origin: "*" }));
        this.app.use(express.json());

        this.app.get("/status", (_: Request, res: Response) => {
            res.status(200).json({
                status: "running",
                api_port: this.api_port,
            });
        });
    }

    async start() {
        let peer_id;
        let private_key;
        const privateKeyHex = process.env.PRIVATE_KEY_HEX;

        if (privateKeyHex) {
            try {
                private_key = privateKeyFromProtobuf(fromString(privateKeyHex, 'hex'));
                peer_id = peerIdFromPrivateKey(private_key);
                print(`Loaded static Peer ID from environment variables ${peer_id}`);
            } catch (err) {
                console.error("Failed to load static private key:", err);
            }
        }

        this.node = await createLibp2p({
            ...(private_key != null ? { private_key } : {}),
            addresses: {
                listen: [
                    `/ip4/0.0.0.0/tcp/${this.api_port + 1}/ws`,
                ]
            },
            transports: [
                webSockets()
            ],
            connectionEncrypters: [noise()],
            streamMuxers: [yamux() as any],
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
            print(`${addr.toString()}}`);
        }

        print(`Render PORT: ${process.env.PORT}`);

        this.node.services.pubsub.subscribe('bytechain:transactions');
        this.node.services.pubsub.subscribe('bytechain:blocks');
    }

    async stop() {
        await this.node.stop();
        print('Lite Node stopped');
    }

    async start_api(server?: any) {

        if (server) {
            server
                .listen(this.api_port, () => {
                  print(`HTTP server started on port ${this.api_port}`);
                })
                .on("error", (_: any) => {
                  print(`Failed to start HTTP server on port ${this.api_port}`);
                  process.exit(1);
                });
        } else {
            this.app
                .listen(this.api_port, () => {
                  print(`HTTP server started on port ${this.api_port}`);
                })
                .on("error", (_: any) => {
                  print(`Failed to start HTTP server on port ${this.api_port}`);
                  process.exit(1);
                });
        }
    }
}

export default LiteNode;