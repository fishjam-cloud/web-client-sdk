use std::os::raw::c_void;

use prost::Message;

use crate::add;
use crate::sdk::{
    sdk_request, sdk_response, AddRequest, AddResponse, ClientConfig, Error, SdkRequest,
    SdkResponse,
};

/// Return codes for [`fishjam_client_call`].
const OK: i32 = 0;
const NULL_ARGUMENT: i32 = 1;
const DECODE_ERROR: i32 = 2;
const ILLEGAL_CALL: i32 = 3;

pub type FishjamOnEvent = Option<unsafe extern "C" fn(*mut c_void, *const u8, usize)>;

#[repr(C)]
pub struct FishjamBuf {
    pub data: *mut u8,
    pub len: usize,
}

#[allow(dead_code)]
pub struct FishjamClient {
    config: ClientConfig,
    on_event: FishjamOnEvent,
    user_data: *mut c_void,
}

/// # Safety
/// `config` is either null with `config_len == 0`, or points at `config_len` bytes.
/// `on_event` may be null. `user_data` is passed back unchanged and is not dereferenced here.
#[no_mangle]
pub unsafe extern "C" fn fishjam_client_new(
    config: *const u8,
    config_len: usize,
    on_event: FishjamOnEvent,
    user_data: *mut c_void,
) -> *mut FishjamClient {
    let parsed = if config.is_null() || config_len == 0 {
        ClientConfig::default()
    } else {
        match ClientConfig::decode(unsafe { std::slice::from_raw_parts(config, config_len) }) {
            Ok(config) => config,
            Err(_) => return std::ptr::null_mut(),
        }
    };

    Box::into_raw(Box::new(FishjamClient {
        config: parsed,
        on_event,
        user_data,
    }))
}

/// # Safety
/// `client` is either null or a pointer returned by [`fishjam_client_new`] and not yet freed.
#[no_mangle]
pub unsafe extern "C" fn fishjam_client_free(client: *mut FishjamClient) {
    if !client.is_null() {
        drop(unsafe { Box::from_raw(client) });
    }
}

/// # Safety
/// `client` is a live client. `req` points at `req_len` bytes. `out` is a live `FishjamBuf`
/// the caller owns; on success its `data` must be released with [`fishjam_buf_free`].
#[no_mangle]
pub unsafe extern "C" fn fishjam_client_call(
    client: *mut FishjamClient,
    req: *const u8,
    req_len: usize,
    out: *mut FishjamBuf,
) -> i32 {
    if client.is_null() || out.is_null() {
        return NULL_ARGUMENT;
    }

    let request = if req.is_null() {
        return write_response(out, error_response("empty request"), DECODE_ERROR);
    } else {
        match SdkRequest::decode(unsafe { std::slice::from_raw_parts(req, req_len) }) {
            Ok(request) => request,
            Err(_) => return write_response(out, error_response("invalid request"), DECODE_ERROR),
        }
    };

    match request.content {
        Some(sdk_request::Content::Add(AddRequest { a, b })) => {
            let response = SdkResponse {
                content: Some(sdk_response::Content::Add(AddResponse { sum: add(a, b) })),
            };
            write_response(out, response, OK)
        }
        Some(_) | None => write_response(out, error_response("unsupported request"), ILLEGAL_CALL),
    }
}

/// # Safety
/// `buf.data` is either null or a pointer previously written by [`fishjam_client_call`].
#[no_mangle]
pub unsafe extern "C" fn fishjam_buf_free(buf: FishjamBuf) {
    if buf.data.is_null() {
        return;
    }
    drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(buf.data, buf.len)) });
}

fn error_response(message: &str) -> SdkResponse {
    SdkResponse {
        content: Some(sdk_response::Content::Error(Error {
            message: message.to_owned(),
            auth_reason: String::new(),
            join_reason: String::new(),
        })),
    }
}

fn write_response(out: *mut FishjamBuf, response: SdkResponse, code: i32) -> i32 {
    let bytes = response.encode_to_vec();
    let len = bytes.len();
    let data = Box::into_raw(bytes.into_boxed_slice()) as *mut u8;
    unsafe {
        (*out).data = data;
        (*out).len = len;
    }
    code
}
