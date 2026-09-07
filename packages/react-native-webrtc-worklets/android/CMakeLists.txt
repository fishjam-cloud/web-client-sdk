cmake_minimum_required(VERSION 3.22.1)

project(fishjam_webrtc_worklets)

# Shared C++ (the JSI consumer, the frame queue and the frame host object) lives
# one directory up, next to the iOS module. FISHJAM_WEBRTC_DIR and
# REACT_NATIVE_DIR are passed from build.gradle after resolving the packages the
# way Metro does.
set(FJ_WORKLETS_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../cpp")
get_filename_component(FJ_WORKLETS_CPP_DIR "${FJ_WORKLETS_CPP_DIR}" ABSOLUTE)

if(NOT DEFINED FISHJAM_WEBRTC_DIR)
    message(FATAL_ERROR "FISHJAM_WEBRTC_DIR must point at @fishjam-cloud/react-native-webrtc")
endif()
if(NOT DEFINED REACT_NATIVE_DIR)
    message(FATAL_ERROR "REACT_NATIVE_DIR must point at react-native")
endif()

include("${REACT_NATIVE_DIR}/ReactCommon/cmake-utils/react-native-flags.cmake")

find_package(ReactAndroid REQUIRED CONFIG)
find_package(fbjni REQUIRED CONFIG)
find_package(react-native-worklets REQUIRED CONFIG)

# Loaded from Java via System.loadLibrary("fishjam-webrtc-worklets") by
# FJWorkletsInstaller.
add_library(fishjam-webrtc-worklets
    SHARED
    "${FJ_WORKLETS_CPP_DIR}/FJCameraFrameHostObject.cpp"
    "${FJ_WORKLETS_CPP_DIR}/FJFrameCallbackConsumer.cpp"
    "${FJ_WORKLETS_CPP_DIR}/FJWorkletsJSI.cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/src/main/cpp/FJWorkletsInstaller.cpp"
)

set_target_properties(fishjam-webrtc-worklets PROPERTIES
    CXX_STANDARD 20
    CXX_STANDARD_REQUIRED ON
)

# -frtti and -fexceptions: the worklets headers and jsi::JSError need them.
target_compile_reactnative_options(fishjam-webrtc-worklets PRIVATE)

target_include_directories(fishjam-webrtc-worklets
    PRIVATE
    "${FJ_WORKLETS_CPP_DIR}"
    "${FISHJAM_WEBRTC_DIR}/common/cpp/fishjam-video/public"
)

target_link_libraries(fishjam-webrtc-worklets
    ReactAndroid::jsi
    ReactAndroid::reactnative
    fbjni::fbjni
    react-native-worklets::worklets
    android
    log
)
