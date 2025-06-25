module contract::zzyzx_coin;

use sui::coin::{Self, TreasuryCap};

public struct ZZYZX_COIN has drop {}

fun init(witness: ZZYZX_COIN, ctx: &mut TxContext) {
		let (treasury, metadata) = coin::create_currency(
				witness,
				6,
				b"ZZYZX_COIN",
				b"",
				b"The ZZYZX Coin is designed for Zzyzx Labs projects",
				option::none(),
				ctx,
		);
		transfer::public_freeze_object(metadata);
		transfer::public_transfer(treasury, ctx.sender())
}

public fun mint(
		treasury_cap: &mut TreasuryCap<ZZYZX_COIN>,
		amount: u64,
		recipient: address,
		ctx: &mut TxContext,
) {
		let coin = coin::mint(treasury_cap, amount, ctx);
		transfer::public_transfer(coin, recipient)
}