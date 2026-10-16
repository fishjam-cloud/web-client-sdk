fn main() {
    let protoc = protoc_bin_vendored::protoc_bin_path().expect("vendored protoc");
    std::env::set_var("PROTOC", protoc);

    println!("cargo:rerun-if-changed=proto");
    println!("cargo:rerun-if-changed=../protobufs/protos");

    prost_build::Config::new()
        .boxed(".fishjam.sdk.SdkResponse.content.room_state")
        .boxed(".fishjam.sdk.SdkEvent.content.room_state_changed")
        .include_file("protos.rs")
        .compile_protos(
            &[
                "proto/sdk_api.proto",
                "../protobufs/protos/fishjam/peer_notifications.proto",
            ],
            &["proto/", "../protobufs/protos/"],
        )
        .expect("compile protos");
}
