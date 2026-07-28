fn main() {
    tauri_build::build();

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=src/macos_helper.m");
        cc::Build::new()
            .file("src/macos_helper.m")
            .flag("-fobjc-arc")
            .compile("onetouch_macos_helper");

        for framework in [
            "AppKit",
            "ApplicationServices",
            "CoreFoundation",
            "CoreGraphics",
            "Foundation",
            "IOBluetooth",
            "Intents",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
    }
}
