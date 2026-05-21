import type { PolymarketOrderParams, PolymarketOrderPayload } from "./index";
import { polymarketContracts } from "./contracts";

export const POLYMARKET_EIP712_DOMAIN = {
  name: "CTF Exchange",
  version: "1",
  chainId: 137,
  verifyingContract: polymarketContracts.ctfExchange.address,
} as const;

export const POLYMARKET_ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
} as const;

export function buildPolymarketOrderPayload(
  params: PolymarketOrderParams,
  makerAddress: string
): PolymarketOrderPayload {
  const makerAmount = BigInt(Math.round(params.usdcAmount * 1e6));
  const takerAmount = BigInt(Math.round((params.usdcAmount / params.price) * 1e6));

  return {
    order: {
      salt: Math.floor(Math.random() * 1e15).toString(),
      maker: makerAddress,
      signer: makerAddress,
      taker: "0x0000000000000000000000000000000000000000",
      tokenId: params.tokenId,
      makerAmount: makerAmount.toString(),
      takerAmount: takerAmount.toString(),
      expiration: (Math.floor(Date.now() / 1000) + 3600).toString(),
      nonce: "0",
      feeRateBps: "0",
      side: params.side === "BUY" ? 0 : 1,
      signatureType: 0,
    },
    signature: "",
    orderType: "GTC",
    builderCode: params.builderCode,
  };
}

export async function submitPolymarketOrder(
  payload: PolymarketOrderPayload
): Promise<{ orderId: string; transactionHash: string }> {
  const response = await fetch(
    `${polymarketContracts.apiUrl}?builderCode=${payload.builderCode}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Polymarket API error: ${JSON.stringify(result)}`);
  }

  return {
    orderId: result.orderID ?? result.orderId ?? "",
    transactionHash: result.transactionHash ?? "",
  };
}
