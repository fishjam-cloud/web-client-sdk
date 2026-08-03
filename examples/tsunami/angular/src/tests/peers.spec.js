import { connectAndJoin, describe, expect, it } from "./support/fixtures";
describe("participants state", () => {
    it("starts with no local peer and no remote peers", ({ service }) => {
        expect(service.state().localPeer).toBeNull();
        expect(service.state().remotePeers).toEqual({});
    });
    it("exposes the local peer after joining", async ({ service, signalling }) => {
        await connectAndJoin(service, signalling);
        expect(service.state().localPeer?.id).toBe("local-peer");
    });
    it("surfaces remote peers on peerJoined and removes them on peerLeft", async ({ service, signalling }) => {
        await connectAndJoin(service, signalling);
        signalling.addRemotePeer({ id: "peer-1" });
        expect(Object.keys(service.state().remotePeers)).toEqual(["peer-1"]);
        signalling.addRemotePeer({ id: "peer-2" });
        expect(Object.keys(service.state().remotePeers)).toEqual(["peer-1", "peer-2"]);
        signalling.removeRemotePeer("peer-1");
        expect(Object.keys(service.state().remotePeers)).toEqual(["peer-2"]);
    });
    it("carries remote peer track metadata into state", async ({ service, signalling }) => {
        await connectAndJoin(service, signalling);
        signalling.addRemotePeer({
            id: "peer-1",
            tracks: [{ trackId: "remote-video", metadata: { type: "camera", paused: false } }],
        });
        const remotePeer = service.state().remotePeers["peer-1"];
        const trackContext = remotePeer?.tracks.get("remote-video");
        expect(trackContext?.metadata).toMatchObject({ type: "camera", paused: false });
    });
    it("clears participants on disconnect", async ({ service, signalling }) => {
        await connectAndJoin(service, signalling);
        signalling.addRemotePeer({ id: "peer-1" });
        signalling.simulateDisconnected();
        expect(service.state().localPeer).toBeNull();
        expect(service.state().remotePeers).toEqual({});
    });
});
