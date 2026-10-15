cmake_minimum_required(VERSION 3.22.1)
project(fishjam_jni)

add_library(fishjam_jni SHARED fishjam_jni.cpp)

if(ANDROID_ABI STREQUAL "arm64-v8a")
    set(RUST_TARGET "aarch64-linux-android")
elseif(ANDROID_ABI STREQUAL "x86_64")
    set(RUST_TARGET "x86_64-linux-android")
else()
    message(FATAL_ERROR "Unsupported ABI ${ANDROID_ABI}")
endif()

set(CORE_LIB "${FISHJAM_CORE_DIR}/target/${RUST_TARGET}/release/libfishjam_core.a")

if(NOT EXISTS "${CORE_LIB}")
    message(FATAL_ERROR "missing ${CORE_LIB}")
endif()

target_include_directories(fishjam_jni PRIVATE "${FISHJAM_CORE_DIR}/include")
target_link_options(fishjam_jni PRIVATE "-Wl,-z,max-page-size=16384")
target_link_libraries(fishjam_jni "${CORE_LIB}" android log dl m)
