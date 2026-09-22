use std::collections::HashSet;
use std::collections::VecDeque;
use tokio::sync::Mutex;

use serde::{Deserialize, Serialize};

pub const MAX_MESSAGES: usize = 1_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedChatMessage {
    pub id: String,
    pub channel: String,
    pub username: String,
    pub display_name: String,
    pub message: String,
    pub timestamp_ms: u64,
    pub color: Option<String>,
    pub badges: Vec<String>,
    pub emotes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    Connected,
    Reconnecting,
    Disconnected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStateEvent {
    pub state: ConnectionState,
}

#[derive(Debug, Default, Clone)]
pub struct SubscriptionSet {
    pub grid_channels: HashSet<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwitchAuthInfo {
    pub access_token: String,
    pub refresh_token: String,
    pub username: String,
    pub user_id: String,
}

#[derive(Debug, Clone)]
pub struct OutboundIrcMessage {
    pub channel: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub authenticated: bool,
    pub username: Option<String>,
}

pub struct TwitchState {
    pub auth: Mutex<Option<TwitchAuthInfo>>,
    pub messages: Mutex<VecDeque<UnifiedChatMessage>>,
    pub subscriptions: Mutex<SubscriptionSet>,
    pub connection_state: Mutex<ConnectionState>,
    pub irc_shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub auth_abort_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub irc_outbound_tx: Mutex<Option<tokio::sync::mpsc::Sender<OutboundIrcMessage>>>,
    pub auth_refresh_lock: Mutex<()>,
}

impl TwitchState {
    pub fn new() -> Self {
        Self {
            auth: Mutex::new(None),
            messages: Mutex::new(VecDeque::new()),
            subscriptions: Mutex::new(SubscriptionSet::default()),
            connection_state: Mutex::new(ConnectionState::Disconnected),
            irc_shutdown_tx: Mutex::new(None),
            auth_abort_tx: Mutex::new(None),
            irc_outbound_tx: Mutex::new(None),
            auth_refresh_lock: Mutex::new(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn twitch_state_new_initializes_all_fields() {
        let state = TwitchState::new();

        // Check auth is None
        let auth = state.auth.try_lock().unwrap();
        assert!(auth.is_none());

        // Check messages is empty
        let messages = state.messages.try_lock().unwrap();
        assert!(messages.is_empty());

        // Check subscriptions is empty
        let subscriptions = state.subscriptions.try_lock().unwrap();
        assert!(subscriptions.grid_channels.is_empty());

        // Check connection_state is Disconnected
        let conn_state = state.connection_state.try_lock().unwrap();
        assert_eq!(*conn_state, ConnectionState::Disconnected);

        // Check channels are None
        assert!(state.irc_shutdown_tx.try_lock().unwrap().is_none());
        assert!(state.auth_abort_tx.try_lock().unwrap().is_none());
        assert!(state.irc_outbound_tx.try_lock().unwrap().is_none());

        // Check auth_refresh_lock is initialized
        let _lock = state.auth_refresh_lock.try_lock().unwrap();
    }

    #[test]
    fn twitch_auth_info_serialization_roundtrip() {
        let auth = TwitchAuthInfo {
            access_token: "access-token".to_string(),
            refresh_token: "refresh-token".to_string(),
            username: "testuser".to_string(),
            user_id: "12345".to_string(),
        };

        let json = serde_json::to_string(&auth).unwrap();
        let deserialized: TwitchAuthInfo = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.access_token, auth.access_token);
        assert_eq!(deserialized.refresh_token, auth.refresh_token);
        assert_eq!(deserialized.username, auth.username);
        assert_eq!(deserialized.user_id, auth.user_id);
    }

    #[test]
    fn twitch_auth_info_all_fields_present() {
        let json = r#"{
            "access_token": "atoken",
            "refresh_token": "rtoken",
            "username": "user",
            "user_id": "123"
        }"#;

        let auth: TwitchAuthInfo = serde_json::from_str(json).unwrap();

        assert_eq!(auth.access_token, "atoken");
        assert_eq!(auth.refresh_token, "rtoken");
        assert_eq!(auth.username, "user");
        assert_eq!(auth.user_id, "123");
    }

    #[test]
    fn unified_chat_message_serialization_roundtrip_full() {
        let msg = UnifiedChatMessage {
            id: "msg-123".to_string(),
            channel: "gaules".to_string(),
            username: "testuser".to_string(),
            display_name: "TestUser".to_string(),
            message: "Hello world!".to_string(),
            timestamp_ms: 1_700_000_000_000,
            color: Some("#1E90FF".to_string()),
            badges: vec!["moderator/1".to_string(), "subscriber/12".to_string()],
            emotes: Some("123:0-4".to_string()),
        };

        let json = serde_json::to_string(&msg).unwrap();
        let deserialized: UnifiedChatMessage = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, msg.id);
        assert_eq!(deserialized.channel, msg.channel);
        assert_eq!(deserialized.username, msg.username);
        assert_eq!(deserialized.display_name, msg.display_name);
        assert_eq!(deserialized.message, msg.message);
        assert_eq!(deserialized.timestamp_ms, msg.timestamp_ms);
        assert_eq!(deserialized.color, msg.color);
        assert_eq!(deserialized.badges, msg.badges);
        assert_eq!(deserialized.emotes, msg.emotes);
    }

    #[test]
    fn unified_chat_message_serialization_roundtrip_minimal() {
        let msg = UnifiedChatMessage {
            id: "msg-123".to_string(),
            channel: "gaules".to_string(),
            username: "testuser".to_string(),
            display_name: "TestUser".to_string(),
            message: "Hello!".to_string(),
            timestamp_ms: 1_700_000_000_000,
            color: None,
            badges: vec![],
            emotes: None,
        };

        let json = serde_json::to_string(&msg).unwrap();
        let deserialized: UnifiedChatMessage = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, msg.id);
        assert_eq!(deserialized.color, None);
        assert!(deserialized.badges.is_empty());
        assert_eq!(deserialized.emotes, None);
    }

    #[test]
    fn connection_state_serialization_all_variants() {
        let states = vec![
            ConnectionState::Connected,
            ConnectionState::Reconnecting,
            ConnectionState::Disconnected,
        ];

        for state in states {
            let json = serde_json::to_string(&state).unwrap();
            let deserialized: ConnectionState = serde_json::from_str(&json).unwrap();
            assert_eq!(deserialized, state);
        }
    }

    #[test]
    fn connection_state_snake_case_serialization() {
        let connected = serde_json::to_string(&ConnectionState::Connected).unwrap();
        let reconnecting = serde_json::to_string(&ConnectionState::Reconnecting).unwrap();
        let disconnected = serde_json::to_string(&ConnectionState::Disconnected).unwrap();

        assert_eq!(connected, "\"connected\"");
        assert_eq!(reconnecting, "\"reconnecting\"");
        assert_eq!(disconnected, "\"disconnected\"");
    }

    #[test]
    fn subscription_set_default_is_empty() {
        let subs = SubscriptionSet::default();
        assert!(subs.grid_channels.is_empty());
    }

    #[test]
    fn subscription_set_clone() {
        let mut subs = SubscriptionSet::default();
        subs.grid_channels.insert("gaules".to_string());
        subs.grid_channels.insert("casimito".to_string());

        let cloned = subs.clone();
        assert_eq!(cloned.grid_channels, subs.grid_channels);
    }

    #[test]
    fn subscription_set_debug() {
        let subs = SubscriptionSet::default();
        let debug_str = format!("{:?}", subs);
        assert!(debug_str.contains("SubscriptionSet"));
    }

    #[test]
    fn outbound_irc_message_construction() {
        let msg = OutboundIrcMessage {
            channel: "gaules".to_string(),
            text: "Hello world!".to_string(),
        };

        assert_eq!(msg.channel, "gaules");
        assert_eq!(msg.text, "Hello world!");
    }

    #[test]
    fn outbound_irc_message_clone() {
        let msg = OutboundIrcMessage {
            channel: "gaules".to_string(),
            text: "Hello!".to_string(),
        };

        let cloned = msg.clone();
        assert_eq!(cloned.channel, msg.channel);
        assert_eq!(cloned.text, msg.text);
    }

    #[test]
    fn outbound_irc_message_debug() {
        let msg = OutboundIrcMessage {
            channel: "gaules".to_string(),
            text: "Hello!".to_string(),
        };

        let debug_str = format!("{:?}", msg);
        assert!(debug_str.contains("gaules"));
        assert!(debug_str.contains("Hello"));
    }

    #[test]
    fn auth_state_serialization_authenticated() {
        let auth_state = AuthState {
            authenticated: true,
            username: Some("testuser".to_string()),
        };

        let json = serde_json::to_string(&auth_state).unwrap();
        let deserialized: AuthState = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.authenticated, true);
        assert_eq!(deserialized.username, Some("testuser".to_string()));
    }

    #[test]
    fn auth_state_serialization_unauthenticated() {
        let auth_state = AuthState {
            authenticated: false,
            username: None,
        };

        let json = serde_json::to_string(&auth_state).unwrap();
        let deserialized: AuthState = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.authenticated, false);
        assert_eq!(deserialized.username, None);
    }

    #[test]
    fn auth_state_debug() {
        let auth_state = AuthState {
            authenticated: true,
            username: Some("testuser".to_string()),
        };

        let debug_str = format!("{:?}", auth_state);
        assert!(debug_str.contains("AuthState"));
        assert!(debug_str.contains("testuser"));
    }

    #[test]
    fn max_messages_constant() {
        assert_eq!(MAX_MESSAGES, 1_000);
    }
}
