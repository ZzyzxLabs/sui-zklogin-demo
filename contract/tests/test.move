module contract::test;

use sui::coin::{Self, Coin, TreasuryCap};
use contract::zzyzx_coin::{Self, ZZYZX_COIN};
use sui::test_scenario::{Self as ts, Scenario};

#[test] 
fun test_move() {
    let mut scenario = ts::begin(@0x0);
    {
        zzyzx_coin::init_for_testing(scenario.ctx());
        let treasury_cap: TreasuryCap<ZZYZX_COIN> = scenario.take_shared();

        ts::return_shared(treasury_cap);
        ts::end(scenario);
    }
}
