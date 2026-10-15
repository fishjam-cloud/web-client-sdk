pub mod sdk {
    include!(concat!(env!("OUT_DIR"), "/fishjam.sdk.rs"));
}

mod abi;

pub use abi::{
    fishjam_buf_free, fishjam_client_call, fishjam_client_free, fishjam_client_new, FishjamBuf,
};

/// Adds two numbers. Temporary stand-in used to prove the C ABI before joinRoom exists.
pub fn add(a: i32, b: i32) -> i32 {
    a.wrapping_add(b)
}

#[cfg(test)]
mod tests {
    use super::add;

    #[test]
    fn add_sums_two_numbers() {
        assert_eq!(add(2, 3), 5);
    }
}
