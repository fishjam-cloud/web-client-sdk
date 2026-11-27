cmake_minimum_required(VERSION 3.22.1)
project(fishjam_custom_video)

add_library(fishjam_custom_video SHARED custom_video_gl.cpp)

target_compile_features(fishjam_custom_video PRIVATE cxx_std_17)

# Android 15+ devices can use 16 KB memory pages.
target_link_options(fishjam_custom_video PRIVATE "-Wl,-z,max-page-size=16384")

target_link_libraries(fishjam_custom_video
    EGL
    GLESv2
    android
    log
    dl
)
