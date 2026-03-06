use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};
use tokio::process::Command;
use crate::cli::CommandChild;

#[derive(Clone)]
pub struct BridgeState(pub Arc<Mutex<Option<CommandChild>>>);

#[tauri::command]
#[specta::specta]
pub async fn start_browser_bridge(
    state: State<'_, BridgeState>,
    cdp_port: u16,
    ws_port: u16,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("Failed to lock state: {}", e))?;
    
    if guard.is_some() {
        return Err("Bridge already running".to_string());
    }

    let mut cmd = Command::new("node");
    cmd.arg("packages/desktop/scripts/screencast-bridge.mjs")
        .arg("--cdp-port")
        .arg(cdp_port.to_string())
        .arg("--ws-port")
        .arg(ws_port.to_string());

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn bridge: {}", e))?;
    let pid = child.id().ok_or("Failed to get child PID")?;

    let (tx, mut rx) = tokio::sync::mpsc::channel(1);
    let mut child = child;

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = child.wait() => {
                    tracing::info!("Bridge process exited");
                    break;
                }
                _ = rx.recv() => {
                    tracing::info!("Killing bridge process");
                    let _ = child.kill().await;
                    break;
                }
            }
        }
    });

    let cmd_child = CommandChild::new(tx);

    *guard = Some(cmd_child);
    tracing::info!(pid, "Bridge started");
    
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn stop_browser_bridge(state: State<'_, BridgeState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("Failed to lock state: {}", e))?;

    if let Some(child) = guard.take() {
        child.kill().map_err(|e| format!("Failed to kill bridge: {}", e))?;
        tracing::info!("Bridge stopped");
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_bridge_status(state: State<'_, BridgeState>) -> bool {
    state
        .0
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

pub async fn kill_bridge(app: AppHandle) {
    if let Ok(state) = app.try_state::<BridgeState>() {
        let _ = stop_browser_bridge(state).await;
    }
}
