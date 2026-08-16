use std::env;
use std::path::PathBuf;
use std::fs;

fn main() {
    // Tell Cargo to look for the native library in the `native` folder
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let native_path = PathBuf::from(&manifest_dir).join("native");
    
    println!("cargo:rustc-link-search=native={}", native_path.display());
    println!("cargo:rustc-link-lib=bass");
    println!("cargo:rerun-if-changed=native");

    // Copy bass.dll to the executable target directory for runtime libloading
    if let Ok(out_dir) = env::var("OUT_DIR") {
        let mut target_dir = PathBuf::from(out_dir);
        // OUT_DIR is like target/debug/build/project-audio-xxxx/out
        // Navigate up 3 levels to get to target/debug (where the .exe is)
        target_dir.pop();
        target_dir.pop();
        target_dir.pop();
        
        if let Ok(entries) = fs::read_dir(&native_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("dll") {
                    let dll_dest = target_dir.join(path.file_name().unwrap());
                    let _ = fs::copy(&path, &dll_dest);
                    println!("cargo:warning=Copied {} to {}", path.display(), dll_dest.display());
                    println!("cargo:rerun-if-changed={}", path.display());
                }
            }
        }
    }

    tauri_build::build();
}
