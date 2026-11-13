//! Amount tiers: how many distinct eligible members must attest before the gate
//! approves a transfer. Tiers apply to the cumulative amount approved through
//! the gate in the current fixed spend window, so a large payment cannot be
//! split into many small ones that each need fewer attendees.

use near_sdk::near;

pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub const MIN_MEMBERS: usize = 2;
pub const MAX_MEMBERS: usize = 16;
const NS_PER_SEC: u64 = 1_000_000_000;
const MIN_WINDOW_SECS: u32 = 3_600;
const MAX_WINDOW_SECS: u32 = 30 * 86_400;
const MAX_TIERS: usize = 4;

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct TierConfig {
    /// (cumulative amount upper bound in yoctoNEAR, inclusive; required attendees)
    pub tiers: Vec<(u128, u8)>,
    pub window_ns: u64,
    pub version: u32,
}

impl TierConfig {
    /// ≤ 1 NEAR: 2 attendees, ≤ 10 NEAR: 3, above: every eligible member.
    pub fn default_config() -> Self {
        Self {
            tiers: vec![(ONE_NEAR, 2), (10 * ONE_NEAR, 3)],
            window_ns: 86_400 * NS_PER_SEC,
            version: 0,
        }
    }

    /// Required attendees for a cumulative amount, capped at the eligible count.
    /// Amounts above the highest tier require every eligible member.
    pub fn required(&self, cumulative: u128, eligible: usize) -> u8 {
        let all = eligible.min(MAX_MEMBERS) as u8;
        for (up_to, required) in &self.tiers {
            if cumulative <= *up_to {
                return (*required).min(all);
            }
        }
        all
    }

    pub fn window_id(&self, now_ns: u64) -> u64 {
        now_ns / self.window_ns
    }

    pub fn from_input(tiers: &[(u128, u8)], window_secs: u32, version: u32) -> Result<Self, &'static str> {
        if tiers.is_empty() || tiers.len() > MAX_TIERS {
            return Err("ERR_BAD_TIERS");
        }
        if !(MIN_WINDOW_SECS..=MAX_WINDOW_SECS).contains(&window_secs) {
            return Err("ERR_BAD_TIERS");
        }
        let mut previous: Option<(u128, u8)> = None;
        for &(up_to, required) in tiers {
            if up_to == 0 || (required as usize) < MIN_MEMBERS || (required as usize) > MAX_MEMBERS {
                return Err("ERR_BAD_TIERS");
            }
            if let Some((prev_up_to, prev_required)) = previous
                && (up_to <= prev_up_to || required < prev_required)
            {
                return Err("ERR_BAD_TIERS");
            }
            previous = Some((up_to, required));
        }
        Ok(Self {
            tiers: tiers.to_vec(),
            window_ns: window_secs as u64 * NS_PER_SEC,
            version,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_tiers_scale_with_cumulative_amount() {
        let tiers = TierConfig::default_config();
        assert_eq!(tiers.required(1, 3), 2);
        assert_eq!(tiers.required(ONE_NEAR, 3), 2);
        assert_eq!(tiers.required(ONE_NEAR + 1, 3), 3);
        assert_eq!(tiers.required(10 * ONE_NEAR, 5), 3);
        assert_eq!(tiers.required(10 * ONE_NEAR + 1, 5), 5);
        // Capped at the eligible count.
        assert_eq!(tiers.required(ONE_NEAR, 2), 2);
        assert_eq!(tiers.required(5 * ONE_NEAR, 2), 2);
    }

    #[test]
    fn rejects_invalid_tier_inputs() {
        let bad: &[&[(u128, u8)]] = &[
            &[],
            &[(ONE_NEAR, 1)],
            &[(ONE_NEAR, 17)],
            &[(0, 2)],
            &[(ONE_NEAR, 3), (ONE_NEAR, 4)],
            &[(2 * ONE_NEAR, 3), (ONE_NEAR, 4)],
            &[(ONE_NEAR, 3), (2 * ONE_NEAR, 2)],
            &[(1, 2), (2, 2), (3, 2), (4, 2), (5, 2)],
        ];
        for tiers in bad {
            assert_eq!(TierConfig::from_input(tiers, 86_400, 1), Err("ERR_BAD_TIERS"), "{tiers:?}");
        }
        assert_eq!(TierConfig::from_input(&[(ONE_NEAR, 2)], 3_599, 1), Err("ERR_BAD_TIERS"));
        assert_eq!(TierConfig::from_input(&[(ONE_NEAR, 2)], 30 * 86_400 + 1, 1), Err("ERR_BAD_TIERS"));
        let ok = TierConfig::from_input(&[(ONE_NEAR, 2), (5 * ONE_NEAR, 2), (9 * ONE_NEAR, 4)], 3_600, 7).unwrap();
        assert_eq!(ok.window_ns, 3_600 * NS_PER_SEC);
        assert_eq!(ok.version, 7);
    }
}
