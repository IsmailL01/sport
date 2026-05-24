# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# === Phase 7 Plan 07-01 Task 3 additions per RESEARCH §4 ===
# Namespaces verified against installed node_modules @ 2026-05-21:
#   @rnmapbox/maps@10.3.x    → com.rnmapbox.rnmbx (+ ships its own proguard-rules.pro;
#                              the explicit -keep below is redundant-but-harmless)
#   react-native-mmkv@4.3.x  → com.margelo.nitro.mmkv (Nitro Modules; NOT mrousavy)
#   expo-task-manager@14.0.x → expo.modules.taskManager (camelCase 'M')
#   expo-location@19.0.x     → expo.modules.location

# Mapbox SDK (@rnmapbox/maps@10.3.x — JNI bindings + reflection-based style loading)
-keep class com.mapbox.** { *; }
-keep interface com.mapbox.** { *; }
-dontwarn com.mapbox.**
# @rnmapbox/maps native bridge
-keep class com.rnmapbox.rnmbx.** { *; }
-keep interface com.rnmapbox.rnmbx.** { *; }
-dontwarn com.rnmapbox.rnmbx.**

# MMKV (react-native-mmkv@4.x — Nitro Modules; C++ JNI via JSI)
# Verified actual namespace via grep: package com.margelo.nitro.mmkv
-keep class com.margelo.nitro.mmkv.** { *; }
-keep class com.margelo.nitro.** { *; }
# Defensive — older/upstream MMKV namespaces (harmless if absent):
-keep class com.mrousavy.mmkv.** { *; }
-keep class com.tencent.mmkv.** { *; }
-dontwarn com.margelo.nitro.**

# expo-task-manager — verified package = expo.modules.taskManager (camelCase M)
-keep class expo.modules.taskManager.** { *; }
# Broader expo.modules.** keep — covers all Expo SDK 54 modules; safer for closed beta
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# expo-location (foreground service for tracker pipeline)
-keep class expo.modules.location.** { *; }

# Hermes JS engine + JNI
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.core.** { *; }
-keep class com.facebook.proguard.annotations.** { *; }
-keepclasseswithmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
-keepclasseswithmembers class * {
    @com.facebook.proguard.annotations.KeepGettersAndSetters *;
}

