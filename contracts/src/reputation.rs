//! Reputation Registry: records feedback (a 0..=100 score + tag) about an agent
//! and exposes the running count and average. Application logic and payments stay
//! off-chain; only the aggregate trust signal is anchored.

use odra::prelude::*;
use odra::prelude::Address;

#[odra::odra_error]
pub enum ReputationError {
    ScoreOutOfRange = 11,
}

#[odra::event]
pub struct FeedbackGiven {
    pub agent_id: u64,
    pub author: Address,
    pub score: u8,
    pub tag: String,
}

#[odra::module(events = [FeedbackGiven], errors = ReputationError)]
pub struct ReputationRegistry {
    feedback_count: Mapping<u64, u64>,
    score_sum: Mapping<u64, u64>,
}

#[odra::module]
impl ReputationRegistry {
    pub fn init(&mut self) {}

    /// Record feedback about an agent. `score` is 0..=100; `tag`/`uri` describe it.
    pub fn give_feedback(&mut self, agent_id: u64, score: u8, tag: String, _uri: String) {
        if score > 100 {
            self.env().revert(ReputationError::ScoreOutOfRange);
        }
        let author = self.env().caller();
        self.feedback_count
            .set(&agent_id, self.feedback_count.get_or_default(&agent_id) + 1);
        self.score_sum
            .set(&agent_id, self.score_sum.get_or_default(&agent_id) + score as u64);
        self.env().emit_event(FeedbackGiven { agent_id, author, score, tag });
    }

    /// Returns `(count, average)` where average is 0 when there is no feedback.
    pub fn reputation(&self, agent_id: u64) -> (u64, u64) {
        let count = self.feedback_count.get_or_default(&agent_id);
        let average = if count == 0 {
            0
        } else {
            self.score_sum.get_or_default(&agent_id) / count
        };
        (count, average)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, NoArgs};

    #[test]
    fn averages_feedback() {
        let env = odra_test::env();
        let mut reg = ReputationRegistry::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));
        reg.give_feedback(1, 80, "speed".to_string(), "".to_string());
        reg.give_feedback(1, 100, "accuracy".to_string(), "".to_string());
        assert_eq!(reg.reputation(1), (2, 90));
        assert_eq!(reg.reputation(2), (0, 0));
    }

    #[test]
    fn rejects_out_of_range_score() {
        let env = odra_test::env();
        let mut reg = ReputationRegistry::deploy(&env, NoArgs);
        env.set_caller(env.get_account(0));
        assert_eq!(
            reg.try_give_feedback(1, 101, "x".to_string(), "".to_string()).unwrap_err(),
            ReputationError::ScoreOutOfRange.into()
        );
    }
}
