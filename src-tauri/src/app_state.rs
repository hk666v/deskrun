use std::sync::{Arc, Mutex, MutexGuard};

use anyhow::Result;
use tauri::AppHandle;

use crate::storage::StorageState;

pub struct AppState {
    storage: Mutex<StorageState>,
    startup_warning: Mutex<Option<String>>,
}

pub type SharedState = Arc<AppState>;

impl AppState {
    pub fn new(app: &AppHandle) -> Result<SharedState> {
        Ok(Arc::new(Self {
            storage: Mutex::new(StorageState::load(app)?),
            startup_warning: Mutex::new(None),
        }))
    }

    /// Recovers the guard from a poisoned mutex rather than failing. A panic
    /// while holding the lock used to brick every later command, leaving the
    /// user with a launcher that silently refuses to save anything; the data
    /// itself is still consistent because every write goes through
    /// `persist_items`/`persist_settings`.
    pub fn lock(&self) -> Result<MutexGuard<'_, StorageState>, String> {
        Ok(self
            .storage
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()))
    }

    /// Records a non-fatal problem from startup so the UI can surface it. The
    /// main case is the global hotkey being owned by another program: the app
    /// runs fine, but `Alt+Space` does nothing and the user deserves to know why.
    pub fn set_startup_warning(&self, message: String) {
        if let Ok(mut slot) = self.startup_warning.lock() {
            *slot = Some(message);
        }
    }

    pub fn startup_warning(&self) -> Option<String> {
        self.startup_warning
            .lock()
            .ok()
            .and_then(|slot| slot.clone())
    }
}
