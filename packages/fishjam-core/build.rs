fn main() {
    let protoc = protoc_bin_vendored::protoc_bin_path().expect("vendored protoc");
    std::env::set_var("PROTOC", protoc);

    println!("cargo:rerun-if-changed=../protobufs/protos");

    prost_build::Config::new()
        .include_file("protos.rs")
        .compile_protos(
            &["../protobufs/protos/fishjam/peer_notifications.proto"],
            &["../protobufs/protos/"],
        )
        .expect("compile protos");
}
