-keep class io.fishjam.client.PermissionRequestActivity { *; }

# UniFFI calls the core through JNA, which finds classes and fields by name.
-keep class com.sun.jna.** { *; }
-keep class * extends com.sun.jna.** { *; }
-dontwarn java.awt.**
-keep class uniffi.fishjam_core.** { *; }
-keep class io.fishjam.client.CustomVideoNative { *; }
