use std::os::raw::c_void;

use prost::Message;

use crate::client::FishjamClient;
use crate::sdk::{
    sdk_request, sdk_response, ClientConfig, Empty, Error, SdkEvent, SdkRequest, SdkResponse,
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

struct UserData(*mut c_void);

// The SDK owns `user_data` and promises it can be used from any thread.
unsafe impl Send for UserData {}
unsafe impl Sync for UserData {}

impl UserData {
    fn get(&self) -> *mut c_void {
        self.0
    }
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

    let user_data = UserData(user_data);
    let client = FishjamClient::new(parsed, move |event: SdkEvent| {
        if let Some(callback) = on_event {
            let bytes = event.encode_to_vec();
            unsafe { callback(user_data.get(), bytes.as_ptr(), bytes.len()) };
        }
    });
    Box::into_raw(Box::new(client))
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
/// the caller owns; its `data` must be released with [`fishjam_buf_free`].
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
    let client = unsafe { &*client };

    let request = if req.is_null() {
        return write_response(out, error_response("empty request"), DECODE_ERROR);
    } else {
        match SdkRequest::decode(unsafe { std::slice::from_raw_parts(req, req_len) }) {
            Ok(request) => request,
            Err(_) => return write_response(out, error_response("invalid request"), DECODE_ERROR),
        }
    };

    let result = match request.content {
        Some(sdk_request::Content::JoinRoom(join)) => client
            .join_room(&join.peer_token, &join.peer_metadata_json)
            .map(|_| empty()),
        Some(sdk_request::Content::LeaveRoom(_)) => {
            client.leave_room();
            Ok(empty())
        }
        Some(_) | None => Err(error_message("unsupported request")),
    };

    match result {
        Ok(content) => write_response(
            out,
            SdkResponse {
                content: Some(content),
            },
            OK,
        ),
        Err(error) => write_response(
            out,
            SdkResponse {
                content: Some(sdk_response::Content::Error(error)),
            },
            ILLEGAL_CALL,
        ),
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

fn empty() -> sdk_response::Content {
    sdk_response::Content::Empty(Empty {})
}

fn error_message(message: &str) -> Error {
    Error {
        message: message.to_owned(),
        ..Default::default()
    }
}

fn error_response(message: &str) -> SdkResponse {
    SdkResponse {
        content: Some(sdk_response::Content::Error(error_message(message))),
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
