//! Porti Pocket: a capped NEAR spending account for USSD payments.
//!
//! Authority levels:
//! - Porti AI proposes only; it has no key here.
//! - The pocket itself (the Porti server, through a function-call key limited
//!   to `send` and `freeze`) can spend only within per-transaction and daily
//!   caps enforced below, and can freeze.
//! - The owner (the user's main wallet) can withdraw, unfreeze and change
//!   limits. Owner methods require 1 yoctoNEAR, so they need a full-access
//!   key: dapp function-call keys can't attach a deposit.

use near_sdk::serde_json::json;
use near_sdk::{
    assert_one_yocto, env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
};

pub const NANOS_PER_DAY: u64 = 86_400 * 1_000_000_000;
/// Balance kept back for gas spent by the server's function-call key.
pub const GAS_RESERVE: NearToken = NearToken::from_millinear(50);
const CALLBACK_GAS: Gas = Gas::from_tgas(5);
const EVENT_STANDARD: &str = "porti_pocket";
const EVENT_VERSION: &str = "1.0.0";

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Pocket {
    owner_id: AccountId,
    per_tx_cap: NearToken,
    daily_cap: NearToken,
    spent_today: NearToken,
    day_index: u64,
    frozen: bool,
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub struct PocketView {
    pub owner_id: AccountId,
    pub per_tx_cap: NearToken,
    pub daily_cap: NearToken,
    pub spent_today: NearToken,
    pub remaining_today: NearToken,
    pub available_balance: NearToken,
    pub day_index: u64,
    pub frozen: bool,
}

fn current_day() -> u64 {
    env::block_timestamp() / NANOS_PER_DAY
}

fn validate_limits(per_tx_cap: NearToken, daily_cap: NearToken) {
    require!(!per_tx_cap.is_zero(), "per_tx_cap must be positive");
    require!(
        per_tx_cap <= daily_cap,
        "per_tx_cap cannot exceed daily_cap"
    );
}

fn emit(event: &str, data: near_sdk::serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": EVENT_STANDARD, "version": EVENT_VERSION, "event": event, "data": [data]})
    ));
}

#[near]
impl Pocket {
    /// Must be called by the pocket itself or its parent account (the account
    /// that created `pocket.<parent>`), normally in the same batch transaction
    /// that deploys the contract, so nobody else can claim ownership.
    #[init]
    pub fn new(owner_id: AccountId, per_tx_cap: NearToken, daily_cap: NearToken) -> Self {
        let caller = env::predecessor_account_id();
        let me = env::current_account_id();
        let is_parent = me.as_str().ends_with(&format!(".{}", caller.as_str()));
        require!(
            caller == me || is_parent,
            "Only the pocket or its parent account can initialize"
        );
        validate_limits(per_tx_cap, daily_cap);
        Self {
            owner_id,
            per_tx_cap,
            daily_cap,
            spent_today: NearToken::from_yoctonear(0),
            day_index: current_day(),
            frozen: false,
        }
    }

    // ---- Pocket-key methods (server, via function-call key) ----

    pub fn send(&mut self, receiver_id: AccountId, amount: NearToken) -> Promise {
        self.assert_self();
        require!(!self.frozen, "Pocket is frozen");
        require!(!amount.is_zero(), "Amount must be positive");
        require!(
            receiver_id != env::current_account_id(),
            "Cannot send to the pocket itself"
        );
        require!(
            amount <= self.per_tx_cap,
            "Amount exceeds per-transaction cap"
        );
        self.roll_day();
        let spent = self.spent_today.saturating_add(amount);
        require!(
            spent <= self.daily_cap,
            "Amount exceeds remaining daily cap"
        );
        require!(
            amount <= self.available_balance(),
            "Insufficient pocket balance"
        );
        self.spent_today = spent;
        emit(
            "send",
            json!({"receiver_id": receiver_id, "amount": amount, "day_index": self.day_index}),
        );
        Promise::new(receiver_id.clone()).transfer(amount).then(
            Self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_send(receiver_id, amount, self.day_index),
        )
    }

    /// Rolls back the daily spend if the transfer failed (for example, the
    /// receiver doesn't exist); the refund returns to the pocket.
    #[private]
    pub fn on_send(&mut self, receiver_id: AccountId, amount: NearToken, day_index: u64) -> bool {
        // A plain transfer returns no value, so a zero-length bound is enough.
        let ok = env::promise_result_checked(0, 0).is_ok();
        if !ok {
            if day_index == self.day_index {
                self.spent_today = self.spent_today.saturating_sub(amount);
            }
            emit(
                "send_failed",
                json!({"receiver_id": receiver_id, "amount": amount, "day_index": day_index}),
            );
        }
        ok
    }

    /// The pocket (USSD) or the owner can freeze. Only the owner can unfreeze.
    pub fn freeze(&mut self) {
        let caller = env::predecessor_account_id();
        require!(
            caller == env::current_account_id() || caller == self.owner_id,
            "Only the pocket or its owner can freeze"
        );
        self.frozen = true;
        emit("freeze", json!({"by": caller}));
    }

    // ---- Owner methods (main wallet, full-access key) ----

    #[payable]
    pub fn unfreeze(&mut self) {
        self.assert_owner();
        self.frozen = false;
        emit("unfreeze", json!({}));
    }

    #[payable]
    pub fn set_limits(&mut self, per_tx_cap: NearToken, daily_cap: NearToken) {
        self.assert_owner();
        validate_limits(per_tx_cap, daily_cap);
        self.per_tx_cap = per_tx_cap;
        self.daily_cap = daily_cap;
        emit(
            "set_limits",
            json!({"per_tx_cap": per_tx_cap, "daily_cap": daily_cap}),
        );
    }

    /// Withdraws to the owner; works while frozen. Omit `amount` to withdraw
    /// everything above storage and the gas reserve.
    #[payable]
    pub fn withdraw(&mut self, amount: Option<NearToken>) -> Promise {
        self.assert_owner();
        let available = self.available_balance();
        let amount = amount.unwrap_or(available);
        require!(!amount.is_zero(), "Nothing to withdraw");
        require!(amount <= available, "Insufficient pocket balance");
        emit("withdraw", json!({"amount": amount}));
        Promise::new(self.owner_id.clone()).transfer(amount)
    }

    // ---- Views ----

    pub fn get_pocket(&self) -> PocketView {
        let today = current_day();
        let spent = if today == self.day_index {
            self.spent_today
        } else {
            NearToken::from_yoctonear(0)
        };
        PocketView {
            owner_id: self.owner_id.clone(),
            per_tx_cap: self.per_tx_cap,
            daily_cap: self.daily_cap,
            spent_today: spent,
            remaining_today: self.daily_cap.saturating_sub(spent),
            available_balance: self.available_balance(),
            day_index: today,
            frozen: self.frozen,
        }
    }
}

impl Pocket {
    fn assert_self(&self) {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Only the pocket's own key can call this"
        );
    }

    fn assert_owner(&self) {
        assert_one_yocto();
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the owner can call this"
        );
    }

    fn roll_day(&mut self) {
        let today = current_day();
        if today != self.day_index {
            self.day_index = today;
            self.spent_today = NearToken::from_yoctonear(0);
        }
    }

    /// Balance that can leave the account: total minus storage staking and
    /// the gas reserve for the pocket key.
    fn available_balance(&self) -> NearToken {
        let storage = env::storage_byte_cost().saturating_mul(env::storage_usage() as u128);
        env::account_balance()
            .saturating_sub(storage)
            .saturating_sub(GAS_RESERVE)
    }
}

#[cfg(test)]
mod tests;
