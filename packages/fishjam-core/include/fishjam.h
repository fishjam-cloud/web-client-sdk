#ifndef FISHJAM_H
#define FISHJAM_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct FishjamBuf {
  uint8_t *data;
  size_t len;
} FishjamBuf;

typedef void (*FishjamOnEvent)(void *user_data, const uint8_t *event, size_t event_len);

struct FishjamClient;

// Sends warn and error logs to Logcat on Android and the Xcode console on iOS.
void fishjam_install_logger(bool debug);

struct FishjamClient *fishjam_client_new(const uint8_t *config, size_t config_len, FishjamOnEvent on_event,
                                          void *user_data);

void fishjam_client_free(struct FishjamClient *client);

int32_t fishjam_client_call(struct FishjamClient *client, const uint8_t *req, size_t req_len, struct FishjamBuf *out);

void fishjam_buf_free(struct FishjamBuf buf);

#ifdef __cplusplus
}
#endif

#endif
