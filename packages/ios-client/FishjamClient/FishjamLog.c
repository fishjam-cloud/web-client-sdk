#include <os/log.h>
#include <stdint.h>
#include <stdio.h>

// Called from fishjam-core. The server's deprecated or unsupported warning
// is written here so it shows in the Xcode console.
void fishjam_ios_log(int32_t level, const char *message) {
    if (message == NULL) {
        return;
    }
    os_log_type_t type = OS_LOG_TYPE_DEFAULT;
    switch (level) {
        case 1:
            type = OS_LOG_TYPE_ERROR;
            break;
        case 2:
            type = OS_LOG_TYPE_DEFAULT;
            break;
        case 3:
            type = OS_LOG_TYPE_INFO;
            break;
        default:
            type = OS_LOG_TYPE_DEBUG;
            break;
    }
    fprintf(stderr, "%s\n", message);
    os_log_with_type(OS_LOG_DEFAULT, type, "%{public}s", message);
}
