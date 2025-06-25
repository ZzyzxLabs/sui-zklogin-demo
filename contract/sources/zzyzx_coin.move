module contract::zzyzx_coin;

use std::ascii::string;
use sui::coin::{Self, TreasuryCap};
use sui::url;

public struct ZZYZX_COIN has drop {}

const DESCRIPTION: vector<u8> = b"The ZZYZX Coin is designed for Zzyzx Labs projects";
const ICON_URL: vector<u8> = b"https://zzyzxlabs.xyz";

fun init(witness: ZZYZX_COIN, ctx: &mut TxContext) {
	let (treasury, metadata) = coin::create_currency(
			witness,
			6,
			b"ZZYZX_COIN",
			b"ZZYZX_COIN",
			DESCRIPTION,
			option::some(url::new_unsafe(string(ICON_URL))),
			ctx,
	);
	transfer::public_freeze_object(metadata);
	transfer::public_share_object(treasury);
}

#[allow(lint(self_transfer))]
public fun mint(
	treasury_cap: &mut TreasuryCap<ZZYZX_COIN>,
	amount: u64,
	ctx: &mut TxContext,
) {
	let coin = coin::mint(treasury_cap, amount, ctx);
	transfer::public_transfer(coin, ctx.sender());
}

#[test_only]
public(package) fun init_for_testing(ctx: &mut TxContext) {
	init(ZZYZX_COIN {}, ctx);
}