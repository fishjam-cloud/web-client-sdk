fn main() {
    let protoc = protoc_bin_vendored::protoc_bin_path().expect("vendored protoc");
    std::env::set_var("PROTOC", protoc);

    prost_build::Config::new()
        .boxed(".fishjam.sdk.SdkResponse.content.room_state")
        .boxed(".fishjam.sdk.SdkEvent.content.room_state_changed")
        .compile_protos(&["proto/sdk_api.proto"], &["proto/"])
        .expect("compile sdk_api.proto");
}
