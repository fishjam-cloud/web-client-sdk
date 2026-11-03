import java.io.File

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ktlint)
}

fun loadDotEnv(file: File): Map<String, String> {
    if (!file.exists()) {
        throw GradleException("Missing ${file.path}. Copy .env.example to .env.")
    }
    return file.readLines().mapNotNull { raw ->
        val line = raw.substringBefore("#").trim()
        if (line.isEmpty() || !line.contains("=")) {
            return@mapNotNull null
        }
        val key = line.substringBefore("=").trim()
        val value = line.substringAfter("=").trim().removeSurrounding("\"")
        key to value
    }.toMap()
}

fun fishjamEnvValue(name: String): String {
    val value = fishjamEnv[name]?.takeIf { it.isNotEmpty() }
        ?: throw GradleException("$name is missing from .env")
    val escaped = value.replace("\\", "\\\\").replace("\"", "\\\"")
    return "\"$escaped\""
}

val fishjamEnv = loadDotEnv(rootProject.file("../../.env"))

android {
    namespace = "io.fishjam.example"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.fishjam.example"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "FISHJAM_ID", fishjamEnvValue("FISHJAM_ID"))
        buildConfigField(
            "String",
            "FISHJAM_SDK_API_URL",
            fishjamEnvValue("FISHJAM_SDK_API_URL")
        )
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
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
}

dependencies {
    implementation(project(":client"))

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)
    implementation(libs.coroutines.android)

    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.test.runner)
    debugImplementation(libs.compose.ui.test.manifest)
}
