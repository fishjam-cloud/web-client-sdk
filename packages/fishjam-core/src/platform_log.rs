/// One line written to Logcat or the Xcode console.
#[cfg_attr(
    not(any(target_os = "android", target_os = "ios", test)),
    allow(dead_code)
)]
pub(crate) fn format_line(level: log::Level, message: &str) -> String {
    format!("[FISHJAM] {level} {message}")
}

/// Installs the platform logger once. Warn and error are always recorded.
/// `debug` also records debug lines. On the host this does nothing, so tests
/// can keep their own logger.
pub(crate) fn install(debug: bool) {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    install_device_logger(debug);
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let _ = debug;
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn install_device_logger(debug: bool) {
    use std::sync::Once;

    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        if log::set_logger(&LOGGER).is_ok() {
            log::set_max_level(log::LevelFilter::Warn);
        }
    });
    if debug {
        log::set_max_level(log::LevelFilter::Debug);
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
static LOGGER: PlatformLogger = PlatformLogger;

#[cfg(any(target_os = "android", target_os = "ios"))]
struct PlatformLogger;

#[cfg(any(target_os = "android", target_os = "ios"))]
impl log::Log for PlatformLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= log::max_level()
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let line = format_line(record.level(), &record.args().to_string());
        write_line(record.level(), &line);
    }

    fn flush(&self) {}
}

#[cfg(target_os = "android")]
fn write_line(level: log::Level, line: &str) {
    let Ok(text) = std::ffi::CString::new(line) else {
        return;
    };
    let tag = std::ffi::CStr::from_bytes_with_nul(b"FISHJAM\0").unwrap();
    unsafe {
        __android_log_write(android_priority(level), tag.as_ptr(), text.as_ptr());
    }
}

#[cfg(target_os = "android")]
// android/log.h priorities: DEBUG = 3, INFO = 4, WARN = 5, ERROR = 6.
fn android_priority(level: log::Level) -> i32 {
    match level {
        log::Level::Error => 6,
        log::Level::Warn => 5,
        log::Level::Info => 4,
        log::Level::Debug | log::Level::Trace => 3,
    }
}

#[cfg(target_os = "android")]
#[link(name = "log")]
extern "C" {
    fn __android_log_write(
        priority: i32,
        tag: *const std::os::raw::c_char,
        text: *const std::os::raw::c_char,
    ) -> i32;
}

#[cfg(target_os = "ios")]
fn write_line(level: log::Level, line: &str) {
    let Ok(text) = std::ffi::CString::new(line) else {
        return;
    };
    unsafe {
        fishjam_ios_log(ios_level(level), text.as_ptr());
    }
}

#[cfg(target_os = "ios")]
// Same codes as FishjamLog.c: 1 error, 2 warn, 3 info, 4 debug.
fn ios_level(level: log::Level) -> i32 {
    match level {
        log::Level::Error => 1,
        log::Level::Warn => 2,
        log::Level::Info => 3,
        log::Level::Debug | log::Level::Trace => 4,
    }
}

// Defined in the iOS SDK (`FishjamLog.c`), which writes to the Xcode console.
#[cfg(target_os = "ios")]
extern "C" {
    fn fishjam_ios_log(level: i32, message: *const std::os::raw::c_char);
}

#[cfg(test)]
mod tests {
    use super::format_line;

    #[test]
    fn line_includes_level_and_server_message() {
        assert_eq!(
            format_line(log::Level::Warn, "sdk deprecated"),
            "[FISHJAM] WARN sdk deprecated"
        );
        assert_eq!(
            format_line(log::Level::Error, "sdk unsupported"),
            "[FISHJAM] ERROR sdk unsupported"
        );
    }
}
