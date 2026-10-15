use fishjam_core::sdk::{sdk_request, sdk_response, AddRequest, SdkRequest, SdkResponse};
use fishjam_core::{
    fishjam_buf_free, fishjam_client_call, fishjam_client_free, fishjam_client_new, FishjamBuf,
};
use prost::Message;

#[test]
fn c_abi_add_sums_two_numbers() {
    let client = unsafe { fishjam_client_new(std::ptr::null(), 0, None, std::ptr::null_mut()) };
    assert!(!client.is_null());

    let request = SdkRequest {
        content: Some(sdk_request::Content::Add(AddRequest { a: 2, b: 3 })),
    };
    let bytes = request.encode_to_vec();
    let mut out = FishjamBuf {
        data: std::ptr::null_mut(),
        len: 0,
    };

    let code = unsafe { fishjam_client_call(client, bytes.as_ptr(), bytes.len(), &mut out) };
    assert_eq!(code, 0);

    let response = unsafe {
        let slice = std::slice::from_raw_parts(out.data, out.len);
        SdkResponse::decode(slice).expect("response")
    };
    match response.content {
        Some(sdk_response::Content::Add(add)) => assert_eq!(add.sum, 5),
        other => panic!("expected add response, got {other:?}"),
    }

    unsafe {
        fishjam_buf_free(out);
        fishjam_client_free(client);
    }
}
