import FishjamClient
import SwiftUI
import UIKit

func peerDisplayName(_ peer: PeerWithTracks) -> String {
    if let object = peer.metadata?.peer as? [String: Any],
       let name = object["name"] as? String,
       !name.isEmpty {
        return name
    }
    return peer.id
}
