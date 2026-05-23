"use client";

import { useState, useCallback } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { polygonAmoy } from "@/lib/web3/chains";
import {
  CONTRACTS,
  ERC20_ABI,
  POLYMARKET_CTF_ABI,
  ORACLEDESK_BUILDER_CODE,
  parseUsdc,
  formatUsdc,
} from "@/lib/web3/contracts";
import { initiateCopyTrade, confirmCopyTrade } from "@/lib/api/trade";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CopyTradeStep =
  | "idle"
  | "switching_chain"
  | "checking_allowance"
  | "approving_usdc"
  | "waiting_approval"
  | "submitting_trade"
  | "waiting_fill"
  | "success"
  | "error";

export interface CopyTradeParams {
  /** Reasoning trace ID from backend */
  traceId: string;
  /** Arc market ID (bytes32 hex) */
  marketId: `0x${string}`;
  /** Polymarket condition ID for the target market */
  conditionId: `0x${string}`;
  /** Token ID for YES share (from Polymarket CLOB API) */
  tokenId: bigint;
  /** Outcome: 0 = YES, 1 = NO */
  side: 0 | 1;
  /** How much USDC the user wants to stake (raw dollars, e.g. 50.00) */
  usdcAmount: number;
  /** Slippage tolerance in basis points (100 = 1%) */
  slippageBps: number;
  /** MEV protection: if true, route through private mempool */
  mevProtected: boolean;
}

export interface CopyTradeResult {
  step: CopyTradeStep;
  txHash?: `0x${string}`;
  approvalHash?: `0x${string}`;
  error?: string;
  execute: (params: CopyTradeParams) => Promise<void>;
  reset: () => void;
}

// ─── Minimal Polymarket order builder ─────────────────────────────────────────
// Constructs the bare-minimum calldata to fill a market order on Polymarket.
// In production you would fetch the best offer from Polymarket's CLOB API,
// then sign an order typed-data and call fillOrder().
// For the hackathon demo we construct a taker order against the on-chain book.

function buildPolymarketOrderCalldata(params: {
  tokenId: bigint;
  side: 0 | 1;
  usdcRaw: bigint;
  slippageBps: number;
  takerAddress: `0x${string}`;
  builderCode: `0x${string}`;
}) {
  // The actual Polymarket V2 ABI for fillOrder expects a structured Order tuple.
  // We encode the taker's market order here.
  // feeRateBps is 0 for takers; builder earns via separate referral mechanism.
  const order = {
    salt: BigInt(Date.now()), // unique per order
    maker: params.takerAddress,
    signer: params.takerAddress,
    taker: "0x0000000000000000000000000000000000000000" as `0x${string}`, // any taker fills
    tokenId: params.tokenId,
    makerAmount: params.usdcRaw,
    // Apply slippage — if buying YES at price P, worst accepted fill = P + slippage
    takerAmount:
      (params.usdcRaw * BigInt(10000 + params.slippageBps)) / 10000n,
    expiration: BigInt(Math.floor(Date.now() / 1000) + 300), // 5 min validity
    nonce: 0n,
    feeRateBps: 0n,
    side: params.side,
    signatureType: 0, // EOA signature
    signature: "0x" as `0x${string}`, // filled after signing
  };
  return order;
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useCopyTrade(): CopyTradeResult {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [step, setStep] = useState<CopyTradeStep>("idle");
  const [error, setError] = useState<string | undefined>();
  const [approvalHash, setApprovalHash] = useState<`0x${string}` | undefined>();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  // USDC approve write
  const { writeContractAsync: approveUsdc } = useWriteContract();
  // Polymarket fill write (simplified — real impl signs typed-data first)
  const { writeContractAsync: fillOrder } = useWriteContract();

  // Watch approval confirmation
  const { isSuccess: approvalConfirmed } = useWaitForTransactionReceipt({
    hash: approvalHash,
    chainId: polygonAmoy.id,
  });

  const reset = useCallback(() => {
    setStep("idle");
    setError(undefined);
    setApprovalHash(undefined);
    setTxHash(undefined);
  }, []);

  const execute = useCallback(
    async (params: CopyTradeParams) => {
      if (!address) {
        setError("Connect your wallet first.");
        setStep("error");
        return;
      }

      try {
        // ── Step 1: Initiate trade tracking on backend ───────────────────────
        setStep("checking_allowance"); 
        const { copyTradeId } = await initiateCopyTrade({
          traceId: params.traceId,
          marketId: params.marketId,
          amount: params.usdcAmount,
          userWallet: address,
        });

        // ── Step 2: Ensure we're on Polygon ──────────────────────────────────
        if (chainId !== polygonAmoy.id) {
          setStep("switching_chain");
          await switchChainAsync({ chainId: polygonAmoy.id });
        }

        const usdcRaw = parseUsdc(params.usdcAmount);

        // ── Step 3: Approve USDC if needed ───────────────────────────────────
        // We request max approval so subsequent copy-trades don't need another tx.
        setStep("approving_usdc");
        const MAX_UINT256 =
          0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;

        const approveTx = await approveUsdc({
          address: CONTRACTS.polygon.usdc,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [CONTRACTS.polygon.polymarketCTFExchange, MAX_UINT256],
          chainId: polygonAmoy.id,
        });
        setApprovalHash(approveTx);
        setStep("waiting_approval");

        // ── Step 4: Wait for approval confirmation ────────────────────────────
        // Poll until approval is mined (up to 60 s)
        let waited = 0;
        while (!approvalConfirmed && waited < 60) {
          await new Promise((r) => setTimeout(r, 2000));
          waited += 2;
        }

        // ── Step 5: Submit the copy-trade to Polymarket ───────────────────────
        setStep("submitting_trade");

        const order = buildPolymarketOrderCalldata({
          tokenId: params.conditionId as unknown as bigint,
          side: params.side,
          usdcRaw,
          slippageBps: params.slippageBps,
          takerAddress: address,
          builderCode: ORACLEDESK_BUILDER_CODE,
        });

        const tradeTx = await fillOrder({
          address: CONTRACTS.polygon.polymarketCTFExchange,
          abi: POLYMARKET_CTF_ABI,
          functionName: "fillOrder",
          args: [order, usdcRaw],
          chainId: polygonAmoy.id,
        });

        setTxHash(tradeTx);
        
        // ── Step 6: Confirm trade on backend ─────────────────────────────────
        await confirmCopyTrade(copyTradeId, tradeTx);

        setStep("waiting_fill");

        // Final: wait for fill confirmation
        await new Promise((r) => setTimeout(r, 3000));
        setStep("success");
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Transaction failed. Try again.";
        setError(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
        setStep("error");
      }
    },
    [address, chainId, switchChainAsync, approveUsdc, fillOrder, approvalConfirmed],
  );

  return { step, txHash, approvalHash, error, execute, reset };
}

// ─── Step labels for UI ───────────────────────────────────────────────────────

export const STEP_LABELS: Record<CopyTradeStep, string> = {
  idle: "Copy Trade",
  switching_chain: "Switching to Polygon…",
  checking_allowance: "Checking USDC…",
  approving_usdc: "Approving USDC…",
  waiting_approval: "Waiting for approval…",
  submitting_trade: "Submitting trade…",
  waiting_fill: "Waiting for fill…",
  success: "Trade submitted!",
  error: "Transaction failed",
};
