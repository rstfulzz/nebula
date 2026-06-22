//! Validation Registry: an agent's output is anchored by a `data_hash`; an
//! independent validator then publishes a pass/fail verdict and score against
//! that request. One response per request.

use odra::prelude::*;
use odra::prelude::Address;

#[odra::odra_error]
pub enum ValidationError {
    UnknownRequest = 21,
    AlreadyResponded = 22,
    ScoreOutOfRange = 23,
}

#[odra::odra_type]
pub struct Validation {
    pub agent_id: u64,
    pub requester: Address,
    pub data_hash: String,
    pub responded: bool,
    pub passed: bool,
    pub score: u8,
}

#[odra::event]
pub struct ValidationRequested {
    pub request_id: u64,
    pub agent_id: u64,
    pub requester: Address,
}

#[odra::event]
pub struct ValidationResponded {
    pub request_id: u64,
    pub passed: bool,
    pub score: u8,
}

#[odra::module(events = [ValidationRequested, ValidationResponded], errors = ValidationError)]
pub struct ValidationRegistry {
    total: Var<u64>,
    validations: Mapping<u64, Option<Validation>>,
}

#[odra::module]
impl ValidationRegistry {
    pub fn init(&mut self) {
        self.total.set(0);
    }

    /// Open a validation request anchoring an agent's output by `data_hash`.
    pub fn request_validation(&mut self, agent_id: u64, data_hash: String, _uri: String) -> u64 {
        let requester = self.env().caller();
        let request_id = self.total.get_or_default() + 1;
        self.total.set(request_id);
        self.validations.set(
            &request_id,
            Some(Validation { agent_id, requester, data_hash, responded: false, passed: false, score: 0 }),
        );
        self.env().emit_event(ValidationRequested { request_id, agent_id, requester });
        request_id
    }

    /// Publish a validator's verdict (pass/fail + 0..=100 score). One per request.
    pub fn respond_validation(&mut self, request_id: u64, passed: bool, score: u8, _uri: String) {
        if score > 100 {
            self.env().revert(ValidationError::ScoreOutOfRange);
        }
        let mut v = self
            .validations
            .get(&request_id)
            .flatten()
            .unwrap_or_revert_with(&self.env(), ValidationError::UnknownRequest);
        if v.responded {
            self.env().revert(ValidationError::AlreadyResponded);
        }
        v.responded = true;
        v.passed = passed;
        v.score = score;
        self.validations.set(&request_id, Some(v));
        self.env().emit_event(ValidationResponded { request_id, passed, score });
    }

    pub fn get_validation(&self, request_id: u64) -> Validation {
        self.validations
            .get(&request_id)
            .flatten()
            .unwrap_or_revert_with(&self.env(), ValidationError::UnknownRequest)
    }

    pub fn total_validations(&self) -> u64 {
        self.total.get_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, NoArgs};

    #[test]
    fn request_then_respond() {
        let env = odra_test::env();
        let mut reg = ValidationRegistry::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));
        let id = reg.request_validation(7, "0xhash".to_string(), "".to_string());
        assert_eq!(id, 1);
        reg.respond_validation(id, true, 95, "".to_string());
        let v = reg.get_validation(id);
        assert!(v.responded && v.passed);
        assert_eq!(v.score, 95);
        assert_eq!(v.agent_id, 7);
    }

    #[test]
    fn one_response_only() {
        let env = odra_test::env();
        let mut reg = ValidationRegistry::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));
        let id = reg.request_validation(7, "0xhash".to_string(), "".to_string());
        reg.respond_validation(id, true, 95, "".to_string());
        assert_eq!(
            reg.try_respond_validation(id, false, 10, "".to_string()).unwrap_err(),
            ValidationError::AlreadyResponded.into()
        );
    }
}
