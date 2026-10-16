import com.google.protobuf.gradle.proto
import java.util.Properties

plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.protobuf)
    alias(libs.plugins.ktlint)
}

val ndkVersionName = "27.1.12297006"
val fishjamCoreAbis = mapOf(
    "arm64-v8a" to "aarch64-linux-android",
    "x86_64" to "x86_64-linux-android"
)
val fishjamCoreDir: File = projectDir.resolve("../../fishjam-core").canonicalFile

android {
    namespace = "io.fishjam.client"
    compileSdk = 35
    ndkVersion = ndkVersionName

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        ndk {
            abiFilters += fishjamCoreAbis.keys
        }
        externalNativeBuild {
            cmake {
                arguments += listOf(
                    "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON",
                    "-DFISHJAM_CORE_DIR=${fishjamCoreDir.absolutePath}"
                )
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    sourceSets {
        getByName("main") {
            proto {
                srcDir(fishjamCoreDir.resolve("proto"))
            }
        }
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

protobuf {
    protoc {
        artifact = "com.google.protobuf:protoc:${libs.versions.protobufRuntime.get()}"
    }
    generateProtoTasks {
        all().configureEach {
            builtins {
                register("java") { option("lite") }
                register("kotlin") { option("lite") }
            }
        }
    }
}

ktlint {
    android.set(true)
    outputToConsole.set(true)
    ignoreFailures.set(false)
    filter {
        exclude { it.file.path.contains("/build/") }
    }
}

dependencies {
    implementation(libs.protobuf.kotlin.lite)
    implementation(libs.coroutines.android)
    api(libs.serialization.json)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)

    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.core)
}

val buildFishjamCore = tasks.register<Exec>("buildFishjamCore") {
    group = "build"
    description = "Build libfishjam_core.a for every Android ABI with cargo-ndk."
    workingDir = fishjamCoreDir
    val sdkDir = file(localProperty("sdk.dir") ?: System.getenv("ANDROID_HOME") ?: error("ANDROID_HOME is not set"))
    environment("ANDROID_HOME", sdkDir.absolutePath)
    environment("ANDROID_NDK_HOME", sdkDir.resolve("ndk/$ndkVersionName").absolutePath)
    environment("CARGO_TARGET_DIR", fishjamCoreDir.resolve("target").absolutePath)
    val cargoBin = File(System.getProperty("user.home"), ".cargo/bin")
    environment("PATH", cargoBin.absolutePath + File.pathSeparator + System.getenv("PATH"))
    val targets = fishjamCoreAbis.keys.flatMap { listOf("-t", it) }
    commandLine(
        listOf(cargoBin.resolve("cargo").absolutePath, "ndk") + targets + listOf("-P", "24", "build", "--release")
    )
    inputs.dir(fishjamCoreDir.resolve("src"))
    inputs.dir(fishjamCoreDir.resolve("proto"))
    inputs.file(fishjamCoreDir.resolve("Cargo.toml"))
    inputs.file(fishjamCoreDir.resolve("Cargo.lock"))
    outputs.files(
        fishjamCoreAbis.values.map { fishjamCoreDir.resolve("target/$it/release/libfishjam_core.a") }
    )
}

tasks.configureEach {
    if (name.startsWith("configureCMake") || name.startsWith("buildCMake")) {
        dependsOn(buildFishjamCore)
    }
}

fun localProperty(name: String): String? {
    val propertiesFile = rootProject.file("local.properties")
    if (!propertiesFile.isFile) return null
    val values = Properties()
    propertiesFile.inputStream().use { values.load(it) }
    return values.getProperty(name)
}
