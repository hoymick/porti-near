use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{test_vm_config, testing_env, PromiseResult, RuntimeFeesConfig};

const DAY0: u64 = 20_000 * NANOS_PER_DAY;

fn pocket() -> AccountId {
    "pocket.alice.near".parse().unwrap()
}
fn owner() -> AccountId {
    "alice.near".parse().unwrap()
}
fn stranger() -> AccountId {
    "mallory.near".parse().unwrap()
}
fn bob() -> AccountId {
    "bob.near".parse().unwrap()
}
fn near(milli: u128) -> NearToken {
    NearToken::from_millinear(milli)
}

fn ctx(caller: AccountId, deposit: NearToken, now: u64) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(pocket())
        .predecessor_account_id(caller.clone())
        .signer_account_id(caller)
        .attached_deposit(deposit)
        .account_balance(NearToken::from_near(1))
        .storage_usage(1_000)
        .block_timestamp(now);
    b
}

fn set(caller: AccountId, deposit: NearToken, now: u64) {
    testing_env!(ctx(caller, deposit, now).build());
}

/// 1 NEAR balance, per-tx cap 0.1, daily cap 0.3 (the demo pocket).
fn setup() -> Pocket {
    set(owner(), NearToken::from_yoctonear(0), DAY0);
    Pocket::new(owner(), near(100), near(300))
}

fn as_pocket(now: u64) {
    set(pocket(), NearToken::from_yoctonear(0), now);
}
fn as_owner() {
    set(owner(), NearToken::from_yoctonear(1), DAY0);
}

#[test]
fn init_by_parent_or_self() {
    let p = setup();
    assert_eq!(p.get_pocket().owner_id, owner());
    as_pocket(DAY0);
    Pocket::new(owner(), near(100), near(300));
}

#[test]
#[should_panic(expected = "Only the pocket or its parent account can initialize")]
fn init_by_stranger_fails() {
    set(stranger(), NearToken::from_yoctonear(0), DAY0);
    Pocket::new(stranger(), near(100), near(300));
}

#[test]
#[should_panic(expected = "Only the pocket or its parent account can initialize")]
fn init_by_lookalike_parent_fails() {
    // "lice.near" is a string suffix of "alice.near" but not the parent.
    set(
        "lice.near".parse().unwrap(),
        NearToken::from_yoctonear(0),
        DAY0,
    );
    Pocket::new(owner(), near(100), near(300));
}

#[test]
#[should_panic(expected = "per_tx_cap cannot exceed daily_cap")]
fn init_rejects_inverted_caps() {
    set(owner(), NearToken::from_yoctonear(0), DAY0);
    Pocket::new(owner(), near(300), near(100));
}

#[test]
fn send_within_caps_records_spend_and_event() {
    let mut p = setup();
    as_pocket(DAY0);
    let _ = p.send(bob(), near(50));
    let v = p.get_pocket();
    assert_eq!(v.spent_today, near(50));
    assert_eq!(v.remaining_today, near(250));
    let logs = get_logs();
    assert!(logs[0].starts_with("EVENT_JSON:"));
    assert!(logs[0].contains("\"event\":\"send\""));
    assert!(logs[0].contains("bob.near"));
}

#[test]
#[should_panic(expected = "Amount exceeds per-transaction cap")]
fn send_over_per_tx_cap_fails() {
    let mut p = setup();
    as_pocket(DAY0);
    let _ = p.send(bob(), near(101));
}

#[test]
#[should_panic(expected = "Amount exceeds remaining daily cap")]
fn send_over_daily_cap_fails() {
    let mut p = setup();
    as_pocket(DAY0);
    for _ in 0..3 {
        let _ = p.send(bob(), near(100));
    }
    let _ = p.send(bob(), near(1));
}

#[test]
fn daily_cap_resets_on_next_utc_day() {
    let mut p = setup();
    as_pocket(DAY0 + NANOS_PER_DAY - 1);
    for _ in 0..3 {
        let _ = p.send(bob(), near(100));
    }
    assert_eq!(p.get_pocket().remaining_today, near(0));
    as_pocket(DAY0 + NANOS_PER_DAY);
    assert_eq!(p.get_pocket().remaining_today, near(300), "view rolls over");
    let _ = p.send(bob(), near(100));
    assert_eq!(p.get_pocket().spent_today, near(100));
}

#[test]
#[should_panic(expected = "Only the pocket's own key can call this")]
fn send_by_owner_fails() {
    let mut p = setup();
    set(owner(), NearToken::from_yoctonear(0), DAY0);
    let _ = p.send(bob(), near(10));
}

#[test]
#[should_panic(expected = "Only the pocket's own key can call this")]
fn send_by_stranger_fails() {
    let mut p = setup();
    set(stranger(), NearToken::from_yoctonear(0), DAY0);
    let _ = p.send(bob(), near(10));
}

#[test]
#[should_panic(expected = "Insufficient pocket balance")]
fn send_cannot_touch_storage_or_gas_reserve() {
    let mut p = setup();
    p.set_limits_unchecked(near(2000), near(2000));
    as_pocket(DAY0);
    let _ = p.send(bob(), near(1000)); // whole balance, ignoring reserves
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn send_zero_fails() {
    let mut p = setup();
    as_pocket(DAY0);
    let _ = p.send(bob(), near(0));
}

#[test]
#[should_panic(expected = "Pocket is frozen")]
fn frozen_pocket_cannot_send() {
    let mut p = setup();
    as_pocket(DAY0);
    p.freeze();
    let _ = p.send(bob(), near(10));
}

#[test]
fn owner_can_freeze_and_unfreeze() {
    let mut p = setup();
    set(owner(), NearToken::from_yoctonear(0), DAY0);
    p.freeze();
    assert!(p.get_pocket().frozen);
    as_owner();
    p.unfreeze();
    assert!(!p.get_pocket().frozen);
}

#[test]
#[should_panic(expected = "Only the pocket or its owner can freeze")]
fn stranger_cannot_freeze() {
    let mut p = setup();
    set(stranger(), NearToken::from_yoctonear(0), DAY0);
    p.freeze();
}

#[test]
#[should_panic(expected = "Only the owner can call this")]
fn pocket_key_cannot_unfreeze() {
    let mut p = setup();
    as_pocket(DAY0);
    p.freeze();
    set(pocket(), NearToken::from_yoctonear(1), DAY0);
    p.unfreeze();
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn owner_methods_need_full_access_key() {
    let mut p = setup();
    set(owner(), NearToken::from_yoctonear(0), DAY0);
    p.set_limits(near(50), near(100));
}

#[test]
fn owner_can_change_limits() {
    let mut p = setup();
    as_owner();
    p.set_limits(near(50), near(100));
    let v = p.get_pocket();
    assert_eq!((v.per_tx_cap, v.daily_cap), (near(50), near(100)));
}

#[test]
#[should_panic(expected = "Only the owner can call this")]
fn pocket_key_cannot_change_limits() {
    let mut p = setup();
    set(pocket(), NearToken::from_yoctonear(1), DAY0);
    p.set_limits(near(1000), near(1000));
}

#[test]
#[should_panic(expected = "Only the owner can call this")]
fn stranger_cannot_withdraw() {
    let mut p = setup();
    set(stranger(), NearToken::from_yoctonear(1), DAY0);
    let _ = p.withdraw(None);
}

#[test]
fn owner_can_withdraw_while_frozen() {
    let mut p = setup();
    as_pocket(DAY0);
    p.freeze();
    as_owner();
    let _ = p.withdraw(Some(near(500)));
    assert!(get_logs()[0].contains("\"event\":\"withdraw\""));
}

#[test]
#[should_panic(expected = "Insufficient pocket balance")]
fn withdraw_cannot_touch_reserves() {
    let mut p = setup();
    as_owner();
    let _ = p.withdraw(Some(NearToken::from_near(1)));
}

fn callback(result: PromiseResult, now: u64) {
    testing_env!(
        ctx(pocket(), NearToken::from_yoctonear(0), now).build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![result],
    );
}

#[test]
fn failed_transfer_rolls_back_daily_spend() {
    let mut p = setup();
    as_pocket(DAY0);
    let _ = p.send(bob(), near(100));
    callback(PromiseResult::Failed, DAY0);
    assert!(!p.on_send(bob(), near(100), p.day_index));
    assert_eq!(p.get_pocket().spent_today, near(0));
    assert!(get_logs()[0].contains("\"event\":\"send_failed\""));
}

#[test]
fn successful_transfer_keeps_daily_spend() {
    let mut p = setup();
    as_pocket(DAY0);
    let _ = p.send(bob(), near(100));
    callback(PromiseResult::Successful(vec![]), DAY0);
    assert!(p.on_send(bob(), near(100), p.day_index));
    assert_eq!(p.get_pocket().spent_today, near(100));
}

#[test]
fn late_failure_from_previous_day_does_not_credit_today() {
    let mut p = setup();
    as_pocket(DAY0);
    let _ = p.send(bob(), near(100));
    let old_day = p.day_index;
    as_pocket(DAY0 + NANOS_PER_DAY);
    let _ = p.send(bob(), near(100));
    callback(PromiseResult::Failed, DAY0 + NANOS_PER_DAY);
    p.on_send(bob(), near(100), old_day);
    assert_eq!(p.get_pocket().spent_today, near(100));
}

impl Pocket {
    fn set_limits_unchecked(&mut self, per_tx: NearToken, daily: NearToken) {
        self.per_tx_cap = per_tx;
        self.daily_cap = daily;
    }
}
