pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://www.jitpack.io") }
    }
    versionCatalogs {
        create("libs") {
            from(files("../../packages/android-client/gradle/libs.versions.toml"))
        }
    }
}

rootProject.name = "android-client-example"
include(":app")
include(":client")
project(":client").projectDir = file("../../packages/android-client/client")
