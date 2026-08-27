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


const print = (s: any) => {
    console.dir(s)
}

class LiteNode {
    node: any;
    CHAIN_SYNC_PROTOCOL = '/bytechain/sync/0.0.1';
    MEMPOOL_SYNC_PROTOCOL = '/bytechain/mempool/0.0.1';

    async start(port: number) {
        let peerId;
        let privateKey;
        const privateKeyHex = process.env.PRIVATE_KEY_HEX;

        if (privateKeyHex) {
            try {
                privateKey = privateKeyFromProtobuf(fromString(privateKeyHex, 'hex'));
                peerId = peerIdFromPrivateKey(privateKey);
                print(`Loaded static Peer ID from environment variables ${peerId}`);
            } catch (err) {
                console.error("Failed to load static private key:", err);
            }
        }

        this.node = await createLibp2p({
            ...(privateKey != null ? { privateKey } : {}),
            addresses: {
                listen: [
                    `/ip4/0.0.0.0/tcp/${port}/ws`,
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
}

export default LiteNode;