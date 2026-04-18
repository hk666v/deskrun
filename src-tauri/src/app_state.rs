use std::sync::{Arc, Mutex, MutexGuard};

use anyhow::Result;
use tauri::AppHandle;

use crate::storage::StorageState;

pub struct AppState {
    storage: Mutex<StorageState>,
}

pub type SharedState = Arc<AppState>;

impl AppState {
    pub fn new(app: &AppHandle) -> Result<SharedState> {
        Ok(Arc::new(Self {
            storage: Mutex::new(StorageState::load(app)?),
        }))
    }

    pub fn lock(&self) -> Result<MutexGuard<'_, StorageState>, String> {
        self.storage
            .lock()
            .map_err(|_| "failed to acquire launcher state".to_string())
    }
}
