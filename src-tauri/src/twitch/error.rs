use thiserror::Error;

#[derive(Debug, Error)]
pub enum TwitchError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("WebSocket error: {0}")]
    WebSocket(String),

    #[error("OAuth error: {0}")]
    OAuth(String),

    #[error("Token storage error: {0}")]
    Storage(String),

    #[error("Token refresh failed")]
    TokenRefreshFailed,
}

impl serde::Serialize for TwitchError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
