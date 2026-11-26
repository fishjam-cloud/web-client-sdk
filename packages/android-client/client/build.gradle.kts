import java.util.Properties

plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.kotlin.compose)
}

val ndkVersionName = "27.1.12297006"
val fishjamCoreAbis = mapOf(
    "arm64-v8a" to "aarch64-linux-android",
    "x86_64" to "x86_64-linux-android"
)
val fishjamCoreDir: File = projectDir.resolve("../../fishjam-core").canonicalFile
val fishjamJniLibsDir: File = layout.buildDirectory.dir("generated/fishjamCore/jniLibs").get().asFile
val uniffiKotlinDir: File = layout.buildDirectory.dir("generated/uniffi/kotlin").get().asFile

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
                arguments += listOf("-DANDROID_STL=c++_shared")
            }
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets {
        getByName("main") {
            jniLibs.srcDir(fishjamJniLibsDir)
            java.srcDir(uniffiKotlinDir)
        }
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }

    buildFeatures {
        compose = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
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
    implementation(libs.jna) {
        artifact {
            name = "jna"
            type = "aar"
        }
    }
    implementation(libs.coroutines.android)
    api(libs.serialization.json)
    api(libs.webrtc)
    implementation(libs.core.telecom)
    implementation(libs.androidx.core)
    implementation(libs.firebase.messaging)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.activity)

    testImplementation(libs.junit)
    testImplementation(libs.jna)
    testImplementation(libs.coroutines.test)

    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.core)
}

fun Exec.cargoEnvironment(): File {
    workingDir = fishjamCoreDir
    environment("CARGO_TARGET_DIR", fishjamCoreDir.resolve("target").absolutePath)
    val cargoBin = File(System.getProperty("user.home"), ".cargo/bin")
    environment("PATH", cargoBin.absolutePath + File.pathSeparator + System.getenv("PATH"))
    inputs.dir(fishjamCoreDir.resolve("src"))
    inputs.file(fishjamCoreDir.resolve("Cargo.toml"))
    inputs.file(fishjamCoreDir.resolve("Cargo.lock"))
    return cargoBin.resolve("cargo")
}

val buildFishjamCore = tasks.register<Exec>("buildFishjamCore") {
    group = "build"
    description = "Build libfishjam_core.so for every Android ABI with cargo-ndk."
    val cargo = cargoEnvironment()
    val sdkDir = file(localProperty("sdk.dir") ?: System.getenv("ANDROID_HOME") ?: error("ANDROID_HOME is not set"))
    environment("ANDROID_HOME", sdkDir.absolutePath)
    environment("ANDROID_NDK_HOME", sdkDir.resolve("ndk/$ndkVersionName").absolutePath)
    // Android 15+ devices can use 16 KB memory pages; the library must be aligned for them.
    fishjamCoreAbis.values.forEach { target ->
        val key = target.uppercase().replace('-', '_')
        environment("CARGO_TARGET_${key}_RUSTFLAGS", "-C link-arg=-Wl,-z,max-page-size=16384")
    }
    val targets = fishjamCoreAbis.keys.flatMap { listOf("-t", it) }
    commandLine(
        listOf(cargo.absolutePath, "ndk") + targets +
            listOf("-P", "24", "-o", fishjamJniLibsDir.absolutePath, "build", "--release", "--lib")
    )
    outputs.dir(fishjamJniLibsDir)
}

val generateUniffiBindings = tasks.register<Exec>("generateUniffiBindings") {
    group = "build"
    description = "Generate the Kotlin bindings for libfishjam_core with uniffi-bindgen."
    dependsOn(buildFishjamCore)
    val cargo = cargoEnvironment()
    val library = fishjamJniLibsDir.resolve("arm64-v8a/libfishjam_core.so")
    inputs.file(library)
    commandLine(
        cargo.absolutePath, "run", "--features", "bindgen", "--bin", "uniffi-bindgen", "--",
        "generate", "--library", library.absolutePath,
        "--language", "kotlin", "--no-format", "--out-dir", uniffiKotlinDir.absolutePath
    )
    outputs.dir(uniffiKotlinDir)
}

tasks.configureEach {
    if (name.startsWith("merge") && name.endsWith("JniLibFolders")) {
        dependsOn(buildFishjamCore)
    }
    if (name.startsWith("compile") && name.contains("Kotlin") || name.startsWith("runKtlint")) {
        dependsOn(generateUniffiBindings)
    }
}

fun localProperty(name: String): String? {
    val propertiesFile = rootProject.file("local.properties")
    if (!propertiesFile.isFile) return null
    val values = Properties()
    propertiesFile.inputStream().use { values.load(it) }
    return values.getProperty(name)
}
